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
  const jobHandlers = { ...pluginJobHandlers, ...(appContext.jobHandlers ?? {}) };
  const providerRuntimes = Object.create(null);
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
  providerRuntimes["jobs.queue"] = appContext.jobs;
  const instantiateProviderRuntime = (providerId, factory) => {
    if (typeof factory !== "function" || providerId === "jobs.queue") return null;
    return factory({
      world,
      project,
      runtimeConfig: appContext.runtimeConfig,
      runtimeRoot,
      storage,
      serverRunnerId: serverRunner.id,
      backendHost,
      frontendHost,
      getAppContext: () => contextRef
    });
  };
  for (const [providerId, factory] of Object.entries(providerRuntimeFactories)) {
    const runtime = instantiateProviderRuntime(providerId, factory);
    if (runtime != null) providerRuntimes[providerId] = runtime;
  }
  appContext.providerRuntimes = providerRuntimes;
  appContext.secretStore = providerRuntimes["secret.store"] ?? null;
  appContext.dbSql = providerRuntimes["db.sql"] ?? null;
  appContext.searchIndex = providerRuntimes["search.index"] ?? null;
  appContext.authOAuth = {
    pendingFlows: new Map()
  };
  appContext.runtimeContributions = runtimeContributions;
  appContext.httpOutboundStubState = new Map();
  appContext.close = () => {
    const closed = new Set();
    for (const runtime of Object.values(appContext.providerRuntimes ?? {})) {
      if (!runtime || closed.has(runtime)) continue;
      closed.add(runtime);
      runtime.close?.();
    }
  };
  contextRef = appContext;
  return appContext;
}
