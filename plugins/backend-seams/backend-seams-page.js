import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import {
  injectRuntimePageMarkupBeforeProgram,
  renderRuntimePageInitialStateScript
} from "../../src/runtime-page-state.js";
import { renderRuntimeWidgetPage } from "../../src/runtime-widget-page.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendSeamsWtoml = fs.readFileSync(path.join(__dirname, "backend-seams-page.wtoml"), "utf8");

const resourceLinks = [
  { label: "Raw JSON", href: "/api/backend-seams" },
  { label: "Runtime config", href: "/api/runtime-config" },
  { label: "SQL", href: "/api/db/sql" },
  { label: "Search", href: "/api/search/index" },
  { label: "OAuth Links", href: "/api/oauth/links" },
  { label: "Jobs", href: "/api/jobs" },
  { label: "Outbound", href: "/api/http/outbound" },
  { label: "Webhooks", href: "/api/webhooks" },
  { label: "Notifications", href: "/api/notifications" }
];

function count(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function buildBackendSeamsViewModel(diagnostics, runtime = diagnostics?.runtime ?? null) {
  const model = {
    ...diagnostics,
    runtime
  };
  return {
    ...model,
    summaryCards: [
      { label: "Capabilities", value: count(model.capabilities?.length) },
      { label: "Config Fields", value: count(model.runtimeConfig?.fieldCount) },
      { label: "Missing Config", value: count(model.runtimeConfig?.missingCount) },
      { label: "Queued Jobs", value: count(model.jobs?.queuedCount) },
      { label: "Dead Jobs", value: count(model.jobs?.deadLetterCount) },
      { label: "SQL Operations", value: count(model.dbSql?.operationCount) },
      { label: "SQL Failures", value: count(model.failures?.dbSqlFailed?.length) },
      { label: "Search Indexes", value: count(model.search?.indexCount) },
      { label: "Search Failures", value: count(model.failures?.searchIndexFailed?.length) },
      { label: "OAuth Links", value: count(model.oauth?.linkCount) },
      { label: "OAuth Failures", value: count(model.failures?.authOauthFailed?.length) },
      { label: "Outbound Calls", value: count(model.outbound?.total) },
      { label: "Outbound Failures", value: count(model.failures?.httpOutboundFailed?.length) + count(model.failures?.httpOutboundRequestFailed?.length) },
      { label: "Webhook Deliveries", value: count(model.webhooks?.total) },
      { label: "Webhook Rejections", value: count(model.webhooks?.rejectedCount) },
      { label: "Notifications", value: count(model.notifications?.total) },
      { label: "Assets", value: count(model.assets?.total) },
      { label: "Retryable Ingest", value: count(model.assets?.ingestRetryableCount) },
      { label: "Stale Search Assets", value: count(model.assets?.searchRefreshableCount) },
      { label: "Files Contexts", value: count(model.filesContexts?.length) },
      { label: "Upload Failures", value: count(model.failures?.assetUploadFailed?.length) },
      { label: "Read Failures", value: count(model.failures?.assetContentReadFailed?.length) },
      { label: "Job Dead Letters", value: count(model.failures?.jobDeadLetter?.length) },
      { label: "Webhook Failures", value: count(model.failures?.webhookReceiveFailed?.length) + count(model.failures?.webhookRejected?.length) },
      { label: "Notify Render Failures", value: count(model.failures?.notifyEmailRenderFailed?.length) + count(model.failures?.notifySmsRenderFailed?.length) },
      { label: "Blob Failures", value: count(model.failures?.fsBlobFailed?.length) },
      { label: "Stream Failures", value: count(model.failures?.fsStreamFailed?.length) }
    ],
    resourceLinks
  };
}

export function renderBackendSeamsPage(diagnostics) {
  const model = buildBackendSeamsViewModel(diagnostics);
  const world = createWorld();
  applyWitnessToml(world, backendSeamsWtoml);
  const html = renderRuntimeWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "backend_seams_page",
    frontendProgram: "backend_seams_program",
    appConfig: {
      initialStateScriptId: "backend-seams-initial-state",
      initialStateInto: "diagnosticsResponse"
    }
  });
  const initialState = renderRuntimePageInitialStateScript("backend-seams-initial-state", model);
  return injectRuntimePageMarkupBeforeProgram(html, initialState);
}
