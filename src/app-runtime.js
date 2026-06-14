import { createWorld } from "./kernel.js";
import { applyWitnessDocsWithRuntimePlugins } from "./dsl.js";
import { applyDesire } from "./desire/index.js";
import { declareBackendHost, declareFrontendHost, resolveServerRunner, startServer } from "./host.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";
import { resolveCliRuntimeProfile } from "./runtime-local-launcher.js";

export async function startAppRuntime({
  appProject,
  startupMode = "serve",
  port = 0,
  serverRunnerId = null,
  runtimeProfile,
  runtimeProfileExplicit = false,
  runtimePluginIds = [],
  worldHome = null,
  cwd = process.cwd(),
  env = process.env,
  logger = null,
  mcpInternalToken = null
} = {}) {
  const runtimeProfileInfo = resolveCliRuntimeProfile({
    runtimeProfile,
    explicit: runtimeProfileExplicit
  });
  const operatorContract = await resolveRuntimeOperatorPaths({
    startupMode,
    cwd,
    env: {
      ...env,
      ...(worldHome ? { WORLD_HOME: worldHome } : {})
    }
  });
  const witnessLogPath = operatorContract.canonicalTruth.witnessLogPath;
  const observationLogPath = operatorContract.canonicalTruth.observationLogPath;
  const world = createWorld({
    genesis: {
      system: "witness-world",
      definitionPath: appProject.manifestPath
    },
    witnessLogPath,
    observationLogPath
  });

  try {
    await applyWitnessDocsWithRuntimePlugins(world, appProject.witnessDocs, {
      runtimeProfile: runtimeProfileInfo.id,
      runtimePluginIds: runtimePluginIds.length ? runtimePluginIds : null,
      env
    });
    for (const desire of appProject.authoredDesireDocs) applyDesire(world, desire);
  } catch (error) {
    if (error?.runtimePluginCatalog) {
      error.operatorContract = operatorContract;
      error.runtimeProfileInfo = runtimeProfileInfo;
      error.witnessLogPath = witnessLogPath;
      error.observationLogPath = observationLogPath;
    }
    throw error;
  }

  const resolvedRunner = resolveServerRunner(world, serverRunnerId);
  if (!resolvedRunner.ok) {
    const error = new Error(resolvedRunner.reason);
    error.code = "APP_SERVER_RUNNER_UNRESOLVED";
    error.details = resolvedRunner.body ?? {};
    throw error;
  }

  const runner = resolvedRunner.runner;
  if (!runner.backendHost || !runner.frontendHost) {
    const error = new Error(`server runner ${runner.id} is missing backendHost/frontendHost`);
    error.code = "APP_SERVER_RUNNER_INVALID";
    error.runner = runner;
    throw error;
  }

  declareBackendHost(world, {
    actor: "system",
    id: runner.backendHost,
    runtimeProfile: runtimeProfileInfo.id
  });
  declareFrontendHost(world, {
    actor: "system",
    id: runner.frontendHost,
    runtimeProfile: runtimeProfileInfo.id
  });

  const server = await startServer(world, {
    actor: "system",
    serverRunnerId: runner.id,
    port,
    runtimeRoot: operatorContract.directories.runtimeRoot,
    appProject,
    logger,
    mcpInternalToken,
    runtimeProfile: runtimeProfileInfo.id,
    runtimePluginIds: runtimePluginIds.length ? runtimePluginIds : null,
    runtimeStartupMode: startupMode,
    runtimeOperatorContract: operatorContract
  });

  return {
    appProject,
    world,
    runner,
    server,
    operatorContract,
    runtimeProfile: runtimeProfileInfo.id,
    runtimeProfileInfo,
    witnessLogPath,
    observationLogPath
  };
}
