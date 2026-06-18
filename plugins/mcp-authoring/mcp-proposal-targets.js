import {
  requestBootstrapMcpServerDefine,
  requestBootstrapMcpToolInstall,
  requestBootstrapMcpToolRemove,
  resolveMcpServerInput
} from "./mcp-processes.js";

export function executeMcpAuthoringProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  mcpToolNames,
  ensureContextAuthority,
  ensureTargetAuthority
}) {
  switch (proposal.targetProcess) {
    case "mcpServer.define": {
      const gate = body.serverRunner
        ? ensureTargetAuthority(actor, body.serverRunner)
        : ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapMcpServerDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "mcpTool.install": {
      const resolvedServer = resolveMcpServerInput(world, body, {
        label: "mcp server"
      });
      if (!resolvedServer.ok) return { ok: false, status: 400, error: resolvedServer.error };
      const gate = ensureTargetAuthority(actor, resolvedServer.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapMcpToolInstall(world, {
        actor,
        backendHost,
        body: { ...body, server: resolvedServer.target, serverRef: null },
        allowedTools: mcpToolNames()
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "mcpTool.remove": {
      const resolvedServer = resolveMcpServerInput(world, body, {
        label: "mcp server"
      });
      if (!resolvedServer.ok) return { ok: false, status: 400, error: resolvedServer.error };
      const gate = ensureTargetAuthority(actor, resolvedServer.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapMcpToolRemove(world, {
        actor,
        backendHost,
        body: { ...body, server: resolvedServer.target, serverRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    default:
      return null;
  }
}
