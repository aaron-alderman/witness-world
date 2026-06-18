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
  resolveStewardshipTargetInput,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestWidgetDefine,
  requestWidgetUpdate
} from "./authoring-core-processes.js";

export function executeAuthoringCoreProposalTarget({
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
}) {
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
      const resolvedTarget = resolveStewardshipTargetInput(world, body, {
        label: "stewardship target"
      });
      if (!resolvedTarget.ok) return { ok: false, status: 400, error: resolvedTarget.error };
      const gate = ensureTargetAuthority(actor, resolvedTarget.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapStewardshipGrant(world, {
        actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "stewardship.revoke": {
      const resolvedTarget = resolveStewardshipTargetInput(world, body, {
        label: "stewardship target"
      });
      if (!resolvedTarget.ok) return { ok: false, status: 400, error: resolvedTarget.error };
      const gate = ensureTargetAuthority(actor, resolvedTarget.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapStewardshipRevoke(world, {
        actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
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
    case "route.define": {
      const gate = ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapRouteDefine(world, {
        actor,
        backendHost,
        body,
        allowedHandlers: supportedHandlers,
        handlerMetadataById: supportedHandlerMetadata
      });
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
    default:
      return null;
  }
}
