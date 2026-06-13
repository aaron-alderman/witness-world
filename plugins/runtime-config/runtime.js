import { handlerCatalog } from "./handler-catalog.js";
import { createRuntimeConfigHandlers } from "./handlers.js";

export const bundleId = "bundle-runtime-config";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/runtime-config", "runtimeConfig.read")
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createRuntimeConfigHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
