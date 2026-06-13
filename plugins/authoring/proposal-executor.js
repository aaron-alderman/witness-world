import { canvasProcessHandlers } from "../../src/canvas-processes.js";
import {
  requestBootstrapIdentityUpdate,
  requestBootstrapContextDefine,
  requestBootstrapPerspectiveDefine,
  requestBootstrapContextBindingCreate,
  requestBootstrapContextBindingRemove,
  requestBootstrapContextExportCreate,
  requestBootstrapContextExportRemove,
  requestBootstrapContextImportCreate,
  requestBootstrapContextImportRemove,
  requestBootstrapStewardshipGrant,
  requestBootstrapStewardshipRevoke,
  requestBootstrapServerRunnerDefine,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  requestBootstrapCapabilityRemove,
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove,
  requestBootstrapMcpServerDefine,
  requestBootstrapMcpToolInstall,
  requestBootstrapMcpToolRemove,
  requestBootstrapFrontendProgramDefine,
  requestBootstrapFrontendStepDefine,
  requestBootstrapBackendProgramDefine,
  requestBootstrapBackendProgramVersionDefine,
  requestBootstrapBackendStepDefine,
  requestBootstrapBackendProgramVersionActivate,
  requestBootstrapBackendProgramVersionRollback,
  requestWidgetDefine,
  requestWidgetUpdate
} from "../../src/bootstrap-authoring.js";
import {
  ensureTodoTargetAuthority,
  requestTodoCreate,
  requestTodoDelete,
  requestTodoUpdate
} from "../../src/todo-runtime.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "../../src/widgets.js";
import { requestEdenVersionPublish } from "../../src/eden-versions.js";

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
      case "identity.update": {
        const gate = ensureIdentityAuthority(actor, body.id || proposal.targetId || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapIdentityUpdate(world, {
          actor,
          backendHost,
          body: { ...body, id: body.id || proposal.targetId || "" }
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "todo.create": {
        const gate = ensureContextAuthority(actor, proposal.targetId || body.context || "frontend");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestTodoCreate(world, {
          actor,
          backendHost,
          body
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "todo.update": {
        const gate = ensureTodoTargetAuthority(world, actor, body.id || proposal.targetId || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestTodoUpdate(world, {
          actor,
          backendHost,
          body: { ...body, id: body.id || proposal.targetId || "" }
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "todo.delete": {
        const gate = ensureTodoTargetAuthority(world, actor, body.id || proposal.targetId || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestTodoDelete(world, {
          actor,
          backendHost,
          body: { ...body, id: body.id || proposal.targetId || "" }
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
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
      case "context.define": {
        const gate = body.parent ? ensureTargetAuthority(actor, body.parent) : { ok: true };
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.bind": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextBindingCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unbind": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextBindingRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.export": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextExportCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unexport": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextExportRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.import": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextImportCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unimport": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextImportRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "perspective.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapPerspectiveDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "stewardship.grant": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapStewardshipGrant(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "stewardship.revoke": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapStewardshipRevoke(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widget.define": {
        const gate = body.context ? ensureContextAuthority(actor, body.context) : (body.parent ? ensureTargetAuthority(actor, body.parent) : { ok: true });
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widget.update": {
        const gate = ensureTargetAuthority(actor, body.id || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetUpdate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
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
      case "frontendProgram.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapFrontendProgramDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "frontendStep.define": {
        const gate = ensureTargetAuthority(actor, body.program);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapFrontendStepDefine(world, { actor, backendHost, body, allowedOps: supportedFrontendOps });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendProgram.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendProgramVersion.define": {
        const gate = ensureTargetAuthority(actor, body.soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramVersionDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendStep.define": {
        const gate = ensureTargetAuthority(actor, body.version);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendStepDefine(world, { actor, backendHost, body, allowedOps: supportedBackendOps });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendProgramVersion.activate": {
        const gate = ensureTargetAuthority(actor, body.soul || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramVersionActivate(world, { actor, backendHost, body });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
          : result;
      }
      case "backendProgramVersion.rollback": {
        const gate = ensureTargetAuthority(actor, body.soul || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramVersionRollback(world, { actor, backendHost, body });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
          : result;
      }
      case "route.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapRouteDefine(world, { actor, backendHost, body, allowedHandlers: supportedHandlers, handlerMetadataById: supportedHandlerMetadata });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "serve.define": {
        const gate = body.serverRunner
          ? ensureTargetAuthority(actor, body.serverRunner)
          : ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapServeDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "serverRunner.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapServerRunnerDefine(world, { actor, backendHost, body, allowedHandlerSets: supportedHandlerSets });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpServer.define": {
        const gate = body.serverRunner
          ? ensureTargetAuthority(actor, body.serverRunner)
          : ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpServerDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.install": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityInstall(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.remove": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "runtimePlugin.install": {
        const gate = ensureTargetAuthority(actor, body.serverRunner);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const pluginCatalog = await getRuntimePluginCatalog({
          activeProfile: body.runtimeProfile ?? null,
          serverRunnerId: body.serverRunner ?? null
        });
        const result = requestBootstrapRuntimePluginInstall(world, {
          actor,
          backendHost,
          body,
          pluginCatalog
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "runtimePlugin.remove": {
        const gate = ensureTargetAuthority(actor, body.serverRunner);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapRuntimePluginRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpTool.install": {
        const gate = ensureTargetAuthority(actor, body.server);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpToolInstall(world, { actor, backendHost, body, allowedTools: mcpToolNames() });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpTool.remove": {
        const gate = ensureTargetAuthority(actor, body.server);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpToolRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      default:
        return { ok: false, status: 400, error: "proposal target process not supported" };
    }
  };
}
