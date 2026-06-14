function clearOutbox() {
  outbox.perspective = "";
  outbox.moves = new Map();
  outbox.styles = new Map();
  outbox.camera = null;
  outbox.grid = null;
}

function updatePendingStatus() {
  const n = outboxSize();
  if (n) setStatus(n + " pending...");
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushOutbox(false);
  }, flushDelayMs);
}

function queueMove(id, geometry) {
  if (!isLive()) return;
  outbox.perspective = state.perspective;
  outbox.moves.set(id, geometry);
  scheduleFlush();
  updatePendingStatus();
}

function queueStyle(id, style) {
  if (!isLive()) return;
  outbox.perspective = state.perspective;
  outbox.styles.set(id, style);
  scheduleFlush();
  updatePendingStatus();
}

function queueCamera() {
  if (!isLive()) return;
  if (!state.perspective || !isAuthenticated()) return;
  outbox.perspective = state.perspective;
  outbox.camera = { x: state.camera.x, y: state.camera.y, zoom: state.camera.zoom };
  scheduleFlush();
  updatePendingStatus();
}

function queueGrid() {
  if (!isLive()) return;
  outbox.perspective = state.perspective;
  outbox.grid = { snap: state.grid.snap, size: state.grid.size };
  scheduleFlush();
  updatePendingStatus();
}

function buildBatchParams() {
  const params = { perspective: outbox.perspective };
  if (outbox.moves.size) params.moves = [...outbox.moves.entries()].map(e => Object.assign({ instance: e[0] }, e[1]));
  if (outbox.styles.size) params.styles = [...outbox.styles.entries()].map(e => ({ instance: e[0], style: e[1] }));
  if (outbox.camera) params.camera = outbox.camera;
  if (outbox.grid) params.grid = outbox.grid;
  return params;
}

async function flushOutbox(force) {
  clearTimeout(flushTimer);
  if (flushInFlight) await flushInFlight;
  if (!outboxSize()) return;
  if (!force && state.drag) {
    scheduleFlush();
    return;
  }
  const params = buildBatchParams();
  clearOutbox();
  flushInFlight = post("canvas.batch", params);
  await flushInFlight;
  flushInFlight = null;
  await refresh();
}

function flushKeepalive() {
  if (!outboxSize()) return;
  const params = buildBatchParams();
  clearOutbox();
  fetch("/api/canvas/process", {
    method: "POST",
    headers: headers(),
    keepalive: true,
    body: JSON.stringify({ process: "canvas.batch", params })
  });
}

function bindCanvasKeepaliveRuntime() {
  window.addEventListener("pagehide", flushKeepalive);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushKeepalive();
  });
}

export function renderCanvasSyncRuntimePrelude() {
  return `
${clearOutbox.toString()}
${updatePendingStatus.toString()}
${scheduleFlush.toString()}
${queueMove.toString()}
${queueStyle.toString()}
${queueCamera.toString()}
${queueGrid.toString()}
${buildBatchParams.toString()}
${flushOutbox.toString()}
${flushKeepalive.toString()}
${bindCanvasKeepaliveRuntime.toString()}
`;
}
