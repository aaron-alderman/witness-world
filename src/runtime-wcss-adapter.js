import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

function assertWithinAllowedRoots(filePath, appRoot, handlerName) {
  if (allowedRootsFor(appRoot).some(root => isWithinRoot(filePath, root))) return;
  throw new Error(`${handlerName} adapter module path outside allowed roots: ${filePath}`);
}

export function requireWcssRouteParam(route, paramName, handlerName) {
  const value = route?.params?.[paramName];
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${handlerName} requires route param ${paramName}`);
}

export function resolveWcssAdapterIdentity({
  appRoot,
  adapterModule,
  adapterExport,
  handlerName
}) {
  const resolvedAppRoot = path.resolve(String(appRoot || ""));
  if (!resolvedAppRoot) throw new Error(`${handlerName} requires appContext.appRoot`);
  if (path.isAbsolute(adapterModule)) {
    throw new Error("adapterModule must be app-relative");
  }
  const resolvedModulePath = path.resolve(resolvedAppRoot, adapterModule);
  assertWithinAllowedRoots(resolvedModulePath, resolvedAppRoot, handlerName);
  const ext = path.extname(resolvedModulePath).toLowerCase();
  if (ext !== ".js" && ext !== ".mjs") {
    throw new Error("adapterModule must reference a .js or .mjs file");
  }
  return {
    appRoot: resolvedAppRoot,
    modulePath: resolvedModulePath,
    moduleParam: adapterModule,
    exportName: adapterExport,
    key: `${resolvedModulePath}\u0000${adapterExport}`
  };
}

export async function loadWcssAdapterExport({
  appRoot,
  adapterModule,
  adapterExport,
  requestSnapshot,
  importModule = specifier => import(specifier),
  fsModule = fs,
  handlerName
}) {
  const identity = resolveWcssAdapterIdentity({
    appRoot,
    adapterModule,
    adapterExport,
    handlerName
  });
  const stat = await fsModule.stat(identity.modulePath);
  const snapshotRevision = Number(requestSnapshot?.appRevision || 0);
  const specifier = `${pathToFileURL(identity.modulePath).href}?appRevision=${encodeURIComponent(String(snapshotRevision))}&mtime=${encodeURIComponent(String(stat.mtimeMs || 0))}`;
  const imported = await importModule(specifier);
  const exported = imported?.[adapterExport];
  if (typeof exported !== "function") {
    throw new Error(`adapter export ${adapterExport} is not a function in ${adapterModule}`);
  }
  return {
    identity,
    exported
  };
}

export function validateWcssGeneratedFiles(result) {
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

export function normalizeWcssAuthoringAdapter(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("WCSS authoring adapter must return an object");
  }
  if (result.files) {
    return {
      kind: "stylesheets-only",
      ...validateWcssGeneratedFiles(result)
    };
  }
  if (
    typeof result.applyTokenPatch !== "function"
    || typeof result.buildStylesheets !== "function"
    || !result.document
  ) {
    throw new Error("WCSS authoring adapter must expose document, applyTokenPatch, and buildStylesheets");
  }
  const tokenCatalog = result.tokenCatalog && typeof result.tokenCatalog === "object"
    ? structuredClone(result.tokenCatalog)
    : { tokens: [] };
  return {
    kind: "authoring",
    document: structuredClone(result.document),
    tokenCatalog,
    applyTokenPatch: result.applyTokenPatch,
    buildStylesheets: result.buildStylesheets
  };
}
