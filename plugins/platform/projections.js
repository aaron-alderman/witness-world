import { moduleProjectors } from "../../src/modules.js";
import { platformChangeSetInsights } from "./branch-insights.js";

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
        producedAt: result.producedAt ?? witness.body.finishedAt ?? null
      });
    }
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
