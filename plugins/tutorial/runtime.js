import { createTutorialBundleHandlers } from "./tutorial-handlers.js";

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

export const bundleId = "bundle-tutorial";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "tutorial.progress.read",
    "tutorial.progress.write",
    "tutorial.progress.delete"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  patternRoute("GET", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.read", Object.freeze(["tutorialId"])),
  patternRoute("PUT", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.write", Object.freeze(["tutorialId"])),
  patternRoute("DELETE", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.delete", Object.freeze(["tutorialId"]))
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createTutorialBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
