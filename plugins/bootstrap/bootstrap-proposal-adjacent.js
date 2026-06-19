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
    serverRunner,
    plugin,
    reason: reason || ""
  };
}

export function mcpServerProposalBody({ id, serverId, label, serverRunner, context, serviceIdentity, transportsJson, reason }) {
  const body = {
    proposalId: id,
    id: serverId,
    label: label || serverId,
    serverRunner,
    transportsJson: transportsJson || '["stdio","http"]'
  };
  if (context) body.context = context;
  if (serviceIdentity) body.serviceIdentity = serviceIdentity;
  return {
    id,
    ...body,
    reason: reason || ""
  };
}

export function mcpToolProposalBody({ id, server, serverRunner, tool, actingMode, scopeContextsJson, scopeTargetsJson, reason }, action) {
  const body = {
    id,
    server,
    tool,
    reason: reason || ""
  };
  if (action === "install") {
    body.actingMode = actingMode || "delegated";
    body.scopeContextsJson = scopeContextsJson || "[]";
    body.scopeTargetsJson = scopeTargetsJson || "[]";
  }
  return body;
}
