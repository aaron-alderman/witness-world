import { thing, relation, retract, createThing, projectors } from "./kernel.js";
import { normalizeFields } from "./type-model.js";

const CAPABILITY_INSTALL_TARGET_KINDS = new Set(["context", "serverRunner", "routePage", "host"]);
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

function currentRelations(witnesses) {
  return projectors.currentRelations(witnesses);
}

function assetAttachmentMaps(current, assetRows) {
  const assetById = new Map(assetRows.map(row => [row.id, row]));
  const byTarget = new Map();
  const byAsset = new Map();
  for (const row of current) {
    if (row.rel !== "attachedAsset") continue;
    const asset = assetById.get(row.to);
    if (!asset) continue;
    if (!byTarget.has(row.from)) byTarget.set(row.from, []);
    byTarget.get(row.from).push(asset);
    if (!byAsset.has(row.to)) byAsset.set(row.to, []);
    byAsset.get(row.to).push(row.from);
  }
  for (const rows of byTarget.values()) rows.sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));
  for (const rows of byAsset.values()) rows.sort((a, b) => String(a).localeCompare(String(b)));
  return { byTarget, byAsset };
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
    if (w.process !== "defineCapability" || !w.body?.id) continue;
    rows.set(w.body.id, normalizeCapabilityDefinition(w.body));
  }
  return rows;
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
    placement,
    context,
    owner
  });
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
    placement
  });
  return world.emit({
    process: "defineCapability",
    actor,
    claims: [
      relation(id, "hasModuleKind", "capability"),
      ...(context ? [relation(id, "inContext", context)] : []),
      ...normalized.dependsOn.map(target => relation(id, "dependsOnCapability", target))
    ],
    body: { ...normalized, context: context ? String(context) : null }
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

export function createServerRunner(world, {
  actor,
  id,
  owner = actor,
  backendHost = null,
  frontendHost = null,
  handlerSet = null,
  actors = null,
  storage = null,
  runtimeConfig = null,
  allowActorHeader = false,
  context = null
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
      handlerSet: handlerSet ? String(handlerSet) : null,
      actors: Array.isArray(actors) ? [...actors] : null,
      storage: storage && typeof storage === "object" ? { ...storage } : null,
      runtimeConfig: runtimeConfig && typeof runtimeConfig === "object" ? { ...runtimeConfig } : null,
      allowActorHeader: allowActorHeader === true,
      context: context ? String(context) : null
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
      homeContext: homeContext ? String(homeContext) : null,
      homePerspective: homePerspective ? String(homePerspective) : null
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

export function resolveContextualName(witnesses, {
  context,
  name
}) {
  const wantedContext = typeof context === "string" && context.trim() ? context.trim() : "";
  const wantedName = typeof name === "string" && name.trim() ? name.trim() : "";
  if (!wantedContext || !wantedName) return { ok: false, error: "context and name are required for contextual resolution" };
  const matches = moduleProjectors.contextScopes(witnesses)
    .filter(row => row.context === wantedContext && row.name === wantedName);
  if (matches.length === 0) {
    return { ok: false, error: `name not visible in context: ${wantedName}` };
  }
  const targets = [...new Set(matches.map(row => row.target).filter(Boolean))];
  if (targets.length !== 1) {
    return { ok: false, error: `name resolves ambiguously in context: ${wantedName}` };
  }
  return { ok: true, target: targets[0], row: matches[0] };
}

export function resolveContextualRef(witnesses, {
  context,
  id = null,
  ref = null,
  label = "reference"
}) {
  const canonical = typeof id === "string" && id.trim() ? id.trim() : null;
  const contextual = typeof ref === "string" && ref.trim() ? ref.trim() : null;
  if (canonical && contextual) {
    return { ok: false, error: `provide either ${label} id or ${label} ref, not both` };
  }
  if (canonical) return { ok: true, target: canonical, source: "canonical" };
  if (!contextual) return { ok: true, target: null, source: "empty" };
  if (!(typeof context === "string" && context.trim())) {
    return { ok: false, error: `${label} ref requires an explicit authoring context` };
  }
  const resolved = resolveContextualName(witnesses, { context, name: contextual });
  if (!resolved.ok) return { ok: false, error: `${label} ref ${resolved.error}` };
  return { ok: true, target: resolved.target, source: "contextual", row: resolved.row };
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
    const rows = [];
    const seen = new Set();
    const rels = currentRelations(witnesses);
    const add = row => {
      const key = `${row.targetKind}\u0000${row.target}\u0000${row.capability}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
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
    return rows.sort((a, b) =>
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

  assets(witnesses) {
    const assetDownloadUrl = contentUrl => {
      if (typeof contentUrl !== "string" || !contentUrl) return null;
      return contentUrl.includes("?") ? `${contentUrl}&download=1` : `${contentUrl}?download=1`;
    };
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "asset") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        mimeType: null,
        sizeBytes: null,
        storageKey: null,
        visibility: "private",
        context: contexts.get(id) ?? null,
        contentUrl: null,
        downloadUrl: null,
        originalName: null,
        attachedTo: [],
        attachmentCount: 0
      });
    }

    for (const witness of witnesses) {
      if (witness.process !== "asset.upload" || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        mimeType: null,
        sizeBytes: null,
        storageKey: null,
        visibility: "private",
        context: contexts.get(id) ?? null,
        contentUrl: null,
        downloadUrl: null,
        originalName: null,
        attachedTo: [],
        attachmentCount: 0
      };
      row.originalName = typeof witness.body.originalName === "string" ? witness.body.originalName : row.originalName;
      row.title = titles.get(id) ?? row.originalName ?? row.title;
      row.mimeType = typeof witness.body.mimeType === "string" ? witness.body.mimeType : row.mimeType;
      row.sizeBytes = Number.isFinite(witness.body.sizeBytes) ? witness.body.sizeBytes : row.sizeBytes;
      row.storageKey = typeof witness.body.storageKey === "string" ? witness.body.storageKey : row.storageKey;
      row.visibility = witness.body.visibility === "public" || witness.body.visibility === "private"
        ? witness.body.visibility
        : row.visibility;
      row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
      row.contentUrl = typeof witness.body.contentUrl === "string" ? witness.body.contentUrl : row.contentUrl;
      row.downloadUrl = assetDownloadUrl(row.contentUrl);
      rows.set(id, row);
    }

    for (const row of rows.values()) {
      if (!row.downloadUrl) row.downloadUrl = assetDownloadUrl(row.contentUrl);
    }

    const assetRows = [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const attachments = assetAttachmentMaps(currentRelations(witnesses), assetRows);
    for (const row of assetRows) {
      row.attachedTo = attachments.byAsset.get(row.id) ?? [];
      row.attachmentCount = row.attachedTo.length;
    }
    return assetRows;
  },

  assetIndex(witnesses) {
    const rows = moduleProjectors.assets(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  jobs(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "job") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        serverRunner: null,
        handler: null,
        actor: null,
        payload: null,
        status: "queued",
        availableAt: null,
        createdAt: null,
        completedAt: null,
        idempotencyKey: null,
        maxAttempts: null,
        retryDelayMs: null,
        attempt: 0,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!witness.process.startsWith("jobs.queue.") || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        serverRunner: null,
        handler: null,
        actor: null,
        payload: null,
        status: "queued",
        availableAt: null,
        createdAt: null,
        completedAt: null,
        idempotencyKey: null,
        maxAttempts: null,
        retryDelayMs: null,
        attempt: 0,
        lastError: null
      };
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.handler = typeof witness.body.handler === "string" ? witness.body.handler : row.handler;
      row.actor = typeof witness.body.actor === "string" ? witness.body.actor : row.actor;
      row.title = titles.get(id) ?? row.handler ?? row.title;
      if (Object.prototype.hasOwnProperty.call(witness.body, "payload")) row.payload = witness.body.payload;
      row.idempotencyKey = typeof witness.body.idempotencyKey === "string" ? witness.body.idempotencyKey : row.idempotencyKey;
      row.maxAttempts = Number.isFinite(witness.body.maxAttempts) ? witness.body.maxAttempts : row.maxAttempts;
      row.retryDelayMs = Number.isFinite(witness.body.retryDelayMs) ? witness.body.retryDelayMs : row.retryDelayMs;
      if (Number.isFinite(witness.body.attempt)) row.attempt = witness.body.attempt;
      if (typeof witness.body.availableAt === "string") row.availableAt = witness.body.availableAt;
      if (typeof witness.body.nextAvailableAt === "string") row.availableAt = witness.body.nextAvailableAt;
      if (typeof witness.body.createdAt === "string") row.createdAt = witness.body.createdAt;
      if (typeof witness.body.completedAt === "string") row.completedAt = witness.body.completedAt;
      if (typeof witness.body.reason === "string") row.lastError = witness.body.reason;

      if (witness.process === "jobs.queue.enqueue") row.status = "queued";
      if (witness.process === "jobs.queue.start") row.status = "running";
      if (witness.process === "jobs.queue.retry") row.status = "queued";
      if (witness.process === "jobs.queue.succeeded") row.status = "succeeded";
      if (witness.process === "jobs.queue.deadLetter") row.status = "dead-letter";
      rows.set(id, row);
    }

    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  jobIndex(witnesses) {
    const rows = moduleProjectors.jobs(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  notifications(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const jobIndex = moduleProjectors.jobIndex(witnesses).byId;
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "notification") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        channel: null,
        recipient: null,
        subject: null,
        sender: null,
        template: null,
        vars: null,
        text: null,
        preview: null,
        transport: "stub",
        jobId: null,
        status: "queued",
        providerMessageId: null,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!/^notify\.(email|sms)\./.test(witness.process) || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        channel: null,
        recipient: null,
        subject: null,
        sender: null,
        template: null,
        vars: null,
        text: null,
        preview: null,
        transport: "stub",
        jobId: null,
        status: "queued",
        providerMessageId: null,
        lastError: null
      };
      row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
      row.channel = witness.process.startsWith("notify.email.") ? "email" : "sms";
      row.recipient = typeof witness.body.to === "string" ? witness.body.to : row.recipient;
      row.subject = typeof witness.body.subject === "string" ? witness.body.subject : row.subject;
      row.sender = typeof witness.body.sender === "string" ? witness.body.sender : row.sender;
      row.template = typeof witness.body.template === "string" ? witness.body.template : row.template;
      if (Object.prototype.hasOwnProperty.call(witness.body, "vars")) row.vars = witness.body.vars;
      row.text = typeof witness.body.text === "string" ? witness.body.text : row.text;
      row.preview = typeof witness.body.preview === "string" ? witness.body.preview : row.preview;
      row.transport = typeof witness.body.transport === "string" ? witness.body.transport : row.transport;
      row.jobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.jobId;
      row.providerMessageId = typeof witness.body.providerMessageId === "string" ? witness.body.providerMessageId : row.providerMessageId;
      row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
      row.title = titles.get(id) ?? row.subject ?? row.recipient ?? row.title;
      rows.set(id, row);
    }

    return [...rows.values()]
      .map(row => {
        const job = row.jobId ? jobIndex[row.jobId] ?? null : null;
        let status = row.status;
        if (job?.status === "running") status = "running";
        else if (job?.status === "queued") status = "queued";
        else if (job?.status === "dead-letter") status = "failed";
        else if (row.providerMessageId) status = "sent";
        else if (job?.status === "succeeded") status = "sent";
        return {
          ...row,
          status,
          attempt: job?.attempt ?? 0,
          maxAttempts: job?.maxAttempts ?? null,
          retryDelayMs: job?.retryDelayMs ?? null,
          lastError: row.lastError ?? job?.lastError ?? null
        };
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  notificationIndex(witnesses) {
    const rows = moduleProjectors.notifications(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  outboundRequests(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "outboundRequest") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        target: null,
        url: null,
        method: "GET",
        transport: null,
        status: "pending",
        authKind: null,
        authConfigKey: null,
        requestHeaderNames: [],
        requestBodyKind: "none",
        timeoutMs: null,
        maxAttempts: null,
        retryDelayMs: null,
        attempt: 0,
        correlationId: null,
        externalRefId: null,
        responseStatus: null,
        responseContentType: null,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!witness.process.startsWith("http.outbound.") || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        target: null,
        url: null,
        method: "GET",
        transport: null,
        status: "pending",
        authKind: null,
        authConfigKey: null,
        requestHeaderNames: [],
        requestBodyKind: "none",
        timeoutMs: null,
        maxAttempts: null,
        retryDelayMs: null,
        attempt: 0,
        correlationId: null,
        externalRefId: null,
        responseStatus: null,
        responseContentType: null,
        lastError: null
      };
      row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.target = typeof witness.body.target === "string" ? witness.body.target : row.target;
      row.url = typeof witness.body.url === "string" ? witness.body.url : row.url;
      row.method = typeof witness.body.method === "string" ? witness.body.method : row.method;
      row.transport = typeof witness.body.transport === "string" ? witness.body.transport : row.transport;
      row.authKind = typeof witness.body.authKind === "string" ? witness.body.authKind : row.authKind;
      row.authConfigKey = typeof witness.body.authConfigKey === "string" ? witness.body.authConfigKey : row.authConfigKey;
      row.requestHeaderNames = Array.isArray(witness.body.requestHeaderNames)
        ? witness.body.requestHeaderNames.map(value => String(value))
        : row.requestHeaderNames;
      row.requestBodyKind = typeof witness.body.requestBodyKind === "string" ? witness.body.requestBodyKind : row.requestBodyKind;
      row.timeoutMs = Number.isFinite(witness.body.timeoutMs) ? witness.body.timeoutMs : row.timeoutMs;
      row.maxAttempts = Number.isFinite(witness.body.maxAttempts) ? witness.body.maxAttempts : row.maxAttempts;
      row.retryDelayMs = Number.isFinite(witness.body.retryDelayMs) ? witness.body.retryDelayMs : row.retryDelayMs;
      row.attempt = Number.isFinite(witness.body.attempt) ? witness.body.attempt : row.attempt;
      row.correlationId = typeof witness.body.correlationId === "string" ? witness.body.correlationId : row.correlationId;
      row.externalRefId = typeof witness.body.externalRefId === "string" ? witness.body.externalRefId : row.externalRefId;
      row.responseStatus = Number.isFinite(witness.body.responseStatus) ? witness.body.responseStatus : row.responseStatus;
      row.responseContentType = typeof witness.body.responseContentType === "string" ? witness.body.responseContentType : row.responseContentType;
      row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
      if (witness.process === "http.outbound.request") row.status = "pending";
      if (witness.process === "http.outbound.attempt") row.status = "running";
      if (witness.process === "http.outbound.retry") row.status = "retrying";
      if (witness.process === "http.outbound.succeeded") row.status = "succeeded";
      if (witness.process === "http.outbound.failed") row.status = "failed";
      row.title = titles.get(id) ?? row.target ?? row.title;
      rows.set(id, row);
    }

    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  outboundRequestIndex(witnesses) {
    const rows = moduleProjectors.outboundRequests(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  webhookDeliveries(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const jobIndex = moduleProjectors.jobIndex(witnesses).byId;
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "webhookDelivery") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        target: null,
        deliveryId: null,
        contentType: null,
        sizeBytes: null,
        storageKey: null,
        signatureStatus: null,
        replayStatus: null,
        status: "received",
        receivedAt: null,
        timestamp: null,
        correlationId: null,
        jobId: null,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!witness.process.startsWith("webhook.inbound.") || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        target: null,
        deliveryId: null,
        contentType: null,
        sizeBytes: null,
        storageKey: null,
        signatureStatus: null,
        replayStatus: null,
        status: "received",
        receivedAt: null,
        timestamp: null,
        correlationId: null,
        jobId: null,
        lastError: null
      };
      row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.target = typeof witness.body.target === "string" ? witness.body.target : row.target;
      row.deliveryId = typeof witness.body.deliveryId === "string" ? witness.body.deliveryId : row.deliveryId;
      row.contentType = typeof witness.body.contentType === "string" ? witness.body.contentType : row.contentType;
      row.sizeBytes = Number.isFinite(witness.body.sizeBytes) ? witness.body.sizeBytes : row.sizeBytes;
      row.storageKey = typeof witness.body.storageKey === "string" ? witness.body.storageKey : row.storageKey;
      row.receivedAt = typeof witness.body.receivedAt === "string" ? witness.body.receivedAt : row.receivedAt;
      row.timestamp = typeof witness.body.timestamp === "string" ? witness.body.timestamp : row.timestamp;
      row.correlationId = typeof witness.body.correlationId === "string" ? witness.body.correlationId : row.correlationId;
      row.jobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.jobId;
      row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
      if (witness.process === "webhook.inbound.receive") row.status = "received";
      if (witness.process === "webhook.inbound.verify.failed") {
        row.signatureStatus = "invalid";
        row.status = "rejected";
      }
      if (witness.process === "webhook.inbound.replay.failed") {
        row.signatureStatus = row.signatureStatus ?? "verified";
        row.replayStatus = "duplicate";
        row.status = "rejected";
      }
      if (witness.process === "webhook.inbound.accepted") {
        row.signatureStatus = "verified";
        row.replayStatus = "accepted";
        row.status = "accepted";
      }
      if (witness.process === "webhook.inbound.processed") {
        row.signatureStatus = "verified";
        row.replayStatus = row.replayStatus ?? "accepted";
        row.status = "processed";
      }
      if (witness.process === "webhook.inbound.process.failed") {
        row.signatureStatus = "verified";
        row.replayStatus = row.replayStatus ?? "accepted";
      }
      row.title = titles.get(id) ?? row.target ?? row.deliveryId ?? row.title;
      rows.set(id, row);
    }

    return [...rows.values()]
      .map(row => {
        const job = row.jobId ? jobIndex[row.jobId] ?? null : null;
        let status = row.status;
        if (job?.status === "running") status = "running";
        else if (job?.status === "queued") status = "queued";
        else if (job?.status === "dead-letter") status = "failed";
        else if (job?.status === "succeeded" && row.status !== "processed") status = "processed";
        return {
          ...row,
          status,
          attempt: job?.attempt ?? 0,
          maxAttempts: job?.maxAttempts ?? null,
          retryDelayMs: job?.retryDelayMs ?? null,
          lastError: row.lastError ?? job?.lastError ?? null
        };
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  webhookDeliveryIndex(witnesses) {
    const rows = moduleProjectors.webhookDeliveries(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  sqlDatasources(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );
    const operationRows = moduleProjectors.sqlOperations(witnesses);

    for (const [id, kind] of modules) {
      if (kind !== "sqlDatasource") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        datasourceName: null,
        migrationTable: null,
        status: "configured",
        path: null,
        adapterStatus: null,
        lastError: null,
        operationCount: 0
      });
    }

    for (const witness of witnesses) {
      if (!witness.process.startsWith("db.sql.datasource.") || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        datasourceName: null,
        migrationTable: null,
        status: "configured",
        path: null,
        adapterStatus: null,
        lastError: null,
        operationCount: 0
      };
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
      row.datasourceName = typeof witness.body.datasourceName === "string" ? witness.body.datasourceName : row.datasourceName;
      row.migrationTable = typeof witness.body.migrationTable === "string" ? witness.body.migrationTable : row.migrationTable;
      row.path = typeof witness.body.path === "string" ? witness.body.path : row.path;
      row.adapterStatus = typeof witness.body.adapterStatus === "string" ? witness.body.adapterStatus : row.adapterStatus;
      row.status = typeof witness.body.status === "string" ? witness.body.status : row.status;
      row.lastError = typeof witness.body.reason === "string"
        ? witness.body.reason
        : (typeof witness.body.lastError === "string" ? witness.body.lastError : row.lastError);
      row.title = titles.get(id) ?? row.datasourceName ?? row.title;
      rows.set(id, row);
    }

    const operationCounts = new Map();
    for (const operation of operationRows) {
      if (!operation.datasourceId) continue;
      operationCounts.set(operation.datasourceId, (operationCounts.get(operation.datasourceId) ?? 0) + 1);
    }

    return [...rows.values()]
      .map(row => ({ ...row, operationCount: operationCounts.get(row.id) ?? 0 }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  sqlDatasourceIndex(witnesses) {
    const rows = moduleProjectors.sqlDatasources(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  sqlOperations(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "sqlOperation") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        datasourceId: null,
        datasourceName: null,
        provider: null,
        kind: null,
        status: "pending",
        rowCount: 0,
        changes: 0,
        lastInsertRowid: 0,
        migrationCount: 0,
        skippedCount: 0,
        stepCount: 0,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!witness.process.startsWith("db.sql.") || !witness.body?.id || witness.process.startsWith("db.sql.datasource.")) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        datasourceId: null,
        datasourceName: null,
        provider: null,
        kind: null,
        status: "pending",
        rowCount: 0,
        changes: 0,
        lastInsertRowid: 0,
        migrationCount: 0,
        skippedCount: 0,
        stepCount: 0,
        lastError: null
      };
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.datasourceId = typeof witness.body.datasourceId === "string" ? witness.body.datasourceId : row.datasourceId;
      row.datasourceName = typeof witness.body.datasourceName === "string" ? witness.body.datasourceName : row.datasourceName;
      row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
      row.kind = typeof witness.body.kind === "string" ? witness.body.kind : row.kind;
      row.rowCount = Number.isFinite(witness.body.rowCount) ? witness.body.rowCount : row.rowCount;
      row.changes = Number.isFinite(witness.body.changes) ? witness.body.changes : row.changes;
      row.lastInsertRowid = Number.isFinite(witness.body.lastInsertRowid) ? witness.body.lastInsertRowid : row.lastInsertRowid;
      row.migrationCount = Number.isFinite(witness.body.migrationCount) ? witness.body.migrationCount : row.migrationCount;
      row.skippedCount = Number.isFinite(witness.body.skippedCount) ? witness.body.skippedCount : row.skippedCount;
      row.stepCount = Number.isFinite(witness.body.stepCount) ? witness.body.stepCount : row.stepCount;
      row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
      row.status = witness.process.endsWith(".failed") ? "failed" : "succeeded";
      row.title = titles.get(id) ?? row.title;
      rows.set(id, row);
    }

    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  sqlOperationIndex(witnesses) {
    const rows = moduleProjectors.sqlOperations(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  searchIndexes(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "searchIndex") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        name: "main",
        status: "pending",
        sourceCount: 0,
        documentCount: 0,
        assetCount: 0,
        queryCount: 0,
        lastBuiltAt: null,
        lastQueryAt: null,
        path: null,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!witness.process.startsWith("search.index.") || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        name: "main",
        status: "pending",
        sourceCount: 0,
        documentCount: 0,
        assetCount: 0,
        queryCount: 0,
        lastBuiltAt: null,
        lastQueryAt: null,
        path: null,
        lastError: null
      };
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
      row.name = typeof witness.body.name === "string" ? witness.body.name : row.name;
      row.sourceCount = Number.isFinite(witness.body.sourceCount) ? witness.body.sourceCount : row.sourceCount;
      row.documentCount = Number.isFinite(witness.body.documentCount) ? witness.body.documentCount : row.documentCount;
      row.assetCount = Number.isFinite(witness.body.assetCount) ? witness.body.assetCount : row.assetCount;
      row.queryCount = Number.isFinite(witness.body.queryCount) ? witness.body.queryCount : row.queryCount;
      row.lastBuiltAt = typeof witness.body.lastBuiltAt === "string" ? witness.body.lastBuiltAt : row.lastBuiltAt;
      row.lastQueryAt = typeof witness.body.lastQueryAt === "string" ? witness.body.lastQueryAt : row.lastQueryAt;
      row.path = typeof witness.body.path === "string" ? witness.body.path : row.path;
      row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
      if (witness.process === "search.index.build" || witness.process === "search.index.reindex" || witness.process === "search.index.query") row.status = "ready";
      if (witness.process.endsWith(".failed")) row.status = "failed";
      row.title = titles.get(id) ?? row.title;
      rows.set(id, row);
    }

    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  searchIndexIndex(witnesses) {
    const rows = moduleProjectors.searchIndexes(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

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
        handlerSet: w.body.handlerSet ? String(w.body.handlerSet) : null,
        actors: Array.isArray(w.body.actors) ? [...w.body.actors] : null,
        storage: w.body.storage && typeof w.body.storage === "object" ? { ...w.body.storage } : null,
        runtimeConfig: w.body.runtimeConfig && typeof w.body.runtimeConfig === "object" ? { ...w.body.runtimeConfig } : null,
        allowActorHeader: w.body.allowActorHeader === true,
        context: contexts.get(w.body.id) ?? (w.body.context ? String(w.body.context) : null)
      });
    }
    return [...runnerMap.values()];
  },

  identities(witnesses) {
    const identityMap = new Map();
    for (const w of witnesses) {
      if (w.process !== "defineIdentity" || !w.body?.id) continue;
      identityMap.set(w.body.id, {
        id: w.body.id,
        actor: String(w.body.actor || ""),
        label: String(w.body.label || ""),
        username: String(w.body.username || ""),
        password: String(w.body.password || ""),
        homeContext: w.body.homeContext ? String(w.body.homeContext) : null,
        homePerspective: w.body.homePerspective ? String(w.body.homePerspective) : null
      });
    }
    return [...identityMap.values()];
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

  oauthFlows(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "oauthFlow") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        state: null,
        action: null,
        requestedIdentity: null,
        linkedIdentity: null,
        createdIdentity: null,
        providerAccountId: null,
        status: "started",
        callbackUrl: null,
        authorizeUrl: null,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!witness.process.startsWith("auth.oauth.") || !witness.body?.id) continue;
      const id = String(witness.body.id);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        state: null,
        action: null,
        requestedIdentity: null,
        linkedIdentity: null,
        createdIdentity: null,
        providerAccountId: null,
        status: "started",
        callbackUrl: null,
        authorizeUrl: null,
        lastError: null
      };
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
      row.state = typeof witness.body.state === "string" ? witness.body.state : row.state;
      row.action = typeof witness.body.action === "string" ? witness.body.action : row.action;
      row.requestedIdentity = typeof witness.body.requestedIdentity === "string" ? witness.body.requestedIdentity : row.requestedIdentity;
      row.linkedIdentity = typeof witness.body.identity === "string" ? witness.body.identity : row.linkedIdentity;
      row.createdIdentity = witness.body.createdIdentity === true ? row.linkedIdentity : row.createdIdentity;
      row.providerAccountId = typeof witness.body.providerAccountId === "string" ? witness.body.providerAccountId : row.providerAccountId;
      row.callbackUrl = typeof witness.body.callbackUrl === "string" ? witness.body.callbackUrl : row.callbackUrl;
      row.authorizeUrl = typeof witness.body.authorizeUrl === "string" ? witness.body.authorizeUrl : row.authorizeUrl;
      row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
      if (witness.process === "auth.oauth.start") row.status = "started";
      if (witness.process === "auth.oauth.callback") row.status = "callback";
      if (witness.process === "auth.oauth.link") row.status = witness.body.createdIdentity === true ? "created" : "linked";
      if (witness.process === "auth.oauth.session") row.status = "authenticated";
      if (witness.process.endsWith(".failed")) row.status = "failed";
      row.title = titles.get(id) ?? row.title;
      rows.set(id, row);
    }

    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  oauthFlowIndex(witnesses) {
    const rows = moduleProjectors.oauthFlows(witnesses);
    const byId = Object.create(null);
    const byState = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      if (row.state) byState[row.state] = row;
    }
    return { rows, byId, byState };
  },

  oauthLinks(witnesses) {
    const rows = new Map();
    const owners = projectors.owners(witnesses);
    const contexts = moduleProjectors.objectContexts(witnesses);
    const modules = moduleProjectors.modules(witnesses);
    const identities = moduleProjectors.identityIndex(witnesses).byId;
    const titles = new Map(
      currentRelations(witnesses)
        .filter(row => row.rel === "hasTitle")
        .map(row => [row.from, row.to])
    );

    for (const [id, kind] of modules) {
      if (kind !== "oauthLink") continue;
      rows.set(id, {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        providerAccountId: null,
        identity: null,
        actor: null,
        label: null,
        flowId: null,
        status: "linked",
        createdIdentity: false,
        lastError: null
      });
    }

    for (const witness of witnesses) {
      if (!["auth.oauth.link", "auth.oauth.link.failed"].includes(witness.process) || !witness.body?.linkId) continue;
      const id = String(witness.body.linkId);
      const row = rows.get(id) ?? {
        id,
        title: titles.get(id) ?? id,
        owner: owners.get(id) ?? null,
        context: contexts.get(id) ?? null,
        serverRunner: null,
        provider: null,
        providerAccountId: null,
        identity: null,
        actor: null,
        label: null,
        flowId: null,
        status: "linked",
        createdIdentity: false,
        lastError: null
      };
      row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
      row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
      row.providerAccountId = typeof witness.body.providerAccountId === "string" ? witness.body.providerAccountId : row.providerAccountId;
      row.identity = typeof witness.body.identity === "string" ? witness.body.identity : row.identity;
      const identity = row.identity ? identities[row.identity] ?? null : null;
      row.actor = typeof witness.body.actor === "string" ? witness.body.actor : (identity?.actor ?? row.actor);
      row.label = typeof witness.body.label === "string" ? witness.body.label : (identity?.label ?? row.label);
      row.flowId = typeof witness.body.id === "string" ? witness.body.id : row.flowId;
      row.createdIdentity = witness.body.createdIdentity === true || row.createdIdentity === true;
      row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
      row.status = witness.process.endsWith(".failed") ? "failed" : "linked";
      row.title = titles.get(id) ?? row.title;
      rows.set(id, row);
    }

    return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  },

  oauthLinkIndex(witnesses) {
    const rows = moduleProjectors.oauthLinks(witnesses);
    const byId = Object.create(null);
    const byProviderAccount = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      if (row.provider && row.providerAccountId) byProviderAccount[`${row.provider}:${row.providerAccountId}`] = row;
    }
    return { rows, byId, byProviderAccount };
  },

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
