import { canCreateInContext, canMutateTarget } from "./kernel.js";

export function createRuntimeAuthorityServices({
  world,
  backendHost,
  currentIdentityIndex
}) {
  const bootstrapAuthAllowed = () => currentIdentityIndex().rows.length === 0;
  const requireBootstrapActor = requestActor => {
    if (requestActor) return { ok: true, actor: requestActor, bootstrapException: false };
    if (bootstrapAuthAllowed()) return { ok: true, actor: backendHost, bootstrapException: true };
    return { ok: false, status: 401, reason: "sign in to edit bootstrap state" };
  };
  const ensureContextAuthority = (actor, contextId) => contextId
    ? canCreateInContext(world, actor, contextId)
    : { ok: true, status: 200, reason: null };
  const ensureTargetAuthority = (actor, targetId) => canMutateTarget(world, actor, targetId);
  const ensureIdentityAuthority = (actor, identityId) => {
    if (!actor) return { ok: false, status: 401, reason: "sign in to edit bootstrap state" };
    const identity = currentIdentityIndex().byId[identityId] ?? null;
    if (!identity) return { ok: false, status: 404, reason: "identity not found" };
    if (identity.actor === actor) return { ok: true, status: 200, reason: null };
    return canMutateTarget(world, actor, identityId);
  };

  return {
    requireBootstrapActor,
    ensureContextAuthority,
    ensureTargetAuthority,
    ensureIdentityAuthority
  };
}

export const createAuthoringAccessServices = createRuntimeAuthorityServices;

export function createAuthoringBundleServices({
  world,
  backendHost,
  currentIdentityIndex,
  supportedHandlerSets,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedFrontendOps,
  supportedBackendOps,
  mcpToolNames,
  createAuthoringProposalExecutor: createAuthoringProposalExecutorImpl = null,
  getRuntimePluginCatalog = async () => ({ packages: [] })
}) {
  const accessServices = createRuntimeAuthorityServices({
    world,
    backendHost,
    currentIdentityIndex
  });
  return {
    ...accessServices,
    executeBootstrapProposal: (createAuthoringProposalExecutorImpl ?? (() => async () => ({
      ok: false,
      status: 503,
      reason: "proposal executor unavailable in active runtime composition"
    })))({
      world,
      backendHost,
      supportedHandlerSets,
      supportedHandlers,
      supportedHandlerMetadata,
      supportedFrontendOps,
      supportedBackendOps,
      ensureIdentityAuthority: accessServices.ensureIdentityAuthority,
      ensureTargetAuthority: accessServices.ensureTargetAuthority,
      ensureContextAuthority: accessServices.ensureContextAuthority,
      mcpToolNames,
      getRuntimePluginCatalog
    })
  };
}
