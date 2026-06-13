import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

function defaultWebhookDeliveryRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    target: null,
    deliveryId: null,
    contentType: null,
    sizeBytes: null,
    storageKey: null,
    signatureStatus: null,
    replayStatus: null,
    status: "received",
    receivedAt: null,
    timestamp: null,
    correlationId: null,
    jobId: null,
    lastError: null
  };
}

export function webhookDeliveries(witnesses) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses);
  const modules = moduleProjectors.modules(witnesses);
  const jobIndex = moduleProjectors.jobIndex(witnesses).byId;
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "webhookDelivery") continue;
    rows.set(id, defaultWebhookDeliveryRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("webhook.inbound.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultWebhookDeliveryRow(id, { titles, owners, contexts });
    row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.target = typeof witness.body.target === "string" ? witness.body.target : row.target;
    row.deliveryId = typeof witness.body.deliveryId === "string" ? witness.body.deliveryId : row.deliveryId;
    row.contentType = typeof witness.body.contentType === "string" ? witness.body.contentType : row.contentType;
    row.sizeBytes = Number.isFinite(witness.body.sizeBytes) ? witness.body.sizeBytes : row.sizeBytes;
    row.storageKey = typeof witness.body.storageKey === "string" ? witness.body.storageKey : row.storageKey;
    row.receivedAt = typeof witness.body.receivedAt === "string" ? witness.body.receivedAt : row.receivedAt;
    row.timestamp = typeof witness.body.timestamp === "string" ? witness.body.timestamp : row.timestamp;
    row.correlationId = typeof witness.body.correlationId === "string" ? witness.body.correlationId : row.correlationId;
    row.jobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.jobId;
    row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
    if (witness.process === "webhook.inbound.receive") row.status = "received";
    if (witness.process === "webhook.inbound.verify.failed") {
      row.signatureStatus = "invalid";
      row.status = "rejected";
    }
    if (witness.process === "webhook.inbound.replay.failed") {
      row.signatureStatus = row.signatureStatus ?? "verified";
      row.replayStatus = "duplicate";
      row.status = "rejected";
    }
    if (witness.process === "webhook.inbound.accepted") {
      row.signatureStatus = "verified";
      row.replayStatus = "accepted";
      row.status = "accepted";
    }
    if (witness.process === "webhook.inbound.processed") {
      row.signatureStatus = "verified";
      row.replayStatus = row.replayStatus ?? "accepted";
      row.status = "processed";
    }
    if (witness.process === "webhook.inbound.process.failed") {
      row.signatureStatus = "verified";
      row.replayStatus = row.replayStatus ?? "accepted";
    }
    row.title = titles.get(id) ?? row.target ?? row.deliveryId ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()]
    .map(row => {
      const job = row.jobId ? jobIndex[row.jobId] ?? null : null;
      let status = row.status;
      if (job?.status === "running") status = "running";
      else if (job?.status === "queued") status = "queued";
      else if (job?.status === "dead-letter") status = "failed";
      else if (job?.status === "succeeded" && row.status !== "processed") status = "processed";
      return {
        ...row,
        status,
        attempt: job?.attempt ?? 0,
        maxAttempts: job?.maxAttempts ?? null,
        retryDelayMs: job?.retryDelayMs ?? null,
        lastError: row.lastError ?? job?.lastError ?? null
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function webhookDeliveryIndex(witnesses) {
  const rows = webhookDeliveries(witnesses);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const webhookModuleProjectors = Object.freeze({
  webhookDeliveries,
  webhookDeliveryIndex
});
