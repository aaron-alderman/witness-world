import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

const asAdam = { "x-witness-actor": "adam", "content-type": "application/json" };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, { timeoutMs = 1500, intervalMs = 15 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

async function startJobsServer(extra = "") {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "jobs_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
runtimeConfig = { "jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 30, "jobs.queue.maxAttempts" = 3 }
${extra}
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "jobs_server"
  });
  return { world, server };
}

function postJob(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function getJob(server, id, headers = asAdam) {
  return fetch(`${server.url}/api/jobs/${encodeURIComponent(id)}`, { headers });
}

function listJobs(server, headers = asAdam) {
  return fetch(`${server.url}/api/jobs`, { headers });
}

test("jobs.queue executes a queued job and exposes succeeded status through the host", async () => {
  const { world, server } = await startJobsServer();
  try {
    const response = await postJob(server, { handler: "demo.echo", payload: { message: "hello" } });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.created, true);
    assert.equal(body.job.handler, "demo.echo");

    const listed = await listJobs(server);
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.jobs.length, 1);
    assert.equal(listBody.jobs[0].id, body.job.id);

    const job = await waitFor(async () => {
      const read = await getJob(server, body.job.id);
      const payload = await read.json();
      return payload.job?.status === "succeeded" ? payload.job : null;
    });

    assert.equal(job.status, "succeeded");
    assert(world.allWitnesses().some(witness => witness.process === "demo.job.echo" && witness.body?.job === job.id));
    assert(world.allWitnesses().some(witness => witness.process === "jobs.queue.succeeded" && witness.body?.id === job.id));
  } finally {
    await server.close();
  }
});

test("jobs.queue honors idempotency keys and delayed execution", async () => {
  const { server } = await startJobsServer();
  try {
    const first = await postJob(server, {
      handler: "demo.echo",
      payload: { name: "delayed" },
      delayMs: 120,
      idempotencyKey: "upload:alpha"
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.created, true);

    const second = await postJob(server, {
      handler: "demo.echo",
      payload: { name: "delayed" },
      delayMs: 120,
      idempotencyKey: "upload:alpha"
    });
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.created, false);
    assert.equal(secondBody.job.id, firstBody.job.id);

    const immediateRead = await getJob(server, firstBody.job.id);
    const immediateBody = await immediateRead.json();
    assert.equal(immediateBody.job.status, "queued");
    assert.equal(immediateBody.job.idempotencyKey, "upload:alpha");

    await sleep(40);
    const stillQueued = await getJob(server, firstBody.job.id);
    const stillQueuedBody = await stillQueued.json();
    assert.equal(stillQueuedBody.job.status, "queued");

    const succeeded = await waitFor(async () => {
      const read = await getJob(server, firstBody.job.id);
      const payload = await read.json();
      return payload.job?.status === "succeeded" ? payload.job : null;
    }, { timeoutMs: 2000 });
    assert.equal(succeeded.id, firstBody.job.id);
  } finally {
    await server.close();
  }
});

test("jobs.queue retries with witnessed backoff before succeeding", async () => {
  const { world, server } = await startJobsServer();
  try {
    const response = await postJob(server, {
      handler: "demo.failOnce",
      payload: { key: "retry-once" },
      retryDelayMs: 40,
      maxAttempts: 3
    });
    assert.equal(response.status, 201);
    const body = await response.json();

    const job = await waitFor(async () => {
      const read = await getJob(server, body.job.id);
      const payload = await read.json();
      return payload.job?.status === "succeeded" ? payload.job : null;
    }, { timeoutMs: 2000 });

    assert.equal(job.attempt, 2);
    const starts = world.allWitnesses().filter(witness => witness.process === "jobs.queue.start" && witness.body?.id === job.id);
    const retries = world.allWitnesses().filter(witness => witness.process === "jobs.queue.retry" && witness.body?.id === job.id);
    const succeeded = world.allWitnesses().find(witness => witness.process === "jobs.queue.succeeded" && witness.body?.id === job.id);
    assert.equal(starts.length, 2);
    assert.equal(retries.length, 1);
    assert.equal(retries[0].body.delayMs, 40);
    assert.equal(succeeded?.body?.attempt, 2);
  } finally {
    await server.close();
  }
});

test("jobs.queue dead-letters exhausted jobs and surfaces diagnostics", async () => {
  const { world, server } = await startJobsServer();
  try {
    const response = await postJob(server, {
      handler: "demo.alwaysFail",
      payload: { key: "dead-letter" },
      retryDelayMs: 30,
      maxAttempts: 2
    });
    assert.equal(response.status, 201);
    const body = await response.json();

    const job = await waitFor(async () => {
      const read = await getJob(server, body.job.id);
      const payload = await read.json();
      return payload.job?.status === "dead-letter" ? payload.job : null;
    }, { timeoutMs: 2000 });

    assert.equal(job.status, "dead-letter");
    const retries = world.allWitnesses().filter(witness => witness.process === "jobs.queue.retry" && witness.body?.id === job.id);
    const deadLetters = world.allWitnesses().filter(witness => witness.process === "jobs.queue.deadLetter" && witness.body?.id === job.id);
    assert.equal(retries.length, 1);
    assert.equal(retries[0].body.delayMs, 30);
    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0].body.attempt, 2);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.jobs.deadLetterCount, 1);
    assert(diagnosticsBody.failures.jobDeadLetter.some(row => row.body.id === job.id));
  } finally {
    await server.close();
  }
});
