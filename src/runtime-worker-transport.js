import path from "node:path";
import { createRuntimeWorkerControlDocument } from "./runtime-worker-control-contract.js";
import { RUNTIME_WORKER_TRANSPORT_METHODS } from "./runtime-worker-transport-contract.js";

function supervisionPayload(supervision) {
  return {
    ok: true,
    instanceId: supervision?.instanceId ?? null,
    role: supervision?.role ?? "active",
    mutationsEnabled: supervision?.mutationsEnabled !== false,
    watchersEnabled: supervision?.watchersEnabled === true
  };
}

function runtimeMutationsBlocked(appContext) {
  return appContext?.runtimeSupervision?.mutationsEnabled === false;
}

function runtimeDrainingPayload(appContext) {
  return {
    error: "runtime draining",
    instanceId: appContext?.runtimeSupervision?.instanceId ?? null,
    role: appContext?.runtimeSupervision?.role ?? null
  };
}

function resolveSupervision(runtimeContext, appContext) {
  return runtimeContext?.runtimeSupervision ?? appContext?.runtimeSupervision ?? null;
}

function resolveSnapshotManager(runtimeContext, appContext) {
  return runtimeContext?.appSnapshotManager ?? appContext?.appSnapshotManager ?? null;
}

function healthPayload(runtimeProcessHealthMonitor, runtimeContext, appContext) {
  const supervision = resolveSupervision(runtimeContext, appContext);
  return {
    ...runtimeProcessHealthMonitor.snapshot(),
    instanceId: supervision?.instanceId ?? null,
    role: supervision?.role ?? "active",
    mutationsEnabled: supervision?.mutationsEnabled !== false,
    watchersEnabled: supervision?.watchersEnabled === true
  };
}

export async function executeRuntimeWorkerTransportCall({
  method,
  args = null,
  runtimeContext = null,
  appContext = null,
  runtimeProcessHealthMonitor,
  syncLocalSnapshotPoller = null,
  controlOrigin = null
} = {}) {
  switch (method) {
    case RUNTIME_WORKER_TRANSPORT_METHODS.controlDescribe: {
      return {
        status: 200,
        body: createRuntimeWorkerControlDocument({
          origin: controlOrigin || "http://127.0.0.1",
          health: runtimeProcessHealthMonitor.snapshot(),
          supervision: resolveSupervision(runtimeContext, appContext)
        })
      };
    }
    case RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead: {
      return {
        status: 200,
        body: healthPayload(runtimeProcessHealthMonitor, runtimeContext, appContext)
      };
    }
    case RUNTIME_WORKER_TRANSPORT_METHODS.supervisionActivate: {
      const supervision = resolveSupervision(runtimeContext, appContext);
      if (!supervision) {
        return {
          status: 404,
          body: { error: "runtime supervision unavailable" }
        };
      }
      supervision.role = "active";
      supervision.mutationsEnabled = true;
      supervision.watchersEnabled = supervision.watchersEnabled === true && runtimeContext?.devMode === true;
      supervision.lastStateAt = new Date().toISOString();
      runtimeContext?.appSnapshotManager?.setWatcherMode?.(supervision.watchersEnabled);
      syncLocalSnapshotPoller?.();
      return {
        status: 200,
        body: supervisionPayload(supervision)
      };
    }
    case RUNTIME_WORKER_TRANSPORT_METHODS.supervisionQuiesce: {
      const supervision = resolveSupervision(runtimeContext, appContext);
      if (!supervision) {
        return {
          status: 404,
          body: { error: "runtime supervision unavailable" }
        };
      }
      supervision.role = "draining";
      supervision.mutationsEnabled = false;
      supervision.watchersEnabled = false;
      supervision.lastStateAt = new Date().toISOString();
      runtimeContext?.appSnapshotManager?.setWatcherMode?.(false);
      syncLocalSnapshotPoller?.();
      return {
        status: 200,
        body: supervisionPayload(supervision)
      };
    }
    case RUNTIME_WORKER_TRANSPORT_METHODS.appSnapshotReload: {
      if (runtimeMutationsBlocked(appContext)) {
        return {
          status: 409,
          body: runtimeDrainingPayload(appContext)
        };
      }
      const snapshotManager = resolveSnapshotManager(runtimeContext, appContext);
      if (!snapshotManager) {
        return {
          status: 503,
          body: { error: "app snapshot manager unavailable" }
        };
      }
      try {
        const sourceIds = Array.isArray(args?.paths) ? args.paths : [];
        const absolutePaths = sourceIds
          .map(value => typeof value === "string" && value.trim() ? path.resolve(snapshotManager.appRoot, value.trim()) : null)
          .filter(Boolean);
        const snapshot = absolutePaths.length
          ? await snapshotManager.markDirtyPaths(absolutePaths, { trigger: "reload" })
          : await snapshotManager.ensureFresh({ trigger: "reload" });
        return {
          status: 200,
          body: {
            ok: true,
            appRevision: Number(snapshot?.appRevision ?? snapshotManager.appRevision ?? 0),
            changedSources: sourceIds,
            buildErrors: [...(snapshotManager.buildErrors ?? [])],
            watchersEnabled: appContext?.runtimeSupervision?.watchersEnabled === true
          }
        };
      } catch (error) {
        return {
          status: 400,
          body: {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
    default:
      return {
        status: 404,
        body: { error: `unknown runtime worker transport method: ${String(method || "")}` }
      };
  }
}
