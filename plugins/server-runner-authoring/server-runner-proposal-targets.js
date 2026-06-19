import {
  requestBootstrapServerRunnerDefine,
  requestBootstrapServerRunnerRuntimeProfileSet,
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove,
  requestBootstrapRuntimePluginReconcile,
  resolveRuntimePluginServerRunnerInput
} from "./server-runner-processes.js";
import { resolveAuthoringHandlerSupport } from "../../src/runtime-authoring-handler-support.js";

export async function executeServerRunnerAuthoringProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  runtimeProfile,
  supportedHandlerSets,
  ensureContextAuthority,
  ensureTargetAuthority,
  getRuntimePluginCatalog
}) {
  switch (proposal.targetProcess) {
    case "serverRunner.define": {
      const gate = ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const serverRunnerSupport = await resolveAuthoringHandlerSupport({
        supportedHandlerSets,
        supportedHandlers: [],
        supportedPageHandlers: [],
        supportedHandlerMetadata: {},
        pluginCatalog: await getRuntimePluginCatalog({
          activeProfile: body.runtimeProfile ?? runtimeProfile ?? null,
          serverRunnerId: null,
          configuredPluginIds: [],
          authoredPluginIds: []
        })
      });
      const result = requestBootstrapServerRunnerDefine(world, {
        actor,
        backendHost,
        body,
        allowedHandlerSets: serverRunnerSupport.supportedHandlerSets
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "serverRunner.runtimeProfile.set": {
      const resolvedServerRunner = resolveRuntimePluginServerRunnerInput(world, body, {
        label: "server runner"
      });
      if (!resolvedServerRunner.ok) return { ok: false, status: 400, error: resolvedServerRunner.error };
      const gate = ensureTargetAuthority(actor, resolvedServerRunner.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapServerRunnerRuntimeProfileSet(world, {
        actor,
        backendHost,
        body: { ...body, serverRunner: resolvedServerRunner.target, serverRunnerRef: null }
      });
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
    case "runtimePlugin.reconcile": {
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
      const result = requestBootstrapRuntimePluginReconcile(world, {
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
