export async function startCanvasClientRuntime({
  documentTarget = globalThis?.document || null,
  localStorageTarget = globalThis?.localStorage || null
} = {}) {
  const core = __canvasCore;
  const MIN_W = 40, MIN_H = 24;
  const FLUSH_DELAY_MS = 1500;
  const PLAY_INTERVAL_MS = 150;
  const el = id => documentTarget?.getElementById?.(id) || null;
  const canvas = el("canvas-surface");
  const ctx = canvas.getContext("2d");
  const stage = el("canvas-stage");
  const overlayInput = el("overlay-input");
  const statusEl = el("status");

  const state = {
    session: { authenticated: false, identity: null, actor: null, label: null, perspective: null },
    perspective: localStorageTarget?.getItem?.("witness.canvasPerspective") || "",
    model: null,
    camera: core.createCameraState(),
    cameraPerspective: null,
    selected: new Set(),
    selectedConnector: null,
    mode: "select",
    grid: { snap: false, size: 20 },
    spaceDown: false,
    drag: null,
    rubber: null,
    dirty: true,
    history: core.createReplayState(),
    assetPreviewCache: new Map()
  };
  const outbox = { perspective: "", moves: new Map(), styles: new Map(), camera: null, grid: null };
  let flushTimer = null;
  let flushInFlight = null;
  let overlayCommit = null;
  let projectionModule = null;
  let dropDepth = 0;

  const isLive = () => state.history.playhead === null;

  const setStatus = text => { statusEl.textContent = text || ""; };
  const markDirty = () => { state.dirty = true; };
  const snapValue = v => state.grid.snap ? Math.round(v / state.grid.size) * state.grid.size : Math.round(v);

  const selectionSize = () => state.selected.size;
  const clearSelection = () => { state.selected = new Set(); state.selectedConnector = null; };
  const selectOnly = id => { state.selected = new Set([id]); state.selectedConnector = null; };
  const toggleSelected = id => {
    state.selectedConnector = null;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
  };
  const soleSelected = () => selectionSize() === 1 ? findInstance([...state.selected][0]) : null;

  const currentActor = () => state.session?.actor || "";
  const isAuthenticated = () => Boolean(state.session?.authenticated && currentActor());
  const headers = () => ({ "content-type": "application/json" });

  const canAcceptFileDrop = () => isLive() && isAuthenticated() && Boolean(state.perspective);

  function updateDropState(active) {
    stage.classList.toggle("drop-ready", active && canAcceptFileDrop());
    stage.classList.toggle("drop-disabled", active && !canAcceptFileDrop());
  }

  function adoptModel(model, adoptCamera) {
    state.model = model;
    if (!model) { updateUndoButtons(); renderInspector(); markDirty(); return; }
    if (adoptCamera) {
      if (state.cameraPerspective !== state.perspective) {
        state.cameraPerspective = state.perspective;
        const camera = model.perspective.camera;
        if (camera) state.camera = core.createCameraState(camera);
        else state.camera = core.createCameraState();
      }
      const grid = model.perspective.grid;
      if (grid && !outbox.grid) state.grid = { snap: grid.snap === true, size: grid.size || 20 };
      el("snap-toggle-btn").classList.toggle("mode-active", state.grid.snap);
    }
    if (outbox.perspective === state.perspective) {
      for (const id of [...outbox.moves.keys()]) {
        const node = findInstance(id);
        if (!node) { outbox.moves.delete(id); continue; }
        const g = outbox.moves.get(id);
        node.x = g.x; node.y = g.y; node.w = g.w; node.h = g.h;
      }
      for (const id of [...outbox.styles.keys()]) {
        const node = findInstance(id);
        if (!node) { outbox.styles.delete(id); continue; }
        node.style = outbox.styles.get(id);
      }
      updatePendingStatus();
    }
    state.selected = new Set([...state.selected].filter(id => findInstance(id)));
    if (state.selectedConnector && !findConnector(state.selectedConnector)) state.selectedConnector = null;
    updateUndoButtons();
    renderInspector();
    markDirty();
  }

  const refresh = () => loadCanvas();
  const findInstance = id => (state.model ? state.model.instances.find(i => i.id === id) : null);
  const connectorKey = c => core.connectorKey(c);
  const findConnector = key => (state.model ? state.model.connectors.find(c => connectorKey(c) === key) : null);

  const outboxSize = () => outbox.moves.size + outbox.styles.size + (outbox.camera ? 1 : 0) + (outbox.grid ? 1 : 0);

  function updateUndoButtons() {
    const enabled = isLive() && isAuthenticated() && !!state.perspective;
    el("undo-btn").disabled = !enabled;
    el("redo-btn").disabled = !enabled;
  }

  const screenToWorld = (px, py) => core.screenToWorld(state.camera, px, py);

  const center = n => core.centerOfRect(n);

  bindCanvasKeepaliveRuntime();
  await loadCanvasProjectionModule();
  bindCanvasPointerRuntime();
  bindCanvasViewportRuntime();
  bindCanvasDropRuntime();
  bindCanvasOverlayInput();
  bindCanvasKeyboardShortcuts();
  bindCanvasToolbarRuntime({
    clearSelection,
    el,
    exitHistory,
    fetchWitnesses,
    flushOutbox,
    isLive,
    loadCanvas,
    loadPerspectives,
    logoutSession,
    markDirty,
    openSession,
    playIntervalMs: PLAY_INTERVAL_MS,
    post,
    refresh,
    renderTimeline,
    setHistoryBanner,
    setMode,
    setStatus,
    showOverlay,
    snapValue,
    stage,
    state,
    stopPlayback,
    scrubTo,
    toggleTimeline,
    updateUndoButtons,
    queueGrid
  });
  renderSessionStatus();
  setMode("select");
  startCanvasRenderRuntime();
  await initSession();
  updateUndoButtons();
  await loadPerspectives();
  await loadCanvas();
  startCanvasWitnessStream();
}

export function renderCanvasClientRuntimePrelude() {
  return String.raw`
    const startCanvasClientRuntime = ${startCanvasClientRuntime.toString()};
  `;
}
