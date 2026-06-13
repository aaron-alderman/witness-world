import { loadBootstrapRuntimePluginReview } from "./bootstrap-runtime-plugin-review-sync.js";

export function renderBootstrapRefreshRuntimeFactory() {
  return String.raw`
    const selectBootstrapRefreshReviewRunnerId = ${selectBootstrapRefreshReviewRunnerId.toString()};
    const runBootstrapRefresh = ${runBootstrapRefresh.toString()};
  `;
}

export function selectBootstrapRefreshReviewRunnerId({
  byId = () => null,
  runtimePluginReview = null,
  bootstrapState = null
} = {}) {
  const previousReviewRunnerId = byId("runtime-plugin-review-runner")?.value
    || runtimePluginReview?.serverRunner
    || "";
  const availableReviewRunnerIds = (bootstrapState?.serverRunners || []).map(row => row.id);
  return availableReviewRunnerIds.includes(previousReviewRunnerId)
    ? previousReviewRunnerId
    : (availableReviewRunnerIds[0] || "");
}

export async function runBootstrapRefresh({
  state = {},
  byId = () => null,
  request = async () => ({}),
  desktopApi = () => null,
  loadRuntimePluginReviewFn = loadBootstrapRuntimePluginReview,
  runtimePluginReviewRequestState = { current: 0 },
  loadTutorialProgress = async () => {},
  render = () => {},
  requestMaybeAdvanceTutorial = async () => {},
  setRuntimePluginReview = review => {
    state.runtimePluginReview = review;
  }
} = {}) {
  state.model = await request("/api/bootstrap-model");
  state.bootstrapState = await request("/api/bootstrap-state");
  state.session = await request("/api/session");
  state.desktopShell = desktopApi()
    ? await desktopApi().getDesktopShellState()
    : null;
  await loadRuntimePluginReviewFn({
    serverRunnerId: selectBootstrapRefreshReviewRunnerId({
      byId,
      runtimePluginReview: state.runtimePluginReview,
      bootstrapState: state.bootstrapState
    }),
    request,
    requestState: runtimePluginReviewRequestState,
    currentReview: state.runtimePluginReview,
    getCurrentSelectedPluginId: () => byId("runtime-plugin-review-plugin")?.value || state.runtimePluginReview?.selectedPluginId || "",
    setReview: setRuntimePluginReview,
    runtimeProfile: state.model?.runtimeProfile || "full"
  });
  await loadTutorialProgress();
  render();
  await requestMaybeAdvanceTutorial();
  render();
}
