import assert from "node:assert/strict";
import test from "node:test";
import {
  WITNESS_WORKER_CANONICAL_STATE_ACCESS,
  WITNESS_WORKER_KINDS,
  WITNESS_WORKER_OPERATIONS,
  WITNESS_WORKER_PROTOCOL_VERSION,
  WITNESS_WORKER_SCRATCH_STATE,
  createBuildWorkerResultEnvelope,
  createWorkerEventEnvelope,
  createWorkerRequestEnvelope,
  createWorkerResultEnvelope,
  getWorkerOperationProfile,
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

test("worker protocol defines request envelopes and operation profiles for non-build worker classes", () => {
  const renderProfile = getWorkerOperationProfile(WITNESS_WORKER_OPERATIONS.render);
  assert.equal(renderProfile.workerClass, "node-render-worker");
  assert.equal(renderProfile.canonicalStateAccess, WITNESS_WORKER_CANONICAL_STATE_ACCESS.delegatedReadOnly);
  assert.equal(renderProfile.scratchState, WITNESS_WORKER_SCRATCH_STATE.workerLocal);

  const request = createWorkerRequestEnvelope({
    operation: WITNESS_WORKER_OPERATIONS.render,
    requestId: "req-render-1",
    payload: { route: "/live-core" }
  });
  assert.equal(request.protocol, WITNESS_WORKER_PROTOCOL_VERSION);
  assert.equal(request.kind, WITNESS_WORKER_KINDS.request);
  assert.equal(request.requestId, "req-render-1");
  assert.equal(request.metadata?.workerClass, "node-render-worker");
  assert.equal(request.metadata?.canonicalStateAccess, WITNESS_WORKER_CANONICAL_STATE_ACCESS.delegatedReadOnly);
});

test("worker protocol defines event envelopes and requires explicit state metadata", () => {
  const event = createWorkerEventEnvelope({
    operation: WITNESS_WORKER_OPERATIONS.evaluate,
    requestId: "req-evaluate-1",
    eventName: "progress",
    payload: { phase: "load" }
  });
  assert.equal(event.kind, WITNESS_WORKER_KINDS.event);
  assert.equal(event.eventName, "progress");
  assert.equal(event.metadata?.workerClass, "node-evaluate-worker");

  assert.equal(parseWorkerEnvelope({
    protocol: WITNESS_WORKER_PROTOCOL_VERSION,
    kind: WITNESS_WORKER_KINDS.result,
    operation: WITNESS_WORKER_OPERATIONS.inspect,
    ok: true,
    payload: { target: "surface.main" },
    error: null,
    warnings: [],
    metadata: {
      workerClass: "node-inspect-worker",
      canonicalStateAccess: "invalid",
      scratchState: WITNESS_WORKER_SCRATCH_STATE.workerLocal
    }
  }), null);
});
