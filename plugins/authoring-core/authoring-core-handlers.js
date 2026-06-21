import {
  requestBootstrapIdentityDefine,
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
  requestComputeModuleDefine,
  requestComputeModuleSourceUpsert,
  requestComputeModuleSourceMarkDeleted,
  requestComputeModuleSmokeTestUpsert,
  requestComputeModuleSmokeTestMarkDeleted,
  requestComputeModuleSmokeTestRun,
  requestPackageDefine,
  requestPackageRevisionDefine,
  requestPackageRevisionPublish,
  requestPackagePatchDefine,
  requestPackagePatchSourceUpsert,
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
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";
import { frontendLegacyUpliftAuthorityTargets } from "../../src/frontend-legacy-uplift.js";
import { resolveAuthoringHandlerSupport } from "../../src/runtime-authoring-handler-support.js";
import { moduleProjectors } from "../../src/modules.js";

function proposalIdPart(value, fallback = "target") {
  const normalized = String(value || "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function proposalContextsForSurfaceBody(body) {
  const docs = Array.isArray(body) ? body : [body];
  return docs
    .map(doc => doc && typeof doc === "object" && !Array.isArray(doc) ? (doc.context ?? null) : null)
    .filter(context => typeof context === "string" && context.trim());
}

export function createAuthoringCoreBundleHandlers({
  world,
  backendHost,
  runtimeBundleSummary,
  runtimeProfile,
  readJson,
  authoringServices,
  sendGateFailure,
  syncSessionIdentity,
  sessionResponseShape,
  supportedPageHandlers,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedFrontendOps,
  supportedBackendOps,
  backendHosts,
  frontendHosts,
  send,
  sendJson,
  getRuntimePluginCatalog = async () => ({ packages: [] }),
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const {
    requireBootstrapActor,
    ensureIdentityAuthority,
    ensureTargetAuthority,
    ensureContextAuthority
  } = authoringServices;
  const nextAuthoringCoreProposalId = ({ actor, targetProcess, targetKind, targetId }) => [
    "proposal",
    "authoringCore",
    proposalIdPart(actor || "guest"),
    proposalIdPart(targetProcess),
    proposalIdPart(targetKind),
    proposalIdPart(targetId || targetProcess)
  ].join(".");
  const requestAuthoringCoreProposalCreate = ({
    actor,
    targetProcess,
    targetKind,
    targetId,
    body,
    reason
  }) => requestBootstrapProposalCreate(world, {
    actor,
    backendHost,
    body: {
      id: nextAuthoringCoreProposalId({ actor, targetProcess, targetKind, targetId }),
      targetProcess,
      targetKind,
      targetId,
      bodyJson: JSON.stringify(body ?? {}),
      reason
    }
  });
  const sendAuthoringCoreProposalResponse = (res, proposal, statusMessage = null) => {
    if (!proposal.ok) {
      sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
      return;
    }
    sendJson(res, 202, {
      ok: true,
      status: "proposed",
      proposal: proposal.proposal,
      witness: proposal.witness,
      ...(statusMessage ? { statusMessage } : {})
    });
  };
  const currentRouteAuthoringSupport = async activeProfile => resolveAuthoringHandlerSupport({
      supportedHandlerSets: [],
      supportedHandlers,
      supportedPageHandlers,
      supportedHandlerMetadata,
    pluginCatalog: await getRuntimePluginCatalog({
      activeProfile: activeProfile ?? runtimeProfile,
      serverRunnerId: null,
      configuredPluginIds: [],
      authoredPluginIds: []
    })
  });
  return {
    "identity.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { identity: result.identity, witness: result.witness });
    },

    "identity.update": async ({ req, res, requestActor, requestSession, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const identityId = typeof params?.id === "string" ? params.id : "";
      const auth = ensureIdentityAuthority(gate.actor, identityId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityUpdate(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, id: identityId }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      const nextSession = syncSessionIdentity(requestSession, result.identity);
      sendJson(res, result.status, {
        identity: result.identity,
        witness: result.witness,
        ...(nextSession ? { session: sessionResponseShape(nextSession) } : {})
      });
    },

    "context.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.parent ? ensureTargetAuthority(gate.actor, body.parent) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "context.define",
            targetKind: "context",
            targetId: body.parent ?? null,
            body,
            reason: "Create a child context through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { context: result.context, witness: result.witness });
    },

    "perspective.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "perspective.define",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Create a perspective through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapPerspectiveDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { perspective: result.perspective, witness: result.witness });
    },

    "contextBinding.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "context.bind",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Create a context binding through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextBinding.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "context.unbind",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Remove a context binding through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextExport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "context.export",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Create a context export through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextExport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "context.unexport",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Remove a context export through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextImport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "context.import",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Create a context import through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "contextImport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "context.unimport",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Remove a context import through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "stewardship.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedTarget = resolveStewardshipTargetInput(world, body, {
        label: "stewardship target"
      });
      if (!resolvedTarget.ok) {
        sendJson(res, 400, { error: resolvedTarget.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedTarget.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "stewardship.grant",
            targetKind: body.targetKind ?? null,
            targetId: resolvedTarget.target,
            body: { ...body, target: resolvedTarget.target, targetRef: null },
            reason: "Grant stewardship through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipGrant(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "stewardship.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedTarget = resolveStewardshipTargetInput(world, body, {
        label: "stewardship target"
      });
      if (!resolvedTarget.ok) {
        sendJson(res, 400, { error: resolvedTarget.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedTarget.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "stewardship.revoke",
            targetKind: body.targetKind ?? null,
            targetId: resolvedTarget.target,
            body: { ...body, target: resolvedTarget.target, targetRef: null },
            reason: "Revoke stewardship through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipRevoke(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "surface.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const docs = Array.isArray(body) ? body : [body];
      const proposalContexts = proposalContextsForSurfaceBody(body);
      for (const doc of docs) {
        const context = doc && typeof doc === "object" ? (doc.context ?? null) : null;
        const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
        if (!auth.ok) {
          if (auth.status === 403) {
            const sharedContext = proposalContexts.length > 0 && proposalContexts.every(value => value === proposalContexts[0])
              ? proposalContexts[0]
              : null;
            const proposal = requestAuthoringCoreProposalCreate({
              actor: gate.actor,
              targetProcess: "surface.define",
              targetKind: sharedContext ? "context" : "surfaceBatch",
              targetId: sharedContext ?? context ?? null,
              body,
              reason: "Define surfaces through witnessed proposal"
            });
            sendAuthoringCoreProposalResponse(res, proposal);
            return;
          }
          sendGateFailure(res, auth);
          return;
        }
      }
      const result = requestSurfaceDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witnesses: result.witnesses ?? [], witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, {
        ...(result.single ? { surface: result.surfaces[0], witness: result.witnesses[0] ?? null } : { surfaces: result.surfaces, witnesses: result.witnesses })
      });
    },

    "collection.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "collection.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a collection through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestCollectionDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { collection: result.collection, witness: result.witness });
    },

    "process.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "process.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a process through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestProcessDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { process: result.process, witness: result.witness });
    },

    "type.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "type.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a type through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestTypeDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { type: result.type, witness: result.witness });
    },

    "projection.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "projection.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a projection through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestProjectionDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { projection: result.projection, witness: result.witness });
    },

    "message.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "message.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a message through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestMessageDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { message: result.message, witness: result.witness });
    },

    "boundary.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "boundary.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a boundary through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBoundaryDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { boundary: result.boundary, witness: result.witness });
    },

    "policy.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "policy.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a policy through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPolicyDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { policy: result.policy, witness: result.witness });
    },

    "package.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "package.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define a package through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackageDefine(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { package: result.package, witness: result.witness });
    },

    "computeModule.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "computeModule.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Define an AssemblyScript compute module through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestComputeModuleDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { computeModule: result.computeModule, witness: result.witness });
    },

    "computeModule.source.upsert": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedRevision = requireCoveredAuthoringRefInput(world, body, {
        idField: "revision",
        refField: "revisionRef",
        label: "package revision"
      });
      if (!resolvedRevision.ok) {
        sendJson(res, 400, { error: resolvedRevision.error, witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedRevision.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestComputeModuleSourceUpsert(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { computeModuleSource: result.packageMaterializedFile, witness: result.witness });
    },

    "computeModule.source.markDeleted": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedRevision = requireCoveredAuthoringRefInput(world, body, {
        idField: "revision",
        refField: "revisionRef",
        label: "package revision"
      });
      if (!resolvedRevision.ok) {
        sendJson(res, 400, { error: resolvedRevision.error, witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedRevision.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestComputeModuleSourceMarkDeleted(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { computeModuleSource: result.packageMaterializedFile, witness: result.witness });
    },

    "computeModuleSmokeTest.upsert": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedRevision = requireCoveredAuthoringRefInput(world, body, {
        idField: "revision",
        refField: "revisionRef",
        label: "package revision"
      });
      if (!resolvedRevision.ok) {
        sendJson(res, 400, { error: resolvedRevision.error, witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedRevision.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestComputeModuleSmokeTestUpsert(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, {
        computeModuleSmokeTest: result.computeModuleSmokeTest,
        packageMaterializedFile: result.packageMaterializedFile,
        witnesses: result.witnesses
      });
    },

    "computeModuleSmokeTest.markDeleted": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const smokeId = body && typeof body === "object" && !Array.isArray(body)
        ? String(body.id || "").trim()
        : "";
      const existing = smokeId
        ? (world.project(moduleProjectors.computeModuleSmokeTestIndex).historyById?.[smokeId] ?? null)
        : null;
      if (!existing) {
        sendJson(res, 404, { error: "compute module smoke test not found", witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, existing.revision);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestComputeModuleSmokeTestMarkDeleted(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, {
        computeModuleSmokeTest: result.computeModuleSmokeTest,
        packageMaterializedFile: result.packageMaterializedFile,
        witnesses: result.witnesses
      });
    },

    "computeModuleSmokeTest.run": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = await requestComputeModuleSmokeTestRun(world, { body, appContext });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, code: result.code ?? null });
        return;
      }
      sendJson(res, result.status, result.result);
    },

    "packageRevision.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedPackage = requireCoveredAuthoringRefInput(world, body, {
        idField: "package",
        refField: "packageRef",
        label: "package"
      });
      if (!resolvedPackage.ok) {
        sendJson(res, 400, { error: resolvedPackage.error, witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedPackage.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "packageRevision.define",
            targetKind: "package",
            targetId: resolvedPackage.target,
            body: { ...body, package: resolvedPackage.target, packageRef: null },
            reason: "Define a package revision through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackageRevisionDefine(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { packageRevision: result.packageRevision, witness: result.witness });
    },

    "packageRevision.publish": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const paramRevisionId = typeof params?.id === "string" && params.id.trim()
        ? params.id.trim()
        : "";
      const resolvedRevision = paramRevisionId
        ? { ok: true, target: paramRevisionId }
        : requireCoveredAuthoringRefInput(world, body, {
            idField: "id",
            refField: "idRef",
            label: "package revision"
          });
      if (!resolvedRevision.ok) {
        sendJson(res, 400, { error: resolvedRevision.error, witness: null });
        return;
      }
      const revisionId = resolvedRevision.target;
      const auth = ensureTargetAuthority(gate.actor, revisionId);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "packageRevision.publish",
            targetKind: "packageRevision",
            targetId: revisionId || null,
            body: { ...body, id: revisionId, idRef: null },
            reason: "Publish a package revision through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackageRevisionPublish(world, {
        actor: gate.actor,
        body: { ...body, id: revisionId }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { packageRevision: result.packageRevision, witness: result.witness });
    },

    "packagePatch.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedRevision = requireCoveredAuthoringRefInput(world, body, {
        idField: "revision",
        refField: "revisionRef",
        label: "package revision"
      });
      if (!resolvedRevision.ok) {
        sendJson(res, 400, { error: resolvedRevision.error, witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedRevision.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "packagePatch.define",
            targetKind: "packageRevision",
            targetId: resolvedRevision.target,
            body: { ...body, revision: resolvedRevision.target, revisionRef: null },
            reason: "Define a package patch through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackagePatchDefine(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { packagePatch: result.packagePatch, witness: result.witness });
    },

    "packagePatch.source.upsert": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedRevision = requireCoveredAuthoringRefInput(world, body, {
        idField: "revision",
        refField: "revisionRef",
        label: "package revision"
      });
      if (!resolvedRevision.ok) {
        sendJson(res, 400, { error: resolvedRevision.error, witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedRevision.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "packagePatch.define",
            targetKind: "packageRevision",
            targetId: resolvedRevision.target,
            body: { ...body, revision: resolvedRevision.target, revisionRef: null },
            reason: "Define a source-backed package patch through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackagePatchSourceUpsert(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { packagePatches: result.packagePatches, witnesses: result.witnesses });
    },

    "packageNamespace.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = ensureContextAuthority(gate.actor, context);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "packageNamespace.define",
            targetKind: "context",
            targetId: context,
            body,
            reason: "Bind a package namespace through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackageNamespaceDefine(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { packageNamespace: result.packageNamespace, witness: result.witness });
    },

    "packageDependency.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedSourceRevision = requireCoveredAuthoringRefInput(world, body, {
        idField: "sourceRevision",
        refField: "sourceRevisionRef",
        label: "package source revision"
      });
      if (!resolvedSourceRevision.ok) {
        sendJson(res, 400, { error: resolvedSourceRevision.error, witness: null });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedSourceRevision.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "packageDependency.define",
            targetKind: "packageRevision",
            targetId: resolvedSourceRevision.target,
            body: { ...body, sourceRevision: resolvedSourceRevision.target, sourceRevisionRef: null },
            reason: "Define a package dependency through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackageDependencyDefine(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { packageDependency: result.packageDependency, witness: result.witness });
    },

    "packageTransformer.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedTargetRevision = resolveCoveredAuthoringRefInput(world, body, {
        idField: "targetRevision",
        refField: "targetRevisionRef",
        label: "target package revision"
      });
      const resolvedPackage = requireCoveredAuthoringRefInput(world, body, {
        idField: "package",
        refField: "packageRef",
        label: "package"
      });
      if (!resolvedTargetRevision.ok) {
        sendJson(res, 400, { error: resolvedTargetRevision.error, witness: null });
        return;
      }
      if (!resolvedPackage.ok) {
        sendJson(res, 400, { error: resolvedPackage.error, witness: null });
        return;
      }
      const targetId = resolvedTargetRevision.target ?? resolvedPackage.target;
      const targetKind = resolvedTargetRevision.target
        ? "packageRevision"
        : "package";
      const auth = ensureTargetAuthority(gate.actor, targetId);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "packageTransformer.define",
            targetKind,
            targetId: targetId || null,
            body: {
              ...body,
              ...(resolvedPackage.ok ? { package: resolvedPackage.target, packageRef: null } : {}),
              ...(resolvedTargetRevision.ok ? { targetRevision: resolvedTargetRevision.target, targetRevisionRef: null } : {})
            },
            reason: "Define a package transformer through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestPackageTransformerDefine(world, { actor: gate.actor, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { packageTransformer: result.packageTransformer, witness: result.witness });
    },

    "route.create": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.context ? ensureContextAuthority(gate.actor, body.context) : { ok: true };
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "route.define",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Create a route through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const routeAuthoringSupport = await currentRouteAuthoringSupport(appContext?.runtimeProfile);
      const result = requestBootstrapRouteDefine(world, {
        actor: gate.actor,
        backendHost,
        body,
        allowedHandlers: routeAuthoringSupport.supportedHandlers,
        handlerMetadataById: routeAuthoringSupport.supportedHandlerMetadata
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { route: result.route, witness: result.witness });
    },

    "frontend.upliftLegacy": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const uplift = frontendLegacyUpliftAuthorityTargets(world);
      let denied = null;
      for (const entry of uplift.targets) {
        const auth = ensureTargetAuthority(gate.actor, entry.target);
        if (auth.ok) continue;
        if (auth.status === 403) {
          denied = entry;
          break;
        }
        sendGateFailure(res, auth);
        return;
      }
      if (denied) {
        const proposal = requestAuthoringCoreProposalCreate({
          actor: gate.actor,
          targetProcess: "frontend.upliftLegacy",
          targetKind: denied.targetKind,
          targetId: denied.target,
          body,
          reason: "Uplift legacy frontend routes through witnessed proposal"
        });
        if (!proposal.ok) {
          sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
          return;
        }
        sendJson(res, 202, {
          ok: true,
          status: "proposed",
          proposal: proposal.proposal,
          witness: proposal.witness,
          preview: uplift.preview
        });
        return;
      }
      const result = requestBootstrapFrontendUpliftLegacy(world, {
        actor: gate.actor,
        backendHost
      });
      if (!result.ok) {
        sendJson(res, result.status ?? 400, {
          error: result.error,
          blocked: result.blocked ?? [],
          previewBefore: result.previewBefore ?? uplift.preview,
          previewAfter: result.previewAfter ?? null,
          witness: result.witness ?? null
        });
        return;
      }
      sendJson(res, result.status, {
        ok: true,
        actions: result.actions,
        previewBefore: result.previewBefore,
        previewAfter: result.previewAfter,
        witness: result.witness
      });
    },

    "serve.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.serverRunner
        ? ensureTargetAuthority(gate.actor, body.serverRunner)
        : ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "serve.define",
            targetKind: body.serverRunner ? "serverRunner" : "context",
            targetId: body.serverRunner ?? body.context ?? null,
            body,
            reason: "Create a serve mount through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal);
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapServeDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { servedRoute: result.servedRoute, witness: result.witness });
    },

    "widgets.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.context
        ? ensureContextAuthority(gate.actor, body.context)
        : (body.parent ? ensureTargetAuthority(gate.actor, body.parent) : { ok: true });
      if (!auth.ok) {
        if (auth.status === 403) {
          const reason = body.context
            ? "Create a widget through witnessed proposal"
            : "Create a child widget through witnessed proposal";
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "widget.define",
            targetKind: body.context ? "context" : "widget",
            targetId: body.context ?? body.parent ?? body.id ?? null,
            body,
            reason
          });
          sendAuthoringCoreProposalResponse(res, proposal, "Proposed widget for review.");
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    },

    "widgets.update": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      const widgetBody = body && typeof body === "object" && !Array.isArray(body)
        ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "reason"))
        : {};
      const auth = ensureTargetAuthority(gate.actor, params.id || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "widget.update",
            targetKind: "widget",
            targetId: params.id || "",
            body: { ...widgetBody, id: params.id || "" },
            reason: reason || "Update a widget through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal, "Proposed widget update for review.");
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetUpdate(world, { actor: gate.actor, backendHost, body: { ...widgetBody, id: params.id || "" } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    },

    "widgets.replace": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      const widgetBody = body && typeof body === "object" && !Array.isArray(body)
        ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "reason"))
        : {};
      const auth = ensureTargetAuthority(gate.actor, params.id || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "widget.replace",
            targetKind: "widget",
            targetId: params.id || "",
            body: { ...widgetBody, id: params.id || "" },
            reason: reason || "Replace a widget through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal, "Proposed widget replacement for review.");
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetReplace(world, { actor: gate.actor, backendHost, body: { ...widgetBody, id: params.id || "" } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        widget: result.widget,
        migrationStatus: result.migrationStatus,
        witness: result.witness,
        witnesses: result.witnesses
      });
    },

    "widgets.replace.rollback": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      const auth = ensureTargetAuthority(gate.actor, params.id || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestAuthoringCoreProposalCreate({
            actor: gate.actor,
            targetProcess: "widget.replace.rollback",
            targetKind: "widget",
            targetId: params.id || "",
            body: { id: params.id || "" },
            reason: reason || "Rollback a widget replacement through witnessed proposal"
          });
          sendAuthoringCoreProposalResponse(res, proposal, "Proposed widget replacement rollback for review.");
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetReplaceRollback(world, { actor: gate.actor, backendHost, body: { id: params.id || "" } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        widget: result.widget,
        migrationStatus: result.migrationStatus,
        witness: result.witness,
        witnesses: result.witnesses
      });
    }
  };
}
