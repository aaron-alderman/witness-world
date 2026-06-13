import { handlerCatalog } from "./handler-catalog.js";
import { createHttpOutboundHandlers } from "./handlers.js";

export const bundleId = "bundle-http-outbound";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/http/outbound", "http.outbound.list"),
  exactRoute("POST", "/api/http/outbound", "http.outbound.send"),
  patternRoute("GET", /^\/api\/http\/outbound\/([^/]+)$/, "http.outbound.read", ["id"])
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createHttpOutboundHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
