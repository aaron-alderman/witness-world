import test from "node:test";
import assert from "node:assert/strict";
import { bundleId, handlerCatalog, routes, createHandlers } from "./runtime.js";
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
