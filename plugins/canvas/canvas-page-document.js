export function renderCanvasPageDocument({ css, clientJs }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Witness Canvas</title>
<style>${css}</style>
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
<script>${clientJs}</script>
</body>
</html>`;
}
