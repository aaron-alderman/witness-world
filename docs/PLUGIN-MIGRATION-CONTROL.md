# Plugin Migration Control

This document is the operational control surface for the real plugin migration target.

It is not a general roadmap.
It is not a bundle-migration scorecard.
It is not a place to count architecture cleanup, diagnostics, or docs as completion.

If a change does not move runtime ownership from internal `src/` bundle code into plugin package directories, it does not count as end-to-end plugin-migration progress.

---

## 1. Scope

Primary target:

- migrate the current maintained project from internal bundle-owned implementation to plugin package-owned implementation

The phrase `plugin migration complete` now means:

- plugin folders are the primary unit of implementation ownership for migrated features
- a migrated feature is understandable from the plugin package itself, not mainly from `plugin.json -> activatesBundles -> src/*`
- removing the plugin package removes the feature in a direct, legible way

Current project in scope:

- the maintained demo runtime and its served entrypoints
- the maintained demo runner `demo_server`
- the blank-world bootstrap/tutorial runtime path
- the first executable plugin package set already present under `plugins/*`

Out of scope until the blocking seams below are removed:

- broader plugin store work
- remote registry or package download flows
- trust/signature/review lifecycle expansion
- third-party arbitrary code loading from package directories
- general roadmap cleanup
- docs-only migration work not paired with code that removes a blocking seam

---

## 2. Non-Goals

The following do not count as plugin-migration work by themselves:

- wording cleanup
- roadmap checkbox gardening
- architecture prose improvements
- review/reconcile/store UX expansion
- new plugin-management surfaces that do not move feature ownership into plugin directories
- manifest-only plugin work that still leaves runtime behavior primarily owned by generic `src/` bundle code
- broad `plugin platform` work that leaves the maintained demo on bridge-only ownership

Allowed doc work during this migration:

- update docs only when the same tranche lands a real code/runtime migration step
- record new evidence after code changes remove a blocking seam

Do not open a docs-only migration tranche.

---

## 3. Current Honest Status

### [x] Phase 1. Bundle-bridge plugin composition

Completed:

- local plugin manifests exist and are discovered from `plugins/<id>/plugin.json`
- authored/runtime plugin installs work
- maintained demo runtime composition is explicit
- blank-world bootstrap/tutorial composition is explicit
- maintained demo no longer depends on `handlerSet = "demo"` or `bundle-demo`

This phase proved:

- package/install/composition semantics
- explicit runtime composition
- authored runner intent

This phase did not complete the end-to-end plugin migration.

Why not:

- the plugin folders still mostly contain `plugin.json`
- executable routes, surfaces, providers, and helper logic still live primarily in internal runtime files under `src/`
- the current system is still a manifest-to-bundle bridge, not plugin-owned implementation

Evidence:

- [plugins](/C:/Users/aaron/Documents/world/plugins)
- [examples/demo/backend.wtoml](/C:/Users/aaron/Documents/world/examples/demo/backend.wtoml)
- [src/runtime-core-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-core-handlers.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [src/runtime-host-entry.js](/C:/Users/aaron/Documents/world/src/runtime-host-entry.js)

### [x] Phase 2. True plugin-owned implementation

Completed.

Executable migrated plugin packages now own their implementation entrypoints and feature behavior. The remaining runtime-owned handlers are explicitly limited to core runtime ABI services.

### [x] Phase 2A. `plugin.inspect` is plugin-owned

Completed:

- `plugins/inspect` now contains plugin-owned implementation content beyond `plugin.json`
- `plugins/inspect/runtime.js` owns the inspect handler catalog, inspect bundle routes/surfaces, and the inspect handler implementations
- active `plugin.inspect` startup now loads that runtime module and uses it to override `bundle-inspect` ownership at composition time
- breaking or removing the plugin-owned runtime entry blocks explicit `plugin.inspect` activation with actionable startup errors

Evidence:

- [plugins/inspect/runtime.js](/C:/Users/aaron/Documents/world/plugins/inspect/runtime.js)
- [plugins/inspect/plugin.json](/C:/Users/aaron/Documents/world/plugins/inspect/plugin.json)
- [src/runtime-plugin-loader.js](/C:/Users/aaron/Documents/world/src/runtime-plugin-loader.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/cli.test.js](/C:/Users/aaron/Documents/world/test/cli.test.js)

### [x] Phase 2B. `plugin.authoring` owns bootstrap and tutorial runtime behavior

Completed:

- `plugins/authoring` now contains plugin-owned runtime code beyond `plugin.json`
- `plugins/authoring/runtime.js` owns the bundle-authoring and bundle-tutorial route/surface/catalog truth for active plugin runtime composition
- blank-world bootstrap now activates `plugin.authoring` by default when no CLI or env plugin override is provided
- breaking or removing the plugin-owned authoring runtime entry blocks blank bootstrap startup with actionable errors

Evidence:

- [plugins/authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/authoring/runtime.js)
- [plugins/authoring/authoring-handlers.js](/C:/Users/aaron/Documents/world/plugins/authoring/authoring-handlers.js)
- [plugins/authoring/tutorial-handlers.js](/C:/Users/aaron/Documents/world/plugins/authoring/tutorial-handlers.js)
- [src/runtime-plugin-loader.js](/C:/Users/aaron/Documents/world/src/runtime-plugin-loader.js)
- [src/runtime-local-launcher.js](/C:/Users/aaron/Documents/world/src/runtime-local-launcher.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/cli.test.js](/C:/Users/aaron/Documents/world/test/cli.test.js)

### [x] Phase 2C. `plugin.canvas` is plugin-owned

Completed:

- `plugins/canvas` now contains plugin-owned runtime code beyond `plugin.json`
- `plugins/canvas/runtime.js` owns the canvas handler catalog and the primary canvas runtime handlers used by the maintained demo
- active `plugin.canvas` startup now loads that runtime module and uses it to override `bundle-canvas` ownership at composition time
- breaking or removing the plugin-owned canvas runtime entry blocks authored maintained-demo startup with actionable errors

Evidence:

- [plugins/canvas/runtime.js](/C:/Users/aaron/Documents/world/plugins/canvas/runtime.js)
- [plugins/canvas/plugin.json](/C:/Users/aaron/Documents/world/plugins/canvas/plugin.json)
- [src/runtime-plugin-loader.js](/C:/Users/aaron/Documents/world/src/runtime-plugin-loader.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/cli.test.js](/C:/Users/aaron/Documents/world/test/cli.test.js)
- [test/canvas-host.test.js](/C:/Users/aaron/Documents/world/test/canvas-host.test.js)

### [x] Phase 2D. `plugin.practical-backend` owns its runtime entrypoint

Completed:

- `plugins/practical-backend` now contains plugin-owned runtime code beyond `plugin.json`
- `plugins/practical-backend/runtime.js` owns the bundle-practical-backend handler catalog, route map, surface contribution, and handler factory composition used when the plugin is active
- active `plugin.practical-backend` startup now loads that runtime module and uses it to override `bundle-practical-backend` route/handler ownership at composition time
- breaking or removing the plugin-owned practical-backend runtime entry blocks explicit `plugin.practical-backend` activation with actionable startup errors

Still intentionally open:

- broader generic fallback/thinning work remains outside this phase

Evidence:

- [plugins/practical-backend/runtime.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/runtime.js)
- [plugins/practical-backend/plugin.json](/C:/Users/aaron/Documents/world/plugins/practical-backend/plugin.json)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/cli.test.js](/C:/Users/aaron/Documents/world/test/cli.test.js)
- [test/db-sql-host.test.js](/C:/Users/aaron/Documents/world/test/db-sql-host.test.js)
- [test/jobs-host.test.js](/C:/Users/aaron/Documents/world/test/jobs-host.test.js)
- [test/notify-host.test.js](/C:/Users/aaron/Documents/world/test/notify-host.test.js)
- [test/auth-oauth-host.test.js](/C:/Users/aaron/Documents/world/test/auth-oauth-host.test.js)
- [test/http-outbound.test.js](/C:/Users/aaron/Documents/world/test/http-outbound.test.js)

### [x] Phase 2E. `plugin.mcp` owns its runtime entrypoint

Completed:

- `plugins/mcp` now contains plugin-owned runtime code beyond `plugin.json`
- `plugins/mcp/runtime.js` owns the bundle-mcp handler catalog, MCP HTTP route map, and active MCP HTTP handler implementation
- active `plugin.mcp` startup now loads that runtime module and uses it to override `bundle-mcp` route/handler ownership at composition time
- breaking or removing the plugin-owned MCP runtime entry blocks explicit `plugin.mcp` activation with actionable startup errors

Still intentionally open:

- generic runtime files still retain fallback code for some plugin-owned slices and should be thinned further once the active plugin path is proven stable

Evidence:

- [plugins/mcp/runtime.js](/C:/Users/aaron/Documents/world/plugins/mcp/runtime.js)
- [plugins/mcp/plugin.json](/C:/Users/aaron/Documents/world/plugins/mcp/plugin.json)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/cli.test.js](/C:/Users/aaron/Documents/world/test/cli.test.js)
- [test/mcp-host.test.js](/C:/Users/aaron/Documents/world/test/mcp-host.test.js)

### [x] Phase 2F. `plugin.practical-backend` owns deeper service modules

Completed:

- `plugins/practical-backend` now owns practical-backend DB/search services, IO services, outbound glue helpers, and the backend seams page renderer
- the old `src/runtime-practical-backend-*.js` and `src/runtime-backend-seams-page.js` files are now compatibility re-export wrappers for moved plugin-owned modules
- practical-backend host behavior still passes through the plugin-owned service modules under the active `plugin.practical-backend` runtime

Still intentionally open:

- practical-backend handler factory implementations are handled in Phase 2G
- broader generic fallback paths still need thinning after the practical-backend ownership move

Evidence:

- [plugins/practical-backend/db-search-services.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/db-search-services.js)
- [plugins/practical-backend/io-services.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/io-services.js)
- [plugins/practical-backend/glue.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/glue.js)
- [plugins/practical-backend/backend-seams-page.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/backend-seams-page.js)
- [src/runtime-practical-backend-db-search-services.js](/C:/Users/aaron/Documents/world/src/runtime-practical-backend-db-search-services.js)
- [src/runtime-practical-backend-io-services.js](/C:/Users/aaron/Documents/world/src/runtime-practical-backend-io-services.js)
- [src/runtime-practical-backend-glue.js](/C:/Users/aaron/Documents/world/src/runtime-practical-backend-glue.js)
- [src/runtime-backend-seams-page.js](/C:/Users/aaron/Documents/world/src/runtime-backend-seams-page.js)
- [test/runtime-practical-backend-db-search-services.test.js](/C:/Users/aaron/Documents/world/test/runtime-practical-backend-db-search-services.test.js)
- [test/runtime-practical-backend-io-services.test.js](/C:/Users/aaron/Documents/world/test/runtime-practical-backend-io-services.test.js)
- [test/runtime-practical-backend-glue.test.js](/C:/Users/aaron/Documents/world/test/runtime-practical-backend-glue.test.js)

### [x] Phase 2G. `plugin.practical-backend` owns handler factories

Completed:

- `plugins/practical-backend/handlers.js` now owns the practical-backend handler factory implementations for OAuth, runtime config, jobs, outbound HTTP, notifications, webhooks, DB SQL, search index, backend seams, blob/stream filesystem routes, and asset workflows
- `plugins/practical-backend/runtime.js` imports handler factories from the plugin-owned module instead of [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) was reduced from practical-backend implementation ownership to a temporary compatibility facade for practical-backend handler factories

Still intentionally open:

- the temporary practical-backend compatibility facade is removed in Phase 2H
- generic runtime files still retain fallback code for other migrated plugin slices

Evidence:

- [plugins/practical-backend/handlers.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/handlers.js)
- [plugins/practical-backend/runtime.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/runtime.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [test/db-sql-host.test.js](/C:/Users/aaron/Documents/world/test/db-sql-host.test.js)
- [test/http-outbound.test.js](/C:/Users/aaron/Documents/world/test/http-outbound.test.js)
- [test/auth-oauth-host.test.js](/C:/Users/aaron/Documents/world/test/auth-oauth-host.test.js)
- [test/jobs-host.test.js](/C:/Users/aaron/Documents/world/test/jobs-host.test.js)
- [test/notify-host.test.js](/C:/Users/aaron/Documents/world/test/notify-host.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)

### [x] Phase 2H. Practical-backend generic facade removed

Completed:

- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js) now imports practical-backend handler factories directly from [plugins/practical-backend/handlers.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/handlers.js)
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js) now tests practical-backend authority behavior through the plugin-owned handler module, not through a generic runtime facade
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) no longer re-exports practical-backend handler factories

Still intentionally open:

- inspect, canvas, and MCP generic handler wrappers are removed in Phase 2I
- the next cleanup should reduce remaining duplicated bundle metadata so migrated plugin runtime modules are the direct source used by composition code

Evidence:

- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [plugins/practical-backend/handlers.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/handlers.js)
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)

### [x] Phase 2I. Inspect, canvas, and MCP generic wrappers removed

Completed:

- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js) now imports inspect, canvas, and MCP handler factories directly from their plugin runtime modules
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) no longer imports plugin inspect/canvas/MCP runtimes as wrapper dependencies
- the stale unreachable MCP fallback implementation in [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) is removed
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js) now tests inspect behavior through the plugin-owned inspect runtime module

Still intentionally open:

- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js) still duplicates migrated plugin handler catalogs
- the next cleanup should move or remove those remaining duplicated catalogs where possible

Evidence:

- [plugins/inspect/runtime.js](/C:/Users/aaron/Documents/world/plugins/inspect/runtime.js)
- [plugins/canvas/runtime.js](/C:/Users/aaron/Documents/world/plugins/canvas/runtime.js)
- [plugins/mcp/runtime.js](/C:/Users/aaron/Documents/world/plugins/mcp/runtime.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/mcp-host.test.js](/C:/Users/aaron/Documents/world/test/mcp-host.test.js)
- [test/canvas-host.test.js](/C:/Users/aaron/Documents/world/test/canvas-host.test.js)

### [x] Phase 2J. Migrated plugin contribution metadata sourced by bundle composition

Completed:

- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js) now consumes inspect, canvas, MCP, and practical-backend handler catalogs, routes, surfaces, and handler factories from plugin runtime modules
- duplicated inspect routes/surfaces, MCP routes, and practical-backend route/provider lists were removed from [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- practical-backend bundle composition now registers a single plugin-owned `createHandlers` factory instead of many feature-specific handler factories in core bundle metadata

Still intentionally open:

- the remaining handler-catalog duplication is removed in Phase 2K and Phase 2L

Evidence:

- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [plugins/inspect/runtime.js](/C:/Users/aaron/Documents/world/plugins/inspect/runtime.js)
- [plugins/canvas/runtime.js](/C:/Users/aaron/Documents/world/plugins/canvas/runtime.js)
- [plugins/mcp/runtime.js](/C:/Users/aaron/Documents/world/plugins/mcp/runtime.js)
- [plugins/practical-backend/runtime.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/runtime.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/canvas-host.test.js](/C:/Users/aaron/Documents/world/test/canvas-host.test.js)
- [test/mcp-host.test.js](/C:/Users/aaron/Documents/world/test/mcp-host.test.js)

### [x] Phase 2K. Practical-backend handler catalog is plugin-owned

Completed:

- [plugins/practical-backend/handler-catalog.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/handler-catalog.js) now owns the practical-backend handler catalog metadata
- [plugins/practical-backend/runtime.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/runtime.js) no longer imports `RUNTIME_BUNDLE_HANDLER_CATALOGS` from core to explain `bundle-practical-backend`
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js) now indexes the plugin-owned practical-backend catalog instead of carrying a duplicate catalog block

Still intentionally open:

- authoring/tutorial duplicate catalog and route ownership are removed in Phase 2L
- Eden remains an internal-only feature slice until it is either plugin-owned or explicitly declared a permanent runtime-owned exception

Evidence:

- [plugins/practical-backend/handler-catalog.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/handler-catalog.js)
- [plugins/practical-backend/runtime.js](/C:/Users/aaron/Documents/world/plugins/practical-backend/runtime.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js)
- [test/mcp-host.test.js](/C:/Users/aaron/Documents/world/test/mcp-host.test.js)
- [test/canvas-host.test.js](/C:/Users/aaron/Documents/world/test/canvas-host.test.js)

### [x] Phase 2L. Authoring/tutorial bundle composition consumes plugin-owned metadata

Completed:

- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js) now consumes `bundle-authoring` and `bundle-tutorial` catalogs, routes, surfaces, and handler factories from [plugins/authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/authoring/runtime.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js) now indexes authoring/tutorial handler catalogs from [plugins/authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/authoring/runtime.js) instead of carrying duplicate catalog blocks
- core bundle composition remains responsible for profile/bundle wiring, while the authoring plugin remains the source of truth for authoring/tutorial runtime contributions

Still intentionally open:

- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) still contains core, demo, and Eden handler implementation code
- Eden remains the next large internal feature slice if the migration continues beyond maintained demo/bootstrap/practical-backend/MCP ownership

Evidence:

- [plugins/authoring/runtime.js](/C:/Users/aaron/Documents/world/plugins/authoring/runtime.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js)
- [test/cli.test.js](/C:/Users/aaron/Documents/world/test/cli.test.js)
- [test/mcp-host.test.js](/C:/Users/aaron/Documents/world/test/mcp-host.test.js)
- [test/canvas-host.test.js](/C:/Users/aaron/Documents/world/test/canvas-host.test.js)

### [x] Phase 2M. `plugin.eden` owns Eden runtime behavior

Completed:

- [plugins/eden](/C:/Users/aaron/Documents/world/plugins/eden) now exists as a first-party executable plugin package instead of leaving Eden as an internal-only bundle slice
- [plugins/eden/runtime.js](/C:/Users/aaron/Documents/world/plugins/eden/runtime.js) owns the `bundle-eden` handler catalog and runtime module contract
- [plugins/eden/handlers.js](/C:/Users/aaron/Documents/world/plugins/eden/handlers.js) owns the Eden handler factory implementation for personal box, page theme, academy, organization, theory, capability-install, versions, and Eden page rendering flows
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js) now consumes Eden handler catalog, routes, surfaces, and handler factory from the Eden plugin runtime module
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js) now indexes the plugin-owned Eden catalog instead of carrying the catalog block internally
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) no longer contains the Eden handler implementation body; it keeps only a compatibility re-export

Still intentionally open:

- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) still contains core runtime handlers and authoring compatibility helpers
- [src/demo-handler-set.js](/C:/Users/aaron/Documents/world/src/demo-handler-set.js) and `bundle-demo` remain to be removed or explicitly classified as a permanent compatibility exception

Evidence:

- [plugins/eden/plugin.json](/C:/Users/aaron/Documents/world/plugins/eden/plugin.json)
- [plugins/eden/runtime.js](/C:/Users/aaron/Documents/world/plugins/eden/runtime.js)
- [plugins/eden/handlers.js](/C:/Users/aaron/Documents/world/plugins/eden/handlers.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js)

### [x] Phase 2N. `plugin.demo` owns the demo handler-set provider

Completed:

- [plugins/demo](/C:/Users/aaron/Documents/world/plugins/demo) now exists as a first-party executable plugin package instead of leaving demo handler-set ownership in `src/`
- [plugins/demo/runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/runtime.js) owns the `bundle-demo` runtime module contract and exports the plugin-owned handler-set provider
- [plugins/demo/handler-set.js](/C:/Users/aaron/Documents/world/plugins/demo/handler-set.js) owns the demo handler-set implementation for todo, private notes, widget creation, network simulation, and demo job handlers
- [src/demo-handler-set.js](/C:/Users/aaron/Documents/world/src/demo-handler-set.js) is now only a compatibility re-export of the plugin-owned handler-set module
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js) now consumes the demo handler-set provider from [plugins/demo/runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/runtime.js)
- `bundle-demo` now declares the `fs.json.read` and `fs.json.write` capability definitions it directly requires, removing its hidden dependency on `bundle-practical-backend` under `minimal`
- plugin runtime loading now preserves plugin-owned handler-set providers so active plugin packages can own provider contributions beyond routes, surfaces, and handlers

Still intentionally open:

- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) still contains core runtime handlers and old authoring compatibility bodies
- remaining completion work should thin or classify those internal runtime-owned bodies rather than adding more plugin-management infrastructure

Evidence:

- [plugins/demo/plugin.json](/C:/Users/aaron/Documents/world/plugins/demo/plugin.json)
- [plugins/demo/runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/runtime.js)
- [plugins/demo/handler-set.js](/C:/Users/aaron/Documents/world/plugins/demo/handler-set.js)
- [src/demo-handler-set.js](/C:/Users/aaron/Documents/world/src/demo-handler-set.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [src/runtime-plugin-loader.js](/C:/Users/aaron/Documents/world/src/runtime-plugin-loader.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-plugin-loader.test.js](/C:/Users/aaron/Documents/world/test/runtime-plugin-loader.test.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)

### [x] Phase 2O. Stale generic authoring/tutorial handler bodies removed

Completed:

- [plugins/authoring/bootstrap-read-models.js](/C:/Users/aaron/Documents/world/plugins/authoring/bootstrap-read-models.js) now owns the bootstrap model/state read-model construction used by the authoring plugin
- [plugins/authoring/authoring-handlers.js](/C:/Users/aaron/Documents/world/plugins/authoring/authoring-handlers.js) imports bootstrap read-model construction from the plugin directory instead of [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) no longer exports duplicate `createAuthoringBundleHandlers`, `createTutorialBundleHandlers`, or `createAuthoringBootstrapReadModels` implementations
- stale authoring/tutorial imports were removed from the generic runtime file, leaving authoring/tutorial route handling in [plugins/authoring](/C:/Users/aaron/Documents/world/plugins/authoring)
- plugin-owned `serve.create` was brought back to parity with the old generic body for contextual `serverRunnerRef`/`routeRef` authoring flows

Still intentionally open:

- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) still contains core runtime handlers plus the authoring proposal executor used by [src/runtime-authoring-services.js](/C:/Users/aaron/Documents/world/src/runtime-authoring-services.js)
- the next ownership cleanup should either move the proposal executor behind the authoring plugin boundary or explicitly classify the remaining core-owned runtime handler/proposal services

Evidence:

- [plugins/authoring/bootstrap-read-models.js](/C:/Users/aaron/Documents/world/plugins/authoring/bootstrap-read-models.js)
- [plugins/authoring/authoring-handlers.js](/C:/Users/aaron/Documents/world/plugins/authoring/authoring-handlers.js)
- [plugins/authoring/tutorial-handlers.js](/C:/Users/aaron/Documents/world/plugins/authoring/tutorial-handlers.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [test/bootstrap-host.test.js](/C:/Users/aaron/Documents/world/test/bootstrap-host.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)
- [test/runtime-bundle-generic-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-generic-handlers.test.js)

### [x] Phase 2P. Authoring proposal executor moved into `plugin.authoring`

Completed:

- [plugins/authoring/proposal-executor.js](/C:/Users/aaron/Documents/world/plugins/authoring/proposal-executor.js) now owns the generic proposal execution path used by the authoring plugin
- `edenVersions.publish` proposal execution moved with the authoring proposal executor, so Eden proposal approval is no longer implemented in [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [src/runtime-authoring-services.js](/C:/Users/aaron/Documents/world/src/runtime-authoring-services.js) now imports the proposal executor from [plugins/authoring/proposal-executor.js](/C:/Users/aaron/Documents/world/plugins/authoring/proposal-executor.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) was reduced to the core runtime handler factory plus a temporary Eden compatibility re-export at this point in the migration
- stale proposal-executor imports were removed from the generic runtime file

Still intentionally open:

- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) still owns `createCoreRuntimeBundleHandlers`
- the next step should either classify `createCoreRuntimeBundleHandlers` as a permanent runtime-owned core exception or split any remaining feature-specific pieces out of it

Evidence:

- [plugins/authoring/proposal-executor.js](/C:/Users/aaron/Documents/world/plugins/authoring/proposal-executor.js)
- [src/runtime-authoring-services.js](/C:/Users/aaron/Documents/world/src/runtime-authoring-services.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [test/runtime-authoring-services.test.js](/C:/Users/aaron/Documents/world/test/runtime-authoring-services.test.js)
- [test/eden-host.test.js](/C:/Users/aaron/Documents/world/test/eden-host.test.js)
- [test/bootstrap-host.test.js](/C:/Users/aaron/Documents/world/test/bootstrap-host.test.js)
- [test/runtime-profile.test.js](/C:/Users/aaron/Documents/world/test/runtime-profile.test.js)

### [x] Phase 2Q. Demo model handlers removed from core runtime ownership

Completed:

- duplicate demo app/model handlers were removed from [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) no longer implements `todos.*`, `privateNotes.*`, `widgets.createModel`, or `network.simulateModel`
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js) no longer advertises demo model handlers as `bundle-core-runtime` dispatch ownership
- demo model/job handler behavior remains owned by [plugins/demo/handler-set.js](/C:/Users/aaron/Documents/world/plugins/demo/handler-set.js) and exposed when `bundle-demo` is active through the demo handler-set provider
- the stale Eden compatibility re-export was removed from [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)

Still intentionally open:

- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) still owns `createCoreRuntimeBundleHandlers`
- the remaining decision is whether the surviving `session.*`, `backendProgram.run`, `page.home`, and runtime plugin/diagnostics read handlers are permanent runtime-owned ABI services or should be split again

Evidence:

- [plugins/demo/handler-set.js](/C:/Users/aaron/Documents/world/plugins/demo/handler-set.js)
- [plugins/demo/runtime.js](/C:/Users/aaron/Documents/world/plugins/demo/runtime.js)
- [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)

### [x] Phase 2R. Core runtime ABI isolated from generic bundle ownership

Completed:

- the old [src/runtime-bundle-generic-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-generic-handlers.js) file was removed
- surviving runtime-owned handlers moved to [src/runtime-core-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-core-handlers.js), making their ownership explicit instead of generic bundle-owned
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js) now imports `createCoreRuntimeBundleHandlers` from the explicit core runtime module
- the remaining `bundle-core-runtime` handlers are classified as runtime ABI:
  - `session.read`, `session.open`, and `session.logout` own process-local authentication/session transport
  - `backendProgram.run` owns the generic authored backend-program interpreter dispatch ABI
  - `page.home` owns the generic authored widget-page rendering ABI
  - `runtime.diagnostics.read`, `runtime.plugins.read`, and `runtime.pluginReviews.read` own runtime/plugin introspection APIs

Permanent runtime-owned exceptions:

- `session.*`: universal runtime transport/authentication substrate, not a product/plugin feature
- `backendProgram.run`: generic authored-program execution ABI used by plugin-owned and authored routes
- `page.home`: generic authored widget-page rendering ABI for served runtime pages
- `runtime.diagnostics.read`, `runtime.plugins.read`, `runtime.pluginReviews.read`: runtime self-description and plugin catalog/review read APIs

Evidence:

- [src/runtime-core-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-core-handlers.js)
- [src/runtime-bundles.js](/C:/Users/aaron/Documents/world/src/runtime-bundles.js)
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js)
- [test/runtime-bundle-handlers.test.js](/C:/Users/aaron/Documents/world/test/runtime-bundle-handlers.test.js)

---

## 4. Remaining Blocking Seams

The plugin migration is not complete until every seam in this list is removed or explicitly closed.

### [x] A. Executable plugin folders are no longer manifest-only packages

Resolved:

- every executable migrated plugin directory under `plugins/*` now contains meaningful implementation-owned content beyond `plugin.json`
- metadata-only examples such as `plugin.notes-sidebar` remain intentionally non-executable

Maintained requirement:

- each executable migrated plugin folder contains meaningful owned content beyond `plugin.json`
- the plugin package is the first place a reader looks to understand that feature

Minimum acceptable owned content may include:

- plugin-local module entry metadata
- plugin-local route/surface/provider declarations that are actually consumed as plugin-owned inputs
- plugin-local implementation files or structured assets used by the runtime for that plugin

Not sufficient:

- adding more fields to `plugin.json` while keeping all meaningful runtime behavior in generic core files

### [x] B. Generic internal runtime feature ownership removed

Resolved:

- migrated plugin feature ownership has moved behind plugin package boundaries
- the old generic bundle handler file has been removed
- [src/runtime-core-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-core-handlers.js) now contains only the explicitly classified core runtime ABI handlers
- [src/runtime-bundle-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-bundle-handlers.js) now advertises core dispatch ownership only for runtime ABI handlers, not demo/plugin feature handlers

### [x] C. Maintained demo behavior is explained by plugin package contents

Resolved:

- the maintained demo's authoring, inspect, and canvas behavior is now traceable to the corresponding plugin package contents
- removing one of those plugin packages removes the owned implementation in a direct, understandable way

### [x] D. Blank-world bootstrap/tutorial is still plugin-composed but not plugin-owned

Resolved:

- blank-world bootstrap now activates `plugin.authoring` by default
- tutorial progress handlers are loaded from the plugin-owned authoring runtime module
- the bootstrap/tutorial path now follows the same plugin-owned runtime story as the maintained demo authoring slice

### [x] E. Direct plugin-to-runtime ownership story completed

Resolved:

- executable migrated plugin slices own their runtime behavior directly through plugin-local `runtime.js` modules
- `activatesBundles` remains a composition/selection bridge, but it is no longer the primary implementation ownership explanation for migrated features
- metadata-only packages, such as `plugin.notes-sidebar`, remain intentionally non-executable and are not counted as incomplete executable migration work

---

## 5. Required Execution Order

Do the work in this order.
Do not treat later items as substitutes for earlier ownership transfer.

1. [x] Complete bundle-bridge composition honesty for the maintained demo and blank-world bootstrap/tutorial.
2. [x] Decide the plugin-owned implementation contract for executable local plugins.
3. [x] Move the first migrated feature slice so its implementation is owned by a plugin folder, not mainly by generic `src/` bundle files.
4. [x] Prove that removing that plugin folder removes the feature in a direct, understandable way.
5. [x] Repeat for the remaining maintained demo plugin set:
   - `plugin.canvas`
6. [x] Resolve whether bootstrap/tutorial becomes plugin-owned or is declared a permanent runtime-owned exception.
7. [x] Only then declare the plugin migration complete.

If a tranche does not advance the next incomplete item in this order, it is probably off track.

---

## 6. Current Tranche

Active tranche:

- complete

Current expected target:

- complete: remaining runtime-owned bodies are explicitly classified as core runtime ABI handlers after the generic handler file was removed

Do not close this tranche with:

- docs
- more review/read-model work
- more bundle-bridge cleanup alone

---

## 7. Done Criteria

The plugin migration is complete only when all of the following are true:

1. [x] The maintained demo runs under explicit authored plugin composition instead of implicit `full`.
2. [x] Blank-world bootstrap/tutorial runs under explicit composition instead of implicit `full`.
3. [x] Each executable migrated plugin folder contains meaningful owned content beyond `plugin.json`.
4. [x] For migrated features, primary implementation ownership no longer lives mainly in generic internal bundle/runtime files.
5. [x] A reader can explain the maintained demo's migrated behavior by reading the relevant plugin package directories first.
6. [x] Removing a migrated plugin folder removes that feature in a direct, understandable way.
7. [x] Core runtime files are left with loader/composition/ABI responsibilities rather than feature-specific ownership.
8. [x] Any permanent runtime-owned exceptions are explicitly listed and justified in this file.

Completion rule:

- `plugin migration complete` does not mean `manifest composition complete`
- it means `plugin-owned implementation complete`

---

## 8. Evidence Rules

What counts as progress:

- code that moves feature ownership into a plugin directory
- tests that prove the plugin package is now the meaningful ownership boundary
- deletion or thinning of internal bundle/runtime feature code after ownership moves
- runtime proof that a plugin folder directly controls the presence of the migrated feature

What does not count as progress by itself:

- better caveat wording
- more accurate docs without code change
- new future-tranche planning
- broader plugin-system improvements that do not move ownership into plugin folders
- honest reporting of a seam that still exists
- more manifest/discovery/catalog work without plugin-owned implementation

Rule:

- no roadmap or migration-status update should be treated as meaningful progress unless a code/runtime ownership seam was removed in the same tranche

---

## 9. Verification Checklist

Use this checklist before claiming a seam is gone:

1. Inspect the plugin directory for the target plugin and confirm it owns meaningful content beyond `plugin.json`.
2. Inspect internal runtime files and confirm feature-specific ownership was reduced or removed.
3. Run focused fast tests that prove:
   - the migrated feature still works through the plugin package
   - removing or disabling the plugin package removes the feature directly
   - the feature is not silently surviving through generic runtime fallback
4. Confirm the plugin package is now the most natural source of truth for understanding that feature.
5. Only then update docs to reflect the landed removal.

---

## 10. Restart Rule

When restarting work from this file:

- treat this document as the migration target
- choose the next incomplete ownership seam
- do code first
- only update docs after the ownership transfer is implemented and verified

If a proposed action cannot be tied directly to moving runtime ownership into plugin directories, do not count it as plugin-migration work.
