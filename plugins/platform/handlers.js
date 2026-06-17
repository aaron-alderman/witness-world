import { relation } from "../../src/kernel.js";
import {
  requestBootstrapProposalApprove,
  requestBootstrapProposalCreate,
  requestBootstrapProposalReject
} from "../proposals/proposal-processes.js";
import {
  abandonPlatformChangeSet,
  createPlatformBranch,
  listPlatformBranches,
  listPlatformChangeSets,
  readPlatformBranch,
  readPlatformChangeSet,
  rejectPlatformChangeSet,
  removePlatformChangeSetEdit,
  createPlatformChangeSet,
  applyPlatformChangeSet,
  stagePlatformChangeSetEdits,
  validatePlatformChangeSet
} from "./change-sets.js";
import { buildPlatformModel, filterPlatformModel } from "./platform-model.js";
import { renderPlatformPage } from "./platform-page.js";
import { buildPlatformProposalCreateBody } from "./platform-proposals.js";

function diagnosticsFromAppContext(appContext) {
  const summary = appContext?.runtimeBundleSummary ?? {};
  const snapshotManager = appContext?.appSnapshotManager ?? null;
  const snapshotDiagnostics = snapshotManager?.diagnostics?.() ?? null;
  const activeSnapshot = snapshotManager?.getActiveSnapshot?.() ?? null;
  const lastRevisionEvent = snapshotManager?.getLastRevisionEvent?.() ?? null;
  const lastGoodSnapshot = snapshotManager?.lastGoodSnapshot ?? activeSnapshot ?? null;
  return {
    activeProfile: appContext?.runtimeProfile ?? summary.profile ?? null,
    activeBundles: (summary.bundles ?? []).map(bundle => ({
      id: bundle.id,
      kind: bundle.kind,
      displayName: bundle.displayName,
      description: bundle.description
    })),
    providedCapabilities: [...(summary.capabilities ?? [])],
    routes: (summary.routes ?? []).map(route => ({ ...route })),
    surfaces: (summary.surfaces ?? appContext?.runtimeSurfaceEntries ?? []).map(surface => ({ ...surface })),
    plugins: {
      activePluginIds: [...(appContext?.activeRuntimePluginIds ?? appContext?.runtimePluginCatalog?.activePluginIds ?? [])],
      effectivePluginIds: [...(appContext?.effectiveRuntimePluginIds ?? appContext?.runtimePluginCatalog?.effectivePluginIds ?? [])],
      rejectedPlugins: [...(appContext?.runtimePluginCatalog?.rejectedPlugins ?? [])]
    },
    appSnapshot: snapshotDiagnostics
      ? {
          ...snapshotDiagnostics,
          lastGoodAppRevision: Number(lastGoodSnapshot?.appRevision || snapshotDiagnostics.appRevision || 0),
          activeSourceIds: Array.isArray(activeSnapshot?.sourceIndex)
            ? activeSnapshot.sourceIndex.map(row => String(row.sourceId || row.filePath || ""))
            : [],
          lastRevisionEvent: lastRevisionEvent
            ? {
                appRevision: Number(lastRevisionEvent.appRevision || 0),
                changedSources: Array.isArray(lastRevisionEvent.changedSources) ? lastRevisionEvent.changedSources.map(String) : [],
                trigger: String(lastRevisionEvent.trigger || "initial")
              }
            : null
        }
      : null
  };
}

async function platformModelFor(appContext) {
  return buildPlatformModel({
    appContext,
    diagnostics: diagnosticsFromAppContext(appContext),
    project: appContext?.project ?? null
  });
}

export function createPlatformHandlers({
  world,
  backendHost,
  frontendHost,
  readJson,
  authoringServices,
  sendGateFailure,
  send,
  sendJson
}) {
  const requireBootstrapActor = authoringServices?.requireBootstrapActor ?? (() => ({ ok: false, status: 503, reason: "bootstrap authoring services are not available" }));
  const executeBootstrapProposal = authoringServices?.executeBootstrapProposal ?? null;
  const requirePlatformMutationActor = (res, requestActor) => {
    const gate = requireBootstrapActor(requestActor);
    if (!gate.ok) {
      if (sendGateFailure) sendGateFailure(res, gate);
      else sendJson(res, gate.status || 403, { error: gate.reason || "platform proposal mutation is not authorized" });
      return null;
    }
    return gate.actor;
  };
  return {
    "platform.model.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const model = await platformModelFor(appContext);
      const view = requestUrl?.searchParams?.get("view") || "model";
      const id = requestUrl?.searchParams?.get("id") || null;
      world.observe({
        process: "backend.readPlatformModel",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "projected", "platformModel")],
        body: { view, nodes: model.nodes.length, gaps: model.gaps.length }
      });
      sendJson(res, 200, filterPlatformModel(model, view, id));
    },

    "platform.gaps.read": async ({ res, requestActor, appContext }) => {
      const model = await platformModelFor(appContext);
      world.observe({
        process: "backend.readPlatformGaps",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "projected", "platformGaps")],
        body: { gaps: model.gaps.length }
      });
      sendJson(res, 200, { gaps: model.gaps, summaries: model.summaries });
    },

    "platform.branch.list": async ({ res }) => {
      sendJson(res, 200, { branches: listPlatformBranches(world) });
    },

    "platform.branch.read": async ({ res, params }) => {
      const result = readPlatformBranch(world, params.id || "");
      if (!result.ok) {
        sendJson(res, result.status || 404, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        changeSets: result.changeSets,
        edits: result.edits,
        candidateSnapshots: result.candidateSnapshots,
        latestCandidateSnapshot: result.latestCandidateSnapshot,
        validationHistory: result.validationHistory
      });
    },

    "platform.branch.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const result = createPlatformBranch(world, {
        actor,
        id: body?.id ?? null,
        title: body?.title ?? null,
        parentBranchId: body?.parentBranchId ?? null,
        epic: body?.epic ?? null,
        feature: body?.feature ?? null,
        defect: body?.defect ?? null,
        session: requestSession ?? null,
        runtimeProfile: appContext?.runtimeProfile ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        witness: result.witness
      });
    },

    "platform.changeSet.list": async ({ res }) => {
      sendJson(res, 200, { changeSets: listPlatformChangeSets(world) });
    },

    "platform.changeSet.read": async ({ res, params }) => {
      const result = readPlatformChangeSet(world, params.id || "");
      if (!result.ok) {
        sendJson(res, result.status || 404, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        branch: result.branch,
        edits: result.edits,
        candidateSnapshots: result.candidateSnapshots,
        latestCandidateSnapshot: result.latestCandidateSnapshot,
        activeCandidateSnapshot: result.activeCandidateSnapshot
      });
    },

    "platform.changeSet.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const result = createPlatformChangeSet(world, {
        actor,
        id: body?.id ?? null,
        branchId: body?.branchId ?? null,
        title: body?.title ?? null,
        reason: body?.reason ?? null,
        session: requestSession ?? null,
        runtimeProfile: appContext?.runtimeProfile ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        changeSet: result.changeSet,
        witness: result.witness
      });
    },

    "platform.changeSet.edit": async ({ req, res, params, requestActor, requestSession }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const edits = Array.isArray(body?.edits)
        ? body.edits
        : (body?.path || body?.content ? [{ path: body.path, content: body.content, previousHash: body.previousHash ?? null }] : []);
      const result = await stagePlatformChangeSetEdits(world, {
        actor,
        changeSetId: params.id || "",
        edits,
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        edits: result.edits,
        staged: result.staged
      });
    },

    "platform.changeSet.removeEdit": async ({ res, params, requestActor, requestSession }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const result = removePlatformChangeSetEdit(world, {
        actor,
        changeSetId: params.id || "",
        pathHash: params.pathHash || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        edits: result.edits,
        witness: result.witness
      });
    },

    "platform.changeSet.validate": async ({ res, params, requestActor, requestSession }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const result = await validatePlatformChangeSet(world, {
        actor,
        changeSetId: params.id || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        candidateSnapshot: result.candidateSnapshot,
        activeCandidateSnapshotId: result.activeCandidateSnapshotId,
        witness: result.witness,
        revisionEvent: result.revisionEvent
      });
    },

    "platform.changeSet.apply": async ({ res, params, requestActor, requestSession }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const result = await applyPlatformChangeSet(world, {
        actor,
        changeSetId: params.id || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, {
          error: result.error,
          ...(Array.isArray(result.details) ? { details: result.details } : {})
        });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        candidateSnapshotId: result.candidateSnapshotId,
        witness: result.witness
      });
    },

    "platform.changeSet.reject": async ({ req, res, params, requestActor, requestSession }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = req ? await readJson(req) : {};
      const result = rejectPlatformChangeSet(world, {
        actor,
        changeSetId: params.id || "",
        session: requestSession ?? null,
        reason: typeof body?.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        witness: result.witness
      });
    },

    "platform.changeSet.abandon": async ({ req, res, params, requestActor, requestSession }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = req ? await readJson(req) : {};
      const result = abandonPlatformChangeSet(world, {
        actor,
        changeSetId: params.id || "",
        session: requestSession ?? null,
        reason: typeof body?.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        witness: result.witness
      });
    },

    "platform.proposal.create": async ({ req, res, requestActor }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const proposalBody = buildPlatformProposalCreateBody(body);
      if (!proposalBody.ok) {
        sendJson(res, proposalBody.status || 400, { error: proposalBody.error });
        return;
      }
      const result = requestBootstrapProposalCreate(world, {
        actor,
        backendHost,
        body: proposalBody.value
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness, platformProposal: proposalBody.value });
    },

    "platform.proposal.approve": async ({ res, params, requestActor }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      if (!executeBootstrapProposal) {
        sendJson(res, 503, { error: "proposal executor is not available" });
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor,
        backendHost,
        proposalId: params.id || "",
        executeTarget: executeBootstrapProposal(actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "platform.proposal.reject": async ({ req, res, params, requestActor }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapProposalReject(world, {
        actor,
        backendHost,
        proposalId: params.id || "",
        reason: typeof body.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "page.platform": async ({ res, requestActor, appContext }) => {
      const model = await platformModelFor(appContext);
      world.observe({
        process: "frontend.renderPlatformPage",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", "platformConsole")],
        body: { nodes: model.nodes.length, gaps: model.gaps.length }
      });
      send(res, 200, "text/html; charset=utf-8", renderPlatformPage(model));
    }
  };
}
