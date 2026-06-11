# Stable Baseline Contract

This document records the current supported baseline for the platform.

It is intentionally narrower than the roadmap. It answers:

- what the runtime actually supports today
- which behaviors are canonical
- where the generic runtime stops
- what remains intentionally extension-specific

It should be read with [ROADMAP.md](C:\Users\aaron\Documents\world\ROADMAP.md) and [PHASE1.md](C:\Users\aaron\Documents\world\PHASE1.md).

This contract describes the **current runtime baseline**. It is not, by itself, proof that Phase 1 is complete under the stricter blank-world authoring bar now recorded in [PHASE1.md](C:\Users\aaron\Documents\world\PHASE1.md).

Under that stricter bar, the intended UX split is:

- app-authored structures should be the default visible editing surface
- bootstrap/recovery tooling should live behind a semi-internal seam that is hidden by default but intentionally discoverable
- compiler/primitives and deep runtime substrate should remain hidden by default

---

## Boundary Decision

Phase 1 adopts an **explicit app/plugin execution boundary**.

- Generic runtime behavior lives in [src/host.js](C:\Users\aaron\Documents\world\src\host.js), [src/widgets.js](C:\Users\aaron\Documents\world\src\widgets.js), [src/type-model.js](C:\Users\aaron\Documents\world\src\type-model.js), [src/widget-define.js](C:\Users\aaron\Documents\world\src\widget-define.js), [src/world-graph.js](C:\Users\aaron\Documents\world\src\world-graph.js), and [src/process-view.js](C:\Users\aaron\Documents\world\src\process-view.js).
- App-specific behavior remains behind explicit handler sets such as [src/demo-handler-set.js](C:\Users\aaron\Documents\world\src\demo-handler-set.js).
- `serverRunner.handlerSet` is therefore an intentional extension boundary for now, not a hidden claim that backend route behavior is already executable from witnessed definitions.

What this means:

- declarative routes decide mounting, method/path matching, and handler identity
- the generic host owns request/session/runtime plumbing
- handler sets own app data mutations and app-specific route behavior
- future work may move more backend execution into witnessed definitions, but that is not claimed as part of the current baseline

---

## Canonical Runtime Behavior

### Frontend Process Execution

Supported authored process semantics in the live browser runtime:

- `when`
- `after`
- `repeat.while`
- `repeat.forEach`
- dependency-frontier execution as projected through the shared process graph
- generic tracing through `frontend.process.*` and `frontend.step.*`

Authoritative implementation:

- [src/process-graph.js](C:\Users\aaron\Documents\world\src\process-graph.js)
- [src/widgets.js](C:\Users\aaron\Documents\world\src\widgets.js)

### Identity and Session

Canonical session model:

- identities are authored through `[[identity]]`
- `POST /api/session` opens a cookie-backed session from `{ username, password }`
- `GET /api/session` returns the authenticated identity/session state
- `DELETE /api/session` logs out and clears the cookie
- the HTTP-only cookie is the canonical auth transport
- raw `x-witness-actor` headers are ignored by default
- raw actor headers only work when a `serverRunner` explicitly sets `allowActorHeader = true`

Public surfaces expected to use this model in normal browser behavior:

- `/`
- `/world`
- `/canvas`

Authoritative implementation:

- [src/host.js](C:\Users\aaron\Documents\world\src\host.js)
- [examples/demo/common.wtoml](C:\Users\aaron\Documents\world\examples\demo\common.wtoml)
- [examples/demo/frontend.wtoml](C:\Users\aaron\Documents\world\examples\demo\frontend.wtoml)
- [src/canvas-page.js](C:\Users\aaron\Documents\world\src\canvas-page.js)

### Type Execution

Canonical type meaning lives in the shared type model.

- browser form coercion delegates to the shared validation path
- server process input/output validation uses the same compatibility rules
- editor selection is derived from shared trait/value-type metadata

Authoritative implementation:

- [src/type-model.js](C:\Users\aaron\Documents\world\src\type-model.js)
- generated runtime usage in [src/widgets.js](C:\Users\aaron\Documents\world\src\widgets.js)

### Projection Editing

Current baseline for `widget.define`:

- typed input validation runs before mutation
- root/parent fallback and output shaping are runtime-owned
- typed output validation runs before attach
- the demo route delegates to the runtime helper rather than owning the policy

Authoritative implementation:

- [src/widget-define.js](C:\Users\aaron\Documents\world\src\widget-define.js)

### Live Projection Refresh

Current supported live refresh behavior:

- normal widget pages (`page.home`, `page.world`) default to live projection refresh
- routes can explicitly disable it with `liveProjection = false`
- widget projection changes trigger subtree refresh without full page reload
- refresh replaces the root widget subtree and authored templates, then reruns `load`

This is a supported baseline behavior, but broader live runtime migration remains future work.

---

## Generic Runtime Surface

The generic runtime currently owns these categories:

- server startup through `serverRunner` + `serve`
- method/path route matching, including named params
- page rendering for widget pages, world page, process page, and canvas page
- session open/read/logout
- widget version activate/rollback policy
- witness SSE and frontend process-event intake
- world graph, process view, process runs, and source reads
- generic canvas shell/projection/process transport

The generic runtime does **not** currently claim to own:

- todo CRUD semantics
- private note semantics
- demo-specific network failure routes
- other app-specific backend mutations hidden behind handler sets

---

## Guaranteed Public Demo Surface

The current demo baseline expects these routes/surfaces to remain reachable:

- `/`
- `/world`
- `/process`
- `/canvas`
- `/api/session`
- `/api/todos`
- `/api/private-notes`
- `/api/widgets`
- `/api/widget-versions/:soul/activate`
- `/api/widget-versions/:soul/rollback`
- `/api/witnesses`
- `/api/world-graph`
- `/api/process-view`
- `/api/process-runs/:runId`
- `/api/process-events`
- `/api/source`
- `/api/events`
- `/api/canvas`
- `/api/canvas/perspectives`
- `/api/canvas/process`

---

## Test Map

The current baseline is evidenced by these tests:

- process execution and shared runtime semantics:
  - [test/ui.generated-runtime.test.js](C:\Users\aaron\Documents\world\test\ui.generated-runtime.test.js)
  - [test/process-view.test.js](C:\Users\aaron\Documents\world\test\process-view.test.js)
- session/identity and auth transport:
  - [test/host.test.js](C:\Users\aaron\Documents\world\test\host.test.js)
  - [test/ui.interactions.test.js](C:\Users\aaron\Documents\world\test\ui.interactions.test.js)
  - [test/ui.world-browser.test.js](C:\Users\aaron\Documents\world\test\ui.world-browser.test.js)
  - [test/ui.canvas.test.js](C:\Users\aaron\Documents\world\test\ui.canvas.test.js)
- type execution:
  - [test/type-model.test.js](C:\Users\aaron\Documents\world\test\type-model.test.js)
  - [test/widgets.test.js](C:\Users\aaron\Documents\world\test\widgets.test.js)
- projection editing / `widget.define`:
  - [test/widget-define.test.js](C:\Users\aaron\Documents\world\test\widget-define.test.js)
  - [test/hardening.test.js](C:\Users\aaron\Documents\world\test\hardening.test.js)
- world/process inspection surfaces:
  - [test/world-graph.test.js](C:\Users\aaron\Documents\world\test\world-graph.test.js)
  - [test/ui.process-view.test.js](C:\Users\aaron\Documents\world\test\ui.process-view.test.js)
- canvas/runtime transport:
  - [test/canvas-host.test.js](C:\Users\aaron\Documents\world\test\canvas-host.test.js)

---

## Known Deferrals

These are intentionally not claimed as part of the stable baseline:

- deeper witnessed backend execution beyond the current handler-set boundary
- proposals, governance, and authority workflows
- theming separation across shell/product boundaries
- broader live migration/rollback semantics beyond current widget-version behavior
- distributed or multi-machine witness exchange
