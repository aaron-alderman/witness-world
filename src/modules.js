import { thing, relation, createThing } from "./kernel.js";

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
  storage = null
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
      storage: storage && typeof storage === "object" ? { ...storage } : null
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
    for (const r of witnessRelations(witnesses)) {
      if (r.rel === "hasModuleKind") modules.set(r.from, r.to);
    }
    return modules;
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
        storage: w.body.storage && typeof w.body.storage === "object" ? { ...w.body.storage } : null
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
