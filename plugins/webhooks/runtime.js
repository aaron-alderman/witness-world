import { handlerCatalog } from "./handler-catalog.js";
import { createWebhookHandlers } from "./handlers.js";
import {
  createWebhookIoServices,
  webhookPayloadPathFor,
  webhookReadShape
} from "./io-services.js";
import { createBuiltinWebhookJobHandlers } from "./job-handlers.js";
import { webhookModuleProjectors } from "./projections.js";

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

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "webhooks.projections",
    projectors: webhookModuleProjectors
  },
  {
    kind: "supportServiceFactory",
    id: "webhooks.support",
    factory: () => ({
      createWebhookIoServices,
      webhookPayloadPathFor,
      webhookReadShape
    })
  },
  {
    kind: "jobHandlerFactory",
    id: "webhooks",
    factory: createBuiltinWebhookJobHandlers
  }
]);

export function createHandlers(deps) {
  return createWebhookHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
