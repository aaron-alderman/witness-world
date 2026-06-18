import {
  resolveCapabilityTargetInput,
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  requestBootstrapCapabilityRemove
} from "./capability-processes.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";

export function createCapabilityAuthoringBundleHandlers({
  world,
  backendHost,
  readJson,
  authoringServices,
  sendGateFailure,
  sendJson
}) {
  const {
    requireBootstrapActor,
    ensureContextAuthority,
    ensureTargetAuthority
  } = authoringServices;
  const proposalIdPart = value => String(value || "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "target";
  const nextCapabilityProposalId = ({ actor, targetProcess, targetId, targetKind }) => [
    "proposal",
    "capability",
    proposalIdPart(actor || "guest"),
    proposalIdPart(targetProcess),
    proposalIdPart(targetKind),
    proposalIdPart(targetId || targetProcess)
  ].join(".");
  const requestCapabilityProposalCreate = ({
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
      id: nextCapabilityProposalId({ actor, targetProcess, targetId, targetKind }),
      targetProcess,
      targetKind,
      targetId,
      bodyJson: JSON.stringify(body ?? {}),
      reason
    }
  });
  return {
    "capability.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestCapabilityProposalCreate({
            actor: gate.actor,
            targetProcess: "capability.define",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Define a capability through witnessed proposal"
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capability: result.capability, witness: result.witness });
    },

    "capability.install": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedTarget = resolveCapabilityTargetInput(world, body, {
        label: "capability install target"
      });
      if (!resolvedTarget.ok) {
        sendJson(res, 400, { error: resolvedTarget.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedTarget.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestCapabilityProposalCreate({
            actor: gate.actor,
            targetProcess: "capability.install",
            targetKind: body.targetKind ?? null,
            targetId: resolvedTarget.target,
            body: { ...body, target: resolvedTarget.target, targetRef: null },
            reason: "Install a capability through witnessed proposal"
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityInstall(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    },

    "capability.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedTarget = resolveCapabilityTargetInput(world, body, {
        label: "capability remove target"
      });
      if (!resolvedTarget.ok) {
        sendJson(res, 400, { error: resolvedTarget.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedTarget.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestCapabilityProposalCreate({
            actor: gate.actor,
            targetProcess: "capability.remove",
            targetKind: body.targetKind ?? null,
            targetId: resolvedTarget.target,
            body: { ...body, target: resolvedTarget.target, targetRef: null },
            reason: "Remove a capability through witnessed proposal"
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityRemove(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    }
  };
}
