import { handlerCatalog } from "./handler-catalog.js";
import { createNotificationHandlers } from "./handlers.js";
import { notificationReadShape, notificationTitle } from "./glue.js";
import { createBuiltinNotificationJobHandlers } from "./job-handlers.js";
import { notificationModuleProjectors } from "./projections.js";

export const bundleId = "bundle-notifications";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("POST", "/api/notify/email", "notify.email.enqueue"),
  exactRoute("POST", "/api/notify/sms", "notify.sms.enqueue"),
  exactRoute("GET", "/api/notifications", "notifications.list"),
  patternRoute("GET", /^\/api\/notifications\/([^/]+)$/, "notifications.read", ["id"])
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "notifications.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "notify.email",
        label: "Email Notifications",
        dependsOn: Object.freeze(["jobs.queue"]),
        providerAdapters: Object.freeze([
          Object.freeze({ id: "stub", label: "Stub delivery", status: "shipped", default: true }),
          Object.freeze({ id: "http", label: "Generic HTTP", status: "shipped" }),
          Object.freeze({ id: "sendgrid", label: "SendGrid", status: "shipped" })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["providerMessageId"]),
          failure: Object.freeze(["notify.email.render.failed", "notify.email.send.failed"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([
          Object.freeze({ name: "notify.email.provider", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "notify.email.stubSender", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "notify.email.http.url", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "notify.email.http.apiKey", accepts: "runtimeConfig.key", source: "secret" }),
          Object.freeze({ name: "notify.email.http.fromAddress", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "notify.email.http.responseIdPath", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "notify.email.sendgrid.apiKey", accepts: "runtimeConfig.key", source: "secret" }),
          Object.freeze({ name: "notify.email.sendgrid.fromAddress", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "notify.email.sendgrid.url", accepts: "runtimeConfig.key" })
        ])
      }),
      Object.freeze({
        id: "notify.sms",
        label: "SMS Notifications",
        dependsOn: Object.freeze(["jobs.queue"]),
        providerAdapters: Object.freeze([
          Object.freeze({ id: "stub", label: "Stub delivery", status: "shipped", default: true })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["providerMessageId"]),
          failure: Object.freeze(["notify.sms.render.failed"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([
          Object.freeze({ name: "notify.sms.stubSender", accepts: "runtimeConfig.key" })
        ])
      })
    ])
  },
  {
    kind: "moduleProjectors",
    id: "notifications.projections",
    projectors: notificationModuleProjectors
  },
  {
    kind: "supportServiceFactory",
    id: "notifications.support",
    factory: () => ({
      notificationTitle,
      notificationReadShape
    })
  },
  {
    kind: "jobHandlerFactory",
    id: "notifications",
    factory: createBuiltinNotificationJobHandlers
  }
]);

export function createHandlers(deps) {
  return createNotificationHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
