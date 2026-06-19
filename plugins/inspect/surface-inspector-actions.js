export function renderSurfaceInspectorActionsFactory() {
  return String.raw`
    const bindSurfaceInspectorActions = ${bindSurfaceInspectorActions.toString()};
  `;
}

export function bindSurfaceInspectorActions({
  overlay = null,
  state = {},
  clearSurfaceInspectorHighlight = () => {},
  setSurfaceInspectorStatus = () => {},
  selectedSurfaceWidgetId = () => "",
  applySurfaceInspectorHighlight = () => {},
  updateSurfaceInspectorUi = () => {},
  invalidateSurfaceInspectorGraph = () => {},
  invalidateSurfaceInspectorWidgets = () => {},
  invalidateSurfaceInspectorRuntimeDiagnostics = () => {},
  selectSurfaceInspectorWidget = async () => {},
  worldSurfaceHref = () => "",
  selectedSurfaceInspectorProcessSelection = () => null,
  processViewHref = () => "",
  windowTarget = globalThis?.window || null
} = {}) {
  overlay?.querySelectorAll?.("[data-surface-inspector-toggle]")?.forEach?.(node => {
    node.addEventListener?.("click", async event => {
      event.preventDefault?.();
      state.surfaceInspectorOpen = !state.surfaceInspectorOpen;
      if (!state.surfaceInspectorOpen) {
        state.surfaceInspectorMenu = null;
        clearSurfaceInspectorHighlight();
      } else {
        setSurfaceInspectorStatus("Inspector enabled. Right-click any widget on the live page.", "ok");
        if (selectedSurfaceWidgetId()) applySurfaceInspectorHighlight(selectedSurfaceWidgetId());
      }
      updateSurfaceInspectorUi();
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-close]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.surfaceInspectorOpen = false;
      state.surfaceInspectorMenu = null;
      clearSurfaceInspectorHighlight();
      updateSurfaceInspectorUi();
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-clear]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.surfaceInspectorSelectedId = "";
      state.surfaceInspectorMenu = null;
      clearSurfaceInspectorHighlight();
      setSurfaceInspectorStatus("Selection cleared. Right-click another widget to inspect it.", "ok");
      updateSurfaceInspectorUi();
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-refresh]")?.forEach?.(node => {
    node.addEventListener?.("click", async event => {
      event.preventDefault?.();
      if (!selectedSurfaceWidgetId()) {
        invalidateSurfaceInspectorGraph();
        invalidateSurfaceInspectorWidgets();
        invalidateSurfaceInspectorRuntimeDiagnostics();
        setSurfaceInspectorStatus("Inspector metadata refreshed.", "ok");
        updateSurfaceInspectorUi();
        return;
      }
      await selectSurfaceInspectorWidget(selectedSurfaceWidgetId(), {
        refreshGraph: true,
        statusMessage: "Inspector metadata refreshed for " + selectedSurfaceWidgetId() + "."
      });
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-select]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.surfaceInspectorMenu = null;
      updateSurfaceInspectorUi();
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-world]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const widgetId = selectedSurfaceWidgetId();
      if (!widgetId) return;
      windowTarget?.location?.assign?.(worldSurfaceHref({ select: widgetId }));
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-world-select]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const select = node.getAttribute?.("data-surface-inspector-world-select") || "";
      if (!select) return;
      windowTarget?.location?.assign?.(worldSurfaceHref({ select }));
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-runtime-select]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const select = node.getAttribute?.("data-surface-inspector-runtime-select") || "";
      if (!select) return;
      windowTarget?.location?.assign?.(worldSurfaceHref({ select }));
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-world-mode]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const widgetId = selectedSurfaceWidgetId();
      if (!widgetId) return;
      const mode = node.getAttribute?.("data-surface-inspector-world-mode") || "";
      windowTarget?.location?.assign?.(worldSurfaceHref({ select: widgetId, mode }));
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-open-process]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const selection = selectedSurfaceInspectorProcessSelection();
      if (!selection?.program || !selection?.event) return;
      windowTarget?.location?.assign?.(processViewHref(selection));
    });
  });
}
