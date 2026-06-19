export function renderBootstrapClientRuntimeBindersFactory() {
  return String.raw`
    const bindBootstrapClientRuntimeAdapters = ${bindBootstrapClientRuntimeAdapters.toString()};
  `;
}

export function bindBootstrapClientRuntimeAdapters({
  target = null,
  byId = () => null,
  request = async () => ({}),
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  reload = () => {},
  state = {},
  renderPage = () => {},
  renderRuntimePluginReviewDetail = () => {},
  runtimePluginReviewRequestState = { current: 0 },
  buildProposalControlsSyncDeps = () => ({}),
  buildBackendControlsSyncDeps = () => ({}),
  buildProposalAdjacentSyncDeps = () => ({}),
  buildScopedControlsSyncDeps = () => ({}),
  buildRouteAuthoringSyncDeps = () => ({}),
  buildRuntimeIntegrationDirectControlsSyncDeps = () => ({}),
  capabilityControls = { bind() {} },
  resolveServerRunner = server => server,
  runtimePluginProposalBodyFn = null,
  mcpServerProposalBodyFn = null,
  mcpToolProposalBodyFn = null,
  getReview = () => state.runtimePluginReview,
  setReview = review => {
    state.runtimePluginReview = review;
  },
  getRuntimeProfile = () => state.model?.runtimeProfile || "full",
  guidanceStep = () => null,
  tutorialStep = () => null,
  openAppHome = async () => {},
  desktopApi = () => null
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;

  bindBootstrapHostRefresh({
    target: resolvedTarget,
    refresh,
    setBootstrapStatus: message => setStatus("bootstrap-status", message)
  });
  bindBootstrapTopCardsSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    reload,
    setStatus,
    resetForm
  });
  bindBootstrapBackendAuthoringControlsSync({
    target: resolvedTarget,
    buildDeps: buildBackendControlsSyncDeps
  });
  bindBootstrapBackendAuthoringSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus,
    resetForm
  });
  bindBootstrapBackendVersionSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus
  });
  bindBootstrapProposalAdjacentSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus,
    resetForm,
    resolveServerRunner,
    runtimePluginProposalBodyFn,
    mcpServerProposalBodyFn,
    mcpToolProposalBodyFn
  });
  bindBootstrapProposalAdjacentSync({
    target: resolvedTarget,
    buildDeps: buildProposalAdjacentSyncDeps
  });
  bindBootstrapRuntimeIntegrationDirectControlsSync({
    target: resolvedTarget,
    buildDeps: buildRuntimeIntegrationDirectControlsSyncDeps
  });
  bindBootstrapRuntimeIntegrationDirectSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus,
    resetForm
  });
  bindBootstrapAppAuthoringSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus,
    resetForm
  });
  bindBootstrapProposalSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus,
    resetForm
  });
  bindBootstrapCapabilitySubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus,
    resetForm
  });
  bindBootstrapRouteAuthoringSync({
    target: resolvedTarget,
    buildDeps: buildRouteAuthoringSyncDeps
  });
  bindBootstrapRuntimePluginReviewSync({
    target: resolvedTarget,
    byId,
    request,
    postJson,
    refresh,
    requestState: runtimePluginReviewRequestState,
    getReview,
    setReview,
    getRuntimeProfile,
    renderPage,
    renderDetail: renderRuntimePluginReviewDetail,
    setStatus
  });
  bindBootstrapProposalControlsSync({
    target: resolvedTarget,
    buildDeps: buildProposalControlsSyncDeps
  });
  bindBootstrapBackendVersionControlsSync({
    target: resolvedTarget,
    buildDeps: buildBackendControlsSyncDeps
  });
  bindBootstrapScopedSubmit({
    target: resolvedTarget,
    postJson,
    refresh,
    setStatus,
    resetForm
  });
  bindBootstrapScopedControlsSync({
    target: resolvedTarget,
    buildDeps: buildScopedControlsSyncDeps
  });
  capabilityControls.bind();
  bindBootstrapHostActions({
    target: resolvedTarget,
    guidanceStep,
    tutorialStep,
    openAppHome,
    desktopApi,
    setBootstrapStatus: message => setStatus("bootstrap-status", message),
    setDesktopStatus: message => setStatus("desktop-status", message)
  });
}
