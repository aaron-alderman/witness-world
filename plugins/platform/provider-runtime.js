import path from "node:path";
import fsWatch from "node:fs";
import { moduleProjectors } from "../../src/modules.js";
import { buildPlatformModel } from "./platform-model.js";
import { diagnosticsFromPlatformAppContext } from "./app-context-diagnostics.js";
import { runPlatformTestCommand, runPlatformTestGate } from "./test-runs.js";
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

function nowIso() {
  return new Date().toISOString();
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
  let queueSequence = 0;
  let closed = false;
  let processing = false;
  let debounceTimer = null;
  let initialized = false;
  let activeExecution = null;
  let emittedPolicyIds = new Set();

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
    const { policy, gatePolicies } = resolvedState();
    const defaultsRow = {
      id: `verificationPolicy:${serverRunnerId}:${policy.runtimeProfile || "profile"}:defaults`,
      serverRunnerId,
      runtimeProfile: policy.runtimeProfile ?? null,
      policySource: policy.source,
      policyKind: "defaults",
      enabled: policy.enabled === true,
      ...policy.defaults,
      diagnostics: Array.isArray(policy.diagnostics) ? policy.diagnostics.map(row => ({ ...row })) : [],
      producedAt: nowIso()
    };
    const policyRows = [
      defaultsRow,
      ...gatePolicies.map(row => ({
        ...row,
        policySource: policy.source,
        policyKind: "gate",
        status: row.diagnostics?.length ? "invalid" : "resolved",
        gateTitle: gatesById().get(row.gateId)?.title ?? row.gateId,
        producedAt: nowIso()
      }))
    ];
    for (const row of policyRows) {
      emitVerificationEvent(world, "platform.verification.policy.resolved", serverRunnerId, row);
      emittedPolicyIds.add(row.id);
    }
  };

  const gatesById = () => {
    const appContext = getAppContext?.() ?? null;
    const gates = appContext?.project?.(moduleProjectors.testGates) ?? project(moduleProjectors.testGates) ?? [];
    return new Map(gates.map(gate => [String(gate.id || ""), gate]));
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
    const gateMap = gatesById();
    const entries = selectedGateIds
      .map(gateId => {
        const gate = gateMap.get(gateId) ?? null;
        const gatePolicy = gate ? state.gatePolicyById[gateId] ?? null : null;
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
    const gatePolicy = gate ? (state.gatePolicyById[gate.id] ?? null) : null;
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
      pendingChangeSets.push({
        branchId: queued?.branchId ? String(queued.branchId) : null,
        changeSetId: queued?.changeSetId ? String(queued.changeSetId) : null,
        candidateSnapshotId: queued?.candidateSnapshotId ? String(queued.candidateSnapshotId) : null,
        status: queued?.status ? String(queued.status) : null,
        queuedAt: nowIso()
      });
      const current = pendingChangeSets.shift();
      if (!current) return;
      void enqueueChangeSetEntries(current);
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
        watchFs: state.gatePolicies.some(row => row.enabled && row.watch),
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
