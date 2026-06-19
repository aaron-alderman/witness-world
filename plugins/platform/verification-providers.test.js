import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { createWorld } from "../../src/kernel.js";
import { resolveRunnerVerificationPolicy } from "../../src/runtime-verification-policy.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { providers } from "./runtime.js";
import { renderPlatformPage } from "./platform-page.js";
import { resolveEffectivePlatformTestGates } from "./test-gate-catalog.js";
import { readPlatformTestRun, runPlatformTestGate } from "./test-runs.js";

function authoredVerifierPolicy(overrides = {}) {
  return resolveRunnerVerificationPolicy({
    serverRunner: {
      id: "runner.platform",
      values: {
        verification: {
          defaults: {
            startup: false,
            watch: false,
            onChangeSet: false
          },
          verifier: [{
            gateId: "gate:verifier.fixture",
            title: "Fixture verifier",
            providerId: "verification.javascriptModule",
            enabled: true,
            executionClass: "in_process",
            safetyClass: "safe",
            invoke: true,
            sourceDependencies: ["plugins/platform/platform-page.js"],
            targetIds: ["plugin.platform"],
            input: {
              module: "plugins/platform/test-verifier-fixture.js"
            },
            ...overrides
          }]
        }
      }
    },
    runtimeProfile: "full",
    runtimeConfig: {}
  });
}

test("authored verifier entries materialize into effective test gates", () => {
  const policy = authoredVerifierPolicy();
  const gates = resolveEffectivePlatformTestGates({
    projectedTestGates: [],
    verificationPolicy: policy,
    appRoot: process.cwd()
  });

  assert.equal(gates.length, 1);
  assert.deepEqual(gates[0], {
    id: "gate:verifier.fixture",
    title: "Fixture verifier",
    sourcePath: "app.wtoml",
    command: "verification.javascriptModule plugins/platform/test-verifier-fixture.js",
    runner: "verification-provider",
    environment: "local-node",
    timeoutMs: 120000,
    protectedObjects: ["plugin.platform"],
    protectedObjectLabels: ["Platform plugin"],
    sourceDependencies: ["app.wtoml", "plugins/platform/platform-page.js", "plugins/platform/test-verifier-fixture.js"],
    lastResult: null,
    flakeScore: null,
    costEstimate: "low",
    selectedByBranches: [],
    selectedByChangeSets: [],
    providerId: "verification.javascriptModule",
    safetyClass: "safe",
    executionClass: "in_process",
    invoke: true,
    authored: true,
    verificationInput: {
      module: "plugins/platform/test-verifier-fixture.js"
    }
  });
});

test("javascript module verifier runs in-process and emits execution and cleanup reports", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const gate = resolveEffectivePlatformTestGates({
    projectedTestGates: [],
    verificationPolicy: authoredVerifierPolicy(),
    appRoot: process.cwd()
  })[0];

  const run = await runPlatformTestGate(world, {
    actor: "aaron",
    gate,
    id: "testRun:verifier:fixture",
    runtimeProfile: "full",
    executionClass: "in_process"
  });

  assert.equal(run.ok, true);
  assert.equal(run.status, 201);
  assert.equal(run.testRun.providerId, "verification.javascriptModule");
  assert.equal(run.testRun.safetyClass, "safe");
  assert.equal(run.testRun.executionClass, "in_process");
  assert.equal(run.latestResult.cleanupStatus, "passed");
  assert.equal(run.latestResult.cleanupSummary, "Fixture cleanup completed.");
  assert.equal(run.testArtifacts.some(row => row.artifactKind === "log"), true);
  assert.equal(run.testArtifacts.some(row => row.artifactKind === "cleanup"), true);
  assert.equal(run.testSuites.some(row => row.name === "Fixture verifier suite"), true);
  assert.equal(run.testCases.some(row => row.classname === "FixtureVerifier"), true);

  const reportsByKind = Object.fromEntries(run.testReports.map(report => [report.reportKind, report]));
  assert.equal(Object.keys(reportsByKind).sort().join(","), "cleanup,execution,failures,regression,suites,summary");
  assert.equal(reportsByKind.execution.providerId, "verification.javascriptModule");
  assert.equal(reportsByKind.execution.safetyClass, "safe");
  assert.equal(reportsByKind.execution.executionClass, "in_process");
  assert.equal(reportsByKind.cleanup.status, "passed");
  assert.equal(reportsByKind.cleanup.summary, "Fixture cleanup completed.");
}));

test("javascript module verifier cleanup failures are first-class verification failures", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const [gate] = resolveEffectivePlatformTestGates({
    projectedTestGates: [],
    verificationPolicy: authoredVerifierPolicy({
      input: {
        module: "plugins/platform/test-verifier-fixture.js",
        cleanupFailure: true
      }
    }),
    appRoot: process.cwd()
  });

  const run = await runPlatformTestGate(world, {
    actor: "aaron",
    gate,
    id: "testRun:verifier:cleanup-failure",
    runtimeProfile: "full",
    executionClass: "in_process"
  });

  assert.equal(run.ok, true);
  assert.equal(run.latestResult.status, "error");
  assert.equal(run.latestResult.cleanupStatus, "failed");
  assert.equal(run.latestResult.cleanupSummary, "fixture cleanup failed");

  const readback = await readPlatformTestRun(world, "testRun:verifier:cleanup-failure");
  assert.equal(readback.ok, true);
  const cleanupReport = readback.testReports.find(report => report.reportKind === "cleanup");
  assert.ok(cleanupReport);
  assert.equal(cleanupReport.status, "failed");
  assert.equal(cleanupReport.summary, "fixture cleanup failed");
}));

test("command-backed gates cannot run as in-process verifiers", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const result = await runPlatformTestGate(world, {
    actor: "aaron",
    gate: {
      id: "gate:verifier.command",
      title: "Command verifier",
      command: "node --test plugins/platform/platform.test.js",
      runner: "node-test",
      sourceDependencies: ["plugins/platform/platform.test.js"],
      protectedObjects: ["plugin.platform"],
      providerId: "verification.command"
    },
    id: "testRun:verifier:command",
    runtimeProfile: "full",
    executionClass: "in_process",
    runCommand: async () => {
      throw new Error("command verifier should not execute");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /does not support executionClass=in_process/);
}));

test("verification run detail renders provider, safety, cleanup, and execution report metadata", () => {
  const html = renderPlatformPage({
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    nodes: [],
    edges: [],
    testGates: [],
    testRuns: [{
      id: "testRun:verifier:detail",
      title: "Verifier Detail",
      status: "passed",
      gateId: "gate:verifier.fixture",
      providerId: "verification.javascriptModule",
      safetyClass: "safe",
      executionClass: "in_process",
      triggerKind: "invoke",
      workspaceMode: "live-workspace",
      cleanupStatus: "passed",
      cleanupSummary: "Fixture cleanup completed.",
      durationMs: 5,
      exitCode: 0
    }],
    testArtifacts: [],
    testSuites: [],
    testCases: [],
    testReports: [{
      id: "testReport:testRun:verifier:detail:execution",
      runId: "testRun:verifier:detail",
      reportKind: "execution",
      status: "passed",
      summary: "provider verification.javascriptModule, class in_process, safety safe, trigger invoke, workspace live-workspace",
      providerId: "verification.javascriptModule",
      safetyClass: "safe",
      executionClass: "in_process",
      triggerKind: "invoke",
      workspaceMode: "live-workspace",
      cleanupStatus: "passed",
      cleanupSummary: "Fixture cleanup completed.",
      timeoutKind: null,
      artifactIds: [],
      suiteIds: [],
      caseIds: [],
      producedAt: "2026-06-19T00:00:00.000Z"
    }],
    verificationFreshness: [],
    verificationInvalidations: [],
    runtimeRevisions: [],
    candidateSnapshots: [],
    snapshotBuilds: [],
    snapshotBuildErrors: [],
    snapshotDiagnostics: {},
    testMonitorDiagnostics: {},
    branchTestRedGreen: [],
    changeSetTestRedGreen: [],
    latestTestResultsByGate: {},
    summaries: {}
  }, {
    requestUrl: new URL("http://platform.local/platform?view=verificationRuns&id=testReport:testRun:verifier:detail:execution")
  });

  assert.match(html, /verification\.javascriptModule/);
  assert.match(html, /safe/);
  assert.match(html, /in_process/);
  assert.match(html, /invoke/);
  assert.match(html, /Fixture cleanup completed\./);
});
