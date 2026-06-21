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

function resolveRuntimeTransportRequest(runtimeContext, appContext) {
  return runtimeContext?.runtimeTransportHttpRequest
    ?? appContext?.runtimeTransportHttpRequest
    ?? null;
}

function resolvePreviewManager(runtimeContext, appContext) {
  return runtimeContext?.appPreviewSessionManager
    ?? appContext?.appPreviewSessionManager
    ?? null;
}

function appRevisionPayload(snapshotManager = null) {
  return typeof snapshotManager?.getLastRevisionEvent === "function"
    ? snapshotManager.getLastRevisionEvent()
    : null;
}

function backendRevisionPayload(snapshotManager = null) {
  const event = appRevisionPayload(snapshotManager);
  return event
    ? {
        revision: Number(event?.revision ?? event?.appRevision ?? 0),
        branch: event?.branchId ? String(event.branchId) : null,
        changeSet: event?.changeSetId ? String(event.changeSetId) : null,
        trigger: String(event?.trigger || "initial"),
        changedSources: Array.isArray(event?.changedSources) ? event.changedSources.map(String) : [],
        status: String(event?.status || "active")
      }
    : null;
}

function healthPayload(runtimeProcessHealthMonitor, runtimeContext, appContext) {
  const baseHealth = typeof runtimeProcessHealthMonitor?.sample === "function"
    ? runtimeProcessHealthMonitor.sample()
    : runtimeProcessHealthMonitor.snapshot();
  const supervision = resolveSupervision(runtimeContext, appContext);
  return {
    ...baseHealth,
    startupMode: appContext?.runtimeStartupMode ?? runtimeContext?.runtimeStartupMode ?? "serve",
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
        const trigger = typeof args?.trigger === "string" && args.trigger.trim()
          ? args.trigger.trim()
          : "reload";
        const absolutePaths = sourceIds
          .map(value => typeof value === "string" && value.trim() ? path.resolve(snapshotManager.appRoot, value.trim()) : null)
          .filter(Boolean);
        const snapshot = absolutePaths.length
          ? await snapshotManager.markDirtyPaths(absolutePaths, { trigger })
          : await snapshotManager.ensureFresh({ trigger });
        return {
          status: 200,
          body: {
            ok: true,
            appRevision: Number(snapshot?.appRevision ?? snapshotManager.appRevision ?? 0),
            changedSources: sourceIds,
            trigger,
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
    case RUNTIME_WORKER_TRANSPORT_METHODS.appRevisionRead: {
      const snapshotManager = resolveSnapshotManager(runtimeContext, appContext);
      if (!snapshotManager || appContext?.devMode !== true) {
        return {
          status: 404,
          body: { error: "app revision events unavailable" }
        };
      }
      return {
        status: 200,
        body: appRevisionPayload(snapshotManager)
      };
    }
    case RUNTIME_WORKER_TRANSPORT_METHODS.backendRevisionRead: {
      const snapshotManager = resolveSnapshotManager(runtimeContext, appContext);
      if (!snapshotManager) {
        return {
          status: 404,
          body: { error: "backend revision events unavailable" }
        };
      }
      return {
        status: 200,
        body: backendRevisionPayload(snapshotManager)
      };
    }
    case RUNTIME_WORKER_TRANSPORT_METHODS.appPreviewSessionEventRead: {
      const previewManager = resolvePreviewManager(runtimeContext, appContext);
      if (!previewManager) {
        return {
          status: 503,
          body: { error: "app preview sessions unavailable" }
        };
      }
      const previewSessionId = typeof args?.previewSessionId === "string" && args.previewSessionId.trim()
        ? args.previewSessionId.trim()
        : "";
      if (!previewSessionId) {
        return {
          status: 400,
          body: { error: "preview session id is required" }
        };
      }
      if (typeof previewManager.hydrateSession === "function") {
        await previewManager.hydrateSession(previewSessionId);
      }
      const previewSession = previewManager.readSession(previewSessionId);
      if (!previewSession) {
        return {
          status: 404,
          body: { error: "preview session not found" }
        };
      }
      return {
        status: 200,
        body: previewSession.event ?? previewSession
      };
    }
    case RUNTIME_WORKER_TRANSPORT_METHODS.appHttpRequest: {
      const transportRequest = resolveRuntimeTransportRequest(runtimeContext, appContext);
      if (typeof transportRequest !== "function") {
        return {
          status: 503,
          body: { error: "runtime request transport unavailable" }
        };
      }
      try {
        const result = await transportRequest({
          method: typeof args?.method === "string" && args.method.trim()
            ? args.method.trim().toUpperCase()
            : "GET",
          path: typeof args?.path === "string" && args.path.trim()
            ? args.path.trim()
            : "/",
          headers: args?.headers && typeof args.headers === "object" ? args.headers : {},
          bodyBase64: typeof args?.bodyBase64 === "string" ? args.bodyBase64 : null,
          bodyText: typeof args?.bodyText === "string" ? args.bodyText : null
        });
        return {
          status: Number(result?.status || 200),
          body: result && typeof result === "object" ? result : { status: 200 }
        };
      } catch (error) {
        return {
          status: Number(error?.status || 500),
          body: {
            error: error instanceof Error ? error.message : String(error),
            code: error?.code ?? null
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
