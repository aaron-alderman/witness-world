# DESIRE Roadmap

This roadmap tracks the migration from the current WTOML-first execution path to a DESIRE-first internal architecture, while keeping WTOML as the authored and runnable surface for this milestone.

Legend:

- `[X]` complete
- `[~]` partially landed / active execution phase
- `[ ]` not done

## North Star

Make `DESIRE` the canonical semantic execution input.

Make `DESIRE+` the canonical source/debug/provenance IR.

Keep WTOML and RVM as source languages that compile into `DESIRE+`, then normalize into `DESIRE`.

## Current Position

The target architecture is:

`WTOML -> DESIRE+ -> DESIRE -> world/runtime`

and, in parallel:

`RVM -> DESIRE+ -> DESIRE -> world/runtime`

For this milestone:

- WTOML remains the checked-in runnable example format.
- CLI and product entrypoints remain WTOML-facing.
- DESIRE has no standalone text syntax yet.
- DESIRE+ is the traceable authored/debug IR.

## Guardrails

- Do not disturb existing WTOML examples, demos, CLI flows, bootstrap flows, or MCP flows.
- Do not require product authors to author DESIRE or DESIRE+ directly in this milestone.
- Keep runtime meaning canonicalized in DESIRE, not in source-language-specific document structures.
- Preserve provenance all the way from source files to normalized semantic nodes.
- Treat `DESIRE+ -> DESIRE` normalization as deterministic and language-agnostic.

## Execution Snapshot

Verified in the current tree:

- `[X]` `src/desire/` exists and exports the canonical internal entrypoints.
- `[X]` WTOML now routes through `WTOML -> DESIRE+ -> DESIRE -> applyDesire` in `src/dsl.js`.
- `[X]` RVM ingestion exists and compiles the checked-in specimen set into `DESIRE+`.
- `[X]` best-effort `DESIRE+ -> WTOML` and `DESIRE+ -> RVM` serializers exist with focused round-trip tests.
- `[X]` DESIRE-backed provenance reaches the inspect graph and `/api/source` annotations.
- `[X]` `applyDesire` now executes every DESIRE kernel kind natively, including source-less canonical DESIRE documents, plus a verified native WTOML semantic subset and registered runtime declaration handlers without calling the legacy doc applicator.
- `[X]` the checked-in runnable WTOML entry examples now apply through DESIRE without any legacy `runtime.doc` fallback.
- `[X]` RVM `graph_context`, `capability`, `event`, `command`/`query`, and `policy` block forms now survive into normalized DESIRE and native execution instead of being dropped after parsing.
- `[X]` native semantic execution for RVM-backed `capability` and `policy` forms now emits meaningful semantic relations (`inContext`, `providesCapability`, `governs`) rather than only bare definition witnesses.
- `[X]` native semantic execution for `type` and `message` kernel nodes now emits structural relations for type roles/cases and message roles/fields/schemas, rather than only bare definition witnesses.
- `[X]` native semantic execution now exposes richer kernel structure for capabilities, boundary operations, policy states/outcomes, projection kinds, and surface kinds/classes.
- `[X]` RVM `derive` and `view` forms now survive into normalized `projection` and `surface` DESIRE nodes and apply natively with structural relations.
- `[X]` RVM `read`, `write`, and `adapter ... using ...` block forms now survive into normalized DESIRE `boundary` nodes and apply natively with capability, command, event, and route relations.
- `[X]` compact one-line RVM semantic forms now compile into DESIRE+ for `process`, `state`/`value`, `event`, `command`/`query`, `adapter ... using ...`, `derive`, and `view`.
- `[X]` compact one-line RVM semantic forms also cover `context`/`graph_context`, `capability`, `entity`, `boundary`, and `policy`, with native DESIRE application coverage.
- `[X]` RVM `actor ... owns ...` forms with `durable_state`, collection context, and list/detail projections now normalize into native DESIRE `store` and `projection` nodes.
- `[X]` semantic WTOML sections (`context`, `capability`, `trait`, `valueType`, `processSpec`, `identity`) no longer lower to `runtime.doc`; they normalize directly to DESIRE kernel nodes and apply natively from semantic bodies.
- `[X]` WTOML also has generic semantic kernel sections for `type`, `message`, `entity`, `store`, `process`, `boundary`, `policy`, `projection`, and `surface`, with structural WTOML/RVM normalization equivalence coverage over the common kernel subset.
- `[X]` `/api/world-graph` object details and `/api/source` now have a mixed WTOML+RVM provenance proof covering source language, source kind, spans, DESIRE node ids, DESIRE+ source node ids, and target resolution through the same response shape.
- `[X]` the RVM serializer now emits RVM-like semantic fallback source for supported DESIRE+ nodes when exact raw source text is unavailable, with normalized round-trip coverage across context, capability, message/event/command/query, entity/version, process/state, boundary/adapter, policy, projection/view, actor/store, and import/module families.
- `[X]` lowered Tiny/RVM implementation forms are now explicitly classified in DESIRE+ metadata as `lowered-runtime` and kept above the DESIRE boundary; supported RVM graph forms now normalize into first-class DESIRE `graph` kernel semantics.
- `[X]` RVM `enum` forms now normalize into DESIRE `type` nodes with `role = "enum"` and preserved cases.
- `[X]` RVM `model` and `chart` authored forms now have tracked DESIRE coverage: `model` normalizes to `dataflow`, chart-specific surface fields are preserved, native application emits dataflow/surface witnesses plus structural graph relations for axes, parameters, derived flows, chart model refs, encodings, and layers, and both WTOML-like and RVM-like serializers round-trip by normalized structure.
- `[X]` the inspect world graph now recognizes `dataflow` as a first-class node kind and exposes RVM `model`/`chart` provenance plus structural dataflow/chart edges.
- `[X]` checked-in WTOML entry runtime declaration audit after semantic cleanup: `demo-todo-server.wtoml` has 609 canonical `runtime.declaration` residuals / 18 semantic nodes / 0 legacy `runtime.doc` residuals; explicit and monolith variants each have 386 canonical residuals / 16 semantic nodes / 0 legacy residuals.
- `[X]` RVM conflict markers in history-backup specimens are now classified as fixture corruption in DESIRE+ instead of unsupported language forms.
- `[X]` built-in DESIRE+ validation now enforces source categories, residual categories, DESIRE boundary labels, and known semantic-kind names for `wtoml.doc` and `rvm.form` nodes.
- `[X]` `runtime.doc` has been removed from the declared DESIRE kernel kind set and from `DESIRE_NODE_KINDS`; normalized WTOML runtime material now uses the explicit `runtime.declaration` residual API, with legacy `runtime.doc` accepted only for compatibility.
- `[X]` runtime declaration bridge coverage is now auditable through the canonical `auditRuntimeDeclarationBridge` API; every discovered `examples/**/*.wtoml` file is covered by a static audit that requires 0 legacy-required declaration kinds.
- `[X]` runtime boundary helper APIs now use declaration-first names (`auditRuntimeDeclarationBridge`, `assertNoLegacyRuntimeDeclarationFallbackRequired`, `NATIVE_RUNTIME_DECLARATION_KINDS`, `RUNTIME_DECLARATION_BRIDGE_POLICY`); old `RuntimeDoc` names remain compatibility aliases only.
- `[X]` `applyDesire` no longer calls `applyWitnessDocsLegacy`; unsupported runtime declarations now fail with strict diagnostics unless a core or plugin runtime declaration registry provides an apply handler.
- `[X]` `applyWitnessDocsLegacy` has been demoted to a compatibility alias that delegates through `WTOML -> DESIRE+ -> DESIRE -> applyDesire`; the old direct-doc applicator implementation has been removed from `src/dsl.js`.
- `[X]` `applyDesireNativeOnly` now provides an explicit DESIRE-only execution path over first-class registered runtime declarations and rejects unregistered runtime residuals before mutation.
- `[X]` WTOML source-local `defaults` propagation now happens during `DESIRE+ -> DESIRE` normalization; `applyDesire` no longer performs runtime default merging, and live-world context actor lookup happens inside native runtime declaration application.
- `[X]` the runtime-only residual boundary is now explicit in IR metadata and audits: WTOML runtime declarations compile as `desire-plus-only` authored-runtime material, normalized `runtime.declaration` residuals are marked `compatibilityBridge`, `kernelResident = false`, and `residualHome = "desire+"`.
- `[X]` normalized `runtime.declaration` residuals now require a first-class `body.declaration` envelope (`kind`, normalized `values`, source/default metadata, trace); source-shaped `body.values`/`declarationKind` aliases remain compatibility output only.
- `[X]` runtime declaration application now goes through an explicit registry: core declaration kinds are registered by default, plugin declaration kinds must register handlers, unregistered kinds are reported as unsupported, and registered entries without handlers fail explicitly.
- `[X]` registered DESIRE+ elaborators are now available through `createDesirePlusElaboratorRegistry` and `elaborateDesirePlus`; plugin-style source extension happens as explicit DESIRE+ tree-to-tree rewrites with provenance ancestry, not implicit unknown acceptance.
- `[X]` WTOML compatibility application now routes through `WTOML -> DESIRE+ -> elaborate DESIRE+ -> DESIRE -> applyDesire` while keeping the public CLI/source shape unchanged.
- `[X]` a focused concise RVM `dashboard` proof shows unregistered source sugar stays above the DESIRE boundary, while a registered elaborator expands it into ordinary `dataflow`, `projection`, and `surface` kernel semantics that apply natively.
- `[X]` active trusted plugin `runtime.js` modules can now export `desireExtensions` for DESIRE+ elaborators and runtime declaration handlers; the runtime plugin loader validates those exports and the DESIRE adapter converts them into explicit registries.
- `[X]` CLI WTOML entrypoints now use plugin-aware loading for `serve` and `mcp`, deriving compile-active plugins from authored `runtimePluginInstall` declarations plus operator CLI/env plugin selection before DESIRE+ elaboration and DESIRE application.
- `[X]` DESIRE now has a native `graph` kernel kind; RVM `graph_node`, `graph_edge`, `entity_type`, and `edge_type` forms compile to semantic graph nodes, apply natively, and expose provenance through `/api/world-graph` and `/api/source`.
- `[X]` optional module/read-model projectors are now active plugin contributions: `plugin.assets` owns the real `assets` and `assetIndex` projections, while core keeps only delegated empty fallbacks.
- `[X]` active plugin module/read-model projector registrations are now token-scoped: concurrent identical implementations share safely, scoped cleanup is idempotent, and conflicting same-name implementations fail clearly.
- `[X]` latest RVM ingestion audit over `examples_rvm/` is enforced in `test/desire.test.js`: all checked-in `.rvm` files compile to `DESIRE+`, intentional residual categories are counted, and both authored-runtime residuals and unknown language forms must remain at 0.

Verified test coverage:

- `[X]` `node --test test\\desire.test.js`
- `[X]` `node --test test\\desire.test.js test\\world-graph.test.js test\\dsl.test.js`
- `[X]` `node --test test\\world-graph.test.js test\\desire.test.js`
- `[X]` `node --test test\\desire.test.js test\\world-graph.test.js`
- `[X]` `node --test test\\dsl.test.js`
- `[X]` `node --test test\\cli.test.js`
- `[X]` `node --test test\\desire-engentus-forms.test.js`
- `[X]` `node --test test\\runtime-operator-contract.test.js`
- `[X]` `node --test test\\runtime-server.test.js`

## Milestones

### 1. DESIRE Kernel

Status: `[X]`

Define the minimal semantic kernel as a JSON-serializable IR with normalized node kinds:

- `context`
- `type`
- `message`
- `store`
- `entity`
- `projection`
- `capability`
- `boundary`
- `policy`
- `process`
- `surface`
- `dataflow`
- `graph`

Exit criteria:

- Stable schema for all kernel node kinds.
- Validation utilities for each node kind.
- Backreferences from DESIRE nodes to originating DESIRE+ node ids.

Current state:

- `[X]` core constructors exist in `src/desire/ir.js`.
- `[X]` stable ids exist in `src/desire/ids.js`.
- `[X]` DESIRE nodes retain `sourceNodeIds`.
- `[X]` explicit validators now exist for `trace`, `DESIRE+` nodes/documents, and `DESIRE` nodes/documents in `src/desire/ir.js`.
- `[X]` `DESIRE_KERNEL_KINDS` and `DESIRE_NODE_KINDS` now contain only semantic kernel kinds, including `dataflow` for model-like computations and `graph` for graph declarations/schema edges; `runtime.declaration` and legacy `runtime.doc` are separated into `DESIRE_BRIDGE_KINDS` and validated through `DESIRE.runtimeResiduals`.
- `[X]` every DESIRE kernel kind has a validated body contract and table-driven test coverage for accepted and rejected bodies.
- `[X]` the remaining runtime bridge is explicitly non-kernel and tracked under bridge debt rather than the DESIRE kernel milestone.

### 2. DESIRE+ Source IR

Status: `[X]`

Define the richer authored/debug IR above DESIRE.

DESIRE+ should preserve:

- authored grouping
- modules/imports
- runtime declarations
- explicit surface/runtime trees
- plugin/rewrite provenance
- traceability metadata

Every DESIRE+ node should carry:

- stable id
- `trace.sourceLanguage`
- `trace.file`
- `trace.startLine`
- `trace.startColumn`
- `trace.endLine`
- `trace.endColumn`
- `trace.sourceKind`
- `trace.originNodeId?`
- `trace.via[]`

Exit criteria:

- Stable DESIRE+ schema.
- Node id generation rules.
- Trace/provenance validators.

Current state:

- `[X]` `createDesirePlusNode`, `createTrace`, and `createDesirePlusDocument` are landed.
- `[X]` WTOML and RVM compilation both attach stable ids and trace payloads.
- `[X]` provenance carries source language, file, spans/source line, source kind, and ancestry slots.
- `[X]` trace and document validators now enforce the current first-class IR contract at constructor and pipeline boundaries.
- `[X]` RVM DESIRE+ nodes now carry explicit boundary metadata for semantic, source-only, lowered-runtime, authored-runtime, fixture-corruption, and unknown residual categories. `graph-data` remains a historical/reserved residual category, but supported RVM graph forms now enter the semantic graph path.
- `[X]` RVM conflict markers are preserved as DESIRE+ fixture-corruption nodes for trace/debug without polluting language-support unknown counts.
- `[X]` built-in DESIRE+ schema validation now enforces known `sourceCategory`, `residualCategory`, `desireBoundary`, and semantic-kind vocabularies for `wtoml.doc` and `rvm.form`.
- `[X]` the global DESIRE+ schema remains intentionally extensible for plugin-provided node kinds; this is an explicit design property, not remaining schema debt.
- `[X]` explicit DESIRE+ elaboration is implemented as a registry of tree-to-tree handlers whose outputs must validate as DESIRE+ and preserve `originNodeId` plus `trace.via` ancestry.
- `[X]` plugin-loaded DESIRE extension exports now bridge the existing runtime plugin package system into DESIRE registries without allowing implicit unknown fallback.

### 3. DESIRE+ To DESIRE Normalization

Status: `[X]`

Implement the deterministic lowering that strips authored/runtime/editor detail and produces canonical semantic DESIRE.

Keep out of DESIRE:

- imports/modules
- server runners
- routes / serve bindings / transports / MCP specifics
- plugin installation/runtime wiring
- widget/DOM trees
- editor hints
- exact authored grouping

Exit criteria:

- Equivalent WTOML and RVM source shapes normalize to equivalent DESIRE meaning.
- Normalization is deterministic and testable.

Current state:

- `[X]` `src/desire/normalize.js` exists and is exercised in `test/desire.test.js`.
- `[X]` semantic normalization exists for the currently implemented WTOML/RVM core subset.
- `[X]` normalization now validates incoming `DESIRE+` and produces validated `DESIRE`.
- `[X]` equivalent WTOML/RVM semantic core forms now normalize into matching executable DESIRE shapes for contexts, messages, entities, processes, boundaries, and related type roles.
- `[X]` WTOML/RVM equivalence coverage now compares full normalized DESIRE signatures across every kernel kind in the supported common subset: `context`, `type`, `message`, `store`, `entity`, `projection`, `dataflow`, `capability`, `boundary`, `policy`, `process`, and `surface`.
- `[X]` WTOML `defaults` are applied deterministically during normalization for runtime-facing bridge nodes.
- `[X]` runtime-facing WTOML forms are preserved as `runtime.declaration` residuals outside `DESIRE.nodes`; semantic WTOML forms bypass runtime residuals entirely.
- `[X]` milestone exit criteria are met for the supported canonical source shapes; adding more sugar/source-shape fixtures is future coverage growth, not a blocker for deterministic normalization.

### 4. Native DESIRE Application Path

Status: `[X]`

Add a native `DESIRE -> world` execution path that applies DESIRE semantics directly using existing lower-level helpers.

This step should avoid lowering back into legacy witness-doc execution structures.

Reuse existing helpers where possible for:

- witness emission
- ownership
- widgets
- routes
- capabilities
- runtime plugins
- programs
- processes

Exit criteria:

- The world/runtime can be built from DESIRE directly.
- No user-visible regression in WTOML-backed flows.

Current state:

- `[X]` `applyDesire` is the canonical internal handoff point.
- `[X]` `applyDesire` now validates incoming `DESIRE` documents before execution.
- `[X]` `applyDesire` now handles a native WTOML-backed semantic subset directly:
  - `context`
  - `capability`
  - `trait`/`valueType` (`type` role forms)
  - `processSpec` (`message` role form)
  - `identity`
- `[X]` `applyDesire` now also handles a generic native DESIRE semantic subset directly, including RVM-backed nodes:
  - `context`
  - `capability`
  - `type`
  - `message`
  - `entity`
  - `process`
  - `boundary`
  - `store`
  - `projection`
  - `dataflow`
  - `policy`
  - `surface`
- `[X]` `applyDesire` also handles a direct runtime declaration subset natively when no contextual-ref resolution is required:
  - `defaults`
  - `app`
  - `perspective`
  - `stewardship`
  - `proposal`
  - `thing`
  - `relation`
  - `compiler`
  - `description`
  - `compile`
  - `capabilityInstall` / `capabilityRemove`
  - `runtimePluginInstall` / `runtimePluginRemove`
  - direct-id `serverRunner`
  - direct-id `mcpServer`
  - `mcpToolInstall` / `mcpToolRemove`
  - direct-id `route` / `serve`
  - `widget` / `attachWidget`
  - `widgetVersion` / `widgetVersionTransition` / `activateWidgetVersion`
  - widget-like authored sections (`page`, `box`, `section`, `heading`, `text`, `form`, `input`, `select`, `option`, `button`, `link`, `list`)
  - direct-id `frontendProgram`
  - `frontendStep` / `step`
  - `backendProgram` / `backendProgramVersion` / `backendProgramVersionTransition`
  - `backendStep`
  - `activateBackendProgramVersion`
  - `clone` / `transfer`
  - `frontendRunner`
  - `view`
  - `render`
  - `action`
- `[X]` `applyDesire` now also handles a contextual-ref-dependent runtime subset natively when the referenced objects are already visible in authored order:
  - `contextBinding`
  - `contextExport`
  - `contextImport`
  - `widget.parentRef`
  - `frontendProgram.rootWidgetRef`
  - `serverRunnerRef` / `backendHostRef` / `frontendHostRef`
  - `mcpServer.serverRunnerRef`
  - `route.servesRef`
  - `serve.serverRunnerRef` / `serve.routeRef`
- `[X]` `applyDesire` applies residual runtime declarations through the runtime declaration registry without calling `applyWitnessDocsLegacy`; known WTOML runtime declarations use first-class native handlers and unknown declarations fail unless registered by core or plugin code.
- `[X]` the checked-in WTOML entry examples (`demo-todo-server.wtoml`, `demo-todo-server.explicit.wtoml`, `demo-todo-server.monolith.wtoml`) now run through `applyDesireNativeOnly`, proving that the in-repo runnable WTOML surface no longer requires the legacy bridge.
- `[X]` native semantic execution remains intentionally generic for some kernel shapes, but every kernel kind is now covered by native application tests and emits structural graph relations beyond a bare definition witness where the body carries stable semantic fields, including dataflow axes/parameters/operations and chart surface encodings/layers.
- `[X]` RVM `model`/`chart` authored forms are covered by the current DESIRE kernel surface: `model` normalizes to `dataflow`, `chart` normalizes to chart-specific `surface` nodes, both apply natively, and rawless serializers preserve normalized meaning.
- `[X]` RVM-backed semantic nodes are executable natively for the supported semantic core, including `graph_context`, `capability`, `event`, `command`/`query`, `policy`, `read`/`write`, and `adapter ... using ...` block forms; authored/runtime RVM forms that stop above the DESIRE boundary are intentionally DESIRE+-only boundary material, not native application debt.

### 5. WTOML Compatibility Compiler

Status: `[X]`

Keep WTOML support, but make it a compatibility frontend:

`load WTOML -> compile to DESIRE+ -> normalize to DESIRE -> apply DESIRE`

Map WTOML semantic forms directly where possible, and map implementation-facing forms into DESIRE+ runtime/surface structures.

Exit criteria:

- Existing examples still run unchanged from WTOML paths.
- CLI flows work through the DESIRE pipeline internally.
- Existing tests are re-baselined against DESIRE-backed execution.

Current state:

- `[X]` `compileWtomlDocsToDesirePlus` and `compileWtomlToDesirePlus` are landed.
- `[X]` `applyWitnessDocs` now compiles WTOML through DESIRE before application.
- `[X]` existing WTOML examples remain the runnable checked-in examples.
- `[X]` the checked-in WTOML entry examples now have explicit no-legacy-fallback coverage through DESIRE-backed execution.
- `[X]` all discovered checked-in WTOML example paths now have a static bridge audit proving their runtime declaration kinds are native-covered by `applyDesire`.
- `[X]` WTOML can now express generic DESIRE semantic kernel nodes directly for focused fixtures without converting those forms into runtime bridge docs.
- `[X]` WTOML can now express semantic `dataflow` kernel nodes and chart-specific `surface` fields for serializer fallback parity with RVM `model`/`chart`.
- `[X]` the CLI regression suite now passes over DESIRE-backed loading for `bootstrap`, maintained demo `serve`, MCP stdio, plugin startup failure paths, and operator commands.
- `[X]` unnamed serve/MCP CLI runs now use isolated ephemeral temp world-home logs instead of fixed shared temp JSONL paths, avoiding accidental warm-start stalls from accumulated local demo witnesses while preserving named `WORLD_HOME` and explicit-log warm behavior.
- `[X]` runtime startup now has regression coverage proving plugin-selected default host capabilities are defined and installed before startup capability validation, keeping pluginized MCP/demo runtime composition compatible with DESIRE-backed CLI startup.
- `[X]` parity is covered for the runnable checked-in WTOML entry examples, all discovered checked-in WTOML fragment files have static native-coverage audits, and exercised CLI/runtime/operator paths pass through the DESIRE pipeline; arbitrary future operator/runtime surfaces are normal regression growth rather than current migration blockers.

### 6. Provenance Unification

Status: `[X]`

Replace the WTOML-only provenance path with generic DESIRE+ provenance that can represent WTOML and RVM origins uniformly.

Expose provenance through the world browser and `/api/source`, including:

- original file
- spans
- source language
- transform ancestry
- related semantic target ids

Exit criteria:

- Existing WTOML source browser behavior remains intact.
- Provenance works for DESIRE-backed objects regardless of source language.

Current state:

- `[X]` DESIRE-backed source metadata is threaded into `dsl.source.annotate`.
- `[X]` inspect graph nodes expose `sourceLanguage`, spans, ancestry, and DESIRE ids.
- `[X]` `/api/source` now returns witnessed file annotations as well as raw file text.
- `[X]` inspect graph coverage now includes native RVM-backed semantic message/entity/process/boundary nodes with provenance-backed annotations.
- `[X]` inspect graph coverage now also includes native RVM-backed capability and policy nodes.
- `[X]` inspect graph now reflects richer RVM semantic edges for capability provisioning and policy governance.
- `[X]` inspect graph now also reflects native RVM `projection` and `surface` nodes plus their structural edges (`projectsFrom`, `hasChildSurface`).
- `[X]` inspect graph now reflects native RVM `dataflow` and chart-surface nodes with structural edges for axes, parameters, derived flows, chart model refs, encodings, and layers.
- `[X]` inspect graph now reflects RVM read/write and adapter boundaries through capability dependency, command handling, and emitted event edges.
- `[X]` the running inspect stack now has verified RVM-backed end-to-end coverage through both `/api/world-graph` and `/api/source`.
- `[X]` the running inspect stack now has verified mixed WTOML+RVM provenance coverage through both graph object details and `/api/source`, with shared fields for file, spans, source language, source kind, transform ancestry, DESIRE node ids, DESIRE+ source node ids, and semantic targets.
- `[X]` the provenance milestone exit criteria are met through API/object-detail coverage plus source and primitive browser UI mode coverage; richer interactive RVM-specific UI workflows remain future UX hardening, not a blocker for generic provenance unification.

### 7. RVM Compatibility Compiler

Status: `[X]`

Add broad `RVM -> DESIRE+` ingestion for the checked-in `examples_rvm/` specimen families.

Prioritize:

- messages
- entities/version semantics
- process/value/event structures
- boundaries/contracts/queries/commands
- projection/store/context declarations

Then cover higher/runtime/surface authored forms sufficiently for ingestion and traceability.

Exit criteria:

- Checked-in RVM specimens compile into DESIRE+ successfully.
- Representative semantic families normalize into the expected DESIRE meaning.

Current state:

- `[X]` `compileRvmToDesirePlus` and `compileRvmFileToDesirePlus` are landed.
- `[X]` the checked-in `examples_rvm/` specimen set compiles successfully in `test/desire.test.js`.
- `[X]` semantic mapping now exists for contexts/`graph_context`, capabilities, messages, events, commands/queries, entities, versions, process/state forms, actor-backed durable stores, boundaries, read/write capability bindings, SBTP adapter blocks, policies, derives/projections, views/surfaces, and compact one-line semantic variants of context/graph_context/capability/entity/boundary/policy/process/state/event/command/query/adapter/derive/view.
- `[X]` RVM enum declarations now map to DESIRE `type` nodes with enum cases.
- `[X]` module blocks, `stdlib` directives, and comments are source/debug material in DESIRE+ instead of residual unknowns.
- `[X]` lowered Tiny/RVM implementation forms (`atom`, `map`, `witness`, `machine`) are classified as DESIRE+-only runtime residuals rather than candidates for the DESIRE kernel.
- `[X]` graph data forms (`graph_node`, `graph_edge`, `entity_type`, `edge_type`) now map to DESIRE+ semantic `graph` nodes and normalize into the DESIRE `graph` kernel.
- `[X]` conflict markers in historical backup specimens are classified as fixture corruption, reducing broad-audit unknown language forms to zero.
- `[X]` the covered RVM semantic core now runs through `DESIRE -> world` natively for contexts, capabilities, messages/events/commands/queries, entities, processes, actor-backed durable stores, boundaries, read/write bindings, adapter boundaries, policies, projections, surfaces, and the compact one-line semantic family.
- `[X]` checked-in authored/runtime/surface specimen coverage is now classified rather than approximate: supported semantic surfaces and graph forms normalize to DESIRE, source organization stays DESIRE+-only, lowered runtime forms stay DESIRE+-only, fixture corruption is explicit, and the broad audit enforces 0 unknown and 0 authored-runtime residuals.

### 8. DESIRE+ Serializers

Status: `[X]`

Add best-effort serializers:

- `DESIRE+ -> WTOML`
- `DESIRE+ -> RVM`

These are not exact textual reconstruction targets. The contract is normalized structural equivalence after re-import.

Round-trip expectations:

- `WTOML -> DESIRE+ -> WTOML-like -> DESIRE+`
- `RVM -> DESIRE+ -> RVM-like -> DESIRE+`

Exit criteria:

- Focused fixture coverage for both serializers.
- Round-trip tests pass at normalized equivalence level.

Current state:

- `[X]` `serializeDesirePlusToWtoml` is landed.
- `[X]` `serializeDesirePlusToRvm` is landed.
- `[X]` serializers now validate incoming `DESIRE+` documents before emission.
- `[X]` focused normalization-based round-trip tests exist for WTOML and RVM.
- `[X]` WTOML serialization covers the current WTOML DESIRE+ document payload subset and round-trips by normalized structure.
- `[X]` WTOML serialization now emits WTOML-like semantic fallback sections for RVM-backed DESIRE+ nodes across the common kernel subset, with normalized round-trip coverage.
- `[X]` WTOML semantic fallback serialization now expands RVM actor-derived store/projection semantics into first-class `[[store]]` and `[[projection]]` sections, preserving normalized equivalence.
- `[X]` WTOML semantic fallback serialization now emits `[[dataflow]]` sections and chart-specific `[[surface]]` payloads for RVM `model`/`chart` forms.
- `[X]` WTOML semantic fallback serialization now emits neutral `[[graph]]` sections for DESIRE+ graph semantics.
- `[X]` RVM serialization preserves raw authored source when available and reconstructs supported semantic forms when raw text is absent.
- `[X]` rawless RVM semantic fallback coverage now spans imports/modules, context/capability, messages/events/commands/queries, entity/version, process/state, boundary/read/write/adapter, policy, projection/view, surface/chart, dataflow/model, graph node/edge/schema forms, and actor-backed store forms.
- `[X]` serializers meet the milestone contract as best-effort debug/trace surfaces with normalized structural round-trip coverage; exact authored reconstruction remains intentionally out of scope, and unsupported runtime/lowered forms depend on retained raw source or a future runtime-boundary decision.

### 9. Legacy Path Demotion

Status: `[X]`

Once parity is established, remove or demote direct legacy execution paths that bypass DESIRE.

WTOML remains a source language, but no longer the semantic execution substrate.

Exit criteria:

- All in-repo parity tests run through DESIRE-backed execution.
- Old direct-doc execution is no longer the canonical path.

Current state:

- `[X]` WTOML entry flows already route through DESIRE internally.
- `[X]` `applyDesireNativeOnly` is now available for tests and new internal call sites that must prove no legacy runtime declaration fallback is required.
- `[X]` the legacy direct-doc applicator no longer exists as an independent execution substrate in `src/dsl.js`; `applyWitnessDocsLegacy` remains exported only as a compatibility alias that delegates to the DESIRE-backed `applyWitnessDocs`.
- `[X]` full CLI parity is green in this workspace after routing through DESIRE; the latest full `test/cli.test.js` run passed 13/13, including MCP stdio and maintained-demo serve startup.
- `[X]` repository search confirms no remaining direct-doc applicator helpers (`applyDoc`, `prepareRuntimeDocs`, direct `runtime.doc` execution substrate) outside explicit compatibility aliases and bridge-residual validation.

## Bridge Debt

New item raised by the current execution shape:

- `[X]` replace remaining WTOML-shaped runtime residual handling with richer first-class semantic/runtime boundary APIs: normalized `runtime.declaration` residuals now require `body.declaration`, and `applyDesire` consumes `declaration.kind` / `declaration.values` before compatibility aliases.
- `[X]` remove the `applyWitnessDocsLegacy` fallback from `applyDesire`; unknown runtime declarations now fail unless they are registered by core or plugin runtime declaration handlers.
- `[X]` demote `applyWitnessDocsLegacy` itself to the DESIRE-backed path so internal or external compatibility callers cannot bypass DESIRE through the old direct-doc implementation.
- `[X]` the residual runtime bridge is no longer mixed into `DESIRE.nodes` and normalized WTOML now uses `runtime.declaration`; runtime implementation material intentionally lives above the DESIRE kernel boundary.
- `[X]` remove `runtime.doc` emission for semantic WTOML doc kinds; native WTOML handlers now execute directly from DESIRE node bodies and preserve source annotations through generic DESIRE provenance.
- `[X]` decide the final boundary for residual runtime-only material: it remains DESIRE+-only source/debug/runtime material, while `runtime.doc` exists only as a transitional compatibility bridge and is explicitly marked non-kernel.
- `[X]` eliminate the remaining runtime declaration preparation debt: defaults are normalized before DESIRE application and context-derived actor lookup is native application behavior.
  - `[X]` `defaults` docs no longer require legacy execution
  - `[X]` WTOML source-local default propagation is now implemented in the DESIRE normalization layer
  - `[X]` context-derived actor lookup now happens inside native runtime declaration application instead of the bulk runtime declaration preparation prepass
  - `[X]` the application-time compatibility default pass for manually-authored bridge docs has been removed
- `[X]` replace contextual-ref-dependent runtime declarations with native DESIRE application paths so `serverRunnerRef`, `servesRef`, `rootWidgetRef`, `routeRef`, and related flows no longer require the legacy fallback.
  - `[X]` native support landed for context-scope operations and ref-based `serverRunner` / `mcpServer` / `route` / `serve` flows
  - `[X]` native support landed for widget/program authored refs including `parentRef` and `frontendProgram.rootWidgetRef`
  - `[X]` widget version and backend program/version authored flows now apply natively through DESIRE
- `[X]` remaining mainstream WTOML section kinds in `src/dsl.js` now have native DESIRE execution paths
- `[X]` remaining legacy-shaped behavior is concentrated in the residual runtime declaration bridge architecture itself, rather than in `applyWitnessDocsLegacy` fallback execution or the core authored WTOML surface.
- `[X]` static runtime declaration bridge audit now distinguishes first-class registered declaration kinds from unregistered or registered-without-handler declarations.
- `[X]` native-only DESIRE application now combines the static bridge audit with registry preflight, giving parity tests a direct API for proving they do not depend on unregistered runtime declarations.
- `[X]` checked-in WTOML example files are discovered recursively in tests and audit to 0 statically legacy-required runtime declaration kinds and 0 legacy `runtime.doc` residuals.
- `[X]` decide whether any runtime-only residual layer belongs below DESIRE or whether it should remain explicitly in DESIRE+ only.
- `[X]` remove `runtime.doc` from the effective kernel kind set and semantic node stream; normalized runtime material now uses `runtime.declaration` while legacy `runtime.doc` remains compatibility-only.

## Next Execution Slices

Use these as the near-term epic slices. Each slice should leave the tree runnable and should update this roadmap when it lands.

1. `[X]` RVM compact-form ingestion
   - Add semantic mapping for older one-line RVM forms that still compiled as unknown DESIRE+ nodes.
   - Covered context/graph_context, capability, entity, boundary, policy, process, state/value, event, command/query, adapter, derive, and view compact forms.
   - Verified representative compact forms normalize to first-class DESIRE nodes and apply natively through `DESIRE -> world`.

2. `[X]` Store model hardening
   - Promoted actor-backed durable stores from source/runtime metadata into native DESIRE `store` nodes.
   - Captured store context, stored entity, process ownership/dependency, and projection source-store edges.
   - Verified stores contribute meaningful inspect graph edges and native DESIRE application behavior.

3. `[X]` Runtime boundary cleanup
   - Decision landed: residual runtime-only material remains DESIRE+-only; `runtime.doc` is a transitional compatibility bridge, not a kernel resident.
   - Keep implementation wiring in DESIRE+ unless it has stable semantic meaning in DESIRE.
   - Exit when `runtime.doc` is no longer part of the effective DESIRE kernel.
   - Completed semantic WTOML cleanup: semantic WTOML doc kinds now lower directly to DESIRE and no longer produce bridge nodes.
   - Bridge metadata now records `compatibilityBridge`, `kernelResident = false`, `residualHome = "desire+"`, and source boundary categories for normalized runtime declarations.
  - Native-only application now rejects unsupported bridge residuals unless a core or plugin runtime declaration registry provides an apply handler, and supported bridge material runs without any legacy fallback.
   - Normalized WTOML runtime material now lives under `DESIRE.runtimeResiduals` as `runtime.declaration` instead of `DESIRE.nodes`; `DESIRE_NODE_KINDS` is kernel-only and legacy `runtime.doc` is compatibility-only.
   - Exit criteria met: `runtime.doc` is no longer part of the effective DESIRE kernel.

4. `[X]` Browser/API provenance proof
   - Add browser/API coverage that proves RVM-backed and WTOML-backed objects resolve through the same source provenance surface.
   - Preserve existing WTOML source-browser behavior.
   - Exit when `/api/source`, object details, and graph annotations are covered for both source languages.
   - Verified by a mixed WTOML+RVM inspect-stack test covering graph node `sources` and `/api/source` annotations for both languages.

5. `[X]` Serializer breadth pass
   - Expand `DESIRE+ -> WTOML/RVM` serializers beyond focused round-trip fixtures.
   - Preserve human-meaningful grouping where DESIRE+ retained it.
   - Exit when supported subsets round-trip by normalized structure across representative WTOML and RVM fixtures.
   - Covered broad RVM rawless semantic fallback, including `model`/`chart`, while preserving exact raw source when DESIRE+ retained it.
   - Exact textual reconstruction remains intentionally out of scope for this milestone.

6. `[X]` Lowered Tiny/RVM implementation-form decision
   - Decide whether high-volume lowered forms such as `atom`, `map`, `witness`, and `machine` should remain runtime/provenance-only DESIRE+ nodes or receive explicit semantic DESIRE mappings.
   - Treat `graph_node`, `graph_edge`, `entity_type`, and `edge_type` as a separate semantic graph-data question rather than mixing them into runtime implementation lowering.
   - Exit when the residual RVM unknown audit is split into intentional DESIRE+ runtime forms versus forms that still need semantic kernel coverage.
   - Initial decision landed: `atom`, `map`, `witness`, and `machine` remain DESIRE+-only lowered-runtime forms; graph-data forms were first isolated from runtime lowering rather than implicitly accepted.
   - Superseded by slice 9 for supported graph forms: `graph_node`, `graph_edge`, `entity_type`, and `edge_type` now normalize into DESIRE `graph` kernel nodes instead of remaining graph-data residuals.

7. `[X]` RVM fixture hygiene for conflict-marker residuals
   - The remaining generic unknown RVM audit rows are conflict markers inside history-backup specimen files.
   - Decide whether these backup specimens should be repaired, excluded from broad language audits, or retained as parser resilience fixtures.
   - Exit when the generic unknown count reflects real unsupported language forms rather than fixture corruption.
   - Decision landed: retain the corrupted backup specimens as parser resilience fixtures, but classify conflict-marker rows as DESIRE+ `fixture-corruption` outside the DESIRE boundary.
   - Verified broad audit now reports `0` unknown RVM language forms and `285` fixture-corruption rows.

8. `[X]` Strict runtime declaration registry
   - Removed DESIRE application fallback to `dsl.unknownSection` for unregistered runtime declarations.
   - Added an explicit runtime declaration registry API; core declarations are registered by default and plugins can register declaration handlers before application.
   - Audit now reports unsupported and registered-without-handler declaration counts instead of treating unknown kinds as native-covered.
   - Verified unregistered declarations fail with file/line/source diagnostics, registered plugin handlers apply, and registered declarations without handlers fail explicitly.

9. `[X]` DESIRE graph kernel and plugin-owned read models
   - Added `graph` as a DESIRE kernel and DESIRE+ semantic kind.
   - RVM graph forms now compile to semantic graph nodes, normalize into DESIRE, apply natively as graph witnesses/relations, and expose source provenance through inspect APIs.
   - DESIRE+ serializers round-trip graph semantics through RVM-like graph forms and WTOML-like neutral `[[graph]]` sections.
   - Active plugin providers now own optional module/read-model projectors; `plugin.assets` provides the real `assets` and `assetIndex` projections, while core keeps only empty delegated fallbacks.
   - Duplicate active projector providers fail before startup mutation, and runtime server startup cleans active projector registrations on close/failure.

10. `[X]` Scoped plugin read-model registrations
   - `registerModuleProjectors` now returns token-scoped, idempotent cleanup handles.
   - Concurrent servers/tests may register the same projector name when they provide the same implementation function; cleanup from one registration no longer removes another active registration.
   - Different active implementations for the same projector name still fail clearly because the current `moduleProjectors.*(witnesses)` API has no world/server-local projector context.

11. `[X]` Active plugin-loaded DESIRE extensions
   - Active plugin-owned `runtime.js` modules can export `desireExtensions.elaborators` and `desireExtensions.runtimeDeclarations`.
   - Extension-only plugin runtimes are valid even when they do not activate runtime bundles.
   - Duplicate active elaborator ids or runtime declaration kinds fail during plugin loading before world mutation.
   - Verified authored WTOML `runtimePluginInstall` can activate a plugin runtime declaration handler during plugin-aware DESIRE loading.

## Delivery Order

1. `[X]` Land DESIRE and DESIRE+ IR definitions, ids, validation, and utilities.
2. `[X]` Land native `DESIRE -> world` application.
3. `[X]` Land `DESIRE+ -> DESIRE` normalization.
4. `[X]` Land `WTOML -> DESIRE+` compilation and switch internal runtime loading.
5. `[X]` Re-baseline WTOML parity tests on the DESIRE pipeline.
6. `[X]` Land generic provenance and browser/source integration.
7. `[X]` Land `RVM -> DESIRE+` ingestion.
8. `[X]` Land `DESIRE+ -> WTOML/RVM` serializers and round-trip tests.
9. `[X]` Demote old direct execution paths after parity confidence is high.

## Test Matrix

- Kernel validation tests for every DESIRE kind.
- Normalization equivalence tests across multiple source shapes.
- WTOML parity tests for demos/examples through the DESIRE pipeline.
- CLI regression tests for `serve`, `bootstrap`, and `mcp` flows.
- Runtime-server regression tests for plugin-selected host capability installation before startup validation.
- Provenance tests for file/spans/source language/ancestry exposure.
- RVM ingestion coverage tests for checked-in specimens.
- Round-trip normalization tests for WTOML-like and RVM-like serializers.

## Related Docs

- [Overview](C:\Users\aaron\Documents\world\docs\experiment\new-desire\README.md)
- [DESIRE Kernel](C:\Users\aaron\Documents\world\docs\experiment\new-desire\DESIRE-KERNEL.md)
