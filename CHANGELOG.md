
## 0.31.0

- Promoted Thing List to a first-class World Browser mode.
- Added Process Explorer as a fifth World Browser mode.
- Improved Primitive Browser with a third References column.
- File primitive values now route to the Source Browser instead of primitive string handling.
- Source Browser now follows selected object changes, opening/highlighting the selected source definition when available.
- Tightened World Browser menu styling so tab labels do not grow the header.

## 0.30.0

- Promoted World Browser modes to first-class UI tabs: Graph, Primitive Browser, Source Browser.
- Added VS-Code-like source browser with file sidebar, line numbers, linked references, and selected-definition highlighting.
- Added README.md, HANDOFF.md, and ROADMAP.md.

## 0.29.0

World graph navigation and document/primitive browser pass.

- Selecting a graph object from the canvas or inspector now keeps the world graph visible and scrolls the canvas to the selected node.
- Source definitions are clickable; selecting a source file replaces the graph canvas with the full linked source document.
- Primitive/unresolved values open a primitive browser with selectable primitive kind lists.
- Shrank the world header and fixed scroll container sizing so the inspector and canvas can scroll to the bottom of the window.
- Added backend `/api/source` with witnessed whitelist checks for imported DSL files.
- Added regression coverage for source loading and world-view UI assets.
- 65 passing tests.


## 0.28.0

- Added typed value projection for world graph object bodies.
- Selected Object drawer now has a dedicated Values section separate from Object properties.
- Values render through type-aware widgets for refs, lists, records, strings, numbers, booleans, and null.
- Ref values are clickable when they point at graph objects.
- Arrays/records no longer collapse to plain JSON strings in the inspector.
- Fixed world page layout so the LHS inspector and graph canvas are independent scroll containers.
- Added regression tests for typed values and scroll containers.
- 63 passing tests.

## 0.25.1

- removed World Graph rendering from the main Todo page even when older witness logs contain legacy world graph widget attachments
- added a left-side selected-object inspector on `/world`
- world graph nodes are selectable and visually highlighted
- selected-object inspector shows id, label, kind, context, badges, incoming edges, and outgoing edges
- added regression coverage for dedicated world route and graph selection UI assets
- 59 passing tests


## 0.25.0

- moved World Graph onto dedicated `/world` page
- added `Link` widget primitive
- added world page widget/program definitions in DSL
- added server support for `worldRootWidget` and `worldFrontendProgram`
- main todo page links to World Graph instead of embedding it
- added regression coverage for dedicated world page routing

# v0.24.0

- Changed the World Graph to be a context/relationship view, not a process-step trace.
- Removed individual process step nodes from the World Graph.
- Frontend execution now stops at action/widget trigger contexts such as `action: activateWidgetVersion`.
- API communication is shown from action-level context nodes to API boundary nodes.
- Detailed process steps remain in the process graph/runtime model and are reserved for a future dedicated process view.
- Added regression tests ensuring no step nodes or `has step` edges leak into the World Graph.
- 59 passing tests.

# v0.23.0

- World graph now renders semantic process path intermediates as visible context-anchor nodes instead of linking the frontend program directly to every step.
- Added nested process anchors for program, trigger, action/widget, and step scopes.
- Backend runtime now owns backend host/server nodes; frontend runtime owns frontend host nodes.
- Backend and frontend capabilities are scoped into dedicated capability areas instead of appearing unscoped.
- Module-kind vocabulary is grouped under System vocabulary instead of leaking as ordinary unscoped nodes.
- Added regression tests for semantic intermediates, runtime/capability scoping, and vocabulary scoping.
- 59 passing tests.

# v0.22.1

- Fixed semantic context boxes that appeared empty by separating widget definitions from webpage layout placements.
- Widgets now live in Widget definitions; layout placement proxy nodes live in Webpage layout and represent the widget definitions.
- Backend API handler nodes now live in Backend routes.
- Added/updated regression coverage for populated semantic areas.
- 57 passing tests.

# v0.22.0

- Added semantic world-graph layout areas for widget definitions, widget versions, webpage layout, frontend execution, backend routes, backend runtime, and API boundary.
- Moved frontend program nodes under the Frontend execution context.
- Grouped layout widgets under Webpage layout and versioned widgets under Widget versions.
- Added regression tests for semantic grouping.
- 57 passing tests.

# v0.21.0

- world graph no longer renders legacy colon-concatenated frontend step relation targets
- frontend program and steps remain in the frontend context even when referenced by backend server definitions
- API boundary nodes now explicitly show frontend-to-backend communication
- activateWidgetVersion frontend step now requests POST /api/widget-versions/:soul/activate, handled by backend.widgetVersion.activate
- added regression tests for frontend context ownership, legacy step ID leakage, and API boundary edges

# 0.20.0

- Added semantic process step paths instead of colon-concatenated IDs.
- Frontend process steps now carry structured path segments: program, trigger, widget/action, step, operation.
- World graph renders process steps as nested semantic contexts with concise operation labels and breadcrumbs.
- Added nested context layout support for the world graph.
- Added regression tests for semantic path grouping and avoiding leaked compound IDs.
- 54 passing tests.

# 0.18.2

- Fixed `/api/world-graph` 500s caused by malformed legacy relation witnesses in persistent logs.
- World graph projection now ignores invalid relation endpoints instead of throwing.
- Added structured backend request logging: start, finish, failure, and world graph projection details.
- Added regression tests for legacy malformed relations and backend world graph logging.
- 51 passing tests.

# 0.18.1

- Fixed generated frontend engine syntax by wrapping the client runtime in an async IIFE.
- Removed stale pre-process-graph execution loop that referenced an undefined `event` and used `await` outside async context.
- Added regression test that parses generated browser scripts with `new Function(...)`.
- Added regression test for `/api/world-graph` reachability and projected nodes.
- 49 passing tests.

# Changelog

## 0.16.0

- Added async process graph utilities.
- Linear frontend steps now lower to dependency graphs.
- Same-order steps can run in parallel.
- Added branch predicates via `when`.
- Added bounded loop support.
- Added parallel `forEach` coordination support.
- Browser frontend runner now executes the generated process graph instead of a flat step loop.
- Added process graph tests.
# Changelog

## 0.15.0

- Added first-class DSL contexts.
- Added thin main file with imports into common/backend/frontend files.
- Added context capabilities and host capability lookup via contextCapability relations.
- Demo app now loads imported DSL files and merges them into one witnessed graph.
- Added import/context regression tests.
- Prevented context metadata leaking into widget props/frontend step params.

# 0.14.0

- Refactored DSL surface for ergonomics while preserving witnessed runtime semantics.
- Added `[[defaults]]` support for shared actor/program defaults.
- Added primitive widget section aliases: `[[page]]`, `[[box]]`, `[[heading]]`, `[[text]]`, `[[form]]`, `[[input]]`, `[[select]]`, `[[button]]`, `[[list]]`.
- Widget properties can now be declared directly as top-level keys instead of `props = { ... }`.
- Widgets can declare `children = [...]`, generating attachment witnesses automatically.
- Added `[[step]]` shorthand for frontend program steps; extra keys become step params.
- Converted the demo todo server definition to the ergonomic DSL while preserving the explicit version as `demo-todo-server.explicit.wtoml`.
- Added equivalence tests proving ergonomic DSL lowers to the same widget tree/program model.
- 37 passing tests.

# Changelog

## 0.12.0

Architectural hardening pass before continuing feature growth.

- Added canonical append-only witness log (`WitnessLog`) with JSONL persistence and reload.
- `createWorld` can now be backed by a witness log or witness log path.
- Added stable identity helpers (`thingId`, `versionId`) based on canonical hashing.
- Added explicit projection modules for todo state, private notes, and visible witnesses.
- Todo and private-note state are now projected from witnesses; JSON files are projection caches.
- Added centralized gate helpers that emit blocking witnesses instead of throwing.
- Added architectural tests for witness-log reload, projections, stable IDs, and gate failures.
- Package version bumped to 0.12.0.


## 0.13.0

Second hardening pass focused on witness identity, replay determinism, visibility boundaries, and host leakage.

- Witness emission now chains to the previous witness by default, so repeated identical process attempts are distinct witnessed occurrences.
- Reloaded worlds continue the causal witness chain from the existing append-only log.
- Widget editor IDs now use stable `thingId(...)` helpers instead of timestamp/random host IDs.
- Added hardening tests for repeated witnesses, causal reload, projection-cache tampering, private witness visibility, stable widget IDs, and malformed JSON request witnesses.
- Confirmed projection caches cannot override canonical witness-derived todo state.
- Package version bumped to 0.13.0.

## 0.15.1

- Fixed duplicate rendered widgets after repeated DSL application/server restarts.
- Widget tree projection now deduplicates identical attachment witnesses.
- Frontend program projection now deduplicates identical step witnesses.
- Added regression test for idempotent widget rendering and frontend steps.

## 0.17.0

- Added Process Graph Lab section to the demo UI.
- Added a deterministic "Simulate network error" button declared in the frontend DSL.
- Added backend `/api/simulate-network-error` route that emits a `network.simulated.failed` witness and returns HTTP 503.
- Extended frontend `fetchJson` op with `allowFailure` so process graphs can deliberately observe failures without aborting the whole graph.
- Added regression test proving the UI exposes the simulated failure flow and the witness inspector can see the resulting witness.

## 0.18.0

- Added lightweight world graph projection with deterministic layered layout.
- Added `/api/world-graph` endpoint.
- Added World Graph section to the demo UI with clickable nodes and live badges.
- Added frontend `renderWorldGraph` operation.
- Added regression tests for deterministic layout and demo endpoint rendering.


## 0.19.0

World graph visualization cleanup.

- Added context boxes around graph nodes, grouped by witnessed context.
- Added process-step nodes for frontend process graphs so steps are visible without rendering raw witnesses.
- Hid witness nodes by default; they can still be included explicitly by projection option.
- Rendered ownership as a red directed edge pointing from the owned thing to its owner.
- Normalized labels/badges to avoid `[object Object]` in the world graph UI.
- Added edge styles for ownership, process, capability, and generic relation edges.
- Added tests for context grouping, hidden witnesses, process steps, and explicit witness inclusion.
- 53 passing tests.

## 0.23.1

World graph semantic step cleanup.

- Collapsed redundant one-to-one `step: step N` context-ref nodes.
- Step operation nodes now carry the semantic step path directly.
- Dependency edges now use the rendered semantic step IDs instead of legacy `step:<compound>` IDs.
- Added regression coverage to prevent step context/name leakage.
- 59 passing tests.


## 0.26.0

World graph inspector workspace improvements.

- Made the world page use a fixed, scrollable left inspector drawer and a horizontally scrollable graph canvas.
- Added clickable object references in the selected-object inspector.
- Added kind chips/list mode so selecting a kind shows a clickable list of all matching objects.
- Added kind-based node colour styling for widgets, layouts, contexts, capabilities, API boundaries, and vocabulary.
- Preserved graph selection highlighting while making inspector navigation drive selection.
- Added regression coverage for inspector link/list UI assets.
- 59 passing tests.


## 0.27.0

World graph object browser hardening.

- Added DSL source provenance witnesses while compiling imported `.wtoml` files.
- World graph nodes now expose selected-object properties derived from witness bodies.
- World graph edges carry association metadata, such as widget attachment slot/order.
- Selected Object drawer now shows object properties, associations from/to the selected object, association properties, and source definitions/AST snippets.
- Context references in the inspector now select the actual context object.
- Added tests for object properties, association metadata, source provenance, and inspector sections.
- 61 passing tests.
