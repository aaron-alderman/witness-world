export function renderBootstrapRuntimePluginReviewSyncFactory() {
  return String.raw`
    const resolveBootstrapRuntimePluginReviewSelection = ${resolveBootstrapRuntimePluginReviewSelection.toString()};
    const loadBootstrapRuntimePluginReview = ${loadBootstrapRuntimePluginReview.toString()};
    const selectBootstrapRuntimePluginReviewPlugin = ${selectBootstrapRuntimePluginReviewPlugin.toString()};
    const createBootstrapRuntimePluginReviewSyncHandler = ${createBootstrapRuntimePluginReviewSyncHandler.toString()};
    const bindBootstrapRuntimePluginReviewSync = ${bindBootstrapRuntimePluginReviewSync.toString()};
  `;
}

export function resolveBootstrapRuntimePluginReviewSelection({
  review = {},
  selectedPluginId = "",
  currentSelectedPluginId = ""
} = {}) {
  const requestedPluginId = typeof selectedPluginId === "string" && selectedPluginId.trim()
    ? selectedPluginId.trim()
    : (typeof currentSelectedPluginId === "string" ? currentSelectedPluginId.trim() : "");
  return review.packages?.some?.(row => row.plugin === requestedPluginId)
    ? requestedPluginId
    : (review.packages?.[0]?.plugin || "");
}

export async function loadBootstrapRuntimePluginReview({
  serverRunnerId = "",
  request = async () => ({}),
  requestState = { current: 0 },
  currentReview = null,
  getCurrentSelectedPluginId = null,
  setReview = () => {},
  runtimeProfile = "full",
  selectedPluginId = ""
} = {}) {
  const runnerId = typeof serverRunnerId === "string" ? serverRunnerId.trim() : "";
  if (!runnerId) {
    setReview({
      serverRunner: null,
      activeProfile: runtimeProfile,
      authoredPluginIds: [],
      currentComposition: null,
      packages: [],
      selectedPluginId: "",
      note: "Runtime plugin review shows authored runner intent only."
    });
    return false;
  }
  const requestId = (requestState.current || 0) + 1;
  requestState.current = requestId;
  const query = new URLSearchParams({ serverRunner: runnerId });
  const review = await request("/api/runtime/plugin-reviews?" + query.toString());
  if (requestState.current !== requestId) return false;
  const currentSelectedPluginId = typeof getCurrentSelectedPluginId === "function"
    ? getCurrentSelectedPluginId()
    : (currentReview?.selectedPluginId || "");
  const resolvedPluginId = resolveBootstrapRuntimePluginReviewSelection({
    review,
    selectedPluginId,
    currentSelectedPluginId
  });
  setReview({
    ...review,
    selectedPluginId: resolvedPluginId
  });
  return true;
}

export function selectBootstrapRuntimePluginReviewPlugin({
  review = null,
  selectedPluginId = ""
} = {}) {
  if (!review) return review;
  return {
    ...review,
    selectedPluginId: resolveBootstrapRuntimePluginReviewSelection({
      review,
      selectedPluginId,
      currentSelectedPluginId: review.selectedPluginId || ""
    })
  };
}

export function createBootstrapRuntimePluginReviewSyncHandler({
  byId = () => null,
  request = async () => ({}),
  requestState = { current: 0 },
  getReview = () => null,
  setReview = () => {},
  getRuntimeProfile = () => "full",
  renderPage = () => {},
  setStatus = () => {}
} = {}) {
  return async event => {
    const detail = event?.detail || {};
    if (detail.source !== "bootstrap-page-main") return { handled: false };
    const runner = byId("runtime-plugin-review-runner");
    const plugin = byId("runtime-plugin-review-plugin");
    try {
      if (detail.trigger === "server-runner") {
        await loadBootstrapRuntimePluginReview({
          serverRunnerId: runner?.value || "",
          request,
          requestState,
          currentReview: getReview(),
          getCurrentSelectedPluginId: () => plugin?.value || getReview()?.selectedPluginId || "",
          setReview,
          runtimeProfile: getRuntimeProfile()
        });
        renderPage();
        return { handled: true };
      }
      if (detail.trigger === "plugin") {
        setReview(selectBootstrapRuntimePluginReviewPlugin({
          review: getReview(),
          selectedPluginId: plugin?.value || ""
        }));
        renderPage();
        return { handled: true };
      }
    } catch (error) {
      setStatus("runtime-plugin-review-note", error.message);
      return { handled: true, error };
    }
    return { handled: false };
  };
}

export function bindBootstrapRuntimePluginReviewSync({
  target = null,
  byId = () => null,
  request = async () => ({}),
  requestState = { current: 0 },
  getReview = () => null,
  setReview = () => {},
  getRuntimeProfile = () => "full",
  renderPage = () => {},
  setStatus = () => {}
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  if (!resolvedDocument?.getElementById) return null;
  const handler = createBootstrapRuntimePluginReviewSyncHandler({
    byId,
    request,
    requestState,
    getReview,
    setReview,
    getRuntimeProfile,
    renderPage,
    setStatus
  });
  for (const [id, trigger] of [
    ["runtime-plugin-review-runner", "server-runner"],
    ["runtime-plugin-review-plugin", "plugin"]
  ]) {
    const field = resolvedDocument?.getElementById?.(id);
    if (!field || field.__bootstrapRuntimePluginReviewSyncBound) continue;
    field.__bootstrapRuntimePluginReviewSyncBound = true;
    field.addEventListener("change", () => handler({
      detail: { source: "bootstrap-page-main", family: "runtime-plugin-review", trigger }
    }));
  }
  return handler;
}
