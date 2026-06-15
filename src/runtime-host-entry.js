import os from "node:os";
import { createLogger, normalizeLogger } from "./logger.js";
import { resolveRuntimeConfig as resolveRuntimeConfigUtil } from "./runtime-config-utils.js";
import {
  declareBackendHost as declareBackendHostUtil,
  declareFrontendHost as declareFrontendHostUtil,
  hostCapabilities,
  resolveServerRunner,
  resolveStartupRunner,
  resolveStorageConfig
} from "./runtime-host-utils.js";
import { createGenericRouteHandlers } from "./runtime-host-route-factory.js";
import { startRuntimeServer } from "./runtime-server.js";
import { DEFAULT_BOOTSTRAP_RUNTIME_PROFILE, DEFAULT_RUNTIME_PROFILE } from "./runtime-bundles.js";

export { hostCapabilities, resolveServerRunner } from "./runtime-host-utils.js";

export function declareBackendHost(world, { actor, id, owner = actor, runtimeProfile = DEFAULT_RUNTIME_PROFILE }) {
  return declareBackendHostUtil(world, { actor, id, owner, runtimeProfile });
}

export function declareFrontendHost(world, { actor, id, owner = actor, runtimeProfile = DEFAULT_RUNTIME_PROFILE }) {
  return declareFrontendHostUtil(world, { actor, id, owner, runtimeProfile });
}

export async function startServer(world, {
  actor,
  serverRunnerId = null,
  port = 0,
  runtimeRoot = os.tmpdir(),
  appProject = null,
  logger = createLogger(),
  mcpInternalToken = null,
  runtimeProfile = null,
  runtimePluginIds = null,
  runtimeStartupMode = "serve",
  runtimeOperatorContract = null,
  devMode = null
}) {
  const selectedRuntimeProfile = runtimeProfile ?? (
    runtimeStartupMode === "bootstrap"
      ? DEFAULT_BOOTSTRAP_RUNTIME_PROFILE
      : DEFAULT_RUNTIME_PROFILE
  );
  const activeLogger = normalizeLogger(logger);
  return startRuntimeServer(world, {
    actor,
    serverRunnerId,
    port,
    runtimeRoot,
    appProject,
    logger: activeLogger,
    mcpInternalToken,
    runtimeProfile: selectedRuntimeProfile,
    runtimePluginIds,
    runtimeStartupMode,
    runtimeOperatorContract,
    devMode: devMode ?? (runtimeStartupMode === "serve" && appProject != null)
  }, {
    createGenericRouteHandlers,
    hostCapabilities,
    resolveRuntimeConfig: resolveRuntimeConfigUtil,
    resolveServerRunner,
    resolveStartupRunner,
    resolveStorageConfig
  });
}
