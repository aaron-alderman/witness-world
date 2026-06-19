# Group A - Composition Core

`/goal` Express composition, naming, authority, and reusable package or plugin authorship through first-class platform nouns, while aggressively resisting global-id shortcuts, hidden JS semantics, and fake merge simplicity.

This group combines tranche 1 and tranche 2:

- capability core and composition
- context, identity, and authority
- plugin or package authoring model
- contextual naming and authority convergence

## Mission

Make the platform's compositional units real enough that a world can declare:

- what capabilities exist
- where they are installed
- who may mutate them
- how names resolve
- how package or plugin changes are authored and merged

without falling back to hidden runtime conventions.

## End-State

Group A is done when all of the following are true:

- capabilities are first-class authored objects with clean install, remove, update, and compatibility semantics
- context is the normal boundary for names, ownership, import/export, and local meaning
- authority and proposal flows cover all important mutation surfaces
- legacy capability-string and broad canonical-id compatibility paths are either removed or explicitly fenced
- plugin or package authoring has a first-class authored story instead of being only a filesystem side channel
- the system can explain competing or concurrent authored changes without hand-wavy merge magic

## Non-Goals

- inventing a remote app store before local composition is coherent
- adding more hidden host shortcuts for app semantics
- collapsing all naming into one global id soup

## Guardrails For New Contributors

This group is where a conventional software engineer is most likely to make a mess by reaching for normal application architecture.

The most dangerous shortcuts here are:

- inventing a global registry because contextual naming feels inconvenient
- adding one more id-based escape hatch because contextual resolution is incomplete
- encoding capability semantics in host JS because the authored model feels slower
- treating plugin authorship as a filesystem convention only
- resolving merge pressure by destructive overwrite instead of explicit coexistence and convergence

### Hard Rules

- if a new reusable concept appears, first ask whether it needs an authored noun
- if a name resolves differently by place or owner, model the context rule instead of hiding it in lookup code
- if authority matters, use the shared authority or proposal path rather than a route-local check
- if compatibility sugar is required, label it as sugar and add a path off it
- if plugin or package behavior is introduced, keep the authorship and emitted bundle inspectable

### Anti-Cheat Tests

Do not accept a slice as done if it only works because:

- a canonical id was smuggled through instead of contextual resolution
- a capability definition was synthesized implicitly with no migration path
- an install succeeded without explicit compatibility reasoning
- a mutating route bypassed proposal fallback because "the UI already checked"
- a patch or package format cannot explain concurrent or conflicting authored changes

## Workstreams

### A1. Capability Object Maturity

Move from first-class capability definitions to a real lifecycle:

- authored create
- install
- remove
- replace
- update
- compatibility evaluation
- migration from old forms

### A2. Context As Real Boundary

Finish the move from "some contextual refs exist" to "context is how names and local composition work."

### A3. Unified Authority and Proposal Execution

Bring the remaining app-specific and operating-surface mutations under one shared authority and proposal path.

### A4. Package or Plugin Authorship Model

Decide and implement the authored unit for reusable composition.

Reference design:

- [docs/PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md](../PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md)

Candidate direction suggested by current discussion:

- plugin authorship happens through MCP
- authoring produces a canonical `wtoml` patch bundle
- bundle entries are deterministically ordered
- concurrent revisions can coexist under different identities or namespaces
- runtime can choose side A or side B while a later transformer or merge resolves them

This direction is not shipped.
It needs an explicit design and execution path.

### A5. Merge, Namespace, and Convergence Semantics

If patch-first authorship is chosen, the platform needs a truthful story for:

- concurrent authorship
- collision detection
- coexistence under namespace or identity splits
- later convergence through an explicit transformer

## Ordered Execution Ladder

### Stage A0. Stabilize Current Honesty Floor

Objective:
Do not let placeholder composition paths calcify while new work lands.

Slices:

- tag and inventory every remaining legacy capability-string synthesis path
- tag and inventory every remaining canonical-id compatibility path
- tag every mutation route not yet using shared authority derivation
- publish one compatibility ledger projection so these bridges are inspectable

Done when:

- every bridge has one named owner
- every bridge is reachable in diagnostics or an inspector surface
- no new bridge lands without documentation

Current proof:

- `src/compatibility-bridges.js` now remains the source-of-truth ledger for known composition shortcuts, while `plugins/bootstrap/bootstrap-read-models.js` publishes projected `compatibilityBridges` rows directly in bootstrap state instead of leaving the inventory trapped in internal diagnostics only
- `plugins/bootstrap/bootstrap-live-state.js` now exposes `compatibilityBridgeRows()` and `plugins/mcp/mcp-tools.js` now advertises explicit `platform.read(view="bridges")` and `platform.read(view="governance")` surfaces, so operator and MCP-facing reads can inspect bridge policy status without reaching into hidden JS seams
- `plugins/bootstrap/bootstrap-live-state.test.js`, `test/bootstrap-host.test.js`, and `plugins/mcp/mcp.test.js` prove the bridge ledger is present in live bootstrap readers, bootstrap HTTP state, and the constrained MCP read catalog end to end

### Stage A1. Finish Capability Lifecycle Semantics

Objective:
Capabilities stop being just installable nouns and become maintainable product units.

Slices:

#### A1.1 Capability version and compatibility contract

Implementation:

- define the authored compatibility fields beyond facet presence
- include minimum runtime profile, authority assumptions, dependency constraints, and migration notes
- add a compatibility evaluator with machine-readable reasons

Acceptance:

- install attempts can fail with specific structured reasons
- review surfaces show why a capability can or cannot land
- tests cover valid, blocked, incompatible, and replaceable installs

Current proof:

- `src/capability-compatibility.js` now defines a first-class capability compatibility contract with explicit `minimumRuntimeProfile`, `authorityAssumptions`, `dependencyConstraints`, and `migrationNotes` fields plus a shared evaluator that returns machine-readable `compatible`, `blocked`, and `incompatible` reason codes instead of leaving installability policy split across ad hoc route logic
- `src/modules.js`, `src/desire/apply.js`, `src/desire/wtoml.js`, and `src/desire/normalize.js` now preserve authored capability compatibility metadata through the witnessed capability definition path, so WTOML-backed capability nouns can carry the same installability contract as direct authoring requests
- `plugins/capability-authoring/capability-processes.js` now routes capability install gating through the shared evaluator and emits structured compatibility payloads on failure, while `src/runtime-builtins.js` exposes `compatibilityJson` on `capability.define` so the typed authoring seam can carry the authored contract directly
- `test/capability-compatibility.test.js`, `plugins/capability-authoring/capability-authoring.test.js`, and `test/dsl.test.js` prove compatible, blocked, and incompatible evaluator outcomes, persisted compatibility contracts on authored capability definitions, structured install failure reasons, and WTOML preservation of the new capability compatibility fields end to end

#### A1.2 Capability update and replacement flow

Implementation:

- add explicit update intent instead of remove-plus-install as hidden policy
- define replace semantics for same capability id, new revision
- define downgrade or rollback semantics

Acceptance:

- a capability revision change is visible as its own witnessed operation
- dependency and authority checks run before the switch
- rollback is explicit, not a manual repair ritual

Current proof:

- `src/modules.js` already carried first-class `updateCapability` and `rollbackCapability` witness forms plus `capabilityRevisionHistory` projection, and `plugins/capability-authoring/capability-processes.js` now lifts those into explicit governed `requestBootstrapCapabilityUpdate` and `requestBootstrapCapabilityRollback` flows instead of leaving revision replacement as hidden remove-plus-install policy
- `plugins/capability-authoring/capability-authoring-handlers.js`, `plugins/capability-authoring/capability-proposal-targets.js`, `plugins/capability-authoring/runtime.js`, `plugins/proposals/proposal-executor.js`, `src/runtime-governance.js`, `src/runtime-authoring-policy.js`, and `src/runtime-builtins.js` now expose `capability.update` and `capability.rollback` through the shared authority, proposal, typed-validation, and MCP-only authoring lanes, including proposal fallback for unauthorized signed-in actors
- update and rollback now re-check current installs against the candidate definition before switching, so dependency and placement regressions fail explicitly instead of silently stranding installed capability targets
- `plugins/bootstrap/bootstrap-read-models.js`, `plugins/bootstrap/bootstrap-live-state.js`, `plugins/platform/platform-model.js`, and `plugins/mcp/mcp-tools.js` now surface `capabilityRevisionHistory` as a readable first-class review slice across bootstrap, platform-model, and constrained MCP reads rather than hiding revision history inside internal projectors
- `plugins/capability-authoring/capability-authoring.test.js`, `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, `plugins/platform/platform.test.js`, `plugins/mcp/mcp.test.js`, and `test/runtime-governance.test.js` prove direct update and rollback helpers, proposal fallback and approved execution, install-compatibility blocking before revision switches, projected revision-history reads, and governance wiring end to end

#### A1.3 Migrate off placeholder legacy capability synthesis

Implementation:

- introduce a migration writer from legacy `context.capabilities` and host strings into real capability objects plus installs
- surface migration preview before commit
- allow compatibility read mode until migration is complete

Acceptance:

- old worlds can be upgraded through an authored path
- projection-only placeholder capability objects stop being required for normal operation

Current proof:

- `src/capability-legacy-migration.js` now defines first-class preview and apply helpers for legacy capability bridges, including pending `definition.create`, `definition.update`, and `install.explicit` actions plus a readable compatibility mode that stays `bridge-active` until all placeholder capability and legacy install rows are retired
- `plugins/capability-authoring/capability-processes.js`, `plugins/capability-authoring/capability-authoring-handlers.js`, `plugins/capability-authoring/capability-proposal-targets.js`, `plugins/capability-authoring/runtime.js`, `plugins/proposals/proposal-executor.js`, `src/runtime-governance.js`, and `src/runtime-authoring-policy.js` now expose that migration through explicit governed `capability.migrateLegacy` authoring instead of leaving old worlds to rely on hidden projection-only compatibility paths
- `plugins/bootstrap/bootstrap-read-models.js`, `plugins/bootstrap/bootstrap-live-state.js`, and `plugins/mcp/mcp-tools.js` now surface both `legacyCapabilityCompatibilityMode` and `legacyCapabilityMigration` as first-class read state, so operators and MCP clients can inspect bridge-active versus first-class-only status and preview pending migration rows before committing the authored rewrite
- `test/capability-legacy-migration.test.js`, `plugins/capability-authoring/capability-authoring.test.js`, `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, `plugins/mcp/mcp.test.js`, and `test/runtime-governance.test.js` prove migration preview, authored rewrite, proposal fallback and approved execution, bootstrap and MCP inspection surfaces, and governance coverage end to end

### Stage A2. Make Context The Default Naming System

Objective:
Names become local, inspectable, and composable.

Slices:

#### A2.1 Extend contextual ref lowering across all core authoring nouns

Implementation:

- enumerate all remaining authored reference fields
- add contextual resolution and visibility checks to each
- keep canonical ids only where explicitly justified

Acceptance:

- new authoring flows default to contextual references
- foreign targets require explicit visibility
- tests cover local, imported, hidden, and ambiguous names

Current proof:

- `plugins/authoring-core/authoring-core-processes.js`, `plugins/capability-authoring/capability-processes.js`, `plugins/server-runner-authoring/server-runner-processes.js`, and `plugins/program-authoring/program-processes.js` already lower covered authoring refs through the shared contextual visibility lane, and `plugins/authoring-core/authoring-core.test.js`, `plugins/capability-authoring/capability-authoring.test.js`, `plugins/server-runner-authoring/server-runner-authoring.test.js`, and `plugins/program-authoring/program-authoring.test.js` prove imported, hidden, and ambiguous behavior across package, capability, server-runner, route/serve, widget, and frontend/backend program authoring routes
- `plugins/authoring-core/authoring-core-processes.js` now also lowers `route.define` frontend-program, default-root-widget, and nested `routeState` process/state refs through the same covered contextual lane instead of leaving those route semantics on raw canonical-id strings, with `test/surface-authoring.test.js` proving imported names resolve and hidden canonical targets are rejected on the HTTP authoring path
- `src/desire/apply.js` now brings the native WTOML / DESIRE apply path onto the same explicit covered-ref contract for `frontendProgram`, `serverRunner`, `capabilityInstall`, `capabilityRemove`, `stewardship`, route frontend/default-root-widget refs, route-state process/state refs, and proposal target refs, instead of leaving those authored nouns on an older generic resolver lane
- `plugins/bootstrap/bootstrap-app-authoring-controls.wtoml`, `plugins/bootstrap/bootstrap-route-authoring-contracts.wtoml`, `plugins/bootstrap/bootstrap-app-authoring-submit*.js`, and `plugins/bootstrap/bootstrap-shell-render-view.js` now expose route frontend-program refs plus explicit route-state process/state authoring fields in the bootstrap product surface, so operator-facing route authoring can express contextual naming instead of falling back to canonical-id-only route params
- `dsl.source.annotate` witnesses now carry first-class `refResolutions` evidence for those covered native declarations, so the authored source record can explain which contextual or canonical lane resolved a dependency instead of hiding that decision inside JS helpers
- `test/dsl.test.js`, `test/desire.test.js`, and `test/modules.test.js` prove the native apply path now lowers imported refs for route frontend programs, default root widgets, route-state process/state targets, root widgets, backend/frontend hosts, capability targets, stewardship targets, and proposal targets while still rejecting hidden foreign canonical targets and surfacing explicit canonical-id policy classes

#### A2.2 Context read models become explanation surfaces

Implementation:

- add projections for local bindings, imports, exports, shadowing, and conflicts
- add "why this name resolves here" inspection
- add "why this target is not visible" diagnostics

Acceptance:

- a user can explain any contextual reference from product surfaces
- name collision cases are visible before mutation

Current proof:

- `src/context-naming-world.js` now projects first-class explanation state instead of leaving contextual visibility inside lowering helpers only: `contextBindings`, `contextExports`, `contextImports`, `contextScopes`, `contextualTargets`, `contextNameResolutions`, and `contextNameConflicts` sit alongside explicit `nameExplanation`, `targetVisibility`, and `canonicalIdPolicy` answers for a requested context, name, or target
- `plugins/platform/platform-model.js` now exposes that explanation surface through `platform.read(view="contextNaming")`, and `plugins/mcp/mcp-tools.js` mirrors the same projection through both `world.read(view="contextNaming")` and `platform.read(view="contextNaming")` instead of forcing callers to infer resolution behavior from authoring failures
- `plugins/platform/platform.test.js` and `plugins/mcp/mcp.test.js` prove product-facing contextual reads can show bindings, imports, visible scope, conflicts, ambiguous name resolution, hidden-target visibility failures, and canonical-id policy classification directly from the projected world state
- `plugins/bootstrap/bootstrap-read-models.js`, `plugins/bootstrap/bootstrap-live-state.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, and `test/bootstrap-host.test.js` keep the canonical-id policy classes inspectable from bootstrap state as well, so the explanation surface remains visible to operator-facing product seams without reaching into validator internals

#### A2.3 Decide the long-term role of canonical-id sugar

Implementation:

- split canonical-id usage into allowed classes:
  - same-context convenience
  - imported-target reference
  - legacy-only path
- choose which remain permanent and which are deprecation-only

Acceptance:

- policy is explicit in docs and validation
- compatibility sugar stops expanding accidentally

Current proof:

- canonical-id compatibility classes are now enforced through shared covered-target helpers for stewardship and capability mutation seams, with `plugins/authoring-core/authoring-core.test.js` and `plugins/capability-authoring/capability-authoring.test.js` proving same-context, imported-visible, legacy-unscoped, and hidden-foreign target behavior instead of letting those routes inherit an implicit “all canonical ids are fine” default

- package authorship now uses the same contextual-ref lane for `packageRevision`, `packageRevision.publish`, `packagePatch`, `packageNamespace`, `packageDependency`, and `packageTransformer` references in `plugins/authoring-core/authoring-core-processes.js`, `plugins/authoring-core/authoring-core-handlers.js`, and `plugins/authoring-core/authoring-core-proposal-targets.js`, with `plugins/authoring-core/authoring-core.test.js` covering local, imported, hidden, and ambiguous package-noun reference behavior plus pre-authority lowering for handler and proposal execution paths

- canonical-id compatibility classes are now explicit product state instead of code-only constants: `plugins/bootstrap/bootstrap-read-models.js` publishes the allowed class list in bootstrap state, `plugins/bootstrap/bootstrap-live-state.js` exposes `canonicalIdPolicyClasses()` and `classifyCanonicalIdPolicy(...)`, and `plugins/bootstrap/bootstrap-live-state.test.js` plus `test/bootstrap-host.test.js` prove same-context, imported, legacy, and hidden cases are inspectable without reading validator internals

### Stage A3. Unify Authority and Proposal Coverage

Objective:
Mutation governance stops being route-by-route folklore.

Slices:

#### A3.1 Route inventory and normalization

Implementation:

- list every mutating route and command surface
- classify each as direct-authority, proposal-fallback, operator-only, or missing
- normalize request and execution helpers

Acceptance:

- no mutating route is uncategorized
- shared helpers own the evaluation path

Current proof:

- `src/runtime-governance.js` now remains the shared source of truth for mutating-route governance classes, and `test/runtime-governance.test.js` proves every potentially mutating runtime handler across bundled and plugin routes is either classified as `direct-authority`, `proposal-fallback`, or `operator-only`, with missing annotations failing the inventory check
- `src/runtime-bundles.js`, `plugins/platform/platform-model.js`, and `plugins/mcp/mcp-tools.js` now project that same ledger into runtime diagnostics plus first-class `platform.read(view="governance")` inspection, so route and proposal-target coverage are inspectable without reverse-engineering handler code
- `plugins/bootstrap/bootstrap-read-models.js` and `plugins/bootstrap/bootstrap-live-state.js` now publish the same `governanceRoutes` and `proposalTargetGovernance` rows into bootstrap state and browser-side live readers, with `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, and `test/bootstrap-host.test.js` proving operator-facing bootstrap surfaces can inspect the shared governance inventory directly

#### A3.2 Proposal support for remaining high-value surfaces

Priority order:

1. remaining widget and version operations
2. remaining app CRUD surfaces
3. remaining canvas or asset mutations
4. runtime-plugin and MCP mutations not yet fully parallel to direct execution

Acceptance:

- unauthorized signed-in users create real proposals instead of dead-end failures
- approved proposals execute through the same helpers as direct writes

Current proof:

- remaining widget and app-composition CRUD lanes now route unauthorized signed-in actors toward real proposals through the shared authoring seams in `plugins/authoring-core/authoring-core-handlers.js` and `plugins/program-authoring/program-authoring-handlers.js`, with `plugins/authoring-core/authoring-core.test.js` covering widget plus route and serve proposal fallback and `plugins/program-authoring/program-authoring.test.js` covering backend-program version activate and rollback proposal fallback plus approved execution through shared helpers
- legacy frontend retirement no longer depends on privileged `page.home` host behavior: `src/frontend-legacy-migration.js` and `src/legacy-frontend-bridge.js` now define deterministic preview and apply helpers that re-home legacy widget and frontend-program routes onto canonical `page.surface` surfaces with explicit `compat.legacy-widget-program` capability refs and inspectable legacy props instead of hidden route-local JS semantics
- `plugins/authoring-core/authoring-core-processes.js`, `plugins/authoring-core/authoring-core-handlers.js`, `plugins/authoring-core/authoring-core-proposal-targets.js`, `plugins/proposals/proposal-executor.js`, `src/runtime-governance.js`, `plugins/bootstrap/bootstrap-read-models.js`, `plugins/bootstrap/bootstrap-live-state.js`, `plugins/mcp/mcp-tools.js`, and `src/runtime-core-handlers.js` now expose the governed `frontend.migrateLegacy` write path, `POST /api/frontend-migrations/legacy`, readable `frontendLegacyMigration` state, active compatibility-bridge ledger rows, and one shared render bridge for both migrated `page.surface` routes and the remaining `page.home` shim; `test/frontend-legacy-migration.test.js`, `test/runtime-core-legacy-frontend.test.js`, `plugins/authoring-core/authoring-core.test.js`, `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/mcp/mcp.test.js`, and `test/runtime-governance.test.js` prove preview, rewrite, idempotence, proposal fallback, constrained reads, and render-path parity end to end
- widget version operations are no longer review-only folklore in product surfaces: `plugins/inspect/runtime.js` now proposes `widgetVersion.activate` and `widgetVersion.rollback` through the same proposal lane, while `test/bootstrap-host.test.js`, `test/host.test.js`, `plugins/inspect/inspect.test.js`, and `test/ui.live-inspector.test.js` prove read-only shared widget version changes create real proposals and apply only after authorized approval
- remaining canvas and asset shared mutations now follow the same rule, with `plugins/assets/handlers.js` returning proposals for unauthorized asset attach and detach requests and shared canvas proposal targets executing through `plugins/proposals/proposal-executor.js`; `test/canvas-host.test.js` and `test/runtime-authoring-services.test.js` prove proposal fallback and approved execution for asset attachment, scoped perspective creation, canvas thing mutation, batch mutation, duplicate or removeMany, and place operations
- runtime-plugin and MCP mutation surfaces now stay parallel to direct execution under the governed authoring path in `plugins/server-runner-authoring/*` and `plugins/mcp-authoring/*`, with `plugins/server-runner-authoring/server-runner-authoring.test.js`, `plugins/mcp-authoring/mcp-authoring.test.js`, `test/runtime-authoring-services.test.js`, `test/bootstrap-host.test.js`, and `test/ui.bootstrap.test.js` proving unauthorized actors receive proposals for `runtimePlugin.install`, `runtimePlugin.remove`, `mcpServer.create`, `mcpTool.install`, and `mcpTool.remove`, and that approved proposals execute through the shared bootstrap proposal executor instead of a separate write path
- generic bootstrap proposal authoring no longer treats package authorship as anonymous JSON: `plugins/bootstrap/bootstrap-version-guidance.js` now validates and summarizes `package.define`, `packageRevision.define`, `packageRevision.publish`, `packagePatch.define`, `packageNamespace.define`, `packageDependency.define`, and `packageTransformer.define` against the authored package nouns exposed in bootstrap state, with `plugins/bootstrap/bootstrap-version-guidance.test.js` proving package proposals now explain authority, target shape, and required body fields through the same shared proposal-help seam

#### A3.3 Personal versus shared semantics contract

Implementation:

- formalize actor-scoped, perspective-scoped, and context-shared state classes
- unify private notes, theme, session defaults, and future actor projections under one contract

Acceptance:

- each mutable surface declares whether it is shared, personal, or mixed
- witness visibility and authority rules match that declaration

Current proof:

- `src/runtime-semantics.js` now publishes a first-class mutable-surface semantics ledger that classifies runtime session state, demo private notes, Eden page theme state, shared demo todos, and canvas perspectives across `personal`, `shared`, and `mixed` sharing classes with explicit `actor-scoped`, `perspective-scoped`, and `context-shared` state classes
- `plugins/platform/platform-model.js` and `plugins/mcp/mcp-tools.js` now expose that contract directly through `platform.read(view="semantics")`, and `plugins/platform/platform.test.js`, `plugins/mcp/mcp.test.js`, and `test/runtime-semantics.test.js` prove the shared read surface carries the semantics inventory instead of leaving those authority and visibility rules implicit inside app-specific projections

### Stage A4. Plugin or Package Authorship Model

Objective:
Reusable composition becomes expressible through the platform itself.

Decision question:

Should the reusable unit be expressed as:

- manifest plus filesystem package
- patch-first package revision
- authored object model that lowers to patch bundles

Recommended sequence:

#### A4.1 Define the authored nouns

Possible nouns:

- `package`
- `packageRevision`
- `packagePatch`
- `packageNamespace`
- `packageDependency`

Acceptance:

- the model can represent a reusable unit without assuming an external toolchain first

Current proof:

- first-class world nouns now exist on the shared witnessed path in `src/modules.js` and `src/desire/apply.js`, with `test/package-authorship-world.test.js` covering authored `package`, `packageRevision`, `packagePatch`, `packageNamespace`, and `packageDependency` WTOML declarations plus projection into canonical bundle serialization inputs
- authored `package` nouns now also retain their defining context on the witnessed path through `src/modules.js`, `plugins/authoring-core/authoring-core-processes.js`, and `src/desire/apply.js`, with `test/package-authorship-world.test.js`, `plugins/authoring-core/authoring-core.test.js`, and `plugins/bootstrap/bootstrap-version-guidance.test.js` proving package authority and proposal guidance no longer need to recover package scope through indirect global-id heuristics
- `plugins/bootstrap/bootstrap-read-models.js` and `plugins/bootstrap/bootstrap-live-state.js` now publish those authored package nouns directly into bootstrap state and browser-side live readers as `packages`, `packageRevisions`, `packagePatches`, `packageNamespaces`, `packageDependencies`, and `packageTransformers`, with `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, and `test/bootstrap-host.test.js` proving operator-facing bootstrap seams can inspect package authorship without reaching into hidden projectors
- `plugins/bootstrap/bootstrap-state-list-render.js` and `plugins/bootstrap/bootstrap-page-main.wtoml` now render those same package nouns into the visible bootstrap authored-state inventory, with `plugins/bootstrap/bootstrap-state-list-render.test.js`, `plugins/bootstrap/bootstrap-page-main.test.js`, and `test/ui.bootstrap.test.js` proving package authorship is product-visible in the operator UI instead of API-visible only
- those same authored package nouns now also participate in the generic bootstrap composition model through `contextBindableTargets`, so product-facing context binding and export/import controls can name package, revision, patch, namespace, dependency, and transformer nouns as first-class targets instead of leaving package authorship trapped in package-specific routes only

#### A4.2 Canonical bundle format

Implementation:

- choose canonical `wtoml` ordering rules
- define stable serialization
- define content-addressed or UUID-addressed entries where needed
- define how metadata, manifests, and patches coexist

Acceptance:

- two identical authored revisions serialize identically
- diff and patch review are deterministic

Current proof:

- a first prototype now exists in `src/package-authorship.js`, with `test/package-authorship.test.js` covering canonical `package` / `packageRevision` / `packagePatch` WTOML serialization, content-addressed patch ids, normalized bundle paths, deterministic file ordering, revision-scoped `packageNamespace` and `packageDependency` bundle entries, and stable bundle hashing across reordered inputs

#### A4.3 MCP-mediated authorship flow

Implementation:

- define MCP tool contracts for create package, emit patch, preview apply, and publish revision
- scope those tools through existing authority and install rules
- ensure emitted output is inspectable and replayable

Acceptance:

- plugin authorship can happen through the explicit MCP seam
- MCP is not bypassing the normal world model

Current proof:

- proposal-backed package authoring now runs on the shared authority lane in `plugins/authoring-core/authoring-core-processes.js`, `plugins/authoring-core/authoring-core-handlers.js`, `plugins/authoring-core/authoring-core-proposal-targets.js`, and `plugins/proposals/proposal-executor.js`, with `plugins/authoring-core/authoring-core.test.js` covering proposal fallback and approved execution for `package`, `packageRevision`, `packageRevision.publish`, `packagePatch`, `packageNamespace`, and `packageDependency`
- the constrained MCP seam now exposes those authored package nouns directly through `plugins/mcp/mcp-tools.js` `authoring.write` actions for `package.create`, `packageRevision.create`, `packageRevision.publish`, `packagePatch.create`, `packageNamespace.create`, `packageDependency.create`, and `packageTransformer.create`, with `plugins/mcp/mcp.test.js` covering package-aware scope extraction and routing to the shared package handlers
- the constrained MCP seam now also exposes `package.bundle` `preview` and `previewApply` for authored revisions, backed by `src/package-authorship-world.js` projection of live world state into canonical bundle output plus package coexistence and convergence impact, with `plugins/mcp/mcp.test.js` covering inspectable preview of emitted `package`, `packageRevision`, `packagePatch`, `packageNamespace`, `packageDependency`, and `packageTransformer` documents, including namespace docs referenced by included transformers and blocked manifest-collision truth instead of fake merge collapse, without bypassing the normal witnessed model
- package revision apply preview is now also a first-class review noun instead of an MCP-only payload: `plugins/platform/platform-model.js`, `plugins/platform/platform-page.js`, and `plugins/platform/platform-console.rvm` project and route `packageApplyPreview` rows through `platform.read(view="packageApplyPreview")`, while `plugins/mcp/mcp-tools.js` mirrors the same projected truth through `world.read(view="packageApplyPreview")`
- runner-scoped versus profile-scoped runtime composition is now explicitly covered in `test/runtime-multihost-host.test.js`, proving authored plugin bundle endpoints stay mounted only on the host that installs them while profile-activated bundle endpoints like `/_bootstrap` remain mounted on every host in the same multi-runner process

### Stage A5. Namespace and Merge Convergence

Objective:
Concurrent authored changes become composable instead of destructive by default.

Slices:

#### A5.1 Divergent revision coexistence

Implementation:

- allow two conflicting revisions to exist under distinct identities
- let runtime selection choose one branch explicitly
- record the coexistence instead of forcing premature collapse

Acceptance:

- conflict does not require immediate destructive resolution
- runtime and review surfaces can show branch A and branch B

Current proof:

- `src/modules.js` now projects first-class `packageCoexistence` and `packageCoexistenceIndex` rows from authored `package`, `packageRevision`, and `packageNamespace` nouns, so divergent revisions stay inspectable instead of collapsing into fake merge state
- `plugins/platform/platform-model.js` now also lifts `packagePatch`, `packageDependency`, and `packageConvergence` into explicit platform nodes and relationships, while `plugins/platform/platform-page.js` routes bridge, governance, semantics, and package authorship ids toward their dedicated platform views instead of flattening them back into generic model links
- `plugins/platform/platform-model.js` now models package coexistence, revision, and namespace nodes and exposes a dedicated `packageCoexistence` review view for branch A and branch B inspection
- `plugins/mcp/mcp-tools.js` now exposes the same authored coexistence projection through `world.read(view="packageCoexistence")` and `platform.read(view="packageCoexistence")`, keeping runtime-adjacent and review-adjacent reads on the same witnessed truth
- `plugins/bootstrap/bootstrap-read-models.js` and `plugins/bootstrap/bootstrap-live-state.js` now also expose `packageCoexistence` rows in bootstrap state and live readers, with `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, and `test/bootstrap-host.test.js` proving the operator-facing bootstrap seam can inspect divergent authored lines alongside the existing platform and MCP review surfaces
- the visible bootstrap authored-state inventory now also renders `packageCoexistence` rows directly through `plugins/bootstrap/bootstrap-state-list-render.js` and `plugins/bootstrap/bootstrap-page-main.wtoml`, with `test/ui.bootstrap.test.js` proving branch selection facts are inspectable in the product UI instead of only through API/state dumps
- `test/package-authorship-world.test.js`, `plugins/platform/platform.test.js`, `plugins/platform/platform-package-nouns.test.js`, `plugins/mcp/mcp.test.js`, `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, and `test/bootstrap-host.test.js` cover divergent revisions selected by separate namespace bindings and assert the surfaced coexistence, convergence, and page-routed package nouns remain inspectable end to end

#### A5.2 Transformer-based convergence

Implementation:

- define a first transformer contract for mapping one namespace or revision space into another
- allow authored convergence patches
- show which glue remains because references are not yet zero or unified

Acceptance:

- convergence work is explicit and inspectable
- the system can explain when glue is still required

Current proof:

- `src/modules.js` now defines first-class `packageTransformer` nouns plus `packageConvergence` projections, so authored revision or namespace mapping contracts and their remaining glue stay visible instead of hiding inside fake merge semantics
- `src/package-authorship.js`, `src/package-authorship-world.js`, and `src/desire/apply.js` now carry transformer-linked package patches through canonical bundle materialization and WTOML lowering, including namespace-scoped transformers that touch the selected revision namespace, so authored convergence patches and their transformer contracts stay part of the same inspectable package surface instead of falling back to revision-only lookup shortcuts
- `plugins/authoring-core/*`, `src/runtime-governance.js`, and `src/runtime-authoring-policy.js` now expose `packageTransformer.create` and `packageTransformer.define` through the shared governed authoring path rather than bespoke side channels
- `plugins/platform/platform-model.js`, `plugins/platform/platform-page.js`, and `plugins/mcp/mcp-tools.js` now expose `packageConvergence` and revision-scoped `packageApplyPreview` reads alongside package coexistence, including explicit remaining-glue explanations, blocked manifest-collision truth, and unplanned-versus-converging status instead of flattening divergent lines into fake merge simplicity
- `plugins/bootstrap/bootstrap-read-models.js` and `plugins/bootstrap/bootstrap-live-state.js` now surface `packageConvergence` and `packageApplyPreviews` alongside the raw package nouns in bootstrap state, so operator-facing bootstrap seams can inspect remaining glue and revision apply truth without detouring through MCP or platform-only views
- those same convergence and apply-preview rows now render in the visible bootstrap authored-state inventory through `plugins/bootstrap/bootstrap-state-list-render.js` and `plugins/bootstrap/bootstrap-page-main.wtoml`, with `test/ui.bootstrap.test.js` proving remaining glue and revision apply status are product-visible instead of trapped behind bootstrap-state JSON
- `test/package-authorship-world.test.js`, `plugins/platform/platform.test.js`, `plugins/mcp/mcp.test.js`, `plugins/authoring-core/authoring-core.test.js`, `test/runtime-governance.test.js`, `plugins/bootstrap/bootstrap-read-models.test.js`, `plugins/bootstrap/bootstrap-live-state.test.js`, and `test/bootstrap-host.test.js` cover transformer authoring, transformer-linked patches, namespace-scoped transformer bundle preview, convergence reads, bootstrap inspection surfaces, and governance wiring end to end

## Detailed Task Backlog

### Immediate tranche of concrete work

1. Add a compatibility-bridge inventory projection and route.
2. Enumerate remaining mutating routes and classify governance coverage.
3. Add missing contextual-ref lowering coverage for authored core nouns.
4. Write the capability compatibility schema and evaluator contract.
5. Design the authored package or patch nouns in a dedicated spec.
6. Prototype canonical `wtoml` ordering and deterministic serialization tests.
7. Define MCP tool shapes for package or patch authoring.

### "Trivialized" implementation breakdown for the first three slices

#### Compatibility bridge inventory

- add one source-of-truth list in code for known bridges
- project that list into diagnostics
- expose one bootstrap or inspector read surface
- add one test that fails when an unregistered bridge is emitted

#### Governance route inventory

- search for mutating handlers
- annotate each with a governance mode
- fail tests when a new mutating handler has no governance annotation
- project the annotation catalog for operator review

#### Contextual ref coverage

- enumerate reference-bearing fields in the schema
- add lowering helpers for one noun at a time
- add ambiguity and visibility tests per noun
- remove direct canonical-id fallback only after tests and diagnostics exist

## Acceptance Gates

This group only counts as materially advanced when:

- composition rules are more explicit than before, not just more convenient
- migration off compatibility bridges has started in code, not only in docs
- plugin or package authorship has a declared owning noun
- namespaces and merge semantics are treated as product concerns, not postponed folklore
- new contributors would be forced toward context, capability, and authority semantics rather than easy global-id shortcuts

## Current Frontend Proof (2026-06-19)

The canonical frontend floor on `page.surface` now includes:

- `surface`
- `process`
- `projection`
- `collection`
- `boundary`
- `policy`
- `capability`

Current proof status:

- legacy route re-homing onto canonical `page.surface` is live through
  `frontendLegacyMigration`
- native subset uplift off `compat.legacy-widget-program` is live through
  `frontendLegacyUplift`
- collection repeat authoring, route-authored preload policies, and canonical
  query-state bindings are in the constrained public lane
- `dispatchDomEvent` is retired from public/runtime support surfaces and no
  longer counts as an acceptable authored-native target
- bootstrap and embedded authored flows no longer depend on named page-local
  `witness:*` host-event bridges as the supported runtime lane
- the compatibility bridge ledger remains the honest inspection surface for any
  surviving legacy frontend bridge usage; host-event bridge usage should remain
  at zero after this tranche

## Primary Source Map

- [ROADMAP.md](../ROADMAP.md)
- [BASELINE.md](../BASELINE.md)
- [docs/CAPABILITIES.md](../CAPABILITIES.md)
- [docs/ROADMAP-TRANCHES.md](../ROADMAP-TRANCHES.md)
- [docs/PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md](../PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md)
