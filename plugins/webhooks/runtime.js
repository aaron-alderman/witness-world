import { handlerCatalog } from "./handler-catalog.js";
import { createWebhookHandlers } from "./handlers.js";

export const bundleId = "bundle-webhooks";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/webhooks", "webhook.inbound.list"),
  patternRoute("GET", /^\/api\/webhooks\/([^/]+)$/, "webhook.inbound.read", ["id"]),
  patternRoute("POST", /^\/api\/webhooks\/inbound\/([^/]+)$/, "webhook.inbound.receive", ["target"])
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createWebhookHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
