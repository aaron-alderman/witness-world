import { createServerRunnerAuthoringBundleHandlers } from "./server-runner-authoring-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

export const bundleId = "bundle-server-runner-authoring";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "serverRunner.runtimeProfile.set",
    "runtimePlugin.install",
    "runtimePlugin.remove",
    "runtimePlugin.reconcile"
  ]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "serverRunner.create",
    "serverRunner.runtimeProfile.set",
    "runtimePlugin.install",
    "runtimePlugin.remove",
    "runtimePlugin.reconcile"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("POST", "/api/server-runners", "serverRunner.create"),
  patternRoute("PATCH", /^\/api\/server-runners\/([^/]+)\/runtime-profile$/, "serverRunner.runtimeProfile.set", ["id"]),
  exactRoute("POST", "/api/runtime-plugin-installs", "runtimePlugin.install"),
  exactRoute("DELETE", "/api/runtime-plugin-installs", "runtimePlugin.remove"),
  exactRoute("POST", "/api/runtime-plugin-reconciles", "runtimePlugin.reconcile")
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createServerRunnerAuthoringBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
