import fs from "node:fs/promises";
import path from "node:path";
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

function buildPlatformTestEnvironmentInputs({
  command,
  cwd = repoRoot,
  timeoutMs = 120000,
  env = {},
  runner = "node-test",
  environment = "local-node",
  runtimeProfile = null
}) {
  const shell = defaultShellCommand(command);
  return {
    cwd: slash(path.relative(repoRoot, cwd) || "."),
    platform: process.platform,
    shellFile: shell.file,
    shellArgs: [...shell.args],
    envOverrideKeys: Object.keys(env || {}).sort(),
    runner: String(runner || "node-test"),
    environment: String(environment || "local-node"),
    timeoutMs: Number(timeoutMs || 0),
    runtimeProfile: runtimeProfile ? String(runtimeProfile) : null
  };
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
  return {
    capturedAt: nowIso(),
    branchId: optionalText(branchId),
    changeSetId: optionalText(changeSetId),
    candidateSnapshotId: normalizedCandidateSnapshotId,
    candidateSnapshotRevision: typeof snapshot?.revision === "number" ? snapshot.revision : null,
    candidateSnapshotStatus: snapshot?.status ? String(snapshot.status) : null,
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
  sourceRevision = null
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
  sourceRevision = null
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
  runCommand = runPlatformTestCommand
}) {
  if (!gate?.id) return { ok: false, status: 400, error: "test gate is required" };
  const runId = String(id || defaultTestRunId(gate.id)).trim();
  const existing = world.project(moduleProjectors.testRunIndex).byId?.[runId] ?? null;
  if (existing) return { ok: false, status: 409, error: "test run id already exists" };
  const normalizedBranchId = optionalText(branchId);
  const normalizedChangeSetId = optionalText(changeSetId);
  const normalizedCandidateSnapshotId = optionalText(candidateSnapshotId);
  const environment = resolvePlatformTestEnvironment(gate, normalizedCandidateSnapshotId);
  const environmentInputs = buildPlatformTestEnvironmentInputs({
    command: gate.command,
    cwd: repoRoot,
    timeoutMs: gate.timeoutMs,
    env: {},
    runner: gate.runner,
    environment,
    runtimeProfile
  });
  const sourceRevision = await capturePlatformTestSourceRevision(world, {
    gate,
    branchId: normalizedBranchId,
    changeSetId: normalizedChangeSetId,
    candidateSnapshotId: normalizedCandidateSnapshotId
  });
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
    sourceRevision
  });
  const execution = await runCommand({
    command: gate.command,
    timeoutMs: gate.timeoutMs,
    cwd: repoRoot
  });
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
    sourceRevision
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
