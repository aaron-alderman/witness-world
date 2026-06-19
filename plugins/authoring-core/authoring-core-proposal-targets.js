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
  requestSurfaceDefine,
  requestCollectionDefine,
  requestProcessDefine,
  requestTypeDefine,
  requestProjectionDefine,
  requestMessageDefine,
  requestBoundaryDefine,
  requestPolicyDefine,
  requestPackageDefine,
  requestPackageRevisionDefine,
  requestPackageRevisionPublish,
  requestPackagePatchDefine,
  requestPackageNamespaceDefine,
  requestPackageDependencyDefine,
  requestPackageTransformerDefine,
  resolveCoveredAuthoringRefInput,
  requireCoveredAuthoringRefInput,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestBootstrapFrontendUpliftLegacy,
  requestWidgetDefine,
  requestWidgetReplace,
  requestWidgetReplaceRollback,
  requestWidgetUpdate
} from "./authoring-core-processes.js";
import { frontendLegacyUpliftAuthorityTargets } from "../../src/frontend-legacy-uplift.js";
import { resolveAuthoringHandlerSupport } from "../../src/runtime-authoring-handler-support.js";

function surfaceProposalContexts(body) {
  const docs = Array.isArray(body) ? body : [body];
  return docs
    .map(doc => doc && typeof doc === "object" && !Array.isArray(doc) ? (doc.context ?? null) : null)
    .filter(context => typeof context === "string" && context.trim());
}

export async function executeAuthoringCoreProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  runtimeProfile,
  supportedHandlers,
  supportedPageHandlers = [],
  supportedHandlerMetadata,
  ensureIdentityAuthority,
  ensureContextAuthority,
  ensureTargetAuthority,
  getRuntimePluginCatalog = async () => ({ packages: [] })
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
    case "surface.define": {
      for (const context of surfaceProposalContexts(body)) {
        const gate = ensureContextAuthority(actor, context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      }
      const result = requestSurfaceDefine(world, { actor, backendHost, body });
      return result.ok
        ? { ok: true, witnessIds: (result.witnesses ?? []).map(entry => entry.id).filter(Boolean) }
        : result;
    }
    case "collection.define": {
      const gate = body?.context ? ensureContextAuthority(actor, body.context) : { ok: true };
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestCollectionDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "process.define": {
      const gate = body?.context ? ensureContextAuthority(actor, body.context) : { ok: true };
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestProcessDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "type.define": {
      const gate = body?.context ? ensureContextAuthority(actor, body.context) : { ok: true };
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestTypeDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "projection.define": {
      const gate = body?.context ? ensureContextAuthority(actor, body.context) : { ok: true };
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestProjectionDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "message.define": {
      const gate = body?.context ? ensureContextAuthority(actor, body.context) : { ok: true };
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestMessageDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "boundary.define": {
      const gate = body?.context ? ensureContextAuthority(actor, body.context) : { ok: true };
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBoundaryDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "policy.define": {
      const gate = body?.context ? ensureContextAuthority(actor, body.context) : { ok: true };
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPolicyDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "package.define": {
      const gate = body?.context
        ? ensureContextAuthority(actor, body.context)
        : (proposal.targetId ? ensureContextAuthority(actor, proposal.targetId) : { ok: true });
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPackageDefine(world, {
        actor,
        body: body?.context ? body : { ...body, context: proposal.targetId ?? null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "packageRevision.define": {
      const resolvedPackage = resolveCoveredAuthoringRefInput(world, body, {
        idField: "package",
        refField: "packageRef",
        label: "package"
      });
      if (!resolvedPackage.ok) return { ok: false, status: 400, error: resolvedPackage.error };
      const packageId = resolvedPackage.target ?? proposal.targetId ?? "";
      const gate = ensureTargetAuthority(actor, packageId);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPackageRevisionDefine(world, {
        actor,
        body: { ...body, package: packageId, packageRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "packageRevision.publish": {
      const resolvedRevision = resolveCoveredAuthoringRefInput(world, body, {
        idField: "id",
        refField: "idRef",
        label: "package revision"
      });
      if (!resolvedRevision.ok) return { ok: false, status: 400, error: resolvedRevision.error };
      const revisionId = resolvedRevision.target ?? proposal.targetId ?? "";
      const gate = ensureTargetAuthority(actor, revisionId);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPackageRevisionPublish(world, {
        actor,
        body: { ...body, id: revisionId, idRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "packagePatch.define": {
      const resolvedRevision = resolveCoveredAuthoringRefInput(world, body, {
        idField: "revision",
        refField: "revisionRef",
        label: "package revision"
      });
      if (!resolvedRevision.ok) return { ok: false, status: 400, error: resolvedRevision.error };
      const revisionId = resolvedRevision.target ?? proposal.targetId ?? "";
      const gate = ensureTargetAuthority(actor, revisionId);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPackagePatchDefine(world, {
        actor,
        body: { ...body, revision: revisionId, revisionRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "packageNamespace.define": {
      const gate = ensureContextAuthority(actor, body?.context ?? proposal.targetId ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPackageNamespaceDefine(world, {
        actor,
        body: { ...body, context: body?.context ?? proposal.targetId ?? null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "packageDependency.define": {
      const resolvedSourceRevision = resolveCoveredAuthoringRefInput(world, body, {
        idField: "sourceRevision",
        refField: "sourceRevisionRef",
        label: "package source revision"
      });
      if (!resolvedSourceRevision.ok) return { ok: false, status: 400, error: resolvedSourceRevision.error };
      const sourceRevisionId = resolvedSourceRevision.target ?? proposal.targetId ?? "";
      const gate = ensureTargetAuthority(actor, sourceRevisionId);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPackageDependencyDefine(world, {
        actor,
        body: { ...body, sourceRevision: sourceRevisionId, sourceRevisionRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "packageTransformer.define": {
      const resolvedTargetRevision = resolveCoveredAuthoringRefInput(world, body, {
        idField: "targetRevision",
        refField: "targetRevisionRef",
        label: "target package revision"
      });
      if (!resolvedTargetRevision.ok) return { ok: false, status: 400, error: resolvedTargetRevision.error };
      const resolvedPackage = resolveCoveredAuthoringRefInput(world, body, {
        idField: "package",
        refField: "packageRef",
        label: "package"
      });
      if (!resolvedPackage.ok) return { ok: false, status: 400, error: resolvedPackage.error };
      const packageId = resolvedPackage.target
        ?? body?.package
        ?? (!resolvedTargetRevision.target ? (proposal.targetId ?? "") : "");
      const targetId = resolvedTargetRevision.target ?? proposal.targetId ?? packageId;
      const gate = ensureTargetAuthority(actor, targetId);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestPackageTransformerDefine(world, {
        actor,
        body: {
          ...body,
          package: packageId,
          packageRef: null,
          ...(resolvedTargetRevision.target ? { targetRevision: resolvedTargetRevision.target, targetRevisionRef: null } : {})
        }
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
    case "widget.replace": {
      const gate = ensureTargetAuthority(actor, body.id || "");
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestWidgetReplace(world, { actor, backendHost, body });
      return result.ok
        ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
        : result;
    }
    case "widget.replace.rollback": {
      const gate = ensureTargetAuthority(actor, body.id || "");
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestWidgetReplaceRollback(world, { actor, backendHost, body });
      return result.ok
        ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
        : result;
    }
    case "route.define": {
      const gate = ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const routeAuthoringSupport = await resolveAuthoringHandlerSupport({
        supportedHandlerSets: [],
        supportedHandlers,
        supportedPageHandlers,
        supportedHandlerMetadata,
        pluginCatalog: await getRuntimePluginCatalog({
          activeProfile: body.runtimeProfile ?? runtimeProfile ?? null,
          serverRunnerId: null,
          configuredPluginIds: [],
          authoredPluginIds: []
        })
      });
      const result = requestBootstrapRouteDefine(world, {
        actor,
        backendHost,
        body,
        allowedHandlers: routeAuthoringSupport.supportedHandlers,
        handlerMetadataById: routeAuthoringSupport.supportedHandlerMetadata
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "frontend.upliftLegacy": {
      const uplift = frontendLegacyUpliftAuthorityTargets(world);
      for (const entry of uplift.targets) {
        const gate = ensureTargetAuthority(actor, entry.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      }
      const result = requestBootstrapFrontendUpliftLegacy(world, {
        actor,
        backendHost
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
