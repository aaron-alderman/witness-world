import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function looksJsonContentType(value) {
  const contentType = String(value || "").toLowerCase();
  return contentType.startsWith("application/json") || contentType.includes("+json");
}

export function responseHeadersToObject(headers) {
  const rows = {};
  if (!headers) return rows;
  if (typeof headers.entries === "function") {
    for (const [name, value] of headers.entries()) rows[String(name).toLowerCase()] = String(value);
    return rows;
  }
  for (const [name, value] of Object.entries(headers)) rows[String(name).toLowerCase()] = String(value);
  return rows;
}

function webhooksRootFor(appContext) {
  return appContext?.storage?.webhooksRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "webhooks");
}

export function webhookPayloadPathFor(appContext, webhookIdValue) {
  return path.join(webhooksRootFor(appContext), encodeURIComponent(webhookIdValue), "payload");
}

export function createPracticalBackendIoServices({
  blobsRootFor,
  runtimeConfigLookup,
  runtimeConfigScalar,
  positiveInteger,
  isoAt,
  randomUUID,
  headerValue,
  canCreateInContext,
  canManageContext,
  canMutateTarget
}) {
  const normalizeHttpOutboundConfig = runtimeConfig => ({
    timeoutMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.timeoutMs"), 1000),
    maxAttempts: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.maxAttempts"), 2),
    retryDelayMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.retryDelayMs"), 50)
  });

  const normalizeWebhookInboundConfig = runtimeConfig => {
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
  };

  const httpOutboundId = () => `outbound_${randomUUID()}`;
  const outboundTitle = ({ target = null, method = "GET", url = null } = {}) => {
    if (target) return target;
    return `${method} ${url || "outbound"}`;
  };

  const normalizeHeaderMap = input => {
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
  };

  const headerNamesFromMap = headers => Object.keys(headers || {}).map(name => String(name).toLowerCase()).sort();

  const outboundBodyKind = body => {
    if (Object.prototype.hasOwnProperty.call(body || {}, "json")) return "json";
    if (typeof body?.text === "string") return "text";
    return "none";
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
      const gate = canCreateInContext(actor, contextId);
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

  const webhookId = () => `webhook_${randomUUID()}`;
  const webhookTitle = ({ target = null, deliveryId = null } = {}) => target && deliveryId ? `${target}:${deliveryId}` : (target || deliveryId || "webhook delivery");
  const parseWebhookTimestamp = value => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const intValue = Number.parseInt(raw, 10);
    if (Number.isFinite(intValue) && String(intValue) === raw) {
      return raw.length <= 10 ? intValue * 1000 : intValue;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const webhookSignatureHex = (secret, { deliveryId, timestamp, payload }) => createHmac("sha256", secret)
    .update(String(deliveryId))
    .update(".")
    .update(String(timestamp))
    .update(".")
    .update(Buffer.isBuffer(payload) ? payload.toString("base64") : Buffer.from(payload || "").toString("base64"))
    .digest("hex");
  const verifyWebhookSignature = (signature, expectedHex) => {
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
      const gate = canManageContext(requestActor, contextId);
      if (!gate.ok) return gate;
      return { ok: true, scopeKind: "context", scopeId: contextId };
    }
    const serverRunnerId = serverRunnerInput === "current" ? (appContext?.serverRunnerId || "") : serverRunnerInput;
    if (!serverRunnerId) return { ok: false, status: 400, reason: "unknown server runner scope" };
    const gate = canMutateTarget(requestActor, serverRunnerId);
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

  const pickExternalRefId = headers => {
    const rows = responseHeadersToObject(headers);
    return rows["x-external-id"] || rows["x-provider-id"] || rows["x-request-id"] || null;
  };

  const isRetryableOutboundStatus = status => status === 408 || status === 429 || status >= 500;

  const outboundFailureResponseStatus = (reason, responseStatus = null) => {
    if (reason === "outbound timeout") return 504;
    if (Number.isFinite(responseStatus) && responseStatus >= 400 && responseStatus < 500) return 502;
    return 502;
  };

  return {
    normalizeOutboundRequest,
    outboundTitle,
    normalizeWebhookDelivery,
    webhookTitle,
    verifyWebhookSignature,
    resolveBlobScope,
    listBlobFolder,
    loadBlobRecord,
    blobStorageDirectoryFor,
    composeBlobFileRecord,
    normalizeBlobPath,
    pickExternalRefId,
    isRetryableOutboundStatus,
    outboundFailureResponseStatus
  };
}
