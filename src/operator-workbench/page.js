import { renderOperatorWorkbenchRuntimeFactory } from "./runtime.js";

export function renderOperatorWorkbenchPage() {
  const bootstrapScript = `
    (() => {
      const api = window.witnessOperatorWorkbench || null;
      const byId = id => document.getElementById(id);
      function paintBootstrapCanvas(status, detail) {
        const canvas = byId("operator-canvas");
        if (!canvas || typeof canvas.getContext !== "function") return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const width = Math.max(640, window.innerWidth || 1280);
        const height = Math.max(400, window.innerHeight || 900);
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        const wrapText = (text, maxWidth) => {
          const words = String(text || "").split(/\s+/).filter(Boolean);
          const lines = [];
          let current = "";
          for (const word of words) {
            const next = current ? current + " " + word : word;
            if (context.measureText(next).width <= maxWidth || !current) {
              current = next;
            } else {
              lines.push(current);
              current = word;
            }
          }
          if (current) lines.push(current);
          return lines.length ? lines : [""];
        };
        context.fillStyle = "#0b0f0d";
        context.fillRect(0, 0, width, height);
        const boxWidth = Math.min(width - 48, 920);
        const bodyLines = wrapText(String(status || "Booting operator workbench..."), boxWidth - 32);
        const detailLines = detail ? wrapText(String(detail), boxWidth - 32) : [];
        const footerLine = "F12 devtools  |  Ctrl+W close  |  drag top strip to move";
        const boxHeight = 110 + (bodyLines.length * 24) + (detailLines.length * 24) + 36;
        const boxX = Math.max(24, Math.floor((width - boxWidth) / 2));
        const boxY = Math.max(48, Math.floor((height - boxHeight) / 2));
        context.fillStyle = "#51665d";
        context.strokeStyle = "#51665d";
        context.lineWidth = 1;
        context.strokeRect(boxX, boxY, boxWidth, boxHeight);
        context.strokeRect(boxX, boxY, boxWidth, 36);
        context.font = "16px Consolas, 'Cascadia Mono', 'Courier New', monospace";
        context.fillStyle = "#b6ffd7";
        context.fillText("Operator TUI", boxX + 16, boxY + 22);
        let textY = boxY + 76;
        context.fillStyle = "#d7e2d2";
        bodyLines.forEach(line => {
          context.fillText(line, boxX + 16, textY);
          textY += 24;
        });
        if (detailLines.length) {
          context.fillStyle = "#ffb86c";
          detailLines.forEach(line => {
            context.fillText(line, boxX + 16, textY);
            textY += 24;
          });
        }
        context.fillStyle = "#8d9b8c";
        context.fillText(footerLine, boxX + 16, boxY + boxHeight - 22);
      }
      function setBootstrapStatus(status, detail) {
        const statusNode = byId("operator-bootstrap-status");
        if (statusNode) {
          statusNode.hidden = false;
          statusNode.dataset.state = detail ? "error" : "booting";
          statusNode.innerHTML = '<strong>' + String(status || "Booting operator workbench...") + '</strong>' + (detail ? '<div>' + String(detail) + '</div>' : "");
        }
        paintBootstrapCanvas(status, detail);
      }
      async function windowControl(action) {
        if (!api || typeof api.windowControl !== "function") return;
        try {
          await api.windowControl(action);
        } catch {}
      }
      function wireFallbackChrome() {
        const minimize = byId("operator-window-minimize");
        const maximize = byId("operator-window-maximize");
        const close = byId("operator-window-close");
        minimize?.addEventListener("click", event => {
          event.preventDefault();
          void windowControl("minimize");
        });
        maximize?.addEventListener("click", event => {
          event.preventDefault();
          void windowControl("toggle-maximize");
        });
        close?.addEventListener("click", event => {
          event.preventDefault();
          void windowControl("close");
        });
        const drag = byId("operator-window-drag");
        drag?.addEventListener("dblclick", event => {
          event.preventDefault();
          void windowControl("toggle-maximize");
        });
      }
      document.addEventListener("keydown", event => {
        const lower = String(event.key || "").toLowerCase();
        if ((event.ctrlKey || event.metaKey) && lower === "w") {
          event.preventDefault();
          void windowControl("close");
        }
      });
      window.addEventListener("error", event => {
        setBootstrapStatus("Operator workbench failed during load.", event?.error?.message || event?.message || "unknown renderer error");
      });
      window.addEventListener("unhandledrejection", event => {
        const reason = event?.reason instanceof Error ? event.reason.message : String(event?.reason || "unknown rejection");
        setBootstrapStatus("Operator workbench failed during startup.", reason);
      });
      window.__operatorWorkbenchBooted = () => {
        document.body.dataset.runtimeBooted = "true";
        const statusNode = byId("operator-bootstrap-status");
        if (statusNode) statusNode.hidden = true;
      };
      window.__operatorWorkbenchSetBootstrapStatus = setBootstrapStatus;
      setBootstrapStatus("Booting operator workbench...", api ? "" : "witnessOperatorWorkbench bridge missing");
      wireFallbackChrome();
    })();
  `;
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
      #operator-window-drag {
        position: fixed;
        left: 0;
        top: 0;
        right: 132px;
        height: 32px;
        pointer-events: auto;
        background: rgba(11, 15, 13, 0.92);
        -webkit-app-region: drag;
        -webkit-user-select: none;
        user-select: none;
        z-index: 3;
      }
      #operator-window-controls {
        position: fixed;
        inset: 0 0 auto auto;
        display: flex;
        gap: 0;
        pointer-events: auto;
        -webkit-app-region: no-drag;
        -webkit-user-select: none;
        user-select: none;
        z-index: 4;
        background: rgba(11, 15, 13, 0.92);
      }
      .operator-window-control {
        appearance: none;
        border: 0;
        margin: 0;
        padding: 0;
        width: 44px;
        height: 32px;
        background: transparent;
        color: var(--fg);
        cursor: default;
        font: 14px/1 var(--font-family);
        text-align: center;
        -webkit-user-select: none;
        user-select: none;
      }
      .operator-window-control:focus {
        outline: none;
      }
      .operator-window-control:hover {
        background: rgba(110, 231, 168, 0.12);
      }
      #operator-window-close:hover {
        background: rgba(255, 123, 114, 0.18);
        color: #ffe0db;
      }
      body[data-runtime-booted="true"] #operator-window-drag,
      body[data-runtime-booted="true"] #operator-window-controls {
        background: transparent;
      }
      body[data-runtime-booted="true"] .operator-window-control {
        color: transparent;
      }
      body[data-runtime-booted="true"] .operator-window-control:hover,
      body[data-runtime-booted="true"] #operator-window-close:hover {
        background: transparent;
      }
      #operator-canvas {
        display: block;
        width: 100vw;
        height: 100vh;
        background: var(--bg);
        image-rendering: pixelated;
        cursor: default;
      }
      #operator-bootstrap-status {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
        width: min(72ch, calc(100vw - 80px));
        padding: 10px 12px;
        border: 1px solid rgba(81, 102, 93, 0.9);
        background: rgba(11, 15, 13, 0.92);
        color: var(--fg);
        font: 14px/1.35 var(--font-family);
        white-space: pre-wrap;
      }
      #operator-bootstrap-status[data-state="error"] {
        border-color: rgba(255, 184, 108, 0.95);
        color: #ffe4c2;
      }
      body[data-runtime-booted="true"] #operator-bootstrap-status {
        display: none;
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
    <div id="operator-window-drag" aria-hidden="true"></div>
    <div id="operator-window-controls" aria-label="Window Controls">
      <button type="button" id="operator-window-minimize" class="operator-window-control" aria-label="Minimize">[_]</button>
      <button type="button" id="operator-window-maximize" class="operator-window-control" aria-label="Maximize">[□]</button>
      <button type="button" id="operator-window-close" class="operator-window-control" aria-label="Close">[X]</button>
    </div>
    <canvas id="operator-canvas" aria-label="Operator TUI"></canvas>
    <div id="operator-bootstrap-status" aria-live="polite">Booting operator workbench...</div>
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
${bootstrapScript}
    </script>
    <script>
${clientScript}
    </script>
  </body>
</html>`;
}
