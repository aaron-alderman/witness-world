import {
  resolveCapabilityTargetInput,
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  requestBootstrapCapabilityRemove
} from "./capability-processes.js";

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
