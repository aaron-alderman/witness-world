import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";

import { createRuntimeWorkerControlClient } from "../src/runtime-worker-control-client.js";
import { executeRuntimeWorkerTransportCall } from "../src/runtime-worker-transport.js";
import {
  RUNTIME_WORKER_TRANSPORT_METHODS,
  createRuntimeWorkerTransportCall
} from "../src/runtime-worker-transport-contract.js";

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
    args: { paths: ["app/content.wtoml"], trigger: "core" },
    runtimeContext,
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(dirtyReload.status, 200);
  assert.equal(dirtyReload.body.appRevision, 13);
  assert.deepEqual(dirtyReload.body.changedSources, ["app/content.wtoml"]);
  assert.equal(dirtyReload.body.trigger, "core");

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
  assert.equal(calls[0].meta.trigger, "core");
  assert.equal(calls[1].kind, "ensureFresh");
  assert.equal(calls[1].meta.trigger, "reload");
});

test("runtime worker transport reads app and backend revision payloads without HTTP listener coupling", async () => {
  const snapshotManager = {
    getLastRevisionEvent() {
      return {
        appRevision: 14,
        changedSources: ["app/content.wtoml"],
        trigger: "core",
        status: "active",
        branchId: "branch-live",
        changeSetId: "change-live"
      };
    }
  };
  const appContext = {
    devMode: true,
    appSnapshotManager: snapshotManager
  };

  const appRevision = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.appRevisionRead,
    runtimeContext: { appSnapshotManager: snapshotManager },
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(appRevision.status, 200);
  assert.equal(appRevision.body.appRevision, 14);
  assert.deepEqual(appRevision.body.changedSources, ["app/content.wtoml"]);

  const backendRevision = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.backendRevisionRead,
    runtimeContext: { appSnapshotManager: snapshotManager },
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(backendRevision.status, 200);
  assert.equal(backendRevision.body.revision, 14);
  assert.equal(backendRevision.body.branch, "branch-live");
  assert.equal(backendRevision.body.changeSet, "change-live");
});

test("runtime worker transport reads preview-session event payloads without HTTP listener coupling", async () => {
  const calls = [];
  const previewManager = {
    async hydrateSession(sessionId) {
      calls.push({ kind: "hydrate", sessionId });
    },
    readSession(sessionId) {
      if (sessionId === "missing") return null;
      return {
        event: {
          id: sessionId,
          previewRevision: 3,
          status: "active",
          changedSources: ["app/content.wtoml"]
        }
      };
    }
  };

  const present = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.appPreviewSessionEventRead,
    args: { previewSessionId: "preview-1" },
    runtimeContext: { appPreviewSessionManager: previewManager },
    appContext: { appPreviewSessionManager: previewManager },
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(present.status, 200);
  assert.equal(present.body.id, "preview-1");
  assert.equal(present.body.previewRevision, 3);

  const missing = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.appPreviewSessionEventRead,
    args: { previewSessionId: "missing" },
    runtimeContext: { appPreviewSessionManager: previewManager },
    appContext: { appPreviewSessionManager: previewManager },
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(missing.status, 404);
  assert.match(String(missing.body?.error ?? ""), /preview session not found/i);

  assert.deepEqual(calls, [
    { kind: "hydrate", sessionId: "preview-1" },
    { kind: "hydrate", sessionId: "missing" }
  ]);
});

test("runtime worker transport can dispatch app requests without HTTP listener coupling", async () => {
  const calls = [];
  const runtimeContext = {
    runtimeTransportHttpRequest: async request => {
      calls.push(request);
      return {
        status: 201,
        headers: { "content-type": "application/json" },
        bodyBase64: Buffer.from(JSON.stringify({ ok: true, path: request.path }), "utf8").toString("base64"),
        bodyText: JSON.stringify({ ok: true, path: request.path })
      };
    }
  };
  const result = await executeRuntimeWorkerTransportCall({
    method: RUNTIME_WORKER_TRANSPORT_METHODS.appHttpRequest,
    args: {
      method: "post",
      path: "/hello?name=casey",
      headers: { "content-type": "application/json" },
      bodyText: "{\"ok\":true}"
    },
    runtimeContext,
    appContext: {},
    runtimeProcessHealthMonitor: createHealthMonitor()
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.status, 201);
  assert.equal(result.body.headers["content-type"], "application/json");
  assert.deepEqual(calls, [{
    method: "POST",
    path: "/hello?name=casey",
    headers: { "content-type": "application/json" },
    bodyBase64: null,
    bodyText: "{\"ok\":true}"
  }]);
});

test("runtime worker control client answers runtime transport calls over an outbound control socket", async () => {
  const supervision = {
    instanceId: "runtime-1",
    role: "active",
    mutationsEnabled: true,
    watchersEnabled: false
  };
  const runtimeContext = {
    runtimeSupervision: supervision,
    appSnapshotManager: {
      appRoot: "C:/runtime/app",
      appRevision: 7,
      buildErrors: [],
      async markDirtyPaths(paths, meta) {
        return {
          appRevision: 8,
          paths,
          meta
        };
      },
      async ensureFresh(meta) {
        return {
          appRevision: 9,
          meta
        };
      },
      setWatcherMode() {}
    }
  };
  const appContext = {
    runtimeSupervision: supervision,
    appSnapshotManager: runtimeContext.appSnapshotManager
  };

  const listener = net.createServer();
  const port = await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      resolve(listener.address().port);
    });
  });

  const resultPromise = new Promise((resolve, reject) => {
    listener.once("connection", socket => {
      let buffer = "";
      socket.on("data", chunk => {
        buffer += chunk.toString("utf8");
        const boundary = buffer.indexOf("\n");
        if (boundary < 0) return;
        const line = buffer.slice(0, boundary).trim();
        if (!line) return;
        try {
          resolve(JSON.parse(line));
        } catch (error) {
          reject(error);
        } finally {
          socket.destroy();
        }
      });
      socket.write(`${JSON.stringify(createRuntimeWorkerTransportCall({
        method: RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead,
        requestId: "req-health"
      }))}\n`);
    });
  });

  const client = createRuntimeWorkerControlClient({
    controlAddress: `127.0.0.1:${port}`,
    resolveActiveRuntime: async () => ({ context: runtimeContext }),
    appContext,
    runtimeProcessHealthMonitor: createHealthMonitor(),
    syncLocalSnapshotPoller: () => {}
  });

  const result = await resultPromise;
  client.close();
  await new Promise(resolve => listener.close(resolve));

  assert.equal(result.protocol, "witness-runtime-worker-transport/v1");
  assert.equal(result.kind, "result");
  assert.equal(result.method, RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead);
  assert.equal(result.requestId, "req-health");
  assert.equal(result.ok, true);
  assert.equal(result.payload.instanceId, "runtime-1");
  assert.equal(result.payload.watchersEnabled, false);
  assert.equal(result.payload.status, "healthy");
});

test("runtime worker control client handles nested control calls without blocking later requests", async () => {
  const deferred = {};
  deferred.promise = new Promise(resolve => {
    deferred.resolve = resolve;
  });

  const runtimeContext = {
    runtimeTransportHttpRequest: async () => {
      await deferred.promise;
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        bodyText: JSON.stringify({ ok: true })
      };
    }
  };

  const listener = net.createServer();
  const port = await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      resolve(listener.address().port);
    });
  });

  const results = [];
  let connectionSocket = null;
  const bothResultsSeen = new Promise((resolve, reject) => {
    listener.once("connection", socket => {
      connectionSocket = socket;
      let buffer = "";
      socket.on("data", chunk => {
        buffer += chunk.toString("utf8");
        while (true) {
          const boundary = buffer.indexOf("\n");
          if (boundary < 0) return;
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);
          if (!line) continue;
          try {
            results.push(JSON.parse(line));
            if (results.length === 2) resolve();
          } catch (error) {
            reject(error);
          }
        }
      });
      socket.write(`${JSON.stringify(createRuntimeWorkerTransportCall({
        method: RUNTIME_WORKER_TRANSPORT_METHODS.appHttpRequest,
        requestId: "req-http",
        args: {
          method: "POST",
          path: "/api/runtime/app-sources",
          headers: { "content-type": "application/json" },
          bodyText: "{\"edits\":[]}"
        }
      }))}\n`);
      setTimeout(() => {
        socket.write(`${JSON.stringify(createRuntimeWorkerTransportCall({
          method: RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead,
          requestId: "req-health"
        }))}\n`);
      }, 10);
    });
  });

  const client = createRuntimeWorkerControlClient({
    controlAddress: `127.0.0.1:${port}`,
    resolveActiveRuntime: async () => ({ context: runtimeContext }),
    appContext: null,
    runtimeProcessHealthMonitor: createHealthMonitor(),
    syncLocalSnapshotPoller: () => {}
  });

  const healthResult = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("health result timed out behind blocked app request")), 1000);
    const poll = () => {
      const match = results.find(entry => entry.requestId === "req-health");
      if (match) {
        clearTimeout(deadline);
        resolve(match);
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });

  assert.equal(healthResult.ok, true);
  assert.equal(healthResult.method, RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead);
  assert.equal(healthResult.payload?.status, "healthy");

  deferred.resolve();
  await bothResultsSeen;

  const requestResult = results.find(entry => entry.requestId === "req-http");
  assert.equal(requestResult?.ok, true);
  assert.equal(requestResult?.method, RUNTIME_WORKER_TRANSPORT_METHODS.appHttpRequest);
  assert.equal(requestResult?.payload?.status, 200);

  client.close();
  try {
    connectionSocket?.destroy();
  } catch {}
  await new Promise(resolve => listener.close(resolve));
});

test("runtime worker control client preserves non-2xx app HTTP responses as transport-success payloads", async () => {
  const runtimeContext = {
    runtimeTransportHttpRequest: async () => ({
      status: 409,
      headers: { "content-type": "application/json" },
      bodyText: JSON.stringify({
        error: "source baseline hash mismatch",
        code: "WITNESS_CORE_SOURCE_CONFLICT"
      })
    })
  };

  const listener = net.createServer();
  const port = await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      resolve(listener.address().port);
    });
  });

  const resultPromise = new Promise((resolve, reject) => {
    listener.once("connection", socket => {
      let buffer = "";
      socket.on("data", chunk => {
        buffer += chunk.toString("utf8");
        const boundary = buffer.indexOf("\n");
        if (boundary < 0) return;
        const line = buffer.slice(0, boundary).trim();
        if (!line) return;
        try {
          resolve(JSON.parse(line));
        } catch (error) {
          reject(error);
        } finally {
          socket.destroy();
        }
      });
      socket.write(`${JSON.stringify(createRuntimeWorkerTransportCall({
        method: RUNTIME_WORKER_TRANSPORT_METHODS.appHttpRequest,
        requestId: "req-conflict",
        args: {
          method: "POST",
          path: "/api/runtime/app-sources",
          headers: { "content-type": "application/json" },
          bodyText: "{\"edits\":[]}"
        }
      }))}\n`);
    });
  });

  const client = createRuntimeWorkerControlClient({
    controlAddress: `127.0.0.1:${port}`,
    resolveActiveRuntime: async () => ({ context: runtimeContext }),
    appContext: null,
    runtimeProcessHealthMonitor: createHealthMonitor(),
    syncLocalSnapshotPoller: () => {}
  });

  const result = await resultPromise;
  client.close();
  await new Promise(resolve => listener.close(resolve));

  assert.equal(result.ok, true);
  assert.equal(result.method, RUNTIME_WORKER_TRANSPORT_METHODS.appHttpRequest);
  assert.equal(result.requestId, "req-conflict");
  assert.equal(result.payload?.status, 409);
  assert.match(String(result.payload?.bodyText ?? ""), /WITNESS_CORE_SOURCE_CONFLICT/);
});

test("runtime worker control client reconnects after delayed control-socket availability", async () => {
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const nextPort = probe.address().port;
      probe.close(error => {
        if (error) reject(error);
        else resolve(nextPort);
      });
    });
  });

  const client = createRuntimeWorkerControlClient({
    controlAddress: `127.0.0.1:${port}`,
    resolveActiveRuntime: async () => ({ context: {} }),
    appContext: null,
    runtimeProcessHealthMonitor: createHealthMonitor(),
    syncLocalSnapshotPoller: () => {},
    connectRetryMs: 25
  });

  await new Promise(resolve => setTimeout(resolve, 75));

  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(port, "127.0.0.1", resolve);
  });

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("reconnected control client did not answer delayed request")), 2000);
    listener.once("connection", socket => {
      let buffer = "";
      socket.on("data", chunk => {
        buffer += chunk.toString("utf8");
        const boundary = buffer.indexOf("\n");
        if (boundary < 0) return;
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(buffer.slice(0, boundary).trim()));
        } catch (error) {
          reject(error);
        } finally {
          socket.destroy();
        }
      });
      socket.write(`${JSON.stringify(createRuntimeWorkerTransportCall({
        method: RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead,
        requestId: "req-delayed"
      }))}\n`);
    });
  });

  client.close();
  await new Promise(resolve => listener.close(resolve));

  assert.equal(result.ok, true);
  assert.equal(result.method, RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead);
  assert.equal(result.requestId, "req-delayed");
});
