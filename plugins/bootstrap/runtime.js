import { createBootstrapBundleHandlers } from "./bootstrap-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

export const bundleId = "bundle-bootstrap";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "bootstrap.model.read",
    "bootstrap.state.read",
    "bootstrap.appBoundary.establish",
    "bootstrap.page",
    "operator.state.read",
    "operator.backup",
    "operator.export",
    "operator.restore",
    "operator.import"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("GET", "/_bootstrap", "bootstrap.page"),
  exactRoute("GET", "/api/bootstrap-model", "bootstrap.model.read"),
  exactRoute("GET", "/api/bootstrap-state", "bootstrap.state.read"),
  exactRoute("POST", "/api/bootstrap/app-boundary", "bootstrap.appBoundary.establish"),
  exactRoute("GET", "/api/operator/state", "operator.state.read"),
  exactRoute("POST", "/api/operator/backups", "operator.backup"),
  exactRoute("POST", "/api/operator/exports", "operator.export"),
  exactRoute("POST", "/api/operator/restores", "operator.restore"),
  exactRoute("POST", "/api/operator/imports", "operator.import")
]);

export const surfaces = Object.freeze([
  Object.freeze({
    id: "surface:bootstrap",
    title: "Open Bootstrap",
    subtitle: "Recovery and authoring seam",
    href: "/_bootstrap",
    action: null,
    search: "bootstrap hidden recovery authoring harness /_bootstrap",
    type: "surface",
    tier: "harness",
    contexts: Object.freeze(["app-command", "world-command"])
  })
]);

export function createHandlers(deps) {
  return createBootstrapBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
