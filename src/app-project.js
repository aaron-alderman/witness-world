import path from "node:path";
import { loadRuntimePluginRegistriesForDocs, loadWitnessAppFile } from "./dsl.js";
import { runtimeLocalFsModule } from "./runtime-local-fs.js";
import { createStableAppOverlayReadFile, readStableAppSourceCache } from "./runtime-stable-source-cache.js";

export const APP_MANIFEST_BASENAME = "app.wtoml";
export const COMPUTE_MODULE_LANGUAGE_V1 = "assemblyscript";
export const COMPUTE_MODULE_ABI_V1 = "world.hostOperation.v1";
export const COMPUTE_MODULE_EXPORT_V1 = "invoke";

function createAppProjectError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function createExtensionModelContainer() {
  return {
    byId: new Map(),
    values: Object.create(null)
  };
}

function addExtensionModel(container, modelId, value) {
  container.byId.set(modelId, value);
  container.values[modelId] = value;
}

function buildAppProjectExtensionModels({
  appProjectBase,
  witnessDocs,
  authoredDesireDocs,
  allDocs,
  appProjectAssemblers = []
} = {}) {
  const extensionModels = createExtensionModelContainer();
  for (const assembler of appProjectAssemblers) {
    const model = assembler.build({
      appProjectBase,
      witnessDocs,
      authoredDesireDocs,
      allDocs
    });
    addExtensionModel(extensionModels, assembler.modelId, model);
  }
  return extensionModels;
}

function uniqueByFile(rows = []) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const file = typeof row?.file === "string" ? path.resolve(row.file) : "";
    if (!file || seen.has(file)) continue;
    seen.add(file);
    result.push({ ...row, file });
  }
  return result;
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}

function isWithinRoot(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function statOrNull(targetPath, fsModule) {
  try {
    return await fsModule.stat(targetPath);
  } catch (error) {
    if (error?.code === "WITNESS_CORE_REQUIRED" || Number(error?.status || 0) === 503) throw error;
    return null;
  }
}

function capabilitySourceIdForWorkspacePath(targetPath, cwd) {
  const resolvedCwd = path.resolve(String(cwd || process.cwd()));
  const resolvedTarget = path.resolve(String(targetPath || ""));
  if (!isWithinRoot(resolvedTarget, resolvedCwd)) return null;
  const relative = normalizeSlashes(path.relative(resolvedCwd, resolvedTarget));
  if (!relative || relative === "." || relative === APP_MANIFEST_BASENAME) return relative || APP_MANIFEST_BASENAME;
  if (relative === ".witness-core" || relative.startsWith(".witness-core/")) return null;
  return relative;
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

function createCapabilityMissingError(targetPath) {
  const error = new Error(`source path not available through witness-core capability: ${targetPath}`);
  error.code = "ENOENT";
  return error;
}

function createCapabilityRequiredError(targetPath) {
  const error = new Error(`source path must be available through witness-core capability: ${targetPath}`);
  error.code = "WITNESS_CORE_REQUIRED";
  error.status = 503;
  return error;
}

function createAppProjectSourceFsModule({
  cwd = process.cwd(),
  fsModule = runtimeLocalFsModule,
  generationBridge = null,
  requireGenerationBridgeForCanonicalReads = false
} = {}) {
  if (typeof generationBridge?.readSource !== "function" || typeof generationBridge?.statSource !== "function") {
    if (requireGenerationBridgeForCanonicalReads) {
      return {
        async readFile(target) {
          throw createCapabilityRequiredError(path.resolve(String(target || "")));
        },
        async stat(target) {
          throw createCapabilityRequiredError(path.resolve(String(target || "")));
        }
      };
    }
    return fsModule;
  }
  const resolvedCwd = path.resolve(String(cwd || process.cwd()));
  return {
    async readFile(target, encoding = null) {
      const resolved = path.resolve(String(target || ""));
      const sourceId = capabilitySourceIdForWorkspacePath(resolved, resolvedCwd);
      if (!sourceId && requireGenerationBridgeForCanonicalReads) throw createCapabilityRequiredError(resolved);
      if (!sourceId) return await fsModule.readFile(resolved, encoding ?? undefined);
      const payload = await generationBridge.readSource({ path: sourceId });
      const content = String(payload?.content ?? "");
      if (!encoding) return Buffer.from(content, "utf8");
      if (encoding === "utf8" || encoding === "utf-8") return content;
      return await fsModule.readFile(resolved, encoding);
    },
    async stat(target) {
      const resolved = path.resolve(String(target || ""));
      const sourceId = capabilitySourceIdForWorkspacePath(resolved, resolvedCwd);
      if (!sourceId && requireGenerationBridgeForCanonicalReads) throw createCapabilityRequiredError(resolved);
      if (!sourceId) return await fsModule.stat(resolved);
      const payload = await generationBridge.statSource({ path: sourceId });
      if (payload?.exists !== true) throw createCapabilityMissingError(resolved);
      return {
        size: Number(payload?.size || 0),
        mtimeMs: parseCapabilityModifiedAt(payload?.modifiedAt),
        isFile: () => payload?.isFile !== false,
        isDirectory: () => payload?.isDirectory === true
      };
    }
  };
}

function appProjectSourceFsModule(options = {}) {
  return createAppProjectSourceFsModule({
    cwd: options?.cwd ?? process.cwd(),
    fsModule: options?.fsModule ?? runtimeLocalFsModule,
    generationBridge: options?.generationBridge ?? null,
    requireGenerationBridgeForCanonicalReads: options?.requireGenerationBridgeForCanonicalReads === true
  });
}

function sharedLibRootFor(appRoot) {
  return path.join(path.dirname(appRoot), "_lib");
}

function classifySource(filePath, { appRoot, sharedLibRoot }) {
  if (isWithinRoot(filePath, appRoot)) return "app-owned";
  if (isWithinRoot(filePath, sharedLibRoot)) return "shared-lib";
  return "invalid";
}

function buildTargetRows(kind, docs = []) {
  return docs.map(doc => {
    const id = normalizeId(doc.values?.id);
    if (!id) {
      throw createAppProjectError(
        "APP_TARGET_ID_REQUIRED",
        `${kind} target is missing id at ${doc.file}:${doc.line ?? 0}`,
        { kind, file: doc.file, line: doc.line ?? null }
      );
    }
    return {
      id,
      label: normalizeId(doc.values?.label) ?? id,
      default: doc.values?.default === true,
      file: doc.file ?? null,
      line: doc.line ?? null,
      values: structuredClone(doc.values ?? {})
    };
  });
}

function buildComputeModuleRows(docs = [], { appRoot }) {
  return docs.map(doc => {
    const id = normalizeId(doc.values?.id);
    if (!id) {
      throw createAppProjectError(
        "APP_COMPUTE_MODULE_ID_REQUIRED",
        `compute module is missing id at ${doc.file}:${doc.line ?? 0}`,
        { file: doc.file, line: doc.line ?? null }
      );
    }
    const source = normalizeText(doc.values?.source);
    if (!source) {
      throw createAppProjectError(
        "APP_COMPUTE_MODULE_SOURCE_REQUIRED",
        `compute module ${id} is missing source`,
        { computeModuleId: id, file: doc.file, line: doc.line ?? null }
      );
    }
    const hostOperation = normalizeText(doc.values?.hostOperation);
    if (!hostOperation) {
      throw createAppProjectError(
        "APP_COMPUTE_MODULE_HOST_OPERATION_REQUIRED",
        `compute module ${id} is missing hostOperation`,
        { computeModuleId: id, file: doc.file, line: doc.line ?? null }
      );
    }
    if (/\s/.test(hostOperation)) {
      throw createAppProjectError(
        "APP_COMPUTE_MODULE_HOST_OPERATION_INVALID",
        `compute module ${id} has invalid hostOperation ${hostOperation}`,
        { computeModuleId: id, hostOperation, file: doc.file, line: doc.line ?? null }
      );
    }
    const language = normalizeText(doc.values?.language) ?? COMPUTE_MODULE_LANGUAGE_V1;
    if (language !== COMPUTE_MODULE_LANGUAGE_V1) {
      throw createAppProjectError(
        "APP_COMPUTE_MODULE_LANGUAGE_UNSUPPORTED",
        `compute module ${id} must use ${COMPUTE_MODULE_LANGUAGE_V1} in this tranche`,
        { computeModuleId: id, language, file: doc.file, line: doc.line ?? null }
      );
    }
    const abi = normalizeText(doc.values?.abi) ?? COMPUTE_MODULE_ABI_V1;
    if (abi !== COMPUTE_MODULE_ABI_V1) {
      throw createAppProjectError(
        "APP_COMPUTE_MODULE_ABI_UNSUPPORTED",
        `compute module ${id} must use ${COMPUTE_MODULE_ABI_V1} in this tranche`,
        { computeModuleId: id, abi, file: doc.file, line: doc.line ?? null }
      );
    }
    return {
      id,
      source,
      resolvedSourcePath: path.resolve(appRoot, source),
      language,
      abi,
      export: normalizeText(doc.values?.export) ?? COMPUTE_MODULE_EXPORT_V1,
      hostOperation,
      maxMemoryPages: normalizePositiveInteger(doc.values?.maxMemoryPages),
      timeoutMs: normalizePositiveInteger(doc.values?.timeoutMs),
      allowedBindings: Array.isArray(doc.values?.allowedBindings)
        ? [...new Set(doc.values.allowedBindings.map(value => String(value).trim()).filter(Boolean))]
        : [],
      context: normalizeText(doc.values?.context),
      file: doc.file ?? null,
      line: doc.line ?? null,
      values: structuredClone(doc.values ?? {})
    };
  });
}

function assertUniqueTargetIds(kind, rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.set(row.id, row);
      continue;
    }
    throw createAppProjectError(
      "APP_TARGET_DUPLICATE_ID",
      `duplicate ${kind} target id: ${row.id}`,
      { kind, targetId: row.id, first: seen.get(row.id), second: row }
    );
  }
}

function assertUniqueComputeModuleIds(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.set(row.id, row);
      continue;
    }
    throw createAppProjectError(
      "APP_COMPUTE_MODULE_DUPLICATE_ID",
      `duplicate compute module id: ${row.id}`,
      { computeModuleId: row.id, first: seen.get(row.id), second: row }
    );
  }
}

function assertUniqueComputeModuleHostOperations(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.hostOperation)) {
      seen.set(row.hostOperation, row);
      continue;
    }
    throw createAppProjectError(
      "APP_COMPUTE_MODULE_DUPLICATE_HOST_OPERATION",
      `duplicate compute module hostOperation: ${row.hostOperation}`,
      { hostOperation: row.hostOperation, first: seen.get(row.hostOperation), second: row }
    );
  }
}

function selectTarget(kind, rows, overrideId = null) {
  const label = kind === "server" ? "server runner" : (kind === "mcp" ? "MCP server" : "desktop target");
  if (overrideId) {
    const selected = rows.find(row => row.id === overrideId) ?? null;
    if (!selected) {
      throw createAppProjectError(
        "APP_TARGET_NOT_FOUND",
        `${label} not found: ${overrideId}`,
        { kind, targetId: overrideId, available: rows.map(row => row.id) }
      );
    }
    return selected;
  }
  if (rows.length === 0) {
    throw createAppProjectError(
      "APP_TARGET_MISSING",
      `no ${rows.length === 1 ? label : `${label}s`} defined`,
      { kind, available: [] }
    );
  }
  if (rows.length === 1) return rows[0];
  const defaults = rows.filter(row => row.default === true);
  if (defaults.length === 1) return defaults[0];
  if (defaults.length === 0) {
    throw createAppProjectError(
      "APP_TARGET_DEFAULT_REQUIRED",
      `multiple ${label}s defined but none marked default`,
      { kind, available: rows.map(row => row.id) }
    );
  }
  throw createAppProjectError(
    "APP_TARGET_MULTIPLE_DEFAULTS",
    `multiple ${label}s marked default`,
    { kind, available: defaults.map(row => row.id) }
  );
}

export async function resolveAppProjectEntry(entryPath, {
  cwd = process.cwd(),
  fsModule = runtimeLocalFsModule,
  generationBridge = null,
  requireGenerationBridgeForCanonicalReads = false
} = {}) {
  const sourceFsModule = createAppProjectSourceFsModule({
    cwd,
    fsModule,
    generationBridge,
    requireGenerationBridgeForCanonicalReads
  });
  const raw = typeof entryPath === "string" ? entryPath.trim() : "";
  if (!raw) {
    throw createAppProjectError("APP_ENTRY_REQUIRED", "app startup path is required");
  }
  const resolved = path.resolve(cwd, raw);
  const stat = await statOrNull(resolved, sourceFsModule);
  if (!stat) {
    throw createAppProjectError("APP_ENTRY_MISSING", `app startup path not found: ${resolved}`, { entryPath: resolved });
  }
  if (stat.isDirectory()) {
    const manifestPath = path.join(resolved, APP_MANIFEST_BASENAME);
    const manifestStat = await statOrNull(manifestPath, sourceFsModule);
    if (!manifestStat?.isFile()) {
      throw createAppProjectError("APP_MANIFEST_MISSING", `app manifest not found: ${manifestPath}`, {
        appRoot: resolved,
        manifestPath
      });
    }
    return {
      appRoot: resolved,
      manifestPath
    };
  }
  if (!stat.isFile()) {
    throw createAppProjectError("APP_ENTRY_INVALID", `app startup path must be a directory or file: ${resolved}`, {
      entryPath: resolved
    });
  }
  if (path.basename(resolved) !== APP_MANIFEST_BASENAME) {
    throw createAppProjectError(
      "APP_ENTRY_NOT_CANONICAL",
      `direct app startup file must be ${APP_MANIFEST_BASENAME}: ${resolved}`,
      { entryPath: resolved }
    );
  }
  return {
    appRoot: path.dirname(resolved),
    manifestPath: resolved
  };
}

export async function loadAppProject(entryPath, options = {}) {
  const { appRoot, manifestPath } = await resolveAppProjectEntry(entryPath, options);
  const sourceFsModule = appProjectSourceFsModule(options);
  const sharedLibRoot = sharedLibRootFor(appRoot);
  const ensureSourceWithinBoundary = async sourcePath => {
    const classification = classifySource(sourcePath, { appRoot, sharedLibRoot });
    if (classification !== "invalid") return;
    throw createAppProjectError(
      "APP_IMPORT_OUT_OF_BOUNDS",
      `app import outside allowed roots: ${sourcePath}`,
      {
        appRoot,
        manifestPath,
        file: sourcePath,
        allowedRoots: [appRoot, sharedLibRoot]
      }
    );
  };
  const readFile = options?.readFile ?? ((target, encoding) => sourceFsModule.readFile(target, encoding));
  const initialLoaded = await loadWitnessAppFile(manifestPath, {
    beforeLoad: ensureSourceWithinBoundary,
    readFile,
    requireReadCapability: options?.requireGenerationBridgeForCanonicalReads === true
  });
  const pluginRuntime = await loadRuntimePluginRegistriesForDocs(initialLoaded.witnessDocs, {
    runtimeProfile: options?.runtimeProfile,
    runtimePluginIds: options?.runtimePluginIds ?? null,
    pluginRoot: options?.pluginRoot ?? null,
    env: options?.env ?? process.env,
    generationBridge: options?.generationBridge ?? null,
    cwd: options?.cwd ?? process.cwd(),
    requireGenerationBridgeForCanonicalReads: options?.requireGenerationBridgeForCanonicalReads === true
  });
  const loaded = pluginRuntime.registries?.rvmFormRegistry
    ? await loadWitnessAppFile(manifestPath, {
      beforeLoad: ensureSourceWithinBoundary,
      readFile,
      rvmFormRegistry: pluginRuntime.registries.rvmFormRegistry,
      requireReadCapability: options?.requireGenerationBridgeForCanonicalReads === true
    })
    : initialLoaded;
  const sourceFiles = uniqueByFile(loaded.sourceFiles);
  const groupedImports = {
    "app-owned": [],
    "shared-lib": [],
    "plugin/runtime": []
  };

  for (const source of sourceFiles) {
    const classification = classifySource(source.file, { appRoot, sharedLibRoot });
    if (classification === "invalid") continue;
    groupedImports[classification].push(source.file);
  }

  const appDocs = loaded.allDocs.filter(doc => doc.kind === "app");
  const serverTargets = buildTargetRows("server", loaded.allDocs.filter(doc => doc.kind === "serverRunner"));
  const mcpTargets = buildTargetRows("mcp", loaded.allDocs.filter(doc => doc.kind === "mcpServer")).map(row => ({
    ...row,
    serverRunner: normalizeId(row.values.serverRunner),
    transports: Array.isArray(row.values.transports)
      ? [...new Set(row.values.transports.map(value => String(value).trim()).filter(Boolean))]
      : ["stdio", "http"]
  }));
  const desktopTargets = buildTargetRows("desktop", loaded.allDocs.filter(doc => doc.kind === "desktopTarget")).map(row => ({
    ...row,
    serverRunner: normalizeId(row.values.serverRunner)
  }));
  const computeModules = buildComputeModuleRows(loaded.allDocs.filter(doc => doc.kind === "computeModule"), { appRoot });

  assertUniqueTargetIds("server", serverTargets);
  assertUniqueTargetIds("mcp", mcpTargets);
  assertUniqueTargetIds("desktop", desktopTargets);
  assertUniqueComputeModuleIds(computeModules);
  assertUniqueComputeModuleHostOperations(computeModules);

  const serverIds = new Set(serverTargets.map(row => row.id));
  for (const row of mcpTargets) {
    if (!row.serverRunner) {
      throw createAppProjectError("APP_MCP_SERVER_RUNNER_REQUIRED", `mcp target ${row.id} is missing serverRunner`, { target: row });
    }
    if (!serverIds.has(row.serverRunner)) {
      throw createAppProjectError(
        "APP_MCP_SERVER_RUNNER_UNKNOWN",
        `mcp target ${row.id} references unknown server runner ${row.serverRunner}`,
        { target: row, availableServerRunners: [...serverIds] }
      );
    }
  }
  for (const row of desktopTargets) {
    if (!row.serverRunner) {
      throw createAppProjectError("APP_DESKTOP_SERVER_RUNNER_REQUIRED", `desktop target ${row.id} is missing serverRunner`, { target: row });
    }
    if (!serverIds.has(row.serverRunner)) {
      throw createAppProjectError(
        "APP_DESKTOP_SERVER_RUNNER_UNKNOWN",
        `desktop target ${row.id} references unknown server runner ${row.serverRunner}`,
        { target: row, availableServerRunners: [...serverIds] }
      );
    }
  }

  const appProjectBase = {
    appRoot,
    manifestPath,
    appId: normalizeId(appDocs[0]?.values?.id),
    witnessDocs: loaded.witnessDocs,
    authoredDesireDocs: loaded.authoredDesireDocs,
    runtimePluginRegistries: pluginRuntime.registries ?? null,
    allDocs: loaded.allDocs,
    sourceFiles,
    importEntries: loaded.importEntries,
    computeModules,
    targets: {
      server: serverTargets,
      mcp: mcpTargets,
      desktop: desktopTargets
    },
    diagnostics: {
      appRoot,
      manifestPath,
      shellTargets: {
        server: serverTargets.map(row => ({ id: row.id, default: row.default, file: row.file, line: row.line })),
        mcp: mcpTargets.map(row => ({ id: row.id, default: row.default, serverRunner: row.serverRunner, file: row.file, line: row.line })),
        desktop: desktopTargets.map(row => ({ id: row.id, default: row.default, serverRunner: row.serverRunner, file: row.file, line: row.line }))
      },
      computeModules: computeModules.map(row => ({
        id: row.id,
        source: row.source,
        hostOperation: row.hostOperation,
        language: row.language,
        abi: row.abi,
        export: row.export,
        maxMemoryPages: row.maxMemoryPages,
        timeoutMs: row.timeoutMs,
        allowedBindings: [...row.allowedBindings],
        file: row.file,
        line: row.line
      })),
      imports: groupedImports
    }
  };
  const extensionModels = buildAppProjectExtensionModels({
    appProjectBase,
    witnessDocs: loaded.witnessDocs,
    authoredDesireDocs: loaded.authoredDesireDocs,
    allDocs: loaded.allDocs,
    appProjectAssemblers: pluginRuntime.loadResult?.appProjectAssemblers ?? []
  });

  return {
    ...appProjectBase,
    extensionModels
  };
}

export async function loadAppProjectWithStableFallback(entryPath, options = {}) {
  const sourceFsModule = appProjectSourceFsModule(options);
  try {
    return {
      appProject: await loadAppProject(entryPath, options),
      source: "live",
      fallbackUsed: false,
      liveError: null
    };
  } catch (liveError) {
    const resolvedEntry = await resolveAppProjectEntry(entryPath, options).catch(() => null);
    const cache = resolvedEntry
      ? await readStableAppSourceCache(resolvedEntry.manifestPath, {
          cwd: options?.cwd ?? process.cwd(),
          fsModule: options?.fsModule ?? runtimeLocalFsModule
        })
      : null;
    if (!cache) throw liveError;
    const readFile = createStableAppOverlayReadFile(cache, {
      fsModule: options?.fsModule ?? runtimeLocalFsModule,
      parentReadFile: options?.readFile ?? ((target, encoding) => sourceFsModule.readFile(target, encoding))
    });
    const appProject = await loadAppProject(entryPath, {
      ...options,
      readFile
    });
    appProject.stableSourceCacheUsed = true;
    appProject.stableSourceCache = cache;
    return {
      appProject,
      source: "stable-cache",
      fallbackUsed: true,
      liveError
    };
  }
}

export function resolveServeTarget(appProject, { serverRunnerId = null } = {}) {
  const serverRunner = selectTarget("server", appProject.targets.server, serverRunnerId);
  return {
    kind: "server",
    serverRunner
  };
}

export function resolveMcpTarget(appProject, { mcpServerId = null } = {}) {
  const mcpServer = selectTarget("mcp", appProject.targets.mcp, mcpServerId);
  const serverRunner = appProject.targets.server.find(row => row.id === mcpServer.serverRunner) ?? null;
  if (!serverRunner) {
    throw createAppProjectError(
      "APP_MCP_SERVER_RUNNER_UNKNOWN",
      `mcp target ${mcpServer.id} references unknown server runner ${mcpServer.serverRunner}`,
      { target: mcpServer }
    );
  }
  return {
    kind: "mcp",
    mcpServer,
    serverRunner
  };
}

export function resolveDesktopTarget(appProject, { desktopTargetId = null } = {}) {
  const desktopTarget = selectTarget("desktop", appProject.targets.desktop, desktopTargetId);
  const serverRunner = appProject.targets.server.find(row => row.id === desktopTarget.serverRunner) ?? null;
  if (!serverRunner) {
    throw createAppProjectError(
      "APP_DESKTOP_SERVER_RUNNER_UNKNOWN",
      `desktop target ${desktopTarget.id} references unknown server runner ${desktopTarget.serverRunner}`,
      { target: desktopTarget }
    );
  }
  return {
    kind: "desktop",
    desktopTarget,
    serverRunner
  };
}
