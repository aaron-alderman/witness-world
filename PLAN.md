# CANVAS-v2 Phase 4 (final): Timeline + Undo/Redo + Polish + Live Sync

## Context

Phases 1–3 (v0.34.0, 138 tests green) delivered the witness-oriented `/canvas`: perspectives, proxy instances, multi-select ergonomics, and the batching outbox. This phase **completes the CANVAS-v2 roadmap** with the four remaining items (user-decided): a Witness Timeline with playback, witness-aware undo/redo, multi-select polish (bulk color + group resize), and World Browser cleanup + SSE live sync.

**Key architecture decision (user-chose):** timeline scrubbing uses **client-side projection** — the real `canvasProjection` code runs in the browser. This requires extracting kernel's pure projectors into a browser-safe module ([src/kernel.js](src/kernel.js) imports `node:crypto`, so it can't ship as-is); the same source files are then served to and imported by the browser. Scrubbing costs zero network per step.

**Critical design constraint discovered in planning — SSE witness feedback loop:** every existing read route emits a witness, so a naive "signal on log growth → client refetches" loops forever (refetch emits a witness → signal → …). Broken structurally by two binding rules: (1) `GET /api/witnesses?offset=N` does **not** emit a witness (the stream connection is witnessed once instead); (2) SSE-triggered live refreshes use the client-side projection, never `GET /api/canvas`. Do not re-add read witnesses to those paths.

Binding constraints carried forward: zero deps; client JS concat-only (no backticks/`${`); every change witnessed; one gesture = one witness.

## Design

### 1. Browser-safe projectors ([src/projectors-core.js](src/projectors-core.js), new)

Move verbatim from kernel.js: `thing`/`relation`/`retract` claim ops, `projectors`, and `stableStringify` (kernel's hashing uses it; undo needs it for meta equality). Zero imports. kernel.js imports + re-exports them — **every existing import site keeps working** (all code imports these by name from kernel.js). [src/canvas-projection.js](src/canvas-projection.js) switches to `import { projectors } from "./projectors-core.js"` — its only import becomes a browser-resolvable relative path. Full suite must be green after this step alone.

### 2. Witness-aware undo/redo ([src/canvas-undo.js](src/canvas-undo.js) new + [src/canvas-processes.js](src/canvas-processes.js))

**Generic compensation, not per-process logic** — `compensationClaims(witnesses, target)`: replay claims before `target` into a triple-keyed map (currentRelations semantics), then for each of target's claims in reverse (dedup by key): `relation` with no prior → `retract`; prior with different meta (via `stableStringify`) → re-emit prior; identical → nothing; `retract` → re-emit the prior relation. Uniformly handles move/style/camera/grid/batch (prior-meta re-emit), place/create/duplicate (retract placement relations; the Thing remains), remove (re-emit `contains`), relate/unrelate, and setTitle's two-claim retract+re-emit shape.

**Stack simulation** — `undoState(witnesses, actor, perspective)`: walk the actor's `canvas.*` witnesses with `body.perspective === perspective` (skip `.failed`/`.blocked`/`perspective.create`); normal action pushes + clears redo; `canvas.undo` pops to redo stack; `canvas.redo` pushes back. Redo = compensating the undo witness itself — the same generic function; undo→redo→undo chains work with no special cases. Stack derives purely from the log → survives reload.

**Handlers** `undoLastAction`/`redoLastUndo` (gates + perspective + `canAcceptInto`, `.failed` "nothing to undo/redo" on empty): emit ONE witness `{process: "canvas.undo"|"canvas.redo", claims: compensation, body: {perspective, undoes|redoes: target.id}}` — emit even when compensation is empty (stack bookkeeping). Register both in `canvasProcessHandlers` (zero host changes). Also: `setThingTitle` and `unrelateThings` gain optional `perspective` into body (client passes it; legacy witnesses without it are simply never undo targets).

**Accepted semantics, documented:** per-actor target selection skips interleaved foreign witnesses; compensation re-emits *pre-target* meta, so undoing can clobber another actor's later write to the same triple. Selective undo flagged in ROADMAP as a follow-up.

### 3. Timeline + playback ([src/canvas-page.js](src/canvas-page.js) + [src/host.js](src/host.js))

- **Serving the projection**: `GET /canvas-lib/projectors-core.js|canvas-projection.js` — whitelist Map → `fs.readFile` → witnessed `backend.readCanvasLib` → `text/javascript`, `cache-control: no-cache` (mirrors the `/api/source` pattern). The relative import inside the served file resolves under the same URL prefix.
- **Client load**: IIFE becomes `(async () => {...})()`; `projectionModule = await import('/canvas-lib/canvas-projection.js')` — **dynamic import parses inside `new Function`** (verified; static `import` would break the host parse test). Graceful degrade if load fails (timeline disabled).
- **Witness cache**: `state.history = {witnesses, playhead, filter, playing, open}`; `fetchWitnesses()` uses new `GET /api/witnesses?offset=N` (incremental, **unwitnessed** — loop rule 1; respond `{witnesses: tail, offset, total}`); cache resets on actor change (per-actor visibility).
- **UI**: Timeline toolbar button → panel under the stage: Play, range slider, position `N/M`, filter toggle (All / `canvas.*`), Now button, clickable event strip (DOM capped ~400 ticks + "older" count). `scrubTo(n)` renders `canvasProjection(witnesses.slice(0,n), perspective)` locally. Refactor `loadCanvas`'s tail into `adoptModel(model, adoptCamera)` — history/SSE paths pass `adoptCamera=false`, which is how **the user's current camera/grid are kept while scrubbing**. Play = `setInterval(~150ms)` advancing the playhead to the end, then back to live ("animation as witness playback").
- **Read-only mode while scrubbed** (`isLive()` guards every mutating entry point): `post()` returns null with a status message; all four `queue*` early-return (pan/zoom stay visual-only); pointerdown allows pan/select/marquee but skips drag/resize/connect creation; dblclick blocked; Delete/Ctrl+D/Ctrl+Z/Ctrl+Y blocked, Escape → `exitHistory()`; inspector inputs disabled and action buttons unwired; palette unclickable; perspective/actor switch exits history first; visible "history view N/M" banner + Now button; undo/redo buttons disabled.

### 4. SSE live sync ([src/host.js](src/host.js))

`GET /api/events` (text/event-stream): connections tracked in a Set; a `setInterval(250ms).unref()` watcher compares `world.allWitnesses().length` and broadcasts `data: {"count":N}` on growth — **signal-only**, no payload, no per-actor filtering. One `backend.eventsStream` witness per connection. Client `EventSource.onmessage` → `fetchWitnesses()` → if live, re-project client-side (loop rule 2) and `adoptModel(..., false)`; if scrubbed, just extend the strip. **Teardown (critical or tests hang)**: returned `close()` now does `clearInterval(watcher)` → end all SSE responses → `server.closeAllConnections?.()` → `server.close()`.

### 5. Multi-select polish ([src/canvas-page.js](src/canvas-page.js))

- **Bulk color**: N>1 inspector gains a color input → per selected node, merge style locally + `queueStyle` → existing outbox coalesces into ONE `canvas.batch` witness (no new server process; `batchApply` already takes `styles[]` — supersedes the old `canvas.styleMany` follow-up).
- **Group resize**: N>1 selection draws a dashed bounding box + 4 corner handles; drag kind `groupResize` scales members' x/y/w/h proportionally from the opposite-corner anchor (snap the dragged corner; clamp scale positive; per-member MIN 40×24); pointer-up → `queueMove` per member → one batch witness.

### 6. World Browser cleanup ([src/world-graph.js](src/world-graph.js))

In `worldGraphProjection`'s relation loop (next to the existing `hasFrontendStep` skip): skip rels in `{hasGeometry, hasStyle, hasCamera, hasGrid}` — suppresses both the edges and the synthesized `geometry`/`style`/`camera`/`grid` token nodes. No existing test asserts them (verified).

## Implementation steps (dependency order — run full suite after 1, 3, 5, 6)

1. **[src/projectors-core.js](src/projectors-core.js)** extraction + kernel re-export + canvas-projection import switch (must be invisible: 138 green).
2. **[src/canvas-undo.js](src/canvas-undo.js)** — `compensationClaims`, `undoState` (imports only projectors-core). **New `test/canvas-undo.test.js`**: compensation cases incl. setTitle two-claim shape, batch multi-kind, place retracts with Thing surviving, identical-meta no-op, duplicate-key-once; undoState push/pop/redo-clear/foreign-actor/other-perspective/legacy-no-perspective skips, undo→redo→undo chain.
3. **[src/canvas-processes.js](src/canvas-processes.js)** — undo/redo handlers + registration; `perspective` into setTitle/unrelate bodies. Extend [test/canvas-processes.test.js](test/canvas-processes.test.js): undo restores geometry; redo re-applies; two undos walk back two; empty-stack `.failed`; action-after-undo kills redo; undo of batch restores all four kinds; non-owner fails; clobber-semantics test documents the accepted behavior; handler-map list updated.
4. **[src/world-graph.js](src/world-graph.js)** skip-set + one [test/world-graph.test.js](test/world-graph.test.js) assertion (no canvas vocab nodes/edges after place/style/camera).
5. **[src/host.js](src/host.js)** — `/canvas-lib/*` route (whitelist, witnessed, JS content-type), `/api/witnesses?offset=` (unwitnessed when offset present — comment why), `/api/events` SSE + watcher + hardened `close()`.
6. **[src/canvas-page.js](src/canvas-page.js)** — async IIFE + dynamic import; timeline panel HTML/CSS + strip/slider/play/filter/now; `adoptModel` refactor; read-only rule set; SSE EventSource; undo/redo buttons + Ctrl+Z/Y (through `post()`, so the outbox auto-flush makes a pending batch the undo target — correct); bulk color; group resize; setTitle/unrelate call sites pass perspective.
7. **[test/canvas-host.test.js](test/canvas-host.test.js)** — HTTP undo/redo (+400 empty); `/canvas-lib/*` 200/content-type/relative-import-regex + traversal/unknown 404 + witness; `?offset` tail + total + **asserts no `backend.readWitnesses` witness from offset fetch** (locks loop rule 1); SSE via `fetch` + `AbortController` reader (initial frame, trigger process, second frame, abort, `server.close()` completing IS the teardown assertion); projection parity guard (client-module projection deep-equals `/api/canvas` response); HTML markers `timeline-panel`, `history-banner`, `undo-btn`, `canvas-lib`, `EventSource`, `groupResize`, `canvas.undo` (existing markers all survive).
8. **Docs** — package.json 0.35.0; CHANGELOG (house style + passing count); HANDOFF (new modules, `/api/events`, `/canvas-lib/*`, timeline/undo behavior); ROADMAP marks **CANVAS-v2 phases COMPLETE**, leaving flagged nice-to-haves: connector bundling, selective (non-clobbering) undo, timeline strip virtualization, memoized prefix projection.

## Verification

- `npm test` — 138 existing + ~25-30 new, all green.
- Manual (`npm run demo`, two windows):
  - Timeline: scrub renders history instantly with current camera; every mutation path inert while scrubbed; Now/Escape return live; Play animates to the end and lands live; filter toggles strip.
  - Undo: drag → flush → Ctrl+Z restores → Ctrl+Y re-applies; rename undo restores old title; empty stack → "nothing to undo" status; reload mid-stack → undo still works (log-derived).
  - Live sync: edit in window A appears in window B ≤ ~250ms; scrubbed window only grows its strip; **no witness storm while idle** (log stays quiet — proves the feedback loop is dead); server close doesn't hang with a stream open.
  - Polish: group corner-resize scales proportionally (min 40×24, one batch witness); bulk color recolors N nodes in one witness.
  - `/world` shows no geometry/style/camera/grid token nodes; restart with same `WITNESS_LOG` reprojects everything.

## Risks

- **Dynamic import in `new Function`** — verified safe (parses; static import would not).
- **SSE lifecycle** — watcher `unref()` + explicit client `end()` + `closeAllConnections` in `close()`; the SSE test must abort its reader before closing.
- **Feedback loop** — structurally prevented; the "log stays quiet while idle" manual check and the no-witness-on-offset test guard it.
- **Undo clobber across actors** — accepted, tested as documented behavior, refinement flagged.
- **Scrub perf** — O(witnesses) per step is fine at demo scale; strip capped at ~400 DOM ticks; memoization flagged.
- **Client cache staleness** — `no-cache` on `/canvas-lib/*`; module imported once per page session.
