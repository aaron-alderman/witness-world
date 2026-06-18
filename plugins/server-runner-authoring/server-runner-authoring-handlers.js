import {
  requestBootstrapServerRunnerDefine,
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove,
  resolveRuntimePluginServerRunnerInput
} from "./server-runner-processes.js";

export function createServerRunnerAuthoringBundleHandlers({
  world,
  backendHost,
  runtimeProfile,
  readJson,
  authoringServices,
  sendGateFailure,
  sendJson,
  supportedHandlerSets,
  getRuntimePluginCatalog
}) {
  const {
    requireBootstrapActor,
    ensureTargetAuthority,
    ensureContextAuthority
  } = authoringServices;
  return {
    "runtimePlugin.install": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedServerRunner = resolveRuntimePluginServerRunnerInput(world, body, {
        label: "server runner"
      });
      if (!resolvedServerRunner.ok) {
        sendJson(res, 400, { error: resolvedServerRunner.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedServerRunner.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const pluginCatalog = await getRuntimePluginCatalog({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: resolvedServerRunner.target ?? null
      });
      const result = requestBootstrapRuntimePluginInstall(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, serverRunner: resolvedServerRunner.target, serverRunnerRef: null },
        pluginCatalog
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        runtimePluginInstall: result.runtimePluginInstall,
        runtimePluginInstalls: result.runtimePluginInstalls,
        witness: result.witness
      });
    },

    "runtimePlugin.remove": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedServerRunner = resolveRuntimePluginServerRunnerInput(world, body, {
        label: "server runner"
      });
      if (!resolvedServerRunner.ok) {
        sendJson(res, 400, { error: resolvedServerRunner.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedServerRunner.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const pluginCatalog = await getRuntimePluginCatalog({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: resolvedServerRunner.target ?? null
      });
      const result = requestBootstrapRuntimePluginRemove(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, serverRunner: resolvedServerRunner.target, serverRunnerRef: null },
        pluginCatalog
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        runtimePluginInstall: result.runtimePluginInstall,
        runtimePluginInstalls: result.runtimePluginInstalls,
        witness: result.witness
      });
    },

    "serverRunner.create": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapServerRunnerDefine(world, {
        actor: gate.actor,
        backendHost,
        body,
        allowedHandlerSets: supportedHandlerSets
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { serverRunner: result.serverRunner, witness: result.witness });
    }
  };
}
