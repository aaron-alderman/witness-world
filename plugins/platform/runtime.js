import { handlerCatalog } from "./handler-catalog.js";
import { platformModuleProjectors } from "./projections.js";
import { createPlatformHandlers } from "./handlers.js";
import { createPlatformTestMonitorRuntime } from "./provider-runtime.js";

export const bundleId = "bundle-platform";
export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
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
  return Object.freeze({
    id,
    title,
    subtitle,
    href,
    action,
    type,
    tier,
    contexts: Object.freeze([...contexts]),
    search: search || `${title} ${subtitle} ${href || ""}`
  });
}

export const routes = Object.freeze([
  exactRoute("GET", "/platform", "page.platform"),
  exactRoute("GET", "/api/platform-model", "platform.model.read"),
  exactRoute("GET", "/api/platform-gaps", "platform.gaps.read"),
  exactRoute("GET", "/api/platform-branches", "platform.branch.list"),
  patternRoute("GET", /^\/api\/platform-branches\/([^/]+)$/, "platform.branch.read", Object.freeze(["id"])),
  exactRoute("POST", "/api/platform-branches", "platform.branch.create"),
  exactRoute("GET", "/api/platform-change-sets", "platform.changeSet.list"),
  patternRoute("GET", /^\/api\/platform-change-sets\/([^/]+)$/, "platform.changeSet.read", Object.freeze(["id"])),
  exactRoute("POST", "/api/platform-change-sets", "platform.changeSet.create"),
  patternRoute("POST", /^\/api\/platform-change-sets\/([^/]+)\/edits$/, "platform.changeSet.edit", Object.freeze(["id"])),
  patternRoute("DELETE", /^\/api\/platform-change-sets\/([^/]+)\/edits\/([^/]+)$/, "platform.changeSet.removeEdit", Object.freeze(["id", "pathHash"])),
  patternRoute("POST", /^\/api\/platform-change-sets\/([^/]+)\/validate$/, "platform.changeSet.validate", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/platform-change-sets\/([^/]+)\/apply$/, "platform.changeSet.apply", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/platform-change-sets\/([^/]+)\/reject$/, "platform.changeSet.reject", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/platform-change-sets\/([^/]+)\/abandon$/, "platform.changeSet.abandon", Object.freeze(["id"])),
  exactRoute("POST", "/api/platform-test-runs", "platform.testRun.create"),
  exactRoute("GET", "/api/platform-test-runs/events", "platform.testRun.events"),
  patternRoute("GET", /^\/api\/platform-test-runs\/([^/]+)$/, "platform.testRun.read", Object.freeze(["id"])),
  exactRoute("POST", "/api/platform-proposals", "platform.proposal.create"),
  patternRoute("POST", /^\/api\/platform-proposals\/([^/]+)\/approve$/, "platform.proposal.approve", Object.freeze(["id"])),
  patternRoute("POST", /^\/api\/platform-proposals\/([^/]+)\/reject$/, "platform.proposal.reject", Object.freeze(["id"]))
]);

export const surfaces = Object.freeze([
  surfaceEntry({
    id: "surface:platform",
    title: "Open Platform",
    subtitle: "Platform self-model and stewardship console",
    href: "/platform",
    search: "platform self model console lifecycle stewardship plugins bundles routes handlers capabilities gates /platform"
  })
]);

export const capabilities = Object.freeze(["platform.self"]);

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "platform.projections",
    projectors: platformModuleProjectors
  },
  {
    kind: "providerRuntimeFactory",
    id: "platform.testMonitor",
    factory: createPlatformTestMonitorRuntime
  }
]);

export function createHandlers(deps) {
  return createPlatformHandlers(deps);
}

export default {
  bundleId,
  capabilities,
  handlerCatalog,
  providers,
  routes,
  surfaces,
  createHandlers
};
