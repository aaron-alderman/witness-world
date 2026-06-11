import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

const asAdam = { "x-witness-actor": "adam" };
const WEBHOOK_SECRET = "hook-secret";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, { timeoutMs = 2000, intervalMs = 15 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

async function startWebhookServer({ extra = "", runtimeConfig } = {}) {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const resolvedRuntimeConfig = runtimeConfig || `"webhook.inbound.secret" = "${WEBHOOK_SECRET}", "webhook.inbound.replayWindowMs" = 300000, "webhook.inbound.maxAttempts" = 2, "webhook.inbound.retryDelayMs" = 20, "jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 2`;
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "webhook_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
runtimeConfig = { ${resolvedRuntimeConfig} }
${extra}
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "webhook_server"
  });
  return { world, server };
}

function signWebhook({ deliveryId, timestamp, payload, secret = WEBHOOK_SECRET }) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const message = `${deliveryId}.${timestamp}.${bytes.toString("base64")}`;
  return `sha256=${createHmac("sha256", secret).update(message).digest("hex")}`;
}

function postWebhook(server, target, { body, deliveryId, timestamp, signature, contentType = "application/json" }) {
  return fetch(`${server.url}/api/webhooks/inbound/${encodeURIComponent(target)}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-witness-webhook-id": deliveryId,
      "x-witness-webhook-timestamp": timestamp,
      "x-witness-webhook-signature": signature
    },
    body
  });
}

function listWebhooks(server, headers = asAdam) {
  return fetch(`${server.url}/api/webhooks`, { headers });
}

function readWebhook(server, id, headers = asAdam) {
  return fetch(`${server.url}/api/webhooks/${encodeURIComponent(id)}`, { headers });
}

test("webhook.inbound accepts a valid signed delivery, enqueues processing, and exposes inspection endpoints", async () => {
  const { world, server } = await startWebhookServer();
  try {
    const payload = Buffer.from(JSON.stringify({ type: "invoice.paid", id: "evt_123" }));
    const deliveryId = "stripe-delivery-1";
    const timestamp = new Date().toISOString();
    const signature = signWebhook({ deliveryId, timestamp, payload });

    const response = await postWebhook(server, "stripe", {
      body: payload,
      deliveryId,
      timestamp,
      signature
    });
    const body = await response.json();
    assert.equal(response.status, 202, JSON.stringify(body));
    assert.equal(body.delivery.target, "stripe");
    assert.equal(body.delivery.signatureStatus, "verified");
    assert.equal(body.delivery.replayStatus, "accepted");
    assert(body.job?.id);

    const listed = await listWebhooks(server);
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.deliveries.length, 1);
    assert.equal(listBody.deliveries[0].id, body.delivery.id);

    const processed = await waitFor(async () => {
      const read = await readWebhook(server, body.delivery.id);
      const payloadBody = await read.json();
      return payloadBody.delivery?.status === "processed" ? payloadBody.delivery : null;
    });
    assert.equal(processed.jobId, body.job.id);
    assert.equal(processed.signatureStatus, "verified");
    assert.equal(processed.replayStatus, "accepted");

    assert(world.allWitnesses().some(witness => witness.process === "webhook.inbound.receive" && witness.body?.id === body.delivery.id));
    assert(world.allWitnesses().some(witness => witness.process === "webhook.inbound.accepted" && witness.body?.id === body.delivery.id));
    assert(world.allWitnesses().some(witness => witness.process === "webhook.inbound.processed" && witness.body?.id === body.delivery.id));
  } finally {
    await server.close();
  }
});

test("webhook.inbound rejects invalid signatures with a witnessed rejected delivery", async () => {
  const { world, server } = await startWebhookServer();
  try {
    const payload = Buffer.from(JSON.stringify({ type: "invoice.failed" }));
    const deliveryId = "stripe-delivery-invalid";
    const timestamp = new Date().toISOString();

    const response = await postWebhook(server, "stripe", {
      body: payload,
      deliveryId,
      timestamp,
      signature: "sha256=deadbeef"
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, "invalid webhook signature");
    assert.equal(body.delivery.signatureStatus, "invalid");
    assert.equal(body.delivery.status, "rejected");
    assert(world.allWitnesses().some(witness => witness.process === "webhook.inbound.verify.failed" && witness.body?.id === body.delivery.id));
  } finally {
    await server.close();
  }
});

test("webhook.inbound rejects duplicate deliveries through replay protection", async () => {
  const { world, server } = await startWebhookServer();
  try {
    const payload = Buffer.from(JSON.stringify({ type: "customer.updated" }));
    const deliveryId = "stripe-delivery-duplicate";
    const timestamp = new Date().toISOString();
    const signature = signWebhook({ deliveryId, timestamp, payload });

    const first = await postWebhook(server, "stripe", {
      body: payload,
      deliveryId,
      timestamp,
      signature
    });
    assert.equal(first.status, 202);
    const firstBody = await first.json();

    await waitFor(async () => {
      const read = await readWebhook(server, firstBody.delivery.id);
      const payloadBody = await read.json();
      return payloadBody.delivery?.status === "processed" ? payloadBody.delivery : null;
    });

    const second = await postWebhook(server, "stripe", {
      body: payload,
      deliveryId,
      timestamp,
      signature
    });
    assert.equal(second.status, 409);
    const secondBody = await second.json();
    assert.equal(secondBody.error, "duplicate delivery");
    assert.equal(secondBody.delivery.replayStatus, "duplicate");
    assert.equal(secondBody.delivery.status, "rejected");

    const accepted = world.allWitnesses().filter(witness => witness.process === "webhook.inbound.accepted" && witness.body?.deliveryId === deliveryId);
    const rejected = world.allWitnesses().filter(witness => witness.process === "webhook.inbound.replay.failed" && witness.body?.deliveryId === deliveryId);
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 1);
  } finally {
    await server.close();
  }
});

test("webhook.inbound surfaces diagnostics for rejected deliveries", async () => {
  const { server } = await startWebhookServer();
  try {
    const payload = Buffer.from(JSON.stringify({ type: "payout.failed" }));
    const deliveryId = "stripe-delivery-diagnostics";
    const timestamp = new Date().toISOString();

    const invalid = await postWebhook(server, "stripe", {
      body: payload,
      deliveryId,
      timestamp,
      signature: "sha256=bad"
    });
    assert.equal(invalid.status, 401);
    const invalidBody = await invalid.json();

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: asAdam });
    assert.equal(diagnostics.status, 200);
    const body = await diagnostics.json();
    assert.equal(body.webhooks.total, 1);
    assert.equal(body.webhooks.rejectedCount, 1);
    assert.equal(body.webhooks.deliveryRefCount, 1);
    assert.deepEqual(body.backendCapabilities.find(row => row.id === "webhook.inbound").witnessContract.externalRefs, ["deliveryId", "correlationId"]);
    assert(body.failures.webhookRejected.some(row => row.body.id === invalidBody.delivery.id));
  } finally {
    await server.close();
  }
});

test("webhook.inbound fails clearly when the signing secret is missing", async () => {
  const { world, server } = await startWebhookServer({
    runtimeConfig: `"webhook.inbound.replayWindowMs" = 300000, "jobs.queue.pollMs" = 10`
  });
  try {
    const payload = Buffer.from(JSON.stringify({ type: "missing.secret" }));
    const deliveryId = "missing-secret-delivery";
    const timestamp = new Date().toISOString();
    const signature = signWebhook({ deliveryId, timestamp, payload });

    const response = await postWebhook(server, "stripe", {
      body: payload,
      deliveryId,
      timestamp,
      signature
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "webhook.inbound.secret not configured");
    assert(world.allWitnesses().some(witness => witness.process === "webhook.inbound.receive.failed" && witness.body?.reason === "webhook.inbound.secret not configured"));
  } finally {
    await server.close();
  }
});
