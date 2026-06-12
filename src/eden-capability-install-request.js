import { requestBootstrapCapabilityInstall } from "./bootstrap-authoring.js";
import { projectEdenCapabilityInstallState } from "./eden-capability-install.js";

const DEFAULT_SURFACE_ID = "eden.surface.world";

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function requestEdenCapabilityInstall(world, {
  actor,
  backendHost,
  surfaceId = DEFAULT_SURFACE_ID,
  target = "frontend",
  targetKind = "context",
  targetLabel = null,
  recommendedCapabilities = [],
  body
} = {}) {
  const normalizedSurfaceId = stringOrNull(surfaceId) ?? DEFAULT_SURFACE_ID;
  const normalizedTarget = stringOrNull(target) ?? "frontend";
  const normalizedTargetKind = stringOrNull(targetKind) ?? "context";
  const capability = stringOrNull(body?.capability);
  if (!actor) {
    const witness = world.emit({
      process: "edenCapabilityInstall.failed",
      actor: backendHost,
      claims: [],
      body: { reason: "sign in first", surfaceId: normalizedSurfaceId, target: normalizedTarget, targetKind: normalizedTargetKind, capability }
    });
    return { ok: false, status: 401, error: "sign in first", witness };
  }
  if (!capability) {
    const witness = world.emit({
      process: "edenCapabilityInstall.failed",
      actor,
      claims: [],
      body: { reason: "capability is required", surfaceId: normalizedSurfaceId, target: normalizedTarget, targetKind: normalizedTargetKind, capability: null }
    });
    return { ok: false, status: 400, error: "capability is required", witness };
  }
  const result = requestBootstrapCapabilityInstall(world, {
    actor,
    backendHost,
    body: {
      capability,
      target: normalizedTarget,
      targetKind: normalizedTargetKind
    }
  });
  const capabilityState = projectEdenCapabilityInstallState(world.allWitnesses(), {
    actor,
    surfaceId: normalizedSurfaceId,
    target: normalizedTarget,
    targetKind: normalizedTargetKind,
    targetLabel,
    recommendedCapabilities
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
      witness: result.witness,
      capabilityState
    };
  }
  return {
    ok: true,
    status: result.status,
    witness: result.witness,
    capabilityInstall: result.capabilityInstall,
    capabilityState
  };
}
