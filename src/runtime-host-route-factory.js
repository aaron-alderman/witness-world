import { createRuntimeRouteHandlers } from "./runtime-route-handlers.js";
import {
  looksJsonContentType,
  responseHeadersToObject,
  webhookPayloadPathFor
} from "./runtime-practical-backend-io-services.js";
import { hostCapabilities, hostIdsByCapability } from "./runtime-host-utils.js";
import {
  parseStreamFailureLimit,
  streamFileToFile,
  streamReadableToFile
} from "./runtime-stream-utils.js";
import { DEFAULT_RUNTIME_PROFILE } from "./runtime-bundles.js";

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
  handlerSetDefinitions = {}
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
    supportedFrontendOps: SUPPORTED_FRONTEND_OPS,
    frontendTraceProcesses: FRONTEND_TRACE_PROCESSES
  });
}
