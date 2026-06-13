import { createRuntimeRouteHandlers } from "./runtime-route-handlers.js";
import { SUPPORTED_BACKEND_OPS } from "./backend-programs.js";
import {
  looksJsonContentType,
  responseHeadersToObject
} from "../plugins/http-outbound/io-services.js";
import {
  parseStreamFailureLimit,
  streamFileToFile,
  streamReadableToFile
} from "../plugins/fs-stream/stream-utils.js";
import {
  webhookPayloadPathFor
} from "../plugins/webhooks/io-services.js";
import { hostCapabilities, hostIdsByCapability } from "./runtime-host-utils.js";
import { DEFAULT_RUNTIME_PROFILE } from "./runtime-bundles.js";
import { resolveRuntimePluginRoot } from "./runtime-plugin-utils.js";

const SUPPORTED_FRONTEND_OPS = [
  "initSession",
  "setSession",
  "logout",
  "setText",
  "setValue",
  "fetchJson",
  "renderCollection",
  "renderWorldGraph",
  "readForm",
  "refreshProjection",
  "reloadPage",
  "postJson",
  "patchJson",
  "deleteJson",
  "clearForm",
  "run"
];

const FRONTEND_TRACE_PROCESSES = new Set([
  "frontend.process.start",
  "frontend.process.done",
  "frontend.process.failed",
  "frontend.step.start",
  "frontend.step.done",
  "frontend.step.skipped",
  "frontend.step.failed"
]);

export function createGenericRouteHandlers({
  world,
  backendHost,
  frontendHost,
  sessionStore,
  logger,
  mcpInternalToken = null,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  runtimeBundleSummary = null,
  runtimeSurfaceEntries = [],
  handlerSetDefinitions = {},
  runtimePluginRoot = resolveRuntimePluginRoot(),
  runtimePluginIds = [],
  authoredRuntimePluginIds = []
}) {
  return createRuntimeRouteHandlers({
    world,
    backendHost,
    frontendHost,
    sessionStore,
    logger,
    mcpInternalToken,
    runtimeProfile,
    runtimeBundleSummary,
    runtimeSurfaceEntries,
    handlerSetDefinitions,
    hostCapabilities,
    hostIdsByCapability,
    parseStreamFailureLimit,
    responseHeadersToObject,
    looksJsonContentType,
    streamReadableToFile,
    streamFileToFile,
    webhookPayloadPathFor,
    runtimePluginRoot,
    runtimePluginIds,
    authoredRuntimePluginIds,
    supportedFrontendOps: SUPPORTED_FRONTEND_OPS,
    supportedBackendOps: SUPPORTED_BACKEND_OPS,
    frontendTraceProcesses: FRONTEND_TRACE_PROCESSES
  });
}
