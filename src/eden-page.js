import { renderCanvasCorePrelude } from "./canvas-core.js";

const EDEN_CSS = `
  :root {
    --eden-bg: #efe7d7;
    --eden-panel: #fbf7ef;
    --eden-line: #8f8267;
    --eden-ink: #2b241c;
    --eden-green: #8aa36c;
    --eden-pipe: #7c6756;
    --eden-wire: #b08b4f;
    --eden-path: #a5a187;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Tahoma, sans-serif;
    background:
      radial-gradient(circle at top, rgba(255,255,255,0.45), transparent 35%),
      linear-gradient(180deg, #f5efdf 0%, var(--eden-bg) 100%);
    color: var(--eden-ink);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .eden-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(251, 247, 239, 0.8);
    backdrop-filter: blur(10px);
  }
  .eden-toolbar strong { letter-spacing: 0.04em; text-transform: uppercase; font-size: 12px; }
  .eden-toolbar span { color: rgba(43, 36, 28, 0.72); font-size: 12px; }
  .eden-toolbar button, .eden-toolbar a {
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.65);
    color: inherit;
    text-decoration: none;
    border-radius: 999px;
    padding: 6px 10px;
    cursor: pointer;
    font: inherit;
  }
  .eden-stage {
    position: relative;
    flex: 1;
    overflow: hidden;
    margin: 10px;
    border-radius: 18px;
    border: 1px solid rgba(43, 36, 28, 0.14);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0)),
      radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 35%),
      #ede4d0;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 28px rgba(43, 36, 28, 0.08);
    cursor: grab;
  }
  .eden-stage.is-dragging { cursor: grabbing; }
  .eden-connections {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .eden-surfaces {
    position: absolute;
    inset: 0;
  }
  .eden-prompt {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(43, 36, 28, 0.9);
    color: #f9f4e8;
    font-size: 13px;
    letter-spacing: 0.01em;
    box-shadow: 0 8px 24px rgba(43, 36, 28, 0.22);
    z-index: 20;
  }
  .eden-status {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    padding: 7px 10px;
    border-radius: 999px;
    background: rgba(251, 247, 239, 0.92);
    border: 1px solid rgba(43, 36, 28, 0.12);
    color: rgba(43, 36, 28, 0.7);
    font-size: 12px;
    z-index: 20;
  }
  .eden-chapter {
    position: absolute;
    top: 14px;
    left: 14px;
    width: min(340px, calc(100% - 28px));
    padding: 14px 15px;
    border-radius: 18px;
    background: rgba(251, 247, 239, 0.94);
    border: 1px solid rgba(43, 36, 28, 0.12);
    box-shadow: 0 12px 30px rgba(43, 36, 28, 0.1);
    z-index: 20;
  }
  .eden-chapter[hidden] { display: none; }
  .eden-chapter-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.52);
  }
  .eden-chapter-title {
    margin-top: 6px;
    font-size: 17px;
    font-weight: 600;
  }
  .eden-chapter-body {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.45;
    color: rgba(43, 36, 28, 0.76);
  }
  .eden-chapter-unlocks {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .eden-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid rgba(43, 36, 28, 0.12);
    background: rgba(255,255,255,0.7);
    color: rgba(43, 36, 28, 0.78);
    font-size: 12px;
    text-decoration: none;
  }
  .eden-chip.is-locked {
    border-style: dashed;
    opacity: 0.88;
    background: rgba(237, 228, 208, 0.9);
  }
  .eden-chip.is-open {
    background: rgba(138, 163, 108, 0.18);
    border-color: rgba(96, 123, 66, 0.2);
  }
  .eden-chip-note {
    color: rgba(43, 36, 28, 0.52);
    font-size: 11px;
  }
  .eden-surface {
    position: absolute;
    border-radius: 18px;
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: var(--eden-panel);
    box-shadow: 0 10px 24px rgba(43, 36, 28, 0.12);
    overflow: hidden;
    transform-origin: 0 0;
    transition: box-shadow 140ms ease, transform 140ms ease, border-color 140ms ease;
  }
  .eden-surface[hidden] { display: none; }
  .eden-surface[data-relief="0"] { box-shadow: none; }
  .eden-surface[data-relief="1"] { box-shadow: 0 8px 20px rgba(43, 36, 28, 0.08); }
  .eden-surface[data-relief="2"] { box-shadow: 0 12px 28px rgba(43, 36, 28, 0.12); }
  .eden-surface[data-relief="3"] { box-shadow: 0 16px 34px rgba(43, 36, 28, 0.16); }
  .eden-surface[data-relief="4"] { box-shadow: 0 20px 40px rgba(43, 36, 28, 0.2); }
  .eden-surface.is-focused {
    border-color: rgba(96, 123, 66, 0.28);
  }
  .eden-surface-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(43, 36, 28, 0.08);
    background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.25));
  }
  .eden-surface-title { font-size: 14px; font-weight: 600; }
  .eden-surface-subtitle { font-size: 12px; color: rgba(43, 36, 28, 0.62); }
  .eden-surface-body {
    padding: 14px;
    font-size: 13px;
    color: rgba(43, 36, 28, 0.76);
  }
  .eden-surface-body p {
    margin: 0;
    line-height: 1.45;
  }
  .eden-surface-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .eden-surface-tag {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(43, 36, 28, 0.06);
    font-size: 11px;
    color: rgba(43, 36, 28, 0.58);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .eden-surface-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 14px 14px;
  }
  .eden-surface-actions:empty { display: none; }
  .eden-surface-goto, .eden-surface-link {
    width: 100%;
    height: 100%;
    padding: 0;
    text-align: left;
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .eden-surface-goto .eden-surface-header, .eden-surface-link .eden-surface-header { cursor: pointer; }
  .eden-surface-tree {
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 40%, rgba(255,255,255,0.35), transparent 35%),
      radial-gradient(circle at 50% 50%, #95ad73 0%, #7e9461 65%, #6d8152 100%);
    border: 1px solid rgba(43, 36, 28, 0.14);
    box-shadow: inset 0 2px 6px rgba(255,255,255,0.35), 0 10px 22px rgba(43, 36, 28, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 14px;
    color: #fffdf7;
    font-weight: 600;
  }
  .eden-surface-tree small {
    display: block;
    margin-top: 6px;
    font-weight: 400;
    opacity: 0.86;
  }
  .eden-surface.is-chrome-tray .eden-surface-header {
    background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(248,242,229,0.4));
  }
  .eden-surface.is-chrome-shelf .eden-surface-header {
    background: linear-gradient(180deg, rgba(244, 233, 210, 0.92), rgba(255,255,255,0.38));
  }
  .eden-surface.is-chrome-machinePlate .eden-surface-header {
    background: linear-gradient(180deg, rgba(232, 223, 206, 0.92), rgba(255,255,255,0.3));
  }
  .eden-surface.is-chrome-mapWall .eden-surface-header {
    background: linear-gradient(180deg, rgba(239, 241, 228, 0.94), rgba(255,255,255,0.3));
  }
  .eden-embedded-frame {
    width: 100%;
    height: calc(100% - 126px);
    border: 0;
    background: #fff;
    pointer-events: none;
  }
  .eden-embedded-actions {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    gap: 8px;
    z-index: 3;
  }
  .eden-embedded-actions a {
    text-decoration: none;
    background: rgba(43, 36, 28, 0.92);
    color: #faf4ea;
    padding: 7px 11px;
    border-radius: 999px;
    font-size: 12px;
  }
  .eden-connector-label {
    font: 12px "Segoe UI", Tahoma, sans-serif;
    fill: rgba(43, 36, 28, 0.72);
    paint-order: stroke;
    stroke: rgba(245, 239, 223, 0.95);
    stroke-width: 4px;
  }
  .eden-personal-auth, .eden-personal-editor, .eden-personal-items {
    margin-top: 12px;
  }
  .eden-personal-auth[hidden], .eden-personal-editor[hidden] { display: none; }
  .eden-personal-grid {
    display: grid;
    gap: 8px;
  }
  .eden-personal-grid input, .eden-personal-grid select {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-personal-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eden-personal-actions button {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
  }
  .eden-personal-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-personal-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-personal-status.is-error { color: #8a372f; }
  .eden-personal-status.is-ok { color: #496132; }
  .eden-personal-list {
    display: grid;
    gap: 8px;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .eden-personal-item {
    padding: 10px;
    border-radius: 14px;
    border: 1px solid rgba(43, 36, 28, 0.12);
    background: rgba(255,255,255,0.72);
  }
  .eden-personal-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .eden-personal-item-kind {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-personal-item-text {
    margin-top: 6px;
    line-height: 1.4;
    color: rgba(43, 36, 28, 0.8);
    word-break: break-word;
  }
  .eden-personal-item-link {
    color: #45612f;
    text-decoration: none;
  }
  .eden-personal-item-controls {
    display: flex;
    gap: 6px;
  }
  .eden-personal-item-controls button {
    border: 0;
    background: rgba(43, 36, 28, 0.08);
    color: inherit;
    border-radius: 999px;
    padding: 5px 8px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  .eden-personal-empty {
    padding: 12px;
    border-radius: 14px;
    border: 1px dashed rgba(43, 36, 28, 0.18);
    color: rgba(43, 36, 28, 0.58);
    background: rgba(255,255,255,0.45);
  }
  .eden-edit-auth, .eden-edit-editor, .eden-edit-preview {
    margin-top: 12px;
  }
  .eden-edit-auth[hidden], .eden-edit-editor[hidden] { display: none; }
  .eden-edit-grid {
    display: grid;
    gap: 8px;
  }
  .eden-edit-grid input, .eden-edit-grid select {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-edit-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eden-edit-actions button {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
  }
  .eden-edit-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-edit-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-edit-status.is-error { color: #8a372f; }
  .eden-edit-status.is-ok { color: #496132; }
  .eden-edit-preview-card {
    border: 1px solid rgba(43, 36, 28, 0.12);
    border-radius: 14px;
    padding: 12px;
    background: rgba(255,255,255,0.72);
    display: grid;
    gap: 6px;
  }
  .eden-edit-preview-kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-edit-preview-line {
    font-size: 13px;
    color: rgba(43, 36, 28, 0.78);
  }
  .eden-version-auth, .eden-version-editor {
    margin-top: 12px;
  }
  .eden-version-auth[hidden], .eden-version-editor[hidden] { display: none; }
  .eden-version-grid {
    display: grid;
    gap: 10px;
  }
  .eden-version-grid input, .eden-version-grid select {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-version-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-version-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-version-status.is-error { color: #8a372f; }
  .eden-version-status.is-ok { color: #496132; }
  .eden-version-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eden-version-actions button {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
  }
  .eden-version-actions button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .eden-version-summary, .eden-version-list {
    display: grid;
    gap: 8px;
  }
  .eden-version-card, .eden-version-item {
    border: 1px solid rgba(43, 36, 28, 0.12);
    border-radius: 14px;
    background: rgba(255,255,255,0.72);
    padding: 10px 12px;
  }
  .eden-version-card.is-current, .eden-version-item.is-active {
    border-color: rgba(96, 123, 66, 0.24);
    background: rgba(138, 163, 108, 0.14);
  }
  .eden-version-card-kicker, .eden-version-item-meta {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-version-card-title, .eden-version-item-title {
    margin-top: 4px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(43, 36, 28, 0.86);
  }
  .eden-version-card-body, .eden-version-item-preview {
    margin-top: 4px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.72);
    line-height: 1.45;
  }
  .eden-version-diff {
    margin-top: 6px;
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.7);
  }
  .eden-version-item-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .eden-version-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .eden-version-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: rgba(43, 36, 28, 0.08);
    color: rgba(43, 36, 28, 0.66);
    padding: 3px 7px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .eden-version-badge.is-published {
    background: rgba(176, 139, 79, 0.16);
    color: rgba(97, 71, 23, 0.86);
  }
  .eden-version-badge.is-draft {
    background: rgba(138, 163, 108, 0.16);
    color: rgba(61, 87, 34, 0.86);
  }
`;

const EDEN_CLIENT_JS = model => `(() => {
  ${renderCanvasCorePrelude()}
  const core = __canvasCore;
  const model = ${JSON.stringify(model).replace(/</g, "\\u003c")};
  const stage = document.getElementById('eden-stage');
  const surfacesRoot = document.getElementById('eden-surfaces');
  const promptEl = document.getElementById('eden-prompt');
  const statusEl = document.getElementById('eden-status');
  const chapterEl = document.getElementById('eden-chapter');
  const chapterTitleEl = document.getElementById('eden-chapter-title');
  const chapterBodyEl = document.getElementById('eden-chapter-body');
  const chapterUnlocksEl = document.getElementById('eden-chapter-unlocks');
  const svg = document.getElementById('eden-connections');
  const ns = 'http://www.w3.org/2000/svg';
  const state = {
    camera: core.createCameraState(),
    drag: null,
    elements: new Map(),
    focusSurfaceId: null,
    hoverSurfaceId: null,
    session: model.session || { authenticated: false, actor: null, identity: null, label: null },
    personalStatus: { tone: '', text: '' },
    personalEditingId: null,
    editStatus: { tone: '', text: '' },
    versionStatus: { tone: '', text: '' }
  };

  const byId = new Map(model.surfaces.map(surface => [surface.id, surface]));
  const targetById = new Map(model.cameraTargets.map(target => [target.id, target]));

  function viewport() {
    return { width: stage.clientWidth, height: stage.clientHeight };
  }

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function requestJson(url, options = {}) {
    return fetch(url, { credentials: 'same-origin', ...options }).then(async response => ({
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({}))
    }));
  }

  function setPersonalStatus(text, tone = '') {
    state.personalStatus = { text: text || '', tone: tone || '' };
  }

  function setEditStatus(text, tone = '') {
    state.editStatus = { text: text || '', tone: tone || '' };
  }

  function setVersionStatus(text, tone = '') {
    state.versionStatus = { text: text || '', tone: tone || '' };
  }

  function actionVisible(action) {
    const minZoom = action.visibleRange?.minZoom ?? 0;
    const maxZoom = action.visibleRange?.maxZoom ?? 99;
    return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
  }

  function cameraForSurface(surface, overrideZoom = null) {
    return core.cameraToFocusRect(surface, viewport(), { zoom: overrideZoom ?? null, padding: 48, maxZoom: 1.25 });
  }

  function focusTarget(targetId) {
    const target = targetById.get(targetId) || model.cameraTargets.find(row => row.surfaceId === targetId) || null;
    if (!target) return;
    const surface = byId.get(target.surfaceId);
    if (!surface) return;
    state.focusSurfaceId = surface.id;
    state.camera = target.zoom == null
      ? cameraForSurface(surface, null)
      : core.cameraToFocusRect(surface, viewport(), { zoom: target.zoom, padding: 48, maxZoom: 1.25 });
    render();
  }

  function isVisible(surface) {
    const range = surface.visibleRange || {};
    const minZoom = typeof range.minZoom === 'number' ? range.minZoom : 0;
    const maxZoom = typeof range.maxZoom === 'number' ? range.maxZoom : 99;
    return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
  }

  function rectToScreen(surface) {
    const topLeft = core.worldToScreen(state.camera, surface.x, surface.y);
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: surface.w * state.camera.zoom,
      height: surface.h * state.camera.zoom
    };
  }

  function reliefLevelFor(surface) {
    const relief = surface.relief || {};
    if (state.focusSurfaceId === surface.id) return Math.round(relief.focus ?? relief.base ?? 1);
    if (state.hoverSurfaceId === surface.id) return Math.round(relief.hover ?? relief.base ?? 1);
    return Math.round(relief.base ?? 1);
  }

  function applySurfaceMeta(container, surface) {
    if (!container) return;
    container.innerHTML = '';
    const tags = [];
    if (surface.district) tags.push(surface.district);
    for (const tag of surface.tags || []) tags.push(tag);
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.className = 'eden-surface-tag';
      chip.textContent = tag;
      container.appendChild(chip);
    }
  }

  function renderActions(container, surface) {
    if (!container) return;
    container.innerHTML = '';
    const actions = (surface.actions || []).filter(actionVisible);
    for (const action of actions) {
      const interactive = action.state === 'open' && (action.href || action.cameraTargetId);
      const node = document.createElement(interactive && action.href ? 'a' : 'button');
      if (node.tagName === 'A') node.href = action.href;
      else node.type = 'button';
      node.className = 'eden-chip ' + (action.state === 'open' ? 'is-open' : 'is-locked');
      if (!interactive) node.disabled = node.tagName === 'BUTTON';
      const label = document.createElement('span');
      label.textContent = action.label;
      node.appendChild(label);
      if (action.requires) {
        const note = document.createElement('span');
        note.className = 'eden-chip-note';
        note.textContent = action.requires;
        node.appendChild(note);
      }
      node.addEventListener('click', event => {
        if (action.state !== 'open') {
          event.preventDefault();
          setStatus(action.requires || (action.label + ' is not unlocked yet'));
          return;
        }
        if (action.cameraTargetId) {
          event.preventDefault();
          focusTarget(action.cameraTargetId);
        }
      });
      container.appendChild(node);
    }
  }

  function personalBoxRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'personalBox'
      ? surface.runtime
      : { mode: 'personalBox', actor: state.session.actor || null, items: [] };
  }

  function pageThemeRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'pageTheme'
      ? surface.runtime
      : {
          mode: 'pageTheme',
          actor: state.session.actor || null,
          pageId: surface.pageId || 'todo_app_widget',
          pageTheme: { themeId: 'paper', material: 'linen', typography: 'sans' }
        };
  }

  function versionsRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'versions'
      ? surface.runtime
      : {
          mode: 'versions',
          surfaceId: surface.id,
          soul: surface.versionSoul || '',
          activeVersion: null,
          publishedVersion: surface.publishedVersion || null,
          draftVersion: surface.draftVersion || null,
          lastGoodVersion: null,
          rollbackAvailable: false,
          versions: [],
          compare: { activePreview: '', publishedPreview: '', draftPreview: '', activeToPublished: [], activeToDraft: [] },
          history: []
        };
  }

  async function refreshPersonalBox(surface) {
    const response = await requestJson('/api/eden/personal-box');
    if (!response.ok) {
      setPersonalStatus(response.body?.error || 'personal box refresh failed', 'error');
      render();
      return;
    }
    const runtime = personalBoxRuntime(surface);
    runtime.actor = response.body?.actor || null;
    runtime.items = Array.isArray(response.body?.items) ? response.body.items : [];
    surface.runtime = runtime;
    state.session = {
      authenticated: Boolean(response.body?.authenticated),
      actor: response.body?.actor || null,
      identity: response.body?.identity || null,
      label: response.body?.label || null
    };
    if (!runtime.items.some(item => item.id === state.personalEditingId)) state.personalEditingId = null;
    render();
  }

  async function refreshPageTheme(surface) {
    const response = await requestJson('/api/eden/page-theme');
    if (!response.ok) {
      setEditStatus(response.body?.error || 'page theme refresh failed', 'error');
      render();
      return;
    }
    const runtime = pageThemeRuntime(surface);
    runtime.actor = response.body?.actor || null;
    runtime.pageId = response.body?.pageId || runtime.pageId;
    runtime.pageTheme = response.body?.pageTheme || runtime.pageTheme;
    surface.runtime = runtime;
    render();
  }

  async function refreshVersions(surface) {
    const response = await requestJson('/api/eden/versions');
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'versions refresh failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.versionState || versionsRuntime(surface);
    render();
  }

  async function refreshSessionSurfaces() {
    const tasks = [];
    const personalSurface = byId.get('eden.surface.personal');
    if (personalSurface && personalSurface.panelKind === 'personalBox') tasks.push(refreshPersonalBox(personalSurface));
    const editSurface = byId.get('eden.surface.edit');
    if (editSurface && editSurface.panelKind === 'editPage') tasks.push(refreshPageTheme(editSurface));
    const versionsSurface = byId.get('eden.surface.versions');
    if (versionsSurface && versionsSurface.panelKind === 'versions') tasks.push(refreshVersions(versionsSurface));
    await Promise.all(tasks);
  }

  function reloadEmbeddedTodoPage() {
    const todoNode = state.elements.get('eden.surface.todo');
    const frame = todoNode?.querySelector?.('iframe');
    if (!frame) return;
    const base = frame.dataset.baseSrc || frame.getAttribute('src') || '/';
    frame.dataset.baseSrc = base.split('?')[0];
    const next = new URL(frame.dataset.baseSrc, window.location.origin);
    next.searchParams.set('edenThemeRev', String(Date.now()));
    frame.src = next.pathname + next.search;
  }

  function fillPersonalEditor(form, surface, itemId = null) {
    if (!form) return;
    const runtime = personalBoxRuntime(surface);
    const item = runtime.items.find(entry => entry.id === itemId) || null;
    form.dataset.mode = item ? 'edit' : 'create';
    form.dataset.itemId = item?.id || '';
    form.querySelector('[name="kind"]').value = item?.kind || 'note';
    form.querySelector('[name="text"]').value = item?.text || '';
    form.querySelector('[name="href"]').value = item?.href || '';
    const submit = form.querySelector('[data-eden-personal-submit]');
    if (submit) submit.textContent = item ? 'Save widget' : 'Add widget';
    const cancel = form.querySelector('[data-eden-personal-cancel]');
    if (cancel) cancel.hidden = !item;
  }

  function renderPersonalBox(node, surface) {
    const runtime = personalBoxRuntime(surface);
    const auth = node.querySelector('[data-eden-personal-auth]');
    const editor = node.querySelector('[data-eden-personal-editor]');
    const session = node.querySelector('[data-eden-personal-session]');
    const status = node.querySelector('[data-eden-personal-status]');
    const list = node.querySelector('[data-eden-personal-items]');
    if (!auth || !editor || !session || !status || !list) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. This patch is yours.')
      : 'Sign in to claim your room and edit the box from inside Eden.';
    status.textContent = state.personalStatus.text || '';
    status.classList.toggle('is-error', state.personalStatus.tone === 'error');
    status.classList.toggle('is-ok', state.personalStatus.tone === 'ok');
    list.innerHTML = '';
    const items = Array.isArray(runtime.items) ? runtime.items : [];
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'eden-personal-empty';
      empty.textContent = authenticated
        ? 'No widgets yet. Add one below.'
        : 'Your widgets appear here after you sign in and plant something.';
      list.appendChild(empty);
    } else {
      for (const item of items) {
        const li = document.createElement('li');
        li.className = 'eden-personal-item';
        li.innerHTML = '<div class="eden-personal-item-header"><span class="eden-personal-item-kind"></span><div class="eden-personal-item-controls"><button type="button" data-eden-personal-edit>Edit</button><button type="button" data-eden-personal-delete>Delete</button></div></div><div class="eden-personal-item-text"></div>';
        li.querySelector('.eden-personal-item-kind').textContent = item.kind;
        const text = li.querySelector('.eden-personal-item-text');
        if (item.kind === 'link' && item.href) {
          text.innerHTML = '<a class="eden-personal-item-link" target="_blank" rel="noreferrer noopener"></a>';
          const link = text.querySelector('a');
          link.href = item.href;
          link.textContent = item.text;
        } else {
          text.textContent = item.text;
        }
        li.querySelector('[data-eden-personal-edit]').addEventListener('click', () => {
          state.personalEditingId = item.id;
          fillPersonalEditor(editor.querySelector('form'), surface, item.id);
          setPersonalStatus('Editing ' + item.text, 'ok');
        });
        li.querySelector('[data-eden-personal-delete]').addEventListener('click', async () => {
          const response = await requestJson('/api/eden/personal-box/items/' + encodeURIComponent(item.id), { method: 'DELETE' });
          if (!response.ok) {
            setPersonalStatus(response.body?.error || 'delete failed', 'error');
            render();
            return;
          }
          setPersonalStatus('Deleted widget.', 'ok');
          if (state.personalEditingId === item.id) state.personalEditingId = null;
          await refreshPersonalBox(surface);
        });
        list.appendChild(li);
      }
    }
    fillPersonalEditor(editor.querySelector('form'), surface, state.personalEditingId);
  }

  function renderEditPage(node, surface) {
    const runtime = pageThemeRuntime(surface);
    const auth = node.querySelector('[data-eden-edit-auth]');
    const editor = node.querySelector('[data-eden-edit-editor]');
    const session = node.querySelector('[data-eden-edit-session]');
    const status = node.querySelector('[data-eden-edit-status]');
    const preview = node.querySelector('[data-eden-edit-preview]');
    if (!auth || !editor || !session || !status || !preview) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. These page treatments now write to the live Todo surface.')
      : 'Sign in to personalize the live Todo page from inside Eden.';
    status.textContent = state.editStatus.text || '';
    status.classList.toggle('is-error', state.editStatus.tone === 'error');
    status.classList.toggle('is-ok', state.editStatus.tone === 'ok');
    const form = editor.querySelector('form');
    if (form) {
      form.querySelector('[name="themeId"]').value = runtime.pageTheme?.themeId || 'paper';
      form.querySelector('[name="material"]').value = runtime.pageTheme?.material || 'linen';
      form.querySelector('[name="typography"]').value = runtime.pageTheme?.typography || 'sans';
    }
    preview.innerHTML = '<div class="eden-edit-preview-card"><div class="eden-edit-preview-kicker">Current treatment</div><div class="eden-edit-preview-line">Theme: ' + (runtime.pageTheme?.themeId || 'paper') + '</div><div class="eden-edit-preview-line">Material: ' + (runtime.pageTheme?.material || 'linen') + '</div><div class="eden-edit-preview-line">Typography: ' + (runtime.pageTheme?.typography || 'sans') + '</div></div>';
  }

  function renderVersions(node, surface) {
    const runtime = versionsRuntime(surface);
    const auth = node.querySelector('[data-eden-version-auth]');
    const editor = node.querySelector('[data-eden-version-editor]');
    const session = node.querySelector('[data-eden-version-session]');
    const status = node.querySelector('[data-eden-version-status]');
    const summary = node.querySelector('[data-eden-version-summary]');
    const list = node.querySelector('[data-eden-version-list]');
    if (!auth || !editor || !session || !status || !summary || !list) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. These recovery controls mutate the live Todo board.')
      : 'Sign in to move between draft, published, and last good from inside Eden.';
    status.textContent = state.versionStatus.text || '';
    status.classList.toggle('is-error', state.versionStatus.tone === 'error');
    status.classList.toggle('is-ok', state.versionStatus.tone === 'ok');

    const summaries = [
      { kicker: 'Current live', version: runtime.activeVersion, preview: runtime.compare?.activePreview || 'No active version yet.', current: true },
      { kicker: 'Published', version: runtime.publishedVersion, preview: runtime.compare?.publishedPreview || 'No published version yet.' },
      { kicker: 'Draft candidate', version: runtime.draftVersion, preview: runtime.compare?.draftPreview || 'No draft candidate yet.' }
    ];
    summary.innerHTML = '';
    for (const entry of summaries) {
      const card = document.createElement('div');
      card.className = 'eden-version-card' + (entry.current ? ' is-current' : '');
      const kicker = document.createElement('div');
      kicker.className = 'eden-version-card-kicker';
      kicker.textContent = entry.kicker;
      const title = document.createElement('div');
      title.className = 'eden-version-card-title';
      title.textContent = entry.version || 'None';
      const body = document.createElement('div');
      body.className = 'eden-version-card-body';
      body.textContent = entry.preview || 'No preview.';
      card.appendChild(kicker);
      card.appendChild(title);
      card.appendChild(body);
      summary.appendChild(card);
    }

    const comparePublished = Array.isArray(runtime.compare?.activeToPublished) ? runtime.compare.activeToPublished : [];
    const compareDraft = Array.isArray(runtime.compare?.activeToDraft) ? runtime.compare.activeToDraft : [];
    const publishedDiff = node.querySelector('[data-eden-version-diff-published]');
    const draftDiff = node.querySelector('[data-eden-version-diff-draft]');
    if (publishedDiff) {
      publishedDiff.innerHTML = '';
      if (!comparePublished.length) {
        publishedDiff.textContent = 'Current live version already matches published.';
      } else {
        for (const row of comparePublished) {
          const line = document.createElement('div');
          line.textContent = row.key + ': ' + String(row.from ?? '') + ' -> ' + String(row.to ?? '');
          publishedDiff.appendChild(line);
        }
      }
    }
    if (draftDiff) {
      draftDiff.innerHTML = '';
      if (!compareDraft.length) {
        draftDiff.textContent = 'Current live version already matches the draft candidate.';
      } else {
        for (const row of compareDraft) {
          const line = document.createElement('div');
          line.textContent = row.key + ': ' + String(row.from ?? '') + ' -> ' + String(row.to ?? '');
          draftDiff.appendChild(line);
        }
      }
    }

    list.innerHTML = '';
    const rows = Array.isArray(runtime.versions) ? runtime.versions : [];
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'eden-version-item';
      empty.textContent = 'No authored versions are attached to this recovery seam yet.';
      list.appendChild(empty);
    } else {
      for (const row of rows) {
        const item = document.createElement('div');
        item.className = 'eden-version-item' + (row.isActive ? ' is-active' : '');
        const header = document.createElement('div');
        header.className = 'eden-version-item-header';
        const title = document.createElement('div');
        title.innerHTML = '<div class="eden-version-item-meta">Version ' + String(row.index ?? 0) + '</div><div class="eden-version-item-title"></div>';
        title.querySelector('.eden-version-item-title').textContent = row.version;
        const badges = document.createElement('div');
        badges.className = 'eden-version-badges';
        if (row.isActive) {
          const badge = document.createElement('span');
          badge.className = 'eden-version-badge';
          badge.textContent = 'live';
          badges.appendChild(badge);
        }
        if (row.isPublished) {
          const badge = document.createElement('span');
          badge.className = 'eden-version-badge is-published';
          badge.textContent = 'published';
          badges.appendChild(badge);
        }
        if (row.isDraft) {
          const badge = document.createElement('span');
          badge.className = 'eden-version-badge is-draft';
          badge.textContent = 'draft';
          badges.appendChild(badge);
        }
        header.appendChild(title);
        header.appendChild(badges);
        item.appendChild(header);
        const preview = document.createElement('div');
        preview.className = 'eden-version-item-preview';
        preview.textContent = row.preview || 'No preview.';
        item.appendChild(preview);
        list.appendChild(item);
      }
    }

    const activatePublished = node.querySelector('[data-eden-version-open-published]');
    const activateDraft = node.querySelector('[data-eden-version-open-draft]');
    const restore = node.querySelector('[data-eden-version-restore]');
    const publish = node.querySelector('[data-eden-version-publish]');
    if (activatePublished) activatePublished.disabled = !runtime.publishedVersion || runtime.activeVersion === runtime.publishedVersion;
    if (activateDraft) activateDraft.disabled = !runtime.draftVersion || runtime.activeVersion === runtime.draftVersion;
    if (restore) restore.disabled = !runtime.rollbackAvailable;
    if (publish) publish.disabled = !runtime.activeVersion || runtime.activeVersion === runtime.publishedVersion;
  }

  function bindSurfaceNode(node, surface) {
    node.dataset.edenSurface = surface.id;
    node.classList.toggle('is-chrome-tray', surface.chromeKind === 'tray');
    node.classList.toggle('is-chrome-shelf', surface.chromeKind === 'shelf');
    node.classList.toggle('is-chrome-machinePlate', surface.chromeKind === 'machinePlate');
    node.classList.toggle('is-chrome-mapWall', surface.chromeKind === 'mapWall');
    node.addEventListener('pointerenter', () => {
      state.hoverSurfaceId = surface.id;
      render();
    });
    node.addEventListener('pointerleave', () => {
      if (state.hoverSurfaceId === surface.id) state.hoverSurfaceId = null;
      render();
    });
    node.addEventListener('dblclick', event => {
      if (surface.cameraTargetId) {
        event.preventDefault();
        focusTarget(surface.cameraTargetId);
      }
    });
  }

  function ensureSurface(surface) {
    if (state.elements.has(surface.id)) return state.elements.get(surface.id);
    let node;
    if (surface.surfaceKind === 'embeddedPage') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div></div><div class="eden-surface-actions"></div><iframe class="eden-embedded-frame" loading="lazy"></iframe><div class="eden-embedded-actions"><a target="_self">Open app</a></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || 'Live embedded board';
      node.querySelector('.eden-surface-body p').textContent = surface.body || 'The canonical starter app remains real inside the neighbourhood.';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('iframe').src = surface.src || '/';
      node.querySelector('iframe').dataset.baseSrc = surface.src || '/';
      const action = node.querySelector('a');
      action.href = surface.href || surface.src || '/';
    } else if (surface.surfaceKind === 'tree') {
      node = document.createElement('section');
      node.className = 'eden-surface eden-surface-tree';
      node.innerHTML = '<div><div class="eden-surface-title"></div><small></small><div class="eden-surface-body"><p></p></div><div class="eden-surface-actions"></div></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('small').textContent = surface.subtitle || 'Landmark';
      node.querySelector('.eden-surface-body p').textContent = surface.body || 'Growth, authorship, and return.';
      renderActions(node.querySelector('.eden-surface-actions'), surface);
    } else if (surface.surfaceKind === 'goto') {
      node = document.createElement(surface.href ? 'a' : 'button');
      node.className = 'eden-surface eden-surface-goto';
      if (surface.href) node.href = surface.href;
      else node.type = 'button';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || 'Transport';
      node.querySelector('.eden-surface-body').textContent = surface.body || 'Move across the world.';
      node.addEventListener('click', event => {
        event.preventDefault();
        if (surface.cameraTargetId) focusTarget(surface.cameraTargetId);
        if (surface.href) {
          setStatus('transporting to ' + surface.title);
          setTimeout(() => { window.location.href = surface.href; }, 160);
        }
      });
    } else if (surface.panelKind === 'personalBox') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-personal-auth" data-eden-personal-auth><form class="eden-personal-grid" data-eden-login-form><input name="username" placeholder="Username" autocomplete="username" data-eden-personal-username /><input name="password" type="password" placeholder="Password" autocomplete="current-password" data-eden-personal-password /><div class="eden-personal-actions"><button type="submit">Claim Your Room</button></div></form></div><div class="eden-personal-editor" data-eden-personal-editor hidden><div class="eden-personal-session" data-eden-personal-session></div><form class="eden-personal-grid" data-eden-personal-form><select name="kind"><option value="note">Note</option><option value="check">Check</option><option value="link">Link</option></select><input name="text" placeholder="Widget text" /><input name="href" placeholder="Optional link for link widgets" /><div class="eden-personal-actions"><button type="submit" data-eden-personal-submit>Add widget</button><button type="button" data-eden-personal-cancel hidden>Cancel edit</button><button type="button" data-eden-personal-logout>Logout</button></div></form></div><div class="eden-personal-status" data-eden-personal-status></div><div class="eden-personal-items" data-eden-personal-items></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const username = form.querySelector('[name="username"]').value;
        const password = form.querySelector('[name="password"]').value;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (!response.ok) {
          setPersonalStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setPersonalStatus('Room claimed. Your box is live.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-personal-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {
          kind: form.querySelector('[name="kind"]').value,
          text: form.querySelector('[name="text"]').value,
          href: form.querySelector('[name="href"]').value
        };
        const editingId = form.dataset.itemId || '';
        const response = await requestJson(editingId ? ('/api/eden/personal-box/items/' + encodeURIComponent(editingId)) : '/api/eden/personal-box/items', {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          setPersonalStatus(response.body?.error || 'save failed', 'error');
          render();
          return;
        }
        state.personalEditingId = null;
        setPersonalStatus(editingId ? 'Widget updated.' : 'Widget added.', 'ok');
        await refreshPersonalBox(surface);
      });
      node.querySelector('[data-eden-personal-cancel]').addEventListener('click', event => {
        state.personalEditingId = null;
        fillPersonalEditor(event.currentTarget.closest('form'), surface, null);
        setPersonalStatus('Edit cancelled.', 'ok');
      });
      node.querySelector('[data-eden-personal-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setPersonalStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        state.personalEditingId = null;
        setPersonalStatus('Signed out. The room is waiting.', 'ok');
        await refreshSessionSurfaces();
      });
      renderPersonalBox(node, surface);
    } else if (surface.panelKind === 'editPage') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-edit-auth" data-eden-edit-auth><form class="eden-edit-grid" data-eden-edit-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-edit-actions"><button type="submit">Open Edit Page</button></div></form></div><div class="eden-edit-editor" data-eden-edit-editor hidden><div class="eden-edit-session" data-eden-edit-session></div><form class="eden-edit-grid" data-eden-edit-form><select name="themeId"><option value="paper">Paper Cream</option><option value="straw">Straw</option><option value="moss">Moss</option></select><select name="material"><option value="linen">Linen</option><option value="wood">Wood</option><option value="stone">Stone</option></select><select name="typography"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select><div class="eden-edit-actions"><button type="submit">Apply to Todo</button><button type="button" data-eden-edit-reset>Reset View</button><button type="button" data-eden-edit-logout>Logout</button></div></form></div><div class="eden-edit-status" data-eden-edit-status></div><div class="eden-edit-preview" data-eden-edit-preview></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-edit-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: form.querySelector('[name="username"]').value,
            password: form.querySelector('[name="password"]').value
          })
        });
        if (!response.ok) {
          setEditStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setEditStatus('Edit page unlocked for this session.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-edit-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/eden/page-theme', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            themeId: form.querySelector('[name="themeId"]').value,
            material: form.querySelector('[name="material"]').value,
            typography: form.querySelector('[name="typography"]').value
          })
        });
        if (!response.ok) {
          setEditStatus(response.body?.error || 'page theme save failed', 'error');
          render();
          return;
        }
        surface.runtime = { ...(surface.runtime || {}), mode: 'pageTheme', pageId: surface.pageId || 'todo_app_widget', pageTheme: response.body?.pageTheme || null };
        setEditStatus('Todo page treatment updated.', 'ok');
        reloadEmbeddedTodoPage();
        await refreshPageTheme(surface);
      });
      node.querySelector('[data-eden-edit-reset]').addEventListener('click', async () => {
        await refreshPageTheme(surface);
        setEditStatus('Reloaded current page treatment.', 'ok');
      });
      node.querySelector('[data-eden-edit-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setEditStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        setEditStatus('Signed out. Edit Page is dormant again.', 'ok');
        await refreshSessionSurfaces();
      });
      renderEditPage(node, surface);
    } else if (surface.panelKind === 'versions') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-version-auth" data-eden-version-auth><form class="eden-version-grid" data-eden-version-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-version-actions"><button type="submit">Open Versions</button></div></form></div><div class="eden-version-editor" data-eden-version-editor hidden><div class="eden-version-session" data-eden-version-session></div><div class="eden-version-actions"><button type="button" data-eden-version-open-published>View published in board</button><button type="button" data-eden-version-open-draft>Open draft in board</button><button type="button" data-eden-version-restore>Restore last good</button><button type="button" data-eden-version-publish>Publish current</button><button type="button" data-eden-version-refresh>Refresh</button><button type="button" data-eden-version-logout>Logout</button></div></div><div class="eden-version-status" data-eden-version-status></div><div class="eden-version-summary" data-eden-version-summary></div><div class="eden-version-card"><div class="eden-version-card-kicker">Compare to published</div><div class="eden-version-diff" data-eden-version-diff-published></div></div><div class="eden-version-card"><div class="eden-version-card-kicker">Compare to draft</div><div class="eden-version-diff" data-eden-version-diff-draft></div></div><div class="eden-version-list" data-eden-version-list></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-version-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: form.querySelector('[name="username"]').value,
            password: form.querySelector('[name="password"]').value
          })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setVersionStatus('Versions unlocked for this session.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-version-open-published]').addEventListener('click', async () => {
        const runtime = versionsRuntime(surface);
        const response = await requestJson('/api/eden/versions/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: runtime.publishedVersion })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'published activation failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || runtime;
        setVersionStatus('Published version loaded into the board.', 'ok');
        reloadEmbeddedTodoPage();
        render();
      });
      node.querySelector('[data-eden-version-open-draft]').addEventListener('click', async () => {
        const runtime = versionsRuntime(surface);
        const response = await requestJson('/api/eden/versions/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: runtime.draftVersion })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'draft activation failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || runtime;
        setVersionStatus('Draft version opened in the live board.', 'ok');
        reloadEmbeddedTodoPage();
        render();
      });
      node.querySelector('[data-eden-version-restore]').addEventListener('click', async () => {
        const response = await requestJson('/api/eden/versions/rollback', {
          method: 'POST'
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'restore failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || versionsRuntime(surface);
        setVersionStatus('Restored the last good version.', 'ok');
        reloadEmbeddedTodoPage();
        render();
      });
      node.querySelector('[data-eden-version-publish]').addEventListener('click', async () => {
        const runtime = versionsRuntime(surface);
        const response = await requestJson('/api/eden/versions/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: runtime.activeVersion })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'publish failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || runtime;
        setVersionStatus('Current live version is now published.', 'ok');
        render();
      });
      node.querySelector('[data-eden-version-refresh]').addEventListener('click', async () => {
        await refreshVersions(surface);
        setVersionStatus('Reloaded version state.', 'ok');
      });
      node.querySelector('[data-eden-version-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        setVersionStatus('Signed out. Versions are read-only again.', 'ok');
        await refreshSessionSurfaces();
      });
      renderVersions(node, surface);
    } else {
      node = document.createElement('section');
      node.className = 'eden-surface' + (surface.href ? ' eden-surface-link' : '');
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
    }
    bindSurfaceNode(node, surface);
    surfacesRoot.appendChild(node);
    state.elements.set(surface.id, node);
    return node;
  }

  function renderConnections() {
    svg.innerHTML = '';
    const visible = new Map(model.surfaces.filter(isVisible).map(surface => [surface.id, surface]));
    for (const connection of model.connections) {
      const from = visible.get(connection.from);
      const to = visible.get(connection.to);
      if (!from || !to) continue;
      const { start, end } = core.layoutConnector(from, to);
      const a = core.worldToScreen(state.camera, start.x, start.y);
      const b = core.worldToScreen(state.camera, end.x, end.y);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      line.setAttribute('stroke-width', connection.visualType === 'pipe' ? '4' : connection.visualType === 'path' ? '3' : '2');
      line.setAttribute('stroke', connection.visualType === 'pipe' ? 'var(--eden-pipe)' : connection.visualType === 'path' ? 'var(--eden-path)' : 'var(--eden-wire)');
      line.setAttribute('stroke-dasharray', connection.visualType === 'path' ? '10 10' : 'none');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
      if (connection.label) {
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', String((a.x + b.x) / 2));
        text.setAttribute('y', String((a.y + b.y) / 2 - 6));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'eden-connector-label');
        text.textContent = connection.label;
        svg.appendChild(text);
      }
    }
  }

  function renderPrompt() {
    const prompt = model.prompts.find(row => {
      const minZoom = row.visibleRange?.minZoom ?? 0;
      const maxZoom = row.visibleRange?.maxZoom ?? 99;
      return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
    }) || null;
    promptEl.hidden = !prompt;
    promptEl.textContent = prompt ? prompt.text : '';
  }

  function renderCheckpoint() {
    const checkpoint = model.checkpoints.find(row => {
      const minZoom = row.visibleRange?.minZoom ?? 0;
      const maxZoom = row.visibleRange?.maxZoom ?? 99;
      return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
    }) || null;
    chapterEl.hidden = !checkpoint;
    if (!checkpoint) return;
    chapterTitleEl.textContent = checkpoint.title;
    chapterBodyEl.textContent = checkpoint.description || checkpoint.statusText || '';
    chapterUnlocksEl.innerHTML = '';
    for (const item of checkpoint.unlocks || []) {
      const chip = document.createElement('span');
      chip.className = 'eden-chip is-open';
      chip.textContent = item;
      chapterUnlocksEl.appendChild(chip);
    }
  }

  function render() {
    for (const surface of model.surfaces) {
      const node = ensureSurface(surface);
      const visible = isVisible(surface);
      node.hidden = !visible;
      if (!visible) continue;
      const rect = rectToScreen(surface);
      node.style.left = rect.left + 'px';
      node.style.top = rect.top + 'px';
      node.style.width = rect.width + 'px';
      node.style.height = rect.height + 'px';
      node.dataset.relief = String(Math.max(0, Math.min(4, reliefLevelFor(surface))));
      node.classList.toggle('is-focused', state.focusSurfaceId === surface.id);
      if (surface.panelKind === 'personalBox') renderPersonalBox(node, surface);
      if (surface.panelKind === 'editPage') renderEditPage(node, surface);
      if (surface.panelKind === 'versions') renderVersions(node, surface);
    }
    renderConnections();
    renderPrompt();
    renderCheckpoint();
    const checkpoint = model.checkpoints.find(row => {
      const minZoom = row.visibleRange?.minZoom ?? 0;
      const maxZoom = row.visibleRange?.maxZoom ?? 99;
      return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
    }) || null;
    setStatus((checkpoint?.title || model.neighborhood.title || 'Eden Canvas') + ' · ' + state.camera.zoom.toFixed(2) + 'x');
  }

  function initCamera() {
    const target = model.cameraTargets.find(row => row.id === 'home')
      || model.cameraTargets.find(row => row.surfaceId === model.neighborhood.defaultSurfaceId)
      || model.cameraTargets[0]
      || null;
    if (target) focusTarget(target.id);
    else render();
  }

  function pointerPosition(event) {
    const rect = stage.getBoundingClientRect();
    return { px: event.clientX - rect.left, py: event.clientY - rect.top };
  }

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.target?.closest?.('button, input, select, textarea, a, form')) return;
    state.drag = { px: event.clientX, py: event.clientY, camera: { ...state.camera } };
    stage.classList.add('is-dragging');
  });

  window.addEventListener('pointermove', event => {
    if (!state.drag) return;
    state.camera.x = state.drag.camera.x + (event.clientX - state.drag.px);
    state.camera.y = state.drag.camera.y + (event.clientY - state.drag.py);
    render();
  });

  window.addEventListener('pointerup', () => {
    state.drag = null;
    stage.classList.remove('is-dragging');
  });

  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const { px, py } = pointerPosition(event);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.camera = core.zoomCameraAt(state.camera, px, py, factor);
    render();
  }, { passive: false });

  document.getElementById('eden-reset-view').addEventListener('click', () => focusTarget('home'));
  window.addEventListener('resize', render);
  setStatus(model.neighborhood.title || 'Eden Canvas');
  initCamera();
})();`;

export function renderEdenPage({ model }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model?.neighborhood?.title || "Eden Canvas")}</title>
<style>${EDEN_CSS}</style>
</head>
<body>
  <header class="eden-toolbar">
    <strong>Eden Canvas</strong>
    <span>${escapeHtml(model?.neighborhood?.title || "First Neighbourhood")}</span>
    <button id="eden-reset-view" type="button">Home</button>
    <a href="/">Open Todo</a>
    <a href="/canvas">Open Canvas</a>
  </header>
  <div class="eden-stage" id="eden-stage">
    <svg class="eden-connections" id="eden-connections"></svg>
    <div class="eden-surfaces" id="eden-surfaces"></div>
    <div class="eden-status" id="eden-status"></div>
    <aside class="eden-chapter" id="eden-chapter" hidden>
      <div class="eden-chapter-label">Current Chapter</div>
      <div class="eden-chapter-title" id="eden-chapter-title"></div>
      <div class="eden-chapter-body" id="eden-chapter-body"></div>
      <div class="eden-chapter-unlocks" id="eden-chapter-unlocks"></div>
    </aside>
    <div class="eden-prompt" id="eden-prompt" hidden></div>
  </div>
  <script>${EDEN_CLIENT_JS(model)}</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}
