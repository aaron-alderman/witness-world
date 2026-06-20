import { createRuntimeWorkerTransportDescriptor } from "./runtime-worker-transport-contract.js";

export const RUNTIME_WORKER_CONTROL_PROTOCOL_VERSION = "witness-worker-control/v1";
export const RUNTIME_WORKER_CONTROL_KIND = "descriptor";

export const RUNTIME_WORKER_CONTROL_PATH = "/api/runtime/worker-control";
export const RUNTIME_PROCESS_HEALTH_PATH = "/api/runtime/process-health";
export const RUNTIME_SUPERVISION_ACTIVATE_PATH = "/api/runtime/supervision/activate";
export const RUNTIME_SUPERVISION_QUIESCE_PATH = "/api/runtime/supervision/quiesce";
export const RUNTIME_APP_SNAPSHOT_RELOAD_PATH = "/api/runtime/app-snapshot/reload";

function absoluteUrl(origin, pathname) {
  return new URL(pathname, origin).toString();
}

export function createRuntimeWorkerControlDocument({
  origin,
  health = null,
  supervision = null
} = {}) {
  const safeOrigin = String(origin || "http://127.0.0.1").trim() || "http://127.0.0.1";
  const role = supervision?.role ?? "active";
  const mutationsEnabled = supervision?.mutationsEnabled !== false;
  const watchersEnabled = supervision?.watchersEnabled === true;
  const reloadUrl = mutationsEnabled ? absoluteUrl(safeOrigin, RUNTIME_APP_SNAPSHOT_RELOAD_PATH) : null;
  return {
    protocol: RUNTIME_WORKER_CONTROL_PROTOCOL_VERSION,
    kind: RUNTIME_WORKER_CONTROL_KIND,
    instanceId: supervision?.instanceId ?? null,
    role,
    mutationsEnabled,
    watchersEnabled,
    ready: health?.ready === true,
    status: typeof health?.status === "string" && health.status ? health.status : "unknown",
    reasonCodes: Array.isArray(health?.reasonCodes) ? [...health.reasonCodes] : [],
    sampledAt: typeof health?.sampledAt === "string" && health.sampledAt ? health.sampledAt : new Date().toISOString(),
    healthUrl: absoluteUrl(safeOrigin, RUNTIME_PROCESS_HEALTH_PATH),
    activationUrl: absoluteUrl(safeOrigin, RUNTIME_SUPERVISION_ACTIVATE_PATH),
    quiesceUrl: absoluteUrl(safeOrigin, RUNTIME_SUPERVISION_QUIESCE_PATH),
    reloadUrl,
    transport: createRuntimeWorkerTransportDescriptor({
      mutationsEnabled
    }),
    actions: {
      health: {
        method: "GET",
        href: absoluteUrl(safeOrigin, RUNTIME_PROCESS_HEALTH_PATH)
      },
      activate: {
        method: "POST",
        href: absoluteUrl(safeOrigin, RUNTIME_SUPERVISION_ACTIVATE_PATH)
      },
      quiesce: {
        method: "POST",
        href: absoluteUrl(safeOrigin, RUNTIME_SUPERVISION_QUIESCE_PATH)
      },
      reload: reloadUrl
        ? {
            method: "POST",
            href: reloadUrl
          }
        : null
    }
  };
}
