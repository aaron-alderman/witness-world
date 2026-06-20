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

test("verification persistence falls back to JSON when node:sqlite is unavailable", async () => {
  const runtimeRoot = await createTempRoot("verification-persistence-fallback");
  let persistence = null;
  let reopened = null;
  try {
    persistence = await createRuntimeVerificationPersistence({
      serverRunner: { id: "runner.main", values: {} },
      runtimeRoot,
      runtimeProfile: "full",
      loadSqliteModule: async () => {
        throw new Error("No such built-in module: node:sqlite");
      }
    });
    const inspect = persistence.inspect();
    assert.equal(inspect.ledgerBackend.runtimeProvider, "json-fallback");
    assert.equal(inspect.diagnostics.some(row => row.code === "verification_persistence_sqlite_unavailable"), true);

    await persistence.recordPolicyRows([{ id: "verificationPolicy:fallback", enabled: true }]);
    await persistence.persistTestRunBundle({
      testRun: { id: "testRun:fallback", gateId: "gate:fallback", status: "passed" },
      testResults: [{ id: "testResult:fallback", runId: "testRun:fallback", status: "passed", cacheIdentity: { cacheKey: "cache:fallback" } }],
      testArtifacts: [{ id: "testArtifact:fallback", runId: "testRun:fallback", artifactKind: "stdout", contentType: "text/plain", content: "fallback stdout" }],
      testSuites: [],
      testCases: [],
      testReports: []
    });
    persistence.close();

    reopened = await createRuntimeVerificationPersistence({
      serverRunner: { id: "runner.main", values: {} },
      runtimeRoot,
      runtimeProfile: "full",
      loadSqliteModule: async () => {
        throw new Error("No such built-in module: node:sqlite");
      }
    });
    const rows = reopened.readModelRows();
    assert.equal(rows.verificationPolicies.some(row => row.id === "verificationPolicy:fallback"), true);
    assert.equal(rows.testRuns.some(row => row.id === "testRun:fallback"), true);
    const artifact = await reopened.readArtifactContent("artifact:fallback");
    assert.equal(artifact.ok, true);
    assert.equal(artifact.content, "fallback stdout");
  } finally {
    try { persistence?.close?.(); } catch {}
    try { reopened?.close?.(); } catch {}
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

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
    await persistence.recordFreshnessRows([{
      id: "verificationFreshness:runner.main:full:gate:demo",
      gateId: "gate:demo",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      status: "stale",
      latestRunId: "testRun:durable",
      latestPassedRunId: "testRun:durable",
      latestUsableCacheKey: "cache:durable:1",
      reasonKinds: ["source_changed"],
      reasonSummary: "source changed in src/demo.js.",
      changedPaths: ["src/demo.js"],
      targetIds: ["runtime.core"],
      blocking: false,
      staleSince: "2026-06-19T00:00:02.000Z",
      producedAt: "2026-06-19T00:00:02.000Z"
    }]);
    await persistence.recordInvalidationRows([{
      id: "verificationInvalidation:runner.main:full:gate:demo:source_changed:1",
      gateId: "gate:demo",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      reasonKind: "source_changed",
      reasonSummary: "source changed in src/demo.js.",
      changedPaths: ["src/demo.js"],
      targetIds: ["runtime.core"],
      previousRunId: "testRun:durable",
      previousCacheKey: "cache:durable:1",
      producedAt: "2026-06-19T00:00:02.000Z"
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
        startedAt: "2026-06-19T00:00:00.000Z",
        finishedAt: "2026-06-19T00:00:01.000Z",
        serverRunnerId: "runner.main",
        runtimeProfile: "full"
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
    assert.equal(rows.artifacts.some(row => row.id === "artifact:testRun:durable:stdout"), true);
    assert.equal(rows.verificationPolicies.some(row => row.id === "verificationPolicy:runner.main:full:defaults"), true);
    assert.equal(rows.verificationFreshness.some(row => row.id === "verificationFreshness:runner.main:full:gate:demo"), true);
    assert.equal(rows.verificationInvalidations.some(row => row.id === "verificationInvalidation:runner.main:full:gate:demo:source_changed:1"), true);
    assert.equal(rows.verificationQueue.some(row => row.id === "verificationQueue:runner.main:1"), true);
    assert.equal(rows.verificationExecutions.some(row => row.id === "verificationExecution:verificationQueue:runner.main:1"), true);
    const artifact = rows.testArtifacts.find(row => row.id === "testArtifact:testRun:durable:stdout");
    assert.ok(artifact);
    assert.equal(artifact.artifactId, "artifact:testRun:durable:stdout");
    assert.equal(typeof artifact.contentRef, "string");
    assert.equal(typeof artifact.contentUrl, "string");
    assert.equal("content" in artifact, false);
    const reusable = await reopened.findReusablePassedResult("cache:durable:1");
    assert.equal(reusable?.id, "testResult:testRun:durable:1");
    const content = await reopened.readArtifactContent("testArtifact:testRun:durable:stdout");
    assert.equal(content.ok, true);
    assert.equal(content.content, "durable stdout");
    const canonicalContent = await reopened.readArtifactContent("artifact:testRun:durable:stdout");
    assert.equal(canonicalContent.ok, true);
    assert.equal(canonicalContent.content, "durable stdout");
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
        startedAt: "2026-06-19T00:00:00.000Z",
        finishedAt: "2026-06-19T00:00:01.000Z",
        serverRunnerId: "runner.main",
        runtimeProfile: "full"
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
    await persistence.recordFreshnessRows([{
      id: "verificationFreshness:runner.main:full:gate:verification",
      gateId: "gate:verification",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      status: "stale",
      latestRunId: "testRun:verification",
      latestPassedRunId: "testRun:verification",
      latestUsableCacheKey: "cache:verification:1",
      reasonKinds: ["verification_policy_changed"],
      reasonSummary: "verification policy changed.",
      changedPaths: ["app.wtoml"],
      targetIds: ["plugin.platform"],
      blocking: false,
      staleSince: "2026-06-19T00:00:02.000Z",
      producedAt: "2026-06-19T00:00:02.000Z"
    }]);
    await persistence.recordInvalidationRows([{
      id: "verificationInvalidation:runner.main:full:gate:verification:verification_policy_changed:1",
      gateId: "gate:verification",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      reasonKind: "verification_policy_changed",
      reasonSummary: "verification policy changed.",
      changedPaths: ["app.wtoml"],
      targetIds: ["plugin.platform"],
      previousRunId: "testRun:verification",
      previousCacheKey: "cache:verification:1",
      producedAt: "2026-06-19T00:00:02.000Z"
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
    assert.equal(run.freshnessAtRead?.status, "stale");
    assert.equal(run.invalidationReasons[0]?.reasonKind, "verification_policy_changed");

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
      requestActor: "aaron",
      requestSession: { authenticatedActor: "aaron", effectiveActor: "aaron" },
      appContext: { verificationPersistence: persistence }
    });
    await handlers["platform.artifact.content"]({
      res: {},
      params: { id: "artifact:testRun:verification:junit" },
      requestActor: "aaron",
      requestSession: { authenticatedActor: "aaron", effectiveActor: "aaron" },
      appContext: { verificationPersistence: persistence }
    });
    assert.deepEqual(sent[0], {
      kind: "content",
      status: 200,
      contentType: "application/xml",
      body: "<testsuite failures=\"1\"></testsuite>"
    });
    assert.deepEqual(sent[1], {
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
    const artifacts = filterPlatformModel(model, "artifacts");
    assert.equal(verification.testRuns.some(row => row.id === "testRun:verification"), true);
    assert.equal(artifacts.artifacts.some(row => row.id === "artifact:testRun:verification:junit"), true);
    assert.equal(verification.verificationPolicies.some(row => row.id === "verificationPolicy:runner.main:full:defaults"), true);
    assert.equal(verification.verificationFreshness.some(row => row.id === "verificationFreshness:runner.main:full:gate:verification"), true);
    assert.equal(verification.verificationInvalidations.some(row => row.id === "verificationInvalidation:runner.main:full:gate:verification:verification_policy_changed:1"), true);
    assert.equal(verification.verificationQueue.some(row => row.id === "verificationQueue:runner.main:2"), true);
    assert.equal(verification.verificationExecutions.some(row => row.id === "verificationExecution:verificationQueue:runner.main:2"), true);
    assert.equal(verification.verificationPersistence.source, "synthesized");
  } finally {
    try { persistence?.close?.(); } catch {}
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
