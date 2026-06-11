import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

const asAdam = { "x-witness-actor": "adam", "content-type": "application/json" };

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

async function startNotifyServer(extra = "") {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "notify_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
runtimeConfig = { "jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 30, "jobs.queue.maxAttempts" = 3, "notify.email.stubSender" = "mailer@stub.test", "notify.sms.stubSender" = "stub-sender" }
${extra}
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "notify_server"
  });
  return { world, server };
}

function postEmail(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/notify/email`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function postSms(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/notify/sms`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function readNotification(server, id, headers = asAdam) {
  return fetch(`${server.url}/api/notifications/${encodeURIComponent(id)}`, { headers });
}

function listNotifications(server, headers = asAdam) {
  return fetch(`${server.url}/api/notifications`, { headers });
}

test("notify.email enqueues, renders preview, sends through the stub transport, and exposes inspection endpoints", async () => {
  const { world, server } = await startNotifyServer();
  try {
    const response = await postEmail(server, {
      to: "aaron@example.test",
      subject: "Welcome",
      template: "Hello {{name}}",
      vars: { name: "Aaron" }
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.notification.channel, "email");
    assert.equal(body.notification.status, "queued");

    const sent = await waitFor(async () => {
      const read = await readNotification(server, body.notification.id);
      const payload = await read.json();
      return payload.notification?.status === "sent" ? payload.notification : null;
    });

    assert.equal(sent.preview, "Hello Aaron");
    assert.equal(sent.sender, "mailer@stub.test");
    assert.match(sent.providerMessageId, /^stub-email-/);

    const listed = await listNotifications(server);
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.notifications.length, 1);
    assert.equal(listBody.notifications[0].id, sent.id);

    assert(world.allWitnesses().some(witness => witness.process === "notify.email.enqueue" && witness.body?.id === sent.id));
    assert(world.allWitnesses().some(witness => witness.process === "notify.email.render" && witness.body?.id === sent.id));
    assert(world.allWitnesses().some(witness => witness.process === "notify.email.send" && witness.body?.id === sent.id));
  } finally {
    await server.close();
  }
});

test("notify.email retries render failures and ends in failed notification state after dead-letter", async () => {
  const { world, server } = await startNotifyServer();
  try {
    const response = await postEmail(server, {
      to: "aaron@example.test",
      subject: "Broken",
      template: "Hello {{name}}",
      vars: {},
      maxAttempts: 2,
      retryDelayMs: 30
    });
    assert.equal(response.status, 201);
    const body = await response.json();

    const failed = await waitFor(async () => {
      const read = await readNotification(server, body.notification.id);
      const payload = await read.json();
      return payload.notification?.status === "failed" ? payload.notification : null;
    });

    assert.match(failed.lastError || "", /missing template variable: name/);
    const renderFailures = world.allWitnesses().filter(witness => witness.process === "notify.email.render.failed" && witness.body?.id === failed.id);
    const deadLetters = world.allWitnesses().filter(witness => witness.process === "jobs.queue.deadLetter" && witness.body?.id === failed.jobId);
    assert.equal(renderFailures.length, 2);
    assert.equal(deadLetters.length, 1);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.notifications.failedCount, 1);
    assert(diagnosticsBody.failures.notifyEmailRenderFailed.some(row => row.body.id === failed.id));
  } finally {
    await server.close();
  }
});

test("notify.sms enqueues and delivers a stub message with preview text", async () => {
  const { world, server } = await startNotifyServer();
  try {
    const response = await postSms(server, {
      to: "+61400000000",
      text: "Code 123456"
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.notification.channel, "sms");

    const sent = await waitFor(async () => {
      const read = await readNotification(server, body.notification.id);
      const payload = await read.json();
      return payload.notification?.status === "sent" ? payload.notification : null;
    });

    assert.equal(sent.preview, "Code 123456");
    assert.equal(sent.sender, "stub-sender");
    assert.match(sent.providerMessageId, /^stub-sms-/);
    assert(world.allWitnesses().some(witness => witness.process === "notify.sms.send" && witness.body?.id === sent.id));
  } finally {
    await server.close();
  }
});

test("notify.sms retries render failures and ends in failed notification state after dead-letter", async () => {
  const { world, server } = await startNotifyServer();
  try {
    const response = await postSms(server, {
      to: "+61400000000",
      template: "Code {{code}}",
      vars: {},
      maxAttempts: 2,
      retryDelayMs: 30
    });
    assert.equal(response.status, 201);
    const body = await response.json();

    const failed = await waitFor(async () => {
      const read = await readNotification(server, body.notification.id);
      const payload = await read.json();
      return payload.notification?.status === "failed" ? payload.notification : null;
    });

    assert.match(failed.lastError || "", /missing template variable: code/);
    const renderFailures = world.allWitnesses().filter(witness => witness.process === "notify.sms.render.failed" && witness.body?.id === failed.id);
    const deadLetters = world.allWitnesses().filter(witness => witness.process === "jobs.queue.deadLetter" && witness.body?.id === failed.jobId);
    assert.equal(renderFailures.length, 2);
    assert.equal(deadLetters.length, 1);
  } finally {
    await server.close();
  }
});
