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
  postJson = async () => ({}),
  refresh = async () => {},
  requestState = { current: 0 },
  getReview = () => null,
  setReview = () => {},
  getRuntimeProfile = () => "full",
  renderPage = () => {},
  renderDetail = () => {},
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
      if (detail.trigger === "repair") {
        const review = getReview();
        const actionId = typeof detail.actionId === "string" ? detail.actionId.trim() : "";
        const actionLabel = typeof detail.actionLabel === "string" ? detail.actionLabel.trim() : "Runtime plugin repair";
        if (!review?.serverRunner || !review?.selectedPluginId || !actionId) {
          setStatus("runtime-plugin-review-note", "Repair action is unavailable.");
          return { handled: true };
        }
        setStatus("runtime-plugin-review-note", `Submitting ${actionLabel}.`);
        const result = await postJson("/api/runtime-plugin-reconciles", {
          serverRunner: review.serverRunner,
          plugin: review.selectedPluginId,
          actionId
        });
        await refresh();
        renderDetail();
        setStatus(
          "runtime-plugin-review-note",
          result?.proposal
            ? (result.statusMessage || `Proposed ${actionLabel} for review.`)
            : `${actionLabel} applied.`
        );
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
  postJson = async () => ({}),
  refresh = async () => {},
  requestState = { current: 0 },
  getReview = () => null,
  setReview = () => {},
  getRuntimeProfile = () => "full",
  renderPage = () => {},
  renderDetail = () => {},
  setStatus = () => {}
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  const handler = createBootstrapRuntimePluginReviewSyncHandler({
    byId,
    request,
    postJson,
    refresh,
    requestState,
    getReview,
    setReview,
    getRuntimeProfile,
    renderPage,
    renderDetail,
    setStatus
  });
  resolvedTarget?.addEventListener?.("witness:bootstrap-runtime-plugin-review-sync", handler);
  if (!resolvedDocument?.getElementById) return handler;
  for (const [id, trigger] of [
    ["runtime-plugin-review-runner", "server-runner"],
    ["runtime-plugin-review-plugin", "plugin"]
  ]) {
    const field = resolvedDocument?.getElementById?.(id);
    if (!field || field.__bootstrapRuntimePluginReviewSyncBound || typeof field.addEventListener !== "function") continue;
    field.__bootstrapRuntimePluginReviewSyncBound = true;
    field.addEventListener("change", () => handler({
      detail: { source: "bootstrap-page-main", family: "runtime-plugin-review", trigger }
    }));
  }
  const detailRoot = resolvedDocument?.getElementById?.("runtime-plugin-review-detail");
  if (detailRoot && !detailRoot.__bootstrapRuntimePluginReviewActionBound && typeof detailRoot.addEventListener === "function") {
    detailRoot.__bootstrapRuntimePluginReviewActionBound = true;
    detailRoot.addEventListener("click", event => {
      const button = event?.target?.closest?.("[data-runtime-plugin-review-action-id]");
      if (!button) return;
      handler({
        detail: {
          source: "bootstrap-page-main",
          family: "runtime-plugin-review",
          trigger: "repair",
          actionId: button.dataset.runtimePluginReviewActionId || "",
          actionLabel: button.dataset.runtimePluginReviewActionLabel || "Runtime plugin repair"
        }
      });
    });
  }
  return handler;
}
