import {
  requestBootstrapServerRunnerDefine,
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove,
  resolveRuntimePluginServerRunnerInput
} from "./server-runner-processes.js";

export async function executeServerRunnerAuthoringProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  supportedHandlerSets,
  ensureContextAuthority,
  ensureTargetAuthority,
  getRuntimePluginCatalog
}) {
  switch (proposal.targetProcess) {
    case "serverRunner.define": {
      const gate = ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapServerRunnerDefine(world, { actor, backendHost, body, allowedHandlerSets: supportedHandlerSets });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "runtimePlugin.install": {
      const resolvedServerRunner = resolveRuntimePluginServerRunnerInput(world, body, {
        label: "server runner"
      });
      if (!resolvedServerRunner.ok) return { ok: false, status: 400, error: resolvedServerRunner.error };
      const gate = ensureTargetAuthority(actor, resolvedServerRunner.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const pluginCatalog = await getRuntimePluginCatalog({
        activeProfile: body.runtimeProfile ?? null,
        serverRunnerId: resolvedServerRunner.target ?? null
      });
      const result = requestBootstrapRuntimePluginInstall(world, {
        actor,
        backendHost,
        body: { ...body, serverRunner: resolvedServerRunner.target, serverRunnerRef: null },
        pluginCatalog
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "runtimePlugin.remove": {
      const resolvedServerRunner = resolveRuntimePluginServerRunnerInput(world, body, {
        label: "server runner"
      });
      if (!resolvedServerRunner.ok) return { ok: false, status: 400, error: resolvedServerRunner.error };
      const gate = ensureTargetAuthority(actor, resolvedServerRunner.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const pluginCatalog = await getRuntimePluginCatalog({
        activeProfile: body.runtimeProfile ?? null,
        serverRunnerId: resolvedServerRunner.target ?? null
      });
      const result = requestBootstrapRuntimePluginRemove(world, {
        actor,
        backendHost,
        body: { ...body, serverRunner: resolvedServerRunner.target, serverRunnerRef: null },
        pluginCatalog
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    default:
      return null;
  }
}
