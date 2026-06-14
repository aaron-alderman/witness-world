async function fetchWitnesses() {
  const offset = state.history.witnesses.length;
  const response = await fetch("/api/witnesses?offset=" + offset, { headers: headers() });
  if (!response.ok) return;
  const body = await response.json();
  state.history.witnesses = state.history.witnesses.concat(body.witnesses);
}

async function loadCanvasProjectionModule() {
  try {
    projectionModule = await import('/canvas-lib/canvas-projection.js');
  } catch (e) {
    setStatus('projection module failed to load - timeline disabled');
  }
}

function historyProjection(n) {
  if (!projectionModule || !state.perspective) return null;
  return projectionModule.canvasProjection(state.history.witnesses.slice(0, n), state.perspective);
}

function setHistoryBanner() {
  const banner = el("history-banner");
  if (isLive()) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  el("history-label").textContent = "history view " + state.history.playhead + "/" + state.history.witnesses.length;
}

function stopPlayback() {
  if (state.history.playing) {
    clearInterval(state.history.playing);
    state.history.playing = null;
    el("timeline-play-btn").textContent = "Play";
  }
}

function scrubTo(n) {
  const total = state.history.witnesses.length;
  const clamped = Math.max(0, Math.min(total, Math.round(n)));
  if (clamped >= total) {
    exitHistory();
    return;
  }
  state.history.playhead = clamped;
  adoptModel(historyProjection(clamped), false);
  setHistoryBanner();
  renderTimeline();
}

async function exitHistory() {
  stopPlayback();
  state.history.playhead = null;
  setHistoryBanner();
  renderTimeline();
  await loadCanvas();
}

function renderTimeline() {
  if (!state.history.open) return;
  const witnesses = state.history.witnesses;
  const position = state.history.playhead === null ? witnesses.length : state.history.playhead;
  const slider = el("timeline-slider");
  slider.max = String(witnesses.length);
  slider.value = String(position);
  el("timeline-pos").textContent = position + "/" + witnesses.length;
  const strip = el("timeline-strip");
  strip.innerHTML = "";
  const indexed = [];
  for (let i = 0; i < witnesses.length; i++) {
    if (state.history.filter === "canvas" && witnesses[i].process.indexOf("canvas.") !== 0) continue;
    indexed.push(i);
  }
  const MAX_TICKS = 400;
  const start = Math.max(0, indexed.length - MAX_TICKS);
  if (start > 0) {
    const older = document.createElement("span");
    older.className = "timeline-older";
    older.textContent = "... " + start + " older";
    strip.appendChild(older);
  }
  for (const i of indexed.slice(start)) {
    const w = witnesses[i];
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "timeline-tick" + (w.process.indexOf("canvas.") === 0 ? " tick-canvas" : "");
    tick.textContent = w.process;
    tick.title = w.actor + " " + w.id;
    tick.addEventListener("click", () => scrubTo(i + 1));
    strip.appendChild(tick);
  }
  strip.scrollLeft = strip.scrollWidth;
}

async function toggleTimeline() {
  if (!projectionModule) {
    setStatus("projection module unavailable - timeline disabled");
    return;
  }
  await flushOutbox(true);
  await fetchWitnesses();
  state.history.open = !state.history.open;
  el("timeline-panel").hidden = !state.history.open;
  el("timeline-btn").classList.toggle("mode-active", state.history.open);
  if (!state.history.open && !isLive()) {
    await exitHistory();
    return;
  }
  renderTimeline();
}

function startCanvasWitnessStream() {
  try {
    const events = new EventSource('/api/events');
    events.onmessage = async () => {
      await fetchWitnesses();
      if (isLive()) {
        if (state.perspective) await loadCanvas();
      }
      renderTimeline();
    };
  } catch (e) {}
}

export function renderCanvasHistoryRuntimePrelude() {
  return `
${fetchWitnesses.toString()}
${loadCanvasProjectionModule.toString()}
${historyProjection.toString()}
${setHistoryBanner.toString()}
${stopPlayback.toString()}
${scrubTo.toString()}
${exitHistory.toString()}
${renderTimeline.toString()}
${toggleTimeline.toString()}
${startCanvasWitnessStream.toString()}
`;
}
