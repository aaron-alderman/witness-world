# Platform All The Way Roadmap

This roadmap turns platform work into first-class runtime state. The goal is not only to build a platform console, but to make product change, documentation, tests, telemetry, branches, defects, execution, and review all live inside the same inspectable platform graph.

The end state is:

```text
intent
  -> proposal
  -> branch / change set
  -> candidate snapshot
  -> dependency analysis
  -> docs / test / telemetry gates
  -> defect and proposal feedback
  -> review
  -> atomic apply
  -> push / ship
  -> live observation
  -> meta-analysis
```

The platform must dogfood itself. RVM, WCSS, proposals, MCP, docs, runtime diagnostics, tests, telemetry, and branches should not be peripheral tooling. They should be modeled objects with provenance, ownership, dependencies, and executable gates.

## Status Key

- [X] Complete.
- [~] Partially implemented or in progress.
- [B] Blocked on another tranche or prerequisite.
- [L] Logged note or implementation finding.
- [ ] Not started.

## New Agent Handoff

This section is the execution contract for a fresh agent. Read it before starting implementation. The rest of the file is the long roadmap; this section keeps work pointed at the existing platform rather than a parallel system.

### What Exists Now

- [ ] Treat `plugin.platform` as the existing home for this work.
- [ ] Treat `/platform` as the human surface for platform self-inspection.
- [ ] Treat `/api/platform-model` as the existing read API for the platform graph.
- [ ] Treat `/api/platform-gaps` as the existing read API for platform gaps.
- [ ] Treat `/api/platform-proposals` as the existing mutation entry point for supported platform proposals.
- [ ] Treat `platform.read` as the existing MCP read lane.
- [ ] Treat `platform.proposal` as the existing MCP proposal lane.
- [ ] Treat `platform.self` as the capability that gates platform MCP availability.
- [ ] Treat `full` as the profile where platform self-modeling is exposed.
- [ ] Treat `minimal` as the profile that must stay free of platform console/routes.
- [ ] Treat `plugins/platform/platform-console.rvm` as the authored RVM source for the console.
- [ ] Treat `plugins/platform/platform-console.wcss` as the authored WCSS source for the console.
- [ ] Treat `plugins/platform/platform-style.js` as the current WCSS lowering bridge.
- [ ] Treat `plugins/platform/platform-page.js` as the current HTML/JS console renderer.
- [ ] Treat `plugins/platform/platform-model.js` as the current platform graph builder.
- [ ] Treat `plugins/platform/platform-proposals.js` as the current proposal body builder/template registry.
- [ ] Treat `plugins/platform/handlers.js` as the current platform HTTP handler implementation.
- [ ] Treat `plugins/platform/runtime.js` as the current route/surface/capability registration point.
- [ ] Treat `plugins/platform/handler-catalog.js` as the handler ownership/catalog contract.
- [ ] Treat `plugins/platform/plugin.json` as the plugin manifest.
- [ ] Treat `plugins/platform/platform.test.js` as the co-located platform test suite.
- [ ] Treat `plugins/mcp/mcp-tools.js` as the current MCP tool declaration/execution surface.
- [ ] Treat `plugins/mcp/mcp-support-services.js` as the current MCP capability availability gate.
- [ ] Treat `plugins/mcp/mcp.test.js` as the current MCP test suite.
- [ ] Treat `store/seeds/runtime-profiles.json` as the runtime profile seed source.
- [ ] Treat `store/seeds/first-party-plugin-catalog.json` as the first-party plugin catalog source.
- [ ] Treat `src/app-snapshot-manager.js` as the existing app snapshot and source-change detection mechanism.
- [ ] Treat `src/runtime-server.js` as the current runtime server composition point.
- [ ] Treat `test/runtime-profile.test.js` as the profile isolation/exposure test suite.
- [ ] Treat `test/app-snapshot-manager.test.js` as the app snapshot manager test suite.

### Do Not Build The Wrong Thing

- [ ] Do not create a second platform console outside `plugin.platform`.
- [ ] Do not add privileged direct-write APIs for platform state.
- [ ] Do not bypass proposal, change-set, or explicit operator authority paths.
- [ ] Do not expose platform routes from `minimal`.
- [ ] Do not make MCP more powerful than the human proposal path.
- [ ] Do not add MCP-only mutation backdoors.
- [ ] Do not treat Git as the source of truth for the internal platform model.
- [ ] Do not run tests from ad hoc external fixtures when the roadmap calls for in-platform execution.
- [ ] Do not model docs as an unstructured blob once doc nodes are introduced.
- [ ] Do not give runtime code ambient handles to external boundaries.
- [ ] Do not mutate live runtime composition before candidate validation succeeds.
- [ ] Do not let failed validation replace the last good active runtime revision.
- [ ] Do not hand-roll a parallel dependency graph if existing projections, manifests, diagnostics, and app snapshot data can be reused.
- [ ] Do not move platform work into an unrelated plugin unless there is a specific boundary reason and route/profile tests prove it.
- [ ] Do not collapse RVM/WCSS back into opaque hand-authored HTML/CSS.
- [ ] Do not remove current platform tests while extending the model.

### First Files To Read

- [ ] Read `plugins/platform/plugin.json`.
- [ ] Read `plugins/platform/runtime.js`.
- [ ] Read `plugins/platform/handlers.js`.
- [ ] Read `plugins/platform/platform-model.js`.
- [ ] Read `plugins/platform/platform-proposals.js`.
- [ ] Read `plugins/platform/platform-page.js`.
- [ ] Read `plugins/platform/platform-console.rvm`.
- [ ] Read `plugins/platform/platform-console.wcss`.
- [ ] Read `plugins/platform/platform.test.js`.
- [ ] Read `plugins/mcp/mcp-tools.js`.
- [ ] Read `plugins/mcp/mcp-support-services.js`.
- [ ] Read `plugins/mcp/mcp.test.js`.
- [ ] Read `store/seeds/runtime-profiles.json`.
- [ ] Read `store/seeds/first-party-plugin-catalog.json`.
- [ ] Read `src/app-snapshot-manager.js`.
- [ ] Read `test/runtime-profile.test.js`.

### Current Test Commands

- [ ] Run the platform/MCP/profile smoke suite before changing behavior:
  - [ ] `node --test plugins/platform/platform.test.js plugins/mcp/mcp.test.js test/runtime-profile.test.js`
- [ ] Run app snapshot tests before changing reload/snapshot behavior:
  - [ ] `node --test test/app-snapshot-manager.test.js`
- [ ] Run runtime profile tests before changing plugin/profile exposure:
  - [ ] `node --test test/runtime-profile.test.js`
- [ ] Run MCP tests before changing `platform.read`, `platform.proposal`, or future platform MCP tools:
  - [ ] `node --test plugins/mcp/mcp.test.js`
- [ ] Run platform tests before changing platform model, proposals, console, RVM, or WCSS:
  - [ ] `node --test plugins/platform/platform.test.js`
- [ ] Add narrower tests first when behavior is ambiguous, then implement against those tests.

### Current Implemented Behaviors To Preserve

- [ ] Preserve `plugin.platform` manifest identity.
- [ ] Preserve `platform.self` capability declaration.
- [ ] Preserve `/platform` rendering from the active platform plugin.
- [ ] Preserve `/api/platform-model` JSON response.
- [ ] Preserve `/api/platform-gaps` JSON response.
- [ ] Preserve `/api/platform-proposals` create behavior.
- [ ] Preserve platform proposal approve/reject behavior.
- [ ] Preserve MCP `platform.read` using existing route handlers.
- [ ] Preserve MCP `platform.proposal` using existing route handlers.
- [ ] Preserve platform tool availability gating through `platform.self`.
- [ ] Preserve `full` profile exposure.
- [ ] Preserve `minimal` profile isolation.
- [ ] Preserve RVM/WCSS source nodes in the platform model.
- [ ] Preserve test coverage proving RVM identity and WCSS lowering.
- [ ] Preserve proposal support only for existing target processes.
- [ ] Preserve unsupported gaps as read-only recommendations.

### Recommended First Slice For A New Agent

- [ ] Start with the `First Concrete Implementation Slice` at the bottom of this document.
- [ ] Implement `changeSet`, `changeSetEdit`, `branch`, and `candidateSnapshot` as projected platform objects first.
- [ ] Keep the first slice in `plugin.platform` unless a boundary requires a small subordinate plugin.
- [ ] Add read-model nodes and edges before adding mutation UI.
- [ ] Add proposal body generation before adding approval/application.
- [ ] Add API tests before console wiring.
- [ ] Add MCP parity after the HTTP proposal path exists.
- [ ] Add console panels last, consuming the same APIs as MCP.
- [ ] Keep validation model-only until there is a candidate snapshot path.
- [ ] Avoid JS/plugin hot swap in the first slice; begin with RVM/WCSS/WTOML/JSON overlay validation.

### Expected Architecture Shape

- [ ] Human console and MCP tools must converge on the same route handlers.
- [ ] Platform routes must be declared by the platform runtime entry.
- [ ] Handler ownership must be visible in the handler catalog.
- [ ] Profile exposure must be tested from the actual runtime profile seeds.
- [ ] Platform model nodes must have stable IDs.
- [ ] Platform model edges must explain ownership, authorship, governance, dependency, or runtime exposure.
- [ ] Gaps must be deterministic.
- [ ] Gaps must include a supported `recommendedProposal` only when that proposal can actually be created.
- [ ] Proposals must produce reviewable bodies, not direct writes.
- [ ] Approvals must delegate to already-supported target processes.
- [ ] Candidate snapshots must compile and validate before activation.
- [ ] Runtime revision activation must be atomic from the perspective of new requests.
- [ ] In-flight work must keep its original runtime revision.
- [ ] Tests must become platform executions, but local test commands remain acceptable while building that substrate.

### How To Decide Where A New Feature Goes

- [ ] If it is a platform self-inspection view, put it in `plugin.platform`.
- [ ] If it is a platform mutation request, put it behind proposals/change sets.
- [ ] If it is a human view, expose it through `/platform` and platform APIs.
- [ ] If it is an agent/tool view, expose it through MCP using the same platform APIs.
- [ ] If it changes plugin/profile availability, update runtime profile/catalog seeds and profile tests.
- [ ] If it changes MCP behavior, update MCP tool declarations, support services, and MCP tests.
- [ ] If it changes RVM/WCSS authored source, update source identity/lowering tests.
- [ ] If it touches external systems, model the boundary, authority, lease, execution, and artifact.
- [ ] If it produces evidence, store or model it as an artifact.
- [ ] If it observes failure, model it as a defect or meta-defect.
- [ ] If it affects docs, create or update doc nodes and freshness edges.

### Minimum Bar For Each Pull Of Work

- [ ] Identify the platform object kinds involved.
- [ ] Identify the lifecycle phases involved: `author`, `transform`, `execute`, `observe`, `verify`, `ship`, `steward`.
- [ ] Identify the profile exposure impact.
- [ ] Identify whether the change needs MCP parity.
- [ ] Identify whether the change needs a human console panel.
- [ ] Identify whether the change needs a proposal path.
- [ ] Identify whether the change needs a candidate snapshot.
- [ ] Identify which tests prove `minimal` remains clean.
- [ ] Identify which tests prove `full` exposes the new behavior.
- [ ] Identify which docs become stale or need new ownership.
- [ ] Identify which defects/gaps should be emitted when the behavior is incomplete.

## Current Baseline

- [ ] Confirm `plugin.platform` is active in the `full` runtime profile and absent from `minimal`.
- [ ] Confirm `/platform`, `/api/platform-model`, `/api/platform-gaps`, and `/api/platform-proposals` are owned by `plugin.platform`.
- [ ] Confirm `platform.read` and `platform.proposal` are available only when `platform.self` is active and installed on the MCP server.
- [ ] Confirm the Platform Console has authored source artifacts:
  - [ ] `plugins/platform/platform-console.rvm`
  - [ ] `plugins/platform/platform-console.wcss`
  - [ ] `plugins/platform/platform-style.js`
- [ ] Confirm the platform model exposes RVM/WCSS authored source nodes:
  - [ ] `rvm:plugins/platform/platform-console.rvm`
  - [ ] `wcss:plugins/platform/platform-console.wcss`
- [ ] Confirm existing app snapshot reload works for `.rvm` and `.wtoml` app sources through `AppSnapshotManager`.
- [ ] Confirm current proposal machinery can create, approve, and reject guarded target-process mutations.
- [ ] Confirm runtime diagnostics expose active profile, active bundles, routes, surfaces, handlers, capabilities, and plugins.

## Guiding Invariants

- [ ] No privileged direct-write paths for platform mutations.
- [ ] Every mutation enters through a proposal, change set, execution command, or explicit operator authority path.
- [ ] Multi-file edits apply atomically to a candidate snapshot before becoming active.
- [ ] Failed validation preserves the last good active snapshot.
- [ ] In-flight requests continue on the runtime revision they started with.
- [ ] New requests use the newest valid active runtime revision.
- [ ] External boundaries are addressed by capability-scoped commands, not ambient handles.
- [ ] Tests, docs, telemetry, and defects are first-class platform objects.
- [ ] Git can mirror platform state, but internal platform state is the product source of truth.
- [ ] All objects have provenance: actor/session, source, branch/change set, proposal, execution, timestamp.
- [ ] Dependency analysis explains why a gate, doc, test, or subsystem is affected.
- [ ] The platform can inspect its own blind spots as meta-defects.

## Core Vocabulary

- [ ] Define `intent`: a human or LLM goal statement that starts platform work.
- [ ] Define `proposal`: a reviewable request to mutate platform state.
- [ ] Define `changeSet`: a multi-file and multi-object staged change.
- [ ] Define `branch`: an isolated platform work line backed by a change set graph.
- [ ] Define `candidateSnapshot`: a compiled and validated runtime candidate.
- [ ] Define `runtimeRevision`: the active backend/runtime composition revision.
- [ ] Define `docNode`: a governed document with scope, freshness, and dependencies.
- [ ] Define `testGate`: an executable verification contract.
- [ ] Define `execution`: a runtime command, test run, build, LLM turn, or boundary effect.
- [ ] Define `defect`: an observed product/design/logic/runtime failure.
- [ ] Define `metaDefect`: a defect in the platform's own understanding or process.
- [ ] Define `telemetrySample`: live measurement linked to platform objects.
- [ ] Define `boundary`: an external resource or effect actor.
- [ ] Define `lease`: temporary authority to use a boundary.
- [ ] Define `artifact`: output of execution, validation, test, docs, screenshots, traces, logs, or generated files.
- [ ] Define `shipRecord`: durable evidence that a branch was applied, pushed, released, or deployed.

## Phase 1: Platform Branch And Change Set Kernel

### 1.1 Data Model

- [X] Add `changeSet` module kind.
- [X] Add `changeSetEdit` module kind.
- [X] Add `branch` module kind.
- [X] Add `candidateSnapshot` module kind.
- [ ] Add `mergeIntent` module kind.
- [ ] Add `conflict` module kind.
- [ ] Add `pushRecord` module kind.
- [ ] Add `shipRecord` module kind.
- [~] Add module projectors for change sets:
  - [X] `changeSets`
  - [X] `changeSetIndex`
  - [X] `changeSetEdits`
  - [X] `changeSetEditIndex`
  - [X] `branches`
  - [X] `branchIndex`
  - [X] `candidateSnapshots`
  - [X] `candidateSnapshotIndex`
  - [ ] `mergeIntents`
  - [ ] `conflicts`
  - [ ] `pushRecords`
  - [ ] `shipRecords`
- [~] Define stable IDs:
  - [ ] `changeSet:<slug>`
  - [X] `changeSetEdit:<changeSetId>:<pathHash>`
  - [ ] `branch:<name>`
  - [X] `candidateSnapshot:<changeSetId>:<revision>`
  - [ ] `conflict:<changeSetId>:<pathHash>`
- [~] Add canonical status values for change sets:
  - [X] `draft`
  - [ ] `validating`
  - [X] `valid`
  - [X] `invalid`
  - [X] `applied`
  - [X] `rejected`
  - [X] `abandoned`
- [~] Add canonical status values for branches:
  - [X] `open`
  - [X] `valid`
  - [X] `blocked`
  - [ ] `merged`
  - [ ] `pushed`
  - [ ] `shipped`
  - [ ] `closed`

### 1.2 Change Set API

- [X] Add `plugin.platform-change-sets` or extend `plugin.platform` with change-set routes.
- [X] Add `POST /api/platform-change-sets`.
- [X] Add `GET /api/platform-change-sets`.
- [X] Add `GET /api/platform-change-sets/:id`.
- [X] Add `POST /api/platform-change-sets/:id/edits`.
- [X] Add `DELETE /api/platform-change-sets/:id/edits/:pathHash`.
- [X] Add `POST /api/platform-change-sets/:id/validate`.
- [X] Add `POST /api/platform-change-sets/:id/apply`.
- [X] Add `POST /api/platform-change-sets/:id/reject`.
- [X] Add `POST /api/platform-change-sets/:id/abandon`.
- [B] Add `POST /api/platform-change-sets/:id/rebase`.
- [~] Add route ownership tests for all change-set routes.
- [~] Add `minimal` profile isolation tests for change-set routes.
- [~] Add `full` profile exposure tests for change-set routes.
- [L] Rebase remains blocked on explicit merge/re-anchor semantics for branch overlays; V1 currently has conflict detection and closure, but not a defensible rebase story yet.

### 1.3 Multi-File Atomic Edits

- [X] Implement change-set overlays instead of immediate disk writes.
- [X] Represent each edit as:
  - [X] path
  - [X] previous hash
  - [X] next content hash
  - [X] source language
  - [X] actor
  - [X] session
  - [X] timestamp
- [X] Validate each path is inside allowed app/plugin/doc roots.
- [X] Reject path traversal.
- [X] Reject binary writes in V1 unless explicitly marked artifact-safe.
- [X] Detect conflicts when base file hash changed after change-set creation.
- [~] Build candidate source tree from:
  - [X] base filesystem
  - [B] branch overlay
  - [X] change-set overlay
- [X] Validate all edits together before applying any to disk.
- [~] Persist successful apply atomically:
  - [X] write temp files
  - [X] fsync where practical
  - [X] rename into place
  - [X] record applied edit witnesses
- [X] Preserve previous active snapshot on failed validation.
- [~] Add tests for two-file RVM edits applying atomically.
- [X] Add tests for one invalid file causing the whole change set to remain unapplied.
- [X] Add tests for conflict detection when base hash changed.
- [X] Add tests for rollback of partial disk write failure.
- [L] Current apply semantics are temp-write plus promote plus rollback; this is best-effort atomicity across multiple files, not a stronger cross-file filesystem transaction.
- [L] V1 candidate materialization is currently base filesystem plus the active change-set overlay; true branch-overlay composition remains blocked on the later branch graph/multi-change-set semantics.

### 1.4 Branch Semantics

- [~] Creating a proposal can create a branch automatically.
- [X] A proposal can attach to an existing branch.
- [X] Branches can contain multiple change sets.
- [X] Branches can depend on parent branches.
- [X] Branches can be tagged with:
  - [X] epic
  - [X] feature
  - [X] defect
  - [X] session
  - [X] owner
  - [X] runtime profile
- [X] Branches can be opened from MCP.
- [X] Branches can be opened from `/platform`.
- [X] Branches have candidate snapshots.
- [X] Branches have validation history.
- [ ] Branches have docs freshness status.
- [ ] Branches have telemetry impact summaries.
- [ ] Branches have affected system summaries.
- [X] Add Platform Console branch list view.
- [X] Add branch detail page or panel.
- [ ] Add branch lifecycle board lane:
  - [ ] draft
  - [ ] validate
  - [ ] review
  - [ ] apply
  - [ ] push
  - [ ] ship
- [L] Automatic branch creation currently happens when approving `changeSet.create` without a supplied branch, preserving proposal non-mutation at creation time.
  - [ ] observe

### 1.5 Proposal Integration

- [X] Add proposal target process `changeSet.create`.
- [X] Add proposal target process `changeSet.edit`.
- [X] Add proposal target process `changeSet.validate`.
- [X] Add proposal target process `changeSet.apply`.
- [X] Add proposal target process `branch.create`.
- [ ] Add proposal target process `branch.rebase`.
- [ ] Add proposal target process `branch.merge`.
- [X] Extend `platform.proposal` MCP tool to create change-set proposals.
- [X] Add Platform Console flow:
  - [X] create branch
  - [X] stage edits
  - [X] validate
  - [X] create proposal
  - [X] approve
  - [X] apply
- [~] Add test that proposal creation automatically creates a branch when requested.
- [X] Add test that approved change-set proposal atomically applies all edits.
- [X] Add test that rejected proposal leaves branch/change-set intact but unapplied.
- [L] Implementation note: proposal creation remains non-mutating by design; the current proof is that approving `changeSet.create` can auto-create the branch before staging work.

## Phase 2: Candidate Snapshot And Backend Hot Reload

### 2.1 Snapshot Model

- [ ] Promote `AppSnapshotManager` concepts into platform model nodes.
- [ ] Add `runtimeRevision` module kind.
- [ ] Add `backendRevision` module kind.
- [ ] Add `frontendRevision` module kind.
- [ ] Add `snapshotBuild` module kind.
- [ ] Add `snapshotBuildError` module kind.
- [ ] Add projector `runtimeRevisions`.
- [ ] Add projector `activeRuntimeRevision`.
- [ ] Add projector `candidateSnapshotsByBranch`.
- [ ] Expose snapshot diagnostics in `/api/platform-model`.
- [ ] Show active, candidate, last-good, and failed snapshots in `/platform`.

### 2.2 RVM/WTOML Backend Reload

- [ ] Reuse `AppSnapshotManager` dependency tracking for branch overlays.
- [ ] Add candidate snapshot build from change-set overlay.
- [ ] Add backend request routing by active runtime revision.
- [ ] Ensure in-flight requests hold a reference to their starting runtime context.
- [ ] Ensure new requests see latest active valid runtime revision.
- [ ] Ensure failed rebuild leaves active runtime unchanged.
- [ ] Add backend revision SSE:
  - [ ] `GET /api/runtime/backend-revisions/events`
  - [ ] event fields: revision, branch, changeSet, trigger, changedSources, status
- [ ] Add Platform Console backend revision stream.
- [ ] Add MCP read view `platform.read { view: "runtimeRevisions" }`.
- [ ] Add tests for RVM route/process changes changing backend behavior without process restart.
- [ ] Add tests for invalid RVM preserving last good backend behavior.
- [ ] Add tests for SSE event after backend candidate activation.

### 2.3 JS Plugin Reload Strategy

- [ ] Decide V1 stance: process-isolated reload, not in-process ESM cache mutation.
- [ ] Add plugin implementation change detection.
- [ ] Classify JS edits as high-risk implementation edits.
- [ ] Require stricter validation for JS edits:
  - [ ] syntax check
  - [ ] unit tests
  - [ ] route ownership tests
  - [ ] plugin boundary tests
  - [ ] process isolation smoke test
- [ ] Add plugin runtime worker model.
- [ ] Add worker lifecycle:
  - [ ] start
  - [ ] health check
  - [ ] route requests
  - [ ] drain
  - [ ] dispose
  - [ ] terminate
- [ ] Add revisioned plugin handler registry.
- [ ] Add test that JS plugin edit creates candidate worker and does not affect active worker until valid.
- [ ] Add test that failed plugin import leaves active worker running.
- [ ] Add test that old worker drains in-flight requests.

### 2.4 Runtime Context Lifecycle

- [ ] Define runtime context object:
  - [ ] revision id
  - [ ] world
  - [ ] handler registry
  - [ ] route table
  - [ ] capability set
  - [ ] boundary actor registry
  - [ ] resource leases
  - [ ] telemetry collector
  - [ ] dispose hook
- [ ] Add context reference counting for in-flight requests.
- [ ] Add context drain timeout.
- [ ] Add context dispose telemetry.
- [ ] Add context leak detector.
- [ ] Add platform gap for undisposed old runtime contexts.
- [ ] Add tests for context swap and disposal.

## Phase 3: Docs As First-Class Live Objects

### 3.1 Document Model

- [ ] Add `docNode` module kind.
- [ ] Add `docSection` module kind.
- [ ] Add `docDecision` module kind.
- [ ] Add `docRunbook` module kind.
- [ ] Add `docFreshnessGate` module kind.
- [ ] Add `docReference` module kind.
- [ ] Add projectors:
  - [ ] `docs`
  - [ ] `docIndex`
  - [ ] `docSections`
  - [ ] `docDependencies`
  - [ ] `docFreshness`
  - [ ] `docsByPlatformObject`
- [ ] Classify docs by role:
  - [ ] architecture
  - [ ] design
  - [ ] API
  - [ ] operations
  - [ ] test strategy
  - [ ] migration
  - [ ] roadmap
  - [ ] runbook
  - [ ] product
  - [ ] rationale
- [ ] Add stable doc IDs independent of file paths.
- [ ] Add doc ownership metadata.
- [ ] Add doc freshness timestamps.
- [ ] Add doc source path metadata.
- [ ] Add doc governed object edges.

### 3.2 Markdown Ingestion

- [ ] Parse Markdown heading structure into `docSection` nodes.
- [ ] Parse checkbox tasks into `docTask` nodes.
- [ ] Parse code references into edges.
- [ ] Parse route references into edges.
- [ ] Parse plugin IDs into edges.
- [ ] Parse capability IDs into edges.
- [ ] Parse file paths into source edges.
- [ ] Parse proposal IDs into proposal edges.
- [ ] Parse branch IDs into branch edges.
- [ ] Parse test command blocks into `testGate` suggestions.
- [ ] Add tests for Markdown ingestion.
- [ ] Add tests for this roadmap document becoming doc/task nodes.

### 3.3 Docs Freshness

- [ ] Build dependency graph from docs to governed objects.
- [ ] Mark docs stale when governed code/source/test objects change.
- [ ] Mark docs stale when route/capability/plugin public surface changes.
- [ ] Mark docs stale when tests covering the doc fail.
- [ ] Mark docs stale when branch changes related objects but leaves doc unchanged.
- [ ] Add freshness states:
  - [ ] fresh
  - [ ] stale
  - [ ] unknown
  - [ ] missing
  - [ ] disputed
- [ ] Add Platform Console docs view.
- [ ] Add doc freshness gaps in `/api/platform-gaps`.
- [ ] Add MCP view `platform.read { view: "docs" }`.
- [ ] Add tests that code changes mark governing docs stale.
- [ ] Add tests that doc edits restore freshness after validation.

### 3.4 LLM Documentation As It Goes

- [ ] Add session-level doc obligations.
- [ ] Add LLM turn summary artifact.
- [ ] Add branch changelog artifact.
- [ ] Add design-rationale artifact.
- [ ] Add doc update proposal generation.
- [ ] Require significant branch proposals to include:
  - [ ] changed objects
  - [ ] changed docs
  - [ ] docs intentionally unchanged with reason
  - [ ] remaining stale docs
- [ ] Add Platform Console "Docs To Update" panel.
- [ ] Add MCP helper to request doc obligations for current branch.
- [ ] Add tests that platform proposes doc updates for changed public routes.
- [ ] Add tests that branch cannot ship while required docs are stale unless explicitly waived.

## Phase 4: External Boundaries As Managed Actors

### 4.1 Boundary Model

- [ ] Add `boundary` module kind.
- [ ] Add `boundaryCommand` module kind.
- [ ] Add `boundaryObservation` module kind.
- [ ] Add `boundaryLease` module kind.
- [ ] Add `boundaryPolicy` module kind.
- [ ] Add `resourceIdentity` module kind.
- [ ] Add boundary kinds:
  - [ ] filesystem
  - [ ] database
  - [ ] HTTP outbound
  - [ ] webhook inbound
  - [ ] MCP server
  - [ ] Git remote
  - [ ] test runner
  - [ ] browser
  - [ ] LLM provider
  - [ ] package registry
  - [ ] OS process
- [ ] Add projectors:
  - [ ] `boundaries`
  - [ ] `boundaryIndex`
  - [ ] `boundaryLeases`
  - [ ] `boundaryObservations`
  - [ ] `activeBoundaryCommands`
  - [ ] `resourcePolicies`

### 4.2 No Ambient Handles

- [ ] Audit direct filesystem handle usage.
- [ ] Audit direct DB handle usage.
- [ ] Audit direct process spawning.
- [ ] Audit direct HTTP outbound.
- [ ] Audit direct watcher usage.
- [ ] Audit direct MCP session handling.
- [ ] Convert each external interaction into command/effect/observation.
- [ ] Add lints/tests that plugin code does not retain forbidden handles.
- [ ] Add lifecycle hooks for boundary actors:
  - [ ] start
  - [ ] command
  - [ ] observe
  - [ ] health
  - [ ] drain
  - [ ] stop
- [ ] Add platform gap for unmanaged external boundary usage.

### 4.3 Erlang-Style Execution Semantics

- [ ] Define actor identity for each boundary process.
- [ ] Define supervision tree:
  - [ ] platform supervisor
  - [ ] branch supervisor
  - [ ] runtime revision supervisor
  - [ ] boundary supervisor
  - [ ] test execution supervisor
  - [ ] telemetry supervisor
- [ ] Define restart policy:
  - [ ] permanent
  - [ ] transient
  - [ ] temporary
- [ ] Define mailbox/command queue semantics.
- [ ] Define timeout semantics.
- [ ] Define cancellation semantics.
- [ ] Define lease release semantics.
- [ ] Add telemetry for actor restarts.
- [ ] Add tests for boundary actor restart without losing platform state.
- [ ] Add tests for command timeout producing defect/proposal.

## Phase 5: Tests Inside The Platform

### 5.1 Test Gate Model

- [ ] Add `testGate` module kind.
- [ ] Add `testSuite` module kind.
- [ ] Add `testCase` module kind.
- [ ] Add `testRun` module kind.
- [ ] Add `testResult` module kind.
- [ ] Add `testArtifact` module kind.
- [ ] Add `coverageEdge` module kind.
- [ ] Add projectors:
  - [ ] `testGates`
  - [ ] `testGateIndex`
  - [ ] `testRuns`
  - [ ] `testResults`
  - [ ] `latestTestResultsByGate`
  - [ ] `coverageEdges`
  - [ ] `affectedTestGates`
- [ ] Model gate fields:
  - [ ] id
  - [ ] title
  - [ ] command
  - [ ] runner
  - [ ] environment
  - [ ] timeout
  - [ ] protected objects
  - [ ] source dependencies
  - [ ] last result
  - [ ] flake score
  - [ ] cost estimate
- [ ] Add test gate discovery from:
  - [ ] `test/*.test.js`
  - [ ] `plugins/**/*.test.js`
  - [ ] package scripts
  - [ ] explicit docs
  - [ ] platform model hints
- [ ] Add Platform Console gates view.
- [ ] Add MCP view `platform.read { view: "testGates" }`.

### 5.2 Test Execution Environment

- [ ] Add `testRunner` boundary actor.
- [ ] Add named environments:
  - [ ] local node
  - [ ] local browser
  - [ ] local Rust/cargo
  - [ ] isolated temp workspace
  - [ ] platform candidate snapshot
- [ ] Run tests inside platform execution commands.
- [ ] Capture stdout/stderr as artifacts.
- [ ] Capture structured TAP/JUnit where available.
- [ ] Capture duration, memory, CPU, exit code.
- [ ] Capture environment inputs.
- [ ] Capture source revision and branch.
- [ ] Capture candidate snapshot ID.
- [ ] Add `POST /api/platform-test-runs`.
- [ ] Add `GET /api/platform-test-runs/:id`.
- [ ] Add test run SSE events.
- [ ] Add Platform Console test run panel.
- [ ] Add MCP tool `platform.test` or extend `platform.proposal` gate execution.

### 5.3 Efficient Red/Green

- [ ] Build dependency path aware test selection.
- [ ] Compute changed source objects for branch/change set.
- [ ] Compute affected runtime objects:
  - [ ] routes
  - [ ] handlers
  - [ ] capabilities
  - [ ] plugins
  - [ ] bundles
  - [ ] surfaces
  - [ ] docs
  - [ ] tests
- [ ] Select smallest meaningful gate set.
- [ ] Explain selection:
  - [ ] direct file dependency
  - [ ] imported source dependency
  - [ ] route ownership dependency
  - [ ] plugin ownership dependency
  - [ ] doc freshness dependency
  - [ ] telemetry regression dependency
  - [ ] prior defect cluster dependency
- [ ] Cache successful gate results by:
  - [ ] source hash set
  - [ ] candidate snapshot hash
  - [ ] environment identity
  - [ ] test runner version
  - [ ] dependency graph version
- [ ] Invalidate cache when dependencies change.
- [ ] Add tests that one RVM file edit runs only relevant RVM/snapshot gates.
- [ ] Add tests that plugin route edit runs plugin ownership/profile route gates.
- [ ] Add tests that WCSS-only edit does not run backend-only gates.
- [ ] Add tests that dependency graph misses are logged as meta-defects.

## Phase 6: Pure Dependency Analysis And Coverage

### 6.1 Dependency Graph

- [ ] Add `dependencyGraph` module kind.
- [ ] Add `dependencyEdge` module kind.
- [ ] Add `affectedSystem` module kind.
- [ ] Add graph node kinds:
  - [ ] file
  - [ ] RVM form
  - [ ] WCSS token
  - [ ] WCSS style
  - [ ] WCSS generated CSS rule
  - [ ] WTOML doc
  - [ ] JS module
  - [ ] route
  - [ ] handler
  - [ ] capability
  - [ ] bundle
  - [ ] plugin
  - [ ] surface
  - [ ] doc
  - [ ] test gate
  - [ ] boundary
  - [ ] proposal
  - [ ] branch
  - [ ] telemetry metric
- [ ] Add edge kinds:
  - [ ] imports
  - [ ] declares
  - [ ] owns
  - [ ] renders
  - [ ] handles
  - [ ] requiresCapability
  - [ ] providesCapability
  - [ ] verifies
  - [ ] documents
  - [ ] governs
  - [ ] observes
  - [ ] usesBoundary
  - [ ] invalidates
  - [ ] affects
- [ ] Compute graph incrementally after source changes.
- [ ] Store graph version.
- [ ] Add graph diff between branches.
- [ ] Add graph diff between runtime revisions.
- [ ] Add Platform Console dependency graph view.
- [ ] Add MCP view `platform.read { view: "dependencies" }`.

### 6.2 Coverage As First-Class

- [ ] Add `coverageClaim` module kind.
- [ ] Add `coverageGap` module kind.
- [ ] Link test gates to protected objects.
- [ ] Link docs to governed objects.
- [ ] Link telemetry to observed objects.
- [ ] Link defect clusters to affected objects.
- [ ] Compute coverage matrix:
  - [ ] object -> tests
  - [ ] object -> docs
  - [ ] object -> telemetry
  - [ ] object -> owner
  - [ ] object -> proposal history
- [ ] Add coverage states:
  - [ ] covered
  - [ ] weak
  - [ ] inferred
  - [ ] missing
  - [ ] stale
- [ ] Add platform gaps for missing coverage.
- [ ] Add tests that uncovered new route produces coverage gap.
- [ ] Add tests that missing doc for capability produces doc gap.
- [ ] Add tests that missing telemetry for slow handler produces telemetry gap.

## Phase 7: Defects, Clusters, And Meta-Issues

### 7.1 Defect Model

- [ ] Add `defect` module kind.
- [ ] Add `defectObservation` module kind.
- [ ] Add `defectCluster` module kind.
- [ ] Add `rootCauseHypothesis` module kind.
- [ ] Add `fixProposal` relation.
- [ ] Add defect kinds:
  - [ ] product
  - [ ] design
  - [ ] logic
  - [ ] runtime
  - [ ] test
  - [ ] doc
  - [ ] telemetry
  - [ ] dependency-analysis
  - [ ] LLM
  - [ ] boundary
- [ ] Add defect severity:
  - [ ] info
  - [ ] low
  - [ ] medium
  - [ ] high
  - [ ] critical
- [ ] Add defect status:
  - [ ] open
  - [ ] investigating
  - [ ] proposed
  - [ ] fixed
  - [ ] verified
  - [ ] rejected
  - [ ] duplicate
- [ ] Add projectors:
  - [ ] `defects`
  - [ ] `defectIndex`
  - [ ] `defectClusters`
  - [ ] `defectsByObject`
  - [ ] `openDefectsByBranch`
  - [ ] `metaDefects`

### 7.2 Defects Are Proposals

- [ ] Add proposal target process `defect.create`.
- [ ] Add proposal target process `defect.accept`.
- [ ] Add proposal target process `defect.cluster`.
- [ ] Add proposal target process `defect.fix`.
- [ ] Allow failed test runs to create defect proposals.
- [ ] Allow telemetry thresholds to create defect proposals.
- [ ] Allow docs freshness failures to create defect proposals.
- [ ] Allow dependency graph misses to create meta-defect proposals.
- [ ] Link defects to product/design/logic/runtime objects.
- [ ] Link defects to branch/change-set/test-run/session.
- [ ] Add Platform Console defects view.
- [ ] Add MCP view `platform.read { view: "defects" }`.
- [ ] Add test that failed gate creates defect proposal.
- [ ] Add test that defect proposal can attach fix change set.

### 7.3 Clustering And After-Action Analysis

- [ ] Cluster defects by shared failing gate.
- [ ] Cluster defects by shared changed files.
- [ ] Cluster defects by shared runtime object.
- [ ] Cluster defects by shared telemetry regression.
- [ ] Cluster defects by repeated LLM/session behavior.
- [ ] Cluster defects by boundary actor.
- [ ] Cluster defects by dependency graph edge.
- [ ] Generate cluster summaries.
- [ ] Generate candidate root-cause hypotheses.
- [ ] Link cluster to roadmap/epic if recurring.
- [ ] Add after-action report artifact.
- [ ] Add tests for clustering repeated test failures.
- [ ] Add tests for clustering telemetry regressions and test failures on same handler.

### 7.4 Meta-System Awareness

- [ ] Define `metaIssue` or use `defect.kind = "meta"`.
- [ ] Detect missing dependency edges.
- [ ] Detect stale docs without owner.
- [ ] Detect tests selected without explanation.
- [ ] Detect proposals without branch.
- [ ] Detect branches without test gates.
- [ ] Detect telemetry without object mapping.
- [ ] Detect LLM changes without doc update.
- [ ] Detect failed validation without defect proposal.
- [ ] Detect direct boundary handles.
- [ ] Detect unowned runtime objects.
- [ ] Add meta-issues to `/api/platform-gaps`.
- [ ] Add Platform Console meta-system panel.
- [ ] Add tests that each meta-rule produces a deterministic gap/defect.

## Phase 8: Live Telemetry And Self-Observation

### 8.1 Telemetry Model

- [ ] Add `telemetryMetric` module kind.
- [ ] Add `telemetrySample` module kind.
- [ ] Add `telemetryWindow` module kind.
- [ ] Add `telemetryThreshold` module kind.
- [ ] Add `performanceRegression` module kind.
- [ ] Add metric categories:
  - [ ] CPU
  - [ ] memory
  - [ ] event loop delay
  - [ ] request latency
  - [ ] handler duration
  - [ ] boundary latency
  - [ ] queue depth
  - [ ] rebuild duration
  - [ ] test duration
  - [ ] cache hit rate
  - [ ] LLM/tool latency
  - [ ] error rate
  - [ ] log volume
- [ ] Add metric ownership:
  - [ ] route
  - [ ] handler
  - [ ] plugin
  - [ ] branch
  - [ ] test gate
  - [ ] boundary
  - [ ] runtime revision
  - [ ] session
- [ ] Add projectors:
  - [ ] `telemetryMetrics`
  - [ ] `latestTelemetryByObject`
  - [ ] `telemetryWindows`
  - [ ] `performanceRegressions`

### 8.2 Collection

- [ ] Instrument HTTP requests.
- [ ] Instrument route handlers.
- [ ] Instrument runtime snapshot rebuilds.
- [ ] Instrument change-set validation.
- [ ] Instrument test runs.
- [ ] Instrument boundary commands.
- [ ] Instrument MCP tool calls.
- [ ] Instrument LLM/tool execution sessions.
- [ ] Instrument memory and CPU sampling.
- [ ] Instrument event loop delay.
- [ ] Instrument queue depth for background actors.
- [ ] Store logs as structured observations.
- [ ] Link all telemetry to session/branch/revision where possible.

### 8.3 Hot Loop And Slow Execution Detection

- [ ] Define hot-loop detector for repeated identical events.
- [ ] Define slow-handler detector.
- [ ] Define slow-boundary detector.
- [ ] Define high-memory detector.
- [ ] Define event-loop-blocked detector.
- [ ] Define rebuild-regression detector.
- [ ] Define test-duration-regression detector.
- [ ] Define log-spam detector.
- [ ] Create defect proposals from detector output.
- [ ] Add Platform Console telemetry dashboard.
- [ ] Add per-branch performance delta view.
- [ ] Add tests using fake telemetry samples.

## Phase 9: Sessions, Executions, And Parallel Work

### 9.1 Session Model

- [ ] Add `session` module kind.
- [ ] Add `execution` module kind.
- [ ] Add `sessionTag` module kind.
- [ ] Add `executionArtifact` module kind.
- [ ] Session kinds:
  - [ ] human
  - [ ] LLM
  - [ ] MCP
  - [ ] test
  - [ ] background job
  - [ ] boundary
  - [ ] release
- [ ] Execution kinds:
  - [ ] proposal create
  - [ ] proposal review
  - [ ] change-set validation
  - [ ] test run
  - [ ] branch apply
  - [ ] push
  - [ ] ship
  - [ ] boundary command
  - [ ] LLM turn
- [ ] Add session tags:
  - [ ] branch
  - [ ] epic
  - [ ] feature
  - [ ] defect
  - [ ] proposal
  - [ ] actor
  - [ ] runtime profile
- [ ] Add Platform Console sessions view.
- [ ] Add MCP view `platform.read { view: "sessions" }`.

### 9.2 Parallel Development

- [ ] Allow multiple active branches per actor.
- [ ] Allow multiple candidate snapshots per branch.
- [ ] Allow branch-specific test runs.
- [ ] Allow branch-specific docs freshness.
- [ ] Allow branch-specific telemetry windows.
- [ ] Allow branch-specific runtime preview where feasible.
- [ ] Add branch comparison.
- [ ] Add branch conflict visualization.
- [ ] Add branch dependency ordering.
- [ ] Add tests for two branches editing independent files.
- [ ] Add tests for two branches conflicting on same file.
- [ ] Add tests for branch-specific test cache reuse.

## Phase 10: Roadmap, Epics, Feature Branches

### 10.1 Planning Model

- [ ] Add `roadmap` module kind.
- [ ] Add `epic` module kind.
- [ ] Add `feature` module kind.
- [ ] Add `milestone` module kind.
- [ ] Add `releaseChannel` module kind.
- [ ] Add `acceptanceCriterion` module kind.
- [ ] Add projectors:
  - [ ] `roadmaps`
  - [ ] `epics`
  - [ ] `features`
  - [ ] `milestones`
  - [ ] `branchesByEpic`
  - [ ] `defectsByEpic`
  - [ ] `testsByFeature`
- [ ] Link branch to feature.
- [ ] Link feature to epic.
- [ ] Link epic to roadmap.
- [ ] Link defects to feature/epic.
- [ ] Link docs and tests to feature/epic.
- [ ] Add Platform Console roadmap view.
- [ ] Add Platform Console epic view.

### 10.2 Executable Roadmaps

- [ ] Parse checkbox tasks from roadmap docs into platform task nodes.
- [ ] Link checkbox tasks to code/test/doc/platform objects.
- [ ] Track task status from platform evidence, not only Markdown text.
- [ ] Add roadmap validation:
  - [ ] every feature has acceptance criteria
  - [ ] every acceptance criterion has a gate
  - [ ] every feature has docs owner
  - [ ] every epic has branch/proposal status
- [ ] Add proposal target process `roadmap.update`.
- [ ] Add proposal target process `epic.create`.
- [ ] Add proposal target process `feature.create`.
- [ ] Add tests for this roadmap being ingested into roadmap/task nodes.

## Phase 11: Git Mirroring, Push, And Ship

### 11.1 Internal First, Git Second

- [ ] Keep internal branch/change-set state as product truth.
- [ ] Add Git mirror adapter boundary.
- [ ] Represent Git remotes as boundary actors.
- [ ] Represent Git refs as observed external state.
- [ ] Represent commits as push artifacts.
- [ ] Represent pull requests as external review artifacts.
- [ ] Add mapping:
  - [ ] platform branch -> Git branch
  - [ ] change set -> commit
  - [ ] proposal -> PR
  - [ ] ship record -> merge/release
- [ ] Add dry-run push.
- [ ] Add push proposal.
- [ ] Add push execution.
- [ ] Add push telemetry.
- [ ] Add push artifacts.

### 11.2 Atomic Disk Save And Push

- [ ] Persist applied branch to disk atomically.
- [ ] Verify disk content hashes after write.
- [ ] Create Git commit from applied change set.
- [ ] Push branch to remote.
- [ ] Record remote URL/ref.
- [ ] Record commit SHA.
- [ ] Link push record to branch/proposal/session.
- [ ] Add tests with local bare Git remote.
- [ ] Add rollback path for failed push after disk apply.
- [ ] Add platform defect for push failure.

### 11.3 Ship

- [ ] Add ship proposal.
- [ ] Add release channel model:
  - [ ] local
  - [ ] preview
  - [ ] staging
  - [ ] production
- [ ] Add ship gates:
  - [ ] required tests green
  - [ ] docs fresh
  - [ ] no blocking defects
  - [ ] telemetry within threshold
  - [ ] branch up to date
  - [ ] reviewer approval
- [ ] Add ship record.
- [ ] Add post-ship observation window.
- [ ] Add automatic rollback proposal on severe telemetry regression.

## Phase 12: Platform Console Evolution

### 12.1 Expand Human Views

- [ ] Add Branches view.
- [ ] Add Change Sets view.
- [ ] Add Candidate Snapshots view.
- [ ] Add Runtime Revisions view.
- [ ] Add Docs view.
- [ ] Add Test Gates view.
- [ ] Add Test Runs view.
- [ ] Add Dependency Graph view.
- [ ] Add Coverage Matrix view.
- [ ] Add Defects view.
- [ ] Add Defect Clusters view.
- [ ] Add Telemetry view.
- [ ] Add Sessions view.
- [ ] Add Roadmap/Epics view.
- [ ] Add Boundaries view.
- [ ] Add Meta-System view.

### 12.2 RVM/WCSS Dogfooding

- [ ] Move more Platform Console structure into `platform-console.rvm`.
- [ ] Move all Platform Console styles into `platform-console.wcss`.
- [ ] Build a renderer that can consume RVM surface declarations for internal platform pages.
- [ ] Replace hand-authored HTML sections with rendered RVM surface tree.
- [ ] Keep tests proving RVM identity and WCSS lowering.
- [ ] Add platform gap when a platform page lacks RVM/WCSS source.
- [ ] Add platform gap when generated CSS differs from WCSS source.

### 12.3 MCP Parity

- [~] Add MCP views for each Platform Console view.
- [ ] Ensure every human mutation has an MCP proposal equivalent.
- [ ] Ensure MCP cannot bypass proposal/change-set authority.
- [ ] Add MCP tool:
  - [X] `platform.branch`
  - [X] `platform.changeSet`
  - [ ] `platform.test`
  - [ ] `platform.docs`
  - [ ] `platform.telemetry`
  - [ ] `platform.defects`
  - [ ] `platform.roadmap`
- [ ] Add tests for human/MCP parity.

## Phase 13: Policy, Authority, And Safety

- [ ] Define authority policy for branch creation.
- [ ] Define authority policy for change-set edit.
- [ ] Define authority policy for apply.
- [ ] Define authority policy for push.
- [ ] Define authority policy for ship.
- [ ] Define authority policy for test execution.
- [ ] Define authority policy for boundary commands.
- [ ] Define authority policy for telemetry access.
- [ ] Define authority policy for doc updates.
- [ ] Define authority policy for LLM-authored changes.
- [ ] Add policy override proposals.
- [ ] Add audit log views.
- [ ] Add tests for unauthorized change-set write returning proposal/handoff.
- [ ] Add tests for unauthorized push rejection.
- [ ] Add tests for authorized reviewer approval.

## Phase 14: Artifact Store

- [ ] Add `artifact` module kind.
- [ ] Add artifact types:
  - [ ] source diff
  - [ ] generated file
  - [ ] test log
  - [ ] test report
  - [ ] screenshot
  - [ ] trace
  - [ ] telemetry window
  - [ ] LLM transcript summary
  - [ ] doc render
  - [ ] dependency graph snapshot
  - [ ] coverage report
  - [ ] push output
- [ ] Store artifact metadata in world state.
- [ ] Store artifact content in managed storage.
- [ ] Link artifacts to session/execution/branch/proposal.
- [ ] Add artifact retention policy.
- [ ] Add artifact redaction policy.
- [ ] Add Platform Console artifact browser.
- [ ] Add tests for artifact creation and retrieval.

## Phase 15: Implementation Milestones

### Milestone A: Internal Branch And Change Set V1

- [X] Add change-set module model.
- [X] Add branch module model.
- [X] Add multi-file overlay validation for RVM/WTOML/WCSS/JSON.
- [X] Add platform-change-set API.
- [X] Add proposal integration.
- [X] Add Platform Console branch/change-set panels.
- [X] Add MCP branch/change-set operations.
- [X] Add tests for atomic multi-file apply.
- [X] Add tests for failed validation preserving active snapshot.
- [X] Ship behind `plugin.platform`.

### Milestone B: Backend Candidate Snapshot V1

- [ ] Build candidate snapshots from change-set overlays.
- [ ] Route new requests to active valid runtime revision.
- [ ] Preserve in-flight revision references.
- [ ] Add backend revision events.
- [ ] Add runtime revision view.
- [ ] Add tests for backend behavior changing from RVM without process restart.
- [ ] Add tests for failed candidate preserving old behavior.

### Milestone C: Docs Live Model V1

- [ ] Ingest Markdown docs.
- [ ] Build doc/object dependency edges.
- [ ] Mark docs stale on related changes.
- [ ] Add doc freshness gaps.
- [ ] Add docs view.
- [ ] Add LLM documentation obligations.
- [ ] Add tests for stale/fresh docs.

### Milestone D: Test Gate V1

- [ ] Discover test gates.
- [ ] Run tests as platform executions.
- [ ] Capture test artifacts.
- [ ] Link gates to changed objects.
- [ ] Run dependency-aware selected tests.
- [ ] Add red/green view.
- [ ] Add tests for affected test selection.

### Milestone E: Defects And Telemetry V1

- [ ] Add telemetry samples for requests, handlers, rebuilds, tests.
- [ ] Add slow/hot-loop detectors.
- [ ] Add defect proposals from failing gates and telemetry regressions.
- [ ] Add defect clusters.
- [ ] Add Platform Console defects/telemetry views.

### Milestone F: Git Mirror And Ship V1

- [ ] Add Git boundary actor.
- [ ] Mirror platform branch to Git branch.
- [ ] Commit applied change set.
- [ ] Push branch.
- [ ] Record push/ship artifacts.
- [ ] Add ship gates.
- [ ] Add rollback proposal path.

## Definition Of Done For The Whole Program

- [ ] A human can create a branch from `/platform`.
- [ ] An MCP client can create the same branch through platform tools.
- [ ] A proposal automatically creates or attaches to a branch.
- [ ] A branch can stage edits across multiple files.
- [ ] A branch can validate without touching active runtime state.
- [ ] A valid branch produces a candidate runtime snapshot.
- [ ] New backend requests can move to a new active runtime revision without process restart for RVM/WTOML/WCSS changes.
- [ ] JS/plugin implementation changes are validated in an isolated execution context.
- [ ] Tests run inside the platform execution environment.
- [ ] Test selection is dependency-path aware.
- [ ] Test red/green is visible as platform state.
- [ ] Docs are first-class nodes with freshness and ownership.
- [ ] LLM sessions produce doc/update obligations tied to branches.
- [ ] Defects are first-class proposals.
- [ ] Defects can cluster and produce after-action analysis.
- [ ] Telemetry is live and linked to platform objects.
- [ ] Hot loops and slow execution create defects or gaps.
- [ ] External boundaries are managed actors, not ambient handles.
- [ ] Sessions, executions, branches, tests, docs, telemetry, defects, and roadmap objects are all linked.
- [ ] Branches can be pushed to Git through a managed boundary.
- [ ] Disk writes for applied changes are atomic.
- [ ] Ship records prove what changed, what ran, what docs updated, what telemetry was observed, and who approved it.
- [ ] The Platform Console itself is authored through RVM/WCSS and appears in the platform model.
- [ ] The platform can identify meta-issues in its own process.

## First Concrete Implementation Slice

This is the recommended next slice because it provides immediate leverage without requiring JS hot-swap or full Git integration.

- [X] Add `changeSet`, `changeSetEdit`, `branch`, and `candidateSnapshot` projectors.
- [X] Add `POST /api/platform-change-sets`.
- [X] Add `POST /api/platform-change-sets/:id/edits`.
- [X] Add `POST /api/platform-change-sets/:id/validate`.
- [X] Validate overlay edits against RVM/WCSS/WTOML/JSON parsing.
- [X] Build candidate snapshot from overlay.
- [X] Add `platform.changeSet` MCP tool.
- [X] Add Platform Console branch/change-set panels.
- [X] Add test for editing `plugins/platform/platform-console.rvm` and `plugins/platform/platform-console.wcss` together.
- [X] Add test that invalid WCSS keeps active snapshot unchanged.
- [X] Add test that valid change set updates the candidate snapshot and emits a revision event.
- [X] Add doc ingestion for this file and expose its checkbox tasks in `/api/platform-model`.
- [X] Add approval-time proposal execution for `branch.create`, `changeSet.create`, `changeSet.edit`, and `changeSet.validate` through the shared bootstrap proposal executor.
