import { runtimePluginProposalBody, mcpServerProposalBody, mcpToolProposalBody } from "./bootstrap-proposal-adjacent.js";
import { bindBootstrapClientRuntimeAdapters } from "./bootstrap-client-runtime-binders.js";
import { createBootstrapClientRuntimeGuidance } from "./bootstrap-client-runtime-guidance.js";
import { createBootstrapClientHttp } from "./bootstrap-client-http.js";
import { createBootstrapClientRuntimeOrchestration } from "./bootstrap-client-runtime-orchestration.js";
import { createBootstrapClientRuntimeSupport } from "./bootstrap-client-runtime-support.js";
import { runBootstrapProposalControlsSync } from "./bootstrap-proposal-controls-sync.js";
import { runBootstrapBackendControlsRender } from "./bootstrap-controls-sync.js";
import { runBootstrapRefresh } from "./bootstrap-refresh-runtime.js";
import { runBootstrapRouteAuthoringSync } from "./bootstrap-route-authoring-sync.js";
import { loadBootstrapRuntimePluginReview } from "./bootstrap-runtime-plugin-review-sync.js";
import { createBootstrapRenderRuntime } from "./bootstrap-shell-render-runtime.js";
import { runBootstrapScopedControlsSync } from "./bootstrap-scoped-controls-sync.js";
import { runBootstrapProposalAdjacentSync } from "./bootstrap-proposal-adjacent-sync.js";
import { runBootstrapRuntimeIntegrationDirectControlsSync } from "./bootstrap-runtime-integration-direct-controls-sync.js";

export function renderBootstrapClientRuntimeFactory() {
  return String.raw`
    const createBootstrapRuntimeState = ${createBootstrapRuntimeState.toString()};
    const syncGuidanceProgressAlias = ${syncGuidanceProgressAlias.toString()};
    const startBootstrapClientRuntime = ${startBootstrapClientRuntime.toString()};
  `;
}

function syncGuidanceProgressAlias(state, progress) {
  state.guidanceProgress = progress;
  state.tutorialProgress = progress;
  return progress;
}

function createBootstrapRuntimeState() {
  const state = {
    model: null,
    bootstrapState: null,
    session: null,
    guidanceProgress: null,
    runtimePluginReview: null,
    desktopShell: null
  };
  Object.defineProperty(state, "tutorialProgress", {
    configurable: true,
    enumerable: false,
    get() {
      return state.guidanceProgress;
    },
    set(value) {
      state.guidanceProgress = value;
    }
  });
  return state;
}

export function startBootstrapClientRuntime({
  guidance = null,
  tutorial,
  currentSurfacePage = "bootstrap",
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null,
  fetchFn = (...args) => fetch(...args)
} = {}) {
  const state = createBootstrapRuntimeState();
  const runtimePluginReviewRequestState = { current: 0 };
  const bootstrapControlsRuntime = createBootstrapControlsRuntimeFromBootstrap({ state });
  const { dom, liveState } = bootstrapControlsRuntime;
  const { byId, setStatus, formField, fillSelect, readSelectValue, readFieldValue, setSelectedValue, setSubmitDisabled } = dom;
  const { request, postJson } = createBootstrapClientHttp({ fetchFn });
  const {
    stateSnapshots,
    escapeHtml,
    byTarget,
    desktopApi,
    sleep,
    rowKey,
    renderRuntimePluginReviewDetail,
    publishRuntimeView
  } = createBootstrapClientRuntimeSupport({
    state,
    documentTarget,
    windowTarget,
    byId,
    setStatus,
    buildBootstrapRuntimePluginReviewViewFn: buildBootstrapRuntimePluginReviewView,
    renderBootstrapStateItemsFn: renderBootstrapStateItems
  });
  const {
    guidance: activeGuidance,
    tutorialRuntime: guidanceRuntime,
    render,
    refresh,
    startupPromise
  } = createBootstrapClientRuntimeOrchestration({
    guidance,
    tutorial,
    state,
    currentSurfacePage,
    documentTarget,
    windowTarget,
    request,
    postJson,
    byId,
    setStatus,
    formField,
    fillSelect,
    setSelectedValue,
    desktopApi,
    stateSnapshots,
    rowKey,
    renderRuntimePluginReviewDetail,
    publishRuntimeView,
    runtimePluginReviewRequestState,
    bootstrapControlsRuntime,
    support: {
      escapeHtml,
      byTarget,
      sleep
    },
    createBootstrapClientRuntimeGuidanceFn: globalThis?.createBootstrapClientRuntimeGuidance || createBootstrapClientRuntimeGuidance,
    runBootstrapRefreshFn: globalThis?.runBootstrapRefresh || runBootstrapRefresh,
    bindBootstrapClientRuntimeAdaptersFn: globalThis?.bindBootstrapClientRuntimeAdapters || bindBootstrapClientRuntimeAdapters,
    createBootstrapRenderRuntimeFn: globalThis?.createBootstrapRenderRuntime || createBootstrapRenderRuntime,
    runBootstrapProposalControlsSyncFn: globalThis?.runBootstrapProposalControlsSync || runBootstrapProposalControlsSync,
    runBootstrapBackendControlsRenderFn: globalThis?.runBootstrapBackendControlsRender || runBootstrapBackendControlsRender,
    runBootstrapRuntimeIntegrationDirectControlsSyncFn: globalThis?.runBootstrapRuntimeIntegrationDirectControlsSync || runBootstrapRuntimeIntegrationDirectControlsSync,
    runBootstrapProposalAdjacentSyncFn: globalThis?.runBootstrapProposalAdjacentSync || runBootstrapProposalAdjacentSync,
    runBootstrapScopedControlsSyncFn: globalThis?.runBootstrapScopedControlsSync || runBootstrapScopedControlsSync,
    runBootstrapRouteAuthoringSyncFn: globalThis?.runBootstrapRouteAuthoringSync || runBootstrapRouteAuthoringSync,
    loadBootstrapRuntimePluginReviewFn: globalThis?.loadBootstrapRuntimePluginReview || loadBootstrapRuntimePluginReview,
    runtimePluginProposalBodyFn: globalThis?.runtimePluginProposalBody || runtimePluginProposalBody,
    mcpServerProposalBodyFn: globalThis?.mcpServerProposalBody || mcpServerProposalBody,
    mcpToolProposalBodyFn: globalThis?.mcpToolProposalBody || mcpToolProposalBody,
    syncGuidanceProgressAliasFn: syncGuidanceProgressAlias
  });
  return {
    guidance: activeGuidance,
    state,
    runtimePluginReviewRequestState,
    bootstrapControlsRuntime,
    tutorialRuntime: guidanceRuntime,
    guidanceRuntime,
    render,
    refresh,
    startupPromise
  };
}
