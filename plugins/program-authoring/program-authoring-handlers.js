import {
  requestBootstrapBackendProgramDefine,
  requestBootstrapBackendProgramVersionDefine,
  requestBootstrapBackendStepDefine,
  requestBootstrapBackendProgramVersionActivate,
  requestBootstrapBackendProgramVersionRollback
} from "./program-processes.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";

export function createProgramAuthoringBundleHandlers({
  world,
  backendHost,
  readJson,
  authoringServices,
  sendGateFailure,
  supportedFrontendOps,
  supportedBackendOps,
  sendJson
}) {
  const {
    requireBootstrapActor,
    ensureTargetAuthority,
    ensureContextAuthority
  } = authoringServices;
  const proposalIdPart = value => String(value || "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "target";
  const nextProgramProposalId = ({ actor, targetProcess, targetId, targetKind }) => [
    "proposal",
    "program",
    proposalIdPart(actor || "guest"),
    proposalIdPart(targetProcess),
    proposalIdPart(targetKind),
    proposalIdPart(targetId || targetProcess)
  ].join(".");
  const requestProgramProposalCreate = ({
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
      id: nextProgramProposalId({ actor, targetProcess, targetId, targetKind }),
      targetProcess,
      targetKind,
      targetId,
      bodyJson: JSON.stringify(body ?? {}),
      reason
    }
  });
  return {
    "backendProgram.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestProgramProposalCreate({
            actor: gate.actor,
            targetProcess: "backendProgram.define",
            targetKind: "context",
            targetId: body.context ?? null,
            body,
            reason: "Create a backend program through witnessed proposal"
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
      const result = requestBootstrapBackendProgramDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgram: result.backendProgram, witness: result.witness });
    },

    "backendProgramVersion.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.soul ?? "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestProgramProposalCreate({
            actor: gate.actor,
            targetProcess: "backendProgramVersion.define",
            targetKind: "backendProgram",
            targetId: body.soul ?? null,
            body,
            reason: "Create a backend program version through witnessed proposal"
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
      const result = requestBootstrapBackendProgramVersionDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        backendProgramVersion: result.backendProgramVersion,
        activationStatus: result.activationStatus,
        migrationStatus: result.migrationStatus,
        witness: result.witness,
        witnesses: result.witnesses
      });
    },

    "backendStep.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.version ?? "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestProgramProposalCreate({
            actor: gate.actor,
            targetProcess: "backendStep.define",
            targetKind: "backendProgramVersion",
            targetId: body.version ?? null,
            body,
            reason: "Add a backend step through witnessed proposal"
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
      const result = requestBootstrapBackendStepDefine(world, { actor: gate.actor, backendHost, body, allowedOps: supportedBackendOps });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendStep: result.backendStep, witness: result.witness });
    },

    "backendProgramVersions.activate": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const soul = typeof params?.soul === "string" ? params.soul : "";
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestProgramProposalCreate({
            actor: gate.actor,
            targetProcess: "backendProgramVersion.activate",
            targetKind: "backendProgram",
            targetId: soul || null,
            body: { ...body, soul },
            reason: "Activate a backend program version through witnessed proposal"
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
      const result = requestBootstrapBackendProgramVersionActivate(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        backendProgramVersion: result.backendProgramVersion,
        rollbackStatus: result.rollbackStatus,
        migrationStatus: result.migrationStatus,
        witness: result.witness,
        witnesses: result.witnesses
      });
    },

    "backendProgramVersions.rollback": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const soul = typeof params?.soul === "string" ? params.soul : "";
      const body = req ? await readJson(req) : {};
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestProgramProposalCreate({
            actor: gate.actor,
            targetProcess: "backendProgramVersion.rollback",
            targetKind: "backendProgram",
            targetId: soul || null,
            body: { ...body, soul },
            reason: "Roll back a backend program version through witnessed proposal"
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
      const result = requestBootstrapBackendProgramVersionRollback(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
    }
  };
}
