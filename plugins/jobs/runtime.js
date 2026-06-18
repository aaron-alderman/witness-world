import { handlerCatalog } from "./handler-catalog.js";
import { createJobsQueueHandlers } from "./handlers.js";
import { createInProcessJobQueue } from "./provider-runtime.js";
import { jobsModuleProjectors } from "./projections.js";

export const bundleId = "bundle-jobs";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/jobs", "jobs.queue.list"),
  exactRoute("POST", "/api/jobs", "jobs.queue.enqueue"),
  patternRoute("GET", /^\/api\/jobs\/([^/]+)$/, "jobs.queue.read", ["id"])
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "jobs.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "jobs.queue",
        label: "Jobs Queue",
        providerAdapters: Object.freeze([
          Object.freeze({ id: "in-process", label: "In-process worker", status: "shipped", default: true })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["jobId", "idempotencyKey"]),
          failure: Object.freeze(["jobs.queue.deadLetter"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([
          Object.freeze({ name: "jobs.queue.pollMs", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "jobs.queue.maxAttempts", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "jobs.queue.retryDelayMs", accepts: "runtimeConfig.key" })
        ])
      })
    ])
  },
  {
    kind: "moduleProjectors",
    id: "jobs.projections",
    projectors: jobsModuleProjectors
  },
  {
    kind: "providerRuntimeFactory",
    id: "jobs.queue",
    factory: createInProcessJobQueue
  }
]);

export function createHandlers(deps) {
  return createJobsQueueHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
