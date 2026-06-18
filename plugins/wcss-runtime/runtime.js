import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

function isWithinRoot(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sharedLibRootFor(appRoot) {
  return path.join(path.dirname(appRoot), "_lib");
}

function allowedRootsFor(appRoot) {
  return [appRoot, sharedLibRootFor(appRoot)];
}

function assertWithinAllowedRoots(filePath, appRoot) {
  if (allowedRootsFor(appRoot).some(root => isWithinRoot(filePath, root))) return;
  throw new Error(`adapter module path outside allowed roots: ${filePath}`);
}

function requireRouteParam(route, paramName) {
  const value = route?.params?.[paramName];
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`wcss.stylesheet.read requires route param ${paramName}`);
}

function resolveAdapterModulePath(appRoot, adapterModule) {
  const resolvedAppRoot = path.resolve(String(appRoot || ""));
  if (!resolvedAppRoot) throw new Error("wcss.stylesheet.read requires appContext.appRoot");
  if (path.isAbsolute(adapterModule)) {
    throw new Error("adapterModule must be app-relative");
  }
  const resolved = path.resolve(resolvedAppRoot, adapterModule);
  assertWithinAllowedRoots(resolved, resolvedAppRoot);
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".js" && ext !== ".mjs") {
    throw new Error("adapterModule must reference a .js or .mjs file");
  }
  return resolved;
}

async function loadAdapterExport({
  appRoot,
  adapterModule,
  adapterExport,
  requestSnapshot,
  importModule = specifier => import(specifier),
  fsModule = fs
}) {
  const resolvedModulePath = resolveAdapterModulePath(appRoot, adapterModule);
  const stat = await fsModule.stat(resolvedModulePath);
  const snapshotRevision = Number(requestSnapshot?.appRevision || 0);
  const specifier = `${pathToFileURL(resolvedModulePath).href}?appRevision=${encodeURIComponent(String(snapshotRevision))}&mtime=${encodeURIComponent(String(stat.mtimeMs || 0))}`;
  const imported = await importModule(specifier);
  const exported = imported?.[adapterExport];
  if (typeof exported !== "function") {
    throw new Error(`adapter export ${adapterExport} is not a function in ${adapterModule}`);
  }
  return exported;
}

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

function validateGeneratedBundle(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("WCSS adapter must return an object");
  }
  const files = result.files;
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("WCSS adapter must return { files }");
  }
  for (const [name, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      throw new Error(`WCSS adapter file ${name} must be a string`);
    }
  }
  return { files };
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

  async function bundleForRequest({ route, appContext }) {
    const appRoot = appContext?.appRoot ?? null;
    const requestSnapshot = appContext?.requestSnapshot
      ?? appContext?.appSnapshotManager?.getActiveSnapshot?.()
      ?? null;
    const adapterModule = requireRouteParam(route, "adapterModule");
    const adapterExport = requireRouteParam(route, "adapterExport");
    const adapterKey = `${adapterModule}\u0000${adapterExport}`;
    const loadBundle = async () => {
      const adapterFactory = await loadAdapterExport({
        appRoot,
        adapterModule,
        adapterExport,
        requestSnapshot,
        importModule,
        fsModule
      });
      return validateGeneratedBundle(await adapterFactory({
        appRoot,
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
    const appContextKey = appContext && typeof appContext === "object" ? appContext : { appRoot, adapterKey };
    return memoizedBundle(bundleByAppContext, appContextKey, adapterKey, loadBundle);
  }

  return {
    "wcss.stylesheet.read": async ({ res, route, appContext }) => {
      try {
        const asset = requireRouteParam(route, "asset");
        const bundle = await bundleForRequest({ route, appContext });
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
