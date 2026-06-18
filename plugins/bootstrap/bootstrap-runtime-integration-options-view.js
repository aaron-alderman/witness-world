export function renderBootstrapRuntimeIntegrationOptionsViewFactory() {
  return String.raw`
    const runtimePluginOptionLabel = ${runtimePluginOptionLabel.toString()};
    const buildMcpScopeSummary = ${buildMcpScopeSummary.toString()};
    const buildServerRunnerOptions = ${buildServerRunnerOptions.toString()};
    const buildMcpServerOptions = ${buildMcpServerOptions.toString()};
    const buildRuntimePluginInstallOptions = ${buildRuntimePluginInstallOptions.toString()};
    const buildRuntimePluginRemoveOptions = ${buildRuntimePluginRemoveOptions.toString()};
    const buildMcpToolInstallOptions = ${buildMcpToolInstallOptions.toString()};
    const buildMcpToolRemoveOptions = ${buildMcpToolRemoveOptions.toString()};
  `;
}

export function buildServerRunnerOptions(serverRunners = []) {
  return (serverRunners || []).map(row => ({
    value: row.id,
    label: row.id
  }));
}

export function buildMcpServerOptions(mcpServers = []) {
  return (mcpServers || []).map(row => {
    const transports = (row.transports || []).length ? "[" + row.transports.join(", ") + "]" : "[no transport]";
    return {
      value: row.id,
      label: row.id + " @" + (row.serverRunner || "no runner") + " " + transports
    };
  });
}

export function buildRuntimePluginInstallOptions({
  serverRunnerId = "",
  availabilityRows = []
} = {}) {
  return (serverRunnerId ? (availabilityRows || []) : []).map(row => ({
    value: row.plugin,
    label: runtimePluginOptionLabel(row)
  }));
}

export function buildRuntimePluginRemoveOptions({
  serverRunnerId = "",
  availabilityRows = []
} = {}) {
  return (serverRunnerId ? (availabilityRows || []).filter(row => row.installed || row.missingPackage) : []).map(row => ({
    value: row.plugin,
    label: runtimePluginOptionLabel(row)
  }));
}

export function buildMcpToolInstallOptions({
  serverId = "",
  supportedTools = [],
  installedTools = []
} = {}) {
  if (!serverId) return [];
  const installed = new Set((installedTools || []).map(row => row.tool));
  return (supportedTools || [])
    .filter(row => !installed.has(row.name))
    .map(row => ({
      value: row.name,
      label: row.title ? row.name + " [" + row.title + "]" : row.name
    }));
}

export function buildMcpToolRemoveOptions({
  serverId = "",
  installedTools = [],
  supportedTools = []
} = {}) {
  if (!serverId) return [];
  const supportedByName = new Map((supportedTools || []).map(row => [row.name, row]));
  return (installedTools || []).map(row => {
    const definition = supportedByName.get(row.tool);
    const title = definition?.title ? " [" + definition.title + "]" : "";
    const scopeSummary = buildMcpScopeSummary(row);
    return {
      value: row.tool,
      label: row.tool + title + " {" + row.actingMode + ", " + scopeSummary + "}"
    };
  });
}

function runtimePluginOptionLabel(row) {
  const badges = [];
  if (row.installed) badges.push("installed");
  else if (row.installable) badges.push("installable");
  else badges.push("blocked");
  if (!row.executable) badges.push("metadata-only");
  if (!row.compatible) badges.push("incompatible");
  if ((row.missingDependencies || []).length) badges.push("missing deps");
  return row.plugin + (row.version ? " [" + row.version + "]" : "") + " {" + badges.join(", ") + "}";
}

function buildMcpScopeSummary(install) {
  const scopes = [];
  if ((install?.scopeContexts || []).length) scopes.push("contexts: " + install.scopeContexts.join(", "));
  if ((install?.scopeTargets || []).length) scopes.push("targets: " + install.scopeTargets.join(", "));
  return scopes.length ? scopes.join(" / ") : "unscoped";
}
