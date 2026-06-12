import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPracticalBackendIoServices,
  looksJsonContentType,
  responseHeadersToObject,
  webhookPayloadPathFor
} from "../src/runtime-practical-backend-io-services.js";

function createIoServices({ blobsRoot }) {
  return createPracticalBackendIoServices({
    blobsRootFor: () => blobsRoot,
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    runtimeConfigScalar: value => typeof value === "string" || typeof value === "number" || typeof value === "boolean",
    positiveInteger: (value, fallback) => {
      const numeric = Number.parseInt(value, 10);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
    },
    isoAt: () => "2026-06-12T00:00:00.000Z",
    randomUUID: () => "uuid-1",
    headerValue: value => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""),
    canCreateInContext: (_actor, contextId) => contextId === "ctx.allowed" ? { ok: true, status: 200, reason: null } : { ok: false, status: 403, reason: "forbidden context" },
    canManageContext: (_actor, contextId) => contextId === "ctx.allowed" ? { ok: true, status: 200, reason: null } : { ok: false, status: 403, reason: "forbidden context" },
    canMutateTarget: (_actor, target) => target === "runner-1" ? { ok: true, status: 200, reason: null } : { ok: false, status: 403, reason: "forbidden runner" }
  });
}

test("practical backend io services normalize outbound requests and webhook deliveries", () => {
  const services = createIoServices({ blobsRoot: "C:/blobs" });
  const outbound = services.normalizeOutboundRequest({
    body: {
      target: "slack",
      url: "https://api.example.test/messages",
      json: { ok: true },
      auth: { kind: "bearer", configKey: "auth.token" },
      context: "ctx.allowed"
    },
    actor: "adam",
    appContext: {
      runtimeConfig: {
        "http.outbound.timeoutMs": 1200,
        "http.outbound.maxAttempts": 4,
        "http.outbound.retryDelayMs": 75,
        "auth.token": "secret-token"
      }
    },
    serverRunnerId: "runner-1"
  });

  assert.equal(outbound.ok, true);
  assert.equal(outbound.outbound.id, "outbound_uuid-1");
  assert.equal(outbound.outbound.headers.authorization, "Bearer secret-token");
  assert.equal(outbound.outbound.headers["content-type"], "application/json");
  assert.equal(outbound.outbound.headers["x-witness-correlation-id"], "corr_uuid-1");
  assert.deepEqual(outbound.outbound.requestHeaderNames, ["authorization", "content-type", "x-witness-correlation-id"]);
  assert.equal(services.outboundTitle(outbound.outbound), "slack");
  assert.equal(services.pickExternalRefId({ "x-provider-id": "provider-1" }), "provider-1");
  assert.equal(services.isRetryableOutboundStatus(503), true);
  assert.equal(services.outboundFailureResponseStatus("outbound timeout"), 504);

  const payload = Buffer.from('{"ok":true}', "utf8");
  const webhook = services.normalizeWebhookDelivery({
    target: "stripe",
    req: {
      headers: {
        "x-witness-webhook-id": "delivery-1",
        "x-witness-webhook-timestamp": "1718150400",
        "x-witness-webhook-signature": "ignored-for-normalization",
        "x-witness-correlation-id": "corr-fixed",
        "content-type": "application/json; charset=utf-8"
      }
    },
    payloadBytes: payload,
    appContext: {
      runtimeConfig: {
        "webhook.inbound.secret": "secret",
        "webhook.inbound.maxAttempts": 5
      }
    },
    serverRunnerId: "runner-1"
  });

  assert.equal(webhook.ok, true);
  assert.equal(webhook.webhook.id, "webhook_uuid-1");
  assert.equal(webhook.webhook.deliveryId, "delivery-1");
  assert.equal(webhook.webhook.contentType, "application/json");
  assert.equal(webhook.webhook.correlationId, "corr-fixed");
  assert.equal(services.verifyWebhookSignature(`sha256=${webhook.webhook.expectedSignature}`, webhook.webhook.expectedSignature), true);
  assert.equal(services.webhookTitle({ target: "stripe", deliveryId: "delivery-1" }), "stripe:delivery-1");
  assert.equal(looksJsonContentType("application/problem+json"), true);
  assert.deepEqual(responseHeadersToObject(new Headers({ "X-Test": "1" })), { "x-test": "1" });
  assert.match(webhookPayloadPathFor({ runtimeRoot: "C:/runtime" }, "webhook:1"), /webhooks[\\/]webhook%3A1[\\/]payload$/);
});

test("practical backend io services resolve blob scope and load/list stored blob records", async () => {
  const blobsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-blob-test-"));
  const services = createIoServices({ blobsRoot });
  const appContext = { runtimeRoot: blobsRoot };
  const recordDir = path.join(blobsRoot, "server-runners", "runner-1", "docs", "report.txt");
  await fs.mkdir(recordDir, { recursive: true });
  await fs.writeFile(path.join(recordDir, "blob"), "hello");
  await fs.writeFile(path.join(recordDir, "meta.json"), JSON.stringify({ mimeType: "text/plain", updatedAt: "2026-06-12T01:02:03.000Z" }));

  const scope = services.resolveBlobScope({
    requestActor: "adam",
    requestUrl: new URL("http://127.0.0.1/api/fs/blobs?serverRunner=current"),
    appContext: { serverRunnerId: "runner-1" }
  });
  assert.deepEqual(scope, { ok: true, scopeKind: "serverRunner", scopeId: "runner-1" });

  const normalized = services.normalizeBlobPath("docs/report.txt");
  assert.deepEqual(normalized, { ok: true, path: "docs/report.txt", segments: ["docs", "report.txt"] });

  const loaded = await services.loadBlobRecord({
    appContext,
    scopeKind: "serverRunner",
    scopeId: "runner-1",
    blobPath: "docs/report.txt"
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.record.kind, "file");
  assert.equal(loaded.record.mimeType, "text/plain");
  assert.equal(loaded.record.contentUrl, "/api/fs/blobs/content?serverRunner=runner-1&path=docs%2Freport.txt");

  const listed = await services.listBlobFolder({
    appContext,
    scopeKind: "serverRunner",
    scopeId: "runner-1",
    folderPath: "docs"
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].path, "docs/report.txt");

  const composed = await services.composeBlobFileRecord({
    appContext,
    scopeKind: "serverRunner",
    scopeId: "runner-1",
    blobPath: "docs/report.txt",
    metadata: { mimeType: "text/plain" }
  });
  assert.equal(composed.ok, true);
  assert.equal(composed.record.storageKey, "server-runners/runner-1/docs/report.txt");

  const resolvedDir = services.blobStorageDirectoryFor(appContext, "serverRunner", "runner-1", "docs/report.txt");
  assert.equal(resolvedDir.ok, true);
  assert.match(resolvedDir.directory, /server-runners[\\/]runner-1[\\/]docs[\\/]report\.txt$/);
});
