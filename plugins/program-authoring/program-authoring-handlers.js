import {
  requestBootstrapFrontendProgramDefine,
  requestBootstrapFrontendStepDefine,
  requestBootstrapBackendProgramDefine,
  requestBootstrapBackendProgramVersionDefine,
  requestBootstrapBackendStepDefine,
  requestBootstrapBackendProgramVersionActivate,
  requestBootstrapBackendProgramVersionRollback
} from "./program-processes.js";

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
  return {
    "frontendProgram.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapFrontendProgramDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { frontendProgram: result.frontendProgram, witness: result.witness });
    },

    "frontendStep.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.program ?? "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapFrontendStepDefine(world, { actor: gate.actor, backendHost, body, allowedOps: supportedFrontendOps });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { frontendStep: result.frontendStep, witness: result.witness });
    },

    "backendProgram.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
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
      const auth = ensureTargetAuthority(gate.actor, body.program ?? "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendProgramVersionDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
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
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapBackendProgramVersionActivate(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
    },

    "backendProgramVersions.rollback": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const soul = typeof params?.soul === "string" ? params.soul : "";
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapBackendProgramVersionRollback(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
    }
  };
}
