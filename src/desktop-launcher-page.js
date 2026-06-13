import { renderDesktopRecentWorldsFactory } from "./desktop-launcher-recent-worlds.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderDesktopLauncherPage({
  message = ""
} = {}) {
  const safeMessage = typeof message === "string" ? message : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Witness Desktop</title>
  <style>
    :root {
      --bg: #efe8dc;
      --card: rgba(255, 252, 247, 0.96);
      --line: #d4c7b5;
      --ink: #1f1a15;
      --muted: #6f665c;
      --accent: #82512d;
      --accent-soft: #f3e5d6;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top left, rgba(255,255,255,.75), transparent 35%),
        linear-gradient(180deg, #f7f2ea 0%, var(--bg) 100%);
      color: var(--ink);
      font-family: Georgia, "Times New Roman", serif;
    }
    main {
      width: min(540px, calc(100vw - 32px));
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 24px 60px rgba(43, 27, 13, 0.12);
    }
    .kicker {
      display: inline-flex;
      padding: 5px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font: 11px/1.2 var(--mono);
      text-transform: uppercase;
      letter-spacing: .12em;
    }
    h1 {
      margin: 14px 0 10px;
      font-size: 1.95rem;
    }
    p {
      margin: 0 0 12px;
      color: var(--muted);
      line-height: 1.5;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
      margin: 18px 0;
      font-size: 14px;
    }
    dt { color: var(--muted); }
    dd { margin: 0; font-family: var(--mono); word-break: break-word; }
    .actions {
      display: grid;
      gap: 10px;
      margin: 18px 0;
    }
    button {
      appearance: none;
      border: 1px solid #724c30;
      border-radius: 12px;
      padding: 11px 14px;
      background: #82512d;
      color: white;
      font: inherit;
      cursor: pointer;
    }
    button.secondary {
      background: white;
      color: var(--accent);
    }
    button:disabled {
      opacity: .6;
      cursor: default;
    }
    .status {
      min-height: 1.4em;
      color: var(--accent);
      margin-bottom: 8px;
    }
    .recent {
      margin-top: 20px;
      border-top: 1px solid var(--line);
      padding-top: 16px;
    }
    .recent h2 {
      margin: 0 0 10px;
      font-size: 1rem;
    }
    .recent-list {
      display: grid;
      gap: 8px;
    }
    .recent-row {
      display: grid;
      gap: 4px;
      border: 1px solid var(--line);
      background: white;
      border-radius: 12px;
      padding: 10px 12px;
      text-align: left;
    }
    .recent-row strong {
      font: 600 13px/1.35 var(--mono);
      color: var(--ink);
      word-break: break-all;
    }
    .recent-row span {
      color: var(--muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main>
    <div class="kicker">Desktop Ownership Shell</div>
    <h1>Choose A Local World</h1>
    <p id="launcher-summary">Loading desktop state...</p>
    <dl>
      <dt>Runtime Profile</dt>
      <dd id="launcher-profile">full</dd>
      <dt>Runtime Status</dt>
      <dd id="launcher-runtime-status">idle</dd>
    </dl>
    <p id="launcher-status" class="status">${escapeHtml(safeMessage)}</p>
    <div class="actions">
      <button type="button" id="open-existing-world">Open Existing World</button>
      <button type="button" class="secondary" id="create-new-world">Create New World</button>
    </div>
    <section class="recent">
      <h2>Recent Worlds</h2>
      <div id="recent-worlds" class="recent-list"></div>
    </section>
  </main>
  <script>
    ${renderDesktopRecentWorldsFactory()}
    (() => {
      const initialMessage = ${jsonForScript(safeMessage)};
      const byId = id => document.getElementById(id);
      const desktop = window.witnessDesktop;
      let state = null;

      const setStatus = text => {
        byId("launcher-status").textContent = text || "";
      };

      bindDesktopRecentWorlds({
        root: byId("recent-worlds"),
        desktop,
        setStatus,
        refresh
      });

      const render = () => {
        byId("launcher-profile").textContent = state?.runtimeProfile || "full";
        byId("launcher-runtime-status").textContent = state?.runtimeStatus || "idle";
        byId("launcher-summary").textContent = state?.launcherRequired === false
          ? "Desktop runtime is already active."
          : "Open or create a named WORLD_HOME before entering the app.";
        if (!byId("launcher-status").textContent && initialMessage) setStatus(initialMessage);
        renderDesktopRecentWorlds({
          root: byId("recent-worlds"),
          rows: state?.recentWorldHomes || [],
          document
        });
      };

      const refresh = async () => {
        if (!desktop || typeof desktop.getDesktopShellState !== "function") {
          throw new Error("Desktop bridge unavailable. Restart the desktop shell.");
        }
        state = await desktop.getDesktopShellState();
        render();
      };

      const bindAction = (buttonId, action, workingLabel) => {
        byId(buttonId).addEventListener("click", async () => {
          setStatus(workingLabel);
          const result = await desktop[action]();
          if (result?.canceled) {
            setStatus(action === "createWorldHome" ? "Create world canceled." : "Open world canceled.");
            return;
          }
          if (result?.ok === false) {
            setStatus(result.reason || "Desktop action failed.");
            await refresh();
            return;
          }
        });
      };

      bindAction("open-existing-world", "openWorldHome", "Opening world...");
      bindAction("create-new-world", "createWorldHome", "Creating world...");
      refresh().catch(error => setStatus(error instanceof Error ? error.message : String(error)));
    })();
  </script>
</body>
</html>`;
}
