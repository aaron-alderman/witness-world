import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { createRuntimeVerificationPersistence } from "../../src/runtime-verification-persistence.js";
import { createHandlers } from "./runtime.js";
import { buildPlatformModel, filterPlatformModel } from "./platform-model.js";
import { readPlatformTestRun } from "./test-runs.js";
import {
  createLiveCoreWorkspace,
  reservePort,
  startWitnessCoreProcess
} from "../../test/support/witness-core-harness.js";

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

function createWitnessCoreVerificationPersistenceFetch() {
  const state = {
    verificationPolicies: new Map(),
    verificationFreshness: new Map(),
    verificationInvalidations: new Map(),
    verificationQueue: new Map(),
    verificationExecutions: new Map(),
    testRuns: new Map(),
    testResults: new Map(),
    artifacts: new Map(),
    testArtifacts: new Map(),
    testSuites: new Map(),
    testCases: new Map(),
    testReports: new Map(),
    cacheEntries: new Map(),
    artifactContents: new Map()
  };

  const jsonResponse = body => ({
    ok: true,
    status: 200,
    async json() {
      return structuredClone(body);
    }
  });

  return async (_url, options = {}) => {
    const body = JSON.parse(String(options.body || "{}"));
    const op = String(body.operation || "");
    const upsert = (bucket, rows = []) => {
      for (const row of rows ?? []) {
        if (!row?.id) continue;
        state[bucket].set(String(row.id), structuredClone(row));
      }
    };
    if (op === "readModelRows") {
      return jsonResponse({
        verificationPolicies: [...state.verificationPolicies.values()],
        verificationFreshness: [...state.verificationFreshness.values()],
        verificationInvalidations: [...state.verificationInvalidations.values()],
        verificationQueue: [...state.verificationQueue.values()],
        verificationExecutions: [...state.verificationExecutions.values()],
        testRuns: [...state.testRuns.values()],
        testResults: [...state.testResults.values()],
        artifacts: [...state.artifacts.values()],
        testArtifacts: [...state.testArtifacts.values()],
        testSuites: [...state.testSuites.values()],
        testCases: [...state.testCases.values()],
        testReports: [...state.testReports.values()]
      });
    }
    if (op === "recordPolicyRows") {
      upsert("verificationPolicies", body.rows);
      return jsonResponse({ ok: true });
    }
    if (op === "recordFreshnessRows") {
      upsert("verificationFreshness", body.rows);
      return jsonResponse({ ok: true });
    }
    if (op === "recordInvalidationRows") {
      upsert("verificationInvalidations", body.rows);
      return jsonResponse({ ok: true });
    }
    if (op === "recordQueueRow") {
      upsert("verificationQueue", body.row ? [body.row] : []);
      return jsonResponse({ ok: true });
    }
    if (op === "recordExecutionRow") {
      upsert("verificationExecutions", body.row ? [body.row] : []);
      return jsonResponse({ ok: true });
    }
    if (op === "persistTestRunBundle") {
      upsert("testRuns", body.testRun ? [body.testRun] : []);
      upsert("testResults", body.testResults);
      upsert("artifacts", body.artifacts);
      upsert("testArtifacts", body.testArtifacts);
      upsert("testSuites", body.testSuites);
      upsert("testCases", body.testCases);
      upsert("testReports", body.testReports);
      for (const row of body.cacheEntries ?? []) {
        if (!row?.cacheKey) continue;
        state.cacheEntries.set(String(row.cacheKey), structuredClone(row));
      }
      for (const row of body.artifactContents ?? []) {
        if (!row?.contentRef) continue;
        state.artifactContents.set(String(row.contentRef), String(row.content ?? ""));
      }
      return jsonResponse({ ok: true });
    }
    if (op === "findReusablePassedResult") {
      const latestResult = state.cacheEntries.get(String(body.cacheKey || ""))?.latestResult ?? null;
      return jsonResponse({ latestResult });
    }
    if (op === "readArtifactContent") {
      const artifactId = String(body.artifactId || "");
      const compatibility = String(body.compatibility || "canonical");
      const artifact = compatibility === "testArtifact"
        ? [...state.testArtifacts.values()].find(row => row.id === artifactId || row.artifactId === artifactId) ?? null
        : (
          state.artifacts.get(artifactId)
          ?? [...state.testArtifacts.values()].find(row => row.id === artifactId || row.artifactId === artifactId)
          ?? null
        );
      if (!artifact?.contentRef) return jsonResponse({ ok: false, status: 404, error: "artifact content not found" });
      return jsonResponse({
        ok: true,
        status: 200,
        artifact,
        content: state.artifactContents.get(String(artifact.contentRef)) ?? "",
        contentType: artifact.contentType ?? "text/plain"
      });
    }
    throw new Error(`unexpected witness-core verification persistence op ${op}`);
  };
}

test("verification persistence uses local JSON compatibility mode when witness-core is unavailable", async () => {
  const runtimeRoot = await createTempRoot("verification-persistence-fallback");
  let persistence = null;
  let reopened = null;
  try {
    persistence = await createRuntimeVerificationPersistence({
      serverRunner: { id: "runner.main", values: {} },
      runtimeRoot,
      runtimeProfile: "full"
    });
    const inspect = persistence.inspect();
    assert.equal(inspect.ledgerBackend.runtimeProvider, "json-fallback");
    assert.equal(inspect.diagnostics.some(row => row.code === "verification_persistence_json_compatibility"), true);

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
      runtimeProfile: "full"
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

test("verification persistence keeps synthesized backend metadata while using local JSON compatibility mode", async () => {
  const runtimeRoot = await createTempRoot("verification-persistence");
  let persistence = null;
  let reopened = null;
  try {
    persistence = await createPersistence(runtimeRoot);
    const inspect = persistence.inspect();
    assert.equal(inspect.source, "synthesized");
    assert.equal(inspect.ledgerBackend.provider, "sqlite");
    assert.equal(inspect.ledgerBackend.runtimeProvider, "json-fallback");
    assert.equal(inspect.artifactBackend.provider, "disk");
    assert.equal(inspect.cacheBackend.provider, "disk");
    assert.equal(inspect.diagnostics.some(row => row.code === "verification_persistence_synthesized"), true);
    assert.equal(inspect.diagnostics.some(row => row.code === "verification_persistence_json_compatibility"), true);

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

test("verification persistence can be mediated through witness-core without loading node:sqlite", async () => {
  const runtimeRoot = await createTempRoot("verification-persistence-remote");
  const fetchImpl = createWitnessCoreVerificationPersistenceFetch();
  let sqliteLoads = 0;
  let persistence = null;
  let reopened = null;
  try {
    persistence = await createRuntimeVerificationPersistence({
      serverRunner: { id: "runner.main", values: {} },
      runtimeRoot,
      runtimeProfile: "full",
      witnessCoreBridge: { coreUrl: "http://127.0.0.1:8788" },
      fetchImpl,
      loadSqliteModule: async () => {
        sqliteLoads += 1;
        throw new Error("node:sqlite should not load when witness-core is configured");
      }
    });
    const inspect = persistence.inspect();
    assert.equal(inspect.ledgerBackend.runtimeProvider, "witness-core");
    assert.equal(inspect.diagnostics.some(row => row.code === "verification_persistence_witness_core"), true);

    await persistence.recordPolicyRows([{ id: "verificationPolicy:remote", enabled: true }]);
    await persistence.persistTestRunBundle({
      testRun: { id: "testRun:remote", gateId: "gate:remote", status: "passed" },
      testResults: [{ id: "testResult:remote", runId: "testRun:remote", status: "passed", cacheIdentity: { cacheKey: "cache:remote" } }],
      testArtifacts: [{ id: "testArtifact:remote", runId: "testRun:remote", artifactKind: "stdout", contentType: "text/plain", content: "remote stdout" }],
      testSuites: [],
      testCases: [],
      testReports: []
    });
    persistence.close();

    reopened = await createRuntimeVerificationPersistence({
      serverRunner: { id: "runner.main", values: {} },
      runtimeRoot,
      runtimeProfile: "full",
      witnessCoreBridge: { coreUrl: "http://127.0.0.1:8788" },
      fetchImpl,
      loadSqliteModule: async () => {
        sqliteLoads += 1;
        throw new Error("node:sqlite should not load when witness-core is configured");
      }
    });
    const rows = reopened.readModelRows();
    assert.equal(rows.verificationPolicies.some(row => row.id === "verificationPolicy:remote"), true);
    assert.equal(rows.testRuns.some(row => row.id === "testRun:remote"), true);
    assert.equal(rows.artifacts.some(row => row.id === "artifact:remote"), true);
    const reusable = await reopened.findReusablePassedResult("cache:remote");
    assert.equal(reusable?.id, "testResult:remote");
    const artifact = await reopened.readArtifactContent("artifact:remote");
    assert.equal(artifact.ok, true);
    assert.equal(artifact.content, "remote stdout");
    assert.equal(sqliteLoads, 0);
  } finally {
    try { persistence?.close?.(); } catch {}
    try { reopened?.close?.(); } catch {}
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("verification persistence survives worker reopen and witness-core restart without loading node:sqlite", async () => {
  const workspace = await createLiveCoreWorkspace({ proofDelayMs: 100 });
  const port = await reservePort();
  let core = null;
  let sqliteLoads = 0;
  let persistence = null;
  let reopened = null;
  let restarted = null;
  try {
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port
    });

    const createRemotePersistence = async () => createRuntimeVerificationPersistence({
      serverRunner: { id: "runner.main", values: {} },
      runtimeRoot: workspace.appRoot,
      runtimeProfile: "full",
      witnessCoreBridge: { coreUrl: core.url },
      loadSqliteModule: async () => {
        sqliteLoads += 1;
        throw new Error("node:sqlite should not load when witness-core is configured");
      }
    });

    persistence = await createRemotePersistence();
    const inspect = persistence.inspect();
    assert.equal(inspect.ledgerBackend.runtimeProvider, "witness-core");
    assert.equal(inspect.diagnostics.some(row => row.code === "verification_persistence_witness_core"), true);

    await persistence.recordPolicyRows([{
      id: "verificationPolicy:restart",
      enabled: true,
      producedAt: "2026-06-20T00:00:00.000Z"
    }]);
    await persistence.persistTestRunBundle({
      testRun: {
        id: "testRun:restart",
        gateId: "gate:restart",
        status: "passed",
        producedAt: "2026-06-20T00:00:01.000Z"
      },
      testResults: [{
        id: "testResult:restart",
        runId: "testRun:restart",
        gateId: "gate:restart",
        status: "passed",
        producedAt: "2026-06-20T00:00:01.000Z",
        cacheIdentity: { cacheKey: "cache:restart" }
      }],
      testArtifacts: [{
        id: "testArtifact:restart:stdout",
        runId: "testRun:restart",
        artifactKind: "stdout",
        contentType: "text/plain",
        content: "restart stdout"
      }],
      testSuites: [],
      testCases: [],
      testReports: [{
        id: "testReport:restart:summary",
        runId: "testRun:restart",
        gateId: "gate:restart",
        reportKind: "summary",
        title: "Restart Summary",
        status: "passed",
        summary: "restart survived",
        producedAt: "2026-06-20T00:00:01.000Z"
      }]
    });
    persistence.close();
    persistence = null;

    reopened = await createRemotePersistence();
    let rows = reopened.readModelRows();
    assert.equal(rows.verificationPolicies.some(row => row.id === "verificationPolicy:restart"), true);
    assert.equal(rows.testRuns.some(row => row.id === "testRun:restart"), true);
    assert.equal(rows.artifacts.some(row => row.id === "artifact:restart:stdout"), true);
    assert.equal((await reopened.findReusablePassedResult("cache:restart"))?.id, "testResult:restart");
    let artifact = await reopened.readArtifactContent("artifact:restart:stdout");
    assert.equal(artifact.ok, true);
    assert.equal(artifact.content, "restart stdout");
    reopened.close();
    reopened = null;

    await core.stop();
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port
    });

    restarted = await createRemotePersistence();
    rows = restarted.readModelRows();
    assert.equal(rows.verificationPolicies.some(row => row.id === "verificationPolicy:restart"), true);
    assert.equal(rows.testRuns.some(row => row.id === "testRun:restart"), true);
    assert.equal(rows.testReports.some(row => row.id === "testReport:restart:summary"), true);
    assert.equal((await restarted.findReusablePassedResult("cache:restart"))?.id, "testResult:restart");
    artifact = await restarted.readArtifactContent("artifact:restart:stdout");
    assert.equal(artifact.ok, true);
    assert.equal(artifact.content, "restart stdout");
    assert.equal(sqliteLoads, 0);
  } finally {
    try { persistence?.close?.(); } catch {}
    try { reopened?.close?.(); } catch {}
    try { restarted?.close?.(); } catch {}
    try { await core?.stop?.(); } catch {}
    await workspace.cleanup();
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
