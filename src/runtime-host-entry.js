import os from "node:os";
import { createLogger } from "./logger.js";
import { resolveRuntimeConfig as resolveRuntimeConfigUtil } from "./runtime-config-utils.js";
import {
  createBuiltinAssetJobHandlers as createBuiltinAssetJobHandlersDefault
} from "../plugins/assets/job-handlers.js";
import {
  createBuiltinNotificationJobHandlers as createBuiltinNotificationJobHandlersDefault
} from "../plugins/notifications/job-handlers.js";
import {
  createBuiltinWebhookJobHandlers as createBuiltinWebhookJobHandlersDefault
} from "../plugins/webhooks/job-handlers.js";
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
  logger = createLogger(),
  mcpInternalToken = null,
  runtimeProfile = null,
  runtimePluginIds = null,
  runtimeStartupMode = "serve",
  runtimeOperatorContract = null
}) {
  const selectedRuntimeProfile = runtimeProfile ?? (
    runtimeStartupMode === "bootstrap"
      ? DEFAULT_BOOTSTRAP_RUNTIME_PROFILE
      : DEFAULT_RUNTIME_PROFILE
  );
  return startRuntimeServer(world, {
    actor,
    serverRunnerId,
    port,
    runtimeRoot,
    logger,
    mcpInternalToken,
    runtimeProfile: selectedRuntimeProfile,
    runtimePluginIds,
    runtimeStartupMode,
    runtimeOperatorContract
  }, {
    createBuiltinAssetJobHandlers: createBuiltinAssetJobHandlersDefault,
    createBuiltinNotificationJobHandlers: createBuiltinNotificationJobHandlersDefault,
    createBuiltinWebhookJobHandlers: createBuiltinWebhookJobHandlersDefault,
    createGenericRouteHandlers,
    hostCapabilities,
    resolveRuntimeConfig: resolveRuntimeConfigUtil,
    resolveServerRunner,
    resolveStartupRunner,
    resolveStorageConfig
  });
}
