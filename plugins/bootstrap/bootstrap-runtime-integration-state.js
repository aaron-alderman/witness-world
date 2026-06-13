export function renderBootstrapRuntimeIntegrationStateFactory() {
  return String.raw`
    const buildBootstrapMcpScopeSummary = ${buildBootstrapMcpScopeSummary.toString()};
    const buildBootstrapRuntimeIntegrationState = ${buildBootstrapRuntimeIntegrationState.toString()};
  `;
}

export function buildBootstrapMcpScopeSummary(install = null) {
  const scopes = [];
  if ((install?.scopeContexts || []).length) scopes.push("contexts: " + install.scopeContexts.join(", "));
  if ((install?.scopeTargets || []).length) scopes.push("targets: " + install.scopeTargets.join(", "));
  return scopes.length ? scopes.join(" / ") : "unscoped";
}

export function buildBootstrapRuntimeIntegrationState({
  authored = {},
  model = {}
} = {}) {
  const mcpServers = authored?.mcp?.servers || [];
  const supportedMcpTools = model?.supportedMcpTools || [];
  const runtimePluginAvailability = authored?.runtimePluginAvailability || [];

  const mcpServerRow = serverId => mcpServers.find(row => row.id === serverId) || null;
  const mcpInstalledToolsForServer = serverId => mcpServerRow(serverId)?.tools || [];
  const mcpSupportedToolRow = toolName => supportedMcpTools.find(row => row.name === toolName) || null;
  const runtimePluginAvailabilityForRunner = serverRunnerId => runtimePluginAvailability
    .filter(row => row.serverRunner === serverRunnerId);
  const runtimePluginAvailabilityRow = (serverRunnerId, pluginId) => runtimePluginAvailabilityForRunner(serverRunnerId)
    .find(row => row.plugin === pluginId) || null;
  const resolveServerRunner = serverId => mcpServerRow(serverId)?.serverRunner || serverId;

  return {
    mcpServerRow,
    mcpInstalledToolsForServer,
    mcpSupportedTools: () => supportedMcpTools,
    mcpSupportedToolRow,
    mcpScopeSummary: install => buildBootstrapMcpScopeSummary(install),
    runtimePluginAvailabilityForRunner,
    runtimePluginAvailabilityRow,
    resolveServerRunner
  };
}
