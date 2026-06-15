# Runtime Audit Inventory

This document is the concrete inventory for auditing `runtime*` files across
the repo.

It exists because local seam work kept missing already-existing runtime layers.
The fix is not "remember better". The fix is to make the audit scope explicit
and repo-visible.

This is an inventory and prioritization document, not a redesign plan.

## Purpose

- enumerate the `runtime*` surface area already present in the repo
- separate canonical runtime layers from plugin runtime entrypoints, legacy
  paths, support services, and tests
- make it obvious what must be checked before changing frontend/runtime seams
- stop "discovering" existing runtime files one at a time mid-implementation

## Priority bands

### P0: must audit before changing `page.surface` / Engentus path

- `src/runtime-bundles.js`
- `src/runtime-bundle-handler-assembly.js`
- `src/runtime-bundle-handlers.js`
- `src/runtime-bundle-support-services.js`
- `src/runtime-route-handlers.js`
- `src/runtime-routing.js`
- `src/runtime-core-handlers.js`
- `src/runtime-presentation.js`
- `src/runtime-surface-shell.js`
- `src/runtime-surface-interaction-runtime.js`
- `src/runtime-surface-kit.js`
- `src/runtime-active-contributions.js`
- `src/runtime-authoring-policy.js`

### P1: closely adjacent infrastructure

- `src/runtime-app-context.js`
- `src/runtime-authoring-services.js`
- `src/runtime-browser-app-state.js`
- `src/runtime-builtins.js`
- `src/runtime-context-resolver.js`
- `src/runtime-host-entry.js`
- `src/runtime-host-route-factory.js`
- `src/runtime-host-utils.js`
- `src/runtime-http-utils.js`
- `src/runtime-page-fallbacks.js`
- `src/runtime-page-state.js`
- `src/runtime-plugin-loader.js`
- `src/runtime-plugin-utils.js`
- `src/runtime-server.js`
- `src/runtime-session-services.js`
- `src/runtime-shell-contract.js`
- `src/runtime-startup-services.js`
- `src/runtime-store-seeds.js`
- `store/seeds/runtime-profiles.json`

### P2: surface/widget/guidance/UI-local runtime families

- `src/runtime-surface-command-primitives.js`
- `src/runtime-surface-content-primitives.js`
- `src/runtime-surface-form-controls.js`
- `src/runtime-surface-inspector-primitives.js`
- `src/runtime-surface-tutorial-primitives.js`
- `src/runtime-template-utils.js`
- `src/runtime-widget-page.js`
- all `src/runtime-guidance-*`

### P3: operator/bootstrap/plugin domain entrypoints

- all `plugins/*/runtime.js`
- plugin-specific `runtime-builtins.js`

These are still important, but they should be read after the core runtime stack
is understood, not before.

## Current inventory

### Core `src/runtime*`

- `src/runtime-active-contributions.js`
- `src/runtime-app-context.js`
- `src/runtime-authoring-policy.js`
- `src/runtime-authoring-services.js`
- `src/runtime-browser-app-state.js`
- `src/runtime-builtins.js`
- `src/runtime-bundle-handler-assembly.js`
- `src/runtime-bundle-handlers.js`
- `src/runtime-bundle-support-services.js`
- `src/runtime-bundles.js`
- `src/runtime-config-utils.js`
- `src/runtime-context-resolver.js`
- `src/runtime-core-handlers.js`
- `src/runtime-guidance-bootstrap-card-view.js`
- `src/runtime-guidance-bootstrap-client.js`
- `src/runtime-guidance-bootstrap-controller-client.js`
- `src/runtime-guidance-bootstrap-interactions.js`
- `src/runtime-guidance-bootstrap-ui.js`
- `src/runtime-guidance-bootstrap-view.js`
- `src/runtime-guidance-client-adapter.js`
- `src/runtime-guidance-client-bootstrap.js`
- `src/runtime-guidance-client-interactions.js`
- `src/runtime-guidance-client-runtime.js`
- `src/runtime-guidance-client-state.js`
- `src/runtime-guidance-client.js`
- `src/runtime-guidance-disabled-scopes-actions.js`
- `src/runtime-guidance-disabled-scopes-view.js`
- `src/runtime-guidance-model.js`
- `src/runtime-guidance-overlay-actions.js`
- `src/runtime-guidance-overlay-dom.js`
- `src/runtime-guidance-overlay-drag.js`
- `src/runtime-guidance-overlay-interactions.js`
- `src/runtime-guidance-overlay-view.js`
- `src/runtime-guidance-progress-runtime.js`
- `src/runtime-guidance-progress-state.js`
- `src/runtime-guidance-runtime-actions.js`
- `src/runtime-guidance.js`
- `src/runtime-host-entry.js`
- `src/runtime-host-route-factory.js`
- `src/runtime-host-utils.js`
- `src/runtime-http-utils.js`
- `src/runtime-local-launcher.js`
- `src/runtime-operator-contract.js`
- `src/runtime-operator-service.js`
- `src/runtime-page-fallbacks.js`
- `src/runtime-page-state.js`
- `src/runtime-plugin-loader.js`
- `src/runtime-plugin-utils.js`
- `src/runtime-presentation.js`
- `src/runtime-route-handlers.js`
- `src/runtime-routing.js`
- `src/runtime-server.js`
- `src/runtime-session-services.js`
- `src/runtime-shell-contract.js`
- `src/runtime-startup-services.js`
- `src/runtime-store-seeds.js`
- `src/runtime-surface-command-primitives.js`
- `src/runtime-surface-content-primitives.js`
- `src/runtime-surface-form-controls.js`
- `src/runtime-surface-inspector-primitives.js`
- `src/runtime-surface-interaction-runtime.js`
- `src/runtime-surface-kit.js`
- `src/runtime-surface-shell.js`
- `src/runtime-surface-tutorial-primitives.js`
- `src/runtime-template-utils.js`
- `src/runtime-widget-page.js`

### Plugin runtime entrypoints

- `plugins/assets/runtime.js`
- `plugins/authoring-core/runtime.js`
- `plugins/backend-seams/runtime.js`
- `plugins/bootstrap/runtime.js`
- `plugins/canvas/runtime.js`
- `plugins/capability-authoring/runtime.js`
- `plugins/chart-runtime/runtime.js`
- `plugins/demo/runtime-builtins.js`
- `plugins/demo/runtime.js`
- `plugins/eden/runtime.js`
- `plugins/fs-blob/runtime.js`
- `plugins/fs-json/runtime.js`
- `plugins/fs-stream/runtime.js`
- `plugins/http-outbound/runtime.js`
- `plugins/inspect/runtime.js`
- `plugins/jobs/runtime.js`
- `plugins/mcp/runtime.js`
- `plugins/mcp-authoring/runtime-builtins.js`
- `plugins/mcp-authoring/runtime.js`
- `plugins/notifications/runtime.js`
- `plugins/oauth/runtime.js`
- `plugins/program-authoring/runtime.js`
- `plugins/proposals/runtime.js`
- `plugins/runtime-config/runtime.js`
- `plugins/search/runtime.js`
- `plugins/server-runner-authoring/runtime.js`
- `plugins/sqlite/runtime.js`
- `plugins/starter/runtime.js`
- `plugins/tutorial/runtime.js`
- `plugins/webhooks/runtime.js`

### Runtime docs / declarations already present

- `docs/RUNTIME-BUNDLE-MIGRATION-PLAN.md`
- `docs/RUNTIME-STACK-MAP.md`
- `store/seeds/runtime-profiles.json`

### Runtime tests already present

- `plugins/runtime-config/runtime-config.test.js`
- `src/runtime-guidance-bootstrap-card-view.test.js`
- `src/runtime-guidance-bootstrap-interactions.test.js`
- `src/runtime-guidance-bootstrap-ui.test.js`
- `src/runtime-guidance-bootstrap-view.test.js`
- `test/runtime-active-contributions.test.js`
- `test/runtime-app-context.test.js`
- `test/runtime-asset-derived-utils.test.js`
- `test/runtime-auth-oauth-support-services.test.js`
- `test/runtime-authoring-policy.test.js`
- `test/runtime-authoring-services.test.js`
- `test/runtime-browser-app-state.test.js`
- `test/runtime-builtin-job-handlers.test.js`
- `test/runtime-builtins.test.js`
- `test/runtime-bundle-generic-handlers.test.js`
- `test/runtime-bundle-handler-assembly.test.js`
- `test/runtime-bundle-handlers.test.js`
- `test/runtime-bundle-support-services.test.js`
- `test/runtime-config-utils.test.js`
- `test/runtime-context-resolver.test.js`
- `test/runtime-guidance.test.js`
- `test/runtime-host-entry.test.js`
- `test/runtime-host-route-factory.test.js`
- `test/runtime-host-utils.test.js`
- `test/runtime-http-utils.test.js`
- `test/runtime-local-launcher.test.js`
- `test/runtime-operator-contract.test.js`
- `test/runtime-page-fallbacks.test.js`
- `test/runtime-page-state.test.js`
- `test/runtime-plugin-loader.test.js`
- `test/runtime-plugin-utils.test.js`
- `test/runtime-practical-backend-asset-services.test.js`
- `test/runtime-practical-backend-db-search-services.test.js`
- `test/runtime-practical-backend-glue.test.js`
- `test/runtime-practical-backend-io-services.test.js`
- `test/runtime-practical-backend-support-services.test.js`
- `test/runtime-presentation.test.js`
- `test/runtime-profile.test.js`
- `test/runtime-provider-runtimes.test.js`
- `test/runtime-route-handlers.test.js`
- `test/runtime-routing.test.js`
- `test/runtime-server.test.js`
- `test/runtime-session-services.test.js`
- `test/runtime-startup-services.test.js`
- `test/runtime-stream-utils.test.js`
- `test/runtime-surface-interaction-runtime.test.js`
- `test/runtime-surface-shell-reset.test.js`

## Immediate audit order

If the task touches Engentus, `page.surface`, navigation, shell rendering, or
interactive frontend execution, audit in this order:

1. `src/runtime-bundles.js`
2. `src/runtime-bundle-handler-assembly.js`
3. `src/runtime-bundle-handlers.js`
4. `src/runtime-route-handlers.js`
5. `src/runtime-routing.js`
6. `src/runtime-core-handlers.js`
7. `src/runtime-presentation.js`
8. `src/runtime-surface-shell.js`
9. `src/runtime-surface-interaction-runtime.js`
10. `src/runtime-surface-kit.js`
11. `src/runtime-authoring-policy.js`
12. `plugins/authoring-core/runtime.js`
13. `plugins/authoring-core/authoring-core-processes.js`

Only after that:

14. `src/runtime-widget-page.js`
15. `plugins/inspect/runtime.js`
16. `plugins/inspect/widget-page.js`

The widget/program path is prior art and legacy runtime behavior. It is not the
starting point for the canonical `page.surface` path.

## Audit questions

For each `runtime*` file, record:

1. What concern does it own?
2. Is that ownership canonical, legacy, or transitional?
3. What other runtime file depends on it?
4. What must never be added to it?
5. Is it part of the Engentus canonical path, a support path, or unrelated?

## Current conclusion

The repo already contains a substantial runtime stack. The failure mode was not
absence of seams. The failure mode was patching too close to the failing seam
without first traversing this inventory.
