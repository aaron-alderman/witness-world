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

Related follow-on:

- [docs/CONTINUOUS-VERIFICATION-ROADMAP.md](C:\Users\aaron\Documents\world\docs\CONTINUOUS-VERIFICATION-ROADMAP.md)
- [docs/INTENT-REGISTRY-ROADMAP.md](C:\Users\aaron\Documents\world\docs\INTENT-REGISTRY-ROADMAP.md)
- [docs/CONTEXTHUB-SPEC.md](C:\Users\aaron\Documents\world\docs\CONTEXTHUB-SPEC.md)

## Status Key

- [X] Complete.
- [~] Partially implemented or in progress.
- [B] Blocked on another tranche or prerequisite.
- [L] Logged note or implementation finding.
- [ ] Not started.

## New Agent Handoff

This section is the execution contract for a fresh agent. Read it before starting implementation. The rest of the file is the long roadmap; this section keeps work pointed at the existing platform rather than a parallel system.

### What Exists Now

- Treat `plugin.platform` as the existing home for this work.
- Treat `/platform` as the human surface for platform self-inspection.
- Treat `/api/platform-model` as the existing read API for the platform graph.
- Treat `/api/platform-gaps` as the existing read API for platform gaps.
- Treat `/api/platform-proposals` as the existing mutation entry point for supported platform proposals.
- Treat `platform.read` as the existing MCP read lane.
- Treat `platform.proposal` as the existing MCP proposal lane.
- Treat `platform.self` as the capability that gates platform MCP availability.
- Treat `full` as the profile where platform self-modeling is exposed.
- Treat `minimal` as the profile that must stay free of platform console/routes.
- Treat `plugins/platform/platform-console.rvm` as the authored RVM source for the console.
- Treat `plugins/platform/platform-console.wcss` as the authored WCSS source for the console.
- Treat `plugins/platform/platform-style.js` as the current WCSS lowering bridge.
- Treat `plugins/platform/platform-page.js` as the current HTML/JS console renderer.
- Treat `plugins/platform/platform-model.js` as the current platform graph builder.
- Treat `plugins/platform/platform-proposals.js` as the current proposal body builder/template registry.
- Treat `plugins/platform/handlers.js` as the current platform HTTP handler implementation.
- Treat `plugins/platform/runtime.js` as the current route/surface/capability registration point.
- Treat `plugins/platform/handler-catalog.js` as the handler ownership/catalog contract.
- Treat `plugins/platform/plugin.json` as the plugin manifest.
- Treat `plugins/platform/platform.test.js` as the co-located platform test suite.
- Treat `plugins/mcp/mcp-tools.js` as the current MCP tool declaration/execution surface.
- Treat `plugins/mcp/mcp-support-services.js` as the current MCP capability availability gate.
- Treat `plugins/mcp/mcp.test.js` as the current MCP test suite.
- Treat `store/seeds/runtime-profiles.json` as the runtime profile seed source.
- Treat `store/seeds/first-party-plugin-catalog.json` as the first-party plugin catalog source.
- Treat `src/app-snapshot-manager.js` as the existing app snapshot and source-change detection mechanism.
- Treat `src/runtime-server.js` as the current runtime server composition point.
- Treat `test/runtime-profile.test.js` as the profile isolation/exposure test suite.
- Treat `test/app-snapshot-manager.test.js` as the app snapshot manager test suite.

### Do Not Build The Wrong Thing

- Do not create a second platform console outside `plugin.platform`.
- Do not add privileged direct-write APIs for platform state.
- Do not bypass proposal, change-set, or explicit operator authority paths.
- Do not expose platform routes from `minimal`.
- Do not make MCP more powerful than the human proposal path.
- Do not add MCP-only mutation backdoors.
- Do not treat Git as the source of truth for the internal platform model.
- Do not run tests from ad hoc external fixtures when the roadmap calls for in-platform execution.
- Do not model docs as an unstructured blob once doc nodes are introduced.
- Do not give runtime code ambient handles to external boundaries.
- Do not mutate live runtime composition before candidate validation succeeds.
- Do not let failed validation replace the last good active runtime revision.
- Do not hand-roll a parallel dependency graph if existing projections, manifests, diagnostics, and app snapshot data can be reused.
- Do not move platform work into an unrelated plugin unless there is a specific boundary reason and route/pre tests prove it.
- Do not collapse RVM/WCSS back into opaque hand-authored HTML/CSS.
- Do not remove current platform tests while extending the model.

### First Files To Read

- Read `plugins/platform/plugin.json`.
- Read `plugins/platform/runtime.js`.
- Read `plugins/platform/handlers.js`.
- Read `plugins/platform/platform-model.js`.
- Read `plugins/platform/platform-proposals.js`.
- Read `plugins/platform/platform-page.js`.
- Read `plugins/platform/platform-console.rvm`.
- Read `plugins/platform/platform-console.wcss`.
- Read `plugins/platform/platform.test.js`.
- Read `plugins/mcp/mcp-tools.js`.
- Read `plugins/mcp/mcp-support-services.js`.
- Read `plugins/mcp/mcp.test.js`.
- Read `store/seeds/runtime-profiles.json`.
- Read `store/seeds/first-party-plugin-catalog.json`.
- Read `src/app-snapshot-manager.js`.
- Read `test/runtime-profile.test.js`.

### Current Test Commands

- Run the platform/MCP/profile smoke suite before changing behavior:
  - `node --test plugins/platform/platform.test.js plugins/mcp/mcp.test.js test/runtime-profile.test.js`
- Run app snapshot tests before changing reload/snapshot behavior:
  - `node --test test/app-snapshot-manager.test.js`
- Run runtime profile tests before changing plugin/profile exposure:
  - `node --test test/runtime-profile.test.js`
- Run MCP tests before changing `platform.read`, `platform.proposal`, or future platform MCP tools:
  - `node --test plugins/mcp/mcp.test.js`
- Run platform tests before changing platform model, proposals, console, RVM, or WCSS:
  - `node --test plugins/platform/platform.test.js`
- Add narrower tests first when behavior is ambiguous, then implement against those tests.

### Current Implemented Behaviors To Preserve

- Preserve `plugin.platform` manifest identity.
- Preserve `platform.self` capability declaration.
- Preserve `/platform` rendering from the active platform plugin.
- Preserve `/api/platform-model` JSON response.
- Preserve `/api/platform-gaps` JSON response.
- Preserve `/api/platform-proposals` create behavior.
- Preserve platform proposal approve/reject behavior.
- Preserve MCP `platform.read` using existing route handlers.
- Preserve MCP `platform.proposal` using existing route handlers.
- Preserve platform tool availability gating through `platform.self`.
- Preserve `full` profile exposure.
- Preserve `minimal` profile isolation.
- Preserve RVM/WCSS source nodes in the platform model.
- Preserve test coverage proving RVM identity and WCSS lowering.
- Preserve proposal support only for existing target processes.
- Preserve unsupported gaps as read-only recommendations.

### Recommended First Slice For A New Agent

- Start with the `First Concrete Implementation Slice` at the bottom of this document.
- Implement `changeSet`, `changeSetEdit`, `branch`, and `candidateSnapshot` as projected platform objects first.
- Keep the first slice in `plugin.platform` unless a boundary requires a small subordinate plugin.
- Add read-model nodes and edges before adding mutation UI.
- Add proposal body generation before adding approval/application.
- Add API tests before console wiring.
- Add MCP parity after the HTTP proposal path exists.
- Add console panels last, consuming the same APIs as MCP.
- Keep validation model-only until there is a candidate snapshot path.
- Avoid JS/plugin hot swap in the first slice; begin with RVM/WCSS/WTOML/JSON overlay validation.

### Expected Architecture Shape

- Human console and MCP tools must converge on the same route handlers.
- Platform routes must be declared by the platform runtime entry.
- Handler ownership must be visible in the handler catalog.
- Profile exposure must be tested from the actual runtime profile seeds.
- Platform model nodes must have stable IDs.
- Platform model edges must explain ownership, authorship, governance, dependency, or runtime exposure.
- Gaps must be deterministic.
- Gaps must include a supported `recommendedProposal` only when that proposal can actually be created.
- Proposals must produce reviewable bodies, not direct writes.
- Approvals must delegate to already-supported target processes.
- Candidate snapshots must compile and validate before activation.
- Runtime revision activation must be atomic from the perspective of new requests.
- In-flight work must keep its original runtime revision.
- Tests must become platform executions, but local test commands remain acceptable while building that substrate.

### How To Decide Where A New Feature Goes

- If it is a platform self-inspection view, put it in `plugin.platform`.
- If it is a platform mutation request, put it behind proposals/change sets.
- If it is a human view, expose it through `/platform` and platform APIs.
- If it is an agent/tool view, expose it through MCP using the same platform APIs.
- If it changes plugin/profile availability, update runtime profile/catalog seeds and profile tests.
- If it changes MCP behavior, update MCP tool declarations, support services, and MCP tests.
- If it changes RVM/WCSS authored source, update source identity/lowering tests.
- If it touches external systems, model the boundary, authority, lease, execution, and artifact.
- If it produces evidence, store or model it as an artifact.
- If it observes failure, model it as a defect or meta-defect.
- If it affects docs, create or update doc nodes and freshness edges.

### Minimum Bar For Each Pull Of Work

- Identify the platform object kinds involved.
- Identify the lifecycle phases involved: `author`, `transform`, `execute`, `observe`, `verify`, `ship`, `steward`.
- Identify the profile exposure impact.
- Identify whether the change needs MCP parity.
- Identify whether the change needs a human console panel.
- Identify whether the change needs a proposal path.
- Identify whether the change needs a candidate snapshot.
- Identify which tests prove `minimal` remains clean.
- Identify which tests prove `full` exposes the new behavior.
- Identify which docs become stale or need new ownership.
- Identify which defects/gaps should be emitted when the behavior is incomplete.

## Current Baseline

- Confirm `plugin.platform` is active in the `full` runtime profile and absent from `minimal`.
- Confirm `/platform`, `/api/platform-model`, `/api/platform-gaps`, and `/api/platform-proposals` are owned by `plugin.platform`.
- Confirm `platform.read` and `platform.proposal` are available only when `platform.self` is active and installed on the MCP server.
- Confirm the Platform Console has authored source artifacts:
  - `plugins/platform/platform-console.rvm`
  - `plugins/platform/platform-console.wcss`
  - `plugins/platform/platform-style.js`
- Confirm the platform model exposes RVM/WCSS authored source nodes:
  - `rvm:plugins/platform/platform-console.rvm`
  - `wcss:plugins/platform/platform-console.wcss`
- Confirm existing app snapshot reload works for `.rvm` and `.wtoml` app sources through `AppSnapshotManager`.
- Confirm current proposal machinery can create, approve, and reject guarded target-process mutations.
- Confirm runtime diagnostics expose active profile, active bundles, routes, surfaces, handlers, capabilities, and plugins.

## Guiding Invariants

- No privileged direct-write paths for platform mutations.
- Every mutation enters through a proposal, change set, execution command, or explicit operator authority path.
- Multi-file edits apply atomically to a candidate snapshot before becoming active.
- Failed validation preserves the last good active snapshot.
- In-flight requests continue on the runtime revision they started with.
- New requests use the newest valid active runtime revision.
- External boundaries are addressed by capability-scoped commands, not ambient handles.
- Tests, docs, telemetry, and defects are first-class platform objects.
- Git can mirror platform state, but internal platform state is the product source of truth.
- All objects have provenance: actor/session, source, branch/change set, proposal, execution, timestamp.
- Dependency analysis explains why a gate, doc, test, or subsystem is affected.
- The platform can inspect its own blind spots as meta-defects.

## Core Vocabulary

- Define `intent`: a human or LLM goal statement that starts platform work.
- Define `intentRegistryEntry`: the canonical classified registry row for an intent, with scope, actors, linked docs, linked tests, linked features, and freshness evidence.
- Define `proposal`: a reviewable request to mutate platform state.
- Define `changeSet`: a multi-file and multi-object staged change.
- Define `branch`: an isolated platform work line backed by a change set graph.
- Define `candidateSnapshot`: a compiled and validated runtime candidate.
- Define `runtimeRevision`: the active backend/runtime composition revision.
- Define `docNode`: a governed document with scope, freshness, and dependencies.
- Define `testGate`: an executable verification contract.
- Define `execution`: a runtime command, test run, build, LLM turn, or boundary effect.
- Define `defect`: an observed product/design/logic/runtime failure.
- Define `metaDefect`: a defect in the platform's own understanding or process.
- Define `telemetrySample`: live measurement linked to platform objects.
- Define `boundary`: an external resource or effect actor.
- Define `lease`: temporary authority to use a boundary.
- Define `artifact`: output of execution, validation, test, docs, screenshots, traces, logs, or generated files.
- Define `shipRecord`: durable evidence that a branch was applied, pushed, released, or deployed.

## Phase 1: Platform Branch And Change Set Kernel

### 1.1 Data Model

- [X] Add `changeSet` module kind.
- [X] Add `changeSetEdit` module kind.
- [X] Add `branch` module kind.
- [X] Add `candidateSnapshot` module kind.
- [X] Add `mergeIntent` module kind.
- [X] Add `conflict` module kind.
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
  - [X] `mergeIntents`
  - [X] `conflicts`
  - [ ] `pushRecords`
  - [ ] `shipRecords`
- [~] Define stable IDs:
  - [X] `changeSet:<slug>`
  - [X] `changeSetEdit:<changeSetId>:<pathHash>`
  - [X] `branch:<name>`
  - [X] `candidateSnapshot:<changeSetId>:<revision>`
  - [X] `conflict:<changeSetId>:<pathHash>`
- [~] Add canonical status values for change sets:
  - [X] `draft`
  - [X] `validating`
  - [X] `valid`
  - [X] `invalid`
  - [X] `applied`
  - [X] `rejected`
  - [X] `abandoned`
- [L] V1 now witnesses `validating` as a transient in-progress change-set status during synchronous overlay validation; long-running async validation remains later work.
- [~] Add canonical status values for branches:
  - [X] `open`
  - [X] `valid`
  - [X] `blocked`
  - [ ] `merged`
  - [ ] `pushed`
  - [ ] `shipped`
  - [X] `closed`
- [L] V1 derives `closed` for branches whose change sets are all terminal `rejected`/`abandoned`; merge/push/ship closure remains later lifecycle work.
- [L] V1 merge intents are proposal-derived rows with IDs of the form `mergeIntent:<proposalId>`; execution-time merge/rebase semantics remain later work.

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
- [X] Add route ownership tests for all change-set routes.
- [X] Add `minimal` profile isolation tests for change-set routes.
- [X] Add `full` profile exposure tests for change-set routes.
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
- [X] Add tests for two-file RVM edits applying atomically.
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
- [X] Branches have docs freshness status.
- [X] Branches have telemetry impact summaries.
- [X] Branches have affected system summaries.
- [X] Add Platform Console branch list view.
- [X] Add branch detail page or panel.
- [X] Add branch lifecycle board lane:
  - [X] draft
  - [X] validate
  - [X] review
  - [X] apply
  - [X] push
  - [X] ship
- [L] Automatic branch creation currently happens when approving `changeSet.create` without a supplied branch, preserving proposal non-mutation at creation time.
  - [ ] observe
- [L] Branch docs freshness and telemetry/system summaries are currently derived from affected edit paths plus governed-doc ownership heuristics; deeper dependency-backed freshness remains later work.
- [L] Platform-generated branch and change-set IDs now follow the canonical `branch:` / `changeSet:` shapes; explicit operator-supplied IDs remain accepted for compatibility.

### 1.5 Proposal Integration

- [X] Add proposal target process `changeSet.create`.
- [X] Add proposal target process `changeSet.edit`.
- [X] Add proposal target process `changeSet.validate`.
- [X] Add proposal target process `changeSet.apply`.
- [X] Add proposal target process `branch.create`.
- [X] Add proposal target process `branch.rebase`.
- [X] Add proposal target process `branch.merge`.
- [X] Extend `platform.proposal` MCP tool to create change-set proposals.
- [X] Add Platform Console flow:
  - [X] create branch
  - [X] stage edits
  - [X] validate
  - [X] create proposal
  - [X] approve
  - [X] apply
- [X] Add test that proposal creation automatically creates a branch when requested.
- [X] Add test that approved change-set proposal atomically applies all edits.
- [X] Add test that rejected proposal leaves branch/change-set intact but unapplied.
- [L] Implementation note: proposal creation remains non-mutating by design; the current proof is that approving `changeSet.create` can auto-create the branch before staging work.
- [L] V1 proposal approval now validates branch existence and records reviewed `branch.merge` / `branch.rebase` intent witnesses through the shared executor without mutating branch overlays; actual overlay merge/rebase semantics remain deferred.

## Phase 2: Candidate Snapshot And Backend Hot Reload

### 2.1 Snapshot Model

- [X] Promote `AppSnapshotManager` concepts into platform model nodes.
- [~] Add `runtimeRevision` module kind.
- [X] Add `backendRevision` module kind.
- [X] Add `frontendRevision` module kind.
- [X] Add `snapshotBuild` module kind.
- [X] Add `snapshotBuildError` module kind.
- [~] Add projector `runtimeRevisions`.
- [~] Add projector `activeRuntimeRevision`.
- [X] Add projector `candidateSnapshotsByBranch`.
- [X] Expose snapshot diagnostics in `/api/platform-model`.
- [X] Show active, candidate, last-good, and failed snapshots in `/platform`.
- [L] Current runtime-revision modeling is diagnostics-backed: `/api/platform-model`, `/platform`, and MCP expose the active `AppSnapshotManager` backend revision, the dev-mode frontend reload revision linked to `/api/runtime/app-revisions/events`, and snapshot-build summaries. Authored-source activation now reuses the live snapshot manager for new requests. In-flight revision pinning and the dedicated Platform Console backend-revision stream remain separate follow-on work.

### 2.2 RVM/WTOML Backend Reload

- [ ] Reuse `AppSnapshotManager` dependency tracking for branch overlays.
- [X] Add candidate snapshot build from change-set overlay.
- [X] Add backend request routing by active runtime revision.
- [X] Ensure in-flight requests hold a reference to their starting runtime context.
- [X] Ensure new requests see latest active valid runtime revision.
- [X] Ensure failed rebuild leaves active runtime unchanged.
- [X] Add backend revision SSE:
  - [X] `GET /api/runtime/backend-revisions/events`
  - [X] event fields: revision, branch, changeSet, trigger, changedSources, status
- [X] Add Platform Console backend revision stream.
- [X] Add MCP read view `platform.read { view: "runtimeRevisions" }`.
- [X] Add tests for RVM route/process changes changing backend behavior without process restart.
- [X] Add tests for invalid RVM preserving last good backend behavior.
- [X] Add tests for SSE event after backend candidate activation.
- [L] Current activation path is `platform.changeSet.apply` -> `AppSnapshotManager.markDirtyPaths(...)` for applied files inside the active app roots, so new requests pick up a rebuilt authored runtime revision without restarting the server while failed rebuilds retain the last good snapshot. `/platform` now consumes `/api/platform-model?view=runtimeRevisions&id=...` for runtime revision detail, snapshot builds, and build errors, while the live backend revision stream remains SSE-backed.
- [L] Current request pinning is HTTP-request scoped: the runtime snapshots `appSnapshotManager.getActiveSnapshot()` after `ensureFresh()` and proxies that fixed revision through route matching, authz, rendering, and nested handler invocation for the lifetime of the request. Long-lived out-of-band work such as jobs or separate event streams remains distinct follow-on policy.
- [L] Broad malformed RVM text still often compiles into tolerated residual forms, but unterminated brace blocks now fail compilation deterministically and are covered by the invalid-RVM last-good runtime regression.

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

- [~] Add `docNode` module kind.
- [X] Add `docSection` module kind.
- [ ] Add `docDecision` module kind.
- [ ] Add `docRunbook` module kind.
- [ ] Add `docFreshnessGate` module kind.
- [X] Add `docReference` module kind.
- [~] Add projectors:
  - [X] `docs`
  - [X] `docIndex`
  - [X] `docSections`
  - [X] `docDependencies`
  - [X] `docFreshness`
  - [X] `docsByPlatformObject`
- [~] Classify docs by role:
  - [ ] architecture
  - [ ] design
  - [ ] API
  - [ ] operations
  - [ ] test strategy
  - [ ] product
  - [ ] developer
  - [ ] system
  - [ ] admin
  - [ ] actor-facing
  - [X] migration
  - [X] roadmap
  - [X] runbook
  - [ ] rationale
- [ ] Add stable doc IDs independent of file paths.
- [X] Add doc ownership metadata.
- [X] Add doc freshness timestamps.
- [X] Add doc source path metadata.
- [X] Add doc governed object edges.

### 3.2 Markdown Ingestion

- [X] Parse Markdown heading structure into `docSection` nodes.
- [~] Parse checkbox tasks into `docTask` nodes.
- [X] Parse code references into edges.
- [X] Parse route references into edges.
- [X] Parse plugin IDs into edges.
- [X] Parse capability IDs into edges.
- [~] Parse file paths into source edges.
- [X] Parse proposal IDs into proposal edges.
- [X] Parse branch IDs into branch edges.
- [~] Parse test command blocks into `testGate` suggestions.
- [X] Add tests for Markdown ingestion.
- [X] Add tests for this roadmap document becoming doc/task nodes.

### 3.3 Docs Freshness

- [~] Build dependency graph from docs to governed objects.
- [~] Mark docs stale when governed code/source/test objects change.
- [ ] Mark docs stale when route/capability/plugin public surface changes.
- [ ] Mark docs stale when tests covering the doc fail.
- [X] Mark docs stale when branch changes related objects but leaves doc unchanged.
- [~] Add freshness states:
  - [X] fresh
  - [X] stale
  - [ ] unknown
  - [ ] missing
  - [ ] disputed
- [X] Add Platform Console docs view.
- [X] Add doc freshness gaps in `/api/platform-gaps`.
- [X] Add MCP view `platform.read { view: "docs" }`.
- [X] Add tests that code changes mark governing docs stale.
- [X] Add tests that doc edits restore freshness after validation.
- [L] Current doc freshness is branch-heuristic and dependency-edge backed for governed docs, plugin IDs, capability IDs, route mentions, explicit `proposal.*` / `proposal:` references, explicit `branch:` references, and modeled file references inside Markdown. Generic source-file nodes and test-failure freshness invalidation remain open follow-on work.

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

### 3.5 Intent Registry And Knowledge Facets

- [ ] Add `intentRegistryEntry` projector rows derived from authored docs, roadmap tasks, branch metadata, and later explicit intent records.
- [ ] Classify each registry row by context, actor, lifecycle, and knowledge facet instead of forcing one flat docs list.
- [ ] Support linked facets such as product docs, developer docs, system docs, admin docs, test reports, roadmap tasks, and operator runbooks.
- [ ] Add stable intent IDs independent of file paths.
- [ ] Prefer doc ids and platform concept ids over brittle absolute file references inside generated knowledge scaffolds.
- [ ] Generate lightweight templates and gap reports when an intent lacks nearby docs, tests, owner, or feature linkage.
- [ ] Allow partial drift but surface it as freshness or alignment debt rather than pretending the registry is canonical truth.
- [ ] Add `/platform` knowledge views that can pivot by intent, actor, and facet.
- [ ] Add MCP read support for intent-registry slices on the same handler lane.
- [ ] Add tests for intent-to-doc, intent-to-test, and intent-to-feature linkage.

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
- [~] Add projectors:
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

- [X] Add `testGate` module kind.
- [X] Add `testSuite` module kind.
- [X] Add `testCase` module kind.
- [X] Add `testRun` module kind.
- [X] Add `testResult` module kind.
- [X] Add `testArtifact` module kind.
- [X] Add `coverageEdge` module kind.
- [X] Add projectors:
  - [X] `testGates`
  - [X] `testGateIndex`
  - [X] `testRuns`
  - [X] `testResults`
  - [X] `testSuites`
  - [X] `testCases`
  - [X] `latestTestResultsByGate`
  - [X] coverageEdges
  - [X] `affectedTestGates`
- [X] Model gate fields:
  - [X] id
  - [X] title
  - [X] command
  - [X] runner
  - [X] environment
  - [X] timeout
  - [X] protected objects
  - [X] source dependencies
  - [X] last result
  - [X] flake score
  - [X] cost estimate
- [X] Add test gate discovery from:
  - [X] `test/*.test.js`
  - [X] `plugins/**/*.test.js`
  - [X] package scripts
  - [X] explicit docs
  - [X] platform model hints
- [X] Add Platform Console gates view.
- [X] Add MCP view `platform.read { view: "testGates" }`.
- [L] Current V1 gate modeling is a platform self-model projection with branch-aware affected gate selection plus discovery from test files, package scripts, explicit doc commands, and test-source platform hints. Test-source hints currently come from repo-relative imports, quoted repo paths, route literals, and known plugin/capability/handler identifiers; they are not yet a full AST/import dependency graph.
- [L] Platform graph nodes for discovered verification commands now use the explicit `testGate` kind, and the base `testGates` / `testGateIndex` / `coverageEdges` catalog is now available through delegated platform projectors. Branch-aware affected-gate selection and selected-gate reduction still remain platform-model-local because they depend on change-set/branch summaries, telemetry targets, and prior-defect context.
- [L] Current V1 now also derives `coverageEdge` rows from each gate's protected objects and source dependencies, emits `coverageEdge` nodes in the platform graph, and exposes those rows through `/api/platform-model?view=testGates`. The delegated projector currently captures the base gate catalog and file/protected-object edges; it is not yet the broader coverage matrix planned in Phase 6.
- [L] Current `flakeScore` is witness-backed rather than runner-native: it is derived as the normalized transition rate across non-cached terminal results for a gate, and remains `null` until the gate has at least two non-cached executions in history.
- [L] Current V1 test execution still records one synthesized `testResult` per run, but structured TAP/JUnit artifacts now derive `testSuite` and `testCase` rows opportunistically from captured stdout/stderr content. Artifact storage, standalone structured report ingestion, and richer runner-native per-case modeling remain later work.

### 5.2 Test Execution Environment

- [X] Add `testRunner` boundary actor.
- [~] Add named environments:
  - [X] local node
  - [X] local browser
  - [~] local Rust/cargo
  - [X] isolated temp workspace
  - [X] platform candidate snapshot
- [~] Run tests inside platform execution commands.
- [X] Capture stdout/stderr as artifacts.
- [X] Capture structured TAP/JUnit where available.
- [~] Capture duration, memory, CPU, exit code.
- [X] Capture environment inputs.
- [X] Capture source revision and branch.
- [X] Capture candidate snapshot ID.
- [X] Add `POST /api/platform-test-runs`.
- [X] Add `GET /api/platform-test-runs/:id`.
- [X] Add test run SSE events.
- [X] Add Platform Console test run panel.
- [X] Add MCP tool `platform.test` or extend `platform.proposal` gate execution.
- [L] Current V1 test execution now models a `testRunner` boundary actor plus named local-node, local-browser, isolated-temp-workspace, and candidate-snapshot execution environments in the platform graph. Commands still run through the same `plugin.platform` handler lane used by the human HTTP path, but explicit `isolated-temp-workspace` runs and candidate-snapshot runs now materialize a temp workspace copy before execution instead of running directly against the live repo root.
- [L] `local Rust/cargo` is named in the execution environment catalog and chosen for cargo-shaped gate commands, but the current repo does not yet expose a discovered cargo gate that exercises that path end to end.
- [L] Current stdout/stderr artifacts are projected as inline witness-backed `testArtifact` rows attached to each run/result. They are first-class platform objects now, but they are not yet external blob-backed artifacts or structured report files.
- [L] Structured report capture currently derives TAP and JUnit artifacts opportunistically from captured stdout/stderr content and projects `testSuite` / `testCase` rows from those structured artifacts. It does not yet ingest standalone report files, merge multi-file reports, or preserve richer failure metadata.
- [L] Direct test-run inspection now returns those derived `testSuite` / `testCase` rows alongside the underlying `testArtifact` records through `GET /api/platform-test-runs/:id` and the shared `platform.test` read/run path.
- [L] Current V1 captures exit code, duration, stdout, stderr, timeout state, branch id, change-set id, candidate snapshot id, runtime profile, shell/cwd/env input metadata, and source revision dependency hashes for candidate-snapshot/workspace inputs. Memory, CPU, standalone structured report ingestion, artifact storage, and richer SSE/replay semantics remain later work.
- [L] Source revision capture is mixed by design in V1: dependency hashes come from candidate snapshot overlay entries when the dependency is staged there, and from the live workspace for other declared source dependencies. This improves provenance, and candidate-snapshot execution now applies those staged overlays inside a temp workspace, but local-node/local-browser/local-rust-cargo execution still runs directly from the live workspace.
- [L] Candidate-snapshot temp workspaces currently reconstruct overlay content from the current staged `changeSetEdit` rows by matching the requested snapshot file hashes. This means a stale candidate snapshot ID can stop being executable once its change-set edits drift, because the platform does not yet store full overlay contents as snapshot artifacts.
- [L] Current `platform.test` supports list/read/run over the shared platform handlers. It does not yet expose richer operations such as cancellation, streaming progress, or proposal-mediated execution policy.
- [L] Current test-run SSE is implemented as a streamed view over newly appended `platform.test.run.start` / `platform.test.run.finish` witnesses. It does not yet provide a dedicated push subscription substrate, replay cursors, or durable event retention beyond witness history.

### 5.3 Efficient Red/Green

- [~] Build dependency path aware test selection.
- [X] Compute changed source objects for branch/change set.
- [~] Compute affected runtime objects:
  - [~] routes
  - [~] handlers
  - [~] capabilities
  - [~] plugins
  - [~] bundles
  - [~] surfaces
  - [~] docs
  - [~] tests
- [~] Select smallest meaningful gate set.
- [~] Explain selection:
  - [X] direct file dependency
  - [X] imported source dependency
  - [X] route ownership dependency
  - [X] plugin ownership dependency
  - [X] candidate snapshot environment dependency
  - [X] doc freshness dependency
  - [X] telemetry regression dependency
  - [X] prior defect cluster dependency
- [X] Cache successful gate results by:
  - [X] source hash set
  - [X] candidate snapshot hash
  - [X] environment identity
  - [X] test runner version
  - [X] dependency graph version
- [X] Invalidate cache when dependencies change.
- [X] Add tests that one RVM file edit runs only relevant RVM/snapshot gates.
- [X] Add tests that plugin route edit runs plugin ownership/profile route gates.
- [X] Add tests that WCSS-only edit does not run backend-only gates.
- [X] Add tests that dependency graph misses are logged as meta-defects.
- [L] Current V1 now exposes `changedPaths`, affected system summaries, docs freshness, and telemetry impact summaries on both branches and change sets, derives affected test gates for both scopes by matching declared source dependencies and protected objects, and reduces those affected rows into `selectedTestGatesByBranch` / `selectedTestGatesByChangeSet` through a specificity-aware coverage-key heuristic. It still does not guarantee a globally minimal set, attach separate selector-only explanations per kept/pruned gate, or automatically run the selected set.
- [L] Affected gate rows now carry explicit `selectionReasons` for direct file dependency, imported source dependency, plugin ownership dependency, route ownership dependency, candidate snapshot environment dependency, doc freshness dependency, telemetry regression dependency, and prior defect cluster dependency.
- [L] Current telemetry regression dependency is modeled through stable `telemetryMetric:*` objects derived from branch/change-set telemetry impact summaries and matched gate protected objects. It proves which telemetry-sensitive metrics a selected gate is expected to cover, but it is not yet backed by observed telemetry samples, windows, or threshold breaches.
- [L] Current prior defect cluster dependency is modeled through stable `defectCluster:*` objects built from earlier branches that share the same explicit branch `defect` tag. It proves recurring-history-sensitive gate selection for tagged regressions, but it is not yet backed by first-class defect observations, proposals, or automatic clustering heuristics.
- [L] Current successful gate-result reuse is witness-backed and only reuses prior `passed` results whose cache identity matches on source hash set, candidate snapshot hash, environment identity, test runner version, and dependency graph version. It intentionally does not yet reuse failed runs, expose eviction policy, or persist cache state outside witness history.
- [L] Bundle-aware affected-object inference is now partial: plugin-owned test gates verify their bundle targets, and changed platform/MCP sources can match those bundle objects during gate selection. This is still heuristic, not yet a general bundle dependency graph for arbitrary runtime files.
- [L] Doc-aware affected-object inference is now partial: changed governed docs surface as the `docs` affected system, doc freshness flows into branch/change-set summaries, and affected gates can match concrete `doc:*` targets. This is not yet a full doc dependency graph with proposal/test/section-level impact propagation.
- [L] Test-aware affected-object inference is now partial: changed test files surface as the `verification.tests` affected system, and changed test sources can select their own modeled gate through direct file dependency. Plugin-scoped `.test.js` files are now classified as tests before generic plugin ownership, but there is still no richer per-suite/per-case dependency analysis.
- [L] Current route-aware gate selection is still heuristic rather than a general dependency graph. It now infers broad platform plugin/capability/profile targets from `plugins/platform/runtime.js`, `plugins/platform/handlers.js`, `plugins/mcp/*`, and `store/seeds/runtime-profiles.json`, while authored platform page sources such as `plugins/platform/platform-page.js`, `plugins/platform/platform-console.rvm`, `plugins/platform/platform-console.wcss`, and `plugins/platform/platform-style.js` are classified as a narrower `surface.platform` system and infer the `/platform` surface, route, and page-handler targets instead of the whole plugin.
- [L] Current candidate-snapshot-aware gate selection is still heuristic rather than graph-backed. The first proof now tags `plugins/platform/platform-console.rvm` and `plugins/platform/platform-console.wcss` edits with `testEnvironment:platform-candidate-snapshot`, which is enough to select `gate:test/app-snapshot-runtime.test.js`, but it is not yet a general overlay-to-snapshot dependency graph for arbitrary authored files.
- [L] Current selected-gate reduction is coverage-key driven rather than semantically complete. It prefers more specific file-backed gates over broader package/doc gates when they cover the same matched targets/paths, but prior-defect-cluster coverage is still coarse enough that the reduced set can legitimately substitute adjacent explicit gates or broader suite/package commands until the dependency graph becomes first-class.
- [L] The current WCSS-only backend exclusion proof is anchored on runtime-core gate selection: a `plugins/platform/platform-console.wcss` change continues to select platform-facing gates while leaving `gate:test/runtime-server.test.js` unselected.
- [L] Current RVM-only proof now covers both platform-facing and candidate-snapshot verification: a `plugins/platform/platform-console.rvm` change selects `gate:test/runtime-profile.test.js` through the current `/platform` route-hint heuristic, selects `gate:test/app-snapshot-runtime.test.js` through the modeled `testEnvironment:platform-candidate-snapshot` target, and still leaves `gate:test/runtime-server.test.js` unselected.
- [L] Current dependency-graph miss detection is gap-backed rather than full defect-backed: when a change set changes non-doc, non-test sources and the current gate model selects no verification gates, `platform-model` emits a `meta-defect` gap with `category = "dependency-graph-miss"` until the dedicated defect/meta-defect projectors land later.
- [L] Current V1 now also derives scope-specific red/green summaries for branches and change sets from their selected gate sets plus the latest scoped running/result witnesses, annotates branch/change-set rows with `testRedGreen`, and exposes the same state through `/api/platform-model?view=testRedGreen` and `/platform`. It still does not auto-run selected gates or preserve durable history beyond witness-backed runs/results.

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
- [~] Add meta-issues to `/api/platform-gaps`.
- [X] Add Platform Console meta-system panel.
- [ ] Add tests that each meta-rule produces a deterministic gap/defect.
- [L] `/api/platform-gaps` now includes the currently implemented `meta-defect` gap class for dependency-graph misses when a change set touches non-doc sources but no verification gates are selected. `/platform` now renders those rows in a dedicated Meta-System panel, but the broader meta-rule catalog remains later work.

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

- [X] Add `roadmap` module kind.
- [X] Add `epic` module kind.
- [X] Add `feature` module kind.
- [ ] Add `milestone` module kind.
- [ ] Add `releaseChannel` module kind.
- [ ] Add `acceptanceCriterion` module kind.
- [ ] Add projectors:
  - [X] `roadmaps`
  - [X] `epics`
  - [X] `features`
  - [ ] `milestones`
  - [X] `branchesByEpic`
  - [X] `defectsByEpic`
  - [X] `testsByFeature`
- [X] Link branch to feature.
- [X] Link feature to epic.
- [X] Link epic to roadmap.
- [X] Link defects to feature/epic.
- [X] Link docs and tests to feature/epic.
- [X] Add Platform Console roadmap view.
- [X] Add Platform Console epic view.
- [L] Current planning objects are branch-metadata-backed: `/api/platform-model?view=roadmap`, `/platform`, and MCP now expose a first-class `roadmap` row for `docs/PLATFORM-ALL-THE-WAY-ROADMAP.md`, plus derived `epic`, `feature`, `branchesByEpic`, `testsByFeature`, and `defectsByEpic` projections from branch `epic`/`feature` fields, selected branch gates, branch doc-freshness evidence, and branch `defect` tags via the existing `defectCluster:*` projection. `/platform` now includes a dedicated epic view that reads through the same roadmap handler lane and shows per-epic branch, feature, defect-cluster, and gate summaries with a raw detail panel for the selected epic. Doc, test, and defect links to features/epics are currently inferred from active branch evidence rather than from standalone authored planning records. Milestones, acceptance criteria, and richer defect authoring remain later work.

### 10.2 Executable Roadmaps

- [X] Parse checkbox tasks from roadmap docs into platform task nodes.
- [X] Link checkbox tasks to code/test/doc/platform objects.
- [X] Track task status from platform evidence, not only Markdown text.
- [ ] Add roadmap validation:
  - [ ] every feature has acceptance criteria
  - [ ] every acceptance criterion has a gate
  - [ ] every feature has docs owner
  - [ ] every epic has branch/proposal status
- [ ] Add proposal target process `roadmap.update`.
- [L] Roadmap checkbox tasks are now modeled as task rows and graph nodes, and Markdown references now resolve to existing plugins, routes, capabilities, proposal IDs, branch IDs, governed docs, authored RVM/WCSS sources, JSON/WTOML config sources, and generic repo file/test nodes when the referenced workspace path exists. Nonexistent or non-repo tokens remain intentionally unlinked.
- [L] Roadmap and doc tasks now derive an evidence-backed status (`blocked`, `in-progress`, `ready`, `done`, `untracked`) from linked platform targets, modeled protecting gates, latest gate results, and open target gaps. Markdown checkbox state remains visible and authoritative as authored intent, while derived status tracks the live platform evidence separately.
- [L] `/platform` now includes an explicit roadmap-detail panel plus an epic-detail panel, both backed by `/api/platform-model?view=roadmap&id=...` with cached fallback to the in-page model state. Richer roadmap validation and authoring flows remain later work.
- [ ] Add proposal target process `epic.create`.
- [ ] Add proposal target process `feature.create`.
- [X] Add tests for this roadmap being ingested into roadmap/task nodes.

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

- [X] Add Branches view.
- [X] Add Change Sets view.
- [X] Add Candidate Snapshots view.
- [X] Add Runtime Revisions view.
- [X] Add Docs view.
- [X] Add Test Gates view.
- [X] Add Test Runs view.
- [X] Add Dependency Graph view.
- [X] Add Coverage Matrix view.
- [B] Add Defects view.
- [X] Add Defect Clusters view.
- [X] Add Telemetry view.
- [B] Add Sessions view.
- [X] Add Roadmap/Epics view.
- [X] Add Boundaries view.
- [X] Add Meta-System view.
- [L] `/platform` no longer tries to load the entire human console as one giant page. It now exposes functional page views for `overview`, `workflow`, `verification`, `knowledge`, `signals`, and `model` through the same `/platform` surface, with server-rendered navigation links so operators can load one area at a time.
- [L] The current human console renderer now replaces raw JSON dumps with paginated list tables plus property cards and linkable resource references where the target is already modeled. It is still the same `plugin.platform` console and handler lane, just split into lighter page-sized surfaces instead of one monolithic screen.
- [L] The current defect-cluster view is backed by existing `defectCluster` graph nodes and their relationships to branches, features, epics, and historically relevant gates. It does not claim the later full `defect` / `defectObservation` / `rootCauseHypothesis` model is complete.
- [L] The current telemetry view is backed by existing `telemetryMetric` graph nodes plus linked `verifies` / `verifiedBy` relationships and branch/change-set telemetry-impact hints. It does not claim the later live `telemetrySample` / `telemetryWindow` / detector model from Phase 8 is complete.
- [L] `Add Defects view.` is currently blocked on the later standalone defect model from Phase 7.3. The platform can project defect clusters today, but it does not yet expose first-class `defect`, `defectObservation`, `rootCauseHypothesis`, or fix-proposal rows that would make a dedicated defects view truthful.
- [L] `Add Sessions view.` is currently blocked on the later Phase 9 session/execution model. The current platform flow carries transient request/session metadata for witnesses and handlers, but it does not yet project first-class `session`, `execution`, `sessionTag`, or `executionArtifact` rows that would make a dedicated sessions view truthful.
- [L] The current dependency-graph view is backed by the existing platform-model `nodes` and `edges` projection rather than by the later dedicated `dependencyGraph` / `dependencyEdge` module kinds from Phase 6.1. It makes the already-modeled relationships inspectable in `/platform` without claiming the later incremental graph subsystem is complete.

### 12.2 RVM/WCSS Dogfooding

- [~] Move more Platform Console structure into `platform-console.rvm`.
- [X] Move all Platform Console styles into `platform-console.wcss`.
- [~] Build a renderer that can consume RVM surface declarations for internal platform pages.
- [~] Replace hand-authored HTML sections with rendered RVM surface tree.
- [X] Keep tests proving RVM identity and WCSS lowering.
- [X] Add platform gap when a platform page lacks RVM/WCSS source.
- [X] Add platform gap when generated CSS differs from WCSS source.
- [L] `plugins/platform/platform.test.js` now keeps an explicit proof that the console still compiles from `platform-console.rvm` and that the current lowering bridge still renders CSS with the `Generated from plugins/platform/platform-console.wcss` banner.
- [L] Current RVM dogfooding is partial but real: `plugins/platform/platform-console.rvm` now authors the platform page split itself through `PlatformOverviewPage`, `PlatformWorkflowPage`, `PlatformVerificationPage`, `PlatformKnowledgePage`, `PlatformSignalsPage`, and `PlatformModelPage`, each with authored `pageId`, `title`, `summary`, and child-surface membership.
- [L] The authored page tree now also owns the current supplemental platform pages: `PlatformBridgesPage`, `PlatformGovernancePage`, `PlatformSemanticsPage`, `PlatformPackageCoexistencePage`, `PlatformPackageConvergencePage`, and `PlatformPackageApplyPreviewPage` now declare their `pageId`, `modelView`, title, summary, and `supplementalPageSource` in `plugins/platform/platform-console.rvm`, so `/platform` navigation and page selection no longer depend on a JS-only supplemental page registry.
- [L] Those supplemental pages now also own more of their visible schema in RVM: the same page surfaces author their current `columns`, `rowFields`, `primaryFields`, detail titles, long-tail titles, empty states, and page size, and `plugins/platform/platform-page.js` now renders those bridge/governance/semantics/package tables and detail cards from authored props instead of a JS-only header/field inventory.
- [L] The supplemental pages now also own their visible section split in RVM: each of `PlatformBridgesPage`, `PlatformGovernancePage`, `PlatformSemanticsPage`, `PlatformPackageCoexistencePage`, and `PlatformPackageConvergencePage` now authors page-level `summaryCards` plus explicit list/detail child surfaces in `plugins/platform/platform-console.rvm`, and those child surfaces now declare the same generic `listSource` / `detailSource` props used elsewhere in the console instead of relying on separate supplemental-only renderer props.
- [L] The authored page tree now also owns more of the visible section split instead of just top-level tabs. Overview includes authored summary/tree/map/profile sections, workflow includes authored branch/proposal/change-set command panels, verification includes authored stream/red-green/test-run panels, and model includes authored profile/coverage sections.
- [L] The authored surface-tree region is now more RVM-owned too: `PlatformAuthoredSurfaceTree` authors `surfaceFields`, and `plugins/platform/platform-page.js` now renders each top-level page card from those authored fields instead of hardcoding the visible `Process` / `Projection` / `Sections` lines in a bespoke JS block.
- [L] `plugins/platform/platform-console-layout.js` now compiles that authored page tree into a stable read model, and `plugins/platform/platform-page.js` walks the authored `childSurfaces` when choosing `/platform` navigation, page titles/subtitles, section ordering, and whether authored operator forms need client behavior. Many rendered section shells, including the generic workflow/verification/knowledge/signal/model detail regions, now also take their visible titles, summaries, classes, and identity attributes from those authored surfaces.
- [L] Workflow, verification, knowledge, signal, and model detail are now more RVM-owned internally as well: `PlatformWorkflowDetail` authors nested `PlatformWorkflowPrimaryPanel`, `PlatformWorkflowRelatedPanel`, `PlatformWorkflowSnapshotHistory`, and `PlatformWorkflowEditHistory` child surfaces; `PlatformVerificationDetail` authors nested `PlatformVerificationPrimaryPanel`, `PlatformVerificationRelatedPanel`, `PlatformVerificationRunHistory`, `PlatformVerificationBuildHistory`, and `PlatformVerificationBuildErrors`; `PlatformKnowledgeDetail` authors nested `PlatformKnowledgePrimaryPanel`, `PlatformKnowledgeRelatedPanel`, `PlatformKnowledgeSections`, and `PlatformKnowledgeTasks`; `PlatformSignalDetail` authors nested `PlatformSignalPrimaryPanel`, `PlatformSignalRelatedPanel`, and `PlatformSignalRelationships`; and `PlatformModelDetail` authors nested `PlatformModelPrimaryPanel` and `PlatformModelRelationships`. The renderer now uses those authored nested surfaces for the visible workflow, verification, knowledge, signal, and model detail subregions.
- [L] The main top-level table surfaces now also carry more authored behavior than before: `plugins/platform/platform-console.rvm` declares `columns` and `emptyState` props for map/profile/workflow/verification/knowledge/signals/model/gap/coverage/red-green tables, `plugins/platform/platform-console-layout.js` preserves arbitrary authored props in the surface read model, and `plugins/platform/platform-page.js` uses those authored props when rendering table headers and empty states.
- [L] Top-level row-window and default page-size policy are now more authored too: the current console RVM declares `rowLimit` for non-paginated tables and `pageSize` for paginated list surfaces, and the renderer now uses those props instead of hardcoded `12` / `20` defaults when no explicit `limit` query is supplied.
- [L] Detail-table metadata now follows the same pattern for the currently modeled child tables: workflow snapshot/edit history, verification run/build/error history, knowledge sections/tasks, and signal/model relationships now declare authored `columns`, `emptyState`, and `rowLimit` props in `plugins/platform/platform-console.rvm`, and the renderer consumes those props instead of hardcoded detail-table defaults.
- [L] Workflow detail cards are now more RVM-owned as well: `PlatformWorkflowPrimaryPanel` authors the visible branch/change-set/proposal property-card titles and field schemas, while `PlatformWorkflowRelatedPanel` authors the related-resource card titles and source lists for branch/change-set/proposal detail. The renderer now consumes those surface props instead of hardcoded workflow detail card schemas.
- [L] Verification detail cards are now more RVM-owned too: `PlatformVerificationPrimaryPanel` authors the visible gate/runtime-revision/candidate-snapshot/test-run property-card titles and field schemas, while `PlatformVerificationRelatedPanel` authors the gate/runtime-revision/candidate-snapshot/test-run related-card titles and source lists that the current verification renderer can support directly. Verification stream phrasing is now authored too: `@href` property rows can consume authored `{ href, title }` link objects, so the visible backend/test stream link text no longer falls back to a generic renderer label.
- [L] The current verification surface truth now includes the newer authored policy/queue/execution and persistence/cache metadata too: `PlatformVerificationPage` summary cards count `verificationPolicies`, `verificationQueue`, and `verificationExecutions`; `PlatformVerificationStatusBanner` authors queue/policy/persistence backend fields; and the existing verification detail surfaces now also cover authored verification-policy, verification-execution, persistence, verification-status, and cache-hit fields through the shared page renderer path.
- [L] The standalone verification-streams region is now more RVM-owned too: `PlatformVerificationStreams` authors its property-card title and field schema, and the renderer binds the shared test-run/backend stream link record through that authored surface instead of hardcoding a bespoke table.
- [L] Knowledge detail cards are now more RVM-owned too: `PlatformKnowledgePrimaryPanel` authors the visible document/roadmap-task/epic/feature property-card titles and field schemas, while `PlatformKnowledgeRelatedPanel` authors the related-resource card titles and source lists for document references, linked roadmap targets, and epic/feature resource links.
- [L] Signal and model detail cards are now more RVM-owned too: `PlatformSignalPrimaryPanel` authors the visible gap/signal property-card titles and field schemas, `PlatformSignalRelatedPanel` authors the gap follow-up/selector-drift card titles and source lists, and `PlatformModelPrimaryPanel` authors the platform-object property-card title and field schema. The signal/model relationship tables remain separately authored child surfaces.
- [L] Knowledge and signal detail selection order are now a bit more RVM-owned too: `PlatformKnowledgeDetail` authors `detailSelectionSources = "docs|roadmapTasks|epics|features"` and `PlatformSignalDetail` authors `detailSelectionSources = "gaps|telemetryMetric|defectCluster|boundary"`, and `plugins/platform/platform-page.js` now resolves the default or requested record by walking those authored source lists instead of hardcoding the current knowledge/signal lookup order in JS.
- [L] Workflow and verification detail selection order are now more RVM-owned too: `PlatformWorkflowDetail` authors `detailSelectionSources = "branches|changeSets|proposals"` and `PlatformVerificationDetail` authors `detailSelectionSources = "verificationPolicies|verificationQueue|verificationExecutions|testGates|runtimeRevisions|testRuns|testReports|candidateSnapshots"`, and `plugins/platform/platform-page.js` now routes both pages through the same authored source-walk helper instead of keeping dedicated `findWorkflowDetail(...)` / `findVerificationDetail(...)` selectors with hardcoded order in JS.
- [L] Model detail selection now uses that same authored path too: `PlatformModelDetail` authors `detailSelectionSources = "nodes"`, and the renderer now resolves the selected platform object through the shared authored source-walk helper instead of leaving `model` on a separate `findModelDetail(...)` JS path.
- [L] Static form-select options are now a bit more RVM-owned too: authored form surfaces can declare `${source}Options` maps for `@select:...` fields, `plugins/platform/platform-page.js` resolves those before falling back to dynamic model-backed option sources, and `PlatformChangeSetLifecyclePanel` now authors `lifecycleActionsOptions = "Reject=reject|Abandon=abandon"` instead of leaving that static menu in a JS switch.
- [L] Dynamic form-select options are now more RVM-owned too: authored form surfaces can declare `${source}Source`, `${source}ValuePath`, `${source}LabelPath`, optional `${source}Where`, and `${source}AttrFields` props for `@select:...` fields, and `plugins/platform/platform-page.js` now resolves those model-backed options before falling back to the older JS switch. The current change-set, proposal-review, proposal-action, and test-gate selectors now author their option records in `plugins/platform/platform-console.rvm`, including the proposal action `data-sample-body` attribute used by the client-side JSON scaffold sync.
- [L] Simple JSON submit forms are now a bit more RVM-owned too: authored form surfaces can declare `submitPath`, `submitMethod`, `submitBodyFields`, `requiredFieldMessages`, `successMessage`, and `errorMessage`, and `plugins/platform/platform-page.js` now emits one generic `data-platform-submit-spec` binder for those forms instead of keeping separate JS submit handlers for every simple branch/change-set mutation. The current branch-create, change-set-create, change-set-edit, and change-set-apply panels now author their request shape in `plugins/platform/platform-console.rvm`.
- [L] Response-driven submit forms now use that authored submit-spec path too: authored form surfaces can declare `successMessageTemplate` placeholders that read response JSON and form values, and the generic binder now drives the current change-set validate/lifecycle and test-run panels instead of keeping separate JS handlers for those paths. Proposal create/review remain bespoke because they still need extra JSON-scaffold and submitter-specific behavior.
- [L] Proposal create/review now use the same authored submit/spec path too: authored form surfaces can declare `invalidFieldMessages` plus `fieldSyncs`, and the generic binder now handles JSON body parsing, select-to-textarea scaffold sync, and submitter-aware paths for the current proposal create/review panels. That removed the last bespoke platform form submit handlers from `plugins/platform/platform-page.js`.
- [L] Client-script activation is now a bit less JS-tag-driven too: the platform page binder now scans for authored `data-platform-submit-spec` / `data-platform-field-syncs` forms, and `surfaceNeedsClientScript(...)` keys off authored submit/sync metadata instead of treating `clientAction` as the thing that makes a form interactive. The current RVM still keeps `clientAction` as descriptive metadata, but it is no longer the behavioral switch.
- [L] Current local verification for these console-only tranches sometimes needs to be narrower than `node --test plugins/platform/platform.test.js`: the broader suite in this worktree can fail in unrelated verification/model or temp-workspace areas while the authored console rendering path is still green. When that happens, keep the failing assertions documented and verify the current RVM console slice with targeted page/layout tests rather than pretending the wider failure is caused by the console change.
- [L] Current local Git hygiene for console tranches can also be messier than ideal: if `plugins/platform/platform-page.js` already carries unrelated in-flight edits, even a path-limited commit on that file can bundle adjacent work that is not strictly part of the tiny console slice you meant to land. Treat that file as shared in-flight state, audit `git diff HEAD~1 HEAD -- plugins/platform/platform-page.js` after each commit, and document when a tranche commit absorbed nearby work beyond the narrowly intended change.
- [L] Computed property regions are now a bit more RVM-owned too: `PlatformVerificationStatusBanner` now authors `propertyRecordSource = "verificationStatus"`, and `plugins/platform/platform-page.js` renders that through one computed property-section path instead of a bespoke `verificationPanelKind=statusBanner` branch. The current computed-record catalog is still tiny, but the section now follows the same property-card shape as the other authored regions.
- [L] Primary detail surfaces now also author the long-tail property card title through `longTailCardTitle`, and the renderer consumes that prop instead of hardcoding the fallback `Properties` heading for leftover scalar fields.
- [L] The currently active long-tail exclusion rules are now more RVM-owned too: workflow, verification, knowledge, and gap detail primary surfaces author the extra object-specific field names that should stay out of the generic long-tail card, and the renderer consumes those props instead of hardcoding those exclusion lists by surface name.
- [L] The scalar-only long-tail filter policy is now more RVM-owned too: primary detail surfaces author `longTailValueKinds`, and the renderer consumes that prop instead of hardcoding the current scalar/scalar-list inclusion rule for leftover property values.
- [L] The current modeled related-resource cards now render directly from authored card specs too: workflow, verification, knowledge, and signal detail panels no longer fall back to hardcoded list/text card compositions when the current RVM props are present.
- [L] The current modeled property-card field selection now renders directly from authored field schemas too: workflow, verification, knowledge, signal, and model detail cards no longer duplicate their visible field lists in JS fallback arrays, leaving JS responsible for record shaping but not the current field inventory/order.
- [L] The current authored property-card value resolution is now a bit less JS-shaped too: schema paths can fall back across `a||b` alternatives and `statusExit` can format the current gate result inline, which removed the live `lastResultLabel` and `evidenceSummary` helper fields from the current detail-card record shaping path.
- [L] Top-level paginated list surfaces are now more RVM-owned too: workflow, verification, knowledge, signals, and model list surfaces author `rowFields`, `sortOptions`, and `defaultSort` props, and the renderer uses those props both for row extraction and for query-driven `sort` / `dir` behavior that is preserved through pagination links. The current sort controls are still a simple generated link strip rather than a richer authored widget.
- [L] The authored page split now also drives page-scoped platform-model slices: each top-level page authors a `modelView` prop in `plugins/platform/platform-console.rvm`, `filterPlatformModel` exposes matching `overview` / `workflow` / `verification` / `knowledge` / `signals` / `model` page projections, and `renderPlatformPage` now renders `/platform?view=...` from that page slice instead of always carrying the full console model object into every page render.
- [L] The top-of-page summary strip is now more RVM-owned too: top-level page surfaces author `summaryCards` schemas in `plugins/platform/platform-console.rvm`, `plugins/platform/platform-page.js` renders those metrics through generic `count`, `countKind`, and `countWhere` summary modes instead of a hardcoded page-id switch, and the overview `PlatformConsoleSummary` region now points back at the authored overview summary via `summaryPageId` instead of duplicating a JS summary table.
- [L] More authored tables now point straight at stable concept ids instead of JS-built `{ id, title }` wrappers: the map and top-level paginated list surfaces now render `id@concept` directly, and the current workflow snapshot history, verification run/build histories, branch/change-set red-green tables, knowledge task table, and signal/model relationship tables now render authored `...Id@concept` / `from@concept` / `to@concept` fields without per-row link-wrapper shaping in `plugins/platform/platform-page.js`.
- [L] More authored verification/coverage links now avoid bespoke wrapper objects too: runtime revision detail now renders `id@concept` directly, coverage rows now render `gateId@concept` and `targetId||targetLabel@concept`, and the current verification stream/property cards now author plain URL fields. `plugins/platform/platform-page.js` now lets string `@href` values use the authored field label as link text, which removed the remaining verification stream and coverage link-wrapper objects from the current renderer path.
- [L] The slower top-level inventory tables are now more RVM-owned and more paginated too: map/profile/gap/coverage/branch-red-green/change-set-red-green surfaces now author `listSource`, `rowFields`, `sortOptions`, `defaultSort`, and `pageSize` in `plugins/platform/platform-console.rvm`, and `plugins/platform/platform-page.js` renders them through the same shared paginated list path as the other split console pages instead of keeping a separate non-paginated `tableSource` lane.
- [L] Nested history and relationship tables are now more RVM-owned too: workflow snapshot/edit history, verification run/build/error history, knowledge sections/tasks, and signal/model relationship surfaces now author `rowFields`, and the detail renderers normalize records into those authored schemas instead of hardcoded per-table row extraction.
- [L] Current table headers and empty-state phrasing are now a bit more RVM-owned too: the current top-level lists/tables and nested history/relationship tables now render through authored `columns` and `emptyState` props instead of still passing duplicate fallback header/empty-message strings from `plugins/platform/platform-page.js`, and the shared workflow snapshot table now also authors a `changeSetEmptyState` variant so both branch and change-set detail reuse the same table surface without leaving that context text stranded in JS.
- [L] While extending that detail-table path, a stray `relationshipsSurface` reference in the knowledge roadmap-task detail branch was removed. The bug was not user-visible in the current page tests because that branch does not render a relationships table today, but it would have thrown on that selection path.
- [L] The top-level lifecycle and branch boards are now more RVM-owned too: `PlatformLifecycleBoard` and `PlatformBranchBoard` author their board source, lane metadata fields, chip title paths, chip field schemas, per-lane item limits, and empty-state phrasing in `plugins/platform/platform-console.rvm`; `plugins/platform/platform-model.js` now projects a `lifecycleBoard` alongside `branchBoard`; and `plugins/platform/platform-page.js` renders both regions through one generic authored board path instead of per-surface hardcoded chip composition.
- [L] Related-resource list cards are now a bit more RVM-owned too: workflow, verification, knowledge, and signal related panels author `cardItemLimit` plus per-card empty-state phrasing maps in `plugins/platform/platform-console.rvm`, and `plugins/platform/platform-page.js` now uses those props to cap rendered list length, show overflow summaries, and avoid the remaining generic `No linked resources.` / `No entries.` fallback strings for the currently authored cards.
- [L] Knowledge relation cards are now more RVM-owned too: `PlatformKnowledgeRelatedPanel` can author typed document/code relation cards such as `references.authoredDocLinks@authoredLink` and `references.authoredCodeLinks@authoredLink`, and the shared link-card renderer now accepts authored `{ id, label }` entries so WTOML-authored knowledge relations render as labeled, linkable platform cards instead of falling back to opaque strings.
- [L] Knowledge related-panel composition is now RVM-first too: `PlatformKnowledgeRelatedPanel` now declares explicit child surfaces for document, roadmap-task, epic, and feature card groups, and `plugins/platform/platform-page.js` selects those card groups by authored `detailKinds` metadata instead of switching across `documentLinkCards` / `roadmapTaskLinkCards` / `epicLinkCards` / `featureLinkCards` prop names on one JS-shaped container.
- [L] Empty-detail fallback cards are now a bit more RVM-owned too: workflow, verification, knowledge, signal, and model detail surfaces now author `emptyTitle` / `emptyState` props in `plugins/platform/platform-console.rvm`, and `plugins/platform/platform-page.js` renders those no-selection cards through a shared helper instead of leaving those messages hardcoded in the detail branches.
- [L] Detail region layout is now a bit less JS-owned too: workflow, verification, knowledge, signal, and model detail renderers now pass rendered child sections through one shared `renderAuthoredDetailLayout(...)` helper that follows the authored child-surface order from `plugins/platform/platform-console.rvm` instead of hardcoding each detail page’s split-column and stacked-section layout separately. The current change-set workflow detail now follows that authored order too, so `Candidate Snapshots` renders before `Staged Edits` because the RVM surface declares it first.
- [L] Those same detail renderers are now a bit more RVM-first about section metadata too: `plugins/platform/platform-page.js` resolves workflow, verification, knowledge, signal, and model detail subpanels by authored child-surface name and relies on the RVM-authored titles, summaries, and kinds already declared in `plugins/platform/platform-console.rvm` instead of duplicating that visible copy inline in JS.
- [L] Top-level paginated list regions are now a bit less JS-owned too: workflow, verification, knowledge, signal, and model list surfaces now author a `listSource` prop in `plugins/platform/platform-console.rvm`, and `plugins/platform/platform-page.js` renders them through one shared `renderAuthoredListSection(...)` helper that resolves the authored source, applies the already-authored sort/pagination semantics, and renders rows through the existing `rowFields` schema instead of maintaining five separate list renderers.
- [L] The simpler operator panels are now a bit more RVM-owned too: branch creation, change-set create/edit/validate/apply/lifecycle, and verification test-run forms now author `formId`, `statusId`, `submitLabel`, `formFields`, and related default/placeholder/row metadata in `plugins/platform/platform-console.rvm`, and `plugins/platform/platform-page.js` renders them through one shared authored form path that preserves the existing field names and form ids for the current client handlers.
- [L] The more complex proposal/review forms are now more RVM-owned too: proposal creation and review surfaces now author their form ids, field schemas, placeholders/defaults, and review-button metadata in `plugins/platform/platform-console.rvm`; the shared form renderer now supports sourced option attributes and multi-button submit strips; and the existing client script still reuses the authored form ids/names for proposal body syncing and approve/reject handling instead of relying on bespoke HTML assembly.
- [L] Those authored operator forms now also declare their current client behavior in `plugins/platform/platform-console.rvm` via `clientAction`, and `plugins/platform/platform-page.js` now decides whether to attach the platform authoring script by walking authored form metadata instead of a hardcoded surface-name allowlist. The request payload shaping is still handler-specific, but RVM now decides which current forms need client wiring.
- [L] Some of the remaining non-detail region dispatch is now less surface-name-bound too: the current overview summary strip, authored surface tree, lifecycle/branch boards, and verification stream card now render because their authored surfaces declare `summaryPageId`, `surfaceFields`, `boardSource`, or authored property-card props/values, rather than because `plugins/platform/platform-page.js` recognizes those specific surface names first.
- [L] The main detail-region entry routing is now less surface-name-bound too: workflow, verification, knowledge, signal, and model detail surfaces declare `detailSource` in `plugins/platform/platform-console.rvm`, and `plugins/platform/platform-page.js` now enters those detail renderers from authored props rather than a hardcoded `Platform*Detail` name switch. The inner detail helpers still shape records by current object kind, so this is dispatch cleanup rather than full generic detail rendering.
- [L] The standalone verification-stream panel is now more RVM-owned too: `PlatformVerificationStreams` no longer relies on a `propertySource` branch in `plugins/platform/platform-page.js`; instead it authors `propertyCardTitle`, `propertyFields`, and static `propertyValues` in `plugins/platform/platform-console.rvm`, and the shared renderer now turns those authored values into the visible event-stream card.
- [L] Workflow and verification detail-kind selection are now a bit more RVM-owned too: `PlatformWorkflowDetail` and `PlatformVerificationDetail` author the current id-prefix taxonomy they use to recognize branch/change-set/proposal and gate/runtime-revision/candidate-snapshot/test-run selections, and `plugins/platform/platform-page.js` now reads those authored prefix lists instead of hardcoding the same strings inline. The later record-shaping and fallback behavior are still JS-owned.
- [L] Knowledge and signal detail-kind selection are now a bit more RVM-owned too: `PlatformKnowledgeDetail` now authors the current document/task/epic/feature discriminator fields/prefixes, and `PlatformSignalDetail` now authors the current gap prefix plus supported signal node kinds. `plugins/platform/platform-page.js` now reads those authored selectors instead of hardcoding the same strings inline, while the later detail record shaping remains JS-owned.
- [L] Those same detail selectors now also rely less on shadow JS defaults: the current workflow/verification/knowledge/signal/model detail entry path now expects the authored `detailSelectionSources`, id-prefix props, and discriminator fields already declared in `plugins/platform/platform-console.rvm`, rather than quietly carrying duplicate fallback source lists and selector strings in `plugins/platform/platform-page.js` for the currently supported console surfaces.
- [L] Some region-specific layouts and renderer dispatch still remain JS-backed by surface name, and a smaller set of authored cards still rely on JS helper shaping where the current renderer needs non-concept object formatting or richer aggregations than the current generic modes cover (for example `statusExit` objects and future richer link-label or summary computations), so this is still not full generic rendered-RVM replacement.
- [L] Platform console styling is now file-backed for the current supported subset: `plugins/platform/platform-style.js` reads `plugins/platform/platform-console.wcss`, lowers authored tokens/style selectors/media blocks through `plugins/platform/wcss-source.js`, and renders CSS from that authored file instead of constructing the console stylesheet in JS.
- [L] The current gap is intentionally narrow: it applies to modeled platform surfaces with ids beginning `surface:platform` and checks for attached `rvmSource` and `wcssSource` graph edges (`authoredBy` / `styledBy`). It catches platform pages that drift away from authored source ownership without claiming the later rendered-RVM or generated-CSS parity work is done.
- [L] The current generated-CSS drift gap is selector-coverage-backed: it compares selectors declared in `plugins/platform/platform-console.wcss` against selectors emitted by the current file-backed lowering path and emits a `platform-css-drift` gap when they differ. The live console no longer carries the earlier selector drift, but the check remains in place to catch future authored/rendered divergence.
- [L] The current WCSS lowering path is intentionally narrow rather than a full generic compiler: `plugins/platform/wcss-source.js` supports the subset the platform console now uses (`theme`, `tokens`, flat `style` declarations, and `media` blocks with nested styles). If wider WCSS language features land later, that parser will need to expand or be replaced by a shared compiler.

### 12.3 MCP Parity

- [X] Add MCP views for each Platform Console view.
- [X] Ensure every human mutation has an MCP proposal equivalent.
- [X] Ensure MCP cannot bypass proposal/change-set authority.
- [ ] Add MCP tool:
  - [X] `platform.branch`
  - [X] `platform.changeSet`
  - [X] `platform.read { view: "testGates" }`
  - [X] `platform.read { view: "testRuns" }`
  - [X] `platform.test`
  - [X] `platform.docs`
  - [X] `platform.telemetry`
  - [B] `platform.defects`
  - [X] `platform.roadmap`
- [X] Add tests for human/MCP parity.
- [L] `platform.docs` now routes through the shared `/api/platform-model?view=docs` handler lane and returns governed docs, doc sections, doc tasks, and roadmap-task rows for the same modeled documentation surfaced on `/platform`. Dedicated defect MCP coverage remains later work.
- [L] `platform.roadmap` now routes through the shared `/api/platform-model?view=roadmap` handler lane and exposes the currently implemented roadmap surface: the ingested `docs/PLATFORM-ALL-THE-WAY-ROADMAP.md` doc, its sections, checkbox task rows, evidence-backed derived task status, branch-metadata-backed `roadmap` / `epic` / `feature` projections, aggregated `testsByFeature` coverage rows, and aggregated `defectsByEpic` coverage rows backed by `defectCluster` targets. Milestones, acceptance criteria, and deeper planning coverage remain later work.
- [L] `platform.telemetry` now routes through the shared `/api/platform-model?view=telemetry` handler lane and exposes the current telemetry surface truthfully: `telemetryMetric` graph nodes, telemetry-linked edges, branch/change-set telemetry-impact summaries, and telemetry-protecting gates/latest gate results. It does not claim the later live `telemetrySample` / `telemetryWindow` / detector model from Phase 8 is complete.
- [L] `platform.defects` is currently blocked for the same reason as the standalone Defects view: the current platform can project `defectCluster` coverage, but it still does not expose first-class `defect`, `defectObservation`, `rootCauseHypothesis`, or fix-proposal rows that would make a dedicated defects MCP lane truthful.
- [L] Current parity coverage compares normalized direct platform-handler responses against MCP tool results for the implemented docs, roadmap, telemetry, branch, change-set, proposal-create, and test-run/list/read flows. Future defect and broader planning-model MCP lanes will need their own parity extensions as those surfaces land.
- [L] Current `/platform` mutation surfaces all have MCP equivalents on the shared handler lane: proposal create/review maps to `platform.proposal`, branch creation maps to `platform.branch create`, change-set create/edit/validate/apply/reject/abandon maps to `platform.changeSet`, and explicit or selected test execution maps to `platform.test run` / `runSelected`.
- [L] Current `/platform` read surfaces all have MCP equivalents on the shared handler lane: proposals, branches, change sets, candidate snapshots, runtime revisions, docs, roadmap/epics, telemetry, test gates, test runs, and red/green state are exposed through `platform.read`, `platform.docs`, `platform.roadmap`, `platform.telemetry`, `platform.branch`, `platform.changeSet`, and `platform.test` depending on the scope. Future defect, boundary, session, and meta-system surfaces will need their own MCP coverage when those console views exist.
- [L] Current MCP authority parity is enforced at the shared-handler layer: the implemented mutation tools only target `plugin.platform` handlers and HTTP methods that are already exposed on the human surface, so MCP does not gain a stronger mutation lane than `/platform`. Richer actor/policy authorization remains later Phase 13 work.
- [L] The live docs model now projects explicit `docIndex`, `docReference`, `docDependencies`, and `docsByPlatformObject` rows from governed targets and resolved Markdown references to routes, plugins, capabilities, proposal IDs, branch IDs, governed docs, authored RVM/WCSS sources, JSON/WTOML config sources, and generic repo file/test nodes when the referenced workspace path exists.

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

- [X] Build candidate snapshots from change-set overlays.
- [X] Route new requests to active valid runtime revision.
- [X] Preserve in-flight revision references.
- [X] Add backend revision events.
- [X] Add runtime revision view.
- [X] Add tests for backend behavior changing from RVM without process restart.
- [X] Add tests for failed candidate preserving old behavior.
- [L] The runtime revision view now lives inside `/platform` as a filterable revision-detail panel backed by `/api/platform-model?view=runtimeRevisions&id=...`, alongside the live backend revision stream. A separate dedicated revision route remains optional follow-on UX.

### Milestone C: Docs Live Model V1

- [X] Ingest Markdown docs.
- [X] Build doc/object dependency edges.
- [~] Mark docs stale on related changes.
- [X] Add doc freshness gaps.
- [X] Add docs view.
- [ ] Add LLM documentation obligations.
- [X] Add tests for stale/fresh docs.

### Milestone D: Test Gate V1

- [~] Discover test gates.
- [~] Run tests as platform executions.
- [~] Capture test artifacts.
- [~] Link gates to changed objects.
- [~] Run dependency-aware selected tests.
- [X] Add red/green view.
- [X] Add tests for affected test selection.
- [L] Current V1 exposes per-gate `lastResult`, witness-backed stdout/stderr/TAP/JUnit artifacts, derived `testSuite` / `testCase` rows, a test-runs panel, on-demand selected-gate execution through the shared HTTP/MCP/platform-console path, latest-result state, and scope-specific branch/change-set red/green summaries in the platform model and console. It is not yet an automatically executed dependency-aware red/green orchestration view with durable artifact-backed history.

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
- [X] Test red/green is visible as platform state.
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
