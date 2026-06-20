import test from "node:test";
import assert from "node:assert/strict";

import {
  RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS,
  RUNTIME_WORKER_TRANSPORT_METHODS,
  RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION,
  createRuntimeWorkerTransportCall,
  createRuntimeWorkerTransportDescriptor,
  createRuntimeWorkerTransportResult,
  parseRuntimeWorkerTransportMessage
} from "../src/runtime-worker-transport-contract.js";

test("runtime worker transport contract defines a versioned method inventory", () => {
  assert.equal(RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION, "witness-runtime-worker-transport/v1");
  assert.equal(RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS.call, "call");
  assert.equal(RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS.result, "result");
  assert.equal(RUNTIME_WORKER_TRANSPORT_METHODS.controlDescribe, "runtime.control.describe");
  assert.equal(RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead, "runtime.process_health.read");
  assert.equal(RUNTIME_WORKER_TRANSPORT_METHODS.supervisionActivate, "runtime.supervision.activate");
  assert.equal(RUNTIME_WORKER_TRANSPORT_METHODS.supervisionQuiesce, "runtime.supervision.quiesce");
  assert.equal(RUNTIME_WORKER_TRANSPORT_METHODS.appSnapshotReload, "runtime.app_snapshot.reload");
});

test("runtime worker transport helpers round-trip call and result envelopes", () => {
  const call = createRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead,
    requestId: "req-health-1",
    args: { probe: true }
  });
  const result = createRuntimeWorkerTransportResult({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead,
    requestId: "req-health-1",
    ok: true,
    payload: { ready: true }
  });

  assert.equal(parseRuntimeWorkerTransportMessage(call)?.method, RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead);
  assert.equal(parseRuntimeWorkerTransportMessage(result)?.kind, RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS.result);
});

test("runtime worker transport descriptor hides reload when mutations are disabled", () => {
  const active = createRuntimeWorkerTransportDescriptor({ mutationsEnabled: true });
  const draining = createRuntimeWorkerTransportDescriptor({ mutationsEnabled: false });

  assert.equal(active.methods.reload, RUNTIME_WORKER_TRANSPORT_METHODS.appSnapshotReload);
  assert.equal(draining.methods.reload, null);
});

test("runtime worker transport contract rejects unknown methods", () => {
  assert.throws(
    () => createRuntimeWorkerTransportCall({ method: "runtime.unknown" }),
    /unknown runtime worker transport method/i
  );
  assert.equal(parseRuntimeWorkerTransportMessage({
    protocol: RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION,
    kind: "call",
    method: "runtime.unknown"
  }), null);
});
