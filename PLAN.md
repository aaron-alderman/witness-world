# CANVAS-v2 Phase 1: Core Canvas + Perspectives

## Context

[docs/CANVAS-v2.md](docs/CANVAS-v2.md) respecifies the diagram canvas as a **projection engine** over the witness-oriented ontology: the canvas displays Things/Relations/Processes/Witnesses through a Perspective; visual nodes are proxies ("Projection Instances"); connectors are backed by real Relation records; layout/styling belong to Perspectives, never to Things.

The witness substrate already exists and works ([src/kernel.js](src/kernel.js): `createWorld`, `emit`, claim ops `thing`/`relation`/`retract`, projectors with latest-wins `currentRelations`; [src/witness-log.js](src/witness-log.js): append-only JSONL persistence; [src/host.js](src/host.js): witnessed HTTP routes + gates; [src/gates.js](src/gates.js)). What's missing is any interactive canvas — the existing `/world` graph is read-only with deterministic layout and no persisted positions.

**User decisions (binding):**
1. **Scope** — interactive canvas with Perspective-scoped layout stored as witnesses, Thing/Relation creation from the canvas, and a Thing-vs-Projection property inspector. Timeline, animation, undo/redo, scripting are later phases (the witness model keeps them unblocked).
2. **Placement** — standalone `/canvas` page with its own shell, sharing only the kernel and JSON APIs.
3. **Rendering** — Canvas 2D, vanilla JS, zero dependencies, DOM for inspector/overlays.

Shippable demo target: open `/canvas`, pick/create a perspective, place and drag things, connect them, inspect them, restart server with same witness log → everything reproduced purely from the log.

## Design

### Witness vocabulary

**Load-bearing kernel fact** ([src/kernel.js:106-117](src/kernel.js#L106-L117)): `projectors.currentRelations` keys on `from rel to' only — meta is NOT in the key, so re-emitting the same triple with new meta is latest-wins. This is the position-update mechanism (emit on pointer-up, not mousemove).

**Projection Instances are proxy Things** (per CANVAS-v2 "Visual Nodes" + ROADMAP "positions on personal proxies"): a canvas node is a witnessed Thing of kind `projectionInstance` that `proxies` the real Thing and is `contains`-ed by the Perspective. This lets one Thing appear in many perspectives with independent geometry. Geometry/style/camera use stable triples with mutable meta — `relation(instanceId, "hasGeometry", "geometry", {x,y,w,h})` — so the constant `to` token gives clean latest-wins.

Processes (all emitted server-side; IDs via `thingId(kind, {…, ordinal: world.allWitnesses().length})` from [src/ids.js](src/ids.js), following the private-note pattern at [src/host.js:175](src/host.js#L175)):

| Process | Claims |
|---|---|
| `canvas.perspective.create` | `thing(perspId)`, `relation(actor,"owns",perspId)`, `relation(perspId,"hasModuleKind","perspective")`, `relation(perspId,"hasTitle",title)` |
| `canvas.place` | `thing(instId)`, owns, `relation(instId,"hasModuleKind","projectionInstance")`, `relation(instId,"proxies",thingId)`, `relation(perspId,"contains",instId)`, `relation(instId,"hasGeometry","geometry",{x,y,w,h})` |
| `canvas.move` | `relation(instId,"hasGeometry","geometry",{x,y,w,h})` (re-emit, latest wins) |
| `canvas.style` | `relation(instId,"hasStyle","style",{color,…})` (whitelist-filtered meta; client sends merged style) |
| `canvas.remove` | `retract(perspId,"contains",instId)` — instance Thing + history remain (replayable) |
| `canvas.createThing` | reality Thing (`thing`/owns/created/`hasTitle`) + full `canvas.place` claim set, one atomic witness |
| `canvas.relate` | `relation(fromThing, rel, toThing)` — between **Things**, not instances; connector then appears in every perspective where both are placed |
| `canvas.unrelate` | `retract(from, rel, to)` |
| `canvas.thing.setTitle` | `relation(thingId,"hasTitle",title)` (reuses existing title vocabulary, [src/host.js:223](src/host.js#L223) area) |
| `canvas.camera` | `relation(perspId,"hasCamera","camera",{x,y,zoom})`, client-debounced |

Authority: `canAcceptInto(world, actor, perspectiveId)` ([src/kernel.js:163](src/kernel.js#L163)) guards place/move/style/remove; failures emit `<process>.failed` witnesses (pattern: `transferOwnership`, [src/kernel.js:169-193](src/kernel.js#L169-L193)). Input-shape checks use `runGates` with `actorRequired`/`textRequired` — note gate failures emit `<process>.blocked` ([src/gates.js:10-14](src/gates.js#L10-L14)).

### Server API (inline route blocks in host.js, existing convention)

- `GET /canvas` — emits `frontend.renderCanvasPage` witness (mirror of `/world` block at [src/host.js:104-117](src/host.js#L104-L117)); serves HTML from `renderCanvasPage({actors})`.
- `GET /api/canvas/perspectives` — `{perspectives: [{id,title,owner}]}`.
- `GET /api/canvas?perspective=<id>` — full canvas projection; 404 + failure witness if unknown.
- `POST /api/canvas/process` — body `{process, params}`; dispatches via a `canvasProcessHandlers` map; actor from `x-witness-actor` header (existing `actorFromRequest`); no actor → 401 + failure witness; witness process ending `.failed`/`.blocked` → HTTP 400 `{error, witness}`, else 200 `{ok, witness}`.

At server start, `declareCanvasRoutes(world, {actor})` emits `defineRoute` witnesses (from [src/modules.js](src/modules.js)) so the canvas surface is visible in the World Browser.

### Canvas projection

`canvasProjection(witnesses, perspectiveId)` → `{perspective: {id,title,owner,camera}, instances: [{id,thing,label,x,y,w,h,style}], connectors: [{from,rel,to,fromInstance,toInstance,witness}], availableThings: [{id,label}]}`.

Built from one `projectors.currentRelations` pass: instances = `contains` targets with kind `projectionInstance`; geometry/style from meta (default geometry `{x:40,y:40,w:160,h:56}`); labels via `hasTitle` else id. Connectors = current relations whose both endpoints are proxied by placed instances, excluding internal vocabulary (`contains`, `proxies`, `hasGeometry`, `hasStyle`, `hasCamera`, `hasModuleKind`). `availableThings` = all Things minus infrastructure kinds (projectionInstance/perspective/widget/widgetVersion/frontendProgram/route) minus already-placed. All arrays sorted by id (determinism).

### Client (single server-generated page, ~350-line IIFE)

Standalone module returning a full HTML string (own CSS, NOT the widget-tree engine — Canvas-2D pointer/rAF interaction doesn't decompose into declarative frontend-program steps; keeps [src/widgets.js](src/widgets.js) untouched while preserving the server-generated-JS convention).

- **Shell**: header (perspective `<select>` + new, actor `<select>` reusing the `localStorage['witness.actor']` + `POST /api/session` pattern from widgets.js, mode buttons Select|Connect, New Thing, status) · `<canvas>` main + absolutely-positioned overlay `<input>` for inline naming · DOM inspector aside.
- **Rendering**: dirty-flag + `requestAnimationFrame`; `ctx.setTransform` for camera (handle devicePixelRatio + resize); draws grid, connectors (line/arrowhead/rel label), nodes (rounded rect, style color, label), selection outline, connect rubber-band.
- **Interactions**: wheel zoom toward cursor (clamp 0.2–4); drag empty = pan (debounced `canvas.camera`); drag node = optimistic local move, `canvas.move` on pointer-up; Connect mode drag node→node → rel-name overlay (default `references`) → `canvas.relate`; New Thing / dblclick-empty → name overlay → `canvas.createThing`; click connector selects it; Delete → `canvas.remove`; Escape clears.
- **Inspector** (the CANVAS-v2 reality/projection split):
  - *Thing properties*: id (read-only), Name → `canvas.thing.setTitle`, current reality relations.
  - *Projection properties*: x/y/w/h inputs → `canvas.move`, color picker → `canvas.style`, Remove from canvas → `canvas.remove`; connector selection shows from/rel/to + delete via `canvas.unrelate`.
  - *Palette* (nothing selected): `availableThings`, click → `canvas.place` at viewport center.
- **Data flow**: every successful mutation re-GETs `/api/canvas` — witnesses stay the single source of truth; optimistic position only bridges the in-flight gap.

## Implementation steps (dependency order)

1. **`src/canvas-processes.js`** (new, ~170 lines) — handlers for all processes above + `canvasProcessHandlers` map + `declareCanvasRoutes`. Imports kernel claim ops/projectors/`canAcceptInto`, `thingId`, gates, `defineRoute`. No HTTP knowledge.
2. **`src/canvas-projection.js`** (new, ~130 lines) — `perspectivesProjection`, `canvasProjection` as specced.
3. **`test/canvas-processes.test.js` + `test/canvas-projection.test.js`** (new; `node --test`, kernel.test.js style) — perspective create; place; **two moves → latest geometry wins**; remove hides instance but Thing persists; same Thing in two perspectives with different positions; connectors require both endpoints placed and exclude vocabulary rels; **replay determinism** (persist to temp `witnessLogPath`, recreate world, identical projection); authority failures (`canvas.move` on foreign perspective → `.failed`; steward via `delegateStewardship` succeeds, reusing test/kernel.test.js:64-79 pattern).
4. **`src/canvas-page.js`** (new, ~450 lines) — `renderCanvasPage({actors})` per Client design.
5. **`src/host.js`** (modify) — imports; `declareCanvasRoutes` call at startup; four route blocks alongside existing GET/POST APIs (insert near [src/host.js:182](src/host.js#L182) region, before 404).
6. **`test/canvas-host.test.js`** (new; host.test.js harness pattern) — `GET /canvas` 200 + contains `canvas-surface` / `Thing properties` / `Projection properties`; embedded `<script>` parses via `new Function` (host.test.js pattern); end-to-end POST sequence (perspective.create → createThing → place → move → relate) then `GET /api/canvas` shows 2 instances + 1 connector with expected coords; no-actor POST → 401; unknown process → 400 + failure witness.
7. **Demo + docs** (modify) — [examples/demo-todo-server.wtoml](examples/demo-todo-server.wtoml): home-page link to `/canvas` (like the existing `/world` link); `package.json` → 0.32.0; `CHANGELOG.md` new top block (existing convention); `HANDOFF.md` (new modules, `/canvas`, note that layout lives on projectionInstance proxies); `ROADMAP.md` mark "Personal projection layout" started.

## Verification

- `npm test` — all existing tests plus ~12 new pass.
- Manual: `npm run demo` → http://127.0.0.1:3000/canvas → pick actor `aaron` → create perspective → New Thing "Customer" → place a todo from palette → drag both → connect as `references` → recolor → rename via inspector → **restart server with the same witness log path** → reload: layout, style, camera, connector all reproduced from the log alone. Check `/world` shows the new `perspective`/`projectionInstance` things and `canvas.*` processes.
- Optional stretch: Playwright drag+reload smoke via `npm run test:ui` (playwright is already a devDependency).

## Risks / notes

- **World Browser noise**: `hasGeometry`/`hasStyle` relations will surface `geometry`/`style` vocabulary nodes in `/world`, and world-graph's edge-meta merge may show stale coords. Cosmetic; one-line skip-set in `worldGraphProjection` if objectionable.
- **Log growth**: one witness per drag-end/style/camera-settle — fine for the prototype; compaction is a later-phase concern (the timeline phase wants this history anyway).
- **No live multi-client sync**: refetch-after-mutation only; acceptable for phase 1.
- **Palette includes todos**: canvas-created Things and todos both use `hasTitle`; todos appear in `availableThings` — treated as a feature (place todos on canvas).
