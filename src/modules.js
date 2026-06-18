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
      homeContext: homeContext ? String(homeContext) : null,
      homePerspective: homePerspective ? String(homePerspective) : null
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
  if (canonical) {
    const authoringContext = typeof context === "string" && context.trim() ? context.trim() : null;
    if (!authoringContext) return { ok: true, target: canonical, source: "canonical" };
    const targetContext = moduleProjectors.objectContexts(witnesses).get(canonical) ?? null;
    if (!targetContext || targetContext === authoringContext) {
      return { ok: true, target: canonical, source: "canonical" };
    }
    const visible = moduleProjectors.contextScopes(witnesses)
      .some(row => row.context === authoringContext && row.target === canonical);
    if (visible) return { ok: true, target: canonical, source: "canonical" };
    return {
      ok: false,
      error: `${label} id targets ${canonical} in context ${targetContext} and is not visible in authoring context ${authoringContext}`
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

  candidateSnapshots: delegatedModuleProjector("candidateSnapshots", emptyRows),

  candidateSnapshotIndex: delegatedModuleProjector("candidateSnapshotIndex", () => ({
    rows: [],
    byId: Object.create(null),
    byChangeSet: Object.create(null),
    byBranch: Object.create(null),
    activeByBranch: Object.create(null)
  })),

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
