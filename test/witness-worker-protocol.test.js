import assert from "node:assert/strict";
import test from "node:test";
import {
  WITNESS_WORKER_KINDS,
  WITNESS_WORKER_OPERATIONS,
  WITNESS_WORKER_PROTOCOL_VERSION,
  createBuildWorkerResultEnvelope,
  createWorkerResultEnvelope,
  parseWorkerEnvelope
} from "../src/witness-worker-protocol.js";

test("worker protocol emits a versioned build-result envelope with non-canonical scratch metadata", () => {
  const envelope = createBuildWorkerResultEnvelope({
    ok: true,
    appRoot: "C:/tmp/app",
    computeModuleCount: 1,
    computeModules: [{ id: "demo.module", success: true }]
  });

  assert.equal(envelope.protocol, WITNESS_WORKER_PROTOCOL_VERSION);
  assert.equal(envelope.kind, WITNESS_WORKER_KINDS.result);
  assert.equal(envelope.operation, WITNESS_WORKER_OPERATIONS.build);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.payload?.computeModuleCount, 1);
  assert.equal(envelope.metadata?.workerClass, "node-build-worker");
  assert.equal(envelope.metadata?.canonicalStateAccess, "none");
  assert.equal(envelope.metadata?.scratchState, "worker-local");
  assert.equal(envelope.error, null);
});

test("worker protocol preserves structured failure information for build results", () => {
  const envelope = createBuildWorkerResultEnvelope({
    ok: false,
    error: "compile failed",
    computeModuleCount: 1,
    computeModules: [{ id: "demo.module", success: false, error: "compile failed" }]
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.error?.message, "compile failed");
  assert.equal(envelope.payload?.computeModules?.[0]?.success, false);
});

test("worker protocol parser rejects non-protocol payloads and accepts matching envelopes", () => {
  assert.equal(parseWorkerEnvelope({ ok: true }), null);

  const envelope = createWorkerResultEnvelope({
    operation: WITNESS_WORKER_OPERATIONS.inspect,
    ok: true,
    payload: { target: "surface.main" }
  });
  const reparsed = parseWorkerEnvelope(JSON.stringify(envelope));
  assert.equal(reparsed?.protocol, WITNESS_WORKER_PROTOCOL_VERSION);
  assert.equal(reparsed?.operation, WITNESS_WORKER_OPERATIONS.inspect);
  assert.equal(reparsed?.payload?.target, "surface.main");
});
