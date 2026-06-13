import fs from "node:fs/promises";
import path from "node:path";
import { relation, thing } from "../../src/kernel.js";

export function createWebhookHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  readBody,
  normalizeWebhookDelivery,
  webhookTitle,
  verifyWebhookSignature,
  webhookReadShape,
  currentWebhookForRunner,
  webhookDeliveriesForRunner,
  webhookPayloadPathFor
}) {
  return {
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
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id, appContext) ?? {
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
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id, appContext) ?? {
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

      const duplicate = webhookDeliveriesForRunner(delivery.serverRunner, appContext).find(row =>
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
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id, appContext) ?? {
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
        delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id, appContext) ?? {
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
      const deliveries = webhookDeliveriesForRunner(serverRunnerId, appContext).map(webhookReadShape);
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
      const delivery = currentWebhookForRunner(serverRunnerId, params.id || "", appContext);
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
    }
  };
}
