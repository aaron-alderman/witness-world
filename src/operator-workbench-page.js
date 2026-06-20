import { renderOperatorWorkbenchRuntimeFactory } from "./operator-workbench-runtime.js";

export function renderOperatorWorkbenchPage() {
  const clientScript = `
    ${renderOperatorWorkbenchRuntimeFactory()}
    (() => {
      startOperatorWorkbenchRuntime({
        windowTarget: window,
        documentTarget: document
      });
    })();
  `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Operator TUI</title>
    <style>
      :root {
        --bg: #0b0f0d;
        --fg: #d7e2d2;
        --muted: #8d9b8c;
        --accent: #6ee7a8;
        --warning: #ffb86c;
        --danger: #ff7b72;
        --font-size: 14px;
        --font-family: "Consolas", "Cascadia Mono", "Cascadia Code", "SFMono-Regular", "Courier New", monospace;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: var(--bg);
        color: var(--fg);
        font: var(--font-size)/1 var(--font-family);
      }
      body {
        position: relative;
      }
      #operator-canvas {
        display: block;
        width: 100vw;
        height: 100vh;
        background: var(--bg);
        image-rendering: pixelated;
        cursor: default;
      }
      #operator-command-input {
        position: fixed;
        left: -9999px;
        top: 0;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      #operator-dom-hooks {
        display: none;
      }
    </style>
  </head>
  <body>
    <canvas id="operator-canvas" aria-label="Operator TUI"></canvas>
    <textarea id="operator-command-input" autocomplete="off" spellcheck="false"></textarea>
    <div id="operator-dom-hooks" aria-hidden="true">
      <div id="operator-title">Operator TUI</div>
      <div id="operator-subtitle">global shell</div>
      <div id="operator-nav-strip"></div>
      <div id="operator-nav-meta"></div>
      <div id="operator-left-title">LEFT PANE</div>
      <div id="operator-left-header"></div>
      <div id="operator-left-rows"></div>
      <div id="operator-inspector-title">RIGHT PANE</div>
      <button type="button" id="operator-tab-inspect">INSPECT</button>
      <button type="button" id="operator-tab-references">REFS</button>
      <button type="button" id="operator-tab-source">SOURCE</button>
      <button type="button" id="operator-tab-provenance">PROVENANCE</button>
      <div id="operator-custom-screen-body"></div>
      <div id="operator-command-preview"></div>
      <div id="operator-command-matches"></div>
      <div id="operator-last-output">ready</div>
      <div id="operator-last-status">info</div>
      <div id="operator-number-buffer"></div>
      <button type="button" id="operator-help-button">help</button>
      <button type="button" id="operator-settings-save">save</button>
      <input id="operator-setting-font-size" type="number" value="14">
      <select id="operator-setting-row-density">
        <option value="compact">compact</option>
        <option value="comfortable" selected>comfortable</option>
        <option value="relaxed">relaxed</option>
      </select>
      <input id="operator-setting-pane-split" type="range" min="25" max="70" value="42">
      <input id="operator-setting-page-size" type="number" value="25">
      <select id="operator-setting-color-mode">
        <option value="auto" selected>auto</option>
        <option value="on">on</option>
        <option value="off">off</option>
      </select>
      <div id="operator-help" hidden></div>
      <div id="operator-help-context"></div>
      <div id="operator-help-summary"></div>
    </div>
    <script>
${clientScript}
    </script>
  </body>
</html>`;
}
