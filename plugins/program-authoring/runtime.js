import { createProgramAuthoringBundleHandlers } from "./program-authoring-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

export const bundleId = "bundle-program-authoring";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "backendProgram.create",
    "backendProgramVersion.create",
    "backendStep.create",
    "backendProgramVersions.activate",
    "backendProgramVersions.rollback"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("POST", "/api/backend-programs", "backendProgram.create"),
  exactRoute("POST", "/api/backend-program-versions", "backendProgramVersion.create"),
  exactRoute("POST", "/api/backend-steps", "backendStep.create"),
  patternRoute("POST", /^\/api\/backend-program-versions\/([^/]+)\/activate$/, "backendProgramVersions.activate", Object.freeze(["soul"])),
  patternRoute("POST", /^\/api\/backend-program-versions\/([^/]+)\/rollback$/, "backendProgramVersions.rollback", Object.freeze(["soul"]))
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createProgramAuthoringBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
