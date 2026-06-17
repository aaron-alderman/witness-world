import { handlerCatalog } from "./handler-catalog.js";
import { createSecretStoreHandlers } from "./handlers.js";
import { secretModuleProjectors } from "./projections.js";
import { createSecretStoreRuntime, secretReadShape } from "./support-services.js";

export const bundleId = "bundle-secret";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/secrets", "secret.store.list"),
  patternRoute("GET", /^\/api\/secrets\/([^/]+)$/, "secret.store.read", ["id"]),
  exactRoute("POST", "/api/secrets", "secret.store.create"),
  patternRoute("PUT", /^\/api\/secrets\/([^/]+)\/value$/, "secret.store.write", ["id"]),
  patternRoute("DELETE", /^\/api\/secrets\/([^/]+)$/, "secret.store.delete", ["id"])
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "secret.projections",
    projectors: secretModuleProjectors
  },
  {
    kind: "providerRuntimeFactory",
    id: "secret.store",
    factory: createSecretStoreRuntime
  },
  {
    kind: "supportServiceFactory",
    id: "secret.support",
    factory: () => ({
      secretReadShape
    })
  }
]);

export function createHandlers(deps) {
  return createSecretStoreHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
