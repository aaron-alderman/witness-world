import { requestBootstrapCapabilityInstall } from "../capability-authoring/capability-processes.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";
import { projectEdenCapabilityInstallState } from "./eden-capability-install.js";

const DEFAULT_SURFACE_ID = "eden.surface.world";

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nextEdenCapabilityInstallProposalId(actor, target, capability) {
  const actorPart = String(actor || "guest").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const targetPart = String(target || "capability-target").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const capabilityPart = String(capability || "capability").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return ["proposal", "eden", actorPart, "capability.install", targetPart, capabilityPart].filter(Boolean).join(".");
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
    if (result.status === 403) {
      const targetLabelText = stringOrNull(targetLabel) ?? normalizedTarget;
      const proposal = requestBootstrapProposalCreate(world, {
        actor,
        backendHost,
        body: {
          id: nextEdenCapabilityInstallProposalId(actor, normalizedTarget, capability),
          targetProcess: "capability.install",
          targetKind: normalizedTargetKind,
          targetId: normalizedTarget,
          bodyJson: JSON.stringify({
            capability,
            target: normalizedTarget,
            targetKind: normalizedTargetKind
          }),
          reason: "Install " + capability + " on " + targetLabelText + " through proposal review"
        }
      });
      if (!proposal.ok) {
        return {
          ok: false,
          status: proposal.status || 400,
          error: proposal.error,
          witness: proposal.witness,
          capabilityState
        };
      }
      return {
        ok: true,
        status: 202,
        proposal: proposal.proposal,
        witness: proposal.witness,
        capabilityState
      };
    }
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
