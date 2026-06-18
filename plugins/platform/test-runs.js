import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createThing, projectors, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, "..", "..");

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "run";
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function defaultTestRunId(gateId) {
  return `testRun:${slugify(gateId)}:${Date.now().toString(36)}`;
}

function ensureThing(world, actor, id, owner = actor) {
  if (world.project(projectors.things).has(id)) return;
  createThing(world, { actor, id, owner });
}

function defaultShellCommand(command) {
  const normalized = String(command || "").trim();
  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", normalized]
    };
  }
  return {
    file: process.env.SHELL || "sh",
    args: ["-lc", normalized]
  };
}

function resolvePlatformTestEnvironment(gate, candidateSnapshotId = null) {
  if (optionalText(candidateSnapshotId)) return "platform-candidate-snapshot";
  const environment = optionalText(gate?.environment);
  if (environment) return environment;
  if (String(gate?.runner || "") === "cargo-test") return "local-rust-cargo";
  return "local-node";
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const PLATFORM_TEST_DEPENDENCY_GRAPH_SCHEMA_VERSION = "platform-test-gate-graph/v1";
let cachedCargoVersionPromise = null;

function compareStable(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

async function resolveCargoTestRunnerVersion() {
  if (cachedCargoVersionPromise) return cachedCargoVersionPromise;
  cachedCargoVersionPromise = new Promise(resolve => {
    let stdout = "";
    let settled = false;
    const file = process.platform === "win32" ? "cargo.exe" : "cargo";
    const child = spawn(file, ["--version"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"]
    });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", chunk => { stdout += chunk; });
    const finalize = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {}
      finalize(null);
    }, 2000);
    timer.unref?.();
    child.on("error", () => {
      clearTimeout(timer);
      finalize(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      finalize(trimmed || null);
    });
  });
  return cachedCargoVersionPromise;
}

async function resolvePlatformTestRunnerVersion(runner = "node-test") {
  const normalizedRunner = String(runner || "node-test");
  if (normalizedRunner === "cargo-test") {
    const cargoVersion = await resolveCargoTestRunnerVersion();
    return cargoVersion ? `${normalizedRunner}:${cargoVersion}` : `${normalizedRunner}:unknown`;
  }
  return `${normalizedRunner}:node-${process.versions?.node || process.version || "unknown"}`;
}

function buildPlatformTestEnvironmentInputs({
  command,
  cwd = repoRoot,
  timeoutMs = 120000,
  env = {},
  runner = "node-test",
  environment = "local-node",
  runtimeProfile = null,
  workspaceMode = "live-workspace",
  workspaceSource = "workspace",
  overlayFileCount = 0
}) {
  const shell = defaultShellCommand(command);
  return {
    cwd: workspaceMode === "isolated-temp-workspace"
      ? "."
      : slash(path.relative(repoRoot, cwd) || "."),
    platform: process.platform,
    shellFile: shell.file,
    shellArgs: [...shell.args],
    envOverrideKeys: Object.keys(env || {}).sort(),
    runner: String(runner || "node-test"),
    environment: String(environment || "local-node"),
    workspaceMode: String(workspaceMode || "live-workspace"),
    workspaceSource: String(workspaceSource || "workspace"),
    overlayFileCount: Number(overlayFileCount || 0),
    timeoutMs: Number(timeoutMs || 0),
    runtimeProfile: runtimeProfile ? String(runtimeProfile) : null
  };
}

function candidateSnapshotOverlayError(status, error, details = null) {
  return {
    ok: false,
    status,
    error,
    ...(details ? { details } : {})
  };
}

function resolvePlatformTestWorkspaceDescriptor(world, {
  environment = "local-node",
  candidateSnapshotId = null
}) {
  const normalizedEnvironment = String(environment || "local-node");
  const normalizedCandidateSnapshotId = optionalText(candidateSnapshotId);
  if (normalizedEnvironment !== "isolated-temp-workspace" && normalizedEnvironment !== "platform-candidate-snapshot") {
    return {
      ok: true,
      workspaceMode: "live-workspace",
      workspaceSource: "workspace",
      overlayFiles: []
    };
  }
  if (!normalizedCandidateSnapshotId) {
    if (normalizedEnvironment === "platform-candidate-snapshot") {
      return candidateSnapshotOverlayError(400, "candidate snapshot id is required for platform-candidate-snapshot execution");
    }
    return {
      ok: true,
      workspaceMode: "isolated-temp-workspace",
      workspaceSource: "workspace",
      overlayFiles: []
    };
  }
  const snapshot = world.project(moduleProjectors.candidateSnapshotIndex).byId?.[normalizedCandidateSnapshotId] ?? null;
  if (!snapshot) return candidateSnapshotOverlayError(404, "candidate snapshot not found");
  const edits = world.project(moduleProjectors.changeSetEditIndex).byChangeSet?.[snapshot.changeSetId] ?? [];
  const editsByPath = new Map(
    edits.map(edit => [String(edit.path || ""), edit])
  );
  const overlayFiles = [];
  for (const file of Array.isArray(snapshot.files) ? snapshot.files : []) {
    const relativePath = String(file?.path || "");
    const edit = editsByPath.get(relativePath);
    if (!edit || String(edit.nextContentHash || "") !== String(file?.nextContentHash || "")) {
      return candidateSnapshotOverlayError(
        409,
        "candidate snapshot overlay can no longer be materialized from the current staged edits",
        {
          candidateSnapshotId: normalizedCandidateSnapshotId,
          path: relativePath || null
        }
      );
    }
    overlayFiles.push({
      path: relativePath,
      content: String(edit.nextContent ?? "")
    });
  }
  return {
    ok: true,
    workspaceMode: "isolated-temp-workspace",
    workspaceSource: "candidateSnapshot",
    overlayFiles
  };
}

async function materializePlatformTestWorkspace({
  overlayFiles = []
}) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-platform-test-workspace-"));
  try {
    await fs.cp(repoRoot, workspaceRoot, {
      recursive: true,
      filter: source => path.basename(source) !== ".git"
    });
    for (const overlay of overlayFiles) {
      const targetPath = path.join(workspaceRoot, String(overlay.path || ""));
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, String(overlay.content ?? ""), "utf8");
    }
    return {
      cwd: workspaceRoot,
      async cleanup() {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function capturePlatformTestSourceRevision(world, {
  gate,
  branchId = null,
  changeSetId = null,
  candidateSnapshotId = null
}) {
  const normalizedCandidateSnapshotId = optionalText(candidateSnapshotId);
  const snapshot = normalizedCandidateSnapshotId
    ? (world.project(moduleProjectors.candidateSnapshotIndex).byId?.[normalizedCandidateSnapshotId] ?? null)
    : null;
  const snapshotFiles = new Map(
    Array.isArray(snapshot?.files)
      ? snapshot.files.map(file => [String(file.path), {
        path: String(file.path),
        hash: String(file.nextContentHash || ""),
        source: "candidateSnapshot",
        previousHash: file.previousHash ?? null,
        sourceLanguage: file.sourceLanguage ? String(file.sourceLanguage) : null
      }])
      : []
  );
  const dependencyHashes = [];
  for (const dependency of Array.isArray(gate?.sourceDependencies) ? gate.sourceDependencies.map(String) : []) {
    const snapshotFile = snapshotFiles.get(dependency);
    if (snapshotFile) {
      dependencyHashes.push({
        path: dependency,
        hashAlgorithm: "sha256",
        hash: snapshotFile.hash,
        source: snapshotFile.source,
        previousHash: snapshotFile.previousHash,
        sourceLanguage: snapshotFile.sourceLanguage
      });
      continue;
    }
    const absolutePath = path.join(repoRoot, dependency);
    try {
      const buffer = await fs.readFile(absolutePath);
      dependencyHashes.push({
        path: dependency,
        hashAlgorithm: "sha256",
        hash: hashBuffer(buffer),
        source: "workspace",
        sizeBytes: buffer.byteLength
      });
    } catch {
      dependencyHashes.push({
        path: dependency,
        hashAlgorithm: "sha256",
        hash: null,
        source: "workspace",
        missing: true
      });
    }
  }
  const candidateSnapshotHash = snapshot
    ? hashJson({
        status: String(snapshot.status || "invalid"),
        files: (Array.isArray(snapshot.files) ? snapshot.files : [])
          .map(file => ({
            path: String(file.path || ""),
            nextContentHash: String(file.nextContentHash || ""),
            previousHash: file.previousHash ?? null,
            sourceLanguage: file.sourceLanguage ? String(file.sourceLanguage) : null
          }))
          .sort((left, right) => compareStable(left.path, right.path))
      })
    : null;
  return {
    capturedAt: nowIso(),
    branchId: optionalText(branchId),
    changeSetId: optionalText(changeSetId),
    candidateSnapshotId: normalizedCandidateSnapshotId,
    candidateSnapshotRevision: typeof snapshot?.revision === "number" ? snapshot.revision : null,
    candidateSnapshotStatus: snapshot?.status ? String(snapshot.status) : null,
    candidateSnapshotHash,
    dependencyHashes
  };
}

export async function runPlatformTestCommand({
  command,
  cwd = repoRoot,
  timeoutMs = 120000,
  env = {}
}) {
  const shell = defaultShellCommand(command);
  const startedAt = nowIso();
  const startedMs = Date.now();
  return await new Promise(resolve => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const child = spawn(shell.file, shell.args, {
      cwd,
      env: {
        ...process.env,
        ...env,
        WITNESS_LOG_LEVEL: env.WITNESS_LOG_LEVEL ?? process.env.WITNESS_LOG_LEVEL ?? "silent"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", chunk => { stdout += chunk; });
    child.stderr?.on("data", chunk => { stderr += chunk; });
    const finalize = payload => {
      if (settled) return;
      settled = true;
      resolve({
        startedAt,
        finishedAt: nowIso(),
        durationMs: Math.max(0, Date.now() - startedMs),
        stdout,
        stderr,
        timedOut,
        ...payload
      });
    };
    const killHard = () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    };
    const timer = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          try {
            child.kill("SIGTERM");
          } catch {}
          setTimeout(killHard, 2000).unref?.();
        }, timeoutMs)
      : null;
    child.on("error", error => {
      if (timer) clearTimeout(timer);
      finalize({
        exitCode: null,
        signal: null,
        status: "error",
        error: error instanceof Error ? error.message : "test runner failed"
      });
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      finalize({
        exitCode: typeof code === "number" ? code : null,
        signal: signal ? String(signal) : null,
        status: timedOut ? "timed_out" : ((code ?? 1) === 0 ? "passed" : "failed"),
        error: null
      });
    });
  });
}

function buildPlatformTestDependencyGraphVersion(gate) {
  return hashJson({
    schemaVersion: PLATFORM_TEST_DEPENDENCY_GRAPH_SCHEMA_VERSION,
    sourceDependencies: Array.isArray(gate?.sourceDependencies) ? gate.sourceDependencies.map(String).sort(compareStable) : [],
    protectedObjects: Array.isArray(gate?.protectedObjects) ? gate.protectedObjects.map(String).sort(compareStable) : []
  });
}

function buildPlatformTestCacheIdentity({
  gate,
  environmentInputs,
  sourceRevision,
  testRunnerVersion
}) {
  const sourceHashSetHash = hashJson(
    (Array.isArray(sourceRevision?.dependencyHashes) ? sourceRevision.dependencyHashes : [])
      .map(row => ({
        path: String(row.path || ""),
        hash: row.hash ?? null,
        source: row.source ? String(row.source) : null,
        previousHash: row.previousHash ?? null,
        sourceLanguage: row.sourceLanguage ? String(row.sourceLanguage) : null,
        missing: row.missing === true
      }))
      .sort((left, right) => compareStable(left.path, right.path))
  );
  const candidateSnapshotHash = sourceRevision?.candidateSnapshotHash ?? null;
  const environmentIdentityHash = hashJson({
    cwd: environmentInputs?.cwd ? String(environmentInputs.cwd) : null,
    platform: environmentInputs?.platform ? String(environmentInputs.platform) : null,
    shellFile: environmentInputs?.shellFile ? String(environmentInputs.shellFile) : null,
    shellArgs: Array.isArray(environmentInputs?.shellArgs) ? environmentInputs.shellArgs.map(String) : [],
    envOverrideKeys: Array.isArray(environmentInputs?.envOverrideKeys) ? environmentInputs.envOverrideKeys.map(String).sort(compareStable) : [],
    runner: environmentInputs?.runner ? String(environmentInputs.runner) : null,
    environment: environmentInputs?.environment ? String(environmentInputs.environment) : null,
    workspaceMode: environmentInputs?.workspaceMode ? String(environmentInputs.workspaceMode) : null,
    workspaceSource: environmentInputs?.workspaceSource ? String(environmentInputs.workspaceSource) : null,
    overlayFileCount: Number(environmentInputs?.overlayFileCount || 0),
    timeoutMs: Number(environmentInputs?.timeoutMs || 0),
    runtimeProfile: environmentInputs?.runtimeProfile ? String(environmentInputs.runtimeProfile) : null
  });
  const dependencyGraphVersion = buildPlatformTestDependencyGraphVersion(gate);
  const cacheKey = hashJson({
    gateId: String(gate?.id || ""),
    sourceHashSetHash,
    candidateSnapshotHash,
    environmentIdentityHash,
    testRunnerVersion: String(testRunnerVersion || "unknown"),
    dependencyGraphVersion
  });
  return {
    sourceHashSetHash,
    candidateSnapshotHash,
    environmentIdentityHash,
    testRunnerVersion: String(testRunnerVersion || "unknown"),
    dependencyGraphVersion,
    cacheKey
  };
}

function compareProducedAt(left, right) {
  const leftProducedAt = String(left?.producedAt || "");
  const rightProducedAt = String(right?.producedAt || "");
  if (leftProducedAt && rightProducedAt && leftProducedAt !== rightProducedAt) return leftProducedAt.localeCompare(rightProducedAt);
  return compareStable(left?.id, right?.id);
}

function findReusablePlatformTestResult(world, gateId, cacheKey) {
  return world.project(moduleProjectors.testResults)
    .filter(row =>
      String(row?.gateId || "") === String(gateId || "")
      && String(row?.status || "") === "passed"
      && String(row?.cacheIdentity?.cacheKey || "") === String(cacheKey || "")
    )
    .sort(compareProducedAt)
    .at(-1) ?? null;
}

function cachedExecutionFromResult(result) {
  const startedAt = nowIso();
  return {
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    exitCode: typeof result?.exitCode === "number" ? result.exitCode : 0,
    signal: result?.signal ? String(result.signal) : null,
    status: String(result?.status || "passed"),
    stdout: String(result?.stdout || ""),
    stderr: String(result?.stderr || ""),
    timedOut: false,
    error: null
  };
}

function emitPlatformTestRunStart(world, {
  actor,
  id,
  gate,
  branchId = null,
  changeSetId = null,
  candidateSnapshotId = null,
  session = null,
  runtimeProfile = null,
  environmentInputs = null,
  sourceRevision = null,
  cacheIdentity = null,
  cacheStatus = "miss",
  cacheHit = null
}) {
  ensureThing(world, actor, id);
  const environment = resolvePlatformTestEnvironment(gate, candidateSnapshotId);
  return world.emit({
    process: "platform.test.run.start",
    actor,
    claims: [relation(id, "hasModuleKind", "testRun")],
    body: {
      id,
      gateId: String(gate.id),
      title: String(gate.title || gate.id),
      command: String(gate.command || ""),
      runner: String(gate.runner || "node-test"),
      environment,
      timeoutMs: Number(gate.timeoutMs || 0),
      branchId,
      changeSetId,
      candidateSnapshotId,
      sourceDependencies: Array.isArray(gate.sourceDependencies) ? gate.sourceDependencies.map(String) : [],
      protectedObjects: Array.isArray(gate.protectedObjects) ? gate.protectedObjects.map(String) : [],
      environmentInputs: environmentInputs && typeof environmentInputs === "object" ? { ...environmentInputs } : null,
      sourceRevision: sourceRevision && typeof sourceRevision === "object" ? { ...sourceRevision, dependencyHashes: Array.isArray(sourceRevision.dependencyHashes) ? sourceRevision.dependencyHashes.map(row => ({ ...row })) : [] } : null,
      cacheIdentity: cacheIdentity && typeof cacheIdentity === "object" ? { ...cacheIdentity } : null,
      cacheStatus: String(cacheStatus || "miss"),
      cacheHit: cacheHit && typeof cacheHit === "object" ? { ...cacheHit } : null,
      actor,
      session: session?.id ?? null,
      runtimeProfile: runtimeProfile ? String(runtimeProfile) : null,
      status: "running",
      startedAt: nowIso()
    }
  });
}

function emitPlatformTestRunFinish(world, {
  actor,
  run,
  execution,
  branchId = null,
  changeSetId = null,
  candidateSnapshotId = null,
  session = null,
  runtimeProfile = null,
  environmentInputs = null,
  sourceRevision = null,
  cacheIdentity = null,
  cacheStatus = "miss",
  cacheHit = null
}) {
  const resultId = `testResult:${run.id}:1`;
  ensureThing(world, actor, resultId);
  const result = {
    id: resultId,
    runId: run.id,
    gateId: run.gateId,
    title: run.title,
    status: execution.status,
    exitCode: execution.exitCode,
    signal: execution.signal,
    stdout: execution.stdout,
    stderr: execution.stderr,
    durationMs: execution.durationMs,
    timedOut: execution.timedOut === true,
    branchId,
    changeSetId,
    candidateSnapshotId,
    sourceDependencies: Array.isArray(run.sourceDependencies) ? run.sourceDependencies.map(String) : [],
    protectedObjects: Array.isArray(run.protectedObjects) ? run.protectedObjects.map(String) : [],
    environmentInputs: environmentInputs && typeof environmentInputs === "object" ? { ...environmentInputs } : null,
    sourceRevision: sourceRevision && typeof sourceRevision === "object" ? { ...sourceRevision, dependencyHashes: Array.isArray(sourceRevision.dependencyHashes) ? sourceRevision.dependencyHashes.map(row => ({ ...row })) : [] } : null,
    cacheIdentity: cacheIdentity && typeof cacheIdentity === "object" ? { ...cacheIdentity } : null,
    cacheStatus: String(cacheStatus || "miss"),
    cacheHit: cacheHit && typeof cacheHit === "object" ? { ...cacheHit } : null,
    producedAt: execution.finishedAt
  };
  return world.emit({
    process: "platform.test.run.finish",
    actor,
    claims: [
      relation(run.id, "produced", resultId),
      relation(resultId, "hasModuleKind", "testResult")
    ],
    body: {
      id: run.id,
      gateId: run.gateId,
      title: run.title,
      command: run.command,
      runner: run.runner,
      environment: run.environment,
      timeoutMs: run.timeoutMs,
      branchId,
      changeSetId,
      candidateSnapshotId,
      sourceDependencies: Array.isArray(run.sourceDependencies) ? run.sourceDependencies.map(String) : [],
      protectedObjects: Array.isArray(run.protectedObjects) ? run.protectedObjects.map(String) : [],
      environmentInputs: environmentInputs && typeof environmentInputs === "object" ? { ...environmentInputs } : null,
      sourceRevision: sourceRevision && typeof sourceRevision === "object" ? { ...sourceRevision, dependencyHashes: Array.isArray(sourceRevision.dependencyHashes) ? sourceRevision.dependencyHashes.map(row => ({ ...row })) : [] } : null,
      cacheIdentity: cacheIdentity && typeof cacheIdentity === "object" ? { ...cacheIdentity } : null,
      cacheStatus: String(cacheStatus || "miss"),
      cacheHit: cacheHit && typeof cacheHit === "object" ? { ...cacheHit } : null,
      actor,
      session: session?.id ?? null,
      runtimeProfile: runtimeProfile ? String(runtimeProfile) : null,
      status: execution.status,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      durationMs: execution.durationMs,
      exitCode: execution.exitCode,
      signal: execution.signal,
      stdout: execution.stdout,
      stderr: execution.stderr,
      timedOut: execution.timedOut === true,
      error: execution.error ?? null,
      results: [result]
    }
  });
}

export function listPlatformTestRuns(world) {
  return world.project(moduleProjectors.testRuns);
}

export function readPlatformTestRun(world, testRunId) {
  const runId = String(testRunId || "").trim();
  const run = world.project(moduleProjectors.testRunIndex).byId?.[runId] ?? null;
  if (!run) return { ok: false, status: 404, error: "test run not found" };
  const results = world.project(moduleProjectors.testResults).filter(row => row.runId === runId);
  const artifacts = world.project(moduleProjectors.testArtifacts).filter(row => row.runId === runId);
  return {
    ok: true,
    status: 200,
    testRun: run,
    testResults: results,
    testArtifacts: artifacts,
    latestResult: results.at(-1) ?? null
  };
}

export async function runPlatformTestGate(world, {
  actor,
  gate,
  id = null,
  branchId = null,
  changeSetId = null,
  candidateSnapshotId = null,
  session = null,
  runtimeProfile = null,
  runCommand = runPlatformTestCommand,
  resolveRunnerVersion = resolvePlatformTestRunnerVersion
}) {
  if (!gate?.id) return { ok: false, status: 400, error: "test gate is required" };
  const runId = String(id || defaultTestRunId(gate.id)).trim();
  const existing = world.project(moduleProjectors.testRunIndex).byId?.[runId] ?? null;
  if (existing) return { ok: false, status: 409, error: "test run id already exists" };
  const normalizedBranchId = optionalText(branchId);
  const normalizedChangeSetId = optionalText(changeSetId);
  const normalizedCandidateSnapshotId = optionalText(candidateSnapshotId);
  const environment = resolvePlatformTestEnvironment(gate, normalizedCandidateSnapshotId);
  const workspaceDescriptor = resolvePlatformTestWorkspaceDescriptor(world, {
    environment,
    candidateSnapshotId: normalizedCandidateSnapshotId
  });
  if (!workspaceDescriptor.ok) return workspaceDescriptor;
  const environmentInputs = buildPlatformTestEnvironmentInputs({
    command: gate.command,
    cwd: repoRoot,
    timeoutMs: gate.timeoutMs,
    env: {},
    runner: gate.runner,
    environment,
    runtimeProfile,
    workspaceMode: workspaceDescriptor.workspaceMode,
    workspaceSource: workspaceDescriptor.workspaceSource,
    overlayFileCount: workspaceDescriptor.overlayFiles.length
  });
  const sourceRevision = await capturePlatformTestSourceRevision(world, {
    gate,
    branchId: normalizedBranchId,
    changeSetId: normalizedChangeSetId,
    candidateSnapshotId: normalizedCandidateSnapshotId
  });
  const testRunnerVersion = await resolveRunnerVersion(String(gate.runner || "node-test"));
  const cacheIdentity = buildPlatformTestCacheIdentity({
    gate,
    environmentInputs,
    sourceRevision,
    testRunnerVersion
  });
  const reusableResult = findReusablePlatformTestResult(world, gate.id, cacheIdentity.cacheKey);
  const cacheStatus = reusableResult ? "hit" : "miss";
  const cacheHit = reusableResult
    ? {
        resultId: String(reusableResult.id),
        runId: String(reusableResult.runId || ""),
        producedAt: reusableResult.producedAt ?? null
      }
    : null;
  const startWitness = emitPlatformTestRunStart(world, {
    actor,
    id: runId,
    gate,
    branchId: normalizedBranchId,
    changeSetId: normalizedChangeSetId,
    candidateSnapshotId: normalizedCandidateSnapshotId,
    session,
    runtimeProfile,
    environmentInputs,
    sourceRevision,
    cacheIdentity,
    cacheStatus,
    cacheHit
  });
  const execution = reusableResult
    ? cachedExecutionFromResult(reusableResult)
    : await (async () => {
        if (workspaceDescriptor.workspaceMode !== "isolated-temp-workspace") {
          return runCommand({
            command: gate.command,
            timeoutMs: gate.timeoutMs,
            cwd: repoRoot
          });
        }
        const workspace = await materializePlatformTestWorkspace({
          overlayFiles: workspaceDescriptor.overlayFiles
        });
        try {
          return await runCommand({
            command: gate.command,
            timeoutMs: gate.timeoutMs,
            cwd: workspace.cwd
          });
        } finally {
          await workspace.cleanup();
        }
      })();
  const finishWitness = emitPlatformTestRunFinish(world, {
    actor,
    run: {
      id: runId,
      gateId: String(gate.id),
      title: String(gate.title || gate.id),
      command: String(gate.command || ""),
      runner: String(gate.runner || "node-test"),
      environment,
      timeoutMs: Number(gate.timeoutMs || 0),
      sourceDependencies: Array.isArray(gate.sourceDependencies) ? gate.sourceDependencies.map(String) : [],
      protectedObjects: Array.isArray(gate.protectedObjects) ? gate.protectedObjects.map(String) : []
    },
    execution,
    branchId: normalizedBranchId,
    changeSetId: normalizedChangeSetId,
    candidateSnapshotId: normalizedCandidateSnapshotId,
    session,
    runtimeProfile,
    environmentInputs,
    sourceRevision,
    cacheIdentity,
    cacheStatus,
    cacheHit
  });
  const readback = readPlatformTestRun(world, runId);
  return {
    ok: true,
    status: 201,
    startWitness,
    finishWitness,
    testRun: readback.testRun,
    testResults: readback.testResults,
    testArtifacts: readback.testArtifacts,
    latestResult: readback.latestResult
  };
}
