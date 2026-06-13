import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";

function webhooksRootFor(appContext) {
  return appContext?.storage?.webhooksRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "webhooks");
}

export function webhookPayloadPathFor(appContext, webhookIdValue) {
  return path.join(webhooksRootFor(appContext), encodeURIComponent(webhookIdValue), "payload");
}

export function createWebhookIoServices({
  runtimeConfigLookup,
  runtimeConfigScalar,
  positiveInteger,
  isoAt,
  randomUUID,
  headerValue
}) {
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

  return {
    normalizeWebhookDelivery,
    webhookTitle,
    verifyWebhookSignature
  };
}
