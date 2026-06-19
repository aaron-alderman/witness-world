import {
  requestBootstrapServerRunnerDefine,
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove,
  resolveRuntimePluginServerRunnerInput
} from "./server-runner-processes.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";
import { resolveAuthoringHandlerSupport } from "../../src/runtime-authoring-handler-support.js";

function proposalPart(value, fallback) {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return normalized || fallback;
}

function runtimePluginProposalId({ actor, process, serverRunner, plugin }) {
  return [
    "proposal",
    proposalPart(process, "runtimePlugin"),
    proposalPart(actor, "actor"),
    proposalPart(serverRunner, "serverRunner"),
    proposalPart(plugin, "plugin")
  ].join(".");
}

function serverRunnerProposalId({ actor, context, id }) {
  return [
    "proposal",
    "serverRunner.define",
    proposalPart(actor, "actor"),
    proposalPart(context, "context"),
    proposalPart(id, "serverRunner")
  ].join(".");
}

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
  const trimmedStringOrEmpty = value => typeof value === "string" ? value.trim() : "";
  const omitProposalMetadata = body => body && typeof body === "object" && !Array.isArray(body)
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "id" && key !== "proposalId" && key !== "reason"))
    : {};
  const currentServerRunnerSupport = async activeProfile => resolveAuthoringHandlerSupport({
    supportedHandlerSets,
    supportedHandlers: [],
    supportedPageHandlers: [],
    supportedHandlerMetadata: {},
    pluginCatalog: await getRuntimePluginCatalog({
      activeProfile: activeProfile ?? runtimeProfile,
      serverRunnerId: null,
      configuredPluginIds: [],
      authoredPluginIds: []
    })
  });
  return {
    "runtimePlugin.install": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const proposalId = trimmedStringOrEmpty(body?.proposalId || body?.id);
      const proposalReason = trimmedStringOrEmpty(body?.reason);
      const mutationBody = omitProposalMetadata(body);
      const resolvedServerRunner = resolveRuntimePluginServerRunnerInput(world, body, {
        label: "server runner"
      });
      if (!resolvedServerRunner.ok) {
        sendJson(res, 400, { error: resolvedServerRunner.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedServerRunner.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestBootstrapProposalCreate(world, {
            actor: gate.actor,
            backendHost,
            body: {
              id: proposalId || runtimePluginProposalId({
                actor: gate.actor,
                process: "runtimePlugin.install",
                serverRunner: resolvedServerRunner.target,
                plugin: mutationBody?.plugin
              }),
              targetProcess: "runtimePlugin.install",
              targetKind: "serverRunner",
              targetId: resolvedServerRunner.target,
              bodyJson: JSON.stringify(mutationBody ?? {}),
              reason: proposalReason || "Install a runtime plugin through witnessed proposal"
            }
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: "Proposed runtime plugin install for review."
          });
          return;
        }
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
        body: { ...mutationBody, serverRunner: resolvedServerRunner.target, serverRunnerRef: null },
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
      const proposalId = trimmedStringOrEmpty(body?.proposalId || body?.id);
      const proposalReason = trimmedStringOrEmpty(body?.reason);
      const mutationBody = omitProposalMetadata(body);
      const resolvedServerRunner = resolveRuntimePluginServerRunnerInput(world, body, {
        label: "server runner"
      });
      if (!resolvedServerRunner.ok) {
        sendJson(res, 400, { error: resolvedServerRunner.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedServerRunner.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestBootstrapProposalCreate(world, {
            actor: gate.actor,
            backendHost,
            body: {
              id: proposalId || runtimePluginProposalId({
                actor: gate.actor,
                process: "runtimePlugin.remove",
                serverRunner: resolvedServerRunner.target,
                plugin: mutationBody?.plugin
              }),
              targetProcess: "runtimePlugin.remove",
              targetKind: "serverRunner",
              targetId: resolvedServerRunner.target,
              bodyJson: JSON.stringify(mutationBody ?? {}),
              reason: proposalReason || "Remove a runtime plugin through witnessed proposal"
            }
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: "Proposed runtime plugin removal for review."
          });
          return;
        }
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
        body: { ...mutationBody, serverRunner: resolvedServerRunner.target, serverRunnerRef: null },
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

    "serverRunner.create": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestBootstrapProposalCreate(world, {
            actor: gate.actor,
            backendHost,
            body: {
              id: serverRunnerProposalId({
                actor: gate.actor,
                context: body?.context,
                id: body?.id
              }),
              targetProcess: "serverRunner.define",
              targetKind: "context",
              targetId: body?.context ?? null,
              bodyJson: JSON.stringify(body ?? {}),
              reason: "Create a shared server runner through witnessed proposal"
            }
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: "Proposed server runner creation for review."
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const serverRunnerSupport = await currentServerRunnerSupport(appContext?.runtimeProfile);
      const result = requestBootstrapServerRunnerDefine(world, {
        actor: gate.actor,
        backendHost,
        body,
        allowedHandlerSets: serverRunnerSupport.supportedHandlerSets
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { serverRunner: result.serverRunner, witness: result.witness });
    }
  };
}
