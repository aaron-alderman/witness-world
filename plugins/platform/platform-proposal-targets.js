import {
  createPlatformBranch,
  createPlatformChangeSet,
  applyPlatformChangeSet,
  stagePlatformChangeSetEdits,
  validatePlatformChangeSet
} from "./change-sets.js";
import { moduleProjectors } from "../../src/modules.js";

function failure(result, fallback) {
  return {
    ok: false,
    status: result.status || 400,
    error: result.error || fallback,
    ...(result.witness ? { witness: result.witness } : {})
  };
}

function nowIso() {
  return new Date().toISOString();
}

function resolveBranchIntent(world, proposal, body, mode) {
  const branchIndex = world.project(moduleProjectors.branchIndex);
  const branchId = String(body.branchId || proposal.targetId || "").trim();
  const targetField = mode === "merge" ? "intoBranchId" : "ontoBranchId";
  const targetBranchId = String(body[targetField] || "").trim();
  if (!branchId) return { ok: false, status: 400, error: "branchId is required" };
  if (!targetBranchId) return { ok: false, status: 400, error: `${targetField} is required` };
  if (!branchIndex.byId?.[branchId]) return { ok: false, status: 404, error: `branch not found: ${branchId}` };
  if (!branchIndex.byId?.[targetBranchId]) return { ok: false, status: 404, error: `branch not found: ${targetBranchId}` };
  if (branchId === targetBranchId) {
    return { ok: false, status: 409, error: `${mode} intent must target a different branch` };
  }
  return { ok: true, branchId, targetBranchId, targetField };
}

export async function executePlatformProposalTarget({
  world,
  actor,
  proposal,
  body
}) {
  switch (proposal.targetProcess) {
    case "branch.create": {
      const result = createPlatformBranch(world, {
        actor,
        id: body.id || proposal.targetId || "",
        title: body.title ?? null,
        parentBranchId: body.parentBranchId ?? null,
        epic: body.epic ?? null,
        feature: body.feature ?? null,
        defect: body.defect ?? null,
        runtimeProfile: body.runtimeProfile ?? "full"
      });
      if (!result.ok) return failure(result, "platform branch creation failed");
      return { ok: true, witnessIds: [result.witness?.id].filter(Boolean) };
    }
    case "branch.merge":
    case "branch.rebase": {
      const mode = proposal.targetProcess === "branch.merge" ? "merge" : "rebase";
      const resolved = resolveBranchIntent(world, proposal, body, mode);
      if (!resolved.ok) return failure(resolved, `platform branch ${mode} review failed`);
      const witness = world.emit({
        process: mode === "merge" ? "platform.branch.merge.reviewed" : "platform.branch.rebase.reviewed",
        actor,
        claims: [],
        body: {
          proposalId: proposal.id ?? null,
          branchId: resolved.branchId,
          [resolved.targetField]: resolved.targetBranchId,
          mode,
          reviewedAt: nowIso()
        }
      });
      return { ok: true, witnessIds: [witness?.id].filter(Boolean) };
    }
    case "changeSet.create": {
      const result = createPlatformChangeSet(world, {
        actor,
        id: body.id || proposal.targetId || "",
        branchId: body.branchId ?? null,
        title: body.title ?? null,
        reason: body.reason ?? proposal.reason ?? null,
        runtimeProfile: body.runtimeProfile ?? "full"
      });
      if (!result.ok) return failure(result, "platform change set creation failed");
      return { ok: true, witnessIds: [result.branchWitness?.id, result.witness?.id].filter(Boolean) };
    }
    case "changeSet.edit": {
      const result = await stagePlatformChangeSetEdits(world, {
        actor,
        changeSetId: body.changeSetId || proposal.targetId || "",
        edits: Array.isArray(body.edits) ? body.edits : []
      });
      if (!result.ok) return failure(result, "platform change set edit failed");
      return { ok: true, witnessIds: result.staged.map(entry => entry.witnessId).filter(Boolean) };
    }
    case "changeSet.validate": {
      const result = await validatePlatformChangeSet(world, {
        actor,
        changeSetId: body.changeSetId || proposal.targetId || ""
      });
      if (!result.ok) return failure(result, "platform change set validation failed");
      return { ok: true, witnessIds: [result.witness?.id, result.revisionEvent?.id].filter(Boolean) };
    }
    case "changeSet.apply": {
      const result = await applyPlatformChangeSet(world, {
        actor,
        changeSetId: body.changeSetId || proposal.targetId || ""
      });
      if (!result.ok) return failure(result, "platform change set apply failed");
      return { ok: true, witnessIds: [result.witness?.id].filter(Boolean) };
    }
    default:
      return null;
  }
}
