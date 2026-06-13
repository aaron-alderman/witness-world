# Stable Baseline Contract

This document records the current supported baseline for the platform.

It is intentionally narrower than the roadmap. It answers:

- what the runtime actually supports today
- which behaviors are canonical
- where the generic runtime stops
- what remains intentionally extension-specific

It should be read with [ROADMAP.md](C:\Users\aaron\Documents\world\ROADMAP.md) and [PHASE1.md](C:\Users\aaron\Documents\world\PHASE1.md).

This contract describes the **current runtime baseline**. Phase 1's stricter blank-world authoring bar is now met through the bootstrap seam and browser coverage recorded in [PHASE1.md](C:\Users\aaron\Documents\world\PHASE1.md).

Under that stricter bar, the intended UX split is:

- app-authored structures should be the default visible editing surface
- bootstrap/recovery tooling should live behind a semi-internal seam that is hidden by default but intentionally discoverable
- compiler/primitives and deep runtime substrate should remain hidden by default

---

## Boundary Decision

Phase 1 adopts an **explicit app/plugin execution boundary**.

- Generic runtime behavior now resolves through explicit runtime bundles, profile composition, and dedicated runtime modules rather than one implicit central host file.
- Blank-world bootstrap and recovery authoring live behind the authoring/tutorial runtime bundle path, with the product shell still centered on [src/bootstrap-shell.js](C:\Users\aaron\Documents\world\src\bootstrap-shell.js) and [src/bootstrap-authoring.js](C:\Users\aaron\Documents\world\src\bootstrap-authoring.js).
- App-specific execution is now split across explicit seams:
  - many shipped demo/backend routes execute through authored `backendProgram` definitions
  - the remaining demo compatibility seam lives behind [src/demo-handler-set.js](C:\Users\aaron\Documents\world\src\demo-handler-set.js) plus `serverRunner.handlerSet = "demo"`
- `serverRunner.handlerSet` is therefore an intentional extension boundary for now, not a hidden claim that backend route behavior is already executable from witnessed definitions.

What this means:

- declarative routes decide mounting, method/path matching, and handler identity
- runtime bundle/profile composition plus the generic host own request/session/runtime plumbing
- authored backend programs already own a meaningful slice of shipped app/backend route behavior
- handler sets remain as an explicit compatibility seam for the remaining demo/runtime-owned behavior, not as the only app execution path
- future work still needs to reduce that remaining compatibility seam, but the current baseline already includes real authored backend execution

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
- `GET /api/session` returns the authenticated identity/session state, including `homePerspective` and `homeContext` when present
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
- [examples/_lib/common.wtoml](C:\Users\aaron\Documents\world\examples\_lib\common.wtoml)
- [examples/_lib/demo-todo/frontend.wtoml](C:\Users\aaron\Documents\world\examples\_lib\demo-todo\frontend.wtoml)
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

### CLI and Startup

Canonical startup path:

- `node src/cli.js bootstrap [--port <n>]`
- `node src/cli.js serve <dslPath> [--server <id>] [--port <n>]`
- `npm run bootstrap` is a convenience wrapper over the dedicated bootstrap command
- `npm run demo` is a convenience wrapper over that generic CLI
- `bootstrap` is a separate blank-world authoring path, not just a variant of the demo app
- the maintained demo now starts on `--runtime-profile minimal` plus authored runtime-plugin installs on `demo_server`
- the CLI resolves one authored `serverRunner` and then starts the generic host through `startServer(...)`
- if `--server` is omitted, startup succeeds only when exactly one authored `serverRunner` exists
- if no authored runner exists, the host can expose the bootstrap fallback directly through the dedicated bootstrap command or when started programmatically
- the maintained demo still carries one explicit compatibility seam: `handlerSet = "demo"` currently causes startup to add `bundle-demo`

Useful startup environment:

- `RUNTIME_ROOT`
- `WITNESS_LOG`
- `OBSERVATION_LOG`

Authoritative implementation:

- [src/cli.js](C:\Users\aaron\Documents\world\src\cli.js)
- [src/host.js](C:\Users\aaron\Documents\world\src\host.js)

---

## Generic Runtime Surface

The generic runtime currently owns these categories:

- server startup through `serverRunner` + `serve`
- bootstrap fallback at `/` when no served home page exists
- the semi-internal bootstrap shell at `/_bootstrap`
- typed bootstrap authoring endpoints for identities, widgets, frontend programs/steps, routes, `serve` mounts, and `serverRunner` wiring
- typed bootstrap capability authoring/install/remove endpoints plus local catalog/install read models
- typed bootstrap governance endpoints for contexts, perspectives, stewardships, and proposals
- method/path route matching, including named params
- page rendering for widget pages, world page, process page, and canvas page
- session open/read/logout
- widget version activate/rollback policy
- witness SSE and frontend process-event intake
- world graph, process view, process runs, and source reads
- generic canvas shell/projection/process transport

The generic runtime does **not** currently claim to own:

- all app/backend behavior through one universal authored execution model
- the remaining demo compatibility behavior behind `serverRunner.handlerSet = "demo"` / `bundle-demo`

The current shipped split is:

- generic runtime/bundle ownership for profile-gated routes, surfaces, diagnostics, session plumbing, bootstrap shell behavior, and transport seams
- authored backend-program ownership for many shipped demo/backend routes such as Todo CRUD, private notes, widgets create, witnesses, process-view reads, process-run reads, process-event ingest, and world-graph reads
- explicit compatibility-seam ownership for the remaining demo-specific handler-set behavior

---

## Guaranteed Public Demo Surface

The current maintained demo baseline expects these routes/surfaces to remain reachable when started on `minimal` with its authored runtime-plugin installs and the explicit `bundle-demo` compatibility seam:

- `/`
- `/_bootstrap`
- `/world`
- `/process`
- `/canvas`
- `/api/bootstrap-model`
- `/api/bootstrap-state`
- `/api/capabilities`
- `/api/capability-installs`
- `/api/session`
- `/api/identities`
- `/api/contexts`
- `/api/perspectives`
- `/api/stewardships`
- `/api/proposals`
- `/api/proposals/:id/approve`
- `/api/proposals/:id/reject`
- `/api/frontend-programs`
- `/api/frontend-steps`
- `/api/routes`
- `/api/serve-mounts`
- `/api/server-runners`
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
- blank-world bootstrap and UI assembly:
  - [test/bootstrap-host.test.js](C:\Users\aaron\Documents\world\test\bootstrap-host.test.js)
  - [test/ui.bootstrap.test.js](C:\Users\aaron\Documents\world\test\ui.bootstrap.test.js)
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

