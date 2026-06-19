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
    "surface.create",
    "collection.create",
    "process.create",
    "type.create",
    "projection.create",
    "message.create",
    "boundary.create",
    "policy.create",
    "package.create",
    "packageRevision.create",
    "packageRevision.publish",
    "packagePatch.create",
    "packageNamespace.create",
    "packageDependency.create",
    "packageTransformer.create",
    "frontend.upliftLegacy",
    "widgets.create",
    "widgets.update",
    "widgets.replace",
    "widgets.replace.rollback",
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
  exactRoute("POST", "/api/surfaces", "surface.create"),
  exactRoute("POST", "/api/collections", "collection.create"),
  exactRoute("POST", "/api/processes", "process.create"),
  exactRoute("POST", "/api/types", "type.create"),
  exactRoute("POST", "/api/projections", "projection.create"),
  exactRoute("POST", "/api/messages", "message.create"),
  exactRoute("POST", "/api/boundaries", "boundary.create"),
  exactRoute("POST", "/api/policies", "policy.create"),
  exactRoute("POST", "/api/packages", "package.create"),
  exactRoute("POST", "/api/package-revisions", "packageRevision.create"),
  patternRoute("POST", /^\/api\/package-revisions\/([^/]+)\/publish$/, "packageRevision.publish", Object.freeze(["id"])),
  exactRoute("POST", "/api/package-patches", "packagePatch.create"),
  exactRoute("POST", "/api/package-namespaces", "packageNamespace.create"),
  exactRoute("POST", "/api/package-dependencies", "packageDependency.create"),
  exactRoute("POST", "/api/package-transformers", "packageTransformer.create"),
  exactRoute("POST", "/api/frontend-uplifts/legacy", "frontend.upliftLegacy"),
  exactRoute("POST", "/api/widgets", "widgets.create"),
  patternRoute("PATCH", /^\/api\/widgets\/([^/]+)$/, "widgets.update", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/widgets\/([^/]+)\/replace$/, "widgets.replace", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/widgets\/([^/]+)\/replace\/rollback$/, "widgets.replace.rollback", Object.freeze(["id"])),
  exactRoute("POST", "/api/identities", "identity.create"),
  patternRoute("PATCH", /^\/api\/identities\/([^/]+)$/, "identity.update", Object.freeze(["id"])),
  exactRoute("POST", "/api/routes", "route.create"),
  exactRoute("POST", "/api/serve-mounts", "serve.create")
]);

const authoringSurfaces = Object.freeze([]);
const authoringProviders = Object.freeze([]);

export const bundles = Object.freeze({
  "bundle-authoring-core": Object.freeze({
    handlerCatalog: authoringHandlerCatalog,
    routes: authoringRoutes,
    surfaces: authoringSurfaces,
    providers: authoringProviders,
    createHandlers: createAuthoringCoreBundleHandlers
  })
});

export default {
  bundles
};
