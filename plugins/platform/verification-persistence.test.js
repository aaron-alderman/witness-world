import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { createRuntimeVerificationPersistence } from "../../src/runtime-verification-persistence.js";
import { createHandlers } from "./runtime.js";
import { buildPlatformModel, filterPlatformModel } from "./platform-model.js";
import { readPlatformTestRun } from "./test-runs.js";

async function createTempRoot(name) {
  const root = path.join(process.cwd(), "test", `.${name}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function createPersistence(runtimeRoot) {
  return createRuntimeVerificationPersistence({
    serverRunner: { id: "runner.main", values: {} },
    runtimeRoot,
    runtimeProfile: "full"
  });
}

test("verification persistence synthesizes sqlite and disk backends and survives restart", async () => {
  const runtimeRoot = await createTempRoot("verification-persistence");
  let persistence = null;
  let reopened = null;
  try {
    persistence = await createPersistence(runtimeRoot);
    const inspect = persistence.inspect();
    assert.equal(inspect.source, "synthesized");
    assert.equal(inspect.ledgerBackend.provider, "sqlite");
    assert.equal(inspect.artifactBackend.provider, "disk");
    assert.equal(inspect.cacheBackend.provider, "disk");
    assert.equal(inspect.diagnostics.some(row => row.code === "verification_persistence_synthesized"), true);

    await persistence.recordPolicyRows([{
      id: "verificationPolicy:runner.main:full:defaults",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      policyKind: "defaults",
      policySource: "synthesized",
      enabled: true,
      startup: true,
      watch: true,
      onChangeSet: true,
      producedAt: "2026-06-19T00:00:00.000Z"
    }]);
    await persistence.recordQueueRow({
      id: "verificationQueue:runner.main:1",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      gateId: "gate:demo",
      executionClass: "candidate_snapshot",
      status: "passed",
      queuedAt: "2026-06-19T00:00:00.000Z",
      finishedAt: "2026-06-19T00:00:01.000Z"
    });
    await persistence.recordExecutionRow({
      id: "verificationExecution:verificationQueue:runner.main:1",
      queueEntryId: "verificationQueue:runner.main:1",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      gateId: "gate:demo",
      executionClass: "candidate_snapshot",
      status: "passed",
      startedAt: "2026-06-19T00:00:00.000Z",
      finishedAt: "2026-06-19T00:00:01.000Z"
    });
    await persistence.persistTestRunBundle({
      testRun: {
        id: "testRun:durable",
        gateId: "gate:demo",
        environment: "platform-candidate-snapshot",
        status: "passed",
        startedAt: "2026-06-19T00:00:00.000Z"
      },
      testResults: [{
        id: "testResult:testRun:durable:1",
        runId: "testRun:durable",
        gateId: "gate:demo",
        status: "passed",
        producedAt: "2026-06-19T00:00:01.000Z",
        cacheIdentity: { cacheKey: "cache:durable:1" }
      }],
      testArtifacts: [{
        id: "testArtifact:testRun:durable:stdout",
        runId: "testRun:durable",
        artifactKind: "stdout",
        contentType: "text/plain; charset=utf-8",
        content: "durable stdout"
      }],
      testSuites: [{
        id: "testSuite:testRun:durable:tap:root",
        runId: "testRun:durable",
        format: "tap",
        status: "passed",
        total: 1
      }],
      testCases: [{
        id: "testCase:testRun:durable:tap:1",
        runId: "testRun:durable",
        suiteId: "testSuite:testRun:durable:tap:root",
        format: "tap",
        status: "passed",
        title: "durable case"
      }],
      testReports: [{
        id: "testReport:testRun:durable:summary",
        runId: "testRun:durable",
        gateId: "gate:demo",
        reportKind: "summary",
        title: "Summary",
        status: "passed",
        summary: "1 passed",
        producedAt: "2026-06-19T00:00:01.000Z"
      }],
      regressionSummary: {
        status: "unknown"
      }
    });
    persistence.close();

    reopened = await createPersistence(runtimeRoot);
    const rows = reopened.readModelRows();
    assert.equal(rows.testRuns.some(row => row.id === "testRun:durable"), true);
    assert.equal(rows.testReports.some(row => row.id === "testReport:testRun:durable:summary"), true);
    assert.equal(rows.verificationPolicies.some(row => row.id === "verificationPolicy:runner.main:full:defaults"), true);
    assert.equal(rows.verificationQueue.some(row => row.id === "verificationQueue:runner.main:1"), true);
    assert.equal(rows.verificationExecutions.some(row => row.id === "verificationExecution:verificationQueue:runner.main:1"), true);
    const artifact = rows.testArtifacts.find(row => row.id === "testArtifact:testRun:durable:stdout");
    assert.ok(artifact);
    assert.equal(typeof artifact.contentRef, "string");
    assert.equal(typeof artifact.contentUrl, "string");
    assert.equal("content" in artifact, false);
    const reusable = await reopened.findReusablePassedResult("cache:durable:1");
    assert.equal(reusable?.id, "testResult:testRun:durable:1");
    const content = await reopened.readArtifactContent("testArtifact:testRun:durable:stdout");
    assert.equal(content.ok, true);
    assert.equal(content.content, "durable stdout");
  } finally {
    try { persistence?.close?.(); } catch {}
    try { reopened?.close?.(); } catch {}
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("platform verification reads durable rows and serves persisted artifact content by id", async () => {
  const runtimeRoot = await createTempRoot("verification-platform");
  const world = createWorld();
  let persistence = null;
  try {
    persistence = await createPersistence(runtimeRoot);
    await persistence.persistTestRunBundle({
      testRun: {
        id: "testRun:verification",
        gateId: "gate:verification",
        status: "passed",
        startedAt: "2026-06-19T00:00:00.000Z"
      },
      testResults: [{
        id: "testResult:testRun:verification:1",
        runId: "testRun:verification",
        gateId: "gate:verification",
        status: "passed",
        producedAt: "2026-06-19T00:00:01.000Z",
        cacheIdentity: { cacheKey: "cache:verification:1" }
      }],
      testArtifacts: [{
        id: "testArtifact:testRun:verification:junit",
        runId: "testRun:verification",
        artifactKind: "junit",
        contentType: "application/xml",
        content: "<testsuite failures=\"1\"></testsuite>"
      }],
      testSuites: [],
      testCases: [],
      testReports: [{
        id: "testReport:testRun:verification:summary",
        runId: "testRun:verification",
        gateId: "gate:verification",
        reportKind: "summary",
        title: "Summary",
        status: "passed",
        summary: "durable summary",
        producedAt: "2026-06-19T00:00:01.000Z"
      }]
    });
    await persistence.recordPolicyRows([{
      id: "verificationPolicy:runner.main:full:defaults",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      policyKind: "defaults",
      policySource: "synthesized",
      enabled: true,
      producedAt: "2026-06-19T00:00:00.000Z"
    }]);
    await persistence.recordQueueRow({
      id: "verificationQueue:runner.main:2",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      gateId: "gate:verification",
      executionClass: "child_process",
      status: "passed",
      queuedAt: "2026-06-19T00:00:00.000Z"
    });
    await persistence.recordExecutionRow({
      id: "verificationExecution:verificationQueue:runner.main:2",
      queueEntryId: "verificationQueue:runner.main:2",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      gateId: "gate:verification",
      executionClass: "child_process",
      status: "passed",
      startedAt: "2026-06-19T00:00:00.000Z"
    });

    const run = await readPlatformTestRun(world, "testRun:verification", {
      verificationPersistence: persistence
    });
    assert.equal(run.ok, true);
    assert.equal(run.testReports[0].id, "testReport:testRun:verification:summary");
    assert.equal(typeof run.testArtifacts[0].contentUrl, "string");
    assert.equal("content" in run.testArtifacts[0], false);

    const sent = [];
    const handlers = createHandlers({
      world,
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      readJson: async req => req.body,
      send: (_res, status, contentType, body) => sent.push({ kind: "content", status, contentType, body }),
      sendJson: (_res, status, body) => sent.push({ kind: "json", status, body }),
      authoringServices: {
        requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
      },
      sendGateFailure: () => {}
    });
    await handlers["platform.testArtifact.content"]({
      res: {},
      params: { id: "testArtifact:testRun:verification:junit" },
      appContext: { verificationPersistence: persistence }
    });
    assert.deepEqual(sent[0], {
      kind: "content",
      status: 200,
      contentType: "application/xml",
      body: "<testsuite failures=\"1\"></testsuite>"
    });

    const model = await buildPlatformModel({
      appContext: { verificationPersistence: persistence },
      diagnostics: {
        activeProfile: "full",
        activeBundles: [],
        providedCapabilities: [],
        routes: [],
        surfaces: [],
        plugins: { activePluginIds: [], effectivePluginIds: [], rejectedPlugins: [] },
        testMonitor: {
          enabled: true,
          watchFs: false,
          watchDebounceMs: 150,
          status: "idle",
          processing: false,
          pendingSourcePaths: [],
          pendingSourceCount: 0,
          pendingChangeSets: [],
          pendingChangeSetCount: 0,
          queue: [],
          queueCount: 0
        },
        verificationPersistence: persistence.inspect()
      },
      project: () => []
    });
    const verification = filterPlatformModel(model, "verification");
    assert.equal(verification.testRuns.some(row => row.id === "testRun:verification"), true);
    assert.equal(verification.verificationPolicies.some(row => row.id === "verificationPolicy:runner.main:full:defaults"), true);
    assert.equal(verification.verificationQueue.some(row => row.id === "verificationQueue:runner.main:2"), true);
    assert.equal(verification.verificationExecutions.some(row => row.id === "verificationExecution:verificationQueue:runner.main:2"), true);
    assert.equal(verification.verificationPersistence.source, "synthesized");
  } finally {
    try { persistence?.close?.(); } catch {}
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
