export function renderBootstrapProposalAdjacentFactory() {
  return String.raw`
    const runtimePluginProposalBody = ${runtimePluginProposalBody.toString()};
    const mcpServerProposalBody = ${mcpServerProposalBody.toString()};
    const mcpToolProposalBody = ${mcpToolProposalBody.toString()};
  `;
}

export function runtimePluginProposalBody({ id, serverRunner, plugin, reason }, action) {
  return {
    id,
    targetProcess: "runtimePlugin." + action,
    targetKind: "serverRunner",
    targetId: serverRunner,
    bodyJson: JSON.stringify({ serverRunner, plugin }),
    reason: reason || ""
  };
}

export function mcpServerProposalBody({ id, serverId, label, serverRunner, context, serviceIdentity, transportsJson, reason }) {
  const body = {
    id: serverId,
    label: label || serverId,
    serverRunner,
    transportsJson: transportsJson || '["stdio","http"]'
  };
  if (context) body.context = context;
  if (serviceIdentity) body.serviceIdentity = serviceIdentity;
  return {
    id,
    targetProcess: "mcpServer.define",
    targetKind: "serverRunner",
    targetId: serverRunner,
    bodyJson: JSON.stringify(body),
    reason: reason || ""
  };
}

export function mcpToolProposalBody({ id, server, serverRunner, tool, actingMode, scopeContextsJson, scopeTargetsJson, reason }, action) {
  return {
    id,
    targetProcess: "mcpTool." + action,
    targetKind: "serverRunner",
    targetId: serverRunner || server,
    bodyJson: JSON.stringify({
      server,
      tool,
      actingMode: actingMode || "delegated",
      scopeContextsJson: scopeContextsJson || "[]",
      scopeTargetsJson: scopeTargetsJson || "[]"
    }),
    reason: reason || ""
  };
}
