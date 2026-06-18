import fs from "node:fs/promises";
import {
  loadWcssAdapterExport,
  normalizeWcssAuthoringAdapter,
  requireWcssRouteParam,
  resolveWcssAdapterIdentity,
  validateWcssGeneratedFiles
} from "../../src/runtime-wcss-adapter.js";

export const bundleId = "bundle-wcss-runtime";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze(["wcss.stylesheet.read"]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze(["wcss.stylesheet.read"]),
  handlerMetadata: Object.freeze({
    "wcss.stylesheet.read": Object.freeze({
      routeKind: "resource",
      responseKind: "resource",
      methods: Object.freeze(["GET"])
    })
  })
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const capabilities = Object.freeze([]);
export const providers = Object.freeze([]);

function memoizedBundle(cache, key, adapterKey, loadBundle) {
  let bundleMap = cache.get(key);
  if (!bundleMap) {
    bundleMap = new Map();
    cache.set(key, bundleMap);
  }
  const cached = bundleMap.get(adapterKey);
  if (cached) return cached;
  const pending = Promise.resolve()
    .then(loadBundle)
    .catch(error => {
      bundleMap.delete(adapterKey);
      if (bundleMap.size === 0) cache.delete(key);
      throw error;
    });
  bundleMap.set(adapterKey, pending);
  return pending;
}

export function createHandlers(deps = {}) {
  const {
    send,
    sendJson,
    importModule,
    fsModule = fs
  } = deps;
  const bundleBySnapshot = new WeakMap();
  const bundleBySnapshotManager = new WeakMap();
  const bundleByAppContext = new WeakMap();

  async function bundleForRequest({ route, appContext, requestUrl }) {
    const previewSessionId = requestUrl?.searchParams?.get("wcssPreview")?.trim() || "";
    const appRoot = appContext?.appRoot ?? null;
    const requestSnapshot = appContext?.requestSnapshot
      ?? appContext?.appSnapshotManager?.getActiveSnapshot?.()
      ?? null;
    const adapterModule = requireWcssRouteParam(route, "adapterModule", "wcss.stylesheet.read");
    const adapterExport = requireWcssRouteParam(route, "adapterExport", "wcss.stylesheet.read");
    const identity = resolveWcssAdapterIdentity({
      appRoot,
      adapterModule,
      adapterExport,
      handlerName: "wcss.stylesheet.read"
    });
    const adapterKeyBase = identity.key;
    const previewService = appContext?.providerRuntimes?.["wcss.previewSessions"] ?? null;
    let previewSession = null;
    if (previewSessionId) {
      if (!previewService || typeof previewService.resolveSession !== "function") {
        throw new Error("wcss preview session service unavailable");
      }
      previewSession = previewService.resolveSession({
        previewSessionId,
        appRoot: identity.appRoot,
        adapterKey: adapterKeyBase,
        requestSnapshot
      });
    }
    const adapterKey = previewSession
      ? `${adapterKeyBase}\u0000preview:${previewSession.previewSessionId}\u0000v:${previewSession.version}`
      : adapterKeyBase;
    const loadBundle = async () => {
      const loaded = await loadWcssAdapterExport({
        appRoot: identity.appRoot,
        adapterModule,
        adapterExport,
        requestSnapshot,
        importModule,
        fsModule,
        handlerName: "wcss.stylesheet.read"
      });
      const adapterResult = await loaded.exported({
        appRoot: identity.appRoot,
        appContext,
        requestSnapshot
      });
      const adapter = normalizeWcssAuthoringAdapter(adapterResult);
      if (previewSession && adapter.kind !== "authoring") {
        throw new Error("wcss preview requires an authoring-capable adapter");
      }
      if (adapter.kind === "stylesheets-only") {
        return adapter;
      }
      const document = previewSession
        ? adapter.applyPatch({ ops: previewSession.ops })
        : structuredClone(adapter.document);
      return validateWcssGeneratedFiles(await adapter.buildStylesheets({
        document,
        appRoot: identity.appRoot,
        appContext,
        requestSnapshot
      }));
    };
    if (requestSnapshot && typeof requestSnapshot === "object") {
      return memoizedBundle(bundleBySnapshot, requestSnapshot, adapterKey, loadBundle);
    }
    const snapshotManager = appContext?.appSnapshotManager ?? null;
    if (snapshotManager && typeof snapshotManager === "object") {
      return memoizedBundle(bundleBySnapshotManager, snapshotManager, adapterKey, loadBundle);
    }
    const appContextKey = appContext && typeof appContext === "object"
      ? appContext
      : { appRoot: identity.appRoot, adapterKey };
    return memoizedBundle(bundleByAppContext, appContextKey, adapterKey, loadBundle);
  }

  return {
    "wcss.stylesheet.read": async ({ res, route, appContext, requestUrl }) => {
      try {
        const asset = requireWcssRouteParam(route, "asset", "wcss.stylesheet.read");
        const bundle = await bundleForRequest({ route, appContext, requestUrl });
        const body = bundle.files?.[asset];
        if (typeof body !== "string") {
          if (typeof sendJson === "function") sendJson(res, 404, { error: "not found", asset });
          else {
            res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "not found", asset }));
          }
          return;
        }
        if (typeof send === "function") {
          send(res, 200, "text/css; charset=utf-8", body, { "cache-control": "no-cache" });
          return;
        }
        res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" });
        res.end(body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (typeof sendJson === "function") {
          sendJson(res, 500, { error: "wcss stylesheet delivery failed", message });
          return;
        }
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "wcss stylesheet delivery failed", message }));
      }
    }
  };
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  capabilities,
  providers,
  createHandlers
};
