import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRuntimeProcessHealthSample,
  collectActiveResourceFamilies,
  createRuntimeProcessHealthMonitor,
  resolveRuntimeProcessHealthPolicy
} from "../src/runtime-process-health.js";

test("resolveRuntimeProcessHealthPolicy reads runtime config overrides", () => {
  const policy = resolveRuntimeProcessHealthPolicy({
    "runtime.health.sampleMs": 250,
    "runtime.health.rssMaxMb": 512,
    "runtime.health.sseClientsMax": 4,
    "runtime.health.resourceFamilyMax.Timeout": 9
  });

  assert.equal(policy.sampleMs, 250);
  assert.equal(policy.rssMaxMb, 512);
  assert.equal(policy.sseClientsMax, 4);
  assert.equal(policy.resourceFamilyMax.Timeout, 9);
});

test("buildRuntimeProcessHealthSample stays healthy when budgets are within range", () => {
  const sample = buildRuntimeProcessHealthSample({
    ready: true,
    processSnapshot: {
      memory: {
        rss: 64 * 1024 * 1024,
        heapUsed: 20 * 1024 * 1024,
        heapTotal: 32 * 1024 * 1024,
        external: 1024,
        arrayBuffers: 512
      },
      eventLoop: {
        p50Ms: 5,
        p95Ms: 12,
        p99Ms: 18,
        maxMs: 24
      }
    },
    runtimeCounts: {
      activeRequests: 1,
      sseClients: 0,
      previewSessions: 0,
      snapshotWatchers: 2
    },
    resourceFamilies: {
      Timeout: 5,
      FSWatcher: 2
    }
  });

  assert.equal(sample.status, "healthy");
  assert.equal(sample.ok, true);
  assert.deepEqual(sample.reasonCodes, []);
});

test("buildRuntimeProcessHealthSample escalates repeated degraded samples to unhealthy", () => {
  const previous = buildRuntimeProcessHealthSample({
    ready: true,
    policy: resolveRuntimeProcessHealthPolicy({
      "runtime.health.degradedToUnhealthyAfterSamples": 2,
      "runtime.health.sseClientsMax": 2
    }),
    processSnapshot: {
      memory: {},
      eventLoop: { p95Ms: 10 }
    },
    runtimeCounts: {
      activeRequests: 0,
      sseClients: 3,
      previewSessions: 0,
      snapshotWatchers: 0
    },
    resourceFamilies: {}
  });
  const next = buildRuntimeProcessHealthSample({
    ready: true,
    policy: resolveRuntimeProcessHealthPolicy({
      "runtime.health.degradedToUnhealthyAfterSamples": 2,
      "runtime.health.sseClientsMax": 2
    }),
    previous,
    processSnapshot: {
      memory: {},
      eventLoop: { p95Ms: 10 }
    },
    runtimeCounts: {
      activeRequests: 0,
      sseClients: 3,
      previewSessions: 0,
      snapshotWatchers: 0
    },
    resourceFamilies: {}
  });

  assert.equal(previous.status, "degraded");
  assert.equal(next.status, "unhealthy");
  assert.match(next.reasonCodes.join(","), /degraded_streak_exceeded/);
});

test("createRuntimeProcessHealthMonitor samples runtime counts and resource families", () => {
  const timer = { unref() {} };
  const monitor = createRuntimeProcessHealthMonitor({
    runtimeConfig: {
      "runtime.health.sampleMs": 100,
      "runtime.health.sseClientsMax": 2
    },
    probeCollector: {
      snapshot() {
        return {
          process: {
            memory: {
              rss: 10 * 1024 * 1024,
              heapUsed: 5 * 1024 * 1024,
              heapTotal: 8 * 1024 * 1024,
              external: 0,
              arrayBuffers: 0
            },
            eventLoop: {
              p50Ms: 1,
              p95Ms: 2,
              p99Ms: 3,
              maxMs: 4
            }
          }
        };
      }
    },
    getRuntimeCounts: () => ({
      activeRequests: 0,
      sseClients: 3,
      runtimeContexts: 1,
      previewSessions: 0,
      snapshotWatchers: 0
    }),
    getServingState: () => ({ mode: "stable", servingRevision: 1 }),
    getReadyState: () => true,
    processRef: {
      uptime: () => 12,
      getActiveResourcesInfo: () => ["Timeout", "Timeout", "FSWatcher"]
    },
    setIntervalFn: () => timer,
    clearIntervalFn: currentTimer => {
      assert.equal(currentTimer, timer);
    }
  });

  const snapshot = monitor.sample();
  monitor.close();

  assert.equal(snapshot.runtimeCounts.sseClients, 3);
  assert.equal(snapshot.resourceFamilies.Timeout, 2);
  assert.equal(snapshot.resourceFamilies.FSWatcher, 1);
  assert.equal(snapshot.lastGood.mode, "stable");
  assert.equal(snapshot.status, "degraded");
});

test("collectActiveResourceFamilies groups process resource names", () => {
  const counts = collectActiveResourceFamilies({
    getActiveResourcesInfo: () => ["Timeout", "Timeout", "FSWatcher", "PipeWrap"]
  });
  assert.deepEqual(counts, {
    FSWatcher: 1,
    PipeWrap: 1,
    Timeout: 2
  });
});
