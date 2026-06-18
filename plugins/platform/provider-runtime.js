import path from "node:path";
import fsWatch from "node:fs";
import { moduleProjectors } from "../../src/modules.js";
import { buildPlatformModel } from "./platform-model.js";
import { diagnosticsFromPlatformAppContext } from "./app-context-diagnostics.js";
import {
  buildPlatformRuntimeCompositionFingerprint,
  buildPlatformTestCacheIdentity,
  buildPlatformTestEnvironmentInputs,
  buildPlatformVerificationPolicyFingerprint,
  capturePlatformTestSourceRevision,
  resolvePlatformTestEnvironment,
  resolvePlatformTestRunnerVersion,
  runPlatformTestCommand,
  runPlatformTestGate
} from "./test-runs.js";
import { selectContinuousTestGates } from "./test-gate-catalog.js";
import {
  resolveRunnerVerificationPolicy,
  resolveVerificationGatePolicy
} from "../../src/runtime-verification-policy.js";

const WATCH_DIRS = Object.freeze(["src", "plugins", "test", "docs", "examples", "examples_rvm", "scripts", "store"]);
const WATCH_FILES = Object.freeze(["package.json"]);

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function nowIso() {
  return new Date().toISOString();
}

function compareStable(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function comparePolicyPriority(left, right) {
  return Number(right?.priority || 0) - Number(left?.priority || 0)
    || String(left?.gateId || "").localeCompare(String(right?.gateId || ""));
}

function emitVerificationEvent(world, process, actor, body) {
  const event = { process, actor, claims: [], body };
  if (typeof world?.observe === "function") return world.observe(event);
  if (typeof world?.emit === "function") return world.emit(event);
  return null;
}

function executionClassForEntry(entry = null) {
  return String(entry?.executionClass || "child_process");
}

function isolationCandidateSnapshotId(entry = null) {
  const executionClass = executionClassForEntry(entry);
  if (executionClass === "candidate_snapshot") return entry?.candidateSnapshotId ?? null;
  return null;
}

function shouldUseIsolatedWorkspace(entry = null) {
  const executionClass = executionClassForEntry(entry);
  return executionClass === "candidate_snapshot"
    || entry?.requiresCleanWorkspace === true;
}

function mergeRowsById(durableRows = [], liveRows = []) {
  const byId = new Map();
  for (const row of durableRows) {
    if (!row?.id) continue;
    byId.set(String(row.id), { ...(byId.get(String(row.id)) ?? {}), ...row });
  }
  for (const row of liveRows) {
    if (!row?.id) continue;
    byId.set(String(row.id), { ...(byId.get(String(row.id)) ?? {}), ...row });
  }
  return [...byId.values()];
}

function verificationFreshnessId(serverRunnerId, runtimeProfile, gateId) {
  return `verificationFreshness:${serverRunnerId}:${runtimeProfile || "profile"}:${gateId}`;
}

function invalidationId(serverRunnerId, runtimeProfile, gateId, reasonKind) {
  return `verificationInvalidation:${serverRunnerId}:${runtimeProfile || "profile"}:${gateId}:${reasonKind}:${Date.now().toString(36)}`;
}

function coverageTargetIdsByGate(coverageEdges = [], gateId = "") {
  return unique(
    (Array.isArray(coverageEdges) ? coverageEdges : [])
      .filter(edge => String(edge?.gateId || "") === String(gateId || "") && String(edge?.coverageKind || "") === "protectedObject")
      .map(edge => edge.targetId)
  );
}

function latestCompletedRunFor(rows = []) {
  return [...rows]
    .filter(row => optionalText(row?.finishedAt))
    .sort((left, right) =>
      String(right?.finishedAt || "").localeCompare(String(left?.finishedAt || ""))
      || compareStable(right?.id, left?.id)
    )
    [0] ?? null;
}

function latestPassedRunFor(rows = []) {
  return [...rows]
    .filter(row => optionalText(row?.finishedAt) && String(row?.status || "") === "passed")
    .sort((left, right) =>
      String(right?.finishedAt || "").localeCompare(String(left?.finishedAt || ""))
      || compareStable(right?.id, left?.id)
    )
    [0] ?? null;
}

function sourceHashMap(sourceRevision = null) {
  return new Map(
    (Array.isArray(sourceRevision?.dependencyHashes) ? sourceRevision.dependencyHashes : [])
      .map(row => [String(row?.path || ""), row?.hash ?? null])
  );
}

function changedPathsForSourceDelta(previousRevision = null, currentRevision = null, fallback = []) {
  const previous = sourceHashMap(previousRevision);
  const current = sourceHashMap(currentRevision);
  const paths = new Set([...previous.keys(), ...current.keys()]);
  const changed = [];
  for (const path of paths) {
    if ((previous.get(path) ?? null) !== (current.get(path) ?? null)) changed.push(path);
  }
  return unique(changed.length ? changed : fallback);
}

function summarizeFreshnessReasons(reasonKinds = [], changedPaths = []) {
  const kinds = unique(reasonKinds);
  if (!kinds.length) return "Verification evidence matches the current runtime inputs.";
  if (kinds.includes("missing_evidence")) return "No durable verification evidence exists for this gate yet.";
  const labels = [];
  if (kinds.includes("source_changed")) labels.push(changedPaths.length ? `source changed in ${changedPaths.join(", ")}` : "source changed");
  if (kinds.includes("dependency_graph_changed")) labels.push("dependency graph changed");
  if (kinds.includes("runtime_composition_changed")) labels.push("runtime composition changed");
  if (kinds.includes("verification_policy_changed")) labels.push("verification policy changed");
  if (kinds.includes("environment_changed")) labels.push("execution environment changed");
  return labels.length ? `${labels.join("; ")}.` : "Verification evidence is stale.";
}

function sameReasonKinds(left = [], right = []) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameFreshnessMeaning(left = null, right = null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return String(left.status || "") === String(right.status || "")
    && String(left.latestRunId || "") === String(right.latestRunId || "")
    && String(left.latestPassedRunId || "") === String(right.latestPassedRunId || "")
    && String(left.latestUsableCacheKey || "") === String(right.latestUsableCacheKey || "")
    && sameReasonKinds(left.reasonKinds, right.reasonKinds)
    && String(left.reasonSummary || "") === String(right.reasonSummary || "")
    && String(left.staleSince || "") === String(right.staleSince || "")
    && left.blocking === right.blocking;
}

function affectedGatesForSourcePaths(gates = [], sourcePaths = []) {
  const normalizedSourcePaths = unique(sourcePaths);
  if (!normalizedSourcePaths.length) return [];
  const affectsAll = normalizedSourcePaths.includes("app.wtoml") || normalizedSourcePaths.includes("package.json");
  return (Array.isArray(gates) ? gates : []).filter(gate =>
    affectsAll
    || normalizedSourcePaths.some(changedPath => (gate?.sourceDependencies ?? []).includes(changedPath))
  );
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
  const repoRoot = process.cwd();
  const watcherEntries = [];
  const pendingSources = new Set();
  const pendingChangeSets = [];
  const queue = [];
  const completedExecutions = [];
  const gateRegistry = new Map();
  let queueSequence = 0;
  let closed = false;
  let processing = false;
  let debounceTimer = null;
  let initialized = false;
  let activeExecution = null;

  const resolvedState = () => {
    const appContext = getAppContext?.() ?? null;
    const policy = appContext?.verificationPolicy ?? resolveRunnerVerificationPolicy({
      serverRunner: {
        id: serverRunnerId,
        runtimeConfig
      },
      runtimeProfile: appContext?.runtimeProfile ?? null,
      runtimeConfig: appContext?.runtimeConfig ?? runtimeConfig
    });
    const gates = appContext?.project?.(moduleProjectors.testGates) ?? project(moduleProjectors.testGates) ?? [];
    const gatePolicies = gates
      .map(gate => resolveVerificationGatePolicy(policy, gate))
      .filter(Boolean)
      .sort(comparePolicyPriority);
    return {
      appContext,
      policy,
      gatePolicies,
      gatePolicyById: Object.fromEntries(gatePolicies.map(row => [row.gateId, row]))
    };
  };

  const emitResolvedPolicies = () => {
    const { policy, gatePolicies, appContext } = resolvedState();
    const persistence = appContext?.verificationPersistence ?? null;
    const producedAt = nowIso();
    const defaultsRow = {
      id: `verificationPolicy:${serverRunnerId}:${policy.runtimeProfile || "profile"}:defaults`,
      serverRunnerId,
      runtimeProfile: policy.runtimeProfile ?? null,
      policySource: policy.source,
      policyKind: "defaults",
      enabled: policy.enabled === true,
      ...policy.defaults,
      diagnostics: Array.isArray(policy.diagnostics) ? policy.diagnostics.map(row => ({ ...row })) : [],
      producedAt
    };
    const policyRows = [
      defaultsRow,
      ...gatePolicies.map(row => ({
        ...row,
        policySource: policy.source,
        policyKind: "gate",
        status: row.diagnostics?.length ? "invalid" : "resolved",
        gateTitle: gatesById().get(row.gateId)?.title ?? row.gateId,
        producedAt
      }))
    ];
    for (const row of policyRows) {
      emitVerificationEvent(world, "platform.verification.policy.resolved", serverRunnerId, row);
    }
    void persistence?.recordPolicyRows?.(policyRows);
  };

  const gatesById = () => {
    const appContext = getAppContext?.() ?? null;
    const gates = appContext?.project?.(moduleProjectors.testGates) ?? project(moduleProjectors.testGates) ?? [];
    for (const gate of gates) {
      const gateId = String(gate?.id || "");
      if (!gateId) continue;
      gateRegistry.set(gateId, gate);
    }
    return new Map(gateRegistry);
  };

  const createQueueEntry = (gate, gatePolicy, meta = {}) => ({
    id: `verificationQueue:${serverRunnerId}:${(++queueSequence).toString(36)}`,
    serverRunnerId,
    runtimeProfile: meta.runtimeProfile ?? null,
    gateId: String(gate.id || gatePolicy.gateId || ""),
    gateTitle: String(gate.title || gate.id || gatePolicy.gateId || ""),
    executionClass: gatePolicy.executionClass,
    exclusive: gatePolicy.exclusive === true,
    requiresCleanWorkspace: gatePolicy.requiresCleanWorkspace === true,
    priority: Number(gatePolicy.priority || 0),
    triggerKind: String(meta.triggerKind || "manual"),
    trigger: String(meta.trigger || meta.triggerKind || "manual"),
    branchId: meta.branchId ? String(meta.branchId) : null,
    changeSetId: meta.changeSetId ? String(meta.changeSetId) : null,
    candidateSnapshotId: meta.candidateSnapshotId ? String(meta.candidateSnapshotId) : null,
    sourcePaths: Array.isArray(meta.sourcePaths) ? meta.sourcePaths.map(String) : [],
    status: "queued",
    queuedAt: nowIso()
  });

  const enqueueEntries = (entries = []) => {
    const nextEntries = entries.filter(Boolean).sort(comparePolicyPriority);
    if (!nextEntries.length) return;
    for (const entry of nextEntries) {
      queue.push(entry);
      emitVerificationEvent(world, "platform.verification.queue.enqueued", serverRunnerId, { ...entry });
      void resolvedState().appContext?.verificationPersistence?.recordQueueRow?.({ ...entry });
    }
    queue.sort(comparePolicyPriority);
    void drain();
  };

  const enqueueStartupGates = () => {
    const state = resolvedState();
    if (!state.policy.enabled) return;
    const gateMap = gatesById();
    const entries = state.gatePolicies
      .filter(row => row.enabled && row.startup)
      .map(row => createQueueEntry(gateMap.get(row.gateId) ?? { id: row.gateId, title: row.gateId }, row, {
        runtimeProfile: state.policy.runtimeProfile,
        triggerKind: "startup",
        trigger: "server-startup"
      }));
    enqueueEntries(entries);
  };

  const enqueueSourceEntries = (sourcePaths = [], meta = {}) => {
    const state = resolvedState();
    if (!state.policy.enabled) return;
    const gateMap = gatesById();
    const selected = selectContinuousTestGates(
      [...gateMap.values()],
      sourcePaths,
      { maxGateCount: state.policy.compatibility?.maxAutoRunsPerCycle ?? 6 }
    );
    const entries = selected
      .map(gate => ({ gate, gatePolicy: state.gatePolicyById[gate.id] ?? null }))
      .filter(row => row.gatePolicy?.enabled && row.gatePolicy.watch)
      .map(({ gate, gatePolicy }) => createQueueEntry(gate, gatePolicy, {
        runtimeProfile: state.policy.runtimeProfile,
        triggerKind: "watch",
        trigger: meta.trigger ?? "workspace-watch",
        sourcePaths
      }));
    enqueueEntries(entries);
  };

  const enqueueChangeSetEntries = async queued => {
    const state = resolvedState();
    if (!state.policy.enabled) return;
    const appContext = state.appContext;
    if (!appContext || String(queued?.status || "") !== "valid" || !queued?.changeSetId) return;
    const model = await buildPlatformModelImpl({
      appContext,
      diagnostics: diagnosticsFromPlatformAppContext(appContext),
      project: appContext.project ?? project
    });
    const selectedGateIds = [...(model.selectedTestGatesByChangeSet?.[queued.changeSetId] ?? [])];
    const gateMap = new Map(
      (((model?.testGates ?? []).length ? model.testGates : [...gatesById().values()]) ?? [])
        .map(gate => [String(gate?.id || ""), gate])
    );
    for (const [gateId, gate] of gateMap) gateRegistry.set(gateId, gate);
    const entries = selectedGateIds
      .map(gateId => {
        const gate = gateMap.get(gateId) ?? null;
        const gatePolicy = gate
          ? (state.gatePolicyById[gateId] ?? resolveVerificationGatePolicy(state.policy, gate))
          : null;
        if (!gate || !gatePolicy?.enabled || !gatePolicy.onChangeSet) return null;
        return createQueueEntry(gate, gatePolicy, {
          runtimeProfile: state.policy.runtimeProfile,
          triggerKind: "changeSet",
          trigger: "platform.changeSet.validate",
          branchId: queued.branchId ?? null,
          changeSetId: queued.changeSetId ?? null,
          candidateSnapshotId: queued.candidateSnapshotId ?? null
        });
      })
      .filter(Boolean);
    enqueueEntries(entries);
  };

  const runEntry = async entry => {
    const state = resolvedState();
    const gate = gatesById().get(entry.gateId) ?? null;
    const gatePolicy = gate
      ? (state.gatePolicyById[gate.id] ?? resolveVerificationGatePolicy(state.policy, gate))
      : null;
    if (!gate || !gatePolicy) {
      emitVerificationEvent(world, "platform.verification.queue.skipped", serverRunnerId, {
        ...entry,
        status: "skipped",
        reason: "test gate not found",
        finishedAt: nowIso()
      });
      return;
    }
    if (!gatePolicy.enabled) {
      emitVerificationEvent(world, "platform.verification.queue.skipped", serverRunnerId, {
        ...entry,
        status: "skipped",
        reason: gatePolicy.diagnostics?.[0]?.message ?? "verification gate disabled by policy",
        diagnostics: gatePolicy.diagnostics ?? [],
        finishedAt: nowIso()
      });
      return;
    }
    activeExecution = {
      id: `verificationExecution:${entry.id}`,
      queueEntryId: entry.id,
      serverRunnerId,
      runtimeProfile: entry.runtimeProfile,
      gateId: entry.gateId,
      gateTitle: entry.gateTitle,
      executionClass: entry.executionClass,
      exclusive: entry.exclusive,
      requiresCleanWorkspace: entry.requiresCleanWorkspace,
      triggerKind: entry.triggerKind,
      branchId: entry.branchId,
      changeSetId: entry.changeSetId,
      candidateSnapshotId: entry.candidateSnapshotId,
      status: "running",
      startedAt: nowIso()
    };
    emitVerificationEvent(world, "platform.verification.queue.started", serverRunnerId, {
      ...entry,
      status: "running",
      startedAt: activeExecution.startedAt
    });
    await state.appContext?.verificationPersistence?.recordQueueRow?.({
      ...entry,
      status: "running",
      startedAt: activeExecution.startedAt
    });
    await state.appContext?.verificationPersistence?.recordExecutionRow?.({ ...activeExecution });
    const result = await runPlatformTestGateImpl(world, {
      actor: serverRunnerId,
      gate,
      branchId: entry.branchId ?? null,
      changeSetId: entry.changeSetId ?? null,
      candidateSnapshotId: isolationCandidateSnapshotId(entry),
      runtimeProfile: state.appContext?.runtimeProfile ?? null,
      runCommand: runPlatformTestCommandImpl,
      timeoutMs: gatePolicy.timeoutMs,
      executionClass: entry.executionClass,
      requiresCleanWorkspace: shouldUseIsolatedWorkspace(entry),
      serverRunnerId,
      verificationPersistence: state.appContext?.verificationPersistence ?? null,
      verification: {
        triggerKind: entry.triggerKind,
        executionClass: entry.executionClass,
        exclusive: entry.exclusive,
        requiresCleanWorkspace: shouldUseIsolatedWorkspace(entry),
        regressionMinDeltaMs: gatePolicy.regressionMinDeltaMs,
        regressionMinDeltaPct: gatePolicy.regressionMinDeltaPct,
        baselineScope: gatePolicy.baselineScope
      }
    });
    const finishedAt = nowIso();
    const executionRow = {
      ...activeExecution,
      status: result.ok ? String(result.latestResult?.status || "finished") : "error",
      runId: result.testRun?.id ?? null,
      resultStatus: result.latestResult?.status ?? null,
      error: result.ok ? null : result.error,
      finishedAt
    };
    completedExecutions.push(executionRow);
    if (completedExecutions.length > 50) completedExecutions.shift();
    emitVerificationEvent(world, "platform.verification.queue.finished", serverRunnerId, {
      ...entry,
      status: executionRow.status,
      runId: result.testRun?.id ?? null,
      resultStatus: result.latestResult?.status ?? null,
      timedOut: result.latestResult?.timedOut === true,
      error: result.ok ? null : result.error,
      finishedAt
    });
    await state.appContext?.verificationPersistence?.recordQueueRow?.({
      ...entry,
      status: executionRow.status,
      runId: result.testRun?.id ?? null,
      resultStatus: result.latestResult?.status ?? null,
      timedOut: result.latestResult?.timedOut === true,
      error: result.ok ? null : result.error,
      finishedAt
    });
    await state.appContext?.verificationPersistence?.recordExecutionRow?.(executionRow);
    activeExecution = null;
  };

  const drain = async () => {
    if (closed || processing) return;
    processing = true;
    try {
      while (!closed && queue.length) {
        const entry = queue.shift();
        if (!entry) continue;
        await runEntry(entry);
      }
    } finally {
      processing = false;
    }
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
        const debounceMs = resolvedState().policy.compatibility?.watchDebounceMs ?? 150;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          const sourcePaths = [...pendingSources];
          pendingSources.clear();
          enqueueSourceEntries(sourcePaths, { trigger: "workspace-watch" });
        }, debounceMs);
        debounceTimer.unref?.();
      });
      watcherEntries.push(watcher);
    } catch {}
  };

  const startWatchers = () => {
    const state = resolvedState();
    const watchFsEnabled = state.policy.compatibility?.watchFs !== false;
    if (!watchFsEnabled) return;
    if (!state.policy.enabled || !state.gatePolicies.some(row => row.enabled && row.watch)) return;
    if (watcherEntries.length) return;
    for (const relativePath of WATCH_DIRS) watchDirectory(path.join(repoRoot, relativePath));
    for (const filePath of WATCH_FILES) watchDirectory(path.dirname(path.join(repoRoot, filePath)));
  };

  return {
    async initialize() {
      if (initialized || closed) return;
      initialized = true;
      emitResolvedPolicies();
      startWatchers();
      enqueueStartupGates();
    },
    scheduleSourceChanges(paths = [], meta = {}) {
      if (!unique(paths).length) return;
      enqueueSourceEntries(unique(paths), meta);
    },
    scheduleChangeSetValidation(queued) {
      const current = {
        branchId: queued?.branchId ? String(queued.branchId) : null,
        changeSetId: queued?.changeSetId ? String(queued.changeSetId) : null,
        candidateSnapshotId: queued?.candidateSnapshotId ? String(queued.candidateSnapshotId) : null,
        status: queued?.status ? String(queued.status) : null,
        queuedAt: nowIso()
      };
      pendingChangeSets.push(current);
      void (async () => {
        try {
          await enqueueChangeSetEntries(current);
        } finally {
          const index = pendingChangeSets.indexOf(current);
          if (index >= 0) pendingChangeSets.splice(index, 1);
        }
      })();
    },
    inspect() {
      const state = resolvedState();
      const status = !state.policy.enabled
        ? "disabled"
        : (processing
            ? "running"
            : (queue.length ? "queued" : "idle"));
      return {
        enabled: state.policy.enabled === true,
        policySource: state.policy.source,
        defaults: { ...state.policy.defaults },
        compatibility: { ...(state.policy.compatibility ?? {}) },
        diagnostics: Array.isArray(state.policy.diagnostics) ? state.policy.diagnostics.map(row => ({ ...row })) : [],
        status,
        processing,
        watchFs: state.policy.compatibility?.watchFs !== false
          && state.gatePolicies.some(row => row.enabled && row.watch),
        watchDebounceMs: state.policy.compatibility?.watchDebounceMs ?? 150,
        pendingSourcePaths: [...pendingSources],
        pendingSourceCount: pendingSources.size,
        pendingChangeSets: pendingChangeSets.map(row => ({ ...row })),
        pendingChangeSetCount: pendingChangeSets.length,
        queue: queue.map(row => ({ ...row })),
        queueCount: queue.length,
        activeExecution: activeExecution ? { ...activeExecution } : null,
        recentExecutions: completedExecutions.map(row => ({ ...row }))
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
