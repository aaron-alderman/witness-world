import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createThing, projectors, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  resolveRunnerVerificationPolicy,
  resolveVerificationGatePolicy
} from "../../src/runtime-verification-policy.js";

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

export function resolvePlatformTestEnvironment(gate, {
  candidateSnapshotId = null,
  executionClass = null,
  requiresCleanWorkspace = false
} = {}) {
  if (optionalText(candidateSnapshotId) && String(executionClass || "") === "candidate_snapshot") return "platform-candidate-snapshot";
  if (String(executionClass || "") === "candidate_snapshot" || requiresCleanWorkspace === true) return "isolated-temp-workspace";
  const environment = optionalText(gate?.environment);
  if (environment) return environment;
  if (String(gate?.runner || "") === "cargo-test") return "local-rust-cargo";
  return "local-node";
}

export function inferPlatformTestExecutionClass(gate, {
  candidateSnapshotId = null,
  executionClass = null
} = {}) {
  const explicit = optionalText(executionClass);
  if (explicit) return explicit;
  if (optionalText(candidateSnapshotId)) return "candidate_snapshot";
  const protectedObjects = Array.isArray(gate?.protectedObjects) ? gate.protectedObjects.map(String) : [];
  if (protectedObjects.includes("testEnvironment:platform-candidate-snapshot")) return "candidate_snapshot";
  const environment = optionalText(gate?.environment);
  if (environment === "local-browser") return "browser_session";
  return "child_process";
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

export async function resolvePlatformTestRunnerVersion(runner = "node-test") {
  const normalizedRunner = String(runner || "node-test");
  if (normalizedRunner === "cargo-test") {
    const cargoVersion = await resolveCargoTestRunnerVersion();
    return cargoVersion ? `${normalizedRunner}:${cargoVersion}` : `${normalizedRunner}:unknown`;
  }
  return `${normalizedRunner}:node-${process.versions?.node || process.version || "unknown"}`;
}

export function buildPlatformTestEnvironmentInputs({
  command,
  cwd = repoRoot,
  timeoutMs = 120000,
  env = {},
  runner = "node-test",
  environment = "local-node",
  executionClass = "child_process",
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
    executionClass: String(executionClass || "child_process"),
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

export async function capturePlatformTestSourceRevision(world, {
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

export function buildPlatformRuntimeCompositionFingerprint({
  appContext = null,
  serverRunnerId = null,
  runtimeProfile = null
} = {}) {
  return hashJson({
    serverRunnerId: optionalText(serverRunnerId),
    runtimeProfile: optionalText(runtimeProfile ?? appContext?.runtimeProfile),
    activeRuntimePluginIds: Array.isArray(appContext?.activeRuntimePluginIds)
      ? appContext.activeRuntimePluginIds.map(String).sort(compareStable)
      : [],
    effectiveRuntimePluginIds: Array.isArray(appContext?.effectiveRuntimePluginIds)
      ? appContext.effectiveRuntimePluginIds.map(String).sort(compareStable)
      : [],
    activeBundleIds: Array.isArray(appContext?.runtimeBundleSummary?.bundleIds)
      ? appContext.runtimeBundleSummary.bundleIds.map(String).sort(compareStable)
      : [],
    activeBundleSources: Array.isArray(appContext?.runtimeBundleSummary?.bundles)
      ? appContext.runtimeBundleSummary.bundles
        .map(bundle => String(bundle?.id || bundle?.plugin || ""))
        .filter(Boolean)
        .sort(compareStable)
      : [],
    providedCapabilities: Array.isArray(appContext?.runtimeBundleSummary?.capabilities)
      ? appContext.runtimeBundleSummary.capabilities.map(String).sort(compareStable)
      : []
  });
}

export function buildPlatformVerificationPolicyFingerprint({
  appContext = null,
  gate = null,
  gatePolicy = null,
  verification = null,
  serverRunnerId = null,
  runtimeProfile = null
} = {}) {
  const resolvedPolicy = gatePolicy ?? (() => {
    if (appContext?.verificationPolicy && gate?.id) {
      return resolveVerificationGatePolicy(appContext.verificationPolicy, gate);
    }
    if (appContext?.verificationPolicy) {
      const synthesized = resolveRunnerVerificationPolicy({
        serverRunner: { id: serverRunnerId, runtimeConfig: appContext.runtimeConfig },
        runtimeProfile: runtimeProfile ?? appContext.runtimeProfile ?? null,
        runtimeConfig: appContext.runtimeConfig
      });
      return gate?.id ? resolveVerificationGatePolicy(synthesized, gate) : synthesized.defaults;
    }
    return null;
  })();
  return hashJson({
    serverRunnerId: optionalText(serverRunnerId),
    runtimeProfile: optionalText(runtimeProfile ?? appContext?.runtimeProfile),
    policySource: optionalText(appContext?.verificationPolicySource ?? appContext?.verificationPolicy?.source),
    gateId: optionalText(gate?.id),
    enabled: resolvedPolicy?.enabled ?? null,
    startup: resolvedPolicy?.startup ?? null,
    watch: resolvedPolicy?.watch ?? null,
    onChangeSet: resolvedPolicy?.onChangeSet ?? null,
    priority: resolvedPolicy?.priority ?? null,
    maxConcurrency: resolvedPolicy?.maxConcurrency ?? null,
    cpuBudget: resolvedPolicy?.cpuBudget ?? null,
    executionClass: optionalText(resolvedPolicy?.executionClass ?? verification?.executionClass),
    exclusive: resolvedPolicy?.exclusive ?? verification?.exclusive ?? null,
    requiresCleanWorkspace: resolvedPolicy?.requiresCleanWorkspace ?? verification?.requiresCleanWorkspace ?? null,
    timeoutMs: resolvedPolicy?.timeoutMs ?? verification?.timeoutMs ?? null,
    regressionMinDeltaMs: resolvedPolicy?.regressionMinDeltaMs ?? verification?.regressionMinDeltaMs ?? null,
    regressionMinDeltaPct: resolvedPolicy?.regressionMinDeltaPct ?? verification?.regressionMinDeltaPct ?? null,
    baselineScope: optionalText(resolvedPolicy?.baselineScope ?? verification?.baselineScope)
  });
}

export function buildPlatformTestCacheIdentity({
  gate,
  environmentInputs,
  sourceRevision,
  testRunnerVersion,
  serverRunnerId = null,
  runtimeCompositionFingerprint = null,
  verificationPolicyFingerprint = null
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
    dependencyGraphVersion,
    serverRunnerId: optionalText(serverRunnerId),
    runtimeCompositionFingerprint: optionalText(runtimeCompositionFingerprint),
    verificationPolicyFingerprint: optionalText(verificationPolicyFingerprint)
  });
  return {
    sourceHashSetHash,
    candidateSnapshotHash,
    environmentIdentityHash,
    testRunnerVersion: String(testRunnerVersion || "unknown"),
    dependencyGraphVersion,
    serverRunnerId: optionalText(serverRunnerId),
    runtimeCompositionFingerprint: optionalText(runtimeCompositionFingerprint),
    verificationPolicyFingerprint: optionalText(verificationPolicyFingerprint),
    cacheKey
  };
}

function compareProducedAt(left, right) {
  const leftProducedAt = String(left?.producedAt || "");
  const rightProducedAt = String(right?.producedAt || "");
  if (leftProducedAt && rightProducedAt && leftProducedAt !== rightProducedAt) return leftProducedAt.localeCompare(rightProducedAt);
  return compareStable(left?.id, right?.id);
}

async function findReusablePlatformTestResult(world, gateId, cacheKey, verificationPersistence = null) {
  const projected = world.project(moduleProjectors.testResults)
    .filter(row =>
      String(row?.gateId || "") === String(gateId || "")
      && String(row?.status || "") === "passed"
      && String(row?.cacheIdentity?.cacheKey || "") === String(cacheKey || "")
    )
    .sort(compareProducedAt)
    .at(-1) ?? null;
  if (projected) return projected;
  return await verificationPersistence?.findReusablePassedResult?.(cacheKey) ?? null;
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
  cacheHit = null,
  serverRunnerId = null,
  verification = null
}) {
  ensureThing(world, actor, id);
  const environment = resolvePlatformTestEnvironment(gate, {
    candidateSnapshotId,
    executionClass: verification?.executionClass ?? null,
    requiresCleanWorkspace: verification?.requiresCleanWorkspace === true
  });
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
      serverRunnerId: serverRunnerId ? String(serverRunnerId) : null,
      verification: verification && typeof verification === "object" ? { ...verification } : null,
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
  cacheHit = null,
  serverRunnerId = null,
  verification = null
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
    serverRunnerId: serverRunnerId ? String(serverRunnerId) : null,
    verification: verification && typeof verification === "object" ? { ...verification } : null,
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
      serverRunnerId: serverRunnerId ? String(serverRunnerId) : null,
      verification: verification && typeof verification === "object" ? { ...verification } : null,
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

function mergeRowsById(durableRows = [], liveRows = []) {
  const byId = new Map();
  for (const row of durableRows) {
    if (!row?.id) continue;
    const id = String(row.id);
    byId.set(id, { ...(byId.get(id) ?? {}), ...row });
  }
  for (const row of liveRows) {
    if (!row?.id) continue;
    const id = String(row.id);
    byId.set(id, { ...(byId.get(id) ?? {}), ...row });
  }
  return [...byId.values()];
}

export async function readPlatformTestRun(world, testRunId, { verificationPersistence = null } = {}) {
  const runId = String(testRunId || "").trim();
  const durableRows = verificationPersistence?.readModelRows?.() ?? {};
  const run = world.project(moduleProjectors.testRunIndex).byId?.[runId]
    ?? (durableRows.testRuns ?? []).find(row => String(row?.id || "") === runId)
    ?? null;
  if (!run) return { ok: false, status: 404, error: "test run not found" };
  const results = mergeRowsById(
    (durableRows.testResults ?? []).filter(row => row.runId === runId),
    world.project(moduleProjectors.testResults).filter(row => row.runId === runId)
  );
  const artifacts = mergeRowsById(
    (durableRows.testArtifacts ?? []).filter(row => row.runId === runId),
    world.project(moduleProjectors.testArtifacts).filter(row => row.runId === runId)
  );
  const suites = mergeRowsById(
    (durableRows.testSuites ?? []).filter(row => row.runId === runId),
    world.project(moduleProjectors.testSuites).filter(row => row.runId === runId)
  );
  const cases = mergeRowsById(
    (durableRows.testCases ?? []).filter(row => row.runId === runId),
    world.project(moduleProjectors.testCases).filter(row => row.runId === runId)
  );
  const reports = mergeRowsById(
    (durableRows.testReports ?? []).filter(row => row.runId === runId),
    world.project(moduleProjectors.testReports).filter(row => row.runId === runId)
  );
  const freshnessRows = mergeRowsById(
    durableRows.verificationFreshness ?? [],
    world.project(moduleProjectors.verificationFreshness)
  );
  const invalidationRows = mergeRowsById(
    durableRows.verificationInvalidations ?? [],
    world.project(moduleProjectors.verificationInvalidations)
  )
    .filter(row =>
      String(row?.gateId || "") === String(run?.gateId || "")
      && String(row?.serverRunnerId || "") === String(run?.serverRunnerId || "")
      && String(row?.runtimeProfile || "") === String(run?.runtimeProfile || "")
    )
    .sort((left, right) =>
      String(right?.producedAt || "").localeCompare(String(left?.producedAt || ""))
      || compareStable(right?.id, left?.id)
    );
  const freshness = freshnessRows.find(row =>
    String(row?.gateId || "") === String(run?.gateId || "")
    && String(row?.serverRunnerId || "") === String(run?.serverRunnerId || "")
    && String(row?.runtimeProfile || "") === String(run?.runtimeProfile || "")
  ) ?? null;
  const freshnessAtRead = freshness
    ? {
        ...freshness,
        status: freshness.latestRunId === runId || freshness.latestPassedRunId === runId
          ? freshness.status
          : "stale",
        reasonSummary: freshness.latestRunId === runId || freshness.latestPassedRunId === runId
          ? freshness.reasonSummary
          : (freshness.reasonSummary || "Newer verification evidence exists for this gate.")
      }
    : null;
  const regressionSummary = reports.find(row => row.reportKind === "regression")?.regressionSummary ?? null;
  return {
    ok: true,
    status: 200,
    testRun: run,
    testResults: results,
    testArtifacts: artifacts,
    testSuites: suites,
    testCases: cases,
    testReports: reports,
    regressionSummary,
    latestResult: results.at(-1) ?? null,
    freshnessAtRead,
    invalidationReasons: invalidationRows
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
  resolveRunnerVersion = resolvePlatformTestRunnerVersion,
  timeoutMs = null,
  executionClass = null,
  requiresCleanWorkspace = false,
  serverRunnerId = null,
  verification = null,
  verificationPersistence = null,
  appContext = null,
  runtimeCompositionFingerprint = null,
  verificationPolicyFingerprint = null
}) {
  if (!gate?.id) return { ok: false, status: 400, error: "test gate is required" };
  const runId = String(id || defaultTestRunId(gate.id)).trim();
  const existing = world.project(moduleProjectors.testRunIndex).byId?.[runId] ?? null;
  if (existing) return { ok: false, status: 409, error: "test run id already exists" };
  const normalizedBranchId = optionalText(branchId);
  const normalizedChangeSetId = optionalText(changeSetId);
  const normalizedCandidateSnapshotId = optionalText(candidateSnapshotId);
  const effectiveTimeoutMs = timeoutMs == null ? gate.timeoutMs : timeoutMs;
  const effectiveExecutionClass = inferPlatformTestExecutionClass(gate, {
    candidateSnapshotId: normalizedCandidateSnapshotId,
    executionClass
  });
  const effectiveVerification = verification && typeof verification === "object"
    ? {
        ...verification,
        executionClass: verification.executionClass ?? effectiveExecutionClass,
        requiresCleanWorkspace: verification.requiresCleanWorkspace ?? requiresCleanWorkspace
      }
    : { executionClass: effectiveExecutionClass, requiresCleanWorkspace };
  const environment = resolvePlatformTestEnvironment(gate, {
    candidateSnapshotId: normalizedCandidateSnapshotId,
    executionClass: effectiveExecutionClass,
    requiresCleanWorkspace
  });
  const workspaceDescriptor = resolvePlatformTestWorkspaceDescriptor(world, {
    environment,
    candidateSnapshotId: String(environment) === "platform-candidate-snapshot" ? normalizedCandidateSnapshotId : null
  });
  if (!workspaceDescriptor.ok) return workspaceDescriptor;
  const environmentInputs = buildPlatformTestEnvironmentInputs({
    command: gate.command,
    cwd: repoRoot,
    timeoutMs: effectiveTimeoutMs,
    env: {},
    runner: gate.runner,
    environment,
    executionClass: effectiveExecutionClass,
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
  const effectiveRuntimeCompositionFingerprint = optionalText(runtimeCompositionFingerprint)
    ?? buildPlatformRuntimeCompositionFingerprint({
      appContext,
      serverRunnerId,
      runtimeProfile
    });
  const effectiveVerificationPolicyFingerprint = optionalText(verificationPolicyFingerprint)
    ?? buildPlatformVerificationPolicyFingerprint({
      appContext,
      gate,
      verification: effectiveVerification,
      serverRunnerId,
      runtimeProfile
    });
  const cacheIdentity = buildPlatformTestCacheIdentity({
    gate,
    environmentInputs,
    sourceRevision,
    testRunnerVersion,
    serverRunnerId,
    runtimeCompositionFingerprint: effectiveRuntimeCompositionFingerprint,
    verificationPolicyFingerprint: effectiveVerificationPolicyFingerprint
  });
  const reusableResult = await findReusablePlatformTestResult(world, gate.id, cacheIdentity.cacheKey, verificationPersistence);
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
    cacheHit,
    serverRunnerId,
    verification: effectiveVerification
  });
  const execution = reusableResult
    ? cachedExecutionFromResult(reusableResult)
    : await (async () => {
        if (workspaceDescriptor.workspaceMode !== "isolated-temp-workspace") {
          return runCommand({
            command: gate.command,
            timeoutMs: effectiveTimeoutMs,
            cwd: repoRoot
          });
        }
        const workspace = await materializePlatformTestWorkspace({
          overlayFiles: workspaceDescriptor.overlayFiles
        });
        try {
          return await runCommand({
            command: gate.command,
            timeoutMs: effectiveTimeoutMs,
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
      timeoutMs: Number(effectiveTimeoutMs || 0),
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
    cacheHit,
    serverRunnerId,
    verification: effectiveVerification
  });
  const readback = await readPlatformTestRun(world, runId, { verificationPersistence });
  await verificationPersistence?.persistTestRunBundle?.({
    testRun: readback.testRun,
    testResults: readback.testResults,
    testArtifacts: readback.testArtifacts,
    testSuites: readback.testSuites,
    testCases: readback.testCases,
    testReports: readback.testReports,
    regressionSummary: readback.regressionSummary
  });
  return {
    ok: true,
    status: 201,
    startWitness,
    finishWitness,
    testRun: readback.testRun,
    testResults: readback.testResults,
    testArtifacts: readback.testArtifacts,
    testSuites: readback.testSuites,
    testCases: readback.testCases,
    testReports: readback.testReports,
    regressionSummary: readback.regressionSummary,
    latestResult: readback.latestResult
  };
}
