import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

let runtimeWcssAdapterMaterializationSequence = 0;

function isWithinRoot(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}

function sharedLibRootFor(appRoot) {
  return path.join(path.dirname(appRoot), "_lib");
}

function allowedRootsFor(appRoot) {
  return [appRoot, sharedLibRootFor(appRoot)];
}

function capabilitySourceIdForPath(appRoot, filePath) {
  const resolvedAppRoot = path.resolve(String(appRoot || ""));
  const resolvedFilePath = path.resolve(String(filePath || ""));
  if (isWithinRoot(resolvedFilePath, resolvedAppRoot)) {
    return normalizeSlashes(path.relative(resolvedAppRoot, resolvedFilePath));
  }
  const sharedLibRoot = sharedLibRootFor(resolvedAppRoot);
  if (isWithinRoot(resolvedFilePath, sharedLibRoot)) {
    return normalizeSlashes(path.relative(sharedLibRoot, resolvedFilePath));
  }
  return null;
}

function assertWithinAllowedRoots(filePath, appRoot, handlerName) {
  if (allowedRootsFor(appRoot).some(root => isWithinRoot(filePath, root))) return;
  throw new Error(`${handlerName} adapter module path outside allowed roots: ${filePath}`);
}

function createCapabilityRequiredError(filePath) {
  const error = new Error(`WCSS adapter path must be available through witness-core capability: ${filePath}`);
  error.code = "WITNESS_CORE_REQUIRED";
  error.status = 503;
  return error;
}

function sanitizeSegment(value, fallback = "adapter") {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function extractRelativeModuleSpecifiers(sourceText) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"'`]+)["']/g,
    /\bimport\s*["']([^"'`]+)["']/g,
    /\bimport\s*\(\s*["']([^"'`]+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(String(sourceText || ""))) !== null) {
      const specifier = typeof match?.[1] === "string" ? match[1].trim() : "";
      if (!specifier.startsWith(".")) continue;
      specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

function candidateModuleSourceIds(fromSourceId, specifier) {
  const normalizedFrom = normalizeSlashes(fromSourceId);
  const baseDir = path.posix.dirname(normalizedFrom);
  const resolved = normalizeSlashes(path.posix.normalize(path.posix.join(baseDir === "." ? "" : baseDir, specifier)));
  if (!resolved || resolved === "." || resolved.startsWith("../") || resolved === ".." || path.posix.isAbsolute(resolved)) {
    return [];
  }
  const ext = path.posix.extname(resolved).toLowerCase();
  const candidates = ext === ".js" || ext === ".mjs"
    ? [resolved]
    : [
        resolved,
        `${resolved}.js`,
        `${resolved}.mjs`,
        `${resolved}/index.js`,
        `${resolved}/index.mjs`
      ];
  return [...new Set(candidates.map(normalizeSlashes))];
}

function parseCapabilityModifiedAt(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

async function resolveExistingModuleSourceId(generationBridge, fromSourceId, specifier) {
  for (const candidate of candidateModuleSourceIds(fromSourceId, specifier)) {
    const stat = await generationBridge.statSource({ path: candidate });
    if (stat?.exists === true && stat?.isFile !== false) return candidate;
  }
  return null;
}

async function materializeWcssAdapterModuleFromWitnessCore(identity, {
  generationBridge = null,
  cwd = process.cwd(),
  fsModule = fs,
  scratchRoot = null,
  requireGenerationBridgeForCanonicalImports = false
} = {}) {
  if (
    typeof generationBridge?.readSource !== "function"
    || typeof generationBridge?.statSource !== "function"
  ) {
    if (requireGenerationBridgeForCanonicalImports) {
      throw createCapabilityRequiredError(identity.modulePath);
    }
    return {
      modulePath: identity.modulePath,
      materialized: false,
      mtimeMs: null
    };
  }
  const adapterSourceId = capabilitySourceIdForPath(identity.appRoot, identity.modulePath);
  if (!adapterSourceId && requireGenerationBridgeForCanonicalImports) {
    throw createCapabilityRequiredError(identity.modulePath);
  }
  if (!adapterSourceId) {
    return {
      modulePath: identity.modulePath,
      materialized: false,
      mtimeMs: null
    };
  }
  const adapterStat = await generationBridge.statSource({ path: adapterSourceId });
  if (adapterStat?.exists !== true || adapterStat?.isFile === false) {
    throw new Error(`adapter module not found in witness-core capability scope: ${identity.moduleParam}`);
  }
  const materializationId = `${Date.now()}-${runtimeWcssAdapterMaterializationSequence++}`;
  const baseScratchRoot = path.resolve(String(scratchRoot || path.join(cwd, ".witness-core", "runtime-wcss-adapters")));
  const scratchDir = path.join(
    baseScratchRoot,
    `${sanitizeSegment(path.basename(identity.modulePath, path.extname(identity.modulePath)), "adapter")}-${materializationId}`
  );
  const queue = [adapterSourceId];
  const visited = new Set();
  while (queue.length) {
    const currentSourceId = normalizeSlashes(queue.shift());
    if (!currentSourceId || visited.has(currentSourceId)) continue;
    visited.add(currentSourceId);
    const source = await generationBridge.readSource({ path: currentSourceId });
    const content = String(source?.content ?? "");
    const targetPath = path.join(scratchDir, ...currentSourceId.split("/"));
    await fsModule.mkdir(path.dirname(targetPath), { recursive: true });
    await fsModule.writeFile(targetPath, content, "utf8");
    for (const specifier of extractRelativeModuleSpecifiers(content)) {
      const dependencySourceId = await resolveExistingModuleSourceId(generationBridge, currentSourceId, specifier);
      if (dependencySourceId) queue.push(dependencySourceId);
    }
  }
  return {
    modulePath: path.join(scratchDir, ...adapterSourceId.split("/")),
    materialized: true,
    mtimeMs: parseCapabilityModifiedAt(adapterStat?.modifiedAt),
    scratchRoot: scratchDir
  };
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
  generationBridge = null,
  cwd = process.cwd(),
  scratchRoot = null,
  requireGenerationBridgeForCanonicalImports = false,
  handlerName
}) {
  const identity = resolveWcssAdapterIdentity({
    appRoot,
    adapterModule,
    adapterExport,
    handlerName
  });
  const materialized = await materializeWcssAdapterModuleFromWitnessCore(identity, {
    generationBridge,
    cwd,
    fsModule,
    scratchRoot,
    requireGenerationBridgeForCanonicalImports
  });
  const effectiveModulePath = materialized.modulePath;
  const stat = materialized.materialized === true && Number.isFinite(materialized.mtimeMs)
    ? { mtimeMs: materialized.mtimeMs }
    : await fsModule.stat(effectiveModulePath);
  const snapshotRevision = Number(requestSnapshot?.appRevision || 0);
  const specifier = `${pathToFileURL(effectiveModulePath).href}?appRevision=${encodeURIComponent(String(snapshotRevision))}&mtime=${encodeURIComponent(String(stat.mtimeMs || 0))}`;
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
    typeof result.applyPatch !== "function"
    || typeof result.buildStylesheets !== "function"
    || !result.schema
    || !result.document
  ) {
    throw new Error("WCSS authoring adapter must expose document, schema, applyPatch, and buildStylesheets");
  }
  const tokenCatalog = result.tokenCatalog && typeof result.tokenCatalog === "object"
    ? structuredClone(result.tokenCatalog)
    : { tokens: [] };
  const applyPatch = result.applyPatch;
  const applyTokenPatch = typeof result.applyTokenPatch === "function"
    ? result.applyTokenPatch
    : ({ ops }) => applyPatch({
      ops: Array.isArray(ops)
        ? ops.map(op => {
          const kind = typeof op?.kind === "string" ? op.kind.trim() : "";
          if (kind === "set") {
            return {
              kind: "token.set",
              token: op.token,
              value: op.value
            };
          }
          if (kind === "reset") {
            return {
              kind: "token.reset",
              token: op.token
            };
          }
          throw new Error(`Unsupported compatibility token patch op ${kind || "<empty>"}`);
        })
        : ops
    });
  return {
    kind: "authoring",
    document: structuredClone(result.document),
    schema: structuredClone(result.schema),
    tokenCatalog,
    applyPatch,
    applyTokenPatch,
    buildStylesheets: result.buildStylesheets
  };
}
