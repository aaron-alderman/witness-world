import { canvasProcessHandlers } from "../canvas/canvas-processes.js";
import { executeCapabilityAuthoringProposalTarget } from "../capability-authoring/capability-proposal-targets.js";
import { executeAuthoringCoreProposalTarget } from "../authoring-core/authoring-core-proposal-targets.js";
import { executeProgramAuthoringProposalTarget } from "../program-authoring/program-proposal-targets.js";
import { executeServerRunnerAuthoringProposalTarget } from "../server-runner-authoring/server-runner-proposal-targets.js";
import { executeMcpAuthoringProposalTarget } from "../mcp-authoring/mcp-proposal-targets.js";
import { executeDemoProposalTarget } from "../demo/demo-proposal-targets.js";
import { executePlatformProposalTarget } from "../platform/platform-proposal-targets.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "../inspect/widget-versions.js";
import {
  requestEdenVersionActivate,
  requestEdenVersionPublish,
  requestEdenVersionRollback
} from "../eden/eden-versions.js";

function executeEdenVersionActivateProposal({
  world,
  actor,
  backendHost,
  proposal,
  body,
  ensureTargetAuthority
}) {
  const soul = body.soul || proposal.targetId || "";
  const gate = ensureTargetAuthority(actor, soul);
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
  const result = requestEdenVersionActivate(world, {
    actor,
    backendHost,
    surfaceId: body.surfaceId,
    soul,
    publishedVersion: body.publishedVersion ?? null,
    draftVersion: body.draftVersion ?? null,
    body
  });
  return result.ok
    ? { ok: true, witnessIds: [result.witness?.id].filter(Boolean) }
    : { ok: false, status: result.status, error: result.error || "eden version activation failed", witness: result.witness };
}

function executeEdenVersionRollbackProposal({
  world,
  actor,
  backendHost,
  proposal,
  body,
  ensureTargetAuthority
}) {
  const soul = body.soul || proposal.targetId || "";
  const gate = ensureTargetAuthority(actor, soul);
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
  const result = requestEdenVersionRollback(world, {
    actor,
    backendHost,
    surfaceId: body.surfaceId,
    soul,
    publishedVersion: body.publishedVersion ?? null,
    draftVersion: body.draftVersion ?? null
  });
  return result.ok
    ? { ok: true, witnessIds: [result.witness?.id].filter(Boolean) }
    : { ok: false, status: result.status, error: result.error || "eden version rollback failed", witness: result.witness };
}

export function executeEdenVersionPublishProposal({
  world,
  actor,
  backendHost,
  proposal,
  body,
  ensureTargetAuthority
}) {
  const soul = body.soul || proposal.targetId || "";
  const gate = ensureTargetAuthority(actor, soul);
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
  const result = requestEdenVersionPublish(world, {
    actor,
    backendHost,
    surfaceId: body.surfaceId ?? "eden.surface.versions",
    soul,
    publishedVersion: body.publishedVersion ?? null,
    draftVersion: body.draftVersion ?? null,
    body
  });
  return result.ok
    ? { ok: true, witnessIds: [result.witness.id].filter(Boolean) }
    : { ok: false, status: result.status || 400, error: result.error || "eden version publish failed", witness: result.witness };
}

export function createAuthoringProposalExecutor({
  world,
  backendHost,
  supportedHandlerSets,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedFrontendOps,
  supportedBackendOps,
  ensureIdentityAuthority,
  ensureTargetAuthority,
  ensureContextAuthority,
  mcpToolNames,
  getRuntimePluginCatalog
}) {
  const canvasProposalResult = witness => {
    if (witness?.process?.endsWith(".failed") || witness?.process?.endsWith(".blocked")) {
      return {
        ok: false,
        status: Number.isInteger(witness.body?.status) ? witness.body.status : 400,
        error: witness.body?.reason || "canvas proposal execution failed",
        witness
      };
    }
    return { ok: true, witnessIds: [witness.id].filter(Boolean) };
  };
  const runContextCanvasProposal = (actor, process, body) => {
    const gate = body.context ? ensureContextAuthority(actor, body.context) : { ok: true };
    if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
    return canvasProposalResult(canvasProcessHandlers[process](world, { actor, ...body }));
  };
  return actor => async proposal => {
    const body = proposal.body ?? {};
    switch (proposal.targetProcess) {
      case "branch.create":
      case "branch.merge":
      case "branch.rebase":
      case "changeSet.create":
      case "changeSet.edit":
      case "changeSet.validate":
      case "changeSet.apply":
        return executePlatformProposalTarget({
          world,
          actor,
          proposal,
          body
        });
      case "identity.update": {
        return executeAuthoringCoreProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          supportedHandlers,
          supportedHandlerMetadata,
          ensureIdentityAuthority,
          ensureContextAuthority,
          ensureTargetAuthority
        });
      }
      case "todo.create": {
        return executeDemoProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureContextAuthority
        });
      }
      case "todo.update": {
        return executeDemoProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureContextAuthority
        });
      }
      case "todo.delete": {
        return executeDemoProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureContextAuthority
        });
      }
      case "canvas.place":
      case "canvas.move":
      case "canvas.moveMany":
      case "canvas.style":
      case "canvas.remove":
      case "canvas.removeMany":
      case "canvas.duplicate":
      case "canvas.camera":
      case "canvas.grid":
      case "canvas.batch":
      case "canvas.createThing":
      case "canvas.perspective.create":
        return runContextCanvasProposal(actor, proposal.targetProcess, body);
      case "canvas.thing.setTitle": {
        const thingId = body.thing || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, thingId);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        return canvasProposalResult(canvasProcessHandlers["canvas.thing.setTitle"](world, { actor, ...body, thing: thingId }));
      }
      case "canvas.relate": {
        const from = body.from || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, from);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        return canvasProposalResult(canvasProcessHandlers["canvas.relate"](world, { actor, ...body, from }));
      }
      case "canvas.unrelate": {
        const from = body.from || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, from);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        return canvasProposalResult(canvasProcessHandlers["canvas.unrelate"](world, { actor, ...body, from }));
      }
      case "asset.attach": {
        const assetId = body.asset || proposal.targetId || "";
        const targetId = body.target || "";
        const assetGate = ensureTargetAuthority(actor, assetId);
        if (!assetGate.ok) return { ok: false, status: assetGate.status, error: assetGate.reason };
        const targetGate = ensureTargetAuthority(actor, targetId);
        if (!targetGate.ok) return { ok: false, status: targetGate.status, error: targetGate.reason };
        return canvasProposalResult(canvasProcessHandlers["asset.attach"](world, { actor, ...body, asset: assetId, target: targetId }));
      }
      case "asset.detach": {
        const assetId = body.asset || proposal.targetId || "";
        const targetId = body.target || "";
        const assetGate = ensureTargetAuthority(actor, assetId);
        if (!assetGate.ok) return { ok: false, status: assetGate.status, error: assetGate.reason };
        const targetGate = ensureTargetAuthority(actor, targetId);
        if (!targetGate.ok) return { ok: false, status: targetGate.status, error: targetGate.reason };
        return canvasProposalResult(canvasProcessHandlers["asset.detach"](world, { actor, ...body, asset: assetId, target: targetId }));
      }
      case "context.define":
      case "context.bind":
      case "context.unbind":
      case "context.export":
      case "context.unexport":
      case "context.import":
      case "context.unimport":
      case "perspective.define":
      case "stewardship.grant":
      case "stewardship.revoke":
      case "surface.define":
      case "process.define":
      case "type.define":
      case "projection.define":
      case "message.define":
      case "package.define":
      case "packageRevision.define":
      case "packageRevision.publish":
      case "packagePatch.define":
      case "packageNamespace.define":
      case "packageDependency.define":
      case "packageTransformer.define":
      case "widget.define":
      case "widget.update":
        return executeAuthoringCoreProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          supportedHandlers,
          supportedHandlerMetadata,
          ensureIdentityAuthority,
          ensureContextAuthority,
          ensureTargetAuthority
        });
      case "widgetVersion.activate": {
        const soul = body.soul || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetVersionActivation(world, {
          actor,
          soul,
          version: body.version ?? null
        });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || []).map(entry => entry.id).filter(Boolean) }
          : { ok: false, status: result.status === "failed" ? 400 : 409, error: result.witness.body?.reason || "widget version activation failed", witness: result.witness };
      }
      case "widgetVersion.rollback": {
        const soul = body.soul || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = rollbackWidgetVersion(world, { actor, soul });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || []).map(entry => entry.id).filter(Boolean) }
          : { ok: false, status: 409, error: result.witness.body?.reason || "widget version rollback failed", witness: result.witness };
      }
      case "edenVersions.activate": {
        return executeEdenVersionActivateProposal({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureTargetAuthority
        });
      }
      case "edenVersions.rollback": {
        return executeEdenVersionRollbackProposal({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureTargetAuthority
        });
      }
      case "edenVersions.publish": {
        return executeEdenVersionPublishProposal({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureTargetAuthority
        });
      }
      case "frontendProgram.define":
      case "frontendStep.define":
      case "backendProgram.define":
      case "backendProgramVersion.define":
      case "backendStep.define":
      case "backendProgramVersion.activate":
      case "backendProgramVersion.rollback":
        return executeProgramAuthoringProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          supportedFrontendOps,
          supportedBackendOps,
          ensureContextAuthority,
          ensureTargetAuthority
        });
      case "serverRunner.define":
      case "runtimePlugin.install":
      case "runtimePlugin.remove":
        return executeServerRunnerAuthoringProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          supportedHandlerSets,
          ensureContextAuthority,
          ensureTargetAuthority,
          getRuntimePluginCatalog
        });
      case "mcpServer.define": {
        return executeMcpAuthoringProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          mcpToolNames,
          ensureContextAuthority,
          ensureTargetAuthority
        });
      }
      case "capability.define":
      case "capability.install":
      case "capability.remove":
      case "capability.migrateLegacy":
        return executeCapabilityAuthoringProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureContextAuthority,
          ensureTargetAuthority
        });
      case "mcpTool.install": {
        return executeMcpAuthoringProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          mcpToolNames,
          ensureContextAuthority,
          ensureTargetAuthority
        });
      }
      case "mcpTool.remove": {
        return executeMcpAuthoringProposalTarget({
          world,
          actor,
          backendHost,
          proposal,
          body,
          mcpToolNames,
          ensureContextAuthority,
          ensureTargetAuthority
        });
      }
      default:
        return { ok: false, status: 400, error: "proposal target process not supported" };
    }
  };
}
