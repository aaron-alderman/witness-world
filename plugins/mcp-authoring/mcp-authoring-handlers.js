import {
  requestBootstrapMcpServerDefine,
  requestBootstrapMcpToolInstall,
  requestBootstrapMcpToolRemove,
  resolveMcpServerInput,
  resolveMcpServerRunnerInput
} from "./mcp-processes.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";

function proposalPart(value, fallback) {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return normalized || fallback;
}

function mcpProposalId({ actor, process, target, extra = null }) {
  return [
    "proposal",
    proposalPart(process, "mcp"),
    proposalPart(actor, "actor"),
    proposalPart(target, "target"),
    proposalPart(extra, "change")
  ].join(".");
}

export function createMcpAuthoringBundleHandlers({
  world,
  backendHost,
  readJson,
  authoringServices,
  sendGateFailure,
  sendJson,
  mcpToolNames
}) {
  const {
    requireBootstrapActor,
    ensureTargetAuthority,
    ensureContextAuthority
  } = authoringServices;
  return {
    "mcpServer.create": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedServerRunner = resolveMcpServerRunnerInput(world, body, {
        contextField: "context",
        idField: "serverRunner",
        refField: "serverRunnerRef",
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
              id: mcpProposalId({
                actor: gate.actor,
                process: "mcpServer.define",
                target: resolvedServerRunner.target,
                extra: body?.id
              }),
              targetProcess: "mcpServer.define",
              targetKind: "serverRunner",
              targetId: resolvedServerRunner.target,
              bodyJson: JSON.stringify(body ?? {}),
              reason: "Create an MCP server through witnessed proposal"
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
            statusMessage: "Proposed MCP server creation for review."
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpServerDefine(world, { actor: gate.actor, backendHost, body, appContext });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpServer: result.mcpServer, witness: result.witness });
    },

    "mcpTool.install": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedServer = resolveMcpServerInput(world, body, {
        label: "mcp server"
      });
      if (!resolvedServer.ok) {
        sendJson(res, 400, { error: resolvedServer.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedServer.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestBootstrapProposalCreate(world, {
            actor: gate.actor,
            backendHost,
            body: {
              id: mcpProposalId({
                actor: gate.actor,
                process: "mcpTool.install",
                target: resolvedServer.target,
                extra: body?.tool
              }),
              targetProcess: "mcpTool.install",
              targetKind: "mcpServer",
              targetId: resolvedServer.target,
              bodyJson: JSON.stringify(body ?? {}),
              reason: "Install an MCP tool through witnessed proposal"
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
            statusMessage: "Proposed MCP tool install for review."
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolInstall(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, server: resolvedServer.target, serverRef: null },
        allowedTools: mcpToolNames(),
        appContext
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
    },

    "mcpTool.remove": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const resolvedServer = resolveMcpServerInput(world, body, {
        label: "mcp server"
      });
      if (!resolvedServer.ok) {
        sendJson(res, 400, { error: resolvedServer.error });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, resolvedServer.target);
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestBootstrapProposalCreate(world, {
            actor: gate.actor,
            backendHost,
            body: {
              id: mcpProposalId({
                actor: gate.actor,
                process: "mcpTool.remove",
                target: resolvedServer.target,
                extra: body?.tool
              }),
              targetProcess: "mcpTool.remove",
              targetKind: "mcpServer",
              targetId: resolvedServer.target,
              bodyJson: JSON.stringify(body ?? {}),
              reason: "Remove an MCP tool through witnessed proposal"
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
            statusMessage: "Proposed MCP tool removal for review."
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolRemove(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, server: resolvedServer.target, serverRef: null },
        appContext
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
    }
  };
}
