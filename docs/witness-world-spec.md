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

Terminology used by this spec:

- `projection` means a real derived read model, not canonical truth
- `stub` means a real seam with a simplified deterministic or local provider path
- `real but narrow` means a truthful first slice with intentionally limited coverage or scope
- `compatibility sugar` means an authored convenience or migration bridge that lowers into the first-class model during load or projection
- `fake` should be reserved for surfaces that only simulate behavior without truthful grounding in witnesses or runtime state

Current honesty notes:

- command/search results are projection-backed, not registry-backed
- tutorial recovery commands derive from persisted tutorial state rather than a second onboarding-only model
- stub-provider paths remain real runtime behavior with deterministic or local transports
- legacy capability-string lowering and covered canonical-id authoring bypasses remain compatibility paths rather than final composition rules
- widget-version routes and Eden version routes now use shared authority derivation, the live inspector now has a first `widgetVersion.activate` / `widgetVersion.rollback` proposal fallback, the Eden versions panel now has a first `widgetVersion.activate` / `widgetVersion.rollback` / `edenVersions.publish` proposal fallback, the Eden capability shelf now has a first `capability.install` proposal fallback, and direct runtime-plugin / MCP authoring routes now also create real proposals on `403` instead of dead-ending, but remaining app-specific and other operating-surface mutation actions still are not all under one shared authority/proposal derivation path

Current honesty ledger:

- `fake` at the currently documented witness/runtime core: none explicitly called out
- `stub`: provider-backed seams that currently run through deterministic or local transports
- `projection but real`: command/search and tutorial recovery read surfaces
- `real but narrow`: first-slice contextual naming coverage, current-identity editing, live proposal handling, and first-slice canvas authority-bound world mutation
- `compatibility sugar`: legacy capability lowering and the remaining allowed canonical-id authoring paths

The current risk is less "secret second system" and more "temporary lowering path becomes permanent truth."
The adjacent risk is "one more special route" gradually avoiding the shared governance model.

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
  - shipped projection modules
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
  Current first-slice ref fields are `parentRef`, `rootWidgetRef`, `rootSurfaceRef`, `servesRef`, `backendProgramSoulRef`, `serverRunnerRef`, `serverRef`, `routeRef`, `backendHostRef`, `frontendHostRef`, `targetRef`, and `targetIdRef`.
  These resolve against authored `contextBinding` / `contextImport` visibility before witnesses are stored, but the stored witness truth remains canonical ids.
  Where covered surfaces still accept direct canonical ids beside `*Ref` fields, validation now classifies that usage explicitly as same-context convenience, imported-target reference, or legacy-only path instead of treating it as one undifferentiated bypass.
- Capability-specific sections now include:
  - `[[capability]]`
  - `[[capabilityInstall]]`
  - `[[capabilityRemove]]`
- Context explanation reads now include:
  - visible scope rows through `contextScopes`
  - grouped name explanations through `contextNameResolutions`
  - explicit ambiguity rows through `contextNameConflicts`
- MCP-specific sections now include:
  - `[[mcpServer]]`
  - `[[mcpToolInstall]]`
  - `[[mcpToolRemove]]`
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
  - `node src/cli.js serve <app-dir|app.wtoml> [--server <id>] [--port <n>]`
  - `node src/cli.js mcp <app-dir|app.wtoml> [--mcp <id>] [--server <id>] [--transport <stdio|http>] [--port <n>] [--actor <id>]`
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
    - `/api/identities/:id`
    - `/api/frontend-programs`
    - `/api/frontend-steps`
    - `/api/routes`
    - `/api/serve-mounts`
    - `/api/server-runners`
    - `/api/mcp-servers`
    - `/api/mcp-tool-installs`
    - `DELETE /api/mcp-tool-installs`
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
  - MCP runtime transport:
    - `POST /mcp/:id`
    - `GET /mcp/:id`
- When no served home page exists yet, `/` falls back to the bootstrap seam instead of hard failing.
- Request failures must emit witness records instead of silent errors.
- Cookie-backed session identity is the canonical auth transport for normal browser use.
- `x-witness-actor` is a dev-only escape hatch and is ignored unless a runner explicitly allows it.
- `/api/widgets` now uses the witnessed `widget.define` process spec for both input validation and output validation.
- `/api/identities/:id` now uses the witnessed `identity.update` process spec for typed validation, and current signed-in session reads refresh immediately when that edited identity is the active session identity.
- `/api/canvas/process` now surfaces real `403` authority failures for the first covered non-bootstrap governance mutations instead of collapsing them into generic malformed-request errors.
  In the current slice that means context-scoped `canvas.perspective.create` plus direct `canvas.thing.setTitle`, `canvas.relate`, and `canvas.unrelate` writes now respect context/target authority.
- `/api/widget-versions/:soul/activate`, `/api/widget-versions/:soul/rollback`, and the Eden version mutation routes now also respect the governing context of the versioned widget soul rather than acting like sign-in-only version toggles.
- `/api/context-bindings`, `/api/context-exports`, and `/api/context-imports` project explicit local naming and import/export rows while preserving canonical ids as stored witness truth.
- Bootstrap model/state now also expose explanatory composition metadata such as `contextBindableTargets`, `contextScopes`, and source-context export choices so the product surface can explain what is visible in a context and why.
- Bootstrap model now also exposes proposal-target governance metadata:
  - `proposalTargetProcesses` is now derived from the shared proposal-target governance catalog rather than a bootstrap-local string list
  - `proposalTargetGovernance` explains the governance mode and authority mechanism for each bootstrap-selectable proposal target
  - `POST /api/proposals` now rejects unsupported `targetProcess` values at proposal-creation time instead of letting uncatalogued targets drift into later approval/executor failures
- Bootstrap model/state now also expose MCP authoring and transport metadata:
  - `supportedMcpTransports`
  - `supportedMcpActingModes`
  - `supportedMcpTools`
  - projected `mcpServers`
  - projected `mcpToolInstalls`
- `/api/mcp-servers` and `/api/mcp-tool-installs` now use witnessed `mcpServer.define`, `mcpTool.install`, and `mcpTool.remove` process specs for typed validation and bootstrap/proposal execution, including direct-route proposal fallback when a signed-in actor lacks target authority.
- `/mcp/:id` is the first local-first MCP transport surface:
  - it currently supports `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`
  - `GET /mcp/:id` is intentionally a `405` in the current slice because streaming GET/SSE transport is not yet implemented
  - tool exposure is authored per server through `mcpToolInstall`, filtered by acting mode and current runtime capability availability
  - delegated and service calls both normalize through the runtime authority tuple; service mode uses `mcpServer.serviceIdentity` as the canonical actor with `authorityMode = "service"`
  - HTTP service mode requires `Authorization: Bearer` matching `serverRunner.runtimeConfig["mcp.<serverId>.token"]`
  - stdio transport treats subprocess launch as the trust boundary and may optionally bind a delegated actor through `--actor`
  - installed MCP tools may further narrow mutation/read reach through `scopeContexts` and `scopeTargets`
  - HTTP origin validation is local-first; non-loopback foreign origins are rejected in the current slice
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
  - a first proposal-aware fallback for signed-in actors without direct version authority, creating real `/api/proposals` `widgetVersion.activate` and `widgetVersion.rollback` proposals from the rendered page for shared versioned widgets
  - a first proposal-aware fallback on the Eden versions surface for signed-in actors without direct version authority, creating real `/api/proposals` `widgetVersion.activate`, `widgetVersion.rollback`, and `edenVersions.publish` proposals for the shared version seam
  - a first proposal-aware fallback on the Eden capability shelf for signed-in actors without direct target authority, creating real `/api/proposals` `capability.install` proposals from the place the missing capability is discovered
  - authority-bounded `PATCH /api/widgets/:id` save-back for non-versioned widget `text`, `title`, `class`, and `hidden`, producing real `widget.update` plus low-level `updateWidget` witnesses
  - a first proposal-aware fallback for signed-in actors without direct widget authority, creating real `/api/proposals` `widget.update` proposals from the rendered page
  - approved proposal effects now flow back through the same witness-stream refresh path rather than requiring a manual reload
- Rendered app pages also expose a shared search/command slice:
  - current rendered widgets can be searched and inspected in place
  - projected capability/route/source/process objects can be handed off through the same command surface
  - `F1 -> whoami` can now edit the current signed-in identity inline, refresh the active session when that identity changes, and still hand off into the real bootstrap identity editor in addition to world/source inspection
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
