# Witness-World Specification

## 1. Purpose
- Provide a minimal witness-oriented runtime where canonical state is immutable witness log history.
- Model runtime behavior through things, relations, processes, and witnesses.
- Build projections (todo list, widgets, identity/session state, world graph, process view) from witnesses.

## 2. Canonical State
- Canonical persistence is only the witness log (`src/witness-log.js`).
- Replay from log reconstructs identical world state and witness chains.
- Witnesses are immutable entries with `process`, `actor`, `cause`, `claims`, `body`.
- Projection outputs (todo cache, private note lists, graph layout, rendered HTML) are non-canonical derived artifacts.

## 3. Core Ontology and Projections
- **Thing**: a referent introduced by thing claims.
- **Relation**: links between things.
- **Process**: action attempting to transform reality.
- **Witness**: immutable evidence record.
- **Projections**:
  - ownership
  - stewardship
  - active widget versions
  - module inventories
  - type / trait / process-spec model
  - world graph and source/properties metadata
- No projection is authoritative truth; all are derived from witnesses.

## 4. Kernel and World Rules
- `createWorld` initializes genesis witness if the log is empty.
- `emit` appends witnesses and maintains causal linkage via `cause`.
- `fork` creates a sibling world over shared witness history.
- Core helpers:
  - `createThing`
  - `cloneThing`
  - `transferOwnership`
  - `canAcceptInto`
  - built-in projectors
- Ownership/stewardship are projection-based, not stored as mutable tables.

## 5. DSL
- Mini TOML-ish parser supports:
  - `[[section]]` arrays
  - `[section.id]` tables
  - strings, numbers, booleans, inline tables, arrays
  - comments
- Import model:
  - `app.imports` recursively loads other DSL files (cycle-safe).
- DSL sections are mapped to kernel/app operations:
  - app/context/serverRunner/identity/thing/relation/capability
  - trait/valueType/processSpec
  - compiler/description/compile/route/serve
  - frontendRunner/view/render/action/widget/widgetVersion/widgetVersionTransition/activateWidgetVersion/attachWidget
  - frontendProgram/frontEndStep + ergonomic step syntax
- Context-composition-specific sections now include:
  - `[[contextBinding]]`
  - `[[contextExport]]`
  - `[[contextImport]]`
- Covered authoring surfaces may also accept explicit contextual ref fields in parallel with canonical ids.
  Current first-slice ref fields are `parentRef`, `rootWidgetRef`, `servesRef`, `serverRunnerRef`, `routeRef`, `backendHostRef`, and `frontendHostRef`.
  These resolve against authored `contextBinding` / `contextImport` visibility before witnesses are stored, but the stored witness truth remains canonical ids.
- Capability-specific sections now include:
  - `[[capability]]`
  - `[[capabilityInstall]]`
  - `[[capabilityRemove]]`
- Legacy `context.capabilities = [...]` and legacy host capability strings remain compatibility sugar and are projected into the first-class capability model during load/projection.
- Unknown sections emit `dsl.unknownSection` witnesses.
- Source witnesses are emitted for provenance and browser source mode.

## 5.1 Type / Trait Model
- `trait` Things represent compatibility targets such as `textual`, `numeric`, `boolean`, `color`, and `enumerated`.
- `valueType` Things carry optional editor metadata and declare compatibility through witnessed `compatibleWith` relations.
- `processSpec` Things define flat typed process signatures with `inputs` and `outputs`.
- Compatibility is `exact match OR transitive compatibleWith reachability`.
- DOM form coercion is intentionally narrow: string-to-number and string-to-boolean for typed form fields only.

## 6. Hosts and HTTP Surface
- Backend host must expose capability objects equivalent to:
  - `http.serve`, `fs.json.read`, `fs.json.write`
- Frontend host must expose capability objects equivalent to:
  - `dom.render`, `http.fetch`
- Capability placement in the first public slice supports:
  - `context`
  - `serverRunner`
  - `routePage`
- Runtime startup still bridges host capability resolution through the new capability model so older behavior continues to work.
- Canonical startup path is the generic CLI:
  - `node src/cli.js bootstrap [--port <n>]`
  - `node src/cli.js serve <dslPath> [--server <id>] [--port <n>]`
  - `npm run bootstrap` is a convenience wrapper around the dedicated blank-world bootstrap command
  - `npm run demo` is a convenience wrapper around that CLI for the demo DSL
- Runtime selection is driven by authored `serverRunner` + `serve` definitions.
- Current public/runtime surface includes:
  - pages:
    - `/`
    - `/_bootstrap`
    - `/world`
    - `/process`
    - `/canvas`
  - bootstrap and authoring APIs:
    - `/api/bootstrap-model`
    - `/api/bootstrap-state`
    - `/api/contexts`
    - `/api/perspectives`
    - `/api/context-bindings`
    - `DELETE /api/context-bindings`
    - `/api/context-exports`
    - `DELETE /api/context-exports`
    - `/api/context-imports`
    - `DELETE /api/context-imports`
    - `/api/stewardships`
    - `DELETE /api/stewardships`
    - `/api/proposals`
    - `/api/proposals/:id/approve`
    - `/api/proposals/:id/reject`
    - `/api/capabilities`
    - `/api/capability-installs`
    - `DELETE /api/capability-installs`
    - `/api/identities`
    - `/api/frontend-programs`
    - `/api/frontend-steps`
    - `/api/routes`
    - `/api/serve-mounts`
    - `/api/server-runners`
    - `/api/tutorial-progress/:tutorialId`
  - session and app APIs:
    - `/api/session`
    - `/api/private-notes`
    - `/api/todos`
    - `/api/todos/:id`
    - `/api/widgets`
    - `/api/widget-versions/:soul/activate`
    - `/api/widget-versions/:soul/rollback`
  - inspection and runtime APIs:
    - `/api/witnesses`
    - `/api/world-graph`
    - `/api/process-view`
    - `/api/process-runs/:runId`
    - `/api/process-events`
    - `/api/source`
    - `/api/events`
  - canvas APIs:
    - `/api/canvas`
    - `/api/canvas/perspectives`
    - `/api/canvas/process`
- When no served home page exists yet, `/` falls back to the bootstrap seam instead of hard failing.
- Request failures must emit witness records instead of silent errors.
- Cookie-backed session identity is the canonical auth transport for normal browser use.
- `x-witness-actor` is a dev-only escape hatch and is ignored unless a runner explicitly allows it.
- `/api/widgets` now uses the witnessed `widget.define` process spec for both input validation and output validation.
- `/api/context-bindings`, `/api/context-exports`, and `/api/context-imports` project explicit local naming and import/export rows while preserving canonical ids as stored witness truth.
- Bootstrap model/state now also expose explanatory composition metadata such as `contextBindableTargets`, `contextScopes`, and source-context export choices so the product surface can explain what is visible in a context and why.
- Canonical-id authoring remains a compatibility path beside contextual `*Ref` authoring.
  That keeps older worlds and older write paths valid, but it is not yet a hard context-boundary enforcement story.
- `/api/capabilities` and `/api/capability-installs` now use witnessed `capability.define`, `capability.install`, and `capability.remove` process specs for typed validation.
- `/api/tutorial-progress/:tutorialId` now persists tutorial hidden-state, explicit page-disabled state, and authored-step replay pins for the currently shipped bootstrap/app/world Sourcery surfaces. The world-page guidance panel and world-page recovery commands consume that same persisted state directly rather than introducing a second onboarding-only model.
- The shipped Todo tutorial definition now also carries authored concept metadata, and bootstrap/live-app tutorial UI reveal those concepts directly from real progress through that authored sequence.
- The shipped Todo starter blueprint now also authors the `/world` operating surface, its supporting program, and its routes so the tutorial's final inspection handoff lands on a real starter-authored page rather than a demo-only surface.
- The bootstrap tutorial shell now also derives a small ambient next-step suggestion list from visible world/session/tutorial state and only routes those suggestions into real controls or real surface handoffs.

## 7. Modules, Widgets, and Process Engine
- Module operations emit witnesses and gate on `supportsProcess` relations.
- Capability operations emit witnessed definitions/installs/removals and project catalog/install read models from those witnesses.
- Widget definitions project to render trees via attachment graph.
- `ValueEditor` is a primitive widget kind that chooses a concrete HTML control from value-type / trait metadata.
- Template widgets can render as inert DOM `<template>` sources and can be consumed by `renderCollection`.
- Frontend steps compile into process graphs with:
  - ordering by event + order
  - dependency edges and concurrent-ready execution
  - predicates (`equals`, `notEquals`, `truthy`, `falsy`)
  - repeat semantics (`while`, `forEach`)
- generic collection rendering and interpolation through `renderCollection`
- synthetic `error` dispatch for uncaught runtime step failures
- `readForm(schema = "...")` can coerce and filter flat form payloads through a witnessed `processSpec`.
- Versioned widget rendering resolves through active version claims.
- Process execution tracing is recorded through `frontend.process.*` and `frontend.step.*`, and Process View consumes those traces.

## 8. World Browser
- Produces deterministic positioned nodes and context groups.
- Exposes graph, thing-list, primitive, source, and process browsing modes.
- Source browser allows only files from witnessed DSL imports.
- Inspector surfaces:
  - object values
  - association metadata
  - source annotations
  - typed process/type metadata for `trait`, `valueType`, and `processSpec` objects
- Rendered app pages now also expose a first live surface-inspector slice:
  - explicit `Inspect Page` toggle
  - right-click widget selection through rendered `data-widget` ancestry
  - live selection highlight and widget metadata panel
  - truthful deep-link handoff into `/world`, witnesses, source, and process view
  - widget-version activate/rollback actions where versioned widgets exist
- Rendered app pages also expose a shared search/command slice:
  - current rendered widgets can be searched and inspected in place
  - projected capability/route/source/process objects can be handed off through the same command surface
  - hidden real surfaces such as `/world`, `/_bootstrap`, and `/process` remain explicit route handoffs rather than registry-only commands

## 9. Observability and Privacy
- Logging should include request lifecycle + projection metrics.
- Private notes are actor-scoped; public witness projections filter actor-private data.
- Projection cache is advisory and not a source of truth.

## 10. Test Coverage Expectations
- Each contract should include both success and failure checks:
  - gate failures
  - missing capability checks
  - bad/invalid input paths
  - process failures
  - malformed request handling
  - permission/ownership rejection paths
  - typed compatibility failures and typed output validation failures where process specs are in use
