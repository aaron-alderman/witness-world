import assert from "node:assert/strict";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import { createPracticalBackendSupportServices } from "../src/runtime-practical-backend-support-services.js";

test("practical backend support services provide runner-scoped selectors and diagnostics", async () => {
  const world = {
    allWitnesses: () => [
      { process: "fs.stream.write", body: { sizeBytes: 3, drainCount: 1, maxChunkBytes: 3 } },
      { process: "asset.upload", body: { uploadKind: "raw", maxChunkBytes: 5 } },
      { process: "asset.ingest.failed", id: "w1", actor: "aaron", body: { reason: "boom" } }
    ],
    allObservations: () => [
      { process: "asset.content.read.failed", id: "o1", actor: "aaron", body: { reason: "missing" } }
    ],
    emit() {
      return { id: "witness-1" };
    },
    project(projector) {
      if (projector === moduleProjectors.capabilityIndex) return { byId: { "notify.email": { id: "notify.email", label: "Email" } } };
      if (projector === moduleProjectors.assets) return [{
        id: "asset-1",
        title: "Asset 1",
        visibility: "private",
        attachmentCount: 0,
        processingStatus: "dead-letter",
        textStatus: "pending",
        thumbnailStatus: "pending",
        searchStatus: "pending",
        sizeBytes: 10,
        context: "ctx.demo"
      }];
      if (projector === moduleProjectors.jobs) return [{ id: "job-1", serverRunner: "runner-1", status: "queued", handler: "notify.email.deliver" }];
      if (projector === moduleProjectors.notifications) return [
        { id: "n1", channel: "email", status: "queued", providerMessageId: "", jobId: "job-1", title: "Email 1" },
        { id: "n2", channel: "sms", status: "failed", providerMessageId: "pm-1", jobId: null, title: "SMS 1" }
      ];
      if (projector === moduleProjectors.jobIndex) return { byId: { "job-1": { id: "job-1", serverRunner: "runner-1" } } };
      if (projector === moduleProjectors.outboundRequests) return [{ id: "out-1", serverRunner: "runner-1", status: "failed", transport: "stub" }];
      if (projector === moduleProjectors.webhookDeliveries) return [{ id: "wh-1", serverRunner: "runner-1", status: "failed", replayStatus: "accepted", target: "stripe" }];
      if (projector === moduleProjectors.sqlDatasources) return [{ id: "db-1", serverRunner: "runner-1", provider: "sqlite" }];
      if (projector === moduleProjectors.sqlOperations) return [{ id: "op-1", serverRunner: "runner-1", provider: "sqlite", status: "failed" }];
      if (projector === moduleProjectors.searchIndexes) return [{ id: "idx-1", serverRunner: "runner-1", provider: "memory", status: "ready", queryCount: 2 }];
      if (projector === moduleProjectors.oauthFlows) return [{ id: "flow-1", serverRunner: "runner-1", provider: "stub", status: "failed" }];
      if (projector === moduleProjectors.oauthLinks) return [{ id: "link-1", serverRunner: "runner-1", provider: "stub", providerAccountId: "acct-1", status: "failed" }];
      if (projector === moduleProjectors.contexts) return [{ id: "ctx.demo:files" }];
      return [];
    }
  };

  const services = createPracticalBackendSupportServices({
    world,
    backendHost: "backendHost",
    currentBackendCapabilities: () => new Set(["notify.email"]),
    assetsRootFor: () => "C:/definitely-missing-assets",
    blobsRootFor: () => "C:/definitely-missing-blobs",
    assetIngestRetryUrl: id => `/api/assets/${id}/ingest/retry`,
    assetSearchReindexUrl: id => `/api/assets/${id}/search/reindex`,
    requireBackendCapabilities: () => ({ ok: true, status: 200, reason: null }),
    canMutateTarget: () => ({ ok: true, status: 200, reason: null }),
    sendGateFailure: () => {},
    sendJson: () => {},
    readJson: async () => ({}),
    normalizeNotificationRequest: () => ({ ok: false, status: 400, reason: "unused" }),
    notificationTitle: () => "Notification",
    notificationReadShape: row => row
  });

  assert.equal(services.notificationsForRunner("runner-1").length, 2);
  assert.equal(services.currentNotificationForRunner("runner-1", "n1").id, "n1");
  assert.equal(services.currentOutboundForRunner("runner-1", "out-1").id, "out-1");
  assert.equal(services.currentWebhookForRunner("runner-1", "wh-1").id, "wh-1");
  assert.equal(services.currentSqlDatasourceForRunner("runner-1", "db-1").id, "db-1");
  assert.equal(services.currentSqlOperationForRunner("runner-1", "op-1").id, "op-1");
  assert.equal(services.currentSearchIndexForRunner("runner-1", "idx-1").id, "idx-1");
  assert.equal(services.currentOauthLinkForRunner("runner-1", "link-1").id, "link-1");
  assert.equal(services.currentOauthLinkByProviderAccount("runner-1", "stub", "acct-1").id, "link-1");

  const diagnostics = await services.assetDiagnostics({
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    runtimeConfigFields: [],
    searchIndex: null
  });
  assert.deepEqual(diagnostics.capabilities, ["notify.email"]);
  assert.equal(diagnostics.assets.ingestRetryableCount, 1);
  assert.equal(diagnostics.failures.assetIngestFailed.length, 1);
  assert.equal(diagnostics.storage.assetsRootExists, false);
  assert.equal(diagnostics.storage.blobsRootExists, false);
});

test("practical backend support services gate notification enqueue through provided authority helpers", async () => {
  const observed = [];
  let gated = null;
  let sent = null;
  const world = {
    allWitnesses: () => [],
    allObservations: () => [],
    emit(entry) {
      observed.push(entry);
      return { id: "w1", ...entry };
    },
    project(projector) {
      if (projector === moduleProjectors.notifications) return [];
      if (projector === moduleProjectors.jobIndex) return { byId: {} };
      return [];
    }
  };
  const services = createPracticalBackendSupportServices({
    world,
    backendHost: "backendHost",
    currentBackendCapabilities: () => new Set(["notify.email", "jobs.queue"]),
    assetsRootFor: () => "",
    blobsRootFor: () => "",
    assetIngestRetryUrl: id => id,
    assetSearchReindexUrl: id => id,
    requireBackendCapabilities: () => ({ ok: true, status: 200, reason: null }),
    canMutateTarget: () => ({ ok: false, status: 403, reason: "forbidden" }),
    sendGateFailure: (_res, gate) => {
      gated = gate;
    },
    sendJson: (_res, status, body) => {
      sent = { status, body };
    },
    readJson: async () => ({ to: "x@example.com" }),
    normalizeNotificationRequest: () => ({ ok: true, notification: { id: "n1", to: "x@example.com", subject: "hi", text: "hello", template: null, vars: {}, context: null, delayMs: 0, maxAttempts: 3, retryDelayMs: 50, idempotencyKey: null } }),
    notificationTitle: () => "Notification",
    notificationReadShape: row => row
  });

  await services.enqueueNotification({
    channel: "email",
    req: {},
    res: {},
    requestActor: "aaron",
    appContext: { serverRunnerId: "runner-1", jobs: { enqueue: () => ({ ok: true, job: { id: "job-1" } }) } }
  });

  assert.deepEqual(gated, { ok: false, status: 403, reason: "forbidden" });
  assert.equal(sent, null);
  assert.equal(observed.some(entry => entry.process === "notify.email.enqueue.failed"), true);
});
