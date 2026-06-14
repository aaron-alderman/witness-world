import { moduleProjectors } from "./modules.js";
import { isoAt, positiveInteger, runtimeConfigLookup } from "./runtime-config-utils.js";

export function actorsFromIdentities(identities) {
  const seen = new Set();
  const actors = [];
  for (const identity of identities ?? []) {
    const actor = typeof identity?.actor === "string" ? identity.actor.trim() : "";
    if (!actor || seen.has(actor)) continue;
    seen.add(actor);
    actors.push({ id: actor, label: identity.label || actor });
  }
  return actors;
}

export function createUnavailableRuntimeAppContext({
  world,
  reason,
  identities
}) {
  return {
    ok: false,
    reason,
    actors: actorsFromIdentities(identities),
    handlers: {},
    visibleWitnesses: () => world.allWitnesses()
  };
}

export async function createRuntimeAppContext({
  world,
  serverRunner,
  appProject = null,
  backendHost,
  frontendHost,
  runtimeRoot,
  storage,
  runtimeConfig,
  sendJson,
  readJson,
  handlerSetFactories,
  runtimeContributions = null,
  projectionContext = null,
  identityIndex
}) {
  if (runtimeConfig && runtimeConfig.ok === false) {
    return { ok: false, reason: "runtime config unresolved", runtimeConfigFailures: runtimeConfig.failures ?? [] };
  }

  const resolvedIdentityIndex = identityIndex ?? world.project(moduleProjectors.identityIndex);
  const project = projector => world.project(projector, { projectionContext });
  const actors = Array.isArray(serverRunner.actors) && serverRunner.actors.length
    ? [...serverRunner.actors]
    : actorsFromIdentities(resolvedIdentityIndex.rows);

  let appContext;
  if (!serverRunner.handlerSet) {
    appContext = {
      ok: true,
      actors,
      identityIndex: resolvedIdentityIndex,
      serverRunnerId: serverRunner.id,
      appProject,
      appRoot: appProject?.appRoot ?? null,
      manifestPath: appProject?.manifestPath ?? null,
      runtimeRoot,
      storage,
      runtimeConfig: runtimeConfig?.values ?? {},
      runtimeConfigFields: runtimeConfig?.fields ?? [],
      projectionContext,
      project,
      handlers: {},
      jobHandlers: {},
      visibleWitnesses: () => world.allWitnesses()
    };
  } else {
    const factory = handlerSetFactories[serverRunner.handlerSet];
    if (!factory) return { ok: false, reason: "unknown handler set" };
    const produced = await factory({
      world,
      project,
      backendHost,
      frontendHost,
      runtimeRoot,
      actors,
      storage,
      runtimeConfig: runtimeConfig?.values ?? {},
      sendJson,
      readJson
    });
    appContext = {
      ok: true,
      actors: produced.actors ?? actors,
      identityIndex: resolvedIdentityIndex,
      serverRunnerId: serverRunner.id,
      appProject,
      appRoot: appProject?.appRoot ?? null,
      manifestPath: appProject?.manifestPath ?? null,
      runtimeRoot,
      storage,
      runtimeConfig: runtimeConfig?.values ?? {},
      runtimeConfigFields: runtimeConfig?.fields ?? [],
      projectionContext,
      project,
      handlers: produced.handlers ?? {},
      jobHandlers: produced.jobHandlers ?? {},
      visibleWitnesses: produced.visibleWitnesses ?? (() => world.allWitnesses())
    };
  }

  let contextRef = appContext;
  const jobHandlerDeps = {
    world,
    project,
    backendHost,
    runtimeConfig: appContext.runtimeConfig,
    runtimeConfigLookup,
    positiveInteger,
    isoAt
  };
  const pluginJobHandlers = Object.assign(
    {},
    ...Object.values(runtimeContributions?.jobHandlerFactories ?? {}).map(factory => factory(jobHandlerDeps) ?? {})
  );
  const providerRuntimeFactories = runtimeContributions?.providerRuntimeFactories ?? {};
  const jobsFactory = providerRuntimeFactories["jobs.queue"];
  const dbSqlFactory = providerRuntimeFactories["db.sql"];
  const searchIndexFactory = providerRuntimeFactories["search.index"];
  const jobHandlers = { ...pluginJobHandlers, ...(appContext.jobHandlers ?? {}) };
  appContext.jobs = typeof jobsFactory === "function"
    ? jobsFactory({
        world,
        project,
        serverRunnerId: serverRunner.id,
        runtimeConfig: appContext.runtimeConfig,
        jobHandlers,
        getAppContext: () => contextRef
      })
    : {
        jobHandlers,
        close() {}
      };
  appContext.dbSql = typeof dbSqlFactory === "function"
    ? dbSqlFactory({
        runtimeConfig: appContext.runtimeConfig,
        runtimeRoot,
        serverRunnerId: serverRunner.id
      })
    : null;
  appContext.searchIndex = typeof searchIndexFactory === "function"
    ? searchIndexFactory({
        world,
        project,
        runtimeConfig: appContext.runtimeConfig,
        runtimeRoot,
        serverRunnerId: serverRunner.id,
        storage
      })
    : null;
  appContext.authOAuth = {
    pendingFlows: new Map()
  };
  appContext.runtimeContributions = runtimeContributions;
  appContext.httpOutboundStubState = new Map();
  appContext.close = () => {
    appContext.jobs?.close?.();
    appContext.dbSql?.close?.();
    appContext.searchIndex?.close?.();
  };
  contextRef = appContext;
  return appContext;
}
