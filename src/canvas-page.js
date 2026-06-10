const CANVAS_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; font-size: 12px; background: #d4d0c8; color: #1c1c1c; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  header.canvas-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #d4d0c8; border-bottom: 2px solid #808080; flex: none; flex-wrap: wrap; }
  header.canvas-toolbar label { color: #333; }
  select, button, input { font: inherit; }
  select, input[type="text"], input[type="number"] { border: 2px inset #fff; background: #fff; padding: 2px 4px; }
  button { border: 2px outset #fff; background: #d4d0c8; padding: 2px 10px; cursor: pointer; }
  button:active { border-style: inset; }
  button.mode-active { border-style: inset; background: #c0d4ec; }
  #status { margin-left: auto; color: #444; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .canvas-shell { display: flex; flex: 1; min-height: 0; }
  .canvas-stage { position: relative; flex: 1; min-width: 0; border: 2px inset #fff; margin: 6px; background: #f4f4f1; }
  #canvas-surface { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: default; }
  #overlay-input { position: absolute; display: none; z-index: 10; min-width: 140px; border: 1px solid #336; padding: 3px 5px; box-shadow: 2px 2px 4px rgba(0,0,0,0.35); }
  aside.canvas-inspector { width: 280px; flex: none; margin: 6px 6px 6px 0; padding: 8px; background: #d4d0c8; border: 2px outset #fff; overflow-y: auto; }
  aside.canvas-inspector h2 { font-size: 12px; margin: 10px 0 4px; padding: 2px 4px; background: #0a246a; color: #fff; font-weight: 600; }
  aside.canvas-inspector h2:first-child { margin-top: 0; }
  .prop-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
  .prop-row label { width: 64px; flex: none; color: #333; }
  .prop-row input { flex: 1; min-width: 0; }
  .prop-id { color: #555; word-break: break-all; margin: 4px 0; }
  .relation-row { padding: 2px 4px; margin: 2px 0; background: #e8e6e1; border: 1px solid #aaa; word-break: break-all; }
  .palette-item { padding: 3px 6px; margin: 3px 0; background: #fff; border: 1px solid #888; cursor: pointer; word-break: break-all; }
  .palette-item:hover { background: #c0d4ec; }
  .placed-badge { color: #666; margin-left: 4px; font-weight: 600; }
  .inspector-empty { color: #555; font-style: italic; margin: 4px 0; }
  .danger { color: #7a0000; }
`;

const CANVAS_CLIENT_JS = `(() => {
  const actors = window.__CANVAS_ACTORS__ || [];
  const MIN_W = 40, MIN_H = 24;
  const FLUSH_DELAY_MS = 1500;
  const el = id => document.getElementById(id);
  const canvas = el('canvas-surface');
  const ctx = canvas.getContext('2d');
  const stage = el('canvas-stage');
  const overlayInput = el('overlay-input');
  const statusEl = el('status');

  const state = {
    actor: localStorage.getItem('witness.actor') || '',
    perspective: localStorage.getItem('witness.canvasPerspective') || '',
    model: null,
    camera: { x: 0, y: 0, zoom: 1 },
    cameraPerspective: null,
    selected: new Set(),
    selectedConnector: null,
    mode: 'select',
    grid: { snap: false, size: 20 },
    spaceDown: false,
    drag: null,
    rubber: null,
    dirty: true
  };
  const outbox = { perspective: '', moves: new Map(), styles: new Map(), camera: null, grid: null };
  let flushTimer = null;
  let flushInFlight = null;
  let overlayCommit = null;

  const setStatus = text => { statusEl.textContent = text || ''; };
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

  const headers = () => {
    const h = { 'content-type': 'application/json' };
    if (state.actor) h['x-witness-actor'] = state.actor;
    return h;
  };

  async function post(process, params) {
    if (process !== 'canvas.batch') await flushOutbox(true);
    const response = await fetch('/api/canvas/process', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ process: process, params: params })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(process + ' rejected: ' + (body.error || response.status));
      return null;
    }
    setStatus(process + ' witnessed');
    return body;
  }

  async function loadPerspectives() {
    const body = await fetch('/api/canvas/perspectives', { headers: headers() }).then(r => r.json());
    const select = el('perspective-select');
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '(choose a perspective)';
    select.appendChild(blank);
    for (const p of body.perspectives) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.title + ' (' + (p.owner || '?') + ')';
      select.appendChild(option);
    }
    if (state.perspective && body.perspectives.some(p => p.id === state.perspective)) {
      select.value = state.perspective;
    } else {
      state.perspective = '';
      select.value = '';
    }
  }

  async function loadCanvas() {
    if (!state.perspective) { state.model = null; renderInspector(); markDirty(); return; }
    const response = await fetch('/api/canvas?perspective=' + encodeURIComponent(state.perspective), { headers: headers() });
    if (!response.ok) { state.model = null; setStatus('perspective not found'); renderInspector(); markDirty(); return; }
    const body = await response.json();
    state.model = body.canvas;
    if (state.cameraPerspective !== state.perspective) {
      state.cameraPerspective = state.perspective;
      const camera = state.model.perspective.camera;
      if (camera) state.camera = { x: camera.x || 0, y: camera.y || 0, zoom: camera.zoom || 1 };
      else state.camera = { x: 0, y: 0, zoom: 1 };
    }
    const grid = state.model.perspective.grid;
    if (grid && !outbox.grid) state.grid = { snap: grid.snap === true, size: grid.size || 20 };
    el('snap-toggle-btn').classList.toggle('mode-active', state.grid.snap);
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
    renderInspector();
    markDirty();
  }

  const refresh = () => loadCanvas();
  const findInstance = id => (state.model ? state.model.instances.find(i => i.id === id) : null);
  const connectorKey = c => c.from + ' ' + c.rel + ' ' + c.to + ' ' + c.fromInstance + ' ' + c.toInstance;
  const findConnector = key => (state.model ? state.model.connectors.find(c => connectorKey(c) === key) : null);

  const outboxSize = () => outbox.moves.size + outbox.styles.size + (outbox.camera ? 1 : 0) + (outbox.grid ? 1 : 0);

  function clearOutbox() {
    outbox.perspective = '';
    outbox.moves = new Map();
    outbox.styles = new Map();
    outbox.camera = null;
    outbox.grid = null;
  }

  function updatePendingStatus() {
    const n = outboxSize();
    if (n) setStatus(n + ' pending...');
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flushOutbox(false); }, FLUSH_DELAY_MS);
  }

  function queueMove(id, geometry) {
    outbox.perspective = state.perspective;
    outbox.moves.set(id, geometry);
    scheduleFlush();
    updatePendingStatus();
  }

  function queueStyle(id, style) {
    outbox.perspective = state.perspective;
    outbox.styles.set(id, style);
    scheduleFlush();
    updatePendingStatus();
  }

  function queueCamera() {
    if (!state.perspective || !state.actor) return;
    outbox.perspective = state.perspective;
    outbox.camera = { x: state.camera.x, y: state.camera.y, zoom: state.camera.zoom };
    scheduleFlush();
    updatePendingStatus();
  }

  function queueGrid() {
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
    if (!force && state.drag) { scheduleFlush(); return; }
    const params = buildBatchParams();
    clearOutbox();
    flushInFlight = post('canvas.batch', params);
    await flushInFlight;
    flushInFlight = null;
    await refresh();
  }

  function flushKeepalive() {
    if (!outboxSize()) return;
    const params = buildBatchParams();
    clearOutbox();
    fetch('/api/canvas/process', {
      method: 'POST',
      headers: headers(),
      keepalive: true,
      body: JSON.stringify({ process: 'canvas.batch', params: params })
    });
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    markDirty();
  }

  const screenToWorld = (px, py) => ({ x: (px - state.camera.x) / state.camera.zoom, y: (py - state.camera.y) / state.camera.zoom });

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { px: event.clientX - rect.left, py: event.clientY - rect.top };
  }

  function hitInstance(wx, wy) {
    if (!state.model) return null;
    const list = state.model.instances;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n;
    }
    return null;
  }

  const center = n => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

  function handlePositions(n) {
    return [
      ['nw', n.x, n.y], ['n', n.x + n.w / 2, n.y], ['ne', n.x + n.w, n.y],
      ['e', n.x + n.w, n.y + n.h / 2], ['se', n.x + n.w, n.y + n.h],
      ['s', n.x + n.w / 2, n.y + n.h], ['sw', n.x, n.y + n.h], ['w', n.x, n.y + n.h / 2]
    ];
  }

  function hitHandle(n, wx, wy) {
    const tolerance = 6 / state.camera.zoom;
    for (const h of handlePositions(n)) {
      if (Math.abs(wx - h[1]) <= tolerance && Math.abs(wy - h[2]) <= tolerance) return h[0];
    }
    return null;
  }

  function cursorForHandle(h) {
    if (h === 'nw' || h === 'se') return 'nwse-resize';
    if (h === 'ne' || h === 'sw') return 'nesw-resize';
    if (h === 'n' || h === 's') return 'ns-resize';
    if (h === 'e' || h === 'w') return 'ew-resize';
    return null;
  }

  function segmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function hitConnector(wx, wy) {
    if (!state.model) return null;
    for (const c of state.model.connectors) {
      const a = findInstance(c.fromInstance), b = findInstance(c.toInstance);
      if (!a || !b) continue;
      const ca = center(a), cb = center(b);
      if (segmentDistance(wx, wy, ca.x, ca.y, cb.x, cb.y) <= 6 / state.camera.zoom) return c;
    }
    return null;
  }

  function rectEdgePoint(node, towards) {
    const c = center(node);
    const dx = towards.x - c.x, dy = towards.y - c.y;
    if (!dx && !dy) return c;
    const sx = dx ? (node.w / 2) / Math.abs(dx) : Infinity;
    const sy = dy ? (node.h / 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: c.x + dx * s, y: c.y + dy * s };
  }

  function drawNode(n) {
    const selected = state.selected.has(n.id);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(n.x, n.y, n.w, n.h, 6); else ctx.rect(n.x, n.y, n.w, n.h);
    ctx.fillStyle = (n.style && n.style.color) || '#ffffff';
    ctx.fill();
    ctx.lineWidth = (selected ? 2.5 : 1.2) / state.camera.zoom;
    ctx.strokeStyle = selected ? '#0a52c8' : '#55524c';
    ctx.stroke();
    ctx.fillStyle = (n.style && n.style.textColor) || '#1c1c1c';
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.label, n.x + n.w / 2, n.y + n.h / 2, n.w - 12);
  }

  function drawHandles(n) {
    const side = 8 / state.camera.zoom;
    ctx.lineWidth = 1 / state.camera.zoom;
    for (const h of handlePositions(n)) {
      ctx.beginPath();
      ctx.rect(h[1] - side / 2, h[2] - side / 2, side, side);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0a52c8';
      ctx.stroke();
    }
  }

  function drawConnector(c) {
    const a = findInstance(c.fromInstance), b = findInstance(c.toInstance);
    if (!a || !b) return;
    const start = rectEdgePoint(a, center(b));
    const end = rectEdgePoint(b, center(a));
    const selected = state.selectedConnector === connectorKey(c);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineWidth = (selected ? 2.4 : 1.4) / state.camera.zoom;
    ctx.strokeStyle = selected ? '#0a52c8' : '#6b6354';
    ctx.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const size = 9 / state.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - size * Math.cos(angle - 0.45), end.y - size * Math.sin(angle - 0.45));
    ctx.lineTo(end.x - size * Math.cos(angle + 0.45), end.y - size * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fillStyle = selected ? '#0a52c8' : '#6b6354';
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(c.rel, (start.x + end.x) / 2, (start.y + end.y) / 2 - 3);
  }

  function drawGrid(widthPx, heightPx) {
    const minor = 40;
    const zoom = state.camera.zoom;
    const left = -state.camera.x / zoom, top = -state.camera.y / zoom;
    const right = left + widthPx / zoom, bottom = top + heightPx / zoom;
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = '#e2e0da';
    ctx.beginPath();
    for (let x = Math.floor(left / minor) * minor; x <= right; x += minor) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    for (let y = Math.floor(top / minor) * minor; y <= bottom; y += minor) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke();
  }

  function drawMarquee() {
    const d = state.drag;
    ctx.beginPath();
    ctx.rect(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2), Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1));
    ctx.setLineDash([5 / state.camera.zoom, 4 / state.camera.zoom]);
    ctx.lineWidth = 1.2 / state.camera.zoom;
    ctx.strokeStyle = '#0a52c8';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(10, 82, 200, 0.06)';
    ctx.fill();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const widthPx = canvas.width / dpr, heightPx = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f4f4f1';
    ctx.fillRect(0, 0, widthPx, heightPx);
    if (!state.model) {
      ctx.fillStyle = '#777';
      ctx.font = '14px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.actor ? 'Create or choose a perspective to begin.' : 'Choose an actor, then a perspective.', widthPx / 2, heightPx / 2);
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
      ctx.strokeStyle = '#0a52c8';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const n of state.model.instances) drawNode(n);
    const sole = soleSelected();
    if (sole) drawHandles(sole);
    if (state.drag && state.drag.kind === 'marquee') drawMarquee();
  }

  function frame() {
    if (state.dirty) { state.dirty = false; draw(); }
    requestAnimationFrame(frame);
  }

  function showOverlay(px, py, placeholder, value, onCommit) {
    overlayInput.style.display = 'block';
    overlayInput.style.left = Math.max(4, Math.min(px, stage.clientWidth - 150)) + 'px';
    overlayInput.style.top = Math.max(4, Math.min(py, stage.clientHeight - 30)) + 'px';
    overlayInput.placeholder = placeholder;
    overlayInput.value = value || '';
    overlayCommit = onCommit;
    overlayInput.focus();
    overlayInput.select();
  }

  function hideOverlay() {
    overlayInput.style.display = 'none';
    overlayCommit = null;
  }

  overlayInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const value = overlayInput.value.trim();
      const commit = overlayCommit;
      hideOverlay();
      if (value && commit) commit(value);
    }
    if (event.key === 'Escape') hideOverlay();
    event.stopPropagation();
  });

  function setMode(mode) {
    state.mode = mode;
    el('mode-select-btn').classList.toggle('mode-active', mode === 'select');
    el('mode-connect-btn').classList.toggle('mode-active', mode === 'connect');
    el('mode-pan-btn').classList.toggle('mode-active', mode === 'pan');
    canvas.style.cursor = mode === 'connect' ? 'crosshair' : mode === 'pan' ? 'grab' : 'default';
  }

  function startPan(px, py) {
    state.drag = { kind: 'pan', startPx: px, startPy: py, camX: state.camera.x, camY: state.camera.y, moved: false };
    canvas.style.cursor = 'grabbing';
  }

  async function duplicateSelected() {
    const node = soleSelected();
    if (!node) { setStatus('select a single node to duplicate'); return; }
    const result = await post('canvas.duplicate', {
      perspective: state.perspective,
      instance: node.id,
      x: snapValue(node.x + 24),
      y: snapValue(node.y + 24)
    });
    if (result) selectOnly(result.witness.body.instance);
    await refresh();
  }

  canvas.addEventListener('pointerdown', event => {
    if (!state.model) return;
    hideOverlay();
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 1 || state.spaceDown || state.mode === 'pan') { startPan(px, py); return; }
    if (event.button !== 0) return;
    const node = hitInstance(w.x, w.y);
    if (state.mode === 'connect') {
      if (!node) return;
      const c = center(node);
      state.drag = { kind: 'rubber', from: node };
      state.rubber = { x1: c.x, y1: c.y, x2: w.x, y2: w.y };
      markDirty();
      return;
    }
    const sole = soleSelected();
    if (sole) {
      const handle = hitHandle(sole, w.x, w.y);
      if (handle) {
        state.drag = { kind: 'resize', id: sole.id, handle: handle, startRect: { x: sole.x, y: sole.y, w: sole.w, h: sole.h }, moved: false };
        return;
      }
    }
    if (node) {
      if (event.shiftKey) {
        toggleSelected(node.id);
        state.drag = null;
      } else if (state.selected.has(node.id) && selectionSize() > 1) {
        const origins = {};
        for (const id of state.selected) {
          const member = findInstance(id);
          if (member) origins[id] = { x: member.x, y: member.y };
        }
        state.drag = { kind: 'group', anchorId: node.id, origins: origins, startWX: w.x, startWY: w.y, moved: false };
      } else {
        selectOnly(node.id);
        state.drag = { kind: 'node', id: node.id, offsetX: w.x - node.x, offsetY: w.y - node.y, moved: false };
      }
    } else {
      const connector = hitConnector(w.x, w.y);
      if (connector) {
        state.selected = new Set();
        state.selectedConnector = connectorKey(connector);
        state.drag = null;
      } else {
        if (!event.shiftKey) clearSelection();
        state.drag = { kind: 'marquee', x1: w.x, y1: w.y, x2: w.x, y2: w.y, additive: event.shiftKey };
      }
    }
    renderInspector();
    markDirty();
  });

  canvas.addEventListener('pointermove', event => {
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    if (!state.drag) {
      if (state.mode === 'select' && !state.spaceDown) {
        const sole = soleSelected();
        const handle = sole ? hitHandle(sole, w.x, w.y) : null;
        canvas.style.cursor = (handle && cursorForHandle(handle)) || 'default';
      }
      return;
    }
    const drag = state.drag;
    if (drag.kind === 'node') {
      const node = findInstance(drag.id);
      if (!node) return;
      node.x = snapValue(w.x - drag.offsetX);
      node.y = snapValue(w.y - drag.offsetY);
      drag.moved = true;
    } else if (drag.kind === 'group') {
      const anchorOrigin = drag.origins[drag.anchorId];
      if (!anchorOrigin) return;
      const deltaX = snapValue(anchorOrigin.x + (w.x - drag.startWX)) - anchorOrigin.x;
      const deltaY = snapValue(anchorOrigin.y + (w.y - drag.startWY)) - anchorOrigin.y;
      for (const id of Object.keys(drag.origins)) {
        const member = findInstance(id);
        if (member) { member.x = drag.origins[id].x + deltaX; member.y = drag.origins[id].y + deltaY; }
      }
      drag.moved = true;
    } else if (drag.kind === 'resize') {
      const node = findInstance(drag.id);
      if (!node) return;
      const start = drag.startRect;
      let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
      if (drag.handle.includes('e')) right = Math.max(snapValue(w.x), left + MIN_W);
      if (drag.handle.includes('w')) left = Math.min(snapValue(w.x), right - MIN_W);
      if (drag.handle.includes('s')) bottom = Math.max(snapValue(w.y), top + MIN_H);
      if (drag.handle.includes('n')) top = Math.min(snapValue(w.y), bottom - MIN_H);
      node.x = left; node.y = top; node.w = right - left; node.h = bottom - top;
      drag.moved = true;
    } else if (drag.kind === 'marquee') {
      drag.x2 = w.x;
      drag.y2 = w.y;
    } else if (drag.kind === 'pan') {
      state.camera.x = drag.camX + (px - drag.startPx);
      state.camera.y = drag.camY + (py - drag.startPy);
      drag.moved = true;
    } else if (drag.kind === 'rubber') {
      state.rubber.x2 = w.x;
      state.rubber.y2 = w.y;
    }
    markDirty();
  });

  canvas.addEventListener('pointerup', async event => {
    const drag = state.drag;
    state.drag = null;
    if (drag && drag.kind === 'pan') canvas.style.cursor = state.mode === 'pan' || state.spaceDown ? 'grab' : 'default';
    if (!drag || !state.model) { state.rubber = null; markDirty(); return; }
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    if ((drag.kind === 'node' || drag.kind === 'resize') && drag.moved) {
      const node = findInstance(drag.id);
      if (node) {
        queueMove(node.id, { x: node.x, y: node.y, w: node.w, h: node.h });
        renderInspector();
      }
    } else if (drag.kind === 'group' && drag.moved) {
      for (const id of Object.keys(drag.origins)) {
        const member = findInstance(id);
        if (member) queueMove(member.id, { x: member.x, y: member.y, w: member.w, h: member.h });
      }
      renderInspector();
    } else if (drag.kind === 'marquee') {
      const left = Math.min(drag.x1, drag.x2), right = Math.max(drag.x1, drag.x2);
      const top = Math.min(drag.y1, drag.y2), bottom = Math.max(drag.y1, drag.y2);
      const hits = state.model.instances
        .filter(n => n.x < right && n.x + n.w > left && n.y < bottom && n.y + n.h > top)
        .map(n => n.id);
      if (drag.additive) hits.forEach(id => state.selected.add(id));
      else state.selected = new Set(hits);
      state.selectedConnector = null;
      renderInspector();
      markDirty();
    } else if (drag.kind === 'pan' && drag.moved) {
      queueCamera();
    } else if (drag.kind === 'rubber') {
      state.rubber = null;
      const target = hitInstance(w.x, w.y);
      if (target && target.id !== drag.from.id) {
        showOverlay(px, py, 'relation name', 'references', async rel => {
          await post('canvas.relate', { from: drag.from.thing, rel: rel, to: target.thing, perspective: state.perspective });
          await refresh();
        });
      }
      markDirty();
    }
  });

  canvas.addEventListener('wheel', event => {
    if (!state.model) return;
    event.preventDefault();
    const { px, py } = pointerPosition(event);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const zoom = Math.max(0.2, Math.min(4, state.camera.zoom * factor));
    state.camera.x = px - ((px - state.camera.x) / state.camera.zoom) * zoom;
    state.camera.y = py - ((py - state.camera.y) / state.camera.zoom) * zoom;
    state.camera.zoom = zoom;
    queueCamera();
    markDirty();
  }, { passive: false });

  canvas.addEventListener('dblclick', event => {
    if (!state.model) return;
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    if (hitInstance(w.x, w.y)) return;
    showOverlay(px, py, 'new thing name', '', async name => {
      await post('canvas.createThing', { perspective: state.perspective, name: name, x: snapValue(w.x), y: snapValue(w.y) });
      await refresh();
    });
  });

  window.addEventListener('keydown', async event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Space' && !event.repeat) {
      state.spaceDown = true;
      if (!state.drag) canvas.style.cursor = 'grab';
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault();
      if (state.model) await duplicateSelected();
      return;
    }
    if (event.key === 'Escape') {
      clearSelection();
      setMode('select');
      hideOverlay();
      renderInspector();
      markDirty();
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.model) {
      if (selectionSize() > 1) {
        await post('canvas.removeMany', { perspective: state.perspective, instances: [...state.selected] });
        clearSelection();
        await refresh();
      } else if (selectionSize() === 1) {
        await post('canvas.remove', { perspective: state.perspective, instance: [...state.selected][0] });
        clearSelection();
        await refresh();
      } else if (state.selectedConnector) {
        const c = findConnector(state.selectedConnector);
        if (c) await post('canvas.unrelate', { from: c.from, rel: c.rel, to: c.to });
        clearSelection();
        await refresh();
      }
    }
  });

  window.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      state.spaceDown = false;
      if (!state.drag) canvas.style.cursor = state.mode === 'connect' ? 'crosshair' : state.mode === 'pan' ? 'grab' : 'default';
    }
  });

  function propRow(labelText, input) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function textInput(value, onCommit, type) {
    const input = document.createElement('input');
    input.type = type || 'text';
    input.value = value;
    input.addEventListener('change', () => onCommit(input.value));
    input.addEventListener('keydown', event => { if (event.key === 'Enter') input.blur(); });
    return input;
  }

  function renderInspector() {
    const thingProps = el('thing-props');
    const projectionProps = el('projection-props');
    const palette = el('palette');
    thingProps.innerHTML = '';
    projectionProps.innerHTML = '';
    palette.innerHTML = '';
    if (!state.model) {
      thingProps.innerHTML = '<div class="inspector-empty">No perspective open.</div>';
      projectionProps.innerHTML = '<div class="inspector-empty">No perspective open.</div>';
      return;
    }
    if (selectionSize() > 1) {
      const count = selectionSize();
      const summary = document.createElement('div');
      summary.className = 'prop-id';
      summary.textContent = count + ' nodes selected';
      thingProps.appendChild(summary);
      const removeAll = document.createElement('button');
      removeAll.textContent = 'Remove all (' + count + ')';
      removeAll.className = 'danger';
      removeAll.addEventListener('click', async () => {
        await post('canvas.removeMany', { perspective: state.perspective, instances: [...state.selected] });
        clearSelection();
        await refresh();
      });
      projectionProps.appendChild(removeAll);
    } else if (selectionSize() === 1) {
      const node = soleSelected();
      if (node) {
        const id = document.createElement('div');
        id.className = 'prop-id';
        id.textContent = node.thing;
        thingProps.appendChild(id);
        thingProps.appendChild(propRow('Name', textInput(node.label, async value => {
          if (!value.trim()) return;
          await post('canvas.thing.setTitle', { thing: node.thing, title: value });
          await refresh();
        })));
        for (const r of node.relations || []) {
          const row = document.createElement('div');
          row.className = 'relation-row';
          row.textContent = r.from + ' \\u2192 ' + r.rel + ' \\u2192 ' + r.to;
          thingProps.appendChild(row);
        }

        const instanceId = document.createElement('div');
        instanceId.className = 'prop-id';
        instanceId.textContent = node.id;
        projectionProps.appendChild(instanceId);
        const moveWith = patch => {
          const next = Object.assign({ x: node.x, y: node.y, w: node.w, h: node.h }, patch);
          node.x = Math.round(Number.isFinite(Number(next.x)) ? Number(next.x) : node.x);
          node.y = Math.round(Number.isFinite(Number(next.y)) ? Number(next.y) : node.y);
          node.w = Math.max(MIN_W, Math.round(Number.isFinite(Number(next.w)) ? Number(next.w) : node.w));
          node.h = Math.max(MIN_H, Math.round(Number.isFinite(Number(next.h)) ? Number(next.h) : node.h));
          queueMove(node.id, { x: node.x, y: node.y, w: node.w, h: node.h });
          markDirty();
          renderInspector();
        };
        projectionProps.appendChild(propRow('X', textInput(String(node.x), v => moveWith({ x: Number(v) }), 'number')));
        projectionProps.appendChild(propRow('Y', textInput(String(node.y), v => moveWith({ y: Number(v) }), 'number')));
        projectionProps.appendChild(propRow('Width', textInput(String(node.w), v => moveWith({ w: Number(v) }), 'number')));
        projectionProps.appendChild(propRow('Height', textInput(String(node.h), v => moveWith({ h: Number(v) }), 'number')));
        const color = textInput((node.style && node.style.color) || '#ffffff', value => {
          node.style = Object.assign({}, node.style, { color: value });
          queueStyle(node.id, node.style);
          markDirty();
        }, 'color');
        projectionProps.appendChild(propRow('Color', color));
        const duplicate = document.createElement('button');
        duplicate.textContent = 'Duplicate';
        duplicate.addEventListener('click', () => duplicateSelected());
        projectionProps.appendChild(duplicate);
        const remove = document.createElement('button');
        remove.textContent = 'Remove from canvas';
        remove.className = 'danger';
        remove.addEventListener('click', async () => {
          await post('canvas.remove', { perspective: state.perspective, instance: node.id });
          clearSelection();
          await refresh();
        });
        projectionProps.appendChild(remove);
      }
    } else if (state.selectedConnector) {
      const c = findConnector(state.selectedConnector);
      if (c) {
        const row = document.createElement('div');
        row.className = 'relation-row';
        row.textContent = c.from + ' \\u2192 ' + c.rel + ' \\u2192 ' + c.to;
        thingProps.appendChild(row);
        const remove = document.createElement('button');
        remove.textContent = 'Delete relation';
        remove.className = 'danger';
        remove.addEventListener('click', async () => {
          await post('canvas.unrelate', { from: c.from, rel: c.rel, to: c.to });
          clearSelection();
          await refresh();
        });
        thingProps.appendChild(remove);
        projectionProps.innerHTML = '<div class="inspector-empty">Deletes the relation everywhere it is drawn \\u2014 a connector is one reality relation, shown once per instance pair.</div>';
      }
    } else {
      thingProps.innerHTML = '<div class="inspector-empty">Select a node or connector.</div>';
      projectionProps.innerHTML = '<div class="inspector-empty">Select a node.</div>';
    }
    for (const t of state.model.availableThings) {
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.textContent = t.label === t.id ? t.id : t.label + ' (' + t.id + ')';
      if (t.placed > 0) {
        const badge = document.createElement('span');
        badge.className = 'placed-badge';
        badge.textContent = '\\u00d7' + t.placed;
        item.appendChild(badge);
      }
      item.title = 'Place on canvas';
      item.addEventListener('click', async () => {
        const cx = snapValue((stage.clientWidth / 2 - state.camera.x) / state.camera.zoom - 80);
        const cy = snapValue((stage.clientHeight / 2 - state.camera.y) / state.camera.zoom - 28);
        await post('canvas.place', { perspective: state.perspective, thing: t.id, x: cx, y: cy });
        await refresh();
      });
      palette.appendChild(item);
    }
    if (!state.model.availableThings.length) {
      palette.innerHTML = '<div class="inspector-empty">No things yet.</div>';
    }
  }

  function initToolbar() {
    const actorSelect = el('actor-select');
    actorSelect.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '(no actor)';
    actorSelect.appendChild(blank);
    for (const a of actors) {
      const option = document.createElement('option');
      option.value = a.id;
      option.textContent = a.label || a.id;
      actorSelect.appendChild(option);
    }
    actorSelect.value = state.actor;
    actorSelect.addEventListener('change', async () => {
      await flushOutbox(true);
      state.actor = actorSelect.value;
      if (state.actor) {
        localStorage.setItem('witness.actor', state.actor);
        await fetch('/api/session', { method: 'POST', headers: headers(), body: JSON.stringify({ actor: state.actor }) });
        setStatus('perspective opened as ' + state.actor);
      } else {
        localStorage.removeItem('witness.actor');
      }
      markDirty();
    });

    el('perspective-select').addEventListener('change', async event => {
      await flushOutbox(true);
      state.perspective = event.target.value;
      localStorage.setItem('witness.canvasPerspective', state.perspective);
      clearSelection();
      await loadCanvas();
    });

    el('new-perspective-btn').addEventListener('click', () => {
      showOverlay(stage.clientWidth / 2 - 80, 40, 'perspective title', '', async title => {
        const result = await post('canvas.perspective.create', { title: title });
        if (!result) return;
        state.perspective = result.witness.body.id;
        localStorage.setItem('witness.canvasPerspective', state.perspective);
        await loadPerspectives();
        el('perspective-select').value = state.perspective;
        await loadCanvas();
      });
    });

    el('new-thing-btn').addEventListener('click', () => {
      if (!state.model) { setStatus('choose a perspective first'); return; }
      const cx = snapValue((stage.clientWidth / 2 - state.camera.x) / state.camera.zoom - 80);
      const cy = snapValue((stage.clientHeight / 2 - state.camera.y) / state.camera.zoom - 28);
      showOverlay(stage.clientWidth / 2 - 80, 40, 'new thing name', '', async name => {
        await post('canvas.createThing', { perspective: state.perspective, name: name, x: cx, y: cy });
        await refresh();
      });
    });

    el('mode-select-btn').addEventListener('click', () => setMode('select'));
    el('mode-connect-btn').addEventListener('click', () => setMode('connect'));
    el('mode-pan-btn').addEventListener('click', () => setMode('pan'));
    el('snap-toggle-btn').addEventListener('click', () => {
      if (!state.model) { setStatus('choose a perspective first'); return; }
      state.grid.snap = !state.grid.snap;
      el('snap-toggle-btn').classList.toggle('mode-active', state.grid.snap);
      queueGrid();
    });
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', flushKeepalive);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushKeepalive();
  });
  initToolbar();
  setMode('select');
  resize();
  loadPerspectives().then(loadCanvas);
  requestAnimationFrame(frame);
})();`;

export function renderCanvasPage({ actors = [] } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Witness Canvas</title>
<style>${CANVAS_CSS}</style>
</head>
<body>
<header class="canvas-toolbar">
  <label for="actor-select">Actor</label>
  <select id="actor-select"></select>
  <label for="perspective-select">Perspective</label>
  <select id="perspective-select"></select>
  <button id="new-perspective-btn" type="button">New perspective</button>
  <button id="mode-select-btn" type="button">Select</button>
  <button id="mode-connect-btn" type="button">Connect</button>
  <button id="mode-pan-btn" type="button">Pan</button>
  <button id="snap-toggle-btn" type="button">Snap</button>
  <button id="new-thing-btn" type="button">New Thing</button>
  <span id="status"></span>
</header>
<div class="canvas-shell">
  <div class="canvas-stage" id="canvas-stage">
    <canvas id="canvas-surface"></canvas>
    <input id="overlay-input" type="text" autocomplete="off">
  </div>
  <aside class="canvas-inspector">
    <h2>Thing properties</h2>
    <div id="thing-props"></div>
    <h2>Projection properties</h2>
    <div id="projection-props"></div>
    <h2>Available Things</h2>
    <div id="palette"></div>
  </aside>
</div>
<script>window.__CANVAS_ACTORS__ = ${JSON.stringify(actors)};</script>
<script>${CANVAS_CLIENT_JS}</script>
</body>
</html>`;
}
