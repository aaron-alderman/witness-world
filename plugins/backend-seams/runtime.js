import { handlerCatalog } from "./handler-catalog.js";
import { createBackendSeamsHandlers } from "./handlers.js";

export const bundleId = "bundle-backend-seams";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function surfaceEntry({
  id,
  title,
  href,
  action = null,
  search,
  subtitle = "",
  type = "surface",
  tier = "internal",
  contexts = ["app-command", "world-command"]
}) {
  return {
    id,
    title,
    subtitle,
    href,
    action,
    type,
    tier,
    contexts,
    search: search || `${title} ${subtitle} ${href || ""}`
  };
}

export const routes = Object.freeze([
  exactRoute("GET", "/backend-seams", "page.backendSeams"),
  exactRoute("GET", "/api/backend-seams", "backendSeams.read")
]);

export const surfaces = Object.freeze([
  surfaceEntry({
    id: "surface:backend-seams",
    title: "Open Backend Seams",
    subtitle: "Diagnostics surface",
    href: "/backend-seams",
    type: "surface",
    tier: "internal",
    contexts: ["world-command"],
    search: "backend seams diagnostics hidden internal operator /backend-seams"
  })
]);

export function createHandlers(deps) {
  return createBackendSeamsHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
