import { moduleProjectors } from "../../src/modules.js";
import { platformChangeSetInsights } from "./branch-insights.js";
import {
  buildFlakeScoreByGate,
  buildProjectedCoverageEdges,
  buildProjectedTestGateIndex,
  discoverProjectedTestGates
} from "./test-gate-catalog.js";

function latestBodiesByProcess(witnesses, process) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== process || !witness.body?.id) continue;
    rows.set(String(witness.body.id), witness.body);
  }
  return rows;
}

function pushByKey(target, key, value) {
  if (!target[key]) target[key] = [];
  target[key].push(value);
}

function sortRows(rows, keys) {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const next = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
      if (next) return next;
    }
    return 0;
  });
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value || "")).filter(Boolean))];
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function activityMoment(row) {
  return String(row?.finishedAt || row?.startedAt || row?.producedAt || "");
}

function compareActivityRows(left, right) {
  return activityMoment(left).localeCompare(activityMoment(right))
    || String(left?.id || "").localeCompare(String(right?.id || ""));
}

function primaryStructuredFormat(artifacts = [], suites = []) {
  const structuredFormats = new Set([
    ...artifacts.map(artifact => String(artifact?.structuredFormat || "")),
    ...suites.map(suite => String(suite?.format || ""))
  ]);
  if (structuredFormats.has("junit")) return "junit";
  if (structuredFormats.has("tap")) return "tap";
  return null;
}

function formatCountSummary({ suiteCount = 0, caseCount = 0, failedCount = 0, errorCount = 0, skippedCount = 0 } = {}) {
  const parts = [
    `${suiteCount} suite${suiteCount === 1 ? "" : "s"}`,
    `${caseCount} case${caseCount === 1 ? "" : "s"}`
  ];
  if (failedCount > 0) parts.push(`${failedCount} failed`);
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
  return parts.join(", ");
}

function inferRegressionStatus(currentDurationMs, baselineDurationMs, {
  minDeltaMs = 500,
  minDeltaPct = 25
} = {}) {
  if (!Number.isFinite(currentDurationMs) || !Number.isFinite(baselineDurationMs) || baselineDurationMs <= 0) {
    return {
      status: "unknown",
      deltaMs: null,
      deltaPercent: null
    };
  }
  const deltaMs = currentDurationMs - baselineDurationMs;
  const deltaPercent = baselineDurationMs === 0 ? null : (deltaMs / baselineDurationMs) * 100;
  const meaningful = Math.abs(deltaMs) >= Number(minDeltaMs || 0) && Math.abs(deltaPercent ?? 0) >= Number(minDeltaPct || 0);
  if (meaningful && deltaMs > 0) {
    return { status: "regressed", deltaMs, deltaPercent };
  }
  if (meaningful && deltaMs < 0) {
    return { status: "improved", deltaMs, deltaPercent };
  }
  return { status: "steady", deltaMs, deltaPercent };
}

function regressionSummaryByRun(runs = []) {
  const summaries = Object.create(null);
  const byGateAndEnvironment = Object.create(null);
  for (const run of [...runs].sort(compareActivityRows)) {
    const gateId = String(run?.gateId || "");
    if (!gateId) continue;
    const environmentIdentityHash = String(run?.cacheIdentity?.environmentIdentityHash || "");
    const runtimeProfile = String(run?.runtimeProfile || "");
    const key = `${gateId}\u0000${environmentIdentityHash}\u0000${runtimeProfile}`;
    pushByKey(byGateAndEnvironment, key, run);
  }
  for (const group of Object.values(byGateAndEnvironment)) {
    let latestPassedBaseline = null;
    for (const run of group) {
      const baselineDurationMs = numberOrNull(latestPassedBaseline?.durationMs);
      const currentDurationMs = numberOrNull(run?.durationMs);
      const heuristic = inferRegressionStatus(currentDurationMs, baselineDurationMs, {
        minDeltaMs: Number(run?.verification?.regressionMinDeltaMs || 500),
        minDeltaPct: Number(run?.verification?.regressionMinDeltaPct || 25)
      });
      summaries[run.id] = {
        id: `regressionSummary:${run.id}`,
        runId: String(run.id),
        gateId: String(run.gateId || ""),
        status: heuristic.status,
        baselineRunId: latestPassedBaseline ? String(latestPassedBaseline.id) : null,
        baselineDurationMs,
        currentDurationMs,
        deltaMs: heuristic.deltaMs,
        deltaPercent: heuristic.deltaPercent,
        regressionMinDeltaMs: Number(run?.verification?.regressionMinDeltaMs || 500),
        regressionMinDeltaPct: Number(run?.verification?.regressionMinDeltaPct || 25),
        baselineScope: String(run?.verification?.baselineScope || "gate+environment+runtimeProfile")
      };
      if (run.status === "passed" && run.cacheStatus !== "hit") latestPassedBaseline = run;
    }
  }
  return summaries;
}

function changeSetEditRows(witnesses) {
  const latest = new Map();
  for (const witness of witnesses) {
    if (witness.process === "platform.changeSet.edit.upsert" && witness.body?.id) {
      const body = witness.body;
      latest.set(String(body.id), {
        id: String(body.id),
        changeSetId: String(body.changeSetId),
        path: String(body.path),
        pathHash: String(body.pathHash),
        previousHash: body.previousHash ?? null,
        nextContentHash: String(body.nextContentHash),
        nextContent: String(body.nextContent ?? ""),
        sourceLanguage: String(body.sourceLanguage || "text"),
        actor: body.actor ? String(body.actor) : null,
        session: body.session ? String(body.session) : null,
        updatedAt: body.updatedAt ?? null
      });
      continue;
    }
    if (witness.process === "platform.changeSet.edit.remove" && witness.body?.id) {
      latest.delete(String(witness.body.id));
    }
  }
  return sortRows([...latest.values()], ["changeSetId", "path"]);
}

function candidateSnapshotRows(witnesses) {
  const rows = [];
  for (const witness of witnesses) {
    if (witness.process !== "platform.changeSet.validate" || !witness.body?.candidateSnapshot?.id) continue;
    const snapshot = witness.body.candidateSnapshot;
    rows.push({
      id: String(snapshot.id),
      changeSetId: String(snapshot.changeSetId),
      branchId: String(snapshot.branchId),
      status: String(snapshot.status || "invalid"),
      revision: Number(snapshot.revision || 0),
      createdAt: snapshot.createdAt ?? null,
      files: Array.isArray(snapshot.files) ? snapshot.files.map(file => ({ ...file })) : [],
      errors: Array.isArray(snapshot.errors) ? snapshot.errors.map(error => ({ ...error })) : [],
      previousActiveCandidateSnapshotId: snapshot.previousActiveCandidateSnapshotId ?? null,
      activeCandidateSnapshotId: witness.body.activeCandidateSnapshotId ?? null
    });
  }
  return sortRows(rows, ["branchId", "changeSetId", "id"]);
}

function conflictRows(witnesses) {
  const latestByChangeSet = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "platform.changeSet.validate" || !witness.body?.id) continue;
    latestByChangeSet.set(String(witness.body.id), witness.body);
  }
  const rows = [];
  for (const body of latestByChangeSet.values()) {
    const errors = Array.isArray(body.candidateSnapshot?.errors) ? body.candidateSnapshot.errors : [];
    for (const error of errors) {
      if (String(error?.kind || "") !== "conflict" || !error?.id) continue;
      rows.push({
        id: String(error.id),
        changeSetId: String(error.changeSetId || body.id),
        branchId: String(error.branchId || body.branchId),
        candidateSnapshotId: String(body.candidateSnapshot?.id || ""),
        path: String(error.path || ""),
        pathHash: String(error.pathHash || ""),
        sourceLanguage: String(error.sourceLanguage || "text"),
        previousHash: error.previousHash ?? null,
        currentHash: error.currentHash ?? null,
        message: String(error.message || "change-set conflict"),
        status: "open",
        detectedAt: body.validatedAt ?? body.candidateSnapshot?.createdAt ?? null
      });
    }
  }
  return sortRows(rows, ["branchId", "changeSetId", "path"]);
}

function mergeIntentRows(witnesses) {
  const proposals = moduleProjectors.proposals(witnesses);
  const rows = [];
  for (const proposal of proposals) {
    const targetProcess = String(proposal?.targetProcess || "");
    if (targetProcess !== "branch.merge" && targetProcess !== "branch.rebase") continue;
    const body = proposal.body && typeof proposal.body === "object" ? proposal.body : {};
    const branchId = String(body.branchId || proposal.targetId || "");
    if (!branchId) continue;
    const mode = targetProcess === "branch.merge" ? "merge" : "rebase";
    rows.push({
      id: `mergeIntent:${proposal.id}`,
      proposalId: String(proposal.id),
      branchId,
      mode,
      intoBranchId: body.intoBranchId ? String(body.intoBranchId) : null,
      ontoBranchId: body.ontoBranchId ? String(body.ontoBranchId) : null,
      status: String(proposal.status || "open"),
      proposer: proposal.proposer ? String(proposal.proposer) : null,
      reviewer: proposal.reviewer ? String(proposal.reviewer) : null,
      reason: proposal.reason ? String(proposal.reason) : null
    });
  }
  return sortRows(rows, ["branchId", "mode", "proposalId"]);
}

function testRunRows(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process === "platform.test.run.start" && witness.body?.id) {
      const body = witness.body;
      rows.set(String(body.id), {
        id: String(body.id),
        gateId: String(body.gateId || ""),
        title: String(body.title || body.gateId || body.id),
        command: String(body.command || ""),
        runner: String(body.runner || "node-test"),
        environment: String(body.environment || "local-node"),
        timeoutMs: Number(body.timeoutMs || 0),
        branchId: body.branchId ? String(body.branchId) : null,
        changeSetId: body.changeSetId ? String(body.changeSetId) : null,
        candidateSnapshotId: body.candidateSnapshotId ? String(body.candidateSnapshotId) : null,
        sourceDependencies: Array.isArray(body.sourceDependencies) ? body.sourceDependencies.map(String) : [],
        protectedObjects: Array.isArray(body.protectedObjects) ? body.protectedObjects.map(String) : [],
        environmentInputs: body.environmentInputs && typeof body.environmentInputs === "object"
          ? {
              ...body.environmentInputs,
              shellArgs: Array.isArray(body.environmentInputs.shellArgs) ? body.environmentInputs.shellArgs.map(String) : [],
              envOverrideKeys: Array.isArray(body.environmentInputs.envOverrideKeys) ? body.environmentInputs.envOverrideKeys.map(String) : []
            }
          : null,
        sourceRevision: body.sourceRevision && typeof body.sourceRevision === "object"
          ? {
              ...body.sourceRevision,
              dependencyHashes: Array.isArray(body.sourceRevision.dependencyHashes)
                ? body.sourceRevision.dependencyHashes.map(row => ({ ...row }))
                : []
            }
          : null,
        cacheIdentity: body.cacheIdentity && typeof body.cacheIdentity === "object"
          ? { ...body.cacheIdentity }
          : null,
        cacheStatus: body.cacheStatus ? String(body.cacheStatus) : "miss",
        cacheHit: body.cacheHit && typeof body.cacheHit === "object"
          ? { ...body.cacheHit }
          : null,
        serverRunnerId: body.serverRunnerId ? String(body.serverRunnerId) : null,
        verification: body.verification && typeof body.verification === "object"
          ? { ...body.verification }
          : null,
        actor: body.actor ? String(body.actor) : null,
        session: body.session ? String(body.session) : null,
        runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : null,
        status: "running",
        startedAt: body.startedAt ?? null,
        finishedAt: null,
        durationMs: null,
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        error: null
      });
      continue;
    }
    if (witness.process === "platform.test.run.finish" && witness.body?.id) {
      const body = witness.body;
      const id = String(body.id);
      const previous = rows.get(id) ?? {
        id,
        gateId: String(body.gateId || ""),
        title: String(body.title || body.gateId || body.id),
        command: String(body.command || ""),
        runner: String(body.runner || "node-test"),
        environment: String(body.environment || "local-node"),
        timeoutMs: Number(body.timeoutMs || 0),
        branchId: body.branchId ? String(body.branchId) : null,
        changeSetId: body.changeSetId ? String(body.changeSetId) : null,
        candidateSnapshotId: body.candidateSnapshotId ? String(body.candidateSnapshotId) : null,
        sourceDependencies: Array.isArray(body.sourceDependencies) ? body.sourceDependencies.map(String) : [],
        protectedObjects: Array.isArray(body.protectedObjects) ? body.protectedObjects.map(String) : [],
        environmentInputs: body.environmentInputs && typeof body.environmentInputs === "object"
          ? {
              ...body.environmentInputs,
              shellArgs: Array.isArray(body.environmentInputs.shellArgs) ? body.environmentInputs.shellArgs.map(String) : [],
              envOverrideKeys: Array.isArray(body.environmentInputs.envOverrideKeys) ? body.environmentInputs.envOverrideKeys.map(String) : []
            }
          : null,
        sourceRevision: body.sourceRevision && typeof body.sourceRevision === "object"
          ? {
              ...body.sourceRevision,
              dependencyHashes: Array.isArray(body.sourceRevision.dependencyHashes)
                ? body.sourceRevision.dependencyHashes.map(row => ({ ...row }))
                : []
            }
          : null,
        cacheIdentity: body.cacheIdentity && typeof body.cacheIdentity === "object"
          ? { ...body.cacheIdentity }
          : null,
        cacheStatus: body.cacheStatus ? String(body.cacheStatus) : "miss",
        cacheHit: body.cacheHit && typeof body.cacheHit === "object"
          ? { ...body.cacheHit }
          : null,
        serverRunnerId: body.serverRunnerId ? String(body.serverRunnerId) : null,
        verification: body.verification && typeof body.verification === "object"
          ? { ...body.verification }
          : null,
        actor: body.actor ? String(body.actor) : null,
        session: body.session ? String(body.session) : null,
        runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : null,
        startedAt: body.startedAt ?? null
      };
      rows.set(id, {
        ...previous,
        status: String(body.status || previous.status || "failed"),
        finishedAt: body.finishedAt ?? null,
        durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
        exitCode: typeof body.exitCode === "number" ? body.exitCode : null,
        signal: body.signal ? String(body.signal) : null,
        stdout: String(body.stdout || ""),
        stderr: String(body.stderr || ""),
        timedOut: body.timedOut === true,
        error: body.error ? String(body.error) : null
      });
    }
  }
  return sortRows([...rows.values()], ["gateId", "id"]);
}

function testResultRows(witnesses) {
  const rows = [];
  for (const witness of witnesses) {
    if (witness.process !== "platform.test.run.finish" || !Array.isArray(witness.body?.results)) continue;
    for (const result of witness.body.results) {
      if (!result?.id) continue;
      rows.push({
        id: String(result.id),
        runId: String(result.runId || witness.body.id || ""),
        gateId: String(result.gateId || witness.body.gateId || ""),
        title: String(result.title || witness.body.title || result.gateId || result.id),
        status: String(result.status || witness.body.status || "failed"),
        exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
        signal: result.signal ? String(result.signal) : null,
        stdout: String(result.stdout || ""),
        stderr: String(result.stderr || ""),
        durationMs: typeof result.durationMs === "number" ? result.durationMs : null,
        timedOut: result.timedOut === true,
        branchId: result.branchId ? String(result.branchId) : null,
        changeSetId: result.changeSetId ? String(result.changeSetId) : null,
        candidateSnapshotId: result.candidateSnapshotId ? String(result.candidateSnapshotId) : null,
        sourceDependencies: Array.isArray(result.sourceDependencies) ? result.sourceDependencies.map(String) : [],
        protectedObjects: Array.isArray(result.protectedObjects) ? result.protectedObjects.map(String) : [],
        environmentInputs: result.environmentInputs && typeof result.environmentInputs === "object"
          ? {
              ...result.environmentInputs,
              shellArgs: Array.isArray(result.environmentInputs.shellArgs) ? result.environmentInputs.shellArgs.map(String) : [],
              envOverrideKeys: Array.isArray(result.environmentInputs.envOverrideKeys) ? result.environmentInputs.envOverrideKeys.map(String) : []
            }
          : null,
        sourceRevision: result.sourceRevision && typeof result.sourceRevision === "object"
          ? {
              ...result.sourceRevision,
              dependencyHashes: Array.isArray(result.sourceRevision.dependencyHashes)
                ? result.sourceRevision.dependencyHashes.map(row => ({ ...row }))
                : []
            }
          : null,
        cacheIdentity: result.cacheIdentity && typeof result.cacheIdentity === "object"
          ? { ...result.cacheIdentity }
          : null,
        cacheStatus: result.cacheStatus ? String(result.cacheStatus) : "miss",
        cacheHit: result.cacheHit && typeof result.cacheHit === "object"
          ? { ...result.cacheHit }
          : null,
        serverRunnerId: result.serverRunnerId ? String(result.serverRunnerId) : (witness.body.serverRunnerId ? String(witness.body.serverRunnerId) : null),
        verification: result.verification && typeof result.verification === "object"
          ? { ...result.verification }
          : (witness.body.verification && typeof witness.body.verification === "object" ? { ...witness.body.verification } : null),
        producedAt: result.producedAt ?? witness.body.finishedAt ?? null
      });
    }
  }
  return sortRows(rows, ["gateId", "id"]);
}

function verificationPolicyRows(witnesses) {
  return sortRows(
    [...latestBodiesByProcess(witnesses, "platform.verification.policy.resolved").values()].map(body => ({
      id: String(body.id || ""),
      serverRunnerId: body.serverRunnerId ? String(body.serverRunnerId) : null,
      runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : null,
      policySource: body.policySource ? String(body.policySource) : null,
      policyKind: body.policyKind ? String(body.policyKind) : "gate",
      gateId: body.gateId ? String(body.gateId) : null,
      gateTitle: body.gateTitle ? String(body.gateTitle) : null,
      enabled: body.enabled === true,
      startup: body.startup === true,
      watch: body.watch === true,
      onChangeSet: body.onChangeSet === true,
      priority: Number(body.priority || 0),
      maxConcurrency: Number(body.maxConcurrency || 0),
      cpuBudget: Number(body.cpuBudget || 0),
      regressionMinDeltaMs: Number(body.regressionMinDeltaMs || 0),
      regressionMinDeltaPct: Number(body.regressionMinDeltaPct || 0),
      baselineScope: body.baselineScope ? String(body.baselineScope) : null,
      executionClass: body.executionClass ? String(body.executionClass) : null,
      exclusive: body.exclusive === true,
      requiresCleanWorkspace: body.requiresCleanWorkspace === true,
      timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : null,
      status: body.status ? String(body.status) : "resolved",
      diagnostics: Array.isArray(body.diagnostics) ? body.diagnostics.map(row => ({ ...row })) : [],
      producedAt: body.producedAt ?? null
    })),
    ["serverRunnerId", "runtimeProfile", "policyKind", "gateId", "id"]
  );
}

function verificationQueueRows(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (![
      "platform.verification.queue.enqueued",
      "platform.verification.queue.started",
      "platform.verification.queue.skipped",
      "platform.verification.queue.finished"
    ].includes(String(witness.process || "")) || !witness.body?.id) continue;
    const body = witness.body;
    const previous = rows.get(String(body.id)) ?? {};
    rows.set(String(body.id), {
      ...previous,
      id: String(body.id),
      serverRunnerId: body.serverRunnerId ? String(body.serverRunnerId) : previous.serverRunnerId ?? null,
      runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : previous.runtimeProfile ?? null,
      gateId: body.gateId ? String(body.gateId) : previous.gateId ?? null,
      gateTitle: body.gateTitle ? String(body.gateTitle) : previous.gateTitle ?? null,
      executionClass: body.executionClass ? String(body.executionClass) : previous.executionClass ?? null,
      exclusive: body.exclusive === true || previous.exclusive === true,
      requiresCleanWorkspace: body.requiresCleanWorkspace === true || previous.requiresCleanWorkspace === true,
      priority: Number(body.priority ?? previous.priority ?? 0),
      triggerKind: body.triggerKind ? String(body.triggerKind) : previous.triggerKind ?? null,
      trigger: body.trigger ? String(body.trigger) : previous.trigger ?? null,
      branchId: body.branchId ? String(body.branchId) : previous.branchId ?? null,
      changeSetId: body.changeSetId ? String(body.changeSetId) : previous.changeSetId ?? null,
      candidateSnapshotId: body.candidateSnapshotId ? String(body.candidateSnapshotId) : previous.candidateSnapshotId ?? null,
      sourcePaths: Array.isArray(body.sourcePaths) ? body.sourcePaths.map(String) : (previous.sourcePaths ?? []),
      status: body.status ? String(body.status) : previous.status ?? "queued",
      reason: body.reason ? String(body.reason) : previous.reason ?? null,
      runId: body.runId ? String(body.runId) : previous.runId ?? null,
      resultStatus: body.resultStatus ? String(body.resultStatus) : previous.resultStatus ?? null,
      error: body.error ? String(body.error) : previous.error ?? null,
      queuedAt: body.queuedAt ?? previous.queuedAt ?? null,
      startedAt: body.startedAt ?? previous.startedAt ?? null,
      finishedAt: body.finishedAt ?? previous.finishedAt ?? null
    });
  }
  return sortRows([...rows.values()], ["status", "priority", "gateId", "id"]);
}

function verificationExecutionRows(witnesses) {
  const rows = [];
  for (const queueRow of verificationQueueRows(witnesses)) {
    if (!queueRow.startedAt && queueRow.status !== "running") continue;
    rows.push({
      id: `verificationExecution:${queueRow.id}`,
      queueEntryId: queueRow.id,
      serverRunnerId: queueRow.serverRunnerId,
      runtimeProfile: queueRow.runtimeProfile,
      gateId: queueRow.gateId,
      gateTitle: queueRow.gateTitle,
      executionClass: queueRow.executionClass,
      exclusive: queueRow.exclusive === true,
      requiresCleanWorkspace: queueRow.requiresCleanWorkspace === true,
      triggerKind: queueRow.triggerKind,
      branchId: queueRow.branchId,
      changeSetId: queueRow.changeSetId,
      candidateSnapshotId: queueRow.candidateSnapshotId,
      runId: queueRow.runId ?? null,
      resultStatus: queueRow.resultStatus ?? null,
      status: queueRow.status,
      startedAt: queueRow.startedAt ?? null,
      finishedAt: queueRow.finishedAt ?? null,
      error: queueRow.error ?? null
    });
  }
  return sortRows(rows, ["gateId", "id"]);
}

function testArtifactRows(witnesses) {
  const rows = [];
  for (const witness of witnesses) {
    if (witness.process !== "platform.test.run.finish" || !witness.body?.id) continue;
    const runId = String(witness.body.id);
    const gateId = String(witness.body.gateId || "");
    const title = String(witness.body.title || gateId || runId);
    const resultId = `testResult:${runId}:1`;
    const artifacts = [
      {
        id: `testArtifact:${runId}:stdout`,
        name: "stdout.txt",
        kind: "stdout",
        content: String(witness.body.stdout || "")
      },
      {
        id: `testArtifact:${runId}:stderr`,
        name: "stderr.txt",
        kind: "stderr",
        content: String(witness.body.stderr || "")
      }
    ].filter(row => row.content.length > 0);
    for (const artifact of artifacts) {
      rows.push({
        id: artifact.id,
        runId,
        resultId,
        gateId,
        title: `${title} ${artifact.kind}`,
        artifactKind: artifact.kind,
        fileName: artifact.name,
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(artifact.content, "utf8"),
        content: artifact.content,
        branchId: witness.body.branchId ? String(witness.body.branchId) : null,
        changeSetId: witness.body.changeSetId ? String(witness.body.changeSetId) : null,
        candidateSnapshotId: witness.body.candidateSnapshotId ? String(witness.body.candidateSnapshotId) : null,
        producedAt: witness.body.finishedAt ?? null
      });
    }
    for (const artifact of artifacts) {
      rows.push(...structuredArtifactsForStream({
        runId,
        resultId,
        gateId,
        title,
        streamKind: artifact.kind,
        content: artifact.content,
        branchId: witness.body.branchId ? String(witness.body.branchId) : null,
        changeSetId: witness.body.changeSetId ? String(witness.body.changeSetId) : null,
        candidateSnapshotId: witness.body.candidateSnapshotId ? String(witness.body.candidateSnapshotId) : null,
        producedAt: witness.body.finishedAt ?? null
      }));
    }
  }
  return sortRows(rows, ["runId", "artifactKind", "id"]);
}

function parseTapSummary(content) {
  const text = String(content || "");
  if (!/^\s*TAP version \d+/m.test(text)) return null;
  const planMatch = text.match(/^\s*1\.\.(\d+)\s*$/m);
  const passed = (text.match(/^\s*ok\b/gm) ?? []).length;
  const failed = (text.match(/^\s*not ok\b/gm) ?? []).length;
  const skipped = (text.match(/#\s*SKIP\b/gi) ?? []).length;
  const todo = (text.match(/#\s*TODO\b/gi) ?? []).length;
  return {
    format: "tap",
    total: planMatch ? Number(planMatch[1]) : (passed + failed),
    passed,
    failed,
    skipped,
    todo
  };
}

function parseTapCases(content) {
  const text = String(content || "");
  if (!/^\s*TAP version \d+/m.test(text)) return [];
  const rows = [];
  const pattern = /^\s*(not ok|ok)\b(?:\s+(\d+))?(?:\s*-\s*([^\r\n#]*?))?(?:\s*#\s*(SKIP|TODO)\b(.*))?\s*$/gmi;
  let match;
  let ordinal = 0;
  while ((match = pattern.exec(text)) !== null) {
    ordinal += 1;
    const directive = String(match[4] || "").toUpperCase();
    const rawStatus = String(match[1] || "").toLowerCase();
    rows.push({
      ordinal,
      testNumber: match[2] ? Number(match[2]) : ordinal,
      name: String(match[3] || `test ${match[2] || ordinal}`).trim() || `test ${match[2] || ordinal}`,
      status: directive === "SKIP"
        ? "skipped"
        : directive === "TODO"
          ? "todo"
          : rawStatus === "ok"
            ? "passed"
            : "failed",
      directive: directive || null,
      directiveDetail: match[5] ? String(match[5]).trim() || null : null
    });
  }
  return rows;
}

function parseJUnitSummary(content) {
  const text = String(content || "");
  if (!/<testsuite\b/i.test(text) && !/<testsuites\b/i.test(text)) return null;
  const suites = [...text.matchAll(/<testsuite\b([^>]*)>/gi)];
  const attrs = ["tests", "failures", "errors", "skipped"];
  const totals = Object.fromEntries(attrs.map(attr => [attr, 0]));
  const parseAttr = (source, attr) => {
    const match = String(source || "").match(new RegExp(`\\b${attr}="(\\d+)"`, "i"));
    return match ? Number(match[1]) : 0;
  };
  if (suites.length) {
    for (const suite of suites) {
      for (const attr of attrs) totals[attr] += parseAttr(suite[1], attr);
    }
  } else {
    const rootMatch = text.match(/<testsuites\b([^>]*)>/i);
    for (const attr of attrs) totals[attr] += parseAttr(rootMatch?.[1] || "", attr);
  }
  return {
    format: "junit",
    total: totals.tests,
    passed: Math.max(0, totals.tests - totals.failures - totals.errors - totals.skipped),
    failed: totals.failures,
    errors: totals.errors,
    skipped: totals.skipped
  };
}

function parseXmlAttr(source, attr) {
  const match = String(source || "").match(new RegExp(`\\b${attr}="([^"]*)"`, "i"));
  return match ? match[1] : null;
}

function parseJUnitSuitesAndCases(content) {
  const text = String(content || "");
  if (!/<testsuite\b/i.test(text) && !/<testsuites\b/i.test(text)) return { suites: [], cases: [] };
  const suites = [];
  const cases = [];
  const suitePattern = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>|<testsuite\b([^>]*)\/>/gi;
  let suiteMatch;
  let suiteOrdinal = 0;
  while ((suiteMatch = suitePattern.exec(text)) !== null) {
    suiteOrdinal += 1;
    const attrs = suiteMatch[1] || suiteMatch[3] || "";
    const body = suiteMatch[2] || "";
    const suiteId = `suite-${suiteOrdinal}`;
    suites.push({
      suiteId,
      ordinal: suiteOrdinal,
      name: parseXmlAttr(attrs, "name") || `suite ${suiteOrdinal}`,
      tests: Number(parseXmlAttr(attrs, "tests") || 0),
      failures: Number(parseXmlAttr(attrs, "failures") || 0),
      errors: Number(parseXmlAttr(attrs, "errors") || 0),
      skipped: Number(parseXmlAttr(attrs, "skipped") || 0),
      timeSeconds: (() => {
        const value = parseXmlAttr(attrs, "time");
        return value == null ? null : Number(value);
      })(),
      body
    });
    const casePattern = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*)\/>/gi;
    let caseMatch;
    let caseOrdinal = 0;
    while ((caseMatch = casePattern.exec(body)) !== null) {
      caseOrdinal += 1;
      const caseAttrs = caseMatch[1] || caseMatch[3] || "";
      const caseBody = caseMatch[2] || "";
      const hasFailure = /<failure\b/i.test(caseBody);
      const hasError = /<error\b/i.test(caseBody);
      const hasSkipped = /<skipped\b/i.test(caseBody);
      cases.push({
        suiteId,
        ordinal: caseOrdinal,
        classname: parseXmlAttr(caseAttrs, "classname"),
        name: parseXmlAttr(caseAttrs, "name") || `case ${caseOrdinal}`,
        timeSeconds: (() => {
          const value = parseXmlAttr(caseAttrs, "time");
          return value == null ? null : Number(value);
        })(),
        status: hasError
          ? "error"
          : hasFailure
            ? "failed"
            : hasSkipped
              ? "skipped"
              : "passed"
      });
    }
  }
  return {
    suites: suites.map(({ body, ...suite }) => suite),
    cases
  };
}

function structuredArtifactsForStream({
  runId,
  resultId,
  gateId,
  title,
  streamKind,
  content,
  branchId = null,
  changeSetId = null,
  candidateSnapshotId = null,
  producedAt = null
}) {
  const rows = [];
  const pushStructured = (kind, fileName, contentType, summary) => {
    if (!summary) return;
    rows.push({
      id: `testArtifact:${runId}:${kind}:${streamKind}`,
      runId,
      resultId,
      gateId,
      title: `${title} ${kind}`,
      artifactKind: kind,
      fileName,
      contentType,
      sizeBytes: Buffer.byteLength(content, "utf8"),
      content,
      structuredFormat: kind,
      summary,
      branchId,
      changeSetId,
      candidateSnapshotId,
      producedAt
    });
  };
  pushStructured("tap", `${streamKind}.tap`, "application/tap", parseTapSummary(content));
  pushStructured("junit", `${streamKind}.junit.xml`, "application/xml", parseJUnitSummary(content));
  return rows;
}

function testSuiteRows(witnesses) {
  const artifacts = platformModuleProjectors.testArtifacts(witnesses);
  const rows = [];
  for (const artifact of artifacts) {
    if (artifact.structuredFormat === "tap" && artifact.summary) {
      rows.push({
        id: `testSuite:${artifact.id}`,
        runId: artifact.runId,
        resultId: artifact.resultId,
        gateId: artifact.gateId,
        artifactId: artifact.id,
        format: "tap",
        name: artifact.title || artifact.fileName || artifact.id,
        status: Number(artifact.summary.failed || 0) > 0 ? "failed" : "passed",
        total: Number(artifact.summary.total || 0),
        passed: Number(artifact.summary.passed || 0),
        failed: Number(artifact.summary.failed || 0),
        errors: 0,
        skipped: Number(artifact.summary.skipped || 0),
        durationMs: null,
        branchId: artifact.branchId ? String(artifact.branchId) : null,
        changeSetId: artifact.changeSetId ? String(artifact.changeSetId) : null,
        candidateSnapshotId: artifact.candidateSnapshotId ? String(artifact.candidateSnapshotId) : null,
        producedAt: artifact.producedAt ?? null
      });
      continue;
    }
    if (artifact.structuredFormat === "junit") {
      const parsed = parseJUnitSuitesAndCases(artifact.content);
      if (parsed.suites.length) {
        for (const suite of parsed.suites) {
          rows.push({
            id: `testSuite:${artifact.id}:${suite.suiteId}`,
            runId: artifact.runId,
            resultId: artifact.resultId,
            gateId: artifact.gateId,
            artifactId: artifact.id,
            format: "junit",
            name: suite.name,
            status: suite.errors > 0 ? "error" : (suite.failures > 0 ? "failed" : "passed"),
            total: suite.tests,
            passed: Math.max(0, suite.tests - suite.failures - suite.errors - suite.skipped),
            failed: suite.failures,
            errors: suite.errors,
            skipped: suite.skipped,
            durationMs: typeof suite.timeSeconds === "number" && Number.isFinite(suite.timeSeconds)
              ? Math.round(suite.timeSeconds * 1000)
              : null,
            branchId: artifact.branchId ? String(artifact.branchId) : null,
            changeSetId: artifact.changeSetId ? String(artifact.changeSetId) : null,
            candidateSnapshotId: artifact.candidateSnapshotId ? String(artifact.candidateSnapshotId) : null,
            producedAt: artifact.producedAt ?? null
          });
        }
      } else if (artifact.summary) {
        rows.push({
          id: `testSuite:${artifact.id}`,
          runId: artifact.runId,
          resultId: artifact.resultId,
          gateId: artifact.gateId,
          artifactId: artifact.id,
          format: "junit",
          name: artifact.title || artifact.fileName || artifact.id,
          status: Number(artifact.summary.errors || 0) > 0 ? "error" : (Number(artifact.summary.failed || 0) > 0 ? "failed" : "passed"),
          total: Number(artifact.summary.total || 0),
          passed: Number(artifact.summary.passed || 0),
          failed: Number(artifact.summary.failed || 0),
          errors: Number(artifact.summary.errors || 0),
          skipped: Number(artifact.summary.skipped || 0),
          durationMs: null,
          branchId: artifact.branchId ? String(artifact.branchId) : null,
          changeSetId: artifact.changeSetId ? String(artifact.changeSetId) : null,
          candidateSnapshotId: artifact.candidateSnapshotId ? String(artifact.candidateSnapshotId) : null,
          producedAt: artifact.producedAt ?? null
        });
      }
    }
  }
  return sortRows(rows, ["runId", "artifactId", "id"]);
}

function testCaseRows(witnesses) {
  const artifacts = platformModuleProjectors.testArtifacts(witnesses);
  const rows = [];
  for (const artifact of artifacts) {
    if (artifact.structuredFormat === "tap") {
      for (const testCase of parseTapCases(artifact.content)) {
        rows.push({
          id: `testCase:${artifact.id}:${testCase.ordinal}`,
          suiteId: `testSuite:${artifact.id}`,
          runId: artifact.runId,
          resultId: artifact.resultId,
          gateId: artifact.gateId,
          artifactId: artifact.id,
          format: "tap",
          name: testCase.name,
          status: testCase.status,
          testNumber: testCase.testNumber,
          classname: null,
          durationMs: null,
          branchId: artifact.branchId ? String(artifact.branchId) : null,
          changeSetId: artifact.changeSetId ? String(artifact.changeSetId) : null,
          candidateSnapshotId: artifact.candidateSnapshotId ? String(artifact.candidateSnapshotId) : null,
          producedAt: artifact.producedAt ?? null
        });
      }
      continue;
    }
    if (artifact.structuredFormat === "junit") {
      const parsed = parseJUnitSuitesAndCases(artifact.content);
      for (const testCase of parsed.cases) {
        rows.push({
          id: `testCase:${artifact.id}:${testCase.suiteId}:${testCase.ordinal}`,
          suiteId: `testSuite:${artifact.id}:${testCase.suiteId}`,
          runId: artifact.runId,
          resultId: artifact.resultId,
          gateId: artifact.gateId,
          artifactId: artifact.id,
          format: "junit",
          name: testCase.name,
          status: testCase.status,
          testNumber: testCase.ordinal,
          classname: testCase.classname ? String(testCase.classname) : null,
          durationMs: typeof testCase.timeSeconds === "number" && Number.isFinite(testCase.timeSeconds)
            ? Math.round(testCase.timeSeconds * 1000)
            : null,
          branchId: artifact.branchId ? String(artifact.branchId) : null,
          changeSetId: artifact.changeSetId ? String(artifact.changeSetId) : null,
          candidateSnapshotId: artifact.candidateSnapshotId ? String(artifact.candidateSnapshotId) : null,
          producedAt: artifact.producedAt ?? null
        });
      }
    }
  }
  return sortRows(rows, ["runId", "suiteId", "id"]);
}

function testReportRows(witnesses) {
  const runs = platformModuleProjectors.testRuns(witnesses);
  const results = platformModuleProjectors.testResults(witnesses);
  const artifacts = platformModuleProjectors.testArtifacts(witnesses);
  const suites = platformModuleProjectors.testSuites(witnesses);
  const testCases = platformModuleProjectors.testCases(witnesses);
  const regressionsByRun = regressionSummaryByRun(runs);
  const resultsByRun = Object.create(null);
  const artifactsByRun = Object.create(null);
  const suitesByRun = Object.create(null);
  const casesByRun = Object.create(null);
  for (const row of results) pushByKey(resultsByRun, row.runId, row);
  for (const row of artifacts) pushByKey(artifactsByRun, row.runId, row);
  for (const row of suites) pushByKey(suitesByRun, row.runId, row);
  for (const row of testCases) pushByKey(casesByRun, row.runId, row);
  const rows = [];
  for (const run of runs) {
    const runResults = resultsByRun[run.id] ?? [];
    const runArtifacts = artifactsByRun[run.id] ?? [];
    const runSuites = suitesByRun[run.id] ?? [];
    const runCases = casesByRun[run.id] ?? [];
    const format = primaryStructuredFormat(runArtifacts, runSuites);
    const structuredArtifacts = format
      ? runArtifacts.filter(artifact => artifact.structuredFormat === format)
      : runArtifacts.filter(artifact => artifact.structuredFormat);
    const relevantSuites = format
      ? runSuites.filter(suite => suite.format === format)
      : runSuites;
    const relevantCases = format
      ? runCases.filter(testCase => testCase.format === format)
      : runCases;
    const failedCases = relevantCases.filter(testCase => testCase.status === "failed" || testCase.status === "error");
    const caseStatusCounts = relevantCases.reduce((counts, testCase) => {
      const status = String(testCase.status || "unknown");
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, Object.create(null));
    const suiteStatusCounts = relevantSuites.reduce((counts, suite) => {
      const status = String(suite.status || "unknown");
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, Object.create(null));
    const totalCases = relevantCases.length || relevantSuites.reduce((sum, suite) => sum + Number(suite.total || 0), 0);
    const passedCount = caseStatusCounts.passed ?? relevantSuites.reduce((sum, suite) => sum + Number(suite.passed || 0), 0);
    const failedCount = caseStatusCounts.failed ?? relevantSuites.reduce((sum, suite) => sum + Number(suite.failed || 0), 0);
    const errorCount = caseStatusCounts.error ?? relevantSuites.reduce((sum, suite) => sum + Number(suite.errors || 0), 0);
    const skippedCount = (caseStatusCounts.skipped ?? 0) + (caseStatusCounts.todo ?? 0)
      || relevantSuites.reduce((sum, suite) => sum + Number(suite.skipped || 0), 0);
    const suiteCount = relevantSuites.length;
    const summarySuffix = run.cacheStatus === "hit" ? ", cached" : "";
    const baseArtifactIds = runArtifacts.map(artifact => artifact.id);
    const baseSuiteIds = relevantSuites.map(suite => suite.id);
    const baseCaseIds = relevantCases.map(testCase => testCase.id);
    const producedAt = run.finishedAt ?? run.startedAt ?? null;
    const latestResult = runResults.at(-1) ?? null;
    const regression = regressionsByRun[run.id] ?? {
      id: `regressionSummary:${run.id}`,
      runId: String(run.id),
      gateId: String(run.gateId || ""),
      status: "unknown",
      baselineRunId: null,
      baselineDurationMs: null,
      currentDurationMs: numberOrNull(run.durationMs),
      deltaMs: null,
      deltaPercent: null
    };
    rows.push({
      id: `testReport:${run.id}:summary`,
      runId: String(run.id),
      gateId: String(run.gateId || ""),
      reportKind: "summary",
      title: "Report Summary",
      status: String(run.status || latestResult?.status || "unknown"),
      summary: `${formatCountSummary({ suiteCount, caseCount: totalCases, failedCount, errorCount, skippedCount })}${summarySuffix}`,
      artifactIds: baseArtifactIds,
      suiteIds: baseSuiteIds,
      caseIds: baseCaseIds,
      producedAt,
      format: format || null,
      suiteCount,
      caseCount: totalCases,
      passedCount,
      failedCount,
      errorCount,
      skippedCount,
      cached: run.cacheStatus === "hit"
    });
    rows.push({
      id: `testReport:${run.id}:suites`,
      runId: String(run.id),
      gateId: String(run.gateId || ""),
      reportKind: "suites",
      title: "Suite Summary",
      status: suiteStatusCounts.error ? "error" : (suiteStatusCounts.failed ? "failed" : (suiteCount ? "passed" : "unknown")),
      summary: suiteCount
        ? formatCountSummary({ suiteCount, caseCount: totalCases, failedCount, errorCount, skippedCount })
        : "No structured suites were derived for this run.",
      artifactIds: structuredArtifacts.map(artifact => artifact.id),
      suiteIds: baseSuiteIds,
      caseIds: baseCaseIds,
      producedAt,
      format: format || null,
      suiteCount,
      caseCount: totalCases,
      failedCount,
      errorCount,
      skippedCount
    });
    rows.push({
      id: `testReport:${run.id}:failures`,
      runId: String(run.id),
      gateId: String(run.gateId || ""),
      reportKind: "failures",
      title: "Failing Cases",
      status: failedCases.length ? (failedCases.some(testCase => testCase.status === "error") ? "error" : "failed") : "passed",
      summary: failedCases.length
        ? `${failedCases.length} failing or error case${failedCases.length === 1 ? "" : "s"}`
        : "No failing or error cases were derived for this run.",
      artifactIds: uniqueStrings(failedCases.map(testCase => testCase.artifactId)),
      suiteIds: uniqueStrings(failedCases.map(testCase => testCase.suiteId)),
      caseIds: failedCases.map(testCase => testCase.id),
      producedAt,
      format: format || null,
      failureCount: failedCases.length
    });
    rows.push({
      id: `testReport:${run.id}:regression`,
      runId: String(run.id),
      gateId: String(run.gateId || ""),
      reportKind: "regression",
      title: "Regression Summary",
      status: regression.status,
      summary: regression.status === "unknown"
        ? "No valid non-cached passed baseline is available yet."
        : `${regression.status} vs ${regression.baselineRunId || "baseline"}: ${regression.currentDurationMs ?? "?"} ms vs ${regression.baselineDurationMs ?? "?"} ms (${regression.deltaPercent == null ? "n/a" : `${regression.deltaPercent >= 0 ? "+" : ""}${Math.round(regression.deltaPercent)}%`})`,
      artifactIds: [],
      suiteIds: [],
      caseIds: [],
      producedAt,
      regressionSummary: regression
    });
  }
  return sortRows(rows, ["runId", "reportKind", "id"]);
}

export const platformModuleProjectors = {
  changeSetEdits(witnesses) {
    return changeSetEditRows(witnesses);
  },

  changeSetEditIndex(witnesses) {
    const rows = platformModuleProjectors.changeSetEdits(witnesses);
    const byId = Object.create(null);
    const byChangeSet = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      pushByKey(byChangeSet, row.changeSetId, row);
    }
    return { rows, byId, byChangeSet };
  },

  candidateSnapshots(witnesses) {
    return candidateSnapshotRows(witnesses);
  },

  candidateSnapshotIndex(witnesses) {
    const rows = platformModuleProjectors.candidateSnapshots(witnesses);
    const byId = Object.create(null);
    const byChangeSet = Object.create(null);
    const byBranch = Object.create(null);
    const activeByBranch = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      pushByKey(byChangeSet, row.changeSetId, row);
      pushByKey(byBranch, row.branchId, row);
      if (row.status === "valid") activeByBranch[row.branchId] = row;
    }
    return { rows, byId, byChangeSet, byBranch, activeByBranch };
  },

  testRuns(witnesses) {
    return testRunRows(witnesses);
  },

  testRunIndex(witnesses) {
    const rows = platformModuleProjectors.testRuns(witnesses);
    const byId = Object.create(null);
    const byGate = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      pushByKey(byGate, row.gateId, row);
    }
    return { rows, byId, byGate };
  },

  testResults(witnesses) {
    return testResultRows(witnesses);
  },

  testArtifacts(witnesses) {
    return testArtifactRows(witnesses);
  },

  testSuites(witnesses) {
    return testSuiteRows(witnesses);
  },

  testCases(witnesses) {
    return testCaseRows(witnesses);
  },

  testReports(witnesses) {
    return testReportRows(witnesses);
  },

  testReportIndex(witnesses) {
    const rows = platformModuleProjectors.testReports(witnesses);
    const byId = Object.create(null);
    const byRun = Object.create(null);
    const byGate = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      pushByKey(byRun, row.runId, row);
      pushByKey(byGate, row.gateId, row);
    }
    return { rows, byId, byRun, byGate };
  },

  verificationPolicies(witnesses) {
    return verificationPolicyRows(witnesses);
  },

  verificationQueue(witnesses) {
    return verificationQueueRows(witnesses);
  },

  verificationExecutions(witnesses) {
    return verificationExecutionRows(witnesses);
  },

  testGates(witnesses) {
    const latestResultsByGate = platformModuleProjectors.latestTestResultsByGate(witnesses).byGate ?? Object.create(null);
    const flakeScoresByGate = buildFlakeScoreByGate(platformModuleProjectors.testResults(witnesses));
    return discoverProjectedTestGates(latestResultsByGate, flakeScoresByGate);
  },

  testGateIndex(witnesses) {
    return buildProjectedTestGateIndex(platformModuleProjectors.testGates(witnesses));
  },

  coverageEdges(witnesses) {
    return buildProjectedCoverageEdges(platformModuleProjectors.testGates(witnesses));
  },

  latestTestResultsByGate(witnesses) {
    const rows = platformModuleProjectors.testResults(witnesses);
    const byGate = Object.create(null);
    for (const row of rows) byGate[row.gateId] = row;
    return { rows, byGate };
  },

  conflicts(witnesses) {
    return conflictRows(witnesses);
  },

  mergeIntents(witnesses) {
    return mergeIntentRows(witnesses);
  },

  branches(witnesses) {
    const latest = latestBodiesByProcess(witnesses, "platform.branch.create");
    const rows = new Map();
    for (const body of latest.values()) {
      rows.set(String(body.id), {
        id: String(body.id),
        title: String(body.title || body.id),
        parentBranchId: body.parentBranchId ? String(body.parentBranchId) : null,
        epic: body.epic ? String(body.epic) : null,
        feature: body.feature ? String(body.feature) : null,
        defect: body.defect ? String(body.defect) : null,
        owner: body.owner ? String(body.owner) : null,
        runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : null,
        session: body.session ? String(body.session) : null,
        status: String(body.status || "open"),
        createdAt: body.createdAt ?? null,
        changeSetIds: [],
        latestCandidateSnapshotId: null
      });
    }
    for (const witness of witnesses) {
      if (witness.process === "platform.changeSet.create" && witness.body?.branchId && witness.body?.id) {
        const row = rows.get(String(witness.body.branchId));
        if (row && !row.changeSetIds.includes(String(witness.body.id))) row.changeSetIds.push(String(witness.body.id));
      }
      if (witness.process === "platform.changeSet.validate" && witness.body?.branchId) {
        const row = rows.get(String(witness.body.branchId));
        if (!row) continue;
        row.status = witness.body.status === "valid" ? "valid" : "blocked";
        row.latestCandidateSnapshotId = witness.body.candidateSnapshot?.id ?? row.latestCandidateSnapshotId;
      }
      if (witness.process === "platform.changeSet.apply" && witness.body?.branchId) {
        const row = rows.get(String(witness.body.branchId));
        if (!row) continue;
        row.latestCandidateSnapshotId = witness.body.candidateSnapshotId ?? row.latestCandidateSnapshotId;
      }
    }
    const changeSetIndex = platformModuleProjectors.changeSetIndex(witnesses);
    return sortRows([...rows.values()].map(row => ({
      ...row,
      changeSetIds: [...row.changeSetIds].sort(),
      status: (() => {
        const branchChangeSets = row.changeSetIds
          .map(id => changeSetIndex.byId?.[id] ?? null)
          .filter(Boolean);
        if (branchChangeSets.length && branchChangeSets.every(changeSet => ["rejected", "abandoned"].includes(String(changeSet.status || "")))) {
          return "closed";
        }
        if (branchChangeSets.some(changeSet => String(changeSet.status || "") === "valid")) return "valid";
        if (branchChangeSets.some(changeSet => String(changeSet.status || "") === "invalid")) return "blocked";
        if (branchChangeSets.some(changeSet => ["draft", "validating"].includes(String(changeSet.status || "")))) return "open";
        return row.status;
      })()
    })), ["id"]);
  },

  branchIndex(witnesses) {
    const rows = platformModuleProjectors.branches(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  changeSets(witnesses) {
    const latest = latestBodiesByProcess(witnesses, "platform.changeSet.create");
    const rows = new Map();
    for (const body of latest.values()) {
      rows.set(String(body.id), {
        id: String(body.id),
        branchId: String(body.branchId),
        title: String(body.title || body.id),
        reason: body.reason ? String(body.reason) : null,
        owner: body.owner ? String(body.owner) : null,
        runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : null,
        session: body.session ? String(body.session) : null,
        status: String(body.status || "draft"),
        createdAt: body.createdAt ?? null,
        latestCandidateSnapshotId: null,
        activeCandidateSnapshotId: null,
        validationCount: 0,
        appliedAt: null
      });
    }
    for (const witness of witnesses) {
      const changeSetId = witness.process === "platform.changeSet.edit.upsert" || witness.process === "platform.changeSet.edit.remove"
        ? String(witness.body?.changeSetId || "")
        : String(witness.body?.id || "");
      const row = rows.get(changeSetId);
      if (!row) continue;
      if (witness.process === "platform.changeSet.edit.upsert" || witness.process === "platform.changeSet.edit.remove") {
        row.status = "draft";
        continue;
      }
      if (witness.process === "platform.changeSet.validate.start") {
        row.status = "validating";
        continue;
      }
      if (witness.process === "platform.changeSet.validate") {
        row.status = String(witness.body.status || row.status);
        row.latestCandidateSnapshotId = witness.body.candidateSnapshot?.id ?? row.latestCandidateSnapshotId;
        row.activeCandidateSnapshotId = witness.body.activeCandidateSnapshotId ?? row.activeCandidateSnapshotId;
        row.validationCount += 1;
        continue;
      }
      if (witness.process === "platform.changeSet.apply") {
        row.status = "applied";
        row.latestCandidateSnapshotId = witness.body.candidateSnapshotId ?? row.latestCandidateSnapshotId;
        row.appliedAt = witness.body.appliedAt ?? null;
        continue;
      }
      if (witness.process === "platform.changeSet.reject") {
        row.status = "rejected";
        continue;
      }
      if (witness.process === "platform.changeSet.abandon") {
        row.status = "abandoned";
      }
    }
    const editIndex = platformModuleProjectors.changeSetEditIndex(witnesses);
    return sortRows([...rows.values()].map(row => ({
      ...row,
      editCount: (editIndex.byChangeSet[row.id] ?? []).length,
      ...platformChangeSetInsights(row, {
        edits: editIndex.byChangeSet[row.id] ?? []
      })
    })), ["id"]);
  },

  changeSetIndex(witnesses) {
    const rows = platformModuleProjectors.changeSets(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  }
};
