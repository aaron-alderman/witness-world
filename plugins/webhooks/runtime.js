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
    kind: "capabilityDefinitions",
    id: "webhooks.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "webhook.inbound",
        label: "Inbound Webhooks",
        dependsOn: Object.freeze(["jobs.queue"]),
        providerAdapters: Object.freeze([
          Object.freeze({ id: "generic-signed", label: "Generic signed", status: "shipped", default: true })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["deliveryId"]),
          failure: Object.freeze(["webhook.inbound.receive.failed", "webhook.inbound.verify.failed", "webhook.inbound.replay.failed", "webhook.inbound.process.failed"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([
          Object.freeze({ name: "webhook.inbound.secret", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "webhook.inbound.replayWindowMs", accepts: "runtimeConfig.key" })
        ])
      })
    ])
  },
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
