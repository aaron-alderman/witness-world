import { createServerRunnerAuthoringBundleHandlers } from "./server-runner-authoring-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

export const bundleId = "bundle-server-runner-authoring";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "runtimePlugin.install",
    "runtimePlugin.remove"
  ]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "serverRunner.create",
    "runtimePlugin.install",
    "runtimePlugin.remove"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("POST", "/api/server-runners", "serverRunner.create"),
  exactRoute("POST", "/api/runtime-plugin-installs", "runtimePlugin.install"),
  exactRoute("DELETE", "/api/runtime-plugin-installs", "runtimePlugin.remove")
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
