import {
  applyBootstrapShellSelectFill,
  applyBootstrapShellStatusView,
  buildBootstrapShellStatusView
} from "./bootstrap-shell-render-view.js";
import { renderBootstrapStateInventory } from "./bootstrap-state-list-render.js";
import { buildBootstrapGuidanceRuntimeView } from "./bootstrap-guidance-runtime-view.js";
import {
  applyBootstrapShellViewState,
  syncBootstrapShellViewState
} from "./bootstrap-shell-view-state.js";

export function renderBootstrapShellRenderRuntimeFactory() {
  return String.raw`
    const createBootstrapRenderRuntime = ${createBootstrapRenderRuntime.toString()};
  `;
}

export function createBootstrapRenderRuntime({
  state = {},
  currentSurfacePage = "bootstrap",
  byId = () => null,
  document = null,
  stateSnapshots = new Map(),
  rowKey = row => JSON.stringify(row),
  fillSelect = () => {},
  setSelectedValue = () => {},
  capabilityControls = { render() {} },
  buildProposalControlsSyncDeps = () => ({}),
  runBootstrapProposalControlsSyncFn = () => {},
  buildBackendControlsSyncDeps = () => ({}),
  runBootstrapBackendControlsRenderFn = () => {},
  buildRuntimeIntegrationDirectControlsSyncDeps = () => ({}),
  runBootstrapRuntimeIntegrationDirectControlsSyncFn = () => {},
  buildProposalAdjacentSyncDeps = () => ({}),
  runBootstrapProposalAdjacentSyncFn = () => {},
  buildScopedControlsSyncDeps = () => ({}),
  runBootstrapScopedControlsSyncFn = () => {},
  buildRouteAuthoringSyncDeps = () => ({}),
  runBootstrapRouteAuthoringSyncFn = () => {},
  renderBootstrapStateInventoryFn = renderBootstrapStateInventory,
  renderRuntimePluginReviewDetail = () => {},
  syncBootstrapShellViewStateFn = syncBootstrapShellViewState,
  applyBootstrapShellViewStateFn = applyBootstrapShellViewState,
  renderGuidanceCard = null,
  renderGuidanceOverlay = null,
  renderTutorialCard = null,
  renderTutorialOverlay = null,
  buildBootstrapGuidanceRuntimeViewFn = buildBootstrapGuidanceRuntimeView,
  guidanceState = null,
  tutorialState = null,
  currentSuggestions = [],
  guidanceStep = null,
  tutorialStep = () => null,
  guidanceStepScope = null,
  tutorialStepScope = () => null,
  guidanceStepConcepts = null,
  tutorialStepConcepts = () => [],
  guidanceRevealedConcepts = null,
  tutorialRevealedConcepts = () => [],
  guidanceReplayScopeKey = null,
  tutorialReplayScopeKey = () => null,
  guidanceReplayStepId = null,
  tutorialReplayStepId = () => null,
  guidanceDisabledScopeKeys = null,
  tutorialDisabledScopeKeys = () => [],
  guidanceDisabledPages = null,
  tutorialDisabledPages = () => [],
  guidanceDisabledContextIds = null,
  guidanceSurfaceState = null,
  tutorialSurfaceState = () => ({ kind: "unknown" }),
  tutorialScopeInventoryRows = () => [],
  publishGuidanceRuntimeView = null,
  publishTutorialRuntimeView = null,
  buildBootstrapShellStatusViewFn = buildBootstrapShellStatusView,
  applyBootstrapShellStatusViewFn = applyBootstrapShellStatusView,
  applyBootstrapShellSelectFillFn = applyBootstrapShellSelectFill
} = {}) {
  const activeRenderGuidanceCard = renderGuidanceCard ?? renderTutorialCard ?? (() => {});
  const activeRenderGuidanceOverlay = renderGuidanceOverlay ?? renderTutorialOverlay ?? (() => {});
  const activeGuidanceState = guidanceState ?? tutorialState ?? null;
  const activeGuidanceStep = guidanceStep ?? tutorialStep;
  const activeGuidanceStepScope = guidanceStepScope ?? tutorialStepScope;
  const activeGuidanceStepConcepts = guidanceStepConcepts ?? tutorialStepConcepts;
  const activeGuidanceRevealedConcepts = guidanceRevealedConcepts ?? tutorialRevealedConcepts;
  const activeGuidanceReplayScopeKey = guidanceReplayScopeKey ?? tutorialReplayScopeKey;
  const activeGuidanceReplayStepId = guidanceReplayStepId ?? tutorialReplayStepId;
  const activeGuidanceDisabledScopeKeys = guidanceDisabledScopeKeys ?? tutorialDisabledScopeKeys;
  const activeGuidanceDisabledPages = guidanceDisabledPages ?? tutorialDisabledPages;
  const activeGuidanceSurfaceState = guidanceSurfaceState ?? tutorialSurfaceState;
  const publishRuntimeView = publishGuidanceRuntimeView ?? publishTutorialRuntimeView ?? (() => {});
  return () => {
    const model = state.model || {};
    const authored = state.bootstrapState || {};
    const operator = authored.operator || {};
    const resolvedSuggestions = typeof currentSuggestions === "function"
      ? (currentSuggestions() || [])
      : (currentSuggestions || []);

    applyBootstrapShellStatusViewFn({
      view: buildBootstrapShellStatusViewFn({
        model,
        bootstrapState: authored,
        session: state.session || {},
        desktopShell: state.desktopShell
      }),
      byId
    });
    applyBootstrapShellSelectFillFn({
      model,
      bootstrapState: authored,
      runtimePluginReview: state.runtimePluginReview,
      byId,
      fillSelect,
      setSelectedValue
    });
    capabilityControls.render();
    runBootstrapProposalControlsSyncFn(buildProposalControlsSyncDeps());
    runBootstrapBackendControlsRenderFn(buildBackendControlsSyncDeps());
    runBootstrapRuntimeIntegrationDirectControlsSyncFn(buildRuntimeIntegrationDirectControlsSyncDeps());
    runBootstrapProposalAdjacentSyncFn(buildProposalAdjacentSyncDeps());
    runBootstrapScopedControlsSyncFn(buildScopedControlsSyncDeps());
    runBootstrapRouteAuthoringSyncFn(buildRouteAuthoringSyncDeps());

    renderBootstrapStateInventoryFn({
      authored,
      operator,
      byId,
      document,
      stateSnapshots,
      rowKey
    });
    renderRuntimePluginReviewDetail();

    syncBootstrapShellViewStateFn({ state });
    applyBootstrapShellViewStateFn({ state, byId });
    activeRenderGuidanceCard();
    activeRenderGuidanceOverlay();
    const snapshot = buildBootstrapGuidanceRuntimeViewFn({
      guidanceProgress: state.guidanceProgress ?? state.tutorialProgress,
      tutorialProgress: state.tutorialProgress,
      guidanceState: activeGuidanceState,
      tutorialState: tutorialState ?? activeGuidanceState,
      currentSuggestions: resolvedSuggestions,
      scopeInventoryRows: tutorialScopeInventoryRows(state.guidanceProgress ?? state.tutorialProgress),
      guidanceStep: activeGuidanceStep,
      currentSurfacePage,
      tutorialStep: tutorialStep ?? activeGuidanceStep,
      guidanceStepScope: activeGuidanceStepScope,
      tutorialStepScope: tutorialStepScope ?? activeGuidanceStepScope,
      guidanceStepConcepts: activeGuidanceStepConcepts,
      tutorialStepConcepts: tutorialStepConcepts ?? activeGuidanceStepConcepts,
      guidanceRevealedConcepts: activeGuidanceRevealedConcepts,
      tutorialRevealedConcepts: tutorialRevealedConcepts ?? activeGuidanceRevealedConcepts,
      guidanceReplayScopeKey: activeGuidanceReplayScopeKey,
      tutorialReplayScopeKey: tutorialReplayScopeKey ?? activeGuidanceReplayScopeKey,
      guidanceReplayStepId: activeGuidanceReplayStepId,
      tutorialReplayStepId: tutorialReplayStepId ?? activeGuidanceReplayStepId,
      guidanceDisabledScopeKeys: activeGuidanceDisabledScopeKeys,
      tutorialDisabledScopeKeys: tutorialDisabledScopeKeys ?? activeGuidanceDisabledScopeKeys,
      guidanceDisabledPages: activeGuidanceDisabledPages,
      tutorialDisabledPages: tutorialDisabledPages ?? activeGuidanceDisabledPages,
      guidanceDisabledContextIds,
      guidanceSurfaceState: activeGuidanceSurfaceState,
      tutorialSurfaceState: tutorialSurfaceState ?? activeGuidanceSurfaceState
    });
    publishRuntimeView(snapshot);
    if (publishGuidanceRuntimeView && publishGuidanceRuntimeView !== publishRuntimeView) publishGuidanceRuntimeView(snapshot);
    if (publishTutorialRuntimeView && publishTutorialRuntimeView !== publishRuntimeView) publishTutorialRuntimeView(snapshot);
  };
}
