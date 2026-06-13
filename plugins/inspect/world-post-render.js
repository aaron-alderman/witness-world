export function renderWorldPostRenderFactory() {
  return String.raw`
    const queuePendingWorldSourceLoad = ${queuePendingWorldSourceLoad.toString()};
    const syncWorldGraphViewport = ${syncWorldGraphViewport.toString()};
    const syncWorldTutorialRenderState = ${syncWorldTutorialRenderState.toString()};
    const runWorldPostRender = ${runWorldPostRender.toString()};
  `;
}

export function queuePendingWorldSourceLoad({
  state = {},
  currentMode = () => "graph",
  openSourceForSelected = async () => {},
  byWidget = () => null,
  widget = null,
  redraw = () => {}
} = {}) {
  if (!state.worldGraphInitialSourcePending || currentMode() !== "source" || state.worldGraphSource || state.worldGraphSourceLoading) return false;
  state.worldGraphInitialSourcePending = false;
  state.worldGraphSourceLoading = true;
  void openSourceForSelected()
    .catch(() => {})
    .finally(() => {
      state.worldGraphSourceLoading = false;
      if (byWidget(widget)) redraw();
    });
  return true;
}

export function syncWorldGraphViewport({
  root = null,
  selected = null,
  currentMode = () => "graph"
} = {}) {
  const canvas = root?.querySelector?.(".world-graph-canvas");
  if (!selected || !canvas || currentMode() !== "graph") return false;
  canvas.scrollLeft = Math.max(0, (selected.x || 0) - canvas.clientWidth / 2 + 95);
  canvas.scrollTop = Math.max(0, (selected.y || 0) - canvas.clientHeight / 2 + 28);
  return true;
}

export function syncWorldTutorialRenderState({
  state = {},
  updateWorldTutorialApi = () => {},
  worldTutorialSurfaceState = () => ({ kind: "" }),
  commandTutorialStep = () => null,
  focusWorldTutorialTarget = () => {},
  tutorialDomRoot = () => null
} = {}) {
  updateWorldTutorialApi();
  if (worldTutorialSurfaceState(state.worldTutorialProgress).kind === "active") {
    focusWorldTutorialTarget(commandTutorialStep(state.worldTutorialProgress)?.target || "");
    return "focused";
  }
  const domRoot = tutorialDomRoot();
  domRoot?.querySelectorAll?.("[data-tutorial-current]")?.forEach?.(node => node.removeAttribute?.("data-tutorial-current"));
  domRoot?.querySelectorAll?.("[data-tutorial-focus-scope]")?.forEach?.(node => node.removeAttribute?.("data-tutorial-focus-scope"));
  return "cleared";
}

export function runWorldPostRender({
  root = null,
  state = {},
  byId = {},
  getSelectedId = () => "",
  currentMode = () => "graph",
  updateWorldTutorialApi = () => {},
  worldTutorialSurfaceState = () => ({ kind: "" }),
  commandTutorialStep = () => null,
  focusWorldTutorialTarget = () => {},
  tutorialDomRoot = () => null,
  syncWorldCommandFocus = () => {}
} = {}) {
  syncWorldGraphViewport({
    root,
    selected: byId?.[getSelectedId?.()] || null,
    currentMode
  });
  syncWorldTutorialRenderState({
    state,
    updateWorldTutorialApi,
    worldTutorialSurfaceState,
    commandTutorialStep,
    focusWorldTutorialTarget,
    tutorialDomRoot
  });
  syncWorldCommandFocus({ root, state });
}
