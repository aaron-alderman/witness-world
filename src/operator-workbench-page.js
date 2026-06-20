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
    <title>Operator Workbench</title>
    <style>
      :root {
        --bg: #efe7d7;
        --panel: rgba(255,255,255,0.78);
        --panel-strong: rgba(255,255,255,0.92);
        --ink: #251b12;
        --muted: #6d5a48;
        --accent: #1d6b57;
        --accent-strong: #104739;
        --border: rgba(76, 52, 29, 0.14);
        --shadow: 0 18px 44px rgba(59, 39, 19, 0.12);
        --operator-font-size: 14px;
        --operator-pane-split: 42%;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font: var(--operator-font-size)/1.45 "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(29,107,87,0.14), transparent 34%),
          linear-gradient(180deg, #f5eee2 0%, #efe7d7 45%, #e7decc 100%);
      }
      .operator-shell {
        display: grid;
        grid-template-rows: auto 1fr auto;
        min-height: 100vh;
        gap: 12px;
        padding: 14px;
      }
      .operator-panel {
        border: 1px solid var(--border);
        background: var(--panel);
        box-shadow: var(--shadow);
        border-radius: 18px;
        backdrop-filter: blur(18px);
      }
      .operator-top {
        padding: 12px 16px;
        display: grid;
        grid-template-columns: minmax(220px, auto) minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px;
      }
      .operator-top h1 {
        margin: 0;
        font-size: 1rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .operator-top small,
      .operator-top .operator-nav-meta {
        color: var(--muted);
      }
      .operator-nav-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: flex-start;
      }
      .operator-nav-chip {
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.72);
        color: var(--ink);
        border-radius: 999px;
        padding: 7px 12px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font: inherit;
      }
      .operator-nav-chip[data-tone="accent"] {
        border-color: rgba(29,107,87,0.28);
        background: rgba(29,107,87,0.12);
      }
      .operator-nav-chip[data-tone="warning"] {
        border-color: rgba(159, 47, 27, 0.26);
        background: rgba(159, 47, 27, 0.10);
      }
      .operator-nav-chip[data-tone="muted"] {
        color: var(--muted);
      }
      .operator-nav-chip[data-active="true"] strong {
        color: var(--accent-strong);
      }
      .operator-nav-chip[data-selected="true"] {
        border-color: var(--accent);
        box-shadow: inset 0 0 0 1px rgba(29,107,87,0.18);
      }
      .operator-nav-chip[data-selected="true"][data-tone="warning"] {
        border-color: #9f2f1b;
        box-shadow: inset 0 0 0 1px rgba(159, 47, 27, 0.18);
      }
      .operator-nav-chip small {
        color: var(--muted);
      }
      .operator-main {
        display: grid;
        grid-template-columns: minmax(320px, var(--operator-pane-split)) minmax(360px, 1fr);
        gap: 12px;
        min-height: 0;
      }
      .operator-left,
      .operator-right {
        display: grid;
        grid-template-rows: auto 1fr;
        min-height: 0;
      }
      .operator-pane-head {
        padding: 12px 14px 10px;
        border-bottom: 1px solid var(--border);
      }
      .operator-pane-head h2 {
        margin: 0;
        font-size: 0.96rem;
      }
      .operator-pane-head .operator-pane-meta {
        color: var(--muted);
        margin-top: 4px;
        font-size: 0.86rem;
      }
      .operator-pane-body {
        min-height: 0;
        overflow: auto;
        padding: 10px;
      }
      .operator-row,
      .operator-reference {
        width: 100%;
        border: 1px solid transparent;
        background: transparent;
        color: inherit;
        display: grid;
        grid-template-columns: 34px 1fr;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        text-align: left;
        cursor: pointer;
      }
      .operator-row:hover,
      .operator-reference:hover {
        background: rgba(29,107,87,0.08);
      }
      .operator-row[data-active="true"],
      .operator-reference[data-active="true"] {
        border-color: rgba(29,107,87,0.36);
        background: rgba(29,107,87,0.14);
      }
      .operator-reference[data-disabled="true"] {
        cursor: default;
        opacity: 0.7;
      }
      .operator-row[data-selected="true"] strong::after {
        content: "  [this]";
        color: var(--accent-strong);
        font-size: 0.82rem;
      }
      .operator-row-main,
      .operator-reference {
        display: grid;
      }
      .operator-row-main span,
      .operator-reference span,
      .operator-inspector-line {
        color: var(--muted);
      }
      .operator-row-index {
        color: var(--accent-strong);
        font-weight: 700;
      }
      .operator-table-header,
      .operator-row-table {
        display: grid;
        gap: 10px;
        align-items: center;
      }
      .operator-table-cell {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .operator-table-head {
        color: var(--accent-strong);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-size: 0.76rem;
      }
      .operator-tabs {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }
      .operator-tabs button,
      .operator-command button,
      .operator-settings button {
        border: 1px solid var(--border);
        background: var(--panel-strong);
        border-radius: 999px;
        color: var(--ink);
        padding: 8px 12px;
        cursor: pointer;
      }
      .operator-tabs button[data-active="true"] {
        background: var(--accent);
        border-color: var(--accent);
        color: #f8f2e8;
      }
      .operator-inspector-line {
        padding: 2px 0;
        white-space: pre-wrap;
      }
      .operator-source-layout {
        display: grid;
        gap: 12px;
      }
      .operator-screen-sections {
        display: grid;
        gap: 12px;
      }
      .operator-screen-section {
        display: grid;
        gap: 10px;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px;
        background: rgba(255,255,255,0.56);
      }
      .operator-screen-section[data-active="true"] {
        border-color: rgba(29,107,87,0.32);
        box-shadow: inset 0 0 0 1px rgba(29,107,87,0.14);
      }
      .operator-screen-section[data-actionable="false"] {
        border-style: dashed;
      }
      .operator-screen-section[data-collapsed="true"] {
        background: rgba(255,255,255,0.42);
      }
      .operator-screen-section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .operator-screen-section-header,
      .operator-screen-section-toggle {
        border: 1px solid transparent;
        background: transparent;
        color: inherit;
        font: inherit;
      }
      .operator-screen-section-header {
        display: grid;
        gap: 4px;
        justify-items: start;
        text-align: left;
        padding: 0;
        cursor: pointer;
      }
      .operator-screen-section-toggle {
        padding: 4px 8px;
        border-radius: 999px;
        border-color: var(--border);
        background: rgba(255,255,255,0.68);
        cursor: pointer;
      }
      .operator-screen-section-toggle[disabled] {
        cursor: default;
        opacity: 0.55;
      }
      .operator-screen-section-head span {
        color: var(--muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .operator-row-static,
      .operator-reference-static {
        cursor: default;
      }
      .operator-reference-screen {
        display: grid;
        grid-template-columns: minmax(240px, 0.9fr) minmax(260px, 1.1fr);
        gap: 12px;
        min-height: 0;
      }
      .operator-reference-groups,
      .operator-reference-detail {
        display: grid;
        gap: 10px;
        align-content: start;
        min-height: 0;
      }
      .operator-reference-group {
        display: grid;
        gap: 6px;
      }
      .operator-reference-group h3 {
        margin: 0;
        font-size: 0.84rem;
        color: var(--accent-strong);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .operator-reference-uri {
        font-family: "Consolas", "SFMono-Regular", monospace;
        font-size: 0.82rem;
        color: var(--muted);
        word-break: break-all;
      }
      .operator-source-list {
        display: grid;
        gap: 8px;
      }
      .operator-source-excerpt {
        border-top: 1px solid var(--border);
        padding-top: 12px;
      }
      .operator-bottom {
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 12px;
        padding: 12px 14px;
      }
      .operator-command {
        display: grid;
        gap: 8px;
      }
      .operator-command input,
      .operator-settings input,
      .operator-settings select {
        width: 100%;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.9);
        color: var(--ink);
        padding: 10px 12px;
        font: inherit;
      }
      .operator-command-hints,
      .operator-output,
      .operator-settings label {
        color: var(--muted);
        font-size: 0.88rem;
      }
      .operator-output strong[data-status="error"] { color: #9f2f1b; }
      .operator-output strong[data-status="info"] { color: var(--accent-strong); }
      .operator-settings {
        display: grid;
        gap: 8px;
      }
      .operator-settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 10px;
      }
      .operator-help {
        position: fixed;
        inset: 24px 24px auto auto;
        width: min(520px, calc(100vw - 48px));
        padding: 16px;
        z-index: 20;
      }
      .operator-help h3,
      .operator-settings h3 {
        margin: 0 0 8px;
      }
      .operator-help p {
        margin: 6px 0;
        color: var(--muted);
      }
      .operator-empty {
        color: var(--muted);
        padding: 14px;
      }
      @media (max-width: 1080px) {
        .operator-main,
        .operator-bottom {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="operator-shell">
      <section class="operator-panel operator-top">
        <div>
          <h1 id="operator-title">Operator Workbench</h1>
          <small id="operator-subtitle">global</small>
        </div>
        <div>
          <div class="operator-nav-strip" id="operator-nav-strip"></div>
          <div class="operator-nav-meta" id="operator-nav-meta"></div>
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button type="button" id="operator-help-button">F1 Help</button>
        </div>
      </section>

      <section class="operator-main">
        <section class="operator-panel operator-left">
          <div class="operator-pane-head">
            <h2 id="operator-left-title">Tree</h2>
            <div class="operator-pane-meta" id="operator-left-header"></div>
          </div>
          <div class="operator-pane-body" id="operator-left-rows"></div>
        </section>

        <section class="operator-panel operator-right">
          <div class="operator-pane-head">
            <h2 id="operator-inspector-title">Inspector</h2>
            <div class="operator-tabs">
              <button type="button" id="operator-tab-inspect">Inspect</button>
              <button type="button" id="operator-tab-references">References</button>
              <button type="button" id="operator-tab-source">Source</button>
              <button type="button" id="operator-tab-provenance">Provenance</button>
            </div>
          </div>
          <div class="operator-pane-body">
            <div id="operator-custom-screen-body"></div>
          </div>
        </section>
      </section>

      <section class="operator-panel operator-bottom">
        <div class="operator-command">
          <div class="operator-command-hints">Alt+Up navigation | Alt+Left tree | Alt+Right inspector | Alt+Down commands | Esc unwind | Enter primary action | <span id="operator-number-buffer"></span></div>
          <input id="operator-command-input" autocomplete="off" spellcheck="false" placeholder="Type a command or use keyboard navigation">
          <div class="operator-command-hints" id="operator-command-preview"></div>
          <div class="operator-command-hints" id="operator-command-matches"></div>
          <div class="operator-output"><strong id="operator-last-status">info</strong> <span id="operator-last-output">Ready.</span></div>
        </div>
        <div class="operator-settings">
          <h3>Display</h3>
          <div class="operator-settings-grid">
            <label>Font Size<input id="operator-setting-font-size" type="number" min="11" max="22"></label>
            <label>Row Density<select id="operator-setting-row-density"><option value="compact">compact</option><option value="comfortable">comfortable</option><option value="relaxed">relaxed</option></select></label>
            <label>Pane Split<input id="operator-setting-pane-split" type="range" min="25" max="70"></label>
            <label>Page Size<input id="operator-setting-page-size" type="number" min="10" max="100"></label>
            <label>Color Mode<select id="operator-setting-color-mode"><option value="auto">auto</option><option value="on">on</option><option value="off">off</option></select></label>
          </div>
          <button type="button" id="operator-settings-save">Save Display Settings</button>
        </div>
      </section>

      <aside class="operator-panel operator-help" id="operator-help" hidden>
        <h3>Workbench Help</h3>
        <p><strong id="operator-help-context">Pane</strong> <span id="operator-help-summary">Browse and inspect the modeled system.</span></p>
        <p><strong>Primary action</strong>: number buffer plus <code>Enter</code> acts on the highlighted row.</p>
        <p><strong>Tree/results</strong>: <code>Up</code>, <code>Down</code>, <code>Home</code>, <code>End</code>, <code>PageUp</code>, <code>PageDown</code>.</p>
        <p><strong>Pane focus</strong>: <code>Alt+Up</code>, <code>Alt+Left</code>, <code>Alt+Right</code>, <code>Alt+Down</code>.</p>
        <p><strong>Inspector</strong>: <code>F2</code> opens References, <code>F3</code> Source, and <code>F4</code> Provenance. Authored shortcuts can use <code>F5</code>-<code>F8</code>.</p>
        <p><strong>Command bar</strong>: <code>Tab</code> completes. <code>s</code> seeds sort. <code>f</code> seeds filter.</p>
      </aside>
    </div>
    <script>
${clientScript}
    </script>
  </body>
</html>`;
}
