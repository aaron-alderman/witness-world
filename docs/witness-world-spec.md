# Witness-World Specification

## 1. Purpose
- Provide a minimal witness-oriented runtime where canonical state is immutable witness log history.
- Model runtime behavior through things, relations, processes, and witnesses.
- Build projections (todo list, widgets, permissions, world graph) from witnesses.

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
  - app/context/serverRunner/thing/relation
  - trait/valueType/processSpec
  - compiler/description/compile/route/serve
  - frontendRunner/view/render/action/widget/widgetVersion/activateWidgetVersion/attachWidget
  - frontendProgram/frontEndStep + ergonomic step syntax
- Unknown sections emit `dsl.unknownSection` witnesses.
- Source witnesses are emitted for provenance and browser source mode.

## 5.1 Type / Trait Model
- `trait` Things represent compatibility targets such as `textual`, `numeric`, `boolean`, `color`, and `enumerated`.
- `valueType` Things carry optional editor metadata and declare compatibility through witnessed `compatibleWith` relations.
- `processSpec` Things define flat typed process signatures with `inputs` and `outputs`.
- Compatibility is `exact match OR transitive compatibleWith reachability`.
- DOM form coercion is intentionally narrow: string-to-number and string-to-boolean for typed form fields only.

## 6. Hosts and HTTP Surface
- Backend host must have:
  - `http.serve`, `fs.json.read`, `fs.json.write`
- Frontend host must have:
  - `dom.render`, `http.fetch`
- Required API routes:
  - `/`, `/world`, `/canvas`, `/api/session`, `/api/private-notes`, `/api/todos*`,
    `/api/widget-versions/:soul/activate`, `/api/widgets`,
    `/api/simulate-network-error`, `/api/witnesses`, `/api/world-graph`, `/api/source`,
    `/api/canvas`, `/api/canvas/perspectives`, `/api/canvas/process`.
- Request failures must emit witness records instead of silent errors.
- Route handlers must gate operations with actor context (`x-witness-actor`) where applicable.
- `/api/widgets` now uses the witnessed `widget.define` process spec for both input validation and output validation.

## 7. Modules, Widgets, and Process Engine
- Module operations emit witnesses and gate on `supportsProcess` relations.
- Widget definitions project to render trees via attachment graph.
- `ValueEditor` is a primitive widget kind that chooses a concrete HTML control from value-type / trait metadata.
- Frontend steps compile into process graphs with:
  - ordering by event + order
  - dependency edges and concurrent-ready execution
  - predicates (`equals`, `notEquals`, `truthy`, `falsy`)
  - repeat semantics (`while`, `forEach`)
- `readForm(schema = "...")` can coerce and filter flat form payloads through a witnessed `processSpec`.
- Versioned widget rendering resolves through active version claims.

## 8. World Browser
- Produces deterministic positioned nodes and context groups.
- Exposes graph, thing-list, primitive, source, and process browsing modes.
- Source browser allows only files from witnessed DSL imports.
- Inspector surfaces:
  - object values
  - association metadata
  - source annotations
  - typed process/type metadata for `trait`, `valueType`, and `processSpec` objects

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
