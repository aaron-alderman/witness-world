import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { providers as jobProviders } from "../jobs/runtime.js";
import { bundleId, handlerCatalog, providers, routes, createHandlers } from "./runtime.js";
import { createWebhookIoServices, webhookPayloadPathFor } from "./io-services.js";

test("webhooks plugin owns webhook.inbound catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-webhooks");
  assert.equal(handlerCatalog.dispatchHandlers.includes("webhook.inbound.receive"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("webhook.inbound.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("webhook.inbound.read"), true);
  assert.equal(routes.some(route => route.handler === "webhook.inbound.receive"), true);
  assert.equal(routes.some(route => route.handler === "webhook.inbound.list"), true);
  assert.equal(typeof createHandlers, "function");
});

test("webhooks plugin owns webhook IO normalization helpers", () => {
  const services = createWebhookIoServices({
    runtimeConfigLookup: (config, key) => config?.[key],
    runtimeConfigScalar: value => ["string", "number", "boolean"].includes(typeof value),
    positiveInteger: (value, fallback) => Number.isInteger(value) && value > 0 ? value : fallback,
    isoAt: timestamp => new Date(timestamp).toISOString(),
    randomUUID: () => "fixed",
    headerValue: value => Array.isArray(value) ? String(value[0] || "") : String(value || "")
  });
  assert.equal(typeof services.normalizeWebhookDelivery, "function");
  assert.equal(typeof services.verifyWebhookSignature, "function");
  assert.match(webhookPayloadPathFor({ runtimeRoot: "C:/runtime" }, "webhook:1"), /webhooks[\\/]webhook%3A1[\\/]payload$/);
});

test("webhooks plugin registers webhook delivery read-model projectors", () => withRegisteredPluginProjectors([jobProviders, providers], () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "webhook.demo" });
  world.emit({
    process: "defineWebhookDelivery",
    actor: "system",
    claims: [
      relation("webhook.demo", "hasModuleKind", "webhookDelivery"),
      relation("webhook.demo", "hasTitle", "Demo Webhook")
    ],
    body: { id: "webhook.demo" }
  });
  world.emit({
    process: "jobs.queue.succeeded",
    actor: "system",
    body: {
      id: "job.webhook.demo",
      attempt: 1,
      maxAttempts: 3,
      retryDelayMs: 500
    }
  });
  world.emit({
    process: "webhook.inbound.accepted",
    actor: "system",
    body: {
      id: "webhook.demo",
      context: "ctx.demo",
      serverRunner: "runner.demo",
      target: "stripe",
      deliveryId: "evt_1",
      contentType: "application/json",
      sizeBytes: 42,
      storageKey: "webhooks/webhook.demo/payload",
      receivedAt: "2026-06-13T00:00:00.000Z",
      timestamp: "2026-06-13T00:00:00.000Z",
      correlationId: "corr-1",
      jobId: "job.webhook.demo"
    }
  });

  assert.deepEqual(world.project(moduleProjectors.webhookDeliveries), [{
    id: "webhook.demo",
    title: "Demo Webhook",
    owner: "system",
    context: "ctx.demo",
    serverRunner: "runner.demo",
    target: "stripe",
    deliveryId: "evt_1",
    contentType: "application/json",
    sizeBytes: 42,
    storageKey: "webhooks/webhook.demo/payload",
    signatureStatus: "verified",
    replayStatus: "accepted",
    status: "processed",
    receivedAt: "2026-06-13T00:00:00.000Z",
    timestamp: "2026-06-13T00:00:00.000Z",
    correlationId: "corr-1",
    jobId: "job.webhook.demo",
    lastError: null,
    attempt: 1,
    maxAttempts: 3,
    retryDelayMs: 500
  }]);
  assert.equal(world.project(moduleProjectors.webhookDeliveryIndex).byId["webhook.demo"].target, "stripe");
}));
