import { moduleProjectors } from "./modules.js";

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
  backendHost,
  frontendHost,
  runtimeRoot,
  storage,
  runtimeConfig,
  sendJson,
  readJson,
  handlerSetFactories,
  createBuiltinAssetJobHandlers,
  createBuiltinNotificationJobHandlers,
  createBuiltinWebhookJobHandlers,
  createInProcessJobQueue,
  createDbSqlRuntime,
  createSearchIndexRuntime,
  identityIndex
}) {
  if (runtimeConfig && runtimeConfig.ok === false) {
    return { ok: false, reason: "runtime config unresolved", runtimeConfigFailures: runtimeConfig.failures ?? [] };
  }

  const resolvedIdentityIndex = identityIndex ?? world.project(moduleProjectors.identityIndex);
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
      runtimeRoot,
      storage,
      runtimeConfig: runtimeConfig?.values ?? {},
      runtimeConfigFields: runtimeConfig?.fields ?? [],
      handlers: {},
      jobHandlers: {},
      visibleWitnesses: () => world.allWitnesses()
    };
  } else {
    const factory = handlerSetFactories[serverRunner.handlerSet];
    if (!factory) return { ok: false, reason: "unknown handler set" };
    const produced = await factory({
      world,
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
      runtimeRoot,
      storage,
      runtimeConfig: runtimeConfig?.values ?? {},
      runtimeConfigFields: runtimeConfig?.fields ?? [],
      handlers: produced.handlers ?? {},
      jobHandlers: produced.jobHandlers ?? {},
      visibleWitnesses: produced.visibleWitnesses ?? (() => world.allWitnesses())
    };
  }

  let contextRef = appContext;
  const builtinJobHandlers = {
    ...createBuiltinAssetJobHandlers({
      world,
      backendHost,
      runtimeConfig: appContext.runtimeConfig
    }),
    ...createBuiltinNotificationJobHandlers({
      world,
      backendHost,
      runtimeConfig: appContext.runtimeConfig
    }),
    ...createBuiltinWebhookJobHandlers({
      world,
      backendHost
    })
  };
  appContext.jobs = createInProcessJobQueue({
    world,
    serverRunnerId: serverRunner.id,
    runtimeConfig: appContext.runtimeConfig,
    jobHandlers: { ...builtinJobHandlers, ...(appContext.jobHandlers ?? {}) },
    getAppContext: () => contextRef
  });
  appContext.dbSql = createDbSqlRuntime({
    runtimeConfig: appContext.runtimeConfig,
    runtimeRoot,
    serverRunnerId: serverRunner.id
  });
  appContext.searchIndex = createSearchIndexRuntime({
    world,
    runtimeConfig: appContext.runtimeConfig,
    runtimeRoot,
    serverRunnerId: serverRunner.id,
    storage
  });
  appContext.authOAuth = {
    pendingFlows: new Map()
  };
  appContext.httpOutboundStubState = new Map();
  appContext.close = () => {
    appContext.jobs?.close?.();
    appContext.dbSql?.close?.();
    appContext.searchIndex?.close?.();
  };
  contextRef = appContext;
  return appContext;
}
