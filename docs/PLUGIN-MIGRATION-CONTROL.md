# Plugin Migration Control

This document is the operational control surface for completing the plugin migration.
When plugin migration work restarts, this file is the target, not prior chat history or
ad-hoc tranche descriptions.

It is intentionally stricter than the earlier bundle-bridge roadmap. A tranche only counts as plugin-migration progress when it moves real runtime ownership into plugin package directories or removes a transitional internal/plugin-core ownership seam.

The target is not "more plugin infrastructure". The target is that almost every
product/example/runtime feature is owned by a plugin package.

In this document, `complete` means `almost everything plugin based`. That phrase is
deliberate: the runtime kernel, state/projection mechanics, generic dispatch, server
transport, and plugin loader remain core; product behavior, optional runtime surfaces,
backend capabilities, examples, and app-specific flows move behind plugin package
ownership.

This document should prevent expectation drift by separating:

- the completion target
- the current honest state
- the ordered roadmap from here to complete
- the tranche queue that moves the next largest ownership seam
- the evidence required before a box can be checked
- the work that explicitly does not count as progress

Use this file as the basis document for plugin migration. `ROADMAP.md`,
`docs/RUNTIME-BUNDLE-MIGRATION-PLAN.md`, and tranche prompts may provide supporting
context, but they do not override this file for migration scope, ordering, or done
criteria.

---

## 0. Roadmap Snapshot From Here To Complete

This is the short operational roadmap from the current repository state to
`complete = almost everything plugin based`. The detailed phases, gates, and evidence
rules below are the source of truth, but this section is the restart map: when work
resumes, choose the first unchecked ownership seam here unless a direct dependency
forces a smaller preparatory change.

Authoritative completion ladder:

1. Finish real ownership transfer.
   All product/example/backend/authoring behavior must be understandable from concrete
   `plugins/<id>/` directories. Meta plugins may aggregate dependencies, but they must
   not hide executable behavior.
2. Finish the remaining product/example audit.
   This is complete when `plugin.mcp`, `plugin.canvas`, `plugin.demo`, and
   `plugin.eden` are independently removable and understandable from their plugin
   directories first, and when any shared source files they import are proven generic
   rather than hidden product/page implementations. The first audit pass found shared
   source seams, so this gate is not final-complete yet.
3. Convert profile composition to plugin selection.
   `minimal` stays core ABI only. `full` becomes a compatibility preset expressed as
   first-party plugins/meta plugins, with bundle ids retained only as runtime
   composition details.
4. Thin bundle and handler registries.
   `src/runtime-bundles.js` and `src/runtime-bundle-handlers.js` must stop being
   feature catalogs. They may keep loader/composition/dispatch mechanics and stable
   core ABI only.
5. Enforce package boundaries.
   Focused tests must fail if optional routes, capabilities, surfaces, handlers, or
   product/example behavior reappear in core or in a catch-all plugin. Every executable
   plugin needs co-located tests.
6. Run the final audit.
   List intentional core exceptions, verify plugin removal or breakage removes/blocks
   the corresponding feature, and only then call the migration complete.

Current state:

- practical-backend has been decomposed into concrete backend child plugins
- broad authoring has been decomposed into child plugins, with bootstrap,
  tutorial, proposals, capability authoring, program authoring, server-runner
  authoring, MCP authoring, and authoring-core split
- `plugin.authoring` is now a meta package over authoring child plugins, with
  `plugin.authoring-core` owning the remaining generic authoring CRUD residue
- `plugin.mcp`, `plugin.canvas`, `plugin.demo`, and `plugin.eden` are now independently plugin-owned runtime/product/example packages
- profile composition now selects first-party plugins/meta plugins, with bundle ids
  retained as runtime composition details
- runtime profile defaults and first-party package catalog metadata now live in
  `store/seeds/runtime-profiles.json` and
  `store/seeds/first-party-plugin-catalog.json`
- `plugins/` is package-only: root-level first-party registry/service/capability
  singleton files have been removed and boundary tests keep them absent
- bootstrap shell rendering and tutorial guide/content/client helpers now live in
  `plugins/bootstrap` and `plugins/tutorial`, with old `src/` paths reduced to
  compatibility facades
- inspect world graph projection, process view/run rendering, and widget page rendering
  now live in `plugins/inspect`, with compatibility exports left for old `src/` paths
- `src/widgets.js` is now classified as generic authored-widget ABI plus
  compatibility exports to plugin-owned page/action implementations, with boundary
  tests preventing product behavior from returning there
- backend support-service aggregation now lives in `plugins/backend-seams` as a
  plugin-owned support registry, with the old `src/` path reduced to a compatibility
  facade

Completion roadmap:

1. [x] ~~Finish practical-backend decomposition into concrete child plugins.~~
2. [x] ~~Finish authoring decomposition: `plugin.authoring` is a pure meta package and `plugin.authoring-core` owns the remaining generic CRUD residue with tests and negative coverage.~~
3. [x] ~~Finish product/example plugin audits: `plugin.mcp`, `plugin.canvas`, `plugin.demo`, and `plugin.eden` are understandable from their plugin directories first and fail or disappear when their plugins are absent.~~
4. [x] ~~Convert profiles from bundle-first to plugin/meta-plugin-first:
   `minimal` remains core ABI only, and `full` becomes an explainable selection of
   first-party plugins and meta plugins.~~
5. [x] ~~Thin core bundle registries and handler registries:
   `src/runtime-bundles.js` and `src/runtime-bundle-handlers.js` become runtime
   composition mechanics, not feature catalogs.~~
6. [x] ~~Harden package boundaries until regressions fail tests:
   executable plugins need co-located tests, meta plugins cannot own handlers, optional
   feature routes/capabilities/surfaces cannot reappear in core, dependency cycles fail,
   and missing runtime entries block requested/authored activation.~~
7. [x] ~~Move bootstrap shell rendering and tutorial guide/content implementation out of `src/` into `plugin.bootstrap` and `plugin.tutorial`.~~
8. [x] ~~Move inspect-owned world/process rendering and projections out of `src/` into `plugin.inspect`, leaving only justified generic widget/model primitives in core.~~
9. [x] ~~Complete the `src/widgets.js` split and ABI classification:
   every export is either plugin-owned through compatibility exports or documented as
   intentional generic authored-widget ABI with boundary tests.~~
10. [x] ~~Move widget page rendering, frontend browser runtime, tutorial browser hook, and Eden page-theme hook out of `src/widgets.js` into `plugins/inspect/widget-page.js`.~~
11. [x] ~~Move or justify widget-version activation/rollback behavior currently exported by `src/widgets.js`.~~
12. [x] ~~Classify remaining `src/widgets.js` exports as intentional generic authored-widget ABI or move them into authoring/inspect child plugins.~~
13. [x] ~~Move remaining practical-backend support-service aggregation out of `src/runtime-practical-backend-support-services.js` into the concrete backend child plugins or a justified generic service registry.~~
14. [x] ~~Run the final audit:
   list intentional core ABI exceptions, verify no product/example/backend/authoring
   feature remains core-owned without justification, and prove plugin removal blocks or
   removes the corresponding feature.~~

Remaining path from the current repository state:

1. Finish the reopened `src/` ownership cleanup.
   Main `src/*.js` files should be thick ceremony only: startup, loading,
   validation, dispatch, registry assembly, diagnostics, transport, and stable ABI.
   Concrete feature logic, provider behavior, rendering, product flows, and backend
   capability implementation should live in plugins.
2. Work through the new queue items 37-45.
   Start with the misleading practical-backend facades, then move provider runtimes,
   job handlers, route assembly hooks, and remaining plugin-specific core hooks.
3. Keep post-completion work out of this plan.
   Store, trust, registry, UX polish, and broader ecosystem work may continue in other
   roadmap documents, but they do not substitute for the source ownership cleanup.

Do not re-open migration-completion work for store, remote registry, marketplace,
trust-review mutation, or plugin UX polish unless one of those efforts uncovers a real
plugin-ownership regression.

The previous final audit exposed enough naming and ownership residue in `src/` that the
completion claim is now reopened. Any future tranche must still start from a concrete
ownership seam, not from generic plugin-platform expansion.

Completion matrix:

| Area | Target state | Current gate |
| --- | --- | --- |
| Practical backend | `plugin.practical-backend` is a pure meta package over concrete capability plugins. | Gate A complete. |
| Authoring | `plugin.authoring` is meta-only; child packages own their implementation. | Gate C complete. |
| Product/example plugins | MCP, canvas, demo, and Eden are independently removable plugin-owned packages. | Gate B complete. |
| Profiles | `full` is a plugin/meta-plugin preset; bundles are composition details. | Gate D complete. |
| Core runtime | Core owns loader, projection, dispatch, diagnostics plumbing, generic state/model primitives, and stable ABI only. | Gate E complete. |
| Boundary tests | Regressions into core or catch-all plugins fail focused fast tests. | Gate F complete. |
| Final audit | Intentional core ABI is listed explicitly and plugin removal/blocking evidence is recorded. | Reopened by `src/` ownership audit. |

Restart rule for the next tranche:

- implement the earliest unchecked leaf ownership seam in Section 3A when a new seam is discovered
- move real code into a concrete `plugins/<id>/` directory or delete a transitional seam
- add or tighten co-located plugin tests in the same tranche
- prove the behavior does not survive under `minimal` without the plugin
- update this document only after implementation and verification

---

## 1. Completion Target

`plugin migration complete` means:

- feature and product behavior is primarily owned by `plugins/<plugin-id>/`
- plugin folders contain meaningful implementation, tests, and contribution metadata beyond `plugin.json`
- `minimal` with no plugins exposes only the runtime kernel and stable ABI
- `full` is assembled from plugins and meta plugins, not from hardcoded feature ownership in core
- removing or breaking a plugin removes or blocks the corresponding feature in a direct, legible way
- every executable plugin has co-located tests that can run independently
- transitional packages such as `plugin.practical-backend-core` no longer exist
- internal `src/` runtime code is limited to loading, composition, dispatch, diagnostics plumbing, projection/state mechanics, server transport, and stable ABI handlers

`plugin migration complete` does not mean:

- every line of runtime code lives under `plugins/`
- the runtime kernel disappears
- arbitrary third-party package loading is supported
- a plugin store, registry, signing flow, or review workflow exists

The permanent core should stay boring. It may own the runtime kernel, authored-state projection machinery, server dispatch, plugin discovery/loading, diagnostics/catalog APIs, and stable generic execution ABI. It should not own inspect, authoring, backend, canvas, demo, Eden, or practical feature behavior.

The final main JavaScript files in `src/` should be thick ceremony only. They may be
long because they coordinate startup, validation, dispatch, composition, diagnostics,
transport, and stable ABI, but they should not contain the interesting feature
implementation. If a file is thick because it owns provider logic, rendering, product
flows, backend capability behavior, or example behavior, that code belongs in a plugin
or in a plugin-owned registry.

### Non-Negotiables

Every future plugin-migration tranche must satisfy these rules:

- move real implementation into `plugins/<plugin-id>/`, not just metadata
- include co-located plugin tests or tighten existing co-located plugin tests
- remove or visibly thin the previous owner in `src/` or a transitional catch-all plugin
- preserve `full` compatibility unless the tranche explicitly changes a documented example startup path
- prove `minimal` without the plugin does not silently expose the migrated behavior
- update this file after verification, not before

If a tranche only improves catalog wording, review UI, manifest metadata, or documentation, it may be useful platform work, but it is not plugin migration.

### Control Rule

When deciding between two possible next tasks, choose the task that removes the largest
remaining feature-ownership seam from core or from a transitional catch-all plugin, as
long as it can be verified with focused fast tests.

Do not choose a task merely because it improves the plugin-management experience. The
current completion target is ownership transfer first, ecosystem/store polish later.

If a proposed task does not move implementation into a concrete plugin package, delete
a transitional ownership seam, or enforce an already-migrated boundary, it must be
classified outside this migration control plan.

### Scope Lock

This file is intentionally biased toward completing the migration rather than improving
plugin ergonomics. The default next action is not "what plugin platform feature would
be nice"; it is "which remaining runtime/product behavior is still owned outside its
plugin package?"

The migration should not be considered on track unless each implementation tranche does
at least one of these:

- moves real feature implementation into a concrete `plugins/<id>/` directory
- turns a broad plugin into a pure meta package or a smaller coherent owner
- removes a hardcoded core/profile/bundle ownership seam
- adds boundary tests that would fail if migrated behavior moved back into core

This prevents the earlier drift where plugin manifests, catalogs, review surfaces, or
bundle bridges looked like progress while plugin folders still had little ownership.

---

## 2. Current Honest State

Completed foundations:

- local plugin packages are discovered from `plugins/<id>/plugin.json`
- authored runtime-plugin installs work
- CLI/env runtime-plugin overlays work
- executable plugin runtime modules exist
- co-located plugin tests exist via `scripts/run-plugin-tests.mjs`
- `plugin.inspect`, `plugin.authoring-core`, `plugin.canvas`, `plugin.mcp`, `plugin.demo`, `plugin.eden`, and `plugin.sqlite` own meaningful implementation
- `plugin.authoring` is now a pure meta package over first-party authoring child plugins
- `plugin.practical-backend` is now a meta package rather than a monolithic executable plugin
- `plugin.sqlite` owns DB SQL behavior as the first practical-backend child package
- `plugin.jobs` owns jobs.queue behavior as the second practical-backend child package
- `plugin.search` owns search.index behavior as the third practical-backend child package
- `plugin.notifications` owns notify.email and notify.sms behavior as the fourth practical-backend child package
- `plugin.webhooks` owns webhook.inbound behavior as the fifth practical-backend child package
- `plugin.http-outbound` owns http.outbound behavior as the sixth practical-backend child package
- `plugin.oauth` owns auth.oauth behavior as the seventh practical-backend child package
- `plugin.runtime-config` owns the backend runtime-config read route and handler as the eighth practical-backend child package
- `plugin.backend-seams` owns backend seam diagnostics, page rendering, routes, surface, handler catalog, and handler implementation as the ninth practical-backend child package
- `plugin.fs-blob` owns blob file storage capability, routes, handler catalog, handler implementation, and blob path/storage helper implementation as the tenth practical-backend child package
- `plugin.fs-stream` owns streamed file read/write/copy capability, routes, handler catalog, handler implementation, and stream transfer helper implementation as the eleventh practical-backend child package
- `plugin.fs-json` owns the JSON file read/write host capability declarations that were previously carried by the transitional practical-backend bundle
- `plugin.assets` owns asset upload/content/text/thumbnail/attachment/ingest/search behavior, routes, handler catalog, handler implementation, and asset service helpers
- `plugin.practical-backend-core` has been deleted
- `plugin.demo` is now explicitly authored on the maintained demo runner, and `serverRunner.handlerSet = "demo"` no longer auto-activates `bundle-demo`
- `plugin.demo` owns the demo handler-set provider, todo/private-note projections, todo mutation helpers, private-note privacy helper, and demo todo proposal target execution
- `plugin.bootstrap` owns bootstrap shell/read APIs, operator recovery APIs, route/surface metadata, handler catalog, and handler implementation
- `plugin.tutorial` owns tutorial progress routes, handler catalog, handler implementation, and guided-build runtime behavior
- `plugin.proposals` owns proposal create/approve/reject routes, handler catalog, handler implementation, proposal process helpers, and proposal executor dispatch
- `plugin.capability-authoring` owns capability define/install/remove routes, handler catalog, handler implementation, process helpers, and capability proposal target execution
- `plugin.program-authoring` owns frontend/backend program authoring routes, handler catalog, handler implementation, process helpers, and program proposal target execution
- `plugin.server-runner-authoring` owns server runner create and runner-scoped runtime plugin install/remove routes, handler catalog, handler implementation, process helpers, and proposal target execution
- `plugin.mcp-authoring` owns MCP server create and MCP tool install/remove routes, handler catalog, handler implementation, process helpers, and proposal target execution
- `plugin.mcp` owns MCP HTTP routes, handler catalog, handler implementation, protocol/tool catalog, supported tool execution, and MCP origin/principal/scope support services
- `plugin.canvas` owns canvas runtime routes, surfaces, handler catalog, process helpers, projection helpers, page rendering, undo helpers, and browser-served canvas core/projection modules
- `plugin.eden` owns Eden routes, handlers, projections, page rendering, personal box helpers, page theme helpers, academy/organization/theory/capability/version helpers, and browser-served Eden compatibility modules
- `plugin.authoring-core` owns identity/context/perspective/stewardship/widget/route/serve authoring routes, handler catalog, handler implementation, process helpers, and proposal target execution
- `plugin.authoring` depends on `plugin.authoring-core`, `plugin.bootstrap`, `plugin.capability-authoring`, `plugin.program-authoring`, `plugin.server-runner-authoring`, `plugin.mcp-authoring`, `plugin.proposals`, and `plugin.tutorial` instead of owning executable bundles directly

Completion audit result:

- intentional core ABI exceptions are now recorded explicitly in this section
- no remaining non-facade `plugins/** -> src/**` import is classified as an unfinished
  ownership seam
- maintained-demo positive and negative proofs now cover the authored-plugin delta
  under `minimal`, including authoring, inspect, canvas, and demo-owned behavior

Current plugin directories:

- `plugins/authoring`
- `plugins/authoring-core`
- `plugins/backend-seams`
- `plugins/bootstrap`
- `plugins/canvas`
- `plugins/capability-authoring`
- `plugins/demo`
- `plugins/eden`
- `plugins/assets`
- `plugins/fs-blob`
- `plugins/fs-json`
- `plugins/fs-stream`
- `plugins/http-outbound`
- `plugins/inspect`
- `plugins/jobs`
- `plugins/mcp`
- `plugins/mcp-authoring`
- `plugins/notes-sidebar`
- `plugins/notifications`
- `plugins/oauth`
- `plugins/practical-backend`
- `plugins/program-authoring`
- `plugins/proposals`
- `plugins/runtime-config`
- `plugins/search`
- `plugins/server-runner-authoring`
- `plugins/sqlite`
- `plugins/tutorial`
- `plugins/webhooks`

Permanent runtime-owned ABI currently includes:

- `session.*`
- `backendProgram.run`
- `page.home`
- `runtime.diagnostics.read`
- `runtime.plugins.read`
- `runtime.pluginReviews.read`
- runtime kernel, witness/state projection mechanics, DSL/module loading, and generic
  relation/projector infrastructure
- generic authored-widget ABI in `src/widgets.js`: witnessed widget/program definition
  primitives, activation primitives, widget/frontend program projections, and
  compatibility exports to plugin-owned widget rendering/action workflows
- generic authored backend-program ABI in `src/backend-programs.js`: witnessed backend
  program definition, projection, activation, and transition primitives used by
  multiple plugins
- generic runtime builtin seeding in `src/runtime-builtins.js`: permanent core traits,
  generic authored value types/process specs, and runtime capability definitions;
  plugin- and example-specific seed metadata now enters through active bundle
  providers instead of the core seed file
- HTTP dispatch, route matching, runtime server startup, plugin discovery/loading,
  dependency resolution, profile/plugin composition, and diagnostics plumbing

These are allowed to remain core-owned only while they stay generic. If any of these
files contains product/example/backend/authoring behavior, that behavior must either
move into a plugin or be listed as a narrow intentional exception with evidence.

Current import-audit classification:

- generic core ABI imports still used by plugins:
  `src/kernel.js`, `src/modules.js`, `src/type-model.js`, `src/widgets.js`,
  `src/backend-programs.js`, `src/process-graph.js`, `src/projectors-core.js`,
  `src/ids.js`, `src/gates.js`, `src/runtime-config-utils.js`, and
  `src/runtime-builtins.js`
- deleted one-line compatibility facades now enforced absent by tests:
  `src/bootstrap-authoring.js`, `src/widget-define.js`, `src/eden-versions.js`,
  and the other plugin-only `src/*` shim files that previously re-exported
  `plugins/**`
- no remaining non-facade `plugins/** -> src/**` import is currently classified as an
  unfinished ownership seam

Final audit evidence already proved:

- maintained demo on `minimal` plus authored runtime plugins keeps authoring,
  inspect, canvas, and demo surfaces active:
  `/_bootstrap`, `/world`, `/process`, and `/canvas` all return `200`, and
  diagnostics show authored/active plugin ids for `plugin.authoring`,
  `plugin.inspect`, `plugin.canvas`, and `plugin.demo`
- the same maintained demo on `minimal` after removing authored runtime plugin
  installs falls back to core-only composition:
  diagnostics show no authored or active plugins and only `bundle-core-runtime`,
  `/_bootstrap`, `/world`, `/process`, and `/canvas` disappear, and inspect-backed
  APIs such as `/api/witnesses` and `/api/world-graph` are blocked
- `minimal + plugin.inspect` exposes inspect routes and surfaces, and plain
  `minimal` does not expose inspect behavior
- `minimal + plugin.practical-backend` exposes backend routes and capabilities
  through dependency-expanded child plugins
- `minimal + plugin.mcp` loads MCP routes from the plugin runtime
- `minimal + plugin.eden` loads Eden handlers from the plugin runtime
- `minimal + plugin.demo` exposes the demo handler set from the plugin runtime
- `serverRunner.handlerSet = "demo"` no longer auto-activates demo behavior under
  `minimal`
- dependency cycles fail package validation
- missing plugin runtime entries block requested or authored activation instead of
  silently falling back

Final audit conclusion:

- Gate G is satisfied for the current repository state
- no further migration tranche is open unless a new ownership seam is discovered

---

## 3. Roadmap To Complete

This is the canonical roadmap from the current state to "almost everything plugin based".
A future tranche may split a step into smaller implementation pieces, but it should not
skip a listed ownership seam or replace ownership transfer with more metadata, UI, or
planning.

This roadmap is intentionally about ownership, not cosmetics. The migration is complete
only when a maintainer can inspect `plugins/` first to understand almost every optional
feature, product surface, backend capability, and example behavior.

Canonical order:

1. Finish practical-backend decomposition until `plugin.practical-backend-core` is gone.
2. Finish splitting broad authoring into coherent child plugins or a pure meta package.
3. Move bootstrap shell and tutorial content/UI implementation into their plugin
   directories; owning routes without owning the page/content implementation is not
   sufficient.
4. Move inspect world/process/source projections and rendering into `plugin.inspect`,
   or split inspect into child plugins if the seam proves too large.
5. Split `src/widgets.js` into justified generic core primitives plus plugin-owned
   widget authoring/runtime/tutorial/Eden behavior.
6. Move remaining practical-backend support/read-model aggregation out of core route
   assembly and into concrete backend child plugins or a plugin-owned registry.
7. Convert remaining broad product/runtime plugins into coherent packages or meta packages.
8. Audit canvas, demo, Eden, and MCP as product/example plugins after shared `src/`
   seams are removed.
9. Thin bundle/profile compatibility once feature ownership lives in plugins.
10. Enforce plugin boundaries so regressions fail tests.
11. Run the final completion gate and document any intentional core exceptions.

### End-State Package Map

This is the target package shape. Names may change only when implementation proves a
better boundary; do not collapse child packages back into broad catch-all packages.

Core runtime, not plugins:

- runtime kernel and authored-state projection mechanics
- HTTP dispatch, route matching, server startup, and diagnostics plumbing
- plugin discovery, validation, loading, composition, and dependency resolution
- stable generic ABI handlers such as session, diagnostics, plugin catalog, and review reads
- permanent source/witness/state mechanics needed by all plugins

Product/runtime plugins:

- `plugin.authoring` is a meta package over child authoring plugins
- `plugin.inspect` owns world/process/source inspect projections, pages, surfaces, and handlers; it remains coherent unless concrete pressure justifies splitting it
- `plugin.canvas` owns canvas pages, routes, surfaces, and handlers
- `plugin.mcp` owns MCP runtime/install surfaces and handlers
- `plugin.demo` owns maintained demo/example runtime behavior
- `plugin.eden` owns Eden-specific flows

Practical-backend target packages:

- `plugin.practical-backend` is a pure meta package
- `plugin.sqlite` owns `db.sql`
- `plugin.fs-json` owns `fs.json.read` and `fs.json.write`
- `plugin.jobs` owns `jobs.queue`
- `plugin.search` owns `search.index`
- `plugin.notifications` owns `notify.email` and `notify.sms`
- `plugin.webhooks` owns `webhook.inbound`
- `plugin.http-outbound` owns `http.outbound`
- `plugin.oauth` owns `auth.oauth`
- `plugin.runtime-config` owns backend runtime-config read/update seams that are not core startup ABI
- `plugin.backend-seams` owns backend seam inspection and backend seam pages
- `plugin.fs-blob` owns blob file storage behavior
- `plugin.fs-stream` owns stream file behavior
- `plugin.assets` owns upload/asset behavior

Authoring target packages:

- `plugin.bootstrap` owns bootstrap shell/pages/API surfaces that are not generic runtime ABI
- `plugin.tutorial` owns tutorial/default blank-world guide behavior
- `plugin.proposals` owns proposal authoring/execution surfaces
- `plugin.capability-authoring` owns capability CRUD/authoring flows
- `plugin.program-authoring` owns authored program/editor flows
- `plugin.server-runner-authoring` owns server runner authoring flows
- `plugin.mcp-authoring` owns MCP-specific authoring flows
- `plugin.authoring-core` owns only the small residue that remains coherent after the previous splits

### Milestone Gates

Use these gates to measure real progress. A tranche can be valuable without completing
a gate, but completion claims should reference these gates.

Gate A: Practical-backend decomposition complete.

- `plugin.practical-backend-core` is deleted
- every former practical-backend capability is owned by a concrete child plugin
- `plugin.practical-backend` has no executable runtime implementation beyond aggregate package metadata and tests
- minimal-plus-child-plugin tests prove each child package exposes only its own slice
- minimal-plus-practical-backend tests prove aggregate behavior comes from recursive dependencies

Gate B: Product/example plugins are honest owners.

- `plugin.demo`, `plugin.eden`, `plugin.canvas`, and `plugin.mcp` can each be understood from their plugin directory first
- maintained examples use explicit authored plugin composition rather than hidden `full` or handler-set assumptions
- disabling each product/example plugin removes or blocks the relevant behavior
- shared source files they depend on are generic runtime utilities, not hidden product/page implementations

Gate C: Authoring no longer hides runtime special cases.

- blank-world bootstrap/tutorial behavior is plugin-owned
- bootstrap shell rendering and tutorial content/client helpers live under their plugins
- proposal, capability, program, server-runner, and MCP authoring seams are not buried in one broad runtime-owned surface
- `plugin.authoring` is a pure meta package; `plugin.authoring-core` is the narrow coherent residue with tests

Gate D: Profiles become plugin-driven compatibility presets.

- `minimal` remains core ABI only
- `full` is explainable as selected plugins/meta plugins
- bundle ids are runtime composition details, not feature ownership explanations

Gate E: Core registries stop being feature catalogs.

- `src/runtime-bundles.js` and `src/runtime-bundle-handlers.js` stop being feature catalogs
- plugin manifests/runtime modules are the primary source for optional routes, surfaces, handlers, and capabilities
- bundle ids remain only as stable runtime composition ABI where still needed
- core runtime does not provide feature implementation through large shared files imported by plugins unless those files are listed as intentional generic ABI

Gate F: Boundary enforcement prevents regression.

- every executable plugin has co-located tests
- optional routes, capabilities, surfaces, and handler ids cannot reappear in core without failing tests
- meta packages cannot accidentally own executable handlers
- dependency cycles, missing dependencies, and plugin runtime-entry failures are tested

Gate G: Final audit complete.

- this file lists every intentional core exception
- no product/example/backend/authoring feature remains core-owned unless explicitly justified as stable ABI
- breaking/removing a plugin removes or blocks its feature directly and legibly

### Phase 1. Finish Practical-Backend Decomposition

Status: complete.

Goal:

- delete `plugin.practical-backend-core`
- make `plugin.practical-backend` a pure meta package over concrete backend child plugins
- ensure each backend capability slice is understandable and testable from its own plugin directory

Recommended extraction order:

1. [x] ~~`plugin.jobs`~~
2. [x] ~~`plugin.search`~~
3. [x] ~~`plugin.notifications`~~
4. [x] ~~`plugin.webhooks`~~
5. [x] ~~`plugin.http-outbound`~~
6. [x] ~~`plugin.oauth`~~
7. [x] ~~`plugin.runtime-config`~~
8. [x] ~~`plugin.backend-seams`~~
9. [x] ~~`plugin.fs-blob`~~
10. [x] ~~`plugin.fs-stream`~~
11. [x] ~~`plugin.fs-json`~~
12. [x] ~~`plugin.assets`~~

The practical-backend target shape is a package of packages:

- `plugin.practical-backend` is installable as the aggregate operator-facing package
- concrete child packages own executable behavior
- dependency installation makes the aggregate convenient without hiding ownership
- diagnostics and review surfaces explain child packages as the source of runtime effect
- `plugin.practical-backend-core` disappears rather than becoming a permanent dumping ground

Completed child slices:

- [x] ~~`plugin.sqlite` owns `db.sql` capability, routes, handler catalog, and handler implementation.~~
- [x] ~~`plugin.jobs` owns `jobs.queue` capability, routes, handler catalog, and handler implementation.~~
- [x] ~~`plugin.search` owns `search.index` capability, routes, handler catalog, and handler implementation.~~
- [x] ~~`plugin.notifications` owns `notify.email`, `notify.sms`, notification routes, handler catalog, and handler implementation.~~
- [x] ~~`plugin.webhooks` owns `webhook.inbound`, webhook routes, handler catalog, handler implementation, and webhook IO normalization helpers.~~
- [x] ~~`plugin.http-outbound` owns `http.outbound`, outbound routes, handler catalog, handler implementation, outbound request normalization helpers, and stub/network transport glue.~~
- [x] ~~`plugin.oauth` owns `auth.oauth`, OAuth routes, handler catalog, handler implementation, OAuth support services, and OAuth read-shaping helpers.~~
- [x] ~~`plugin.runtime-config` owns `runtimeConfig.read`, `/api/runtime-config`, handler catalog, and runtime-config read shaping.~~
- [x] ~~`plugin.backend-seams` owns `backendSeams.read`, `page.backendSeams`, `/backend-seams`, `/api/backend-seams`, backend seam page rendering, handler catalog, and operator surface.~~
- [x] ~~`plugin.fs-blob` owns `fs.blob.list`, `fs.blob.meta`, `fs.blob.read`, `fs.blob.write`, `fs.blob.delete`, blob routes, blob capability metadata, and blob path/storage helpers.~~
- [x] ~~`plugin.fs-stream` owns `fs.stream.read`, `fs.stream.write`, `fs.stream.copy`, stream routes, stream capability metadata, and stream transfer helpers.~~
- [x] ~~`plugin.fs-json` owns `fs.json.read` and `fs.json.write` host capability declarations that were previously carried by the transitional practical-backend bundle.~~
- [x] ~~`plugin.assets` owns `upload.asset`, asset upload/content/text/thumbnail/attachment/ingest/search routes, handler catalog, handler implementation, and asset service helpers.~~

Current transitional owner:

- [x] ~~`plugin.practical-backend-core` has been deleted.~~

Per-slice done criteria:

- create `plugins/<slice>/plugin.json`
- create `plugins/<slice>/runtime.js`
- move the slice handler catalog, routes, surfaces, capabilities, and implementation out of `plugins/practical-backend-core`
- add a dedicated bundle id only if the composition layer still requires one
- update `plugin.practical-backend` dependencies
- add co-located plugin tests under `plugins/<slice>/**/*.test.js`
- prove `minimal + plugin.<slice>` exposes only that slice
- prove `minimal + plugin.practical-backend` still exposes the aggregate behavior through dependencies
- prove plain `minimal` does not expose the slice
- prove the slice no longer survives through `plugin.practical-backend-core`

Phase 1 is complete only when:

- `plugins/practical-backend-core` is deleted
- no remaining practical-backend route, capability, provider, or handler implementation is owned by a transitional catch-all package
- `plugin.practical-backend` has no runtime implementation except meta-package metadata and tests
- every former practical-backend capability maps to a concrete child plugin or an explicitly documented core ABI exception
- aggregate install/remove behavior is dependency-driven and covered by plugin-level tests

### Phase 1B. Harden Plugin Package Mechanics

Status: partially complete; remaining hardening can run alongside ownership-transfer tranches.

Goal:

- make plugin packages feel like first-class local packages, not folders that happen to contain manifests
- keep test and dependency behavior consistent enough that every new extraction follows the same rails

Required work:

- [x] add co-located plugin test support through `scripts/run-plugin-tests.mjs`
- [x] add first-class package scripts for existing plugin test targets
- [x] support installable meta-package semantics
- [x] support recursive authored dependency install
- [x] support dependency-aware remove modes
- [x] ~~require or lint co-located tests for every executable plugin~~
- [x] ~~add boundary tests that fail when migrated practical-backend feature handlers/routes/capabilities reappear in core/catch-all ownership~~
- [ ] add dependency graph tests for every aggregate plugin, not just practical-backend
- [ ] add a plugin package template/checklist for future first-party plugins

Phase 1B is complete only when:

- each executable plugin can be tested independently
- aggregate plugins are tested as dependency aggregators, not behavior owners
- regression into core or catch-all ownership is mechanically visible in tests

Remaining Phase 1B work is important, but it should not block the next ownership-transfer
tranche unless a missing hardening check would make that tranche unsafe. The next largest
ownership seams are now product/runtime plugin removability audits, starting with MCP.

### Phase 2. Split Authoring Into Smaller Plugins

Status: mostly complete; shared widget seam remains for final audit.

Goal:

- keep `plugin.authoring` as a compatibility meta package
- move large authoring subdomains into child plugins
- make blank-world bootstrap/tutorial plugin-owned without treating all authoring as one broad package

Candidate child plugins:

- `plugin.bootstrap`
- `plugin.authoring-core`
- `plugin.proposals`
- `plugin.capability-authoring`
- `plugin.program-authoring`
- `plugin.server-runner-authoring`
- `plugin.mcp-authoring`
- `plugin.tutorial`

Per-slice done criteria:

- the child plugin owns its routes, handlers, surfaces, read models, and proposal execution where applicable
- `plugin.authoring` depends on the child plugin instead of owning the behavior directly
- blank-world bootstrap and maintained demo continue to work through authored/meta plugin composition
- disabling the child plugin removes or blocks the corresponding authoring behavior
- co-located plugin tests cover the child plugin

Phase 2 is complete only when:

- `plugin.authoring` is a pure meta package over child authoring plugins
- tutorial/bootstrap behavior is no longer a hidden runtime special case
- bootstrap shell rendering and tutorial guide/content/client helpers are owned by
  `plugins/bootstrap` and `plugins/tutorial`, not by large implementation files in
  `src/`

Recommended authoring extraction order:

1. [x] ~~`plugin.bootstrap`~~
2. [x] ~~`plugin.tutorial`~~
3. [x] ~~`plugin.proposals`~~
4. [x] ~~`plugin.capability-authoring`~~
5. [x] ~~`plugin.program-authoring`~~
6. [x] ~~`plugin.server-runner-authoring`~~
7. [x] ~~`plugin.mcp-authoring`~~
8. [x] ~~`plugin.authoring-core`~~
9. [x] ~~Move bootstrap shell implementation from `src/bootstrap-shell.js` into `plugins/bootstrap`.~~
10. [x] ~~Move tutorial guide/content/client implementation from `src/tutorials.js` and `src/tutorial-*` into `plugins/tutorial`.~~

This order prioritizes visible runtime seams and existing special cases before lower-level authoring CRUD.

### Phase 3. Decide Whether Inspect Should Stay Whole

Status: reopened by audit.

Default decision:

- keep `plugin.inspect` as one coherent plugin unless package size or dependency pressure justifies splitting it

Possible future child plugins:

- `plugin.world-graph`
- `plugin.process-inspect`
- `plugin.source-inspect`
- `plugin.widget-versions`

Phase 3 is not required for completion if `plugin.inspect` remains a coherent, fully plugin-owned package with strong co-located tests.

Audit finding:

- `plugins/inspect/runtime.js` still imports `src/widgets.js`; inspect is not fully
  plugin-owned until widget page rendering and widget-version behaviors move into the
  plugin or are split into explicit generic ABI plus plugin-owned behavior.

### Phase 4. Clean Up Canvas, Demo, And Eden

Status: mostly complete; shared source seam audit remains.

Goal:

- ensure these packages are clearly plugin-owned product/example packages, not platform-owned runtime features

Required checks:

- `plugin.canvas` owns canvas routes, surfaces, handlers, process helpers, page rendering, projection helpers, undo helpers, browser-served canvas modules, and tests
- `plugin.demo` owns demo handler-set behavior, demo todo/private-note helpers, demo proposal target execution, and example-specific runtime contributions
- `plugin.eden` owns Eden-specific flows and does not hide implementation in core or canvas
- `plugin.mcp` owns MCP runtime routes, tool catalog, protocol constants, support services, and tests
- maintained example entrypoints use explicit authored/plugin composition
- no demo or Eden behavior is registered by core unless it is stable ABI

Known product/example seams to remove:

- [x] ~~migrate the maintained demo off the host-side `handlerSet = "demo"` auto-activation compatibility seam~~
- [x] ~~ensure `bundle-demo` is activated through `plugin.demo`, not host-side handler-set glue~~
- [x] ~~ensure Eden-specific runtime flows are explained from `plugins/eden` first~~
- [x] ~~ensure canvas routes/surfaces do not survive without `plugin.canvas`~~
- [x] ~~ensure MCP runtime routes, tool catalog, protocol constants, and support services are explained from `plugins/mcp` first~~
- [x] ~~keep example entrypoints as thin imports around the maintained split source of truth~~
- [x] ~~during the Eden audit, split or justify the Eden-specific projection helpers currently consumed by the canvas projection module~~

Phase 4 is complete only when:

- canvas, demo, Eden, and MCP can be explained from their plugin directories first
- disabling the relevant plugin removes the relevant product/example behavior
- any shared source files they import are compatibility facades or generic ABI, not
  hidden product/example implementation

### Phase 5. Thin The Bundle/Profile Compatibility Layer

Status: registry/profile thinning complete; final completion still blocked by source-owned feature seams.

Goal:

- make profiles select plugin/meta-plugin ids wherever possible
- keep bundles as runtime composition units only where they remain useful ABI
- stop using hardcoded bundle registry metadata as the primary feature source of truth

Expected changes:

- profile definitions become plugin selections plus core ABI
- plugin runtime modules provide executable contribution summaries
- `activatesBundles` becomes a compatibility bridge, not the ownership explanation
- `src/runtime-bundles.js` contains core composition mechanics, not feature catalogs
- `src/runtime-bundle-handlers.js` advertises core ABI dispatch plus plugin-loaded handler catalogs

Phase 5 is complete only when:

- `full` is explainable as a plugin/meta-plugin composition
- feature route/capability/surface presence is derived from active plugins
- bundle ids do not hide feature ownership in core

Suggested profile target:

- `minimal` = core ABI only
- `authoring` = `minimal + plugin.authoring`
- `inspect` = `minimal + plugin.inspect`
- `practical-backend` = `minimal + plugin.practical-backend`
- `full` = `minimal + plugin.authoring + plugin.inspect + plugin.canvas + plugin.mcp + plugin.practical-backend + plugin.demo + plugin.eden`, adjusted only for documented compatibility exceptions

This target can be reached after ownership transfer. Do not attempt to make profiles plugin-driven while large feature ownership still lives in core or catch-all plugins.
The current repo has reached the profile-selection target, but this phase is not a
completion claim while plugin runtimes still import substantial feature implementations
from `src/`.

### Phase 6. Enforce Plugin Boundaries

Status: complete.

Goal:

- prevent regressions back into core-owned feature code

Required enforcement:

- every executable plugin has co-located tests
- plugin test scripts pass independently
- no plugin-owned feature route is primarily declared in `src/`
- no plugin-owned capability is primarily declared in `src/`
- no plugin imports another plugin's private implementation except through an explicit dependency or shared ABI
- no plugin imports a large feature implementation from `src/` unless that file is
  listed as a justified generic ABI exception
- `minimal` without plugins exposes no optional feature routes
- dependency graph tests reject cycles and missing required dependencies
- meta packages are tested as dependency aggregators, not executable owners

Phase 6 is complete only when:

- a new feature cannot accidentally land in core without failing a boundary test
- plugin tests are the normal verification path for plugin-owned behavior

Boundary checks to add before completion:

- [x] ~~executable plugin directories must contain at least one `*.test.js`~~
- [x] ~~plugin-owned route ids must not be declared in core route tables~~
- [x] ~~plugin-owned handler ids must not be implemented in core dispatch code~~
- [x] ~~plugin-owned capability ids must not be listed as core-provided capabilities~~
- [x] ~~meta packages must not export runtime handler factories~~
- [x] ~~dependency cycles fail package validation~~
- [x] ~~`minimal` route snapshots fail when optional feature routes appear~~
- [x] ~~removing a plugin runtime entry causes activation failure for requested/authored plugins~~

### Phase 7. Final Completion Gate

Status: complete.

Declare the migration complete only when all are true:

- `plugin.practical-backend-core` is gone
- practical-backend is a pure meta package over concrete backend child plugins
- authoring is either split into child plugins or explicitly justified as a coherent plugin
- inspect/canvas/demo/Eden remain plugin-owned and independently testable
- `minimal` with no plugins exposes only core ABI
- `full` is assembled from plugins/meta-plugins
- core runtime files own no product/example feature behavior
- every executable plugin has co-located tests
- disabling/removing a plugin removes or blocks the corresponding feature
- this document lists any remaining runtime-owned exceptions explicitly

Intentional core exceptions must be listed in Section 2 before completion. If a runtime-owned exception is product-specific, it is not an exception; it is unfinished migration work.

---

## 3A. Tranche Queue

This queue is the working backlog from here to complete. Use it when choosing the next substantial implementation slice.

1. [x] ~~Extract `plugin.http-outbound` from `plugin.practical-backend-core`.~~
2. [x] ~~Extract `plugin.oauth` from `plugin.practical-backend-core`.~~
3. [x] ~~Extract `plugin.runtime-config` from `plugin.practical-backend-core`.~~
4. [x] ~~Extract `plugin.backend-seams` from `plugin.practical-backend-core`.~~
5. [x] ~~Extract `plugin.fs-blob` from `plugin.practical-backend-core`.~~
6. [x] ~~Extract `plugin.fs-stream` from `plugin.practical-backend-core`.~~
7. [x] ~~Extract `plugin.fs-json` from the transitional practical-backend bundle.~~
8. [x] ~~Extract `plugin.assets` from `plugin.practical-backend-core`.~~
9. [x] ~~Delete `plugin.practical-backend-core` and prove `plugin.practical-backend` is pure meta.~~
10. [x] ~~Add global plugin boundary regression tests.~~
11. [x] ~~Migrate `plugin.demo` off `handlerSet = "demo"` compatibility.~~
12. [x] ~~Split `plugin.bootstrap` out of broad authoring ownership.~~
13. [x] ~~Split proposal execution into `plugin.proposals`.~~
14. [x] ~~Split `plugin.capability-authoring` out of broad authoring ownership.~~
15. [x] ~~Split `plugin.program-authoring` out of broad authoring ownership.~~
16. [x] ~~Split `plugin.server-runner-authoring` out of broad authoring ownership.~~
17. [x] ~~Split `plugin.mcp-authoring` out of broad authoring ownership.~~
18. [x] ~~Reduce `plugin.authoring` to a pure meta package or extract a narrow `plugin.authoring-core`.~~
19. [x] ~~Audit and harden `plugin.mcp` as an independently removable runtime/product plugin.~~
20. [x] ~~Audit and harden `plugin.canvas` as an independently removable product plugin.~~
21. [x] ~~Audit and harden `plugin.demo` as an independently removable example plugin.~~
22. [x] ~~Audit and harden `plugin.eden` as an independently removable product/example plugin.~~
23. [x] ~~Convert profiles from bundle-first composition to plugin/meta-plugin composition.~~
24. [x] ~~Thin `src/runtime-bundles.js` and `src/runtime-bundle-handlers.js` so they are mechanics, not feature catalogs.~~
25. [x] ~~Move bootstrap shell rendering out of `src/bootstrap-shell.js` into `plugins/bootstrap`, with the old source file reduced to a compatibility facade or deleted.~~
26. [x] ~~Move tutorial definitions, guide content, progress normalization, and tutorial browser-client helpers out of `src/tutorials.js` and `src/tutorial-*` files into `plugins/tutorial`.~~
27. [x] ~~Move inspect world graph projection out of `src/world-graph.js` into `plugins/inspect`.~~
28. [x] ~~Move inspect process view/run projection and process page rendering out of `src/process-view.js` into `plugins/inspect`.~~
29. [x] ~~Complete the `src/widgets.js` umbrella split: keep only justified generic widget/model primitives in core or a dedicated plugin, and move widget page rendering, widget-version transitions/actions, tutorial integration, and Eden/theme hooks to plugin-owned files.~~
30. [x] ~~Move widget page rendering, frontend browser runtime, tutorial browser hook, and Eden page-theme hook out of `src/widgets.js` into `plugins/inspect/widget-page.js`.~~
31. [x] ~~Move or justify widget-version activation/rollback behavior currently exported by `src/widgets.js`.~~
32. [x] ~~Classify remaining `src/widgets.js` exports as intentional generic authored-widget ABI or move them into authoring/inspect child plugins.~~
33. [x] ~~Move practical-backend support-service aggregation out of `src/runtime-practical-backend-support-services.js` and `src/runtime-route-handlers.js` into child-plugin-owned service providers or a plugin-owned support registry.~~
34. [x] ~~Audit remaining non-facade `src/` imports from `plugins/**` and either move implementation into the importing plugin or list a narrow intentional core ABI exception.~~
35. [x] ~~Split `src/runtime-builtins.js` so core keeps only permanent generic runtime builtins, while example- or plugin-specific seeded value types and process specs move behind plugin-owned or explicitly justified owners.~~
36. [x] ~~Run final audit and record remaining intentional core ABI exceptions and close the maintained-demo negative-proof gap.~~
37. [x] ~~Delete or rename remaining misleading `src/runtime-practical-backend-*` facades and wire callers to concrete plugin modules or a generically named registry.~~
38. [x] ~~Move asset derived text/thumbnail extraction out of `src/runtime-asset-derived-utils.js` into the asset/search plugin ownership boundary.~~
39. [x] ~~Move notification, webhook, and asset job handlers out of `src/runtime-builtin-job-handlers.js` and `src/runtime-default-job-handlers.js` into owning plugins or a plugin job-handler registry.~~
40. [x] ~~Split `src/runtime-provider-runtimes.js` so SQLite, search index, and job queue provider implementations are owned by their concrete plugins.~~
41. [x] ~~Thin `src/runtime-route-handlers.js` so it dispatches active runtime handlers instead of importing plugin support services and plugin helper functions directly.~~
42. [x] ~~Remove tutorial/Eden/widget rendering hooks from `src/runtime-core-handlers.js` or make them explicit plugin-provided hook inputs.~~
43. [x] ~~Split `src/runtime-authoring-services.js` into generic authority helpers and proposal-plugin execution services.~~
44. [x] ~~Revisit `src/runtime-builtins.js` capability definitions and move non-core capability metadata into plugin-owned manifests/runtime modules.~~
45. [x] ~~Decide whether `src/demo.js` is a maintained example entrypoint, test fixture, or dead scratch file; move or delete it from `src`.~~

Queue discipline:

- complete the earliest unchecked leaf item unless a direct dependency forces a smaller preparatory change
- item 29 was an umbrella gate and is closed because items 31 and 32 are done
- do not start store, remote registry, trust workflow, or marketplace work until Phase 5 is done
- do not recreate a practical-backend catch-all package under a new name
- do not grow `plugin.authoring` while planning to split it; new authoring seams should prefer child plugins once Phase 2 starts
- update this queue by crossing out completed items and adding newly discovered seams rather than replacing the roadmap wholesale

---

## 4. End-State Checkpoint

The `src/` ownership cleanup tranche is complete for queue items 37-45:

- misleading practical-backend and stream facade files are deleted
- asset derived extraction, backend job handlers, and provider runtimes are plugin-owned
- route/core/authoring service wiring goes through plugin registry/service seams rather than feature-specific `src` modules
- optional backend capability metadata moved out of `src/runtime-builtins.js` and into plugin-owned capability definitions
- `src/demo.js` moved to `examples/kernel-demo.js`

Any future source-tree work should preserve the same rule: `src/*.js` may be large only
when it is orchestration, startup, dispatch, validation, loading, diagnostics,
transport, or stable generic ABI. Product/example/provider behavior belongs in a
concrete plugin or example directory.

Work that does not belong here:

- plugin store work
- review/trust lifecycle expansion
- new mutation surfaces
- broad docs-only cleanup without a matching ownership cleanup
- arbitrary third-party code loading
- deleting bundle ids where they are still useful runtime composition details

This section should stay tied to concrete source ownership cleanup. Do not replace it
with generic plugin infrastructure or store work.

### Remaining `src/` Ownership Audit

Classification key:

- `Core ABI`: keep in `src` if it stays generic ceremony or stable model ABI.
- `Entrypoint/Shell`: acceptable in `src` as startup, transport, or shell glue.
- `Review`: prove the file is ceremony-only or split feature logic in a later tranche.
- `Move/Delete`: concrete feature/example/plugin behavior should leave `src`.

| File | Classification | Basis / action |
| --- | --- | --- |
| `src/backend-programs.js` | Core ABI | Generic authored backend-program model and projections. |
| `src/cli.js` | Entrypoint/Shell | CLI process entry and operator argument handling. |
| `examples/kernel-demo.js` | Example | Former `src/demo.js` scratch kernel example; intentionally outside core `src`. |
| `src/desktop-bridge.js` | Entrypoint/Shell | Desktop IPC contract and desktop-only capability list. |
| `src/desktop-cli.js` | Entrypoint/Shell | Desktop launcher process helper. |
| `src/desktop-launcher-page.js` | Review | Desktop shell UI; acceptable only if desktop remains runtime shell, not product plugin. |
| `src/desktop-main.js` | Entrypoint/Shell | Electron/main-process runtime startup. |
| `src/desktop-preload.js` | Entrypoint/Shell | Desktop preload bridge. |
| `src/desktop-session-manager.js` | Entrypoint/Shell | Desktop session process manager. |
| `src/dsl.js` | Core ABI | WTOML authoring parser/apply path; large, but platform-generic. |
| `src/gates.js` | Core ABI | Generic gate helpers. |
| `src/host.js` | Entrypoint/Shell | Public compatibility entrypoint to runtime host APIs. |
| `src/ids.js` | Core ABI | Stable id helpers. |
| `src/kernel.js` | Core ABI | World/witness kernel and authority primitives. |
| `src/logger.js` | Core ABI | Generic logger. |
| `src/modules.js` | Core ABI | Generic authored module relation model; large and worth later subdivision, but not plugin-specific. |
| `src/process-graph.js` | Core ABI | Generic process graph execution. |
| `src/projectors-core.js` | Core ABI | Generic relation projector primitives. |
| `src/runtime-app-context.js` | Ceremony | Runtime app-context assembly; provider implementations are supplied from plugin-owned factories. |
| `src/runtime-authoring-services.js` | Ceremony | Generic authority helper assembly plus proposal executor dependency injection through the plugin service registry. |
| `src/runtime-builtins.js` | Core ABI | Permanent generic runtime builtins only; optional capability metadata is plugin-owned. |
| `src/runtime-bundle-handler-assembly.js` | Core ABI | Generic runtime handler composition. |
| `src/runtime-bundle-handlers.js` | Core ABI | Core handler catalog plus plugin registry integration. |
| `src/runtime-bundles.js` | Core ABI | Composition mechanics and provider contribution resolution; feature catalogs are plugin registry inputs. |
| `src/runtime-bundle-support-services.js` | Review | Projection helpers include process-view shaping; inspect ownership should be rechecked. |
| `src/runtime-config-utils.js` | Core ABI | Generic runtime config normalization. |
| `src/runtime-context-resolver.js` | Core ABI | Generic live/bootstrap context resolver. |
| `src/runtime-core-handlers.js` | Ceremony | Core session/diagnostic handlers receive tutorial/Eden/widget hooks through plugin service registry inputs. |
| `src/runtime-host-entry.js` | Entrypoint/Shell | Public host API and server startup entry. |
| `src/runtime-host-route-factory.js` | Ceremony | Generic route factory; practical-backend IO helpers arrive through plugin-owned service registry exports. |
| `src/runtime-host-utils.js` | Core ABI | Host declaration, capability install, storage config. |
| `src/runtime-http-utils.js` | Core ABI | Generic HTTP/session helpers. |
| `src/runtime-local-launcher.js` | Entrypoint/Shell | Blank runtime launcher and local startup helper. |
| `src/runtime-operator-contract.js` | Core ABI | Local operator path/contract resolution. |
| `src/runtime-operator-service.js` | Core ABI | Local operator file/runtime service; not plugin feature behavior. |
| `src/runtime-plugin-loader.js` | Core ABI | Plugin module loading and validation. |
| `src/runtime-plugin-utils.js` | Core ABI | Plugin discovery, dependency, catalog, review read models. |
| `src/runtime-route-handlers.js` | Ceremony | Generic dispatcher/request shaping and active handler plumbing; feature services come from the plugin service registry. |
| `src/runtime-routing.js` | Core ABI | Generic route matching and bootstrap fallback decisions. |
| `src/runtime-server.js` | Entrypoint/Shell | HTTP server assembly and active composition startup. |
| `src/runtime-session-services.js` | Core ABI | Generic session store shape. |
| `src/runtime-shell-contract.js` | Core ABI | Runtime shell ids and diagnostics. |
| `src/runtime-startup-services.js` | Ceremony | Startup context helper passes provider/job factories without owning provider implementations. |
| `src/runtime-template-utils.js` | Core ABI | Generic template interpolation helper. |
| `src/type-model.js` | Core ABI | Generic trait/value/process-spec model. |
| `src/widgets.js` | Review | Generic widget ABI is valid; remaining inspect re-exports should eventually disappear. |
| `src/witness-log.js` | Core ABI | Witness log persistence. |
| `src/desire/apply.js` | Core ABI | DESIRE-to-world application bridge. |
| `src/desire/ids.js` | Core ABI | DESIRE stable id helper. |
| `src/desire/index.js` | Core ABI | DESIRE public export barrel. |
| `src/desire/ir.js` | Core ABI | DESIRE IR definitions and validators. |
| `src/desire/normalize.js` | Core ABI | DESIRE+ normalization. |
| `src/desire/rvm.js` | Core ABI | RVM-to-DESIRE compiler. |
| `src/desire/serialize.js` | Core ABI | DESIRE serialization helpers. |
| `src/desire/wtoml.js` | Core ABI | WTOML-to-DESIRE compiler. |

Recent audit result:

- [x] ~~Enumerated the remaining `plugins/** -> src/**` import targets and froze the
  classification in boundary tests.~~
- [x] ~~Confirmed the generic core ABI targets currently used by plugins are
  `src/kernel.js`, `src/modules.js`, `src/type-model.js`, `src/widgets.js`,
  `src/backend-programs.js`, `src/process-graph.js`, `src/projectors-core.js`,
  `src/ids.js`, `src/gates.js`, and `src/runtime-config-utils.js`.~~
- [x] ~~Deleted the remaining direct compatibility facades
  `src/bootstrap-authoring.js`, `src/widget-define.js`, and
  `src/eden-versions.js`, and froze their absence in boundary tests.~~
- [x] ~~Identified `src/runtime-builtins.js` as the remaining concrete ownership seam
  instead of treating item 34 as paperwork.~~

Recent completed tranche:

- [x] ~~Moved demo `todo.*` value types and `todo.create` / `todo.update` /
  `todo.delete` process specs out of `src/runtime-builtins.js` into
  `plugins/demo/runtime-builtins.js`.~~
- [x] ~~Moved MCP authoring `mcpServer.*` value types and
  `mcpServer.define` / `mcpTool.install` / `mcpTool.remove` process specs out of
  `src/runtime-builtins.js` into `plugins/mcp-authoring/runtime-builtins.js`.~~
- [x] ~~Extended first-party bundle composition so active bundles can contribute
  runtime builtin seed metadata through bundle providers, and startup now seeds those
  contributions from the active composition instead of the core seed file.~~
- [x] ~~`src/runtime-builtins.js` now keeps only permanent generic runtime builtins
  plus capability definitions, with plugin/example seed metadata entering through
  active bundle providers.~~
- [x] ~~Focused boundary, runtime-builtins, runtime-server, runtime-host-utils, demo,
  and mcp-authoring tests are green after the split.~~

Recent completed tranche:

- [x] ~~`createPracticalBackendSupportServices` moved from `src/runtime-practical-backend-support-services.js` to `plugins/backend-seams/support-services.js` as a plugin-owned support registry.~~
- [x] ~~`src/runtime-practical-backend-support-services.js` is now a one-line compatibility facade.~~
- [x] ~~`src/runtime-route-handlers.js` imports practical-backend support services from `plugins/backend-seams/support-services.js` instead of the core `src/` facade.~~
- [x] ~~Backend-seams co-located tests now assert support-service registry ownership, and global boundary tests prevent runtime assembly from importing the old core support path.~~
- [x] ~~Focused practical-backend support, backend-seams plugin, plugin-boundary, and runtime-route-handler tests are green after the move.~~
- [x] ~~The full `runtime-profile` file was attempted but timed out in this environment; import checks for the moved support module and route-handler module passed.~~

Recent completed tranche:

- [x] ~~`src/widgets.js` now declares itself generic authored-widget ABI for witnessed widget/program definitions, activation primitives, and projections.~~
- [x] ~~The only non-generic behavior remaining in `src/widgets.js` is compatibility exports to plugin-owned `plugins/inspect/widget-page.js` and `plugins/inspect/widget-versions.js`.~~
- [x] ~~Global plugin-boundary tests now enumerate the allowed `src/widgets.js` owned exports and fail if rendering, tutorial, Eden, or widget-version workflow implementations return to that file.~~
- [x] ~~Focused widget, plugin-boundary, inspect, authoring-core, program-authoring, bootstrap, capability-authoring, Eden, and runtime-profile tests are green after the ABI classification.~~

Recent completed tranche:

- [x] ~~`requestWidgetVersionActivation` and `rollbackWidgetVersion` moved from `src/widgets.js` to `plugins/inspect/widget-versions.js`.~~
- [x] ~~`src/widgets.js` now keeps a compatibility export for the moved widget-version action workflows instead of owning their implementation.~~
- [x] ~~`plugins/inspect/runtime.js`, `plugins/proposals/proposal-executor.js`, and `plugins/eden/eden-versions.js` now import widget-version request/rollback workflows from the explicit inspect-owned module.~~
- [x] ~~Low-level witnessed primitives and projections such as `activateWidgetVersion`, `widgetVersionTransitions`, and `widgetVersionActivationHistory` remain in `src/widgets.js` as generic authored-widget ABI candidates for the next classification tranche.~~
- [x] ~~Co-located inspect tests now assert plugin-owned widget-version request/rollback workflow behavior and the `src/widgets.js` compatibility export shape.~~
- [x] ~~Focused inspect, proposals, Eden, widgets, runtime-profile, and plugin-boundary tests are green after the ownership move.~~

Recent completed tranche:

- [x] ~~`renderWidgetPage` and its frontend browser runtime helpers moved from `src/widgets.js` to `plugins/inspect/widget-page.js`.~~
- [x] ~~Tutorial browser hook imports moved with the renderer and now read from `plugins/tutorial`.~~
- [x] ~~Eden page-theme hook imports moved with the renderer and now read from `plugins/eden`.~~
- [x] ~~`src/widgets.js` no longer imports tutorial, tutorial client, Eden theme, or type-model rendering helpers; it keeps model/projection exports plus a compatibility export for `renderWidgetPage`.~~
- [x] ~~`plugins/inspect/runtime.js` now imports widget page rendering from its own plugin directory.~~
- [x] ~~Co-located inspect tests now assert plugin-owned widget page rendering and that `src/widgets.js` stays model-focused.~~
- [x] ~~Focused inspect, widgets, generated UI, world-graph, runtime-profile, and plugin-boundary tests are green after the renderer split.~~

Recent completed tranche:

- [x] ~~`src/process-view.js` was moved to `plugins/inspect/process-view.js`, with the old source path reduced to a compatibility facade.~~
- [x] ~~`plugins/inspect/runtime.js` now imports process view projections and page rendering from its own plugin directory.~~
- [x] ~~Co-located inspect tests now assert plugin-owned `processViewProjection`, `processRunProjection`, and `renderProcessPage` plus one-line `src/` compatibility facade shape.~~
- [x] ~~Focused inspect plugin tests plus process-view, runtime-profile, and plugin-boundary tests are green after the ownership move.~~

Recent completed tranche:

- [x] ~~`src/world-graph.js` was moved to `plugins/inspect/world-graph.js`, with the old source path reduced to a compatibility facade.~~
- [x] ~~`plugins/inspect/runtime.js` now imports world graph projections from its own plugin directory.~~
- [x] ~~Co-located inspect tests now assert plugin-owned `worldGraphProjection` / `astNodesProjection` and one-line `src/` compatibility facade shape.~~
- [x] ~~Focused inspect plugin tests plus world-graph, runtime-profile, and plugin-boundary tests are green after the ownership move.~~

Recent completed tranche:

- [x] ~~`src/bootstrap-shell.js` was moved to `plugins/bootstrap/bootstrap-shell.js`, with the old source path reduced to a compatibility facade.~~
- [x] ~~`src/tutorials.js` and tutorial browser/client helper files were moved to `plugins/tutorial`, with old source paths reduced to compatibility facades.~~
- [x] ~~`plugins/bootstrap/bootstrap-handlers.js` now imports the bootstrap shell from its own plugin directory.~~
- [x] ~~`plugins/tutorial/tutorial-handlers.js` now imports tutorial definitions/progress normalization from its own plugin directory.~~
- [x] ~~`plugin.bootstrap` now declares its `plugin.tutorial` dependency because the bootstrap shell embeds tutorial helpers.~~
- [x] ~~Co-located bootstrap and tutorial tests now assert plugin-owned implementation files and one-line `src/` compatibility facades.~~
- [x] ~~Focused bootstrap, tutorial, runtime profile, runtime plugin utility, and plugin-boundary tests are green after the ownership move.~~

Recent completed tranche:

- [x] ~~Runtime profile defaults moved to `store/seeds/runtime-profiles.json`.~~
- [x] ~~First-party package/catalog seed metadata moved to `store/seeds/first-party-plugin-catalog.json`.~~
- [x] ~~`plugins/first-party-runtime-registry.js`, `plugins/first-party-runtime-services.js`, `plugins/first-party-job-handlers.js`, and `plugins/first-party-capabilities.js` were deleted.~~
- [x] ~~`src/runtime-bundles.js` now keeps core bundle mechanics plus seed-backed bundle skeletons; optional executable truth is loaded from active plugin runtime modules.~~
- [x] ~~`src/runtime-bundle-handlers.js` keeps only the core handler catalog fallback; optional handler catalogs come from active plugin bundle overrides.~~
- [x] ~~Boundary tests now fail if the deleted global plugin singleton files return or if `plugins/` gains root-level files.~~

Recent completed tranche:

- [x] ~~Runtime profiles now select first-party plugin/meta-plugin presets rather than bundle lists.~~
- [x] ~~`minimal` remains core ABI only, while `full` is `plugin.authoring`, `plugin.inspect`, `plugin.canvas`, `plugin.mcp`, `plugin.practical-backend`, `plugin.demo`, and `plugin.eden`.~~
- [x] ~~Profile dependency expansion derives active bundle ids from plugin/meta-plugin dependencies while preserving previous compatibility ordering.~~
- [x] ~~Runtime diagnostics expose selected profile plugins, dependency-expanded profile plugins, core bundle ids, and active bundles separately.~~
- [x] ~~Focused runtime profile and bundle handler tests prove profile-selected plugin composition and compatibility behavior.~~

Recent completed tranche:

- [x] ~~`plugins/eden/eden-page.js` owns Eden page rendering; `src/eden-page.js` is compatibility re-exports only.~~
- [x] ~~`plugins/eden/eden-personal-box.js`, `eden-page-theme.js`, `eden-academy.js`, `eden-organization.js`, `eden-theory.js`, `eden-capability-install.js`, `eden-capability-install-request.js`, and `eden-versions.js` own the Eden helper implementations previously held in `src/eden-*`.~~
- [x] ~~`plugins/eden/eden-projection.js` owns `edenNeighborhoodProjection`; `plugins/canvas/canvas-projection.js` no longer contains Eden projection helpers.~~
- [x] ~~`plugins/eden/handlers.js` imports Eden behavior from plugin-local modules.~~
- [x] ~~`src/runtime-server.js` serves `/canvas-lib/eden-*` compatibility modules from `plugins/eden`.~~
- [x] ~~Co-located `plugin.eden` tests prove plugin ownership and core/canvas thinning, while runtime tests prove `minimal + plugin.eden` activates Eden and plain `minimal` keeps inactive handlers unavailable.~~

Recent completed tranche:

- [x] ~~`plugins/demo/handler-set.js` owns the demo handler-set provider and factory.~~
- [x] ~~`plugins/demo/projections.js` owns todo/private-note/public witness projections; `src/projections.js` is compatibility re-exports only.~~
- [x] ~~`plugins/demo/private-notes-runtime.js` owns private-note privacy shaping; `src/private-notes-runtime.js` is compatibility re-exports only.~~
- [x] ~~`plugins/demo/todo-runtime.js` owns demo todo authority and mutation helpers; `src/todo-runtime.js` is compatibility re-exports only.~~
- [x] ~~`plugins/demo/demo-proposal-targets.js` owns demo todo proposal target execution; `plugins/proposals/proposal-executor.js` delegates todo targets to the demo plugin helper.~~
- [x] ~~`examples/demo/backend.wtoml` explicitly carries both `plugin.demo` runtime-plugin intent and `handlerSet = "demo"` runner intent.~~
- [x] ~~Compatibility demo entrypoints remain thin imports around the maintained split demo source of truth.~~
- [x] ~~Co-located `plugin.demo` tests prove plugin ownership and core thinning, while runtime tests prove a runner with `handlerSet = "demo"` no longer auto-activates demo behavior without `plugin.demo`.~~

Recent completed tranche:

- [x] ~~`plugins/canvas/canvas-core.js` owns shared canvas geometry/camera helpers and the browser prelude.~~
- [x] ~~`plugins/canvas/canvas-processes.js` owns canvas process handlers.~~
- [x] ~~`plugins/canvas/canvas-projection.js` owns canvas and perspective projections.~~
- [x] ~~`plugins/canvas/canvas-page.js` owns canvas page rendering.~~
- [x] ~~`plugins/canvas/canvas-undo.js` owns canvas undo/compensation helpers.~~
- [x] ~~`src/canvas-core.js`, `src/canvas-processes.js`, `src/canvas-projection.js`, `src/canvas-page.js`, and `src/canvas-undo.js` are compatibility re-exports only.~~
- [x] ~~Runtime and proposal assembly import canvas implementation from `plugins/canvas`, and `/canvas-lib` serves canvas core/projection modules from the plugin directory.~~
- [x] ~~Co-located `plugin.canvas` tests prove plugin ownership and core thinning, while runtime tests prove `minimal` without canvas loses canvas routes and `minimal + plugin.canvas` exposes canvas behavior.~~

Recent completed tranche:

- [x] ~~`plugins/mcp/mcp-tools.js` now owns MCP protocol constants, supported tool definitions, tool scope calculation, and tool execution.~~
- [x] ~~`plugins/mcp/mcp-support-services.js` now owns MCP origin validation, principal resolution, capability gating, and installed tool scope checks.~~
- [x] ~~`plugins/mcp/runtime.js` remains the source of truth for MCP HTTP route and handler behavior.~~
- [x] ~~`src/mcp.js` is compatibility re-exports only, and runtime assembly imports MCP implementation from `plugins/mcp`.~~
- [x] ~~Co-located `plugin.mcp` tests prove plugin ownership and core thinning, while runtime tests prove `minimal` without MCP returns 404 and `minimal + plugin.mcp` activates `bundle-mcp`.~~

Recent completed tranche:

- [x] ~~`plugins/authoring-core` was added as a first-class plugin package for generic authoring CRUD.~~
- [x] ~~`bundle-authoring-core` route/catalog/handler ownership is loaded from `plugins/authoring-core/runtime.js`.~~
- [x] ~~Identity/context/perspective/stewardship/widget/route/serve process helpers moved into `plugins/authoring-core/authoring-core-processes.js`; `src/bootstrap-authoring.js` is compatibility re-exports only.~~
- [x] ~~Generic authoring proposal target execution moved into `plugins/authoring-core/authoring-core-proposal-targets.js`; `plugins/proposals/proposal-executor.js` delegates those targets to that plugin helper.~~
- [x] ~~`plugin.authoring` is now a pure meta package over `plugin.authoring-core`, bootstrap, capability/program/server-runner/MCP authoring, proposals, and tutorial.~~
- [x] ~~Co-located plugin tests pass for `plugin.authoring-core` and the full plugin test runner remains green.~~

Recent completed tranche:

- [x] ~~`plugins/mcp-authoring` was added as a first-class plugin package.~~
- [x] ~~`bundle-mcp-authoring` route/catalog/handler ownership moved from `plugins/authoring` to `plugins/mcp-authoring`.~~
- [x] ~~MCP server define and MCP tool install/remove process helpers moved into `plugins/mcp-authoring/mcp-processes.js`; `src/bootstrap-authoring.js` now only provides compatibility re-exports.~~
- [x] ~~MCP proposal target execution moved into `plugins/mcp-authoring/mcp-proposal-targets.js`; `plugins/proposals/proposal-executor.js` delegates those targets to that plugin helper.~~
- [x] ~~`plugin.authoring` now depends on `plugin.bootstrap`, `plugin.capability-authoring`, `plugin.program-authoring`, `plugin.server-runner-authoring`, `plugin.mcp-authoring`, `plugin.proposals`, and `plugin.tutorial`.~~
- [x] ~~Co-located plugin tests pass for `plugin.mcp-authoring`, and the full plugin test runner remains green.~~

Previous completed tranche:

- [x] ~~`plugins/server-runner-authoring` was added as a first-class plugin package.~~
- [x] ~~`bundle-server-runner-authoring` route/catalog/handler ownership moved from `plugins/authoring` to `plugins/server-runner-authoring`.~~
- [x] ~~Server runner define and runtime plugin install/remove process helpers moved into `plugins/server-runner-authoring/server-runner-processes.js`; `src/bootstrap-authoring.js` now only provides compatibility re-exports.~~
- [x] ~~Server-runner/runtime-plugin proposal target execution moved into `plugins/server-runner-authoring/server-runner-proposal-targets.js`; `plugins/proposals/proposal-executor.js` delegates those targets to that plugin helper.~~
- [x] ~~`plugin.authoring` now depends on `plugin.bootstrap`, `plugin.capability-authoring`, `plugin.program-authoring`, `plugin.server-runner-authoring`, `plugin.proposals`, and `plugin.tutorial`.~~
- [x] ~~Co-located plugin tests pass for `plugin.server-runner-authoring`, and the full plugin test runner remains green.~~

Earlier program completed tranche:

- [x] ~~`plugins/program-authoring` was added as a first-class plugin package.~~
- [x] ~~`bundle-program-authoring` route/catalog/handler ownership moved from `plugins/authoring` to `plugins/program-authoring`.~~
- [x] ~~Frontend/backend program authoring process helpers moved into `plugins/program-authoring/program-processes.js`; `src/bootstrap-authoring.js` now only provides compatibility re-exports.~~
- [x] ~~Program proposal target execution moved into `plugins/program-authoring/program-proposal-targets.js`; `plugins/proposals/proposal-executor.js` delegates program targets to that plugin helper.~~
- [x] ~~`plugin.authoring` now depends on `plugin.bootstrap`, `plugin.capability-authoring`, `plugin.program-authoring`, `plugin.proposals`, and `plugin.tutorial`.~~
- [x] ~~Co-located plugin tests pass for `plugin.program-authoring`, and the full plugin test runner remains green.~~

Earlier capability completed tranche:

- [x] ~~`plugins/capability-authoring` was added as a first-class plugin package.~~
- [x] ~~`bundle-capability-authoring` route/catalog/handler ownership moved from `plugins/authoring` to `plugins/capability-authoring`.~~
- [x] ~~Capability define/install/remove process helpers moved into `plugins/capability-authoring/capability-processes.js`; `src/bootstrap-authoring.js` now only provides compatibility re-exports.~~
- [x] ~~Capability proposal target execution moved into `plugins/capability-authoring/capability-proposal-targets.js`; `plugins/proposals/proposal-executor.js` delegates capability targets to that plugin helper.~~
- [x] ~~`plugin.authoring` now depends on `plugin.bootstrap`, `plugin.capability-authoring`, `plugin.proposals`, and `plugin.tutorial`.~~
- [x] ~~Co-located plugin tests pass for `plugin.capability-authoring`, `plugin.authoring`, and `plugin.proposals`.~~

Earlier proposal completed tranche:

- [x] ~~`plugins/proposals` was added as a first-class plugin package.~~
- [x] ~~`bundle-proposals` route/catalog/handler ownership moved from `plugins/authoring` to `plugins/proposals`.~~
- [x] ~~Proposal create/approve/reject process helpers moved into `plugins/proposals/proposal-processes.js`; `src/bootstrap-authoring.js` now only provides compatibility re-exports.~~
- [x] ~~Proposal executor dispatch moved into `plugins/proposals/proposal-executor.js`; `src/runtime-authoring-services.js` imports it from the plugin.~~
- [x] ~~`plugin.authoring` now depends on `plugin.bootstrap`, `plugin.proposals`, and `plugin.tutorial`.~~
- [x] ~~Co-located plugin tests pass for `plugin.proposals` and the full plugin test runner.~~

Earlier completed tranche:

- [x] ~~`plugins/bootstrap` was added as a first-class plugin package.~~
- [x] ~~`bundle-bootstrap` route/catalog/surface/handler ownership moved from `plugins/authoring` to `plugins/bootstrap`.~~
- [x] ~~Bootstrap read models and operator recovery handlers moved into `plugins/bootstrap`.~~
- [x] ~~`plugin.authoring` now activates only `bundle-authoring` and depends on `plugin.bootstrap` and `plugin.tutorial`.~~
- [x] ~~Blank-world bootstrap behavior remains green through recursive plugin dependency activation.~~
- [x] ~~Co-located plugin tests pass for `plugin.authoring`, `plugin.bootstrap`, and `plugin.tutorial`.~~

Earlier tutorial completed tranche:

- [x] ~~`plugins/tutorial` was added as a first-class plugin package.~~
- [x] ~~`bundle-tutorial` route/catalog/handler ownership moved from `plugins/authoring` to `plugins/tutorial`.~~
- [x] ~~`plugin.authoring` now activates only `bundle-authoring` and depends on `plugin.tutorial`.~~
- [x] ~~Bootstrap default activation still exposes tutorial behavior through recursive plugin dependency activation.~~
- [x] ~~Co-located plugin tests pass for both `plugin.authoring` and `plugin.tutorial`.~~

Earlier demo completed tranche:

- [x] ~~`examples/demo/backend.wtoml` now authors `plugin.demo` on `demo_server`.~~
- [x] ~~`src/runtime-server.js` no longer adds bundles from `serverRunner.handlerSet`.~~
- [x] ~~The exported `bundleIdsForHandlerSet` fallback was removed from `src/runtime-bundles.js`.~~
- [x] ~~`plugins/demo/demo.test.js` verifies the plugin manifest/runtime/handler-set ownership shape.~~
- [x] ~~`test/runtime-profile.test.js` proves the maintained demo activates `plugin.demo` under `minimal`.~~
- [x] ~~`test/runtime-profile.test.js` proves `handlerSet = "demo"` without `plugin.demo` fails instead of auto-activating `bundle-demo`.~~

Evidence:

- [plugins/bootstrap/plugin.json](/C:/Users/aaron/Documents/world/plugins/bootstrap/plugin.json)
- [plugins/bootstrap/runtime.js](/C:/Users/aaron/Documents/world/plugins/bootstrap/runtime.js)
- [plugins/bootstrap/bootstrap-handlers.js](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-handlers.js)
- [plugins/bootstrap/bootstrap-read-models.js](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-read-models.js)
- [plugins/bootstrap/bootstrap-shell.js](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap-shell.js)
- [plugins/bootstrap/bootstrap.test.js](/C:/Users/aaron/Documents/world/plugins/bootstrap/bootstrap.test.js)
- [plugins/capability-authoring/plugin.json](/C:/Users/aaron/Documents/world/plugins/capability-authoring/plugin.json)
- [plugins/capability-authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/capability-authoring/runtime.js)
- [plugins/capability-authoring/capability-authoring-handlers.js](/C:/Users/aaron/Documents/world/plugins/capability-authoring/capability-authoring-handlers.js)
- [plugins/capability-authoring/capability-processes.js](/C:/Users/aaron/Documents/world/plugins/capability-authoring/capability-processes.js)
- [plugins/capability-authoring/capability-proposal-targets.js](/C:/Users/aaron/Documents/world/plugins/capability-authoring/capability-proposal-targets.js)
- [plugins/capability-authoring/capability-authoring.test.js](/C:/Users/aaron/Documents/world/plugins/capability-authoring/capability-authoring.test.js)
- [plugins/program-authoring/plugin.json](/C:/Users/aaron/Documents/world/plugins/program-authoring/plugin.json)
- [plugins/program-authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/program-authoring/runtime.js)
- [plugins/program-authoring/program-authoring-handlers.js](/C:/Users/aaron/Documents/world/plugins/program-authoring/program-authoring-handlers.js)
- [plugins/program-authoring/program-processes.js](/C:/Users/aaron/Documents/world/plugins/program-authoring/program-processes.js)
- [plugins/program-authoring/program-proposal-targets.js](/C:/Users/aaron/Documents/world/plugins/program-authoring/program-proposal-targets.js)
- [plugins/program-authoring/program-authoring.test.js](/C:/Users/aaron/Documents/world/plugins/program-authoring/program-authoring.test.js)
- [plugins/server-runner-authoring/plugin.json](/C:/Users/aaron/Documents/world/plugins/server-runner-authoring/plugin.json)
- [plugins/server-runner-authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/server-runner-authoring/runtime.js)
- [plugins/server-runner-authoring/server-runner-authoring-handlers.js](/C:/Users/aaron/Documents/world/plugins/server-runner-authoring/server-runner-authoring-handlers.js)
- [plugins/server-runner-authoring/server-runner-processes.js](/C:/Users/aaron/Documents/world/plugins/server-runner-authoring/server-runner-processes.js)
- [plugins/server-runner-authoring/server-runner-proposal-targets.js](/C:/Users/aaron/Documents/world/plugins/server-runner-authoring/server-runner-proposal-targets.js)
- [plugins/server-runner-authoring/server-runner-authoring.test.js](/C:/Users/aaron/Documents/world/plugins/server-runner-authoring/server-runner-authoring.test.js)
- [plugins/mcp-authoring/plugin.json](/C:/Users/aaron/Documents/world/plugins/mcp-authoring/plugin.json)
- [plugins/mcp-authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/mcp-authoring/runtime.js)
- [plugins/mcp-authoring/mcp-authoring-handlers.js](/C:/Users/aaron/Documents/world/plugins/mcp-authoring/mcp-authoring-handlers.js)
- [plugins/mcp-authoring/mcp-processes.js](/C:/Users/aaron/Documents/world/plugins/mcp-authoring/mcp-processes.js)
- [plugins/mcp-authoring/mcp-proposal-targets.js](/C:/Users/aaron/Documents/world/plugins/mcp-authoring/mcp-proposal-targets.js)
- [plugins/mcp-authoring/mcp-authoring.test.js](/C:/Users/aaron/Documents/world/plugins/mcp-authoring/mcp-authoring.test.js)
- [plugins/mcp/plugin.json](/C:/Users/aaron/Documents/world/plugins/mcp/plugin.json)
- [plugins/mcp/runtime.js](/C:/Users/aaron/Documents/world/plugins/mcp/runtime.js)
- [plugins/mcp/mcp-tools.js](/C:/Users/aaron/Documents/world/plugins/mcp/mcp-tools.js)
- [plugins/mcp/mcp-support-services.js](/C:/Users/aaron/Documents/world/plugins/mcp/mcp-support-services.js)
- [plugins/mcp/mcp.test.js](/C:/Users/aaron/Documents/world/plugins/mcp/mcp.test.js)
- [src/mcp.js](/C:/Users/aaron/Documents/world/src/mcp.js)
- [plugins/canvas/plugin.json](/C:/Users/aaron/Documents/world/plugins/canvas/plugin.json)
- [plugins/canvas/runtime.js](/C:/Users/aaron/Documents/world/plugins/canvas/runtime.js)
- [plugins/canvas/canvas-core.js](/C:/Users/aaron/Documents/world/plugins/canvas/canvas-core.js)
- [plugins/canvas/canvas-processes.js](/C:/Users/aaron/Documents/world/plugins/canvas/canvas-processes.js)
- [plugins/canvas/canvas-projection.js](/C:/Users/aaron/Documents/world/plugins/canvas/canvas-projection.js)
- [plugins/canvas/canvas-page.js](/C:/Users/aaron/Documents/world/plugins/canvas/canvas-page.js)
- [plugins/canvas/canvas-undo.js](/C:/Users/aaron/Documents/world/plugins/canvas/canvas-undo.js)
- [plugins/canvas/canvas.test.js](/C:/Users/aaron/Documents/world/plugins/canvas/canvas.test.js)
- [src/canvas-core.js](/C:/Users/aaron/Documents/world/src/canvas-core.js)
- [src/canvas-processes.js](/C:/Users/aaron/Documents/world/src/canvas-processes.js)
- [src/canvas-projection.js](/C:/Users/aaron/Documents/world/src/canvas-projection.js)
- [src/canvas-page.js](/C:/Users/aaron/Documents/world/src/canvas-page.js)
- [src/canvas-undo.js](/C:/Users/aaron/Documents/world/src/canvas-undo.js)
- [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- [src/runtime-route-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-route-handlers.js)
- [plugins/proposals/plugin.json](/C:/Users/aaron/Documents/world/plugins/proposals/plugin.json)
- [plugins/proposals/runtime.js](/C:/Users/aaron/Documents/world/plugins/proposals/runtime.js)
- [plugins/proposals/proposal-handlers.js](/C:/Users/aaron/Documents/world/plugins/proposals/proposal-handlers.js)
- [plugins/proposals/proposal-processes.js](/C:/Users/aaron/Documents/world/plugins/proposals/proposal-processes.js)
- [plugins/proposals/proposal-executor.js](/C:/Users/aaron/Documents/world/plugins/proposals/proposal-executor.js)
- [plugins/proposals/proposals.test.js](/C:/Users/aaron/Documents/world/plugins/proposals/proposals.test.js)
- [plugins/tutorial/plugin.json](/C:/Users/aaron/Documents/world/plugins/tutorial/plugin.json)
- [plugins/tutorial/runtime.js](/C:/Users/aaron/Documents/world/plugins/tutorial/runtime.js)
- [plugins/tutorial/tutorial-handlers.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorial-handlers.js)
- [plugins/tutorial/tutorials.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorials.js)
- [plugins/tutorial/tutorial-app-client.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorial-app-client.js)
- [plugins/tutorial/tutorial-bootstrap-client.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorial-bootstrap-client.js)
- [plugins/tutorial/tutorial-bootstrap-controller-client.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorial-bootstrap-controller-client.js)
- [plugins/tutorial/tutorial-bootstrap-ui.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorial-bootstrap-ui.js)
- [plugins/tutorial/tutorial-runtime-ui.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorial-runtime-ui.js)
- [plugins/tutorial/tutorial.test.js](/C:/Users/aaron/Documents/world/plugins/tutorial/tutorial.test.js)
- [plugins/inspect/runtime.js](/C:/Users/aaron/Documents/world/plugins/inspect/runtime.js)
- [plugins/inspect/world-graph.js](/C:/Users/aaron/Documents/world/plugins/inspect/world-graph.js)
- [plugins/inspect/process-view.js](/C:/Users/aaron/Documents/world/plugins/inspect/process-view.js)
- [plugins/inspect/widget-page.js](/C:/Users/aaron/Documents/world/plugins/inspect/widget-page.js)
- [plugins/inspect/widget-versions.js](/C:/Users/aaron/Documents/world/plugins/inspect/widget-versions.js)
- [plugins/inspect/inspect.test.js](/C:/Users/aaron/Documents/world/plugins/inspect/inspect.test.js)
- [src/widgets.js](/C:/Users/aaron/Documents/world/src/widgets.js)
- [test/plugin-boundaries.test.js](/C:/Users/aaron/Documents/world/test/plugin-boundaries.test.js)
- [plugins/authoring-core/plugin.json](/C:/Users/aaron/Documents/world/plugins/authoring-core/plugin.json)
- [plugins/authoring-core/runtime.js](/C:/Users/aaron/Documents/world/plugins/authoring-core/runtime.js)
- [plugins/authoring-core/authoring-core-handlers.js](/C:/Users/aaron/Documents/world/plugins/authoring-core/authoring-core-handlers.js)
- [plugins/authoring-core/authoring-core-processes.js](/C:/Users/aaron/Documents/world/plugins/authoring-core/authoring-core-processes.js)
- [plugins/authoring-core/authoring-core-proposal-targets.js](/C:/Users/aaron/Documents/world/plugins/authoring-core/authoring-core-proposal-targets.js)
- [plugins/authoring-core/authoring-core.test.js](/C:/Users/aaron/Documents/world/plugins/authoring-core/authoring-core.test.js)
- [plugins/authoring/plugin.json](/C:/Users/aaron/Documents/world/plugins/authoring/plugin.json)
- [plugins/authoring/authoring.test.js](/C:/Users/aaron/Documents/world/plugins/authoring/authoring.test.js)
- [plugins/demo/plugin.json](/C:/Users/aaron/Documents/world/plugins/demo/plugin.json)
- [plugins/demo/runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/runtime.js)
- [plugins/demo/handler-set.js](/C:/Users/aaron/Documents/world/plugins/demo/handler-set.js)
- [plugins/demo/projections.js](/C:/Users/aaron/Documents/world/plugins/demo/projections.js)
- [plugins/demo/private-notes-runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/private-notes-runtime.js)
- [plugins/demo/todo-runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/todo-runtime.js)
- [plugins/demo/demo-proposal-targets.js](/C:/Users/aaron/Documents/world/plugins/demo/demo-proposal-targets.js)
- [plugins/demo/demo.test.js](/C:/Users/aaron/Documents/world/plugins/demo/demo.test.js)
- deleted demo facades: `src/projections.js`, `src/private-notes-runtime.js`,
  `src/todo-runtime.js`
- [plugins/eden/plugin.json](/C:/Users/aaron/Documents/world/plugins/eden/plugin.json)
- [plugins/eden/runtime.js](/C:/Users/aaron/Documents/world/plugins/eden/runtime.js)
- [plugins/eden/handlers.js](/C:/Users/aaron/Documents/world/plugins/eden/handlers.js)
- [plugins/eden/eden-page.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-page.js)
- [plugins/eden/eden-projection.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-projection.js)
- [plugins/eden/eden-personal-box.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-personal-box.js)
- [plugins/eden/eden-page-theme.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-page-theme.js)
- [plugins/eden/eden-academy.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-academy.js)
- [plugins/eden/eden-organization.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-organization.js)
- [plugins/eden/eden-theory.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-theory.js)
- [plugins/eden/eden-capability-install.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-capability-install.js)
- [plugins/eden/eden-capability-install-request.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-capability-install-request.js)
- [plugins/eden/eden-versions.js](/C:/Users/aaron/Documents/world/plugins/eden/eden-versions.js)
- [plugins/eden/eden.test.js](/C:/Users/aaron/Documents/world/plugins/eden/eden.test.js)
- deleted Eden facades: `src/eden-page.js`, `src/eden-personal-box.js`,
  `src/eden-page-theme.js`, `src/eden-academy.js`, `src/eden-organization.js`,
  `src/eden-theory.js`, `src/eden-capability-install.js`,
  `src/eden-capability-install-request.js`, `src/eden-versions.js`
- [test/eden-projection.test.js](/C:/Users/aaron/Documents/world/test/eden-projection.test.js)
- deleted authoring facade: `src/bootstrap-authoring.js`
- [src/runtime-authoring-services.js](/C:/Users/aaron/Documents/world/src/runtime-authoring-services.js)
- [store/seeds/runtime-profiles.json](/C:/Users/aaron/Documents/world/store/seeds/runtime-profiles.json)
- [store/seeds/first-party-plugin-catalog.json](/C:/Users/aaron/Documents/world/store/seeds/first-party-plugin-catalog.json)
- [src/runtime-store-seeds.js](/C:/Users/aaron/Documents/world/src/runtime-store-seeds.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/cli.test.js](/C:/Users/aaron/Documents/world/test/cli.test.js)
- [test/dsl.test.js](/C:/Users/aaron/Documents/world/test/dsl.test.js)

Earlier demo migration evidence:

- [examples/demo/backend.wtoml](/C:/Users/aaron/Documents/world/examples/demo/backend.wtoml)
- [plugins/demo/plugin.json](/C:/Users/aaron/Documents/world/plugins/demo/plugin.json)
- [plugins/demo/runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/runtime.js)
- [plugins/demo/handler-set.js](/C:/Users/aaron/Documents/world/plugins/demo/handler-set.js)
- [plugins/demo/demo.test.js](/C:/Users/aaron/Documents/world/plugins/demo/demo.test.js)
- [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)

Earlier boundary evidence:

- [test/plugin-boundaries.test.js](/C:/Users/aaron/Documents/world/test/plugin-boundaries.test.js)
- [plugins/assets/plugin.json](/C:/Users/aaron/Documents/world/plugins/assets/plugin.json)
- [plugins/assets/runtime.js](/C:/Users/aaron/Documents/world/plugins/assets/runtime.js)
- [plugins/assets/handler-catalog.js](/C:/Users/aaron/Documents/world/plugins/assets/handler-catalog.js)
- [plugins/assets/handlers.js](/C:/Users/aaron/Documents/world/plugins/assets/handlers.js)
- [plugins/assets/asset-services.js](/C:/Users/aaron/Documents/world/plugins/assets/asset-services.js)
- [plugins/assets/assets.test.js](/C:/Users/aaron/Documents/world/plugins/assets/assets.test.js)
- [plugins/fs-json/plugin.json](/C:/Users/aaron/Documents/world/plugins/fs-json/plugin.json)
- [plugins/fs-json/runtime.js](/C:/Users/aaron/Documents/world/plugins/fs-json/runtime.js)
- [plugins/fs-json/handler-catalog.js](/C:/Users/aaron/Documents/world/plugins/fs-json/handler-catalog.js)
- [plugins/fs-json/fs-json.test.js](/C:/Users/aaron/Documents/world/plugins/fs-json/fs-json.test.js)
- [plugins/fs-stream/plugin.json](/C:/Users/aaron/Documents/world/plugins/fs-stream/plugin.json)
- [plugins/fs-stream/runtime.js](/C:/Users/aaron/Documents/world/plugins/fs-stream/runtime.js)
- [plugins/fs-stream/handler-catalog.js](/C:/Users/aaron/Documents/world/plugins/fs-stream/handler-catalog.js)
- [plugins/fs-stream/handlers.js](/C:/Users/aaron/Documents/world/plugins/fs-stream/handlers.js)
- [plugins/fs-stream/stream-utils.js](/C:/Users/aaron/Documents/world/plugins/fs-stream/stream-utils.js)
- [plugins/fs-stream/fs-stream.test.js](/C:/Users/aaron/Documents/world/plugins/fs-stream/fs-stream.test.js)
- [plugins/fs-blob/plugin.json](/C:/Users/aaron/Documents/world/plugins/fs-blob/plugin.json)
- [plugins/fs-blob/runtime.js](/C:/Users/aaron/Documents/world/plugins/fs-blob/runtime.js)
- [plugins/fs-blob/handler-catalog.js](/C:/Users/aaron/Documents/world/plugins/fs-blob/handler-catalog.js)
- [plugins/fs-blob/handlers.js](/C:/Users/aaron/Documents/world/plugins/fs-blob/handlers.js)
- [plugins/fs-blob/io-services.js](/C:/Users/aaron/Documents/world/plugins/fs-blob/io-services.js)
- [plugins/fs-blob/fs-blob.test.js](/C:/Users/aaron/Documents/world/plugins/fs-blob/fs-blob.test.js)
- [plugins/backend-seams/plugin.json](/C:/Users/aaron/Documents/world/plugins/backend-seams/plugin.json)
- [plugins/backend-seams/runtime.js](/C:/Users/aaron/Documents/world/plugins/backend-seams/runtime.js)
- [plugins/backend-seams/handler-catalog.js](/C:/Users/aaron/Documents/world/plugins/backend-seams/handler-catalog.js)
- [plugins/backend-seams/handlers.js](/C:/Users/aaron/Documents/world/plugins/backend-seams/handlers.js)
- [plugins/backend-seams/backend-seams-page.js](/C:/Users/aaron/Documents/world/plugins/backend-seams/backend-seams-page.js)
- [plugins/backend-seams/support-services.js](/C:/Users/aaron/Documents/world/plugins/backend-seams/support-services.js)
- [plugins/backend-seams/backend-seams.test.js](/C:/Users/aaron/Documents/world/plugins/backend-seams/backend-seams.test.js)
- [plugins/practical-backend/plugin.json](/C:/Users/aaron/Documents/world/plugins/practical-backend/plugin.json)
- deleted root-level plugin singleton files: `plugins/first-party-capabilities.js`,
  `plugins/first-party-job-handlers.js`,
  `plugins/first-party-runtime-registry.js`,
  `plugins/first-party-runtime-services.js`
- [store/seeds/runtime-profiles.json](/C:/Users/aaron/Documents/world/store/seeds/runtime-profiles.json)
- [store/seeds/first-party-plugin-catalog.json](/C:/Users/aaron/Documents/world/store/seeds/first-party-plugin-catalog.json)
- [src/runtime-store-seeds.js](/C:/Users/aaron/Documents/world/src/runtime-store-seeds.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)
- [test/runtime-plugin-utils.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-utils.test.js)
- [test/runtime-route-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-route-handlers.test.js)
- [test/runtime-practical-backend-asset-services.test.js](/C:/Users/aaron/Documents/world/test/runtime-practical-backend-asset-services.test.js)
- [test/runtime-practical-backend-glue.test.js](/C:/Users/aaron/Documents/world/test/runtime-practical-backend-glue.test.js)

---

## 5. Evidence Rules

What counts as progress:

- code moved from core or transitional catch-all packages into a concrete plugin
- tests proving the plugin is the meaningful ownership boundary
- deletion or thinning of old feature ownership after the move
- runtime proof that removing/disabling the plugin removes or blocks the feature

What does not count as progress by itself:

- better wording
- more diagrams
- more catalog/read-model fields
- more plugin-management UI
- more bundle-bridge metadata
- manifest-only packages with no meaningful implementation
- planning work not followed by ownership transfer

Rule:

- no roadmap or migration-status update should be treated as meaningful progress unless a code/runtime ownership seam was removed in the same tranche

---

## 6. Verification Checklist

Before marking any seam complete:

1. Inspect the plugin directory and confirm it owns meaningful implementation beyond `plugin.json`.
2. Inspect the old owner and confirm feature-specific ownership was reduced or removed.
3. Run focused fast tests proving the feature works through the plugin.
4. Run negative coverage proving the feature does not silently survive without the plugin.
5. Confirm plugin dependency metadata explains aggregate packages honestly.
6. Confirm the plugin package is now the most natural source of truth for understanding the feature.
7. Only then update this document.

---

## 7. Restart Rule

When restarting work from this file:

- choose the next incomplete ownership seam
- use the tranche queue in Section 3A unless a direct dependency forces a smaller preparatory change
- do code first
- run focused fast tests
- update this document only after implementation and verification

If a proposed action cannot be tied directly to moving runtime ownership into plugin directories or deleting a transitional ownership seam, do not count it as plugin-migration work.
