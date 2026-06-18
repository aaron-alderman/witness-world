import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBuiltinAssetJobHandlers } from "../plugins/assets/job-handlers.js";
import { createBuiltinNotificationJobHandlers } from "../plugins/notifications/job-handlers.js";
import { createBuiltinWebhookJobHandlers } from "../plugins/webhooks/job-handlers.js";
import { moduleProjectors } from "../src/modules.js";

test("builtin notification job handlers render and send stub notifications", async () => {
  const emitted = [];
  const world = {
    emit(entry) {
      emitted.push(entry);
      return { id: `w${emitted.length}`, ...entry };
    },
    project(projector) {
      if (projector === moduleProjectors.notificationIndex) {
        return {
          byId: {
            "notification-1": {
              id: "notification-1",
              recipient: "x@example.com",
              subject: "Hello",
              template: "Hi {{name}}",
              vars: { name: "Ada" },
              text: null
            }
          }
        };
      }
      return { byId: {} };
    }
  };

  const handlers = createBuiltinNotificationJobHandlers({
    world,
    backendHost: "backendHost",
    runtimeConfig: { "notify.email.stubSender": "stub@example.com" },
    renderTemplatedText: (template, vars) => template.replace("{{name}}", vars.name)
  });

  const result = await handlers["notify.email.deliver"]({
    actor: "adam",
    job: { id: "job-1" },
    payload: { notificationId: "notification-1" },
    attempt: 1
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(emitted[0].process, "notify.email.render");
  assert.equal(emitted[1].process, "notify.email.send");
  assert.equal(emitted[1].body.sender, "stub@example.com");
  assert.equal(emitted[1].body.preview, "Hi Ada");
  assert.equal(emitted[1].body.transport, "stub");
});

function notificationWorld(emitted) {
  return {
    emit(entry) {
      emitted.push(entry);
      return { id: `w${emitted.length}`, ...entry };
    },
    project(projector) {
      if (projector === moduleProjectors.notificationIndex) {
        return {
          byId: {
            "notification-1": {
              id: "notification-1",
              recipient: "x@example.com",
              subject: "Hello",
              template: null,
              vars: {},
              text: "Body text"
            }
          }
        };
      }
      return { byId: {} };
    }
  };
}

test("notify.email delivers through the http provider and witnesses the real provider message id", async () => {
  const emitted = [];
  const calls = [];
  const handlers = createBuiltinNotificationJobHandlers({
    world: notificationWorld(emitted),
    backendHost: "backendHost",
    runtimeConfig: {
      "notify.email.provider": "http",
      "notify.email.http.url": "https://mail.example.test/send",
      "notify.email.http.apiKey": "secret-key",
      "notify.email.http.fromAddress": "ops@example.test"
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { status: 202, json: async () => ({ id: "msg_123" }) };
    }
  });

  const result = await handlers["notify.email.deliver"]({
    actor: "adam",
    job: { id: "job-1" },
    payload: { notificationId: "notification-1" },
    attempt: 1
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mail.example.test/send");
  assert.equal(calls[0].init.headers.authorization, "Bearer secret-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    to: "x@example.com",
    subject: "Hello",
    from: "ops@example.test",
    body: "Body text"
  });
  const send = emitted.find(entry => entry.process === "notify.email.send");
  assert.ok(send);
  assert.equal(send.body.transport, "http");
  assert.equal(send.body.providerMessageId, "msg_123");
  assert.equal(send.body.sender, "ops@example.test");
  assert.equal(emitted.some(entry => entry.process === "notify.email.send.failed"), false);
});

test("notify.email http provider failure witnesses notify.email.send.failed and rethrows for retry", async () => {
  const emitted = [];
  const handlers = createBuiltinNotificationJobHandlers({
    world: notificationWorld(emitted),
    backendHost: "backendHost",
    runtimeConfig: {
      "notify.email.provider": "http",
      "notify.email.http.url": "https://mail.example.test/send",
      "notify.email.http.fromAddress": "ops@example.test"
    },
    fetchImpl: async () => ({ status: 500, text: async () => "upstream boom" })
  });

  await assert.rejects(
    () => handlers["notify.email.deliver"]({
      actor: "adam",
      job: { id: "job-1" },
      payload: { notificationId: "notification-1" },
      attempt: 1
    }),
    /http email provider responded 500/
  );

  const failure = emitted.find(entry => entry.process === "notify.email.send.failed");
  assert.ok(failure);
  assert.equal(failure.body.transport, "http");
  assert.match(failure.body.reason, /500/);
  assert.equal(emitted.some(entry => entry.process === "notify.email.send"), false);
});

test("notify.email delivers through the sendgrid provider and witnesses the X-Message-Id header", async () => {
  const emitted = [];
  const calls = [];
  const handlers = createBuiltinNotificationJobHandlers({
    world: notificationWorld(emitted),
    backendHost: "backendHost",
    runtimeConfig: {
      "notify.email.provider": "sendgrid",
      "notify.email.sendgrid.apiKey": "sg-key",
      "notify.email.sendgrid.fromAddress": "ops@example.test"
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { status: 202, headers: { get: name => (String(name).toLowerCase() === "x-message-id" ? "sg-msg-1" : null) } };
    }
  });

  const result = await handlers["notify.email.deliver"]({
    actor: "adam",
    job: { id: "job-1" },
    payload: { notificationId: "notification-1" },
    attempt: 1
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(calls[0].init.headers.authorization, "Bearer sg-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    personalizations: [{ to: [{ email: "x@example.com" }] }],
    from: { email: "ops@example.test" },
    subject: "Hello",
    content: [{ type: "text/plain", value: "Body text" }]
  });
  const send = emitted.find(entry => entry.process === "notify.email.send");
  assert.ok(send);
  assert.equal(send.body.transport, "sendgrid");
  assert.equal(send.body.providerMessageId, "sg-msg-1");
  assert.equal(send.body.sender, "ops@example.test");
});

test("notify.email sendgrid failure witnesses notify.email.send.failed and rethrows for retry", async () => {
  const emitted = [];
  const handlers = createBuiltinNotificationJobHandlers({
    world: notificationWorld(emitted),
    backendHost: "backendHost",
    runtimeConfig: {
      "notify.email.provider": "sendgrid",
      "notify.email.sendgrid.apiKey": "sg-key",
      "notify.email.sendgrid.fromAddress": "ops@example.test"
    },
    fetchImpl: async () => ({ status: 401, headers: { get: () => null } })
  });

  await assert.rejects(
    () => handlers["notify.email.deliver"]({
      actor: "adam",
      job: { id: "job-1" },
      payload: { notificationId: "notification-1" },
      attempt: 1
    }),
    /sendgrid email provider responded 401/
  );

  const failure = emitted.find(entry => entry.process === "notify.email.send.failed");
  assert.ok(failure);
  assert.equal(failure.body.transport, "sendgrid");
  assert.equal(emitted.some(entry => entry.process === "notify.email.send"), false);
});

test("builtin webhook job handlers read stored payloads and emit processed witnesses", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "builtin-webhook-job-"));
  const deliveryPath = path.join(tmp, "webhooks", "delivery-1", "payload");
  await fs.mkdir(path.dirname(deliveryPath), { recursive: true });
  await fs.writeFile(deliveryPath, JSON.stringify({ ok: true }), "utf8");
  const emitted = [];
  const world = {
    emit(entry) {
      emitted.push(entry);
      return { id: `w${emitted.length}`, ...entry };
    },
    project(projector) {
      if (projector === moduleProjectors.webhookDeliveryIndex) {
        return {
          byId: {
            "delivery-1": {
              id: "delivery-1",
              target: "stripe",
              deliveryId: "external-1",
              contentType: "application/json"
            }
          }
        };
      }
      return { byId: {} };
    }
  };

  const handlers = createBuiltinWebhookJobHandlers({
    world,
    backendHost: "backendHost",
    webhookPayloadPathFor: appContext => path.join(appContext.runtimeRoot, "webhooks", "delivery-1", "payload"),
    looksJsonContentType: value => String(value).includes("json")
  });

  const result = await handlers["webhook.inbound.process"]({
    actor: "adam",
    job: { id: "job-1" },
    payload: { webhookId: "delivery-1" },
    attempt: 2,
    appContext: { runtimeRoot: tmp }
  });

  assert.deepEqual(result, { processed: true });
  assert.equal(emitted[0].process, "webhook.inbound.processed");
  assert.deepEqual(emitted[0].body.payloadPreview, { ok: true });
});

test("builtin asset job handlers derive text and thumbnails and emit reindex witnesses", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "builtin-asset-job-"));
  const assetDir = path.join(tmp, "assets", "asset-1");
  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(path.join(assetDir, "blob"), "hello world", "utf8");
  const emitted = [];
  const world = {
    emit(entry) {
      emitted.push(entry);
      return { id: `w${emitted.length}`, ...entry };
    },
    project(projector) {
      if (projector === moduleProjectors.assetIndex) {
        return {
          byId: {
            "asset-1": {
              id: "asset-1",
              mimeType: "text/plain",
              originalName: "hello.txt",
              title: "hello.txt",
              sizeBytes: 11
            }
          }
        };
      }
      return { byId: {} };
    }
  };

  const handlers = createBuiltinAssetJobHandlers({
    world,
    backendHost: "backendHost",
    runtimeConfig: { "search.index.maxTextBytes": 100 },
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    positiveInteger: (value, fallback) => {
      const parsed = Number.parseInt(String(value ?? ""), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    },
    supportsDerivedAssetSearchText: () => true,
    extractAssetSearchText: () => ({
      text: "hello world",
      status: "extracted",
      extractor: "stub-text",
      metadata: { tokens: 2 }
    }),
    extractAssetThumbnail: () => ({
      status: "ready",
      thumbnail: { bytes: Buffer.from("<svg/>") },
      metadata: { width: 1, height: 1 }
    }),
    assetDerivedTextPathForAppContext: (appContext, assetId) => path.join(appContext.storage.assetsRoot, assetId, "derived", "text.txt"),
    assetDerivedTextStorageKey: assetId => `${assetId}/derived/text.txt`,
    assetDerivedThumbnailPathForAppContext: (appContext, assetId) => path.join(appContext.storage.assetsRoot, assetId, "derived", "thumbnail.svg"),
    assetDerivedThumbnailStorageKey: assetId => `${assetId}/derived/thumbnail.svg`,
    assetThumbnailUrlForId: assetId => `/api/assets/${assetId}/thumbnail`,
    isoAt: () => "2026-06-12T00:00:00.000Z"
  });

  await handlers["asset.ingest.process"]({
    actor: "adam",
    job: { id: "job-1" },
    payload: { assetId: "asset-1" },
    attempt: 1,
    appContext: {
      runtimeRoot: tmp,
      storage: { assetsRoot: path.join(tmp, "assets") },
      runtimeConfig: {},
      searchIndex: {
        refreshAsset: async () => ({
          ok: true,
          changed: true,
          policy: "on-ingest",
          index: {
            id: "search-1",
            title: "Search 1",
            serverRunner: "runner-1",
            provider: "memory",
            name: "main",
            sourceCount: 1,
            documentCount: 1,
            assetCount: 1,
            queryCount: 0,
            lastBuiltAt: "2026-06-12T00:00:00.000Z",
            path: path.join(tmp, "search")
          }
        })
      }
    }
  });

  assert.equal(emitted.some(entry => entry.process === "asset.ingest.start"), true);
  assert.equal(emitted.some(entry => entry.process === "search.index.reindex"), true);
  const success = emitted.find(entry => entry.process === "asset.ingest.succeeded");
  assert.equal(success.body.textStatus, "extracted");
  assert.equal(success.body.thumbnailStatus, "ready");
  assert.equal(success.body.reindexedIndexId, "search-1");
  assert.equal(await fs.readFile(path.join(tmp, "assets", "asset-1", "derived", "text.txt"), "utf8"), "hello world");
});
