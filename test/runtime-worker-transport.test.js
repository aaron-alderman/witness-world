import assert from "node:assert/strict";
import test from "node:test";

import { executeRuntimeWorkerTransportCall } from "../src/runtime-worker-transport.js";
import { RUNTIME_WORKER_TRANSPORT_METHODS } from "../src/runtime-worker-transport-contract.js";

function createHealthMonitor() {
  return {
    snapshot() {
      return {
        ready: true,
        status: "healthy",
        reasonCodes: [],
        sampledAt: "now"
      };
    }
  };
}

test("runtime worker transport reads health and mutates supervision without HTTP route coupling", async () => {
  let syncCalls = 0;
  const supervision = {
    instanceId: "runtime-1",
    role: "active",
    mutationsEnabled: true,
    watchersEnabled: true
  };
  const runtimeContext = {
    devMode: true,
    runtimeSupervision: supervision,
    appSnapshotManager: {
      setWatcherMode() {}
    }
  };
  const appContext = {
    runtimeSupervision: supervision
  };

  const health = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead,
    runtimeContext,
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(health.status, 200);
  assert.equal(health.body.instanceId, "runtime-1");
  assert.equal(health.body.mutationsEnabled, true);

  const quiesced = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.supervisionQuiesce,
    runtimeContext,
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor(),
    syncLocalSnapshotPoller: () => {
      syncCalls += 1;
    }
  });
  assert.equal(quiesced.status, 200);
  assert.equal(quiesced.body.role, "draining");
  assert.equal(quiesced.body.mutationsEnabled, false);
  assert.equal(quiesced.body.watchersEnabled, false);

  const activated = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.supervisionActivate,
    runtimeContext,
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor(),
    syncLocalSnapshotPoller: () => {
      syncCalls += 1;
    }
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.body.role, "active");
  assert.equal(activated.body.mutationsEnabled, true);
  assert.equal(activated.body.watchersEnabled, false);
  assert.equal(syncCalls, 2);
});

test("runtime worker transport reloads snapshots through shared dispatcher semantics", async () => {
  const calls = [];
  const snapshotManager = {
    appRoot: "C:/runtime/app",
    appRevision: 12,
    buildErrors: [],
    async markDirtyPaths(paths, meta) {
      calls.push({ kind: "markDirtyPaths", paths, meta });
      return { appRevision: 13 };
    },
    async ensureFresh(meta) {
      calls.push({ kind: "ensureFresh", meta });
      return { appRevision: 14 };
    }
  };
  const runtimeContext = {
    appSnapshotManager: snapshotManager
  };
  const appContext = {
    appSnapshotManager: snapshotManager,
    runtimeSupervision: {
      instanceId: "runtime-1",
      role: "active",
      mutationsEnabled: true,
      watchersEnabled: false
    }
  };

  const dirtyReload = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.appSnapshotReload,
    args: { paths: ["app/content.wtoml"] },
    runtimeContext,
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(dirtyReload.status, 200);
  assert.equal(dirtyReload.body.appRevision, 13);
  assert.deepEqual(dirtyReload.body.changedSources, ["app/content.wtoml"]);

  const freshReload = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.appSnapshotReload,
    args: {},
    runtimeContext,
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(freshReload.status, 200);
  assert.equal(freshReload.body.appRevision, 14);
  assert.equal(calls[0].kind, "markDirtyPaths");
  assert.equal(calls[0].meta.trigger, "reload");
  assert.equal(calls[1].kind, "ensureFresh");
  assert.equal(calls[1].meta.trigger, "reload");
});
