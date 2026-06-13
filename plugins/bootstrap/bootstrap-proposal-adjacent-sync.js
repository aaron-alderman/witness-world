import { buildBootstrapRuntimeIntegrationState } from "./bootstrap-runtime-integration-state.js";
import { createBootstrapDomHelpers } from "./bootstrap-dom-helpers.js";
import { createBootstrapLiveStateReaders } from "./bootstrap-live-state.js";
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
import {
  applyBootstrapProposalAdjacentControlsView,
  buildBootstrapProposalAdjacentControlsView
} from "./bootstrap-proposal-adjacent-controls-view.js";

export function renderBootstrapProposalAdjacentSyncFactory() {
  return String.raw`
    const syncBootstrapProposalAdjacentControlsState = ${syncBootstrapProposalAdjacentControlsState.toString()};
    const applyBootstrapProposalAdjacentControlsState = ${applyBootstrapProposalAdjacentControlsState.toString()};
    const runBootstrapProposalAdjacentSync = ${runBootstrapProposalAdjacentSync.toString()};
    const buildBootstrapProposalAdjacentSyncDeps = ${buildBootstrapProposalAdjacentSyncDeps.toString()};
    const createBootstrapProposalAdjacentSyncDepsBuilder = ${createBootstrapProposalAdjacentSyncDepsBuilder.toString()};
    const createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap = ${createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap.toString()};
    const createBootstrapProposalAdjacentSyncHandler = ${createBootstrapProposalAdjacentSyncHandler.toString()};
    const bindBootstrapProposalAdjacentSync = ${bindBootstrapProposalAdjacentSync.toString()};
  `;
}

export function syncBootstrapProposalAdjacentControlsState({
  family = null,
  existingView = {},
  authored = {},
  runtimeProfile = "full",
  supportedMcpActingModes = [],
  readSelectValue = () => "",
  readFieldValue = () => "",
  buildServerRunnerOptions: buildServerRunnerOptionsArg = null,
  buildMcpServerOptions: buildMcpServerOptionsArg = null,
  buildRuntimePluginInstallOptions: buildRuntimePluginInstallOptionsArg = null,
  buildRuntimePluginRemoveOptions: buildRuntimePluginRemoveOptionsArg = null,
  buildRuntimePluginControlView: buildRuntimePluginControlViewArg = null,
  buildMcpServerControlView: buildMcpServerControlViewArg = null,
  buildMcpToolInstallOptions: buildMcpToolInstallOptionsArg = null,
  buildMcpToolRemoveOptions: buildMcpToolRemoveOptionsArg = null,
  buildMcpToolInstallControlView: buildMcpToolInstallControlViewArg = null,
  buildMcpToolRemoveControlView: buildMcpToolRemoveControlViewArg = null,
  runtimePluginAvailabilityForRunner = () => [],
  runtimePluginAvailabilityRow = () => null,
  parseJsonArrayInputFn = parseBootstrapJsonArrayInput,
  mcpSupportedTools = () => [],
  mcpInstalledToolsForServer = () => [],
  mcpServerRow = () => null,
  mcpSupportedToolRow = () => null,
  mcpScopeSummary = () => "unscoped"
} = {}) {
  const buildServerRunnerOptionsFn = buildServerRunnerOptionsArg || buildServerRunnerOptions;
  const buildMcpServerOptionsFn = buildMcpServerOptionsArg || buildMcpServerOptions;
  const buildRuntimePluginInstallOptionsFn = buildRuntimePluginInstallOptionsArg || buildRuntimePluginInstallOptions;
  const buildRuntimePluginRemoveOptionsFn = buildRuntimePluginRemoveOptionsArg || buildRuntimePluginRemoveOptions;
  const buildRuntimePluginControlViewFn = buildRuntimePluginControlViewArg || buildRuntimePluginControlView;
  const buildMcpServerControlViewFn = buildMcpServerControlViewArg || buildMcpServerControlView;
  const buildMcpToolInstallOptionsFn = buildMcpToolInstallOptionsArg || buildMcpToolInstallOptions;
  const buildMcpToolRemoveOptionsFn = buildMcpToolRemoveOptionsArg || buildMcpToolRemoveOptions;
  const buildMcpToolInstallControlViewFn = buildMcpToolInstallControlViewArg || buildMcpToolInstallControlView;
  const buildMcpToolRemoveControlViewFn = buildMcpToolRemoveControlViewArg || buildMcpToolRemoveControlView;
  const view = buildBootstrapProposalAdjacentControlsView({
    family,
    existingView: family ? (existingView || {}) : {},
    authored,
    runtimeProfile,
    supportedMcpActingModes,
    readSelectValue,
    readFieldValue,
    buildServerRunnerOptions: buildServerRunnerOptionsFn,
    buildMcpServerOptions: buildMcpServerOptionsFn,
    buildRuntimePluginInstallOptions: buildRuntimePluginInstallOptionsFn,
    buildRuntimePluginRemoveOptions: buildRuntimePluginRemoveOptionsFn,
    buildRuntimePluginControlView: buildRuntimePluginControlViewFn,
    buildMcpServerControlView: buildMcpServerControlViewFn,
    buildMcpToolInstallOptions: buildMcpToolInstallOptionsFn,
    buildMcpToolRemoveOptions: buildMcpToolRemoveOptionsFn,
    buildMcpToolInstallControlView: buildMcpToolInstallControlViewFn,
    buildMcpToolRemoveControlView: buildMcpToolRemoveControlViewFn,
    runtimePluginAvailabilityForRunner,
    runtimePluginAvailabilityRow,
    parseJsonArrayInputFn,
    mcpSupportedTools,
    mcpInstalledToolsForServer,
    mcpServerRow,
    mcpSupportedToolRow,
    mcpScopeSummary
  });
  return view;
}

export function applyBootstrapProposalAdjacentControlsState({
  family = null,
  view = {},
  authored = {},
  session = {},
  fillSelect = () => {},
  setSelectedValue = () => {},
  setStatus = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  const editingDisabled = !session.authenticated && (authored.identities || []).length > 0;
  applyBootstrapProposalAdjacentControlsView({
    family,
    view: view || {},
    editingDisabled,
    fillSelect,
    setSelectedValue,
    setStatus,
    setSubmitDisabled
  });
  return view || {};
}

export function runBootstrapProposalAdjacentSync({
  detail = null,
  existingView = {},
  authored = {},
  session = {},
  runtimeProfile = "full",
  supportedMcpActingModes = [],
  readSelectValue = () => "",
  readFieldValue = () => "",
  buildServerRunnerOptions: buildServerRunnerOptionsArg = null,
  buildMcpServerOptions: buildMcpServerOptionsArg = null,
  buildRuntimePluginInstallOptions: buildRuntimePluginInstallOptionsArg = null,
  buildRuntimePluginRemoveOptions: buildRuntimePluginRemoveOptionsArg = null,
  buildRuntimePluginControlView: buildRuntimePluginControlViewArg = null,
  buildMcpServerControlView: buildMcpServerControlViewArg = null,
  buildMcpToolInstallOptions: buildMcpToolInstallOptionsArg = null,
  buildMcpToolRemoveOptions: buildMcpToolRemoveOptionsArg = null,
  buildMcpToolInstallControlView: buildMcpToolInstallControlViewArg = null,
  buildMcpToolRemoveControlView: buildMcpToolRemoveControlViewArg = null,
  runtimePluginAvailabilityForRunner = () => [],
  runtimePluginAvailabilityRow = () => null,
  parseJsonArrayInputFn = parseBootstrapJsonArrayInput,
  mcpSupportedTools = () => [],
  mcpInstalledToolsForServer = () => [],
  mcpServerRow = () => null,
  mcpSupportedToolRow = () => null,
  mcpScopeSummary = () => "unscoped",
  fillSelect = () => {},
  setSelectedValue = () => {},
  setStatus = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  const family = detail?.family || null;
  if (!detail || [
    "runtime-plugin-install",
    "runtime-plugin-remove",
    "mcp-server",
    "mcp-tool-install",
    "mcp-tool-remove"
  ].includes(family)) {
    const view = syncBootstrapProposalAdjacentControlsState({
      family,
      existingView,
      authored,
      runtimeProfile,
      supportedMcpActingModes,
      readSelectValue,
      readFieldValue,
      buildServerRunnerOptions: buildServerRunnerOptionsArg,
      buildMcpServerOptions: buildMcpServerOptionsArg,
      buildRuntimePluginInstallOptions: buildRuntimePluginInstallOptionsArg,
      buildRuntimePluginRemoveOptions: buildRuntimePluginRemoveOptionsArg,
      buildRuntimePluginControlView: buildRuntimePluginControlViewArg,
      buildMcpServerControlView: buildMcpServerControlViewArg,
      buildMcpToolInstallOptions: buildMcpToolInstallOptionsArg,
      buildMcpToolRemoveOptions: buildMcpToolRemoveOptionsArg,
      buildMcpToolInstallControlView: buildMcpToolInstallControlViewArg,
      buildMcpToolRemoveControlView: buildMcpToolRemoveControlViewArg,
      runtimePluginAvailabilityForRunner,
      runtimePluginAvailabilityRow,
      parseJsonArrayInputFn,
      mcpSupportedTools,
      mcpInstalledToolsForServer,
      mcpServerRow,
      mcpSupportedToolRow,
      mcpScopeSummary
    });
    applyBootstrapProposalAdjacentControlsState({
      family,
      view,
      authored,
      session,
      fillSelect,
      setSelectedValue,
      setStatus,
      setSubmitDisabled
    });
    return { handled: true, view };
  }
  return { handled: false, view: existingView || {} };
}

export function buildBootstrapProposalAdjacentSyncDeps({
  state = {},
  liveState = {},
  dom = {},
  existingView = {},
  buildBootstrapRuntimeIntegrationStateFn = buildBootstrapRuntimeIntegrationState,
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
  const session = typeof liveState.session === "function" ? (liveState.session() || {}) : (state.session || {});
  const model = typeof liveState.model === "function" ? (liveState.model() || {}) : (state.model || {});
  const runtimeProfile = typeof liveState.runtimeProfile === "function" ? liveState.runtimeProfile() : (model.runtimeProfile || "full");
  const supportedMcpActingModes = typeof liveState.supportedMcpActingModes === "function"
    ? (liveState.supportedMcpActingModes() || [])
    : (model.supportedMcpActingModes || []);
  const runtimeIntegrationState = typeof liveState.runtimeIntegrationState === "function"
    ? (liveState.runtimeIntegrationState() || {})
    : buildBootstrapRuntimeIntegrationStateFn({
      authored,
      model
    });
  return {
    ...deps,
    authored,
    session,
    existingView,
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

export function createBootstrapProposalAdjacentSyncDepsBuilder(base = {}) {
  return () => buildBootstrapProposalAdjacentSyncDeps(base);
}

export function createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap({
  state = {},
  document = null,
  buildBootstrapRuntimeIntegrationStateFn = buildBootstrapRuntimeIntegrationState,
  ...deps
} = {}) {
  const resolvedDocument = document || globalThis?.document || globalThis?.window?.document || null;
  return createBootstrapProposalAdjacentSyncDepsBuilder({
    ...deps,
    state,
    liveState: createBootstrapLiveStateReaders({
      state,
      buildBootstrapRuntimeIntegrationStateFn
    }),
    dom: createBootstrapDomHelpers({ document: resolvedDocument }),
    buildBootstrapRuntimeIntegrationStateFn
  });
}

export function createBootstrapProposalAdjacentSyncHandler({
  expectedSource = "bootstrap-proposal-adjacent-controls",
  buildDeps = null,
  ...deps
} = {}) {
  return event => {
    const detail = event?.detail || {};
    if (detail.source !== expectedSource) return { handled: false, view: {} };
    const resolvedDeps = typeof buildDeps === "function" ? (buildDeps() || {}) : deps;
    return runBootstrapProposalAdjacentSync({
      ...resolvedDeps,
      detail
    });
  };
}

export function bindBootstrapProposalAdjacentSync({
  target = null,
  eventName = "witness:bootstrap-proposal-adjacent-sync",
  ...deps
} = {}) {
  const handler = createBootstrapProposalAdjacentSyncHandler(deps);
  target?.addEventListener?.(eventName, handler);
  return handler;
}
