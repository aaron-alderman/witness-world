async function runCanvasSessionTransition(action, deps) {
  const {
    clearSelection,
    fetchWitnesses,
    flushOutbox,
    loadCanvas,
    loadPerspectives,
    markDirty,
    renderTimeline,
    setHistoryBanner,
    state,
    stopPlayback,
    updateUndoButtons
  } = deps;
  stopPlayback();
  state.history.playhead = null;
  setHistoryBanner();
  await flushOutbox(true);
  state.history.witnesses = [];
  await action();
  if (state.history.open) {
    await fetchWitnesses();
    renderTimeline();
  }
  clearSelection();
  await loadPerspectives();
  await loadCanvas();
  updateUndoButtons();
  markDirty();
}

function bindCanvasToolbarRuntime(deps) {
  const {
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
    playIntervalMs,
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
  } = deps;

  const beginSessionTransition = action => runCanvasSessionTransition(action, {
    clearSelection,
    fetchWitnesses,
    flushOutbox,
    loadCanvas,
    loadPerspectives,
    markDirty,
    renderTimeline,
    setHistoryBanner,
    state,
    stopPlayback,
    updateUndoButtons
  });

  el("session-open-btn").addEventListener("click", async () => {
    await beginSessionTransition(() => openSession());
  });
  el("session-logout-btn").addEventListener("click", async () => {
    await beginSessionTransition(() => logoutSession());
  });
  for (const sessionField of ["session-username", "session-password"]) {
    el(sessionField).addEventListener("keydown", async event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      await beginSessionTransition(() => openSession());
    });
  }

  el("perspective-select").addEventListener("change", async event => {
    stopPlayback();
    state.history.playhead = null;
    setHistoryBanner();
    await flushOutbox(true);
    state.perspective = event.target.value;
    localStorage.setItem("witness.canvasPerspective", state.perspective);
    clearSelection();
    await loadCanvas();
    renderTimeline();
  });

  el("new-perspective-btn").addEventListener("click", () => {
    showOverlay(stage.clientWidth / 2 - 80, 40, "perspective title", "", async title => {
      const result = await post("canvas.perspective.create", { title });
      if (!result) return;
      state.perspective = result.witness.body.id;
      localStorage.setItem("witness.canvasPerspective", state.perspective);
      await loadPerspectives();
      el("perspective-select").value = state.perspective;
      await loadCanvas();
    });
  });

  el("new-thing-btn").addEventListener("click", () => {
    if (!state.model) {
      setStatus("choose a perspective first");
      return;
    }
    const cx = snapValue((stage.clientWidth / 2 - state.camera.x) / state.camera.zoom - 80);
    const cy = snapValue((stage.clientHeight / 2 - state.camera.y) / state.camera.zoom - 28);
    showOverlay(stage.clientWidth / 2 - 80, 40, "new thing name", "", async name => {
      await post("canvas.createThing", { perspective: state.perspective, name, x: cx, y: cy });
      await refresh();
    });
  });

  el("mode-select-btn").addEventListener("click", () => setMode("select"));
  el("mode-connect-btn").addEventListener("click", () => setMode("connect"));
  el("mode-pan-btn").addEventListener("click", () => setMode("pan"));
  el("snap-toggle-btn").addEventListener("click", () => {
    if (!state.model) {
      setStatus("choose a perspective first");
      return;
    }
    if (!isLive()) {
      setStatus("read-only: history view");
      return;
    }
    state.grid.snap = !state.grid.snap;
    el("snap-toggle-btn").classList.toggle("mode-active", state.grid.snap);
    queueGrid();
  });

  el("undo-btn").addEventListener("click", async () => {
    if (!state.model || !isLive()) return;
    const result = await post("canvas.undo", { perspective: state.perspective });
    if (result) await refresh();
  });
  el("redo-btn").addEventListener("click", async () => {
    if (!state.model || !isLive()) return;
    const result = await post("canvas.redo", { perspective: state.perspective });
    if (result) await refresh();
  });

  el("timeline-btn").addEventListener("click", () => toggleTimeline());
  el("timeline-now-btn").addEventListener("click", () => exitHistory());
  el("history-now-btn").addEventListener("click", () => exitHistory());
  el("timeline-slider").addEventListener("input", event => scrubTo(Number(event.target.value)));
  el("timeline-filter-btn").addEventListener("click", () => {
    state.history.filter = state.history.filter === "all" ? "canvas" : "all";
    el("timeline-filter-btn").textContent = state.history.filter === "all" ? "All" : "canvas.*";
    renderTimeline();
  });
  el("timeline-play-btn").addEventListener("click", () => {
    if (!state.history.open) return;
    if (state.history.playing) {
      stopPlayback();
      return;
    }
    el("timeline-play-btn").textContent = "Stop";
    if (state.history.playhead === null) state.history.playhead = 0;
    state.history.playing = setInterval(() => {
      const current = state.history.playhead === null ? state.history.witnesses.length : state.history.playhead;
      scrubTo(current + 1);
    }, playIntervalMs);
  });
}

export function renderCanvasToolbarRuntimePrelude() {
  return `
${runCanvasSessionTransition.toString()}
${bindCanvasToolbarRuntime.toString()}
`;
}
