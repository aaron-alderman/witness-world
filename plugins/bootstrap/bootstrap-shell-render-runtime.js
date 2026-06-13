import {
  applyBootstrapShellSelectFill,
  applyBootstrapShellStatusView,
  buildBootstrapShellStatusView
} from "./bootstrap-shell-render-view.js";
import { renderBootstrapStateInventory } from "./bootstrap-state-list-render.js";
import { buildBootstrapTutorialRuntimeView } from "./bootstrap-tutorial-runtime-view.js";
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
  renderTutorialCard = () => {},
  renderTutorialOverlay = () => {},
  buildBootstrapTutorialRuntimeViewFn = buildBootstrapTutorialRuntimeView,
  tutorialState = null,
  currentSuggestions = [],
  tutorialStep = () => null,
  tutorialStepScope = () => null,
  tutorialStepConcepts = () => [],
  tutorialRevealedConcepts = () => [],
  tutorialReplayScopeKey = () => null,
  tutorialReplayStepId = () => null,
  tutorialDisabledScopeKeys = () => [],
  tutorialDisabledPages = () => [],
  tutorialSurfaceState = () => ({ kind: "unknown" }),
  publishTutorialRuntimeView = () => {},
  buildBootstrapShellStatusViewFn = buildBootstrapShellStatusView,
  applyBootstrapShellStatusViewFn = applyBootstrapShellStatusView,
  applyBootstrapShellSelectFillFn = applyBootstrapShellSelectFill
} = {}) {
  return () => {
    const model = state.model || {};
    const authored = state.bootstrapState || {};
    const operator = authored.operator || {};

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
    renderTutorialCard();
    renderTutorialOverlay();
    publishTutorialRuntimeView(buildBootstrapTutorialRuntimeViewFn({
      tutorialProgress: state.tutorialProgress,
      tutorialState,
      currentSuggestions,
      currentSurfacePage,
      tutorialStep,
      tutorialStepScope,
      tutorialStepConcepts,
      tutorialRevealedConcepts,
      tutorialReplayScopeKey,
      tutorialReplayStepId,
      tutorialDisabledScopeKeys,
      tutorialDisabledPages,
      tutorialSurfaceState
    }));
  };
}
