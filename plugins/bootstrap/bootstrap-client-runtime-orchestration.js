export function renderBootstrapClientRuntimeOrchestrationFactory() {
  return String.raw`
    const createBootstrapClientRuntimeOrchestration = ${createBootstrapClientRuntimeOrchestration.toString()};
  `;
}

export function createBootstrapClientRuntimeOrchestration({
  guidance = null,
  tutorial = null,
  state = {},
  currentSurfacePage = "bootstrap",
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null,
  request = async () => ({}),
  postJson = async () => ({}),
  byId = () => null,
  setStatus = () => {},
  formField = () => null,
  fillSelect = () => {},
  setSelectedValue = () => {},
  desktopApi = () => null,
  stateSnapshots = new Map(),
  rowKey = row => JSON.stringify(row),
  renderRuntimePluginReviewDetail = () => {},
  publishRuntimeView = () => {},
  runtimePluginReviewRequestState = { current: 0 },
  bootstrapControlsRuntime = {},
  support = {},
  createBootstrapClientRuntimeGuidanceFn = typeof createBootstrapClientRuntimeGuidance === "function" ? createBootstrapClientRuntimeGuidance : null,
  runBootstrapRefreshFn = typeof runBootstrapRefresh === "function" ? runBootstrapRefresh : null,
  bindBootstrapClientRuntimeAdaptersFn = typeof bindBootstrapClientRuntimeAdapters === "function" ? bindBootstrapClientRuntimeAdapters : null,
  createBootstrapRenderRuntimeFn = typeof createBootstrapRenderRuntime === "function" ? createBootstrapRenderRuntime : null,
  runBootstrapProposalControlsSyncFn = typeof runBootstrapProposalControlsSync === "function" ? runBootstrapProposalControlsSync : () => {},
  runBootstrapBackendControlsRenderFn = typeof runBootstrapBackendControlsRender === "function" ? runBootstrapBackendControlsRender : () => {},
  runBootstrapRuntimeIntegrationDirectControlsSyncFn = typeof runBootstrapRuntimeIntegrationDirectControlsSync === "function" ? runBootstrapRuntimeIntegrationDirectControlsSync : () => {},
  runBootstrapProposalAdjacentSyncFn = typeof runBootstrapProposalAdjacentSync === "function" ? runBootstrapProposalAdjacentSync : () => {},
  runBootstrapScopedControlsSyncFn = typeof runBootstrapScopedControlsSync === "function" ? runBootstrapScopedControlsSync : () => {},
  runBootstrapRouteAuthoringSyncFn = typeof runBootstrapRouteAuthoringSync === "function" ? runBootstrapRouteAuthoringSync : () => {},
  loadBootstrapRuntimePluginReviewFn = typeof loadBootstrapRuntimePluginReview === "function" ? loadBootstrapRuntimePluginReview : null,
  runtimePluginProposalBodyFn = typeof runtimePluginProposalBody === "function" ? runtimePluginProposalBody : (value => value),
  mcpServerProposalBodyFn = typeof mcpServerProposalBody === "function" ? mcpServerProposalBody : (value => value),
  mcpToolProposalBodyFn = typeof mcpToolProposalBody === "function" ? mcpToolProposalBody : (value => value),
  syncGuidanceProgressAliasFn = (nextState, progress) => {
    nextState.guidanceProgress = progress;
    nextState.tutorialProgress = progress;
    return progress;
  }
} = {}) {
  const {
    buildProposalControlsSyncDeps = () => ({}),
    capabilityControls = { bind() {}, render() {} },
    buildBackendControlsSyncDeps = () => ({}),
    buildProposalAdjacentSyncDeps = () => ({}),
    buildScopedControlsSyncDeps = () => ({}),
    buildRouteAuthoringSyncDeps = () => ({}),
    buildRuntimeIntegrationDirectControlsSyncDeps = () => ({}),
    liveState = {
      runtimeIntegrationState() {
        return { resolveServerRunner(server) { return server; } };
      }
    }
  } = bootstrapControlsRuntime;
  const {
    escapeHtml = value => String(value),
    byTarget = () => null,
    sleep = () => Promise.resolve()
  } = support;

  let render = () => {};
  let refresh = async () => {};
  const {
    guidance: activeGuidance,
    guidanceRuntime,
    currentSuggestions,
    guidanceState,
    tutorialState,
    guidanceStep,
    tutorialStep,
    guidanceDisabledPages,
    tutorialDisabledPages,
    guidanceDisabledScopeKeys,
    tutorialDisabledScopeKeys,
    guidanceDisabledContextIds,
    guidanceReplayStepId,
    tutorialReplayStepId,
    guidanceReplayScopeKey,
    tutorialReplayScopeKey,
    guidanceStepScope,
    tutorialStepScope,
    guidanceStepConcepts,
    tutorialStepConcepts,
    guidanceRevealedConcepts,
    tutorialRevealedConcepts,
    guidanceSurfaceState,
    tutorialSurfaceState,
    guidanceScopeInventoryRows,
    tutorialScopeInventoryRows,
    loadGuidanceProgress,
    loadTutorialProgress,
    openAppHome,
    continueGuidanceOnPage,
    continueTutorialOnPage,
    renderGuidanceCard,
    renderTutorialCard,
    renderGuidanceOverlay,
    renderTutorialOverlay,
    requestMaybeAdvanceGuidance,
    requestMaybeAdvanceTutorial,
    bindGuidanceInteractions,
    bindTutorialInteractions
  } = createBootstrapClientRuntimeGuidanceFn({
    guidance,
    tutorial,
    state,
    currentSurfacePage,
    request,
    byId,
    renderPage: () => render(),
    getAppReady: () => state.model?.appReady === true,
    refresh: (...args) => refresh(...args),
    setBootstrapStatus: message => setStatus("bootstrap-status", message),
    currentHref: () => windowTarget?.location?.href,
    currentPathname: () => windowTarget?.location?.pathname,
    assign: targetHref => windowTarget?.location?.assign?.(targetHref),
    reload: () => windowTarget?.location?.reload?.(),
    escapeHtml,
    byTarget,
    setStatus,
    formField,
    sleep
  });

  refresh = async () => runBootstrapRefreshFn({
    state,
    byId,
    request,
    desktopApi,
    loadRuntimePluginReviewFn: loadBootstrapRuntimePluginReviewFn,
    runtimePluginReviewRequestState,
    loadGuidanceProgress: async () => {
      const progress = await loadGuidanceProgress();
      syncGuidanceProgressAliasFn(state, state.guidanceProgress ?? state.tutorialProgress ?? progress ?? null);
      return progress;
    },
    loadTutorialProgress: async () => {
      const progress = await loadTutorialProgress();
      syncGuidanceProgressAliasFn(state, state.guidanceProgress ?? state.tutorialProgress ?? progress ?? null);
      return progress;
    },
    render,
    requestMaybeAdvanceGuidance: async () => {
      const result = await requestMaybeAdvanceGuidance();
      syncGuidanceProgressAliasFn(state, state.guidanceProgress ?? state.tutorialProgress ?? null);
      return result;
    },
    requestMaybeAdvanceTutorial: async () => {
      const result = await requestMaybeAdvanceTutorial();
      syncGuidanceProgressAliasFn(state, state.guidanceProgress ?? state.tutorialProgress ?? null);
      return result;
    },
    setRuntimePluginReview: review => {
      state.runtimePluginReview = review;
    }
  });

  bindBootstrapClientRuntimeAdaptersFn({
    target: windowTarget,
    byId,
    request,
    postJson,
    refresh,
    setStatus,
    resetForm: formId => byId(formId)?.reset?.(),
    reload: () => windowTarget?.location?.reload?.(),
    state,
    renderPage: () => render(),
    renderRuntimePluginReviewDetail,
    runtimePluginReviewRequestState,
    buildProposalControlsSyncDeps,
    buildBackendControlsSyncDeps,
    buildProposalAdjacentSyncDeps,
    buildScopedControlsSyncDeps,
    buildRouteAuthoringSyncDeps,
    buildRuntimeIntegrationDirectControlsSyncDeps,
    capabilityControls,
    resolveServerRunner: server => liveState.runtimeIntegrationState().resolveServerRunner(server),
    runtimePluginProposalBodyFn,
    mcpServerProposalBodyFn,
    mcpToolProposalBodyFn,
    getReview: () => state.runtimePluginReview,
    setReview: review => {
      state.runtimePluginReview = review;
    },
    getRuntimeProfile: () => state.model?.runtimeProfile || "full",
    guidanceStep,
    tutorialStep,
    openAppHome,
    desktopApi
  });

  render = createBootstrapRenderRuntimeFn({
    state,
    currentSurfacePage,
    byId,
    document: documentTarget,
    stateSnapshots,
    rowKey,
    fillSelect,
    setSelectedValue,
    capabilityControls,
    buildProposalControlsSyncDeps,
    runBootstrapProposalControlsSyncFn,
    buildBackendControlsSyncDeps,
    runBootstrapBackendControlsRenderFn,
    buildRuntimeIntegrationDirectControlsSyncDeps,
    runBootstrapRuntimeIntegrationDirectControlsSyncFn,
    buildProposalAdjacentSyncDeps,
    runBootstrapProposalAdjacentSyncFn,
    buildScopedControlsSyncDeps,
    runBootstrapScopedControlsSyncFn,
    buildRouteAuthoringSyncDeps,
    runBootstrapRouteAuthoringSyncFn,
    renderRuntimePluginReviewDetail,
    renderGuidanceCard,
    renderGuidanceOverlay,
    renderTutorialCard,
    renderTutorialOverlay,
    guidanceState,
    tutorialState,
    currentSuggestions,
    guidanceStep,
    tutorialStep,
    guidanceStepScope,
    tutorialStepScope,
    guidanceStepConcepts,
    tutorialStepConcepts,
    guidanceRevealedConcepts,
    tutorialRevealedConcepts,
    guidanceReplayScopeKey,
    tutorialReplayScopeKey,
    guidanceReplayStepId,
    tutorialReplayStepId,
    guidanceDisabledScopeKeys,
    tutorialDisabledScopeKeys,
    guidanceDisabledPages,
    tutorialDisabledPages,
    guidanceDisabledContextIds,
    guidanceSurfaceState,
    tutorialSurfaceState,
    tutorialScopeInventoryRows,
    publishGuidanceRuntimeView: publishRuntimeView,
    publishTutorialRuntimeView: publishRuntimeView
  });

  bindGuidanceInteractions();
  const startupPromise = refresh().catch(error => setStatus("bootstrap-status", error.message));
  return {
    guidance: activeGuidance,
    tutorialRuntime: guidanceRuntime,
    guidanceRuntime,
    render,
    refresh,
    startupPromise
  };
}
