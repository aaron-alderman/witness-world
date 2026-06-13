import { moduleProjectors } from "./modules.js";

export async function createRuntimeAppContextForRunner({
  world,
  serverRunner,
  runtimeRoot,
  sendJson,
  readJson,
  handlerSetFactories,
  runtimeContributions,
  resolveStorageConfig,
  resolveRuntimeConfig,
  env,
  createRuntimeAppContext
}) {
  const storage = resolveStorageConfig(serverRunner.storage, runtimeRoot);
  return createRuntimeAppContext({
    world,
    serverRunner,
    backendHost: serverRunner.backendHost,
    frontendHost: serverRunner.frontendHost,
    runtimeRoot,
    storage,
    runtimeConfig: resolveRuntimeConfig(serverRunner.runtimeConfig, env),
    sendJson,
    readJson,
    handlerSetFactories,
    runtimeContributions
  });
}

export function createRuntimeResolverForServer({
  world,
  bootstrapRunner,
  bootstrapContext,
  runtimeRoot,
  sendJson,
  readJson,
  handlerSetFactories,
  runtimeContributions,
  resolveStorageConfig,
  resolveRuntimeConfig,
  env,
  createRuntimeAppContext,
  createUnavailableRuntimeAppContext,
  createRuntimeContextResolver,
  resolveLiveRunner
}) {
  return createRuntimeContextResolver({
    bootstrapRunner,
    bootstrapContext,
    resolveLiveRunner,
    createContextForRunner: async liveRunner => createRuntimeAppContextForRunner({
      world,
      serverRunner: liveRunner,
      runtimeRoot,
      sendJson,
      readJson,
      handlerSetFactories,
      runtimeContributions,
      resolveStorageConfig,
      resolveRuntimeConfig,
      env,
      createRuntimeAppContext
    }),
    createUnavailableContext: reason => createUnavailableRuntimeAppContext({
      world,
      reason,
      identities: world.project(moduleProjectors.identityIndex).rows
    })
  });
}
