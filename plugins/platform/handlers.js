import { relation } from "../../src/kernel.js";
import {
  requestBootstrapProposalApprove,
  requestBootstrapProposalCreate,
  requestBootstrapProposalReject
} from "../proposals/proposal-processes.js";
import { buildPlatformModel, filterPlatformModel } from "./platform-model.js";
import { renderPlatformPage } from "./platform-page.js";
import { buildPlatformProposalCreateBody } from "./platform-proposals.js";

function diagnosticsFromAppContext(appContext) {
  const summary = appContext?.runtimeBundleSummary ?? {};
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
    }
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
