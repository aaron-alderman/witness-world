import { createProposalBundleHandlers } from "./proposal-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

export const bundleId = "bundle-proposals";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "proposal.create",
    "proposal.approve",
    "proposal.reject"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("POST", "/api/proposals", "proposal.create"),
  patternRoute("POST", /^\/api\/proposals\/([^/]+)\/approve$/, "proposal.approve", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/proposals\/([^/]+)\/reject$/, "proposal.reject", Object.freeze(["id"]))
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createProposalBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
