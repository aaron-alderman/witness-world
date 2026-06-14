function drawNode(n) {
  const selected = state.selected.has(n.id);
  const isAsset = n.kind === "asset";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(n.x, n.y, n.w, n.h, 6);
  else ctx.rect(n.x, n.y, n.w, n.h);
  ctx.fillStyle = (n.style && n.style.color) || (isAsset ? "#fff3cf" : "#ffffff");
  ctx.fill();
  ctx.lineWidth = (selected ? 2.5 : 1.2) / state.camera.zoom;
  ctx.strokeStyle = selected ? "#0a52c8" : (isAsset ? "#8f6a18" : "#55524c");
  ctx.stroke();
  ctx.fillStyle = (n.style && n.style.textColor) || "#1c1c1c";
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  if (isAsset && n.asset) {
    ctx.textBaseline = "middle";
    ctx.fillText(n.label, n.x + n.w / 2, n.y + n.h / 2 - 8, n.w - 12);
    ctx.fillStyle = "#5f5b52";
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillText(n.asset.mimeType || "file", n.x + n.w / 2, n.y + n.h / 2 + 10, n.w - 14);
  } else {
    ctx.textBaseline = "middle";
    ctx.fillText(n.label, n.x + n.w / 2, n.y + n.h / 2, n.w - 12);
  }
}

function drawHandles(n) {
  const side = 8 / state.camera.zoom;
  ctx.lineWidth = 1 / state.camera.zoom;
  for (const h of handlePositions(n)) {
    ctx.beginPath();
    ctx.rect(h[1] - side / 2, h[2] - side / 2, side, side);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#0a52c8";
    ctx.stroke();
  }
}

function drawGroupBounds(bounds) {
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.setLineDash([6 / state.camera.zoom, 4 / state.camera.zoom]);
  ctx.lineWidth = 1.2 / state.camera.zoom;
  ctx.strokeStyle = "#0a52c8";
  ctx.stroke();
  ctx.setLineDash([]);
  const side = 8 / state.camera.zoom;
  ctx.lineWidth = 1 / state.camera.zoom;
  for (const c of groupCorners(bounds)) {
    ctx.beginPath();
    ctx.rect(c[1] - side / 2, c[2] - side / 2, side, side);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#0a52c8";
    ctx.stroke();
  }
}

function drawConnector(c) {
  const a = findInstance(c.fromInstance);
  const b = findInstance(c.toInstance);
  if (!a || !b) return;
  const { start, end } = core.layoutConnector(a, b);
  const selected = state.selectedConnector === connectorKey(c);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.lineWidth = (selected ? 2.4 : 1.4) / state.camera.zoom;
  ctx.strokeStyle = selected ? "#0a52c8" : "#6b6354";
  ctx.stroke();
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 9 / state.camera.zoom;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle - 0.45), end.y - size * Math.sin(angle - 0.45));
  ctx.lineTo(end.x - size * Math.cos(angle + 0.45), end.y - size * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fillStyle = selected ? "#0a52c8" : "#6b6354";
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.font = '11px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(c.rel, (start.x + end.x) / 2, (start.y + end.y) / 2 - 3);
}

function drawGrid(widthPx, heightPx) {
  const minor = 40;
  const zoom = state.camera.zoom;
  const left = -state.camera.x / zoom;
  const top = -state.camera.y / zoom;
  const right = left + widthPx / zoom;
  const bottom = top + heightPx / zoom;
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = "#e2e0da";
  ctx.beginPath();
  for (let x = Math.floor(left / minor) * minor; x <= right; x += minor) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = Math.floor(top / minor) * minor; y <= bottom; y += minor) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
}

function drawMarquee() {
  const d = state.drag;
  ctx.beginPath();
  ctx.rect(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2), Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1));
  ctx.setLineDash([5 / state.camera.zoom, 4 / state.camera.zoom]);
  ctx.lineWidth = 1.2 / state.camera.zoom;
  ctx.strokeStyle = "#0a52c8";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(10, 82, 200, 0.06)";
  ctx.fill();
}

function resizeCanvasSurface() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  markDirty();
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const widthPx = canvas.width / dpr;
  const heightPx = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#f4f4f1";
  ctx.fillRect(0, 0, widthPx, heightPx);
  if (!state.model) {
    ctx.fillStyle = "#777";
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(
      isAuthenticated() ? "Create or choose a perspective to begin." : "Sign in, then choose a perspective.",
      widthPx / 2,
      heightPx / 2
    );
    return;
  }
  ctx.setTransform(dpr * state.camera.zoom, 0, 0, dpr * state.camera.zoom, dpr * state.camera.x, dpr * state.camera.y);
  drawGrid(widthPx, heightPx);
  for (const c of state.model.connectors) drawConnector(c);
  if (state.rubber) {
    ctx.beginPath();
    ctx.moveTo(state.rubber.x1, state.rubber.y1);
    ctx.lineTo(state.rubber.x2, state.rubber.y2);
    ctx.setLineDash([6 / state.camera.zoom, 4 / state.camera.zoom]);
    ctx.lineWidth = 1.4 / state.camera.zoom;
    ctx.strokeStyle = "#0a52c8";
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const n of state.model.instances) drawNode(n);
  const sole = soleSelected();
  if (sole && isLive()) drawHandles(sole);
  if (selectionSize() > 1 && isLive()) {
    const bounds = selectionBounds();
    if (bounds) drawGroupBounds(bounds);
  }
  if (state.drag && state.drag.kind === "marquee") drawMarquee();
}

function frame() {
  if (state.dirty) {
    state.dirty = false;
    draw();
  }
  requestAnimationFrame(frame);
}

function startCanvasRenderRuntime() {
  window.addEventListener("resize", resizeCanvasSurface);
  resizeCanvasSurface();
  requestAnimationFrame(frame);
}

export function renderCanvasRenderRuntimePrelude() {
  return `
${drawNode.toString()}
${drawHandles.toString()}
${drawGroupBounds.toString()}
${drawConnector.toString()}
${drawGrid.toString()}
${drawMarquee.toString()}
${resizeCanvasSurface.toString()}
${draw.toString()}
${frame.toString()}
${startCanvasRenderRuntime.toString()}
`;
}
