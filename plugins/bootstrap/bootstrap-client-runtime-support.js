export function renderBootstrapClientRuntimeSupportFactory() {
  return String.raw`
    const escapeBootstrapHtml = ${escapeBootstrapHtml.toString()};
    const bootstrapStateInventoryRowKey = ${bootstrapStateInventoryRowKey.toString()};
    const createBootstrapClientRuntimeSupport = ${createBootstrapClientRuntimeSupport.toString()};
  `;
}

export function escapeBootstrapHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function bootstrapStateInventoryRowKey(row) {
  return row?.id
    || [row?.program, row?.event, row?.op, row?.order, row?.serverRunner, row?.path, row?.method, row?.actor, row?.label]
      .filter(value => value != null && value !== "")
      .join("\u0000")
    || JSON.stringify(row);
}

export function createBootstrapClientRuntimeSupport({
  state = {},
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null,
  byId = () => null,
  setStatus = () => {},
  buildBootstrapRuntimePluginReviewViewFn = null,
  renderBootstrapStateItemsFn = null
} = {}) {
  const stateSnapshots = new Map();
  const byTarget = target => documentTarget?.querySelector?.(
    '[data-guidance-target="' + CSS.escape(target) + '"], [data-tutorial-target="' + CSS.escape(target) + '"]'
  );
  const desktopApi = () => (windowTarget?.witnessDesktop && typeof windowTarget.witnessDesktop.getDesktopShellState === "function")
    ? windowTarget.witnessDesktop
    : null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const renderRuntimePluginReviewDetail = () => {
    const view = buildBootstrapRuntimePluginReviewViewFn({
      review: state.runtimePluginReview || null,
      runtimeProfile: state.model?.runtimeProfile || "full"
    });
    renderBootstrapStateItemsFn({
      id: "runtime-plugin-review-detail",
      items: view.detailItems,
      byId,
      document: documentTarget
    });
    setStatus("runtime-plugin-review-note", view.noteText);
  };
  const publishRuntimeView = snapshot => {
    windowTarget.__witnessGuidance = snapshot;
    windowTarget.__witnessTutorial = snapshot;
  };

  return {
    stateSnapshots,
    escapeHtml: escapeBootstrapHtml,
    byTarget,
    desktopApi,
    sleep,
    rowKey: bootstrapStateInventoryRowKey,
    renderRuntimePluginReviewDetail,
    publishRuntimeView
  };
}
