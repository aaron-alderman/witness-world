import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntimeWorkerControlDocument,
  RUNTIME_WORKER_CONTROL_KIND,
  RUNTIME_WORKER_CONTROL_PATH,
  RUNTIME_WORKER_CONTROL_PROTOCOL_VERSION
} from "../src/runtime-worker-control-contract.js";
import {
  RUNTIME_WORKER_TRANSPORT_METHODS,
  RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION
} from "../src/runtime-worker-transport-contract.js";

test("runtime worker control document is versioned and exposes explicit action urls", () => {
  const document = createRuntimeWorkerControlDocument({
    origin: "http://127.0.0.1:4321",
    health: {
      ready: true,
      status: "healthy",
      reasonCodes: [],
      sampledAt: "now"
    },
    supervision: {
      instanceId: "runtime-1",
      role: "active",
      mutationsEnabled: true,
      watchersEnabled: false
    }
  });

  assert.equal(document.protocol, RUNTIME_WORKER_CONTROL_PROTOCOL_VERSION);
  assert.equal(document.kind, RUNTIME_WORKER_CONTROL_KIND);
  assert.equal(document.instanceId, "runtime-1");
  assert.equal(document.actions.health.href, "http://127.0.0.1:4321/api/runtime/process-health");
  assert.equal(document.actions.activate.href, "http://127.0.0.1:4321/api/runtime/supervision/activate");
  assert.equal(document.actions.quiesce.href, "http://127.0.0.1:4321/api/runtime/supervision/quiesce");
  assert.equal(document.actions.reload.href, "http://127.0.0.1:4321/api/runtime/app-snapshot/reload");
  assert.equal(document.transport.protocol, RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION);
  assert.equal(document.transport.methods.describe, RUNTIME_WORKER_TRANSPORT_METHODS.controlDescribe);
  assert.equal(document.transport.methods.readHealth, RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead);
  assert.equal(document.transport.methods.activate, RUNTIME_WORKER_TRANSPORT_METHODS.supervisionActivate);
  assert.equal(document.transport.methods.reload, RUNTIME_WORKER_TRANSPORT_METHODS.appSnapshotReload);
  assert.equal(new URL(document.actions.health.href).origin + RUNTIME_WORKER_CONTROL_PATH, "http://127.0.0.1:4321/api/runtime/worker-control");
});

test("runtime worker control document hides reload action when mutations are disabled", () => {
  const document = createRuntimeWorkerControlDocument({
    origin: "http://127.0.0.1:4321",
    health: {
      ready: false,
      status: "draining",
      reasonCodes: ["runtime_not_ready"],
      sampledAt: "later"
    },
    supervision: {
      instanceId: "runtime-2",
      role: "draining",
      mutationsEnabled: false,
      watchersEnabled: false
    }
  });

  assert.equal(document.reloadUrl, null);
  assert.equal(document.actions.reload, null);
  assert.equal(document.transport.protocol, RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION);
  assert.equal(document.transport.methods.reload, null);
  assert.equal(document.role, "draining");
  assert.deepEqual(document.reasonCodes, ["runtime_not_ready"]);
});
