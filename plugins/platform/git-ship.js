import { createThing, relation } from "../../src/kernel.js";
import { createProposal, moduleProjectors } from "../../src/modules.js";
import { buildPlatformModel } from "./platform-model.js";
import { diagnosticsFromPlatformAppContext } from "./app-context-diagnostics.js";

export const PLATFORM_RELEASE_CHANNEL_ROWS = Object.freeze([
  Object.freeze({
    id: "releaseChannel:local",
    name: "local",
    title: "Local",
    executable: true,
    description: "Records a real local ship event for the latest pushed branch state."
  }),
  Object.freeze({
    id: "releaseChannel:preview",
    name: "preview",
    title: "Preview",
    executable: false,
    description: "Records governed preview ship intent without executing deployment."
  }),
  Object.freeze({
    id: "releaseChannel:staging",
    name: "staging",
    title: "Staging",
    executable: false,
    description: "Records governed staging ship intent without executing deployment."
  }),
  Object.freeze({
    id: "releaseChannel:production",
    name: "production",
    title: "Production",
    executable: false,
    description: "Records governed production ship intent without executing deployment."
  })
]);

export const PLATFORM_SHIP_OBSERVATION_WINDOW_MS = 30 * 60 * 1000;

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "ship";
}

function nowIso() {
  return new Date().toISOString();
}

function timestampMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function stableUnique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || "")).filter(Boolean))];
}

function compareTimeline(left, right) {
  return String(left?.createdAt || left?.observedAt || "").localeCompare(String(right?.createdAt || right?.observedAt || ""))
    || String(left?.id || "").localeCompare(String(right?.id || ""));
}

function releaseChannelIndex() {
  return Object.fromEntries(PLATFORM_RELEASE_CHANNEL_ROWS.map(row => [row.id, row]));
}

function shipRecordId(branchId, sequence) {
  return `shipRecord:${String(branchId || "")}:${sequence}`;
}

function rollbackProposalId(shipRecordIdValue) {
  return `proposal.platform.branch.rollback.${String(shipRecordIdValue || "").replace(/[^a-zA-Z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}`;
}

function latestPushedRecord(pushRecords = [], branchId = "") {
  return [...(Array.isArray(pushRecords) ? pushRecords : [])]
    .filter(row => String(row?.branchId || "") === String(branchId || "") && String(row?.status || "") === "pushed")
    .sort(compareTimeline)
    .at(-1) ?? null;
}

function latestAppliedChangeSet(changeSets = [], branchId = "") {
  return [...(Array.isArray(changeSets) ? changeSets : [])]
    .filter(row => String(row?.branchId || "") === String(branchId || "") && String(row?.status || "") === "applied")
    .sort(compareTimeline)
    .at(-1) ?? null;
}

function branchHasLaterShipMutations(world, branchId, latestPushAt) {
  const pushAtMs = timestampMs(latestPushAt);
  if (pushAtMs == null) return true;
  const changeSetIds = new Set(
    (world.project(moduleProjectors.changeSets) ?? [])
      .filter(row => String(row?.branchId || "") === String(branchId || ""))
      .map(row => String(row?.id || ""))
      .filter(Boolean)
  );
  for (const witness of world.allWitnesses()) {
    const timeMs = timestampMs(witness?.time);
    if (timeMs == null || timeMs <= pushAtMs) continue;
    if (witness.process === "platform.changeSet.apply" && String(witness.body?.branchId || "") === String(branchId || "")) return true;
    if (
      (witness.process === "platform.changeSet.edit.upsert" || witness.process === "platform.changeSet.edit.remove")
      && changeSetIds.has(String(witness.body?.changeSetId || ""))
    ) {
      return true;
    }
  }
  return false;
}

function matchingShipProposal(proposal, branchId, releaseChannelId, proposalId = null, allowOpen = false) {
  if (!proposal) return false;
  if (proposalId && String(proposal.id || "") !== String(proposalId)) return false;
  if (String(proposal.targetProcess || "") !== "branch.ship") return false;
  if (String(proposal.targetId || "") !== String(branchId || "")) return false;
  const status = String(proposal.status || "");
  if (!(status === "approved" || (allowOpen && status === "open"))) return false;
  return String(proposal.body?.releaseChannelId || "") === String(releaseChannelId || "");
}

function resolveShipProposal(proposals, branchId, releaseChannelId, proposalId = null, allowOpen = false) {
  const rows = (Array.isArray(proposals) ? proposals : [])
    .filter(proposal => matchingShipProposal(proposal, branchId, releaseChannelId, proposalId, allowOpen))
    .sort((left, right) => String(right?.id || "").localeCompare(String(left?.id || "")));
  return rows[0] ?? null;
}

function gateResultsForShip(model, branchId, latestPush, proposal, releaseChannel) {
  const branch = (model.branches ?? []).find(row => String(row.id || "") === String(branchId || "")) ?? null;
  const branchTestRedGreen = (model.branchTestRedGreen ?? []).find(row => String(row.branchId || "") === String(branchId || "")) ?? null;
  const openDefects = (model.defects ?? []).filter(row => String(row.branchId || "") === String(branchId || "") && String(row.status || "") === "open");
  const openRegressions = (model.performanceRegressions ?? []).filter(row =>
    String(row.status || "") === "open" && (row.branchIds ?? []).includes(branchId)
  );
  const hotLoopDefects = openDefects.filter(row => String(row.defectKind || "") === "hotLoop");
  const checks = [
    {
      id: "testsGreen",
      ok: String(branchTestRedGreen?.status || "") === "green" && Number(branchTestRedGreen?.totalSelectedGates || 0) > 0,
      summary: branchTestRedGreen?.summary || "No selected gates.",
      selectedGateIds: [...(branchTestRedGreen?.selectedGateIds ?? [])]
    },
    {
      id: "docsFresh",
      ok: String(branch?.docsFreshness?.status || "") !== "stale",
      summary: branch?.docsFreshness?.summary || "No docs freshness data.",
      missingDocs: [...(branch?.docsFreshness?.missingDocs ?? [])]
    },
    {
      id: "noBlockingDefects",
      ok: openDefects.length === 0,
      summary: openDefects.length ? `${openDefects.length} open linked defects.` : "No open linked defects.",
      defectIds: openDefects.map(row => String(row.id || ""))
    },
    {
      id: "telemetryWithinThreshold",
      ok: openRegressions.length === 0 && hotLoopDefects.length === 0,
      summary: openRegressions.length || hotLoopDefects.length
        ? `${openRegressions.length} regressions and ${hotLoopDefects.length} hot-loop defects are open.`
        : "No open telemetry regressions or hot-loop defects.",
      performanceRegressionIds: openRegressions.map(row => String(row.id || "")),
      defectIds: hotLoopDefects.map(row => String(row.id || ""))
    },
    {
      id: "latestPushedState",
      ok: Boolean(latestPush?.id),
      summary: latestPush?.id ? `Latest pushed state is ${latestPush.id}.` : "Branch has no successful push record."
    },
    {
      id: "reviewerApproval",
      ok: Boolean(proposal?.id),
      summary: proposal?.id
        ? `Proposal ${proposal.id} satisfies V1 reviewer approval for ${releaseChannel.id}.`
        : `No approved branch.ship proposal was found for ${releaseChannel.id}.`,
      proposalId: proposal?.id ?? null
    }
  ];
  return {
    ok: checks.every(row => row.ok),
    checks
  };
}

function rollbackReasonFromSignals(shipRecord, regressions = [], defects = []) {
  if (regressions.length) {
    return `Automatic rollback follow-up for ${shipRecord.branchId}: ${regressions.length} post-ship performance regressions opened during the observation window.`;
  }
  if (defects.length) {
    return `Automatic rollback follow-up for ${shipRecord.branchId}: ${defects.length} post-ship hot-loop defects opened during the observation window.`;
  }
  return `Automatic rollback follow-up for ${shipRecord.branchId}.`;
}

function existingRollbackProposal(proposals, shipRecordIdValue) {
  return (Array.isArray(proposals) ? proposals : []).find(proposal =>
    String(proposal?.targetProcess || "") === "branch.rollback"
    && String(proposal?.body?.shipRecordId || "") === String(shipRecordIdValue || "")
  ) ?? null;
}

export async function ensureAutomaticShipRollbackProposals(world, {
  actor = "platform.auto",
  appContext = null
} = {}) {
  if (!world) return [];
  const model = await buildPlatformModel({
    appContext,
    diagnostics: appContext ? diagnosticsFromPlatformAppContext(appContext) : null,
    project: appContext?.project ?? (projector => world.project(projector))
  });
  const created = [];
  for (const shipRecord of model.shipRecords ?? []) {
    if (String(shipRecord.status || "") !== "shipped") continue;
    if (String(shipRecord.releaseChannelId || "") !== "releaseChannel:local") continue;
    const endsAtMs = timestampMs(shipRecord.observationWindowEndsAt);
    const startedAtMs = timestampMs(shipRecord.createdAt);
    const nowMs = Date.now();
    if (endsAtMs == null || startedAtMs == null || nowMs > endsAtMs) continue;
    if (existingRollbackProposal(model.proposals, shipRecord.id)) continue;
    const regressions = (model.performanceRegressions ?? []).filter(row => {
      const observedAtMs = timestampMs(row.observedAt);
      return String(row.status || "") === "open"
        && (row.branchIds ?? []).includes(shipRecord.branchId)
        && observedAtMs != null
        && observedAtMs >= startedAtMs
        && observedAtMs <= endsAtMs;
    });
    const hotLoopDefects = (model.defects ?? []).filter(row => {
      const observedAtMs = timestampMs(row.observedAt);
      return String(row.status || "") === "open"
        && String(row.defectKind || "") === "hotLoop"
        && String(row.branchId || "") === String(shipRecord.branchId || "")
        && observedAtMs != null
        && observedAtMs >= startedAtMs
        && observedAtMs <= endsAtMs;
    });
    if (!regressions.length && !hotLoopDefects.length) continue;
    const proposalId = rollbackProposalId(shipRecord.id);
    if (world.project(moduleProjectors.proposals).some(row => String(row.id || "") === proposalId)) continue;
    createProposal(world, {
      actor,
      id: proposalId,
      targetProcess: "branch.rollback",
      targetKind: "branch",
      targetId: shipRecord.branchId,
      body: {
        branchId: shipRecord.branchId,
        shipRecordId: shipRecord.id,
        releaseChannelId: shipRecord.releaseChannelId,
        sourcePerformanceRegressionIds: regressions.map(row => row.id),
        sourceDefectIds: hotLoopDefects.map(row => row.id)
      },
      reason: rollbackReasonFromSignals(shipRecord, regressions, hotLoopDefects),
      owner: actor
    });
    created.push(world.project(moduleProjectors.proposals).find(row => String(row.id || "") === proposalId) ?? {
      id: proposalId,
      targetProcess: "branch.rollback",
      targetId: shipRecord.branchId
    });
  }
  return created;
}

export async function shipPlatformBranch(world, {
  actor,
  branchId,
  releaseChannelId = "releaseChannel:local",
  proposalId = null,
  session = null,
  appContext = null,
  allowPendingProposal = false
} = {}) {
  const branch = world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? null;
  if (!branch) return { ok: false, status: 404, error: "branch not found" };
  const releaseChannel = releaseChannelIndex()[String(releaseChannelId || "")] ?? null;
  if (!releaseChannel) return { ok: false, status: 404, error: `release channel not found: ${releaseChannelId}` };

  const model = await buildPlatformModel({
    appContext,
    diagnostics: appContext ? diagnosticsFromPlatformAppContext(appContext) : null,
    project: appContext?.project ?? (projector => world.project(projector))
  });
  const latestPush = latestPushedRecord(model.pushRecords, branchId);
  if (!latestPush) {
    return {
      ok: false,
      status: 409,
      error: "branch has no successful push record to ship",
      branch,
      releaseChannel,
      pushRecord: null,
      proposal: null,
      gateResults: { ok: false, checks: [{ id: "latestPushedState", ok: false, summary: "Branch has no successful push record." }] }
    };
  }
  const appliedChangeSet = latestAppliedChangeSet(model.changeSets, branchId);
  const proposal = resolveShipProposal(model.proposals, branchId, releaseChannel.id, proposalId, allowPendingProposal);
  const gateResults = gateResultsForShip(model, branchId, latestPush, proposal, releaseChannel);
  const upToDate = Boolean(
    appliedChangeSet?.id
    && String(appliedChangeSet.id) === String(latestPush.changeSetId || "")
    && !branchHasLaterShipMutations(world, branchId, latestPush.createdAt)
  );
  gateResults.checks.splice(4, 0, {
    id: "branchUpToDate",
    ok: upToDate,
    summary: upToDate
      ? "Branch has no later applied or edited state after the latest successful push."
      : "Branch has later applied or edited state after the latest successful push."
  });
  gateResults.ok = gateResults.checks.every(row => row.ok);
  if (!gateResults.ok) {
    return {
      ok: false,
      status: 409,
      error: "ship gates failed",
      branch: (model.branches ?? []).find(row => String(row.id || "") === String(branchId || "")) ?? branch,
      releaseChannel,
      pushRecord: latestPush,
      proposal,
      gateResults
    };
  }

  const shipSequence = (world.project(moduleProjectors.shipRecordIndex).byBranch?.[branchId]?.length ?? 0) + 1;
  const createdAt = nowIso();
  const observationWindowEndsAt = releaseChannel.executable
    ? new Date(Date.now() + PLATFORM_SHIP_OBSERVATION_WINDOW_MS).toISOString()
    : null;
  const body = {
    id: shipRecordId(branchId, shipSequence),
    branchId,
    changeSetId: latestPush.changeSetId ?? null,
    pushRecordId: latestPush.id,
    releaseChannelId: releaseChannel.id,
    releaseChannelName: releaseChannel.name,
    status: releaseChannel.executable ? "shipped" : "recorded",
    remoteName: latestPush.remoteName ?? null,
    remoteUrl: latestPush.remoteUrl ?? null,
    provider: latestPush.provider ?? "generic",
    gitBranchName: latestPush.gitBranchName ?? null,
    localBranchRef: latestPush.localBranchRef ?? null,
    remoteBranchRef: latestPush.remoteBranchRef ?? null,
    commitSha: latestPush.commitSha ?? null,
    commitMessage: latestPush.commitMessage ?? null,
    compareUrl: latestPush.compareUrl ?? null,
    pullRequestUrl: latestPush.pullRequestUrl ?? null,
    proposalId: proposal?.id ?? null,
    owner: actor,
    runtimeProfile: branch.runtimeProfile ?? null,
    session: session?.id ?? null,
    createdAt,
    observationWindowEndsAt,
    observationStatus: releaseChannel.executable ? "open" : "not-applicable"
  };
  createThing(world, { actor, id: body.id, owner: actor });
  const witness = world.emit({
    process: "platform.branch.ship",
    actor,
    claims: [
      relation(branchId, "shipsTo", releaseChannel.id),
      relation(body.id, "hasModuleKind", "shipRecord")
    ],
    body
  });
  const shipRecord = world.project(moduleProjectors.shipRecordIndex).byId?.[body.id] ?? body;
  const updatedBranch = world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? branch;
  const branchResponse = {
    ...updatedBranch,
    latestShipRecordId: shipRecord.id,
    latestShipStatus: shipRecord.status,
    latestReleaseChannelId: shipRecord.releaseChannelId,
    shipRecordIds: stableUnique([...(updatedBranch.shipRecordIds ?? []), shipRecord.id]),
    status: releaseChannel.executable ? "shipped" : updatedBranch.status
  };
  return {
    ok: true,
    status: 200,
    branch: branchResponse,
    shipRecord,
    releaseChannel,
    gateResults,
    pushRecord: latestPush,
    proposal,
    rollbackProposal: null,
    witness
  };
}

export async function reviewPlatformRollbackProposal(world, {
  actor,
  proposal,
  body
}) {
  const shipRecordIdValue = optionalText(body?.shipRecordId);
  if (!shipRecordIdValue) return { ok: false, status: 400, error: "shipRecordId is required" };
  const shipRecord = world.project(moduleProjectors.shipRecordIndex).byId?.[shipRecordIdValue] ?? null;
  if (!shipRecord) return { ok: false, status: 404, error: "ship record not found" };
  const witness = world.emit({
    process: "platform.branch.rollback.reviewed",
    actor,
    claims: [
      relation(String(shipRecord.branchId || ""), "requests", shipRecordIdValue)
    ],
    body: {
      proposalId: proposal?.id ?? null,
      shipRecordId: shipRecordIdValue,
      branchId: body?.branchId ? String(body.branchId) : String(shipRecord.branchId || ""),
      releaseChannelId: body?.releaseChannelId ? String(body.releaseChannelId) : String(shipRecord.releaseChannelId || ""),
      reviewedAt: nowIso()
    }
  });
  return { ok: true, witnessIds: [witness?.id].filter(Boolean) };
}
