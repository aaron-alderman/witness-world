import { handlerCatalog } from "./handler-catalog.js";
import { createSearchIndexHandlers } from "./handlers.js";

export const bundleId = "bundle-search";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/search/index", "search.index.inspect"),
  exactRoute("POST", "/api/search/index/build", "search.index.build"),
  exactRoute("POST", "/api/search/index/reindex", "search.index.reindex"),
  exactRoute("POST", "/api/search/index/query", "search.index.query")
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createSearchIndexHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
