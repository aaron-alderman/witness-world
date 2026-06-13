# Plugin Migration Control

This is the control document for finishing the plugin migration from the
current baseline.

It is not a history log. Git is the archive. Do not preserve old milestone notes,
completed archaeology, or narrative status updates here. This file contains only
the target state, current baseline, completion baseline, and verification gates
required to keep the plugin epic complete.

## Target State

`complete` means almost everything optional is plugin-owned.

`src/` may remain large only when it is thick ceremony:

- runtime startup and lifecycle
- CLI/server transport
- plugin discovery, validation, loading, and diagnostics
- profile, authored, operator, and dependency composition
- generic HTTP dispatch and route invocation
- generic world/kernel/projection/DSL mechanics
- stable runtime ABI used by plugins
- inactive failure guards that make absent plugins fail clearly

`src/` must not own optional feature implementation, product/example behavior,
provider behavior, rendering hooks, backend capability behavior, tutorial/Eden/demo
logic, plugin-specific support services, plugin-owned read-model shaping, or
static plugin asset maps.

Feature ownership must be visible in concrete plugin packages:

- `plugins/<plugin-dir>/plugin.json`
- `plugins/<plugin-dir>/runtime.js` for executable packages
- plugin-owned handlers, services, providers, hooks, assets, projections, and tests
- co-located plugin tests under `plugins/<plugin-dir>/**/*.test.js`

## Current Baseline

These invariants define the current baseline. If any one becomes false, restore
it before starting another migration slice.

- `plugins/` is package-only. No global registry, service barrel, job-handler
  barrel, or store seed belongs under `plugins/`.
- Store/catalog seed data lives under `store/seeds/` and is data-only.
- Runtime profiles select default plugin IDs from
  `store/seeds/runtime-profiles.json`.
- First-party package/catalog metadata lives in
  `store/seeds/first-party-plugin-catalog.json`.
- `minimal` is core-only unless authored installs, operator overlays, or plugin
  dependencies activate plugins.
- `full` is a compatibility profile assembled from seeded first-party plugins.
- Plugin manifests are the durable package source for dependencies, runtime
  entrypoints, activated bundles, and declared contributions.
- Active plugin runtime modules are loaded only when selected by profile, authored
  install, operator overlay, or dependency expansion.
- Active plugin contributions feed runtime maps for support services, core hooks,
  provider runtimes, job handlers, handler sets, capability definitions, builtin
  seeds, projections, module/read-model projectors, and static assets.
- Optional read-model implementations are plugin-owned active providers. Core may
  keep delegated empty fallbacks for absent optional plugins, but not real
  feature projectors such as `assets` or `assetIndex`.
- Active module/read-model projector registration is token-scoped: concurrent
  identical implementations can share a projector name safely, scoped cleanup is
  idempotent, and conflicting same-name implementations fail until a future
  per-runtime projector context exists.
- `src/runtime-route-handlers.js` delegates optional read shapes, storage root
  defaults, notification normalization, and backend diagnostic path/url helpers
  to active plugin support services.
- Meta packages such as `plugin.authoring` and `plugin.practical-backend` are real
  package manifests, not hidden runtime registries.
- Metadata-only packages such as `plugin.notes-sidebar` remain discoverable but
  are not executable or installable as runtime behavior.

## Completion Baseline

The current baseline is complete when these constraints remain true:

- `src/runtime-route-handlers.js` is limited to HTTP dispatch, request shaping,
  route invocation, diagnostics, active-handler plumbing, and explicit absent
  plugin failure guards.
- `src/runtime-core-handlers.js` keeps backend-program execution as stable generic
  ABI, not optional practical-backend implementation.
- `src/runtime-bundle-support-services.js` keeps process-view observation shaping
  as stable generic process ABI, not inspect-specific implementation.
- Deleted facade files that only re-exported plugin-owned code remain absent.
- Boundary tests fail if any `src` file statically imports optional plugin
  implementation modules.
- Boundary tests fail if a deleted facade path returns under `src/`.
- Boundary tests enforce the large `src` ceremony allowlist.
- Boundary tests prove store seed files are data-only.
- Boundary tests prove `plugins/` contains packages, not global registries.
- `plugin.practical-backend` is a pure meta package over concrete backend child
  packages.
- Backend child packages own their implementation, manifests, runtime providers,
  routes, projections, capabilities, and co-located tests.
- `plugin.authoring` is a pure meta package over coherent authoring child
  packages.
- Authoring child packages own direct writes, proposal execution, routes,
  projections, DSL/runtime declarations, and co-located tests.
- Product/example packages own inspect, canvas, MCP, demo, Eden, and chart
  runtime behavior without fallback implementation in `src`.
- `minimal` exposes only core runtime behavior unless plugins are activated by
  authored installs, operator overlays, profile seeds, or dependency expansion.
- `minimal + plugin.inspect` exposes inspect behavior through active plugin
  runtime contributions.
- `minimal + plugin.practical-backend` expands dependency plugins and exposes
  backend behavior through child packages.
- `full` remains compatibility-preserving through seeded active plugins.
- Broken inactive plugin code does not affect startup.
- Broken active plugin code fails startup with clear loader diagnostics.
- Every executable first-party plugin has at least one co-located passing test.
- Plugin tests verify package ownership, not only route reachability.
- Meta-package tests prove dependency expansion and absence of executable
  implementation in the meta package.
- Package-specific behavior is tested in the owning plugin directory before
  broader runtime coverage is used as evidence.

## Completion Criteria

The epic is complete only when all of these are true and verified:

- No `src` file statically imports optional plugin implementation modules.
- No optional route, provider runtime, job handler, projection, module/read-model
  projector, support service, rendering hook, page hook, or static asset remains
  owned by `src`.
- Every executable first-party plugin has meaningful implementation beyond
  `plugin.json`.
- Every executable first-party plugin has at least one co-located plugin test.
- Every broad plugin family is either a coherent concrete package or a pure meta
  package over coherent child packages.
- Runtime behavior is selected by profiles, authored installs, operator overlays,
  and dependency expansion; not by hidden global plugin registries.
- `minimal` proves optional behavior is absent without the owning plugin.
- `full` remains compatibility-preserving through active seeded plugins.
- Boundary tests fail if optional implementation drifts back into `src`.
- This file contains only current baseline, completion baseline, completion
  criteria, and verification gates.

## Verification Gates

Run these command classes before calling the epic complete:

- boundary tests
- runtime plugin utils/catalog tests
- runtime plugin loader tests
- runtime active contribution tests
- runtime bundle handler/composition tests
- runtime server/profile tests
- affected plugin co-located tests
- negative `minimal` coverage tests
- `git diff --check`

Use exact commands appropriate to the current test layout. Do not mark the epic
complete unless the relevant commands pass in the current worktree.

## Rules For Updating This File

- Add only current-state control information.
- Do not add historical notes; use Git history for that.
- Remove obsolete items instead of preserving them as completed history.
- Mark nothing complete here unless it remains a current invariant.
- If a migration slice does not move ownership, split a package, remove a core
  seam, or strengthen a boundary test, it does not belong in this control doc.
