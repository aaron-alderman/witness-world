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
