import path from "node:path";
import fsWatch from "node:fs";
import { nonNegativeInteger, positiveInteger, runtimeConfigLookup } from "../../src/runtime-config-utils.js";
import { moduleProjectors } from "../../src/modules.js";
import { buildPlatformModel } from "./platform-model.js";
import { diagnosticsFromPlatformAppContext } from "./app-context-diagnostics.js";
import { runPlatformTestCommand, runPlatformTestGate } from "./test-runs.js";
import { selectContinuousTestGates } from "./test-gate-catalog.js";

const WATCH_DIRS = Object.freeze(["src", "plugins", "test", "docs", "examples", "examples_rvm", "scripts", "store"]);
const WATCH_FILES = Object.freeze(["package.json"]);

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function parseBoolean(value, fallback) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePlatformTestMonitorConfig(runtimeConfig) {
  return {
    enabled: parseBoolean(runtimeConfigLookup(runtimeConfig, "platform.testMonitor.enabled"), true),
    watchFs: parseBoolean(runtimeConfigLookup(runtimeConfig, "platform.testMonitor.watchFs"), true),
    maxAutoRunsPerCycle: positiveInteger(runtimeConfigLookup(runtimeConfig, "platform.testMonitor.maxAutoRunsPerCycle"), 6),
    watchDebounceMs: nonNegativeInteger(runtimeConfigLookup(runtimeConfig, "platform.testMonitor.watchDebounceMs"), 150)
  };
}

function normalizeRepoRelativeSource(repoRoot, sourceId, appRoot = null) {
  const value = String(sourceId || "").trim();
  if (!value) return null;
  if (path.isAbsolute(value)) return slash(path.relative(repoRoot, value));
  if (!appRoot) return slash(value);
  return slash(path.relative(repoRoot, path.resolve(appRoot, value)));
}

function emitPlatformTestMonitorEvent(world, process, actor, body) {
  const event = { process, actor, claims: [], body };
  if (typeof world?.observe === "function") return world.observe(event);
  if (typeof world?.emit === "function") return world.emit(event);
  return null;
}

export function createPlatformTestMonitorRuntime({
  world,
  project = projector => world.project(projector),
  runtimeConfig = {},
  serverRunnerId,
  getAppContext
}, {
  buildPlatformModelImpl = buildPlatformModel,
  fsWatchModule = fsWatch,
  runPlatformTestCommandImpl = runPlatformTestCommand,
  runPlatformTestGateImpl = runPlatformTestGate
} = {}) {
  const config = normalizePlatformTestMonitorConfig(runtimeConfig);
  const repoRoot = process.cwd();
  const watcherEntries = [];
  const pendingSources = new Set();
  const pendingChangeSets = new Map();
  let closed = false;
  let processing = false;
  let debounceTimer = null;

  const queueSourcePaths = (paths = [], meta = {}) => {
    for (const sourcePath of unique(paths)) pendingSources.add(sourcePath);
    if (!pendingSources.size) return;
    emitPlatformTestMonitorEvent(world, "platform.test.autorun.enqueued", serverRunnerId, {
      kind: "source",
      sourcePaths: [...pendingSources],
      trigger: meta.trigger ?? "workspace-watch",
      queuedAt: nowIso()
    });
    void drain();
  };

  const queueChangeSetValidation = ({
    branchId = null,
    changeSetId = null,
    candidateSnapshotId = null,
    status = null
  } = {}) => {
    if (String(status || "") !== "valid" || !changeSetId) return;
    pendingChangeSets.set(String(changeSetId), {
      branchId: branchId ? String(branchId) : null,
      changeSetId: String(changeSetId),
      candidateSnapshotId: candidateSnapshotId ? String(candidateSnapshotId) : null,
      queuedAt: nowIso()
    });
    emitPlatformTestMonitorEvent(world, "platform.test.autorun.enqueued", serverRunnerId, {
      kind: "changeSet",
      branchId: branchId ? String(branchId) : null,
      changeSetId: String(changeSetId),
      candidateSnapshotId: candidateSnapshotId ? String(candidateSnapshotId) : null,
      trigger: "platform.changeSet.validate",
      queuedAt: nowIso()
    });
    void drain();
  };

  const runGateBatch = async (gates = [], baseContext = {}) => {
    const appContext = getAppContext?.() ?? null;
    const results = [];
    for (const gate of gates) {
      const gateCandidateSnapshotId = baseContext.candidateSnapshotId && (gate.protectedObjects ?? []).includes("testEnvironment:platform-candidate-snapshot")
        ? baseContext.candidateSnapshotId
        : null;
      const result = await runPlatformTestGateImpl(world, {
        actor: serverRunnerId,
        gate,
        branchId: baseContext.branchId ?? null,
        changeSetId: baseContext.changeSetId ?? null,
        candidateSnapshotId: gateCandidateSnapshotId,
        runtimeProfile: appContext?.runtimeProfile ?? null,
        runCommand: runPlatformTestCommandImpl
      });
      results.push({
        gateId: String(gate.id || ""),
        ok: result.ok === true,
        testRunId: result.testRun?.id ?? null,
        status: result.latestResult?.status ?? null,
        error: result.ok ? null : result.error
      });
    }
    return results;
  };

  const runSelectedSourceTests = async sourcePaths => {
    const appContext = getAppContext?.() ?? null;
    if (!appContext || !config.enabled) return null;
    const testGates = appContext.project?.(moduleProjectors.testGates) ?? project(moduleProjectors.testGates);
    const selectedGates = selectContinuousTestGates(testGates, sourcePaths, {
      maxGateCount: config.maxAutoRunsPerCycle
    });
    if (!selectedGates.length) {
      emitPlatformTestMonitorEvent(world, "platform.test.autorun.skipped", serverRunnerId, {
        kind: "source",
        sourcePaths,
        reason: "no matching test gates",
        finishedAt: nowIso()
      });
      return [];
    }
    emitPlatformTestMonitorEvent(world, "platform.test.autorun.start", serverRunnerId, {
      kind: "source",
      sourcePaths,
      selectedGateIds: selectedGates.map(gate => gate.id),
      startedAt: nowIso()
    });
    const results = await runGateBatch(selectedGates, {});
    emitPlatformTestMonitorEvent(world, "platform.test.autorun.finish", serverRunnerId, {
      kind: "source",
      sourcePaths,
      selectedGateIds: selectedGates.map(gate => gate.id),
      results,
      finishedAt: nowIso()
    });
    return results;
  };

  const runSelectedChangeSetTests = async queued => {
    const appContext = getAppContext?.() ?? null;
    if (!appContext || !config.enabled) return null;
    const model = await buildPlatformModelImpl({
      appContext,
      diagnostics: diagnosticsFromPlatformAppContext(appContext),
      project: appContext.project ?? project
    });
    const selectedGateIds = [...(model.selectedTestGatesByChangeSet?.[queued.changeSetId] ?? [])];
    const gateById = Object.fromEntries((model.testGates ?? []).map(gate => [String(gate.id || ""), gate]));
    const selectedGates = selectedGateIds.map(gateId => gateById[gateId]).filter(Boolean);
    if (!selectedGates.length) {
      emitPlatformTestMonitorEvent(world, "platform.test.autorun.skipped", serverRunnerId, {
        kind: "changeSet",
        branchId: queued.branchId,
        changeSetId: queued.changeSetId,
        candidateSnapshotId: queued.candidateSnapshotId,
        reason: "no selected test gates",
        finishedAt: nowIso()
      });
      return [];
    }
    emitPlatformTestMonitorEvent(world, "platform.test.autorun.start", serverRunnerId, {
      kind: "changeSet",
      branchId: queued.branchId,
      changeSetId: queued.changeSetId,
      candidateSnapshotId: queued.candidateSnapshotId,
      selectedGateIds,
      startedAt: nowIso()
    });
    const results = await runGateBatch(selectedGates, queued);
    emitPlatformTestMonitorEvent(world, "platform.test.autorun.finish", serverRunnerId, {
      kind: "changeSet",
      branchId: queued.branchId,
      changeSetId: queued.changeSetId,
      candidateSnapshotId: queued.candidateSnapshotId,
      selectedGateIds,
      results,
      finishedAt: nowIso()
    });
    return results;
  };

  const drain = async () => {
    if (closed || processing) return;
    processing = true;
    try {
      while (!closed && (pendingChangeSets.size || pendingSources.size)) {
        if (pendingChangeSets.size) {
          const [changeSetId, queued] = pendingChangeSets.entries().next().value;
          pendingChangeSets.delete(changeSetId);
          await runSelectedChangeSetTests(queued);
          continue;
        }
        const sourcePaths = [...pendingSources];
        pendingSources.clear();
        await runSelectedSourceTests(sourcePaths);
      }
    } finally {
      processing = false;
    }
  };

  const scheduleSourceChanges = (paths = [], meta = {}) => {
    queueSourcePaths(paths, meta);
  };

  const scheduleChangeSetValidation = queued => {
    queueChangeSetValidation(queued);
  };

  const watchDirectory = absoluteRoot => {
    try {
      const watcher = fsWatchModule.watch(absoluteRoot, { recursive: true }, (_eventType, filename) => {
        const relativePath = filename
          ? slash(path.relative(repoRoot, path.join(absoluteRoot, String(filename))))
          : slash(path.relative(repoRoot, absoluteRoot));
        if (!relativePath || relativePath.startsWith("node_modules/") || relativePath.startsWith(".git/")) return;
        pendingSources.add(relativePath);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          queueSourcePaths([...pendingSources], { trigger: "workspace-watch" });
        }, config.watchDebounceMs);
        debounceTimer.unref?.();
      });
      watcherEntries.push(watcher);
    } catch {}
  };

  const startWatchers = () => {
    if (!config.enabled || !config.watchFs) return;
    for (const relativePath of WATCH_DIRS) watchDirectory(path.join(repoRoot, relativePath));
    for (const filePath of WATCH_FILES) watchDirectory(path.dirname(path.join(repoRoot, filePath)));
  };

  startWatchers();

  return {
    config,
    scheduleSourceChanges,
    scheduleChangeSetValidation,
    inspect() {
      const pendingSourcePaths = [...pendingSources];
      const queuedChangeSets = [...pendingChangeSets.values()].map(row => ({ ...row }));
      const status = !config.enabled
        ? "disabled"
        : (processing
            ? "running"
            : ((pendingSourcePaths.length || queuedChangeSets.length) ? "queued" : "idle"));
      return {
        enabled: config.enabled,
        watchFs: config.watchFs,
        maxAutoRunsPerCycle: config.maxAutoRunsPerCycle,
        watchDebounceMs: config.watchDebounceMs,
        status,
        processing,
        pendingSourcePaths,
        pendingSourceCount: pendingSourcePaths.length,
        pendingChangeSets: queuedChangeSets,
        pendingChangeSetCount: queuedChangeSets.length
      };
    },
    close() {
      closed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const watcher of watcherEntries) {
        try { watcher.close(); } catch {}
      }
      watcherEntries.length = 0;
    }
  };
}
