import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createWorld } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { resolveRunnerVerificationPolicy } from "../../src/runtime-verification-policy.js";
import { createPlatformTestMonitorRuntime } from "./provider-runtime.js";
import { selectContinuousTestGates } from "./test-gate-catalog.js";

async function waitForIdle(runtime) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = runtime.inspect();
    if (!snapshot.processing && snapshot.pendingSourcePaths.length === 0 && snapshot.pendingChangeSets.length === 0) return;
    await delay(10);
  }
  throw new Error("platform test monitor did not become idle");
}

test("continuous test gate selection prefers direct file coverage over broad test-system matches", () => {
  const selected = selectContinuousTestGates([
    {
      id: "gate:direct",
      sourcePath: "test/runtime-server.test.js",
      command: "node --test test/runtime-server.test.js",
      sourceDependencies: ["src/runtime-server.js", "test/runtime-server.test.js"],
      protectedObjects: ["runtime.core", "verification.tests"],
      costEstimate: "low"
    },
    {
      id: "gate:broad",
      sourcePath: "test/all-runtime.test.js",
      command: "node --test test/all-runtime.test.js",
      sourceDependencies: ["test/all-runtime.test.js"],
      protectedObjects: ["verification.tests"],
      costEstimate: "low"
    },
    {
      id: "gate:plugin",
      sourcePath: "package.json",
      command: "npm run test:plugin:platform",
      sourceDependencies: ["package.json"],
      protectedObjects: ["plugin.platform"],
      costEstimate: "medium"
    }
  ], ["src/runtime-server.js", "plugins/platform/platform-page.js"]);

  assert.deepEqual(selected.map(row => row.id), ["gate:direct"]);
  assert.deepEqual(selected[0].matchedSourceDependencies, ["src/runtime-server.js"]);
  assert.deepEqual(selected[0].matchedTargets, ["runtime.core"]);
});

test("platform test monitor runs selected source gates without overlap", async () => {
  const world = createWorld();
  const persisted = {
    verificationFreshness: [],
    verificationInvalidations: [],
    verificationQueue: [],
    verificationExecutions: []
  };
  const fakePersistence = {
    readModelRows() {
      return {
        verificationFreshness: persisted.verificationFreshness.map(row => ({ ...row })),
        verificationInvalidations: persisted.verificationInvalidations.map(row => ({ ...row })),
        verificationQueue: persisted.verificationQueue.map(row => ({ ...row })),
        verificationExecutions: persisted.verificationExecutions.map(row => ({ ...row })),
        verificationPolicies: [],
        testRuns: [],
        testResults: [],
        testArtifacts: [],
        testSuites: [],
        testCases: [],
        testReports: []
      };
    },
    async recordFreshnessRows(rows = []) {
      if (rows.length) persisted.verificationFreshness = rows.map(row => ({ ...row }));
    },
    async recordInvalidationRows(rows = []) {
      persisted.verificationInvalidations.push(...rows.map(row => ({ ...row })));
    },
    async recordQueueRow(row = null) {
      if (row) persisted.verificationQueue.push({ ...row });
    },
    async recordExecutionRow(row = null) {
      if (row) persisted.verificationExecutions.push({ ...row });
    }
  };
  const gates = [
    {
      id: "gate:runtime",
      sourcePath: "test/runtime-server.test.js",
      command: "node --test test/runtime-server.test.js",
      sourceDependencies: ["src/runtime-server.js"],
      protectedObjects: ["runtime.core"],
      costEstimate: "low"
    },
    {
      id: "gate:platform",
      sourcePath: "plugins/platform/platform.test.js",
      command: "node --test plugins/platform/platform.test.js",
      sourceDependencies: ["plugins/platform/platform-page.js"],
      protectedObjects: ["plugin.platform"],
      costEstimate: "low"
    }
  ];
  const calls = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  const runtime = createPlatformTestMonitorRuntime({
    world,
    runtimeConfig: {
      platform: {
        testMonitor: {
          enabled: true,
          watchFs: false,
          maxAutoRunsPerCycle: 4
        }
      }
    },
    serverRunnerId: "serverRunner.test",
    getAppContext: () => ({
      runtimeProfile: "full",
      project(projector) {
        if (projector === moduleProjectors.testGates) return gates;
        return [];
      }
    })
  }, {
    runPlatformTestGateImpl: async (_world, { gate }) => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      calls.push({ phase: "start", gateId: gate.id });
      await delay(20);
      calls.push({ phase: "finish", gateId: gate.id });
      inFlight -= 1;
      return {
        ok: true,
        testRun: { id: `testRun:${gate.id}` },
        latestResult: { status: "passed" }
      };
    }
  });

  try {
    runtime.scheduleSourceChanges(["src/runtime-server.js", "plugins/platform/platform-page.js"]);
    await waitForIdle(runtime);

    assert.equal(maxConcurrent, 1);
    const inspect = runtime.inspect();
    assert.equal(inspect.enabled, true);
    assert.equal(inspect.policySource, "synthesized");
    assert.equal(inspect.watchFs, false);
    assert.equal(inspect.watchDebounceMs, 150);
    assert.equal(inspect.compatibility.watchFs, false);
    assert.equal(inspect.compatibility.maxAutoRunsPerCycle, 4);
    assert.equal(inspect.status, "idle");
    assert.equal(inspect.processing, false);
    assert.deepEqual(inspect.pendingSourcePaths, []);
    assert.equal(inspect.pendingSourceCount, 0);
    assert.deepEqual(inspect.pendingChangeSets, []);
    assert.equal(inspect.pendingChangeSetCount, 0);
    assert.deepEqual(inspect.queue, []);
    assert.equal(inspect.queueCount, 0);
    assert.equal(Array.isArray(inspect.recentExecutions), true);
    assert.equal(inspect.recentExecutions.length, 2);
    assert.deepEqual(calls, [
      { phase: "start", gateId: "gate:platform" },
      { phase: "finish", gateId: "gate:platform" },
      { phase: "start", gateId: "gate:runtime" },
      { phase: "finish", gateId: "gate:runtime" }
    ]);
  } finally {
    runtime.close();
  }
});

test("platform test monitor initialization computes freshness before startup queueing", async () => {
  const world = createWorld();
  const persistenceEvents = [];
  const fakePersistence = {
    readModelRows() {
      return {
        verificationFreshness: [],
        verificationInvalidations: [],
        verificationQueue: [],
        verificationExecutions: [],
        verificationPolicies: [],
        testRuns: [],
        testResults: [],
        testArtifacts: [],
        testSuites: [],
        testCases: [],
        testReports: []
      };
    },
    async recordFreshnessRows(rows = []) {
      if (rows.length) persistenceEvents.push("freshness");
    },
    async recordInvalidationRows(rows = []) {
      if (rows.length) persistenceEvents.push("invalidation");
    },
    async recordQueueRow(row = null) {
      if (row) persistenceEvents.push("queue");
    },
    async recordExecutionRow(row = null) {
      if (row) persistenceEvents.push("execution");
    }
  };
  const gates = [{
    id: "gate:startup",
    sourcePath: "test/runtime-server.test.js",
    command: "node --test test/runtime-server.test.js",
    sourceDependencies: ["src/runtime-server.js"],
    protectedObjects: ["runtime.core"],
    costEstimate: "low"
  }];
  const runtime = createPlatformTestMonitorRuntime({
    world,
    runtimeConfig: {
      platform: {
        testMonitor: {
          enabled: true,
          watchFs: false
        }
      }
    },
    serverRunnerId: "serverRunner.test",
    getAppContext: () => ({
      runtimeProfile: "full",
      verificationPolicy: resolveRunnerVerificationPolicy({
        serverRunner: {
          id: "serverRunner.test",
          values: {
            verification: {
              defaults: {
                startup: true,
                watch: false,
                onChangeSet: true
              }
            }
          }
        },
        runtimeProfile: "full",
        runtimeConfig: {}
      }),
      verificationPersistence: fakePersistence,
      project(projector) {
        if (projector === moduleProjectors.testGates) return gates;
        return [];
      }
    })
  }, {
    runPlatformTestGateImpl: async (_world, { gate }) => ({
      ok: true,
      testRun: { id: `testRun:${gate.id}` },
      latestResult: { status: "passed" }
    })
  });

  try {
    await runtime.initialize();
    await waitForIdle(runtime);
    assert.ok(persistenceEvents.includes("freshness"));
    assert.ok(persistenceEvents.includes("queue"));
    assert.ok(persistenceEvents.indexOf("freshness") < persistenceEvents.indexOf("queue"));
  } finally {
    runtime.close();
  }
});

test("platform test monitor synthesized policy does not invent startup verification work", async () => {
  const world = createWorld();
  const persistenceEvents = [];
  const runtime = createPlatformTestMonitorRuntime({
    world,
    runtimeConfig: {},
    serverRunnerId: "serverRunner.test",
    getAppContext: () => ({
      runtimeProfile: "full",
      verificationPersistence: {
        readModelRows() {
          return {
            verificationFreshness: [],
            verificationInvalidations: [],
            verificationQueue: [],
            verificationExecutions: [],
            verificationPolicies: [],
            testRuns: [],
            testResults: [],
            testArtifacts: [],
            testSuites: [],
            testCases: [],
            testReports: []
          };
        },
        async recordFreshnessRows(rows = []) {
          if (rows.length) persistenceEvents.push("freshness");
        },
        async recordQueueRow(row = null) {
          if (row) persistenceEvents.push("queue");
        }
      },
      project(projector) {
        if (projector === moduleProjectors.testGates) {
          return [{
            id: "gate:startup",
            sourcePath: "test/runtime-server.test.js",
            command: "node --test test/runtime-server.test.js",
            sourceDependencies: ["src/runtime-server.js"],
            protectedObjects: ["runtime.core"],
            costEstimate: "low"
          }];
        }
        return [];
      }
    })
  });

  try {
    await runtime.initialize();
    await waitForIdle(runtime);
    const inspect = runtime.inspect();
    assert.equal(inspect.defaults.startup, false);
    assert.equal(inspect.watchFs, false);
    assert.deepEqual(persistenceEvents, []);
    assert.equal(inspect.queueCount, 0);
    assert.equal(inspect.pendingSourceCount, 0);
  } finally {
    runtime.close();
  }
});

test("platform test monitor carries candidate snapshots only to gates that require snapshot execution", async () => {
  const world = createWorld();
  const calls = [];
  const runtime = createPlatformTestMonitorRuntime({
    world,
    runtimeConfig: {
      platform: {
        testMonitor: {
          enabled: true,
          watchFs: false
        }
      }
    },
    serverRunnerId: "serverRunner.test",
    getAppContext: () => ({
      runtimeProfile: "full",
      project() {
        return [];
      }
    })
  }, {
    buildPlatformModelImpl: async () => ({
      selectedTestGatesByChangeSet: {
        "changeSet:test": ["gate:plain", "gate:snapshot"]
      },
      testGates: [
        {
          id: "gate:plain",
          command: "node --test test/plain.test.js",
          protectedObjects: []
        },
        {
          id: "gate:snapshot",
          command: "node --test test/snapshot.test.js",
          protectedObjects: ["testEnvironment:platform-candidate-snapshot"]
        }
      ]
    }),
    runPlatformTestGateImpl: async (_world, request) => {
      calls.push({
        gateId: request.gate.id,
        candidateSnapshotId: request.candidateSnapshotId ?? null,
        branchId: request.branchId ?? null,
        changeSetId: request.changeSetId ?? null
      });
      return {
        ok: true,
        testRun: { id: `testRun:${request.gate.id}` },
        latestResult: { status: "passed" }
      };
    }
  });

  try {
    runtime.scheduleChangeSetValidation({
      branchId: "branch:test",
      changeSetId: "changeSet:test",
      candidateSnapshotId: "candidateSnapshot:test:1",
      status: "valid"
    });
    await waitForIdle(runtime);

    assert.deepEqual(calls, [
      {
        gateId: "gate:plain",
        candidateSnapshotId: null,
        branchId: "branch:test",
        changeSetId: "changeSet:test"
      },
      {
        gateId: "gate:snapshot",
        candidateSnapshotId: "candidateSnapshot:test:1",
        branchId: "branch:test",
        changeSetId: "changeSet:test"
      }
    ]);
  } finally {
    runtime.close();
  }
});
