import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  availableRuntimeBundleIds,
  availableRuntimeProfiles,
  DEFAULT_RUNTIME_PROFILE,
  runtimeBundleSummaryForProfile,
  resolveRuntimeComposition,
  runtimeProfilePluginIds,
  runtimeBundleManifest
} from "./runtime-bundles.js";
import { availableRuntimeShellIds } from "./runtime-shell-contract.js";
import { cloneRuntimeOwnerChain, extractRuntimeOwnershipFields } from "./runtime-ownership.js";

export const DEFAULT_RUNTIME_PLUGIN_DIRECTORY = "plugins";
export const DEFAULT_PLUGIN_EXECUTION_REASON = "metadata-only plugin package; provider loading is not enabled";
export const BUNDLE_BRIDGE_PLUGIN_EXECUTION_REASON = "plugin package activates pre-registered internal runtime bundles";

const TOP_LEVEL_FIELDS = new Set([
  "id",
  "version",
  "displayName",
  "description",
  "kind",
  "contributes",
  "dependsOnPlugins",
  "dependsOnCapabilities",
  "permissions",
  "compatibleRuntimeProfiles",
  "compatibleShells",
  "requiresRuntimeVersion",
  "updateChannel",
  "runtime",
  "activatesBundles",
  "provenance",
  "author",
  "homepage",
  "license"
]);

const CONTRIBUTES_FIELDS = new Set([
  "capabilities",
  "routes",
  "surfaces",
  "providers",
  "styles",
  "themes",
  "widgets",
  "renderers",
  "authoringTools"
]);

const PROVENANCE_FIELDS = new Set([
  "source",
  "origin",
  "channel",
  "trust",
  "reviewed",
  "reviewedAt",
  "signature"
]);

const SIGNATURE_FIELDS = new Set([
  "status",
  "keyId"
]);

const RUNTIME_FIELDS = new Set([
  "entry"
]);

const KNOWN_TRUST_STATES = new Set(["local", "authored-here", "imported", "unsigned", "reviewed"]);
const KNOWN_SIGNATURE_STATUSES = new Set(["none", "unsigned", "signed", "verified"]);

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * @typedef {Object} PluginManifest
 * @property {string} id
 * @property {string} version
 * @property {string} displayName
 * @property {string} description
 * @property {"plugin"} kind
 * @property {{
 *   capabilities: Array<string|{id:string,[key:string]:any}>,
 *   routes: Array<{handler:string,path?:string,pattern?:string,[key:string]:any}>,
 *   surfaces: Array<{id:string,title:string,[key:string]:any}>,
 *   providers: Array<{id:string,kind:string,[key:string]:any}>,
 *   styles: Array<{id:string,[key:string]:any}>,
 *   themes: Array<{id:string,[key:string]:any}>,
 *   widgets: Array<{id:string,[key:string]:any}>,
 *   renderers: Array<{id:string,[key:string]:any}>,
 *   authoringTools: Array<{id:string,[key:string]:any}>
 * }} contributes
 * @property {string[]=} dependsOnPlugins
 * @property {string[]=} dependsOnCapabilities
 * @property {string[]=} permissions
 * @property {string[]=} compatibleRuntimeProfiles
 * @property {string[]=} compatibleShells
 * @property {string|null=} requiresRuntimeVersion
 * @property {string|null=} updateChannel
 * @property {{entry:string}|null=} runtime
 * @property {string[]=} activatesBundles
 * @property {Record<string, any>|null=} provenance
 * @property {string|null=} author
 * @property {string|null=} homepage
 * @property {string|null=} license
 */

/**
 * @typedef {Object} PluginValidationResult
 * @property {boolean} ok
 * @property {string[]} errors
 */

/**
 * @typedef {Object} PluginCompatibilityResult
 * @property {string} activeProfile
 * @property {boolean} compatible
 * @property {string[]} reasons
 */

function stringList(value, label, errors, { allowEmpty = true } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  const rows = [];
  for (const entry of value) {
    if (typeof entry !== "string" || (!allowEmpty && !entry.trim())) {
      errors.push(`${label} entries must be non-empty strings`);
      continue;
    }
    if (entry.trim()) rows.push(entry.trim());
  }
  return [...new Set(rows)];
}

function nullableString(value, label, errors) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} must be a non-empty string when provided`);
    return null;
  }
  return value.trim();
}

function normalizeCapabilityEntries(value, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push("contributes.capabilities must be an array");
    return [];
  }
  const rows = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      rows.push({ id: entry.trim() });
      continue;
    }
    if (entry && typeof entry === "object" && typeof entry.id === "string" && entry.id.trim()) {
      rows.push({ ...entry, id: entry.id.trim() });
      continue;
    }
    errors.push("contributes.capabilities entries must be strings or objects with id");
  }
  return rows;
}

function normalizeRouteEntries(value, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push("contributes.routes must be an array");
    return [];
  }
  const rows = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      errors.push("contributes.routes entries must be objects");
      continue;
    }
    const handler = typeof entry.handler === "string" && entry.handler.trim() ? entry.handler.trim() : null;
    const pathValue = typeof entry.path === "string" && entry.path.trim() ? entry.path.trim() : null;
    const pattern = typeof entry.pattern === "string" && entry.pattern.trim() ? entry.pattern.trim() : null;
    if (!handler || (!pathValue && !pattern)) {
      errors.push("contributes.routes entries must include handler and path or pattern");
      continue;
    }
    rows.push({
      ...entry,
      handler,
      ...(pathValue ? { path: pathValue } : {}),
      ...(pattern ? { pattern } : {})
    });
  }
  return rows;
}

function normalizeSurfaceEntries(value, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push("contributes.surfaces must be an array");
    return [];
  }
  const rows = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      errors.push("contributes.surfaces entries must be objects");
      continue;
    }
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    const title = typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : null;
    if (!id || !title) {
      errors.push("contributes.surfaces entries must include id and title");
      continue;
    }
    rows.push({ ...entry, id, title });
  }
  return rows;
}

function normalizeProviderEntries(value, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push("contributes.providers must be an array");
    return [];
  }
  const rows = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      errors.push("contributes.providers entries must be objects");
      continue;
    }
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    const kind = typeof entry.kind === "string" && entry.kind.trim() ? entry.kind.trim() : null;
    if (!id || !kind) {
      errors.push("contributes.providers entries must include id and kind");
      continue;
    }
    rows.push({ ...entry, id, kind });
  }
  return rows;
}

function normalizeTypedContributionEntries(value, label, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  const rows = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${label} entries must be objects`);
      continue;
    }
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    if (!id) {
      errors.push(`${label} entries must include id`);
      continue;
    }
    rows.push({ ...entry, id });
  }
  return rows;
}

function normalizeProvenance(value, errors) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("provenance must be an object when provided");
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!PROVENANCE_FIELDS.has(key)) errors.push(`unknown provenance field: ${key}`);
  }
  const source = nullableString(value.source, "provenance.source", errors);
  const origin = nullableString(value.origin, "provenance.origin", errors);
  const channel = nullableString(value.channel, "provenance.channel", errors);
  const trust = value.trust == null ? null : nullableString(value.trust, "provenance.trust", errors);
  if (trust && !KNOWN_TRUST_STATES.has(trust)) errors.push(`unknown provenance.trust: ${trust}`);
  let reviewed = null;
  if (value.reviewed != null) {
    if (typeof value.reviewed !== "boolean") errors.push("provenance.reviewed must be a boolean when provided");
    else reviewed = value.reviewed;
  }
  const reviewedAt = nullableString(value.reviewedAt, "provenance.reviewedAt", errors);
  let signature = null;
  if (value.signature != null) {
    if (!value.signature || typeof value.signature !== "object" || Array.isArray(value.signature)) {
      errors.push("provenance.signature must be an object when provided");
    } else {
      for (const key of Object.keys(value.signature)) {
        if (!SIGNATURE_FIELDS.has(key)) errors.push(`unknown provenance.signature field: ${key}`);
      }
      const status = value.signature.status == null
        ? "none"
        : nullableString(value.signature.status, "provenance.signature.status", errors);
      if (status && !KNOWN_SIGNATURE_STATUSES.has(status)) {
        errors.push(`unknown provenance.signature.status: ${status}`);
      }
      const keyId = nullableString(value.signature.keyId, "provenance.signature.keyId", errors);
      signature = status ? { status, keyId } : null;
    }
  }
  return {
    source,
    origin,
    channel,
    trust,
    reviewed,
    reviewedAt,
    signature
  };
}

function normalizeRuntime(value, errors) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("runtime must be an object when provided");
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!RUNTIME_FIELDS.has(key)) errors.push(`unknown runtime field: ${key}`);
  }
  const entry = nullableString(value.entry, "runtime.entry", errors);
  if (!entry) return null;
  return { entry };
}

function summarizePluginTrust(manifest, validation) {
  const provenance = manifest?.provenance ?? null;
  const signatureStatus = provenance?.signature?.status ?? "none";
  let state = provenance?.trust ?? null;
  if (!state) {
    if (provenance?.reviewed === true || provenance?.reviewedAt) state = "reviewed";
    else if (provenance?.source === "authored-here") state = "authored-here";
    else if (provenance?.source === "imported") state = "imported";
    else if (provenance) state = "local";
    else state = "unsigned";
  }
  const warnings = [];
  if (validation?.ok && state === "reviewed" && !(provenance?.reviewed === true || provenance?.reviewedAt)) {
    warnings.push("reviewed trust state is not backed by reviewed metadata");
  }
  return {
    state,
    source: provenance?.source ?? null,
    origin: provenance?.origin ?? null,
    channel: provenance?.channel ?? null,
    reviewed: provenance?.reviewed === true,
    reviewedAt: provenance?.reviewedAt ?? null,
    signatureStatus,
    warnings
  };
}

function resolvePluginRuntimeEntry(discoveryPath, runtime, errors) {
  if (!runtime?.entry) return null;
  const manifestDir = path.dirname(discoveryPath);
  const entry = String(runtime.entry || "").trim();
  if (path.isAbsolute(entry)) {
    errors.push("runtime.entry must not be absolute");
    return null;
  }
  if (!entry.startsWith("./") && !entry.startsWith("../")) {
    errors.push("runtime.entry must be a relative path");
    return null;
  }
  const ext = path.extname(entry).toLowerCase();
  if (ext !== ".js" && ext !== ".mjs") {
    errors.push("runtime.entry must reference a .js or .mjs file");
    return null;
  }
  const resolvedPath = path.resolve(manifestDir, entry);
  const relative = path.relative(manifestDir, resolvedPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    errors.push("runtime.entry must stay inside the plugin directory");
    return null;
  }
  return {
    entry,
    resolvedPath
  };
}

function normalizeManifestObject(raw, discoveryPath) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      manifest: null,
      errors: [`plugin manifest must be an object: ${discoveryPath}`]
    };
  }
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_FIELDS.has(key)) errors.push(`unknown top-level field: ${key}`);
  }
  const contributesRaw = raw.contributes;
  if (!contributesRaw || typeof contributesRaw !== "object" || Array.isArray(contributesRaw)) {
    errors.push("contributes must be an object");
  }
  for (const key of Object.keys(contributesRaw || {})) {
    if (!CONTRIBUTES_FIELDS.has(key)) errors.push(`unknown contributes field: ${key}`);
  }
  const id = nullableString(raw.id, "id", errors);
  const version = nullableString(raw.version, "version", errors);
  if (version && !SEMVER_RE.test(version)) errors.push("version must look like semver (for example 1.2.3)");
  const displayName = nullableString(raw.displayName, "displayName", errors);
  const description = nullableString(raw.description, "description", errors);
  const kind = nullableString(raw.kind, "kind", errors);
  if (kind && kind !== "plugin") errors.push('kind must equal "plugin"');
  const dependsOnPlugins = stringList(raw.dependsOnPlugins, "dependsOnPlugins", errors);
  const dependsOnCapabilities = stringList(raw.dependsOnCapabilities, "dependsOnCapabilities", errors);
  const permissions = stringList(raw.permissions, "permissions", errors);
  const compatibleRuntimeProfiles = stringList(raw.compatibleRuntimeProfiles, "compatibleRuntimeProfiles", errors);
  const compatibleShells = stringList(raw.compatibleShells, "compatibleShells", errors);
  const knownShellIds = availableRuntimeShellIds();
  const unknownShells = compatibleShells.filter(shellId => !knownShellIds.includes(shellId));
  if (unknownShells.length) errors.push(`unknown runtime shells: ${unknownShells.join(", ")}`);
  const requiresRuntimeVersion = nullableString(raw.requiresRuntimeVersion, "requiresRuntimeVersion", errors);
  const updateChannel = nullableString(raw.updateChannel, "updateChannel", errors);
  const runtime = normalizeRuntime(raw.runtime, errors);
  const activatesBundles = stringList(raw.activatesBundles, "activatesBundles", errors);
  const author = nullableString(raw.author, "author", errors);
  const homepage = nullableString(raw.homepage, "homepage", errors);
  const license = nullableString(raw.license, "license", errors);
  const provenance = normalizeProvenance(raw.provenance, errors);
  const contributes = {
    capabilities: normalizeCapabilityEntries(contributesRaw?.capabilities, errors),
    routes: normalizeRouteEntries(contributesRaw?.routes, errors),
    surfaces: normalizeSurfaceEntries(contributesRaw?.surfaces, errors),
    providers: normalizeProviderEntries(contributesRaw?.providers, errors),
    styles: normalizeTypedContributionEntries(contributesRaw?.styles, "contributes.styles", errors),
    themes: normalizeTypedContributionEntries(contributesRaw?.themes, "contributes.themes", errors),
    widgets: normalizeTypedContributionEntries(contributesRaw?.widgets, "contributes.widgets", errors),
    renderers: normalizeTypedContributionEntries(contributesRaw?.renderers, "contributes.renderers", errors),
    authoringTools: normalizeTypedContributionEntries(contributesRaw?.authoringTools, "contributes.authoringTools", errors)
  };
  return {
    manifest: id && version && displayName && description && kind === "plugin"
      ? {
          id,
          version,
          displayName,
          description,
          kind: "plugin",
          contributes,
          dependsOnPlugins,
          dependsOnCapabilities,
          permissions,
          compatibleRuntimeProfiles,
          compatibleShells,
          requiresRuntimeVersion,
          updateChannel,
          runtime,
          activatesBundles,
          provenance,
          author,
          homepage,
          license
        }
      : null,
    errors
  };
}

export function resolveRuntimePluginRoot({
  env = process.env,
  cwd = process.cwd()
} = {}) {
  const configured = typeof env?.RUNTIME_PLUGIN_ROOT === "string" ? env.RUNTIME_PLUGIN_ROOT.trim() : "";
  return configured
    ? path.resolve(configured)
    : path.resolve(cwd, DEFAULT_RUNTIME_PLUGIN_DIRECTORY);
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map(value => String(value || "").trim()).filter(Boolean))];
}

function addRequestSource(byId, pluginId, source) {
  const current = byId.get(pluginId) ?? [];
  if (!current.includes(source)) current.push(source);
  byId.set(pluginId, current);
}

function expandPluginRequest({
  pluginId,
  source,
  packageById,
  requestedSourcesById,
  errors,
  stack = []
}) {
  if (!pluginId) return;
  if (stack.includes(pluginId)) {
    const cycle = [...stack.slice(stack.indexOf(pluginId)), pluginId];
    errors.push({
      id: pluginId,
      reason: `cyclic plugin dependencies: ${cycle.join(" -> ")}`
    });
    addRequestSource(requestedSourcesById, pluginId, source);
    return;
  }
  addRequestSource(requestedSourcesById, pluginId, source);
  const pluginPackage = packageById.get(pluginId);
  if (!pluginPackage) return;
  for (const dependencyId of pluginPackage.manifest?.dependsOnPlugins ?? []) {
    expandPluginRequest({
      pluginId: dependencyId,
      source,
      packageById,
      requestedSourcesById,
      errors,
      stack: [...stack, pluginId]
    });
  }
}

function expandedRequestSourceMap({
  profilePluginIds = [],
  authoredPluginIds = [],
  configuredPluginIds = [],
  packageById = new Map()
} = {}) {
  const byId = new Map();
  const errors = [];
  for (const pluginId of uniqueStrings(profilePluginIds)) {
    expandPluginRequest({ pluginId, source: "profile", packageById, requestedSourcesById: byId, errors });
  }
  for (const pluginId of uniqueStrings(authoredPluginIds)) {
    expandPluginRequest({ pluginId, source: "authored", packageById, requestedSourcesById: byId, errors });
  }
  for (const pluginId of uniqueStrings(configuredPluginIds)) {
    expandPluginRequest({ pluginId, source: "operator", packageById, requestedSourcesById: byId, errors });
  }
  return { byId, errors };
}

export function resolvePluginDependencyClosure({
  pluginId,
  packageById,
  includeRoot = false
} = {}) {
  const ordered = [];
  const errors = [];
  const visited = new Set();
  function visit(id, stack = []) {
    if (!id) return;
    if (stack.includes(id)) {
      const cycle = [...stack.slice(stack.indexOf(id)), id];
      errors.push(`cyclic plugin dependencies: ${cycle.join(" -> ")}`);
      return;
    }
    if (visited.has(id)) return;
    const pluginPackage = packageById.get(id);
    if (!pluginPackage) {
      errors.push(`plugin dependency not found: ${id}`);
      return;
    }
    visited.add(id);
    for (const dependencyId of pluginPackage.manifest?.dependsOnPlugins ?? []) {
      visit(dependencyId, [...stack, id]);
    }
    if (includeRoot || id !== pluginId) ordered.push(id);
  }
  visit(pluginId, []);
  return {
    ok: errors.length === 0,
    pluginIds: ordered,
    errors
  };
}

function summarizeBundle(bundleId) {
  const bundle = runtimeBundleManifest(bundleId);
  if (!bundle) return null;
  return {
    id: bundle.id,
    kind: bundle.kind,
    displayName: bundle.displayName,
    description: bundle.description
  };
}

function summarizeRoute(route) {
  return {
    method: route.method,
    matcher: route.kind === "exact" ? route.path : String(route.pattern),
    handler: route.handler
  };
}

function cloneHandlerMetadataEntry(entry = {}) {
  return {
    ...(entry || {}),
    methods: Array.isArray(entry?.methods) ? [...entry.methods] : undefined,
    ownerChain: cloneRuntimeOwnerChain(entry?.ownerChain)
  };
}

function collectHandlerMetadata(bundleIds) {
  const metadata = Object.create(null);
  for (const bundleId of bundleIds) {
    const bundle = runtimeBundleManifest(bundleId);
    if (!bundle) continue;
    for (const provider of bundle.contributes.providers ?? []) {
      if (provider?.kind !== "handlerCatalog") continue;
      for (const [handlerId, entry] of Object.entries(provider.handlerMetadata ?? {})) {
        metadata[String(handlerId)] = cloneHandlerMetadataEntry(entry);
      }
    }
  }
  return metadata;
}

function enrichRouteSummary(route, handlerMetadata = {}) {
  const summary = summarizeRoute(route);
  const metadata = handlerMetadata?.[summary.handler] ?? null;
  return metadata
    ? {
        ...summary,
        ...extractRuntimeOwnershipFields(metadata),
        handlerMetadata: cloneHandlerMetadataEntry(metadata)
      }
    : summary;
}

function summarizeManifestRouteEntry(entry, handlerMetadata = {}) {
  const summary = enrichRouteSummary({
    method: typeof entry?.method === "string" && entry.method.trim() ? entry.method.trim().toUpperCase() : "GET",
    kind: typeof entry?.path === "string" && entry.path ? "exact" : "pattern",
    path: entry?.path,
    pattern: entry?.pattern,
    handler: entry?.handler
  }, handlerMetadata);
  return {
    ...entry,
    ...summary
  };
}

function summarizeSurface(surface) {
  return {
    id: surface.id,
    href: surface.href ?? null,
    action: surface.action ? { ...surface.action } : null,
    tier: surface.tier ?? "internal",
    contexts: [...(surface.contexts ?? [])]
  };
}

function summarizeRuntimeContributions(bundleIds) {
  const capabilities = new Set();
  const handlerMetadata = collectHandlerMetadata(bundleIds);
  const routes = new Map();
  const surfaces = new Map();
  const handlerSets = new Set();
  for (const bundleId of bundleIds) {
    const bundle = runtimeBundleManifest(bundleId);
    if (!bundle) continue;
    for (const capabilityId of bundle.contributes.capabilities ?? []) capabilities.add(String(capabilityId));
    for (const route of bundle.contributes.routes ?? []) {
      const summary = enrichRouteSummary(route, handlerMetadata);
      routes.set(`${summary.method}:${summary.matcher}:${summary.handler}`, summary);
    }
    for (const surface of bundle.contributes.surfaces ?? []) {
      const summary = summarizeSurface(surface);
      surfaces.set(summary.id, summary);
    }
    for (const provider of bundle.contributes.providers ?? []) {
      if (provider?.kind === "handlerSet" && provider.id) handlerSets.add(String(provider.id));
    }
  }
  return {
    capabilities: [...capabilities].sort(),
    routes: [...routes.values()],
    surfaces: [...surfaces.values()],
    handlerSets: [...handlerSets].sort(),
    handlerMetadata
  };
}

function cloneContributionRoute(route) {
  return {
    method: route.method,
    matcher: route.matcher,
    handler: route.handler,
    ...extractRuntimeOwnershipFields(route),
    handlerMetadata: route.handlerMetadata ? cloneHandlerMetadataEntry(route.handlerMetadata) : undefined
  };
}

function cloneContributionSurface(surface) {
  return {
    id: surface.id,
    href: surface.href ?? null,
    action: surface.action ? { ...surface.action } : null,
    tier: surface.tier ?? "internal",
    contexts: [...(surface.contexts ?? [])]
  };
}

function compareRouteSummary(left, right) {
  return String(left.method || "").localeCompare(String(right.method || ""))
    || String(left.matcher || "").localeCompare(String(right.matcher || ""))
    || String(left.handler || "").localeCompare(String(right.handler || ""));
}

function compareSurfaceSummary(left, right) {
  return String(left.id || "").localeCompare(String(right.id || ""))
    || String(left.href || "").localeCompare(String(right.href || ""));
}

function routeSummaryKey(route) {
  return `${route.method}:${route.matcher}:${route.handler}`;
}

function surfaceSummaryKey(surface) {
  return String(surface.id || "");
}

function compositionSnapshot(profileName, additionalBundleIds = []) {
  const summary = runtimeBundleSummaryForProfile(profileName, { additionalBundleIds });
  return {
    profile: summary.profile,
    bundleIds: [...summary.bundleIds].sort(),
    capabilityIds: [...summary.capabilities].sort(),
    routes: summary.routes.map(cloneContributionRoute).sort(compareRouteSummary),
    surfaces: summary.surfaces.map(cloneContributionSurface).sort(compareSurfaceSummary),
    handlerMetadata: Object.fromEntries(
      Object.entries(summary.handlerMetadata ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([handlerId, entry]) => [handlerId, cloneHandlerMetadataEntry(entry)])
    )
  };
}

function diffStringValues(before = [], after = []) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter(value => !beforeSet.has(value)),
    removed: before.filter(value => !afterSet.has(value))
  };
}

function diffObjectValues(before = [], after = [], keyOf, cloneValue) {
  const beforeMap = new Map(before.map(value => [keyOf(value), cloneValue(value)]));
  const afterMap = new Map(after.map(value => [keyOf(value), cloneValue(value)]));
  return {
    added: [...afterMap.entries()]
      .filter(([key]) => !beforeMap.has(key))
      .map(([, value]) => value),
    removed: [...beforeMap.entries()]
      .filter(([key]) => !afterMap.has(key))
      .map(([, value]) => value)
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffMetadataValues(before = {}, after = {}) {
  const beforeEntries = Object.entries(before ?? {});
  const afterEntries = Object.entries(after ?? {});
  const beforeMap = new Map(beforeEntries.map(([handlerId, entry]) => [handlerId, cloneHandlerMetadataEntry(entry)]));
  const afterMap = new Map(afterEntries.map(([handlerId, entry]) => [handlerId, cloneHandlerMetadataEntry(entry)]));
  return {
    added: [...afterMap.entries()]
      .filter(([handlerId]) => !beforeMap.has(handlerId))
      .map(([handlerId, entry]) => ({ handler: handlerId, metadata: entry }))
      .sort((left, right) => left.handler.localeCompare(right.handler)),
    removed: [...beforeMap.entries()]
      .filter(([handlerId]) => !afterMap.has(handlerId))
      .map(([handlerId, entry]) => ({ handler: handlerId, metadata: entry }))
      .sort((left, right) => left.handler.localeCompare(right.handler)),
    changed: [...afterMap.entries()]
      .filter(([handlerId, entry]) => beforeMap.has(handlerId) && !sameJson(beforeMap.get(handlerId), entry))
      .map(([handlerId, entry]) => ({
        handler: handlerId,
        before: beforeMap.get(handlerId),
        after: entry
      }))
      .sort((left, right) => left.handler.localeCompare(right.handler))
  };
}

function compositionDelta(beforeSnapshot, afterSnapshot) {
  const bundles = diffStringValues(beforeSnapshot.bundleIds, afterSnapshot.bundleIds);
  const capabilities = diffStringValues(beforeSnapshot.capabilityIds, afterSnapshot.capabilityIds);
  const routes = diffObjectValues(beforeSnapshot.routes, afterSnapshot.routes, routeSummaryKey, cloneContributionRoute);
  const surfaces = diffObjectValues(beforeSnapshot.surfaces, afterSnapshot.surfaces, surfaceSummaryKey, cloneContributionSurface);
  const handlerMetadata = diffMetadataValues(beforeSnapshot.handlerMetadata, afterSnapshot.handlerMetadata);
  return {
    addedBundleIds: bundles.added,
    removedBundleIds: bundles.removed,
    addedCapabilityIds: capabilities.added,
    removedCapabilityIds: capabilities.removed,
    addedRoutes: routes.added.sort(compareRouteSummary),
    removedRoutes: routes.removed.sort(compareRouteSummary),
    addedSurfaces: surfaces.added.sort(compareSurfaceSummary),
    removedSurfaces: surfaces.removed.sort(compareSurfaceSummary),
    addedHandlerMetadata: handlerMetadata.added,
    removedHandlerMetadata: handlerMetadata.removed,
    changedHandlerMetadata: handlerMetadata.changed,
    effectiveNoOp: bundles.added.length === 0
      && bundles.removed.length === 0
      && capabilities.added.length === 0
      && capabilities.removed.length === 0
      && routes.added.length === 0
      && routes.removed.length === 0
      && surfaces.added.length === 0
      && surfaces.removed.length === 0
      && handlerMetadata.added.length === 0
      && handlerMetadata.removed.length === 0
      && handlerMetadata.changed.length === 0
  };
}

function buildPluginPackageRow({
  directoryName,
  discoveryPath,
  manifest,
  validationErrors,
  activeProfile,
  availableProfileIds,
  validPluginIds
}) {
  const errors = [...validationErrors];
  const availableBundleIds = availableRuntimeBundleIds();
  const runtimeEntry = resolvePluginRuntimeEntry(discoveryPath, manifest?.runtime ?? null, errors);
  if (manifest) {
    const unknownProfiles = manifest.compatibleRuntimeProfiles.filter(profile => !availableProfileIds.includes(profile));
    if (unknownProfiles.length) {
      errors.push(`unknown runtime profiles: ${unknownProfiles.join(", ")}`);
    }
    const missingPluginDeps = manifest.dependsOnPlugins.filter(id => !validPluginIds.has(id));
    if (missingPluginDeps.length) {
      errors.push(`missing plugin dependencies: ${missingPluginDeps.join(", ")}`);
    }
    if (!runtimeEntry) {
      const unknownBundles = manifest.activatesBundles.filter(bundleId => !availableBundleIds.includes(bundleId));
      if (unknownBundles.length) {
        errors.push(`unknown runtime bundles: ${unknownBundles.join(", ")}`);
      }
    }
  }
  if (runtimeEntry && !existsSync(runtimeEntry.resolvedPath)) {
    errors.push(`runtime.entry not found: ${manifest?.runtime?.entry ?? runtimeEntry.entry}`);
  }
  const validation = { ok: errors.length === 0, errors };
  const compatible = Boolean(
    validation.ok
    && manifest
    && (!manifest.compatibleRuntimeProfiles.length || manifest.compatibleRuntimeProfiles.includes(activeProfile))
  );
  const compatibilityReasons = [];
  if (!validation.ok) compatibilityReasons.push("invalid-manifest");
  if (manifest && manifest.compatibleRuntimeProfiles.length && !manifest.compatibleRuntimeProfiles.includes(activeProfile)) {
    compatibilityReasons.push("runtime-profile-incompatible");
  }
  const installabilityReasons = [];
  if (!validation.ok) installabilityReasons.push("invalid-manifest");
  if (manifest && manifest.compatibleRuntimeProfiles.length && !manifest.compatibleRuntimeProfiles.includes(activeProfile)) {
    installabilityReasons.push("runtime-profile-incompatible");
  }
  const installableInPrinciple = installabilityReasons.length === 0;
  const activatesBundles = Boolean(manifest?.activatesBundles.length);
  const pluginOwnedRuntime = Boolean(runtimeEntry);
  const metaPackage = Boolean(manifest && !activatesBundles && !manifest.runtime && manifest.dependsOnPlugins.length > 0);
  const executable = Boolean(pluginOwnedRuntime || activatesBundles || metaPackage);
  const executionMode = pluginOwnedRuntime
    ? "plugin-owned"
    : activatesBundles
      ? "bundle-bridge"
    : metaPackage
      ? "meta-package"
      : "metadata-only";
  const resolvedBundleIds = [...(manifest?.activatesBundles ?? [])];
  const resolvedBundles = resolvedBundleIds
    .map(bundleId => summarizeBundle(bundleId) ?? {
      id: bundleId,
      kind: "plugin",
      displayName: bundleId,
      description: "Plugin-owned runtime bundle."
    })
    .filter(Boolean);
  const resolvedRuntimeContributions = summarizeRuntimeContributions(resolvedBundleIds);
  const trust = summarizePluginTrust(manifest, validation);
  const safeManifest = manifest
    ? {
        ...manifest,
        dependsOnPlugins: [...manifest.dependsOnPlugins],
        dependsOnCapabilities: [...manifest.dependsOnCapabilities],
        permissions: [...manifest.permissions],
        compatibleRuntimeProfiles: [...manifest.compatibleRuntimeProfiles],
        compatibleShells: [...manifest.compatibleShells],
        requiresRuntimeVersion: manifest.requiresRuntimeVersion,
        updateChannel: manifest.updateChannel,
        runtime: manifest.runtime ? {
          ...manifest.runtime,
          resolvedEntryPath: runtimeEntry?.resolvedPath ?? null
        } : null,
        activatesBundles: [...manifest.activatesBundles],
        contributes: {
          capabilities: manifest.contributes.capabilities.map(entry => ({ ...entry })),
          routes: manifest.contributes.routes.map(entry => ({ ...entry })),
          surfaces: manifest.contributes.surfaces.map(entry => ({ ...entry })),
          providers: manifest.contributes.providers.map(entry => ({ ...entry })),
          styles: manifest.contributes.styles.map(entry => ({ ...entry })),
          themes: manifest.contributes.themes.map(entry => ({ ...entry })),
          widgets: manifest.contributes.widgets.map(entry => ({ ...entry })),
          renderers: manifest.contributes.renderers.map(entry => ({ ...entry })),
          authoringTools: manifest.contributes.authoringTools.map(entry => ({ ...entry }))
        },
        provenance: manifest.provenance ? { ...manifest.provenance } : null
      }
    : null;
  return {
    id: manifest?.id ?? directoryName,
    discoveryPath,
    manifest: safeManifest,
    validation,
    compatibility: {
      activeProfile,
      compatible,
      reasons: compatibilityReasons
    },
    installability: {
      installableInPrinciple,
      reasons: installabilityReasons
    },
    execution: {
      executable,
      mode: executionMode,
      reason: executionMode === "plugin-owned"
        ? "plugin package provides a local runtime module through the plugin runtime ABI"
        : executionMode === "bundle-bridge"
          ? BUNDLE_BRIDGE_PLUGIN_EXECUTION_REASON
          : executionMode === "meta-package"
            ? "plugin package installs executable plugin dependencies and contributes no runtime module directly"
          : DEFAULT_PLUGIN_EXECUTION_REASON
    },
    runtimeModule: {
      entry: manifest?.runtime?.entry ?? null,
      resolvedPath: runtimeEntry?.resolvedPath ?? null,
      loadStatus: executionMode === "plugin-owned" ? "not-loaded" : "not-applicable",
      bundleId: null,
      errors: []
    },
    trust,
    activation: {
      requested: false,
      eligible: Boolean(executable && validation.ok && compatible),
      active: false,
      reasons: []
    },
    resolvedBundles,
    resolvedRuntimeContributions,
    declaredCapabilityIds: (manifest?.contributes.capabilities ?? []).map(entry => entry.id),
    metadata: manifest ? {
      version: manifest.version,
      displayName: manifest.displayName,
      description: manifest.description,
      kind: manifest.kind,
      dependsOnPlugins: [...manifest.dependsOnPlugins],
      dependsOnCapabilities: [...manifest.dependsOnCapabilities],
      permissions: [...manifest.permissions],
      compatibleRuntimeProfiles: [...manifest.compatibleRuntimeProfiles],
      compatibleShells: [...manifest.compatibleShells],
      requiresRuntimeVersion: manifest.requiresRuntimeVersion,
      updateChannel: manifest.updateChannel,
      runtime: manifest.runtime ? {
        ...manifest.runtime,
        resolvedEntryPath: runtimeEntry?.resolvedPath ?? null
      } : null,
      activatesBundles: [...manifest.activatesBundles],
      provenance: manifest.provenance ? { ...manifest.provenance } : null,
      author: manifest.author,
      homepage: manifest.homepage,
      license: manifest.license,
      contributes: {
        capabilities: manifest.contributes.capabilities.map(entry => ({ ...entry })),
        routes: manifest.contributes.routes.map(entry => ({ ...entry })),
        surfaces: manifest.contributes.surfaces.map(entry => ({ ...entry })),
        providers: manifest.contributes.providers.map(entry => ({ ...entry })),
        styles: manifest.contributes.styles.map(entry => ({ ...entry })),
        themes: manifest.contributes.themes.map(entry => ({ ...entry })),
        widgets: manifest.contributes.widgets.map(entry => ({ ...entry })),
        renderers: manifest.contributes.renderers.map(entry => ({ ...entry })),
        authoringTools: manifest.contributes.authoringTools.map(entry => ({ ...entry }))
      }
    } : null
  };
}

export function resolveConfiguredRuntimePluginIds({
  env = process.env,
  runtimePluginIds = null
} = {}) {
  if (Array.isArray(runtimePluginIds)) return uniqueStrings(runtimePluginIds);
  const configured = typeof env?.RUNTIME_PLUGINS === "string" ? env.RUNTIME_PLUGINS : "";
  return uniqueStrings(configured.split(","));
}

function activationFailureReasons(pluginPackage, {
  missingRequestedDependencies = []
} = {}) {
  const reasons = [];
  if (!pluginPackage.execution?.executable) reasons.push("plugin package is metadata-only");
  if (!pluginPackage.validation?.ok) reasons.push(...(pluginPackage.validation.errors ?? []));
  if (pluginPackage.validation?.ok && pluginPackage.compatibility?.reasons?.includes("runtime-profile-incompatible")) {
    reasons.push("runtime profile incompatible");
  }
  if (missingRequestedDependencies.length) {
    reasons.push(`missing requested plugin dependencies: ${missingRequestedDependencies.join(", ")}`);
  }
  return uniqueStrings(reasons);
}

export function resolveRuntimePluginSelection({
  profileName = DEFAULT_RUNTIME_PROFILE,
  configuredPluginIds = [],
  authoredPluginIds = [],
  discoveredPlugins = []
} = {}) {
  const operatorPluginIds = uniqueStrings(configuredPluginIds);
  const authored = uniqueStrings(authoredPluginIds);
  const profilePluginIds = runtimeProfilePluginIds(profileName);
  const packageById = new Map(discoveredPlugins.map(pluginPackage => [pluginPackage.id, pluginPackage]));
  const expandedRequests = expandedRequestSourceMap({
    profilePluginIds,
    authoredPluginIds: authored,
    configuredPluginIds: operatorPluginIds,
    packageById
  });
  const requestedSourcesById = expandedRequests.byId;
  const effectivePluginIds = [...requestedSourcesById.keys()];
  const effectiveSet = new Set(effectivePluginIds);
  const expansionErrorsById = new Map();
  for (const error of expandedRequests.errors) {
    const current = expansionErrorsById.get(error.id) ?? [];
    current.push(error.reason);
    expansionErrorsById.set(error.id, current);
  }
  const baseComposition = resolveRuntimeComposition({ profileName });
  const baseBundleSet = new Set(baseComposition.bundleIds);
  const activePluginIds = [];
  const rejectedPlugins = [];
  const activeBundleIds = [];
  const activeBundleSet = new Set();
  const packages = discoveredPlugins.map(pluginPackage => {
    const requestedSources = [...(requestedSourcesById.get(pluginPackage.id) ?? [])];
    const requested = requestedSources.length > 0;
    const missingRequestedDependencies = requested
      ? (pluginPackage.manifest?.dependsOnPlugins ?? []).filter(pluginId => !effectiveSet.has(pluginId))
      : [];
    const dependencyExpansionReasons = expansionErrorsById.get(pluginPackage.id) ?? [];
    const eligible = pluginPackage.activation.eligible && missingRequestedDependencies.length === 0 && dependencyExpansionReasons.length === 0;
    const active = requested && eligible;
    const reasons = requested && !active
      ? uniqueStrings([
          ...activationFailureReasons(pluginPackage, { missingRequestedDependencies }),
          ...dependencyExpansionReasons
        ])
      : [];
    if (active) {
      activePluginIds.push(pluginPackage.id);
      for (const bundleId of pluginPackage.manifest?.activatesBundles ?? []) {
        if (activeBundleSet.has(bundleId)) continue;
        activeBundleSet.add(bundleId);
        activeBundleIds.push(bundleId);
      }
    } else if (requested) {
      rejectedPlugins.push({ id: pluginPackage.id, reasons, requestedSources });
    }
    return {
      ...pluginPackage,
      activation: {
        requested,
        requestedSources,
        eligible,
        active,
        reasons
      }
    };
  });
  for (const pluginId of effectivePluginIds) {
    if (packageById.has(pluginId)) continue;
    rejectedPlugins.push({
      id: pluginId,
      reasons: ["plugin package not found"],
      requestedSources: [...(requestedSourcesById.get(pluginId) ?? [])]
    });
  }
  return {
    profileName,
    profilePluginIds,
    configuredPluginIds: operatorPluginIds,
    authoredPluginIds: authored,
    operatorPluginIds,
    effectivePluginIds,
    activePluginIds,
    rejectedPlugins,
    activeBundleIds,
    addedBundleIds: activeBundleIds.filter(bundleId => !baseBundleSet.has(bundleId)),
    packages,
    hasBlockingErrors: rejectedPlugins.length > 0
  };
}

export async function discoverRuntimePluginPackages({
  pluginRoot,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  availableProfileIds = availableRuntimeProfiles(),
  fsModule = fs
} = {}) {
  const rootPath = path.resolve(String(pluginRoot || resolveRuntimePluginRoot()));
  let entries = [];
  try {
    entries = await fsModule.readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return {
        pluginRoot: rootPath,
        activeProfile: runtimeProfile,
        availableProfiles: [...availableProfileIds],
        packages: [],
        validPackages: [],
        invalidPackages: [],
        ignoredEntries: [],
        summary: {
          pluginRoot: rootPath,
          activeProfile: runtimeProfile,
          discoveredCount: 0,
          validCount: 0,
          invalidCount: 0,
          ignoredCount: 0,
          compatibleCount: 0,
          installableCount: 0,
          executableCount: 0
        }
      };
    }
    throw error;
  }
  const ignoredEntries = [];
  const rawPackages = [];
  for (const entry of entries) {
    const discoveryPath = path.join(rootPath, entry.name);
    if (!entry.isDirectory()) {
      ignoredEntries.push({ path: discoveryPath, reason: "not a directory" });
      continue;
    }
    const manifestPath = path.join(discoveryPath, "plugin.json");
    let text = null;
    try {
      text = await fsModule.readFile(manifestPath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        ignoredEntries.push({ path: discoveryPath, reason: "plugin.json not found" });
        continue;
      }
      throw error;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      rawPackages.push({
        directoryName: entry.name,
        discoveryPath: manifestPath,
        manifest: null,
        validationErrors: [`invalid JSON: ${error instanceof Error ? error.message : String(error)}`]
      });
      continue;
    }
    const normalized = normalizeManifestObject(parsed, manifestPath);
    rawPackages.push({
      directoryName: entry.name,
      discoveryPath: manifestPath,
      manifest: normalized.manifest,
      validationErrors: normalized.errors
    });
  }
  const manifestCounts = new Map();
  for (const row of rawPackages) {
    const id = row.manifest?.id;
    if (!id) continue;
    manifestCounts.set(id, (manifestCounts.get(id) ?? 0) + 1);
  }
  const validPluginIds = new Set(
    rawPackages
      .filter(row => row.manifest?.id && row.validationErrors.length === 0 && (manifestCounts.get(row.manifest.id) ?? 0) === 1)
      .map(row => row.manifest.id)
  );
  const packages = rawPackages
    .map(row => buildPluginPackageRow({
      ...row,
      validationErrors: [
        ...row.validationErrors,
        ...((row.manifest?.id && (manifestCounts.get(row.manifest.id) ?? 0) > 1)
          ? [`duplicate plugin id: ${row.manifest.id}`]
          : [])
      ],
      activeProfile: runtimeProfile,
      availableProfileIds,
      validPluginIds
    }))
    .sort((left, right) =>
      String(left.id).localeCompare(String(right.id))
      || String(left.discoveryPath).localeCompare(String(right.discoveryPath))
    );
  const validPackages = packages.filter(row => row.validation.ok);
  const invalidPackages = packages.filter(row => !row.validation.ok);
  const summary = {
    pluginRoot: rootPath,
    activeProfile: runtimeProfile,
    discoveredCount: packages.length,
    validCount: validPackages.length,
    invalidCount: invalidPackages.length,
    ignoredCount: ignoredEntries.length,
    compatibleCount: packages.filter(row => row.compatibility.compatible).length,
    installableCount: packages.filter(row => row.installability.installableInPrinciple).length,
    executableCount: packages.filter(row => row.execution.executable).length
  };
  return {
    pluginRoot: rootPath,
    activeProfile: runtimeProfile,
    availableProfiles: [...availableProfileIds],
    packages,
    validPackages,
    invalidPackages,
    ignoredEntries,
    summary
  };
}

export async function readRuntimePluginCatalog({
  pluginRoot,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  configuredPluginIds = [],
  authoredPluginIds = [],
  availableProfileIds = availableRuntimeProfiles(),
  fsModule = fs
} = {}) {
  const discovered = await discoverRuntimePluginPackages({
    pluginRoot,
    runtimeProfile,
    availableProfileIds,
    fsModule
  });
  const selection = resolveRuntimePluginSelection({
    profileName: runtimeProfile,
    configuredPluginIds,
    authoredPluginIds,
    discoveredPlugins: discovered.packages
  });
  const packages = selection.packages;
  const trustStateCounts = Object.create(null);
  for (const row of packages) {
    const state = row.trust?.state ?? "unknown";
    trustStateCounts[state] = (trustStateCounts[state] ?? 0) + 1;
  }
  return {
    ...discovered,
    packages,
    validPackages: packages.filter(row => row.validation.ok),
    invalidPackages: packages.filter(row => !row.validation.ok),
    profilePluginIds: selection.profilePluginIds,
    configuredPluginIds: selection.configuredPluginIds,
    authoredPluginIds: selection.authoredPluginIds,
    operatorPluginIds: selection.operatorPluginIds,
    effectivePluginIds: selection.effectivePluginIds,
    activePluginIds: selection.activePluginIds,
    rejectedPlugins: selection.rejectedPlugins,
    addedBundleIds: selection.addedBundleIds,
    selection,
    summary: {
      ...discovered.summary,
      requestedCount: packages.filter(row => row.activation.requested).length,
      eligibleCount: packages.filter(row => row.activation.eligible).length,
      activeCount: packages.filter(row => row.activation.active).length,
      rejectedCount: selection.rejectedPlugins.length,
      trustStateCounts
    }
  };
}

function syntheticMissingPluginPackage({
  pluginId,
  activeProfile,
  requestedSources = []
}) {
  const reasons = ["plugin package not found in local plugin root"];
  return {
    id: pluginId,
    discoveryPath: null,
    manifest: null,
    validation: { ok: false, errors: [...reasons] },
    compatibility: {
      activeProfile,
      compatible: false,
      reasons: ["plugin-package-not-found"]
    },
    installability: {
      installableInPrinciple: false,
      reasons: ["plugin-package-not-found"]
    },
    execution: {
      executable: false,
      mode: "missing-package",
      reason: "plugin package not found in local plugin root"
    },
    trust: null,
    activation: {
      requested: true,
      requestedSources: [...requestedSources],
      eligible: false,
      active: false,
      reasons: [...reasons]
    },
    resolvedBundles: [],
    resolvedRuntimeContributions: {
      capabilities: [],
      routes: [],
      surfaces: [],
      handlerSets: []
    },
    declaredCapabilityIds: [],
    metadata: null,
    missingPackage: true
  };
}

function reviewStatusBadges(row) {
  const badges = [];
  if (row.installed) badges.push("installed");
  else if (row.installable) badges.push("installable");
  else badges.push("blocked");
  if (row.missingPackage) badges.push("missing-package");
  if (!row.executable) badges.push("metadata-only");
  if (!row.compatible) badges.push("incompatible");
  if ((row.dependencyIssues ?? []).length) badges.push("missing deps");
  const preview = row.installed ? row.removePreview : row.installPreview;
  if (preview?.available && preview.delta?.effectiveNoOp) badges.push("no-op");
  return badges;
}

function buildRuntimePluginReviewRows({
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  authoredPluginIds = [],
  pluginCatalog,
  selectedPluginId = null
}) {
  const currentCatalog = pluginCatalog ?? {
    activeProfile: runtimeProfile,
    packages: [],
    selection: resolveRuntimePluginSelection({
      profileName: runtimeProfile,
      authoredPluginIds,
      configuredPluginIds: [],
      discoveredPlugins: []
    }),
    rejectedPlugins: []
  };
  const requestedAuthoredIds = uniqueStrings(authoredPluginIds);
  const currentSelection = currentCatalog.selection ?? resolveRuntimePluginSelection({
    profileName: runtimeProfile,
    authoredPluginIds: requestedAuthoredIds,
    configuredPluginIds: [],
    discoveredPlugins: currentCatalog.packages ?? []
  });
  const currentComposition = compositionSnapshot(runtimeProfile, currentSelection.activeBundleIds ?? []);
  const packageById = new Map((currentCatalog.packages ?? []).map(row => [row.id, row]));
  const missingRequestedRows = (currentSelection.rejectedPlugins ?? [])
    .filter(entry => entry.requestedSources?.includes("authored") && !packageById.has(entry.id))
    .map(entry => syntheticMissingPluginPackage({
      pluginId: entry.id,
      activeProfile: runtimeProfile,
      requestedSources: entry.requestedSources
    }));
  const reviewablePackages = [
    ...(currentCatalog.packages ?? []),
    ...missingRequestedRows
  ].sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));
  const reverseDependentsFor = pluginId => requestedAuthoredIds.filter(installedPluginId => {
    if (installedPluginId === pluginId) return false;
    return (packageById.get(installedPluginId)?.manifest?.dependsOnPlugins ?? []).includes(pluginId);
  }).sort();
  const composePreview = ({ pluginPackage, action, nextAuthoredPluginIds, warnings = [] }) => {
    const nextSelection = resolveRuntimePluginSelection({
      profileName: runtimeProfile,
      authoredPluginIds: nextAuthoredPluginIds,
      configuredPluginIds: [],
      discoveredPlugins: currentCatalog.packages ?? []
    });
    const nextComposition = compositionSnapshot(runtimeProfile, nextSelection.activeBundleIds ?? []);
    return {
      action,
      available: true,
      blockedReasons: [],
      warnings,
      nextAuthoredPluginIds: uniqueStrings(nextAuthoredPluginIds),
      nextActivePluginIds: [...(nextSelection.activePluginIds ?? [])].sort(),
      nextRejectedPlugins: (nextSelection.rejectedPlugins ?? []).map(entry => ({
        id: entry.id,
        reasons: [...(entry.reasons ?? [])],
        requestedSources: [...(entry.requestedSources ?? [])]
      })),
      nextComposition,
      delta: compositionDelta(currentComposition, nextComposition),
      note: pluginPackage?.resolvedBundles?.length
        ? null
        : "plugin does not activate executable runtime bundles"
    };
  };
  return reviewablePackages
    .filter(pluginPackage => !selectedPluginId || pluginPackage.id === selectedPluginId)
    .map(pluginPackage => {
      const pluginId = pluginPackage.id;
      const installed = requestedAuthoredIds.includes(pluginId);
      const directDependencies = [...(pluginPackage.manifest?.dependsOnPlugins ?? pluginPackage.metadata?.dependsOnPlugins ?? [])];
      const missingDependencies = directDependencies.filter(dependencyId => !requestedAuthoredIds.includes(dependencyId));
      const dependencyIssues = directDependencies.flatMap(dependencyId => {
        const dependencyPackage = packageById.get(dependencyId);
        if (!dependencyPackage) return [`plugin dependency not found: ${dependencyId}`];
        const issues = [];
        if (!dependencyPackage.validation?.ok) issues.push(`plugin dependency manifest invalid: ${dependencyId}`);
        if (!dependencyPackage.execution?.executable) issues.push(`plugin dependency is metadata-only: ${dependencyId}`);
        if (!dependencyPackage.compatibility?.compatible) issues.push(`plugin dependency incompatible: ${dependencyId}`);
        return issues;
      });
      const reverseDependents = reverseDependentsFor(pluginId);
      const blockingReasons = [];
      if (installed) blockingReasons.push("already installed on server runner");
      if (pluginPackage.missingPackage) blockingReasons.push("plugin package not found in local plugin root");
      if (!pluginPackage.validation?.ok) blockingReasons.push(...(pluginPackage.validation?.errors ?? []));
      if (!pluginPackage.execution?.executable) blockingReasons.push("plugin package is metadata-only");
      if (!pluginPackage.compatibility?.compatible) {
        blockingReasons.push(...((pluginPackage.compatibility?.reasons ?? []).map(reason =>
          reason === "runtime-profile-incompatible"
            ? "runtime profile incompatible"
            : reason
        )));
      }
      blockingReasons.push(...dependencyIssues);
      const installPreview = installed
        ? null
        : (blockingReasons.length
            ? {
                action: "install",
                available: false,
                blockedReasons: uniqueStrings(blockingReasons),
                warnings: [],
                nextAuthoredPluginIds: uniqueStrings([...requestedAuthoredIds, pluginId]),
                nextActivePluginIds: [],
                nextRejectedPlugins: [],
                nextComposition: currentComposition,
                delta: compositionDelta(currentComposition, currentComposition),
                note: "install preview unavailable"
              }
            : composePreview({
                pluginPackage,
                action: "install",
                nextAuthoredPluginIds: [...requestedAuthoredIds, pluginId]
              }));
      const removePreview = installed
        ? composePreview({
            pluginPackage,
            action: "remove",
            nextAuthoredPluginIds: requestedAuthoredIds.filter(id => id !== pluginId),
            warnings: reverseDependents.length
              ? [`other authored runner installs depend on this plugin: ${reverseDependents.join(", ")}`]
              : []
          })
        : null;
      const metadata = pluginPackage.metadata ?? null;
      return {
        plugin: pluginId,
        displayName: metadata?.displayName ?? pluginId,
        version: metadata?.version ?? null,
        description: metadata?.description ?? null,
        discoveryPath: pluginPackage.discoveryPath,
        missingPackage: pluginPackage.missingPackage === true,
        installed,
        installable: !installed && blockingReasons.length === 0,
        executable: pluginPackage.execution?.executable === true,
        compatible: pluginPackage.compatibility?.compatible === true,
        blockingReasons: uniqueStrings(blockingReasons),
        dependencies: {
          direct: directDependencies,
          missing: missingDependencies,
          reverseDependents
        },
        dependencyIssues,
        validation: {
          ok: pluginPackage.validation?.ok === true,
          errors: [...(pluginPackage.validation?.errors ?? [])]
        },
        compatibility: {
          activeProfile: pluginPackage.compatibility?.activeProfile ?? runtimeProfile,
          compatible: pluginPackage.compatibility?.compatible === true,
          reasons: [...(pluginPackage.compatibility?.reasons ?? [])]
        },
        installability: {
          installableInPrinciple: pluginPackage.installability?.installableInPrinciple === true,
          reasons: [...(pluginPackage.installability?.reasons ?? [])]
        },
        execution: {
          executable: pluginPackage.execution?.executable === true,
          mode: pluginPackage.execution?.mode ?? null,
          reason: pluginPackage.execution?.reason ?? null
        },
        trust: pluginPackage.trust ? {
          ...pluginPackage.trust,
          warnings: [...(pluginPackage.trust.warnings ?? [])]
        } : null,
        metadata: metadata ? {
          ...metadata,
          dependsOnPlugins: [...(metadata.dependsOnPlugins ?? [])],
          dependsOnCapabilities: [...(metadata.dependsOnCapabilities ?? [])],
          permissions: [...(metadata.permissions ?? [])],
          compatibleRuntimeProfiles: [...(metadata.compatibleRuntimeProfiles ?? [])],
          compatibleShells: [...(metadata.compatibleShells ?? [])],
          activatesBundles: [...(metadata.activatesBundles ?? [])],
          provenance: metadata.provenance ? { ...metadata.provenance } : null,
          contributes: {
            capabilities: (metadata.contributes?.capabilities ?? []).map(entry => ({ ...entry })),
            routes: (metadata.contributes?.routes ?? []).map(entry => ({ ...entry })),
            surfaces: (metadata.contributes?.surfaces ?? []).map(entry => ({ ...entry })),
            providers: (metadata.contributes?.providers ?? []).map(entry => ({ ...entry })),
            styles: (metadata.contributes?.styles ?? []).map(entry => ({ ...entry })),
            themes: (metadata.contributes?.themes ?? []).map(entry => ({ ...entry })),
            widgets: (metadata.contributes?.widgets ?? []).map(entry => ({ ...entry })),
            renderers: (metadata.contributes?.renderers ?? []).map(entry => ({ ...entry })),
            authoringTools: (metadata.contributes?.authoringTools ?? []).map(entry => ({ ...entry }))
          }
        } : null,
        declaredManifestContributions: {
          capabilities: (metadata?.contributes?.capabilities ?? []).map(entry => ({ ...entry })),
          routes: (metadata?.contributes?.routes ?? [])
            .map(entry => summarizeManifestRouteEntry(entry, pluginPackage.resolvedRuntimeContributions?.handlerMetadata ?? {}))
            .sort(compareRouteSummary),
          surfaces: (metadata?.contributes?.surfaces ?? []).map(entry => ({ ...entry })),
          providers: (metadata?.contributes?.providers ?? []).map(entry => ({ ...entry })),
          styles: (metadata?.contributes?.styles ?? []).map(entry => ({ ...entry })),
          themes: (metadata?.contributes?.themes ?? []).map(entry => ({ ...entry })),
          widgets: (metadata?.contributes?.widgets ?? []).map(entry => ({ ...entry })),
          renderers: (metadata?.contributes?.renderers ?? []).map(entry => ({ ...entry })),
          authoringTools: (metadata?.contributes?.authoringTools ?? []).map(entry => ({ ...entry })),
          handlerMetadata: Object.fromEntries(
            Object.entries(pluginPackage.resolvedRuntimeContributions?.handlerMetadata ?? {})
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([handlerId, entry]) => [handlerId, cloneHandlerMetadataEntry(entry)])
          )
        },
        resolvedBundles: (pluginPackage.resolvedBundles ?? []).map(row => ({ ...row })),
        resolvedRuntimeContributions: {
          capabilities: [...(pluginPackage.resolvedRuntimeContributions?.capabilities ?? [])],
          routes: (pluginPackage.resolvedRuntimeContributions?.routes ?? []).map(cloneContributionRoute).sort(compareRouteSummary),
          surfaces: (pluginPackage.resolvedRuntimeContributions?.surfaces ?? []).map(cloneContributionSurface).sort(compareSurfaceSummary),
          handlerSets: [...(pluginPackage.resolvedRuntimeContributions?.handlerSets ?? [])].sort(),
          handlerMetadata: Object.fromEntries(
            Object.entries(pluginPackage.resolvedRuntimeContributions?.handlerMetadata ?? {})
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([handlerId, entry]) => [handlerId, cloneHandlerMetadataEntry(entry)])
          )
        },
        currentComposition,
        installPreview,
        removePreview,
        statusBadges: reviewStatusBadges({
          plugin: pluginId,
          installed,
          installable: !installed && blockingReasons.length === 0,
          executable: pluginPackage.execution?.executable === true,
          compatible: pluginPackage.compatibility?.compatible === true,
          missingDependencies,
          missingPackage: pluginPackage.missingPackage === true,
          installPreview,
          removePreview
        })
      };
    });
}

export async function readRuntimePluginReviews({
  pluginRoot,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  serverRunnerId,
  authoredPluginIds = [],
  pluginId = null,
  availableProfileIds = availableRuntimeProfiles(),
  fsModule = fs
} = {}) {
  const catalog = await readRuntimePluginCatalog({
    pluginRoot,
    runtimeProfile,
    authoredPluginIds,
    configuredPluginIds: [],
    availableProfileIds,
    fsModule
  });
  const rows = buildRuntimePluginReviewRows({
    runtimeProfile,
    authoredPluginIds,
    pluginCatalog: catalog,
    selectedPluginId: pluginId
  });
  return {
    serverRunner: serverRunnerId ?? null,
    activeProfile: runtimeProfile,
    authoredPluginIds: uniqueStrings(authoredPluginIds),
    currentComposition: rows[0]?.currentComposition ?? compositionSnapshot(runtimeProfile, []),
    packages: rows,
    note: "Bootstrap/runtime plugin review shows authored runner intent only. CLI and environment plugin overlays are excluded from this view."
  };
}

export function buildPluginCapabilitySourceIndex({
  capabilityCatalog = [],
  pluginPackages = []
} = {}) {
  const catalogById = new Map(capabilityCatalog.map(row => [String(row.id), row]));
  const packageSources = new Map();
  for (const pluginPackage of pluginPackages) {
    for (const capabilityId of pluginPackage.declaredCapabilityIds ?? []) {
      const rows = packageSources.get(capabilityId) ?? [];
      rows.push({
        pluginId: pluginPackage.id,
        displayName: pluginPackage.metadata?.displayName ?? pluginPackage.id,
        version: pluginPackage.metadata?.version ?? null,
        discoveryPath: pluginPackage.discoveryPath,
        validation: { ...pluginPackage.validation, errors: [...pluginPackage.validation.errors] },
        compatibility: {
          activeProfile: pluginPackage.compatibility.activeProfile,
          compatible: pluginPackage.compatibility.compatible,
          reasons: [...pluginPackage.compatibility.reasons]
        },
        execution: { ...pluginPackage.execution },
        activation: {
          requested: pluginPackage.activation?.requested === true,
          requestedSources: [...(pluginPackage.activation?.requestedSources ?? [])],
          eligible: pluginPackage.activation?.eligible === true,
          active: pluginPackage.activation?.active === true,
          reasons: [...(pluginPackage.activation?.reasons ?? [])]
        },
        trust: pluginPackage.trust ? {
          ...pluginPackage.trust,
          warnings: [...(pluginPackage.trust.warnings ?? [])]
        } : null,
        provenance: pluginPackage.metadata?.provenance ? { ...pluginPackage.metadata.provenance } : null
      });
      packageSources.set(capabilityId, rows);
    }
  }
  const capabilityPackageSources = [...new Set([
    ...catalogById.keys(),
    ...packageSources.keys()
  ])]
    .sort()
    .map(capabilityId => {
      const capability = catalogById.get(capabilityId) ?? null;
      const packages = (packageSources.get(capabilityId) ?? []).map(row => ({
        ...row,
        validation: { ...row.validation, errors: [...row.validation.errors] },
        compatibility: { ...row.compatibility, reasons: [...row.compatibility.reasons] },
        execution: { ...row.execution },
        activation: {
          requested: row.activation?.requested === true,
          eligible: row.activation?.eligible === true,
          active: row.activation?.active === true,
          reasons: [...(row.activation?.reasons ?? [])]
        },
        trust: row.trust ? {
          ...row.trust,
          warnings: [...(row.trust.warnings ?? [])]
        } : null,
        provenance: row.provenance ? { ...row.provenance } : null
      }));
      return {
        capabilityId,
        capabilityExistsInCatalog: Boolean(capability),
        sourceState: capability && packages.length ? "both" : (capability ? "catalog-only" : "package-only"),
        packages
      };
    });
  const augmentedCapabilityCatalog = capabilityCatalog.map(row => {
    const source = capabilityPackageSources.find(entry => entry.capabilityId === row.id);
    return {
      ...row,
      packageSources: source?.packages ?? [],
      capabilitySourceState: source?.sourceState ?? "catalog-only"
    };
  });
  return {
    capabilityPackageSources,
    capabilityCatalog: augmentedCapabilityCatalog
  };
}
