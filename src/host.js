import http from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Readable, Transform } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { thing, relation, projectors, authorityForActor, canCreateInContext, canManageContext, canMutateTarget } from "./kernel.js";
import { witnessRelations, moduleProjectors, ensureCapabilityDefinition, installCapability, defineContext, createIdentity } from "./modules.js";
import {
  renderWidgetPage,
  requestWidgetVersionActivation,
  rollbackWidgetVersion,
  widgetDefinitions,
  frontendProgramsProjection,
  frontendStepsProjection
} from "./widgets.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { processRunProjection, processViewProjection, renderProcessPage } from "./process-view.js";
import { canvasProcessHandlers } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection, edenNeighborhoodProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { renderEdenPage } from "./eden-page.js";
import {
  projectEdenPersonalBoxItems,
  requestEdenPersonalBoxItemCreate,
  requestEdenPersonalBoxItemDelete,
  requestEdenPersonalBoxItemUpdate
} from "./eden-personal-box.js";
import { projectEdenPageTheme, requestEdenPageThemeSet } from "./eden-page-theme.js";
import { projectEdenAcademyState } from "./eden-academy.js";
import {
  edenOrganizationContextId,
  edenOrganizationContextLabel,
  edenOrganizationProposalBody,
  nextEdenOrganizationProposalId,
  projectEdenOrganizationState
} from "./eden-organization.js";
import {
  requestEdenTheoryAssessmentPass,
  requestEdenTheoryLessonStudy,
  requestEdenTheoryTeachBack
} from "./eden-theory.js";
import {
  projectEdenCapabilityInstallState
} from "./eden-capability-install.js";
import { requestEdenCapabilityInstall } from "./eden-capability-install-request.js";
import {
  projectEdenVersionState,
  requestEdenVersionActivate,
  requestEdenVersionPublish,
  requestEdenVersionRollback
} from "./eden-versions.js";
import { createLogger } from "./logger.js";
import { createDemoHandlerSet } from "./demo-handler-set.js";
import { typeModelProjection } from "./type-model.js";
import {
  requestBootstrapIdentityDefine,
  requestBootstrapIdentityUpdate,
  requestBootstrapContextDefine,
  requestBootstrapPerspectiveDefine,
  requestBootstrapContextBindingCreate,
  requestBootstrapContextBindingRemove,
  requestBootstrapContextExportCreate,
  requestBootstrapContextExportRemove,
  requestBootstrapContextImportCreate,
  requestBootstrapContextImportRemove,
  requestBootstrapStewardshipGrant,
  requestBootstrapStewardshipRevoke,
  requestBootstrapProposalCreate,
  requestBootstrapProposalApprove,
  requestBootstrapProposalReject,
  requestBootstrapServerRunnerDefine,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  requestBootstrapCapabilityRemove,
  requestBootstrapMcpServerDefine,
  requestBootstrapMcpToolInstall,
  requestBootstrapMcpToolRemove,
  requestBootstrapFrontendProgramDefine,
  requestBootstrapFrontendStepDefine,
  requestWidgetDefine,
  requestWidgetUpdate
} from "./bootstrap-authoring.js";
import {
  MCP_PROTOCOL_VERSION,
  executeMcpTool,
  listSupportedMcpTools,
  mcpToolDefinition,
  mcpToolNames,
  resolveMcpToolScope
} from "./mcp.js";
import { ensureRuntimeBuiltins } from "./runtime-builtins.js";
import { renderBootstrapPage } from "./bootstrap-shell.js";
import { TODO_TUTORIAL_ID, tutorialDefinition, normalizeTutorialDisabledPages } from "./tutorials.js";

const HANDLER_SET_FACTORIES = {
  demo: createDemoHandlerSet
};

const HANDLER_SET_DEFINITIONS = {
  demo: {
    handlers: [
      "privateNotes.list",
      "privateNotes.create",
      "todos.list",
      "todos.create",
      "todos.update",
      "todos.delete",
      "widgets.create",
      "network.simulateError"
    ],
    jobHandlers: [
      "demo.echo",
      "demo.failOnce",
      "demo.alwaysFail"
    ]
  }
};

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

export function declareBackendHost(world, { actor, id, owner = actor }) {
  const capabilities = ["http.serve", "runtime.config", "fs.json.read", "fs.json.write", "fs.blob", "fs.stream", "upload.asset", "jobs.queue", "db.sql", "auth.oauth", "search.index", "http.outbound", "webhook.inbound", "notify.email", "notify.sms"];
  ensureRuntimeBuiltins(world, { actor });
  for (const capability of capabilities) ensureCapabilityDefinition(world, { actor, id: capability, label: capability, provenance: { source: "host.declare.backend" } });
  const define = world.emit({
    process: "declareBackendHost",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id)
    ],
    body: { id }
  });
  const installs = capabilities.map(capability => installCapability(world, {
    actor,
    capability,
    target: id,
    targetKind: "host"
  }));
  return [define, ...installs];
}

export function declareFrontendHost(world, { actor, id, owner = actor }) {
  const capabilities = ["dom.render", "http.fetch"];
  ensureRuntimeBuiltins(world, { actor });
  for (const capability of capabilities) ensureCapabilityDefinition(world, { actor, id: capability, label: capability, provenance: { source: "host.declare.frontend" } });
  const define = world.emit({
    process: "declareFrontendHost",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id)
    ],
    body: { id }
  });
  const installs = capabilities.map(capability => installCapability(world, {
    actor,
    capability,
    target: id,
    targetKind: "host"
  }));
  return [define, ...installs];
}

export function hostCapabilities(world, hostId) {
  const installs = world.project(moduleProjectors.capabilityInstalls);
  const capabilities = installs
    .filter(row => row.target === hostId)
    .map(row => row.capability);
  const legacy = world.project(projectors.currentRelations)
    .filter(r => r.from === hostId && (r.rel === "hostCapability" || r.rel === "contextCapability"))
    .map(r => r.to);
  return new Set([...capabilities, ...legacy]);
}

export function resolveServerRunner(world, serverRunnerId = null) {
  const runners = world.project(moduleProjectors.serverRunners);
  if (serverRunnerId) {
    const runner = runners.find(candidate => candidate.id === serverRunnerId);
    if (!runner) return { ok: false, reason: "server runner not found", body: { serverRunnerId } };
    return { ok: true, runner };
  }
  if (runners.length === 1) return { ok: true, runner: runners[0] };
  if (runners.length === 0) return { ok: false, reason: "no server runners defined", body: {} };
  return { ok: false, reason: "multiple server runners defined", body: { serverRunners: runners.map(runner => runner.id) } };
}

function uniqueHostByCapability(world, capability) {
  const hosts = hostIdsByCapability(world, capability);
  if (hosts.length !== 1) {
    const legacyHosts = [...new Set(witnessRelations(world.allWitnesses()).filter(r => r.rel === "hostCapability" && r.to === capability).map(r => r.from))];
    if (legacyHosts.length !== 1) return null;
    return legacyHosts[0];
  }
  if (hosts.length !== 1) return null;
  return hosts[0];
}

function hostIdsByCapability(world, capability) {
  return [
    ...new Set(
      world.project(moduleProjectors.capabilityInstalls)
        .filter(row => row.targetKind === "host" && row.capability === capability)
        .map(row => row.target)
    )
  ];
}

function resolveStartupRunner(world, serverRunnerId = null) {
  const resolved = resolveServerRunner(world, serverRunnerId);
  if (resolved.ok) return resolved;
  if (serverRunnerId || resolved.reason !== "no server runners defined") return resolved;
  const backendHost = uniqueHostByCapability(world, "http.serve");
  const frontendHost = uniqueHostByCapability(world, "dom.render");
  if (!backendHost || !frontendHost) {
    return { ok: false, reason: "no server runners defined", body: {} };
  }
  return {
    ok: true,
    runner: {
      id: "__bootstrap__",
      backendHost,
      frontendHost,
      handlerSet: null,
      actors: null,
      storage: null,
      allowActorHeader: false,
      bootstrapOnly: true
    }
  };
}

function runtimeConfigScalar(value) {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean";
}

function runtimeConfigLookup(runtimeConfig, key) {
  if (!runtimeConfig || typeof runtimeConfig !== "object" || Array.isArray(runtimeConfig)) return undefined;
  if (Object.prototype.hasOwnProperty.call(runtimeConfig, key)) return runtimeConfig[key];
  const quotedKey = `"${key}"`;
  if (Object.prototype.hasOwnProperty.call(runtimeConfig, quotedKey)) return runtimeConfig[quotedKey];
  const parts = String(key || "").split(".").filter(Boolean);
  if (!parts.length) return undefined;
  let current = runtimeConfig;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function assetDerivedTextStorageKey(assetId) {
  return `${assetId}/derived/text.txt`;
}

function assetDerivedThumbnailStorageKey(assetId) {
  return `${assetId}/derived/thumbnail.svg`;
}

function assetDerivedTextPathForAppContext(appContext, assetId) {
  const assetsRoot = appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
  return path.join(assetsRoot, encodeURIComponent(assetId), "derived", "text.txt");
}

function assetDerivedThumbnailPathForAppContext(appContext, assetId) {
  const assetsRoot = appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
  return path.join(assetsRoot, encodeURIComponent(assetId), "derived", "thumbnail.svg");
}

function assetContentUrlForId(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/content`;
}

function assetTextUrlForId(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/text`;
}

function assetThumbnailUrlForId(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/thumbnail`;
}

function normalizeRuntimeConfigFieldName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  if ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function positiveInteger(value, fallback, { minimum = 1 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isoAt(timeMs) {
  return new Date(timeMs).toISOString();
}

function parseIsoAt(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJobQueueConfig(runtimeConfig) {
  return {
    pollMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.pollMs"), 25),
    maxAttempts: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.maxAttempts"), 3),
    retryDelayMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.retryDelayMs"), 50)
  };
}

function normalizeHttpOutboundConfig(runtimeConfig) {
  return {
    timeoutMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.timeoutMs"), 1000),
    maxAttempts: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.maxAttempts"), 2),
    retryDelayMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.retryDelayMs"), 50)
  };
}

function normalizeWebhookInboundConfig(runtimeConfig) {
  const rawSecret = runtimeConfigLookup(runtimeConfig, "webhook.inbound.secret");
  const secretValue = runtimeConfigScalar(rawSecret)
    ? rawSecret
    : (rawSecret && typeof rawSecret === "object" && !Array.isArray(rawSecret) ? rawSecret.value : undefined);
  return {
    secret: typeof secretValue === "string" && secretValue.trim()
      ? secretValue.trim()
      : null,
    replayWindowMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "webhook.inbound.replayWindowMs"), 300000),
    maxAttempts: positiveInteger(runtimeConfigLookup(runtimeConfig, "webhook.inbound.maxAttempts"), 2),
    retryDelayMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "webhook.inbound.retryDelayMs"), 50)
  };
}

function dbSqlDatasourceId(serverRunnerId, datasourceName = "main") {
  return `dbsql:${serverRunnerId}:${datasourceName}`;
}

function dbSqlOperationId() {
  return `sqlop_${randomUUID()}`;
}

function dbSqlDatasourceTitle({ provider = "sqlite", datasourceName = "main" } = {}) {
  return `${datasourceName} (${provider})`;
}

function dbSqlOperationTitle({ kind = "query", name = null, datasourceName = "main" } = {}) {
  return name ? `${kind}:${name}` : `${kind} ${datasourceName}`;
}

function normalizeDbSqlIdentifier(value, fallback) {
  const identifier = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ? identifier : null;
}

function quoteSqlIdentifier(identifier) {
  return `"${String(identifier).replaceAll("\"", "\"\"")}"`;
}

function normalizeDbSqlConfig(runtimeConfig, runtimeRoot, serverRunnerId) {
  const providerRaw = runtimeConfigLookup(runtimeConfig, "db.sql.provider");
  const provider = typeof providerRaw === "string" && providerRaw.trim()
    ? providerRaw.trim().toLowerCase()
    : "sqlite";
  if (!["sqlite", "postgres", "mysql"].includes(provider)) {
    return { ok: false, status: 400, reason: "db.sql.provider must be sqlite, postgres, or mysql" };
  }
  const datasourceNameRaw = runtimeConfigLookup(runtimeConfig, "db.sql.datasource");
  const datasourceName = typeof datasourceNameRaw === "string" && datasourceNameRaw.trim()
    ? datasourceNameRaw.trim()
    : "main";
  const migrationTable = normalizeDbSqlIdentifier(runtimeConfigLookup(runtimeConfig, "db.sql.migrationTable"), "witness_sql_migrations");
  if (!migrationTable) {
    return { ok: false, status: 400, reason: "db.sql.migrationTable must be a SQL identifier" };
  }
  const datasource = {
    id: dbSqlDatasourceId(serverRunnerId, datasourceName),
    title: dbSqlDatasourceTitle({ provider, datasourceName }),
    serverRunner: serverRunnerId,
    provider,
    datasourceName,
    migrationTable,
    status: "configured",
    path: null,
    connectionString: null,
    adapterStatus: provider === "sqlite" ? "ready" : "declared",
    lastError: null
  };
  if (provider === "sqlite") {
    const rawPath = runtimeConfigLookup(runtimeConfig, "db.sql.sqlite.path");
    const sqlitePath = typeof rawPath === "string" && rawPath.trim()
      ? (path.isAbsolute(rawPath.trim()) ? rawPath.trim() : path.resolve(runtimeRoot, rawPath.trim()))
      : path.resolve(runtimeRoot, "db", `${datasourceName}.sqlite`);
    datasource.path = sqlitePath;
    return { ok: true, datasource };
  }
  const providerKey = `db.sql.${provider}.connectionString`;
  const connectionRaw = runtimeConfigLookup(runtimeConfig, providerKey) ?? runtimeConfigLookup(runtimeConfig, "db.sql.connectionString");
  datasource.connectionString = typeof connectionRaw === "string" && connectionRaw.trim() ? connectionRaw.trim() : null;
  if (!datasource.connectionString) {
    datasource.status = "misconfigured";
    datasource.lastError = `${providerKey} required`;
    return { ok: false, status: 503, reason: `${providerKey} required`, datasource };
  }
  datasource.status = "unsupported";
  datasource.lastError = `${provider} adapter not wired in this runtime slice`;
  return { ok: true, datasource };
}

function normalizeDbSqlParams(params) {
  if (params == null) return { ok: true, kind: "none", value: [] };
  if (Array.isArray(params)) return { ok: true, kind: "array", value: [...params] };
  if (params && typeof params === "object") return { ok: true, kind: "object", value: { ...params } };
  return { ok: false, status: 400, reason: "params must be an array or object" };
}

function applyDbSqlParams(statement, method, normalizedParams) {
  if (normalizedParams.kind === "array") return statement[method](...normalizedParams.value);
  if (normalizedParams.kind === "object") return statement[method](normalizedParams.value);
  return statement[method]();
}

function delayWithSignal(ms, signal) {
  const waitMs = nonNegativeInteger(ms, 0);
  if (!waitMs) {
    if (signal?.aborted) return Promise.reject(new Error("outbound timeout"));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("outbound timeout"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, waitMs);
    const onAbort = () => {
      cleanup();
      reject(new Error("outbound timeout"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function httpOutboundId() {
  return `outbound_${randomUUID()}`;
}

function outboundTitle({ target = null, method = "GET", url = null } = {}) {
  if (target) return target;
  return `${method} ${url || "outbound"}`;
}

function looksJsonContentType(value) {
  const contentType = String(value || "").toLowerCase();
  return contentType.startsWith("application/json") || contentType.includes("+json");
}

function normalizeHeaderMap(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: true, value: {} };
  const headers = {};
  for (const [name, raw] of Object.entries(input)) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return { ok: false, reason: "header name required" };
    if (raw == null) continue;
    if (!runtimeConfigScalar(raw)) return { ok: false, reason: `header ${key} must be a scalar` };
    headers[key] = String(raw);
  }
  return { ok: true, value: headers };
}

function headerNamesFromMap(headers) {
  return Object.keys(headers || {}).map(name => String(name).toLowerCase()).sort();
}

function redactHeaderValues(headers) {
  const safe = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const key = String(name).toLowerCase();
    safe[key] = /(authorization|token|secret|cookie)/i.test(key) ? "[redacted]" : String(value);
  }
  return safe;
}

function responseHeadersToObject(headers) {
  const rows = {};
  if (!headers) return rows;
  if (typeof headers.entries === "function") {
    for (const [name, value] of headers.entries()) rows[String(name).toLowerCase()] = String(value);
    return rows;
  }
  for (const [name, value] of Object.entries(headers)) rows[String(name).toLowerCase()] = String(value);
  return rows;
}

function webhookId() {
  return `webhook_${randomUUID()}`;
}

function webhookTitle({ target = null, deliveryId = null } = {}) {
  return target && deliveryId ? `${target}:${deliveryId}` : (target || deliveryId || "webhook delivery");
}

function parseWebhookTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const intValue = Number.parseInt(raw, 10);
  if (Number.isFinite(intValue) && String(intValue) === raw) {
    return raw.length <= 10 ? intValue * 1000 : intValue;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function webhookSignatureHex(secret, { deliveryId, timestamp, payload }) {
  return createHmac("sha256", secret)
    .update(String(deliveryId))
    .update(".")
    .update(String(timestamp))
    .update(".")
    .update(Buffer.isBuffer(payload) ? payload.toString("base64") : Buffer.from(payload || "").toString("base64"))
    .digest("hex");
}

function verifyWebhookSignature(signature, expectedHex) {
  const raw = String(signature || "").trim().toLowerCase();
  if (!raw) return false;
  const normalized = raw.startsWith("sha256=") ? raw.slice("sha256=".length) : raw;
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== expectedHex.length) return false;
  const actual = Buffer.from(normalized, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  try {
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function webhooksRootFor(appContext) {
  return appContext?.storage?.webhooksRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "webhooks");
}

function webhookPayloadPathFor(appContext, webhookIdValue) {
  return path.join(webhooksRootFor(appContext), encodeURIComponent(webhookIdValue), "payload");
}

function pickExternalRefId(headers) {
  const rows = responseHeadersToObject(headers);
  return rows["x-external-id"] || rows["x-provider-id"] || rows["x-request-id"] || null;
}

function isRetryableOutboundStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function outboundFailureResponseStatus(reason, responseStatus = null) {
  if (reason === "outbound timeout") return 504;
  if (Number.isFinite(responseStatus) && responseStatus >= 400 && responseStatus < 500) return 502;
  return 502;
}

function outboundBodyKind(body) {
  if (Object.prototype.hasOwnProperty.call(body || {}, "json")) return "json";
  if (typeof body?.text === "string") return "text";
  return "none";
}

async function executeStubOutbound(request, { appContext, signal, attempt }) {
  const targetUrl = new URL(request.url);
  const mode = targetUrl.hostname || "echo";
  const delayMs = nonNegativeInteger(targetUrl.searchParams.get("delayMs"), 0);
  const externalRefId = `stub-outbound-${request.id}-${attempt}`;
  if (mode === "timeout") {
    const waitMs = nonNegativeInteger(targetUrl.pathname.split("/").filter(Boolean)[0], request.timeoutMs + 50);
    await delayWithSignal(waitMs, signal);
    return {
      transport: "stub",
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-external-id": externalRefId,
        "x-correlation-id": request.correlationId
      },
      bodyText: JSON.stringify({ ok: true, target: request.target, timeout: false })
    };
  }
  if (delayMs) await delayWithSignal(delayMs, signal);
  if (mode === "status") {
    const status = positiveInteger(targetUrl.pathname.split("/").filter(Boolean)[0], 500);
    return {
      transport: "stub",
      status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-external-id": externalRefId,
        "x-correlation-id": request.correlationId
      },
      bodyText: targetUrl.searchParams.get("text") || `stub status ${status}`
    };
  }
  if (mode === "flaky") {
    const failures = nonNegativeInteger(targetUrl.searchParams.get("failures"), 1);
    const failureStatus = positiveInteger(targetUrl.searchParams.get("status"), 503);
    const key = targetUrl.toString();
    const attempts = appContext.httpOutboundStubState.get(key) ?? 0;
    appContext.httpOutboundStubState.set(key, attempts + 1);
    if (attempts < failures) {
      return {
        transport: "stub",
        status: failureStatus,
        headers: {
          "content-type": "application/json",
          "x-external-id": externalRefId,
          "x-correlation-id": request.correlationId
        },
        bodyText: JSON.stringify({ ok: false, retryable: true, attempt, failuresRemaining: failures - (attempts + 1) })
      };
    }
    return {
      transport: "stub",
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-external-id": externalRefId,
        "x-correlation-id": request.correlationId
      },
      bodyText: JSON.stringify({ ok: true, attempt, target: request.target })
    };
  }
  return {
    transport: "stub",
    status: positiveInteger(targetUrl.searchParams.get("status"), 200),
    headers: {
      "content-type": "application/json",
      "x-external-id": externalRefId,
      "x-correlation-id": request.correlationId
    },
    bodyText: JSON.stringify({
      ok: true,
      target: request.target,
      method: request.method,
      url: request.url,
      requestBodyKind: request.requestBodyKind,
      receivedHeaders: redactHeaderValues(request.headers),
      body: request.requestBodyKind === "json"
        ? request.jsonBody
        : (request.requestBodyKind === "text" ? request.bodyText : null),
      auth: request.authKind ? { kind: request.authKind, configKey: request.authConfigKey } : null
    })
  };
}

async function executeHttpOutbound(request, { appContext, signal, attempt }) {
  if (request.url.startsWith("stub://")) {
    return executeStubOutbound(request, { appContext, signal, attempt });
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.bodyText ?? undefined,
    signal
  });
  return {
    transport: "network",
    status: response.status,
    headers: responseHeadersToObject(response.headers),
    bodyText: request.method === "HEAD" ? "" : await response.text()
  };
}

function renderTemplatedText(template, vars) {
  const source = typeof template === "string" ? template : "";
  const values = vars && typeof vars === "object" ? vars : {};
  return source.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`missing template variable: ${name}`);
    }
    const value = values[name];
    return value == null ? "" : String(value);
  });
}

function notificationId() {
  return `notification_${randomUUID()}`;
}

function notificationTitle(channel, { subject = null, to = null } = {}) {
  if (channel === "email" && subject) return subject;
  return to || `${channel} notification`;
}

function createBuiltinNotificationJobHandlers({ world, backendHost, runtimeConfig }) {
  const emailSender = typeof runtimeConfig?.["notify.email.stubSender"] === "string" && runtimeConfig["notify.email.stubSender"].trim()
    ? runtimeConfig["notify.email.stubSender"].trim()
    : "stub@local.test";
  const smsSender = typeof runtimeConfig?.["notify.sms.stubSender"] === "string" && runtimeConfig["notify.sms.stubSender"].trim()
    ? runtimeConfig["notify.sms.stubSender"].trim()
    : "stub-sms";

  const deliver = channel => async ({ actor, job, payload, attempt }) => {
    const notificationId = typeof payload?.notificationId === "string" ? payload.notificationId : "";
    const notification = world.project(moduleProjectors.notificationIndex).byId[notificationId] ?? null;
    if (!notification) {
      throw new Error("notification not found");
    }
    const prefix = `notify.${channel}`;
    world.emit({
      process: `${prefix}.render`,
      actor: actor || backendHost,
      claims: [relation(notification.id, "renderedBy", `${prefix}.stub`)],
      body: {
        id: notification.id,
        jobId: job.id,
        to: notification.recipient,
        subject: notification.subject,
        template: notification.template,
        vars: notification.vars
      }
    });
    let preview;
    try {
      preview = notification.template
        ? renderTemplatedText(notification.template, notification.vars)
        : String(notification.text || "");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      world.emit({
        process: `${prefix}.render.failed`,
        actor: actor || backendHost,
        claims: [],
        body: {
          id: notification.id,
          jobId: job.id,
          to: notification.recipient,
          subject: notification.subject,
          template: notification.template,
          vars: notification.vars,
          reason
        }
      });
      throw error;
    }
    world.emit({
      process: `${prefix}.send`,
      actor: actor || backendHost,
      claims: [relation(notification.id, "sentVia", `${prefix}.stub`)],
      body: {
        id: notification.id,
        jobId: job.id,
        to: notification.recipient,
        subject: notification.subject,
        sender: channel === "email" ? emailSender : smsSender,
        preview,
        transport: "stub",
        attempt,
        providerMessageId: `stub-${channel}-${notification.id}-${attempt}`
      }
    });
    return { sent: true };
  };

  return {
    "notify.email.deliver": deliver("email"),
    "notify.sms.deliver": deliver("sms")
  };
}

function createBuiltinWebhookJobHandlers({ world, backendHost }) {
  return {
    "webhook.inbound.process": async ({ actor, job, payload, attempt, appContext }) => {
      const webhookIdValue = typeof payload?.webhookId === "string" ? payload.webhookId : "";
      const delivery = world.project(moduleProjectors.webhookDeliveryIndex).byId[webhookIdValue] ?? null;
      if (!delivery) {
        throw new Error("webhook delivery not found");
      }
      const payloadPath = webhookPayloadPathFor(appContext, delivery.id);
      let stored = null;
      try {
        stored = await fs.readFile(payloadPath);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "webhook payload missing";
        world.emit({
          process: "webhook.inbound.process.failed",
          actor: actor || backendHost,
          claims: [],
          body: {
            id: delivery.id,
            jobId: job.id,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            reason
          }
        });
        throw error;
      }
      let payloadJson = null;
      if (looksJsonContentType(delivery.contentType)) {
        try {
          payloadJson = JSON.parse(stored.toString("utf8"));
        } catch {
          payloadJson = null;
        }
      }
      world.emit({
        process: "webhook.inbound.processed",
        actor: actor || backendHost,
        claims: [relation(delivery.id, "processedBy", "webhook.inbound.process")],
        body: {
          id: delivery.id,
          jobId: job.id,
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          attempt,
          contentType: delivery.contentType,
          sizeBytes: stored.length,
          payloadPreview: payloadJson != null
            ? payloadJson
            : stored.toString("utf8").slice(0, 256)
        }
      });
      return { processed: true };
    }
  };
}

function createBuiltinAssetJobHandlers({ world, backendHost, runtimeConfig }) {
  const maxTextBytes = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.maxTextBytes"), 262144);

  const emitSearchIndexReindex = ({ actor, index }) => world.emit({
    process: "search.index.reindex",
    actor,
    claims: [
      thing(index.id),
      relation(index.id, "hasModuleKind", "searchIndex"),
      relation(actor, "owns", index.id),
      relation(index.id, "hasTitle", index.title)
    ],
    body: {
      id: index.id,
      serverRunner: index.serverRunner,
      provider: index.provider,
      name: index.name,
      sourceCount: index.sourceCount,
      documentCount: index.documentCount,
      assetCount: index.assetCount,
      queryCount: index.queryCount,
      lastBuiltAt: index.lastBuiltAt,
      path: index.path
    }
  });

  return {
    "asset.ingest.process": async ({ actor, job, payload, attempt, appContext }) => {
      const assetId = typeof payload?.assetId === "string" ? payload.assetId.trim() : "";
      if (!assetId) throw new Error("assetId required");
      const currentActor = actor || backendHost;
      const asset = world.project(moduleProjectors.assetIndex).byId[assetId] ?? null;
      if (!asset) {
        world.emit({
          process: "asset.ingest.failed",
          actor: currentActor,
          claims: [],
          body: {
            id: assetId,
            jobId: job.id,
            attempt,
            reason: "asset not found"
          }
        });
        throw new Error("asset not found");
      }

      world.emit({
        process: "asset.ingest.start",
        actor: currentActor,
        claims: [],
        body: {
          id: asset.id,
          jobId: job.id,
          attempt,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes ?? null
        }
      });

      try {
        const mimeType = typeof asset.mimeType === "string" ? asset.mimeType : "";
        const originalName = typeof asset.originalName === "string" && asset.originalName
          ? asset.originalName
          : (typeof asset.title === "string" ? asset.title : "");
        const assetPath = appContext
          ? path.join(appContext.storage?.assetsRoot || path.resolve(appContext.runtimeRoot || process.cwd(), "assets"), encodeURIComponent(asset.id), "blob")
          : null;
        const bytes = await fs.readFile(assetPath);
        let textStatus = "skipped";
        let textBytes = 0;
        let textRef = null;
        let textExtractor = null;
        let derivedMetadata = null;
        if (supportsDerivedAssetSearchText(mimeType, originalName)) {
          const extracted = extractAssetSearchText({ mimeType, originalName, bytes, maxTextBytes });
          const extractedText = extracted.text;
          const derivedPath = assetDerivedTextPathForAppContext(appContext, asset.id);
          await fs.mkdir(path.dirname(derivedPath), { recursive: true });
          await fs.writeFile(derivedPath, extractedText, "utf8");
          textStatus = extracted.status;
          textBytes = Buffer.byteLength(extractedText, "utf8");
          textRef = assetDerivedTextStorageKey(asset.id);
          textExtractor = extracted.extractor;
          derivedMetadata = extracted.metadata ?? derivedMetadata;
        }

        const thumbnailResult = extractAssetThumbnail({
          mimeType,
          bytes,
          runtimeConfig: appContext?.runtimeConfig ?? {}
        });
        let thumbnailStatus = thumbnailResult.status;
        let thumbnailRef = null;
        let thumbnailUrl = null;
        let imageWidth = Number.isFinite(thumbnailResult.metadata?.width) ? thumbnailResult.metadata.width : null;
        let imageHeight = Number.isFinite(thumbnailResult.metadata?.height) ? thumbnailResult.metadata.height : null;
        if (thumbnailResult.thumbnail) {
          const derivedThumbnailPath = assetDerivedThumbnailPathForAppContext(appContext, asset.id);
          await fs.mkdir(path.dirname(derivedThumbnailPath), { recursive: true });
          await fs.writeFile(derivedThumbnailPath, thumbnailResult.thumbnail.bytes);
          thumbnailRef = assetDerivedThumbnailStorageKey(asset.id);
          thumbnailUrl = assetThumbnailUrlForId(asset.id);
        }

        let searchStatus = "not-built";
        let reindexedIndexId = null;
        let searchPolicy = "on-ingest";
        const refreshed = await appContext?.searchIndex?.refreshAsset?.(asset.id);
        if (refreshed?.ok) {
          searchPolicy = refreshed.policy || searchPolicy;
          if (refreshed.changed && refreshed.index) {
            searchStatus = "reindexed";
            reindexedIndexId = refreshed.index.id;
            emitSearchIndexReindex({ actor: currentActor, index: refreshed.index });
          } else if (refreshed.disposition === "not-indexed") {
            searchStatus = "not-indexed";
          } else {
            searchStatus = refreshed.disposition || "not-built";
          }
        } else if (refreshed) {
          throw new Error(refreshed.reason || "search index refresh failed");
        }

        world.emit({
          process: "asset.ingest.succeeded",
          actor: currentActor,
          claims: [],
          body: {
            id: asset.id,
            jobId: job.id,
            attempt,
            mimeType,
            sizeBytes: asset.sizeBytes ?? null,
            textStatus,
            textBytes,
            textRef,
            textExtractor,
            derivedMetadata,
            thumbnailStatus,
            thumbnailRef,
            thumbnailUrl,
            imageWidth,
            imageHeight,
            searchStatus,
            searchPolicy,
            reindexedIndexId,
            completedAt: isoAt(Date.now())
          }
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        world.emit({
          process: "asset.ingest.failed",
          actor: currentActor,
          claims: [],
          body: {
            id: asset.id,
            jobId: job.id,
            attempt,
            reason
          }
        });
        throw error;
      }
    }
  };
}

function createDbSqlRuntime({ runtimeConfig, runtimeRoot, serverRunnerId }) {
  const sqliteConnections = new Map();
  const currentConfig = () => normalizeDbSqlConfig(runtimeConfig, runtimeRoot, serverRunnerId);

  const datasourceStatus = () => {
    const normalized = currentConfig();
    if (!normalized.ok && !normalized.datasource) {
      return { ok: false, status: normalized.status || 503, reason: normalized.reason || "db.sql datasource invalid", datasource: null };
    }
    const datasource = normalized.datasource;
    if (datasource.provider === "sqlite") return { ok: true, datasource };
    if (!normalized.ok) return { ok: false, status: normalized.status || 503, reason: normalized.reason || "db.sql datasource invalid", datasource };
    return {
      ok: false,
      status: 501,
      reason: `${datasource.provider} adapter not wired in this runtime slice`,
      datasource: {
        ...datasource,
        status: "unsupported",
        lastError: `${datasource.provider} adapter not wired in this runtime slice`
      }
    };
  };

  const openSqlite = async datasource => {
    if (sqliteConnections.has(datasource.path)) return sqliteConnections.get(datasource.path);
    await fs.mkdir(path.dirname(datasource.path), { recursive: true });
    const database = new DatabaseSync(datasource.path);
    sqliteConnections.set(datasource.path, database);
    return database;
  };

  const ensureReady = async () => {
    const resolved = datasourceStatus();
    if (!resolved.ok) return resolved;
    const database = await openSqlite(resolved.datasource);
    return { ok: true, datasource: resolved.datasource, database };
  };

  const ensureMigrationLedger = (database, datasource) => {
    const table = quoteSqlIdentifier(datasource.migrationTable);
    database.exec(`create table if not exists ${table} (id text primary key, applied_at text not null)`);
    return table;
  };

  const migrate = async ({ migrations }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    const normalizedMigrations = Array.isArray(migrations) ? migrations.map(entry => ({
      id: typeof entry?.id === "string" ? entry.id.trim() : "",
      sql: typeof entry?.sql === "string" ? entry.sql.trim() : ""
    })) : [];
    if (!normalizedMigrations.length) return { ok: false, status: 400, reason: "migrations required", datasource: resolved.datasource };
    if (normalizedMigrations.some(entry => !entry.id || !entry.sql)) {
      return { ok: false, status: 400, reason: "each migration requires id and sql", datasource: resolved.datasource };
    }
    const ledger = ensureMigrationLedger(resolved.database, resolved.datasource);
    const applied = [];
    const skipped = [];
    resolved.database.exec("begin");
    try {
      const lookup = resolved.database.prepare(`select id from ${ledger} where id = ?`);
      const insertLedger = resolved.database.prepare(`insert into ${ledger} (id, applied_at) values (?, ?)`);
      for (const migration of normalizedMigrations) {
        const existing = lookup.get(migration.id);
        if (existing) {
          skipped.push(migration.id);
          continue;
        }
        resolved.database.exec(migration.sql);
        insertLedger.run(migration.id, isoAt(Date.now()));
        applied.push(migration.id);
      }
      resolved.database.exec("commit");
      return { ok: true, datasource: resolved.datasource, applied, skipped };
    } catch (error) {
      try {
        resolved.database.exec("rollback");
      } catch {
        // ignore rollback failure
      }
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "migration failed", datasource: resolved.datasource };
    }
  };

  const query = async ({ sql, params }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    if (typeof sql !== "string" || !sql.trim()) return { ok: false, status: 400, reason: "sql required", datasource: resolved.datasource };
    const normalizedParams = normalizeDbSqlParams(params);
    if (!normalizedParams.ok) return { ...normalizedParams, datasource: resolved.datasource };
    try {
      const statement = resolved.database.prepare(sql);
      const rows = applyDbSqlParams(statement, "all", normalizedParams);
      return { ok: true, datasource: resolved.datasource, rows, rowCount: rows.length };
    } catch (error) {
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "query failed", datasource: resolved.datasource };
    }
  };

  const command = async ({ sql, params }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    if (typeof sql !== "string" || !sql.trim()) return { ok: false, status: 400, reason: "sql required", datasource: resolved.datasource };
    const normalizedParams = normalizeDbSqlParams(params);
    if (!normalizedParams.ok) return { ...normalizedParams, datasource: resolved.datasource };
    try {
      const statement = resolved.database.prepare(sql);
      const result = applyDbSqlParams(statement, "run", normalizedParams);
      return {
        ok: true,
        datasource: resolved.datasource,
        changes: Number(result?.changes ?? 0),
        lastInsertRowid: Number(result?.lastInsertRowid ?? 0)
      };
    } catch (error) {
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "command failed", datasource: resolved.datasource };
    }
  };

  const transaction = async ({ steps }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    const normalizedSteps = Array.isArray(steps) ? steps.map(step => ({
      kind: typeof step?.kind === "string" ? step.kind.trim().toLowerCase() : "",
      sql: typeof step?.sql === "string" ? step.sql.trim() : "",
      params: step?.params,
      name: typeof step?.name === "string" ? step.name.trim() : null
    })) : [];
    if (!normalizedSteps.length) return { ok: false, status: 400, reason: "transaction steps required", datasource: resolved.datasource };
    if (normalizedSteps.some(step => !["query", "command"].includes(step.kind) || !step.sql)) {
      return { ok: false, status: 400, reason: "transaction steps require kind=query|command and sql", datasource: resolved.datasource };
    }
    const results = [];
    resolved.database.exec("begin");
    try {
      for (const step of normalizedSteps) {
        const normalizedParams = normalizeDbSqlParams(step.params);
        if (!normalizedParams.ok) throw new Error(normalizedParams.reason);
        const statement = resolved.database.prepare(step.sql);
        if (step.kind === "query") {
          const rows = applyDbSqlParams(statement, "all", normalizedParams);
          results.push({ kind: step.kind, name: step.name, rowCount: rows.length, rows });
        } else {
          const outcome = applyDbSqlParams(statement, "run", normalizedParams);
          results.push({
            kind: step.kind,
            name: step.name,
            changes: Number(outcome?.changes ?? 0),
            lastInsertRowid: Number(outcome?.lastInsertRowid ?? 0)
          });
        }
      }
      resolved.database.exec("commit");
      return { ok: true, datasource: resolved.datasource, results };
    } catch (error) {
      try {
        resolved.database.exec("rollback");
      } catch {
        // ignore rollback failure
      }
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "transaction failed", datasource: resolved.datasource };
    }
  };

  return {
    inspect: () => datasourceStatus(),
    migrate,
    query,
    command,
    transaction,
    close: () => {
      for (const database of sqliteConnections.values()) {
        try {
          database.close();
        } catch {
          // ignore close failure
        }
      }
      sqliteConnections.clear();
    }
  };
}

function normalizeSearchIndexConfig(runtimeConfig, runtimeRoot, storage, serverRunnerId) {
  const providerRaw = runtimeConfigLookup(runtimeConfig, "search.index.provider");
  const provider = typeof providerRaw === "string" && providerRaw.trim() ? providerRaw.trim() : "local-text";
  const searchRoot = storage?.searchRoot || path.resolve(runtimeRoot || process.cwd(), "search");
  const maxTextBytes = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.maxTextBytes"), 262144);
  const defaultLimit = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.defaultLimit"), 10);
  const assetRefreshPolicyRaw = typeof runtimeConfigLookup(runtimeConfig, "search.index.assetRefreshPolicy") === "string"
    ? runtimeConfigLookup(runtimeConfig, "search.index.assetRefreshPolicy").trim().toLowerCase()
    : "";
  const assetRefreshPolicy = assetRefreshPolicyRaw || "on-ingest";
  const indexId = `searchIndex:${serverRunnerId}:main`;
  const title = `${serverRunnerId} Search Index`;
  if (!["on-ingest", "manual"].includes(assetRefreshPolicy)) {
    return {
      ok: false,
      status: 400,
      reason: "search.index.assetRefreshPolicy must be on-ingest or manual",
      index: {
        id: indexId,
        title,
        serverRunner: serverRunnerId,
        provider,
        name: "main",
        path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
        status: "failed",
        lastError: "search.index.assetRefreshPolicy must be on-ingest or manual"
      }
    };
  }
  if (provider !== "local-text") {
    return {
      ok: false,
      status: 501,
      reason: `${provider} search adapter not wired in this runtime slice`,
      index: {
        id: indexId,
        title,
        serverRunner: serverRunnerId,
        provider,
        name: "main",
        path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
        status: "unsupported",
        lastError: `${provider} search adapter not wired in this runtime slice`
      }
    };
  }
  return {
    ok: true,
    provider,
    searchRoot,
    maxTextBytes,
    defaultLimit,
    assetRefreshPolicy,
    index: {
      id: indexId,
      title,
      serverRunner: serverRunnerId,
      provider,
      name: "main",
      path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
      status: "ready",
      lastError: null
    }
  };
}

function tokenizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g) ?? [];
}

function searchTermCounts(text) {
  const counts = Object.create(null);
  for (const term of tokenizeSearchText(text)) counts[term] = (counts[term] ?? 0) + 1;
  return counts;
}

function decodeSearchTextBytes(bytes, maxTextBytes) {
  return Buffer.isBuffer(bytes)
    ? bytes.subarray(0, maxTextBytes).toString("utf8")
    : Buffer.from(bytes || []).subarray(0, maxTextBytes).toString("utf8");
}

function flattenJsonForSearch(value, prefix = "", rows = []) {
  if (value == null) {
    if (prefix) rows.push(`${prefix} null`);
    return rows;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJsonForSearch(item, prefix ? `${prefix}.${index}` : String(index), rows));
    return rows;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (entry && typeof entry === "object") {
        flattenJsonForSearch(entry, next, rows);
      } else {
        rows.push(`${next} ${String(entry)}`);
      }
    }
    return rows;
  }
  if (prefix) rows.push(`${prefix} ${String(value)}`);
  else rows.push(String(value));
  return rows;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function extractMarkupText(text) {
  return decodeHtmlEntities(String(text || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractDelimitedText(text, delimiterPattern) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.split(delimiterPattern).map(cell => cell.trim()).filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
}

function countNonEmptyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .length;
}

function countWords(text) {
  return String(text || "").trim().match(/\S+/g)?.length ?? 0;
}

function limitMetadataList(values, limit = 8) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, limit);
}

function textDerivedMetadata(kind, text, extra = {}) {
  const metadata = {
    kind,
    lineCount: countNonEmptyLines(text),
    wordCount: countWords(text),
    charCount: String(text || "").length,
    ...extra
  };
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

function extractDelimitedMetadata(text, delimiterPattern, kind) {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(delimiterPattern).map(cell => cell.trim()));
  if (!rows.length) return { kind, rowCount: 0, dataRowCount: 0, columnCount: 0 };
  const headers = limitMetadataList(rows[0]);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.filter(Boolean).length), 0);
  return {
    kind,
    rowCount: rows.length,
    dataRowCount: Math.max(0, rows.length - 1),
    columnCount,
    headers
  };
}

function extractJsonDerivedMetadata(value) {
  if (Array.isArray(value)) {
    return {
      kind: "json",
      rootKind: "array",
      entryCount: value.length
    };
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return {
      kind: "json",
      rootKind: "object",
      topLevelKeyCount: keys.length,
      topLevelKeys: limitMetadataList(keys)
    };
  }
  return {
    kind: "json",
    rootKind: value == null ? "null" : typeof value
  };
}

function extractTomlSearchText(raw) {
  const source = String(raw || "");
  const sections = [];
  const topLevelKeys = [];
  const rows = [];
  let currentSection = "";
  let arrayTableCount = 0;
  for (const line of source.split(/\r?\n/)) {
    const withoutComment = line.replace(/\s+#.*$/, "").trim();
    if (!withoutComment) continue;
    const arrayTableMatch = withoutComment.match(/^\[\[\s*([^\]]+?)\s*\]\]$/);
    if (arrayTableMatch) {
      currentSection = arrayTableMatch[1].trim();
      arrayTableCount += 1;
      sections.push(currentSection);
      rows.push(currentSection);
      continue;
    }
    const sectionMatch = withoutComment.match(/^\[\s*([^\]]+?)\s*\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections.push(currentSection);
      rows.push(currentSection);
      continue;
    }
    const keyValueMatch = withoutComment.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!keyValueMatch) continue;
    const key = keyValueMatch[1].trim();
    const value = keyValueMatch[2].trim().replace(/^["']|["']$/g, "");
    if (!currentSection && key) topLevelKeys.push(key);
    rows.push(`${currentSection ? `${currentSection}.` : ""}${key} ${value}`.trim());
  }
  const text = rows.join("\n").trim();
  return {
    text,
    status: text ? "extracted" : "empty",
    extractor: "toml",
    metadata: textDerivedMetadata("toml", text, {
      topLevelKeyCount: limitMetadataList(topLevelKeys).length || null,
      topLevelKeys,
      sectionCount: limitMetadataList(sections).length || null,
      sections,
      arrayTableCount: arrayTableCount || null
    })
  };
}

function extractYamlSearchText(raw) {
  const source = String(raw || "");
  const rows = [];
  const stack = [];
  const topLevelKeys = [];
  let listCount = 0;
  for (const line of source.split(/\r?\n/)) {
    const withoutComment = line.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)?.[0]?.length ?? 0;
    const trimmed = withoutComment.trim();
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (trimmed.startsWith("- ")) {
      listCount += 1;
      const value = trimmed.slice(2).trim();
      if (!value) continue;
      const inlinePair = value.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.+)$/);
      if (inlinePair) {
        const prefix = stack.map(entry => entry.key).join(".");
        rows.push(`${prefix ? `${prefix}.` : ""}${inlinePair[1]} ${inlinePair[2]}`.trim());
      } else {
        const prefix = stack.map(entry => entry.key).join(".");
        rows.push(`${prefix} ${value}`.trim());
      }
      continue;
    }
    const keyValueMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!keyValueMatch) continue;
    const key = keyValueMatch[1].trim();
    const value = keyValueMatch[2].trim().replace(/^["']|["']$/g, "");
    if (indent === 0) topLevelKeys.push(key);
    stack.push({ indent, key });
    if (!value) continue;
    const pathParts = stack.map(entry => entry.key);
    rows.push(`${pathParts.join(".")} ${value}`.trim());
  }
  const text = rows.join("\n").trim();
  return {
    text,
    status: text ? "extracted" : "empty",
    extractor: "yaml",
    metadata: textDerivedMetadata("yaml", text, {
      topLevelKeyCount: limitMetadataList(topLevelKeys).length || null,
      topLevelKeys,
      listCount: listCount || null
    })
  };
}

function extractMarkdownDerivedMetadata(raw) {
  const source = String(raw || "");
  const headings = limitMetadataList(
    source
      .split(/\r?\n/)
      .map(line => line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1] ?? "")
  );
  const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontmatterKeys = limitMetadataList(
    frontmatterMatch
      ? [...frontmatterMatch[1].matchAll(/^\s*([A-Za-z0-9_-]+)\s*:/gm)].map(match => match[1])
      : []
  );
  return textDerivedMetadata("markdown", source, {
    title: headings[0] || null,
    headingCount: headings.length,
    headings,
    frontmatterKeyCount: frontmatterKeys.length || null,
    frontmatterKeys
  });
}

function extractMarkupDerivedMetadata(raw, text) {
  const rootTag = String(raw || "").match(/<\s*([A-Za-z][\w:-]*)\b/)?.[1]?.toLowerCase() ?? null;
  const title = decodeHtmlEntities(String(raw || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return textDerivedMetadata("markup", text, {
    rootTag,
    title: title || null
  });
}

function looksMarkdownMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value === "text/markdown"
    || value === "text/x-markdown"
    || value === "application/markdown"
    || value.endsWith("+markdown");
}

function looksYamlMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value === "application/yaml"
    || value === "application/x-yaml"
    || value === "text/yaml"
    || value === "text/x-yaml"
    || value.endsWith("+yaml");
}

function looksTomlMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value === "application/toml"
    || value === "application/x-toml"
    || value === "text/toml"
    || value.endsWith("+toml");
}

function assetExtension(originalName) {
  const match = String(originalName || "").trim().toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function inferStructuredAssetKind({ mimeType, originalName }) {
  const lowered = String(mimeType || "").toLowerCase();
  const ext = assetExtension(originalName);
  if (lowered === "application/pdf" || ext === ".pdf") return "pdf";
  if (lowered === "application/json" || lowered === "application/ld+json" || lowered.endsWith("+json") || ext === ".json" || ext === ".jsonld") return "json";
  if (lowered.includes("csv") || ext === ".csv") return "csv";
  if (lowered.includes("tsv") || lowered.includes("tab-separated") || ext === ".tsv") return "tsv";
  if (looksMarkdownMime(lowered) || ext === ".md" || ext === ".markdown") return "markdown";
  if (looksYamlMime(lowered) || ext === ".yaml" || ext === ".yml") return "yaml";
  if (looksTomlMime(lowered) || ext === ".toml") return "toml";
  if (lowered.includes("html") || lowered.includes("xml") || lowered === "image/svg+xml" || ext === ".html" || ext === ".htm" || ext === ".xml" || ext === ".svg") return "markup";
  return looksTextSearchMime(lowered) ? "text" : "";
}

function decodePdfLiteralString(source) {
  let out = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = source[index + 1] ?? "";
    if (!next) break;
    if (/[0-7]/.test(next)) {
      let octal = next;
      if (/[0-7]/.test(source[index + 2] ?? "")) octal += source[index + 2];
      if (/[0-7]/.test(source[index + 3] ?? "")) octal += source[index + 3];
      out += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "\r" || next === "\n") {
      if (next === "\r" && source[index + 2] === "\n") index += 1;
    } else {
      out += next;
    }
    index += 1;
  }
  return out;
}

function extractPdfArrayStrings(source) {
  const values = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "(") {
      let depth = 1;
      let token = "";
      index += 1;
      while (index < source.length && depth > 0) {
        const current = source[index];
        if (current === "\\" && index + 1 < source.length) {
          token += current + source[index + 1];
          index += 2;
          continue;
        }
        if (current === "(") depth += 1;
        else if (current === ")") {
          depth -= 1;
          if (depth === 0) {
            index += 1;
            break;
          }
        }
        token += current;
        index += 1;
      }
      values.push(decodePdfLiteralString(token));
      continue;
    }
    if (char === "<" && source[index + 1] !== "<") {
      const end = source.indexOf(">", index + 1);
      if (end < 0) break;
      const hex = source.slice(index + 1, end).replace(/\s+/g, "");
      if (hex) {
        const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
        try {
          values.push(Buffer.from(padded, "hex").toString("utf8"));
        } catch {
          values.push("");
        }
      }
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return values;
}

function extractPdfStreamText(source) {
  const chunks = [];
  const directLiteral = /\(((?:\\.|[^\\()])*)\)\s*Tj\b/g;
  for (const match of source.matchAll(directLiteral)) {
    chunks.push(decodePdfLiteralString(match[1]));
  }
  const directHex = /<([0-9A-Fa-f\s]+)>\s*Tj\b/g;
  for (const match of source.matchAll(directHex)) {
    const hex = match[1].replace(/\s+/g, "");
    if (!hex) continue;
    const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
    try {
      chunks.push(Buffer.from(padded, "hex").toString("utf8"));
    } catch {
      // ignore malformed hex text segments
    }
  }
  const arrays = /\[([\s\S]*?)\]\s*TJ\b/g;
  for (const match of source.matchAll(arrays)) {
    chunks.push(...extractPdfArrayStrings(match[1]));
  }
  const quoteOps = /\(((?:\\.|[^\\()])*)\)\s*['"]/g;
  for (const match of source.matchAll(quoteOps)) {
    chunks.push(decodePdfLiteralString(match[1]));
  }
  return chunks
    .map(value => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function extractPdfSearchText(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const pdfText = buffer.toString("latin1");
  const parts = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs;
  for (const match of pdfText.matchAll(streamPattern)) {
    const dictionary = match[1] || "";
    const rawStream = Buffer.from(match[2] || "", "latin1");
    let decoded = rawStream;
    if (/\/Filter\s*(\[.*?\/FlateDecode.*?\]|\/FlateDecode)\b/s.test(dictionary)) {
      try {
        decoded = inflateSync(rawStream);
      } catch {
        continue;
      }
    }
    const text = extractPdfStreamText(decoded.toString("latin1"));
    if (text) parts.push(text);
  }
  const fallbackInfoStrings = [];
  const infoStringPattern = /\/(?:Title|Author|Subject|Keywords)\s*\(((?:\\.|[^\\()])*)\)/g;
  for (const match of pdfText.matchAll(infoStringPattern)) {
    fallbackInfoStrings.push(decodePdfLiteralString(match[1]));
  }
  const text = [...parts, ...fallbackInfoStrings]
    .map(value => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return {
    text,
    status: text ? "extracted" : "empty",
    extractor: "pdf",
    metadata: textDerivedMetadata("pdf", text, {
      pageCount: Number.parseInt(pdfText.match(/\/Type\s*\/Pages\b[\s\S]{0,256}?\/Count\s+(\d+)/)?.[1] || "", 10)
        || ([...pdfText.matchAll(/\/Type\s*\/Page\b/g)].length || null),
      title: decodePdfLiteralString(pdfText.match(/\/Title\s*\(((?:\\.|[^\\()])*)\)/)?.[1] ?? "").trim() || null,
      author: decodePdfLiteralString(pdfText.match(/\/Author\s*\(((?:\\.|[^\\()])*)\)/)?.[1] ?? "").trim() || null,
      subject: decodePdfLiteralString(pdfText.match(/\/Subject\s*\(((?:\\.|[^\\()])*)\)/)?.[1] ?? "").trim() || null
    })
  };
}

function extractAssetSearchText({ mimeType, originalName, bytes, maxTextBytes }) {
  const lowered = String(mimeType || "").toLowerCase();
  const kind = inferStructuredAssetKind({ mimeType: lowered, originalName });
  if (kind === "pdf") {
    return extractPdfSearchText(bytes);
  }
  const raw = decodeSearchTextBytes(bytes, maxTextBytes);
  if (!raw.trim()) {
    return { text: "", status: "empty", extractor: "empty", metadata: { kind: "empty", lineCount: 0, wordCount: 0, charCount: 0 } };
  }
  if (kind === "json") {
    try {
      const parsed = JSON.parse(raw);
      return {
        text: flattenJsonForSearch(parsed).join("\n").trim(),
        status: "extracted",
        extractor: "json",
        metadata: extractJsonDerivedMetadata(parsed)
      };
    } catch {
      return {
        text: raw,
        status: "extracted",
        extractor: "text-fallback",
        metadata: textDerivedMetadata("text", raw)
      };
    }
  }
  if (kind === "csv") {
    return {
      text: extractDelimitedText(raw, /,/),
      status: "extracted",
      extractor: "csv",
      metadata: extractDelimitedMetadata(raw, /,/, "csv")
    };
  }
  if (kind === "tsv") {
    return {
      text: extractDelimitedText(raw, /\t/),
      status: "extracted",
      extractor: "tsv",
      metadata: extractDelimitedMetadata(raw, /\t/, "tsv")
    };
  }
  if (kind === "markdown") {
    return {
      text: raw,
      status: "extracted",
      extractor: "markdown",
      metadata: extractMarkdownDerivedMetadata(raw)
    };
  }
  if (kind === "yaml") return extractYamlSearchText(raw);
  if (kind === "toml") return extractTomlSearchText(raw);
  if (kind === "markup") {
    const text = extractMarkupText(raw);
    return {
      text,
      status: "extracted",
      extractor: "markup",
      metadata: extractMarkupDerivedMetadata(raw, text)
    };
  }
  return {
    text: raw,
    status: "extracted",
    extractor: "text",
    metadata: textDerivedMetadata("text", raw)
  };
}

function supportsDerivedAssetSearchText(mimeType, originalName = "") {
  return Boolean(inferStructuredAssetKind({ mimeType, originalName }));
}

function looksTextSearchMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value.startsWith("text/")
    || value === "application/json"
    || value === "application/ld+json"
    || value === "application/xml"
    || value === "image/svg+xml"
    || value.includes("javascript")
    || value.includes("xml");
}

function parseSvgLength(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(px)?$/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height, format: "png" } : null;
}

function detectGifDimensions(bytes) {
  if (bytes.length < 10) return null;
  const header = bytes.subarray(0, 6).toString("ascii");
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  return width > 0 && height > 0 ? { width, height, format: "gif" } : null;
}

function detectJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    offset += 2;
    if (segmentLength < 2 || offset + segmentLength - 2 > bytes.length) break;
    if (sofMarkers.has(marker)) {
      if (segmentLength < 7) break;
      const height = bytes.readUInt16BE(offset + 1);
      const width = bytes.readUInt16BE(offset + 3);
      return width > 0 && height > 0 ? { width, height, format: "jpeg" } : null;
    }
    offset += segmentLength - 2;
  }
  return null;
}

function detectSvgDimensions(bytes) {
  const text = decodeSearchTextBytes(bytes, Math.min(bytes.length, 65536));
  const openTag = text.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  if (!openTag) return null;
  const width = parseSvgLength(openTag.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1] ?? null);
  const height = parseSvgLength(openTag.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1] ?? null);
  if (width && height) return { width, height, format: "svg" };
  const viewBox = openTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(value => Number.parseFloat(value));
    if (parts.length === 4 && parts.every(value => Number.isFinite(value)) && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3], format: "svg" };
    }
  }
  return null;
}

function detectImageMetadata({ mimeType, bytes }) {
  const lowered = String(mimeType || "").toLowerCase();
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buffer.length) return null;
  if (lowered === "image/png") return detectPngDimensions(buffer);
  if (lowered === "image/gif") return detectGifDimensions(buffer);
  if (lowered === "image/jpeg" || lowered === "image/jpg") return detectJpegDimensions(buffer);
  if (lowered === "image/svg+xml") return detectSvgDimensions(buffer);
  return detectPngDimensions(buffer) || detectGifDimensions(buffer) || detectJpegDimensions(buffer) || detectSvgDimensions(buffer);
}

function renderAssetThumbnailSvg({ mimeType, bytes, width, height, maxEdgePx }) {
  const sourceBytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const safeWidth = Number.isFinite(width) && width > 0 ? width : maxEdgePx;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : maxEdgePx;
  const largestEdge = Math.max(safeWidth, safeHeight, 1);
  const scale = Math.min(1, maxEdgePx / largestEdge);
  const displayWidth = Math.max(1, Math.round(safeWidth * scale));
  const displayHeight = Math.max(1, Math.round(safeHeight * scale));
  const dataUrl = `data:${mimeType};base64,${sourceBytes.toString("base64")}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <rect width="${safeWidth}" height="${safeHeight}" fill="#f5f5f4"/>
  <image href="${dataUrl}" width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
  return {
    bytes: Buffer.from(svg, "utf8"),
    mimeType: "image/svg+xml",
    width: safeWidth,
    height: safeHeight
  };
}

function normalizeAssetThumbnailConfig(runtimeConfig = {}) {
  return {
    maxSourceBytes: positiveInteger(runtimeConfigLookup(runtimeConfig, "upload.asset.thumbnailMaxSourceBytes"), 2 * 1024 * 1024),
    maxEdgePx: positiveInteger(runtimeConfigLookup(runtimeConfig, "upload.asset.thumbnailMaxEdgePx"), 256)
  };
}

function extractAssetThumbnail({ mimeType, bytes, runtimeConfig }) {
  const lowered = String(mimeType || "").toLowerCase();
  if (!lowered.startsWith("image/")) return { status: "not-applicable", metadata: null, thumbnail: null };
  const metadata = detectImageMetadata({ mimeType: lowered, bytes });
  if (!metadata) return { status: "unsupported-image", metadata: null, thumbnail: null };
  const config = normalizeAssetThumbnailConfig(runtimeConfig);
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length > config.maxSourceBytes) {
    return { status: "too-large", metadata, thumbnail: null };
  }
  return {
    status: "ready",
    metadata,
    thumbnail: renderAssetThumbnailSvg({
      mimeType: lowered,
      bytes: buffer,
      width: metadata.width,
      height: metadata.height,
      maxEdgePx: config.maxEdgePx
    })
  };
}

function searchSnippet(text, terms) {
  const source = String(text || "");
  if (!source) return "";
  const lowered = source.toLowerCase();
  let index = -1;
  for (const term of terms) {
    const found = lowered.indexOf(term.toLowerCase());
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) return source.slice(0, 140);
  const start = Math.max(0, index - 40);
  const end = Math.min(source.length, index + 100);
  return source.slice(start, end);
}

function createSearchIndexRuntime({ world, runtimeConfig, runtimeRoot, serverRunnerId, storage }) {
  let stateLoaded = false;
  let stateCache = null;
  let buildSequence = 0;

  const currentConfig = () => normalizeSearchIndexConfig(runtimeConfig, runtimeRoot, storage, serverRunnerId);
  const assetsRootForRuntime = () => storage?.assetsRoot || path.resolve(runtimeRoot || process.cwd(), "assets");
  const assetPathForRuntime = assetId => path.join(assetsRootForRuntime(), encodeURIComponent(assetId), "blob");
  const assetDerivedTextPathForRuntime = assetId => path.join(assetsRootForRuntime(), encodeURIComponent(assetId), "derived", "text.txt");

  const sanitizeDocument = (document, ordinal) => {
    const id = typeof document?.id === "string" && document.id.trim() ? document.id.trim() : `document:${ordinal + 1}`;
    const title = typeof document?.title === "string" && document.title.trim() ? document.title.trim() : id;
    const text = typeof document?.text === "string" ? document.text : "";
    const context = typeof document?.context === "string" && document.context.trim() ? document.context.trim() : null;
    if (!text.trim()) return { ok: false, status: 400, reason: `document ${id} requires text` };
    return {
      ok: true,
      descriptor: {
        type: "document",
        id,
        title,
        text,
        context
      }
    };
  };

  const normalizeSourceDescriptors = ({ documents, assetIds }) => {
    const sourceDescriptors = [];
    const seenAssets = new Set();
    const seenDocs = new Set();
    for (const [index, document] of (Array.isArray(documents) ? documents : []).entries()) {
      const normalized = sanitizeDocument(document, index);
      if (!normalized.ok) return normalized;
      if (seenDocs.has(normalized.descriptor.id)) return { ok: false, status: 409, reason: `duplicate document id ${normalized.descriptor.id}` };
      seenDocs.add(normalized.descriptor.id);
      sourceDescriptors.push(normalized.descriptor);
    }
    for (const rawId of Array.isArray(assetIds) ? assetIds : []) {
      const assetId = typeof rawId === "string" ? rawId.trim() : "";
      if (!assetId) return { ok: false, status: 400, reason: "assetIds require non-empty strings" };
      if (seenAssets.has(assetId)) continue;
      seenAssets.add(assetId);
      sourceDescriptors.push({ type: "asset", assetId });
    }
    if (!sourceDescriptors.length) return { ok: false, status: 400, reason: "documents or assetIds required" };
    return { ok: true, sourceDescriptors };
  };

  const resolveDocumentSource = descriptor => ({
    ok: true,
    document: {
      id: descriptor.id,
      title: descriptor.title,
      context: descriptor.context ?? null,
      sourceKind: "document",
      assetId: null,
      mimeType: "text/plain",
      text: descriptor.text
    }
  });

  const resolveAssetSource = async (descriptor, config) => {
    const asset = world.project(moduleProjectors.assetIndex).byId[descriptor.assetId] ?? null;
    if (!asset) return { ok: false, status: 404, reason: `asset ${descriptor.assetId} not found` };
    const metadataText = [asset.title, asset.mimeType, asset.context].filter(Boolean).join(" ");
    let text = metadataText;
    if (typeof asset.textRef === "string" && asset.textRef) {
      try {
        const extractedText = await fs.readFile(assetDerivedTextPathForRuntime(asset.id), "utf8");
        text = `${metadataText}\n${extractedText}`.trim();
      } catch (error) {
        return { ok: false, status: 500, reason: error instanceof Error ? error.message : `asset ${asset.id} extracted text unreadable` };
      }
    } else if (looksTextSearchMime(asset.mimeType)) {
      try {
        const bytes = await fs.readFile(assetPathForRuntime(asset.id));
        text = `${metadataText}\n${bytes.subarray(0, config.maxTextBytes).toString("utf8")}`.trim();
      } catch (error) {
        return { ok: false, status: 500, reason: error instanceof Error ? error.message : `asset ${asset.id} content unreadable` };
      }
    }
    return {
      ok: true,
      document: {
        id: asset.id,
        title: asset.title,
        context: asset.context ?? null,
        sourceKind: "asset",
        assetId: asset.id,
        mimeType: asset.mimeType,
        text
      }
    };
  };

  const resolveSourceDocuments = async (sourceDescriptors, config) => {
    const documents = [];
    for (const descriptor of sourceDescriptors) {
      const resolved = descriptor.type === "asset"
        ? await resolveAssetSource(descriptor, config)
        : resolveDocumentSource(descriptor);
      if (!resolved.ok) return resolved;
      const terms = searchTermCounts(resolved.document.text);
      documents.push({
        ...resolved.document,
        termCounts: terms,
        termCount: Object.values(terms).reduce((sum, count) => sum + count, 0)
      });
    }
    return { ok: true, documents };
  };

  const summarizeState = state => ({
    id: state.id,
    title: state.title,
    serverRunner: state.serverRunner,
    provider: state.provider,
    name: state.name,
    status: state.status ?? "ready",
    sourceCount: Array.isArray(state.sourceDescriptors) ? state.sourceDescriptors.length : 0,
    documentCount: Array.isArray(state.documents) ? state.documents.length : 0,
    assetCount: (state.documents ?? []).filter(document => document.sourceKind === "asset").length,
    queryCount: Number(state.queryCount ?? 0),
    lastBuiltAt: state.lastBuiltAt ?? null,
    lastQueryAt: state.lastQueryAt ?? null,
    path: state.path,
    lastError: state.lastError ?? null
  });

  const loadState = async config => {
    if (stateLoaded) return stateCache;
    try {
      const raw = await fs.readFile(config.index.path, "utf8");
      const parsed = JSON.parse(raw);
      stateCache = {
        ...parsed,
        id: parsed?.id || config.index.id,
        title: parsed?.title || config.index.title,
        serverRunner: parsed?.serverRunner || serverRunnerId,
        provider: parsed?.provider || config.provider,
        name: parsed?.name || "main",
        path: config.index.path,
        documents: Array.isArray(parsed?.documents) ? parsed.documents : [],
        sourceDescriptors: Array.isArray(parsed?.sourceDescriptors) ? parsed.sourceDescriptors : [],
        queryCount: Number(parsed?.queryCount ?? 0),
        lastBuiltAt: parsed?.lastBuiltAt ?? null,
        lastQueryAt: parsed?.lastQueryAt ?? null,
        status: parsed?.status || "ready",
        lastError: parsed?.lastError ?? null
      };
    } catch {
      stateCache = null;
    }
    stateLoaded = true;
    return stateCache;
  };

  const persistState = async state => {
    await fs.mkdir(path.dirname(state.path), { recursive: true });
    await fs.writeFile(state.path, JSON.stringify(state, null, 2), "utf8");
    stateCache = state;
    stateLoaded = true;
    return state;
  };

  const build = async ({ documents, assetIds }) => {
    const config = currentConfig();
    if (!config.ok) return config;
    const normalized = normalizeSourceDescriptors({ documents, assetIds });
    if (!normalized.ok) return normalized;
    const resolved = await resolveSourceDocuments(normalized.sourceDescriptors, config);
    if (!resolved.ok) return resolved;
    const existing = await loadState(config);
    buildSequence += 1;
    const state = {
      version: 1,
      id: config.index.id,
      title: config.index.title,
      serverRunner: serverRunnerId,
      provider: config.provider,
      name: "main",
      path: config.index.path,
      sourceDescriptors: normalized.sourceDescriptors,
      documents: resolved.documents,
      queryCount: Number(existing?.queryCount ?? 0),
      lastQueryAt: existing?.lastQueryAt ?? null,
      lastBuiltAt: isoAt(Date.now()),
      status: "ready",
      lastError: null,
      buildSequence
    };
    await persistState(state);
    return { ok: true, index: summarizeState(state), sourceDescriptors: normalized.sourceDescriptors };
  };

  const reindex = async () => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: false, status: 404, reason: "search index not built", index: null };
    const resolved = await resolveSourceDocuments(state.sourceDescriptors, config);
    if (!resolved.ok) return resolved;
    buildSequence += 1;
    const nextState = {
      ...state,
      provider: config.provider,
      path: config.index.path,
      documents: resolved.documents,
      lastBuiltAt: isoAt(Date.now()),
      status: "ready",
      lastError: null,
      buildSequence
    };
    await persistState(nextState);
    return { ok: true, index: summarizeState(nextState), sourceDescriptors: nextState.sourceDescriptors };
  };

  const refreshAsset = async assetId => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: true, changed: false, disposition: "not-built", index: null };
    if (config.assetRefreshPolicy !== "on-ingest") {
      return { ok: true, changed: false, disposition: config.assetRefreshPolicy, policy: config.assetRefreshPolicy, index: summarizeState(state) };
    }
    const includesAsset = (state.sourceDescriptors ?? []).some(descriptor => descriptor?.type === "asset" && descriptor.assetId === assetId);
    if (!includesAsset) {
      return { ok: true, changed: false, disposition: "not-indexed", policy: config.assetRefreshPolicy, index: summarizeState(state) };
    }
    const rebuilt = await reindex();
    if (!rebuilt.ok) return rebuilt;
    return { ok: true, changed: true, disposition: "reindexed", policy: config.assetRefreshPolicy, index: rebuilt.index, sourceDescriptors: rebuilt.sourceDescriptors };
  };

  const inspectAsset = async assetId => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) {
      return {
        ok: true,
        built: false,
        indexed: false,
        stale: false,
        policy: config.assetRefreshPolicy,
        disposition: "not-built",
        index: null,
        lastBuiltAt: null,
        assetUpdatedAt: null
      };
    }
    const includesAsset = (state.sourceDescriptors ?? []).some(descriptor => descriptor?.type === "asset" && descriptor.assetId === assetId);
    const asset = world.project(moduleProjectors.assetIndex).byId[assetId] ?? null;
    const lastBuiltAt = typeof state.lastBuiltAt === "string" ? state.lastBuiltAt : null;
    const assetUpdatedAt = typeof asset?.processingUpdatedAt === "string" ? asset.processingUpdatedAt : null;
    const lastBuiltAtMs = parseIsoAt(lastBuiltAt);
    const assetUpdatedAtMs = parseIsoAt(assetUpdatedAt);
    const stale = Boolean(includesAsset && assetUpdatedAtMs != null && (lastBuiltAtMs == null || assetUpdatedAtMs > lastBuiltAtMs));
    return {
      ok: true,
      built: true,
      indexed: includesAsset,
      stale,
      policy: config.assetRefreshPolicy,
      disposition: !includesAsset ? "not-indexed" : (stale ? "stale" : "ready"),
      index: summarizeState(state),
      lastBuiltAt,
      assetUpdatedAt
    };
  };

  const reindexAsset = async assetId => {
    const inspected = await inspectAsset(assetId);
    if (!inspected.ok) return inspected;
    if (!inspected.built) return { ok: false, status: 404, reason: "search index not built", repair: inspected };
    if (!inspected.indexed) return { ok: false, status: 409, reason: "asset not indexed in current search index", repair: inspected };
    const rebuilt = await reindex();
    if (!rebuilt.ok) return rebuilt;
    return {
      ok: true,
      changed: true,
      index: rebuilt.index,
      repair: {
        ...inspected,
        stale: false,
        disposition: "reindexed",
        lastBuiltAt: rebuilt.index.lastBuiltAt,
        index: rebuilt.index
      }
    };
  };

  const inspect = async () => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: true, index: null };
    return { ok: true, index: summarizeState(state) };
  };

  const query = async ({ q, limit }) => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: false, status: 404, reason: "search index not built", index: null };
    const queryText = typeof q === "string" ? q.trim() : "";
    const terms = tokenizeSearchText(queryText);
    if (!terms.length) return { ok: false, status: 400, reason: "query text required", index: summarizeState(state) };
    const cappedLimit = Math.max(1, Math.min(50, positiveInteger(limit, config.defaultLimit)));
    const hits = state.documents
      .map(document => {
        let score = 0;
        for (const term of terms) score += Number(document.termCounts?.[term] ?? 0);
        return {
          ...document,
          score,
          matchedTerms: terms.filter(term => Number(document.termCounts?.[term] ?? 0) > 0)
        };
      })
      .filter(document => document.score > 0)
      .sort((left, right) => right.score - left.score || String(left.title).localeCompare(String(right.title)))
      .slice(0, cappedLimit)
      .map(document => ({
        id: document.id,
        title: document.title,
        context: document.context,
        sourceKind: document.sourceKind,
        assetId: document.assetId,
        mimeType: document.mimeType,
        score: document.score,
        matchedTerms: document.matchedTerms,
        snippet: searchSnippet(document.text, terms)
      }));
    const nextState = {
      ...state,
      queryCount: Number(state.queryCount ?? 0) + 1,
      lastQueryAt: isoAt(Date.now()),
      status: "ready",
      lastError: null
    };
    await persistState(nextState);
    return { ok: true, index: summarizeState(nextState), hits, q: queryText, limit: cappedLimit };
  };

  return {
    inspect,
    build,
    reindex,
    refreshAsset,
    inspectAsset,
    reindexAsset,
    query,
    close: () => {}
  };
}

function createInProcessJobQueue({
  world,
  serverRunnerId,
  runtimeConfig = {},
  jobHandlers = {},
  getAppContext
}) {
  const config = normalizeJobQueueConfig(runtimeConfig);
  const activeJobs = new Set();
  let closed = false;

  const list = () => moduleProjectors.jobs(world.allWitnesses())
    .filter(row => row.serverRunner === serverRunnerId)
    .sort((a, b) => {
      const left = parseIsoAt(a.availableAt) ?? 0;
      const right = parseIsoAt(b.availableAt) ?? 0;
      if (left !== right) return left - right;
      return String(a.id).localeCompare(String(b.id));
    });

  const get = id => list().find(row => row.id === id) ?? null;

  const enqueue = ({
    actor,
    handler,
    payload = {},
    delayMs = 0,
    idempotencyKey = null,
    maxAttempts = config.maxAttempts,
    retryDelayMs = config.retryDelayMs
  } = {}) => {
    const name = typeof handler === "string" ? handler.trim() : "";
    if (!name) return { ok: false, status: 400, reason: "handler required" };
    if (!jobHandlers[name]) return { ok: false, status: 400, reason: "unknown job handler", handler: name };
    const safePayload = payload === undefined ? null : payload;
    const safeDelayMs = nonNegativeInteger(delayMs, 0);
    const safeMaxAttempts = positiveInteger(maxAttempts, config.maxAttempts);
    const safeRetryDelayMs = positiveInteger(retryDelayMs, config.retryDelayMs);
    const safeKey = typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : null;

    if (safeKey) {
      const existing = list().find(row => row.idempotencyKey === safeKey && row.handler === name);
      if (existing) return { ok: true, status: 200, created: false, job: existing, witness: null };
    }

    const id = `job_${randomUUID()}`;
    const createdAt = isoAt(Date.now());
    const availableAt = isoAt(Date.now() + safeDelayMs);
    const witness = world.emit({
      process: "jobs.queue.enqueue",
      actor: actor || serverRunnerId,
      claims: [
        thing(id),
        relation(id, "hasModuleKind", "job"),
        relation(id, "hasTitle", name),
        relation(actor || serverRunnerId, "owns", id)
      ],
      body: {
        id,
        serverRunner: serverRunnerId,
        actor: actor || null,
        handler: name,
        payload: safePayload,
        createdAt,
        availableAt,
        delayMs: safeDelayMs,
        idempotencyKey: safeKey,
        maxAttempts: safeMaxAttempts,
        retryDelayMs: safeRetryDelayMs
      }
    });
    return { ok: true, status: 201, created: true, job: get(id), witness };
  };

  const execute = async job => {
    const current = get(job.id);
    if (!current || current.status !== "queued") return;
    const handler = jobHandlers[current.handler];
    const attempt = (current.attempt || 0) + 1;
    world.emit({
      process: "jobs.queue.start",
      actor: current.actor || serverRunnerId,
      claims: [relation(serverRunnerId, "runs", current.id)],
      body: {
        id: current.id,
        serverRunner: serverRunnerId,
        actor: current.actor || null,
        handler: current.handler,
        attempt,
        payload: current.payload ?? null,
        maxAttempts: current.maxAttempts,
        retryDelayMs: current.retryDelayMs
      }
    });
    if (!handler) {
      world.emit({
        process: "jobs.queue.deadLetter",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          completedAt: isoAt(Date.now()),
          reason: "unknown job handler"
        }
      });
      return;
    }
    try {
      await handler({
        world,
        actor: current.actor || serverRunnerId,
        appContext: getAppContext(),
        job: current,
        payload: current.payload ?? null,
        attempt
      });
      world.emit({
        process: "jobs.queue.succeeded",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          completedAt: isoAt(Date.now())
        }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt >= (current.maxAttempts || config.maxAttempts)) {
        world.emit({
          process: "jobs.queue.deadLetter",
          actor: current.actor || serverRunnerId,
          claims: [],
          body: {
            id: current.id,
            serverRunner: serverRunnerId,
            actor: current.actor || null,
            handler: current.handler,
            attempt,
            maxAttempts: current.maxAttempts,
            retryDelayMs: current.retryDelayMs,
            completedAt: isoAt(Date.now()),
            reason
          }
        });
        return;
      }
      const delayMs = (current.retryDelayMs || config.retryDelayMs) * (2 ** Math.max(0, attempt - 1));
      world.emit({
        process: "jobs.queue.retry",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          reason,
          delayMs,
          nextAvailableAt: isoAt(Date.now() + delayMs)
        }
      });
    }
  };

  const tick = async () => {
    if (closed) return;
    for (const job of list()) {
      if (job.status !== "queued") continue;
      const availableAt = parseIsoAt(job.availableAt);
      if (availableAt == null || availableAt > Date.now()) continue;
      if (activeJobs.has(job.id)) continue;
      activeJobs.add(job.id);
      try {
        await execute(job);
      } finally {
        activeJobs.delete(job.id);
      }
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, config.pollMs);
  interval.unref?.();
  void tick();

  return {
    config,
    enqueue,
    list,
    get,
    close: () => {
      closed = true;
      clearInterval(interval);
    }
  };
}

function resolveRuntimeConfig(runtimeConfig, env = process.env) {
  if (runtimeConfig == null) {
    return { ok: true, values: {}, fields: [], failures: [] };
  }
  if (!runtimeConfig || typeof runtimeConfig !== "object" || Array.isArray(runtimeConfig)) {
    return {
      ok: false,
      values: {},
      fields: [],
      failures: [{ field: null, reason: "runtimeConfig must be an object" }]
    };
  }
  const values = {};
  const fields = [];
  const failures = [];

  for (const [name, raw] of Object.entries(runtimeConfig)) {
    const fieldName = normalizeRuntimeConfigFieldName(name);
    if (!fieldName) {
      failures.push({ field: fieldName || name, reason: "runtime config field name required" });
      continue;
    }
    if (runtimeConfigScalar(raw)) {
      values[fieldName] = raw;
      fields.push({
        name: fieldName,
        required: false,
        secret: false,
        secretRef: null,
        exposed: true,
        resolved: true,
        source: "value",
        value: raw
      });
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      failures.push({ field: fieldName, reason: "runtime config entry must be a scalar or object" });
      continue;
    }

    const hasValue = Object.prototype.hasOwnProperty.call(raw, "value");
    const hasDefault = Object.prototype.hasOwnProperty.call(raw, "default");
    const hasSecret = Object.prototype.hasOwnProperty.call(raw, "secret");
    const secretRef = hasSecret && typeof raw.secret === "string" && raw.secret.trim() ? raw.secret.trim() : null;
    const explicitValue = hasValue ? raw.value : undefined;
    const defaultValue = hasDefault ? raw.default : undefined;
    const required = raw.required === undefined ? !(hasValue || hasDefault) : raw.required === true;
    const exposed = raw.expose === undefined ? !hasSecret : raw.expose === true;

    if (hasValue && !runtimeConfigScalar(explicitValue)) {
      failures.push({ field: fieldName, reason: "runtime config value must be a string, number, or boolean" });
      continue;
    }
    if (hasDefault && !runtimeConfigScalar(defaultValue)) {
      failures.push({ field: fieldName, reason: "runtime config default must be a string, number, or boolean" });
      continue;
    }
    if (hasSecret && !secretRef) {
      failures.push({ field: fieldName, reason: "runtime config secret must be a non-empty string" });
      continue;
    }
    if (hasValue && hasSecret) {
      failures.push({ field: fieldName, reason: "runtime config entry cannot define both value and secret" });
      continue;
    }
    if (!hasValue && !hasDefault && !hasSecret) {
      failures.push({ field: fieldName, reason: "runtime config entry must define value, default, or secret" });
      continue;
    }

    let resolved = false;
    let source = null;
    let value = undefined;
    if (hasValue) {
      resolved = true;
      source = "value";
      value = explicitValue;
    } else if (secretRef) {
      const envValue = env[secretRef];
      if (typeof envValue === "string" && envValue.length) {
        resolved = true;
        source = "secret";
        value = envValue;
      } else if (hasDefault) {
        resolved = true;
        source = "default";
        value = defaultValue;
      } else if (!required) {
        source = "missing";
      } else {
        failures.push({ field: fieldName, reason: "missing secret reference", secretRef });
      }
    } else if (hasDefault) {
      resolved = true;
      source = "default";
      value = defaultValue;
    }

    if (resolved) values[fieldName] = value;
    fields.push({
      name: fieldName,
      required,
      secret: Boolean(secretRef),
      secretRef,
      exposed,
      resolved,
      source,
      ...(resolved && !secretRef && exposed ? { value } : {}),
      ...(resolved && secretRef ? { redacted: true } : {})
    });
  }

  return { ok: failures.length === 0, values, fields, failures };
}

export async function startServer(world, {
  actor,
  serverRunnerId = null,
  port = 0,
  runtimeRoot = os.tmpdir(),
  logger = createLogger(),
  mcpInternalToken = null
}) {
  ensureRuntimeBuiltins(world);
  const resolved = resolveStartupRunner(world, serverRunnerId);
  if (!resolved.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: resolved.body ?? { reason: resolved.reason }
    });
    return { ok: false, reason: resolved.reason };
  }

  const serverRunner = resolved.runner;
  const backendHost = serverRunner.backendHost;
  const frontendHost = serverRunner.frontendHost;
  if (!backendHost || !frontendHost) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, backendHost, frontendHost, reason: "server runner host bindings incomplete" }
    });
    return { ok: false, reason: "server runner host bindings incomplete" };
  }

  const backendCaps = hostCapabilities(world, backendHost);
  const frontendCaps = hostCapabilities(world, frontendHost);
  const requiredBackend = ["http.serve", "fs.json.read", "fs.json.write"];
  const requiredFrontend = ["dom.render", "http.fetch"];
  const missingBackend = requiredBackend.filter(capability => !backendCaps.has(capability));
  const missingFrontend = requiredFrontend.filter(capability => !frontendCaps.has(capability));
  if (missingBackend.length || missingFrontend.length) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, backendHost, frontendHost, missingBackend, missingFrontend }
    });
    return { ok: false, reason: "missing host capabilities" };
  }

  const storage = resolveStorageConfig(serverRunner.storage, runtimeRoot);
  const runtimeConfig = resolveRuntimeConfig(serverRunner.runtimeConfig, process.env);
  if (!runtimeConfig.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        serverRunner: serverRunner.id,
        reason: "runtime config unresolved",
        runtimeConfig: runtimeConfig.fields,
        runtimeConfigFailures: runtimeConfig.failures
      }
    });
    return { ok: false, reason: "runtime config unresolved" };
  }
  const appContext = await createAppContext({
    world,
    serverRunner,
    backendHost,
    frontendHost,
    runtimeRoot,
    storage,
    runtimeConfig,
    sendJson,
    readJson
  });
  if (!appContext.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, reason: appContext.reason, handlerSet: serverRunner.handlerSet ?? null }
    });
    return { ok: false, reason: appContext.reason };
  }

  const visibleWitnesses = appContext.visibleWitnesses ?? (() => world.allWitnesses());
  const sessionStore = new Map();
  const genericHandlers = createGenericRouteHandlers({
    world,
    backendHost,
    frontendHost,
    sessionStore,
    logger,
    mcpInternalToken
  });
  const runtimeContexts = new Map([[serverRunner.id, appContext]]);
  const mountedRoutesFor = runnerId => world.project(moduleProjectors.servedRoutes)
    .filter(route => route.serverRunner === runnerId)
    .map(route => ({ ...route, matcher: compileRouteMatcher(route.path) }));
  const bootstrapRuntime = { runner: serverRunner, context: appContext };
  const resolveActiveRuntime = async () => {
    if (!serverRunner.bootstrapOnly) return bootstrapRuntime;
    const resolvedRunner = resolveServerRunner(world, null);
    if (!resolvedRunner.ok) return bootstrapRuntime;
    const liveRunner = resolvedRunner.runner;
    if (liveRunner.id === serverRunner.id) return bootstrapRuntime;
    if (runtimeContexts.has(liveRunner.id)) {
      return { runner: liveRunner, context: runtimeContexts.get(liveRunner.id) };
    }
    const liveStorage = resolveStorageConfig(liveRunner.storage, runtimeRoot);
    const liveContext = await createAppContext({
      world,
      serverRunner: liveRunner,
      backendHost: liveRunner.backendHost,
      frontendHost: liveRunner.frontendHost,
      runtimeRoot,
      storage: liveStorage,
      runtimeConfig: resolveRuntimeConfig(liveRunner.runtimeConfig, process.env),
      sendJson,
      readJson
    });
    if (!liveContext.ok) {
      return {
        runner: liveRunner,
        context: {
          ok: false,
          reason: liveContext.reason,
          actors: actorsFromIdentities(world.project(moduleProjectors.identityIndex).rows),
          handlers: {},
          visibleWitnesses: () => world.allWitnesses()
        }
      };
    }
    runtimeContexts.set(liveRunner.id, liveContext);
    return { runner: liveRunner, context: liveContext };
  };
  const appHomeReachable = async runtime => hasReachableHomeRoute(world, mountedRoutesFor(runtime.runner.id));

  const srcDir = path.dirname(fileURLToPath(import.meta.url));
    const canvasLibFiles = new Map([
      ["projectors-core.js", path.join(srcDir, "projectors-core.js")],
      ["canvas-projection.js", path.join(srcDir, "canvas-projection.js")],
      ["eden-personal-box.js", path.join(srcDir, "eden-personal-box.js")],
      ["eden-page-theme.js", path.join(srcDir, "eden-page-theme.js")],
      ["eden-capability-install.js", path.join(srcDir, "eden-capability-install.js")],
      ["eden-academy.js", path.join(srcDir, "eden-academy.js")],
      ["eden-organization.js", path.join(srcDir, "eden-organization.js")],
      ["eden-theory.js", path.join(srcDir, "eden-theory.js")]
    ]);
  const sseClients = new Set();
  let sseLastCount = world.allWitnesses().length;
  const sseWatcher = setInterval(() => {
    const count = world.allWitnesses().length;
    if (count <= sseLastCount) return;
    const witnesses = world.allWitnesses();
    for (let index = sseLastCount; index < count; index += 1) {
      const witness = witnesses[index] ?? null;
      const frame = sseFrame(index + 1, witness);
      for (const client of sseClients) client.write(frame);
    }
    sseLastCount = count;
  }, 250);
  sseWatcher.unref();

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const runtime = await resolveActiveRuntime();
    const requestContext = resolveRequestContext(req, sessionStore, { allowActorHeader: runtime.runner.allowActorHeader === true });
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    let matchedRoute = null;
    const witnessCountBefore = world.allWitnesses().length;
    logger.info("http.request.start", { requestId, method: req.method, url: req.url, actor: requestContext.actor });
    res.on("finish", () => {
      logger.info("http.request.finish", { requestId, method: req.method, url: req.url, statusCode: res.statusCode, durationMs: Date.now() - startedAt });
    });

    try {
      if (req.method === "GET" && req.url?.startsWith("/canvas-lib/")) {
        const name = decodeURIComponent(req.url.slice("/canvas-lib/".length));
        const resolvedFile = canvasLibFiles.get(name);
        if (!resolvedFile) {
          world.observe({ process: "backend.readCanvasLib.failed", actor: backendHost, claims: [], body: { name, reason: "not in canvas-lib whitelist" } });
          sendJson(res, 404, { error: "unknown canvas-lib module", name });
          return;
        }
        const text = await fs.readFile(resolvedFile, "utf8");
        world.observe({ process: "backend.readCanvasLib", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" });
        res.end(text);
        return;
      }

      if (req.method === "GET" && req.url === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(sseFrame(world.allWitnesses().length, world.allWitnesses().at(-1) ?? null));
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        world.observe({
          process: "backend.eventsStream",
          actor: backendHost,
          claims: [relation(backendHost, "streams", "witnessLog")],
          body: { clients: sseClients.size, serverRunner: serverRunner.id }
        });
        return;
      }

      const genericEndpoint = matchGenericEndpoint(req.method || "GET", requestUrl.pathname);
      if (genericEndpoint) {
        const handler = genericHandlers[genericEndpoint.handler];
        const mounted = matchDeclaredRoute(mountedRoutesFor(runtime.runner.id), req.method || "GET", requestUrl.pathname);
        await handler({
          req,
          res,
          requestId,
          requestUrl,
          route: mounted?.route ?? null,
          params: { ...(mounted?.params ?? {}), ...(genericEndpoint.params ?? {}) },
          requestActor: requestContext.actor,
          requestIdentity: requestContext.identity,
          requestSession: requestContext.session,
          appContext: runtime.context
        });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/" && !await appHomeReachable(runtime)) {
        await genericHandlers["bootstrap.page"]({
          req,
          res,
          requestId,
          requestUrl,
          route: null,
          params: {},
          requestActor: requestContext.actor,
          requestIdentity: requestContext.identity,
          requestSession: requestContext.session,
          appContext: runtime.context
        });
        return;
      }

      const matched = matchDeclaredRoute(mountedRoutesFor(runtime.runner.id), req.method || "GET", requestUrl.pathname);
      if (!matched) {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      matchedRoute = matched.route;
      const routeHandlers = {
        ...genericHandlers,
        ...(runtime.context.handlers ?? {})
      };
      const handler = matched.route.handler ? routeHandlers[matched.route.handler] : null;
      if (!handler) {
        world.observe({
          process: "backend.route.failed",
          actor: backendHost,
          claims: [],
          body: { route: matched.route.id, method: matched.route.method, path: matched.route.path, reason: "no handler" }
        });
        sendJson(res, 500, { error: "route handler not configured", route: matched.route.id });
        return;
      }

      await handler({
        req,
        res,
        requestId,
        requestUrl,
        route: matched.route,
        params: matched.params,
        requestActor: requestContext.actor,
        requestIdentity: requestContext.identity,
        requestSession: requestContext.session,
        appContext: runtime.context
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("http.request.failed", { requestId, method: req.method, url: req.url, actor: requestContext.actor, durationMs: Date.now() - startedAt, error: err });
      world.observe({
        process: "server.request.failed",
        actor: backendHost,
        claims: [],
        body: { requestId, method: req.method, url: req.url, message, serverRunner: runtime.runner.id }
      });
      sendJson(res, 500, { error: "internal error", requestId });
    } finally {
      const emittedWitnesses = world.allWitnesses().slice(witnessCountBefore);
      const failedWitnesses = emittedWitnesses.filter(witness => witness.process.endsWith(".failed") || witness.process.endsWith(".blocked"));
      world.observe({
        process: "backend.request.finish",
        actor: requestContext.actor || backendHost,
        claims: matchedRoute ? [relation(backendHost, "handled", matchedRoute.id)] : [],
        body: {
          requestId,
          method: req.method || "GET",
          url: req.url || "/",
          statusCode: res.statusCode || 0,
          durationMs: Date.now() - startedAt,
          route: matchedRoute?.id ?? null,
          handler: matchedRoute?.handler ?? null,
          runId: headerValue(req.headers["x-witness-process-run"]),
          stepId: headerValue(req.headers["x-witness-step-id"]),
          emittedWitnessIds: emittedWitnesses.map(witness => witness.id),
          failureWitnessIds: failedWitnesses.map(witness => witness.id)
        }
      });
    }
  });

  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  world.emit({
    process: "server.start",
    actor,
    claims: [
      relation(backendHost, "serves", serverRunner.id),
      relation(frontendHost, "renders", serverRunner.id),
      ...mountedRoutesFor(serverRunner.id).map(route => relation(serverRunner.id, "serves", route.id))
    ],
    body: {
      url,
      serverRunner: serverRunner.id,
      backendHost,
      frontendHost,
      handlerSet: serverRunner.handlerSet ?? null,
      actors: appContext.actors,
      storage,
      routeCount: mountedRoutesFor(serverRunner.id).length
    }
  });

  return {
    ok: true,
    url,
    close: () => {
      clearInterval(sseWatcher);
      for (const client of sseClients) client.end();
      sseClients.clear();
      for (const context of new Set(runtimeContexts.values())) context?.close?.();
      server.closeAllConnections?.();
      return new Promise(resolve => server.close(resolve));
    }
  };
}

async function createAppContext({
  world,
  serverRunner,
  backendHost,
  frontendHost,
  runtimeRoot,
  storage,
  runtimeConfig,
  sendJson,
  readJson
}) {
  if (runtimeConfig && runtimeConfig.ok === false) {
    return { ok: false, reason: "runtime config unresolved", runtimeConfigFailures: runtimeConfig.failures ?? [] };
  }
  const identityIndex = world.project(moduleProjectors.identityIndex);
  const actors = Array.isArray(serverRunner.actors) && serverRunner.actors.length
    ? [...serverRunner.actors]
    : actorsFromIdentities(identityIndex.rows);
  let appContext;
  if (!serverRunner.handlerSet) {
    appContext = {
      ok: true,
      actors,
      identityIndex,
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
    const factory = HANDLER_SET_FACTORIES[serverRunner.handlerSet];
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
      identityIndex,
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

function parseStreamFailureLimit(value) {
  const raw = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : null;
}

async function streamReadableToFile(source, targetPath, { failAfterBytes = null } = {}) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.part-${randomUUID()}`;
  let sizeBytes = 0;
  let chunkCount = 0;
  let maxChunkBytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += buffer.length;
      chunkCount += 1;
      if (buffer.length > maxChunkBytes) maxChunkBytes = buffer.length;
      if (failAfterBytes != null && sizeBytes > failAfterBytes) {
        callback(new Error("stream failure injected"));
        return;
      }
      callback(null, buffer);
    }
  });
  const sink = createWriteStream(tempPath);
  let drainCount = 0;
  sink.on("drain", () => {
    drainCount += 1;
  });
  try {
    await streamPipeline(source, limiter, sink);
    await fs.rm(targetPath, { force: true }).catch(() => {});
    await fs.rename(tempPath, targetPath);
    return {
      sizeBytes,
      chunkCount,
      maxChunkBytes,
      drainCount,
      writeHighWaterMarkBytes: Number.isFinite(sink.writableHighWaterMark) ? sink.writableHighWaterMark : null
    };
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function streamFileToFile(sourcePath, targetPath, { failAfterBytes = null } = {}) {
  return streamReadableToFile(createReadStream(sourcePath), targetPath, { failAfterBytes });
}

function assetUploadFieldValue(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function multipartFileFromFormData(formData) {
  const preferred = formData.get("file");
  if (preferred && typeof preferred === "object" && typeof preferred.stream === "function") return preferred;
  for (const value of formData.values()) {
    if (value && typeof value === "object" && typeof value.stream === "function") return value;
  }
  return null;
}

async function parseMultipartAssetUpload(req) {
  const contentType = headerValue(req.headers["content-type"]);
  const request = new Request("http://local.test/api/assets", {
    method: "POST",
    headers: { "content-type": contentType },
    body: req,
    duplex: "half"
  });
  let formData = null;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, status: 400, reason: "invalid multipart upload body" };
  }
  const file = multipartFileFromFormData(formData);
  if (!file) {
    return { ok: false, status: 400, reason: "multipart upload requires a file part" };
  }
  return {
    ok: true,
    uploadKind: "multipart",
    source: Readable.fromWeb(file.stream()),
    originalName: typeof file.name === "string" ? file.name.trim() : "",
    mimeType: typeof file.type === "string" && file.type.trim() ? file.type.trim() : "application/octet-stream",
    declaredSizeBytes: Number.isFinite(file.size) ? file.size : null,
    perspectiveId: assetUploadFieldValue(formData, "perspective"),
    explicitContextId: assetUploadFieldValue(formData, "dropContext"),
    visibilityRaw: assetUploadFieldValue(formData, "visibility")
  };
}

function parseRawAssetUpload(req, requestUrl) {
  const rawDeclaredSize = Number.parseInt(headerValue(req.headers["x-witness-file-size"]).trim(), 10);
  return {
    ok: true,
    uploadKind: "raw",
    source: req,
    originalName: headerValue(req.headers["x-witness-file-name"]).trim(),
    mimeType: headerValue(req.headers["content-type"]).split(";")[0].trim(),
    declaredSizeBytes: Number.isFinite(rawDeclaredSize) && rawDeclaredSize >= 0 ? rawDeclaredSize : null,
    perspectiveId: requestUrl.searchParams.get("perspective") || "",
    explicitContextId: headerValue(req.headers["x-witness-drop-context"]).trim(),
    visibilityRaw: headerValue(req.headers["x-witness-visibility"]).trim()
  };
}

function assetDownloadUrl(contentUrl) {
  if (typeof contentUrl !== "string" || !contentUrl) return null;
  return contentUrl.includes("?") ? `${contentUrl}&download=1` : `${contentUrl}?download=1`;
}

function createGenericRouteHandlers({
  world,
  backendHost,
  frontendHost,
  sessionStore,
  logger,
  mcpInternalToken = null
}) {
  const currentIdentityIndex = () => world.project(moduleProjectors.identityIndex);
  const requestVisibleWitnesses = (requestActor, appContext) => {
    const projector = appContext?.visibleWitnesses ?? (() => world.allWitnesses());
    return projector(requestActor);
  };
  const requestActors = appContext => appContext?.actors ?? [];
  const currentMcpServerIndex = () => world.project(moduleProjectors.mcpServerIndex);
  const currentMcpToolInstalls = () => world.project(moduleProjectors.mcpToolInstalls);
  const currentBackendCapabilities = () => hostCapabilities(world, backendHost);
  const scopeContextForTarget = targetId => {
    if (!targetId) return null;
    const moduleKind = world.project(moduleProjectors.modules).get(targetId) ?? null;
    if (moduleKind === "context") return targetId;
    return world.project(moduleProjectors.objectContexts).get(targetId) ?? null;
  };
  let handlers = null;
  const encodeQuery = query => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value == null || value === "") continue;
      params.set(key, String(value));
    }
    const encoded = params.toString();
    return encoded ? `?${encoded}` : "";
  };
  const invokeRouteHandler = async ({
    handler,
    method = "GET",
    path: requestPath,
    query = {},
    params = {},
    body = null,
    rawBody = null,
    headers = {},
    requestActor = null,
    requestIdentity = null,
    requestSession = null,
    appContext = null,
    route = null
  }) => {
    const requestBody = rawBody ?? (body == null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)));
    const inferredContentType = body != null && rawBody == null ? "application/json" : "application/octet-stream";
    const req = Readable.from(requestBody.length ? [requestBody] : []);
    req.method = method;
    req.url = `${requestPath}${encodeQuery(query)}`;
    req.headers = Object.fromEntries(
      Object.entries({
        ...(requestBody.length ? { "content-type": inferredContentType, "content-length": String(requestBody.length) } : {}),
        ...headers
      }).map(([key, value]) => [String(key).toLowerCase(), value])
    );
    const chunks = [];
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(status, nextHeaders = {}) {
        this.statusCode = status;
        this.headers = { ...this.headers, ...nextHeaders };
      },
      write(chunk) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end(chunk) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    };
    const handlerFn = handlers?.[handler] || appContext?.handlers?.[handler];
    if (!handlerFn) {
      return {
        status: 500,
        body: { error: "route handler not configured", handler },
        headers: { "content-type": "application/json" },
        buffer: Buffer.from(JSON.stringify({ error: "route handler not configured", handler })),
        contentType: "application/json"
      };
    }
    await handlerFn({
      req,
      res,
      requestId: `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      requestUrl: new URL(req.url, "http://127.0.0.1"),
      route,
      params,
      requestActor,
      requestIdentity,
      requestSession,
      appContext
    });
    const buffer = Buffer.concat(chunks);
    const responseHeaders = Object.fromEntries(Object.entries(res.headers).map(([key, value]) => [String(key).toLowerCase(), value]));
    const contentType = String(responseHeaders["content-type"] || "");
    if (contentType.includes("application/json")) {
      let parsed = {};
      try {
        parsed = buffer.length ? JSON.parse(buffer.toString("utf8")) : {};
      } catch {
        parsed = { raw: buffer.toString("utf8") };
      }
      return { status: res.statusCode, body: parsed, headers: responseHeaders, buffer, contentType };
    }
    return { status: res.statusCode, body: null, headers: responseHeaders, buffer, contentType };
  };
  const isLoopbackOriginHost = host => {
    const normalized = String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
  };
  const validateMcpOrigin = req => {
    const origin = headerValue(req?.headers?.origin).trim();
    if (!origin) return { ok: true };
    try {
      const parsed = new URL(origin);
      const requestHost = headerValue(req?.headers?.host).trim().toLowerCase();
      if (parsed.host.toLowerCase() === requestHost) return { ok: true };
      if (isLoopbackOriginHost(parsed.hostname)) return { ok: true };
      return { ok: false, reason: "origin not allowed for local mcp endpoint" };
    } catch {
      return { ok: false, reason: "origin not allowed for local mcp endpoint" };
    }
  };
  const mcpToolAvailable = toolName => {
    const capabilities = currentBackendCapabilities();
    switch (toolName) {
      case "storage.blob":
        return capabilities.has("fs.blob");
      case "storage.stream":
        return capabilities.has("fs.stream");
      case "asset.manage":
        return capabilities.has("upload.asset");
      case "db.sql":
        return capabilities.has("db.sql");
      case "search.index":
        return capabilities.has("search.index");
      case "jobs.queue":
        return capabilities.has("jobs.queue");
      case "http.outbound":
        return capabilities.has("http.outbound");
      case "webhook.inbound":
        return capabilities.has("webhook.inbound");
      case "notifications":
        return capabilities.has("jobs.queue") && (capabilities.has("notify.email") || capabilities.has("notify.sms"));
      default:
        return true;
    }
  };
  const resolveMcpPrincipal = ({ req, requestActor, mcpServer, appContext }) => {
    const transport = String(headerValue(req?.headers?.["x-witness-mcp-transport"]) || "http").trim().toLowerCase();
    const overrideToken = headerValue(req?.headers?.["x-witness-mcp-internal-token"]).trim();
    const overrideActor = headerValue(req?.headers?.["x-witness-mcp-actor"]).trim() || null;
    const bearer = headerValue(req?.headers?.authorization).trim();
    const serviceToken = runtimeConfigLookup(appContext?.runtimeConfig ?? {}, `mcp.${mcpServer.id}.token`);
    const validServiceToken = typeof serviceToken === "string" && serviceToken.trim()
      ? bearer === `Bearer ${serviceToken.trim()}`
      : false;
    if (transport === "stdio" && overrideActor && (!mcpInternalToken || overrideToken === mcpInternalToken)) {
      return { ok: true, actingMode: "delegated", actor: overrideActor, transport };
    }
    if (transport === "stdio" && mcpServer.serviceIdentity) {
      return { ok: true, actingMode: "service", actor: mcpServer.serviceIdentity, transport };
    }
    if (validServiceToken) {
      if (!mcpServer.serviceIdentity) return { ok: false, status: 403, reason: "mcp server has no service identity", transport };
      return { ok: true, actingMode: "service", actor: mcpServer.serviceIdentity, transport };
    }
    if (requestActor) return { ok: true, actingMode: "delegated", actor: requestActor, transport };
    return { ok: true, actingMode: null, actor: null, transport };
  };
  const mcpScopeAllows = (install, args, appContext) => {
    if ((!install.scopeContexts || !install.scopeContexts.length) && (!install.scopeTargets || !install.scopeTargets.length)) {
      return { ok: true, reason: null };
    }
    const scope = resolveMcpToolScope(install.tool, args ?? {}, appContext);
    const contextIds = new Set(scope.contextIds ?? []);
    const targetIds = new Set(scope.targetIds ?? []);
    for (const targetId of targetIds) {
      const contextId = scopeContextForTarget(targetId);
      if (contextId) contextIds.add(contextId);
    }
    if (install.scopeTargets.length && !install.scopeTargets.some(targetId => targetIds.has(targetId))) {
      return { ok: false, reason: "tool call is outside installed mcp target scope" };
    }
    if (install.scopeContexts.length && !install.scopeContexts.some(contextId => contextIds.has(contextId))) {
      return { ok: false, reason: "tool call is outside installed mcp context scope" };
    }
    return { ok: true, reason: null };
  };
  const recentWitnessBodies = process => world.allWitnesses()
    .filter(witness => witness.process === process)
    .slice(-20)
    .reverse()
    .map(witness => ({ id: witness.id, actor: witness.actor, body: witness.body ?? {} }));
  const processViewInputs = (requestActor, appContext) => {
    const witnesses = requestVisibleWitnesses(requestActor, appContext);
    const visibleIds = new Set(witnesses.map(witness => witness.id));
    const observations = world.allObservations()
      .filter(observation => observation.process === "backend.request.finish")
      .map(observation => ({
        ...observation,
        body: {
          ...(observation.body ?? {}),
          emittedWitnessIds: (observation.body?.emittedWitnessIds ?? []).filter(id => visibleIds.has(id)),
          failureWitnessIds: (observation.body?.failureWitnessIds ?? []).filter(id => visibleIds.has(id))
        }
      }));
    return { witnesses, observations };
  };
  const processSelection = requestUrl => ({
    program: requestUrl.searchParams.get("program") || null,
    event: requestUrl.searchParams.get("event") || null,
    runId: requestUrl.searchParams.get("runId") || null,
    nodeId: requestUrl.searchParams.get("node") || null,
    replay: requestUrl.searchParams.get("replay")
  });
  const supportedHandlerSets = Object.keys(HANDLER_SET_DEFINITIONS);
  const supportedHandlers = [
    "session.read",
    "session.open",
    "session.logout",
    "auth.oauth.start",
    "auth.oauth.callback",
    "auth.oauth.links.list",
    "auth.oauth.links.read",
    "runtimeConfig.read",
    "db.sql.inspect",
    "db.sql.migrate",
    "db.sql.query",
    "db.sql.command",
    "db.sql.transaction",
    "search.index.inspect",
    "search.index.build",
    "search.index.reindex",
    "search.index.query",
    "http.outbound.send",
    "http.outbound.list",
    "http.outbound.read",
    "webhook.inbound.receive",
    "webhook.inbound.list",
    "webhook.inbound.read",
    "widgetVersions.activate",
    "widgetVersions.rollback",
    "edenAcademy.read",
    "edenOrganization.read",
    "edenOrganization.createContext",
    "edenOrganization.grantStewardship",
    "edenOrganization.createProposal",
    "edenOrganization.approveProposal",
    "edenTheory.read",
    "edenTheory.study",
    "edenTheory.assess",
    "edenTheory.teachBack",
    "edenCapabilityInstall.read",
    "edenCapabilityInstall.install",
    "edenVersions.read",
    "edenVersions.activate",
    "edenVersions.rollback",
    "edenVersions.publish",
    "backendSeams.read",
    "page.home",
    "page.world",
    "page.process",
    "page.canvas",
    "page.backendSeams",
    "page.edenCanvas",
    "witnesses.list",
    "fs.blob.list",
    "fs.blob.meta",
    "fs.blob.read",
    "fs.blob.write",
    "fs.blob.delete",
    "fs.stream.read",
    "fs.stream.write",
    "fs.stream.copy",
    "worldGraph.read",
    "processView.read",
    "processRun.read",
    "processEvents.record",
    "source.read",
    "asset.ingest.retry",
    "asset.search.reindex",
    "asset.attachments.list",
    "asset.attach",
    "asset.detach",
    "canvas.perspectives.list",
    "canvas.read",
    "canvas.process",
    "mcpServer.create",
    "mcpTool.install",
    "mcpTool.remove",
    "mcp.http",
    ...supportedHandlerSets.flatMap(id => HANDLER_SET_DEFINITIONS[id]?.handlers ?? [])
  ];
  const backendHosts = hostIdsByCapability(world, "http.serve");
  const frontendHosts = hostIdsByCapability(world, "dom.render");
  const bootstrapAuthAllowed = () => currentIdentityIndex().rows.length === 0;
  const requireBootstrapActor = requestActor => {
    if (requestActor) return { ok: true, actor: requestActor, bootstrapException: false };
    if (bootstrapAuthAllowed()) return { ok: true, actor: backendHost, bootstrapException: true };
    return { ok: false, status: 401, reason: "sign in to edit bootstrap state" };
  };
  const ensureContextAuthority = (actor, contextId) => contextId ? canCreateInContext(world, actor, contextId) : { ok: true, status: 200, reason: null };
  const ensureTargetAuthority = (actor, targetId) => canMutateTarget(world, actor, targetId);
  const ensureIdentityAuthority = (actor, identityId) => {
    if (!actor) return { ok: false, status: 401, reason: "sign in to edit bootstrap state" };
    const identity = currentIdentityIndex().byId[identityId] ?? null;
    if (!identity) return { ok: false, status: 404, reason: "identity not found" };
    if (identity.actor === actor) return { ok: true, status: 200, reason: null };
    return canMutateTarget(world, actor, identityId);
  };
  const sendGateFailure = (res, gate) => sendJson(res, gate.status || 403, { error: gate.reason || "forbidden" });
  const requireBackendCapabilities = capabilities => {
    const available = hostCapabilities(world, backendHost);
    const missing = capabilities.filter(capability => !available.has(capability));
    if (!missing.length) return { ok: true, status: 200, reason: null };
    return { ok: false, status: 503, reason: "missing backend capabilities", missing };
  };
  const assetContentUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/content`;
  const assetTextUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/text`;
  const assetThumbnailUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/thumbnail`;
  const assetIngestRetryUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/ingest/retry`;
  const assetSearchReindexUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/search/reindex`;
  const assetStorageKey = assetId => `${assetId}/blob`;
  const assetThumbnailStorageKey = assetId => assetDerivedThumbnailStorageKey(assetId);
  const assetsRootFor = appContext => appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
  const assetPathFor = (appContext, assetId) => path.join(assetsRootFor(appContext), encodeURIComponent(assetId), "blob");
  const assetThumbnailPathFor = (appContext, assetId) => assetDerivedThumbnailPathForAppContext(appContext, assetId);
  const blobsRootFor = appContext => appContext?.storage?.blobsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "blobs");
  const filesContextIdFor = homeContext => `context:${homeContext}:files`;
  const currentAssetById = assetId => world.project(moduleProjectors.assetIndex).byId[assetId] ?? null;
  const ensureReadableAssetAccess = (asset, requestActor) => {
    const isPublic = asset?.visibility === "public";
    if (isPublic) return { ok: true, status: 200, isPublic: true };
    if (!requestActor) return { ok: false, status: 401, reason: "sign in first", observeActor: backendHost, isPublic: false };
    const gate = canMutateTarget(world, requestActor, asset.id);
    if (!gate.ok) return { ok: false, status: gate.status || 403, reason: gate.reason || "forbidden", observeActor: requestActor, isPublic: false };
    return { ok: true, status: 200, isPublic: false };
  };
  const currentThingIds = () => world.project(projectors.things);
  const currentThingExists = thingId => currentThingIds().has(thingId);
  const currentThingKind = thingId => world.project(moduleProjectors.modules).get(thingId) ?? null;
  const currentThingTitle = thingId => world.project(projectors.currentRelations)
    .find(row => row.from === thingId && row.rel === "hasTitle")
    ?.to ?? thingId;
  const currentThingContext = thingId => world.project(moduleProjectors.objectContexts).get(thingId) ?? null;
  const attachmentTargetsForAsset = assetId => world.project(projectors.currentRelations)
    .filter(row => row.rel === "attachedAsset" && row.to === assetId)
    .map(row => ({
      id: row.from,
      title: currentThingTitle(row.from),
      kind: currentThingKind(row.from),
      context: currentThingContext(row.from)
    }))
    .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));
  const assetAttachedToTarget = (assetId, targetId) => world.project(projectors.currentRelations)
    .some(row => row.from === targetId && row.rel === "attachedAsset" && row.to === assetId);
  const currentNotificationById = notificationId => world.project(moduleProjectors.notificationIndex).byId[notificationId] ?? null;
  const currentOutboundById = outboundId => world.project(moduleProjectors.outboundRequestIndex).byId[outboundId] ?? null;
  const currentWebhookById = webhookIdValue => world.project(moduleProjectors.webhookDeliveryIndex).byId[webhookIdValue] ?? null;
  const currentDbSqlDatasourceById = datasourceId => world.project(moduleProjectors.sqlDatasourceIndex).byId[datasourceId] ?? null;
  const currentDbSqlOperationById = operationId => world.project(moduleProjectors.sqlOperationIndex).byId[operationId] ?? null;
  const currentPerspectiveById = perspectiveId => world.project(moduleProjectors.perspectives).find(row => row.id === perspectiveId) ?? null;
  const notificationsForRunner = serverRunnerId => world.project(moduleProjectors.notifications)
    .filter(row => row.jobId == null || ((world.project(moduleProjectors.jobIndex).byId[row.jobId] ?? null)?.serverRunner === serverRunnerId));
  const currentNotificationForRunner = (serverRunnerId, notificationId) => notificationsForRunner(serverRunnerId)
    .find(row => row.id === notificationId) ?? null;
  const outboundRequestsForRunner = serverRunnerId => world.project(moduleProjectors.outboundRequests)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentOutboundForRunner = (serverRunnerId, outboundId) => outboundRequestsForRunner(serverRunnerId)
    .find(row => row.id === outboundId) ?? null;
  const webhookDeliveriesForRunner = serverRunnerId => world.project(moduleProjectors.webhookDeliveries)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentWebhookForRunner = (serverRunnerId, webhookIdValue) => webhookDeliveriesForRunner(serverRunnerId)
    .find(row => row.id === webhookIdValue) ?? null;
  const sqlDatasourcesForRunner = serverRunnerId => world.project(moduleProjectors.sqlDatasources)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentSqlDatasourceForRunner = (serverRunnerId, datasourceId) => sqlDatasourcesForRunner(serverRunnerId)
    .find(row => row.id === datasourceId) ?? null;
  const sqlOperationsForRunner = serverRunnerId => world.project(moduleProjectors.sqlOperations)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentSqlOperationForRunner = (serverRunnerId, operationId) => sqlOperationsForRunner(serverRunnerId)
    .find(row => row.id === operationId) ?? null;
  const searchIndexesForRunner = serverRunnerId => world.project(moduleProjectors.searchIndexes)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentSearchIndexForRunner = (serverRunnerId, indexId) => searchIndexesForRunner(serverRunnerId)
    .find(row => row.id === indexId) ?? null;
  const oauthFlowsForRunner = serverRunnerId => world.project(moduleProjectors.oauthFlows)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentOauthFlowForRunner = (serverRunnerId, flowId) => oauthFlowsForRunner(serverRunnerId)
    .find(row => row.id === flowId) ?? null;
  const oauthLinksForRunner = serverRunnerId => world.project(moduleProjectors.oauthLinks)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentOauthLinkForRunner = (serverRunnerId, linkId) => oauthLinksForRunner(serverRunnerId)
    .find(row => row.id === linkId) ?? null;
  const currentOauthLinkByProviderAccount = (serverRunnerId, provider, providerAccountId) => oauthLinksForRunner(serverRunnerId)
    .find(row => row.provider === provider && row.providerAccountId === providerAccountId) ?? null;
  const authOAuthFlowId = () => `oauthFlow:${randomUUID()}`;
  const authOAuthLinkId = (provider, providerAccountId) => `oauthLink:${encodeURIComponent(provider)}:${encodeURIComponent(providerAccountId)}`;
  const authOAuthFlowTitle = ({ provider, action, providerAccountId = null }) => `${provider} OAuth ${action}${providerAccountId ? ` ${providerAccountId}` : ""}`;
  const authOAuthLinkTitle = ({ provider, providerAccountId, label = null }) => label ? `${provider} ${label}` : `${provider} account ${providerAccountId}`;
  const authOAuthReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    identity: row.identity,
    actor: row.actor,
    label: row.label,
    status: row.status,
    createdIdentity: row.createdIdentity,
    lastError: row.lastError
  });
  const sanitizeAuthOauthSegment = value => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || "user";
  };
  const authOAuthCallbackBaseUrl = (req, appContext) => {
    const configured = runtimeConfigLookup(appContext?.runtimeConfig ?? {}, "auth.oauth.callbackBaseUrl");
    if (typeof configured === "string" && configured.trim()) return configured.replace(/\/+$/, "");
    const host = headerValue(req.headers.host) || "127.0.0.1";
    return `http://${host}/api/oauth/callback`;
  };
  const normalizeAuthOAuthConfig = ({ runtimeConfig, requestedProvider = null }) => {
    const configuredProviderRaw = runtimeConfigLookup(runtimeConfig ?? {}, "auth.oauth.provider");
    const configuredProvider = typeof configuredProviderRaw === "string" ? configuredProviderRaw.trim() : "";
    const provider = requestedProvider || configuredProvider;
    if (!provider) return { ok: false, status: 503, reason: "auth.oauth.provider not configured" };
    if (configuredProvider && requestedProvider && configuredProvider !== requestedProvider) {
      return { ok: false, status: 409, reason: `auth.oauth provider mismatch: configured ${configuredProvider}, requested ${requestedProvider}` };
    }
    if (provider !== "stub") return { ok: false, status: 501, reason: `${provider} oauth adapter not implemented` };
    const autoCreateRaw = runtimeConfigLookup(runtimeConfig ?? {}, "auth.oauth.autoCreate");
    return {
      ok: true,
      status: 200,
      provider,
      autoCreate: autoCreateRaw == null ? true : autoCreateRaw === true || String(autoCreateRaw).trim().toLowerCase() === "true"
    };
  };
  const normalizeAuthOAuthProfile = profile => {
    const object = profile && typeof profile === "object" ? profile : {};
    const externalId = typeof object.externalId === "string" && object.externalId.trim()
      ? object.externalId.trim()
      : "stub-user";
    const actor = typeof object.actor === "string" && object.actor.trim()
      ? object.actor.trim()
      : sanitizeAuthOauthSegment(typeof object.username === "string" && object.username.trim() ? object.username : externalId);
    const username = typeof object.username === "string" && object.username.trim()
      ? object.username.trim()
      : actor;
    const label = typeof object.label === "string" && object.label.trim()
      ? object.label.trim()
      : `Stub ${username}`;
    return { externalId, actor, username, label };
  };
  const createSessionForIdentity = identity => {
    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      identity: identity.id,
      actor: identity.actor,
      label: identity.label,
      homeContext: identity.homeContext ?? null,
      perspective: identity.homePerspective ?? null,
      tutorialProgress: {}
    };
    sessionStore.set(sessionId, session);
    return session;
  };
  const sessionResponseShape = session => ({
    authenticated: true,
    identity: session.identity,
    actor: session.actor,
    label: session.label,
    homeContext: session.homeContext ?? null,
    perspective: session.perspective ?? null
  });
  const syncSessionIdentity = (requestSession, identity) => {
    if (!requestSession?.id || !identity || requestSession.identity !== identity.id) return requestSession ?? null;
    const nextSession = {
      ...requestSession,
      actor: identity.actor,
      label: identity.label,
      homeContext: identity.homeContext ?? null,
      perspective: identity.homePerspective ?? null
    };
    sessionStore.set(nextSession.id, nextSession);
    return nextSession;
  };
  const emitAuthOauthFlow = ({ actor, flow, process, reason = null, providerAccountId = null, identity = null, createdIdentity = false }) => world.emit({
    process,
    actor,
    claims: [
      thing(flow.id),
      relation(flow.id, "hasModuleKind", "oauthFlow"),
      relation(backendHost, "owns", flow.id),
      relation(flow.id, "hasTitle", authOAuthFlowTitle({ provider: flow.provider, action: flow.action, providerAccountId })),
      ...(identity ? [relation(flow.id, "resolvedIdentity", identity)] : [])
    ],
    body: {
      id: flow.id,
      serverRunner: flow.serverRunner,
      provider: flow.provider,
      state: flow.state,
      action: flow.action,
      requestedIdentity: flow.requestedIdentity ?? null,
      callbackUrl: flow.callbackUrl,
      authorizeUrl: flow.authorizeUrl,
      ...(providerAccountId ? { providerAccountId } : {}),
      ...(identity ? { identity } : {}),
      ...(createdIdentity ? { createdIdentity: true } : {}),
      ...(reason ? { reason } : {})
    }
  });
  const emitAuthOauthLink = ({ actor, flow, identity, profile, createdIdentity = false, process = "auth.oauth.link", reason = null }) => {
    const linkId = authOAuthLinkId(flow.provider, profile.externalId);
    world.emit({
      process,
      actor,
      claims: [
        thing(linkId),
        relation(linkId, "hasModuleKind", "oauthLink"),
        relation(backendHost, "owns", linkId),
        relation(linkId, "hasTitle", authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity?.label ?? profile.label })),
        ...(identity?.id ? [relation(linkId, "linksIdentity", identity.id)] : [])
      ],
      body: {
        id: flow.id,
        linkId,
        serverRunner: flow.serverRunner,
        provider: flow.provider,
        providerAccountId: profile.externalId,
        identity: identity?.id ?? null,
        actor: identity?.actor ?? null,
        label: identity?.label ?? profile.label,
        createdIdentity,
        ...(reason ? { reason } : {})
      }
    });
    return linkId;
  };
  const emitAuthOauthSession = ({ actor, flow, identity, session, createdIdentity = false, process = "auth.oauth.session", reason = null }) => world.emit({
    process,
    actor,
    claims: [
      ...(identity?.id ? [relation(identity.id, "authenticatedAs", identity.actor)] : []),
      ...(identity?.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
    ],
    body: {
      id: flow.id,
      serverRunner: flow.serverRunner,
      provider: flow.provider,
      identity: identity?.id ?? null,
      actor: identity?.actor ?? null,
      sessionId: session?.id ?? null,
      createdIdentity,
      ...(reason ? { reason } : {})
    }
  });
  const notificationReadShape = row => ({
    id: row.id,
    title: row.title,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    sender: row.sender,
    preview: row.preview,
    transport: row.transport,
    status: row.status,
    context: row.context,
    jobId: row.jobId,
    providerMessageId: row.providerMessageId,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    retryDelayMs: row.retryDelayMs,
    lastError: row.lastError
  });
  const outboundReadShape = row => ({
    id: row.id,
    title: row.title,
    target: row.target,
    url: row.url,
    method: row.method,
    transport: row.transport,
    status: row.status,
    context: row.context,
    serverRunner: row.serverRunner,
    authKind: row.authKind,
    authConfigKey: row.authConfigKey,
    requestHeaderNames: row.requestHeaderNames,
    requestBodyKind: row.requestBodyKind,
    timeoutMs: row.timeoutMs,
    maxAttempts: row.maxAttempts,
    retryDelayMs: row.retryDelayMs,
    attempt: row.attempt,
    correlationId: row.correlationId,
    externalRefId: row.externalRefId,
    responseStatus: row.responseStatus,
    responseContentType: row.responseContentType,
    lastError: row.lastError
  });
  const webhookReadShape = row => ({
    id: row.id,
    title: row.title,
    target: row.target,
    deliveryId: row.deliveryId,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    status: row.status,
    signatureStatus: row.signatureStatus,
    replayStatus: row.replayStatus,
    receivedAt: row.receivedAt,
    timestamp: row.timestamp,
    correlationId: row.correlationId,
    context: row.context,
    serverRunner: row.serverRunner,
    jobId: row.jobId,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    retryDelayMs: row.retryDelayMs,
    lastError: row.lastError
  });
  const dbSqlDatasourceReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    provider: row.provider,
    datasourceName: row.datasourceName,
    migrationTable: row.migrationTable,
    status: row.status,
    path: row.path,
    adapterStatus: row.adapterStatus,
    lastError: row.lastError,
    operationCount: row.operationCount
  });
  const dbSqlOperationReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    datasourceId: row.datasourceId,
    datasourceName: row.datasourceName,
    provider: row.provider,
    kind: row.kind,
    status: row.status,
    rowCount: row.rowCount,
    changes: row.changes,
    lastInsertRowid: row.lastInsertRowid,
    migrationCount: row.migrationCount,
    skippedCount: row.skippedCount,
    stepCount: row.stepCount,
    lastError: row.lastError
  });
  const searchIndexReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    provider: row.provider,
    name: row.name,
    status: row.status,
    sourceCount: row.sourceCount,
    documentCount: row.documentCount,
    assetCount: row.assetCount,
    queryCount: row.queryCount,
    lastBuiltAt: row.lastBuiltAt,
    lastQueryAt: row.lastQueryAt,
    path: row.path,
    lastError: row.lastError
  });
  const emitDbSqlDatasourceResolve = ({ actor, datasource, ok, reason = null }) => world.emit({
    process: ok ? "db.sql.datasource.resolve" : "db.sql.datasource.resolve.failed",
    actor,
    claims: [
      thing(datasource.id),
      relation(datasource.id, "hasModuleKind", "sqlDatasource"),
      relation(backendHost, "owns", datasource.id),
      relation(datasource.id, "hasTitle", datasource.title)
    ],
    body: {
      id: datasource.id,
      serverRunner: datasource.serverRunner,
      provider: datasource.provider,
      datasourceName: datasource.datasourceName,
      migrationTable: datasource.migrationTable,
      path: datasource.path,
      adapterStatus: datasource.adapterStatus,
      status: ok ? datasource.status : (datasource.status || "failed"),
      ...(reason ? { reason } : {}),
      ...(datasource.lastError ? { lastError: datasource.lastError } : {})
    }
  });
  const emitDbSqlOperation = ({ actor, kind, operationId, title, datasource, ok, body }) => world.emit({
    process: ok ? `db.sql.${kind}` : `db.sql.${kind}.failed`,
    actor,
    claims: [
      thing(operationId),
      relation(operationId, "hasModuleKind", "sqlOperation"),
      relation(actor, "owns", operationId),
      relation(operationId, "hasTitle", title),
      relation(operationId, "usesDatasource", datasource.id)
    ],
    body: {
      id: operationId,
      serverRunner: datasource.serverRunner,
      datasourceId: datasource.id,
      datasourceName: datasource.datasourceName,
      provider: datasource.provider,
      kind,
      ...body
    }
  });
  const emitSearchIndexEvent = ({ actor, process, index, body = {} }) => world.emit({
    process,
    actor,
    claims: [
      thing(index.id),
      relation(index.id, "hasModuleKind", "searchIndex"),
      relation(actor, "owns", index.id),
      relation(index.id, "hasTitle", index.title)
    ],
    body: {
      id: index.id,
      serverRunner: index.serverRunner,
      provider: index.provider,
      name: index.name,
      ...body
    }
  });
  const normalizeNotificationRequest = ({ channel, body, actor, serverRunnerId }) => {
    const recipient = typeof body?.to === "string" ? body.to.trim() : "";
    if (!recipient) return { ok: false, status: 400, reason: "recipient required" };
    const subject = channel === "email"
      ? (typeof body?.subject === "string" ? body.subject.trim() : "")
      : null;
    if (channel === "email" && !subject) return { ok: false, status: 400, reason: "subject required" };
    const hasText = typeof body?.text === "string";
    const hasTemplate = typeof body?.template === "string" && body.template.trim();
    if (!hasText && !hasTemplate) return { ok: false, status: 400, reason: "text or template required" };
    if (hasText && hasTemplate) return { ok: false, status: 400, reason: "choose text or template" };
    const vars = body?.vars && typeof body.vars === "object" && !Array.isArray(body.vars) ? { ...body.vars } : {};
    const contextId = typeof body?.context === "string" && body.context.trim() ? body.context.trim() : null;
    if (contextId) {
      const gate = canCreateInContext(world, actor, contextId);
      if (!gate.ok) return gate;
    }
    return {
      ok: true,
      notification: {
        id: notificationId(),
        channel,
        actor,
        serverRunner: serverRunnerId,
        context: contextId,
        to: recipient,
        subject,
        text: hasText ? String(body.text) : null,
        template: hasTemplate ? String(body.template) : null,
        vars,
        delayMs: nonNegativeInteger(body?.delayMs, 0),
        maxAttempts: positiveInteger(body?.maxAttempts, 3),
        retryDelayMs: positiveInteger(body?.retryDelayMs, 50),
        idempotencyKey: typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : null
      }
    };
  };
  const normalizeOutboundRequest = ({ body, actor, appContext, serverRunnerId }) => {
    const target = typeof body?.target === "string" ? body.target.trim() : "";
    if (!target) return { ok: false, status: 400, reason: "target required" };
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return { ok: false, status: 400, reason: "url required" };
    let parsedUrl = null;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { ok: false, status: 400, reason: "url must be absolute" };
    }
    if (!["http:", "https:", "stub:"].includes(parsedUrl.protocol)) {
      return { ok: false, status: 400, reason: "url protocol must be http, https, or stub" };
    }
    const method = typeof body?.method === "string" && body.method.trim()
      ? body.method.trim().toUpperCase()
      : "POST";
    if (!/^[A-Z]+$/.test(method)) return { ok: false, status: 400, reason: "method must be a token" };
    const headerMap = normalizeHeaderMap(body?.headers);
    if (!headerMap.ok) return { ok: false, status: 400, reason: headerMap.reason };
    const bodyKind = outboundBodyKind(body);
    if (bodyKind === "json" && typeof body?.text === "string") {
      return { ok: false, status: 400, reason: "choose json or text" };
    }
    let bodyText = null;
    let jsonBody = null;
    if (bodyKind === "json") {
      jsonBody = body.json;
      try {
        bodyText = JSON.stringify(body.json ?? null);
      } catch {
        return { ok: false, status: 400, reason: "json body must be serializable" };
      }
      if (!headerMap.value["content-type"]) headerMap.value["content-type"] = "application/json";
    } else if (bodyKind === "text") {
      bodyText = String(body.text);
      if (!headerMap.value["content-type"]) headerMap.value["content-type"] = "text/plain; charset=utf-8";
    }
    const defaults = normalizeHttpOutboundConfig(appContext.runtimeConfig);
    const timeoutMs = positiveInteger(body?.timeoutMs, defaults.timeoutMs);
    const maxAttempts = positiveInteger(body?.maxAttempts, defaults.maxAttempts);
    const retryDelayMs = positiveInteger(body?.retryDelayMs, defaults.retryDelayMs);
    const contextId = typeof body?.context === "string" && body.context.trim() ? body.context.trim() : null;
    if (contextId) {
      const gate = canCreateInContext(world, actor, contextId);
      if (!gate.ok) return gate;
    }
    const correlationId = typeof body?.correlationId === "string" && body.correlationId.trim()
      ? body.correlationId.trim()
      : `corr_${randomUUID()}`;
    headerMap.value["x-witness-correlation-id"] = correlationId;
    let authKind = null;
    let authConfigKey = null;
    if (body?.auth != null) {
      if (!body.auth || typeof body.auth !== "object" || Array.isArray(body.auth)) {
        return { ok: false, status: 400, reason: "auth must be an object" };
      }
      authKind = typeof body.auth.kind === "string" ? body.auth.kind.trim().toLowerCase() : "";
      authConfigKey = typeof body.auth.configKey === "string" ? body.auth.configKey.trim() : "";
      if (!authKind || !authConfigKey) return { ok: false, status: 400, reason: "auth kind and configKey required" };
      const configValue = appContext.runtimeConfig?.[authConfigKey];
      if (!runtimeConfigScalar(configValue)) {
        return { ok: false, status: 400, reason: `runtime config value missing for ${authConfigKey}` };
      }
      if (authKind === "bearer") {
        headerMap.value.authorization = `Bearer ${String(configValue)}`;
      } else if (authKind === "header") {
        const headerName = typeof body.auth.header === "string" ? body.auth.header.trim().toLowerCase() : "";
        if (!headerName) return { ok: false, status: 400, reason: "auth.header required for header auth" };
        headerMap.value[headerName] = String(configValue);
      } else {
        return { ok: false, status: 400, reason: "auth kind must be bearer or header" };
      }
    }
    return {
      ok: true,
      outbound: {
        id: httpOutboundId(),
        actor,
        serverRunner: serverRunnerId,
        target,
        url,
        method,
        headers: headerMap.value,
        requestHeaderNames: headerNamesFromMap(headerMap.value),
        requestBodyKind: bodyKind,
        bodyText,
        jsonBody,
        timeoutMs,
        maxAttempts,
        retryDelayMs,
        context: contextId,
        correlationId,
        authKind: authKind || null,
        authConfigKey: authConfigKey || null
      }
    };
  };
  const normalizeWebhookDelivery = ({ target, req, payloadBytes, appContext, serverRunnerId }) => {
    const config = normalizeWebhookInboundConfig(appContext.runtimeConfig);
    if (!config.secret) {
      return { ok: false, status: 503, reason: "webhook.inbound.secret not configured" };
    }
    const cleanedTarget = typeof target === "string" ? target.trim() : "";
    if (!cleanedTarget) return { ok: false, status: 400, reason: "target required" };
    const deliveryId = headerValue(req.headers["x-witness-webhook-id"]).trim();
    if (!deliveryId) return { ok: false, status: 400, reason: "missing x-witness-webhook-id header" };
    const timestampHeader = headerValue(req.headers["x-witness-webhook-timestamp"]).trim();
    const timestampMs = parseWebhookTimestamp(timestampHeader);
    if (timestampMs == null) return { ok: false, status: 400, reason: "invalid x-witness-webhook-timestamp header" };
    const signature = headerValue(req.headers["x-witness-webhook-signature"]).trim();
    if (!signature) return { ok: false, status: 400, reason: "missing x-witness-webhook-signature header" };
    const contentType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
    const receivedAt = isoAt(Date.now());
    const correlationId = headerValue(req.headers["x-witness-correlation-id"]).trim() || `corr_${randomUUID()}`;
    const webhook = {
      id: webhookId(),
      serverRunner: serverRunnerId,
      target: cleanedTarget,
      deliveryId,
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      signature,
      expectedSignature: webhookSignatureHex(config.secret, {
        deliveryId,
        timestamp: timestampHeader,
        payload: payloadBytes
      }),
      contentType,
      sizeBytes: payloadBytes.length,
      receivedAt,
      correlationId,
      storageKey: null,
      maxAttempts: config.maxAttempts,
      retryDelayMs: config.retryDelayMs,
      replayWindowMs: config.replayWindowMs
    };
    return { ok: true, webhook };
  };
  const normalizeBlobPath = (raw, { allowEmpty = false } = {}) => {
    const value = String(raw || "").replaceAll("\\", "/");
    const segments = value.split("/").filter(Boolean);
    if (!segments.length) {
      if (allowEmpty) return { ok: true, path: "", segments: [] };
      return { ok: false, status: 400, reason: "missing blob path" };
    }
    for (const segment of segments) {
      if (segment === "." || segment === "..") {
        return { ok: false, status: 400, reason: "blob path traversal is not allowed" };
      }
      if (segment.includes("\0")) {
        return { ok: false, status: 400, reason: "blob path contains invalid characters" };
      }
    }
    return { ok: true, path: segments.join("/"), segments };
  };
  const resolveBlobScope = ({ requestActor, requestUrl, appContext }) => {
    if (!requestActor) return { ok: false, status: 401, reason: "sign in first" };
    const contextId = requestUrl.searchParams.get("context") || "";
    const serverRunnerInput = requestUrl.searchParams.get("serverRunner") || "";
    if (contextId && serverRunnerInput) return { ok: false, status: 400, reason: "choose either context or serverRunner scope" };
    if (!contextId && !serverRunnerInput) return { ok: false, status: 400, reason: "missing blob scope" };
    if (contextId) {
      const gate = canManageContext(world, requestActor, contextId);
      if (!gate.ok) return gate;
      return { ok: true, scopeKind: "context", scopeId: contextId };
    }
    const serverRunnerId = serverRunnerInput === "current" ? (appContext?.serverRunnerId || "") : serverRunnerInput;
    if (!serverRunnerId) return { ok: false, status: 400, reason: "unknown server runner scope" };
    const gate = canMutateTarget(world, requestActor, serverRunnerId);
    if (!gate.ok) return gate;
    return { ok: true, scopeKind: "serverRunner", scopeId: serverRunnerId };
  };
  const blobScopeDirectoryFor = (appContext, scopeKind, scopeId) => path.join(
    blobsRootFor(appContext),
    scopeKind === "context" ? "contexts" : "server-runners",
    encodeURIComponent(scopeId)
  );
  const blobStorageDirectoryFor = (appContext, scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      directory: path.join(blobScopeDirectoryFor(appContext, scopeKind, scopeId), ...normalized.segments.map(segment => encodeURIComponent(segment)))
    };
  };
  const blobStorageKeyFor = (scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    const prefix = scopeKind === "context" ? "contexts" : "server-runners";
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      storageKey: `${prefix}/${encodeURIComponent(scopeId)}/${normalized.segments.map(segment => encodeURIComponent(segment)).join("/")}`
    };
  };
  const blobRefFor = (scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      blobRef: `blob:${scopeKind}:${encodeURIComponent(scopeId)}:${normalized.segments.map(segment => encodeURIComponent(segment)).join("/")}`
    };
  };
  const blobContentUrlFor = (scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    const params = new URLSearchParams({
      ...(scopeKind === "context" ? { context: scopeId } : { serverRunner: scopeId }),
      path: normalized.path
    });
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      contentUrl: `/api/fs/blobs/content?${params.toString()}`
    };
  };
  const blobMetaPathFor = (appContext, scopeKind, scopeId, blobPath) => {
    const resolved = blobStorageDirectoryFor(appContext, scopeKind, scopeId, blobPath);
    if (!resolved.ok) return resolved;
    return { ...resolved, metaPath: path.join(resolved.directory, "meta.json") };
  };
  const blobContentPathFor = (appContext, scopeKind, scopeId, blobPath) => {
    const resolved = blobStorageDirectoryFor(appContext, scopeKind, scopeId, blobPath);
    if (!resolved.ok) return resolved;
    return { ...resolved, contentPath: path.join(resolved.directory, "blob") };
  };
  const composeBlobFileRecord = async ({ appContext, scopeKind, scopeId, blobPath, metadata = null }) => {
    const storageKey = blobStorageKeyFor(scopeKind, scopeId, blobPath);
    const blobRef = blobRefFor(scopeKind, scopeId, blobPath);
    const contentUrl = blobContentUrlFor(scopeKind, scopeId, blobPath);
    const contentPath = blobContentPathFor(appContext, scopeKind, scopeId, blobPath);
    if (!storageKey.ok) return storageKey;
    if (!blobRef.ok) return blobRef;
    if (!contentUrl.ok) return contentUrl;
    if (!contentPath.ok) return contentPath;
    let stat = null;
    try {
      stat = await fs.stat(contentPath.contentPath);
    } catch {
      return { ok: false, status: 404, reason: "blob not found" };
    }
    const record = metadata ?? {};
    return {
      ok: true,
      record: {
        kind: "file",
        scopeKind,
        scopeId,
        path: contentPath.path,
        name: contentPath.segments.at(-1) || "",
        sizeBytes: stat.size,
        mimeType: record.mimeType || "application/octet-stream",
        storageKey: storageKey.storageKey,
        blobRef: blobRef.blobRef,
        contentUrl: contentUrl.contentUrl,
        updatedAt: record.updatedAt || stat.mtime.toISOString()
      },
      contentPath: contentPath.contentPath
    };
  };
  const loadBlobRecord = async ({ appContext, scopeKind, scopeId, blobPath }) => {
    const metaPath = blobMetaPathFor(appContext, scopeKind, scopeId, blobPath);
    if (!metaPath.ok) return metaPath;
    const contentPath = blobContentPathFor(appContext, scopeKind, scopeId, blobPath);
    if (!contentPath.ok) return contentPath;
    let metadata = null;
    try {
      metadata = JSON.parse(await fs.readFile(metaPath.metaPath, "utf8"));
    } catch {
      metadata = null;
    }
    const fileRecord = await composeBlobFileRecord({ appContext, scopeKind, scopeId, blobPath, metadata });
    if (fileRecord.ok) return fileRecord;
    try {
      const stat = await fs.stat(contentPath.directory);
      if (!stat.isDirectory()) return { ok: false, status: 404, reason: "blob not found" };
      const entries = await fs.readdir(contentPath.directory);
      return {
        ok: true,
        record: {
          kind: "folder",
          scopeKind,
          scopeId,
          path: contentPath.path,
          name: contentPath.segments.at(-1) || "",
          childCount: entries.filter(entry => entry !== "blob" && entry !== "meta.json").length,
          updatedAt: stat.mtime.toISOString()
        },
        directory: contentPath.directory
      };
    } catch {
      return { ok: false, status: 404, reason: "blob not found" };
    }
  };
  const listBlobFolder = async ({ appContext, scopeKind, scopeId, folderPath }) => {
    const normalized = normalizeBlobPath(folderPath, { allowEmpty: true });
    if (!normalized.ok) return normalized;
    const directory = path.join(blobScopeDirectoryFor(appContext, scopeKind, scopeId), ...normalized.segments.map(segment => encodeURIComponent(segment)));
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const logicalName = decodeURIComponent(entry.name);
        const childPath = normalized.path ? `${normalized.path}/${logicalName}` : logicalName;
        const child = await loadBlobRecord({ appContext, scopeKind, scopeId, blobPath: childPath });
        if (child.ok) items.push(child.record);
      }
      items.sort((a, b) => a.path.localeCompare(b.path));
      return {
        ok: true,
        folder: {
          kind: "folder",
          scopeKind,
          scopeId,
          path: normalized.path,
          name: normalized.segments.at(-1) || "",
          childCount: items.length
        },
        items
      };
    } catch {
      if (!normalized.path) {
        return {
          ok: true,
          folder: { kind: "folder", scopeKind, scopeId, path: "", name: "", childCount: 0 },
          items: []
        };
      }
      return { ok: false, status: 404, reason: "blob folder not found" };
    }
  };
  const normalizeAssetVisibility = (raw, runtimeConfig = {}) => {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || value === "private") return { ok: true, value: "private" };
    if (value === "public") {
      const enabledRaw = runtimeConfigLookup(runtimeConfig, "upload.asset.publicEnabled");
      const enabled = enabledRaw === true || String(enabledRaw || "").trim().toLowerCase() === "true";
      if (enabled) return { ok: true, value: "public" };
      return { ok: false, reason: "public asset hosting is not enabled for this runner" };
    }
    return { ok: false, reason: "invalid asset visibility" };
  };
  const ensureFilesContext = ({ actor, homeContext }) => {
    if (!homeContext) {
      return { ok: false, status: 409, reason: "actor has no homeContext for file drops" };
    }
    const homeGate = canCreateInContext(world, actor, homeContext);
    if (!homeGate.ok) return homeGate;
    const filesContextId = filesContextIdFor(homeContext);
    const existing = world.project(moduleProjectors.contexts).find(row => row.id === filesContextId) ?? null;
    if (existing) {
      const filesGate = canCreateInContext(world, actor, filesContextId);
      if (!filesGate.ok) return filesGate;
      return { ok: true, status: 200, contextId: filesContextId, created: false, context: existing };
    }
    defineContext(world, {
      actor,
      id: filesContextId,
      label: "Files",
      parent: homeContext,
      owner: actor
    });
    const created = world.project(moduleProjectors.contexts).find(row => row.id === filesContextId) ?? null;
    return { ok: true, status: 201, contextId: filesContextId, created: true, context: created };
  };
  const resolveAssetDropContext = ({ actor, perspectiveId, requestSession, explicitContextId = null }) => {
    const perspective = currentPerspectiveById(perspectiveId);
    if (!perspective) {
      return { ok: false, status: 404, reason: "unknown perspective", perspectiveId };
    }
    if (explicitContextId && perspective.context && explicitContextId !== perspective.context) {
      return { ok: false, status: 409, reason: "drop context does not match perspective context", perspectiveId, explicitContextId, perspectiveContext: perspective.context };
    }
    if (perspective.context) {
      const gate = canCreateInContext(world, actor, perspective.context);
      if (!gate.ok) return gate;
      return { ok: true, status: 200, perspective, contextId: perspective.context, source: "perspective" };
    }
    const ensured = ensureFilesContext({ actor, homeContext: requestSession?.homeContext ?? null });
    if (!ensured.ok) return ensured;
    return { ok: true, status: ensured.status, perspective, contextId: ensured.contextId, source: "files", filesContextCreated: ensured.created === true };
  };
  const retryableAssetIngest = asset => {
    const status = String(asset?.processingStatus || "");
    return status === "dead-letter" || status === "enqueue-failed";
  };
  const assetDiagnostics = async appContext => {
    const assets = world.project(moduleProjectors.assets);
    const capabilityIndex = world.project(moduleProjectors.capabilityIndex).byId;
    const streamWrites = world.allWitnesses().filter(row => row.process === "fs.stream.write");
    const streamCopies = world.allWitnesses().filter(row => row.process === "fs.stream.copy");
    const assetUploads = world.allWitnesses().filter(row => row.process === "asset.upload");
    const jobs = world.project(moduleProjectors.jobs)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const notifications = world.project(moduleProjectors.notifications);
    const outboundRequests = world.project(moduleProjectors.outboundRequests)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const webhookDeliveries = world.project(moduleProjectors.webhookDeliveries)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const sqlDatasources = world.project(moduleProjectors.sqlDatasources)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const sqlOperations = world.project(moduleProjectors.sqlOperations)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const searchIndexes = world.project(moduleProjectors.searchIndexes)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const oauthFlows = world.project(moduleProjectors.oauthFlows)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const oauthLinks = world.project(moduleProjectors.oauthLinks)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const backendCapabilities = [...hostCapabilities(world, backendHost)]
      .sort()
      .map(id => capabilityIndex[id] ? { ...capabilityIndex[id] } : { id, label: id });
    const filesContexts = world.project(moduleProjectors.contexts)
      .filter(row => String(row.id || "").endsWith(":files"));
    const assetsRoot = assetsRootFor(appContext);
    const blobsRoot = blobsRootFor(appContext);
    let assetsRootExists = false;
    let blobsRootExists = false;
    try {
      const stat = await fs.stat(assetsRoot);
      assetsRootExists = stat.isDirectory();
    } catch {
      assetsRootExists = false;
    }
    try {
      const stat = await fs.stat(blobsRoot);
      blobsRootExists = stat.isDirectory();
    } catch {
      blobsRootExists = false;
    }
    const searchRepairStates = appContext?.searchIndex?.inspectAsset
      ? await Promise.all(assets.map(async asset => ({ asset, repair: await appContext.searchIndex.inspectAsset(asset.id) })))
      : [];
    const ingestRetryable = assets
      .filter(retryableAssetIngest)
      .map(asset => ({
        id: asset.id,
        title: asset.title,
        context: asset.context ?? null,
        processingStatus: asset.processingStatus ?? null,
        processingError: asset.processingError ?? null,
        processingJobId: asset.processingJobId ?? null,
        retryUrl: assetIngestRetryUrl(asset.id)
      }));
    const searchRefreshable = searchRepairStates
      .filter(row => row.repair?.ok && row.repair.indexed && row.repair.stale)
      .map(({ asset, repair }) => ({
        id: asset.id,
        title: asset.title,
        context: asset.context ?? null,
        searchStatus: asset.searchStatus ?? null,
        searchPolicy: repair.policy ?? asset.searchPolicy ?? null,
        lastBuiltAt: repair.lastBuiltAt ?? null,
        assetUpdatedAt: repair.assetUpdatedAt ?? null,
        reindexUrl: assetSearchReindexUrl(asset.id)
      }));
    return {
      backendHost,
      capabilities: [...hostCapabilities(world, backendHost)].sort(),
      backendCapabilities,
      runtimeConfig: {
        fieldCount: appContext?.runtimeConfigFields?.length ?? 0,
        missingCount: (appContext?.runtimeConfigFields ?? []).filter(field => field.required && field.resolved !== true).length,
        secretCount: (appContext?.runtimeConfigFields ?? []).filter(field => field.secret === true).length,
        fields: appContext?.runtimeConfigFields ?? []
      },
      jobs: {
        total: jobs.length,
        queuedCount: jobs.filter(row => row.status === "queued").length,
        runningCount: jobs.filter(row => row.status === "running").length,
        succeededCount: jobs.filter(row => row.status === "succeeded").length,
        deadLetterCount: jobs.filter(row => row.status === "dead-letter").length,
        handlers: [...new Set(jobs.map(row => row.handler).filter(Boolean))].sort()
      },
      notifications: {
        total: notifications.length,
        emailCount: notifications.filter(row => row.channel === "email").length,
        smsCount: notifications.filter(row => row.channel === "sms").length,
        sentCount: notifications.filter(row => row.status === "sent").length,
        failedCount: notifications.filter(row => row.status === "failed").length,
        providerMessageCount: notifications.filter(row => typeof row.providerMessageId === "string" && row.providerMessageId).length
      },
      outbound: {
        total: outboundRequests.length,
        succeededCount: outboundRequests.filter(row => row.status === "succeeded").length,
        failedCount: outboundRequests.filter(row => row.status === "failed").length,
        retryingCount: outboundRequests.filter(row => row.status === "retrying").length,
        externalRefCount: outboundRequests.filter(row => (typeof row.externalRefId === "string" && row.externalRefId) || (typeof row.correlationId === "string" && row.correlationId)).length,
        transports: [...new Set(outboundRequests.map(row => row.transport).filter(Boolean))].sort()
      },
      webhooks: {
        total: webhookDeliveries.length,
        acceptedCount: webhookDeliveries.filter(row => row.replayStatus === "accepted").length,
        rejectedCount: webhookDeliveries.filter(row => row.status === "rejected").length,
        processedCount: webhookDeliveries.filter(row => row.status === "processed").length,
        failedCount: webhookDeliveries.filter(row => row.status === "failed").length,
        deliveryRefCount: webhookDeliveries.filter(row => typeof row.deliveryId === "string" && row.deliveryId).length,
        targets: [...new Set(webhookDeliveries.map(row => row.target).filter(Boolean))].sort()
      },
      dbSql: {
        datasourceCount: sqlDatasources.length,
        operationCount: sqlOperations.length,
        providers: [...new Set(sqlDatasources.map(row => row.provider).filter(Boolean))].sort(),
        failedCount: sqlOperations.filter(row => row.status === "failed").length
      },
      search: {
        indexCount: searchIndexes.length,
        readyCount: searchIndexes.filter(row => row.status === "ready").length,
        failedCount: searchIndexes.filter(row => row.status === "failed").length,
        queryCount: searchIndexes.reduce((sum, row) => sum + Number(row.queryCount ?? 0), 0),
        providers: [...new Set(searchIndexes.map(row => row.provider).filter(Boolean))].sort()
      },
      oauth: {
        flowCount: oauthFlows.length,
        activeCount: oauthFlows.filter(row => ["started", "callback"].includes(row.status)).length,
        linkCount: oauthLinks.length,
        failedCount: oauthFlows.filter(row => row.status === "failed").length + oauthLinks.filter(row => row.status === "failed").length,
        providerAccountCount: oauthLinks.filter(row => typeof row.providerAccountId === "string" && row.providerAccountId).length,
        providers: [...new Set([...oauthFlows, ...oauthLinks].map(row => row.provider).filter(Boolean))].sort()
      },
      storage: {
        runtimeRoot: appContext?.runtimeRoot ?? null,
        assetsRoot,
        assetsRootExists,
        blobsRoot,
        blobsRootExists
      },
      assets: {
        total: assets.length,
        privateCount: assets.filter(asset => asset.visibility === "private").length,
        publicCount: assets.filter(asset => asset.visibility === "public").length,
        attachmentCount: assets.reduce((sum, asset) => sum + Number(asset.attachmentCount ?? 0), 0),
        processingQueuedCount: assets.filter(asset => asset.processingStatus === "queued").length,
        processingRunningCount: assets.filter(asset => asset.processingStatus === "running").length,
        processingSucceededCount: assets.filter(asset => asset.processingStatus === "succeeded").length,
        processingDeadLetterCount: assets.filter(asset => asset.processingStatus === "dead-letter").length,
        textReadyCount: assets.filter(asset => asset.textStatus === "extracted" || asset.textStatus === "empty").length,
        thumbnailReadyCount: assets.filter(asset => asset.thumbnailStatus === "ready").length,
        searchReindexedCount: assets.filter(asset => asset.searchStatus === "reindexed").length,
        totalBytes: assets.reduce((sum, asset) => sum + (Number.isFinite(asset.sizeBytes) ? asset.sizeBytes : 0), 0),
        rawUploadCount: assetUploads.filter(row => row.body?.uploadKind === "raw").length,
        multipartUploadCount: assetUploads.filter(row => row.body?.uploadKind === "multipart").length,
        contexts: [...new Set(assets.map(asset => asset.context).filter(Boolean))].sort(),
        ingestRetryableCount: ingestRetryable.length,
        searchRefreshableCount: searchRefreshable.length
      },
      repairs: {
        ingestRetryable,
        searchRefreshable
      },
      streams: {
        writeCount: streamWrites.length,
        copyCount: streamCopies.length,
        writeBytes: streamWrites.reduce((sum, row) => sum + (Number.isFinite(row.body?.sizeBytes) ? row.body.sizeBytes : 0), 0),
        copyBytes: streamCopies.reduce((sum, row) => sum + (Number.isFinite(row.body?.sizeBytes) ? row.body.sizeBytes : 0), 0),
        drainCount: [...streamWrites, ...streamCopies].reduce((sum, row) => sum + (Number.isFinite(row.body?.drainCount) ? row.body.drainCount : 0), 0),
        maxChunkBytes: [...streamWrites, ...streamCopies, ...assetUploads].reduce((max, row) => {
          const value = Number.isFinite(row.body?.maxChunkBytes) ? row.body.maxChunkBytes : 0;
          return value > max ? value : max;
        }, 0)
      },
      filesContexts,
      failures: {
        assetUploadFailed: recentWitnessBodies("asset.upload.failed"),
        assetIngestFailed: recentWitnessBodies("asset.ingest.failed"),
        assetAttachFailed: recentWitnessBodies("asset.attach.failed"),
        assetContentReadFailed: world.allObservations()
          .filter(observation => observation.process === "asset.content.read.failed")
          .slice(-20)
          .reverse()
          .map(observation => ({ id: observation.id, actor: observation.actor, body: observation.body ?? {} })),
        assetThumbnailReadFailed: world.allObservations()
          .filter(observation => observation.process === "asset.thumbnail.read.failed")
          .slice(-20)
          .reverse()
          .map(observation => ({ id: observation.id, actor: observation.actor, body: observation.body ?? {} })),
        jobDeadLetter: recentWitnessBodies("jobs.queue.deadLetter"),
        httpOutboundRequestFailed: recentWitnessBodies("http.outbound.request.failed"),
        httpOutboundFailed: recentWitnessBodies("http.outbound.failed"),
        dbSqlFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^db\.sql\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        searchIndexFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^search\.index\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        authOauthFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^auth\.oauth\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        webhookReceiveFailed: recentWitnessBodies("webhook.inbound.receive.failed"),
        webhookRejected: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^webhook\.inbound\.(verify|replay|accept|process)\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        notifyEmailRenderFailed: recentWitnessBodies("notify.email.render.failed"),
        notifySmsRenderFailed: recentWitnessBodies("notify.sms.render.failed"),
        fsBlobFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^fs\.blob\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        fsStreamFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^fs\.stream\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} }))
      }
    };
  };
  const enqueueNotification = async ({ channel, req, res, requestActor, appContext }) => {
    const capability = channel === "email" ? "notify.email" : "notify.sms";
    const capabilityGate = requireBackendCapabilities([capability, "jobs.queue"]);
    if (!capabilityGate.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
      sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
      return;
    }
    if (!requestActor) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: backendHost, claims: [], body: { reason: "no actor" } });
      sendJson(res, 401, { error: "sign in first" });
      return;
    }
    const serverRunnerId = appContext?.serverRunnerId || "";
    const gate = canMutateTarget(world, requestActor, serverRunnerId);
    if (!gate.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
      sendGateFailure(res, gate);
      return;
    }
    const body = await readJson(req);
    const normalized = normalizeNotificationRequest({ channel, body, actor: requestActor, serverRunnerId });
    if (!normalized.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor, claims: [], body: { reason: normalized.reason, serverRunner: serverRunnerId } });
      sendJson(res, normalized.status || 400, { error: normalized.reason });
      return;
    }
    const row = normalized.notification;
    const queued = appContext?.jobs?.enqueue({
      actor: requestActor,
      handler: `notify.${channel}.deliver`,
      payload: { notificationId: row.id },
      delayMs: row.delayMs,
      maxAttempts: row.maxAttempts,
      retryDelayMs: row.retryDelayMs,
      idempotencyKey: row.idempotencyKey
    });
    if (!queued?.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor, claims: [], body: { reason: queued?.reason || "queue unavailable", serverRunner: serverRunnerId } });
      sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
      return;
    }
    const title = notificationTitle(channel, { subject: row.subject, to: row.to });
    const witness = world.emit({
      process: `notify.${channel}.enqueue`,
      actor: requestActor,
      claims: [
        thing(row.id),
        relation(row.id, "hasModuleKind", "notification"),
        relation(requestActor, "owns", row.id),
        relation(row.id, "hasTitle", title),
        ...(row.context ? [relation(row.id, "inContext", row.context)] : [])
      ],
      body: {
        id: row.id,
        serverRunner: serverRunnerId,
        channel,
        to: row.to,
        subject: row.subject,
        text: row.text,
        template: row.template,
        vars: row.vars,
        context: row.context,
        transport: "stub",
        jobId: queued.job?.id ?? null
      }
    });
    sendJson(res, 201, {
      notification: notificationReadShape(currentNotificationForRunner(serverRunnerId, row.id) ?? {
        id: row.id,
        title,
        channel,
        recipient: row.to,
        subject: row.subject,
        sender: null,
        preview: null,
        transport: "stub",
        status: "queued",
        context: row.context,
        jobId: queued.job?.id ?? null,
        providerMessageId: null,
        attempt: 0,
        maxAttempts: row.maxAttempts,
        retryDelayMs: row.retryDelayMs,
        lastError: null
      }),
      job: queued.job,
      witness
    });
  };
  const bootstrapModel = () => {
    const authored = bootstrapState();
    const homeRoute = authored.servedRoutes.find(route => route.method === "GET" && route.path === "/" && route.handler === "page.home");
    const appReady = Boolean(homeRoute && homeRoute.params?.rootWidget);
    const typeModel = world.project(typeModelProjection);
    const pageRoutes = (authored.routes || []).filter(route => {
      if (!String(route.handler || "").startsWith("page.")) return false;
      const rootWidget = route.params?.rootWidget ?? null;
      const widget = (authored.widgets || []).find(row => row.id === rootWidget);
      return widget?.kind === "Page";
    });
    return {
      appReady,
      homeReason: appReady ? "reachable home route" : "no reachable app home route",
      widgetKinds: ["Page", "Box", "Section", "Heading", "Text", "Form", "Input", "Select", "Option", "Button", "Link", "List", "ValueEditor"],
      supportedMethods: ["GET", "POST", "PATCH", "DELETE"],
      supportedHandlers,
      supportedPageHandlers: ["page.home", "page.world", "page.process", "page.canvas", "page.backendSeams", "page.edenCanvas"],
      supportedHandlerSets,
      supportedFrontendOps: SUPPORTED_FRONTEND_OPS,
      supportedMcpTransports: ["stdio", "http"],
      supportedMcpActingModes: ["delegated", "service"],
      supportedMcpTools: listSupportedMcpTools(),
      backendHosts: backendHosts.map(id => ({ id })),
      frontendHosts: frontendHosts.map(id => ({ id })),
      processSpecs: Object.values(typeModel.processSpecsByProcess ?? {}),
      capabilityTargetKinds: ["context", "serverRunner", "routePage"],
      stewardshipTargetKinds: ["context", "perspective"],
      capabilityTargets: {
        contexts: authored.contexts || [],
        serverRunners: authored.serverRunners || [],
        routePages: pageRoutes
      },
      contextBindableTargets: [
        ...(authored.identities || []),
        ...(authored.contexts || []),
        ...(authored.perspectives || []),
        ...(authored.widgets || []),
        ...(authored.frontendPrograms || []),
        ...(authored.routes || []),
        ...(authored.serverRunners || []),
        ...(authored.mcpServers || []),
        ...(authored.capabilities || [])
      ],
      attachableContexts: authored.contexts || [],
      proposalTargetProcesses: [
        "identity.update",
        "context.define",
        "context.bind",
        "context.unbind",
        "context.export",
        "context.unexport",
        "context.import",
        "context.unimport",
        "perspective.define",
        "stewardship.grant",
        "stewardship.revoke",
        "widget.define",
        "widget.update",
        "widgetVersion.activate",
        "widgetVersion.rollback",
        "edenVersions.publish",
        "frontendProgram.define",
        "frontendStep.define",
        "route.define",
        "serve.define",
        "serverRunner.define",
        "mcpServer.define",
        "capability.define",
        "capability.install",
        "capability.remove",
        "mcpTool.install",
        "mcpTool.remove"
      ]
    };
  };
  const bootstrapState = (requestActor = null) => {
    const routes = world.project(moduleProjectors.routes);
    const servedRoutes = world.project(moduleProjectors.servedRoutes);
    const serverRunners = world.project(moduleProjectors.serverRunners);
    const contexts = world.project(moduleProjectors.contexts);
    const contextBindings = world.project(moduleProjectors.contextBindings);
    const contextExports = world.project(moduleProjectors.contextExports);
    const contextImports = world.project(moduleProjectors.contextImports);
    const contextScopes = world.project(moduleProjectors.contextScopes);
    const perspectives = world.project(moduleProjectors.perspectives);
    const stewardships = world.project(moduleProjectors.stewardships);
    const proposals = world.project(moduleProjectors.proposals);
    const capabilities = world.project(moduleProjectors.capabilities);
    const capabilityCatalog = world.project(moduleProjectors.capabilityCatalog);
    const capabilityInstalls = world.project(moduleProjectors.capabilityInstalls);
    const mcpServers = world.project(moduleProjectors.mcpServers);
    const mcpToolInstalls = world.project(moduleProjectors.mcpToolInstalls);
    const identities = world.project(moduleProjectors.identities);
    const widgets = widgetDefinitions(world.allWitnesses());
    const frontendPrograms = frontendProgramsProjection(world.allWitnesses());
    const frontendSteps = frontendStepsProjection(world.allWitnesses());
    return {
      contexts,
      contextBindings,
      contextExports,
      contextImports,
      contextScopes,
      perspectives,
      stewardships,
      authority: authorityForActor(world, requestActor),
      proposals,
      capabilities,
      capabilityCatalog,
      capabilityInstalls,
      mcpServers,
      mcpToolInstalls,
      identities,
      widgets,
      frontendPrograms,
      frontendSteps,
      routes,
      servedRoutes,
      serverRunners
    };
  };
  const tutorialProgressFor = (requestSession, tutorialId) => requestSession?.tutorialProgress?.[tutorialId] ?? null;
  const setTutorialProgress = (requestSession, tutorialId, progress) => {
    if (!requestSession?.id) return null;
    requestSession.tutorialProgress = requestSession.tutorialProgress ?? {};
    if (progress == null) delete requestSession.tutorialProgress[tutorialId];
    else requestSession.tutorialProgress[tutorialId] = progress;
    sessionStore.set(requestSession.id, requestSession);
    return requestSession.tutorialProgress[tutorialId] ?? null;
  };
  const edenVersionAuthorityState = (requestActor, soul) => {
    if (!requestActor) {
      return {
        authenticated: false,
        canMutate: false,
        canPropose: false,
        reason: "sign in to change versions"
      };
    }
    const gate = ensureTargetAuthority(requestActor, soul || "");
    return {
      authenticated: true,
      canMutate: Boolean(gate?.ok),
      canPropose: !gate?.ok,
      reason: gate?.ok ? null : (gate?.reason || "forbidden")
    };
  };
  const edenCapabilityInstallAuthorityState = (requestActor, target) => {
    if (!requestActor) {
      return {
        authenticated: false,
        canMutate: false,
        canPropose: false,
        reason: "sign in to install capabilities"
      };
    }
    const gate = ensureTargetAuthority(requestActor, target || "");
    return {
      authenticated: true,
      canMutate: Boolean(gate?.ok),
      canPropose: gate?.status === 403,
      reason: gate?.ok ? null : (gate?.reason || "forbidden")
    };
  };
  const edenVersionStateForRequest = ({ requestActor, surfaceId, soul, publishedVersion = null, draftVersion = null }) => ({
    ...projectEdenVersionState(world.allWitnesses(), {
      surfaceId,
      soul,
      publishedVersion,
      draftVersion
    }),
    authority: edenVersionAuthorityState(requestActor, soul)
  });
  const edenCapabilityInstallStateForRequest = ({
    requestActor,
    appContext,
    surfaceId,
    target,
    targetKind,
    targetLabel,
    recommendedCapabilities = []
  }) => ({
    ...projectEdenCapabilityInstallState(requestVisibleWitnesses(requestActor, appContext), {
      actor: requestActor,
      surfaceId,
      target,
      targetKind,
      targetLabel,
      recommendedCapabilities
    }),
    authority: edenCapabilityInstallAuthorityState(requestActor, target)
  });
  const executeBootstrapProposal = actor => proposal => {
    const body = proposal.body ?? {};
    switch (proposal.targetProcess) {
      case "identity.update": {
        const gate = ensureIdentityAuthority(actor, body.id || proposal.targetId || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapIdentityUpdate(world, {
          actor,
          backendHost,
          body: { ...body, id: body.id || proposal.targetId || "" }
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.define": {
        const gate = body.parent ? ensureTargetAuthority(actor, body.parent) : { ok: true };
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.bind": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextBindingCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unbind": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextBindingRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.export": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextExportCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unexport": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextExportRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.import": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextImportCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unimport": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextImportRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "perspective.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapPerspectiveDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "stewardship.grant": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapStewardshipGrant(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "stewardship.revoke": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapStewardshipRevoke(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widget.define": {
        const gate = body.context ? ensureContextAuthority(actor, body.context) : (body.parent ? ensureTargetAuthority(actor, body.parent) : { ok: true });
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widget.update": {
        const gate = ensureTargetAuthority(actor, body.id || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetUpdate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widgetVersion.activate": {
        const soul = body.soul || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetVersionActivation(world, {
          actor,
          soul,
          version: body.version ?? null
        });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || []).map(entry => entry.id).filter(Boolean) }
          : { ok: false, status: result.status === "failed" ? 400 : 409, error: result.witness.body?.reason || "widget version activation failed", witness: result.witness };
      }
      case "widgetVersion.rollback": {
        const soul = body.soul || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = rollbackWidgetVersion(world, { actor, soul });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || []).map(entry => entry.id).filter(Boolean) }
          : { ok: false, status: 409, error: result.witness.body?.reason || "widget version rollback failed", witness: result.witness };
      }
      case "edenVersions.publish": {
        const soul = body.soul || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestEdenVersionPublish(world, {
          actor,
          backendHost,
          surfaceId: body.surfaceId ?? "eden.surface.versions",
          soul,
          publishedVersion: body.publishedVersion ?? null,
          draftVersion: body.draftVersion ?? null,
          body
        });
        return result.ok
          ? { ok: true, witnessIds: [result.witness.id].filter(Boolean) }
          : { ok: false, status: result.status || 400, error: result.error || "eden version publish failed", witness: result.witness };
      }
      case "frontendProgram.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapFrontendProgramDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "frontendStep.define": {
        const gate = ensureTargetAuthority(actor, body.program);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapFrontendStepDefine(world, { actor, backendHost, body, allowedOps: SUPPORTED_FRONTEND_OPS });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "route.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapRouteDefine(world, { actor, backendHost, body, allowedHandlers: supportedHandlers });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "serve.define": {
        const gate = body.serverRunner
          ? ensureTargetAuthority(actor, body.serverRunner)
          : ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapServeDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "serverRunner.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapServerRunnerDefine(world, { actor, backendHost, body, allowedHandlerSets: supportedHandlerSets });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpServer.define": {
        const gate = body.serverRunner
          ? ensureTargetAuthority(actor, body.serverRunner)
          : ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpServerDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.install": {
        const target = body.targetKind === "routePage" ? body.target : body.target;
        const gate = ensureTargetAuthority(actor, target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityInstall(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.remove": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpTool.install": {
        const gate = ensureTargetAuthority(actor, body.server);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpToolInstall(world, { actor, backendHost, body, allowedTools: mcpToolNames() });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpTool.remove": {
        const gate = ensureTargetAuthority(actor, body.server);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpToolRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      default:
        return { ok: false, status: 400, error: "proposal target process not supported" };
    }
  };
  const edenOrganizationSurface = (requestActor, appContext, route) => {
    const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
    const surfaceId = route?.params?.surfaceId ?? "eden.surface.commons";
    const visible = requestVisibleWitnesses(requestActor, appContext);
    const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
    const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
    return { neighborhoodId, surfaceId, visible, model, surface };
  };
  const projectEdenOrganizationRuntime = (requestActor, appContext, surface) => projectEdenOrganizationState(
    requestVisibleWitnesses(requestActor, appContext),
    {
      actor: requestActor,
      surfaceId: surface?.id ?? "eden.surface.commons",
      contextParent: surface?.contextParent,
      guestSteward: surface?.guestSteward,
      proposalTargetProcess: surface?.proposalTargetProcess,
      proposalTargetKind: surface?.proposalTargetKind,
      proposalTargetId: surface?.proposalTargetId,
      proposalBody: surface?.proposalBody
    }
  );
  handlers = {
    __sessionStore: sessionStore,
    "bootstrap.model.read": async ({ res }) => {
      sendJson(res, 200, bootstrapModel());
    },

    "bootstrap.state.read": async ({ res, requestActor }) => {
      sendJson(res, 200, bootstrapState(requestActor));
    },

    "bootstrap.page": async ({ res }) => {
      send(res, 200, "text/html; charset=utf-8", renderBootstrapPage());
    },

    "mcp.http": async ({ req, res, params, requestActor, requestIdentity, requestSession, appContext }) => {
      const mcpServer = currentMcpServerIndex().byId[params.id || ""] ?? null;
      if (!mcpServer) {
        sendJson(res, 404, { error: "mcp server not found", id: params.id || "" });
        return;
      }
    if (mcpServer.serverRunner !== appContext?.serverRunnerId) {
      sendJson(res, 404, { error: "mcp server not available on this runtime", id: mcpServer.id, serverRunner: mcpServer.serverRunner });
      return;
    }
    const originGate = validateMcpOrigin(req);
    if (!originGate.ok) {
      sendJson(res, 403, { error: originGate.reason });
      return;
    }
    const principal = resolveMcpPrincipal({ req, requestActor, mcpServer, appContext });
    if (!principal.ok) {
      sendJson(res, principal.status || 403, { error: principal.reason || "forbidden" });
      return;
    }
      if (!mcpServer.transports.includes(principal.transport)) {
        sendJson(res, 404, { error: "mcp transport not enabled on server", transport: principal.transport, server: mcpServer.id });
        return;
      }
      if ((req.method || "GET").toUpperCase() === "GET") {
        sendJson(res, 405, { error: "streaming GET not implemented" }, { allow: "POST" });
        return;
      }
      const bodyBuffer = await readBody(req);
      let message = null;
      try {
        message = bodyBuffer.length ? JSON.parse(bodyBuffer.toString("utf8")) : null;
      } catch (error) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `parse error: ${error instanceof Error ? error.message : String(error)}` }
        });
        return;
      }
      if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: { code: -32600, message: "invalid request" }
        });
        return;
      }
      const method = message.method;
      const isNotification = !Object.prototype.hasOwnProperty.call(message, "id");
      const protocolHeader = headerValue(req.headers["mcp-protocol-version"]).trim();
      if (principal.transport === "http" && method !== "initialize" && !protocolHeader) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: isNotification ? null : (message.id ?? null),
          error: {
            code: -32602,
            message: "mcp-protocol-version header required",
            data: { supported: [MCP_PROTOCOL_VERSION] }
          }
        });
        return;
      }
      if (principal.transport === "http" && method !== "initialize" && protocolHeader !== MCP_PROTOCOL_VERSION) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: isNotification ? null : (message.id ?? null),
          error: {
            code: -32602,
            message: "unsupported protocol version",
            data: { supported: [MCP_PROTOCOL_VERSION], requested: protocolHeader }
          }
        });
        return;
      }
      if (method === "initialize") {
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false }
            },
            serverInfo: {
              name: mcpServer.id,
              title: mcpServer.label || mcpServer.id,
              version: "0.36.0"
            },
            instructions: "Witness World MCP server"
          }
        });
        return;
      }
      if (isNotification) {
        if (method === "notifications/initialized") {
          res.writeHead(202, {});
          res.end();
          return;
        }
        res.writeHead(202, {});
        res.end();
        return;
      }
      if (method === "ping") {
        sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result: {} });
        return;
      }
      const installs = currentMcpToolInstalls()
        .filter(row => row.server === mcpServer.id)
        .filter(row => row.actingMode === principal.actingMode)
        .filter(row => mcpToolAvailable(row.tool));
      if (method === "tools/list") {
        const toolRows = installs
          .map(row => mcpToolDefinition(row.tool))
          .filter(Boolean)
          .map(tool => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema
          }));
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            tools: toolRows,
            nextCursor: null
          }
        });
        return;
      }
      if (method === "tools/call") {
        const toolName = typeof message.params?.name === "string" ? message.params.name : "";
        const install = installs.find(row => row.tool === toolName) ?? null;
        if (!install) {
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: "tool not installed for this principal", tool: toolName }, null, 2) }],
              structuredContent: { error: "tool not installed for this principal", tool: toolName },
              isError: true
            }
          });
          return;
        }
        const args = message.params?.arguments && typeof message.params.arguments === "object"
          ? message.params.arguments
          : {};
        const scopeGate = mcpScopeAllows(install, args, appContext);
        if (!scopeGate.ok) {
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: scopeGate.reason, tool: toolName }, null, 2) }],
              structuredContent: { error: scopeGate.reason, tool: toolName },
              isError: true
            }
          });
          return;
        }
        const result = await executeMcpTool(toolName, {
          args,
          appContext,
          callHandler: request => invokeRouteHandler({
            ...request,
            requestActor: principal.actor,
            requestIdentity: requestIdentity?.actor === principal.actor ? requestIdentity : null,
            requestSession: requestSession?.actor === principal.actor ? requestSession : null,
            appContext
          })
        });
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result
        });
        return;
      }
      sendJson(res, 400, {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "method not found" }
      });
    },

    "tutorial.progress.read": async ({ res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      sendJson(res, 200, { tutorialId, progress: tutorialProgressFor(requestSession, tutorialId) });
    },

    "tutorial.progress.write": async ({ req, res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      if (!requestSession?.id) {
        sendJson(res, 200, { tutorialId, progress: null, localOnly: true });
        return;
      }
      const definition = tutorialDefinition(tutorialId);
      if (!definition) {
        sendJson(res, 404, { error: "tutorial not found", tutorialId });
        return;
      }
      const body = await readJson(req);
      const progress = body && typeof body === "object" ? {
        tutorialId,
        chapterId: typeof body.chapterId === "string" ? body.chapterId : null,
        stepId: typeof body.stepId === "string" ? body.stepId : null,
        chapterStatus: typeof body.chapterStatus === "string" ? body.chapterStatus : "in_progress",
        draftInputs: body.draftInputs && typeof body.draftInputs === "object" ? body.draftInputs : {},
        completedAt: typeof body.completedAt === "string" ? body.completedAt : null,
        hidden: body.hidden === true,
        disabledPages: normalizeTutorialDisabledPages(definition, body.disabledPages),
        replayStepId: definition.steps.some(step => step.id === body.replayStepId) ? body.replayStepId : null
      } : null;
      if (progress?.stepId && !definition.steps.some(step => step.id === progress.stepId)) {
        sendJson(res, 400, { error: "unknown tutorial step", tutorialId, stepId: progress.stepId });
        return;
      }
      setTutorialProgress(requestSession, tutorialId, progress);
      sendJson(res, 200, { tutorialId, progress: tutorialProgressFor(requestSession, tutorialId) });
    },

    "tutorial.progress.delete": async ({ res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      if (!requestSession?.id) {
        sendJson(res, 200, { tutorialId, ok: true, localOnly: true });
        return;
      }
      setTutorialProgress(requestSession, tutorialId, null);
      sendJson(res, 200, { tutorialId, ok: true });
    },

    "identity.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { identity: result.identity, witness: result.witness });
    },

    "identity.update": async ({ req, res, requestActor, requestSession, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const identityId = typeof params?.id === "string" ? params.id : "";
      const auth = ensureIdentityAuthority(gate.actor, identityId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityUpdate(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, id: identityId }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      const nextSession = syncSessionIdentity(requestSession, result.identity);
      sendJson(res, result.status, {
        identity: result.identity,
        witness: result.witness,
        ...(nextSession ? { session: sessionResponseShape(nextSession) } : {})
      });
    },

    "context.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.parent ? ensureTargetAuthority(gate.actor, body.parent) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { context: result.context, witness: result.witness });
    },

    "perspective.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapPerspectiveDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { perspective: result.perspective, witness: result.witness });
    },

    "contextBinding.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextBinding.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextExport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextExport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextImport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "contextImport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "stewardship.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipGrant(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "stewardship.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipRevoke(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "proposal.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapProposalCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.approve": async ({ res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const result = requestBootstrapProposalApprove(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        executeTarget: executeBootstrapProposal(gate.actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.reject": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapProposalReject(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        reason: typeof body.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "capability.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capability: result.capability, witness: result.witness });
    },

    "capability.install": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityInstall(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    },

    "capability.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    },

    "serverRunner.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapServerRunnerDefine(world, { actor: gate.actor, backendHost, body, allowedHandlerSets: supportedHandlerSets });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { serverRunner: result.serverRunner, witness: result.witness });
    },

    "mcpServer.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.serverRunner
        ? ensureTargetAuthority(gate.actor, body.serverRunner)
        : ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpServerDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpServer: result.mcpServer, witness: result.witness });
    },

    "mcpTool.install": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.server);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolInstall(world, { actor: gate.actor, backendHost, body, allowedTools: mcpToolNames() });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
    },

    "mcpTool.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.server);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
    },

    "route.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapRouteDefine(world, { actor: gate.actor, backendHost, body, allowedHandlers: supportedHandlers });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { route: result.route, witness: result.witness });
    },

    "serve.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.serverRunner
        ? ensureTargetAuthority(gate.actor, body.serverRunner)
        : ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapServeDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { serve: result.serve, witness: result.witness });
    },

    "frontendProgram.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapFrontendProgramDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { frontendProgram: result.frontendProgram, witness: result.witness });
    },

    "frontendStep.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.program);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapFrontendStepDefine(world, { actor: gate.actor, backendHost, body, allowedOps: SUPPORTED_FRONTEND_OPS });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { step: result.step, witness: result.witness });
    },

    "session.read": async ({ res, requestActor, requestIdentity, requestSession }) => {
      world.observe({
        process: "session.read",
        actor: requestActor || backendHost,
        claims: [],
        body: { authenticated: Boolean(requestSession), identity: requestIdentity || null, actor: requestActor || null }
      });
      if (!requestSession) {
        sendJson(res, 200, { authenticated: false, identity: null, actor: null, label: null, homeContext: null, perspective: null });
        return;
      }
      sendJson(res, 200, {
        authenticated: true,
        identity: requestSession.identity,
        actor: requestSession.actor,
        label: requestSession.label,
        homeContext: requestSession.homeContext ?? null,
        perspective: requestSession.perspective
      });
    },

    "session.open": async ({ req, res }) => {
      const body = await readJson(req);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const identityIndex = currentIdentityIndex();
      const identity = username ? identityIndex.byUsername[username] ?? null : null;
      if (!identity || identity.password !== password) {
        world.emit({
          process: "session.open.failed",
          actor: backendHost,
          claims: [],
          body: { username, reason: !identity ? "unknown username" : "invalid password" }
        });
        sendJson(res, 401, { error: "invalid credentials" });
        return;
      }
      const sessionId = randomUUID();
      const session = {
        id: sessionId,
        identity: identity.id,
        actor: identity.actor,
        label: identity.label,
        homeContext: identity.homeContext ?? null,
        perspective: identity.homePerspective ?? null,
        tutorialProgress: {}
      };
      sessionStore.set(sessionId, session);
      world.emit({
        process: "session.open",
        actor: identity.actor,
        claims: [
          relation(identity.id, "authenticatedAs", identity.actor),
          ...(identity.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
        ],
        body: {
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          homeContext: identity.homeContext ?? null,
          perspective: identity.homePerspective ?? null
        }
      });
      sendJson(
        res,
        200,
        {
          authenticated: true,
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          homeContext: identity.homeContext ?? null,
          perspective: identity.homePerspective ?? null
        },
        { "set-cookie": sessionCookieHeader(sessionId) }
      );
    },

    "session.logout": async ({ res, requestSession, requestActor }) => {
      if (requestSession?.id) sessionStore.delete(requestSession.id);
      world.emit({
        process: "session.logout",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          identity: requestSession?.identity ?? null,
          actor: requestActor || null,
          perspective: requestSession?.perspective ?? null
        }
      });
      sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookieHeader() });
    },

    "auth.oauth.start": async ({ req, res, requestSession, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const body = await readJson(req);
      const requestedProvider = typeof body?.provider === "string" ? body.provider.trim() : "";
      const resolvedConfig = normalizeAuthOAuthConfig({ runtimeConfig: appContext?.runtimeConfig ?? {}, requestedProvider });
      if (!resolvedConfig.ok) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: resolvedConfig.reason } });
        sendJson(res, resolvedConfig.status || 503, { error: resolvedConfig.reason });
        return;
      }
      const action = typeof body?.action === "string" && body.action.trim()
        ? body.action.trim()
        : (requestSession ? "link" : "login");
      if (!["login", "link"].includes(action)) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: "auth.oauth action must be login or link", provider: resolvedConfig.provider } });
        sendJson(res, 400, { error: "auth.oauth action must be login or link" });
        return;
      }
      if (action === "link" && !requestSession) {
        world.emit({ process: "auth.oauth.start.failed", actor: backendHost, claims: [], body: { reason: "sign in first to link an oauth account", provider: resolvedConfig.provider } });
        sendJson(res, 401, { error: "sign in first to link an oauth account" });
        return;
      }

      const flow = {
        id: authOAuthFlowId(),
        serverRunner: appContext?.serverRunnerId || "",
        provider: resolvedConfig.provider,
        state: randomUUID(),
        action,
        requestedIdentity: requestSession?.identity ?? null,
        callbackUrl: `${authOAuthCallbackBaseUrl(req, appContext)}/${encodeURIComponent(resolvedConfig.provider)}`,
        authorizeUrl: null,
        profile: normalizeAuthOAuthProfile(body?.profile)
      };
      flow.authorizeUrl = `${flow.callbackUrl}?state=${encodeURIComponent(flow.state)}&code=stub-success`;
      appContext.authOAuth?.pendingFlows?.set?.(flow.state, flow);
      emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.start" });
      sendJson(res, 200, {
        flow: {
          id: flow.id,
          provider: flow.provider,
          action: flow.action,
          state: flow.state,
          callbackUrl: flow.callbackUrl,
          authorizeUrl: flow.authorizeUrl
        }
      });
    },

    "auth.oauth.callback": async ({ req, res, params, requestSession, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const provider = params.provider || "";
      const state = requestUrl.searchParams.get("state") || "";
      const code = requestUrl.searchParams.get("code") || "";
      const pendingFlows = appContext?.authOAuth?.pendingFlows;
      const flow = pendingFlows?.get?.(state) ?? null;
      if (!capabilityGate.ok) {
        world.emit({ process: "auth.oauth.callback.failed", actor: requestSession?.actor || backendHost, claims: [], body: { id: flow?.id ?? null, provider, state, reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!flow || flow.provider !== provider) {
        world.emit({ process: "auth.oauth.callback.failed", actor: requestSession?.actor || backendHost, claims: [], body: { provider, state, reason: "unknown oauth flow state" } });
        sendJson(res, 400, { error: "unknown oauth flow state" });
        return;
      }
      pendingFlows.delete(state);

      const resolvedConfig = normalizeAuthOAuthConfig({ runtimeConfig: appContext?.runtimeConfig ?? {}, requestedProvider: provider });
      if (!resolvedConfig.ok) {
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason: resolvedConfig.reason });
        sendJson(res, resolvedConfig.status || 503, { error: resolvedConfig.reason });
        return;
      }
      if (requestUrl.searchParams.get("error")) {
        const reason = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error") || "oauth provider returned an error";
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason });
        sendJson(res, 400, { error: reason });
        return;
      }
      if (code === "stub-fail") {
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason: "stub oauth code rejected" });
        sendJson(res, 401, { error: "stub oauth code rejected" });
        return;
      }

      const profile = normalizeAuthOAuthProfile(flow.profile);
      emitAuthOauthFlow({
        actor: requestSession?.actor || backendHost,
        flow,
        process: "auth.oauth.callback",
        providerAccountId: profile.externalId
      });

      const existingLink = currentOauthLinkByProviderAccount(flow.serverRunner, flow.provider, profile.externalId);
      if (flow.action === "link") {
        if (!requestSession) {
          emitAuthOauthFlow({ actor: backendHost, flow, process: "auth.oauth.link.failed", reason: "sign in first to link an oauth account", providerAccountId: profile.externalId });
          sendJson(res, 401, { error: "sign in first to link an oauth account" });
          return;
        }
        if (existingLink && existingLink.identity && existingLink.identity !== requestSession.identity) {
          emitAuthOauthLink({
            actor: requestSession.actor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth account already linked to another identity"
          });
          sendJson(res, 409, { error: "oauth account already linked to another identity" });
          return;
        }
        const identity = currentIdentityIndex().byId[requestSession.identity] ?? null;
        if (!identity) {
          emitAuthOauthLink({
            actor: requestSession.actor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "signed-in identity not found"
          });
          sendJson(res, 409, { error: "signed-in identity not found" });
          return;
        }
        const linkId = emitAuthOauthLink({ actor: requestSession.actor, flow, identity, profile, createdIdentity: false });
        emitAuthOauthSession({ actor: requestSession.actor, flow, identity, session: requestSession, createdIdentity: false });
        sendJson(res, 200, {
          linked: true,
          createdIdentity: false,
          link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId) ?? {
            id: linkId,
            title: authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity.label }),
            serverRunner: flow.serverRunner,
            provider: flow.provider,
            providerAccountId: profile.externalId,
            identity: identity.id,
            actor: identity.actor,
            label: identity.label,
            status: "linked",
            createdIdentity: false,
            lastError: null
          }),
          session: sessionResponseShape(requestSession)
        });
        return;
      }

      let identity = existingLink?.identity ? currentIdentityIndex().byId[existingLink.identity] ?? null : null;
      let createdIdentity = false;
      if (!identity) {
        if (!resolvedConfig.autoCreate) {
          emitAuthOauthLink({
            actor: backendHost,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth identity is not linked and auto-create is disabled"
          });
          sendJson(res, 409, { error: "oauth identity is not linked and auto-create is disabled" });
          return;
        }
        const identityId = `identity.oauth.${flow.provider}.${sanitizeAuthOauthSegment(profile.externalId)}`;
        const identityIndex = currentIdentityIndex();
        if (identityIndex.byId[identityId] || identityIndex.byUsername[profile.username] || (identityIndex.byActor[profile.actor] ?? []).length) {
          emitAuthOauthLink({
            actor: backendHost,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth-created identity would collide with an existing identity"
          });
          sendJson(res, 409, { error: "oauth-created identity would collide with an existing identity" });
          return;
        }
        createIdentity(world, {
          actor: backendHost,
          id: identityId,
          identityActor: profile.actor,
          label: profile.label,
          username: profile.username,
          password: randomUUID()
        });
        identity = currentIdentityIndex().byId[identityId] ?? null;
        createdIdentity = true;
      }
      if (!identity) {
        emitAuthOauthFlow({ actor: backendHost, flow, process: "auth.oauth.session.failed", reason: "oauth identity resolution failed", providerAccountId: profile.externalId });
        sendJson(res, 500, { error: "oauth identity resolution failed" });
        return;
      }
      const linkId = emitAuthOauthLink({ actor: backendHost, flow, identity, profile, createdIdentity });
      const session = createSessionForIdentity(identity);
      emitAuthOauthSession({ actor: identity.actor, flow, identity, session, createdIdentity });
      sendJson(res, 200, {
        linked: true,
        createdIdentity,
        identity: {
          id: identity.id,
          actor: identity.actor,
          label: identity.label,
          username: identity.username,
          homeContext: identity.homeContext ?? null,
          homePerspective: identity.homePerspective ?? null
        },
        link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId) ?? {
          id: linkId,
          title: authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity.label }),
          serverRunner: flow.serverRunner,
          provider: flow.provider,
          providerAccountId: profile.externalId,
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          status: "linked",
          createdIdentity,
          lastError: null
        }),
        session: sessionResponseShape(session)
      }, { "set-cookie": sessionCookieHeader(session.id) });
    },

    "auth.oauth.links.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const links = oauthLinksForRunner(serverRunnerId).map(authOAuthReadShape);
      world.observe({ process: "auth.oauth.links.list", actor: requestActor, claims: [relation(requestActor, "read", "auth.oauth.links")], body: { serverRunner: serverRunnerId, count: links.length } });
      sendJson(res, 200, { links });
    },

    "auth.oauth.links.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const link = currentOauthLinkForRunner(serverRunnerId, params.id || "");
      if (!link) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor, claims: [], body: { reason: "oauth link not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "oauth link not found" });
        return;
      }
      world.observe({ process: "auth.oauth.links.read", actor: requestActor, claims: [relation(requestActor, "read", link.id)], body: { serverRunner: serverRunnerId, id: link.id } });
      sendJson(res, 200, { link: authOAuthReadShape(link) });
    },

    "webhook.inbound.receive": async ({ req, res, params, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound", "jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "webhook.inbound.receive.failed", actor: backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, target: params.target || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const payloadBytes = await readBody(req);
      const normalized = normalizeWebhookDelivery({
        target: params.target || "",
        req,
        payloadBytes,
        appContext,
        serverRunnerId: appContext?.serverRunnerId || ""
      });
      if (!normalized.ok) {
        world.emit({ process: "webhook.inbound.receive.failed", actor: backendHost, claims: [], body: { reason: normalized.reason, target: params.target || "" } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const delivery = normalized.webhook;
      world.emit({
        process: "webhook.inbound.receive",
        actor: backendHost,
        claims: [
          thing(delivery.id),
          relation(delivery.id, "hasModuleKind", "webhookDelivery"),
          relation(backendHost, "owns", delivery.id),
          relation(delivery.id, "hasTitle", webhookTitle(delivery))
        ],
        body: {
          id: delivery.id,
          serverRunner: delivery.serverRunner,
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId
        }
      });

      if (!verifyWebhookSignature(delivery.signature, delivery.expectedSignature)) {
        world.emit({
          process: "webhook.inbound.verify.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            correlationId: delivery.correlationId,
            reason: "invalid webhook signature"
          }
        });
        sendJson(res, 401, {
          error: "invalid webhook signature",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "invalid",
            replayStatus: null,
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "invalid webhook signature"
          })
        });
        return;
      }

      const now = Date.now();
      if (Math.abs(now - delivery.timestampMs) > delivery.replayWindowMs) {
        world.emit({
          process: "webhook.inbound.replay.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            reason: "delivery timestamp outside replay window"
          }
        });
        sendJson(res, 409, {
          error: "delivery timestamp outside replay window",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "verified",
            replayStatus: "duplicate",
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "delivery timestamp outside replay window"
          })
        });
        return;
      }

      const duplicate = webhookDeliveriesForRunner(delivery.serverRunner).find(row =>
        row.id !== delivery.id
        && row.target === delivery.target
        && row.deliveryId === delivery.deliveryId
        && row.signatureStatus === "verified"
        && row.replayStatus === "accepted"
      );
      if (duplicate) {
        world.emit({
          process: "webhook.inbound.replay.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            correlationId: delivery.correlationId,
            reason: "duplicate delivery"
          }
        });
        sendJson(res, 409, {
          error: "duplicate delivery",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "verified",
            replayStatus: "duplicate",
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "duplicate delivery"
          })
        });
        return;
      }

      const storageKey = `${delivery.id}/payload`;
      const payloadPath = webhookPayloadPathFor(appContext, delivery.id);
      try {
        await fs.mkdir(path.dirname(payloadPath), { recursive: true });
        await fs.writeFile(payloadPath, payloadBytes);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "webhook payload storage failed";
        world.emit({
          process: "webhook.inbound.accept.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            correlationId: delivery.correlationId,
            reason
          }
        });
        sendJson(res, 500, { error: reason });
        return;
      }

      const queued = appContext?.jobs?.enqueue({
        actor: backendHost,
        handler: "webhook.inbound.process",
        payload: { webhookId: delivery.id },
        maxAttempts: delivery.maxAttempts,
        retryDelayMs: delivery.retryDelayMs,
        idempotencyKey: `${delivery.target}:${delivery.deliveryId}`
      });
      if (!queued?.ok) {
        await fs.rm(payloadPath, { force: true }).catch(() => {});
        world.emit({
          process: "webhook.inbound.accept.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            correlationId: delivery.correlationId,
            reason: queued?.reason || "queue unavailable"
          }
        });
        sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
        return;
      }

      world.emit({
        process: "webhook.inbound.accepted",
        actor: backendHost,
        claims: [relation(delivery.id, "sentVia", "webhook.inbound")],
        body: {
          id: delivery.id,
          serverRunner: delivery.serverRunner,
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          storageKey,
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId,
          jobId: queued.job?.id ?? null
        }
      });
      sendJson(res, 202, {
        delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
          id: delivery.id,
          title: webhookTitle(delivery),
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          storageKey,
          status: "accepted",
          signatureStatus: "verified",
          replayStatus: "accepted",
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId,
          context: null,
          serverRunner: delivery.serverRunner,
          jobId: queued.job?.id ?? null,
          attempt: 0,
          maxAttempts: delivery.maxAttempts,
          retryDelayMs: delivery.retryDelayMs,
          lastError: null
        }),
        job: queued.job
      });
    },

    "webhook.inbound.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "webhook.inbound.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "webhook.inbound.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "webhook.inbound.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const deliveries = webhookDeliveriesForRunner(serverRunnerId).map(webhookReadShape);
      world.observe({
        process: "webhook.inbound.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:webhooks`)],
        body: { serverRunner: serverRunnerId, count: deliveries.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, deliveries });
    },

    "webhook.inbound.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "webhook.inbound.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const delivery = currentWebhookForRunner(serverRunnerId, params.id || "");
      if (!delivery) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor, claims: [], body: { reason: "webhook delivery not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "webhook delivery not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "webhook.inbound.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", delivery.id)],
        body: { serverRunner: serverRunnerId, id: delivery.id, status: delivery.status }
      });
      sendJson(res, 200, { delivery: webhookReadShape(delivery) });
    },

    "db.sql.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "db.sql.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({
        actor: requestActor,
        datasource: inspection.datasource,
        ok: inspection.ok,
        reason: inspection.ok ? null : inspection.reason
      });
      if (!inspection.ok && !inspection.datasource) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: inspection.reason || "db.sql runtime unavailable", serverRunner: serverRunnerId } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const projectedDatasource = inspection.datasource
        ? (currentSqlDatasourceForRunner(serverRunnerId, inspection.datasource.id) ?? inspection.datasource)
        : null;
      const operations = sqlOperationsForRunner(serverRunnerId).map(dbSqlOperationReadShape);
      world.observe({
        process: "db.sql.inspect",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:db.sql`)],
        body: { serverRunner: serverRunnerId, operationCount: operations.length, datasourceId: projectedDatasource?.id ?? null }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        datasource: projectedDatasource ? dbSqlDatasourceReadShape({
          ...projectedDatasource,
          operationCount: operations.length
        }) : null,
        operations,
        warning: inspection.ok ? null : inspection.reason
      });
    },

    "db.sql.migrate": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.migrate.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      if (!inspection.ok) {
        const datasource = inspection.datasource ?? {
          id: dbSqlDatasourceId(serverRunnerId),
          title: dbSqlDatasourceTitle({}),
          serverRunner: serverRunnerId,
          provider: "sqlite",
          datasourceName: "main"
        };
        const failedId = dbSqlOperationId();
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId: failedId,
          title: dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null }),
          datasource,
          ok: false,
          body: { reason: inspection.reason || "db.sql runtime unavailable" }
        });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: inspection.datasource.datasourceName });
      const result = await appContext.dbSql.migrate({ migrations: body?.migrations });
      if (!result.ok) {
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId,
          title,
          datasource: result.datasource || inspection.datasource,
          ok: false,
          body: { reason: result.reason || "migration failed" }
        });
        sendJson(res, result.status || 500, { error: result.reason || "migration failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "migrate",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "migrate",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length,
          stepCount: 0,
          lastError: null
        }),
        applied: result.applied,
        skipped: result.skipped
      });
    },

    "db.sql.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "query", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.query({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "query failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "query failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "query",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { rowCount: result.rowCount }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "query",
          status: "succeeded",
          rowCount: result.rowCount,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        rows: result.rows
      });
    },

    "db.sql.command": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.command.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "command", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.command({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "command failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "command failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "command",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "command",
          status: "succeeded",
          rowCount: 0,
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      });
    },

    "db.sql.transaction": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.transaction.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "transaction", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.transaction({ steps: body?.steps });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "transaction failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "transaction failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "transaction",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { stepCount: result.results.length }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "transaction",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: result.results.length,
          lastError: null
        }),
        results: result.results
      });
    },

    "search.index.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = await appContext?.searchIndex?.inspect?.();
      if (!inspection?.ok) {
        const index = inspection?.index || {
          id: `searchIndex:${serverRunnerId}:main`,
          title: `${serverRunnerId} Search Index`,
          serverRunner: serverRunnerId,
          provider: "local-text",
          name: "main"
        };
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.inspect.failed", index, body: { reason: inspection?.reason || "search index unavailable" } });
        sendJson(res, inspection?.status || 503, { error: inspection?.reason || "search index unavailable" });
        return;
      }
      const index = inspection.index ? searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, inspection.index.id) ?? inspection.index) : null;
      world.observe({ process: "search.index.inspect", actor: requestActor, claims: [relation(requestActor, "read", "search.index")], body: { serverRunner: serverRunnerId, built: Boolean(index), documentCount: index?.documentCount ?? 0 } });
      sendJson(res, 200, { index });
    },

    "search.index.build": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.build.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const built = await appContext?.searchIndex?.build?.({ documents: body?.documents, assetIds: body?.assetIds });
      const index = built?.index || {
        id: `searchIndex:${serverRunnerId}:main`,
        title: `${serverRunnerId} Search Index`,
        serverRunner: serverRunnerId,
        provider: "local-text",
        name: "main"
      };
      if (!built?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.build.failed", index, body: { reason: built?.reason || "search index build failed" } });
        sendJson(res, built?.status || 500, { error: built?.reason || "search index build failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.build",
        index: built.index,
        body: {
          sourceCount: built.index.sourceCount,
          documentCount: built.index.documentCount,
          assetCount: built.index.assetCount,
          queryCount: built.index.queryCount,
          lastBuiltAt: built.index.lastBuiltAt,
          path: built.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, built.index.id) ?? built.index) });
    },

    "search.index.reindex": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.reindex.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindex?.();
      const index = rebuilt?.index || {
        id: `searchIndex:${serverRunnerId}:main`,
        title: `${serverRunnerId} Search Index`,
        serverRunner: serverRunnerId,
        provider: "local-text",
        name: "main"
      };
      if (!rebuilt?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.reindex.failed", index, body: { reason: rebuilt?.reason || "search index reindex failed" } });
        sendJson(res, rebuilt?.status || 500, { error: rebuilt?.reason || "search index reindex failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id) ?? rebuilt.index) });
    },

    "search.index.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = await appContext?.searchIndex?.query?.({ q: body?.q, limit: body?.limit });
      const index = result?.index || {
        id: `searchIndex:${serverRunnerId}:main`,
        title: `${serverRunnerId} Search Index`,
        serverRunner: serverRunnerId,
        provider: "local-text",
        name: "main"
      };
      if (!result?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.query.failed", index, body: { reason: result?.reason || "search query failed" } });
        sendJson(res, result?.status || 500, { error: result?.reason || "search query failed" });
        return;
      }
      const hits = result.hits.map(hit => ({
        ...hit,
        ...(hit.assetId ? {
          contentUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/content`,
          textUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/text`
        } : {})
      }));
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.query",
        index: result.index,
        body: {
          q: result.q,
          limit: result.limit,
          hitCount: hits.length,
          queryCount: result.index.queryCount,
          lastQueryAt: result.index.lastQueryAt
        }
      });
      sendJson(res, 200, {
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, result.index.id) ?? result.index),
        hits
      });
    },

    "runtimeConfig.read": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["runtime.config"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "runtimeConfig.read.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const fields = appContext?.runtimeConfigFields ?? [];
      world.observe({
        process: "runtimeConfig.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:runtimeConfig`)],
        body: {
          serverRunner: serverRunnerId,
          fieldCount: fields.length,
          resolvedCount: fields.filter(field => field.resolved === true).length
        }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        values: Object.fromEntries(
          fields
            .filter(field => field.exposed === true && field.resolved === true && field.secret !== true)
            .map(field => [field.name, field.value])
        ),
        fields
      });
    },

    "http.outbound.send": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "http.outbound.request.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const normalized = normalizeOutboundRequest({ body, actor: requestActor, appContext, serverRunnerId });
      if (!normalized.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor, claims: [], body: { reason: normalized.reason, serverRunner: serverRunnerId } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const requestRow = normalized.outbound;
      const requestWitness = world.emit({
        process: "http.outbound.request",
        actor: requestActor,
        claims: [
          thing(requestRow.id),
          relation(requestRow.id, "hasModuleKind", "outboundRequest"),
          relation(requestActor, "owns", requestRow.id),
          relation(requestRow.id, "hasTitle", outboundTitle(requestRow)),
          ...(requestRow.context ? [relation(requestRow.id, "inContext", requestRow.context)] : [])
        ],
        body: {
          id: requestRow.id,
          serverRunner: serverRunnerId,
          target: requestRow.target,
          url: requestRow.url,
          method: requestRow.method,
          requestHeaderNames: requestRow.requestHeaderNames,
          requestBodyKind: requestRow.requestBodyKind,
          timeoutMs: requestRow.timeoutMs,
          maxAttempts: requestRow.maxAttempts,
          retryDelayMs: requestRow.retryDelayMs,
          context: requestRow.context,
          correlationId: requestRow.correlationId,
          authKind: requestRow.authKind,
          authConfigKey: requestRow.authConfigKey
        }
      });

      for (let attempt = 1; attempt <= requestRow.maxAttempts; attempt += 1) {
        world.emit({
          process: "http.outbound.attempt",
          actor: requestActor,
          claims: [relation(serverRunnerId, "runs", requestRow.id)],
          body: {
            id: requestRow.id,
            serverRunner: serverRunnerId,
            target: requestRow.target,
            url: requestRow.url,
            method: requestRow.method,
            transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
            attempt,
            timeoutMs: requestRow.timeoutMs,
            maxAttempts: requestRow.maxAttempts,
            retryDelayMs: requestRow.retryDelayMs,
            correlationId: requestRow.correlationId
          }
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestRow.timeoutMs);
        let result = null;
        let reason = null;
        try {
          result = await executeHttpOutbound(requestRow, {
            appContext,
            signal: controller.signal,
            attempt
          });
        } catch (error) {
          reason = controller.signal.aborted
            ? "outbound timeout"
            : (error instanceof Error ? error.message : String(error));
        } finally {
          clearTimeout(timeout);
        }

        if (result) {
          const responseHeaders = responseHeadersToObject(result.headers);
          const responseContentType = responseHeaders["content-type"] || null;
          const externalRefId = pickExternalRefId(responseHeaders);
          const responseJson = looksJsonContentType(responseContentType) && result.bodyText
            ? (() => {
                try {
                  return JSON.parse(result.bodyText);
                } catch {
                  return null;
                }
              })()
            : null;
          const responsePayload = {
            transport: result.transport,
            status: result.status,
            contentType: responseContentType,
            externalRefId,
            correlationId: responseHeaders["x-correlation-id"] || requestRow.correlationId,
            json: responseJson,
            text: responseJson == null ? result.bodyText : null
          };
          if (result.status >= 200 && result.status < 300) {
            world.emit({
              process: "http.outbound.succeeded",
              actor: requestActor,
              claims: [relation(requestRow.id, "sentVia", `${result.transport}.http.outbound`)],
              body: {
                id: requestRow.id,
                serverRunner: serverRunnerId,
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                attempt,
                responseStatus: result.status,
                responseContentType,
                externalRefId,
                correlationId: responsePayload.correlationId
              }
            });
            sendJson(res, 200, {
              outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id) ?? {
                id: requestRow.id,
                title: outboundTitle(requestRow),
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                status: "succeeded",
                context: requestRow.context,
                serverRunner: serverRunnerId,
                authKind: requestRow.authKind,
                authConfigKey: requestRow.authConfigKey,
                requestHeaderNames: requestRow.requestHeaderNames,
                requestBodyKind: requestRow.requestBodyKind,
                timeoutMs: requestRow.timeoutMs,
                maxAttempts: requestRow.maxAttempts,
                retryDelayMs: requestRow.retryDelayMs,
                attempt,
                correlationId: responsePayload.correlationId,
                externalRefId,
                responseStatus: result.status,
                responseContentType,
                lastError: null
              }),
              response: responsePayload,
              witness: requestWitness.id
            });
            return;
          }
          reason = `outbound response status ${result.status}`;
          if (attempt < requestRow.maxAttempts && isRetryableOutboundStatus(result.status)) {
            const delayMs = requestRow.retryDelayMs * (2 ** Math.max(0, attempt - 1));
            world.emit({
              process: "http.outbound.retry",
              actor: requestActor,
              claims: [],
              body: {
                id: requestRow.id,
                serverRunner: serverRunnerId,
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                attempt,
                responseStatus: result.status,
                responseContentType,
                externalRefId,
                correlationId: responsePayload.correlationId,
                reason,
                delayMs
              }
            });
            await delayWithSignal(delayMs);
            continue;
          }
          world.emit({
            process: "http.outbound.failed",
            actor: requestActor,
            claims: [],
            body: {
              id: requestRow.id,
              serverRunner: serverRunnerId,
              target: requestRow.target,
              url: requestRow.url,
              method: requestRow.method,
              transport: result.transport,
              attempt,
              responseStatus: result.status,
              responseContentType,
              externalRefId,
              correlationId: responsePayload.correlationId,
              reason
            }
          });
          sendJson(res, outboundFailureResponseStatus(reason, result.status), {
            error: reason,
            outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id)),
            response: responsePayload,
            witness: requestWitness.id
          });
          return;
        }

        if (attempt < requestRow.maxAttempts) {
          const delayMs = requestRow.retryDelayMs * (2 ** Math.max(0, attempt - 1));
          world.emit({
            process: "http.outbound.retry",
            actor: requestActor,
            claims: [],
            body: {
              id: requestRow.id,
              serverRunner: serverRunnerId,
              target: requestRow.target,
              url: requestRow.url,
              method: requestRow.method,
              transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
              attempt,
              correlationId: requestRow.correlationId,
              reason,
              delayMs
            }
          });
          await delayWithSignal(delayMs);
          continue;
        }

        world.emit({
          process: "http.outbound.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: requestRow.id,
            serverRunner: serverRunnerId,
            target: requestRow.target,
            url: requestRow.url,
            method: requestRow.method,
            transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
            attempt,
            correlationId: requestRow.correlationId,
            reason
          }
        });
        sendJson(res, outboundFailureResponseStatus(reason), {
          error: reason,
          outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id)),
          witness: requestWitness.id
        });
        return;
      }
    },

    "http.outbound.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "http.outbound.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "http.outbound.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "http.outbound.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const outbound = outboundRequestsForRunner(serverRunnerId).map(outboundReadShape);
      world.observe({
        process: "http.outbound.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:http.outbound`)],
        body: { serverRunner: serverRunnerId, count: outbound.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, outbound });
    },

    "http.outbound.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "http.outbound.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const row = currentOutboundForRunner(serverRunnerId, params.id || "");
      if (!row) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor, claims: [], body: { reason: "outbound request not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "outbound request not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "http.outbound.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", row.id)],
        body: { serverRunner: serverRunnerId, id: row.id, status: row.status }
      });
      sendJson(res, 200, { outbound: outboundReadShape(row) });
    },

    "jobs.queue.enqueue": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const queued = appContext?.jobs?.enqueue({
        actor: requestActor,
        handler: body.handler,
        payload: body.payload,
        delayMs: body.delayMs,
        idempotencyKey: body.idempotencyKey,
        maxAttempts: body.maxAttempts,
        retryDelayMs: body.retryDelayMs
      });
      if (!queued?.ok) {
        world.emit({
          process: "jobs.queue.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: queued?.reason || "queue unavailable",
            handler: typeof body.handler === "string" ? body.handler : null,
            idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null
          }
        });
        sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
        return;
      }
      sendJson(res, queued.status || 201, { created: queued.created === true, job: queued.job, witness: queued.witness });
    },

    "jobs.queue.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const jobs = appContext?.jobs?.list?.() ?? [];
      world.observe({
        process: "jobs.queue.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:jobs`)],
        body: { serverRunner: serverRunnerId, count: jobs.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, jobs });
    },

    "jobs.queue.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const job = appContext?.jobs?.get?.(params.id || "") ?? null;
      if (!job) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: "job not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "job not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "jobs.queue.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", job.id)],
        body: { serverRunner: serverRunnerId, id: job.id, status: job.status }
      });
      sendJson(res, 200, { job });
    },

    "notify.email.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "email", req, res, requestActor, appContext });
    },

    "notify.sms.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "sms", req, res, requestActor, appContext });
    },

    "notifications.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const notifications = notificationsForRunner(serverRunnerId).map(notificationReadShape);
      world.observe({
        process: "notifications.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:notifications`)],
        body: { serverRunner: serverRunnerId, count: notifications.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, notifications });
    },

    "notifications.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const notification = currentNotificationForRunner(serverRunnerId, params.id || "");
      if (!notification) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: "notification not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "notification not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "notifications.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", notification.id)],
        body: { serverRunner: serverRunnerId, id: notification.id, status: notification.status }
      });
      sendJson(res, 200, { notification: notificationReadShape(notification) });
    },

    "widgetVersions.activate": async ({ req, res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "activateWidgetVersion.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const version = typeof body.version === "string" ? body.version : null;
      const result = requestWidgetVersionActivation(world, { actor: requestActor, soul: params.soul || "", version });
      if (result.status === "failed") {
        sendJson(res, 400, { error: result.witness.body?.reason || "unknown widget version", status: result.status, soul: result.soul, version, witness: result.witness });
        return;
      }
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "widget version transition blocked", status: result.status, soul: result.soul, version, witnesses: result.witnesses, witness: result.witness });
        return;
      }
      sendJson(res, 200, { ok: true, status: result.status, soul: result.soul, version, witnesses: result.witnesses, witness: result.witness });
    },

    "widgetVersions.rollback": async ({ res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "widgetVersion.rollback.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = rollbackWidgetVersion(world, { actor: requestActor, soul: params.soul || "" });
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "rollback unavailable", status: result.status, soul: result.soul, witness: result.witness });
        return;
      }
      sendJson(res, 200, { ok: true, status: result.status, soul: result.soul, version: result.version, witnesses: result.witnesses, witness: result.witness });
    },

    "widgets.create": async ({ req, res, requestActor, route }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.context ? ensureContextAuthority(gate.actor, body.context) : (body.parent ? ensureTargetAuthority(gate.actor, body.parent) : { ok: true });
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetDefine(world, {
        actor: gate.actor,
        backendHost,
        body,
        defaultParent: route?.params?.rootWidget ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    },

    "widgets.update": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const widgetId = params.id || "";
      const auth = ensureTargetAuthority(gate.actor, widgetId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestWidgetUpdate(world, {
        actor: gate.actor,
        backendHost,
        body: { ...(body || {}), id: widgetId }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    },

    "edenPersonalBox.read": async ({ res, requestActor, requestSession, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const items = projectEdenPersonalBoxItems(world.allWitnesses(), { actor: requestActor, surfaceId });
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        surfaceId,
        items
      });
    },

    "edenPersonalBox.create": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const body = await readJson(req);
      const result = requestEdenPersonalBoxItemCreate(world, { actor: requestActor, backendHost, surfaceId, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { item: result.item, witness: result.witness });
    },

    "edenPersonalBox.update": async ({ req, res, requestActor, params, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const body = await readJson(req);
      const result = requestEdenPersonalBoxItemUpdate(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        itemId: params.id || "",
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { item: result.item, witness: result.witness });
    },

    "edenPersonalBox.delete": async ({ res, requestActor, params, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const result = requestEdenPersonalBoxItemDelete(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        itemId: params.id || ""
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { ok: true, id: result.id, witness: result.witness });
    },

    "edenPageTheme.read": async ({ res, requestActor, route, appContext }) => {
      const pageId = route?.params?.pageId ?? "todo_app_widget";
      const pageTheme = projectEdenPageTheme(requestVisibleWitnesses(requestActor, appContext), { actor: requestActor, pageId });
      sendJson(res, 200, {
        actor: requestActor || null,
        pageId,
        pageTheme
      });
    },

    "edenPageTheme.write": async ({ req, res, requestActor, route }) => {
      const pageId = route?.params?.pageId ?? "todo_app_widget";
      const body = await readJson(req);
      const result = requestEdenPageThemeSet(world, { actor: requestActor, backendHost, pageId, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 200, { pageTheme: result.pageTheme, witness: result.witness });
    },

    "edenAcademy.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      if (!model) {
        sendJson(res, 404, { error: "eden neighborhood not configured", neighborhood: neighborhoodId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        academy: projectEdenAcademyState(visible, {
          actor: requestActor,
          neighborhoodId,
          quests: model.academy?.quests || []
        }),
        surfaces: model.surfaces.map(surface => ({
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : []
        })),
        checkpoints: model.checkpoints.map(checkpoint => ({
          id: checkpoint.id,
          quests: Array.isArray(checkpoint.quests) ? checkpoint.quests : []
        }))
      });
    },

    "edenOrganization.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        organizationState: surface.runtime,
        surface: {
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : [],
          quests: Array.isArray(surface.quests) ? surface.quests : []
        }
      });
    },

    "edenOrganization.createContext": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const auth = surface.contextParent ? ensureTargetAuthority(gate.actor, surface.contextParent) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      if (surface.runtime.contextExists) {
        sendJson(res, 200, {
          context: surface.runtime.context,
          organizationState: surface.runtime
        });
        return;
      }
      const result = requestBootstrapContextDefine(world, {
        actor: gate.actor,
        backendHost,
        body: {
          id: edenOrganizationContextId(gate.actor),
          label: edenOrganizationContextLabel(gate.actor),
          parent: surface.contextParent ?? null
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        context: result.context,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.grantStewardship": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      if (!surface.runtime.contextExists) {
        sendJson(res, 409, { error: "start a group first", organizationState: surface.runtime });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, surface.runtime.contextId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      if (surface.runtime.hasGuestStewardship) {
        sendJson(res, 200, {
          stewardship: surface.runtime.guestGrant,
          organizationState: surface.runtime
        });
        return;
      }
      const result = requestBootstrapStewardshipGrant(world, {
        actor: gate.actor,
        backendHost,
        body: {
          steward: surface.runtime.guestSteward,
          target: surface.runtime.contextId,
          targetKind: "context"
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        stewardship: result.stewardship,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.createProposal": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      if (!surface.runtime.contextExists) {
        sendJson(res, 409, { error: "start a group first", organizationState: surface.runtime });
        return;
      }
      if (!surface.runtime.hasGuestStewardship) {
        sendJson(res, 409, { error: "grant stewardship first", organizationState: surface.runtime });
        return;
      }
      if (surface.runtime.openProposal) {
        sendJson(res, 200, {
          proposal: surface.runtime.openProposal,
          organizationState: surface.runtime
        });
        return;
      }
      const template = surface.runtime.proposalTemplate || {};
      const result = requestBootstrapProposalCreate(world, {
        actor: gate.actor,
        backendHost,
        body: {
          id: nextEdenOrganizationProposalId(world.allWitnesses(), gate.actor),
          targetProcess: template.targetProcess || "widget.define",
          targetKind: template.targetKind || "widget",
          targetId: template.targetId || null,
          bodyJson: JSON.stringify(
            template.body && typeof template.body === "object"
              ? template.body
              : edenOrganizationProposalBody(gate.actor, { contextId: surface.runtime.contextId, widgetId: surface.runtime.noticeWidgetId })
          ),
          reason: `Open ${edenOrganizationContextLabel(gate.actor)} through a witnessed proposal`
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        proposal: result.proposal,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.approveProposal": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const proposalId = surface.runtime.openProposal?.id || null;
      if (!proposalId) {
        sendJson(res, 404, { error: "no open organization proposal", organizationState: surface.runtime });
        return;
      }
      const result = requestBootstrapProposalApprove(world, {
        actor: gate.actor,
        backendHost,
        proposalId,
        executeTarget: executeBootstrapProposal(gate.actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        proposal: result.proposal,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenTheory.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.tree";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        theoryState: surface.runtime,
        surface: {
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : [],
          quests: Array.isArray(surface.quests) ? surface.quests : []
        }
      });
    },

    "edenTheory.study": async ({ res, requestActor, requestSession, route, appContext, params }) => {
      const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.tree";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const result = requestEdenTheoryLessonStudy(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessonId: params.id || "",
        lessons: surface.theoryLessons || []
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenTheory.assess": async ({ res, requestActor, requestSession, route, appContext }) => {
      const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.tree";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const result = requestEdenTheoryAssessmentPass(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessons: surface.theoryLessons || []
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenTheory.teachBack": async ({ req, res, requestActor, requestSession, route, appContext }) => {
      const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.tree";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const body = await readJson(req);
      const result = requestEdenTheoryTeachBack(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessons: surface.theoryLessons || [],
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenCapabilityInstall.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.world";
      const target = route?.params?.target ?? "frontend";
      const targetKind = route?.params?.targetKind ?? "context";
      const targetLabel = route?.params?.targetLabel ?? target;
      const recommendedCapabilities = Array.isArray(route?.params?.recommendedCapabilities)
        ? route.params.recommendedCapabilities
        : [];
      const capabilityState = edenCapabilityInstallStateForRequest({
        requestActor,
        appContext,
        surfaceId,
        target,
        targetKind,
        targetLabel,
        recommendedCapabilities
      });
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        capabilityState
      });
    },

    "edenCapabilityInstall.install": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.world";
      const target = route?.params?.target ?? "frontend";
      const targetKind = route?.params?.targetKind ?? "context";
      const targetLabel = route?.params?.targetLabel ?? target;
      const recommendedCapabilities = Array.isArray(route?.params?.recommendedCapabilities)
        ? route.params.recommendedCapabilities
        : [];
      const body = await readJson(req);
      const result = requestEdenCapabilityInstall(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        target,
        targetKind,
        targetLabel,
        recommendedCapabilities,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          capabilityState: {
            ...(result.capabilityState ?? edenCapabilityInstallStateForRequest({
              requestActor,
              appContext: null,
              surfaceId,
              target,
              targetKind,
              targetLabel,
              recommendedCapabilities
            })),
            authority: edenCapabilityInstallAuthorityState(requestActor, target)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        capabilityInstall: result.capabilityInstall,
        witness: result.witness,
        capabilityState: {
          ...result.capabilityState,
          authority: edenCapabilityInstallAuthorityState(requestActor, target)
        }
      });
    },

    "edenVersions.read": async ({ res, route, requestActor }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const versionState = edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion });
      sendJson(res, 200, { surfaceId, soul, versionState });
    },

    "edenVersions.activate": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestEdenVersionActivate(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.activationStatus,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "edenVersions.rollback": async ({ res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestEdenVersionRollback(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.rollbackStatus,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "edenVersions.publish": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestEdenVersionPublish(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "page.home": async ({ res, route, appContext, requestSession }) => {
      const params = route.params ?? {};
      const rootWidget = params.rootWidget ?? null;
      if (!rootWidget) {
        sendJson(res, 404, { error: "page not configured", route: route.id });
        return;
      }
      const page = params.page ?? "home";
      const excludeWidgetRoles = Array.isArray(params.excludeWidgetRoles) ? params.excludeWidgetRoles : ["world-graph-body"];
      world.observe({
        process: "frontend.render",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || rootWidget)],
        body: { route: route.path }
      });
      const pageTheme = projectEdenPageTheme(requestVisibleWitnesses(requestSession?.actor || null, appContext), {
        actor: requestSession?.actor || null,
        pageId: rootWidget
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget,
        frontendProgram: params.frontendProgram ?? null,
        appConfig: {
          actors: requestActors(appContext),
          page,
          excludeWidgetRoles,
          pageChrome: pageTheme,
          liveProjection: params.liveProjection !== false,
          tutorial: tutorialProgressFor(requestSession, TODO_TUTORIAL_ID) ? { id: TODO_TUTORIAL_ID } : null
        }
      }));
    },

    "page.world": async ({ res, route, appContext }) => {
      const params = route.params ?? {};
      const rootWidget = params.rootWidget ?? null;
      if (!rootWidget) {
        sendJson(res, 404, { error: "world graph page not configured" });
        return;
      }
      world.observe({
        process: "frontend.renderWorldPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || rootWidget)],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget,
        frontendProgram: params.frontendProgram ?? null,
        appConfig: { actors: requestActors(appContext), page: params.page ?? "world", liveProjection: params.liveProjection !== false }
      }));
    },

    "page.process": async ({ res, route, requestUrl, requestActor, appContext }) => {
      world.emit({
        process: "frontend.renderProcessPage",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || "processView")],
        body: {
          route: route.path || "/process",
          ...processSelection(requestUrl)
        }
      });
      const model = processViewProjection(processViewInputs(requestActor, appContext), processSelection(requestUrl));
      send(res, 200, "text/html", renderProcessPage(model, { currentPath: route.path || "/process" }));
    },

    "page.backendSeams": async ({ res, requestActor, appContext }) => {
      if (!requestActor) {
        world.observe({ process: "frontend.renderBackendSeamsPage.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const diagnostics = await assetDiagnostics(appContext);
      world.observe({
        process: "frontend.renderBackendSeamsPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", "backendSeams")],
        body: { assets: diagnostics.assets.total, assetsRoot: diagnostics.storage.assetsRoot }
      });
      send(res, 200, "text/html; charset=utf-8", renderBackendSeamsPage(diagnostics));
    },

    "page.canvas": async ({ res, route, appContext }) => {
      world.observe({
        process: "frontend.renderCanvasPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || "canvasView")],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderCanvasPage({ actors: requestActors(appContext) }));
    },

    "page.edenCanvas": async ({ res, route, requestActor, requestSession, appContext }) => {
      const neighborhoodId = route.params?.neighborhood ?? "eden.neighborhood.home";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      if (!model) {
        sendJson(res, 404, { error: "eden neighborhood not configured", neighborhood: neighborhoodId });
        return;
      }
      model.session = requestSession
        ? {
            authenticated: true,
            actor: requestSession.actor,
            identity: requestSession.identity,
            label: requestSession.label
          }
        : {
            authenticated: false,
            actor: null,
            identity: null,
            label: null
          };
      world.observe({
        process: "frontend.renderEdenPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || neighborhoodId)],
        body: { route: route.path, neighborhood: neighborhoodId }
      });
      send(res, 200, "text/html", renderEdenPage({ model }));
    },

    "witnesses.list": async ({ res, requestUrl, requestActor, appContext }) => {
      const rawOffset = requestUrl.searchParams.get("offset");
      const visible = requestVisibleWitnesses(requestActor, appContext).map(witness => ({
        ...witness,
        bodyJson: JSON.stringify(witness.body ?? {})
      }));
      if (rawOffset === null) {
        world.observe({
          process: "backend.readWitnesses",
          actor: backendHost,
          claims: [relation(backendHost, "read", "witnessLog")],
          body: { count: world.allWitnesses().length }
        });
        sendJson(res, 200, { witnesses: visible, offset: 0, total: visible.length });
        return;
      }
      const offset = Math.max(0, Math.min(visible.length, Number(rawOffset) || 0));
      sendJson(res, 200, { witnesses: visible.slice(offset), offset, total: visible.length });
    },

    "fs.blob.list": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const folderPath = requestUrl.searchParams.get("path") || "";
      const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath });
      if (!listed.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor, claims: [], body: { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: folderPath } });
        sendJson(res, listed.status || 404, { error: listed.reason });
        return;
      }
      world.observe({
        process: "fs.blob.list",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: listed.folder.path, count: listed.items.length }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, folder: listed.folder, items: listed.items });
    },

    "fs.blob.meta": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      if (!blobPath) {
        const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath: "" });
        world.observe({
          process: listed.ok ? "fs.blob.meta" : "fs.blob.meta.failed",
          actor: requestActor,
          claims: [],
          body: listed.ok
            ? { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "", kind: "folder", childCount: listed.folder.childCount }
            : { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" }
        });
        if (!listed.ok) {
          sendJson(res, listed.status || 404, { error: listed.reason });
          return;
        }
        sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: listed.folder });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      world.observe({
        process: "fs.blob.meta",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: record.record.path, kind: record.record.kind }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.record });
    },

    "fs.blob.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.blob.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      const bytes = await fs.readFile(record.contentPath);
      world.observe({
        process: "fs.blob.read",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: record.record.path,
          sizeBytes: record.record.sizeBytes,
          blobRef: record.record.blobRef
        }
      });
      send(res, 200, record.record.mimeType || "application/octet-stream", bytes, {
        "cache-control": "no-store",
        "content-length": String(bytes.length)
      });
    },

    "fs.blob.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const bytes = await readBody(req);
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const contentPath = path.join(resolvedDir.directory, "blob");
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      const updatedAt = new Date().toISOString();
      try {
        await fs.mkdir(resolvedDir.directory, { recursive: true });
        await fs.writeFile(contentPath, bytes);
        await fs.writeFile(metaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          updatedAt
        }, null, 2));
      } catch (error) {
        world.emit({
          process: "fs.blob.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage write failed" });
        return;
      }
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.blob.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.blob.delete": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const normalized = normalizeBlobPath(blobPath);
      if (!normalized.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: normalized.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: normalized.path });
      if (!record.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      if (record.record.kind === "folder" && record.record.path === "") {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "cannot delete blob scope root", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" } });
        sendJson(res, 409, { error: "cannot delete blob scope root" });
        return;
      }
      const recursive = requestUrl.searchParams.get("recursive") === "true";
      if (record.record.kind === "folder" && !recursive && record.record.childCount > 0) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "blob folder delete requires recursive=true", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, 409, { error: "blob folder delete requires recursive=true" });
        return;
      }
      const targetPath = record.directory || blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, normalized.path).directory;
      try {
        await fs.rm(targetPath, { recursive: true, force: false });
      } catch (error) {
        world.emit({
          process: "fs.blob.delete.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage delete failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: normalized.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage delete failed" });
        return;
      }
      world.emit({
        process: "fs.blob.delete",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: normalized.path,
          kind: record.record.kind
        }
      });
      sendJson(res, 200, { ok: true, deleted: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path, kind: record.record.kind } });
    },

    "fs.stream.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.stream.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      world.observe({
        process: "fs.stream.read",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: record.record.path,
          sizeBytes: record.record.sizeBytes,
          blobRef: record.record.blobRef
        }
      });
      res.writeHead(200, {
        "content-type": record.record.mimeType || "application/octet-stream",
        "content-length": String(record.record.sizeBytes),
        "cache-control": "no-store"
      });
      const stream = createReadStream(record.contentPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "stream read failed" });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "fs.stream.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const contentPath = path.join(resolvedDir.directory, "blob");
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      let streamed = null;
      try {
        streamed = await streamReadableToFile(req, contentPath, { failAfterBytes });
      } catch (error) {
        if (!existed) {
          await fs.rm(resolvedDir.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream write failed" });
        return;
      }
      const updatedAt = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify({
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        path: resolvedDir.path,
        mimeType,
        sizeBytes: streamed.sizeBytes,
        updatedAt
      }, null, 2));
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.stream.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          sizeBytes: streamed.sizeBytes,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.stream.copy": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const body = await readJson(req);
      const fromPath = typeof body.fromPath === "string" ? body.fromPath : "";
      const toPath = typeof body.toPath === "string" ? body.toPath : "";
      const source = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: fromPath });
      if (!source.ok || source.record.kind !== "file") {
        const reason = source.ok ? "source path is a folder" : source.reason;
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, source.ok ? 409 : (source.status || 404), { error: reason });
        return;
      }
      const target = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, toPath);
      if (!target.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: target.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, target.status || 400, { error: target.reason });
        return;
      }
      if (source.record.path === target.path) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: "source and target path must differ", scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, 409, { error: "source and target path must differ" });
        return;
      }
      const targetContentPath = path.join(target.directory, "blob");
      const targetMetaPath = path.join(target.directory, "meta.json");
      let targetExisted = true;
      try {
        await fs.stat(targetContentPath);
      } catch {
        targetExisted = false;
      }
      try {
        const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
        const copied = await streamFileToFile(source.contentPath, targetContentPath, { failAfterBytes });
        const updatedAt = new Date().toISOString();
        await fs.writeFile(targetMetaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: target.path,
          mimeType: source.record.mimeType,
          sizeBytes: copied.sizeBytes,
          updatedAt
        }, null, 2));
        const record = await composeBlobFileRecord({
          appContext,
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          blobPath: target.path,
          metadata: { mimeType: source.record.mimeType, updatedAt }
        });
        world.emit({
          process: "fs.stream.copy",
          actor: requestActor,
          claims: [],
          body: {
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath: source.record.path,
            toPath: target.path,
            sizeBytes: copied.sizeBytes,
            chunkCount: copied.chunkCount,
            maxChunkBytes: copied.maxChunkBytes,
            drainCount: copied.drainCount,
            writeHighWaterMarkBytes: copied.writeHighWaterMarkBytes
          }
        });
        sendJson(res, 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
      } catch (error) {
        if (!targetExisted) {
          await fs.rm(target.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.copy.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream copy failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath,
            toPath
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream copy failed" });
      }
    },

    "worldGraph.read": async ({ res, requestActor, requestId, appContext }) => {
      world.observe({
        process: "backend.readWorldGraph",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "worldGraph")],
        body: { count: world.allWitnesses().length }
      });
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const graph = worldGraphProjection(visible);
      const ast = astNodesProjection(visible);
      const astNodes = {
        byFile: Object.fromEntries([...ast.byFile.entries()].map(([file, nodes]) => [file, nodes])),
        byTarget: Object.fromEntries([...ast.byTarget.entries()].map(([target, nodes]) => [target, nodes]))
      };
      logger.info("worldGraph.projected", { requestId, witnesses: visible.length, nodes: graph.nodes.length, edges: graph.edges.length });
      sendJson(res, 200, { graph, astNodes });
    },

    "backendSeams.read": async ({ res, requestActor, appContext }) => {
      if (!requestActor) {
        world.observe({ process: "backend.readBackendSeams.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const diagnostics = await assetDiagnostics(appContext);
      world.observe({
        process: "backend.readBackendSeams",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "backendSeams")],
        body: {
          runtimeConfigFields: diagnostics.runtimeConfig.fieldCount,
          runtimeConfigMissing: diagnostics.runtimeConfig.missingCount,
          dbSqlDatasources: diagnostics.dbSql.datasourceCount,
          dbSqlOperations: diagnostics.dbSql.operationCount,
          dbSqlFailures: diagnostics.failures.dbSqlFailed.length,
          searchIndexes: diagnostics.search.indexCount,
          searchQueries: diagnostics.search.queryCount,
          searchFailures: diagnostics.failures.searchIndexFailed.length,
          oauthFlows: diagnostics.oauth.flowCount,
          oauthLinks: diagnostics.oauth.linkCount,
          oauthFailures: diagnostics.failures.authOauthFailed.length,
          assets: diagnostics.assets.total,
          assetsRoot: diagnostics.storage.assetsRoot,
          blobsRoot: diagnostics.storage.blobsRoot,
          assetIngestRetryable: diagnostics.assets.ingestRetryableCount,
          assetSearchRefreshable: diagnostics.assets.searchRefreshableCount,
          assetUploadFailures: diagnostics.failures.assetUploadFailed.length,
          assetContentReadFailures: diagnostics.failures.assetContentReadFailed.length,
          fsBlobFailures: diagnostics.failures.fsBlobFailed.length,
          fsStreamFailures: diagnostics.failures.fsStreamFailed.length
        }
      });
      sendJson(res, 200, diagnostics);
    },

    "processView.read": async ({ res, requestUrl, requestActor, appContext }) => {
      world.emit({
        process: "backend.readProcessView",
        actor: requestActor || backendHost,
        claims: [],
        body: processSelection(requestUrl)
      });
      const model = processViewProjection(processViewInputs(requestActor, appContext), processSelection(requestUrl));
      sendJson(res, 200, model);
    },

    "processRun.read": async ({ res, requestUrl, requestActor, params, appContext }) => {
      const replay = requestUrl.searchParams.get("replay");
      const run = processRunProjection(processViewInputs(requestActor, appContext), { runId: params.runId || "", replay });
      if (!run) {
        sendJson(res, 404, { error: "process run not found", runId: params.runId || "" });
        return;
      }
      sendJson(res, 200, run);
    },

    "processEvents.record": async ({ req, res, requestActor }) => {
      const body = await readJson(req);
      const process = typeof body.process === "string" ? body.process : "";
      if (!FRONTEND_TRACE_PROCESSES.has(process)) {
        sendJson(res, 400, { error: "unknown process trace", process });
        return;
      }
      const witness = world.emit({
        process,
        actor: requestActor || frontendHost,
        claims: [],
        body: {
          runId: typeof body.runId === "string" ? body.runId : "",
          program: typeof body.program === "string" ? body.program : "",
          event: typeof body.event === "string" ? body.event : "",
          nodeId: typeof body.nodeId === "string" ? body.nodeId : "",
          op: typeof body.op === "string" ? body.op : "",
          status: typeof body.status === "string" ? body.status : "",
          frontier: Array.isArray(body.frontier) ? body.frontier : [],
          repeat: body.repeat ?? null,
          repeatCount: Number.isFinite(body.repeatCount) ? body.repeatCount : null,
          message: typeof body.message === "string" ? body.message : "",
          eventData: body.eventData ?? null,
          timestamp: Number.isFinite(body.timestamp) ? body.timestamp : Date.now()
        }
      });
      sendJson(res, 200, { ok: true, id: witness.id });
    },

    "source.read": async ({ res, requestUrl }) => {
      const requested = requestUrl.searchParams.get("file") || "";
      const allowed = new Set(world.allWitnesses()
        .filter(w => w.process === "dsl.source.annotate" && typeof w.body?.file === "string")
        .map(w => path.resolve(w.body.file)));
      const resolvedFile = path.resolve(requested);
      if (!allowed.has(resolvedFile)) {
        world.observe({ process: "backend.readSource.failed", actor: backendHost, claims: [], body: { file: requested, reason: "source file not in witnessed imports" } });
        sendJson(res, 404, { error: "source file not available", file: requested });
        return;
      }
      const text = await fs.readFile(resolvedFile, "utf8");
      world.observe({ process: "backend.readSource", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
      sendJson(res, 200, { file: resolvedFile, text });
    },

    "asset.upload": async ({ req, res, requestUrl, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        world.emit({ process: "asset.upload.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const capabilityGate = requireBackendCapabilities(["upload.asset", "fs.blob", "fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: capabilityGate.reason, missing: capabilityGate.missing }
        });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const contentType = headerValue(req.headers["content-type"]).toLowerCase();
      const parsedUpload = contentType.startsWith("multipart/form-data")
        ? await parseMultipartAssetUpload(req)
        : parseRawAssetUpload(req, requestUrl);
      if (!parsedUpload.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: parsedUpload.reason } });
        sendJson(res, parsedUpload.status || 400, { error: parsedUpload.reason });
        return;
      }
      const perspectiveId = parsedUpload.perspectiveId || requestUrl.searchParams.get("perspective") || "";
      if (!perspectiveId) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing perspective id" } });
        sendJson(res, 400, { error: "missing perspective id" });
        return;
      }
      const originalName = parsedUpload.originalName;
      const mimeType = parsedUpload.mimeType;
      const explicitContextId = parsedUpload.explicitContextId || null;
      const visibilityInput = normalizeAssetVisibility(parsedUpload.visibilityRaw, appContext?.runtimeConfig ?? {});
      if (!originalName) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing filename header", perspective: perspectiveId } });
        sendJson(res, 400, { error: parsedUpload.uploadKind === "multipart" ? "multipart upload requires a filename" : "missing x-witness-file-name header" });
        return;
      }
      if (!mimeType) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing content type", perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: "missing content-type header" });
        return;
      }
      if (!visibilityInput.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: visibilityInput.reason, perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: visibilityInput.reason });
        return;
      }
      const resolvedContext = resolveAssetDropContext({
        actor: requestActor,
        perspectiveId,
        requestSession,
        explicitContextId
      });
      if (!resolvedContext.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: resolvedContext.reason,
            perspective: perspectiveId,
            originalName,
            homeContext: requestSession?.homeContext ?? null
          }
        });
        sendJson(res, resolvedContext.status || 400, { error: resolvedContext.reason });
        return;
      }
      const assetId = `asset_${randomUUID()}`;
      const storageKey = assetStorageKey(assetId);
      const contentUrl = assetContentUrl(assetId);
      const visibility = visibilityInput.value;
      const assetPath = assetPathFor(appContext, assetId);
      let streamed = null;

      try {
        streamed = await streamReadableToFile(parsedUpload.source, assetPath);
      } catch (error) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "asset storage write failed",
            perspective: perspectiveId,
            originalName,
            storageKey,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "asset storage write failed" });
        return;
      }
      if (!streamed.sizeBytes) {
        await fs.rm(assetPath, { force: true }).catch(() => {});
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: "empty upload body", perspective: perspectiveId, originalName, context: resolvedContext.contextId }
        });
        sendJson(res, 400, { error: "empty upload body" });
        return;
      }
      const sizeBytes = streamed.sizeBytes;

      const witness = world.emit({
        process: "asset.upload",
        actor: requestActor,
        claims: [
          thing(assetId),
          relation(requestActor, "owns", assetId),
          relation(assetId, "hasModuleKind", "asset"),
          relation(assetId, "hasTitle", originalName),
          relation(assetId, "inContext", resolvedContext.contextId)
        ],
        body: {
          id: assetId,
          originalName,
          mimeType,
          sizeBytes,
          declaredSizeBytes: parsedUpload.declaredSizeBytes,
          uploadKind: parsedUpload.uploadKind,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey,
          contentUrl,
          visibility,
          context: resolvedContext.contextId
        }
      });
      let processing = null;
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId },
        idempotencyKey: `asset.ingest:${assetId}`
      });
      if (queued?.ok && queued.job) {
        world.emit({
          process: "asset.ingest.enqueue",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            jobId: queued.job.id,
            handler: queued.job.handler,
            availableAt: queued.job.availableAt,
            idempotencyKey: queued.job.idempotencyKey
          }
        });
        processing = {
          status: queued.job.status || "queued",
          jobId: queued.job.id,
          attempt: queued.job.attempt ?? 0
        };
      } else {
        world.emit({
          process: "asset.ingest.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            reason: queued?.reason || "asset ingestion queue unavailable"
          }
        });
        processing = {
          status: "enqueue-failed",
          jobId: null,
          attempt: 0,
          error: queued?.reason || "asset ingestion queue unavailable"
        };
      }
      sendJson(res, 201, {
        asset: {
          id: assetId,
          title: originalName,
          mimeType,
          sizeBytes,
          storageKey,
          visibility,
          context: resolvedContext.contextId,
          contentUrl,
          downloadUrl: assetDownloadUrl(contentUrl)
        },
        processing,
        witness: witness.id
      });
    },

    "asset.ingest.retry": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset", "jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.ingest.retry.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden" } });
        sendGateFailure(res, gate);
        return;
      }
      if (asset.processingStatus === "queued" || asset.processingStatus === "running") {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: "asset ingestion already active", jobId: asset.processingJobId ?? null } });
        sendJson(res, 409, { error: "asset ingestion already active", id: asset.id, jobId: asset.processingJobId ?? null });
        return;
      }
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId: asset.id }
      });
      if (!queued?.ok || !queued.job) {
        const reason = queued?.reason || "asset ingestion queue unavailable";
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason } });
        sendJson(res, queued?.status || 503, { error: reason, id: asset.id });
        return;
      }
      const witness = world.emit({
        process: "asset.ingest.retry",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: appContext?.serverRunnerId || null,
          previousJobId: asset.processingJobId ?? null,
          previousStatus: asset.processingStatus ?? null,
          jobId: queued.job.id,
          handler: queued.job.handler,
          availableAt: queued.job.availableAt,
          attempt: queued.job.attempt ?? 0
        }
      });
      sendJson(res, queued.created === false ? 200 : 201, {
        asset: currentAssetById(asset.id) ?? asset,
        job: queued.job,
        witness: witness.id
      });
    },

    "asset.search.reindex": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.search.reindex.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden", serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindexAsset?.(asset.id);
      if (!rebuilt?.ok || !rebuilt.index) {
        const reason = rebuilt?.reason || "asset search reindex failed";
        world.emit({
          process: "asset.search.reindex.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: asset.id,
            serverRunner: serverRunnerId,
            reason,
            searchPolicy: rebuilt?.repair?.policy || asset.searchPolicy || null,
            disposition: rebuilt?.repair?.disposition || null
          }
        });
        sendJson(res, rebuilt?.status || 500, { error: reason, id: asset.id, repair: rebuilt?.repair ?? null });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      const witness = world.emit({
        process: "asset.search.reindex",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: serverRunnerId,
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          completedAt: isoAt(Date.now())
        }
      });
      sendJson(res, 200, {
        asset: {
          ...(currentAssetById(asset.id) ?? asset),
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          searchError: null
        },
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id) ?? rebuilt.index),
        repair: rebuilt.repair ?? null,
        witness: witness.id
      });
    },

    "asset.content.read": async ({ res, params, requestActor, requestUrl, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const wantsDownload = requestUrl?.searchParams?.get("download") === "1";
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.content.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      const assetPath = assetPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(assetPath);
      } catch {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "asset content missing", storageKey: asset.storageKey } });
        sendJson(res, 404, { error: "asset content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.content.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          mimeType: asset.mimeType,
          sizeBytes: stat.size,
          storageKey: asset.storageKey,
          visibility: asset.visibility,
          context: asset.context,
          contentUrl: asset.contentUrl,
          disposition: wantsDownload ? "attachment" : "inline"
        }
      });
      const fileName = String(asset.title || asset.originalName || asset.id).replace(/["\r\n]/g, "_");
      res.writeHead(200, {
        "content-type": asset.mimeType || "application/octet-stream",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${fileName}"`
      });
      const stream = createReadStream(assetPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "asset stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.text.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.text.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.textRef !== "string" || !asset.textRef) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text not available" } });
        sendJson(res, 404, { error: "derived text not available", id: asset.id });
        return;
      }
      const textPath = assetDerivedTextPathForAppContext(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(textPath);
      } catch {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text missing", textRef: asset.textRef } });
        sendJson(res, 404, { error: "derived text missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.text.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          textRef: asset.textRef,
          textUrl: assetTextUrl(asset.id),
          textStatus: asset.textStatus ?? null,
          textExtractor: asset.textExtractor ?? null,
          textBytes: asset.textBytes ?? stat.size,
          visibility: asset.visibility
        }
      });
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.derived.txt"`
      });
      const stream = createReadStream(textPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "derived text stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.thumbnail.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.thumbnailRef !== "string" || !asset.thumbnailRef || typeof asset.thumbnailUrl !== "string" || !asset.thumbnailUrl) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail not available" } });
        sendJson(res, 404, { error: "thumbnail not available", id: asset.id });
        return;
      }
      const thumbnailPath = assetThumbnailPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(thumbnailPath);
      } catch {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail content missing", thumbnailRef: asset.thumbnailRef } });
        sendJson(res, 404, { error: "thumbnail content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.thumbnail.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          thumbnailRef: asset.thumbnailRef,
          thumbnailUrl: asset.thumbnailUrl,
          visibility: asset.visibility,
          sizeBytes: stat.size,
          imageWidth: asset.imageWidth ?? null,
          imageHeight: asset.imageHeight ?? null
        }
      });
      res.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.thumbnail.svg"`
      });
      const stream = createReadStream(thumbnailPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "thumbnail stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.attachments.list": async ({ res, params, requestActor }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "asset.attachments.read.failed", actor: backendHost, claims: [], body: { id: asset.id, reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason } });
        sendGateFailure(res, gate);
        return;
      }
      const attachments = attachmentTargetsForAsset(asset.id);
      world.observe({
        process: "asset.attachments.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", asset.id)],
        body: { id: asset.id, count: attachments.length }
      });
      sendJson(res, 200, { asset, attachments });
    },

    "asset.attach": async ({ req, res, params, requestActor }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.attach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.attach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = await readJson(req);
      const target = typeof body?.target === "string" && body.target.trim() ? body.target.trim() : "";
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      if (!currentThingExists(target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target not found" } });
        sendJson(res, 404, { error: "target not found", target });
        return;
      }
      const targetKind = currentThingKind(target);
      if (targetKind === "asset" || targetKind === "projectionInstance" || targetKind === "perspective") {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target cannot hold asset attachments" } });
        sendJson(res, 409, { error: "target cannot hold asset attachments", target });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset already attached to target" } });
        sendJson(res, 409, { error: "asset already attached to target", asset: asset.id, target });
        return;
      }
      const witness = canvasProcessHandlers["asset.attach"](world, { actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 201, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    },

    "asset.detach": async ({ req, res, params, requestActor, requestUrl }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.detach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.detach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = req.method === "DELETE" ? null : await readJson(req).catch(() => null);
      const target = typeof body?.target === "string" && body.target.trim()
        ? body.target.trim()
        : String(requestUrl.searchParams.get("target") || "").trim();
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (!assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset attachment not current" } });
        sendJson(res, 404, { error: "asset attachment not current", asset: asset.id, target });
        return;
      }
      const witness = canvasProcessHandlers["asset.detach"](world, { actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    },

    "canvas.perspectives.list": async ({ res, requestActor, appContext }) => {
      const perspectives = perspectivesProjection(requestVisibleWitnesses(requestActor, appContext));
      world.observe({
        process: "backend.readPerspectives",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { count: perspectives.length }
      });
      sendJson(res, 200, { perspectives });
    },

    "canvas.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const perspective = requestUrl.searchParams.get("perspective") || "";
      const canvas = canvasProjection(requestVisibleWitnesses(requestActor, appContext), perspective);
      if (!canvas) {
        world.observe({ process: "backend.readCanvas.failed", actor: backendHost, claims: [], body: { perspective, reason: "unknown perspective" } });
        sendJson(res, 404, { error: "unknown perspective", perspective });
        return;
      }
      world.observe({
        process: "backend.readCanvas",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { perspective, instances: canvas.instances.length, connectors: canvas.connectors.length }
      });
      sendJson(res, 200, { canvas });
    },

    "canvas.process": async ({ req, res, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "canvas.process.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const handler = canvasProcessHandlers[body.process];
      if (!handler) {
        world.emit({ process: "canvas.process.failed", actor: requestActor, claims: [], body: { process: body.process, reason: "unknown canvas process" } });
        sendJson(res, 400, { error: "unknown canvas process", process: body.process });
        return;
      }
      const witness = handler(world, { actor: requestActor, ...(body.params ?? {}) });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, Number.isInteger(witness.body?.status) ? witness.body.status : 400, { error: witness.body.reason ?? "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness });
    }
  };
  return handlers;
}

function resolveStorageConfig(storage, runtimeRoot) {
  const resolved = {};
  if (!storage || typeof storage !== "object") return resolved;
  for (const [key, value] of Object.entries(storage)) {
    if (typeof value !== "string" || !value.trim()) continue;
    resolved[key] = path.resolve(runtimeRoot, value);
  }
  return resolved;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderBackendSeamsPage(diagnostics) {
  const json = escapeHtml(JSON.stringify(diagnostics, null, 2));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Backend Seams</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: #f4f1e8;
        color: #1f1d1a;
      }
      body {
        margin: 0;
        padding: 32px;
        background:
          radial-gradient(circle at top right, rgba(208, 143, 54, 0.18), transparent 32%),
          linear-gradient(180deg, #f7f3ea 0%, #efe8db 100%);
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        background: rgba(255, 252, 247, 0.94);
        border: 1px solid #d8ccb5;
        border-radius: 18px;
        box-shadow: 0 18px 48px rgba(55, 39, 13, 0.12);
        padding: 28px;
      }
      h1, h2 {
        margin: 0 0 12px;
      }
      p {
        margin: 0 0 20px;
        line-height: 1.5;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }
      .fact {
        background: #fffaf0;
        border: 1px solid #e5d8bf;
        border-radius: 12px;
        padding: 14px;
      }
      .fact strong,
      .fact span {
        display: block;
      }
      .fact strong {
        font-size: 0.85rem;
        color: #6e5d44;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      pre {
        overflow: auto;
        background: #1f1f1f;
        color: #f7f1e3;
        padding: 18px;
        border-radius: 14px;
        font-size: 0.9rem;
        line-height: 1.45;
      }
      a {
        color: #854f0e;
      }
      .repair-list {
        display: grid;
        gap: 12px;
        margin: 0 0 24px;
      }
      .repair-item {
        background: #fffaf0;
        border: 1px solid #e5d8bf;
        border-radius: 12px;
        padding: 14px;
      }
      .repair-item p {
        margin: 0 0 10px;
      }
      .repair-item form {
        margin: 0;
      }
      button {
        border: 1px solid #854f0e;
        background: #fff;
        color: #854f0e;
        border-radius: 999px;
        padding: 8px 14px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Backend Seams</h1>
      <p>Operator-visible inspection for the current practical backend slice. This page is intentionally narrow: it reports the shipped files, jobs, SQL, search, OAuth, outbound HTTP, inbound webhook, and stub notification seams, local runtime status, and recent witnessed failures.</p>
      <section class="facts">
        <div class="fact"><strong>Capabilities</strong><span>${diagnostics.capabilities.length}</span></div>
        <div class="fact"><strong>Config Fields</strong><span>${diagnostics.runtimeConfig.fieldCount}</span></div>
        <div class="fact"><strong>Missing Config</strong><span>${diagnostics.runtimeConfig.missingCount}</span></div>
        <div class="fact"><strong>Queued Jobs</strong><span>${diagnostics.jobs.queuedCount}</span></div>
        <div class="fact"><strong>Dead Jobs</strong><span>${diagnostics.jobs.deadLetterCount}</span></div>
        <div class="fact"><strong>SQL Operations</strong><span>${diagnostics.dbSql.operationCount}</span></div>
        <div class="fact"><strong>SQL Failures</strong><span>${diagnostics.failures.dbSqlFailed.length}</span></div>
        <div class="fact"><strong>Search Indexes</strong><span>${diagnostics.search.indexCount}</span></div>
        <div class="fact"><strong>Search Failures</strong><span>${diagnostics.failures.searchIndexFailed.length}</span></div>
        <div class="fact"><strong>OAuth Links</strong><span>${diagnostics.oauth.linkCount}</span></div>
        <div class="fact"><strong>OAuth Failures</strong><span>${diagnostics.failures.authOauthFailed.length}</span></div>
        <div class="fact"><strong>Outbound Calls</strong><span>${diagnostics.outbound.total}</span></div>
        <div class="fact"><strong>Outbound Failures</strong><span>${diagnostics.failures.httpOutboundFailed.length + diagnostics.failures.httpOutboundRequestFailed.length}</span></div>
        <div class="fact"><strong>Webhook Deliveries</strong><span>${diagnostics.webhooks.total}</span></div>
        <div class="fact"><strong>Webhook Rejections</strong><span>${diagnostics.webhooks.rejectedCount}</span></div>
        <div class="fact"><strong>Notifications</strong><span>${diagnostics.notifications.total}</span></div>
        <div class="fact"><strong>Assets</strong><span>${diagnostics.assets.total}</span></div>
        <div class="fact"><strong>Retryable Ingest</strong><span>${diagnostics.assets.ingestRetryableCount}</span></div>
        <div class="fact"><strong>Stale Search Assets</strong><span>${diagnostics.assets.searchRefreshableCount}</span></div>
        <div class="fact"><strong>Files Contexts</strong><span>${diagnostics.filesContexts.length}</span></div>
        <div class="fact"><strong>Upload Failures</strong><span>${diagnostics.failures.assetUploadFailed.length}</span></div>
        <div class="fact"><strong>Read Failures</strong><span>${diagnostics.failures.assetContentReadFailed.length}</span></div>
        <div class="fact"><strong>Job Dead Letters</strong><span>${diagnostics.failures.jobDeadLetter.length}</span></div>
        <div class="fact"><strong>Webhook Failures</strong><span>${diagnostics.failures.webhookReceiveFailed.length + diagnostics.failures.webhookRejected.length}</span></div>
        <div class="fact"><strong>Notify Render Failures</strong><span>${diagnostics.failures.notifyEmailRenderFailed.length + diagnostics.failures.notifySmsRenderFailed.length}</span></div>
        <div class="fact"><strong>Blob Failures</strong><span>${diagnostics.failures.fsBlobFailed.length}</span></div>
        <div class="fact"><strong>Stream Failures</strong><span>${diagnostics.failures.fsStreamFailed.length}</span></div>
      </section>
      <h2>Asset Repair Queue</h2>
      ${diagnostics.repairs.ingestRetryable.length
        ? `<div class="repair-list">${diagnostics.repairs.ingestRetryable.map(asset => `
            <div class="repair-item">
              <p><strong>${escapeHtml(asset.title || asset.id)}</strong><br>Ingest status: ${escapeHtml(asset.processingStatus || "unknown")}${asset.processingError ? `<br>Reason: ${escapeHtml(asset.processingError)}` : ""}</p>
              <form method="post" action="${escapeHtml(asset.retryUrl)}">
                <button type="submit">Retry ingest</button>
              </form>
            </div>
          `).join("")}</div>`
        : `<p>No asset ingestion repairs are currently queued for operator action.</p>`}
      <h2>Asset Search Refresh</h2>
      ${diagnostics.repairs.searchRefreshable.length
        ? `<div class="repair-list">${diagnostics.repairs.searchRefreshable.map(asset => `
            <div class="repair-item">
              <p><strong>${escapeHtml(asset.title || asset.id)}</strong><br>Search policy: ${escapeHtml(asset.searchPolicy || "unknown")}${asset.lastBuiltAt ? `<br>Last built: ${escapeHtml(asset.lastBuiltAt)}` : ""}${asset.assetUpdatedAt ? `<br>Asset updated: ${escapeHtml(asset.assetUpdatedAt)}` : ""}</p>
              <form method="post" action="${escapeHtml(asset.reindexUrl)}">
                <button type="submit">Refresh asset search</button>
              </form>
            </div>
          `).join("")}</div>`
        : `<p>No stale asset-backed search entries are waiting for repair.</p>`}
      <p>Raw JSON: <a href="/api/backend-seams">/api/backend-seams</a>  |  Runtime config: <a href="/api/runtime-config">/api/runtime-config</a>  |  SQL: <a href="/api/db/sql">/api/db/sql</a>  |  Search: <a href="/api/search/index">/api/search/index</a>  |  OAuth Links: <a href="/api/oauth/links">/api/oauth/links</a>  |  Jobs: <a href="/api/jobs">/api/jobs</a>  |  Outbound: <a href="/api/http/outbound">/api/http/outbound</a>  |  Webhooks: <a href="/api/webhooks">/api/webhooks</a>  |  Notifications: <a href="/api/notifications">/api/notifications</a></p>
      <h2>Diagnostics</h2>
      <pre id="backend-seams-json">${json}</pre>
    </main>
  </body>
</html>`;
}

function sseFrame(count, witness) {
  return `data: ${JSON.stringify({ count, id: witness?.id ?? null, process: witness?.process ?? null })}\n\n`;
}

function compileRouteMatcher(routePath) {
  const parts = String(routePath || "/").split("/").filter(Boolean);
  return pathname => {
    const targetParts = String(pathname || "/").split("/").filter(Boolean);
    if (parts.length !== targetParts.length) return null;
    const params = Object.create(null);
    for (let i = 0; i < parts.length; i++) {
      const expected = parts[i];
      const actual = targetParts[i];
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodeURIComponent(actual);
        continue;
      }
      if (expected !== actual) return null;
    }
    return params;
  };
}

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function matchDeclaredRoute(routeTable, method, pathname) {
  const targetMethod = String(method || "GET").toUpperCase();
  for (const route of routeTable) {
    if (route.method !== targetMethod) continue;
    const params = route.matcher(pathname);
    if (params) return { route, params };
  }
  return null;
}

function hasReachableHomeRoute(world, routeTable) {
  const home = routeTable.find(route => route.method === "GET" && route.path === "/" && route.handler === "page.home");
  if (!home) return false;
  const rootWidget = home.params?.rootWidget;
  if (!rootWidget) return false;
  return world.project(projectors.things).has(rootWidget);
}

function matchGenericEndpoint(method, pathname) {
  const targetMethod = String(method || "GET").toUpperCase();
  if (targetMethod === "GET" && pathname === "/_bootstrap") return { handler: "bootstrap.page", params: {} };
  if (targetMethod === "GET" && pathname === "/backend-seams") return { handler: "page.backendSeams", params: {} };
  if (targetMethod === "GET" && pathname === "/api/bootstrap-model") return { handler: "bootstrap.model.read", params: {} };
  if (targetMethod === "GET" && pathname === "/api/bootstrap-state") return { handler: "bootstrap.state.read", params: {} };
  if (targetMethod === "GET" && pathname === "/api/backend-seams") return { handler: "backendSeams.read", params: {} };
  if (targetMethod === "GET" && pathname === "/api/runtime-config") return { handler: "runtimeConfig.read", params: {} };
  if (targetMethod === "GET" && pathname === "/api/db/sql") return { handler: "db.sql.inspect", params: {} };
  if (targetMethod === "POST" && pathname === "/api/db/sql/migrate") return { handler: "db.sql.migrate", params: {} };
  if (targetMethod === "POST" && pathname === "/api/db/sql/query") return { handler: "db.sql.query", params: {} };
  if (targetMethod === "POST" && pathname === "/api/db/sql/command") return { handler: "db.sql.command", params: {} };
  if (targetMethod === "POST" && pathname === "/api/db/sql/transaction") return { handler: "db.sql.transaction", params: {} };
  if (targetMethod === "GET" && pathname === "/api/search/index") return { handler: "search.index.inspect", params: {} };
  if (targetMethod === "POST" && pathname === "/api/search/index/build") return { handler: "search.index.build", params: {} };
  if (targetMethod === "POST" && pathname === "/api/search/index/reindex") return { handler: "search.index.reindex", params: {} };
  if (targetMethod === "POST" && pathname === "/api/search/index/query") return { handler: "search.index.query", params: {} };
  if (targetMethod === "POST" && pathname === "/api/oauth/start") return { handler: "auth.oauth.start", params: {} };
  if (targetMethod === "GET" && pathname === "/api/oauth/links") return { handler: "auth.oauth.links.list", params: {} };
  const oauthLinkMatch = pathname.match(/^\/api\/oauth\/links\/([^/]+)$/);
  if (targetMethod === "GET" && oauthLinkMatch) return { handler: "auth.oauth.links.read", params: { id: decodeURIComponent(oauthLinkMatch[1] || "") } };
  const oauthCallbackMatch = pathname.match(/^\/api\/oauth\/callback\/([^/]+)$/);
  if (targetMethod === "GET" && oauthCallbackMatch) return { handler: "auth.oauth.callback", params: { provider: decodeURIComponent(oauthCallbackMatch[1] || "") } };
  if (pathname === "/api/http/outbound") {
    if (targetMethod === "GET") return { handler: "http.outbound.list", params: {} };
    if (targetMethod === "POST") return { handler: "http.outbound.send", params: {} };
  }
  const outboundMatch = pathname.match(/^\/api\/http\/outbound\/([^/]+)$/);
  if (targetMethod === "GET" && outboundMatch) return { handler: "http.outbound.read", params: { id: decodeURIComponent(outboundMatch[1] || "") } };
  if (targetMethod === "GET" && pathname === "/api/webhooks") return { handler: "webhook.inbound.list", params: {} };
  const webhookMatch = pathname.match(/^\/api\/webhooks\/([^/]+)$/);
  if (targetMethod === "GET" && webhookMatch) return { handler: "webhook.inbound.read", params: { id: decodeURIComponent(webhookMatch[1] || "") } };
  const inboundWebhookMatch = pathname.match(/^\/api\/webhooks\/inbound\/([^/]+)$/);
  if (targetMethod === "POST" && inboundWebhookMatch) return { handler: "webhook.inbound.receive", params: { target: decodeURIComponent(inboundWebhookMatch[1] || "") } };
  if (pathname === "/api/jobs") {
    if (targetMethod === "GET") return { handler: "jobs.queue.list", params: {} };
    if (targetMethod === "POST") return { handler: "jobs.queue.enqueue", params: {} };
  }
  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (targetMethod === "GET" && jobMatch) return { handler: "jobs.queue.read", params: { id: decodeURIComponent(jobMatch[1] || "") } };
  if (targetMethod === "POST" && pathname === "/api/notify/email") return { handler: "notify.email.enqueue", params: {} };
  if (targetMethod === "POST" && pathname === "/api/notify/sms") return { handler: "notify.sms.enqueue", params: {} };
  if (targetMethod === "GET" && pathname === "/api/notifications") return { handler: "notifications.list", params: {} };
  const notificationMatch = pathname.match(/^\/api\/notifications\/([^/]+)$/);
  if (targetMethod === "GET" && notificationMatch) return { handler: "notifications.read", params: { id: decodeURIComponent(notificationMatch[1] || "") } };
  const tutorialProgress = pathname.match(/^\/api\/tutorial-progress\/([^/]+)$/);
  if (tutorialProgress) {
    const params = { tutorialId: decodeURIComponent(tutorialProgress[1] || "") };
    if (targetMethod === "GET") return { handler: "tutorial.progress.read", params };
    if (targetMethod === "PUT") return { handler: "tutorial.progress.write", params };
    if (targetMethod === "DELETE") return { handler: "tutorial.progress.delete", params };
  }
  if (pathname === "/api/session") {
    if (targetMethod === "GET") return { handler: "session.read", params: {} };
    if (targetMethod === "POST") return { handler: "session.open", params: {} };
    if (targetMethod === "DELETE") return { handler: "session.logout", params: {} };
  }
  if (pathname === "/api/fs/blobs") {
    if (targetMethod === "GET") return { handler: "fs.blob.list", params: {} };
    if (targetMethod === "DELETE") return { handler: "fs.blob.delete", params: {} };
  }
  if (targetMethod === "GET" && pathname === "/api/fs/blobs/meta") return { handler: "fs.blob.meta", params: {} };
  if (pathname === "/api/fs/blobs/content") {
    if (targetMethod === "GET") return { handler: "fs.blob.read", params: {} };
    if (targetMethod === "PUT") return { handler: "fs.blob.write", params: {} };
  }
  if (targetMethod === "POST" && pathname === "/api/fs/streams/copy") return { handler: "fs.stream.copy", params: {} };
  if (pathname === "/api/fs/streams/content") {
    if (targetMethod === "GET") return { handler: "fs.stream.read", params: {} };
    if (targetMethod === "PUT") return { handler: "fs.stream.write", params: {} };
  }
  if (targetMethod === "POST" && pathname === "/api/assets") return { handler: "asset.upload", params: {} };
  const assetAttachments = pathname.match(/^\/api\/assets\/([^/]+)\/attachments$/);
  if (assetAttachments) {
    const params = { id: decodeURIComponent(assetAttachments[1] || "") };
    if (targetMethod === "GET") return { handler: "asset.attachments.list", params };
    if (targetMethod === "POST") return { handler: "asset.attach", params };
    if (targetMethod === "DELETE") return { handler: "asset.detach", params };
  }
  const assetIngestRetry = pathname.match(/^\/api\/assets\/([^/]+)\/ingest\/retry$/);
  if (targetMethod === "POST" && assetIngestRetry) {
    return { handler: "asset.ingest.retry", params: { id: decodeURIComponent(assetIngestRetry[1] || "") } };
  }
  const assetSearchReindex = pathname.match(/^\/api\/assets\/([^/]+)\/search\/reindex$/);
  if (targetMethod === "POST" && assetSearchReindex) {
    return { handler: "asset.search.reindex", params: { id: decodeURIComponent(assetSearchReindex[1] || "") } };
  }
    const assetContent = pathname.match(/^\/api\/assets\/([^/]+)\/content$/);
    if (assetContent && targetMethod === "GET") {
      return { handler: "asset.content.read", params: { id: decodeURIComponent(assetContent[1] || "") } };
    }
    const assetText = pathname.match(/^\/api\/assets\/([^/]+)\/text$/);
    if (assetText && targetMethod === "GET") {
      return { handler: "asset.text.read", params: { id: decodeURIComponent(assetText[1] || "") } };
    }
    const assetThumbnail = pathname.match(/^\/api\/assets\/([^/]+)\/thumbnail$/);
    if (assetThumbnail && targetMethod === "GET") {
      return { handler: "asset.thumbnail.read", params: { id: decodeURIComponent(assetThumbnail[1] || "") } };
    }
  if (targetMethod === "POST" && pathname === "/api/contexts") return { handler: "context.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/context-bindings") return { handler: "contextBinding.create", params: {} };
  if (targetMethod === "DELETE" && pathname === "/api/context-bindings") return { handler: "contextBinding.remove", params: {} };
  if (targetMethod === "POST" && pathname === "/api/context-exports") return { handler: "contextExport.create", params: {} };
  if (targetMethod === "DELETE" && pathname === "/api/context-exports") return { handler: "contextExport.remove", params: {} };
  if (targetMethod === "POST" && pathname === "/api/context-imports") return { handler: "contextImport.create", params: {} };
  if (targetMethod === "DELETE" && pathname === "/api/context-imports") return { handler: "contextImport.remove", params: {} };
  if (targetMethod === "POST" && pathname === "/api/perspectives") return { handler: "perspective.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/stewardships") return { handler: "stewardship.create", params: {} };
  if (targetMethod === "DELETE" && pathname === "/api/stewardships") return { handler: "stewardship.remove", params: {} };
  if (targetMethod === "POST" && pathname === "/api/proposals") return { handler: "proposal.create", params: {} };
  const proposalApprove = pathname.match(/^\/api\/proposals\/([^/]+)\/approve$/);
  if (proposalApprove && targetMethod === "POST") return { handler: "proposal.approve", params: { id: decodeURIComponent(proposalApprove[1] || "") } };
  const proposalReject = pathname.match(/^\/api\/proposals\/([^/]+)\/reject$/);
  if (proposalReject && targetMethod === "POST") return { handler: "proposal.reject", params: { id: decodeURIComponent(proposalReject[1] || "") } };
  if (targetMethod === "POST" && pathname === "/api/widgets") return { handler: "widgets.create", params: {} };
  const widgetUpdate = pathname.match(/^\/api\/widgets\/([^/]+)$/);
  if (widgetUpdate && targetMethod === "PATCH") return { handler: "widgets.update", params: { id: decodeURIComponent(widgetUpdate[1] || "") } };
  if (targetMethod === "POST" && pathname === "/api/identities") return { handler: "identity.create", params: {} };
  const identityUpdate = pathname.match(/^\/api\/identities\/([^/]+)$/);
  if (identityUpdate && targetMethod === "PATCH") return { handler: "identity.update", params: { id: decodeURIComponent(identityUpdate[1] || "") } };
  if (targetMethod === "POST" && pathname === "/api/mcp-servers") return { handler: "mcpServer.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/mcp-tool-installs") return { handler: "mcpTool.install", params: {} };
  if (targetMethod === "DELETE" && pathname === "/api/mcp-tool-installs") return { handler: "mcpTool.remove", params: {} };
  if (targetMethod === "POST" && pathname === "/api/capabilities") return { handler: "capability.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/capability-installs") return { handler: "capability.install", params: {} };
  if (targetMethod === "DELETE" && pathname === "/api/capability-installs") return { handler: "capability.remove", params: {} };
  if (targetMethod === "POST" && pathname === "/api/frontend-programs") return { handler: "frontendProgram.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/frontend-steps") return { handler: "frontendStep.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/routes") return { handler: "route.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/serve-mounts") return { handler: "serve.create", params: {} };
  if (targetMethod === "POST" && pathname === "/api/server-runners") return { handler: "serverRunner.create", params: {} };
  const mcpEndpoint = pathname.match(/^\/mcp\/([^/]+)$/);
  if (mcpEndpoint && (targetMethod === "POST" || targetMethod === "GET")) return { handler: "mcp.http", params: { id: decodeURIComponent(mcpEndpoint[1] || "") } };
  return null;
}

function actorsFromIdentities(identities) {
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

function resolveRequestContext(req, sessionStore, { allowActorHeader = false } = {}) {
  const cookies = parseCookies(req);
  const sessionId = cookies.witness_session || "";
  const session = sessionId ? sessionStore?.get(sessionId) ?? null : null;
  if (session) {
    return {
      actor: session.actor,
      identity: session.identity,
      session
    };
  }
  if (!allowActorHeader) {
    return {
      actor: null,
      identity: null,
      session: null
    };
  }
  const raw = req.headers["x-witness-actor"];
  const headerActor = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return {
    actor: headerActor,
    identity: null,
    session: null
  };
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (typeof header !== "string" || !header.trim()) return {};
  const cookies = {};
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join("=") || "");
  }
  return cookies;
}

function sessionCookieHeader(sessionId) {
  return `witness_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearSessionCookieHeader() {
  return "witness_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "content-type": type, ...headers });
  res.end(body);
}

function sendJson(res, status, body, headers = {}) {
  send(res, status, "application/json", JSON.stringify(body), headers);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readJson(req) {
  return readBody(req).then(data => {
    try {
      return data.length ? JSON.parse(data.toString("utf8")) : {};
    } catch (err) {
      throw err;
    }
  });
}

