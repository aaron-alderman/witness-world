import { relation } from "../../src/kernel.js";

export function createRuntimeConfigHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget
}) {
  return {
    "runtimeConfig.read": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["runtime.config"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "runtimeConfig.read.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const fields = appContext?.runtimeConfigFields ?? [];
      world.observe({
        process: "runtimeConfig.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:runtimeConfig`)],
        body: {
          serverRunner: serverRunnerId,
          fieldCount: fields.length,
          resolvedCount: fields.filter(field => field.resolved === true).length
        }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        values: Object.fromEntries(
          fields
            .filter(field => field.exposed === true && field.resolved === true && field.secret !== true)
            .map(field => [field.name, field.value])
        ),
        fields
      });
    }
  };
}
