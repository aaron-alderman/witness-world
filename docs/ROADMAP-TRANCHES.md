# Roadmap by Tranche

This document exports the current roadmap as topic/capability tranches instead of one long seam inventory.

It is a planning document, not a replacement for the source specs.

Primary sources:

- [ROADMAP.md](C:\Users\aaron\Documents\world\ROADMAP.md)
- [BASELINE.md](C:\Users\aaron\Documents\world\BASELINE.md)
- [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md)
- [docs/BACKEND-SEAMS.md](C:\Users\aaron\Documents\world\docs\BACKEND-SEAMS.md)

## How To Use This

- Read the tranche overview first to understand sequencing.
- Read the tranche details to see shipped base, next outcomes, and dependencies.
- Use the source specs above for exact API, DSL, and runtime-contract details.

## Tranche Overview

| Tranche | Theme | Primary Capability Areas | Current Status |
| --- | --- | --- | --- |
| 0 | Baseline and honesty floor | Runtime spine, diagnostics, explicit seams, authored demo composition | active base |
| 1 | Capability core and composition | Capability objects, placement, installs, local catalog, plugin/package contract | partial |
| 2 | Context, identity, and authority | Context boundaries, naming, stewardship, proposals, shared-governance paths | partial |
| 3 | Authoring surfaces and editing grammar | Bootstrap, editable-everywhere grammar, live inspection, page-local mutation | partial |
| 4 | Runtime execution and inspection | Generic host/runtime, process execution, route/serve, inspection, live evolution | partial |
| 5 | Practical backend capabilities | Runtime config, files, uploads, SQL, jobs, search, outbound/inbound integrations, notifications, MCP | active |
| 6 | Shells, persistence, and ecosystem | Runtime profiles, desktop shell, persistence, runtime plugins, MCP product surface, trust/store | active |
| 7 | Sourcery and guided composition | Contextual guidance, concept reveal, ambient curation | partial |
| 8 | Canvas, layout, and rendering follow-on | Canvas history/undo/governance follow-on, layout vocabulary, rendering depth | ongoing |

## Tranche 0. Baseline and Honesty Floor

### Goal

Keep one truthful runtime baseline while later capability slices expand around it.

### Shipped Base

- witnessed state and replayable projections
- generic host startup through `serverRunner` + `serve`
- live projection refresh
- process tracing and process view
- bootstrap recovery into a runnable app
- pluginized maintained demo on `minimal` with authored runtime-plugin installs
- explicit runtime profile/bundle diagnostics

### Required Invariants

- no fake core seam should be normalized as product truth
- app semantics should live in the world/model, universal runtime infrastructure, or explicit plugin boundaries
- compatibility bridges must stay visible as bridges

### Immediate Work

- preserve diagnostics and runtime explanation quality as more surfaces become profile-gated
- keep reducing remaining handler-set/demo compatibility seams
- avoid reintroducing hidden app logic into generic host/runtime code

### Dependencies

- none; this is the operating floor for every later tranche

## Tranche 1. Capability Core and Composition

### Goal

Turn capabilities and plugins into first-class compositional units rather than hidden wiring.

### Scope

- capability object model
- capability placement and install/remove
- local catalog/store read models
- plugin/package discovery and runtime composition
- capability authoring as part of the product story

### Shipped Base

- authored `capability` objects in model and DSL
- typed capability facets: `publicApi`, `config`, `internals`, `authority`, `placement`
- install/remove flows onto `context`, `serverRunner`, and route-root `Page`
- bootstrap capability authoring/install/remove forms
- local plugin package discovery through `plugins/<plugin-id>/plugin.json`
- startup-local runtime plugin activation and runner-authored `runtimePlugin.install` / `runtimePlugin.remove`
- runtime plugin availability, review, and composition-preview reads

### Next Outcomes

- fuller catalog/store lifecycle beyond the current local projection
- stronger install-time compatibility reasoning across versions, authorities, and targets
- explicit authored migration off placeholder legacy capability synthesis
- cleaner plugin/package authoring semantics over the current manifest-first local boundary

### Key Decisions In Flight

- whether plugin/package authoring becomes a first-class authored noun over patch/change-set lowering
- how far to push package semantics into platform-owned language versus keeping file-level patch as the primitive

### Dependencies

- tranche 0 baseline honesty
- tranche 2 authority for governed install/remove flows
- tranche 6 ecosystem/trust work for broader store behavior

## Tranche 2. Context, Identity, and Authority

### Goal

Make context the real boundary for names, authority, composition, and governed mutation.

### Scope

- identities and sessions
- `homePerspective` / `homeContext`
- context ownership and parentage
- bindings, exports, imports, and contextual resolution
- stewardship
- generic proposal create/approve/reject
- shared-governance mutation flows across product surfaces

### Shipped Base

- first-class authored `context`, `perspective`, `stewardship`, and `proposal`
- cookie-backed identity/session flow
- context alias/export/import rows and first contextual-ref lowering
- generic bootstrap authority derivation
- proposal-aware mutation slices on live inspector, Todo, widget editor, canvas, shared asset attach/detach, and Eden surfaces

### Next Outcomes

- extend context semantics beyond the current covered authoring surfaces
- unify remaining app-specific mutation routes under the same authority/proposal path
- decide the long-term fate of canonical-id compatibility sugar
- strengthen personal/perspective-local semantics beyond route-by-route convention
- add operator-grade identity/bootstrap recovery

### Dependencies

- tranche 0 baseline
- tranche 3 authoring surfaces for better governed editing UX
- tranche 4 runtime semantics for broader route/process-based enforcement

## Tranche 3. Authoring Surfaces and Editing Grammar

### Goal

Move from a truthful bootstrap seam to a more local, compositional editing experience.

### Scope

- bootstrap and typed builders
- live inspection and handoff
- editable-everywhere page grammar
- page-local mutation affordances
- replace/upgrade/hide/show/save-back flows

### Shipped Base

- semi-internal bootstrap seam
- live-page widget inspection
- live-page hide/show for supported widgets
- proposal-aware live widget edits
- live widget-version activate/rollback
- handoffs into world/source/witness/process surfaces

### Next Outcomes

- replace/edit flows beyond the current narrow widget-update slice
- broader save/apply behaviors that write back through shared semantics
- richer page-local editing grammar instead of detached admin-only flows
- better mapping between discovered objects and the process/runtime state that owns them

### Dependencies

- tranche 2 authority/proposals
- tranche 4 runtime execution/inspection
- tranche 1 capability composition for install-at-point-of-need flows

## Tranche 4. Runtime Execution and Inspection

### Goal

Deepen the executable and inspectable runtime without reintroducing hidden runtime-specific app logic.

### Scope

- generic host/runtime spine
- frontend and backend execution ownership
- route/serve composition
- process/runtime tracing
- world/process/source inspection
- live evolution, migration, and rollback

### Shipped Base

- generic host over `serverRunner`
- authored process execution and tracing
- world graph, process view, process runs, and source reads
- route/serve composition
- first meaningful authored backend-program ownership
- widget-version live evolution baseline

### Next Outcomes

- reduce remaining handler-set and demo-model compatibility seams
- broaden executable authored backend behavior
- strengthen migration and rollback semantics beyond current widget-version and candidate-snapshot slices
- keep runtime/plugin/shell boundaries explicit as more product behavior becomes executable

### Dependencies

- tranche 0 baseline
- tranche 5 backend seams for practical runtime capabilities
- tranche 6 runtime profile and composition explanation

## Tranche 5. Practical Backend Capabilities

### Goal

Make common backend needs composable, inspectable capability seams instead of ad hoc handler code.

### Sub-Tranches

#### 5A. Foundation Contracts

- `runtime.config`
- provider-adapter contract
- side-effect witness contract
- backend authority contract

#### 5B. Files and Uploads

- `fs.blob`
- `fs.stream`
- `upload.asset`
- local-disk provider path
- private/public hosting rules
- ingestion, thumbnail, and derived-text first slice

#### 5C. Data and Async Substrate

- `db.sql`
- `jobs.queue`
- `search.index`

#### 5D. Identity and External Integrations

- `auth.oauth`
- `http.outbound`
- `webhook.inbound`
- `notify.email`
- `notify.sms`

#### 5E. Product Honesty and Operability

- diagnostics
- provider/status inspection
- repair/retry flows
- explicit automation/operator transport through MCP

### Shipped Base

- `runtime.config`
- `fs.blob`
- `fs.stream`
- `upload.asset`
- `db.sql` with SQLite (`preview` Postgres/MySQL: resolve + connection-test only)
- `jobs.queue`
- `search.index`
- `auth.oauth` stub path plus real generic-OIDC, Google, and GitHub providers
- `http.outbound` stub + native-fetch path
- `webhook.inbound`
- `notify.email` stub path plus real generic-HTTP and SendGrid transports
- `notify.sms`
- a per-seam contract-coverage guard that freezes provider/witness/authority/config metadata for every backend seam
- first MCP operator/automation surface over real witnessed seams

### Next Outcomes

- deepen asset understanding and richer ingestion-derived product surfaces
- prove one serious hosted SQL provider (promote Postgres/MySQL from `preview` to full query/command/migrate) before broadening relational adapters
- prove a hosted asset/object-storage provider behind the existing `upload.asset`/`fs.blob` seam
- keep all external systems proxy-shaped and inspectable

### Dependencies

- tranche 1 capability core for capability framing
- tranche 2 authority for scoped backend mutation
- tranche 4 runtime ownership for executable route/backend behavior
- tranche 6 ecosystem/profile work for broader operability and review

## Tranche 6. Shells, Persistence, and Ecosystem

### Goal

Turn the platform into something locally ownable, remotely automatable, and explicitly extensible.

### Scope

- runtime profiles and bundle composition
- runtime plugins and package discovery/review
- MCP server/tool-install authoring and operations
- desktop shell
- persistence, backup, import/export, restore
- provenance/trust/compatibility
- future store/update lifecycle

### Shipped Base

- explicit runtime bundle/profile composition and diagnostics
- local plugin package contract rooted at `plugins/<plugin-id>/plugin.json`
- startup-local plugin activation plus runner-authored install intent
- bootstrap runtime-plugin install/remove/proposal flows
- runtime-plugin review/detail/composition-preview reads
- authored `mcpServer` and `mcpToolInstall` with stdio + HTTP transport
- first MCP tool catalog over real witnessed seams
- first desktop ownership shell
- first `WORLD_HOME` lifecycle contract
- backup/export/restore/import operator artifact flows

### Next Outcomes

- clearer product-facing explanation of profile-gated surface absence
- broader desktop-native ownership without forking the product personality
- runtime-plugin reconcile/repair flows
- broader ecosystem/store/update protocol with real trust/review channels
- convergence of blank-world bootstrap and maintained-demo runtime composition story
- continued removal of remaining demo compatibility seams

### Dependencies

- tranche 1 capability/plugin system
- tranche 4 runtime execution ownership
- tranche 5 backend seams for practical shell powers and operator flows

## Tranche 7. Sourcery and Guided Composition

### Goal

Make the platform learnable without inventing a fake simplified product.

### Scope

- contextual guidance
- step-aware and page-aware progression
- concept reveal
- ambient suggestions and curation

### Shipped Base

- bootstrap tutorial
- live-app overlay
- world-page guidance panel
- page-aware continuation and per-page disable/re-enable
- authored concept metadata on tutorial steps
- deterministic bootstrap-first next-step suggestions

### Next Outcomes

- broader scope model beyond page-level guidance
- context/widget/section/world-aware guidance
- richer concept graph beyond one tutorial path
- broader cross-surface ambient curation with honest explanations

### Dependencies

- tranche 2 identity/context
- tranche 3 editing grammar
- tranche 4 executable runtime/inspection

## Tranche 8. Canvas, Layout, and Rendering Follow-On

### Goal

Continue deepening live world interaction and presentation vocabulary after the current first slices.

### Scope

- canvas undo/redo/history follow-on
- selective undo
- large-log/timeline scaling
- world-graph/manual layout interplay
- stronger layout/style primitives
- richer rendering vocabulary

### Shipped Base

- first actor/perspective-scoped canvas undo/redo
- first canvas history/timeline slice
- shared-governance coverage on major canvas mutation paths

### Next Outcomes

- selective undo that preserves later winning claims
- larger-log virtualization and prefix projection improvements
- stronger world-graph/manual layout controls
- richer layout/style vocabulary without demo-specific cheats

### Dependencies

- tranche 2 authority
- tranche 3 editing grammar
- tranche 4 runtime execution and inspection

## Recommended Execution Order

1. Keep tranche 0 stable and honest.
2. Continue tranche 1 and tranche 2 together because capability composition and governed mutation depend on each other.
3. Expand tranche 3 only where tranche 2 authority/proposal and tranche 4 runtime ownership are already truthful.
4. Keep tranche 5 advancing as the practical backend substrate.
5. Use tranche 6 to make runtime composition, persistence, MCP, and ecosystem operations explicit and inspectable.
6. Let tranche 7 and tranche 8 continue as guided-composition and interaction follow-on work, not as substitutes for core seam work.

## Suggested Working Groups

### Group A. Composition Core

- tranche 1
- tranche 2
- plugin/package authoring model
- contextual naming and authority convergence

### Group B. Runtime and Editing

- tranche 3
- tranche 4
- executable backend ownership
- live editing grammar and inspection

### Group C. Practical Backend

- tranche 5
- provider-adapter work
- async/job/search/upload evolution

### Group D. Shells and Ecosystem

- tranche 6
- runtime profile/product explanation
- MCP operations surface
- persistence and desktop shell

### Group E. Learning and Interaction

- tranche 7
- tranche 8
- guidance, curation, canvas, layout, and rendering follow-on

## Completion Standard

No tranche item should be considered done unless it is:

- truthful in runtime behavior
- represented in the model/DSL or explicit plugin boundary where appropriate
- covered by tests at the right level
- visible in diagnostics or inspection when it changes system behavior
- not secretly relying on fake registries, hidden side stores, or compatibility bridges that were not called out

## Source Detail Map

- capability and plugin composition detail: [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md)
- practical backend sequencing and completion criteria: [docs/BACKEND-SEAMS.md](C:\Users\aaron\Documents\world\docs\BACKEND-SEAMS.md)
- current stable runtime contract: [BASELINE.md](C:\Users\aaron\Documents\world\BASELINE.md)
- master seam inventory and status: [ROADMAP.md](C:\Users\aaron\Documents\world\ROADMAP.md)
