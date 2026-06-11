import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

const asAdam = { "x-witness-actor": "adam", "content-type": "application/json" };

async function startOutboundServer(extra = "") {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "outbound_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
runtimeConfig = { serviceToken = { value = "super-secret-token", expose = false }, "http.outbound.timeoutMs" = 40, "http.outbound.retryDelayMs" = 15, "http.outbound.maxAttempts" = 2 }
${extra}
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "outbound_server"
  });
  return { world, server };
}

function postOutbound(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/http/outbound`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function listOutbound(server, headers = asAdam) {
  return fetch(`${server.url}/api/http/outbound`, { headers });
}

function readOutbound(server, id, headers = asAdam) {
  return fetch(`${server.url}/api/http/outbound/${encodeURIComponent(id)}`, { headers });
}

test("http.outbound sends a stub request with config-backed bearer auth and exposes inspection endpoints", async () => {
  const { world, server } = await startOutboundServer();
  try {
    const response = await postOutbound(server, {
      target: "crm.sync",
      url: "stub://echo",
      method: "POST",
      json: { hello: "world" },
      auth: { kind: "bearer", configKey: "serviceToken" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.outbound.status, "succeeded");
    assert.equal(body.outbound.authKind, "bearer");
    assert.equal(body.outbound.authConfigKey, "serviceToken");
    assert.equal(body.response.status, 200);
    assert.equal(body.response.json.receivedHeaders.authorization, "[redacted]");
    assert.equal(body.response.json.auth.kind, "bearer");
    assert.equal(body.response.json.auth.configKey, "serviceToken");
    assert.equal(body.response.json.body.hello, "world");
    assert.match(body.outbound.externalRefId, /^stub-outbound-/);

    const listed = await listOutbound(server);
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.outbound.length, 1);
    assert.equal(listBody.outbound[0].id, body.outbound.id);

    const read = await readOutbound(server, body.outbound.id);
    assert.equal(read.status, 200);
    const readBody = await read.json();
    assert.equal(readBody.outbound.target, "crm.sync");
    assert.equal(readBody.outbound.responseStatus, 200);

    assert(world.allWitnesses().some(witness => witness.process === "http.outbound.request" && witness.body?.id === body.outbound.id));
    assert(world.allWitnesses().some(witness => witness.process === "http.outbound.attempt" && witness.body?.id === body.outbound.id));
    assert(world.allWitnesses().some(witness => witness.process === "http.outbound.succeeded" && witness.body?.id === body.outbound.id));
  } finally {
    await server.close();
  }
});

test("http.outbound retries a retryable stub failure before succeeding", async () => {
  const { world, server } = await startOutboundServer();
  try {
    const response = await postOutbound(server, {
      target: "partner.sync",
      url: "stub://flaky/retry?failures=1&status=503",
      method: "POST",
      text: "payload",
      maxAttempts: 3,
      retryDelayMs: 10
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.outbound.status, "succeeded");
    assert.equal(body.outbound.attempt, 2);
    assert.equal(body.response.json.attempt, 2);

    const retries = world.allWitnesses().filter(witness => witness.process === "http.outbound.retry" && witness.body?.id === body.outbound.id);
    const successes = world.allWitnesses().filter(witness => witness.process === "http.outbound.succeeded" && witness.body?.id === body.outbound.id);
    assert.equal(retries.length, 1);
    assert.equal(successes.length, 1);
  } finally {
    await server.close();
  }
});

test("http.outbound times out, retries, records failure, and surfaces diagnostics", async () => {
  const { world, server } = await startOutboundServer();
  try {
    const response = await postOutbound(server, {
      target: "slow.sync",
      url: "stub://timeout/80",
      method: "GET",
      timeoutMs: 20,
      maxAttempts: 2,
      retryDelayMs: 10
    });
    assert.equal(response.status, 504);
    const body = await response.json();
    assert.equal(body.error, "outbound timeout");
    assert.equal(body.outbound.status, "failed");
    assert.equal(body.outbound.attempt, 2);

    const read = await readOutbound(server, body.outbound.id);
    assert.equal(read.status, 200);
    const readBody = await read.json();
    assert.equal(readBody.outbound.status, "failed");
    assert.equal(readBody.outbound.lastError, "outbound timeout");

    const retries = world.allWitnesses().filter(witness => witness.process === "http.outbound.retry" && witness.body?.id === body.outbound.id);
    const failures = world.allWitnesses().filter(witness => witness.process === "http.outbound.failed" && witness.body?.id === body.outbound.id);
    assert.equal(retries.length, 1);
    assert.equal(failures.length, 1);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.outbound.total, 1);
    assert.equal(diagnosticsBody.outbound.failedCount, 1);
    assert.equal(diagnosticsBody.outbound.externalRefCount, 1);
    assert.deepEqual(diagnosticsBody.backendCapabilities.find(row => row.id === "http.outbound").witnessContract.externalRefs, ["externalRefId", "correlationId"]);
    assert(diagnosticsBody.failures.httpOutboundFailed.some(row => row.body.id === body.outbound.id));
  } finally {
    await server.close();
  }
});

test("http.outbound rejects auth that references a missing runtime config value", async () => {
  const { world, server } = await startOutboundServer();
  try {
    const response = await postOutbound(server, {
      target: "bad.auth",
      url: "stub://echo",
      auth: { kind: "bearer", configKey: "missingToken" }
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "runtime config value missing for missingToken");
    assert(world.allWitnesses().some(witness => witness.process === "http.outbound.request.failed" && witness.body?.reason === "runtime config value missing for missingToken"));
  } finally {
    await server.close();
  }
});
