import {
  requestBootstrapAppBoundaryEstablish,
  resolveBootstrapAppBoundaryAuthorityScope
} from "./bootstrap-app-boundary.js";

export async function executeBootstrapProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  supportedHandlerSets,
  supportedHandlers,
  supportedHandlerMetadata = {},
  runtimeBundleSummary = null,
  runtimeProfile = "full",
  ensureContextAuthority,
  ensureTargetAuthority,
  getRuntimePluginCatalog
}) {
  switch (proposal.targetProcess) {
    case "bootstrap.appBoundary.establish": {
      const authorityScope = resolveBootstrapAppBoundaryAuthorityScope(world);
      const gate = authorityScope.targetKind === "serverRunner" && authorityScope.targetId
        ? ensureTargetAuthority(actor, authorityScope.targetId)
        : (authorityScope.targetKind === "context" && authorityScope.targetId
          ? ensureContextAuthority(actor, authorityScope.targetId)
          : { ok: true });
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = await requestBootstrapAppBoundaryEstablish(world, {
        actor,
        backendHost,
        supportedHandlerSets,
        supportedHandlers,
        supportedHandlerMetadata,
        bootstrapModel: body?.bootstrapModel ?? null,
        runtimeBundleSummary,
        runtimeProfile,
        getRuntimePluginCatalog,
        appContext: {
          runtimeStartupMode: "serve"
        }
      });
      return result.ok
        ? { ok: true, witnessIds: [result.witness?.id].filter(Boolean) }
        : result;
    }
    default:
      return null;
  }
}
