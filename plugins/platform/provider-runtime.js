import path from "node:path";
import fsWatch from "node:fs";
import { moduleProjectors } from "../../src/modules.js";
import { buildPlatformModel } from "./platform-model.js";
import { readDeclaredPlatformVerificationView } from "./materialized-platform-views.js";
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
import {
  buildFlakeScoreByGate,
  resolveEffectivePlatformTestGates,
  selectContinuousTestGates
} from "./test-gate-catalog.js";
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
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
    const latestResultsByGate = appContext?.project?.(moduleProjectors.latestTestResultsByGate)?.byGate
      ?? project(moduleProjectors.latestTestResultsByGate)?.byGate
      ?? Object.create(null);
    const testResults = appContext?.project?.(moduleProjectors.testResults) ?? project(moduleProjectors.testResults) ?? [];
    const gates = resolveEffectivePlatformTestGates({
      projectedTestGates: appContext?.project?.(moduleProjectors.testGates) ?? project(moduleProjectors.testGates) ?? [],
      verificationPolicy: policy,
      appRoot: appContext?.appRoot ?? repoRoot,
      latestResultsByGate,
      flakeScoresByGate: buildFlakeScoreByGate(testResults)
    });
    const gatePolicies = gates
      .map(gate => resolveVerificationGatePolicy(policy, gate))
      .filter(Boolean)
      .sort(comparePolicyPriority);
    return {
      appContext,
      policy,
      gatePolicies,
      gatePolicyById: Object.fromEntries(gatePolicies.map(row => [row.gateId, row])),
      gates
    };
  };

  const emitResolvedPolicies = () => {
    const { policy, gatePolicies, appContext } = resolvedState();
    const gateLookup = gatesById();
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
        gateTitle: gateLookup.get(row.gateId)?.title ?? row.gateId,
        providerId: gateLookup.get(row.gateId)?.providerId ?? null,
        safetyClass: gateLookup.get(row.gateId)?.safetyClass ?? null,
        invoke: gateLookup.get(row.gateId)?.invoke !== false,
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
    const gates = resolvedState().gates;
    for (const gate of gates) {
      const gateId = String(gate?.id || "");
      if (!gateId) continue;
      gateRegistry.set(gateId, gate);
    }
    return new Map(gateRegistry);
  };

  const durableRows = () => resolvedState().appContext?.verificationPersistence?.readModelRows?.() ?? {};

  const mergedVerificationRows = () => {
    const persisted = durableRows();
    return {
      testRuns: mergeRowsById(persisted.testRuns ?? [], project(moduleProjectors.testRuns) ?? []),
      verificationFreshness: mergeRowsById(persisted.verificationFreshness ?? [], project(moduleProjectors.verificationFreshness) ?? []),
      coverageEdges: project(moduleProjectors.coverageEdges) ?? []
    };
  };

  const priorFreshnessForGate = (gateId, runtimeProfile = null) =>
    mergedVerificationRows().verificationFreshness.find(row =>
      String(row?.gateId || "") === String(gateId || "")
      && String(row?.serverRunnerId || "") === String(serverRunnerId || "")
      && String(row?.runtimeProfile || "") === String(runtimeProfile || "")
    ) ?? null;

  const buildFreshnessRowForGate = async (gate, gatePolicy, meta = {}, { running = false } = {}) => {
    const state = resolvedState();
    const producedAt = nowIso();
    const runtimeProfile = state.policy.runtimeProfile ?? state.appContext?.runtimeProfile ?? null;
    const candidateSnapshotId = gatePolicy.executionClass === "candidate_snapshot"
      ? (meta.candidateSnapshotId ?? null)
      : null;
    const environment = resolvePlatformTestEnvironment(gate, {
      candidateSnapshotId,
      executionClass: gatePolicy.executionClass,
      requiresCleanWorkspace: gatePolicy.requiresCleanWorkspace === true
    });
    const snapshot = candidateSnapshotId
      ? (project(moduleProjectors.candidateSnapshotIndex)?.byId?.[candidateSnapshotId] ?? null)
      : null;
    const workspaceMode = environment === "isolated-temp-workspace" || environment === "platform-candidate-snapshot"
      ? "isolated-temp-workspace"
      : "live-workspace";
    const workspaceSource = environment === "platform-candidate-snapshot" ? "candidateSnapshot" : "workspace";
    const environmentInputs = buildPlatformTestEnvironmentInputs({
      command: gate.command,
      cwd: repoRoot,
      timeoutMs: gatePolicy.timeoutMs,
      env: {},
      runner: gate.runner,
      environment,
      executionClass: gatePolicy.executionClass,
      runtimeProfile,
      workspaceMode,
      workspaceSource,
      overlayFileCount: Array.isArray(snapshot?.files) ? snapshot.files.length : 0
    });
    const sourceRevision = await capturePlatformTestSourceRevision(world, {
      gate,
      branchId: meta.branchId ?? null,
      changeSetId: meta.changeSetId ?? null,
      candidateSnapshotId
    });
    const testRunnerVersion = await resolvePlatformTestRunnerVersion(String(gate.runner || "node-test"));
    const runtimeCompositionFingerprint = buildPlatformRuntimeCompositionFingerprint({
      appContext: state.appContext,
      serverRunnerId,
      runtimeProfile
    });
    const verificationPolicyFingerprint = buildPlatformVerificationPolicyFingerprint({
      appContext: state.appContext,
      gate,
      gatePolicy,
      verification: {
        executionClass: gatePolicy.executionClass,
        exclusive: gatePolicy.exclusive === true,
        requiresCleanWorkspace: gatePolicy.requiresCleanWorkspace === true,
        timeoutMs: gatePolicy.timeoutMs,
        regressionMinDeltaMs: gatePolicy.regressionMinDeltaMs,
        regressionMinDeltaPct: gatePolicy.regressionMinDeltaPct,
        baselineScope: gatePolicy.baselineScope
      },
      serverRunnerId,
      runtimeProfile
    });
    const currentCacheIdentity = buildPlatformTestCacheIdentity({
      gate,
      environmentInputs,
      sourceRevision,
      testRunnerVersion,
      serverRunnerId,
      runtimeCompositionFingerprint,
      verificationPolicyFingerprint
    });
    const currentRows = mergedVerificationRows();
    const gateRuns = currentRows.testRuns.filter(row =>
      String(row?.gateId || "") === String(gate.id || "")
      && String(row?.serverRunnerId || "") === String(serverRunnerId || "")
      && String(row?.runtimeProfile || "") === String(runtimeProfile || "")
    );
    const latestRun = latestCompletedRunFor(gateRuns);
    const latestPassedRun = latestPassedRunFor(gateRuns);
    const reasonKinds = [];
    const forcedReasonKinds = unique(meta.forcedReasonKinds);
    let changedPaths = [];
    if (!latestRun) {
      reasonKinds.push("missing_evidence");
      changedPaths = unique(meta.sourcePaths);
    } else {
      if (
        forcedReasonKinds.includes("source_changed")
        || String(latestRun?.cacheIdentity?.sourceHashSetHash || "") !== String(currentCacheIdentity.sourceHashSetHash || "")
      ) {
        reasonKinds.push("source_changed");
        changedPaths = changedPathsForSourceDelta(latestRun?.sourceRevision ?? null, sourceRevision, meta.sourcePaths ?? []);
      }
      if (
        forcedReasonKinds.includes("dependency_graph_changed")
        || String(latestRun?.cacheIdentity?.dependencyGraphVersion || "") !== String(currentCacheIdentity.dependencyGraphVersion || "")
      ) {
        reasonKinds.push("dependency_graph_changed");
      }
      if (
        forcedReasonKinds.includes("runtime_composition_changed")
        || String(latestRun?.cacheIdentity?.runtimeCompositionFingerprint || "") !== String(currentCacheIdentity.runtimeCompositionFingerprint || "")
      ) {
        reasonKinds.push("runtime_composition_changed");
      }
      if (
        forcedReasonKinds.includes("verification_policy_changed")
        || String(latestRun?.cacheIdentity?.verificationPolicyFingerprint || "") !== String(currentCacheIdentity.verificationPolicyFingerprint || "")
      ) {
        reasonKinds.push("verification_policy_changed");
      }
      if (
        forcedReasonKinds.includes("environment_changed")
        || String(latestRun?.cacheIdentity?.environmentIdentityHash || "") !== String(currentCacheIdentity.environmentIdentityHash || "")
      ) {
        reasonKinds.push("environment_changed");
      }
    }
    const priorRow = priorFreshnessForGate(gate.id, runtimeProfile);
    const staleSince = reasonKinds.length
      ? (priorRow?.staleSince ?? latestRun?.finishedAt ?? producedAt)
      : null;
    const targetIds = unique([
      ...(Array.isArray(gate?.protectedObjects) ? gate.protectedObjects.map(String) : []),
      ...coverageTargetIdsByGate(currentRows.coverageEdges, gate.id)
    ]);
    const baseStatus = !latestRun
      ? "missing"
      : (reasonKinds.length ? "stale" : "fresh");
    return {
      id: verificationFreshnessId(serverRunnerId, runtimeProfile, gate.id),
      gateId: String(gate.id || ""),
      serverRunnerId,
      runtimeProfile,
      status: running ? "running" : baseStatus,
      latestRunId: latestRun?.id ?? null,
      latestPassedRunId: latestPassedRun?.id ?? null,
      latestUsableCacheKey: latestRun?.cacheIdentity?.cacheKey ?? null,
      reasonKinds,
      reasonSummary: summarizeFreshnessReasons(reasonKinds, changedPaths),
      changedPaths,
      targetIds,
      blocking: !latestRun || String(latestRun?.status || "") !== "passed",
      staleSince,
      producedAt
    };
  };

  const recomputeFreshnessForGates = async (gates = [], meta = {}, options = {}) => {
    const state = resolvedState();
    const persistence = state.appContext?.verificationPersistence ?? null;
    const rows = [];
    const invalidations = [];
    for (const gate of gates) {
      const gatePolicy = state.gatePolicyById[gate.id] ?? resolveVerificationGatePolicy(state.policy, gate);
      if (!gatePolicy?.enabled) continue;
      const priorRow = priorFreshnessForGate(gate.id, state.policy.runtimeProfile ?? null);
      const nextRow = await buildFreshnessRowForGate(gate, gatePolicy, meta, options);
      rows.push(nextRow);
      emitVerificationEvent(world, "platform.verification.freshness.computed", serverRunnerId, nextRow);
      if ((nextRow.status === "stale" || nextRow.status === "missing") && !sameFreshnessMeaning(priorRow, nextRow)) {
        for (const reasonKind of unique(nextRow.reasonKinds.length ? nextRow.reasonKinds : ["missing_evidence"])) {
          const invalidationRow = {
            id: invalidationId(serverRunnerId, nextRow.runtimeProfile, gate.id, reasonKind),
            gateId: gate.id,
            serverRunnerId,
            runtimeProfile: nextRow.runtimeProfile,
            reasonKind,
            reasonSummary: summarizeFreshnessReasons([reasonKind], nextRow.changedPaths),
            changedPaths: [...nextRow.changedPaths],
            targetIds: [...nextRow.targetIds],
            previousRunId: nextRow.latestRunId ?? null,
            previousCacheKey: nextRow.latestUsableCacheKey ?? null,
            producedAt: nextRow.producedAt
          };
          invalidations.push(invalidationRow);
          emitVerificationEvent(world, "platform.verification.invalidated", serverRunnerId, invalidationRow);
        }
      }
    }
    await persistence?.recordFreshnessRows?.(rows);
    await persistence?.recordInvalidationRows?.(invalidations);
    return { rows, invalidations };
  };

  const recomputeFreshnessForStartup = async () => {
    const state = resolvedState();
    if (!state.policy.enabled) return;
    const gateMap = gatesById();
    await recomputeFreshnessForGates(
      state.gatePolicies
        .filter(row => row.enabled && row.startup)
        .map(row => gateMap.get(row.gateId))
        .filter(Boolean),
      { triggerKind: "startup" }
    );
  };

  const recomputeFreshnessForSourcePaths = async (sourcePaths = [], meta = {}) => {
    const state = resolvedState();
    if (!state.policy.enabled) return;
    const gates = affectedGatesForSourcePaths([...gatesById().values()], sourcePaths);
    const forcedReasonKinds = [
      ...(sourcePaths.includes("app.wtoml") ? ["verification_policy_changed"] : []),
      ...(sourcePaths.includes("package.json") ? ["runtime_composition_changed"] : [])
    ];
    await recomputeFreshnessForGates(gates, {
      ...meta,
      sourcePaths,
      forcedReasonKinds
    });
  };

  const createQueueEntry = (gate, gatePolicy, meta = {}) => ({
    id: `verificationQueue:${serverRunnerId}:${(++queueSequence).toString(36)}`,
    serverRunnerId,
    runtimeProfile: meta.runtimeProfile ?? null,
    gateId: String(gate.id || gatePolicy.gateId || ""),
    gateTitle: String(gate.title || gate.id || gatePolicy.gateId || ""),
    providerId: String(gate.providerId || "verification.command"),
    safetyClass: String(gate.safetyClass || (gatePolicy.executionClass === "in_process" ? "safe" : "unsafe")),
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
    const selected = sourcePaths.includes("app.wtoml") || sourcePaths.includes("package.json")
      ? [...gateMap.values()]
      : selectContinuousTestGates(
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
    const verificationView = await readDeclaredPlatformVerificationView(world, appContext, {
      request: {
        id: `platform.testMonitor:${queued.changeSetId}`,
        actor: "platform.testMonitor",
        path: "/internal/platform/test-monitor",
        view: "verificationQueue"
      },
      buildPlatformVerificationViewImpl: buildArgs => buildPlatformModelImpl({
        appContext: buildArgs.appContext,
        project: buildArgs.project
      })
    });
    const selectedGateIds = [...(verificationView.selectedTestGatesByChangeSet?.[queued.changeSetId] ?? [])];
    const gateMap = new Map(
      (((verificationView?.testGates ?? []).length ? verificationView.testGates : [...gatesById().values()]) ?? [])
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
    await recomputeFreshnessForGates(
      entries
        .map(entry => gateMap.get(entry.gateId) ?? null)
        .filter(Boolean),
      {
        triggerKind: "changeSet",
        trigger: "platform.changeSet.validate",
        branchId: queued.branchId ?? null,
        changeSetId: queued.changeSetId ?? null,
        candidateSnapshotId: queued.candidateSnapshotId ?? null,
        forcedReasonKinds: ["environment_changed"]
      }
    );
    enqueueEntries(entries);
  };

  const enqueueInvokeEntries = (gateIds = [], meta = {}) => {
    const state = resolvedState();
    if (!state.policy.enabled) return [];
    const gateMap = gatesById();
    const entries = unique(gateIds)
      .map(gateId => gateMap.get(gateId) ?? null)
      .filter(Boolean)
      .map(gate => ({ gate, gatePolicy: state.gatePolicyById[gate.id] ?? null }))
      .filter(row => row.gatePolicy?.enabled && row.gate?.invoke !== false)
      .map(({ gate, gatePolicy }) => createQueueEntry(gate, gatePolicy, {
        runtimeProfile: state.policy.runtimeProfile,
        triggerKind: "invoke",
        trigger: meta.trigger ?? "platform.testRun.create",
        branchId: meta.branchId ?? null,
        changeSetId: meta.changeSetId ?? null,
        candidateSnapshotId: meta.candidateSnapshotId ?? null
      }));
    enqueueEntries(entries);
    return entries;
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
      providerId: entry.providerId,
      safetyClass: entry.safetyClass,
      executionClass: entry.executionClass,
      exclusive: entry.exclusive,
      requiresCleanWorkspace: entry.requiresCleanWorkspace,
      triggerKind: entry.triggerKind,
      workspaceMode: shouldUseIsolatedWorkspace(entry) ? "isolated-temp-workspace" : "live-workspace",
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
    await recomputeFreshnessForGates([gate], {
      triggerKind: entry.triggerKind,
      branchId: entry.branchId ?? null,
      changeSetId: entry.changeSetId ?? null,
      candidateSnapshotId: isolationCandidateSnapshotId(entry)
    }, { running: true });
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
      appContext: state.appContext ?? null,
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
      cleanupStatus: result.latestResult?.cleanupStatus ?? null,
      cleanupSummary: result.latestResult?.cleanupSummary ?? null,
      timeoutKind: result.latestResult?.timeoutKind ?? null,
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
      cleanupStatus: result.latestResult?.cleanupStatus ?? null,
      cleanupSummary: result.latestResult?.cleanupSummary ?? null,
      timeoutKind: result.latestResult?.timeoutKind ?? null,
      workspaceMode: executionRow.workspaceMode ?? null,
      timedOut: result.latestResult?.timedOut === true,
      error: result.ok ? null : result.error,
      finishedAt
    });
    await state.appContext?.verificationPersistence?.recordQueueRow?.({
      ...entry,
      status: executionRow.status,
      runId: result.testRun?.id ?? null,
      resultStatus: result.latestResult?.status ?? null,
      cleanupStatus: result.latestResult?.cleanupStatus ?? null,
      cleanupSummary: result.latestResult?.cleanupSummary ?? null,
      timeoutKind: result.latestResult?.timeoutKind ?? null,
      workspaceMode: executionRow.workspaceMode ?? null,
      timedOut: result.latestResult?.timedOut === true,
      error: result.ok ? null : result.error,
      finishedAt
    });
    await state.appContext?.verificationPersistence?.recordExecutionRow?.(executionRow);
    activeExecution = null;
    await recomputeFreshnessForGates([gate], {
      triggerKind: entry.triggerKind,
      branchId: entry.branchId ?? null,
      changeSetId: entry.changeSetId ?? null,
      candidateSnapshotId: isolationCandidateSnapshotId(entry),
      sourcePaths: entry.sourcePaths ?? []
    });
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
          void (async () => {
            await recomputeFreshnessForSourcePaths(sourcePaths, { trigger: "workspace-watch" });
            enqueueSourceEntries(sourcePaths, { trigger: "workspace-watch" });
          })();
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
      await recomputeFreshnessForStartup();
      startWatchers();
      const startupSettleMs = Number(resolvedState().policy.defaults?.startupSettleMs || 0);
      if (startupSettleMs > 0) {
        await delay(startupSettleMs);
        if (closed) return;
      }
      enqueueStartupGates();
    },
    scheduleSourceChanges(paths = [], meta = {}) {
      const normalizedPaths = unique(paths);
      if (!normalizedPaths.length) return;
      for (const sourcePath of normalizedPaths) pendingSources.add(sourcePath);
      void (async () => {
        try {
          await recomputeFreshnessForSourcePaths(normalizedPaths, meta);
          enqueueSourceEntries(normalizedPaths, meta);
        } finally {
          for (const sourcePath of normalizedPaths) pendingSources.delete(sourcePath);
        }
      })();
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
    scheduleRuntimeRevisionChange(meta = {}) {
      void (async () => {
        const state = resolvedState();
        if (!state.policy.enabled) return;
        await recomputeFreshnessForGates(
          state.gatePolicies
            .filter(row => row.enabled)
            .map(row => gatesById().get(row.gateId))
            .filter(Boolean),
          {
            ...meta,
            triggerKind: meta.triggerKind ?? "runtimeRevision",
            trigger: meta.trigger ?? "runtime-revision",
            forcedReasonKinds: ["runtime_composition_changed"]
          }
        );
      })();
    },
    scheduleInvoke(request = {}) {
      const gateIds = Array.isArray(request?.gateIds) ? request.gateIds : (request?.gateId ? [request.gateId] : []);
      const entries = enqueueInvokeEntries(gateIds, request);
      return {
        ok: entries.length > 0,
        status: entries.length > 0 ? 202 : 409,
        queueEntries: entries,
        gateIds: unique(gateIds)
      };
    },
    inspect() {
      const state = resolvedState();
      const freshnessRows = mergedVerificationRows().verificationFreshness.filter(row =>
        String(row?.serverRunnerId || "") === String(serverRunnerId || "")
        && String(row?.runtimeProfile || "") === String(state.policy.runtimeProfile || "")
      );
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
        freshness: freshnessRows.map(row => ({ ...row })),
        freshnessCounts: freshnessRows.reduce((counts, row) => {
          const key = String(row?.status || "missing");
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, Object.create(null)),
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
