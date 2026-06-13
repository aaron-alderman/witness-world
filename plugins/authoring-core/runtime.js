import { createAuthoringCoreBundleHandlers } from "./authoring-core-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

const authoringHandlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
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
    "widgets.create",
    "widgets.update",
    "route.create",
    "serve.create"
  ]),
  handlerMetadata: Object.freeze({})
});

const authoringRoutes = Object.freeze([
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
  exactRoute("POST", "/api/widgets", "widgets.create"),
  patternRoute("PATCH", /^\/api\/widgets\/([^/]+)$/, "widgets.update", Object.freeze(["id"])),
  exactRoute("POST", "/api/identities", "identity.create"),
  patternRoute("PATCH", /^\/api\/identities\/([^/]+)$/, "identity.update", Object.freeze(["id"])),
  exactRoute("POST", "/api/routes", "route.create"),
  exactRoute("POST", "/api/serve-mounts", "serve.create")
]);

const authoringSurfaces = Object.freeze([]);

export const bundles = Object.freeze({
  "bundle-authoring-core": Object.freeze({
    handlerCatalog: authoringHandlerCatalog,
    routes: authoringRoutes,
    surfaces: authoringSurfaces,
    createHandlers: createAuthoringCoreBundleHandlers
  })
});

export default {
  bundles
};
