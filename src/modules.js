import { thing, relation, retract, createThing, projectors } from "./kernel.js";
import { normalizeFields } from "./type-model.js";
import { createCanonicalPackagePatch, normalizeCanonicalPath } from "./package-authorship.js";
import { normalizeCapabilityCompatibility } from "./capability-compatibility.js";

const CAPABILITY_INSTALL_TARGET_KINDS = new Set(["context", "serverRunner", "routePage", "host"]);
const CAPABILITY_DEFINITION_PROCESSES = new Set(["defineCapability", "updateCapability", "rollbackCapability"]);
const NAME_REL_PREFIX = "bindsName:";
const EXPORT_REL_PREFIX = "exportsName:";
const IMPORT_REL_PREFIX = "importsName:";
const CONTEXT_REF_SEP = "\u0000";

function latestBodiesByProcess(witnesses, process) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== process || !witness.body?.id) continue;
    rows.set(witness.body.id, witness.body);
  }
  return rows;
}

function normalizeCapabilityDefinition({
  id,
  label = id,
  version = null,
  provenance = null,
  dependsOn = [],
  publicApi = [],
  config = [],
  internals = [],
  authority = [],
  providerAdapters = [],
  witnessContract = null,
  compatibility = null,
  placement = [],
  context = null
}) {
  return {
    id: String(id),
    label: String(label ?? id),
    version: typeof version === "string" && version.trim() ? version.trim() : null,
    provenance: provenance && typeof provenance === "object" ? { ...provenance } : null,
    dependsOn: [...new Set((Array.isArray(dependsOn) ? dependsOn : []).map(String).filter(Boolean))],
    publicApi: normalizeFields(publicApi),
    config: normalizeFields(config),
    internals: normalizeFields(internals),
    authority: normalizeFields(authority),
    providerAdapters: normalizeCapabilityProviderAdapters(providerAdapters),
    witnessContract: normalizeCapabilityWitnessContract(witnessContract),
    compatibility: normalizeCapabilityCompatibility(compatibility),
    placement: [...new Set((Array.isArray(placement) ? placement : []).map(String).filter(Boolean))],
    context: typeof context === "string" && context.trim() ? context.trim() : null
  };
}

function normalizeCapabilityProviderAdapters(adapters) {
  return Array.isArray(adapters)
    ? adapters
      .filter(Boolean)
      .map(adapter => {
        const id = String(adapter.id ?? adapter.name ?? "").trim();
        if (!id) return null;
        const label = String(adapter.label ?? id).trim() || id;
        const kind = typeof adapter.kind === "string" && adapter.kind.trim() ? adapter.kind.trim() : null;
        const status = typeof adapter.status === "string" && adapter.status.trim() ? adapter.status.trim() : null;
        const requires = Array.isArray(adapter.requires)
          ? [...new Set(adapter.requires.map(String).filter(Boolean))]
          : [];
        return {
          id,
          label,
          kind,
          status,
          default: adapter.default === true,
          requires
        };
      })
      .filter(Boolean)
    : [];
}

function normalizeCapabilityWitnessContract(contract) {
  if (!contract || typeof contract !== "object") return null;
  const rawProcesses = contract.processes && typeof contract.processes === "object" ? contract.processes : contract;
  const normalizeProcessList = value => Array.isArray(value)
    ? [...new Set(value.map(String).filter(Boolean))]
    : [];
  const processes = {
    read: normalizeProcessList(rawProcesses.read),
    intent: normalizeProcessList(rawProcesses.intent),
    attempt: normalizeProcessList(rawProcesses.attempt),
    retry: normalizeProcessList(rawProcesses.retry),
    success: normalizeProcessList(rawProcesses.success),
    failure: normalizeProcessList(rawProcesses.failure)
  };
  const phases = Object.entries(processes)
    .filter(([, rows]) => rows.length)
    .map(([phase]) => phase);
  const externalRefs = normalizeProcessList(contract.externalRefs);
  if (!phases.length && !externalRefs.length) return null;
  const normalized = {
    phases,
    processes: Object.fromEntries(Object.entries(processes).filter(([, rows]) => rows.length)),
    externalRefs
  };
  return normalized;
}

function normalizePackageExports(exports) {
  return Array.isArray(exports)
    ? exports
      .map(entry => {
        if (typeof entry === "string" && entry.trim()) return { id: entry.trim() };
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const id = String(entry.id ?? "").trim();
        if (!id) return null;
        return {
          ...entry,
          id
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    : [];
}

function normalizePackageDefinition({
  id,
  context = null,
  label = id,
  packageKind = "plugin",
  version = null,
  description = null,
  defaultNamespace = null,
  exports = [],
  provenance = null,
  compatibleRuntimeProfiles = [],
  compatibleShells = [],
  runtimeFlavor = null
}) {
  return {
    id: String(id),
    context: typeof context === "string" && context.trim() ? context.trim() : null,
    label: String(label ?? id),
    packageKind: typeof packageKind === "string" && packageKind.trim() ? packageKind.trim() : "plugin",
    version: typeof version === "string" && version.trim() ? version.trim() : null,
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    defaultNamespace: typeof defaultNamespace === "string" && defaultNamespace.trim() ? defaultNamespace.trim() : null,
    exports: normalizePackageExports(exports),
    provenance: provenance && typeof provenance === "object" ? structuredClone(provenance) : null,
    compatibleRuntimeProfiles: [...new Set((Array.isArray(compatibleRuntimeProfiles) ? compatibleRuntimeProfiles : []).map(String).filter(Boolean))].sort(),
    compatibleShells: [...new Set((Array.isArray(compatibleShells) ? compatibleShells : []).map(String).filter(Boolean))].sort(),
    runtimeFlavor: typeof runtimeFlavor === "string" && runtimeFlavor.trim() ? runtimeFlavor.trim() : null
  };
}

function normalizePackageRevisionDefinition({
  id,
  package: packageId,
  version = null,
  status = "draft",
  supersedes = [],
  emittedBundleHash = null,
  manifest = null,
  compatibility = null
}) {
  return {
    id: String(id),
    package: String(packageId),
    version: typeof version === "string" && version.trim() ? version.trim() : null,
    status: typeof status === "string" && status.trim() ? status.trim() : "draft",
    supersedes: [...new Set((Array.isArray(supersedes) ? supersedes : []).map(String).filter(Boolean))].sort(),
    emittedBundleHash: typeof emittedBundleHash === "string" && emittedBundleHash.trim() ? emittedBundleHash.trim() : null,
    manifest: manifest && typeof manifest === "object" ? structuredClone(manifest) : null,
    compatibility: compatibility && typeof compatibility === "object" ? structuredClone(compatibility) : null
  };
}

function normalizePackageNamespaceDefinition({
  id,
  context,
  name,
  package: packageId,
  revision = null,
  visibility = "context"
}) {
  return {
    id: String(id),
    context: String(context),
    name: String(name),
    package: String(packageId),
    revision: typeof revision === "string" && revision.trim() ? revision.trim() : null,
    visibility: typeof visibility === "string" && visibility.trim() ? visibility.trim() : "context"
  };
}

function normalizePackageTransformerMappings(mappings) {
  return Array.isArray(mappings)
    ? mappings
      .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
      .map(entry => {
        const from = String(entry.from ?? "").trim();
        const to = String(entry.to ?? "").trim();
        if (!from || !to) return null;
        return {
          kind: typeof entry.kind === "string" && entry.kind.trim() ? entry.kind.trim() : "alias",
          from,
          to,
          note: typeof entry.note === "string" && entry.note.trim() ? entry.note.trim() : null
        };
      })
      .filter(Boolean)
      .sort((left, right) =>
        String(left.kind).localeCompare(String(right.kind))
        || String(left.from).localeCompare(String(right.from))
        || String(left.to).localeCompare(String(right.to))
        || String(left.note ?? "").localeCompare(String(right.note ?? ""))
      )
    : [];
}

function normalizePackageTransformerDefinition({
  id,
  package: packageId,
  sourceRevision = null,
  sourceNamespace = null,
  targetRevision = null,
  targetNamespace = null,
  strategy = "follow-up-revision",
  status = "draft",
  mappings = [],
  remainingGlue = [],
  notes = []
}) {
  return {
    id: String(id),
    package: String(packageId),
    sourceRevision: typeof sourceRevision === "string" && sourceRevision.trim() ? sourceRevision.trim() : null,
    sourceNamespace: typeof sourceNamespace === "string" && sourceNamespace.trim() ? sourceNamespace.trim() : null,
    targetRevision: typeof targetRevision === "string" && targetRevision.trim() ? targetRevision.trim() : null,
    targetNamespace: typeof targetNamespace === "string" && targetNamespace.trim() ? targetNamespace.trim() : null,
    strategy: typeof strategy === "string" && strategy.trim() ? strategy.trim() : "follow-up-revision",
    status: typeof status === "string" && status.trim() ? status.trim() : "draft",
    mappings: normalizePackageTransformerMappings(mappings),
    remainingGlue: uniqueStrings(remainingGlue),
    notes: uniqueStrings(notes)
  };
}

function normalizePackageDependencyDefinition({
  id,
  sourcePackage = null,
  sourceRevision,
  targetKind,
  targetId,
  versionRange = null,
  compatibility = null,
  runtimeProfiles = []
}) {
  return {
    id: String(id),
    sourcePackage: typeof sourcePackage === "string" && sourcePackage.trim() ? sourcePackage.trim() : null,
    sourceRevision: String(sourceRevision),
    targetKind: String(targetKind),
    targetId: String(targetId),
    versionRange: typeof versionRange === "string" && versionRange.trim() ? versionRange.trim() : null,
    compatibility: compatibility && typeof compatibility === "object" ? structuredClone(compatibility) : null,
    runtimeProfiles: [...new Set((Array.isArray(runtimeProfiles) ? runtimeProfiles : []).map(String).filter(Boolean))].sort()
  };
}

function currentRelations(witnesses) {
  return projectors.currentRelations(witnesses);
}

function localNameRel(name) {
  return `${NAME_REL_PREFIX}${String(name)}`;
}

function exportNameRel(name) {
  return `${EXPORT_REL_PREFIX}${String(name)}`;
}

function importNameRel(name) {
  return `${IMPORT_REL_PREFIX}${String(name)}`;
}

function parseNamedRelation(prefix, rel) {
  if (typeof rel !== "string" || !rel.startsWith(prefix)) return null;
  const name = rel.slice(prefix.length);
  return name ? name : null;
}

function importTargetValue(sourceContext, exportName) {
  return `${String(sourceContext)}${CONTEXT_REF_SEP}${String(exportName)}`;
}

function parseImportTargetValue(value) {
  if (typeof value !== "string") return null;
  const index = value.indexOf(CONTEXT_REF_SEP);
  if (index <= 0) return null;
  const sourceContext = value.slice(0, index);
  const exportName = value.slice(index + CONTEXT_REF_SEP.length);
  if (!sourceContext || !exportName) return null;
  return { sourceContext, exportName };
}

function capabilityDefinitionsById(witnesses) {
  const rows = new Map();
  for (const w of witnesses) {
    if (!CAPABILITY_DEFINITION_PROCESSES.has(w.process) || !w.body?.id) continue;
    rows.set(w.body.id, normalizeCapabilityDefinition(w.body));
  }
  return rows;
}

function capabilityDefinitionHistoryRows(witnesses) {
  const rows = [];
  for (const witness of witnesses) {
    if (!CAPABILITY_DEFINITION_PROCESSES.has(witness.process) || !witness.body?.id) continue;
    const definition = normalizeCapabilityDefinition(witness.body);
    rows.push({
      capabilityId: definition.id,
      action: witness.process === "defineCapability"
        ? "define"
        : (witness.process === "updateCapability" ? "update" : "rollback"),
      version: definition.version,
      previousVersion: typeof witness.body?.previousVersion === "string" ? witness.body.previousVersion : null,
      rollbackFromVersion: typeof witness.body?.rollbackFromVersion === "string" ? witness.body.rollbackFromVersion : null,
      witnessId: witness.id,
      actor: witness.actor ?? null,
      definition
    });
  }
  return rows;
}

function packageDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "definePackage" || !witness.body?.id) continue;
    rows.set(witness.body.id, normalizePackageDefinition(witness.body));
  }
  return rows;
}

function packageRevisionDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if ((witness.process !== "definePackageRevision" && witness.process !== "publishPackageRevision") || !witness.body?.id) continue;
    rows.set(witness.body.id, normalizePackageRevisionDefinition(witness.body));
  }
  return rows;
}

function packagePatchDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "definePackagePatch" || !witness.body?.id) continue;
    rows.set(witness.body.id, structuredClone(witness.body));
  }
  return rows;
}

function packageMaterializedFileDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (
      witness.process !== "definePackageMaterializedFile"
      && witness.process !== "deletePackageMaterializedFile"
    ) continue;
    if (!witness.body?.id) continue;
    rows.set(witness.body.id, normalizePackageMaterializedFileDefinition(witness.body));
  }
  return rows;
}

function packageMaterializedFileHistoryRows(witnesses) {
  const rows = [];
  for (const witness of witnesses) {
    if (
      witness.process !== "definePackageMaterializedFile"
      && witness.process !== "deletePackageMaterializedFile"
    ) continue;
    if (!witness.body?.id) continue;
    rows.push(normalizePackageMaterializedFileDefinition(witness.body));
  }
  return rows;
}

function computeModuleSmokeTestDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (
      witness.process !== "defineComputeModuleSmokeTest"
      && witness.process !== "deleteComputeModuleSmokeTest"
    ) continue;
    if (!witness.body?.id) continue;
    rows.set(witness.body.id, normalizeComputeModuleSmokeTestDefinition(witness.body));
  }
  return rows;
}

function computeModuleSmokeTestHistoryRows(witnesses) {
  const rows = [];
  for (const witness of witnesses) {
    if (
      witness.process !== "defineComputeModuleSmokeTest"
      && witness.process !== "deleteComputeModuleSmokeTest"
    ) continue;
    if (!witness.body?.id) continue;
    rows.push(normalizeComputeModuleSmokeTestDefinition(witness.body));
  }
  return rows;
}

function packageNamespaceDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "definePackageNamespace" || !witness.body?.id) continue;
    rows.set(witness.body.id, normalizePackageNamespaceDefinition(witness.body));
  }
  return rows;
}

function packageDependencyDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "definePackageDependency" || !witness.body?.id) continue;
    rows.set(witness.body.id, normalizePackageDependencyDefinition(witness.body));
  }
  return rows;
}

function packageTransformerDefinitionsById(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "definePackageTransformer" || !witness.body?.id) continue;
    rows.set(witness.body.id, normalizePackageTransformerDefinition(witness.body));
  }
  return rows;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].sort();
}

function packageManifestPluginId(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
  return typeof manifest.pluginId === "string" && manifest.pluginId.trim()
    ? manifest.pluginId.trim()
    : null;
}

const registeredModuleProjectors = new Map();

export function createModuleProjectorContext(projectorEntries = {}, { owner = "moduleProjectorContext" } = {}) {
  const provider = typeof owner === "string" && owner.trim() ? owner.trim() : "moduleProjectorContext";
  const projectors = new Map();
  for (const [name, projector] of Object.entries(projectorEntries ?? {})) {
    if (typeof projector !== "function") {
      throw new Error(`module projector ${name} from ${provider} must be a function`);
    }
    projectors.set(name, projector);
  }
  return Object.freeze({
    kind: "moduleProjectorContext",
    owner: provider,
    projectors
  });
}

export function registerModuleProjectors(owner, projectorEntries = {}) {
  const provider = typeof owner === "string" && owner.trim() ? owner.trim() : "unknown";
  const token = Symbol(provider);
  const entries = Object.entries(projectorEntries ?? {});
  const registered = [];
  for (const [name, projector] of entries) {
    if (typeof projector !== "function") {
      throw new Error(`module projector ${name} from ${provider} must be a function`);
    }
    const existing = registeredModuleProjectors.get(name);
    if (existing && existing.projector !== projector) {
      const owners = [...existing.registrations.values()]
        .map(registration => registration.owner)
        .filter(Boolean)
        .join(", ");
      throw new Error(`module projector ${name} is already registered by ${owners || "unknown"} with a different implementation`);
    }
  }
  for (const [name, projector] of entries) {
    const existing = registeredModuleProjectors.get(name);
    const next = existing ?? { projector, registrations: new Map() };
    next.registrations.set(token, { owner: provider });
    if (!existing) registeredModuleProjectors.set(name, next);
    registered.push(name);
  }
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    for (const name of registered) {
      const existing = registeredModuleProjectors.get(name);
      if (!existing) continue;
      existing.registrations.delete(token);
      if (!existing.registrations.size) registeredModuleProjectors.delete(name);
    }
  };
}

function delegatedModuleProjector(name, fallback) {
  return (witnesses, options = {}) => {
    const contextProjector = options?.projectionContext?.projectors?.get?.(name) ?? null;
    if (typeof contextProjector === "function") return contextProjector(witnesses, options);
    const registered = registeredModuleProjectors.get(name);
    return (registered?.projector ?? fallback)(witnesses, options);
  };
}

export function moduleProjectorByName(name, {
  fallback = () => null
} = {}) {
  const projectorName = typeof name === "string" && name.trim() ? name.trim() : "";
  if (!projectorName) return null;
  const builtin = moduleProjectors[projectorName];
  if (typeof builtin === "function") return builtin;
  const fallbackProjector = typeof fallback === "function"
    ? fallback
    : (() => fallback);
  return delegatedModuleProjector(projectorName, fallbackProjector);
}

function emptyRows() {
  return [];
}

function emptyIndex() {
  return { rows: [], byId: Object.create(null) };
}

export function ensureCapabilityDefinition(world, {
  actor,
  id,
  label = id,
  version = null,
  provenance = null,
  dependsOn = [],
  publicApi = [],
  config = [],
  internals = [],
  authority = [],
  providerAdapters = [],
  witnessContract = null,
  compatibility = null,
  placement = [],
  context = null,
  owner = actor
}) {
  if (capabilityDefinitionsById(world.allWitnesses()).has(id)) return null;
  return defineCapability(world, {
    actor,
    id,
    label,
    version,
    provenance,
    dependsOn,
    publicApi,
    config,
    internals,
    authority,
    providerAdapters,
    witnessContract,
    compatibility,
    placement,
    context,
    owner
  });
}

function capabilityDefinitionClaims(id, normalized, previous = null) {
  const claims = [relation(id, "hasModuleKind", "capability")];
  if (previous?.context && previous.context !== normalized.context) {
    claims.push(retract(id, "inContext", previous.context));
  }
  if (normalized.context) claims.push(relation(id, "inContext", normalized.context));
  const previousDepends = new Set(previous?.dependsOn ?? []);
  const nextDepends = new Set(normalized.dependsOn ?? []);
  for (const dependency of previousDepends) {
    if (!nextDepends.has(dependency)) claims.push(retract(id, "dependsOnCapability", dependency));
  }
  for (const dependency of nextDepends) {
    claims.push(relation(id, "dependsOnCapability", dependency));
  }
  return claims;
}

export function defineCapability(world, {
  actor,
  id,
  label = id,
  version = null,
  provenance = null,
  dependsOn = [],
  publicApi = [],
  config = [],
  internals = [],
  authority = [],
  providerAdapters = [],
  witnessContract = null,
  compatibility = null,
  placement = [],
  context = null,
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  const normalized = normalizeCapabilityDefinition({
    id,
    label,
    version,
    provenance,
    dependsOn,
    publicApi,
    config,
    internals,
    authority,
    providerAdapters,
    witnessContract,
    compatibility,
    placement
  });
  return world.emit({
    process: "defineCapability",
    actor,
    claims: capabilityDefinitionClaims(id, { ...normalized, context: context ? String(context) : null }),
    body: { ...normalized, context: context ? String(context) : null }
  });
}

export function updateCapability(world, {
  actor,
  id,
  label = id,
  version = null,
  provenance = null,
  dependsOn = [],
  publicApi = [],
  config = [],
  internals = [],
  authority = [],
  providerAdapters = [],
  witnessContract = null,
  compatibility = null,
  placement = [],
  context = null,
  previousDefinition = null,
  previousVersion = null
}) {
  const normalized = normalizeCapabilityDefinition({
    id,
    label,
    version,
    provenance,
    dependsOn,
    publicApi,
    config,
    internals,
    authority,
    providerAdapters,
    witnessContract,
    compatibility,
    placement,
    context
  });
  return world.emit({
    process: "updateCapability",
    actor,
    claims: capabilityDefinitionClaims(id, normalized, previousDefinition),
    body: {
      ...normalized,
      previousVersion: typeof previousVersion === "string" && previousVersion.trim() ? previousVersion.trim() : null
    }
  });
}

export function rollbackCapability(world, {
  actor,
  id,
  label = id,
  version = null,
  provenance = null,
  dependsOn = [],
  publicApi = [],
  config = [],
  internals = [],
  authority = [],
  providerAdapters = [],
  witnessContract = null,
  compatibility = null,
  placement = [],
  context = null,
  previousDefinition = null,
  previousVersion = null,
  rollbackFromVersion = null
}) {
  const normalized = normalizeCapabilityDefinition({
    id,
    label,
    version,
    provenance,
    dependsOn,
    publicApi,
    config,
    internals,
    authority,
    providerAdapters,
    witnessContract,
    compatibility,
    placement,
    context
  });
  return world.emit({
    process: "rollbackCapability",
    actor,
    claims: capabilityDefinitionClaims(id, normalized, previousDefinition),
    body: {
      ...normalized,
      previousVersion: typeof previousVersion === "string" && previousVersion.trim() ? previousVersion.trim() : null,
      rollbackFromVersion: typeof rollbackFromVersion === "string" && rollbackFromVersion.trim() ? rollbackFromVersion.trim() : null
    }
  });
}

export function installCapability(world, {
  actor,
  capability,
  target,
  targetKind,
  config = null
}) {
  const witnesses = world.allWitnesses();
  const capabilityKinds = moduleProjectors.modules(witnesses);
  const targetExists = world.project(projectors.things).has(target);
  const capabilityExists = capabilityKinds.get(capability) === "capability";
  const knownTargetKind = CAPABILITY_INSTALL_TARGET_KINDS.has(String(targetKind || ""));
  if (!capabilityExists || !targetExists || !knownTargetKind) {
    return world.emit({
      process: "installCapability.failed",
      actor,
      claims: [],
      body: {
        capability,
        target,
        targetKind,
        ok: false,
        reason: !knownTargetKind
          ? "unknown install target kind"
          : (!capabilityExists ? "capability not found" : "target not found")
      }
    });
  }

  const meta = { targetKind: String(targetKind) };
  if (config && typeof config === "object") meta.config = { ...config };
  return world.emit({
    process: "installCapability",
    actor,
    claims: [relation(target, "installsCapability", capability, meta)],
    body: {
      capability,
      target,
      targetKind: String(targetKind),
      config: config && typeof config === "object" ? { ...config } : null,
      ok: true
    }
  });
}

export function removeCapability(world, {
  actor,
  capability,
  target,
  targetKind
}) {
  const current = currentRelations(world.allWitnesses());
  const installed = current.some(r => r.from === target && r.rel === "installsCapability" && r.to === capability);
  if (!installed) {
    return world.emit({
      process: "removeCapability.failed",
      actor,
      claims: [],
      body: { capability, target, targetKind: targetKind ? String(targetKind) : null, ok: false, reason: "capability install not found" }
    });
  }
  return world.emit({
    process: "removeCapability",
    actor,
    claims: [retract(target, "installsCapability", capability)],
    body: { capability, target, targetKind: targetKind ? String(targetKind) : null, ok: true }
  });
}

export function installRuntimePlugin(world, {
  actor,
  serverRunner,
  plugin
}) {
  const runnerExists = world.project(projectors.things).has(serverRunner)
    && moduleProjectors.modules(world.allWitnesses()).get(serverRunner) === "serverRunner";
  if (!runnerExists) {
    return world.emit({
      process: "installRuntimePlugin.failed",
      actor,
      claims: [],
      body: {
        serverRunner,
        plugin,
        ok: false,
        reason: "server runner not found"
      }
    });
  }
  return world.emit({
    process: "installRuntimePlugin",
    actor,
    claims: [relation(serverRunner, "installsRuntimePlugin", plugin)],
    body: {
      serverRunner,
      plugin,
      ok: true
    }
  });
}

export function removeRuntimePlugin(world, {
  actor,
  serverRunner,
  plugin
}) {
  const current = currentRelations(world.allWitnesses());
  const installed = current.some(r => r.from === serverRunner && r.rel === "installsRuntimePlugin" && r.to === plugin);
  if (!installed) {
    return world.emit({
      process: "removeRuntimePlugin.failed",
      actor,
      claims: [],
      body: {
        serverRunner,
        plugin,
        ok: false,
        reason: "runtime plugin install not found"
      }
    });
  }
  return world.emit({
    process: "removeRuntimePlugin",
    actor,
    claims: [retract(serverRunner, "installsRuntimePlugin", plugin)],
    body: {
      serverRunner,
      plugin,
      ok: true
    }
  });
}

export function definePackage(world, {
  actor,
  id,
  context = null,
  label = id,
  packageKind = "plugin",
  version = null,
  description = null,
  defaultNamespace = null,
  exports = [],
  provenance = null,
  compatibleRuntimeProfiles = [],
  compatibleShells = [],
  runtimeFlavor = null,
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  const normalized = normalizePackageDefinition({
    id,
    context,
    label,
    packageKind,
    version,
    description,
    defaultNamespace,
    exports,
    provenance,
    compatibleRuntimeProfiles,
    compatibleShells,
    runtimeFlavor
  });
  return world.emit({
    process: "definePackage",
    actor,
    claims: [
      relation(id, "hasModuleKind", "package"),
      ...(normalized.context ? [relation(id, "inContext", normalized.context)] : []),
      ...(normalized.defaultNamespace ? [relation(id, "packageDefaultNamespace", normalized.defaultNamespace)] : []),
      ...(normalized.version ? [relation(id, "packageVersionLabel", normalized.version)] : []),
      ...normalized.compatibleRuntimeProfiles.map(profile => relation(id, "packageCompatibleRuntimeProfile", profile)),
      ...normalized.compatibleShells.map(shell => relation(id, "packageCompatibleShell", shell)),
      ...normalized.exports.map(entry => relation(id, "exportsConcept", entry.id, { entry: structuredClone(entry) }))
    ],
    body: normalized
  });
}

export function definePackageRevision(world, {
  actor,
  id,
  package: packageId,
  version = null,
  status = "draft",
  supersedes = [],
  emittedBundleHash = null,
  manifest = null,
  compatibility = null,
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  const normalized = normalizePackageRevisionDefinition({
    id,
    package: packageId,
    version,
    status,
    supersedes,
    emittedBundleHash,
    manifest,
    compatibility
  });
  return world.emit({
    process: "definePackageRevision",
    actor,
    claims: [
      relation(id, "hasModuleKind", "packageRevision"),
      relation(id, "packageRevisionOf", normalized.package),
      relation(id, "packageRevisionStatus", normalized.status),
      ...(normalized.version ? [relation(id, "packageRevisionVersion", normalized.version)] : []),
      ...(normalized.emittedBundleHash ? [relation(id, "emitsBundleHash", normalized.emittedBundleHash)] : []),
      ...normalized.supersedes.map(target => relation(id, "supersedesPackageRevision", target))
    ],
    body: normalized
  });
}

export function publishPackageRevision(world, {
  actor,
  id,
  package: packageId,
  version = null,
  status = "published",
  supersedes = [],
  emittedBundleHash = null,
  manifest = null,
  compatibility = null
}) {
  const normalized = normalizePackageRevisionDefinition({
    id,
    package: packageId,
    version,
    status,
    supersedes,
    emittedBundleHash,
    manifest,
    compatibility
  });
  return world.emit({
    process: "publishPackageRevision",
    actor,
    claims: [
      relation(id, "hasModuleKind", "packageRevision"),
      relation(id, "packageRevisionOf", normalized.package),
      relation(id, "packageRevisionStatus", normalized.status),
      ...(normalized.version ? [relation(id, "packageRevisionVersion", normalized.version)] : []),
      ...(normalized.emittedBundleHash ? [relation(id, "emitsBundleHash", normalized.emittedBundleHash)] : []),
      ...normalized.supersedes.map(target => relation(id, "supersedesPackageRevision", target))
    ],
    body: normalized
  });
}

export function definePackagePatch(world, {
  actor,
  package: packageId,
  revision,
  ordinal = null,
  path,
  operation,
  sourceLanguage,
  transformer = null,
  previousHash = null,
  nextHash = null,
  body = null,
  owner = actor
}) {
  const normalized = createCanonicalPackagePatch({
    package: packageId,
    revision,
    ordinal,
    path,
    operation,
    sourceLanguage,
    transformer,
    previousHash,
    nextHash,
    body
  });
  createThing(world, { actor, id: normalized.id, owner });
  return world.emit({
    process: "definePackagePatch",
    actor,
    claims: [
      relation(normalized.id, "hasModuleKind", "packagePatch"),
      relation(normalized.id, "packagePatchOf", normalized.package),
      relation(normalized.id, "packagePatchRevision", normalized.revision),
      relation(normalized.id, "patchesPath", normalized.path),
      relation(normalized.id, "packagePatchOperation", normalized.operation),
      relation(normalized.id, "packagePatchSourceLanguage", normalized.sourceLanguage),
      ...(normalized.transformer ? [relation(normalized.id, "packagePatchTransformer", normalized.transformer)] : []),
      ...(normalized.nextHash ? [relation(normalized.id, "packagePatchNextHash", normalized.nextHash)] : []),
      ...(normalized.previousHash ? [relation(normalized.id, "packagePatchPreviousHash", normalized.previousHash)] : [])
    ],
    body: normalized
  });
}

function packageMaterializedFileId({ revision, path }) {
  return `packageMaterializedFile:${String(revision)}:${normalizeCanonicalPath(path)}`;
}

function normalizePackageMaterializedFileDefinition({
  id = null,
  package: packageId,
  revision,
  path,
  content,
  sourceLanguage = "text",
  deletedAt = null
}) {
  const normalizedPath = normalizeCanonicalPath(path).replace(/^materialized\//, "");
  return {
    id: id ? String(id) : packageMaterializedFileId({ revision, path: normalizedPath }),
    package: String(packageId),
    revision: String(revision),
    path: normalizedPath,
    content: String(content ?? ""),
    sourceLanguage: typeof sourceLanguage === "string" && sourceLanguage.trim() ? sourceLanguage.trim() : "text",
    deletedAt: typeof deletedAt === "string" && deletedAt.trim() ? deletedAt.trim() : null
  };
}

export function definePackageMaterializedFile(world, {
  actor,
  id = null,
  package: packageId,
  revision,
  path,
  content,
  sourceLanguage = "text",
  owner = actor
}) {
  const normalized = normalizePackageMaterializedFileDefinition({
    id,
    package: packageId,
    revision,
    path,
    content,
    sourceLanguage
  });
  createThing(world, { actor, id: normalized.id, owner });
  return world.emit({
    process: "definePackageMaterializedFile",
    actor,
    claims: [
      relation(normalized.id, "hasModuleKind", "packageMaterializedFile"),
      relation(normalized.id, "packageMaterializedFileOf", normalized.package),
      relation(normalized.id, "packageMaterializedFileRevision", normalized.revision),
      relation(normalized.id, "materializesPackagePath", normalized.path),
      relation(normalized.id, "packageMaterializedFileSourceLanguage", normalized.sourceLanguage)
    ],
    body: normalized
  });
}

export function markPackageMaterializedFileDeleted(world, {
  actor,
  id = null,
  package: packageId,
  revision,
  path,
  content = "",
  sourceLanguage = "text",
  deletedAt = new Date().toISOString(),
  owner = actor
}) {
  const normalized = normalizePackageMaterializedFileDefinition({
    id,
    package: packageId,
    revision,
    path,
    content,
    sourceLanguage,
    deletedAt: deletedAt ?? new Date().toISOString()
  });
  createThing(world, { actor, id: normalized.id, owner });
  return world.emit({
    process: "deletePackageMaterializedFile",
    actor,
    claims: [
      relation(normalized.id, "hasModuleKind", "packageMaterializedFile"),
      relation(normalized.id, "packageMaterializedFileOf", normalized.package),
      relation(normalized.id, "packageMaterializedFileRevision", normalized.revision),
      relation(normalized.id, "materializesPackagePath", normalized.path)
    ],
    body: normalized
  });
}

export function definePackageNamespace(world, {
  actor,
  id = null,
  context,
  name,
  package: packageId,
  revision = null,
  visibility = "context",
  owner = actor
}) {
  const namespaceId = id ? String(id) : `packageNamespace:${String(context)}:${String(name)}`;
  createThing(world, { actor, id: namespaceId, owner });
  const normalized = normalizePackageNamespaceDefinition({
    id: namespaceId,
    context,
    name,
    package: packageId,
    revision,
    visibility
  });
  return world.emit({
    process: "definePackageNamespace",
    actor,
    claims: [
      relation(namespaceId, "hasModuleKind", "packageNamespace"),
      relation(namespaceId, "inContext", normalized.context),
      relation(namespaceId, "namesPackage", normalized.package),
      relation(normalized.context, `bindsPackageNamespace:${normalized.name}`, namespaceId),
      ...(normalized.revision ? [relation(namespaceId, "namesPackageRevision", normalized.revision)] : [])
    ],
    body: normalized
  });
}

export function definePackageDependency(world, {
  actor,
  id = null,
  sourcePackage = null,
  sourceRevision,
  targetKind,
  targetId,
  versionRange = null,
  compatibility = null,
  runtimeProfiles = [],
  owner = actor
}) {
  const dependencyId = id ? String(id) : `packageDependency:${String(sourceRevision)}:${String(targetKind)}:${String(targetId)}`;
  createThing(world, { actor, id: dependencyId, owner });
  const normalized = normalizePackageDependencyDefinition({
    id: dependencyId,
    sourcePackage,
    sourceRevision,
    targetKind,
    targetId,
    versionRange,
    compatibility,
    runtimeProfiles
  });
  return world.emit({
    process: "definePackageDependency",
    actor,
    claims: [
      relation(dependencyId, "hasModuleKind", "packageDependency"),
      relation(dependencyId, "packageDependencySourceRevision", normalized.sourceRevision),
      relation(dependencyId, "packageDependencyTarget", normalized.targetId, { targetKind: normalized.targetKind }),
      relation(normalized.sourceRevision, "dependsOnPackageTarget", normalized.targetId, {
        targetKind: normalized.targetKind,
        dependencyId
      }),
      ...(normalized.sourcePackage ? [relation(dependencyId, "packageDependencySourcePackage", normalized.sourcePackage)] : []),
      ...(normalized.versionRange ? [relation(dependencyId, "packageDependencyVersionRange", normalized.versionRange)] : []),
      ...normalized.runtimeProfiles.map(profile => relation(dependencyId, "packageDependencyRuntimeProfile", profile))
    ],
    body: normalized
  });
}

export function definePackageTransformer(world, {
  actor,
  id = null,
  package: packageId,
  sourceRevision = null,
  sourceNamespace = null,
  targetRevision = null,
  targetNamespace = null,
  strategy = "follow-up-revision",
  status = "draft",
  mappings = [],
  remainingGlue = [],
  notes = [],
  owner = actor
}) {
  const transformerId = id
    ? String(id)
    : `packageTransformer:${String(packageId)}:${String(targetRevision ?? targetNamespace ?? sourceRevision ?? sourceNamespace ?? "draft")}`;
  createThing(world, { actor, id: transformerId, owner });
  const normalized = normalizePackageTransformerDefinition({
    id: transformerId,
    package: packageId,
    sourceRevision,
    sourceNamespace,
    targetRevision,
    targetNamespace,
    strategy,
    status,
    mappings,
    remainingGlue,
    notes
  });
  return world.emit({
    process: "definePackageTransformer",
    actor,
    claims: [
      relation(transformerId, "hasModuleKind", "packageTransformer"),
      relation(transformerId, "packageTransformerOf", normalized.package),
      ...(normalized.sourceRevision ? [relation(transformerId, "transformsFromPackageRevision", normalized.sourceRevision)] : []),
      ...(normalized.targetRevision ? [relation(transformerId, "transformsToPackageRevision", normalized.targetRevision)] : []),
      ...(normalized.sourceNamespace ? [relation(transformerId, "transformsFromPackageNamespace", normalized.sourceNamespace)] : []),
      ...(normalized.targetNamespace ? [relation(transformerId, "transformsToPackageNamespace", normalized.targetNamespace)] : [])
    ],
    body: normalized
  });
}

export function createCompiler(world, { actor, id, owner = actor }) {
  const w = createThing(world, { actor, id, owner });
  world.emit({
    process: "defineCompilerModule",
    actor,
    claims: [
      relation(id, "hasModuleKind", "compiler"),
      relation(id, "supportsProcess", "compileDescription"),
      relation(id, "produces", "compiledArtifact")
    ],
    body: { id }
  });
  return w;
}

export function createDescription(world, { actor, id, source, language = "witness-ir", owner = actor }) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "createDescription",
    actor,
    claims: [
      relation(id, "hasModuleKind", "description"),
      relation(id, "usesLanguage", language)
    ],
    body: { id, source, language }
  });
}

export function compileDescription(world, { actor, compiler, description, output }) {
  const rels = world.project(witnessRelations);
  const canCompile = rels.some(r => r.from === compiler && r.rel === "supportsProcess" && r.to === "compileDescription");
  const isDescription = rels.some(r => r.from === description && r.rel === "hasModuleKind" && r.to === "description");

  if (!canCompile || !isDescription) {
    return world.emit({
      process: "compileDescription.failed",
      actor,
      claims: [],
      body: { compiler, description, output, reason: !canCompile ? "compiler cannot compile" : "input is not a description" }
    });
  }

  return world.emit({
    process: "compileDescription",
    actor,
    claims: [
      thing(output),
      relation(actor, "owns", output),
      relation(output, "compiledFrom", description),
      relation(output, "compiledBy", compiler),
      relation(output, "hasModuleKind", "compiledArtifact")
    ],
    body: { compiler, description, output }
  });
}

// Hosts a runner answers to, normalized for Host-header matching: lowercased, port stripped,
// de-duplicated. A null/empty list means the runner is not host-bound (legacy single-runner case).
export function normalizeRunnerHosts(hosts) {
  if (!Array.isArray(hosts)) return null;
  const normalized = [...new Set(
    hosts
      .map(value => (typeof value === "string" ? value.trim().toLowerCase().replace(/:\d+$/, "") : ""))
      .filter(Boolean)
  )];
  return normalized.length ? normalized : null;
}

export function createServerRunner(world, {
  actor,
  id,
  owner = actor,
  backendHost = null,
  frontendHost = null,
  runtimeProfile = null,
  handlerSet = null,
  actors = null,
  storage = null,
  runtimeConfig = null,
  allowActorHeader = false,
  hosts = null,
  default: isDefault = false,
  context = null,
  values = null
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineServerRunner",
    actor,
    claims: [
      relation(id, "hasModuleKind", "serverRunner"),
      relation(id, "supportsProcess", "serveRoute"),
      relation(id, "hostBoundary", "http"),
      ...(context ? [relation(id, "inContext", context)] : []),
      ...(backendHost ? [relation(id, "usesBackendHost", backendHost)] : []),
      ...(frontendHost ? [relation(id, "usesFrontendHost", frontendHost)] : [])
    ],
    body: {
      id,
      backendHost: backendHost ? String(backendHost) : null,
      frontendHost: frontendHost ? String(frontendHost) : null,
      runtimeProfile: runtimeProfile ? String(runtimeProfile) : null,
      handlerSet: handlerSet ? String(handlerSet) : null,
      actors: Array.isArray(actors) ? [...actors] : null,
      storage: storage && typeof storage === "object" ? { ...storage } : null,
      runtimeConfig: runtimeConfig && typeof runtimeConfig === "object" ? { ...runtimeConfig } : null,
      allowActorHeader: allowActorHeader === true,
      hosts: normalizeRunnerHosts(hosts),
      default: isDefault === true,
      context: context ? String(context) : null,
      values: values && typeof values === "object" ? structuredClone(values) : null
    }
  });
}

export function createMcpServer(world, {
  actor,
  id,
  label = id,
  serverRunner,
  serviceIdentity = null,
  transports = ["stdio", "http"],
  context = null,
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  const normalizedTransports = [...new Set((Array.isArray(transports) ? transports : []).map(value => String(value).trim()).filter(Boolean))];
  return world.emit({
    process: "defineMcpServer",
    actor,
    claims: [
      relation(id, "hasModuleKind", "mcpServer"),
      relation(id, "usesServerRunner", serverRunner),
      ...(context ? [relation(id, "inContext", context)] : []),
      ...(serviceIdentity ? [relation(id, "serviceIdentity", serviceIdentity)] : []),
      ...normalizedTransports.map(transport => relation(id, "supportsTransport", transport))
    ],
    body: {
      id,
      label: String(label ?? id),
      serverRunner: String(serverRunner),
      serviceIdentity: serviceIdentity ? String(serviceIdentity) : null,
      transports: normalizedTransports,
      context: context ? String(context) : null
    }
  });
}

export function installMcpTool(world, {
  actor,
  server,
  tool,
  actingMode = "delegated",
  scopeContexts = [],
  scopeTargets = []
}) {
  const normalizedScopeContexts = [...new Set((Array.isArray(scopeContexts) ? scopeContexts : []).map(String).filter(Boolean))];
  const normalizedScopeTargets = [...new Set((Array.isArray(scopeTargets) ? scopeTargets : []).map(String).filter(Boolean))];
  return world.emit({
    process: "installMcpTool",
    actor,
    claims: [
      relation(server, "exposesMcpTool", tool, {
        actingMode: String(actingMode || "delegated"),
        scopeContexts: normalizedScopeContexts,
        scopeTargets: normalizedScopeTargets
      })
    ],
    body: {
      server: String(server),
      tool: String(tool),
      actingMode: String(actingMode || "delegated"),
      scopeContexts: normalizedScopeContexts,
      scopeTargets: normalizedScopeTargets
    }
  });
}

export function removeMcpTool(world, {
  actor,
  server,
  tool
}) {
  return world.emit({
    process: "removeMcpTool",
    actor,
    claims: [retract(server, "exposesMcpTool", tool)],
    body: {
      server: String(server),
      tool: String(tool)
    }
  });
}

export function createIdentity(world, {
  actor,
  id,
  identityActor,
  label,
  username,
  password,
  displayName = null,
  jobTitle = null,
  initials = null,
  sourceryMuteRules = null,
  homePerspective = null,
  homeContext = null,
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineIdentity",
    actor,
    claims: [
      relation(id, "hasModuleKind", "identity"),
      relation(id, "identityActor", identityActor),
      ...(homeContext ? [relation(id, "homeContext", homeContext)] : []),
      ...(homePerspective ? [relation(id, "homePerspective", homePerspective)] : [])
    ],
    body: {
      id,
      actor: String(identityActor),
      label: String(label),
      username: String(username),
      password: String(password),
      displayName: displayName ? String(displayName) : null,
      jobTitle: jobTitle ? String(jobTitle) : null,
      initials: initials ? String(initials) : null,
      sourceryMuteRules: Array.isArray(sourceryMuteRules) ? structuredClone(sourceryMuteRules) : [],
      homeContext: homeContext ? String(homeContext) : null,
      homePerspective: homePerspective ? String(homePerspective) : null
    }
  });
}

export function createMaterializedView(world, {
  actor,
  id,
  title = id,
  kind = "generic",
  sliceKey = null,
  modelView = null,
  maintenance = "on-demand",
  storageClass = "memory",
  resourceBudgetClass = null,
  blocking = true,
  ttlMs = 0,
  sourceProjectors = [],
  sourceWitnessProcesses = [],
  invalidation = null,
  owner = actor,
  values = null
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "materializedView.define",
    actor,
    claims: [
      relation(id, "hasModuleKind", "materializedView")
    ],
    body: {
      id: String(id),
      title: String(title ?? id),
      kind: String(kind || "generic"),
      sliceKey: typeof sliceKey === "string" && sliceKey.trim() ? sliceKey.trim() : null,
      modelView: typeof modelView === "string" && modelView.trim() ? modelView.trim() : null,
      maintenance: typeof maintenance === "string" && maintenance.trim() ? maintenance.trim() : "on-demand",
      storageClass: typeof storageClass === "string" && storageClass.trim() ? storageClass.trim() : "memory",
      resourceBudgetClass: typeof resourceBudgetClass === "string" && resourceBudgetClass.trim() ? resourceBudgetClass.trim() : null,
      blocking: blocking !== false,
      ttlMs: Number(ttlMs || 0),
      sourceProjectors: Array.isArray(sourceProjectors) ? [...new Set(sourceProjectors.map(String).filter(Boolean))] : [],
      sourceWitnessProcesses: Array.isArray(sourceWitnessProcesses) ? [...new Set(sourceWitnessProcesses.map(String).filter(Boolean))] : [],
      invalidation: invalidation && typeof invalidation === "object" ? structuredClone(invalidation) : null,
      values: values && typeof values === "object" ? structuredClone(values) : null
    }
  });
}

export function updateIdentity(world, {
  actor,
  id,
  label,
  username,
  password,
  displayName = null,
  jobTitle = null,
  initials = null,
  sourceryMuteRules = null,
  homeContext = null,
  homePerspective = null
}) {
  const existing = moduleProjectors.identityIndex(world.allWitnesses()).byId[id] ?? null;
  const nextHomeContext = homeContext ? String(homeContext) : null;
  const nextHomePerspective = homePerspective ? String(homePerspective) : null;
  const claims = [
    relation(id, "hasModuleKind", "identity"),
    ...(existing?.actor ? [relation(id, "identityActor", existing.actor)] : [])
  ];
  if (existing?.homeContext && existing.homeContext !== nextHomeContext) {
    claims.push(retract(id, "homeContext", existing.homeContext));
  }
  if (nextHomeContext) claims.push(relation(id, "homeContext", nextHomeContext));
  if (existing?.homePerspective && existing.homePerspective !== nextHomePerspective) {
    claims.push(retract(id, "homePerspective", existing.homePerspective));
  }
  if (nextHomePerspective) claims.push(relation(id, "homePerspective", nextHomePerspective));
  return world.emit({
    process: "updateIdentity",
    actor,
    claims,
    body: {
      id: String(id),
      actor: String(existing?.actor || ""),
      label: String(label),
      username: String(username),
      password: String(password),
      displayName: displayName ? String(displayName) : null,
      jobTitle: jobTitle ? String(jobTitle) : null,
      initials: initials ? String(initials) : null,
      sourceryMuteRules: Array.isArray(sourceryMuteRules)
        ? structuredClone(sourceryMuteRules)
        : (existing?.sourceryMuteRules ? structuredClone(existing.sourceryMuteRules) : []),
      homeContext: nextHomeContext,
      homePerspective: nextHomePerspective
    }
  });
}

export function defineAuthRole(world, {
  actor,
  id,
  label = id,
  description = "",
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineAuthRole",
    actor,
    claims: [
      relation(id, "hasModuleKind", "authRole")
    ],
    body: {
      id: String(id),
      label: String(label ?? id),
      description: String(description ?? "")
    }
  });
}

export function updateAuthRole(world, {
  actor,
  id,
  label = id,
  description = ""
}) {
  return world.emit({
    process: "updateAuthRole",
    actor,
    claims: [
      relation(id, "hasModuleKind", "authRole")
    ],
    body: {
      id: String(id),
      label: String(label ?? id),
      description: String(description ?? "")
    }
  });
}

export function grantIdentityRole(world, {
  actor,
  identityId,
  roleId
}) {
  return world.emit({
    process: "grantIdentityRole",
    actor,
    claims: [
      relation(identityId, "hasAuthRole", roleId)
    ],
    body: {
      identityId: String(identityId),
      roleId: String(roleId)
    }
  });
}

export function revokeIdentityRole(world, {
  actor,
  identityId,
  roleId
}) {
  return world.emit({
    process: "revokeIdentityRole",
    actor,
    claims: [
      retract(identityId, "hasAuthRole", roleId)
    ],
    body: {
      identityId: String(identityId),
      roleId: String(roleId)
    }
  });
}

function identityActorAssumptionGrantId(identityId, targetActor) {
  return `${String(identityId)}=>${String(targetActor)}`;
}

export function grantIdentityActorAssumption(world, {
  actor,
  identityId,
  targetActor
}) {
  return world.emit({
    process: "grantIdentityActorAssumption",
    actor,
    claims: [
      relation(identityId, "mayAssumeActor", targetActor)
    ],
    body: {
      id: identityActorAssumptionGrantId(identityId, targetActor),
      identityId: String(identityId),
      targetActor: String(targetActor)
    }
  });
}

export function revokeIdentityActorAssumption(world, {
  actor,
  identityId,
  targetActor
}) {
  return world.emit({
    process: "revokeIdentityActorAssumption",
    actor,
    claims: [
      retract(identityId, "mayAssumeActor", targetActor)
    ],
    body: {
      id: identityActorAssumptionGrantId(identityId, targetActor),
      identityId: String(identityId),
      targetActor: String(targetActor)
    }
  });
}

export function setAppFeatureAccessPolicy(world, {
  actor,
  featureId,
  label = featureId,
  appId = "",
  requireAuth = false,
  visibilityMode = "normal",
  allowedRoles = [],
  guestBehavior = "allow",
  deniedBehavior = "403",
  owner = actor
}) {
  createThing(world, { actor, id: featureId, owner });
  return world.emit({
    process: "setAppFeatureAccessPolicy",
    actor,
    claims: [
      relation(featureId, "hasModuleKind", "appFeatureAccessPolicy")
    ],
    body: {
      id: String(featureId),
      featureId: String(featureId),
      label: String(label ?? featureId),
      appId: String(appId ?? ""),
      requireAuth: requireAuth === true,
      visibilityMode: String(visibilityMode || "normal"),
      allowedRoles: [...new Set((Array.isArray(allowedRoles) ? allowedRoles : []).map(String).filter(Boolean))],
      guestBehavior: String(guestBehavior || "allow"),
      deniedBehavior: String(deniedBehavior || "403")
    }
  });
}

export function defineContext(world, {
  actor,
  id,
  label = id,
  parent = null,
  owner = actor,
  stewards = []
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineContext",
    actor,
    claims: [
      relation(id, "hasModuleKind", "context"),
      relation(id, "contextActor", actor),
      ...(parent ? [relation(id, "parentContext", parent)] : []),
      ...[...new Set((Array.isArray(stewards) ? stewards : []).map(String).filter(Boolean))].map(steward => relation(steward, "stewards", id, { targetKind: "context" }))
    ],
    body: {
      id: String(id),
      label: String(label ?? id),
      actor: String(actor),
      parent: parent ? String(parent) : null,
      owner: String(owner ?? actor),
      stewards: [...new Set((Array.isArray(stewards) ? stewards : []).map(String).filter(Boolean))]
    }
  });
}

export function definePerspective(world, {
  actor,
  id,
  title,
  context = null,
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "definePerspective",
    actor,
    claims: [
      relation(id, "hasModuleKind", "perspective"),
      relation(id, "hasTitle", title),
      ...(context ? [relation(id, "inContext", context)] : [])
    ],
    body: {
      id: String(id),
      title: String(title),
      context: context ? String(context) : null
    }
  });
}

export function grantStewardship(world, {
  actor,
  steward,
  target,
  targetKind = null
}) {
  return world.emit({
    process: "grantStewardship",
    actor,
    claims: [relation(steward, "stewards", target, targetKind ? { targetKind: String(targetKind) } : {})],
    body: {
      steward: String(steward),
      target: String(target),
      targetKind: targetKind ? String(targetKind) : null
    }
  });
}

export function revokeStewardship(world, {
  actor,
  steward,
  target,
  targetKind = null
}) {
  return world.emit({
    process: "revokeStewardship",
    actor,
    claims: [retract(steward, "stewards", target)],
    body: {
      steward: String(steward),
      target: String(target),
      targetKind: targetKind ? String(targetKind) : null
    }
  });
}

export function createProposal(world, {
  actor,
  id,
  targetProcess,
  targetKind,
  targetId = null,
  body,
  reason = null,
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "createProposal",
    actor,
    claims: [relation(id, "hasModuleKind", "proposal")],
    body: {
      id: String(id),
      proposer: String(actor),
      targetProcess: String(targetProcess),
      targetKind: String(targetKind),
      targetId: targetId ? String(targetId) : null,
      body: body && typeof body === "object" ? body : {},
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      status: "open"
    }
  });
}

export function approveProposal(world, {
  actor,
  id,
  executedWitnessIds = []
}) {
  return world.emit({
    process: "approveProposal",
    actor,
    claims: [],
    body: {
      id: String(id),
      approver: String(actor),
      status: "approved",
      executedWitnessIds: [...new Set((Array.isArray(executedWitnessIds) ? executedWitnessIds : []).map(String).filter(Boolean))]
    }
  });
}

export function rejectProposal(world, {
  actor,
  id,
  reason = null
}) {
  return world.emit({
    process: "rejectProposal",
    actor,
    claims: [],
    body: {
      id: String(id),
      reviewer: String(actor),
      status: "rejected",
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null
    }
  });
}

export function bindContextName(world, {
  actor,
  context,
  name,
  target
}) {
  return world.emit({
    process: "context.bind",
    actor,
    claims: [relation(String(context), localNameRel(name), String(target))],
    body: {
      context: String(context),
      name: String(name),
      target: String(target)
    }
  });
}

export function unbindContextName(world, {
  actor,
  context,
  name,
  target
}) {
  return world.emit({
    process: "context.unbind",
    actor,
    claims: [retract(String(context), localNameRel(name), String(target))],
    body: {
      context: String(context),
      name: String(name),
      target: String(target)
    }
  });
}

export function exportContextName(world, {
  actor,
  context,
  name,
  target
}) {
  return world.emit({
    process: "context.export",
    actor,
    claims: [relation(String(context), exportNameRel(name), String(target))],
    body: {
      context: String(context),
      name: String(name),
      target: String(target)
    }
  });
}

export function unexportContextName(world, {
  actor,
  context,
  name,
  target
}) {
  return world.emit({
    process: "context.unexport",
    actor,
    claims: [retract(String(context), exportNameRel(name), String(target))],
    body: {
      context: String(context),
      name: String(name),
      target: String(target)
    }
  });
}

export function importContextName(world, {
  actor,
  context,
  sourceContext,
  exportName,
  name = exportName
}) {
  return world.emit({
    process: "context.import",
    actor,
    claims: [relation(String(context), importNameRel(name), importTargetValue(sourceContext, exportName))],
    body: {
      context: String(context),
      sourceContext: String(sourceContext),
      exportName: String(exportName),
      name: String(name ?? exportName)
    }
  });
}

export function unimportContextName(world, {
  actor,
  context,
  sourceContext,
  exportName,
  name = exportName
}) {
  return world.emit({
    process: "context.unimport",
    actor,
    claims: [retract(String(context), importNameRel(name), importTargetValue(sourceContext, exportName))],
    body: {
      context: String(context),
      sourceContext: String(sourceContext),
      exportName: String(exportName),
      name: String(name ?? exportName)
    }
  });
}

function contextExistsInWitnesses(witnesses, context) {
  return moduleProjectors.contexts(witnesses).some(row => row.id === context);
}

function targetExistsInWitnesses(witnesses, target) {
  return projectors.things(witnesses).has(target);
}

function visibleContextScopeRows(witnesses, {
  context,
  name
}) {
  return moduleProjectors.contextScopes(witnesses)
    .filter(row => row.context === context && row.name === name);
}

function localContextBindingExists(witnesses, {
  context,
  target
}) {
  return moduleProjectors.contextBindings(witnesses)
    .some(row => row.context === context && row.target === target);
}

function contextExportExists(witnesses, {
  context,
  name,
  target
}) {
  return moduleProjectors.contextExports(witnesses)
    .some(row => row.context === context && row.name === name && row.target === target);
}

function contextImportExists(witnesses, {
  context,
  sourceContext,
  exportName,
  name
}) {
  return moduleProjectors.contextImports(witnesses)
    .some(row =>
      row.context === context
      && row.sourceContext === sourceContext
      && row.exportName === exportName
      && row.name === name
    );
}

const CONTEXT_MODEL_INDEX_NAME = "module.contextModel";
const CONTEXT_NAMING_INDEX_NAME = "module.contextNaming";

function cloneContextRow(row) {
  return {
    ...row,
    imports: Array.isArray(row?.imports) ? row.imports.map(spec => ({ ...spec })) : row?.imports,
    targets: Array.isArray(row?.targets) ? [...row.targets] : row?.targets,
    sourceKinds: Array.isArray(row?.sourceKinds) ? [...row.sourceKinds] : row?.sourceKinds,
    localTargets: Array.isArray(row?.localTargets) ? [...row.localTargets] : row?.localTargets,
    importedTargets: Array.isArray(row?.importedTargets) ? [...row.importedTargets] : row?.importedTargets,
    witnesses: Array.isArray(row?.witnesses) ? [...row.witnesses] : row?.witnesses,
    rows: Array.isArray(row?.rows) ? row.rows.map(spec => ({ ...spec })) : row?.rows
  };
}

function worldContextIndexState(world) {
  if (typeof world?.registerIndex !== "function" || typeof world?.readIndex !== "function") return null;
  world.registerIndex(CONTEXT_MODEL_INDEX_NAME, contextModelIndexSpec);
  world.registerIndex(CONTEXT_NAMING_INDEX_NAME, contextNamingIndexSpec);
  return {
    model: world.readIndex(CONTEXT_MODEL_INDEX_NAME, { snapshot: false }),
    naming: world.readIndex(CONTEXT_NAMING_INDEX_NAME, { snapshot: false })
  };
}

function contextKey(context, name) {
  return `${context}${CONTEXT_REF_SEP}${name}`;
}

function collectVisibleContextScopeRowsFromState(state, {
  context,
  name
}) {
  const key = contextKey(context, name);
  const rows = [];
  for (const row of state.naming.bindingsByKey.get(key)?.values() ?? []) {
    rows.push({
      context: row.context,
      name: row.name,
      target: row.target,
      sourceKind: "local",
      sourceContext: null,
      exportName: null,
      witness: row.witness
    });
  }
  for (const row of state.naming.importsByKey.get(key)?.values() ?? []) {
    const exported = state.naming.exportsByKey.get(contextKey(row.sourceContext, row.exportName));
    if (!exported?.size) continue;
    for (const exportRow of exported.values()) {
      rows.push({
        context: row.context,
        name: row.name,
        target: exportRow.target,
        sourceKind: "import",
        sourceContext: row.sourceContext,
        exportName: row.exportName,
        witness: row.witness
      });
    }
  }
  return rows.sort((a, b) =>
    String(a.context).localeCompare(String(b.context))
    || String(a.name).localeCompare(String(b.name))
    || String(a.sourceKind).localeCompare(String(b.sourceKind))
    || String(a.target).localeCompare(String(b.target))
  );
}

function explainContextualNameFromState(state, {
  context,
  name
}) {
  const wantedContext = typeof context === "string" && context.trim() ? context.trim() : "";
  const wantedName = typeof name === "string" && name.trim() ? name.trim() : "";
  if (!wantedContext || !wantedName) {
    return {
      ok: false,
      context: wantedContext || null,
      name: wantedName || null,
      resolution: "invalid",
      target: null,
      targets: [],
      rows: [],
      reason: "context and name are required for contextual resolution"
    };
  }
  const rows = collectVisibleContextScopeRowsFromState(state, { context: wantedContext, name: wantedName });
  if (!rows.length) {
    return {
      ok: false,
      context: wantedContext,
      name: wantedName,
      resolution: "missing",
      target: null,
      targets: [],
      rows: [],
      reason: `name not visible in context: ${wantedName}`
    };
  }
  const targets = uniqueSortedStrings(rows.map(row => row.target));
  if (targets.length !== 1) {
    return {
      ok: false,
      context: wantedContext,
      name: wantedName,
      resolution: "ambiguous",
      target: null,
      targets,
      rows: rows.map(row => ({ ...row })),
      reason: `name resolves ambiguously in context: ${wantedName}`
    };
  }
  const sourceKinds = uniqueSortedStrings(rows.map(row => row.sourceKind));
  return {
    ok: true,
    context: wantedContext,
    name: wantedName,
    resolution: sourceKinds.includes("local") ? "local" : "import",
    target: targets[0],
    targets,
    rows: rows.map(row => ({ ...row })),
    reason: sourceKinds.includes("local")
      ? `name resolves through a local binding in context: ${wantedName}`
      : `name resolves through an imported binding in context: ${wantedName}`
  };
}

function explainContextualTargetVisibilityFromState(state, {
  context,
  target
}) {
  const authoringContext = typeof context === "string" && context.trim() ? context.trim() : "";
  const canonicalTarget = typeof target === "string" && target.trim() ? target.trim() : "";
  if (!authoringContext || !canonicalTarget) {
    return {
      ok: false,
      context: authoringContext || null,
      target: canonicalTarget || null,
      visible: false,
      visibility: "invalid",
      targetContext: null,
      names: [],
      rows: [],
      reason: "context and target are required for visibility explanation"
    };
  }
  if (!state.model.thingIds.has(canonicalTarget)) {
    return {
      ok: false,
      context: authoringContext,
      target: canonicalTarget,
      visible: false,
      visibility: "missing-target",
      targetContext: null,
      names: [],
      rows: [],
      reason: `target not found: ${canonicalTarget}`
    };
  }
  const rows = [];
  for (const row of state.naming.bindingsByKey.values()) {
    for (const spec of row.values()) {
      if (spec.context === authoringContext && spec.target === canonicalTarget) {
        rows.push({
          context: spec.context,
          name: spec.name,
          target: spec.target,
          sourceKind: "local",
          sourceContext: null,
          exportName: null,
          witness: spec.witness
        });
      }
    }
  }
  for (const row of state.naming.importsByKey.values()) {
    for (const spec of row.values()) {
      if (spec.context !== authoringContext) continue;
      const exported = state.naming.exportsByKey.get(contextKey(spec.sourceContext, spec.exportName));
      if (!exported?.size) continue;
      for (const exportRow of exported.values()) {
        if (exportRow.target !== canonicalTarget) continue;
        rows.push({
          context: spec.context,
          name: spec.name,
          target: exportRow.target,
          sourceKind: "import",
          sourceContext: spec.sourceContext,
          exportName: spec.exportName,
          witness: spec.witness
        });
      }
    }
  }
  const names = uniqueSortedStrings(rows.map(row => row.name));
  const targetContext = state.model.objectContexts.get(canonicalTarget) ?? null;
  if (!targetContext && rows.length) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: rows.some(row => row.sourceKind === "import") ? "import" : "local",
      targetContext,
      names,
      rows,
      reason: rows.some(row => row.sourceKind === "import")
        ? `target is visible in context ${authoringContext} through explicit import or binding`
        : `target is locally bound in context ${authoringContext}`
    };
  }
  if (!targetContext) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: "unscoped",
      targetContext,
      names,
      rows,
      reason: `target is unscoped and remains canonically visible in context ${authoringContext}`
    };
  }
  if (targetContext === authoringContext) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: rows.some(row => row.sourceKind === "local") ? "local" : "same-context",
      targetContext,
      names,
      rows,
      reason: rows.some(row => row.sourceKind === "local")
        ? `target is locally bound in context ${authoringContext}`
        : `target belongs to authoring context ${authoringContext}`
    };
  }
  if (rows.length) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: "import",
      targetContext,
      names,
      rows,
      reason: `target is visible in context ${authoringContext} through explicit import or binding`
    };
  }
  return {
    ok: false,
    context: authoringContext,
    target: canonicalTarget,
    visible: false,
    visibility: "hidden",
    targetContext,
    names,
    rows,
    reason: `target ${canonicalTarget} belongs to context ${targetContext} and is not visible in authoring context ${authoringContext}`
  };
}

function classifyCanonicalIdPolicyFromState(state, {
  context,
  target
}) {
  const visibility = explainContextualTargetVisibilityFromState(state, { context, target });
  if (!visibility.ok) {
    return {
      ok: false,
      policyClass: null,
      reason: visibility.reason,
      visibility
    };
  }
  if (visibility.targetContext === context) {
    return {
      ok: true,
      policyClass: "same-context-convenience",
      visibility
    };
  }
  if (visibility.targetContext) {
    return {
      ok: true,
      policyClass: "imported-target-reference",
      visibility
    };
  }
  if (visibility.visibility === "unscoped") {
    return {
      ok: true,
      policyClass: "legacy-only-path",
      visibility
    };
  }
  return {
    ok: true,
    policyClass: null,
    visibility
  };
}

export function validateContextBinding(witnesses, {
  context,
  name,
  target
}) {
  if (!contextExistsInWitnesses(witnesses, context)) {
    return { ok: false, status: 404, error: "context not found", details: { context } };
  }
  if (!targetExistsInWitnesses(witnesses, target)) {
    return { ok: false, status: 404, error: "target not found", details: { target } };
  }
  const targetContext = moduleProjectors.objectContexts(witnesses).get(target) ?? null;
  if (targetContext && targetContext !== context) {
    return {
      ok: false,
      status: 400,
      error: "target belongs to a different context",
      details: { context, target, targetContext }
    };
  }
  if (visibleContextScopeRows(witnesses, { context, name }).length) {
    return { ok: false, status: 409, error: "name already visible in context", details: { context, name } };
  }
  if (moduleProjectors.contextBindings(witnesses).some(row => row.context === context && row.name === name && row.target === target)) {
    return { ok: false, status: 409, error: "binding already exists", details: { context, name, target } };
  }
  return { ok: true };
}

export function validateContextExport(witnesses, {
  context,
  name,
  target
}) {
  if (!contextExistsInWitnesses(witnesses, context)) {
    return { ok: false, status: 404, error: "context not found", details: { context } };
  }
  if (!targetExistsInWitnesses(witnesses, target)) {
    return { ok: false, status: 404, error: "target not found", details: { target } };
  }
  if (!localContextBindingExists(witnesses, { context, target })) {
    return {
      ok: false,
      status: 400,
      error: "target is not locally bound in context",
      details: { context, target }
    };
  }
  if (moduleProjectors.contextExports(witnesses).some(row => row.context === context && row.name === name)) {
    return { ok: false, status: 409, error: "export name already exists", details: { context, name } };
  }
  if (contextExportExists(witnesses, { context, name, target })) {
    return { ok: false, status: 409, error: "export already exists", details: { context, name, target } };
  }
  return { ok: true };
}

export function validateContextImport(witnesses, {
  context,
  sourceContext,
  exportName,
  name = exportName
}) {
  const localName = String(name ?? exportName);
  if (!contextExistsInWitnesses(witnesses, context)) {
    return { ok: false, status: 404, error: "context not found", details: { context } };
  }
  if (!contextExistsInWitnesses(witnesses, sourceContext)) {
    return { ok: false, status: 404, error: "source context not found", details: { sourceContext } };
  }
  const exported = moduleProjectors.contextExports(witnesses)
    .find(row => row.context === sourceContext && row.name === exportName);
  if (!exported) {
    return {
      ok: false,
      status: 400,
      error: "exported name not found",
      details: { sourceContext, exportName }
    };
  }
  if (visibleContextScopeRows(witnesses, { context, name: localName }).length) {
    return { ok: false, status: 409, error: "name already visible in context", details: { context, name: localName } };
  }
  if (contextImportExists(witnesses, { context, sourceContext, exportName, name: localName })) {
    return {
      ok: false,
      status: 409,
      error: "import already exists",
      details: { context, sourceContext, exportName, name: localName }
    };
  }
  return { ok: true, name: localName, target: exported.target };
}

export function validateContextBindingInWorld(world, input) {
  const state = worldContextIndexState(world);
  if (!state) return validateContextBinding(world.allWitnesses(), input);
  const { context, name, target } = input;
  if (!state.model.contextIds.has(context)) {
    return { ok: false, status: 404, error: "context not found", details: { context } };
  }
  if (!state.model.thingIds.has(target)) {
    return { ok: false, status: 404, error: "target not found", details: { target } };
  }
  const targetContext = state.model.objectContexts.get(target) ?? null;
  if (targetContext && targetContext !== context) {
    return {
      ok: false,
      status: 400,
      error: "target belongs to a different context",
      details: { context, target, targetContext }
    };
  }
  if (collectVisibleContextScopeRowsFromState(state, { context, name }).length) {
    return { ok: false, status: 409, error: "name already visible in context", details: { context, name } };
  }
  const existing = state.naming.bindingsByKey.get(contextKey(context, name));
  if (existing?.has(target)) {
    return { ok: false, status: 409, error: "binding already exists", details: { context, name, target } };
  }
  return { ok: true };
}

export function validateContextExportInWorld(world, input) {
  const state = worldContextIndexState(world);
  if (!state) return validateContextExport(world.allWitnesses(), input);
  const { context, name, target } = input;
  if (!state.model.contextIds.has(context)) {
    return { ok: false, status: 404, error: "context not found", details: { context } };
  }
  if (!state.model.thingIds.has(target)) {
    return { ok: false, status: 404, error: "target not found", details: { target } };
  }
  if (!state.naming.bindingTargetCountsByContext.get(context)?.has(target)) {
    return {
      ok: false,
      status: 400,
      error: "target is not locally bound in context",
      details: { context, target }
    };
  }
  const existing = state.naming.exportsByKey.get(contextKey(context, name));
  if (existing?.size) {
    return { ok: false, status: 409, error: "export name already exists", details: { context, name } };
  }
  return { ok: true };
}

export function validateContextImportInWorld(world, input) {
  const state = worldContextIndexState(world);
  if (!state) return validateContextImport(world.allWitnesses(), input);
  const { context, sourceContext, exportName } = input;
  const localName = String(input.name ?? exportName);
  if (!state.model.contextIds.has(context)) {
    return { ok: false, status: 404, error: "context not found", details: { context } };
  }
  if (!state.model.contextIds.has(sourceContext)) {
    return { ok: false, status: 404, error: "source context not found", details: { sourceContext } };
  }
  const exported = state.naming.exportsByKey.get(contextKey(sourceContext, exportName));
  const exportRow = exported?.values()?.next?.().value ?? null;
  if (!exportRow) {
    return {
      ok: false,
      status: 400,
      error: "exported name not found",
      details: { sourceContext, exportName }
    };
  }
  if (collectVisibleContextScopeRowsFromState(state, { context, name: localName }).length) {
    return { ok: false, status: 409, error: "name already visible in context", details: { context, name: localName } };
  }
  const identity = `${context}${CONTEXT_REF_SEP}${localName}${CONTEXT_REF_SEP}${sourceContext}${CONTEXT_REF_SEP}${exportName}`;
  if (state.naming.importsByKey.get(contextKey(context, localName))?.has(identity)) {
    return {
      ok: false,
      status: 409,
      error: "import already exists",
      details: { context, sourceContext, exportName, name: localName }
    };
  }
  return { ok: true, name: localName, target: exportRow.target };
}

function contextBindingRows(witnesses) {
  const rows = [];
  for (const row of currentRelations(witnesses)) {
    const name = parseNamedRelation(NAME_REL_PREFIX, row.rel);
    if (!name) continue;
    rows.push({
      context: row.from,
      name,
      target: row.to,
      witness: row.witness
    });
  }
  return rows.sort((a, b) =>
    String(a.context).localeCompare(String(b.context))
    || String(a.name).localeCompare(String(b.name))
    || String(a.target).localeCompare(String(b.target))
  );
}

function contextExportRows(witnesses) {
  const rows = [];
  for (const row of currentRelations(witnesses)) {
    const name = parseNamedRelation(EXPORT_REL_PREFIX, row.rel);
    if (!name) continue;
    rows.push({
      context: row.from,
      name,
      target: row.to,
      witness: row.witness
    });
  }
  return rows.sort((a, b) =>
    String(a.context).localeCompare(String(b.context))
    || String(a.name).localeCompare(String(b.name))
    || String(a.target).localeCompare(String(b.target))
  );
}

function contextImportRows(witnesses) {
  const rows = [];
  for (const row of currentRelations(witnesses)) {
    const name = parseNamedRelation(IMPORT_REL_PREFIX, row.rel);
    if (!name) continue;
    const parsed = parseImportTargetValue(row.to);
    if (!parsed) continue;
    rows.push({
      context: row.from,
      name,
      sourceContext: parsed.sourceContext,
      exportName: parsed.exportName,
      witness: row.witness
    });
  }
  return rows.sort((a, b) =>
    String(a.context).localeCompare(String(b.context))
    || String(a.name).localeCompare(String(b.name))
    || String(a.sourceContext).localeCompare(String(b.sourceContext))
    || String(a.exportName).localeCompare(String(b.exportName))
  );
}

function exportIndex(witnesses) {
  const map = new Map();
  for (const row of contextExportRows(witnesses)) {
    map.set(`${row.context}${CONTEXT_REF_SEP}${row.name}`, row);
  }
  return map;
}

function uniqueSortedStrings(values) {
  return [...new Set((values ?? []).map(value => String(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function contextNameResolutionRows(witnesses) {
  const grouped = new Map();
  for (const row of moduleProjectors.contextScopes(witnesses)) {
    const key = `${row.context}${CONTEXT_REF_SEP}${row.name}`;
    const current = grouped.get(key) ?? {
      context: row.context,
      name: row.name,
      resolution: "resolved",
      target: null,
      targets: [],
      sourceKinds: [],
      localTargets: [],
      importedTargets: [],
      imports: [],
      witnesses: [],
      rows: []
    };
    current.targets.push(row.target);
    current.sourceKinds.push(row.sourceKind);
    if (row.sourceKind === "local") current.localTargets.push(row.target);
    if (row.sourceKind === "import") {
      current.importedTargets.push(row.target);
      current.imports.push({
        sourceContext: row.sourceContext ?? null,
        exportName: row.exportName ?? null,
        target: row.target
      });
    }
    if (row.witness) current.witnesses.push(row.witness);
    current.rows.push({ ...row });
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map(row => {
      const targets = uniqueSortedStrings(row.targets);
      const sourceKinds = uniqueSortedStrings(row.sourceKinds);
      const localTargets = uniqueSortedStrings(row.localTargets);
      const importedTargets = uniqueSortedStrings(row.importedTargets);
      const witnesses = uniqueSortedStrings(row.witnesses);
      const imports = row.imports
        .map(spec => ({
          sourceContext: spec.sourceContext,
          exportName: spec.exportName,
          target: spec.target
        }))
        .sort((a, b) =>
          String(a.sourceContext).localeCompare(String(b.sourceContext))
          || String(a.exportName).localeCompare(String(b.exportName))
          || String(a.target).localeCompare(String(b.target))
        );
      return {
        context: row.context,
        name: row.name,
        resolution: targets.length === 1 ? "resolved" : "ambiguous",
        target: targets.length === 1 ? targets[0] : null,
        targets,
        sourceKinds,
        localTargets,
        importedTargets,
        imports,
        witnesses,
        rows: row.rows
      };
    })
    .sort((a, b) =>
      String(a.context).localeCompare(String(b.context))
      || String(a.name).localeCompare(String(b.name))
    );
}

function contextNameConflictRows(witnesses) {
  return contextNameResolutionRows(witnesses)
    .filter(row => row.resolution === "ambiguous")
    .map(row => ({
      context: row.context,
      name: row.name,
      targets: [...row.targets],
      sourceKinds: [...row.sourceKinds],
      imports: row.imports.map(spec => ({ ...spec })),
      witnesses: [...row.witnesses],
      rows: row.rows.map(spec => ({ ...spec }))
    }));
}

export function resolveContextualName(witnesses, {
  context,
  name
}) {
  const explanation = explainContextualName(witnesses, { context, name });
  if (!explanation.ok) return { ok: false, error: explanation.reason };
  return { ok: true, target: explanation.target, row: explanation.rows[0] ?? null };
}

export function explainContextualName(witnesses, {
  context,
  name
}) {
  const wantedContext = typeof context === "string" && context.trim() ? context.trim() : "";
  const wantedName = typeof name === "string" && name.trim() ? name.trim() : "";
  if (!wantedContext || !wantedName) {
    return {
      ok: false,
      context: wantedContext || null,
      name: wantedName || null,
      resolution: "invalid",
      target: null,
      targets: [],
      rows: [],
      reason: "context and name are required for contextual resolution"
    };
  }
  const resolution = contextNameResolutionRows(witnesses)
    .find(row => row.context === wantedContext && row.name === wantedName) ?? null;
  if (!resolution) {
    return {
      ok: false,
      context: wantedContext,
      name: wantedName,
      resolution: "missing",
      target: null,
      targets: [],
      rows: [],
      reason: `name not visible in context: ${wantedName}`
    };
  }
  if (resolution.resolution !== "resolved" || !resolution.target) {
    return {
      ok: false,
      context: wantedContext,
      name: wantedName,
      resolution: "ambiguous",
      target: null,
      targets: [...resolution.targets],
      rows: resolution.rows.map(row => ({ ...row })),
      reason: `name resolves ambiguously in context: ${wantedName}`
    };
  }
  return {
    ok: true,
    context: wantedContext,
    name: wantedName,
    resolution: resolution.sourceKinds.includes("local") ? "local" : "import",
    target: resolution.target,
    targets: [...resolution.targets],
    rows: resolution.rows.map(row => ({ ...row })),
    reason: resolution.sourceKinds.includes("local")
      ? `name resolves through a local binding in context: ${wantedName}`
      : `name resolves through an imported binding in context: ${wantedName}`
  };
}

export function explainContextualNameInWorld(world, input) {
  const state = worldContextIndexState(world);
  return state ? explainContextualNameFromState(state, input) : explainContextualName(world.allWitnesses(), input);
}

export function explainContextualTargetVisibility(witnesses, {
  context,
  target
}) {
  const authoringContext = typeof context === "string" && context.trim() ? context.trim() : "";
  const canonicalTarget = typeof target === "string" && target.trim() ? target.trim() : "";
  if (!authoringContext || !canonicalTarget) {
    return {
      ok: false,
      context: authoringContext || null,
      target: canonicalTarget || null,
      visible: false,
      visibility: "invalid",
      targetContext: null,
      names: [],
      rows: [],
      reason: "context and target are required for visibility explanation"
    };
  }
  if (!projectors.things(witnesses).has(canonicalTarget)) {
    return {
      ok: false,
      context: authoringContext,
      target: canonicalTarget,
      visible: false,
      visibility: "missing-target",
      targetContext: null,
      names: [],
      rows: [],
      reason: `target not found: ${canonicalTarget}`
    };
  }
  const targetContext = moduleProjectors.objectContexts(witnesses).get(canonicalTarget) ?? null;
  const rows = moduleProjectors.contextScopes(witnesses)
    .filter(row => row.context === authoringContext && row.target === canonicalTarget)
    .map(row => ({ ...row }));
  const names = uniqueSortedStrings(rows.map(row => row.name));
  if (!targetContext && rows.length) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: rows.some(row => row.sourceKind === "import") ? "import" : "local",
      targetContext,
      names,
      rows,
      reason: rows.some(row => row.sourceKind === "import")
        ? `target is visible in context ${authoringContext} through explicit import or binding`
        : `target is locally bound in context ${authoringContext}`
    };
  }
  if (!targetContext) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: "unscoped",
      targetContext,
      names,
      rows,
      reason: `target is unscoped and remains canonically visible in context ${authoringContext}`
    };
  }
  if (targetContext === authoringContext) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: rows.some(row => row.sourceKind === "local") ? "local" : "same-context",
      targetContext,
      names,
      rows,
      reason: rows.some(row => row.sourceKind === "local")
        ? `target is locally bound in context ${authoringContext}`
        : `target belongs to authoring context ${authoringContext}`
    };
  }
  if (rows.length) {
    return {
      ok: true,
      context: authoringContext,
      target: canonicalTarget,
      visible: true,
      visibility: "import",
      targetContext,
      names,
      rows,
      reason: `target is visible in context ${authoringContext} through explicit import or binding`
    };
  }
  return {
    ok: false,
    context: authoringContext,
    target: canonicalTarget,
    visible: false,
    visibility: "hidden",
    targetContext,
    names,
    rows,
    reason: `target ${canonicalTarget} belongs to context ${targetContext} and is not visible in authoring context ${authoringContext}`
  };
}

export function explainContextualTargetVisibilityInWorld(world, input) {
  const state = worldContextIndexState(world);
  return state
    ? explainContextualTargetVisibilityFromState(state, input)
    : explainContextualTargetVisibility(world.allWitnesses(), input);
}

export const CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES = Object.freeze([
  "same-context-convenience",
  "imported-target-reference",
  "legacy-only-path"
]);

export const TRANSITIONAL_CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES = Object.freeze([
  "same-context-convenience",
  "imported-target-reference"
]);

const CONTEXTUAL_CANONICAL_ID_POLICY_CLASS_SET = new Set(CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES);

function normalizeCanonicalIdPolicyClasses(values = null) {
  if (!Array.isArray(values)) return null;
  const normalized = [...new Set(values
    .map(value => String(value || "").trim())
    .filter(value => CONTEXTUAL_CANONICAL_ID_POLICY_CLASS_SET.has(value)))];
  return normalized;
}

export function classifyCanonicalIdPolicy(witnesses, {
  context,
  target
}) {
  const authoringContext = typeof context === "string" && context.trim() ? context.trim() : "";
  const canonicalTarget = typeof target === "string" && target.trim() ? target.trim() : "";
  if (!authoringContext || !canonicalTarget) {
    return {
      ok: false,
      policyClass: null,
      reason: "context and target are required for canonical-id policy classification"
    };
  }
  const visibility = explainContextualTargetVisibility(witnesses, {
    context: authoringContext,
    target: canonicalTarget
  });
  if (!visibility.ok) {
    return {
      ok: false,
      policyClass: null,
      reason: visibility.reason,
      visibility
    };
  }
  if (visibility.targetContext === authoringContext) {
    return {
      ok: true,
      policyClass: "same-context-convenience",
      visibility
    };
  }
  if (visibility.targetContext) {
    return {
      ok: true,
      policyClass: "imported-target-reference",
      visibility
    };
  }
  if (visibility.visibility === "unscoped") {
    return {
      ok: true,
      policyClass: "legacy-only-path",
      visibility
    };
  }
  return {
    ok: true,
    policyClass: null,
    visibility
  };
}

export function classifyCanonicalIdPolicyInWorld(world, input) {
  const state = worldContextIndexState(world);
  return state
    ? classifyCanonicalIdPolicyFromState(state, input)
    : classifyCanonicalIdPolicy(world.allWitnesses(), input);
}

export function resolveContextualRef(witnesses, {
  context,
  id = null,
  ref = null,
  label = "reference",
  allowedCanonicalIdPolicyClasses = null
}) {
  const canonical = typeof id === "string" && id.trim() ? id.trim() : null;
  const contextual = typeof ref === "string" && ref.trim() ? ref.trim() : null;
  const allowedPolicyClasses = normalizeCanonicalIdPolicyClasses(allowedCanonicalIdPolicyClasses);
  if (canonical && contextual) {
    return { ok: false, error: `provide either ${label} id or ${label} ref, not both` };
  }
  if (canonical) {
    const authoringContext = typeof context === "string" && context.trim() ? context.trim() : null;
    if (!authoringContext) return { ok: true, target: canonical, source: "canonical" };
    if (!projectors.things(witnesses).has(canonical)) {
      return { ok: true, target: canonical, source: "canonical", canonicalIdPolicyClass: null, visibility: null };
    }
    const classified = classifyCanonicalIdPolicy(witnesses, {
      context: authoringContext,
      target: canonical
    });
    if (!classified.ok) {
      const targetContext = classified.visibility?.targetContext ?? moduleProjectors.objectContexts(witnesses).get(canonical) ?? null;
      if (targetContext) {
        return {
          ok: false,
          error: `${label} id targets ${canonical} in context ${targetContext} and is not visible in authoring context ${authoringContext}`
        };
      }
      return { ok: false, error: `${label} id ${classified.reason}` };
    }
    if (classified.policyClass && Array.isArray(allowedPolicyClasses) && !allowedPolicyClasses.includes(classified.policyClass)) {
      return {
        ok: false,
        error: `${label} id uses canonical-id compatibility class ${classified.policyClass}, which is not allowed here`
      };
    }
    return {
      ok: true,
      target: canonical,
      source: "canonical",
      canonicalIdPolicyClass: classified.policyClass ?? null,
      visibility: classified.visibility ?? null
    };
  }
  if (!contextual) return { ok: true, target: null, source: "empty" };
  if (!(typeof context === "string" && context.trim())) {
    return { ok: false, error: `${label} ref requires an explicit authoring context` };
  }
  const resolved = resolveContextualName(witnesses, { context, name: contextual });
  if (!resolved.ok) return { ok: false, error: `${label} ref ${resolved.error}` };
  return { ok: true, target: resolved.target, source: "contextual", row: resolved.row };
}

export function resolveContextualRefInWorld(world, {
  context,
  id = null,
  ref = null,
  label = "reference",
  allowedCanonicalIdPolicyClasses = null
}) {
  const canonical = typeof id === "string" && id.trim() ? id.trim() : null;
  const contextual = typeof ref === "string" && ref.trim() ? ref.trim() : null;
  const allowedPolicyClasses = normalizeCanonicalIdPolicyClasses(allowedCanonicalIdPolicyClasses);
  if (canonical && contextual) {
    return { ok: false, error: `provide either ${label} id or ${label} ref, not both` };
  }
  if (canonical) {
    const authoringContext = typeof context === "string" && context.trim() ? context.trim() : null;
    if (!authoringContext) return { ok: true, target: canonical, source: "canonical" };
    const state = worldContextIndexState(world);
    if (!state?.model.thingIds.has(canonical)) {
      return { ok: true, target: canonical, source: "canonical", canonicalIdPolicyClass: null, visibility: null };
    }
    const classified = classifyCanonicalIdPolicyInWorld(world, {
      context: authoringContext,
      target: canonical
    });
    if (!classified.ok) {
      const targetContext = classified.visibility?.targetContext ?? state?.model.objectContexts.get(canonical) ?? null;
      if (targetContext) {
        return {
          ok: false,
          error: `${label} id targets ${canonical} in context ${targetContext} and is not visible in authoring context ${authoringContext}`
        };
      }
      return { ok: false, error: `${label} id ${classified.reason}` };
    }
    if (classified.policyClass && Array.isArray(allowedPolicyClasses) && !allowedPolicyClasses.includes(classified.policyClass)) {
      return {
        ok: false,
        error: `${label} id uses canonical-id compatibility class ${classified.policyClass}, which is not allowed here`
      };
    }
    return {
      ok: true,
      target: canonical,
      source: "canonical",
      canonicalIdPolicyClass: classified.policyClass ?? null,
      visibility: classified.visibility ?? null
    };
  }
  if (!contextual) return { ok: true, target: null, source: "empty" };
  if (!(typeof context === "string" && context.trim())) {
    return { ok: false, error: `${label} ref requires an explicit authoring context` };
  }
  const resolved = explainContextualNameInWorld(world, { context, name: contextual });
  if (!resolved.ok) return { ok: false, error: `${label} ref ${resolved.reason}` };
  return { ok: true, target: resolved.target, source: "contextual", row: resolved.rows[0] ?? null };
}

export function resolveCoveredContextualRef(witnesses, options = {}) {
  return resolveContextualRef(witnesses, {
    ...options,
    allowedCanonicalIdPolicyClasses: TRANSITIONAL_CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES
  });
}

export function resolveCoveredContextualRefInWorld(world, options = {}) {
  return resolveContextualRefInWorld(world, {
    ...options,
    allowedCanonicalIdPolicyClasses: TRANSITIONAL_CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES
  });
}

export function defineRoute(world, { actor, id, path, serves, method = "GET", handler = null, params = null, owner = actor, context = null }) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineRoute",
    actor,
    claims: [
      relation(id, "hasModuleKind", "route"),
      relation(id, "serves", serves),
      relation(id, "path", path),
      ...(context ? [relation(id, "inContext", context)] : [])
    ],
    body: { id, path, serves, method: String(method || "GET").toUpperCase(), handler: handler ? String(handler) : null, params: params && typeof params === "object" ? params : null, context: context ? String(context) : null }
  });
}

export function defineRuntimePreload(world, { actor, id, when, targets, owner = actor, context = null }) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineRuntimePreload",
    actor,
    claims: [
      relation(id, "hasModuleKind", "runtimePreload"),
      ...(context ? [relation(id, "inContext", context)] : [])
    ],
    body: {
      id,
      when: when && typeof when === "object" && !Array.isArray(when) ? structuredClone(when) : null,
      targets: Array.isArray(targets) ? structuredClone(targets) : [],
      context: context ? String(context) : null
    }
  });
}

export function defineComputeModule(world, {
  actor,
  id,
  source,
  hostOperation,
  language = "assemblyscript",
  abi = "world.hostOperation.v1",
  exportName = "invoke",
  maxMemoryPages = null,
  timeoutMs = null,
  allowedBindings = [],
  owner = actor,
  context = null,
  values = null
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineComputeModule",
    actor,
    claims: [
      relation(id, "hasModuleKind", "computeModule"),
      relation(id, "bindsHostOperation", String(hostOperation)),
      relation(id, "usesComputeLanguage", String(language || "assemblyscript")),
      relation(id, "usesComputeAbi", String(abi || "world.hostOperation.v1")),
      ...(context ? [relation(id, "inContext", context)] : [])
    ],
    body: {
      id,
      source: String(source),
      hostOperation: String(hostOperation),
      language: String(language || "assemblyscript"),
      abi: String(abi || "world.hostOperation.v1"),
      export: typeof exportName === "string" && exportName.trim() ? exportName.trim() : "invoke",
      maxMemoryPages: Number.isInteger(maxMemoryPages) && maxMemoryPages > 0 ? maxMemoryPages : null,
      timeoutMs: Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : null,
      allowedBindings: uniqueSortedStrings(allowedBindings),
      context: context ? String(context) : null,
      values: values && typeof values === "object" && !Array.isArray(values) ? structuredClone(values) : null
    }
  });
}

function computeModuleSmokeTestIdFromBody({ id, module, hostOperation } = {}) {
  if (typeof id === "string" && id.trim()) return id.trim();
  return `computeModuleSmokeTest:${String(module)}:${String(hostOperation)}`;
}

function normalizeComputeModuleSmokeTestDefinition({
  id = null,
  module,
  package: packageId,
  revision,
  hostOperation,
  request,
  expected,
  timeoutMs = null,
  deletedAt = null
}) {
  const normalized = {
    id: computeModuleSmokeTestIdFromBody({ id, module, hostOperation }),
    module: String(module),
    package: String(packageId),
    revision: String(revision),
    hostOperation: String(hostOperation),
    request: request && typeof request === "object" ? structuredClone(request) : request,
    expected: expected && typeof expected === "object" ? structuredClone(expected) : expected,
    timeoutMs: Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : null,
    deletedAt: typeof deletedAt === "string" && deletedAt.trim() ? deletedAt.trim() : null
  };
  return normalized;
}

export function defineComputeModuleSmokeTest(world, {
  actor,
  id = null,
  module,
  package: packageId,
  revision,
  hostOperation,
  request,
  expected,
  timeoutMs = null,
  owner = actor
}) {
  const normalized = normalizeComputeModuleSmokeTestDefinition({
    id,
    module,
    package: packageId,
    revision,
    hostOperation,
    request,
    expected,
    timeoutMs
  });
  createThing(world, { actor, id: normalized.id, owner });
  return world.emit({
    process: "defineComputeModuleSmokeTest",
    actor,
    claims: [
      relation(normalized.id, "hasModuleKind", "computeModuleSmokeTest"),
      relation(normalized.id, "smokeTestOfComputeModule", normalized.module),
      relation(normalized.id, "smokeTestHostOperation", normalized.hostOperation),
      relation(normalized.id, "packageMaterializedFileRevision", normalized.revision)
    ],
    body: normalized
  });
}

export function markComputeModuleSmokeTestDeleted(world, {
  actor,
  id,
  module,
  package: packageId,
  revision,
  hostOperation,
  request,
  expected,
  timeoutMs = null,
  deletedAt = new Date().toISOString(),
  owner = actor
}) {
  const normalized = normalizeComputeModuleSmokeTestDefinition({
    id,
    module,
    package: packageId,
    revision,
    hostOperation,
    request,
    expected,
    timeoutMs,
    deletedAt: deletedAt ?? new Date().toISOString()
  });
  createThing(world, { actor, id: normalized.id, owner });
  return world.emit({
    process: "deleteComputeModuleSmokeTest",
    actor,
    claims: [
      relation(normalized.id, "hasModuleKind", "computeModuleSmokeTest"),
      relation(normalized.id, "smokeTestOfComputeModule", normalized.module),
      relation(normalized.id, "smokeTestHostOperation", normalized.hostOperation)
    ],
    body: normalized
  });
}

export function serveRoute(world, { actor, serverRunner, route }) {
  const rels = world.project(witnessRelations);
  const canServe = rels.some(r => r.from === serverRunner && r.rel === "supportsProcess" && r.to === "serveRoute");
  const isRoute = rels.some(r => r.from === route && r.rel === "hasModuleKind" && r.to === "route");

  return world.emit({
    process: canServe && isRoute ? "serveRoute" : "serveRoute.failed",
    actor,
    claims: canServe && isRoute ? [relation(serverRunner, "serves", route)] : [],
    body: { serverRunner, route, ok: canServe && isRoute }
  });
}

export function createFrontendRunner(world, { actor, id, owner = actor }) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineFrontendRunner",
    actor,
    claims: [
      relation(id, "hasModuleKind", "frontendRunner"),
      relation(id, "supportsProcess", "renderView"),
      relation(id, "supportsProcess", "emitUserAction"),
      relation(id, "hostBoundary", "browser")
    ],
    body: { id }
  });
}

export function createViewDescription(world, { actor, id, target, owner = actor }) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "createViewDescription",
    actor,
    claims: [
      relation(id, "hasModuleKind", "viewDescription"),
      relation(id, "projects", target)
    ],
    body: { id, target }
  });
}

export function renderView(world, { actor, frontendRunner, viewDescription, frame }) {
  const rels = world.project(witnessRelations);
  const canRender = rels.some(r => r.from === frontendRunner && r.rel === "supportsProcess" && r.to === "renderView");
  const isView = rels.some(r => r.from === viewDescription && r.rel === "hasModuleKind" && r.to === "viewDescription");

  return world.emit({
    process: canRender && isView ? "renderView" : "renderView.failed",
    actor,
    claims: canRender && isView ? [thing(frame), relation(frame, "renders", viewDescription), relation(frame, "renderedBy", frontendRunner)] : [],
    body: { frontendRunner, viewDescription, frame, ok: canRender && isView }
  });
}

export function emitUserAction(world, { actor, frontendRunner, action, target, body = {} }) {
  const rels = world.project(witnessRelations);
  const canEmit = rels.some(r => r.from === frontendRunner && r.rel === "supportsProcess" && r.to === "emitUserAction");

  return world.emit({
    process: canEmit ? "emitUserAction" : "emitUserAction.failed",
    actor,
    claims: canEmit ? [relation(action, "targets", target), relation(action, "emittedBy", frontendRunner)] : [],
    body: { action, target, ...body, ok: canEmit }
  });
}

export function witnessRelations(witnesses) {
  const rows = [];
  for (const w of witnesses) {
    for (const c of w.claims) {
      if (c.op === "relation") rows.push({ ...c, witness: w.id });
    }
  }
  return rows;
}

export const moduleProjectors = {
  modules(witnesses) {
    const modules = new Map();
    for (const r of currentRelations(witnesses)) {
      if (r.rel === "hasModuleKind") modules.set(r.from, r.to);
    }
    return modules;
  },

  objectContexts(witnesses) {
    const map = new Map();
    for (const row of currentRelations(witnesses)) {
      if (row.rel === "inContext") map.set(row.from, row.to);
    }
    return map;
  },

  contextualTargets(witnesses) {
    return [...moduleProjectors.objectContexts(witnesses).entries()]
      .map(([id, context]) => ({ id, context }))
      .sort((a, b) =>
        String(a.context).localeCompare(String(b.context))
        || String(a.id).localeCompare(String(b.id))
      );
  },

  contexts(witnesses) {
    const map = new Map();
    const rels = currentRelations(witnesses);
    const owners = projectors.owners(witnesses);
    const stewards = projectors.stewards(witnesses);
    const bodies = latestBodiesByProcess(witnesses, "defineContext");
    const installs = moduleProjectors.capabilityInstalls(witnesses)
      .filter(row => row.targetKind === "context");
    for (const r of rels) {
      if (r.rel === "hasModuleKind" && r.to === "context") {
        if (!map.has(r.from)) map.set(r.from, { id: r.from, label: r.from, actor: null, parent: null, owner: owners.get(r.from) ?? null, stewards: [...(stewards.get(r.from) ?? [])].sort(), capabilities: [] });
      }
    }
    for (const r of rels) {
      if (!map.has(r.from)) continue;
      const ctx = map.get(r.from);
      if (r.rel === "contextActor") ctx.actor = r.to;
      if (r.rel === "parentContext") ctx.parent = r.to;
      if (r.rel === "contextCapability" && !ctx.capabilities.includes(r.to)) ctx.capabilities.push(r.to);
    }
    for (const row of installs) {
      const ctx = map.get(row.target);
      if (!ctx) continue;
      if (!ctx.capabilities.includes(row.capability)) ctx.capabilities.push(row.capability);
    }
    return [...map.values()]
      .map(row => {
        const body = bodies.get(row.id) ?? {};
        return {
          ...row,
          label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : row.label,
          capabilities: [...new Set(row.capabilities)].sort()
        };
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  perspectives(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const stewards = projectors.stewards(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    for (const row of currentRelations(witnesses)) {
      if (row.rel === "hasModuleKind" && row.to === "perspective") {
        rows.set(row.from, {
          id: row.from,
          title: row.from,
          owner: owners.get(row.from) ?? null,
          context: contexts.get(row.from) ?? null,
          stewards: [...(stewards.get(row.from) ?? [])].sort()
        });
      }
    }
    for (const row of currentRelations(witnesses)) {
      if (row.rel !== "hasTitle" || !rows.has(row.from)) continue;
      rows.get(row.from).title = row.to;
    }
    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  contextBindings(witnesses) {
    return contextBindingRows(witnesses);
  },

  contextExports(witnesses) {
    return contextExportRows(witnesses);
  },

  contextImports(witnesses) {
    return contextImportRows(witnesses);
  },

  contextScopes(witnesses) {
    const rows = [];
    const exportsByName = exportIndex(witnesses);

    for (const row of contextBindingRows(witnesses)) {
      rows.push({
        context: row.context,
        name: row.name,
        target: row.target,
        sourceKind: "local",
        sourceContext: null,
        exportName: null,
        witness: row.witness
      });
    }

    for (const row of contextImportRows(witnesses)) {
      const exported = exportsByName.get(`${row.sourceContext}${CONTEXT_REF_SEP}${row.exportName}`) ?? null;
      if (!exported) continue;
      rows.push({
        context: row.context,
        name: row.name,
        target: exported.target,
        sourceKind: "import",
        sourceContext: row.sourceContext,
        exportName: row.exportName,
        witness: row.witness
      });
    }

    return rows.sort((a, b) =>
      String(a.context).localeCompare(String(b.context))
      || String(a.name).localeCompare(String(b.name))
      || String(a.sourceKind).localeCompare(String(b.sourceKind))
      || String(a.target).localeCompare(String(b.target))
    );
  },

  contextNameResolutions(witnesses) {
    return contextNameResolutionRows(witnesses);
  },

  contextNameConflicts(witnesses) {
    return contextNameConflictRows(witnesses);
  },

  stewardships(witnesses) {
    const rows = [];
    const kinds = moduleProjectors.modules(witnesses);
    for (const row of currentRelations(witnesses)) {
      if (row.rel !== "stewards") continue;
      rows.push({
        steward: row.from,
        target: row.to,
        targetKind: row.meta?.targetKind ? String(row.meta.targetKind) : (kinds.get(row.to) ?? null),
        witness: row.witness
      });
    }
    return rows.sort((a, b) =>
      String(a.steward).localeCompare(String(b.steward))
      || String(a.target).localeCompare(String(b.target))
    );
  },

  capabilities(witnesses) {
    return [...capabilityDefinitionsById(witnesses).values()]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  capabilityIndex(witnesses) {
    const rows = moduleProjectors.capabilities(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  capabilityInstalls(witnesses) {
    const rows = new Map();
    const rels = currentRelations(witnesses);
    const sourcePriority = new Map([
      ["explicit", 3],
      ["legacy-context", 2],
      ["legacy-host", 1]
    ]);
    const add = row => {
      const key = `${row.targetKind}\u0000${row.target}\u0000${row.capability}`;
      const existing = rows.get(key) ?? null;
      if (existing) {
        const existingPriority = sourcePriority.get(existing.source) ?? 0;
        const nextPriority = sourcePriority.get(row.source) ?? 0;
        if (existingPriority >= nextPriority) return;
      }
      rows.set(key, row);
    };

    for (const r of rels) {
      if (r.rel === "installsCapability") {
        add({
          target: r.from,
          capability: r.to,
          targetKind: String(r.meta?.targetKind || ""),
          config: r.meta?.config && typeof r.meta.config === "object" ? { ...r.meta.config } : null,
          source: "explicit",
          witness: r.witness
        });
      }
      if (r.rel === "contextCapability") {
        add({
          target: r.from,
          capability: r.to,
          targetKind: "context",
          config: null,
          source: "legacy-context",
          witness: r.witness
        });
      }
      if (r.rel === "hostCapability") {
        add({
          target: r.from,
          capability: r.to,
          targetKind: "host",
          config: null,
          source: "legacy-host",
          witness: r.witness
        });
      }
    }
    return [...rows.values()].sort((a, b) =>
      String(a.targetKind).localeCompare(String(b.targetKind))
      || String(a.target).localeCompare(String(b.target))
      || String(a.capability).localeCompare(String(b.capability))
    );
  },

  capabilityCatalog(witnesses) {
    const installs = moduleProjectors.capabilityInstalls(witnesses);
    const installCounts = new Map();
    for (const row of installs) installCounts.set(row.capability, (installCounts.get(row.capability) ?? 0) + 1);
    return moduleProjectors.capabilities(witnesses).map(row => ({
      ...row,
      installCount: installCounts.get(row.id) ?? 0
    }));
  },

  capabilityRevisionHistory(witnesses) {
    return capabilityDefinitionHistoryRows(witnesses);
  },

  capabilityRevisionHistoryIndex(witnesses) {
    const rows = moduleProjectors.capabilityRevisionHistory(witnesses);
    const byCapability = Object.create(null);
    for (const row of rows) {
      if (!byCapability[row.capabilityId]) byCapability[row.capabilityId] = [];
      byCapability[row.capabilityId].push({
        ...row,
        definition: structuredClone(row.definition)
      });
    }
    return { rows, byCapability };
  },

  runtimePluginInstalls(witnesses) {
    const rows = [];
    const seen = new Set();
    for (const row of currentRelations(witnesses)) {
      if (row.rel !== "installsRuntimePlugin") continue;
      const key = `${row.from}\u0000${row.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        serverRunner: row.from,
        plugin: String(row.to),
        witness: row.witness
      });
    }
    return rows.sort((a, b) =>
      String(a.serverRunner).localeCompare(String(b.serverRunner))
      || String(a.plugin).localeCompare(String(b.plugin))
    );
  },

  runtimePluginInstallIndex(witnesses) {
    const rows = moduleProjectors.runtimePluginInstalls(witnesses);
    const byServerRunner = Object.create(null);
    const byServerRunnerPlugin = Object.create(null);
    for (const row of rows) {
      if (!byServerRunner[row.serverRunner]) byServerRunner[row.serverRunner] = [];
      byServerRunner[row.serverRunner].push(row);
      byServerRunnerPlugin[`${row.serverRunner}\u0000${row.plugin}`] = row;
    }
    return { rows, byServerRunner, byServerRunnerPlugin };
  },

  runtimePreloads(witnesses) {
    const rows = new Map();
    const contexts = moduleProjectors.objectContexts(witnesses);
    for (const witness of witnesses) {
      if (witness.process !== "defineRuntimePreload" || !witness.body?.id) continue;
      rows.set(witness.body.id, {
        id: String(witness.body.id),
        when: witness.body.when && typeof witness.body.when === "object" && !Array.isArray(witness.body.when)
          ? structuredClone(witness.body.when)
          : null,
        targets: Array.isArray(witness.body.targets) ? structuredClone(witness.body.targets) : [],
        context: contexts.get(witness.body.id) ?? (witness.body.context ? String(witness.body.context) : null),
        witness: witness.id
      });
    }
    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  computeModules(witnesses) {
    const rows = new Map();
    const contexts = moduleProjectors.objectContexts(witnesses);
    for (const witness of witnesses) {
      if (witness.process !== "defineComputeModule" || !witness.body?.id) continue;
      rows.set(witness.body.id, {
        id: String(witness.body.id),
        source: String(witness.body.source ?? ""),
        hostOperation: String(witness.body.hostOperation ?? ""),
        language: typeof witness.body.language === "string" && witness.body.language.trim()
          ? witness.body.language.trim()
          : "assemblyscript",
        abi: typeof witness.body.abi === "string" && witness.body.abi.trim()
          ? witness.body.abi.trim()
          : "world.hostOperation.v1",
        export: typeof witness.body.export === "string" && witness.body.export.trim()
          ? witness.body.export.trim()
          : "invoke",
        maxMemoryPages: Number.isInteger(witness.body.maxMemoryPages) && witness.body.maxMemoryPages > 0
          ? witness.body.maxMemoryPages
          : null,
        timeoutMs: Number.isInteger(witness.body.timeoutMs) && witness.body.timeoutMs > 0
          ? witness.body.timeoutMs
          : null,
        allowedBindings: uniqueSortedStrings(witness.body.allowedBindings),
        context: contexts.get(witness.body.id) ?? (witness.body.context ? String(witness.body.context) : null),
        witness: witness.id,
        values: witness.body.values && typeof witness.body.values === "object" && !Array.isArray(witness.body.values)
          ? structuredClone(witness.body.values)
          : null
      });
    }
    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  collections(witnesses) {
    const rows = new Map();
    const contexts = moduleProjectors.objectContexts(witnesses);
    for (const witness of witnesses) {
      if (witness.process !== "desire.defineCollection" || !witness.body?.id) continue;
      rows.set(witness.body.id, {
        id: String(witness.body.id),
        context: contexts.get(witness.body.id) ?? (witness.body.context ? String(witness.body.context) : null),
        witness: witness.id
      });
    }
    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  packages(witnesses) {
    return [...packageDefinitionsById(witnesses).values()]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  packageIndex(witnesses) {
    const rows = moduleProjectors.packages(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  packageRevisions(witnesses) {
    return [...packageRevisionDefinitionsById(witnesses).values()]
      .sort((a, b) =>
        String(a.package).localeCompare(String(b.package))
        || String(a.version ?? "").localeCompare(String(b.version ?? ""))
        || String(a.id).localeCompare(String(b.id))
      );
  },

  packageRevisionIndex(witnesses) {
    const rows = moduleProjectors.packageRevisions(witnesses);
    const byId = Object.create(null);
    const byPackage = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      if (!byPackage[row.package]) byPackage[row.package] = [];
      byPackage[row.package].push(row);
    }
    return { rows, byId, byPackage };
  },

  packagePatches(witnesses) {
    return [...packagePatchDefinitionsById(witnesses).values()]
      .sort((a, b) =>
        String(a.revision).localeCompare(String(b.revision))
        || Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0)
        || String(a.path).localeCompare(String(b.path))
        || String(a.id).localeCompare(String(b.id))
      );
  },

  packagePatchIndex(witnesses) {
    const rows = moduleProjectors.packagePatches(witnesses);
    const byId = Object.create(null);
    const byRevision = Object.create(null);
    const byPackage = Object.create(null);
    const byTransformer = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      if (!byRevision[row.revision]) byRevision[row.revision] = [];
      byRevision[row.revision].push(row);
      if (!byPackage[row.package]) byPackage[row.package] = [];
      byPackage[row.package].push(row);
      if (row.transformer) {
        if (!byTransformer[row.transformer]) byTransformer[row.transformer] = [];
        byTransformer[row.transformer].push(row);
      }
    }
    return { rows, byId, byRevision, byPackage, byTransformer };
  },

  packageMaterializedFileHistory(witnesses) {
    return packageMaterializedFileHistoryRows(witnesses)
      .sort((a, b) =>
        String(a.revision).localeCompare(String(b.revision))
        || String(a.path).localeCompare(String(b.path))
        || String(a.id).localeCompare(String(b.id))
        || String(a.deletedAt ?? "").localeCompare(String(b.deletedAt ?? ""))
      );
  },

  packageMaterializedFiles(witnesses) {
    return [...packageMaterializedFileDefinitionsById(witnesses).values()]
      .filter(row => !row.deletedAt);
  },

  packageMaterializedFileIndex(witnesses) {
    const rows = moduleProjectors.packageMaterializedFiles(witnesses);
    const history = moduleProjectors.packageMaterializedFileHistory(witnesses);
    const latestHistoryRows = [...packageMaterializedFileDefinitionsById(witnesses).values()];
    const byId = Object.create(null);
    const byRevision = Object.create(null);
    const byRevisionPath = Object.create(null);
    const historyById = Object.create(null);
    const historyByRevisionPath = Object.create(null);
    for (const row of latestHistoryRows) {
      historyById[row.id] = row;
      historyByRevisionPath[`${row.revision}\u0000${row.path}`] = row;
    }
    for (const row of rows) {
      byId[row.id] = row;
      if (!byRevision[row.revision]) byRevision[row.revision] = [];
      byRevision[row.revision].push(row);
      byRevisionPath[`${row.revision}\u0000${row.path}`] = row;
    }
    return { rows, history, byId, byRevision, byRevisionPath, historyById, historyByRevisionPath };
  },

  computeModuleSmokeTestHistory(witnesses) {
    return computeModuleSmokeTestHistoryRows(witnesses)
      .sort((a, b) =>
        String(a.module).localeCompare(String(b.module))
        || String(a.id).localeCompare(String(b.id))
        || String(a.deletedAt ?? "").localeCompare(String(b.deletedAt ?? ""))
      );
  },

  computeModuleSmokeTests(witnesses) {
    return [...computeModuleSmokeTestDefinitionsById(witnesses).values()]
      .filter(row => !row.deletedAt);
  },

  computeModuleSmokeTestIndex(witnesses) {
    const rows = moduleProjectors.computeModuleSmokeTests(witnesses);
    const history = moduleProjectors.computeModuleSmokeTestHistory(witnesses);
    const latestHistoryRows = [...computeModuleSmokeTestDefinitionsById(witnesses).values()];
    const byId = Object.create(null);
    const byModule = Object.create(null);
    const historyById = Object.create(null);
    for (const row of latestHistoryRows) historyById[row.id] = row;
    for (const row of rows) {
      byId[row.id] = row;
      if (!byModule[row.module]) byModule[row.module] = [];
      byModule[row.module].push(row);
    }
    return { rows, history, byId, byModule, historyById };
  },

  packageNamespaces(witnesses) {
    return [...packageNamespaceDefinitionsById(witnesses).values()]
      .sort((a, b) =>
        String(a.context).localeCompare(String(b.context))
        || String(a.name).localeCompare(String(b.name))
        || String(a.id).localeCompare(String(b.id))
      );
  },

  packageNamespaceIndex(witnesses) {
    const rows = moduleProjectors.packageNamespaces(witnesses);
    const byId = Object.create(null);
    const byContext = Object.create(null);
    const byContextName = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      if (!byContext[row.context]) byContext[row.context] = [];
      byContext[row.context].push(row);
      byContextName[`${row.context}\u0000${row.name}`] = row;
    }
    return { rows, byId, byContext, byContextName };
  },

  packageDependencies(witnesses) {
    return [...packageDependencyDefinitionsById(witnesses).values()]
      .sort((a, b) =>
        String(a.sourceRevision).localeCompare(String(b.sourceRevision))
        || String(a.targetKind).localeCompare(String(b.targetKind))
        || String(a.targetId).localeCompare(String(b.targetId))
        || String(a.id).localeCompare(String(b.id))
      );
  },

  packageDependencyIndex(witnesses) {
    const rows = moduleProjectors.packageDependencies(witnesses);
    const byId = Object.create(null);
    const bySourceRevision = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      if (!bySourceRevision[row.sourceRevision]) bySourceRevision[row.sourceRevision] = [];
      bySourceRevision[row.sourceRevision].push(row);
    }
    return { rows, byId, bySourceRevision };
  },

  packageTransformers(witnesses) {
    return [...packageTransformerDefinitionsById(witnesses).values()]
      .sort((a, b) =>
        String(a.package).localeCompare(String(b.package))
        || String(a.targetRevision ?? a.targetNamespace ?? "").localeCompare(String(b.targetRevision ?? b.targetNamespace ?? ""))
        || String(a.sourceRevision ?? a.sourceNamespace ?? "").localeCompare(String(b.sourceRevision ?? b.sourceNamespace ?? ""))
        || String(a.id).localeCompare(String(b.id))
      );
  },

  packageTransformerIndex(witnesses) {
    const rows = moduleProjectors.packageTransformers(witnesses);
    const byId = Object.create(null);
    const byPackage = Object.create(null);
    const bySourceRevision = Object.create(null);
    const byTargetRevision = Object.create(null);
    const bySourceNamespace = Object.create(null);
    const byTargetNamespace = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      if (!byPackage[row.package]) byPackage[row.package] = [];
      byPackage[row.package].push(row);
      if (row.sourceRevision) {
        if (!bySourceRevision[row.sourceRevision]) bySourceRevision[row.sourceRevision] = [];
        bySourceRevision[row.sourceRevision].push(row);
      }
      if (row.targetRevision) {
        if (!byTargetRevision[row.targetRevision]) byTargetRevision[row.targetRevision] = [];
        byTargetRevision[row.targetRevision].push(row);
      }
      if (row.sourceNamespace) {
        if (!bySourceNamespace[row.sourceNamespace]) bySourceNamespace[row.sourceNamespace] = [];
        bySourceNamespace[row.sourceNamespace].push(row);
      }
      if (row.targetNamespace) {
        if (!byTargetNamespace[row.targetNamespace]) byTargetNamespace[row.targetNamespace] = [];
        byTargetNamespace[row.targetNamespace].push(row);
      }
    }
    return { rows, byId, byPackage, bySourceRevision, byTargetRevision, bySourceNamespace, byTargetNamespace };
  },

  packageCoexistence(witnesses) {
    const packages = moduleProjectors.packages(witnesses);
    const packageRevisionIndex = moduleProjectors.packageRevisionIndex(witnesses);
    const packageNamespaces = moduleProjectors.packageNamespaces(witnesses);
    const namespacesByPackage = Object.create(null);
    for (const namespace of packageNamespaces) {
      if (!namespacesByPackage[namespace.package]) namespacesByPackage[namespace.package] = [];
      namespacesByPackage[namespace.package].push(namespace);
    }
    const rows = [];
    for (const packageRecord of packages) {
      const revisions = [...(packageRevisionIndex.byPackage[packageRecord.id] ?? [])];
      const revisionIds = revisions.map(row => row.id);
      const revisionIdSet = new Set(revisionIds);
      const namespaces = [...(namespacesByPackage[packageRecord.id] ?? [])].map(namespace => ({
        id: namespace.id,
        context: namespace.context,
        name: namespace.name,
        package: namespace.package,
        revision: namespace.revision,
        visibility: namespace.visibility,
        explicitRevision: typeof namespace.revision === "string" && namespace.revision.trim().length > 0
      }));
      const namespaceSelectionsByRevision = Object.create(null);
      const floatingNamespaceSelections = [];
      const unresolvedNamespaceSelections = [];
      for (const namespace of namespaces) {
        if (!namespace.revision) {
          floatingNamespaceSelections.push({ ...namespace });
          continue;
        }
        if (!revisionIdSet.has(namespace.revision)) {
          unresolvedNamespaceSelections.push({ ...namespace });
          continue;
        }
        if (!namespaceSelectionsByRevision[namespace.revision]) namespaceSelectionsByRevision[namespace.revision] = [];
        namespaceSelectionsByRevision[namespace.revision].push({ ...namespace });
      }
      const supersededBy = Object.create(null);
      for (const revision of revisions) {
        for (const predecessor of revision.supersedes ?? []) {
          if (!supersededBy[predecessor]) supersededBy[predecessor] = [];
          supersededBy[predecessor].push(revision.id);
        }
      }
      const coexistenceRevisions = revisions.map(revision => {
        const selectedBy = (namespaceSelectionsByRevision[revision.id] ?? []).map(row => ({ ...row }));
        return {
          id: revision.id,
          package: revision.package,
          version: revision.version,
          status: revision.status,
          supersedes: [...(revision.supersedes ?? [])],
          supersededBy: uniqueStrings(supersededBy[revision.id] ?? []),
          emittedBundleHash: revision.emittedBundleHash,
          manifest: revision.manifest ? structuredClone(revision.manifest) : null,
          manifestPluginId: packageManifestPluginId(revision.manifest),
          compatibility: revision.compatibility ? structuredClone(revision.compatibility) : null,
          selectedByNamespaceIds: selectedBy.map(row => row.id),
          selectedByContexts: uniqueStrings(selectedBy.map(row => row.context)),
          selectedByNames: uniqueStrings(selectedBy.map(row => row.name)),
          selectedBy
        };
      });
      const manifestPluginBuckets = Object.create(null);
      for (const revision of coexistenceRevisions) {
        if (!revision.manifestPluginId) continue;
        if (!manifestPluginBuckets[revision.manifestPluginId]) manifestPluginBuckets[revision.manifestPluginId] = [];
        manifestPluginBuckets[revision.manifestPluginId].push(revision);
      }
      const manifestPluginConflicts = Object.entries(manifestPluginBuckets)
        .filter(([, revisionRows]) => revisionRows.length > 1)
        .map(([manifestPluginId, revisionRows]) => {
          const conflictingRevisionIds = revisionRows.map(row => row.id);
          const conflictingRevisionIdSet = new Set(conflictingRevisionIds);
          const namespaceKeys = new Set(
            namespaces
              .filter(namespace => namespace.revision && conflictingRevisionIdSet.has(namespace.revision))
              .map(namespace => `${namespace.context}\u0000${namespace.name}`)
          );
          const explicitSupersede = revisionRows.some(row =>
            row.supersedes.some(target => conflictingRevisionIdSet.has(target))
            || row.supersededBy.some(target => conflictingRevisionIdSet.has(target))
          );
          const truthfulNamespaceSplit = namespaceKeys.size >= 2;
          return {
            id: `packageManifestConflict:${packageRecord.id}:${manifestPluginId}`,
            packageId: packageRecord.id,
            manifestPluginId,
            revisionIds: conflictingRevisionIds.sort(),
            namespaceIds: namespaces
              .filter(namespace => namespace.revision && conflictingRevisionIdSet.has(namespace.revision))
              .map(namespace => namespace.id)
              .sort(),
            explicitSupersede,
            truthfulNamespaceSplit,
            blocked: !explicitSupersede && !truthfulNamespaceSplit
          };
        })
        .sort((left, right) => String(left.manifestPluginId).localeCompare(String(right.manifestPluginId)));
      rows.push({
        id: `packageCoexistence:${packageRecord.id}`,
        packageId: packageRecord.id,
        packageLabel: packageRecord.label,
        packageKind: packageRecord.packageKind,
        defaultNamespace: packageRecord.defaultNamespace,
        revisionCount: coexistenceRevisions.length,
        revisionIds: coexistenceRevisions.map(row => row.id),
        selectedRevisionIds: coexistenceRevisions
          .filter(row => row.selectedBy.length > 0)
          .map(row => row.id),
        coexistenceMode: coexistenceRevisions.length > 1 ? "coexisting" : "single-line",
        revisions: coexistenceRevisions,
        namespaceSelections: namespaces,
        floatingNamespaceSelections,
        unresolvedNamespaceSelections,
        manifestPluginConflicts
      });
    }
    return rows.sort((a, b) => String(a.packageId).localeCompare(String(b.packageId)));
  },

  packageCoexistenceIndex(witnesses) {
    const rows = moduleProjectors.packageCoexistence(witnesses);
    const byId = Object.create(null);
    const byPackage = Object.create(null);
    const byRevision = Object.create(null);
    const byNamespace = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      byPackage[row.packageId] = row;
      for (const revisionId of row.revisionIds ?? []) byRevision[revisionId] = row;
      for (const namespace of row.namespaceSelections ?? []) byNamespace[namespace.id] = row;
    }
    return { rows, byId, byPackage, byRevision, byNamespace };
  },

  packageConvergence(witnesses) {
    const coexistenceRows = moduleProjectors.packageCoexistence(witnesses);
    const packageTransformerIndex = moduleProjectors.packageTransformerIndex(witnesses);
    const packagePatchIndex = moduleProjectors.packagePatchIndex(witnesses);
    return coexistenceRows.map(row => {
      const namespaceIdSet = new Set((row.namespaceSelections ?? []).map(namespace => namespace.id));
      const revisionIdSet = new Set(row.revisionIds ?? []);
      const transformers = (packageTransformerIndex.byPackage[row.packageId] ?? [])
        .filter(transformer =>
          (transformer.sourceRevision && revisionIdSet.has(transformer.sourceRevision))
          || (transformer.targetRevision && revisionIdSet.has(transformer.targetRevision))
          || (transformer.sourceNamespace && namespaceIdSet.has(transformer.sourceNamespace))
          || (transformer.targetNamespace && namespaceIdSet.has(transformer.targetNamespace))
        );
      const convergencePatches = transformers
        .flatMap(transformer => packagePatchIndex.byTransformer?.[transformer.id] ?? [])
        .filter((patch, index, rows) => rows.findIndex(candidate => candidate.id === patch.id) === index)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const remainingGlue = [];
      if (row.coexistenceMode === "coexisting" && !transformers.length) {
        remainingGlue.push({
          kind: "unplanned",
          transformerId: null,
          message: "No authored package transformer maps the divergent revision or namespace lines yet."
        });
      }
      for (const transformer of transformers) {
        if (!convergencePatches.some(patch => patch.transformer === transformer.id)) {
          remainingGlue.push({
            kind: "missing-patches",
            transformerId: transformer.id,
            message: "Transformer has no authored convergence patches yet."
          });
        }
        for (const note of transformer.remainingGlue ?? []) {
          remainingGlue.push({
            kind: "explicit-glue",
            transformerId: transformer.id,
            message: note
          });
        }
      }
      const status = row.coexistenceMode === "single-line"
        ? "not-needed"
        : (!transformers.length
          ? "unplanned"
          : (remainingGlue.length ? "glue-required" : "converging"));
      return {
        id: `packageConvergence:${row.packageId}`,
        packageId: row.packageId,
        packageLabel: row.packageLabel,
        coexistenceId: row.id,
        coexistenceMode: row.coexistenceMode,
        status,
        transformerIds: transformers.map(transformer => transformer.id),
        transformers,
        convergencePatchIds: convergencePatches.map(patch => patch.id),
        convergencePatches,
        remainingGlue,
        explanation: status === "not-needed"
          ? "Package currently has one effective revision line, so no convergence glue is required."
          : (status === "unplanned"
            ? "Divergent package lines exist, but no authored transformer contract explains convergence yet."
            : (status === "glue-required"
              ? "A transformer contract exists, but authored glue still remains before convergence is complete."
              : "Transformer contract and convergence patches are present with no remaining authored glue notes."))
      };
    });
  },

  packageConvergenceIndex(witnesses) {
    const rows = moduleProjectors.packageConvergence(witnesses);
    const byId = Object.create(null);
    const byPackage = Object.create(null);
    const byTransformer = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      byPackage[row.packageId] = row;
      for (const transformerId of row.transformerIds ?? []) byTransformer[transformerId] = row;
    }
    return { rows, byId, byPackage, byTransformer };
  },

  mcpServers: delegatedModuleProjector("mcpServers", emptyRows),

  mcpServerIndex: delegatedModuleProjector("mcpServerIndex", emptyIndex),

  mcpToolInstalls: delegatedModuleProjector("mcpToolInstalls", emptyRows),

  mcpToolInstallIndex: delegatedModuleProjector("mcpToolInstallIndex", () => ({ rows: [], byServer: Object.create(null) })),

  changeSets: delegatedModuleProjector("changeSets", emptyRows),

  changeSetIndex: delegatedModuleProjector("changeSetIndex", emptyIndex),

  changeSetEdits: delegatedModuleProjector("changeSetEdits", emptyRows),

  changeSetEditIndex: delegatedModuleProjector("changeSetEditIndex", () => ({ rows: [], byId: Object.create(null), byChangeSet: Object.create(null) })),

  branches: delegatedModuleProjector("branches", emptyRows),

  branchIndex: delegatedModuleProjector("branchIndex", emptyIndex),

  pushRecords: delegatedModuleProjector("pushRecords", emptyRows),

  pushRecordIndex: delegatedModuleProjector("pushRecordIndex", () => ({
    rows: [],
    byId: Object.create(null),
    byBranch: Object.create(null)
  })),

  releaseChannels: delegatedModuleProjector("releaseChannels", emptyRows),

  shipRecords: delegatedModuleProjector("shipRecords", emptyRows),

  shipRecordIndex: delegatedModuleProjector("shipRecordIndex", () => ({
    rows: [],
    byId: Object.create(null),
    byBranch: Object.create(null),
    byReleaseChannel: Object.create(null)
  })),

  candidateSnapshots: delegatedModuleProjector("candidateSnapshots", emptyRows),

  candidateSnapshotIndex: delegatedModuleProjector("candidateSnapshotIndex", () => ({
    rows: [],
    byId: Object.create(null),
    byChangeSet: Object.create(null),
    byBranch: Object.create(null),
    activeByBranch: Object.create(null)
  })),

  telemetryThresholds: delegatedModuleProjector("telemetryThresholds", emptyRows),

  materializedViewStates: delegatedModuleProjector("materializedViewStates", emptyRows),

  resourceProbeOperations: delegatedModuleProjector("resourceProbeOperations", emptyRows),

  telemetrySamples: delegatedModuleProjector("telemetrySamples", emptyRows),

  telemetryWindows: delegatedModuleProjector("telemetryWindows", emptyRows),

  performanceRegressions: delegatedModuleProjector("performanceRegressions", emptyRows),

  defects: delegatedModuleProjector("defects", emptyRows),

  defectObservations: delegatedModuleProjector("defectObservations", emptyRows),

  defectClusters: delegatedModuleProjector("defectClusters", emptyRows),

  testGates: delegatedModuleProjector("testGates", emptyRows),

  testGateIndex: delegatedModuleProjector("testGateIndex", () => ({
    byId: Object.create(null),
    byProtectedObject: Object.create(null),
    byBranch: Object.create(null),
    byChangeSet: Object.create(null)
  })),

  testRuns: delegatedModuleProjector("testRuns", emptyRows),

  testRunIndex: delegatedModuleProjector("testRunIndex", () => ({
    rows: [],
    byId: Object.create(null),
    byGate: Object.create(null)
  })),

  testResults: delegatedModuleProjector("testResults", emptyRows),

  testArtifacts: delegatedModuleProjector("testArtifacts", emptyRows),

  testSuites: delegatedModuleProjector("testSuites", emptyRows),

  testCases: delegatedModuleProjector("testCases", emptyRows),

  testReports: delegatedModuleProjector("testReports", emptyRows),

  testReportIndex: delegatedModuleProjector("testReportIndex", () => ({
    rows: [],
    byId: Object.create(null),
    byRun: Object.create(null),
    byGate: Object.create(null)
  })),

  verificationPolicies: delegatedModuleProjector("verificationPolicies", emptyRows),

  verificationFreshness: delegatedModuleProjector("verificationFreshness", emptyRows),

  verificationInvalidations: delegatedModuleProjector("verificationInvalidations", emptyRows),

  verificationQueue: delegatedModuleProjector("verificationQueue", emptyRows),

  verificationExecutions: delegatedModuleProjector("verificationExecutions", emptyRows),

  coverageEdges: delegatedModuleProjector("coverageEdges", emptyRows),

  latestTestResultsByGate: delegatedModuleProjector("latestTestResultsByGate", () => ({
    rows: [],
    byGate: Object.create(null)
  })),

  conflicts: delegatedModuleProjector("conflicts", emptyRows),

  mergeIntents: delegatedModuleProjector("mergeIntents", emptyRows),

  assets: delegatedModuleProjector("assets", emptyRows),

  assetIndex: delegatedModuleProjector("assetIndex", emptyIndex),

  jobs: delegatedModuleProjector("jobs", emptyRows),

  jobIndex: delegatedModuleProjector("jobIndex", emptyIndex),

  notifications: delegatedModuleProjector("notifications", emptyRows),

  notificationIndex: delegatedModuleProjector("notificationIndex", emptyIndex),

  secrets: delegatedModuleProjector("secrets", emptyRows),

  secretIndex: delegatedModuleProjector("secretIndex", emptyIndex),

  outboundRequests: delegatedModuleProjector("outboundRequests", emptyRows),

  outboundRequestIndex: delegatedModuleProjector("outboundRequestIndex", emptyIndex),

  webhookDeliveries: delegatedModuleProjector("webhookDeliveries", emptyRows),

  webhookDeliveryIndex: delegatedModuleProjector("webhookDeliveryIndex", emptyIndex),

  sqlDatasources: delegatedModuleProjector("sqlDatasources", emptyRows),

  sqlDatasourceIndex: delegatedModuleProjector("sqlDatasourceIndex", emptyIndex),

  sqlOperations: delegatedModuleProjector("sqlOperations", emptyRows),

  sqlOperationIndex: delegatedModuleProjector("sqlOperationIndex", emptyIndex),

  searchIndexes: delegatedModuleProjector("searchIndexes", emptyRows),

  searchIndexIndex: delegatedModuleProjector("searchIndexIndex", emptyIndex),

  compiledArtifacts(witnesses) {
    const rows = [];
    const rels = witnessRelations(witnesses);
    for (const r of rels) {
      if (r.rel !== "compiledFrom") continue;
      rows.push({ artifact: r.from, source: r.to, compiler: rels.find(x => x.from === r.from && x.rel === "compiledBy")?.to ?? null });
    }
    return rows;
  },

  renderedFrames(witnesses) {
    const rels = witnessRelations(witnesses);
    return rels.filter(r => r.rel === "renders").map(r => ({ frame: r.from, view: r.to, runner: rels.find(x => x.from === r.from && x.rel === "renderedBy")?.to ?? null }));
  },

  routes(witnesses) {
    const contexts = moduleProjectors.objectContexts(witnesses);
    const routeMap = new Map();
    for (const w of witnesses) {
      if (w.process !== "defineRoute" || !w.body?.id || !w.body?.path) continue;
      routeMap.set(w.body.id, {
        id: w.body.id,
        path: w.body.path,
        serves: w.body.serves,
        method: String(w.body.method || "GET").toUpperCase(),
        handler: w.body.handler ? String(w.body.handler) : null,
        params: w.body.params && typeof w.body.params === "object" ? { ...w.body.params } : null,
        context: contexts.get(w.body.id) ?? (w.body.context ? String(w.body.context) : null)
      });
    }
    return [...routeMap.values()];
  },

  serverRunners(witnesses) {
    const contexts = moduleProjectors.objectContexts(witnesses);
    const runnerMap = new Map();
    for (const w of witnesses) {
      if (w.process !== "defineServerRunner" || !w.body?.id) continue;
      runnerMap.set(w.body.id, {
        id: w.body.id,
        backendHost: w.body.backendHost ? String(w.body.backendHost) : null,
        frontendHost: w.body.frontendHost ? String(w.body.frontendHost) : null,
        runtimeProfile: w.body.runtimeProfile ? String(w.body.runtimeProfile) : null,
        handlerSet: w.body.handlerSet ? String(w.body.handlerSet) : null,
        actors: Array.isArray(w.body.actors) ? [...w.body.actors] : null,
        storage: w.body.storage && typeof w.body.storage === "object" ? { ...w.body.storage } : null,
        runtimeConfig: w.body.runtimeConfig && typeof w.body.runtimeConfig === "object" ? { ...w.body.runtimeConfig } : null,
        allowActorHeader: w.body.allowActorHeader === true,
        hosts: normalizeRunnerHosts(w.body.hosts),
        default: w.body.default === true,
        requireAuth: w.body.requireAuth === true,
        context: contexts.get(w.body.id) ?? (w.body.context ? String(w.body.context) : null),
        values: w.body.values && typeof w.body.values === "object" ? structuredClone(w.body.values) : null
      });
    }
    return [...runnerMap.values()];
  },

  materializedViews(witnesses) {
    const rows = new Map();
    for (const witness of witnesses) {
      if (witness.process !== "materializedView.define" || !witness.body?.id) continue;
      rows.set(String(witness.body.id), {
        id: String(witness.body.id),
        title: typeof witness.body.title === "string" && witness.body.title.trim() ? witness.body.title.trim() : String(witness.body.id),
        kind: typeof witness.body.kind === "string" && witness.body.kind.trim() ? witness.body.kind.trim() : "generic",
        sliceKey: typeof witness.body.sliceKey === "string" && witness.body.sliceKey.trim() ? witness.body.sliceKey.trim() : null,
        modelView: typeof witness.body.modelView === "string" && witness.body.modelView.trim() ? witness.body.modelView.trim() : null,
        maintenance: typeof witness.body.maintenance === "string" && witness.body.maintenance.trim() ? witness.body.maintenance.trim() : "on-demand",
        storageClass: typeof witness.body.storageClass === "string" && witness.body.storageClass.trim() ? witness.body.storageClass.trim() : "memory",
        resourceBudgetClass: typeof witness.body.resourceBudgetClass === "string" && witness.body.resourceBudgetClass.trim() ? witness.body.resourceBudgetClass.trim() : null,
        blocking: witness.body.blocking !== false,
        ttlMs: Number(witness.body.ttlMs || 0),
        sourceProjectors: Array.isArray(witness.body.sourceProjectors) ? [...witness.body.sourceProjectors.map(String)] : [],
        sourceWitnessProcesses: Array.isArray(witness.body.sourceWitnessProcesses) ? [...witness.body.sourceWitnessProcesses.map(String)] : [],
        invalidation: witness.body.invalidation && typeof witness.body.invalidation === "object" ? structuredClone(witness.body.invalidation) : null,
        values: witness.body.values && typeof witness.body.values === "object" ? structuredClone(witness.body.values) : null
      });
    }
    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  identities(witnesses) {
    const identityMap = new Map();
    for (const w of witnesses) {
      if ((w.process !== "defineIdentity" && w.process !== "updateIdentity") || !w.body?.id) continue;
      const previous = identityMap.get(w.body.id) ?? null;
      identityMap.set(w.body.id, {
        id: w.body.id,
        actor: String(w.body.actor || previous?.actor || ""),
        label: String(w.body.label || previous?.label || ""),
        username: String(w.body.username || previous?.username || ""),
        password: String(w.body.password || previous?.password || ""),
        displayName: w.body.displayName == null ? (previous?.displayName ?? null) : String(w.body.displayName),
        jobTitle: w.body.jobTitle == null ? (previous?.jobTitle ?? null) : String(w.body.jobTitle),
        initials: w.body.initials == null ? (previous?.initials ?? null) : String(w.body.initials),
        sourceryMuteRules: Array.isArray(w.body.sourceryMuteRules)
          ? structuredClone(w.body.sourceryMuteRules)
          : (previous?.sourceryMuteRules ? structuredClone(previous.sourceryMuteRules) : []),
        homeContext: w.body.homeContext ? String(w.body.homeContext) : null,
        homePerspective: w.body.homePerspective ? String(w.body.homePerspective) : null
      });
    }
    return [...identityMap.values()];
  },

  authRoles(witnesses) {
    const roleMap = new Map();
    for (const w of witnesses) {
      if ((w.process !== "defineAuthRole" && w.process !== "updateAuthRole") || !w.body?.id) continue;
      roleMap.set(w.body.id, {
        id: String(w.body.id),
        label: String(w.body.label ?? w.body.id),
        description: String(w.body.description ?? "")
      });
    }
    return [...roleMap.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  },

  authRoleIndex(witnesses) {
    const rows = moduleProjectors.authRoles(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  identityRoleGrants(witnesses) {
    return currentRelations(witnesses)
      .filter(row => row.rel === "hasAuthRole")
      .map(row => ({
        identityId: String(row.from),
        roleId: String(row.to)
      }))
      .sort((a, b) =>
        String(a.identityId).localeCompare(String(b.identityId))
        || String(a.roleId).localeCompare(String(b.roleId))
      );
  },

  identityRoleGrantIndex(witnesses) {
    const rows = moduleProjectors.identityRoleGrants(witnesses);
    const byIdentity = Object.create(null);
    const byRole = Object.create(null);
    for (const row of rows) {
      if (!byIdentity[row.identityId]) byIdentity[row.identityId] = [];
      if (!byRole[row.roleId]) byRole[row.roleId] = [];
      byIdentity[row.identityId].push(row.roleId);
      byRole[row.roleId].push(row.identityId);
    }
    return { rows, byIdentity, byRole };
  },

  identityActorAssumptionGrants(witnesses) {
    return currentRelations(witnesses)
      .filter(row => row.rel === "mayAssumeActor")
      .map(row => ({
        id: identityActorAssumptionGrantId(row.from, row.to),
        identityId: String(row.from),
        targetActor: String(row.to)
      }))
      .sort((a, b) =>
        String(a.identityId).localeCompare(String(b.identityId))
        || String(a.targetActor).localeCompare(String(b.targetActor))
      );
  },

  identityActorAssumptionGrantIndex(witnesses) {
    const rows = moduleProjectors.identityActorAssumptionGrants(witnesses);
    const byIdentity = Object.create(null);
    const byTargetActor = Object.create(null);
    const byPair = Object.create(null);
    for (const row of rows) {
      if (!byIdentity[row.identityId]) byIdentity[row.identityId] = [];
      if (!byTargetActor[row.targetActor]) byTargetActor[row.targetActor] = [];
      byIdentity[row.identityId].push(row);
      byTargetActor[row.targetActor].push(row);
      byPair[row.id] = row;
    }
    return { rows, byIdentity, byTargetActor, byPair };
  },

  appFeatureAccessPolicies(witnesses) {
    const policyMap = new Map();
    for (const w of witnesses) {
      if (w.process !== "setAppFeatureAccessPolicy" || !w.body?.featureId) continue;
      policyMap.set(String(w.body.featureId), {
        id: String(w.body.id ?? w.body.featureId),
        featureId: String(w.body.featureId),
        label: String(w.body.label ?? w.body.featureId),
        appId: String(w.body.appId ?? ""),
        requireAuth: w.body.requireAuth === true,
        visibilityMode: String(w.body.visibilityMode ?? "normal"),
        allowedRoles: [...new Set((Array.isArray(w.body.allowedRoles) ? w.body.allowedRoles : []).map(String).filter(Boolean))],
        guestBehavior: String(w.body.guestBehavior ?? "allow"),
        deniedBehavior: String(w.body.deniedBehavior ?? "403")
      });
    }
    return [...policyMap.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  },

  appFeatureAccessPolicyIndex(witnesses) {
    const rows = moduleProjectors.appFeatureAccessPolicies(witnesses);
    const byFeatureId = Object.create(null);
    for (const row of rows) byFeatureId[row.featureId] = row;
    return { rows, byFeatureId };
  },

  proposals(witnesses) {
    const rows = new Map();
    for (const witness of witnesses) {
      if (witness.process === "createProposal" && witness.body?.id) {
        rows.set(witness.body.id, {
          id: witness.body.id,
          proposer: witness.body.proposer ?? witness.actor,
          targetProcess: witness.body.targetProcess ?? null,
          targetKind: witness.body.targetKind ?? null,
          targetId: witness.body.targetId ?? null,
          body: witness.body.body && typeof witness.body.body === "object" ? { ...witness.body.body } : {},
          reason: witness.body.reason ?? null,
          status: witness.body.status ?? "open",
          executedWitnessIds: [],
          reviewer: null
        });
      }
      if (witness.process === "approveProposal" && witness.body?.id && rows.has(witness.body.id)) {
        const row = rows.get(witness.body.id);
        row.status = "approved";
        row.reviewer = witness.body.approver ?? witness.actor;
        row.executedWitnessIds = [...new Set((witness.body.executedWitnessIds ?? []).map(String).filter(Boolean))];
      }
      if (witness.process === "rejectProposal" && witness.body?.id && rows.has(witness.body.id)) {
        const row = rows.get(witness.body.id);
        row.status = "rejected";
        row.reviewer = witness.body.reviewer ?? witness.actor;
        row.reviewReason = witness.body.reason ?? null;
      }
    }
    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  identityIndex(witnesses) {
    const identities = moduleProjectors.identities(witnesses);
    const byId = Object.create(null);
    const byUsername = Object.create(null);
    const byActor = Object.create(null);
    for (const identity of identities) {
      byId[identity.id] = identity;
      byUsername[identity.username] = identity;
      if (!byActor[identity.actor]) byActor[identity.actor] = [];
      byActor[identity.actor].push(identity);
    }
    return { rows: identities, byId, byUsername, byActor };
  },

  oauthFlows: delegatedModuleProjector("oauthFlows", emptyRows),

  oauthFlowIndex: delegatedModuleProjector("oauthFlowIndex", () => ({ rows: [], byId: Object.create(null), byState: Object.create(null) })),

  oauthLinks: delegatedModuleProjector("oauthLinks", emptyRows),

  oauthLinkIndex: delegatedModuleProjector("oauthLinkIndex", () => ({ rows: [], byId: Object.create(null), byProviderAccount: Object.create(null) })),

  servedRoutes(witnesses) {
    const routes = new Map(moduleProjectors.routes(witnesses).map(route => [route.id, route]));
    const mounted = [];
    for (const w of witnesses) {
      if (w.process !== "serveRoute" || w.body?.ok === false) continue;
      const route = routes.get(w.body?.route);
      if (!route) continue;
      mounted.push({
        ...route,
        serverRunner: w.body.serverRunner
      });
    }
    return mounted;
  }
};

function mapClone(map) {
  return new Map(map);
}

function setClone(set) {
  return new Set(set);
}

function contextRowsSnapshot(state) {
  return [...state.contextIds]
    .map(id => ({
      id,
      label: state.contextBodies.get(id)?.label ?? id,
      actor: state.contextActors.get(id) ?? state.contextBodies.get(id)?.actor ?? null,
      parent: state.parentContexts.get(id) ?? state.contextBodies.get(id)?.parent ?? null,
      owner: state.owners.get(id) ?? null,
      stewards: [...(state.stewards.get(id) ?? new Set())].sort(),
      capabilities: [...(state.contextCapabilities.get(id) ?? new Set())].sort()
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

const contextModelIndexSpec = {
  seed(witnesses) {
    const state = {
      thingIds: new Set(),
      moduleKinds: new Map(),
      objectContexts: new Map(),
      owners: new Map(),
      stewards: new Map(),
      contextIds: new Set(),
      contextBodies: new Map(),
      contextActors: new Map(),
      parentContexts: new Map(),
      contextCapabilities: new Map()
    };
    for (const witness of witnesses) contextModelIndexSpec.apply(state, witness);
    return state;
  },
  apply(state, witness) {
    if (witness.process === "defineContext" && witness.body?.id) {
      state.contextIds.add(witness.body.id);
      state.contextBodies.set(witness.body.id, {
        label: typeof witness.body.label === "string" && witness.body.label.trim() ? witness.body.label.trim() : witness.body.id,
        actor: typeof witness.body.actor === "string" && witness.body.actor.trim() ? witness.body.actor.trim() : null,
        parent: typeof witness.body.parent === "string" && witness.body.parent.trim() ? witness.body.parent.trim() : null
      });
    }
    for (const claim of witness.claims ?? []) {
      if (claim.op === "thing") {
        state.thingIds.add(claim.id);
        continue;
      }
      if (claim.op !== "relation" && claim.op !== "retract") continue;
      const isRelation = claim.op === "relation";
      if (claim.rel === "hasModuleKind") {
        if (isRelation) {
          state.moduleKinds.set(claim.from, claim.to);
          if (claim.to === "context") state.contextIds.add(claim.from);
        } else if (state.moduleKinds.get(claim.from) === claim.to) {
          state.moduleKinds.delete(claim.from);
          if (claim.to === "context") state.contextIds.delete(claim.from);
        }
      }
      if (claim.rel === "inContext") {
        if (isRelation) state.objectContexts.set(claim.from, claim.to);
        else if (state.objectContexts.get(claim.from) === claim.to) state.objectContexts.delete(claim.from);
      }
      if (claim.rel === "owns") {
        if (isRelation) state.owners.set(claim.to, claim.from);
        else if (state.owners.get(claim.to) === claim.from) state.owners.delete(claim.to);
      }
      if (claim.rel === "stewards") {
        const current = state.stewards.get(claim.to) ?? new Set();
        if (isRelation) current.add(claim.from);
        else current.delete(claim.from);
        if (current.size) state.stewards.set(claim.to, current);
        else state.stewards.delete(claim.to);
      }
      if (claim.rel === "contextActor") {
        if (isRelation) state.contextActors.set(claim.from, claim.to);
        else if (state.contextActors.get(claim.from) === claim.to) state.contextActors.delete(claim.from);
      }
      if (claim.rel === "parentContext") {
        if (isRelation) state.parentContexts.set(claim.from, claim.to);
        else if (state.parentContexts.get(claim.from) === claim.to) state.parentContexts.delete(claim.from);
      }
      if (claim.rel === "installsCapability" && String(claim.meta?.targetKind || "") === "context") {
        const current = state.contextCapabilities.get(claim.from) ?? new Set();
        if (isRelation) current.add(claim.to);
        else current.delete(claim.to);
        if (current.size) state.contextCapabilities.set(claim.from, current);
        else state.contextCapabilities.delete(claim.from);
      }
      if (claim.rel === "contextCapability") {
        const current = state.contextCapabilities.get(claim.from) ?? new Set();
        if (isRelation) current.add(claim.to);
        else current.delete(claim.to);
        if (current.size) state.contextCapabilities.set(claim.from, current);
        else state.contextCapabilities.delete(claim.from);
      }
    }
  },
  snapshot(state) {
    return {
      thingIds: setClone(state.thingIds),
      moduleKinds: mapClone(state.moduleKinds),
      objectContexts: mapClone(state.objectContexts),
      owners: mapClone(state.owners),
      stewards: new Map([...state.stewards.entries()].map(([key, value]) => [key, setClone(value)])),
      contextIds: setClone(state.contextIds),
      contexts: contextRowsSnapshot(state)
    };
  }
};

function createContextNamingState() {
  return {
    bindingsByKey: new Map(),
    bindingTargetCountsByContext: new Map(),
    exportsByKey: new Map(),
    importsByKey: new Map()
  };
}

function ensureRowMap(map, key) {
  const current = map.get(key) ?? new Map();
  if (!map.has(key)) map.set(key, current);
  return current;
}

function importIdentity(row) {
  return `${row.context}${CONTEXT_REF_SEP}${row.name}${CONTEXT_REF_SEP}${row.sourceContext}${CONTEXT_REF_SEP}${row.exportName}`;
}

function contextBindingRowsFromState(state) {
  const rows = [];
  for (const rowMap of state.bindingsByKey.values()) {
    rows.push(...rowMap.values());
  }
  return rows
    .map(row => ({ ...row }))
    .sort((a, b) =>
      String(a.context).localeCompare(String(b.context))
      || String(a.name).localeCompare(String(b.name))
      || String(a.target).localeCompare(String(b.target))
    );
}

function contextExportRowsFromState(state) {
  const rows = [];
  for (const rowMap of state.exportsByKey.values()) {
    rows.push(...rowMap.values());
  }
  return rows
    .map(row => ({ ...row }))
    .sort((a, b) =>
      String(a.context).localeCompare(String(b.context))
      || String(a.name).localeCompare(String(b.name))
      || String(a.target).localeCompare(String(b.target))
    );
}

function contextImportRowsFromState(state) {
  const rows = [];
  for (const rowMap of state.importsByKey.values()) {
    rows.push(...rowMap.values());
  }
  return rows
    .map(row => ({ ...row }))
    .sort((a, b) =>
      String(a.context).localeCompare(String(b.context))
      || String(a.name).localeCompare(String(b.name))
      || String(a.sourceContext).localeCompare(String(b.sourceContext))
      || String(a.exportName).localeCompare(String(b.exportName))
    );
}

function contextScopesFromState(state) {
  return [...new Map(
    collectVisibleRowsForNamingState(state).map(row => [`${row.context}${CONTEXT_REF_SEP}${row.name}${CONTEXT_REF_SEP}${row.sourceKind}${CONTEXT_REF_SEP}${row.target}`, row])
  ).values()].sort((a, b) =>
    String(a.context).localeCompare(String(b.context))
    || String(a.name).localeCompare(String(b.name))
    || String(a.sourceKind).localeCompare(String(b.sourceKind))
    || String(a.target).localeCompare(String(b.target))
  );
}

function collectVisibleRowsForNamingState(state) {
  const rows = [];
  for (const rowMap of state.bindingsByKey.values()) {
    for (const row of rowMap.values()) {
      rows.push({
        context: row.context,
        name: row.name,
        target: row.target,
        sourceKind: "local",
        sourceContext: null,
        exportName: null,
        witness: row.witness
      });
    }
  }
  for (const rowMap of state.importsByKey.values()) {
    for (const row of rowMap.values()) {
      const exported = state.exportsByKey.get(contextKey(row.sourceContext, row.exportName));
      if (!exported?.size) continue;
      for (const exportRow of exported.values()) {
        rows.push({
          context: row.context,
          name: row.name,
          target: exportRow.target,
          sourceKind: "import",
          sourceContext: row.sourceContext,
          exportName: row.exportName,
          witness: row.witness
        });
      }
    }
  }
  return rows;
}

function contextNameResolutionsFromState(state) {
  const grouped = new Map();
  for (const row of collectVisibleRowsForNamingState(state)) {
    const key = contextKey(row.context, row.name);
    const current = grouped.get(key) ?? {
      context: row.context,
      name: row.name,
      resolution: "resolved",
      target: null,
      targets: [],
      sourceKinds: [],
      localTargets: [],
      importedTargets: [],
      imports: [],
      witnesses: [],
      rows: []
    };
    current.targets.push(row.target);
    current.sourceKinds.push(row.sourceKind);
    if (row.sourceKind === "local") current.localTargets.push(row.target);
    if (row.sourceKind === "import") {
      current.importedTargets.push(row.target);
      current.imports.push({
        sourceContext: row.sourceContext ?? null,
        exportName: row.exportName ?? null,
        target: row.target
      });
    }
    if (row.witness) current.witnesses.push(row.witness);
    current.rows.push({ ...row });
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(row => {
      const targets = uniqueSortedStrings(row.targets);
      const sourceKinds = uniqueSortedStrings(row.sourceKinds);
      const localTargets = uniqueSortedStrings(row.localTargets);
      const importedTargets = uniqueSortedStrings(row.importedTargets);
      const witnesses = uniqueSortedStrings(row.witnesses);
      const imports = row.imports
        .map(spec => ({ ...spec }))
        .sort((a, b) =>
          String(a.sourceContext).localeCompare(String(b.sourceContext))
          || String(a.exportName).localeCompare(String(b.exportName))
          || String(a.target).localeCompare(String(b.target))
        );
      return {
        context: row.context,
        name: row.name,
        resolution: targets.length === 1 ? "resolved" : "ambiguous",
        target: targets.length === 1 ? targets[0] : null,
        targets,
        sourceKinds,
        localTargets,
        importedTargets,
        imports,
        witnesses,
        rows: row.rows
      };
    })
    .sort((a, b) =>
      String(a.context).localeCompare(String(b.context))
      || String(a.name).localeCompare(String(b.name))
    );
}

function contextNameConflictsFromState(state) {
  return contextNameResolutionsFromState(state)
    .filter(row => row.resolution === "ambiguous")
    .map(row => cloneContextRow(row));
}

const contextNamingIndexSpec = {
  seed(witnesses) {
    const state = createContextNamingState();
    for (const witness of witnesses) contextNamingIndexSpec.apply(state, witness);
    return state;
  },
  apply(state, witness) {
    for (const claim of witness.claims ?? []) {
      if (claim.op !== "relation" && claim.op !== "retract") continue;
      const isRelation = claim.op === "relation";
      const bindingName = parseNamedRelation(NAME_REL_PREFIX, claim.rel);
        if (bindingName) {
          const key = contextKey(claim.from, bindingName);
          const rows = ensureRowMap(state.bindingsByKey, key);
          if (isRelation) {
            const existed = rows.has(claim.to);
            rows.set(claim.to, {
              context: claim.from,
              name: bindingName,
              target: claim.to,
              witness: witness.id
            });
            if (!existed) {
              const counts = state.bindingTargetCountsByContext.get(claim.from) ?? new Map();
              counts.set(claim.to, (counts.get(claim.to) ?? 0) + 1);
              state.bindingTargetCountsByContext.set(claim.from, counts);
            }
          } else {
            const existed = rows.delete(claim.to);
            if (!rows.size) state.bindingsByKey.delete(key);
            const counts = state.bindingTargetCountsByContext.get(claim.from);
            if (existed && counts?.has(claim.to)) {
              const next = Math.max(0, (counts.get(claim.to) ?? 0) - 1);
              if (next > 0) counts.set(claim.to, next);
              else counts.delete(claim.to);
              if (!counts.size) state.bindingTargetCountsByContext.delete(claim.from);
            }
          }
          continue;
        }
      const exportName = parseNamedRelation(EXPORT_REL_PREFIX, claim.rel);
      if (exportName) {
        const key = contextKey(claim.from, exportName);
        const rows = ensureRowMap(state.exportsByKey, key);
        if (isRelation) {
          rows.set(claim.to, {
            context: claim.from,
            name: exportName,
            target: claim.to,
            witness: witness.id
          });
        } else {
          rows.delete(claim.to);
          if (!rows.size) state.exportsByKey.delete(key);
        }
        continue;
      }
      const importName = parseNamedRelation(IMPORT_REL_PREFIX, claim.rel);
      if (!importName) continue;
      const parsed = parseImportTargetValue(claim.to);
      if (!parsed) continue;
      const row = {
        context: claim.from,
        name: importName,
        sourceContext: parsed.sourceContext,
        exportName: parsed.exportName,
        witness: witness.id
      };
      const identity = importIdentity(row);
      const rows = ensureRowMap(state.importsByKey, contextKey(claim.from, importName));
      if (isRelation) {
        rows.set(identity, row);
      } else {
        rows.delete(identity);
        if (!rows.size) state.importsByKey.delete(contextKey(claim.from, importName));
      }
    }
  },
  snapshot(state) {
    return {
      contextBindings: contextBindingRowsFromState(state),
      contextExports: contextExportRowsFromState(state),
      contextImports: contextImportRowsFromState(state),
      contextScopes: contextScopesFromState(state),
      contextNameResolutions: contextNameResolutionsFromState(state),
      contextNameConflicts: contextNameConflictsFromState(state)
    };
  }
};

function assignWorldIndex(projector, metadata) {
  Object.defineProperty(projector, "worldIndex", { value: metadata });
}

assignWorldIndex(moduleProjectors.modules, {
  name: CONTEXT_MODEL_INDEX_NAME,
  spec: contextModelIndexSpec,
  select: state => new Map(state.moduleKinds)
});

assignWorldIndex(moduleProjectors.objectContexts, {
  name: CONTEXT_MODEL_INDEX_NAME,
  spec: contextModelIndexSpec,
  select: state => new Map(state.objectContexts)
});

assignWorldIndex(moduleProjectors.contextualTargets, {
  name: CONTEXT_MODEL_INDEX_NAME,
  spec: contextModelIndexSpec,
  select: state => [...state.objectContexts.entries()]
    .map(([id, context]) => ({ id, context }))
    .sort((a, b) =>
      String(a.context).localeCompare(String(b.context))
      || String(a.id).localeCompare(String(b.id))
    )
});

assignWorldIndex(moduleProjectors.contexts, {
  name: CONTEXT_MODEL_INDEX_NAME,
  spec: contextModelIndexSpec,
  select: state => contextRowsSnapshot(state)
});

assignWorldIndex(moduleProjectors.contextBindings, {
  name: CONTEXT_NAMING_INDEX_NAME,
  spec: contextNamingIndexSpec,
  select: state => contextBindingRowsFromState(state)
});

assignWorldIndex(moduleProjectors.contextExports, {
  name: CONTEXT_NAMING_INDEX_NAME,
  spec: contextNamingIndexSpec,
  select: state => contextExportRowsFromState(state)
});

assignWorldIndex(moduleProjectors.contextImports, {
  name: CONTEXT_NAMING_INDEX_NAME,
  spec: contextNamingIndexSpec,
  select: state => contextImportRowsFromState(state)
});

assignWorldIndex(moduleProjectors.contextScopes, {
  name: CONTEXT_NAMING_INDEX_NAME,
  spec: contextNamingIndexSpec,
  select: state => contextScopesFromState(state)
});

assignWorldIndex(moduleProjectors.contextNameResolutions, {
  name: CONTEXT_NAMING_INDEX_NAME,
  spec: contextNamingIndexSpec,
  select: state => contextNameResolutionsFromState(state)
});

assignWorldIndex(moduleProjectors.contextNameConflicts, {
  name: CONTEXT_NAMING_INDEX_NAME,
  spec: contextNamingIndexSpec,
  select: state => contextNameConflictsFromState(state)
});
