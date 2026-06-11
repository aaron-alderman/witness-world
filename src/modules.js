import { thing, relation, retract, createThing, projectors } from "./kernel.js";
import { normalizeFields } from "./type-model.js";

const CAPABILITY_INSTALL_TARGET_KINDS = new Set(["context", "serverRunner", "routePage", "host"]);

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
  placement = []
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
    placement: [...new Set((Array.isArray(placement) ? placement : []).map(String).filter(Boolean))]
  };
}

function currentRelations(witnesses) {
  return projectors.currentRelations(witnesses);
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
  placement = [],
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
    placement,
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
  placement = [],
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
    placement
  });
  return world.emit({
    process: "defineCapability",
    actor,
    claims: [
      relation(id, "hasModuleKind", "capability"),
      ...normalized.dependsOn.map(target => relation(id, "dependsOnCapability", target))
    ],
    body: normalized
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
  allowActorHeader = false
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineServerRunner",
    actor,
    claims: [
      relation(id, "hasModuleKind", "serverRunner"),
      relation(id, "supportsProcess", "serveRoute"),
      relation(id, "hostBoundary", "http"),
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
      allowActorHeader: allowActorHeader === true
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
  owner = actor
}) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineIdentity",
    actor,
    claims: [
      relation(id, "hasModuleKind", "identity"),
      relation(id, "identityActor", identityActor),
      ...(homePerspective ? [relation(id, "homePerspective", homePerspective)] : [])
    ],
    body: {
      id,
      actor: String(identityActor),
      label: String(label),
      username: String(username),
      password: String(password),
      homePerspective: homePerspective ? String(homePerspective) : null
    }
  });
}

export function defineRoute(world, { actor, id, path, serves, method = "GET", handler = null, params = null, owner = actor }) {
  createThing(world, { actor, id, owner });
  return world.emit({
    process: "defineRoute",
    actor,
    claims: [
      relation(id, "hasModuleKind", "route"),
      relation(id, "serves", serves),
      relation(id, "path", path)
    ],
    body: { id, path, serves, method: String(method || "GET").toUpperCase(), handler: handler ? String(handler) : null, params: params && typeof params === "object" ? params : null }
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

  contexts(witnesses) {
    const map = new Map();
    const rels = currentRelations(witnesses);
    const installs = moduleProjectors.capabilityInstalls(witnesses)
      .filter(row => row.targetKind === "context");
    for (const r of rels) {
      if (r.rel === "hasModuleKind" && r.to === "context") {
        if (!map.has(r.from)) map.set(r.from, { id: r.from, actor: null, parent: null, capabilities: [] });
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
      .map(row => ({ ...row, capabilities: [...new Set(row.capabilities)].sort() }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
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
    const routeMap = new Map();
    for (const w of witnesses) {
      if (w.process !== "defineRoute" || !w.body?.id || !w.body?.path) continue;
      routeMap.set(w.body.id, {
        id: w.body.id,
        path: w.body.path,
        serves: w.body.serves,
        method: String(w.body.method || "GET").toUpperCase(),
        handler: w.body.handler ? String(w.body.handler) : null,
        params: w.body.params && typeof w.body.params === "object" ? { ...w.body.params } : null
      });
    }
    return [...routeMap.values()];
  },

  serverRunners(witnesses) {
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
        allowActorHeader: w.body.allowActorHeader === true
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
        homePerspective: w.body.homePerspective ? String(w.body.homePerspective) : null
      });
    }
    return [...identityMap.values()];
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
