export function renderSurfaceInspectorVersionActionsFactory() {
  return String.raw`
    const runSurfaceInspectorActivateAction = ${runSurfaceInspectorActivateAction.toString()};
    const runSurfaceInspectorRollbackAction = ${runSurfaceInspectorRollbackAction.toString()};
    const bindSurfaceInspectorVersionActions = ${bindSurfaceInspectorVersionActions.toString()};
  `;
}

export async function runSurfaceInspectorActivateAction({
  soul = "",
  version = "",
  setSurfaceInspectorStatus = () => {},
  updateSurfaceInspectorUi = () => {},
  activateSurfaceWidgetVersion = async () => ({ ok: false, body: { error: "Widget version activation failed." } }),
  invalidateSurfaceInspectorGraph = () => {},
  refreshProjection = async () => {},
  selectSurfaceInspectorWidget = async () => {}
} = {}) {
  if (!soul || !version) return false;
  setSurfaceInspectorStatus("Activating " + version + "...", "ok");
  updateSurfaceInspectorUi();
  const result = await activateSurfaceWidgetVersion({ soul, version });
  if (!result?.ok) {
    setSurfaceInspectorStatus(result?.body?.error || "Widget version activation failed.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  invalidateSurfaceInspectorGraph();
  await refreshProjection();
  await selectSurfaceInspectorWidget(soul, {
    refreshGraph: true,
    statusMessage: "Activated " + version + (result?.body?.status ? " (" + result.body.status + ")" : ".")
  });
  return true;
}

export async function runSurfaceInspectorRollbackAction({
  soul = "",
  setSurfaceInspectorStatus = () => {},
  updateSurfaceInspectorUi = () => {},
  rollbackSurfaceWidgetVersion = async () => ({ ok: false, body: { error: "Widget version rollback failed." } }),
  invalidateSurfaceInspectorGraph = () => {},
  refreshProjection = async () => {},
  selectSurfaceInspectorWidget = async () => {}
} = {}) {
  if (!soul) return false;
  setSurfaceInspectorStatus("Rolling back " + soul + "...", "ok");
  updateSurfaceInspectorUi();
  const result = await rollbackSurfaceWidgetVersion({ soul });
  if (!result?.ok) {
    setSurfaceInspectorStatus(result?.body?.error || "Widget version rollback failed.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  invalidateSurfaceInspectorGraph();
  await refreshProjection();
  await selectSurfaceInspectorWidget(soul, {
    refreshGraph: true,
    statusMessage: "Rolled back to " + (result?.body?.version || "the previous version") + "."
  });
  return true;
}

export function bindSurfaceInspectorVersionActions({
  overlay = null,
  setSurfaceInspectorStatus = () => {},
  updateSurfaceInspectorUi = () => {},
  activateSurfaceWidgetVersion = async () => ({ ok: false }),
  rollbackSurfaceWidgetVersion = async () => ({ ok: false }),
  invalidateSurfaceInspectorGraph = () => {},
  refreshProjection = async () => {},
  selectSurfaceInspectorWidget = async () => {}
} = {}) {
  overlay?.querySelectorAll?.("[data-surface-inspector-activate]")?.forEach?.(node => {
    node.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await runSurfaceInspectorActivateAction({
        soul: node.getAttribute?.("data-surface-inspector-activate") || "",
        version: node.getAttribute?.("data-surface-inspector-version") || "",
        setSurfaceInspectorStatus,
        updateSurfaceInspectorUi,
        activateSurfaceWidgetVersion,
        invalidateSurfaceInspectorGraph,
        refreshProjection,
        selectSurfaceInspectorWidget
      });
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-rollback]")?.forEach?.(node => {
    node.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await runSurfaceInspectorRollbackAction({
        soul: node.getAttribute?.("data-surface-inspector-rollback") || "",
        setSurfaceInspectorStatus,
        updateSurfaceInspectorUi,
        rollbackSurfaceWidgetVersion,
        invalidateSurfaceInspectorGraph,
        refreshProjection,
        selectSurfaceInspectorWidget
      });
    });
  });
}
