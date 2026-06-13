import { handlerCatalog } from "./handler-catalog.js";
import { createOauthHandlers } from "./handlers.js";
import { createRuntimeAuthOAuthSupportServices } from "./support-services.js";
import { oauthModuleProjectors } from "./projections.js";

export const bundleId = "bundle-oauth";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("POST", "/api/oauth/start", "auth.oauth.start"),
  exactRoute("GET", "/api/oauth/links", "auth.oauth.links.list"),
  patternRoute("GET", /^\/api\/oauth\/links\/([^/]+)$/, "auth.oauth.links.read", ["id"]),
  patternRoute("GET", /^\/api\/oauth\/callback\/([^/]+)$/, "auth.oauth.callback", ["provider"])
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "oauth.projections",
    projectors: oauthModuleProjectors
  },
  {
    kind: "supportServiceFactory",
    id: "oauth.support",
    factory: () => ({
      createRuntimeAuthOAuthSupportServices
    })
  }
]);

export function createHandlers(deps) {
  return createOauthHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
