import fs from "node:fs/promises";
import path from "node:path";
import {
  compileWtomlDocsToDesirePlus,
  compileRvmFileToDesirePlus,
  createDesireRegistriesFromPluginExtensions,
  elaborateDesirePlus,
  normalizeDesirePlusToDesire,
  applyDesire
} from "./desire/index.js";
import { registerModuleProjectors } from "./modules.js";
import { DEFAULT_RUNTIME_PROFILE, runtimeBundleSummaryForProfile } from "./runtime-bundles.js";
import { collectActiveRuntimeContributions } from "./runtime-active-contributions.js";
import {
  readRuntimePluginCatalog,
  resolveConfiguredRuntimePluginIds,
  resolveRuntimePluginRoot
} from "./runtime-plugin-utils.js";
import { loadRuntimePluginModules } from "./runtime-plugin-loader.js";

const MANIFEST_ONLY_DOC_KINDS = new Set(["desktopTarget"]);

// Tiny TOML-ish DSL parser. Intentional subset:
//   [[section]]
//   key = "value"
//   key = 123
//   key = true
//   key = { a = "b", n = 1 }
//   key = ["a", "b"]
//
// v0.14 adds ergonomic surface sugar while keeping the same witnessed runtime:
//   [[defaults]] actor = "adam"
//   [[heading]] id = "title" text = "Hello" level = 1
//   [[form]] id = "todo_form" role = "todo-form" children = ["todo_input", "todo_add"]
//   [[step]] program = "p" on = "load" op = "fetchJson" url = "/api" into = "response"
// Unknown widget keys become props. Unknown step keys become params.
export function parseWitnessToml(source) {
  const docs = [];
  let current = null;
  let lineNum = 0;

  for (const raw of source.split(/\r?\n/)) {
    lineNum++;
    const line = stripComment(raw).trim();
    if (!line) continue;

    const arraySection = line.match(/^\[\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\]\]$/);
    if (arraySection) {
      current = { kind: arraySection[1], values: {}, line: lineNum, sectionStyle: "array" };
      docs.push(current);
      continue;
    }

    const tableSection = line.match(/^\[\s*([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z_][A-Za-z0-9_-]*))?\s*\]$/);
    if (tableSection) {
      current = { kind: tableSection[1], values: tableSection[2] ? { id: tableSection[2] } : {}, line: lineNum, sectionStyle: "table" };
      docs.push(current);
      continue;
    }

    if (!current) throw new Error(`key/value before section: ${line}`);

    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(`expected key = value: ${line}`);

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) throw new Error(`invalid key: ${key}`);
    current.values[key] = parseValue(value);
  }

  return docs;
}

export async function loadWitnessTomlFile(
  file,
  {
    seen = new Set(),
    beforeLoad = null,
    rvmFormRegistry = null,
    requireReadCapability = false
  } = {}
) {
  const loaded = await loadWitnessAppFile(file, {
    seen,
    beforeLoad,
    rvmFormRegistry,
    requireReadCapability
  });
  return loaded.witnessDocs;
}

export async function loadWitnessAppFile(
  file,
  {
    seen = new Set(),
    beforeLoad = null,
    rvmFormRegistry = null,
    readFile = null,
    requireReadCapability = false
  } = {}
) {
  const resolved = path.resolve(file);
  const readSource = typeof readFile === "function"
    ? readFile
    : requireReadCapability === true
      ? null
      : (target, encoding) => fs.readFile(target, encoding);
  if (typeof readSource !== "function") {
    throw createReadCapabilityRequiredError(resolved);
  }
  if (typeof beforeLoad === "function") {
    await beforeLoad(resolved);
  }
  if (seen.has(resolved)) {
    return {
      witnessDocs: [],
      authoredDesireDocs: [],
      allDocs: [],
      sourceFiles: [],
      importEntries: []
    };
  }
  seen.add(resolved);

  if (path.extname(resolved).toLowerCase() === ".rvm") {
    return {
      witnessDocs: [],
      authoredDesireDocs: [
        normalizeDesirePlusToDesire(
          await compileRvmFileToDesirePlus(resolved, {
            rvmFormRegistry,
            readFile: readSource,
            requireReadCapability
          }),
          { rvmFormRegistry }
        )
      ],
      allDocs: [],
      sourceFiles: [{ file: resolved, sourceLanguage: "rvm" }],
      importEntries: []
    };
  }

  const source = await readSource(resolved, "utf8");
  const parsedDocs = parseWitnessToml(source).map(doc => ({ ...doc, file: resolved }));
  const docs = parsedDocs.filter(doc => !MANIFEST_ONLY_DOC_KINDS.has(doc.kind));
  const imports = parsedDocs
    .filter(doc => doc.kind === "app" && Array.isArray(doc.values.imports))
    .flatMap(doc => doc.values.imports);

  const witnessDocs = [...docs];
  const allDocs = [...parsedDocs];
  const authoredDesireDocs = [];
  const sourceFiles = [{ file: resolved, sourceLanguage: "wtoml" }];
  const importEntries = [];
  for (const spec of imports) {
    const importedPath = path.resolve(path.dirname(resolved), spec);
    importEntries.push({
      from: resolved,
      spec,
      file: importedPath
    });
    const loaded = await loadWitnessAppFile(importedPath, {
      seen,
      beforeLoad,
      rvmFormRegistry,
      readFile: readSource,
      requireReadCapability
    });
    witnessDocs.push(...loaded.witnessDocs);
    allDocs.push(...loaded.allDocs);
    authoredDesireDocs.push(...loaded.authoredDesireDocs);
    sourceFiles.push(...loaded.sourceFiles);
    importEntries.push(...loaded.importEntries);
  }

  return { witnessDocs, authoredDesireDocs, allDocs, sourceFiles, importEntries };
}

function createReadCapabilityRequiredError(file) {
  const error = new Error(`witness app loading requires an injected read capability for ${file}`);
  error.code = "WITNESS_CORE_REQUIRED";
  error.status = 503;
  return error;
}

export function applyWitnessToml(world, source, options = {}) {
  return applyWitnessDocs(world, parseWitnessToml(source), options);
}

export function applyWitnessDocs(world, docs, options = {}) {
  const desirePlus = compileWtomlDocsToDesirePlus(docs);
  const elaboratedDesirePlus = elaborateDesirePlus(desirePlus, { elaboratorRegistry: options.elaboratorRegistry });
  const desire = normalizeDesirePlusToDesire(elaboratedDesirePlus);
  return applyDesire(world, desire, { runtimeDeclarationRegistry: options.runtimeDeclarationRegistry });
}

export async function loadRuntimePluginRegistriesForDocs(docs, options = {}) {
  const authoredPluginIds = runtimePluginInstallIdsFromDocs(docs);
  const configuredPluginIds = resolveConfiguredRuntimePluginIds({
    env: options.env ?? process.env,
    runtimePluginIds: options.runtimePluginIds ?? null
  });
  if (!authoredPluginIds.length && !configuredPluginIds.length) {
    return {
      authoredPluginIds,
      configuredPluginIds,
      pluginCatalog: null,
      loadResult: null,
      registries: null
    };
  }

  const pluginRoot = options.pluginRoot ?? resolveRuntimePluginRoot({ env: options.env ?? process.env });
  const pluginCatalog = await (options.readRuntimePluginCatalog ?? readRuntimePluginCatalog)({
    pluginRoot,
    runtimeProfile: options.runtimeProfile ?? DEFAULT_RUNTIME_PROFILE,
    configuredPluginIds,
    authoredPluginIds,
    generationBridge: options.generationBridge ?? null,
    cwd: options.cwd ?? process.cwd(),
    requireGenerationBridgeForCanonicalReads: options.requireGenerationBridgeForCanonicalReads === true
  });
  if (pluginCatalog.selection?.hasBlockingErrors) {
    throw createRuntimePluginLoadError("runtime plugins unresolved", pluginCatalog);
  }

  const effectiveLoadResult = await (options.loadRuntimePluginModules ?? loadRuntimePluginModules)({
    pluginCatalog,
    generationBridge: options.generationBridge ?? null,
    cwd: options.cwd ?? process.cwd(),
    requireGenerationBridgeForCanonicalImports: options.requireGenerationBridgeForCanonicalReads === true
  });
  if (effectiveLoadResult.hasBlockingErrors) {
    throw createRuntimePluginLoadError("runtime plugin modules unresolved", {
      ...pluginCatalog,
      rejectedPlugins: [
        ...(pluginCatalog.rejectedPlugins ?? []),
        ...(effectiveLoadResult.failures ?? [])
      ]
    });
  }

  return {
    authoredPluginIds,
    configuredPluginIds,
    pluginCatalog,
    loadResult: effectiveLoadResult,
    registries: createDesireRegistriesFromPluginExtensions(effectiveLoadResult)
  };
}

export async function applyWitnessDocsWithRuntimePlugins(world, docs, options = {}) {
  const pluginRuntime = await loadRuntimePluginRegistriesForDocs(docs, options);
  if (!pluginRuntime.registries) {
    return applyWitnessDocs(world, docs, options);
  }

  const summary = runtimeBundleSummaryForProfile(options.runtimeProfile ?? DEFAULT_RUNTIME_PROFILE, {
    additionalBundleIds: [
      ...(pluginRuntime.pluginCatalog?.addedBundleIds ?? []),
      ...Object.keys(pluginRuntime.loadResult?.bundleOverrides ?? {})
    ],
    bundleOverrides: pluginRuntime.loadResult?.bundleOverrides ?? {}
  });
  const contributions = collectActiveRuntimeContributions({ bundles: summary.bundles });
  const unregisterModuleProjectors = registerModuleProjectors("dsl.activePlugins", contributions.moduleProjectors ?? {});
  try {
    return applyWitnessDocs(world, docs, {
      ...options,
      elaboratorRegistry: options.elaboratorRegistry ?? pluginRuntime.registries.elaboratorRegistry,
      runtimeDeclarationRegistry: options.runtimeDeclarationRegistry ?? pluginRuntime.registries.runtimeDeclarationRegistry
    });
  } finally {
    unregisterModuleProjectors();
  }
}

export function applyWitnessDocsLegacy(world, docs, options = {}) {
  return applyWitnessDocs(world, docs, options);
}

function runtimePluginInstallIdsFromDocs(docs) {
  return [...new Set(
    docs
      .filter(doc => doc?.kind === "runtimePluginInstall")
      .map(doc => typeof doc.values?.plugin === "string" ? doc.values.plugin.trim() : "")
      .filter(Boolean)
  )];
}

function createRuntimePluginLoadError(reason, runtimePluginCatalog) {
  const error = new Error(reason);
  error.reason = reason;
  error.runtimePluginCatalog = runtimePluginCatalog;
  return error;
}

function stripComment(line) {
  let quote = false;
  let braceDepth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") quote = !quote;
    if (!quote && ch === "{") braceDepth++;
    if (!quote && ch === "}") braceDepth--;
    if (!quote && braceDepth === 0 && ch === "#") return line.slice(0, i);
  }
  return line;
}

function parseValue(text) {
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("{") && text.endsWith("}")) return parseInlineTable(text);
  if (text.startsWith("[") && text.endsWith("]")) return parseArray(text);
  throw new Error(`unsupported value: ${text}`);
}

function parseInlineTable(text) {
  const inner = text.slice(1, -1).trim();
  if (!inner) return {};
  const out = {};
  for (const part of splitTopLevel(inner, ",")) {
    const eq = part.indexOf("=");
    if (eq < 0) throw new Error(`bad inline table entry: ${part}`);
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    out[key] = parseValue(value);
  }
  return out;
}

function parseArray(text) {
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner, ",").map(x => parseValue(x.trim()));
}

function splitTopLevel(text, delimiter) {
  const parts = [];
  let quote = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") quote = !quote;
    if (!quote && ch === "{") braceDepth++;
    if (!quote && ch === "}") braceDepth--;
    if (!quote && ch === "[") bracketDepth++;
    if (!quote && ch === "]") bracketDepth--;
    if (!quote && braceDepth === 0 && bracketDepth === 0 && ch === delimiter) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
