import { createCapabilityAuthoringBundleHandlers } from "./capability-authoring-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

export const bundleId = "bundle-capability-authoring";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "capability.create",
    "capability.install",
    "capability.remove",
    "capability.migrateLegacy"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("POST", "/api/capabilities", "capability.create"),
  exactRoute("POST", "/api/capability-installs", "capability.install"),
  exactRoute("DELETE", "/api/capability-installs", "capability.remove"),
  exactRoute("POST", "/api/capability-migrations/legacy", "capability.migrateLegacy")
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createCapabilityAuthoringBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
