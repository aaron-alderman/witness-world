export function renderBootstrapProposalAdjacentControlsViewFactory() {
  return String.raw`
    const buildBootstrapProposalAdjacentControlsView = ${buildBootstrapProposalAdjacentControlsView.toString()};
    const applyBootstrapProposalAdjacentControlsView = ${applyBootstrapProposalAdjacentControlsView.toString()};
  `;
}

export function buildBootstrapProposalAdjacentControlsView({
  family = null,
  existingView = {},
  authored = {},
  runtimeProfile = "full",
  supportedMcpActingModes = [],
  readSelectValue = () => "",
  readFieldValue = () => "",
  buildServerRunnerOptions = () => [],
  buildMcpServerOptions = () => [],
  buildRuntimePluginInstallOptions = () => [],
  buildRuntimePluginRemoveOptions = () => [],
  buildRuntimePluginControlView = () => ({ helpText: "", submitDisabled: true }),
  buildMcpServerControlView = () => ({ helpText: "", submitDisabled: true }),
  buildMcpToolInstallOptions = () => [],
  buildMcpToolRemoveOptions = () => [],
  buildMcpToolInstallControlView = () => ({ helpText: "", submitDisabled: true }),
  buildMcpToolRemoveControlView = () => ({ helpText: "", submitDisabled: true }),
  runtimePluginAvailabilityForRunner = () => [],
  runtimePluginAvailabilityRow = () => null,
  parseJsonArrayInputFn = () => ({ ok: true, value: [] }),
  mcpSupportedTools = () => [],
  mcpInstalledToolsForServer = () => [],
  mcpServerRow = () => null,
  mcpSupportedToolRow = () => null,
  mcpScopeSummary = () => "unscoped"
} = {}) {
  const proposalAdjacentView = family ? { ...(existingView || {}) } : {};
  const firstMatchingValue = (options, currentValue) =>
    (options || []).some(option => option.value === currentValue) ? currentValue : (options?.[0]?.value || "");
  const contextOptions = (authored.contexts || []).map(row => ({ value: row.id, label: row.id }));
  const runnerOptions = buildServerRunnerOptions(authored.serverRunners || []);
  const serverOptions = buildMcpServerOptions(authored.mcpServers || []);
  const actingModeOptions = (supportedMcpActingModes || []).map(value => ({ value, label: value }));

  if (!family || family === "runtime-plugin-install") {
    const selectedRunnerId = firstMatchingValue(runnerOptions, readSelectValue("runtime-plugin-install-proposal-runner"));
    const pluginOptions = buildRuntimePluginInstallOptions({
      serverRunnerId: selectedRunnerId,
      availabilityRows: runtimePluginAvailabilityForRunner(selectedRunnerId)
    });
    const selectedPluginId = firstMatchingValue(pluginOptions, readSelectValue("runtime-plugin-install-proposal-plugin"));
    const runtimePluginInstallView = buildRuntimePluginControlView({
      row: runtimePluginAvailabilityRow(selectedRunnerId, selectedPluginId),
      profile: runtimeProfile
    });
    proposalAdjacentView.runtimePluginInstall = {
      runnerOptions,
      selectedRunnerId,
      pluginOptions,
      selectedPluginId,
      helpText: runtimePluginInstallView.helpText,
      submitDisabled: runtimePluginInstallView.submitDisabled
    };
  }

  if (!family || family === "runtime-plugin-remove") {
    const selectedRunnerId = firstMatchingValue(runnerOptions, readSelectValue("runtime-plugin-remove-proposal-runner"));
    const pluginOptions = buildRuntimePluginRemoveOptions({
      serverRunnerId: selectedRunnerId,
      availabilityRows: runtimePluginAvailabilityForRunner(selectedRunnerId)
    });
    const selectedPluginId = firstMatchingValue(pluginOptions, readSelectValue("runtime-plugin-remove-proposal-plugin"));
    const runtimePluginRemoveView = buildRuntimePluginControlView({
      row: runtimePluginAvailabilityRow(selectedRunnerId, selectedPluginId),
      profile: runtimeProfile,
      requireInstalled: true
    });
    proposalAdjacentView.runtimePluginRemove = {
      runnerOptions,
      selectedRunnerId,
      pluginOptions,
      selectedPluginId,
      helpText: runtimePluginRemoveView.helpText,
      submitDisabled: runtimePluginRemoveView.submitDisabled
    };
  }

  if (!family || family === "mcp-server") {
    const selectedRunnerId = firstMatchingValue(runnerOptions, readSelectValue("mcp-server-proposal-runner"));
    const currentContextId = readSelectValue("mcp-server-proposal-context");
    const selectedContextId = contextOptions.some(option => option.value === currentContextId) ? currentContextId : "";
    const mcpServerView = buildMcpServerControlView({
      runnerId: selectedRunnerId,
      serviceIdentity: String(readFieldValue("mcp-server-proposal-form", "serviceIdentity") || "").trim(),
      transportsInput: String(readFieldValue("mcp-server-proposal-form", "transportsJson") || ""),
      parseJsonArrayInputFn
    });
    proposalAdjacentView.mcpServer = {
      runnerOptions,
      selectedRunnerId,
      contextOptions,
      selectedContextId,
      helpText: mcpServerView.helpText,
      submitDisabled: mcpServerView.submitDisabled
    };
  }

  if (!family || family === "mcp-tool-install") {
    const selectedServerId = firstMatchingValue(serverOptions, readSelectValue("mcp-tool-install-proposal-server"));
    const toolOptions = buildMcpToolInstallOptions({
      serverId: selectedServerId,
      supportedTools: mcpSupportedTools(),
      installedTools: mcpInstalledToolsForServer(selectedServerId)
    });
    const selectedToolId = firstMatchingValue(toolOptions, readSelectValue("mcp-tool-install-proposal-tool"));
    const selectedActingMode = firstMatchingValue(actingModeOptions, readSelectValue("mcp-tool-install-proposal-acting-mode"));
    const mcpToolInstallView = buildMcpToolInstallControlView({
      server: mcpServerRow(selectedServerId),
      tool: mcpSupportedToolRow(selectedToolId),
      actingMode: selectedActingMode || "delegated"
    });
    proposalAdjacentView.mcpToolInstall = {
      serverOptions,
      selectedServerId,
      toolOptions,
      selectedToolId,
      actingModeOptions,
      selectedActingMode,
      helpText: mcpToolInstallView.helpText,
      submitDisabled: mcpToolInstallView.submitDisabled
    };
  }

  if (!family || family === "mcp-tool-remove") {
    const selectedServerId = firstMatchingValue(serverOptions, readSelectValue("mcp-tool-remove-proposal-server"));
    const installedTools = mcpInstalledToolsForServer(selectedServerId);
    const toolOptions = buildMcpToolRemoveOptions({
      serverId: selectedServerId,
      installedTools,
      supportedTools: mcpSupportedTools()
    });
    const selectedToolId = firstMatchingValue(toolOptions, readSelectValue("mcp-tool-remove-proposal-tool"));
    const install = installedTools.find(row => row.tool === selectedToolId) || null;
    const mcpToolRemoveView = buildMcpToolRemoveControlView({
      server: mcpServerRow(selectedServerId),
      install,
      scopeSummary: install ? mcpScopeSummary(install) : "unscoped"
    });
    proposalAdjacentView.mcpToolRemove = {
      serverOptions,
      selectedServerId,
      toolOptions,
      selectedToolId,
      helpText: mcpToolRemoveView.helpText,
      submitDisabled: mcpToolRemoveView.submitDisabled
    };
  }

  return proposalAdjacentView;
}

export function applyBootstrapProposalAdjacentControlsView({
  family = null,
  view = {},
  editingDisabled = false,
  fillSelect = () => {},
  setSelectedValue = () => {},
  setStatus = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  if (!family || family === "runtime-plugin-install") {
    fillSelect("runtime-plugin-install-proposal-runner", view.runtimePluginInstall?.runnerOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-install-proposal-runner", view.runtimePluginInstall?.selectedRunnerId);
    fillSelect("runtime-plugin-install-proposal-plugin", view.runtimePluginInstall?.pluginOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-install-proposal-plugin", view.runtimePluginInstall?.selectedPluginId);
    setStatus("runtime-plugin-install-proposal-help", view.runtimePluginInstall?.helpText || "");
    setSubmitDisabled("runtime-plugin-install-proposal-form", editingDisabled || Boolean(view.runtimePluginInstall?.submitDisabled));
  }
  if (!family || family === "runtime-plugin-remove") {
    fillSelect("runtime-plugin-remove-proposal-runner", view.runtimePluginRemove?.runnerOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-remove-proposal-runner", view.runtimePluginRemove?.selectedRunnerId);
    fillSelect("runtime-plugin-remove-proposal-plugin", view.runtimePluginRemove?.pluginOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-remove-proposal-plugin", view.runtimePluginRemove?.selectedPluginId);
    setStatus("runtime-plugin-remove-proposal-help", view.runtimePluginRemove?.helpText || "");
    setSubmitDisabled("runtime-plugin-remove-proposal-form", editingDisabled || Boolean(view.runtimePluginRemove?.submitDisabled));
  }
  if (!family || family === "mcp-server") {
    fillSelect("mcp-server-proposal-runner", view.mcpServer?.runnerOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-server-proposal-runner", view.mcpServer?.selectedRunnerId);
    fillSelect("mcp-server-proposal-context", view.mcpServer?.contextOptions || [], row => row.value, row => row.label, { includeBlank: true });
    setSelectedValue("mcp-server-proposal-context", view.mcpServer?.selectedContextId);
    setStatus("mcp-server-proposal-help", view.mcpServer?.helpText || "");
    setSubmitDisabled("mcp-server-proposal-form", editingDisabled || Boolean(view.mcpServer?.submitDisabled));
  }
  if (!family || family === "mcp-tool-install") {
    fillSelect("mcp-tool-install-proposal-server", view.mcpToolInstall?.serverOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-install-proposal-server", view.mcpToolInstall?.selectedServerId);
    fillSelect("mcp-tool-install-proposal-tool", view.mcpToolInstall?.toolOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-install-proposal-tool", view.mcpToolInstall?.selectedToolId);
    fillSelect("mcp-tool-install-proposal-acting-mode", view.mcpToolInstall?.actingModeOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-install-proposal-acting-mode", view.mcpToolInstall?.selectedActingMode);
    setStatus("mcp-tool-install-proposal-help", view.mcpToolInstall?.helpText || "");
    setSubmitDisabled("mcp-tool-install-proposal-form", editingDisabled || Boolean(view.mcpToolInstall?.submitDisabled));
  }
  if (!family || family === "mcp-tool-remove") {
    fillSelect("mcp-tool-remove-proposal-server", view.mcpToolRemove?.serverOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-remove-proposal-server", view.mcpToolRemove?.selectedServerId);
    fillSelect("mcp-tool-remove-proposal-tool", view.mcpToolRemove?.toolOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-remove-proposal-tool", view.mcpToolRemove?.selectedToolId);
    setStatus("mcp-tool-remove-proposal-help", view.mcpToolRemove?.helpText || "");
    setSubmitDisabled("mcp-tool-remove-proposal-form", editingDisabled || Boolean(view.mcpToolRemove?.submitDisabled));
  }
}
