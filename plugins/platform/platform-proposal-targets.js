import {
  createPlatformBranch,
  createPlatformChangeSet,
  stagePlatformChangeSetEdits,
  validatePlatformChangeSet
} from "./change-sets.js";

function failure(result, fallback) {
  return {
    ok: false,
    status: result.status || 400,
    error: result.error || fallback,
    ...(result.witness ? { witness: result.witness } : {})
  };
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
        runtimeProfile: body.runtimeProfile ?? "full"
      });
      if (!result.ok) return failure(result, "platform branch creation failed");
      return { ok: true, witnessIds: [result.witness?.id].filter(Boolean) };
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
    default:
      return null;
  }
}
