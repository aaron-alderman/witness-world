import {
  requestBootstrapProposalCreate,
  requestBootstrapProposalApprove,
  requestBootstrapProposalReject
} from "./proposal-processes.js";

export function createProposalBundleHandlers({
  world,
  backendHost,
  readJson,
  authoringServices,
  sendGateFailure,
  sendJson
}) {
  const {
    requireBootstrapActor,
    executeBootstrapProposal
  } = authoringServices;
  return {
    "proposal.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapProposalCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.approve": async ({ res, params, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        executeTarget: executeBootstrapProposal(gate.actor),
        executionContext: { appContext }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.reject": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapProposalReject(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        reason: typeof body.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    }
  };
}
