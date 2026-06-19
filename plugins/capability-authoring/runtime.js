import { createCapabilityAuthoringBundleHandlers } from "./capability-authoring-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

export const bundleId = "bundle-capability-authoring";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "capability.create",
    "capability.update",
    "capability.install",
    "capability.remove",
    "capability.rollback",
    "capability.migrateLegacy"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("POST", "/api/capabilities", "capability.create"),
  patternRoute("PATCH", /^\/api\/capabilities\/([^/]+)$/, "capability.update", Object.freeze(["id"])),
  exactRoute("POST", "/api/capability-installs", "capability.install"),
  exactRoute("DELETE", "/api/capability-installs", "capability.remove"),
  patternRoute("POST", /^\/api\/capabilities\/([^/]+)\/rollback$/, "capability.rollback", Object.freeze(["id"])),
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
