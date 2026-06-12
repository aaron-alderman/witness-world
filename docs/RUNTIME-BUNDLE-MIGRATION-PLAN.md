# Runtime Bundle Migration Plan

## Goal

Reduce the default runtime to a narrow executable core, while preserving today's behavior behind a compatibility profile during migration.

## Implementation Status

Updated: `2026-06-12`

### Completed

- [x] Added the runtime bundle manifest contract with contribution groups for capabilities, providers, routes, and surfaces.
- [x] Added the internal bundle registry and runtime profile resolver in core startup code.
- [x] Added internal manifests for `bundle-authoring`, `bundle-inspect`, `bundle-canvas`, `bundle-mcp`, `bundle-practical-backend`, `bundle-demo`, and `bundle-eden`.
- [x] Added a dedicated `bundle-tutorial` manifest so tutorial-progress routing/execution stops pretending to be part of the executable core runtime.
- [x] Added runtime profiles for `minimal`, `authoring`, `inspect`, `practical-backend`, and `full`, with `full` still the default compatibility profile.
- [x] Made bundle/profile queries the source of truth for provided capabilities, contributed routes, contributed surfaces, and bundle diagnostics.
- [x] Split universal runtime capabilities from bundle-provided practical-backend capabilities.
- [x] Replaced hardcoded default host capability installation with profile-driven installation from active bundle providers.
- [x] Made generic route presence honest by matching bundle-contributed routes instead of relying on a single hardcoded feature table.
- [x] Moved runtime surface visibility for bootstrap, inspect, and backend seams behind bundle surface contributions.
- [x] Extracted executable handler ownership for the first bundle slices out of the central `src/host.js` dispatch table and into bundle-provided factories: all current `bundle-authoring` bootstrap/CRUD/proposal/widget handlers, `bundle-inspect`, `bundle-canvas`, and `bundle-mcp`.
- [x] Completed `bundle-practical-backend` executable extraction by moving `page.backendSeams`, `backendSeams.read`, `auth.oauth.start`, `auth.oauth.callback`, `auth.oauth.links.list`, `auth.oauth.links.read`, `runtimeConfig.read`, `jobs.queue.enqueue`, `jobs.queue.list`, `jobs.queue.read`, `http.outbound.send`, `http.outbound.list`, `http.outbound.read`, `notify.email.enqueue`, `notify.sms.enqueue`, `notifications.list`, `notifications.read`, `webhook.inbound.receive`, `webhook.inbound.list`, `webhook.inbound.read`, `db.sql.inspect`, `db.sql.migrate`, `db.sql.query`, `db.sql.command`, `db.sql.transaction`, `search.index.inspect`, `search.index.build`, `search.index.reindex`, `search.index.query`, `fs.blob.list`, `fs.blob.meta`, `fs.blob.read`, `fs.blob.write`, `fs.blob.delete`, `fs.stream.read`, `fs.stream.write`, `fs.stream.copy`, `asset.content.read`, `asset.text.read`, `asset.thumbnail.read`, `asset.attachments.list`, `asset.attach`, `asset.detach`, `asset.upload`, `asset.ingest.retry`, and `asset.search.reindex` behind bundle-provided handler factories.
- [x] Moved `bundle-core-runtime` executable session and home-page handlers behind a core runtime bundle factory so `src/host.js` no longer imports tutorial definitions, Eden page-theme projection, or Eden version-publish operations directly.
- [x] Reclassified tutorial-progress route and handler ownership out of `bundle-core-runtime` and into `bundle-tutorial`, leaving session and home-page behavior as the actual core runtime surface.
- [x] Moved `bundle-inspect` widget-version activation and rollback execution behind the inspect bundle factory, and moved session/tutorial endpoint matching into bundle-contributed core runtime routes instead of host path special cases.
- [x] Moved bootstrap-authoring imports and proposal execution construction behind the authoring bundle path so `src/host.js` no longer imports `bootstrap-authoring.js` directly or owns the proposal switchboard.
- [x] Extracted runtime route-matching and bootstrap-fallback decision primitives from `src/host.js` into a shared runtime routing module so fallback remains bundle/profile-driven instead of host-local control flow.
- [x] Extracted bootstrap-only live-runner takeover and runtime-context caching into an internal runtime context resolver so `src/host.js` no longer owns that state machine directly.
- [x] Extracted authoring access gates and runtime session/tutorial session-state helpers out of `src/host.js` into dedicated runtime service modules, narrowing the remaining host-to-authoring service boundary.
- [x] Extracted runtime app-context assembly and unavailable-context fallback composition out of `src/host.js` into a dedicated runtime app-context module, so live runtime construction and degraded-context behavior no longer live inline in the host startup path.
- [x] Collapsed shared authority gating for inspect and practical-backend bundle handlers behind a named runtime authority service boundary so `src/host.js` no longer fans out raw target/context/identity gate callbacks into those bundle factories individually.
- [x] Extracted runtime bundle-handler factory resolution and composed-handler assembly out of `src/host.js` into a dedicated runtime handler-assembly module, so bundle factory expansion and handler-diagnostics plumbing no longer live inline in the host.
- [x] Extracted bundle support helpers for projection-scoped request views and MCP runtime support out of `src/host.js` into a dedicated runtime support-services module, so those request helper/service closures are no longer defined inline in the host.
- [x] Extracted practical-backend runner-scoped selectors, backend diagnostics shaping, and notification enqueue support out of `src/host.js` into a dedicated runtime practical-backend support module, so those backend helper closures are no longer owned inline by the host.
- [x] Extracted OAuth config normalization, callback URL derivation, read-shaping, and witness emission support out of `src/host.js` into a dedicated runtime OAuth support module, so practical-backend OAuth handler dependencies no longer rely on host-local helper construction.
- [x] Extracted practical-backend SQL/search read-shaping and witness emission support out of `src/host.js` into a dedicated runtime DB/search support module, so those backend handler dependencies no longer rely on host-local helper construction.
- [x] Extracted practical-backend outbound/webhook/blob normalization and IO helper support out of `src/host.js` into a dedicated runtime IO support module, so those backend handler dependencies and builtin webhook-processing paths no longer rely on host-local helper construction.
- [x] Extracted practical-backend asset upload/read support out of `src/host.js` into a dedicated runtime asset support module, so asset parsing, URL/path helpers, visibility gating, and drop-context resolution no longer rely on host-local helper construction.
- [x] Extracted builtin notification/webhook/asset background job handlers out of `src/host.js` into a dedicated runtime job-handlers module, so runtime-app-context now consumes host-bound factories instead of host-local executable handler bodies.
- [x] Extracted startup-side runtime app-context binding and runtime-resolver assembly out of `src/host.js` into a dedicated runtime startup-services module, so the duplicated live-runner context construction path no longer lives inline in the host startup flow.
- [x] Extracted the remaining host-local provider runtimes for `db.sql`, `search.index`, and `jobs.queue` out of `src/host.js` into a dedicated runtime provider-runtimes module, so runtime-app-context now consumes provider factories without depending on host-local runtime implementations.
- [x] Extracted the top-level server startup/request orchestration out of `src/host.js` into a dedicated runtime server module, so runtime-profile startup validation, runtime-context assembly, HTTP dispatch, SSE wiring, and server lifecycle closing no longer live inline in the host export.
- [x] Extracted the remaining generic route-handler composition and dependency fan-out out of `src/host.js` into a dedicated runtime route-handlers module, so bundle/generic handler assembly and its large factory-dependency graph no longer live inline in the host.
- [x] Extracted shared HTTP/session/request utility primitives out of `src/host.js` into a dedicated runtime HTTP utilities module, so request-body parsing, JSON sending, cookie/header/session helpers, and SSE framing no longer remain duplicated as host-local glue across runtime modules.
- [x] Extracted active-path runtime config resolution, asset-derived search/thumbnail helpers, streamed file utilities, and default builtin job-handler wiring into dedicated runtime modules, so runtime server/startup/route execution now consumes those seams from shared modules instead of relying on host-local implementations.
- [x] Removed the retired host-local helper copies after the active-path extractions, so `src/host.js` no longer keeps stale config/asset-derivation/job-handler/stream implementations around after those seams moved into dedicated runtime modules.
- [x] Extracted host declaration/capability lookup, runner resolution, storage resolution, and generic route-handler factory wiring into dedicated runtime host utility modules, so `src/host.js` now acts primarily as the public host API facade instead of owning those runtime seams directly.
- [x] Moved the remaining startup wrapper behind a dedicated runtime host-entry module while keeping `src/host.js` as the stable compatibility facade, so the residual public host boundary is explicit instead of accidental.
- [x] Moved the live-app tutorial client engine out of `src/widgets.js` and into a dedicated tutorial UI module so the generic widget runtime no longer embeds that tutorial flow directly.
- [x] Moved live app tutorial attachment for `page.home` behind a dedicated tutorial UI helper so the core runtime bundle no longer toggles tutorial presence inline while rendering authored app pages.
- [x] Moved bootstrap tutorial presentation chrome and bootstrap tutorial page-data assembly behind dedicated tutorial modules so `src/bootstrap-shell.js` no longer owns that tutorial markup/CSS inline.
- [x] Moved bootstrap tutorial progress/state, suggestion sourcing, and disabled-surface rendering behind a dedicated tutorial client runtime factory so `src/bootstrap-shell.js` no longer owns that client model inline.
- [x] Moved bootstrap tutorial overlay/highlight behavior, auto-advance and chapter automation, and tutorial event wiring behind a dedicated tutorial controller runtime so `src/bootstrap-shell.js` no longer owns bootstrap-specific tutorial control flow inline.
- [x] Added profile-matrix and bundle-diagnostics tests that prove inactive bundles remove capabilities, routes, and operator surfaces under non-`full` profiles.

### Architecture-First Checklist

- [x] Extract the remaining `bundle-authoring` executable CRUD and proposal handlers from `src/host.js` into bundle-provided factories or provider-owned modules.
- [x] Extract the remaining `bundle-practical-backend` executable handlers from `src/host.js` so backend APIs are bundle-owned in execution, not only in route metadata.
  Practical-backend handler execution is now bundle-provided end to end; new backend APIs should follow the same factory path instead of expanding the central host dispatch table.
- [x] Extract `bundle-eden` executable handlers from `src/host.js`.
  Eden runtime execution now resolves through bundle-provided handler factories instead of the central host dispatch table.
- [x] Move demo handler-set registration fully behind bundle-driven host assembly and remove remaining host knowledge of product/example imports where practical.
  The demo handler-set definition/provider now lives with the demo module and is consumed through the bundle provider contract instead of being re-described inline in the central runtime bundle registry.
- [x] Finish moving operator/command palette data sourcing off generic widget/runtime internals where any hardcoded surface knowledge remains.
  World/operator palette mode entries now come from bundle-contributed surfaces with explicit actions, and the widget runtime treats bundle surface actions generically instead of hardcoding inspect-mode menu entries.
- [x] Keep expanding profile-specific tests so each extracted bundle proves both presence under `full` and absence under inactive profiles.
  Coverage now includes authoring bootstrap and CRUD route absence under `minimal`, inspect route/surface absence plus world-mode surface presence under `full`, practical-backend route/capability absence under inactive profiles, MCP route absence under `minimal`, tutorial route absence under `minimal` and presence under authoring/full, demo handler-set definition presence under `full` and absence under `minimal`, session-vs-tutorial route ownership coverage, and inactive Eden/MCP dispatch-handler exclusion.
- [x] Decide whether the remaining `src/host.js` startup wrapper should stay as the stable public facade or move behind a dedicated runtime host-entry module, so the residual ownership is explicit rather than accidental.
  The concrete implementation now lives in `src/runtime-host-entry.js`, while `src/host.js` remains the stable compatibility/public export surface.

### Verification Snapshot

Fast verification for the architecture-first tranche is complete.

- `node --test test/runtime-*.test.js`
- `node --test test/runtime-profile.test.js`
- `node --test test/architecture.test.js`
- `node --test test/host.test.js test/jobs-host.test.js test/db-sql-host.test.js test/search-index-host.test.js --test-name-pattern "server starts only with backend and frontend capability envelopes|server start requires an explicit runner when multiple server runners exist|demo app end-to-end: frontend request, backend json store, witnesses|jobs.queue executes a queued job and exposes succeeded status through the host|db.sql supports SQLite datasource inspection, migration apply, query, command, transaction, and diagnostics|search.index builds from explicit documents, answers queries, and exposes diagnostics"`
- `node --test test/auth-oauth-host.test.js test/http-outbound.test.js test/notify-host.test.js test/webhook-host.test.js test/mcp-host.test.js`
- `node --test test/bootstrap-host.test.js test/canvas-host.test.js test/process-view.test.js test/world-graph.test.js test/eden-host.test.js`

These suites keep the default `full` profile honest across bundle diagnostics, capability provisioning, route ownership, operator surfaces, authoring/bootstrap flows, inspect/world/process surfaces, practical-backend APIs, MCP seams, canvas behavior, and Eden flows without relying on the slower full-repository test pass.

### Operational Profile Diagnostics

- [x] Made the internal bundle manifest contract explicit enough to carry stable bundle metadata such as `kind`, `displayName`, and `description` in addition to contribution groups.
- [x] Added strict operator-facing runtime-profile validation for explicit CLI `--runtime-profile` input, while keeping implicit default startup on `full`.
- [x] Added `GET /api/runtime/diagnostics` as a core-runtime route so every valid profile can explain its active composition over HTTP.
- [x] Added a shared runtime diagnostics read-model covering requested profile, active profile, available profiles, active bundles, provided capabilities, host capability defaults, installed host capabilities, routes, surfaces, handler ownership, and handler sets.
- [x] Expanded CLI startup reporting so runtime composition is visible immediately, including active bundle ids, route/capability/surface counts, and the runtime diagnostics endpoint URL.

### Current Rule

The architecture-first checklist above is complete, the fast compatibility verification sweep passes under the default `full` profile, and runtime composition is now visible through strict CLI profile selection plus `GET /api/runtime/diagnostics`. Any further migration work should change shipped surface area only through explicit profile/bundle decisions rather than leftover host ownership.

The current codebase already has the right concepts:

- explicit capability objects and installs
- an explicit app/plugin boundary in the docs
- a distinction between generic runtime behavior and app-specific handler sets

The main remaining problem is operational coupling:

- capability definitions are centralized in `src/runtime-builtins.js`
- `src/host.js` now serves as a deliberate compatibility/public facade over dedicated runtime host-entry and host-utility modules instead of carrying accidental runtime ownership
- bundle handlers now consume shared runtime authority services and dedicated support-service modules, provider runtime ownership lives in dedicated runtime modules, server orchestration lives in a dedicated runtime server module, generic handler composition lives in a dedicated runtime route-handlers module, shared HTTP/session/request primitives live in a dedicated runtime HTTP utilities module, active-path runtime config/stream/default job-handler seams flow through dedicated runtime modules, and host declaration/runner/storage/route-factory seams now live in dedicated runtime host modules rather than `src/host.js`
- tutorial API ownership is now bundle-scoped, the live-app tutorial client plus home-page tutorial attachment have moved out of generic runtime flow ownership, and bootstrap tutorial page chrome, page-data assembly, progress/state handling, overlay/automation behavior, and event wiring now flow through dedicated tutorial modules rather than staying embedded inline in `src/bootstrap-shell.js`

This plan separates those concerns without requiring a big-bang rewrite.

## Current Constraints

The migration needs to preserve these truths:

- the witness log, projections, type/process model, and route/runtime substrate remain authoritative
- capability definitions remain first-class authored/runtime objects
- worlds still install capabilities onto targets such as `context`, `serverRunner`, and route-root pages
- existing demo and bootstrap flows remain usable during migration
- there is a compatibility path that reproduces today's behavior while bundle extraction proceeds

## Design Principles

1. Core runtime should ship only universal substrate.
2. A capability being defined is not the same as it being available at runtime.
3. A capability being available at runtime is not the same as it being installed on a world target.
4. Product surfaces such as bootstrap, world inspector, process view, canvas, Eden, tutorial flows, and practical backend tooling should arrive through bundles.
5. Apps/examples should sit on top of the same bundle contract used by internal runtime bundles.
6. The migration should preserve a `full` compatibility profile until the new loading model is proven.

## Target Architecture

The target runtime is three-layered.

### 1. Core Runtime

Core owns only universal substrate:

- witness log and replay
- kernel and authority substrate
- projections substrate
- type/value/process model
- capability/install model
- generic route dispatch
- generic session/auth plumbing
- bundle/profile loader

Core should not know about:

- SQL
- OAuth
- jobs
- files/blob asset flows
- MCP endpoints
- world/process/bootstrap pages
- tutorial flows
- Eden/demo product behavior

### 2. Internal Bundles

Bundles contribute runtime features in a structured way:

- `capabilities`: definitions and install metadata
- `providers`: executable implementations, handlers, adapters, workers
- `routes`: API endpoints, mounted pages, MCP endpoints
- `surfaces`: navigation entries, command palette entries, operator shells

### 3. Apps / Examples

Apps and examples contribute:

- handler sets
- app-specific routes
- app-specific projections
- app-specific product surfaces
- tutorial/product logic

These should use the same bundle contract rather than relying on direct imports in `src/host.js`.

## Runtime Profiles

Introduce explicit runtime profiles.

### `minimal`

Only the smallest executable runtime:

- kernel
- witness/projection substrate
- capability/install model
- route dispatch
- session plumbing
- bundle loader
- the minimum host/page capabilities needed to serve an authored app

### `authoring`

`minimal` plus:

- bootstrap shell
- bootstrap CRUD
- governance/proposal tooling
- authoring read models

### `inspect`

`minimal` plus:

- world surface
- process view
- source browser
- operator/inspection surfaces

### `practical-backend`

`minimal` plus:

- runtime config resolution
- files/blob/stream support
- asset upload flows
- jobs queue
- SQL
- outbound HTTP
- OAuth
- inbound webhooks
- notifications
- search index

### `full`

Compatibility profile that recreates current behavior by composing all internal bundles.

This should be the default until migration is complete.

## Bundle Boundaries

Define these initial internal bundles.

### `bundle-authoring`

Owns:

- `/_bootstrap`
- bootstrap model/state reads
- authoring CRUD for identities, widgets, contexts, perspectives, routes, runners, capabilities, MCP installs, proposals
- authoring-oriented UI surfaces

Primary source files today:

- `src/bootstrap-shell.js`
- `src/bootstrap-authoring.js`
- authoring endpoints currently in `src/host.js`

### `bundle-inspect`

Owns:

- `/world`
- `/process`
- `/backend-seams`
- `/api/world-graph`
- `/api/process-view`
- `/api/process-runs/:runId`
- `/api/source`
- operator command palette contributions

Primary source files today:

- `src/world-graph.js`
- `src/process-view.js`
- parts of `src/widgets.js`
- inspect-oriented handlers in `src/host.js`

### `bundle-canvas`

Owns:

- `/canvas`
- `/api/canvas`
- `/api/canvas/perspectives`
- `/api/canvas/process`
- canvas-specific mutation flows

Primary source files today:

- `src/canvas-page.js`
- `src/canvas-projection.js`
- `src/canvas-processes.js`
- canvas handlers in `src/host.js`

### `bundle-mcp`

Owns:

- `/mcp/:id`
- MCP server/tool installation flows
- transport and scope enforcement outside the core dispatch layer

Primary source files today:

- `src/mcp.js`
- MCP handlers in `src/host.js`

### `bundle-practical-backend`

Owns:

- `db.sql`
- `auth.oauth`
- `search.index`
- `http.outbound`
- `webhook.inbound`
- `notify.email`
- `notify.sms`
- `jobs.queue`
- `fs.blob`
- `fs.stream`
- `upload.asset`
- backend seam diagnostics

Primary source files today:

- capability definitions in `src/runtime-builtins.js`
- practical backend handlers in `src/host.js`

### `bundle-demo`

Owns:

- demo handler sets
- todo/private-notes flows
- demo-only routes and product behavior

Primary source files today:

- `src/demo-handler-set.js`

### `bundle-eden`

Owns:

- Eden page
- Eden capability install/product flows
- Eden versions/theory/academy/organization/product state

Primary source files today:

- `src/eden-page.js`
- `src/eden-*.js`
- Eden handlers in `src/host.js`

## Phase 0: Inventory And Boundary Freeze

### Objective

Produce one agreed classification of the shipped surface before moving code.

### Work

1. Inventory every direct concern currently imported by `src/host.js`.
2. Classify each concern as:
   - `core`
   - `bundle`
   - `app/example`
3. Freeze the initial bundle names and responsibilities.
4. Write an ADR-style architecture note describing:
   - what belongs in core
   - what must move to bundles
   - what remains app/example code

### Acceptance Criteria

- every direct import in `src/host.js` has an intended home
- the team agrees which concerns may remain in core
- there is a written migration boundary document in-repo

### Main Risk

If this classification is skipped, the migration will devolve into moving code around without actually reducing authority in core.

## Phase 1: Introduce Bundle Manifests With No Behavior Change

### Objective

Add the loading model first, while keeping runtime behavior identical.

### Work

1. Introduce a `BundleManifest` shape.
2. Introduce a bundle registry loader.
3. Add a runtime profile resolver.
4. Define internal manifests for:
   - authoring
   - inspect
   - canvas
   - MCP
   - practical-backend
   - demo
   - Eden
5. Keep `full` as the default profile.
6. Route `ensureRuntimeBuiltins(...)` through the bundle registry, while preserving output.

### Suggested Manifest Shape

```js
{
  id: "bundle-practical-backend",
  version: "0",
  contributes: {
    capabilities: [...],
    providers: [...],
    routes: [...],
    surfaces: [...]
  },
  dependsOn: ["bundle-core-runtime"]
}
```

### Acceptance Criteria

- `full` produces the same reachable pages, APIs, and capabilities as today
- tests stay green without behavioral change
- bundle loading exists even if most code has not moved yet

### Main Risk

If manifests are added as metadata only, without becoming the source of truth for loading, the system will gain ceremony but not actual modularity.

## Phase 2: Separate Capability Definition From Capability Availability

### Objective

Stop treating all shipped capability definitions as part of the core runtime.

### Work

1. Split `src/runtime-builtins.js` into:
   - core schema/process primitives
   - bundle-owned capability definition sets
2. Move these capability definitions out of core first:
   - `db.sql`
   - `auth.oauth`
   - `search.index`
   - `http.outbound`
   - `webhook.inbound`
   - `notify.email`
   - `notify.sms`
   - `jobs.queue`
   - `fs.blob`
   - `fs.stream`
   - `upload.asset`
3. Decide explicitly whether `runtime.config` remains core or moves into `bundle-practical-backend`.
4. Keep only the smallest universal set in core, likely:
   - `http.serve`
   - `dom.render`
   - `http.fetch`
   - possibly `runtime.config`
5. Change host declaration so default installed capabilities come from the active runtime profile, not from hardcoded lists in `src/host.js`.

### Acceptance Criteria

- `minimal` starts without practical backend capability definitions present
- `full` still defines and installs the same capability set as today
- capability presence can be explained as:
  - provided by bundle
  - installed on host/context/runner

### Main Risk

The transitional `hostCapability` compatibility path may calcify if it is not kept explicitly temporary.

## Phase 3: Replace Monolithic Route Dispatch With Route Contributions

### Objective

Remove feature-specific routing authority from core.

### Work

1. Replace the large `matchGenericEndpoint(...)` table in `src/host.js` with route contributions from bundles.
2. Extract routes in this order:
   - practical backend routes
   - authoring routes
   - inspect routes
   - canvas routes
   - MCP routes
3. Keep only generic path matching and dispatch orchestration in core.
4. Make route absence truthful: if a bundle is inactive, its routes do not exist.

### Suggested Route Contribution Shape

```js
{
  method: "GET",
  path: "/api/search/index",
  handler: "search.index.inspect"
}
```

### Acceptance Criteria

- core route matching no longer contains product/backend feature paths
- bundles can add and remove routes cleanly
- disabled bundles yield absent routes rather than hidden partial behavior

### Main Risk

If route contributions still rely on central string-switch ownership in `host.js`, the table will be redistributed but not truly decomposed.

## Phase 4: Move Surface Contributions Out Of The Widget Runtime

### Objective

Stop hardcoding operator and navigation surfaces into the generic widget runtime.

### Work

1. Replace built-in surface lists in `src/widgets.js` with surface contributions from bundles.
2. Move world/process/bootstrap/operator entries into:
   - `bundle-inspect`
   - `bundle-authoring`
3. Move tutorial and Eden-specific command entries into app/bundle contributions.
4. Keep the command/search UI generic, but make its data source bundle-driven.

### Suggested Surface Contribution Shape

```js
{
  id: "surface:world",
  title: "Open World",
  href: "/world",
  tier: "internal",
  search: "world graph witnesses process"
}
```

### Acceptance Criteria

- core widget runtime does not know that `/world`, `/_bootstrap`, or `/process` exist
- command palette results differ by active profile/bundles
- operator surface visibility becomes explicit and inspectable

### Main Risk

If the command/search surface remains populated by hardcoded internal knowledge, core will still carry hidden product assumptions.

## Phase 5: Extract Product And Example Code From Host

### Objective

Turn `src/host.js` back into a host, not a product container.

### Work

1. Move bootstrap page rendering and authoring handlers behind `bundle-authoring`.
2. Move world/process rendering and projections behind `bundle-inspect`.
3. Move canvas handlers behind `bundle-canvas`.
4. Move MCP install/runtime surfaces behind `bundle-mcp`.
5. Move demo handler sets behind `bundle-demo`.
6. Move Eden imports and flows behind `bundle-eden`.
7. Keep `serverRunner.handlerSet` temporarily, but make handler-set definitions bundle-provided.

### Acceptance Criteria

- `src/host.js` no longer imports Eden, bootstrap, demo, and most inspect/canvas modules directly
- host responsibility is reduced to:
  - startup
  - profile/bundle activation
  - auth/session plumbing
  - generic dispatch
  - generic runtime services

### Main Risk

It is easy to move route registration into bundles while leaving all executable authority in host-local closures. That is not enough; the execution ownership must move too.

## Phase 6: Make Runtime Profiles Real And Honest

### Objective

Turn profiles into a visible runtime truth rather than an internal implementation detail.

### Work

1. Add explicit profile selection to the CLI.
2. Support profile declaration in runtime config or `serverRunner`.
3. Add diagnostics showing:
   - active bundles
   - provided capabilities
   - installed capabilities
   - contributed routes
   - contributed operator surfaces
4. Make missing bundles yield explicit startup/install errors instead of implicit fallback behavior.

### Acceptance Criteria

- `minimal` exposes only the intended narrow core
- `full` reproduces the current baseline
- operator diagnostics explain why a route or capability is unavailable

### Main Risk

If `full` remains the only profile used in tests, profile correctness will drift unnoticed.

## Testing Strategy

### Add A Profile Matrix

Add tests for:

- `minimal`
- `authoring`
- `inspect`
- `practical-backend`
- `full`

### Convert Assumptions Into Declarations

Current tests should declare which profile/bundles they need instead of assuming all shipped surfaces are present.

### Add Negative Tests

Add explicit tests for:

- route absent when bundle absent
- capability definition absent when bundle absent
- install rejected when target bundle/provider is unavailable
- command/surface absent when bundle absent
- `full` compatibility profile reproduces the current baseline

## Compatibility And Migration Rules

During migration:

1. Keep `full` as the default.
2. Keep host capability compatibility behavior, but mark it transitional in code and docs.
3. Do not silently auto-install features from inactive bundles.
4. Do not let bundle metadata diverge from executable reality.
5. Prefer removing hardcoded defaults over adding more compatibility shims.

## Suggested Internal APIs

These are suggested seams, not final names.

### Bundle Registry

```js
registerBundle(manifest)
resolveProfile(profileName)
activeBundlesForProfile(profileName)
```

### Capability Provision

```js
providedCapabilities(bundles)
installDefaultHostCapabilities(world, hostId, bundles)
```

### Route Provision

```js
routesForBundles(bundles)
matchContributedRoute(method, pathname, routes)
```

### Surface Provision

```js
surfaceEntriesForBundles(bundles)
commandEntriesForBundles(bundles, context)
```

## Open Decisions

These should be decided early because they affect multiple phases.

### 1. Is `runtime.config` core?

Options:

- keep it in core as a universal runtime concern
- move it into `bundle-practical-backend`
- split it into a core primitive plus bundle-specific config readers

Recommendation:

- keep only the primitive/config contract in core
- move practical provider-specific config semantics into bundles

### 2. Does `serverRunner.handlerSet` survive long-term?

Options:

- keep as the long-term app/plugin execution boundary
- treat as a transitional step until more backend execution becomes witnessed

Recommendation:

- keep it during migration
- make handler sets bundle-provided rather than host-hardcoded
- revisit only after runtime/bundle decomposition is complete

### 3. Do host capabilities become first-class public placement?

Today the system already uses an internal host install path.

Recommendation:

- keep host capability support during migration
- do not expand its public contract until the bundle/profile model settles
- decide later whether host remains a first-class install target or collapses into runtime profile provisioning

## Delivery Strategy

Prefer small PRs with a stable compatibility profile over one large rewrite.

## Recommended PR Sequence

### PR 1: Bundle Loader Skeleton

Scope:

- add `BundleManifest`
- add runtime profile resolution
- define `full` compatibility profile
- add architecture doc for bundle boundaries

Acceptance:

- no behavior change
- all existing tests remain green

### PR 2: Practical Backend Capability Definitions

Scope:

- move practical backend capability definitions out of core builtins
- source them from `bundle-practical-backend`
- preserve `full`

Acceptance:

- `minimal` no longer includes practical backend capability definitions
- `full` remains unchanged

### PR 3: Practical Backend Routes

Scope:

- extract practical backend routes from `matchGenericEndpoint(...)`
- register them via `bundle-practical-backend`

Acceptance:

- those routes disappear when the bundle is inactive

### PR 4: Inspect Surfaces

Scope:

- extract `/world`, `/process`, related APIs, and command-palette entries

Acceptance:

- inspect surfaces are bundle-owned

### PR 5: Authoring Surfaces

Scope:

- extract bootstrap and authoring CRUD surfaces

Acceptance:

- authoring surfaces are bundle-owned

### PR 6: Canvas + MCP

Scope:

- extract canvas and MCP into their own bundles

Acceptance:

- host no longer directly owns those product/runtime extensions

### PR 7: Demo + Eden

Scope:

- remove direct demo/Eden imports from host
- register them as app/example bundles

Acceptance:

- host is no longer a product container

## Definition Of Success

This migration is successful when all of the following are true:

- core can boot without SQL, OAuth, jobs, search, files, notifications, world inspector, process view, bootstrap, canvas, MCP, Eden, or demo bundles loaded
- `full` still reproduces the current baseline
- active bundles explain all provided capabilities, routes, and operator surfaces
- capabilities are opt-in based on runtime profile and world installation, not just shipped by the executable
- `src/host.js` reads like a runtime host rather than a combined runtime/product module

## Short Version

The migration should not start by inventing an external plugin marketplace. It should start by making the current executable honest about what is core and what is bundled. Once internal bundles own capability definitions, providers, routes, and surfaces, external plugins become an extension of a real system rather than a new abstraction layered over existing coupling.
