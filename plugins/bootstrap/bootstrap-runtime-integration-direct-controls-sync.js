import {
  buildMcpServerControlView,
  buildMcpToolInstallControlView,
  buildMcpToolRemoveControlView,
  parseBootstrapJsonArrayInput,
  buildRuntimePluginControlView
} from "./bootstrap-runtime-integration-controls-view.js";
import {
  buildMcpServerOptions,
  buildMcpToolInstallOptions,
  buildMcpToolRemoveOptions,
  buildRuntimePluginInstallOptions,
  buildRuntimePluginRemoveOptions,
  buildServerRunnerOptions
} from "./bootstrap-runtime-integration-options-view.js";
import { buildBootstrapRuntimeIntegrationState } from "./bootstrap-runtime-integration-state.js";

export function renderBootstrapRuntimeIntegrationDirectControlsSyncFactory() {
  return String.raw`
    const buildBootstrapRuntimeIntegrationDirectControlsView = ${buildBootstrapRuntimeIntegrationDirectControlsView.toString()};
    const applyBootstrapRuntimeIntegrationDirectControlsView = ${applyBootstrapRuntimeIntegrationDirectControlsView.toString()};
    const syncBootstrapRuntimeIntegrationDirectControlsState = ${syncBootstrapRuntimeIntegrationDirectControlsState.toString()};
    const runBootstrapRuntimeIntegrationDirectControlsSync = ${runBootstrapRuntimeIntegrationDirectControlsSync.toString()};
    const createBootstrapRuntimeIntegrationDirectControlsSyncHandler = ${createBootstrapRuntimeIntegrationDirectControlsSyncHandler.toString()};
    const bindBootstrapRuntimeIntegrationDirectControlsSync = ${bindBootstrapRuntimeIntegrationDirectControlsSync.toString()};
    const buildBootstrapRuntimeIntegrationDirectControlsSyncDeps = ${buildBootstrapRuntimeIntegrationDirectControlsSyncDeps.toString()};
    const createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder = ${createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder.toString()};
  `;
}

export function buildBootstrapRuntimeIntegrationDirectControlsView({
  family = null,
  existingView = {},
  authored = {},
  runtimeProfile = "full",
  supportedMcpActingModes = [],
  readSelectValue = () => "",
  readFieldValue = () => "",
  buildServerRunnerOptionsFn = buildServerRunnerOptions,
  buildMcpServerOptionsFn = buildMcpServerOptions,
  buildRuntimePluginInstallOptionsFn = buildRuntimePluginInstallOptions,
  buildRuntimePluginRemoveOptionsFn = buildRuntimePluginRemoveOptions,
  buildRuntimePluginControlViewFn = buildRuntimePluginControlView,
  buildMcpServerControlViewFn = buildMcpServerControlView,
  buildMcpToolInstallOptionsFn = buildMcpToolInstallOptions,
  buildMcpToolRemoveOptionsFn = buildMcpToolRemoveOptions,
  buildMcpToolInstallControlViewFn = buildMcpToolInstallControlView,
  buildMcpToolRemoveControlViewFn = buildMcpToolRemoveControlView,
  runtimePluginAvailabilityForRunner = () => [],
  runtimePluginAvailabilityRow = () => null,
  parseJsonArrayInputFn = parseBootstrapJsonArrayInput,
  mcpSupportedTools = () => [],
  mcpInstalledToolsForServer = () => [],
  mcpServerRow = () => null,
  mcpSupportedToolRow = () => null,
  mcpScopeSummary = () => "unscoped"
} = {}) {
  const view = family ? { ...(existingView || {}) } : {};
  const firstMatchingValue = (options, currentValue) =>
    (options || []).some(option => option.value === currentValue) ? currentValue : (options?.[0]?.value || "");
  const contextOptions = (authored.contexts || []).map(row => ({ value: row.id, label: row.id }));
  const runnerOptions = buildServerRunnerOptionsFn(authored.serverRunners || []);
  const serverOptions = buildMcpServerOptionsFn(authored.mcpServers || []);
  const actingModeOptions = (supportedMcpActingModes || []).map(value => ({ value, label: value }));

  if (!family || family === "runtime-plugin-install") {
    const selectedRunnerId = firstMatchingValue(runnerOptions, readSelectValue("runtime-plugin-install-runner"));
    const pluginOptions = buildRuntimePluginInstallOptionsFn({
      serverRunnerId: selectedRunnerId,
      availabilityRows: runtimePluginAvailabilityForRunner(selectedRunnerId)
    });
    const selectedPluginId = firstMatchingValue(pluginOptions, readSelectValue("runtime-plugin-install-plugin"));
    const runtimePluginInstallView = buildRuntimePluginControlViewFn({
      row: runtimePluginAvailabilityRow(selectedRunnerId, selectedPluginId),
      profile: runtimeProfile
    });
    view.runtimePluginInstall = {
      runnerOptions,
      selectedRunnerId,
      pluginOptions,
      selectedPluginId,
      helpText: runtimePluginInstallView.helpText,
      submitDisabled: runtimePluginInstallView.submitDisabled
    };
  }

  if (!family || family === "runtime-plugin-remove") {
    const selectedRunnerId = firstMatchingValue(runnerOptions, readSelectValue("runtime-plugin-remove-runner"));
    const pluginOptions = buildRuntimePluginRemoveOptionsFn({
      serverRunnerId: selectedRunnerId,
      availabilityRows: runtimePluginAvailabilityForRunner(selectedRunnerId)
    });
    const selectedPluginId = firstMatchingValue(pluginOptions, readSelectValue("runtime-plugin-remove-plugin"));
    const runtimePluginRemoveView = buildRuntimePluginControlViewFn({
      row: runtimePluginAvailabilityRow(selectedRunnerId, selectedPluginId),
      profile: runtimeProfile,
      requireInstalled: true
    });
    view.runtimePluginRemove = {
      runnerOptions,
      selectedRunnerId,
      pluginOptions,
      selectedPluginId,
      helpText: runtimePluginRemoveView.helpText,
      submitDisabled: runtimePluginRemoveView.submitDisabled
    };
  }

  if (!family || family === "mcp-server") {
    const selectedRunnerId = firstMatchingValue(runnerOptions, readSelectValue("mcp-server-runner"));
    const currentContextId = readSelectValue("mcp-server-context");
    const selectedContextId = contextOptions.some(option => option.value === currentContextId) ? currentContextId : "";
    const mcpServerView = buildMcpServerControlViewFn({
      runnerId: selectedRunnerId,
      serviceIdentity: String(readFieldValue("mcp-server-form", "serviceIdentity") || "").trim(),
      transportsInput: String(readFieldValue("mcp-server-form", "transportsJson") || ""),
      parseJsonArrayInputFn
    });
    view.mcpServer = {
      runnerOptions,
      selectedRunnerId,
      contextOptions,
      selectedContextId,
      helpText: mcpServerView.helpText,
      submitDisabled: mcpServerView.submitDisabled
    };
  }

  if (!family || family === "mcp-tool-install") {
    const selectedServerId = firstMatchingValue(serverOptions, readSelectValue("mcp-tool-install-server"));
    const toolOptions = buildMcpToolInstallOptionsFn({
      serverId: selectedServerId,
      supportedTools: mcpSupportedTools(),
      installedTools: mcpInstalledToolsForServer(selectedServerId)
    });
    const selectedToolId = firstMatchingValue(toolOptions, readSelectValue("mcp-tool-install-tool"));
    const selectedActingMode = firstMatchingValue(actingModeOptions, readSelectValue("mcp-tool-install-acting-mode"));
    const mcpToolInstallView = buildMcpToolInstallControlViewFn({
      server: mcpServerRow(selectedServerId),
      tool: mcpSupportedToolRow(selectedToolId),
      actingMode: selectedActingMode || "delegated"
    });
    view.mcpToolInstall = {
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
    const selectedServerId = firstMatchingValue(serverOptions, readSelectValue("mcp-tool-remove-server"));
    const installedTools = mcpInstalledToolsForServer(selectedServerId);
    const toolOptions = buildMcpToolRemoveOptionsFn({
      serverId: selectedServerId,
      installedTools,
      supportedTools: mcpSupportedTools()
    });
    const selectedToolId = firstMatchingValue(toolOptions, readSelectValue("mcp-tool-remove-tool"));
    const install = installedTools.find(row => row.tool === selectedToolId) || null;
    const mcpToolRemoveView = buildMcpToolRemoveControlViewFn({
      server: mcpServerRow(selectedServerId),
      install,
      scopeSummary: install ? mcpScopeSummary(install) : "unscoped"
    });
    view.mcpToolRemove = {
      serverOptions,
      selectedServerId,
      toolOptions,
      selectedToolId,
      helpText: mcpToolRemoveView.helpText,
      submitDisabled: mcpToolRemoveView.submitDisabled
    };
  }

  return view;
}

export function applyBootstrapRuntimeIntegrationDirectControlsView({
  family = null,
  view = {},
  fillSelect = () => {},
  setSelectedValue = () => {},
  setStatus = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  if (!family || family === "runtime-plugin-install") {
    fillSelect("runtime-plugin-install-runner", view.runtimePluginInstall?.runnerOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-install-runner", view.runtimePluginInstall?.selectedRunnerId);
    fillSelect("runtime-plugin-install-plugin", view.runtimePluginInstall?.pluginOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-install-plugin", view.runtimePluginInstall?.selectedPluginId);
    setStatus("runtime-plugin-install-help", view.runtimePluginInstall?.helpText || "");
    setSubmitDisabled("runtime-plugin-install-form", Boolean(view.runtimePluginInstall?.submitDisabled));
  }
  if (!family || family === "runtime-plugin-remove") {
    fillSelect("runtime-plugin-remove-runner", view.runtimePluginRemove?.runnerOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-remove-runner", view.runtimePluginRemove?.selectedRunnerId);
    fillSelect("runtime-plugin-remove-plugin", view.runtimePluginRemove?.pluginOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("runtime-plugin-remove-plugin", view.runtimePluginRemove?.selectedPluginId);
    setStatus("runtime-plugin-remove-help", view.runtimePluginRemove?.helpText || "");
    setSubmitDisabled("runtime-plugin-remove-form", Boolean(view.runtimePluginRemove?.submitDisabled));
  }
  if (!family || family === "mcp-server") {
    fillSelect("mcp-server-runner", view.mcpServer?.runnerOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-server-runner", view.mcpServer?.selectedRunnerId);
    fillSelect("mcp-server-context", view.mcpServer?.contextOptions || [], row => row.value, row => row.label, { includeBlank: true });
    setSelectedValue("mcp-server-context", view.mcpServer?.selectedContextId);
    setStatus("mcp-server-help", view.mcpServer?.helpText || "");
    setSubmitDisabled("mcp-server-form", Boolean(view.mcpServer?.submitDisabled));
  }
  if (!family || family === "mcp-tool-install") {
    fillSelect("mcp-tool-install-server", view.mcpToolInstall?.serverOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-install-server", view.mcpToolInstall?.selectedServerId);
    fillSelect("mcp-tool-install-tool", view.mcpToolInstall?.toolOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-install-tool", view.mcpToolInstall?.selectedToolId);
    fillSelect("mcp-tool-install-acting-mode", view.mcpToolInstall?.actingModeOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-install-acting-mode", view.mcpToolInstall?.selectedActingMode);
    setStatus("mcp-tool-install-help", view.mcpToolInstall?.helpText || "");
    setSubmitDisabled("mcp-tool-install-form", Boolean(view.mcpToolInstall?.submitDisabled));
  }
  if (!family || family === "mcp-tool-remove") {
    fillSelect("mcp-tool-remove-server", view.mcpToolRemove?.serverOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-remove-server", view.mcpToolRemove?.selectedServerId);
    fillSelect("mcp-tool-remove-tool", view.mcpToolRemove?.toolOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue("mcp-tool-remove-tool", view.mcpToolRemove?.selectedToolId);
    setStatus("mcp-tool-remove-help", view.mcpToolRemove?.helpText || "");
    setSubmitDisabled("mcp-tool-remove-form", Boolean(view.mcpToolRemove?.submitDisabled));
  }
}

export function syncBootstrapRuntimeIntegrationDirectControlsState({
  family = null,
  existingView = {},
  ...deps
} = {}) {
  return buildBootstrapRuntimeIntegrationDirectControlsView({
    family,
    existingView,
    ...deps
  });
}

export function runBootstrapRuntimeIntegrationDirectControlsSync({
  family = null,
  existingView = {},
  ...deps
} = {}) {
  const view = syncBootstrapRuntimeIntegrationDirectControlsState({
    family,
    existingView,
    ...deps
  });
  applyBootstrapRuntimeIntegrationDirectControlsView({
    family,
    view,
    ...deps
  });
  return { handled: true, view };
}

export function createBootstrapRuntimeIntegrationDirectControlsSyncHandler({
  buildDeps = () => ({})
} = {}) {
  return event => runBootstrapRuntimeIntegrationDirectControlsSync({
    ...buildDeps(),
    family: event?.detail?.family || null
  });
}

export function bindBootstrapRuntimeIntegrationDirectControlsSync({
  target = null,
  buildDeps = () => ({})
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = createBootstrapRuntimeIntegrationDirectControlsSyncHandler({ buildDeps });
  resolvedTarget.addEventListener("witness:bootstrap-runtime-integration-direct-sync", handler);
  return handler;
}

export function buildBootstrapRuntimeIntegrationDirectControlsSyncDeps({
  state = {},
  liveState = {},
  dom = {},
  ...deps
} = {}) {
  const {
    byId = () => null,
    formField = () => null,
    fillSelect = () => {},
    setStatus = () => {},
    readSelectValue = id => byId(id)?.value || "",
    readFieldValue = (formId, fieldName) => String(formField(byId(formId), fieldName)?.value || ""),
    setSelectedValue = (id, selectedValue) => {
      const select = byId(id);
      if (select && [...select.options].some(option => option.value === selectedValue)) select.value = selectedValue;
    },
    setSubmitDisabled = (formId, disabled) => {
      const button = byId(formId)?.querySelector('button[type="submit"]');
      if (button) button.disabled = Boolean(disabled);
    }
  } = dom;
  const authored = typeof liveState.authored === "function" ? (liveState.authored() || {}) : (state.bootstrapState || {});
  const model = typeof liveState.model === "function" ? (liveState.model() || {}) : (state.model || {});
  const runtimeProfile = typeof liveState.runtimeProfile === "function" ? liveState.runtimeProfile() : (model.runtimeProfile || "full");
  const supportedMcpActingModes = typeof liveState.supportedMcpActingModes === "function"
    ? (liveState.supportedMcpActingModes() || [])
    : (model.supportedMcpActingModes || []);
  const runtimeIntegrationState = typeof liveState.runtimeIntegrationState === "function"
    ? (liveState.runtimeIntegrationState() || {})
    : buildBootstrapRuntimeIntegrationState({
      authored,
      model
    });
  return {
    ...deps,
    authored,
    runtimeProfile,
    supportedMcpActingModes,
    runtimePluginAvailabilityForRunner: deps.runtimePluginAvailabilityForRunner || runtimeIntegrationState.runtimePluginAvailabilityForRunner,
    runtimePluginAvailabilityRow: deps.runtimePluginAvailabilityRow || runtimeIntegrationState.runtimePluginAvailabilityRow,
    mcpSupportedTools: deps.mcpSupportedTools || runtimeIntegrationState.mcpSupportedTools,
    mcpInstalledToolsForServer: deps.mcpInstalledToolsForServer || runtimeIntegrationState.mcpInstalledToolsForServer,
    mcpServerRow: deps.mcpServerRow || runtimeIntegrationState.mcpServerRow,
    mcpSupportedToolRow: deps.mcpSupportedToolRow || runtimeIntegrationState.mcpSupportedToolRow,
    mcpScopeSummary: deps.mcpScopeSummary || runtimeIntegrationState.mcpScopeSummary,
    readSelectValue,
    readFieldValue,
    fillSelect,
    setSelectedValue,
    setStatus,
    setSubmitDisabled
  };
}

export function createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder(base = {}) {
  return () => buildBootstrapRuntimeIntegrationDirectControlsSyncDeps(base);
}
