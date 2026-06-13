import fs from "node:fs/promises";
import { relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

export function createBuiltinWebhookJobHandlers({
  world,
  backendHost,
  webhookPayloadPathFor,
  looksJsonContentType
}) {
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
