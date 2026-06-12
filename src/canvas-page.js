import { renderCanvasCorePrelude } from "./canvas-core.js";

const CANVAS_CSS = `
  :root { --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; font-size: 12px; background: #d4d0c8; color: #1c1c1c; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  header.canvas-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #d4d0c8; border-bottom: 2px solid #808080; flex: none; flex-wrap: wrap; }
  header.canvas-toolbar label { color: #333; }
  select, button, input { font: inherit; }
  select, input[type="text"], input[type="number"] { border: 2px inset #fff; background: #fff; padding: 2px 4px; }
  button { border: 2px outset #fff; background: #d4d0c8; padding: 2px 10px; cursor: pointer; }
  button:active { border-style: inset; }
  button.mode-active { border-style: inset; background: #c0d4ec; }
  .canvas-session { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .canvas-session-status { color: #333; min-width: 180px; }
  #status { margin-left: auto; color: #444; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .canvas-shell { display: flex; flex: 1; min-height: 0; }
  .canvas-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .canvas-stage { position: relative; flex: 1; min-width: 0; min-height: 0; border: 2px inset #fff; margin: 6px; background: #f4f4f1; }
  .canvas-stage.drop-ready { background: #eef6df; box-shadow: inset 0 0 0 2px #5f8f2b; }
  .canvas-stage.drop-disabled { background: #f6e7e7; box-shadow: inset 0 0 0 2px #a34444; }
  #history-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 5; background: #fff8d8; border: 1px solid #b89c2a; padding: 3px 8px; display: flex; align-items: center; gap: 8px; box-shadow: 1px 1px 4px rgba(0,0,0,0.25); }
  #timeline-panel { flex: none; margin: 0 6px 6px; padding: 6px; background: #d4d0c8; border: 2px outset #fff; }
  .timeline-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  #timeline-slider { flex: 1; }
  #timeline-strip { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
  .timeline-tick { flex: none; font-size: 10px; padding: 1px 5px; background: #e8e6e1; border: 1px solid #999; cursor: pointer; white-space: nowrap; }
  .timeline-tick.tick-canvas { background: #c0d4ec; }
  .timeline-older { flex: none; color: #666; font-style: italic; padding: 1px 5px; }
  #canvas-surface { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: default; }
  #overlay-input { position: absolute; display: none; z-index: 10; min-width: 140px; border: 1px solid #336; padding: 3px 5px; box-shadow: 2px 2px 4px rgba(0,0,0,0.35); }
  aside.canvas-inspector { width: 280px; flex: none; margin: 6px 6px 6px 0; padding: 8px; background: #d4d0c8; border: 2px outset #fff; overflow-y: auto; }
  aside.canvas-inspector h2 { font-size: 12px; margin: 10px 0 4px; padding: 2px 4px; background: #0a246a; color: #fff; font-weight: 600; }
  aside.canvas-inspector h2:first-child { margin-top: 0; }
  .prop-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
  .prop-row label { width: 64px; flex: none; color: #333; }
  .prop-row input { flex: 1; min-width: 0; }
  .prop-id { color: #555; word-break: break-all; margin: 4px 0; font-family: var(--mono); }
  .relation-row { padding: 2px 4px; margin: 2px 0; background: #e8e6e1; border: 1px solid #aaa; word-break: break-all; font-family: var(--mono); }
  .palette-item { padding: 3px 6px; margin: 3px 0; background: #fff; border: 1px solid #888; cursor: pointer; word-break: break-all; font-family: var(--mono); }
  .palette-item:hover { background: #c0d4ec; }
  .placed-badge { color: #666; margin-left: 4px; font-weight: 600; font-family: var(--mono); }
  .inspector-empty { color: #555; font-style: italic; margin: 4px 0; }
  .asset-preview { margin: 6px 0 2px; padding: 6px; background: #f3f0e8; border: 1px solid #9f998c; }
  .asset-preview pre { margin: 0; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--mono); }
  .asset-preview img { display: block; max-width: 100%; max-height: 220px; border: 1px solid #8c8677; background: #fff; }
  .danger { color: #7a0000; }
  #status, #history-label, #timeline-pos, .timeline-tick, .timeline-older { font-family: var(--mono); }
`;

const CANVAS_CLIENT_JS = `(async () => {
  ${renderCanvasCorePrelude()}
  const core = __canvasCore;
  const MIN_W = 40, MIN_H = 24;
  const FLUSH_DELAY_MS = 1500;
  const PLAY_INTERVAL_MS = 150;
  const el = id => document.getElementById(id);
  const canvas = el('canvas-surface');
  const ctx = canvas.getContext('2d');
  const stage = el('canvas-stage');
  const overlayInput = el('overlay-input');
  const statusEl = el('status');

  const state = {
    session: { authenticated: false, identity: null, actor: null, label: null, perspective: null },
    perspective: localStorage.getItem('witness.canvasPerspective') || '',
    model: null,
    camera: core.createCameraState(),
    cameraPerspective: null,
    selected: new Set(),
    selectedConnector: null,
    mode: 'select',
    grid: { snap: false, size: 20 },
    spaceDown: false,
    drag: null,
    rubber: null,
    dirty: true,
    history: core.createReplayState(),
    assetPreviewCache: new Map()
  };
  const outbox = { perspective: '', moves: new Map(), styles: new Map(), camera: null, grid: null };
  let flushTimer = null;
  let flushInFlight = null;
  let overlayCommit = null;
  let projectionModule = null;
  let dropDepth = 0;

  const isLive = () => state.history.playhead === null;

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

  const currentActor = () => state.session?.actor || '';
  const isAuthenticated = () => Boolean(state.session?.authenticated && currentActor());
  const headers = () => ({ 'content-type': 'application/json' });
  const syncSession = session => {
    state.session = session?.authenticated
      ? {
          authenticated: true,
          identity: session.identity || null,
          actor: session.actor || null,
          label: session.label || session.actor || null,
          perspective: session.perspective || null
        }
      : { authenticated: false, identity: null, actor: null, label: null, perspective: null };
    renderSessionStatus();
    updateUndoButtons();
    markDirty();
  };
  const renderSessionStatus = () => {
    const sessionStatus = el('session-status');
    if (!sessionStatus) return;
    sessionStatus.textContent = isAuthenticated()
      ? 'Signed in as ' + (state.session.label || currentActor()) + ' (' + currentActor() + ')' + (state.session.perspective ? ' in ' + state.session.perspective : '')
      : 'Not signed in';
    const loginButton = el('session-open-btn');
    const logoutButton = el('session-logout-btn');
    if (loginButton) loginButton.disabled = false;
    if (logoutButton) logoutButton.disabled = !isAuthenticated();
  };
  async function initSession() {
    const response = await fetch('/api/session');
    const body = await response.json().catch(() => ({ authenticated: false }));
    if (!response.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
  }
  async function openSession() {
    const username = (el('session-username')?.value || '').trim();
    const password = el('session-password')?.value || '';
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ username, password })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
    setStatus('signed in as ' + (body.label || body.actor || body.identity));
  }
  async function logoutSession() {
    const response = await fetch('/api/session', { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'logout failed');
    syncSession({ authenticated: false, identity: null, actor: null, label: null, perspective: null });
    setStatus('signed out');
  }

  async function post(process, params) {
    if (!isLive()) { setStatus('read-only: history view'); return null; }
    if (!isAuthenticated()) { setStatus('sign in first'); return null; }
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

  const canAcceptFileDrop = () => isLive() && isAuthenticated() && Boolean(state.perspective);

  function updateDropState(active) {
    stage.classList.toggle('drop-ready', active && canAcceptFileDrop());
    stage.classList.toggle('drop-disabled', active && !canAcceptFileDrop());
  }

  async function uploadAssetFile(file) {
    const form = new FormData();
    form.set('file', file, file.name || 'upload.bin');
    form.set('perspective', state.perspective || '');
    if (state.model?.perspective?.context) form.set('dropContext', state.model.perspective.context);
    const response = await fetch('/api/assets?perspective=' + encodeURIComponent(state.perspective), {
      method: 'POST',
      body: form
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: body.error || ('upload failed (' + response.status + ')') };
    }
    return { ok: true, asset: body.asset, witness: body.witness };
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
      el('snap-toggle-btn').classList.toggle('mode-active', state.grid.snap);
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

  async function loadCanvas() {
    if (!state.perspective) { adoptModel(null, false); return; }
    const response = await fetch('/api/canvas?perspective=' + encodeURIComponent(state.perspective), { headers: headers() });
    if (!response.ok) { setStatus('perspective not found'); adoptModel(null, false); return; }
    const body = await response.json();
    adoptModel(body.canvas, true);
  }

  const refresh = () => loadCanvas();
  const findInstance = id => (state.model ? state.model.instances.find(i => i.id === id) : null);
  const connectorKey = c => core.connectorKey(c);
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

  async function fetchWitnesses() {
    const offset = state.history.witnesses.length;
    const response = await fetch('/api/witnesses?offset=' + offset, { headers: headers() });
    if (!response.ok) return;
    const body = await response.json();
    state.history.witnesses = state.history.witnesses.concat(body.witnesses);
  }

  function historyProjection(n) {
    if (!projectionModule || !state.perspective) return null;
    return projectionModule.canvasProjection(state.history.witnesses.slice(0, n), state.perspective);
  }

  function setHistoryBanner() {
    const banner = el('history-banner');
    if (isLive()) { banner.hidden = true; return; }
    banner.hidden = false;
    el('history-label').textContent = 'history view ' + state.history.playhead + '/' + state.history.witnesses.length;
  }

  function updateUndoButtons() {
    const enabled = isLive() && isAuthenticated() && !!state.perspective;
    el('undo-btn').disabled = !enabled;
    el('redo-btn').disabled = !enabled;
  }

  function stopPlayback() {
    if (state.history.playing) {
      clearInterval(state.history.playing);
      state.history.playing = null;
      el('timeline-play-btn').textContent = 'Play';
    }
  }

  function scrubTo(n) {
    const total = state.history.witnesses.length;
    const clamped = Math.max(0, Math.min(total, Math.round(n)));
    if (clamped >= total) { exitHistory(); return; }
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
    const slider = el('timeline-slider');
    slider.max = String(witnesses.length);
    slider.value = String(position);
    el('timeline-pos').textContent = position + '/' + witnesses.length;
    const strip = el('timeline-strip');
    strip.innerHTML = '';
    const indexed = [];
    for (let i = 0; i < witnesses.length; i++) {
      if (state.history.filter === 'canvas' && witnesses[i].process.indexOf('canvas.') !== 0) continue;
      indexed.push(i);
    }
    const MAX_TICKS = 400;
    const start = Math.max(0, indexed.length - MAX_TICKS);
    if (start > 0) {
      const older = document.createElement('span');
      older.className = 'timeline-older';
      older.textContent = '... ' + start + ' older';
      strip.appendChild(older);
    }
    for (const i of indexed.slice(start)) {
      const w = witnesses[i];
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'timeline-tick' + (w.process.indexOf('canvas.') === 0 ? ' tick-canvas' : '');
      tick.textContent = w.process;
      tick.title = w.actor + ' ' + w.id;
      tick.addEventListener('click', () => scrubTo(i + 1));
      strip.appendChild(tick);
    }
    strip.scrollLeft = strip.scrollWidth;
  }

  async function toggleTimeline() {
    if (!projectionModule) { setStatus('projection module unavailable - timeline disabled'); return; }
    await flushOutbox(true);
    await fetchWitnesses();
    state.history.open = !state.history.open;
    el('timeline-panel').hidden = !state.history.open;
    el('timeline-btn').classList.toggle('mode-active', state.history.open);
    if (!state.history.open && !isLive()) { await exitHistory(); return; }
    renderTimeline();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    markDirty();
  }

  const screenToWorld = (px, py) => core.screenToWorld(state.camera, px, py);

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

  const center = n => core.centerOfRect(n);

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

  function selectionBounds() {
    return core.selectionBounds([...state.selected].map(findInstance));
  }

  function groupCorners(bounds) {
    return [
      ['nw', bounds.x, bounds.y],
      ['ne', bounds.x + bounds.w, bounds.y],
      ['se', bounds.x + bounds.w, bounds.y + bounds.h],
      ['sw', bounds.x, bounds.y + bounds.h]
    ];
  }

  function hitGroupCorner(bounds, wx, wy) {
    const tolerance = 7 / state.camera.zoom;
    for (const c of groupCorners(bounds)) {
      if (Math.abs(wx - c[1]) <= tolerance && Math.abs(wy - c[2]) <= tolerance) return c[0];
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

  function hitConnector(wx, wy) {
    if (!state.model) return null;
    for (const c of state.model.connectors) {
      const a = findInstance(c.fromInstance), b = findInstance(c.toInstance);
      if (!a || !b) continue;
      const { start, end } = core.layoutConnector(a, b);
      if (core.segmentDistance(wx, wy, start.x, start.y, end.x, end.y) <= 6 / state.camera.zoom) return c;
    }
    return null;
  }

  function drawNode(n) {
    const selected = state.selected.has(n.id);
    const isAsset = n.kind === 'asset';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(n.x, n.y, n.w, n.h, 6); else ctx.rect(n.x, n.y, n.w, n.h);
    ctx.fillStyle = (n.style && n.style.color) || (isAsset ? '#fff3cf' : '#ffffff');
    ctx.fill();
    ctx.lineWidth = (selected ? 2.5 : 1.2) / state.camera.zoom;
    ctx.strokeStyle = selected ? '#0a52c8' : (isAsset ? '#8f6a18' : '#55524c');
    ctx.stroke();
    ctx.fillStyle = (n.style && n.style.textColor) || '#1c1c1c';
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    if (isAsset && n.asset) {
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label, n.x + n.w / 2, n.y + n.h / 2 - 8, n.w - 12);
      ctx.fillStyle = '#5f5b52';
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.fillText(n.asset.mimeType || 'file', n.x + n.w / 2, n.y + n.h / 2 + 10, n.w - 14);
    } else {
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label, n.x + n.w / 2, n.y + n.h / 2, n.w - 12);
    }
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

  function drawGroupBounds(bounds) {
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.setLineDash([6 / state.camera.zoom, 4 / state.camera.zoom]);
    ctx.lineWidth = 1.2 / state.camera.zoom;
    ctx.strokeStyle = '#0a52c8';
    ctx.stroke();
    ctx.setLineDash([]);
    const side = 8 / state.camera.zoom;
    ctx.lineWidth = 1 / state.camera.zoom;
    for (const c of groupCorners(bounds)) {
      ctx.beginPath();
      ctx.rect(c[1] - side / 2, c[2] - side / 2, side, side);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0a52c8';
      ctx.stroke();
    }
  }

  function drawConnector(c) {
    const a = findInstance(c.fromInstance), b = findInstance(c.toInstance);
    if (!a || !b) return;
    const { start, end } = core.layoutConnector(a, b);
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
      ctx.fillText(isAuthenticated() ? 'Create or choose a perspective to begin.' : 'Sign in, then choose a perspective.', widthPx / 2, heightPx / 2);
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
    if (sole && isLive()) drawHandles(sole);
    if (selectionSize() > 1 && isLive()) {
      const bounds = selectionBounds();
      if (bounds) drawGroupBounds(bounds);
    }
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
      if (!node || !isLive()) return;
      const c = center(node);
      state.drag = { kind: 'rubber', from: node };
      state.rubber = { x1: c.x, y1: c.y, x2: w.x, y2: w.y };
      markDirty();
      return;
    }
    const sole = soleSelected();
    if (sole && isLive()) {
      const handle = hitHandle(sole, w.x, w.y);
      if (handle) {
        state.drag = { kind: 'resize', id: sole.id, handle: handle, startRect: { x: sole.x, y: sole.y, w: sole.w, h: sole.h }, moved: false };
        return;
      }
    }
    if (selectionSize() > 1 && isLive()) {
      const bounds = selectionBounds();
      const corner = bounds ? hitGroupCorner(bounds, w.x, w.y) : null;
      if (corner) {
        const origins = {};
        for (const id of state.selected) {
          const member = findInstance(id);
          if (member) origins[id] = { x: member.x, y: member.y, w: member.w, h: member.h };
        }
        state.drag = {
          kind: 'groupResize',
          corner: corner,
          anchor: {
            x: corner.indexOf('w') >= 0 ? bounds.x + bounds.w : bounds.x,
            y: corner.indexOf('n') >= 0 ? bounds.y + bounds.h : bounds.y
          },
          startCorner: {
            x: corner.indexOf('w') >= 0 ? bounds.x : bounds.x + bounds.w,
            y: corner.indexOf('n') >= 0 ? bounds.y : bounds.y + bounds.h
          },
          origins: origins,
          moved: false
        };
        return;
      }
    }
    if (node) {
      if (event.shiftKey) {
        toggleSelected(node.id);
        state.drag = null;
      } else if (isLive() && state.selected.has(node.id) && selectionSize() > 1) {
        const origins = {};
        for (const id of state.selected) {
          const member = findInstance(id);
          if (member) origins[id] = { x: member.x, y: member.y };
        }
        state.drag = { kind: 'group', anchorId: node.id, origins: origins, startWX: w.x, startWY: w.y, moved: false };
      } else if (isLive()) {
        selectOnly(node.id);
        state.drag = { kind: 'node', id: node.id, offsetX: w.x - node.x, offsetY: w.y - node.y, moved: false };
      } else {
        selectOnly(node.id);
        state.drag = null;
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
    } else if (drag.kind === 'groupResize') {
      const cornerX = snapValue(w.x), cornerY = snapValue(w.y);
      const denomX = drag.startCorner.x - drag.anchor.x;
      const denomY = drag.startCorner.y - drag.anchor.y;
      const sx = denomX ? Math.max(0.05, (cornerX - drag.anchor.x) / denomX) : 1;
      const sy = denomY ? Math.max(0.05, (cornerY - drag.anchor.y) / denomY) : 1;
      for (const id of Object.keys(drag.origins)) {
        const member = findInstance(id);
        if (!member) continue;
        const o = drag.origins[id];
        member.x = Math.round(drag.anchor.x + (o.x - drag.anchor.x) * sx);
        member.y = Math.round(drag.anchor.y + (o.y - drag.anchor.y) * sy);
        member.w = Math.max(MIN_W, Math.round(o.w * sx));
        member.h = Math.max(MIN_H, Math.round(o.h * sy));
      }
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
    } else if ((drag.kind === 'group' || drag.kind === 'groupResize') && drag.moved) {
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
    state.camera = core.zoomCameraAt(state.camera, px, py, factor);
    queueCamera();
    markDirty();
  }, { passive: false });

  canvas.addEventListener('dblclick', event => {
    if (!state.model) return;
    if (!isLive()) { setStatus('read-only: history view'); return; }
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    if (hitInstance(w.x, w.y)) return;
    showOverlay(px, py, 'new thing name', '', async name => {
      await post('canvas.createThing', { perspective: state.perspective, name: name, x: snapValue(w.x), y: snapValue(w.y) });
      await refresh();
    });
  });

  stage.addEventListener('dragenter', event => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
    dropDepth += 1;
    updateDropState(true);
    event.preventDefault();
  });

  stage.addEventListener('dragover', event => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canAcceptFileDrop() ? 'copy' : 'none';
    updateDropState(true);
  });

  stage.addEventListener('dragleave', event => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
    dropDepth = Math.max(0, dropDepth - 1);
    if (!dropDepth) updateDropState(false);
  });

  stage.addEventListener('drop', async event => {
    if (!event.dataTransfer) return;
    const files = [...event.dataTransfer.files || []];
    dropDepth = 0;
    updateDropState(false);
    if (!files.length) return;
    event.preventDefault();
    if (!isLive()) { setStatus('read-only: history view'); return; }
    if (!isAuthenticated()) { setStatus('sign in first'); return; }
    if (!state.perspective) { setStatus('choose a perspective first'); return; }
    const { px, py } = pointerPosition(event);
    const start = screenToWorld(px, py);
    let placedAny = false;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setStatus('uploading ' + file.name + '...');
      const uploaded = await uploadAssetFile(file);
      if (!uploaded.ok) {
        setStatus('upload failed for ' + file.name + ': ' + uploaded.error);
        continue;
      }
      const offset = index * 24;
      const placed = await post('canvas.place', {
        perspective: state.perspective,
        thing: uploaded.asset.id,
        x: snapValue(start.x + offset),
        y: snapValue(start.y + offset)
      });
      if (!placed) {
        setStatus('placement failed for ' + file.name + ' after upload');
        continue;
      }
      const placedInstance = placed?.witness?.body?.instance;
      if (placedInstance) selectOnly(placedInstance);
      placedAny = true;
      setStatus('uploaded ' + file.name);
    }
    if (placedAny) await refresh();
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
      if (state.model && isLive()) await duplicateSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (state.model && isLive()) {
        const result = await post('canvas.undo', { perspective: state.perspective });
        if (result) await refresh();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || event.key === 'Y')) {
      event.preventDefault();
      if (state.model && isLive()) {
        const result = await post('canvas.redo', { perspective: state.perspective });
        if (result) await refresh();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (!isLive()) { exitHistory(); return; }
      clearSelection();
      setMode('select');
      hideOverlay();
      renderInspector();
      markDirty();
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.model && isLive()) {
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
        if (c) await post('canvas.unrelate', { from: c.from, rel: c.rel, to: c.to, perspective: state.perspective });
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

  function appendReadonlyText(parent, labelText, value) {
    const input = textInput(value == null ? '' : String(value), () => {});
    input.readOnly = true;
    parent.appendChild(propRow(labelText, input));
  }

  function appendReadonlyValue(parent, labelText, value) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    const text = document.createElement('div');
    text.style.flex = '1';
    text.style.minWidth = '0';
    text.style.wordBreak = 'break-word';
    text.textContent = value == null ? '' : String(value);
    row.appendChild(label);
    row.appendChild(text);
    parent.appendChild(row);
  }

  function appendLinkRow(parent, labelText, href, text) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    const link = document.createElement('a');
    link.href = href;
    link.textContent = text || href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    row.appendChild(label);
    row.appendChild(link);
    parent.appendChild(row);
  }

  function appendPreviewRow(parent, labelText, builder) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    const box = document.createElement('div');
    box.className = 'asset-preview';
    builder(box);
    row.appendChild(label);
    row.appendChild(box);
    parent.appendChild(row);
  }

  function appendActionRow(parent, labelText, buttons) {
    if (!buttons.length) return;
    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '6px';
    controls.style.flexWrap = 'wrap';
    controls.style.flex = '1';
    for (const button of buttons) controls.appendChild(button);
    row.appendChild(label);
    row.appendChild(controls);
    parent.appendChild(row);
  }

  function derivedMetadataValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value == null) return '';
    return String(value);
  }

  function appendAssetDerivedMetadata(parent, metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return;
    const fields = [
      ['kind', 'Derived kind'],
      ['pageCount', 'Pages'],
      ['rowCount', 'Rows'],
      ['dataRowCount', 'Data rows'],
      ['columnCount', 'Columns'],
      ['headers', 'Headers'],
      ['headingCount', 'Headings'],
      ['headings', 'Heading list'],
      ['frontmatterKeyCount', 'Frontmatter keys'],
      ['frontmatterKeys', 'Frontmatter list'],
      ['sectionCount', 'Sections'],
      ['sections', 'Section list'],
      ['arrayTableCount', 'Array tables'],
      ['listCount', 'List items'],
      ['rootKind', 'Root kind'],
      ['entryCount', 'Entries'],
      ['topLevelKeyCount', 'Top-level keys'],
      ['topLevelKeys', 'Key list'],
      ['rootTag', 'Root tag'],
      ['title', 'Document title'],
      ['author', 'Author'],
      ['subject', 'Subject'],
      ['lineCount', 'Lines'],
      ['wordCount', 'Words'],
      ['charCount', 'Characters']
    ];
    for (const [key, label] of fields) {
      const value = metadata[key];
      if (value == null) continue;
      if (Array.isArray(value) && !value.length) continue;
      appendReadonlyText(parent, label, derivedMetadataValue(value));
    }
  }

  function selectInput(options, value) {
    const input = document.createElement('select');
    for (const optionRow of options) {
      const option = document.createElement('option');
      option.value = optionRow.value;
      option.textContent = optionRow.label;
      input.appendChild(option);
    }
    input.value = value || (options[0]?.value || '');
    return input;
  }

  function formatThingReference(id, title, kind) {
    const base = title && title !== id ? title + ' (' + id + ')' : (title || id || '');
    return kind ? base + ' [' + kind + ']' : base;
  }

  function thingCatalog() {
    const rows = new Map();
    const add = row => {
      if (!row || !row.id) return;
      if (rows.has(row.id)) return;
      rows.set(row.id, {
        id: row.id,
        label: row.label || row.id,
        kind: row.kind || null,
        context: row.context || null,
        contextTitle: row.contextTitle || null,
        asset: row.asset || null,
        attachedAssets: row.attachedAssets || [],
        attachedTo: row.attachedTo || [],
        attachedToRows: row.attachedToRows || []
      });
    };
    for (const row of state.model?.instances || []) add({ id: row.thing, label: row.label, kind: row.kind, context: row.context, contextTitle: row.contextTitle, asset: row.asset, attachedAssets: row.attachedAssets, attachedTo: row.attachedTo, attachedToRows: row.attachedToRows });
    for (const row of state.model?.availableThings || []) add(row);
    return [...rows.values()].sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
  }

  function attachmentCandidatesForTarget(node) {
    const attached = new Set((node?.attachedAssets || []).map(row => row.id));
    return thingCatalog().filter(row => row.asset && row.id !== node?.thing && !attached.has(row.id));
  }

  function attachmentTargetsForAsset(node) {
    const attached = new Set(node?.attachedTo || []);
    return thingCatalog().filter(row => !row.asset && row.id !== node?.thing && !attached.has(row.id));
  }

  async function attachAsset(assetId, targetId) {
    const response = await fetch('/api/assets/' + encodeURIComponent(assetId) + '/attachments', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ target: targetId, perspective: state.perspective || null })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: body.error || ('attach failed (' + response.status + ')') };
    return { ok: true, witness: body.witness };
  }

  async function detachAsset(assetId, targetId) {
    const response = await fetch('/api/assets/' + encodeURIComponent(assetId) + '/attachments?target=' + encodeURIComponent(targetId), {
      method: 'DELETE'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: body.error || ('detach failed (' + response.status + ')') };
    return { ok: true, witness: body.witness };
  }

  async function retryAssetIngest(assetId) {
    const response = await fetch('/api/assets/' + encodeURIComponent(assetId) + '/ingest/retry', {
      method: 'POST',
      headers: headers()
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: body.error || ('ingest retry failed (' + response.status + ')') };
    return { ok: true, asset: body.asset || null, job: body.job || null, witness: body.witness || null };
  }

  async function refreshAssetSearch(assetId) {
    const response = await fetch('/api/assets/' + encodeURIComponent(assetId) + '/search/reindex', {
      method: 'POST',
      headers: headers()
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: body.error || ('search refresh failed (' + response.status + ')') };
    return { ok: true, asset: body.asset || null, index: body.index || null, witness: body.witness || null };
  }

  function formatBytes(size) {
    const bytes = Number(size);
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function assetDownloadUrl(asset) {
    if (!asset) return '';
    if (asset.downloadUrl) return asset.downloadUrl;
    const contentUrl = asset.contentUrl || '';
    if (!contentUrl) return '';
    return contentUrl.includes('?') ? contentUrl + '&download=1' : contentUrl + '?download=1';
  }

  function assetCanRetryIngest(asset) {
    if (asset?.canRetryIngest === true) return true;
    const status = String(asset?.processingStatus || '');
    return status === 'dead-letter' || status === 'enqueue-failed';
  }

  function assetCanRefreshSearch(asset) {
    if (asset?.canRefreshSearch === true) return true;
    if (String(asset?.searchStatus || '') === 'manual') return true;
    return typeof asset?.searchError === 'string' && asset.searchError.trim().length > 0;
  }

  function assetProcessingSummary(asset) {
    const status = String(asset?.processingStatus || '');
    const attempt = Number(asset?.processingAttempt || 0);
    if (!status) return 'No background ingest has run yet.';
    if (status === 'queued') return attempt > 0 ? 'Queued for background ingest retry.' : 'Queued for background ingest.';
    if (status === 'running') return attempt > 1 ? 'Background ingest is retrying now.' : 'Background ingest is running.';
    if (status === 'succeeded') return 'Background ingest completed.';
    if (status === 'dead-letter') return 'Background ingest failed and needs operator retry.';
    if (status === 'enqueue-failed') return 'Background ingest could not be queued.';
    return status;
  }

  function assetSearchSummary(asset) {
    const status = String(asset?.searchStatus || '');
    if (!status) return 'Search state unknown.';
    if (status === 'manual') return 'Search refresh is manual for this asset.';
    if (status === 'reindexed') return 'Search index is refreshed.';
    if (status === 'not-built') return 'No search index has been built yet.';
    if (status === 'not-indexed') return 'This asset is not indexed in the current search build.';
    return status;
  }

  function assetPreviewMode(asset) {
    const mimeType = String(asset?.mimeType || '').toLowerCase();
    const sizeBytes = Number(asset?.sizeBytes);
    if ((!asset?.contentUrl && !asset?.thumbnailUrl && !asset?.textUrl) || !mimeType) return { kind: 'none', reason: 'Preview unavailable.' };
    if (mimeType.startsWith('image/')) return { kind: 'image' };
    if (asset?.textUrl) return { kind: 'text', source: 'derived' };
    const isTextLike = mimeType.startsWith('text/')
      || mimeType.includes('json')
      || mimeType.includes('xml')
      || mimeType.includes('javascript')
      || mimeType.includes('svg')
      || mimeType.endsWith('+json');
    if (!isTextLike) {
      if (asset?.processingStatus === 'queued' || asset?.processingStatus === 'running') {
        return { kind: 'none', reason: 'Preview will appear after processing completes.' };
      }
      if (asset?.textStatus === 'empty') return { kind: 'none', reason: 'No extracted text is available for this file.' };
      return { kind: 'none', reason: 'Preview unavailable for this file type.' };
    }
    if (Number.isFinite(sizeBytes) && sizeBytes > 128 * 1024) {
      return { kind: 'none', reason: 'Inline preview is limited to text files up to 128 KB.' };
    }
    return { kind: 'text', source: 'content' };
  }

  function assetPreviewSource(asset, mode) {
    if (mode?.kind === 'image') return asset?.thumbnailUrl || asset?.contentUrl || '';
    if (mode?.kind === 'text' && mode?.source === 'derived') return asset?.textUrl || '';
    return asset?.contentUrl || asset?.textUrl || '';
  }

  function ensureAssetPreview(asset) {
    const mode = assetPreviewMode(asset);
    if (mode.kind === 'none') return { status: 'none', reason: mode.reason };
    if (mode.kind === 'image') return { status: 'image', src: assetPreviewSource(asset, mode) };
    const previewUrl = assetPreviewSource(asset, mode);
    if (!previewUrl) return { status: 'none', reason: 'Preview unavailable.' };
    const cacheKey = asset.id + '|' + previewUrl;
    const cached = state.assetPreviewCache.get(cacheKey);
    if (cached) return cached;
    const loading = { status: 'loading' };
    state.assetPreviewCache.set(cacheKey, loading);
    fetch(previewUrl)
      .then(async response => {
        if (!response.ok) throw new Error('preview request failed (' + response.status + ')');
        const text = await response.text();
        const truncated = text.length > 12000;
        state.assetPreviewCache.set(cacheKey, {
          status: 'ready',
          text: truncated ? text.slice(0, 12000) + '\\n…' : text,
          truncated
        });
      })
      .catch(error => {
        state.assetPreviewCache.set(cacheKey, {
          status: 'error',
          reason: error?.message || 'preview failed'
        });
      })
      .finally(() => {
        const selected = soleSelected();
        if (selected?.asset?.id === asset.id) renderInspector();
      });
    return loading;
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
      const bulkColor = textInput('#ffcc00', value => {
        for (const id of state.selected) {
          const member = findInstance(id);
          if (!member) continue;
          member.style = Object.assign({}, member.style, { color: value });
          queueStyle(id, member.style);
        }
        markDirty();
      }, 'color');
      projectionProps.appendChild(propRow('Color all', bulkColor));
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
          await post('canvas.thing.setTitle', { thing: node.thing, title: value, perspective: state.perspective });
          await refresh();
        })));
        if (node.kind) {
          appendReadonlyText(thingProps, 'Kind', node.kind);
        }
        if (!node.asset && node.attachedAssets?.length) {
          for (const asset of node.attachedAssets) {
            const row = document.createElement('div');
            row.className = 'relation-row';
            row.textContent = 'attached ' + (asset.title || asset.id) + ' [' + (asset.mimeType || 'file') + ']';
            if (asset.contentUrl) {
              const link = document.createElement('a');
              link.href = asset.contentUrl;
              link.textContent = ' open';
              link.target = '_blank';
              link.rel = 'noreferrer';
              row.appendChild(link);
            }
            if (isLive()) {
              const removeAttachment = document.createElement('button');
              removeAttachment.type = 'button';
              removeAttachment.textContent = 'Detach';
              removeAttachment.dataset.assetDetachButton = asset.id;
              removeAttachment.addEventListener('click', async () => {
                const removed = await detachAsset(asset.id, node.thing);
                if (!removed.ok) {
                  setStatus('detach failed: ' + removed.error);
                  return;
                }
                setStatus('detached ' + (asset.title || asset.id));
                await refresh();
              });
              row.appendChild(document.createTextNode(' '));
              row.appendChild(removeAttachment);
            }
            thingProps.appendChild(row);
          }
        }
        if (node.asset) {
          appendReadonlyText(thingProps, 'Type', node.asset.mimeType || '');
          appendReadonlyText(thingProps, 'Size', formatBytes(node.asset.sizeBytes));
          if (node.asset.imageWidth && node.asset.imageHeight) appendReadonlyText(thingProps, 'Dimensions', node.asset.imageWidth + ' x ' + node.asset.imageHeight);
          appendReadonlyValue(
            thingProps,
            'Context',
            node.asset.context
              ? formatThingReference(node.asset.context, node.asset.contextTitle, 'context')
              : (node.context || '')
          );
          appendReadonlyText(thingProps, 'Access', node.asset.visibility || 'private');
          appendReadonlyText(thingProps, 'Store', node.asset.storageKey || '');
          if (node.asset.processingStatus) appendReadonlyText(thingProps, 'Processing', assetProcessingSummary(node.asset));
          if (node.asset.processingStatus) appendReadonlyText(thingProps, 'Processing status', node.asset.processingStatus);
          if (node.asset.processingAttempt) appendReadonlyText(thingProps, 'Processing attempt', node.asset.processingAttempt);
          if (node.asset.textStatus) appendReadonlyText(thingProps, 'Text ingest', node.asset.textStatus + (node.asset.textBytes ? ' (' + formatBytes(node.asset.textBytes) + ')' : ''));
          if (node.asset.textExtractor) appendReadonlyText(thingProps, 'Extractor', node.asset.textExtractor);
          appendAssetDerivedMetadata(thingProps, node.asset.derivedMetadata);
          if (node.asset.thumbnailStatus) appendReadonlyText(thingProps, 'Thumbnail', node.asset.thumbnailStatus);
          if (node.asset.searchStatus) appendReadonlyText(thingProps, 'Search', assetSearchSummary(node.asset));
          if (node.asset.searchStatus) appendReadonlyText(thingProps, 'Search status', node.asset.searchStatus);
          if (node.asset.searchPolicy) appendReadonlyText(thingProps, 'Search policy', node.asset.searchPolicy);
          if (node.asset.searchError) appendReadonlyText(thingProps, 'Search error', node.asset.searchError);
          if (node.asset.processingError) appendReadonlyText(thingProps, 'Last error', node.asset.processingError);
          if (node.attachedTo?.length) {
            const attachedTargets = node.asset.attachedToRows?.length
              ? node.asset.attachedToRows
              : node.attachedTo.map(targetId => ({ id: targetId, title: targetId, kind: null, context: null, contextTitle: null }));
            for (const target of attachedTargets) {
              const row = document.createElement('div');
              row.className = 'relation-row';
              row.textContent = 'attached to ' + formatThingReference(target.id, target.title, target.kind);
              if (target.context) {
                row.textContent += ' in ' + formatThingReference(target.context, target.contextTitle, 'context');
              }
              if (isLive()) {
                const removeAttachment = document.createElement('button');
                removeAttachment.type = 'button';
                removeAttachment.textContent = 'Detach';
                removeAttachment.dataset.assetDetachButton = target.id;
                removeAttachment.addEventListener('click', async () => {
                  const removed = await detachAsset(node.asset.id, target.id);
                  if (!removed.ok) {
                    setStatus('detach failed: ' + removed.error);
                    return;
                  }
                  setStatus('detached from ' + (target.title || target.id));
                  await refresh();
                });
                row.appendChild(document.createTextNode(' '));
                row.appendChild(removeAttachment);
              }
              thingProps.appendChild(row);
            }
          }
          if (node.asset.contentUrl) {
            appendLinkRow(thingProps, 'Content', node.asset.contentUrl, 'Open file');
            appendLinkRow(thingProps, 'Download', assetDownloadUrl(node.asset), 'Download file');
          }
          if (node.asset.textUrl) appendLinkRow(thingProps, 'Derived text', node.asset.textUrl, 'Open derived text');
          if (isLive() && (assetCanRetryIngest(node.asset) || assetCanRefreshSearch(node.asset))) {
            const actions = [];
            if (assetCanRetryIngest(node.asset)) {
              const retryButton = document.createElement('button');
              retryButton.type = 'button';
              retryButton.textContent = 'Retry ingest';
              retryButton.dataset.assetRetryIngestButton = node.asset.id;
              retryButton.addEventListener('click', async () => {
                setStatus('retrying ingest for ' + (node.label || node.asset.id) + '...');
                const retried = await retryAssetIngest(node.asset.id);
                if (!retried.ok) {
                  setStatus('ingest retry failed for ' + (node.label || node.asset.id) + ': ' + retried.error);
                  return;
                }
                setStatus('requeued ingest for ' + (node.label || node.asset.id));
                await refresh();
              });
              actions.push(retryButton);
            }
            if (assetCanRefreshSearch(node.asset)) {
              const refreshButton = document.createElement('button');
              refreshButton.type = 'button';
              refreshButton.textContent = 'Refresh search';
              refreshButton.dataset.assetRefreshSearchButton = node.asset.id;
              refreshButton.addEventListener('click', async () => {
                setStatus('refreshing search for ' + (node.label || node.asset.id) + '...');
                const refreshed = await refreshAssetSearch(node.asset.id);
                if (!refreshed.ok) {
                  setStatus('search refresh failed for ' + (node.label || node.asset.id) + ': ' + refreshed.error);
                  return;
                }
                setStatus('refreshed search for ' + (node.label || node.asset.id));
                await refresh();
              });
              actions.push(refreshButton);
            }
            appendActionRow(thingProps, 'Repair', actions);
          }
          const preview = ensureAssetPreview(node.asset);
          if (preview.status === 'image') {
            appendPreviewRow(thingProps, 'Preview', box => {
              const image = document.createElement('img');
              image.src = preview.src;
              image.alt = node.label || node.asset.originalName || node.asset.id || 'asset preview';
              box.appendChild(image);
            });
          } else if (preview.status === 'loading') {
            appendPreviewRow(thingProps, 'Preview', box => {
              box.textContent = 'Loading preview...';
            });
          } else if (preview.status === 'ready') {
            appendPreviewRow(thingProps, 'Preview', box => {
              const pre = document.createElement('pre');
              pre.textContent = preview.text;
              box.appendChild(pre);
            });
          } else if (preview.status === 'error') {
            appendPreviewRow(thingProps, 'Preview', box => {
              box.textContent = 'Preview failed: ' + preview.reason;
            });
          } else if (preview.status === 'none' && preview.reason) {
            appendPreviewRow(thingProps, 'Preview', box => {
              box.textContent = preview.reason;
            });
          }
          if (isLive()) {
            const targets = attachmentTargetsForAsset(node);
            if (targets.length) {
              const attachRow = document.createElement('div');
              attachRow.className = 'prop-row';
              const label = document.createElement('label');
              label.textContent = 'Attach to';
              const controls = document.createElement('div');
              controls.style.display = 'flex';
              controls.style.gap = '6px';
              controls.style.flex = '1';
              const picker = selectInput(targets.map(target => ({
                value: target.id,
                label: (target.label || target.id) + ' [' + (target.kind || 'thing') + ']'
              })), targets[0]?.id || '');
              picker.dataset.assetAttachTarget = 'true';
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = 'Attach';
              button.dataset.assetAttachButton = node.asset.id;
              button.addEventListener('click', async () => {
                const attached = await attachAsset(node.asset.id, picker.value);
                if (!attached.ok) {
                  setStatus('attach failed: ' + attached.error);
                  return;
                }
                setStatus('attached ' + (node.label || node.asset.id));
                await refresh();
              });
              controls.appendChild(picker);
              controls.appendChild(button);
              attachRow.appendChild(label);
              attachRow.appendChild(controls);
              thingProps.appendChild(attachRow);
            }
          }
        } else if (isLive()) {
          const candidates = attachmentCandidatesForTarget(node);
          if (candidates.length) {
            const attachRow = document.createElement('div');
            attachRow.className = 'prop-row';
            const label = document.createElement('label');
            label.textContent = 'Attach file';
            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.gap = '6px';
            controls.style.flex = '1';
            const picker = selectInput(candidates.map(asset => ({
              value: asset.id,
              label: (asset.label || asset.id) + ' [' + (asset.asset?.mimeType || 'file') + ']'
            })), candidates[0]?.id || '');
            picker.dataset.attachAssetSelect = 'true';
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Attach';
            button.dataset.attachAssetButton = node.thing;
            button.addEventListener('click', async () => {
              const attached = await attachAsset(picker.value, node.thing);
              if (!attached.ok) {
                setStatus('attach failed: ' + attached.error);
                return;
              }
              setStatus('attached file to ' + (node.label || node.thing));
              await refresh();
            });
            controls.appendChild(picker);
            controls.appendChild(button);
            attachRow.appendChild(label);
            attachRow.appendChild(controls);
            thingProps.appendChild(attachRow);
          }
        }
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
          await post('canvas.unrelate', { from: c.from, rel: c.rel, to: c.to, perspective: state.perspective });
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
    if (!isLive()) {
      for (const section of [thingProps, projectionProps, palette]) {
        for (const control of section.querySelectorAll('input, button')) control.disabled = true;
      }
    }
  }

  function initToolbar() {
    const beginSessionTransition = async action => {
      stopPlayback();
      state.history.playhead = null;
      setHistoryBanner();
      await flushOutbox(true);
      state.history.witnesses = [];
      await action();
      if (state.history.open) { await fetchWitnesses(); renderTimeline(); }
      clearSelection();
      await loadPerspectives();
      await loadCanvas();
      updateUndoButtons();
      markDirty();
    };

    el('session-open-btn').addEventListener('click', async () => {
      await beginSessionTransition(() => openSession());
    });
    el('session-logout-btn').addEventListener('click', async () => {
      await beginSessionTransition(() => logoutSession());
    });
    for (const sessionField of ['session-username', 'session-password']) {
      el(sessionField).addEventListener('keydown', async event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        await beginSessionTransition(() => openSession());
      });
    }

    el('perspective-select').addEventListener('change', async event => {
      stopPlayback();
      state.history.playhead = null;
      setHistoryBanner();
      await flushOutbox(true);
      state.perspective = event.target.value;
      localStorage.setItem('witness.canvasPerspective', state.perspective);
      clearSelection();
      await loadCanvas();
      renderTimeline();
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
      if (!isLive()) { setStatus('read-only: history view'); return; }
      state.grid.snap = !state.grid.snap;
      el('snap-toggle-btn').classList.toggle('mode-active', state.grid.snap);
      queueGrid();
    });

    el('undo-btn').addEventListener('click', async () => {
      if (!state.model || !isLive()) return;
      const result = await post('canvas.undo', { perspective: state.perspective });
      if (result) await refresh();
    });
    el('redo-btn').addEventListener('click', async () => {
      if (!state.model || !isLive()) return;
      const result = await post('canvas.redo', { perspective: state.perspective });
      if (result) await refresh();
    });

    el('timeline-btn').addEventListener('click', () => toggleTimeline());
    el('timeline-now-btn').addEventListener('click', () => exitHistory());
    el('history-now-btn').addEventListener('click', () => exitHistory());
    el('timeline-slider').addEventListener('input', event => scrubTo(Number(event.target.value)));
    el('timeline-filter-btn').addEventListener('click', () => {
      state.history.filter = state.history.filter === 'all' ? 'canvas' : 'all';
      el('timeline-filter-btn').textContent = state.history.filter === 'all' ? 'All' : 'canvas.*';
      renderTimeline();
    });
    el('timeline-play-btn').addEventListener('click', () => {
      if (!state.history.open) return;
      if (state.history.playing) { stopPlayback(); return; }
      el('timeline-play-btn').textContent = 'Stop';
      if (state.history.playhead === null) state.history.playhead = 0;
      state.history.playing = setInterval(() => {
        const current = state.history.playhead === null ? state.history.witnesses.length : state.history.playhead;
        scrubTo(current + 1);
      }, PLAY_INTERVAL_MS);
    });
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', flushKeepalive);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushKeepalive();
  });
  try {
    projectionModule = await import('/canvas-lib/canvas-projection.js');
  } catch (e) {
    setStatus('projection module failed to load - timeline disabled');
  }
  initToolbar();
  renderSessionStatus();
  setMode('select');
  resize();
  await initSession();
  updateUndoButtons();
  await loadPerspectives();
  await loadCanvas();
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
  <div class="canvas-session">
    <label for="session-username">Username</label>
    <input id="session-username" type="text" autocomplete="username">
    <label for="session-password">Password</label>
    <input id="session-password" type="password" autocomplete="current-password">
    <button id="session-open-btn" type="button">Sign in</button>
    <button id="session-logout-btn" type="button">Sign out</button>
    <span id="session-status" class="canvas-session-status">Not signed in</span>
  </div>
  <label for="perspective-select">Perspective</label>
  <select id="perspective-select"></select>
  <button id="new-perspective-btn" type="button">New perspective</button>
  <button id="mode-select-btn" type="button">Select</button>
  <button id="mode-connect-btn" type="button">Connect</button>
  <button id="mode-pan-btn" type="button">Pan</button>
  <button id="snap-toggle-btn" type="button">Snap</button>
  <button id="new-thing-btn" type="button">New Thing</button>
  <button id="undo-btn" type="button">Undo</button>
  <button id="redo-btn" type="button">Redo</button>
  <button id="timeline-btn" type="button">Timeline</button>
  <span id="status"></span>
</header>
<div class="canvas-shell">
  <div class="canvas-main">
    <div class="canvas-stage" id="canvas-stage">
      <canvas id="canvas-surface"></canvas>
      <input id="overlay-input" type="text" autocomplete="off">
      <div id="history-banner" hidden>
        <span id="history-label"></span>
        <button id="history-now-btn" type="button">Now</button>
      </div>
    </div>
    <div id="timeline-panel" hidden>
      <div class="timeline-controls">
        <button id="timeline-play-btn" type="button">Play</button>
        <input id="timeline-slider" type="range" min="0" max="0" value="0">
        <span id="timeline-pos"></span>
        <button id="timeline-filter-btn" type="button">All</button>
        <button id="timeline-now-btn" type="button">Now</button>
      </div>
      <div id="timeline-strip"></div>
    </div>
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
<script>${CANVAS_CLIENT_JS}</script>
</body>
</html>`;
}
