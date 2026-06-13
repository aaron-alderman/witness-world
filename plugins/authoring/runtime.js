import { createAuthoringBundleHandlers } from "./authoring-handlers.js";
import { createTutorialBundleHandlers } from "./tutorial-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

const authoringHandlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "mcpServer.create",
    "mcpTool.install",
    "mcpTool.remove",
    "runtimePlugin.install",
    "runtimePlugin.remove"
  ]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "bootstrap.model.read",
    "bootstrap.state.read",
    "bootstrap.page",
    "operator.state.read",
    "operator.backup",
    "operator.export",
    "operator.restore",
    "operator.import",
    "identity.create",
    "identity.update",
    "context.create",
    "perspective.create",
    "contextBinding.create",
    "contextBinding.remove",
    "contextExport.create",
    "contextExport.remove",
    "contextImport.create",
    "contextImport.remove",
    "stewardship.create",
    "stewardship.remove",
    "proposal.create",
    "proposal.approve",
    "proposal.reject",
    "widgets.create",
    "widgets.update",
    "capability.create",
    "capability.install",
    "capability.remove",
    "runtimePlugin.install",
    "runtimePlugin.remove",
    "frontendProgram.create",
    "frontendStep.create",
    "backendProgram.create",
    "backendProgramVersion.create",
    "backendStep.create",
    "backendProgramVersions.activate",
    "backendProgramVersions.rollback",
    "route.create",
    "serve.create",
    "serverRunner.create",
    "mcpServer.create",
    "mcpTool.install",
    "mcpTool.remove"
  ]),
  handlerMetadata: Object.freeze({})
});

const tutorialHandlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "tutorial.progress.read",
    "tutorial.progress.write",
    "tutorial.progress.delete"
  ]),
  handlerMetadata: Object.freeze({})
});

const authoringRoutes = Object.freeze([
  exactRoute("GET", "/_bootstrap", "bootstrap.page"),
  exactRoute("GET", "/api/bootstrap-model", "bootstrap.model.read"),
  exactRoute("GET", "/api/bootstrap-state", "bootstrap.state.read"),
  exactRoute("GET", "/api/operator/state", "operator.state.read"),
  exactRoute("POST", "/api/operator/backups", "operator.backup"),
  exactRoute("POST", "/api/operator/exports", "operator.export"),
  exactRoute("POST", "/api/operator/restores", "operator.restore"),
  exactRoute("POST", "/api/operator/imports", "operator.import"),
  exactRoute("POST", "/api/contexts", "context.create"),
  exactRoute("POST", "/api/context-bindings", "contextBinding.create"),
  exactRoute("DELETE", "/api/context-bindings", "contextBinding.remove"),
  exactRoute("POST", "/api/context-exports", "contextExport.create"),
  exactRoute("DELETE", "/api/context-exports", "contextExport.remove"),
  exactRoute("POST", "/api/context-imports", "contextImport.create"),
  exactRoute("DELETE", "/api/context-imports", "contextImport.remove"),
  exactRoute("POST", "/api/perspectives", "perspective.create"),
  exactRoute("POST", "/api/stewardships", "stewardship.create"),
  exactRoute("DELETE", "/api/stewardships", "stewardship.remove"),
  exactRoute("POST", "/api/proposals", "proposal.create"),
  patternRoute("POST", /^\/api\/proposals\/([^/]+)\/approve$/, "proposal.approve", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/proposals\/([^/]+)\/reject$/, "proposal.reject", Object.freeze(["id"])),
  exactRoute("POST", "/api/widgets", "widgets.create"),
  patternRoute("PATCH", /^\/api\/widgets\/([^/]+)$/, "widgets.update", Object.freeze(["id"])),
  exactRoute("POST", "/api/identities", "identity.create"),
  patternRoute("PATCH", /^\/api\/identities\/([^/]+)$/, "identity.update", Object.freeze(["id"])),
  exactRoute("POST", "/api/mcp-servers", "mcpServer.create"),
  exactRoute("POST", "/api/mcp-tool-installs", "mcpTool.install"),
  exactRoute("DELETE", "/api/mcp-tool-installs", "mcpTool.remove"),
  exactRoute("POST", "/api/capabilities", "capability.create"),
  exactRoute("POST", "/api/capability-installs", "capability.install"),
  exactRoute("DELETE", "/api/capability-installs", "capability.remove"),
  exactRoute("POST", "/api/runtime-plugin-installs", "runtimePlugin.install"),
  exactRoute("DELETE", "/api/runtime-plugin-installs", "runtimePlugin.remove"),
  exactRoute("POST", "/api/frontend-programs", "frontendProgram.create"),
  exactRoute("POST", "/api/frontend-steps", "frontendStep.create"),
  exactRoute("POST", "/api/backend-programs", "backendProgram.create"),
  exactRoute("POST", "/api/backend-program-versions", "backendProgramVersion.create"),
  exactRoute("POST", "/api/backend-steps", "backendStep.create"),
  patternRoute("POST", /^\/api\/backend-program-versions\/([^/]+)\/activate$/, "backendProgramVersions.activate", Object.freeze(["soul"])),
  patternRoute("POST", /^\/api\/backend-program-versions\/([^/]+)\/rollback$/, "backendProgramVersions.rollback", Object.freeze(["soul"])),
  exactRoute("POST", "/api/routes", "route.create"),
  exactRoute("POST", "/api/serve-mounts", "serve.create"),
  exactRoute("POST", "/api/server-runners", "serverRunner.create")
]);

const authoringSurfaces = Object.freeze([
  Object.freeze({
    id: "surface:bootstrap",
    title: "Open Bootstrap",
    subtitle: "Recovery and authoring seam",
    href: "/_bootstrap",
    action: null,
    search: "bootstrap hidden recovery authoring harness /_bootstrap",
    type: "surface",
    tier: "harness",
    contexts: Object.freeze(["app-command", "world-command"])
  })
]);

const tutorialRoutes = Object.freeze([
  patternRoute("GET", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.read", Object.freeze(["tutorialId"])),
  patternRoute("PUT", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.write", Object.freeze(["tutorialId"])),
  patternRoute("DELETE", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.delete", Object.freeze(["tutorialId"]))
]);

const tutorialSurfaces = Object.freeze([]);

export const bundles = Object.freeze({
  "bundle-authoring": Object.freeze({
    handlerCatalog: authoringHandlerCatalog,
    routes: authoringRoutes,
    surfaces: authoringSurfaces,
    createHandlers: createAuthoringBundleHandlers
  }),
  "bundle-tutorial": Object.freeze({
    handlerCatalog: tutorialHandlerCatalog,
    routes: tutorialRoutes,
    surfaces: tutorialSurfaces,
    createHandlers: createTutorialBundleHandlers
  })
});

export default {
  bundles
};
