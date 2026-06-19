import { createWorld } from "./kernel.js";
import { applyWitnessDocsWithRuntimePlugins } from "./dsl.js";
import { applyDesire } from "./desire/index.js";
import { declareBackendHost, declareFrontendHost, resolveServerRunner, startServer } from "./host.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";
import { resolveCliRuntimeProfile } from "./runtime-local-launcher.js";
import { runtimeConfigLookup } from "./runtime-config-utils.js";
import { createStartupTelemetry } from "./startup-telemetry.js";

export function resolveStartupPersistenceCommitMode(appProject, serverRunnerId = null) {
  const serverTargets = Array.isArray(appProject?.targets?.server) ? appProject.targets.server : [];
  const selected = serverRunnerId
    ? serverTargets.find(row => row.id === serverRunnerId) ?? null
    : (serverTargets.find(row => row.default === true) ?? (serverTargets.length === 1 ? serverTargets[0] : null));
  const configured = runtimeConfigLookup(selected?.values?.runtimeConfig ?? null, "startup.persistence.commitMode");
  return configured === "pre-ready" ? "pre-ready" : "post-ready";
}

export async function startAppRuntime({
  appProject,
  startupMode = "serve",
  port = 0,
  serverRunnerId = null,
  devMode = null,
  runtimeProfile,
  runtimeProfileExplicit = false,
  runtimePluginIds = [],
  worldHome = null,
  cwd = process.cwd(),
  env = process.env,
  logger = null,
  mcpInternalToken = null,
  startupTelemetry = createStartupTelemetry({ mode: startupMode })
} = {}) {
  const runtimeProfileInfo = resolveCliRuntimeProfile({
    runtimeProfile,
    explicit: runtimeProfileExplicit
  });
  const operatorContract = await startupTelemetry.runPhase("operator.paths", () => resolveRuntimeOperatorPaths({
    startupMode,
    cwd,
    env: {
      ...env,
      ...(worldHome ? { WORLD_HOME: worldHome } : {})
    }
  }), {
    label: "Resolve operator paths"
  });
  const witnessLogPath = operatorContract.canonicalTruth.witnessLogPath;
  const observationLogPath = operatorContract.canonicalTruth.observationLogPath;
  const startupPersistenceCommitMode = resolveStartupPersistenceCommitMode(appProject, serverRunnerId);
  const world = createWorld({
    genesis: {
      system: "witness-world",
      definitionPath: appProject.manifestPath
    },
    witnessLogPath,
    observationLogPath,
    persistencePolicy: {
      buffered: true
    }
  });

  try {
    await startupTelemetry.runPhase("world.applyWitnessDocs", () => applyWitnessDocsWithRuntimePlugins(world, appProject.witnessDocs, {
      runtimeProfile: runtimeProfileInfo.id,
      runtimePluginIds: runtimePluginIds.length ? runtimePluginIds : null,
      env
    }), {
      label: "Apply witness docs"
    });
    const applyDesirePhase = startupTelemetry.beginPhase("world.applyDesireDocs", {
      label: "Apply authored desire docs"
    });
    try {
      const runtimeDeclarationRegistry = appProject.runtimePluginRegistries?.runtimeDeclarationRegistry ?? null;
      for (const desire of appProject.authoredDesireDocs) {
        applyDesire(world, desire, { runtimeDeclarationRegistry });
      }
      applyDesirePhase.complete({
        desireDocCount: appProject.authoredDesireDocs.length
      });
    } catch (error) {
      applyDesirePhase.fail(error, {
        desireDocCount: appProject.authoredDesireDocs.length
      });
      throw error;
    }
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

  const server = await startupTelemetry.runPhase("server.start", () => startServer(world, {
    actor: "system",
    serverRunnerId: runner.id,
    port,
    runtimeRoot: operatorContract.directories.runtimeRoot,
    appProject,
    logger,
    mcpInternalToken,
    runtimeProfile: runtimeProfileInfo.id,
    runtimeProfileExplicit,
    runtimePluginIds: runtimePluginIds.length ? runtimePluginIds : null,
    runtimeStartupMode: startupMode,
    runtimeOperatorContract: operatorContract,
    devMode: devMode ?? (startupMode === "serve"),
    startupPersistenceCommitMode,
    startupTelemetry
  }), {
    label: "Start runtime server"
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
    observationLogPath,
    startupTelemetry
  };
}
