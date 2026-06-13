import { TODO_TUTORIAL_ID } from "../tutorial/tutorials.js";
import { bootstrapTutorialPageData } from "../tutorial/tutorial-runtime-ui.js";
import {
  renderBootstrapTutorialStyles,
  renderBootstrapTutorialCard,
  renderBootstrapTutorialOverlay
} from "../tutorial/tutorial-bootstrap-ui.js";
import { renderBootstrapTutorialStateFactory } from "../tutorial/tutorial-bootstrap-client.js";
import { renderBootstrapTutorialControllerFactory } from "../tutorial/tutorial-bootstrap-controller-client.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderBootstrapPage() {
  const { tutorial, blueprint } = bootstrapTutorialPageData();
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Witness Bootstrap</title>
  <style>
    :root { --bg: #f4f1ea; --card: #fffdf8; --line: #d9d2c7; --ink: #1f1b17; --muted: #6a635b; --accent: #7a4d2a; --accent-soft: #efe1d3; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: linear-gradient(180deg, #f7f2eb 0%, #efe9df 100%); color: var(--ink); }
    header { padding: 28px 32px 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.7); backdrop-filter: blur(6px); position: sticky; top: 0; z-index: 4; }
    header small { display: inline-block; text-transform: uppercase; letter-spacing: .16em; color: var(--muted); font-size: 11px; margin-bottom: 8px; }
    header h1 { margin: 0 0 8px; font-size: 2rem; }
    header p { margin: 0; max-width: 960px; color: var(--muted); line-height: 1.5; }
    main { display: grid; grid-template-columns: 1.25fr .95fr; gap: 20px; padding: 24px 32px 40px; align-items: start; }
    .column { display: grid; gap: 18px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; box-shadow: 0 10px 30px rgba(40, 24, 8, .06); }
    .card h2 { margin: 0 0 10px; font-size: 1.15rem; }
    .card p { margin: 0 0 10px; color: var(--muted); line-height: 1.5; }
    .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); padding: 5px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .stack { display: grid; gap: 12px; }
    .grid { display: grid; gap: 10px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
    input, select, textarea, button { font: inherit; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: white; color: var(--ink); }
    textarea { min-height: 96px; resize: vertical; font-family: var(--mono); font-size: 12px; line-height: 1.45; }
    button { border: 1px solid #734e31; background: #7a4d2a; color: white; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
    button.secondary { background: white; color: var(--accent); }
    button:disabled { opacity: .55; cursor: default; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .status { min-height: 1.2em; color: var(--accent); }
    .muted { color: var(--muted); }
    .state-list { display: grid; gap: 8px; max-height: 340px; overflow: auto; }
    .state-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: #fff; transition: box-shadow .24s ease, transform .24s ease, border-color .24s ease; }
    .state-item strong { display: block; margin-bottom: 3px; font-family: var(--mono); font-size: 12px; }
    .state-item code { font-family: var(--mono); font-size: 12px; color: var(--muted); white-space: pre-wrap; }
    .hide { display: none !important; }
    .note { border-left: 4px solid var(--accent); padding-left: 10px; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-family: var(--mono); }
    .chapter-list { display: grid; gap: 6px; margin: 12px 0; }
    .chapter-item { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: start; font-size: 13px; color: var(--muted); }
    .chapter-item strong { color: var(--ink); }
    .chapter-dot { width: 12px; height: 12px; border-radius: 999px; border: 1px solid var(--line); background: white; margin-top: 2px; }
    .chapter-active .chapter-dot { background: var(--accent); border-color: var(--accent); }
    .chapter-done .chapter-dot { background: #3f7d47; border-color: #3f7d47; }
    .chapter-active strong, .chapter-done strong { color: var(--ink); }
${renderBootstrapTutorialStyles()}
    .badge, #tutorial-overlay .tutorial-meta, .chapter-item div:last-child, #tutorial-summary, .state-list, #bootstrap-summary, #session-summary, #tutorial-status, #bootstrap-status,
    #identity-form input, #session-form input, #widget-form input, #widget-form select, #program-form input, #program-form select, #step-form input, #step-form select,
    #backend-program-form input, #backend-program-form select, #backend-program-version-form input, #backend-program-version-form select, #backend-step-form input, #backend-step-form select,
    #backend-program-activate-form select, #backend-program-rollback-form select,
    #route-form input, #route-form select, #serve-form select, #runner-form input, #runner-form select {
      font-family: var(--mono);
    }
    details summary { cursor: pointer; }
    @keyframes tutorial-focus-pulse {
      0%, 100% { outline-color: rgba(122, 77, 42, 1); box-shadow: 0 0 0 0 rgba(122, 77, 42, .08); }
      50% { outline-color: rgba(122, 77, 42, .65); box-shadow: 0 0 0 10px rgba(122, 77, 42, .12); }
    }
    @keyframes tutorial-changed-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(122, 77, 42, .18); }
      45% { transform: scale(1.01); box-shadow: 0 0 0 6px rgba(122, 77, 42, .12); }
    }
    @keyframes tutorial-text-pulse {
      0%, 100% { font-weight: 600; opacity: 1; }
      50% { font-weight: 400; opacity: .82; }
    }
    @keyframes tutorial-click-pulse {
      0% { transform: scale(.35); opacity: 1; }
      100% { transform: scale(2.6); opacity: 0; }
    }
    @keyframes tutorial-button-click {
      0% { transform: scale(1); }
      35% { transform: scale(.95); }
      100% { transform: scale(1); }
    }
    @media (max-width: 1100px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <small>Semi-Internal Bootstrap Seam</small>
    <h1>Recover And Author The App Boundary</h1>
    <p>This surface exists so a blank world can become a working app without exposing compiler and primitive machinery as the default user experience. App structures live here; deep substrate stays out of the way.</p>
  </header>
  <main>
    <section class="column">
${renderBootstrapTutorialCard()}

      <article class="card">
        <div class="badge">Platform Harness</div>
        <h2>Bootstrap Status</h2>
        <p id="bootstrap-summary">Loading bootstrap state...</p>
        <div class="actions">
          <a href="/" id="open-app-link" data-tutorial-target="open-app-link"><button type="button" class="secondary">Open App</button></a>
          <button type="button" class="secondary" id="refresh-bootstrap">Refresh</button>
        </div>
        <p class="status" id="bootstrap-status"></p>
      </article>

      <article class="card">
        <div class="badge">Desktop</div>
        <h2>Local World Ownership</h2>
        <p id="desktop-summary" class="muted">Desktop shell unavailable in this session.</p>
        <div class="actions">
          <button type="button" class="secondary" id="desktop-open-world">Open Existing World</button>
          <button type="button" class="secondary" id="desktop-create-world">Create New World</button>
          <button type="button" class="secondary" id="desktop-reveal-world">Reveal World Home</button>
        </div>
        <p class="status" id="desktop-status"></p>
      </article>

      <article class="card">
        <div class="badge">Operator</div>
        <h2>Persistence Flows</h2>
        <p id="operator-summary">Loading operator state...</p>
        <p id="operator-warning" class="note muted">Restore and import replace current world truth. Use preserve-current when you need a safety backup first.</p>

        <details open>
          <summary><strong>Backup And Export</strong></summary>
          <form id="operator-backup-form" class="stack">
            <div class="grid two">
              <label>Backup Label<input name="label" placeholder="before-major-change" /></label>
              <label>Include Derived Runtime<input name="includeDerived" type="checkbox" /></label>
            </div>
            <div class="actions"><button type="submit">Create Backup</button></div>
          </form>
          <p class="status" id="operator-backup-status"></p>

          <form id="operator-export-form" class="stack">
            <div class="grid two">
              <label>Export Label<input name="label" placeholder="portable-world" /></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Create Export</button></div>
          </form>
          <p class="status" id="operator-export-status"></p>
        </details>

        <details>
          <summary><strong>Restore And Import</strong></summary>
          <form id="operator-restore-form" class="stack">
            <div class="grid two">
              <label>Backup Artifact<select id="operator-restore-artifact" name="artifactId"></select></label>
              <label>Preserve Current<input name="preserveCurrent" type="checkbox" /></label>
            </div>
            <div class="actions"><button type="submit">Restore Backup</button></div>
          </form>
          <p class="status" id="operator-restore-status"></p>

          <form id="operator-import-form" class="stack">
            <div class="grid two">
              <label>Import Candidate<select id="operator-import-artifact" name="artifactId"></select></label>
              <label>Preserve Current<input name="preserveCurrent" type="checkbox" /></label>
            </div>
            <div class="actions"><button type="submit">Import Artifact</button></div>
          </form>
          <p class="status" id="operator-import-status"></p>
        </details>

        <div class="grid">
          <div>
            <div class="kicker">Backups</div>
            <div class="state-list" id="state-operator-backups"></div>
          </div>
          <div>
            <div class="kicker">Exports</div>
            <div class="state-list" id="state-operator-exports"></div>
          </div>
          <div>
            <div class="kicker">Imports</div>
            <div class="state-list" id="state-operator-imports"></div>
          </div>
          <div>
            <div class="kicker">Recent Activity</div>
            <div class="state-list" id="state-operator-activity"></div>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="badge">Identity</div>
        <h2 id="identity-heading">Create First Identity</h2>
        <p id="identity-copy">Create the first user when the world is blank. After identities exist, normal session auth is required for bootstrap edits.</p>
        <form id="identity-form" class="stack" data-tutorial-target="identity-form">
          <div class="grid two">
            <label>Identity Id<input name="id" placeholder="identity.aaron" data-tutorial-target="identity-id" /></label>
            <label>Actor<input name="actor" placeholder="aaron" data-tutorial-target="identity-actor" /></label>
          </div>
          <div class="grid two">
            <label>Label<input name="label" placeholder="Aaron" data-tutorial-target="identity-label" /></label>
            <label>Username<input name="username" placeholder="aaron" data-tutorial-target="identity-username" /></label>
          </div>
          <div class="grid two">
            <label>Password<input name="password" placeholder="aaron" data-tutorial-target="identity-password" /></label>
            <label>Home Perspective<input name="homePerspective" placeholder="aaron:personal" data-tutorial-target="identity-perspective" /></label>
          </div>
          <div class="grid two">
            <label>Home Context<select id="identity-home-context" name="homeContext"></select></label>
            <label></label>
          </div>
          <div class="actions">
            <button type="submit" id="identity-submit-button" data-tutorial-target="identity-submit">Create Identity</button>
            <button type="button" class="secondary" id="identity-create-new" hidden>New Identity</button>
          </div>
        </form>
        <p class="status" id="identity-status"></p>
      </article>

      <article class="card">
        <div class="badge">Session</div>
        <h2>Sign In To Keep Editing</h2>
        <form id="session-form" class="stack" data-tutorial-target="session-form">
          <div class="grid two">
            <label>Username<input name="username" autocomplete="username" data-tutorial-target="session-username" /></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" data-tutorial-target="session-password" /></label>
          </div>
          <div class="actions">
            <button type="submit" data-tutorial-target="session-submit">Sign In</button>
            <button type="button" class="secondary" id="logout-session" data-tutorial-target="session-logout">Logout</button>
          </div>
        </form>
        <p id="session-summary" class="muted">Loading session...</p>
      </article>

      <article class="card">
        <div class="badge">Governance</div>
        <h2>Contexts, Stewardship, And Proposals</h2>
        <p>This slice makes authority explicit. Scoped objects can be authored under a context, stewardship can be delegated, and guarded writes can be proposed for later approval.</p>

        <details open>
          <summary><strong>Contexts</strong></summary>
          <form id="context-form" class="stack">
            <div class="grid two">
              <label>Context Id<input name="id" placeholder="team.platform" /></label>
              <label>Label<input name="label" placeholder="Platform Team" /></label>
            </div>
            <div class="grid two">
              <label>Parent<select id="context-parent" name="parent"></select></label>
              <label>Initial Stewards JSON<textarea name="stewardsJson">[]</textarea></label>
            </div>
            <div class="actions"><button type="submit">Create Context</button></div>
          </form>
          <p class="status" id="context-status"></p>

          <form id="perspective-form" class="stack">
            <div class="grid two">
              <label>Perspective Id<input name="id" placeholder="aaron:workspace" /></label>
              <label>Title<input name="title" placeholder="Aaron Workspace" /></label>
            </div>
            <div class="grid two">
              <label>Context<select id="perspective-context" name="context"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Create Perspective</button></div>
          </form>
          <p class="status" id="perspective-status"></p>
        </details>

        <details>
          <summary><strong>Naming And Scope</strong></summary>
          <form id="context-binding-form" class="stack">
            <div class="grid two">
              <label>Context<select id="context-binding-context" name="context"></select></label>
              <label>Name<input name="name" placeholder="homePage" /></label>
            </div>
            <div class="grid two">
              <label>Target<select id="context-binding-target" name="target"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Bind Name</button></div>
          </form>
          <p class="status" id="context-binding-status"></p>

          <form id="context-binding-remove-form" class="stack">
            <div class="grid two">
              <label>Context<select id="context-binding-remove-context" name="context"></select></label>
              <label>Name<input name="name" placeholder="homePage" /></label>
            </div>
            <div class="grid two">
              <label>Target<select id="context-binding-remove-target" name="target"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Remove Binding</button></div>
          </form>
          <p class="status" id="context-binding-remove-status"></p>

          <form id="context-export-form" class="stack">
            <div class="grid two">
              <label>Context<select id="context-export-context" name="context"></select></label>
              <label>Export Name<input name="name" placeholder="homePage" /></label>
            </div>
            <div class="grid two">
              <label>Target<select id="context-export-target" name="target"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Export Name</button></div>
          </form>
          <p class="status" id="context-export-status"></p>

          <form id="context-export-remove-form" class="stack">
            <div class="grid two">
              <label>Context<select id="context-export-remove-context" name="context"></select></label>
              <label>Export Name<input name="name" placeholder="homePage" /></label>
            </div>
            <div class="grid two">
              <label>Target<select id="context-export-remove-target" name="target"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Remove Export</button></div>
          </form>
          <p class="status" id="context-export-remove-status"></p>

          <form id="context-import-form" class="stack">
            <div class="grid two">
              <label>Target Context<select id="context-import-context" name="context"></select></label>
              <label>Source Context<select id="context-import-source-context" name="sourceContext"></select></label>
            </div>
            <div class="grid two">
              <label>Export Name<select id="context-import-export-name" name="exportName"></select></label>
              <label>Local Alias<input name="name" placeholder="optional alias" /></label>
            </div>
            <div class="actions"><button type="submit">Import Name</button></div>
          </form>
          <p class="status" id="context-import-status"></p>

          <form id="context-import-remove-form" class="stack">
            <div class="grid two">
              <label>Target Context<select id="context-import-remove-context" name="context"></select></label>
              <label>Source Context<select id="context-import-remove-source-context" name="sourceContext"></select></label>
            </div>
            <div class="grid two">
              <label>Export Name<select id="context-import-remove-export-name" name="exportName"></select></label>
              <label>Local Alias<input name="name" placeholder="optional alias" /></label>
            </div>
            <div class="actions"><button type="submit">Remove Import</button></div>
          </form>
          <p class="status" id="context-import-remove-status"></p>
        </details>

        <details>
          <summary><strong>Stewardship</strong></summary>
          <form id="stewardship-form" class="stack">
            <div class="grid two">
              <label>Steward Actor<input name="steward" placeholder="callan" /></label>
              <label>Target<select id="stewardship-target" name="target"></select></label>
            </div>
            <div class="grid two">
              <label>Target Kind<select id="stewardship-target-kind" name="targetKind"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Grant Stewardship</button></div>
          </form>
          <p class="status" id="stewardship-status"></p>

          <form id="stewardship-remove-form" class="stack">
            <div class="grid two">
              <label>Steward Actor<input name="steward" placeholder="callan" /></label>
              <label>Target<select id="stewardship-remove-target" name="target"></select></label>
            </div>
            <div class="grid two">
              <label>Target Kind<select id="stewardship-remove-target-kind" name="targetKind"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Revoke Stewardship</button></div>
          </form>
          <p class="status" id="stewardship-remove-status"></p>
        </details>

        <details>
          <summary><strong>Proposals</strong></summary>
          <form id="proposal-form" class="stack">
            <div class="grid two">
              <label>Proposal Id<input name="id" placeholder="proposal.route.home" /></label>
              <label>Target Process<select id="proposal-target-process" name="targetProcess"></select></label>
            </div>
            <div class="grid two">
              <label>Target Kind<input name="targetKind" placeholder="route" /></label>
              <label>Target Id<input name="targetId" placeholder="home_route" /></label>
            </div>
            <label>Body JSON<textarea name="bodyJson">{}</textarea></label>
            <label>Reason<input name="reason" placeholder="why this should be approved" /></label>
            <p class="note muted" id="proposal-help"></p>
            <div class="actions"><button type="submit">Create Proposal</button></div>
          </form>
          <p class="status" id="proposal-status"></p>

          <form id="proposal-approve-form" class="stack">
            <div class="grid two">
              <label>Open Proposal<select id="proposal-approve-id" name="id"></select></label>
              <label></label>
            </div>
            <p class="note muted" id="proposal-approve-help"></p>
            <div class="actions"><button type="submit">Approve Proposal</button></div>
          </form>
          <p class="status" id="proposal-approve-status"></p>

          <form id="proposal-reject-form" class="stack">
            <div class="grid two">
              <label>Open Proposal<select id="proposal-reject-id" name="id"></select></label>
              <label>Reason<input name="reason" placeholder="optional rejection reason" /></label>
            </div>
            <div class="actions"><button type="submit">Reject Proposal</button></div>
          </form>
          <p class="status" id="proposal-reject-status"></p>
        </details>
      </article>

      <article class="card">
        <div class="badge">App Surface</div>
        <h2>Focused Builders</h2>
        <p>These forms edit app-visible structures. Advanced step conditions and params use JSON when needed, but the main surface stays oriented around the app rather than the substrate.</p>

        <details open>
          <summary><strong>Widgets</strong></summary>
          <form id="widget-form" class="stack" data-tutorial-target="widget-form">
            <div class="grid two">
              <label>Id<input name="id" placeholder="todo_title" data-tutorial-target="widget-id" /></label>
              <label>Kind<select id="widget-kind" name="kind" data-tutorial-target="widget-kind"></select></label>
            </div>
            <div class="grid two">
              <label>Parent<select id="widget-parent" name="parent" data-tutorial-target="widget-parent"></select></label>
              <label>Parent Ref<input name="parentRef" placeholder="context name" /></label>
            </div>
            <div class="grid two">
              <label>Order<input name="order" type="number" placeholder="0" data-tutorial-target="widget-order" /></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Context<select id="widget-context" name="context"></select></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Text<input name="text" data-tutorial-target="widget-text" /></label>
              <label>Title<input name="title" data-tutorial-target="widget-title" /></label>
            </div>
            <div class="grid two">
              <label>Role<input name="role" data-tutorial-target="widget-role" /></label>
              <label>Class<input name="class" data-tutorial-target="widget-class" /></label>
            </div>
            <div class="grid two">
              <label>Name<input name="name" data-tutorial-target="widget-name" /></label>
              <label>Type<input name="type" data-tutorial-target="widget-type" /></label>
            </div>
            <div class="grid two">
              <label>Placeholder<input name="placeholder" data-tutorial-target="widget-placeholder" /></label>
              <label>Autocomplete<input name="autocomplete" data-tutorial-target="widget-autocomplete" /></label>
            </div>
            <div class="grid two">
              <label>Href<input name="href" data-tutorial-target="widget-href" /></label>
              <label>Action<input name="action" data-tutorial-target="widget-action" /></label>
            </div>
            <div class="grid two">
              <label>Label<input name="label" data-tutorial-target="widget-label" /></label>
              <label>Value Type<input name="valueType" data-tutorial-target="widget-value-type" /></label>
            </div>
            <div class="grid two">
              <label>Data Id<input name="dataId" data-tutorial-target="widget-data-id" /></label>
              <label>Data Done<input name="dataDone" data-tutorial-target="widget-data-done" /></label>
            </div>
            <div class="grid two">
              <label>Tutorial Target<input name="tutorialTarget" data-tutorial-target="widget-tutorial-target" /></label>
              <label>Heading Level<input name="level" type="number" data-tutorial-target="widget-level" /></label>
            </div>
            <div class="grid two">
              <label>Event Soul<input name="eventSoul" data-tutorial-target="widget-event-soul" /></label>
              <label>Event Version<input name="eventVersion" data-tutorial-target="widget-event-version" /></label>
            </div>
            <div class="grid two">
              <label><span class="kicker">Template</span><input name="template" type="checkbox" data-tutorial-target="widget-template" /></label>
              <label><span class="kicker">Attach To Parent</span><input name="attach" type="checkbox" checked data-tutorial-target="widget-attach" /></label>
            </div>
            <div class="actions"><button type="submit" data-tutorial-target="widget-submit">Create Widget</button></div>
          </form>
          <p class="status" id="widget-status"></p>
        </details>

        <details>
          <summary><strong>Frontend Programs</strong></summary>
          <form id="program-form" class="stack" data-tutorial-target="program-form">
            <div class="grid two">
              <label>Program Id<input name="id" data-tutorial-target="program-id" /></label>
              <label>Root Widget<select id="program-root-widget" name="rootWidget" data-tutorial-target="program-root-widget"></select></label>
            </div>
            <div class="grid two">
              <label>Root Widget Ref<input name="rootWidgetRef" placeholder="context name" /></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Context<select id="program-context" name="context"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit" data-tutorial-target="program-submit">Create Program</button></div>
          </form>
          <p class="status" id="program-status"></p>

          <form id="step-form" class="stack" data-tutorial-target="step-form">
            <div class="grid two">
              <label>Program<select id="step-program" name="program" data-tutorial-target="step-program"></select></label>
              <label>Event<input name="event" placeholder="load" data-tutorial-target="step-event" /></label>
            </div>
            <div class="grid two">
              <label>Operation<select id="step-op" name="op" data-tutorial-target="step-op"></select></label>
              <label>Order<input name="order" type="number" value="0" data-tutorial-target="step-order" /></label>
            </div>
            <label>Params JSON<textarea name="paramsJson" placeholder='{"widget":"todo_status","text":"Ready"}' data-tutorial-target="step-params"></textarea></label>
            <label>When JSON<textarea name="whenJson" placeholder='{"path":"session.authenticated","truthy":true}' data-tutorial-target="step-when"></textarea></label>
            <label>Repeat JSON<textarea name="repeatJson" placeholder='{"forEach":{"from":"todoResponse.todos","as":"item"}}' data-tutorial-target="step-repeat"></textarea></label>
            <label>After JSON<textarea name="afterJson" placeholder='["program=todo_frontend_program/trigger=load/step[1]/operation=fetchJson"]' data-tutorial-target="step-after"></textarea></label>
            <div class="actions"><button type="submit" data-tutorial-target="step-submit">Create Step</button></div>
          </form>
          <p class="status" id="step-status"></p>
        </details>

        <details>
          <summary><strong>Backend Programs</strong></summary>
          <form id="backend-program-form" class="stack">
            <div class="grid two">
              <label>Program Soul<input name="soul" placeholder="todo.todos.list" /></label>
              <label>Label<input name="label" placeholder="Todo Todos List" /></label>
            </div>
            <div class="grid two">
              <label>Context<select id="backend-program-context" name="context"></select></label>
              <label></label>
            </div>
            <div class="actions"><button type="submit">Create Backend Program</button></div>
          </form>
          <p class="status" id="backend-program-status"></p>

          <form id="backend-program-version-form" class="stack">
            <div class="grid two">
              <label>Program Soul<select id="backend-program-version-soul" name="soul"></select></label>
              <label>Version<input name="version" placeholder="todo.todos.list.v1" /></label>
            </div>
            <div class="grid two">
              <label>Index<input name="index" type="number" value="0" /></label>
              <label>Context<select id="backend-program-version-context" name="context"></select></label>
            </div>
            <div class="grid two">
              <label>Transition From<select id="backend-program-version-transition-from" name="transitionFrom"></select></label>
              <label>Transition Strategy<select id="backend-program-version-transition-strategy" name="transitionStrategy"></select></label>
            </div>
            <div class="actions"><button type="submit">Create Backend Version</button></div>
          </form>
          <p class="status" id="backend-program-version-status"></p>

          <form id="backend-step-form" class="stack">
            <div class="grid two">
              <label>Version<select id="backend-step-version" name="version"></select></label>
              <label>Event<input name="event" placeholder="request" /></label>
            </div>
            <div class="grid two">
              <label>Operation<select id="backend-step-op" name="op"></select></label>
              <label>Order<input name="order" type="number" value="0" /></label>
            </div>
            <label>Params JSON<textarea name="paramsJson" placeholder='{"handler":"todos.readModel","method":"GET","into":"todoResponse"}'></textarea></label>
            <label>When JSON<textarea name="whenJson" placeholder='{"path":"session.authenticated","truthy":true}'></textarea></label>
            <label>Repeat JSON<textarea name="repeatJson" placeholder='{"forEach":{"from":"items","as":"item"}}'></textarea></label>
            <label>After JSON<textarea name="afterJson" placeholder='["version=request/step[0]"]'></textarea></label>
            <div class="actions"><button type="submit">Add Backend Step</button></div>
          </form>
          <p class="status" id="backend-step-status"></p>

          <form id="backend-program-activate-form" class="stack">
            <div class="grid two">
              <label>Program Soul<select id="backend-program-activate-soul" name="soul"></select></label>
              <label>Version<select id="backend-program-activate-version" name="version"></select></label>
            </div>
            <p class="note muted" id="backend-program-activate-help"></p>
            <div class="actions"><button type="submit">Activate Version</button></div>
          </form>
          <p class="status" id="backend-program-activate-status"></p>

          <form id="backend-program-rollback-form" class="stack">
            <div class="grid two">
              <label>Program Soul<select id="backend-program-rollback-soul" name="soul"></select></label>
              <label></label>
            </div>
            <p class="note muted" id="backend-program-rollback-help"></p>
            <div class="actions"><button type="submit" class="secondary">Rollback Version</button></div>
          </form>
          <p class="status" id="backend-program-rollback-status"></p>
        </details>

        <details>
          <summary><strong>Routes And Mounts</strong></summary>
          <form id="route-form" class="stack" data-tutorial-target="route-form">
            <div class="grid two">
              <label>Route Id<input name="id" data-tutorial-target="route-id" /></label>
              <label>Path<input name="path" placeholder="/" data-tutorial-target="route-path" /></label>
            </div>
            <div class="grid two">
              <label>Context<select id="route-context" name="context"></select></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Serves<input name="serves" data-tutorial-target="route-serves" /></label>
              <label>Serves Ref<input name="servesRef" placeholder="context name" /></label>
            </div>
            <div class="grid two">
              <label>Method<select id="route-method" name="method" data-tutorial-target="route-method"></select></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Handler<select id="route-handler" name="handler" data-tutorial-target="route-handler"></select></label>
              <label>Page Name<input name="page" placeholder="home" data-tutorial-target="route-page" /></label>
            </div>
            <div class="grid two">
              <label>Backend Program Soul<select id="route-backend-program-soul" name="backendProgramSoul"></select></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Root Widget<select id="route-root-widget" name="rootWidget" data-tutorial-target="route-root-widget"></select></label>
              <label>Root Widget Ref<input name="rootWidgetRef" placeholder="context name" /></label>
            </div>
            <div class="grid two">
              <label>Frontend Program<select id="route-frontend-program" name="frontendProgram" data-tutorial-target="route-frontend-program"></select></label>
              <label></label>
            </div>
            <label><span class="kicker">Live Projection</span><input name="liveProjection" type="checkbox" checked data-tutorial-target="route-live-projection" /></label>
            <p class="note muted" id="route-help"></p>
            <div class="actions"><button type="submit" data-tutorial-target="route-submit">Create Route</button></div>
          </form>
          <p class="status" id="route-status"></p>

          <form id="serve-form" class="stack" data-tutorial-target="serve-form">
            <div class="grid two">
              <label>Server Runner<select id="serve-server-runner" name="serverRunner" data-tutorial-target="serve-server-runner"></select></label>
              <label>Route<select id="serve-route" name="route" data-tutorial-target="serve-route"></select></label>
            </div>
            <div class="grid two">
              <label>Context<select id="serve-context" name="context"></select></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Server Runner Ref<input name="serverRunnerRef" placeholder="context name" /></label>
              <label>Route Ref<input name="routeRef" placeholder="context name" /></label>
            </div>
            <div class="actions"><button type="submit" data-tutorial-target="serve-submit">Create Serve Mount</button></div>
          </form>
          <p class="status" id="serve-status"></p>
        </details>

        <details>
          <summary><strong>Runtime Wiring</strong></summary>
          <form id="runner-form" class="stack" data-tutorial-target="runner-form">
            <div class="grid two">
              <label>Runner Id<input name="id" value="demo_server" data-tutorial-target="runner-id" /></label>
              <label>Handler Set<select id="runner-handler-set" name="handlerSet" data-tutorial-target="runner-handler-set"></select></label>
            </div>
            <div class="grid two">
              <label>Context<select id="runner-context" name="context"></select></label>
              <label></label>
            </div>
            <div class="grid two">
              <label>Backend Host<select id="runner-backend-host" name="backendHost" data-tutorial-target="runner-backend-host"></select></label>
              <label>Frontend Host<select id="runner-frontend-host" name="frontendHost" data-tutorial-target="runner-frontend-host"></select></label>
            </div>
            <div class="grid two">
              <label>Backend Host Ref<input name="backendHostRef" placeholder="context name" /></label>
              <label>Frontend Host Ref<input name="frontendHostRef" placeholder="context name" /></label>
            </div>
            <div class="grid two">
              <label>Todo Projection<input name="todoProjection" value="witness-world-bootstrap-todos.json" data-tutorial-target="runner-todo-projection" /></label>
              <label>Private Notes Projection<input name="privateNotesProjection" value="witness-world-bootstrap-private-notes.json" data-tutorial-target="runner-private-notes-projection" /></label>
            </div>
            <div class="actions"><button type="submit" data-tutorial-target="runner-submit">Create Server Runner</button></div>
          </form>
          <p class="status" id="runner-status"></p>
        </details>

        <details>
          <summary><strong>Runtime Plugins</strong></summary>
          <p class="note">Runtime plugin installs are authored on a specific server runner. Local plugin packages stay bundle-bridge only in this slice.</p>
          <p class="note muted">Bootstrap review shows durable authored runner intent only. CLI and environment plugin overlays are excluded here and remain visible in runtime diagnostics/startup reporting.</p>

          <div class="stack">
            <div class="grid two">
              <label>Review Server Runner<select id="runtime-plugin-review-runner"></select></label>
              <label>Review Plugin<select id="runtime-plugin-review-plugin"></select></label>
            </div>
            <p class="note muted" id="runtime-plugin-review-note"></p>
            <div id="runtime-plugin-review-detail" class="state-list"></div>
          </div>

          <form id="runtime-plugin-install-form" class="stack">
            <div class="grid two">
              <label>Server Runner<select id="runtime-plugin-install-runner" name="serverRunner"></select></label>
              <label>Plugin<select id="runtime-plugin-install-plugin" name="plugin"></select></label>
            </div>
            <div class="actions"><button type="submit">Install Runtime Plugin</button></div>
          </form>
          <p class="note muted" id="runtime-plugin-install-help"></p>
          <p class="status" id="runtime-plugin-install-status"></p>

          <form id="runtime-plugin-remove-form" class="stack">
            <div class="grid two">
              <label>Server Runner<select id="runtime-plugin-remove-runner" name="serverRunner"></select></label>
              <label>Plugin<select id="runtime-plugin-remove-plugin" name="plugin"></select></label>
            </div>
            <div class="actions"><button type="submit" class="secondary">Remove Runtime Plugin</button></div>
          </form>
          <p class="note muted" id="runtime-plugin-remove-help"></p>
          <p class="status" id="runtime-plugin-remove-status"></p>

          <form id="runtime-plugin-install-proposal-form" class="stack">
            <div class="grid two">
              <label>Proposal Id<input name="id" placeholder="proposal.runtimePlugin.install.inspect" /></label>
              <label>Server Runner<select id="runtime-plugin-install-proposal-runner" name="serverRunner"></select></label>
            </div>
            <div class="grid two">
              <label>Plugin<select id="runtime-plugin-install-proposal-plugin" name="plugin"></select></label>
              <label>Reason<input name="reason" placeholder="why this plugin should be enabled" /></label>
            </div>
            <div class="actions"><button type="submit">Propose Runtime Plugin Install</button></div>
          </form>
          <p class="note muted" id="runtime-plugin-install-proposal-help"></p>
          <p class="status" id="runtime-plugin-install-proposal-status"></p>

          <form id="runtime-plugin-remove-proposal-form" class="stack">
            <div class="grid two">
              <label>Proposal Id<input name="id" placeholder="proposal.runtimePlugin.remove.inspect" /></label>
              <label>Server Runner<select id="runtime-plugin-remove-proposal-runner" name="serverRunner"></select></label>
            </div>
            <div class="grid two">
              <label>Plugin<select id="runtime-plugin-remove-proposal-plugin" name="plugin"></select></label>
              <label>Reason<input name="reason" placeholder="why this plugin should be removed" /></label>
            </div>
            <div class="actions"><button type="submit">Propose Runtime Plugin Remove</button></div>
          </form>
          <p class="note muted" id="runtime-plugin-remove-proposal-help"></p>
          <p class="status" id="runtime-plugin-remove-proposal-status"></p>
        </details>

        <details>
          <summary><strong>MCP</strong></summary>
          <p class="note">MCP servers and tool installs stay shell-facing in this slice. Transport visibility is descriptive, delegated mode runs as the caller, service mode requires a configured <code>serviceIdentity</code>, and scope JSON narrows where an installed tool may act.</p>

          <div class="grid">
            <div>
              <div class="kicker">MCP Servers</div>
              <div id="mcp-server-inventory" class="state-list"></div>
            </div>
            <div>
              <div class="kicker">Installed MCP Tools</div>
              <div id="mcp-tool-inventory" class="state-list"></div>
            </div>
          </div>

          <form id="mcp-server-form" class="stack">
            <div class="grid two">
              <label>Server Id<input name="id" placeholder="personal_mcp" /></label>
              <label>Label<input name="label" placeholder="Personal MCP" /></label>
            </div>
            <div class="grid two">
              <label>Server Runner<select id="mcp-server-runner" name="serverRunner"></select></label>
              <label>Context<select id="mcp-server-context" name="context"></select></label>
            </div>
            <div class="grid two">
              <label>Service Identity<input name="serviceIdentity" placeholder="aaron" /></label>
              <label>Transports JSON<textarea name="transportsJson">["stdio","http"]</textarea></label>
            </div>
            <div class="actions"><button type="submit">Create MCP Server</button></div>
          </form>
          <p class="note muted" id="mcp-server-help"></p>
          <p class="status" id="mcp-server-status"></p>

          <form id="mcp-tool-install-form" class="stack">
            <div class="grid two">
              <label>Server<select id="mcp-tool-install-server" name="server"></select></label>
              <label>Tool<select id="mcp-tool-install-tool" name="tool"></select></label>
            </div>
            <div class="grid two">
              <label>Acting Mode<select id="mcp-tool-install-acting-mode" name="actingMode"></select></label>
              <label></label>
            </div>
            <label>Scope Contexts JSON<textarea name="scopeContextsJson">[]</textarea></label>
            <label>Scope Targets JSON<textarea name="scopeTargetsJson">[]</textarea></label>
            <div class="actions"><button type="submit">Install MCP Tool</button></div>
          </form>
          <p class="note muted" id="mcp-tool-install-help"></p>
          <p class="status" id="mcp-tool-install-status"></p>

          <form id="mcp-tool-remove-form" class="stack">
            <div class="grid two">
              <label>Server<select id="mcp-tool-remove-server" name="server"></select></label>
              <label>Tool<select id="mcp-tool-remove-tool" name="tool"></select></label>
            </div>
            <div class="actions"><button type="submit" class="secondary">Remove MCP Tool</button></div>
          </form>
          <p class="note muted" id="mcp-tool-remove-help"></p>
          <p class="status" id="mcp-tool-remove-status"></p>

          <form id="mcp-server-proposal-form" class="stack">
            <div class="grid two">
              <label>Proposal Id<input name="id" placeholder="proposal.mcpServer.define.personal" /></label>
              <label>Server Id<input name="serverId" placeholder="personal_mcp" /></label>
            </div>
            <div class="grid two">
              <label>Label<input name="label" placeholder="Personal MCP" /></label>
              <label>Server Runner<select id="mcp-server-proposal-runner" name="serverRunner"></select></label>
            </div>
            <div class="grid two">
              <label>Context<select id="mcp-server-proposal-context" name="context"></select></label>
              <label>Service Identity<input name="serviceIdentity" placeholder="aaron" /></label>
            </div>
            <label>Transports JSON<textarea name="transportsJson">["stdio","http"]</textarea></label>
            <label>Reason<input name="reason" placeholder="why this MCP server should be authored" /></label>
            <div class="actions"><button type="submit">Propose MCP Server</button></div>
          </form>
          <p class="note muted" id="mcp-server-proposal-help"></p>
          <p class="status" id="mcp-server-proposal-status"></p>

          <form id="mcp-tool-install-proposal-form" class="stack">
            <div class="grid two">
              <label>Proposal Id<input name="id" placeholder="proposal.mcpTool.install.world.read" /></label>
              <label>Server<select id="mcp-tool-install-proposal-server" name="server"></select></label>
            </div>
            <div class="grid two">
              <label>Tool<select id="mcp-tool-install-proposal-tool" name="tool"></select></label>
              <label>Acting Mode<select id="mcp-tool-install-proposal-acting-mode" name="actingMode"></select></label>
            </div>
            <label>Scope Contexts JSON<textarea name="scopeContextsJson">[]</textarea></label>
            <label>Scope Targets JSON<textarea name="scopeTargetsJson">[]</textarea></label>
            <label>Reason<input name="reason" placeholder="why this MCP tool should be installed" /></label>
            <div class="actions"><button type="submit">Propose MCP Tool Install</button></div>
          </form>
          <p class="note muted" id="mcp-tool-install-proposal-help"></p>
          <p class="status" id="mcp-tool-install-proposal-status"></p>

          <form id="mcp-tool-remove-proposal-form" class="stack">
            <div class="grid two">
              <label>Proposal Id<input name="id" placeholder="proposal.mcpTool.remove.world.read" /></label>
              <label>Server<select id="mcp-tool-remove-proposal-server" name="server"></select></label>
            </div>
            <div class="grid two">
              <label>Tool<select id="mcp-tool-remove-proposal-tool" name="tool"></select></label>
              <label>Reason<input name="reason" placeholder="why this MCP tool should be removed" /></label>
            </div>
            <div class="actions"><button type="submit">Propose MCP Tool Remove</button></div>
          </form>
          <p class="note muted" id="mcp-tool-remove-proposal-help"></p>
          <p class="status" id="mcp-tool-remove-proposal-status"></p>
        </details>

        <details>
          <summary><strong>Capabilities</strong></summary>
          <form id="capability-form" class="stack">
            <div class="grid two">
              <label>Capability Id<input name="id" placeholder="notes.sidebar" /></label>
              <label>Label<input name="label" placeholder="Notes Sidebar" /></label>
            </div>
            <div class="grid two">
              <label>Version<input name="version" placeholder="0.1.0" /></label>
              <label>Placement JSON<textarea name="placementJson">["context"]</textarea></label>
            </div>
            <div class="grid two">
              <label>Context<select id="capability-context" name="context"></select></label>
              <label></label>
            </div>
            <label>Depends On JSON<textarea name="dependsOnJson">[]</textarea></label>
            <label>Provenance JSON<textarea name="provenanceJson">{"source":"local"}</textarea></label>
            <label>Public API JSON<textarea name="publicApiJson">[]</textarea></label>
            <label>Config JSON<textarea name="configJson">[]</textarea></label>
            <label>Internals JSON<textarea name="internalsJson">[]</textarea></label>
            <label>Authority JSON<textarea name="authorityJson">[]</textarea></label>
            <div class="actions"><button type="submit">Define Capability</button></div>
          </form>
          <p class="status" id="capability-status"></p>

          <form id="capability-install-form" class="stack">
            <div class="grid two">
              <label>Capability<select id="capability-install-capability" name="capability"></select></label>
              <label>Target Kind<select id="capability-install-kind" name="targetKind"></select></label>
            </div>
            <label>Target<select id="capability-install-target" name="target"></select></label>
            <div class="actions"><button type="submit">Install Capability</button></div>
          </form>
          <p class="note muted" id="capability-install-help"></p>
          <p class="status" id="capability-install-status"></p>

          <form id="capability-remove-form" class="stack">
            <div class="grid two">
              <label>Capability<select id="capability-remove-capability" name="capability"></select></label>
              <label>Target Kind<select id="capability-remove-kind" name="targetKind"></select></label>
            </div>
            <label>Target<select id="capability-remove-target" name="target"></select></label>
            <div class="actions"><button type="submit" class="secondary">Remove Capability</button></div>
          </form>
          <p class="note muted" id="capability-remove-help"></p>
          <p class="status" id="capability-remove-status"></p>
        </details>
      </article>

      <article class="card">
        <div class="badge">Fast Path</div>
        <details>
          <summary><strong>Advanced Shortcut</strong></summary>
          <p class="note">This remains available as a quick seam for experienced users. It is not used by the tutorial.</p>
          <div class="actions">
            <button type="button" id="create-todo-starter" data-tutorial-target="create-todo-starter">Create Todo Starter</button>
          </div>
          <p class="status" id="starter-status"></p>
        </details>
      </article>
    </section>

    <aside class="column">
      <article class="card" data-tutorial-target="authored-state">
        <div class="badge">Current World</div>
        <h2>Authored State</h2>
        <p>The tutorial uses the same authored structures shown here. Nothing is hidden behind a fake wizard layer.</p>
        <div class="stack">
          <section>
            <h3>Contexts</h3>
            <div id="state-contexts" class="state-list"></div>
          </section>
          <section>
            <h3>Context Bindings</h3>
            <div id="state-context-bindings" class="state-list"></div>
          </section>
          <section>
            <h3>Context Exports</h3>
            <div id="state-context-exports" class="state-list"></div>
          </section>
          <section>
            <h3>Context Imports</h3>
            <div id="state-context-imports" class="state-list"></div>
          </section>
          <section>
            <h3>Context Scope</h3>
            <div id="state-context-scopes" class="state-list"></div>
          </section>
          <section>
            <h3>Perspectives</h3>
            <div id="state-perspectives" class="state-list"></div>
          </section>
          <section>
            <h3>Stewardships</h3>
            <div id="state-stewardships" class="state-list"></div>
          </section>
          <section>
            <h3>Proposals</h3>
            <div id="state-proposals" class="state-list"></div>
          </section>
          <section>
            <h3>Authority</h3>
            <div id="state-authority" class="state-list"></div>
          </section>
          <section>
            <h3>Identities</h3>
            <div id="state-identities" class="state-list"></div>
          </section>
          <section>
            <h3>Widgets</h3>
            <div id="state-widgets" class="state-list"></div>
          </section>
          <section>
            <h3>Frontend Programs</h3>
            <div id="state-programs" class="state-list"></div>
          </section>
          <section>
            <h3>Frontend Steps</h3>
            <div id="state-steps" class="state-list"></div>
          </section>
          <section>
            <h3>Backend Programs</h3>
            <div id="state-backend-programs" class="state-list"></div>
          </section>
          <section>
            <h3>Backend Versions</h3>
            <div id="state-backend-program-versions" class="state-list"></div>
          </section>
          <section>
            <h3>Backend Steps</h3>
            <div id="state-backend-steps" class="state-list"></div>
          </section>
          <section>
            <h3>Routes</h3>
            <div id="state-routes" class="state-list"></div>
          </section>
          <section>
            <h3>Serve Mounts</h3>
            <div id="state-serves" class="state-list"></div>
          </section>
          <section>
            <h3>Server Runners</h3>
            <div id="state-runners" class="state-list"></div>
          </section>
          <section>
            <h3>Capabilities</h3>
            <div id="state-capabilities" class="state-list"></div>
          </section>
          <section>
            <h3>Capability Installs</h3>
            <div id="state-capability-installs" class="state-list"></div>
          </section>
          <section>
            <h3>Runtime Plugin Installs</h3>
            <div id="state-runtime-plugin-installs" class="state-list"></div>
          </section>
          <section>
            <h3>Runtime Plugin Availability</h3>
            <div id="state-runtime-plugin-availability" class="state-list"></div>
          </section>
          <section>
            <h3>MCP Servers</h3>
            <div id="state-mcp-servers" class="state-list"></div>
          </section>
          <section>
            <h3>MCP Tool Installs</h3>
            <div id="state-mcp-tool-installs" class="state-list"></div>
          </section>
        </div>
      </article>
    </aside>
  </main>
${renderBootstrapTutorialOverlay()}
  <script>
  (() => {
${renderBootstrapTutorialStateFactory()}
${renderBootstrapTutorialControllerFactory()}
    const tutorial = ${jsonForScript(tutorial)};
    const blueprint = ${jsonForScript(blueprint)};
    const currentSurfacePage = "bootstrap";
    const localProgressKey = "witness.tutorial." + tutorial.id;
    const state = { model: null, bootstrapState: null, session: null, tutorialProgress: null, runtimePluginReview: null, desktopShell: null };
    let runtimePluginReviewRequestId = 0;
    const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
    const autoCompletableChapters = new Set(["widgets", "program", "routes"]);
    const stateSnapshots = new Map();
    const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const byId = id => document.getElementById(id);
    const byTarget = target => document.querySelector('[data-tutorial-target="' + CSS.escape(target) + '"]');
    const desktopApi = () => (window.witnessDesktop && typeof window.witnessDesktop.getDesktopShellState === "function")
      ? window.witnessDesktop
      : null;
    const setStatus = (id, text) => { const el = byId(id); if (el) el.textContent = text || ""; };
    const readForm = form => Object.fromEntries(new FormData(form).entries());
    const boolValue = formData => formData === "on";
    const formField = (form, name) => form?.elements?.namedItem(name) || form?.querySelector?.('[name="' + CSS.escape(name) + '"]') || null;
    const currentUrl = () => new URL(window.location.href);
    const currentIdentityEditId = () => {
      const value = currentUrl().searchParams.get("identity");
      return typeof value === "string" && value.trim() ? value.trim() : "";
    };
    const setIdentityEditId = id => {
      const url = currentUrl();
      if (typeof id === "string" && id.trim()) url.searchParams.set("identity", id.trim());
      else url.searchParams.delete("identity");
      window.history.replaceState({}, "", url.toString());
    };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const rowKey = row => row?.id || [row?.program, row?.event, row?.op, row?.order, row?.serverRunner, row?.path, row?.method, row?.actor, row?.label].filter(value => value != null && value !== "").join("\u0000") || JSON.stringify(row);
    const request = async (url, options = {}) => {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "request failed");
      return data;
    };
    const postJson = async (url, body, method = "POST") => request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const fillSelect = (id, rows, getValue, getLabel, { includeBlank = true } = {}) => {
      const select = byId(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = "";
      if (includeBlank) select.append(new Option("", ""));
      for (const row of rows) select.append(new Option(getLabel(row), getValue(row)));
      if ([...select.options].some(option => option.value === current)) select.value = current;
    };
    const backendVersionsForSoul = soul => (state.bootstrapState?.backendProgramVersions || []).filter(row => row.soul === soul);
    const backendTransitionsForSoul = soul => (state.bootstrapState?.backendProgramTransitions || []).filter(row => row.soul === soul);
    const backendActivationHistoryForSoul = soul => (state.bootstrapState?.backendProgramActivationHistory || []).filter(row => row.soul === soul);
    const widgetVersionsForSoul = soul => (state.bootstrapState?.widgetVersions || []).filter(row => row.soul === soul);
    const widgetTransitionsForSoul = soul => (state.bootstrapState?.widgetVersionTransitions || []).filter(row => row.soul === soul);
    const widgetActivationHistoryForSoul = soul => (state.bootstrapState?.widgetVersionActivationHistory || []).filter(row => row.soul === soul);
    const backendProgramRow = soul => (state.bootstrapState?.backendPrograms || []).find(row => row.soul === soul) || null;
    const openProposalRow = proposalId => (state.bootstrapState?.proposals || []).find(row => row.id === proposalId) || null;
    const uniqueVersionSequence = rows => {
      const result = [];
      for (const row of rows || []) {
        const version = String(row?.version || "").trim();
        if (!version) continue;
        if (result[result.length - 1] === version) continue;
        result.push(version);
      }
      return result;
    };
    const previousVersionFromHistory = (rows, currentVersion) => {
      const sequence = uniqueVersionSequence(rows);
      if (!sequence.length) return null;
      const current = String(currentVersion || "").trim();
      if (!current) return sequence.length >= 2 ? sequence[sequence.length - 2] : null;
      for (let index = sequence.length - 1; index >= 0; index -= 1) {
        if (sequence[index] !== current) continue;
        return index > 0 ? sequence[index - 1] : null;
      }
      return sequence.length >= 2 ? sequence[sequence.length - 2] : null;
    };
    const transitionRowFor = (rows, from, to) => (rows || []).find(row => row.from === from && row.to === to) || null;
    const currentAuthorityContexts = () => state.bootstrapState?.authority?.mutationContexts || [];
    const programAuthoritySummary = contextId => contextId
      ? (currentAuthorityContexts().includes(contextId)
          ? "Current actor can mutate context " + contextId + " directly."
          : "Current actor is outside mutation context " + contextId + "; direct actions may require a stewarded path.")
      : "No explicit context is attached to this target in bootstrap state.";
    const refreshBackendProgramVersionOptions = (soulSelectId, versionSelectId, { includeBlank = true } = {}) => {
      const soul = byId(soulSelectId)?.value || "";
      fillSelect(versionSelectId, backendVersionsForSoul(soul), row => row.version, row => row.version, { includeBlank });
    };
    const routeHandlerMetadata = handler => {
      const metadata = state.model?.supportedHandlerMetadata || {};
      return (handler && metadata[handler]) || null;
    };
    const updateRouteAuthoringFields = () => {
      const form = byId("route-form");
      const handler = byId("route-handler")?.value || "";
      const handlerMeta = routeHandlerMetadata(handler) || {};
      const routeKind = handlerMeta.routeKind || (handler === "backendProgram.run" ? "backendProgram" : (handler.startsWith("page.") ? "page" : "json"));
      const backendRoute = routeKind === "backendProgram";
      const pageRoute = routeKind === "page";
      const toggleField = (name, enabled) => {
        const field = formField(form, name);
        if (!field) return;
        field.disabled = !enabled;
        if (!enabled && ("value" in field)) field.value = "";
        if (!enabled && field.type === "checkbox") field.checked = false;
      };
      toggleField("backendProgramSoul", backendRoute);
      toggleField("page", pageRoute);
      toggleField("rootWidget", pageRoute);
      toggleField("rootWidgetRef", pageRoute);
      toggleField("frontendProgram", pageRoute);
      toggleField("liveProjection", pageRoute);
      const button = form?.querySelector('button[type="submit"]');
      const profile = state.model?.runtimeProfile || "full";
      const supportedMethods = Array.isArray(handlerMeta.methods) ? handlerMeta.methods : [];
      const method = String(byId("route-method")?.value || "").toUpperCase();
      const backendProgramSoul = String(byId("route-backend-program-soul")?.value || "").trim();
      const rootWidget = String(byId("route-root-widget")?.value || "").trim();
      const responseKind = handlerMeta.responseKind || (routeKind === "page" ? "page" : (routeKind === "stream" ? "stream" : "json"));
      const fieldSummary = routeKind === "backendProgram"
        ? "Enabled fields: backend program soul. Disabled fields: page, root widget, frontend program, live projection."
        : routeKind === "page"
          ? "Enabled fields: page, root widget, frontend program, live projection."
          : routeKind === "stream"
            ? "Uses stream transport only. Page and backend-program fields are disabled."
            : "Backend JSON route. Page and backend-program fields are disabled.";
      const issues = [];
      if (supportedMethods.length && method && !supportedMethods.includes(method)) issues.push("selected method " + method + " is unsupported");
      if (routeKind === "backendProgram" && !backendProgramSoul) issues.push("choose a backend program soul");
      if ((handler === "page.home" || handler === "page.world") && !rootWidget) issues.push("choose a root widget for this page handler");
      const methodSummary = supportedMethods.length ? supportedMethods.join(", ") : "any method";
      setStatus("route-help", handler
        ? "Profile " + profile + " exposes handler " + handler + " as " + routeKind + " -> " + responseKind + ". Supported methods: " + methodSummary + ". " + fieldSummary + (issues.length ? " Blocking issues: " + issues.join("; ") + "." : "")
        : "Select a handler to see route-kind, method, and required-field guidance.");
      if (button) button.disabled = Boolean(handler) && issues.length > 0;
    };
    const syncBackendProgramActivateHelp = () => {
      const soul = byId("backend-program-activate-soul")?.value || "";
      const version = byId("backend-program-activate-version")?.value || "";
      const versions = backendVersionsForSoul(soul);
      const current = versions.find(row => row.active)?.version || "";
      const target = versions.find(row => row.version === version) || null;
      const program = backendProgramRow(soul);
      const transition = current && version && current !== version
        ? transitionRowFor(backendTransitionsForSoul(soul), current, version)
        : null;
      const button = byId("backend-program-activate-form")?.querySelector('button[type="submit"]');
      if (!soul || !version || !target) {
        if (button) button.disabled = true;
        setStatus("backend-program-activate-help", "Choose a backend program soul and target version to review activation strategy and authority.");
        return;
      }
      const strategy = current && current !== version ? (transition?.strategy || "block") : null;
      const issues = [];
      if (current === version) issues.push("target version is already active");
      if (current && current !== version && strategy === "block") issues.push("no compatible transition is defined from " + current + " to " + version);
      const parts = [
        "Current active version: " + (current || "none") + ".",
        "Target version: " + version + " (index " + (target.index ?? 0) + ")."
      ];
      if (strategy) parts.push("Transition strategy: " + strategy + ".");
      parts.push(programAuthoritySummary(program?.context || null));
      if (issues.length) parts.push("Blocking issues: " + issues.join("; ") + ".");
      if (button) button.disabled = issues.length > 0;
      setStatus("backend-program-activate-help", parts.join(" "));
    };
    const syncBackendProgramRollbackHelp = () => {
      const soul = byId("backend-program-rollback-soul")?.value || "";
      const versions = backendVersionsForSoul(soul);
      const current = versions.find(row => row.active)?.version || "";
      const previous = previousVersionFromHistory(backendActivationHistoryForSoul(soul), current);
      const program = backendProgramRow(soul);
      const button = byId("backend-program-rollback-form")?.querySelector('button[type="submit"]');
      if (!soul) {
        if (button) button.disabled = true;
        setStatus("backend-program-rollback-help", "Choose a backend program soul to inspect rollback availability.");
        return;
      }
      const parts = [
        "Current active version: " + (current || "none") + ".",
        previous ? "Rollback target from activation history: " + previous + "." : "No prior activation history is available for rollback."
      ];
      parts.push(programAuthoritySummary(program?.context || null));
      if (button) button.disabled = !current || !previous;
      setStatus("backend-program-rollback-help", parts.join(" "));
    };
    const proposalBodyIssues = ({ targetProcess, targetId, body }) => {
      const issues = [];
      const soul = String(body?.soul || "").trim();
      const version = String(body?.version || "").trim();
      if (targetProcess === "widgetVersion.activate" || targetProcess === "backendProgramVersion.activate") {
        if (!soul) issues.push("Body JSON must include soul.");
        if (targetId && soul && soul !== targetId) issues.push("Body JSON soul should match targetId.");
        if (!version) issues.push("Body JSON must include version.");
      }
      if (targetProcess === "widgetVersion.rollback" || targetProcess === "backendProgramVersion.rollback") {
        if (!soul) issues.push("Body JSON must include soul.");
        if (targetId && soul && soul !== targetId) issues.push("Body JSON soul should match targetId.");
      }
      return issues;
    };
    const summarizeGovernedTarget = ({ targetProcess, targetKind, targetId, body }) => {
      if (!targetProcess) return "Choose a target process to see proposal semantics.";
      if (targetProcess === "widgetVersion.activate") {
        const version = String(body?.version || "").trim();
        const current = widgetActivationHistoryForSoul(targetId).slice(-1)[0]?.version || "";
        const transition = current && version ? transitionRowFor(widgetTransitionsForSoul(targetId), current, version) : null;
        const exampleSoul = targetId || "...";
        return "Widget version activation proposal for soul " + (targetId || "(missing targetId)") + "." +
          (version ? " Requested version: " + version + "." : " Body JSON should include {\\\"soul\\\":\\\"" + exampleSoul + "\\\",\\\"version\\\":\\\"...\\\"}.") +
          (current ? " Current active version: " + current + "." : "") +
          (transition ? " Transition strategy: " + transition.strategy + "." : (current && version ? " Missing transition defaults to block." : "")) +
          " Approval requires authority on the governed widget target.";
      }
      if (targetProcess === "widgetVersion.rollback") {
        const current = widgetActivationHistoryForSoul(targetId).slice(-1)[0]?.version || "";
        const previous = previousVersionFromHistory(widgetActivationHistoryForSoul(targetId), current);
        const exampleSoul = targetId || "...";
        return "Widget version rollback proposal for soul " + (targetId || "(missing targetId)") + "." +
          " Body JSON should include {\\\"soul\\\":\\\"" + exampleSoul + "\\\"}." +
          (current ? " Current active version: " + current + "." : "") +
          (previous ? " Expected rollback target: " + previous + "." : " No previous activation is currently visible.") +
          " Approval requires stewarded authority on the governed widget target.";
      }
      if (targetProcess === "backendProgramVersion.activate") {
        const version = String(body?.version || "").trim();
        const current = backendVersionsForSoul(targetId).find(row => row.active)?.version || "";
        const transition = current && version ? transitionRowFor(backendTransitionsForSoul(targetId), current, version) : null;
        const program = backendProgramRow(targetId);
        const exampleSoul = targetId || "...";
        return "Backend program activation proposal for soul " + (targetId || "(missing targetId)") + "." +
          (version ? " Requested version: " + version + "." : " Body JSON should include {\\\"soul\\\":\\\"" + exampleSoul + "\\\",\\\"version\\\":\\\"...\\\"}.") +
          (current ? " Current active version: " + current + "." : "") +
          (transition ? " Transition strategy: " + transition.strategy + "." : (current && version ? " Missing transition defaults to block." : "")) +
          " " + programAuthoritySummary(program?.context || null);
      }
      if (targetProcess === "backendProgramVersion.rollback") {
        const current = backendVersionsForSoul(targetId).find(row => row.active)?.version || "";
        const previous = previousVersionFromHistory(backendActivationHistoryForSoul(targetId), current);
        const program = backendProgramRow(targetId);
        const exampleSoul = targetId || "...";
        return "Backend program rollback proposal for soul " + (targetId || "(missing targetId)") + "." +
          " Body JSON should include {\\\"soul\\\":\\\"" + exampleSoul + "\\\"}." +
          (current ? " Current active version: " + current + "." : "") +
          (previous ? " Expected rollback target: " + previous + "." : " No previous activation is currently visible.") +
          " " + programAuthoritySummary(program?.context || null);
      }
      if (String(targetProcess).startsWith("widgetVersion.") || String(targetProcess).startsWith("backendProgramVersion.")) {
        return "Governed version change proposal. Use targetId as the versioned soul and include any required version details in Body JSON.";
      }
      return "Proposal targets " + targetProcess + " on " + (targetKind || "target") + " " + (targetId || "(missing targetId)") + ". Approval will run later through the open proposal queue.";
    };
    const syncProposalHelp = () => {
      const form = byId("proposal-form");
      const targetProcess = formField(form, "targetProcess")?.value || "";
      const targetKind = formField(form, "targetKind")?.value || "";
      const targetId = formField(form, "targetId")?.value || "";
      const bodyText = String(formField(form, "bodyJson")?.value || "").trim();
      const button = form?.querySelector('button[type="submit"]');
      let parsedBody = {};
      let parseError = null;
      try {
        parsedBody = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        parseError = "Body JSON must be valid JSON.";
      }
      const issues = parseError ? [] : proposalBodyIssues({ targetProcess, targetId, body: parsedBody });
      const summary = parseError
        ? ""
        : summarizeGovernedTarget({ targetProcess, targetKind, targetId, body: parsedBody });
      const help = parseError
        ? parseError
        : (issues.length ? issues.join(" ") + " " + summary : summary);
      if (button) button.disabled = Boolean(parseError) || issues.length > 0;
      setStatus("proposal-help", help);
    };
    const syncProposalApproveHelp = () => {
      const proposalId = byId("proposal-approve-id")?.value || "";
      const proposal = openProposalRow(proposalId);
      const button = byId("proposal-approve-form")?.querySelector('button[type="submit"]');
      if (!proposal) {
        if (button) button.disabled = true;
        setStatus("proposal-approve-help", "Choose an open proposal to inspect target, proposer, and authority context.");
        return;
      }
      const summary = summarizeGovernedTarget({
        targetProcess: proposal.targetProcess,
        targetKind: proposal.targetKind,
        targetId: proposal.targetId,
        body: proposal.body || {}
      });
      if (button) button.disabled = false;
      setStatus("proposal-approve-help", "Proposed by " + (proposal.proposer || "unknown actor") + ". " + summary + (proposal.reason ? " Reason: " + proposal.reason + "." : ""));
    };
    const capabilityTargetsFor = kind => {
      const targets = state.model?.capabilityTargets || {};
      if (kind === "context") return targets.contexts || [];
      if (kind === "serverRunner") return targets.serverRunners || [];
      if (kind === "routePage") return targets.routePages || [];
      return [];
    };
    const mcpServers = () => state.bootstrapState?.mcp?.servers || [];
    const mcpServerRow = serverId => mcpServers().find(row => row.id === serverId) || null;
    const mcpInstalledToolsForServer = serverId => mcpServerRow(serverId)?.tools || [];
    const mcpSupportedTools = () => state.model?.supportedMcpTools || [];
    const mcpSupportedToolRow = toolName => mcpSupportedTools().find(row => row.name === toolName) || null;
    const mcpScopeSummary = install => {
      const scopes = [];
      if ((install?.scopeContexts || []).length) scopes.push("contexts: " + install.scopeContexts.join(", "));
      if ((install?.scopeTargets || []).length) scopes.push("targets: " + install.scopeTargets.join(", "));
      return scopes.length ? scopes.join(" / ") : "unscoped";
    };
    const mcpServerOptionLabel = row => {
      const transports = (row.transports || []).length ? "[" + row.transports.join(", ") + "]" : "[no transport]";
      return row.id + " @" + (row.serverRunner || "no runner") + " " + transports;
    };
    const mcpToolOptionLabel = row => row.title ? row.name + " [" + row.title + "]" : row.name;
    const mcpInstalledToolOptionLabel = row => {
      const definition = mcpSupportedToolRow(row.tool);
      const title = definition?.title ? " [" + definition.title + "]" : "";
      return row.tool + title + " {" + row.actingMode + ", " + mcpScopeSummary(row) + "}";
    };
    const mcpAvailableToolsForServer = serverId => {
      const installed = new Set(mcpInstalledToolsForServer(serverId).map(row => row.tool));
      return mcpSupportedTools().filter(row => !installed.has(row.name));
    };
    const runtimePluginAvailabilityForRunner = serverRunnerId => (state.bootstrapState?.runtimePluginAvailability || [])
      .filter(row => row.serverRunner === serverRunnerId);
    const runtimePluginAvailabilityRow = (serverRunnerId, pluginId) => runtimePluginAvailabilityForRunner(serverRunnerId)
      .find(row => row.plugin === pluginId) || null;
    const runtimePluginReviewRows = () => state.runtimePluginReview?.packages || [];
    const runtimePluginReviewRow = pluginId => runtimePluginReviewRows()
      .find(row => row.plugin === pluginId) || null;
    const runtimePluginReviewOptionLabel = row => {
      const badges = Array.isArray(row.statusBadges) && row.statusBadges.length ? " {" + row.statusBadges.join(", ") + "}" : "";
      return row.plugin + (row.version ? " [" + row.version + "]" : "") + badges;
    };
    const routeKindCounts = values => {
      const counts = new Map();
      for (const value of values || []) {
        const routeKind = typeof value?.routeKind === "string" && value.routeKind.trim() ? value.routeKind.trim() : null;
        if (!routeKind) continue;
        counts.set(routeKind, (counts.get(routeKind) ?? 0) + 1);
      }
      return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
    };
    const summarizeRouteKinds = values => {
      const counts = routeKindCounts(values);
      return counts.length ? counts.map(([routeKind, count]) => routeKind + "=" + count).join(", ") : "none";
    };
    const runtimePluginPreviewSummary = (review, row) => {
      if (!row) return "Select a runtime plugin review row.";
      const preview = row.installed ? row.removePreview : row.installPreview;
      const profile = review?.activeProfile || row.compatibility?.activeProfile || state.model?.runtimeProfile || "full";
      const parts = [
        (row.installed ? "Installed" : (row.installable ? "Installable" : "Blocked")) + " on profile " + profile + "."
      ];
      if (!row.installed && row.installable && (row.dependencies?.direct || []).length) {
        parts.push("Depends on: " + row.dependencies.direct.join(", ") + ".");
      }
      if (!row.installable && !row.installed && (row.blockingReasons || []).length) {
        parts.push("Blocked by: " + row.blockingReasons.join("; ") + ".");
      }
      if (preview?.available) {
        const bundleChanges = [
          ...(preview.delta?.addedBundleIds?.length ? ["add bundles " + preview.delta.addedBundleIds.join(", ")] : []),
          ...(preview.delta?.removedBundleIds?.length ? ["remove bundles " + preview.delta.removedBundleIds.join(", ")] : [])
        ];
        if (bundleChanges.length) parts.push("Would " + bundleChanges.join(" and ") + ".");
        const routeKindsAdded = summarizeRouteKinds((preview.delta?.addedHandlerMetadata || []).map(entry => entry.metadata));
        const routeKindsRemoved = summarizeRouteKinds((preview.delta?.removedHandlerMetadata || []).map(entry => entry.metadata));
        const routeKindsChanged = (preview.delta?.changedHandlerMetadata || []).length;
        if (routeKindsAdded !== "none" || routeKindsRemoved !== "none" || routeKindsChanged) {
          const routeParts = [];
          if (routeKindsAdded !== "none") routeParts.push("add handler route kinds " + routeKindsAdded);
          if (routeKindsRemoved !== "none") routeParts.push("remove handler route kinds " + routeKindsRemoved);
          if (routeKindsChanged) routeParts.push("change " + routeKindsChanged + " existing handler contracts");
          parts.push("Would " + routeParts.join(", ") + ".");
        }
        if (preview.delta?.effectiveNoOp) parts.push("Executable runtime composition is unchanged.");
      }
      return parts.join(" ");
    };
    const runtimePluginSummary = row => {
      if (!row) return "Select a runtime plugin.";
      const profile = state.model?.runtimeProfile || "full";
      if (row.installed) return "Already installed on this server runner for profile " + profile + ".";
      if (row.installable) {
        const dependsOn = (row.dependsOnPlugins || []).length ? " Depends on: " + row.dependsOnPlugins.join(", ") + "." : "";
        return "Installable on profile " + profile + "." + dependsOn;
      }
      if ((row.reasons || []).length) return "Blocked on profile " + profile + ": " + row.reasons.join("; ");
      return "Not installable on profile " + profile + ".";
    };
    const runtimePluginOptionLabel = row => {
      const badges = [];
      if (row.installed) badges.push("installed");
      else if (row.installable) badges.push("installable");
      else badges.push("blocked");
      if (!row.executable) badges.push("metadata-only");
      if (!row.compatible) badges.push("incompatible");
      if ((row.missingDependencies || []).length) badges.push("missing deps");
      return row.plugin + (row.version ? " [" + row.version + "]" : "") + " {" + badges.join(", ") + "}";
    };
    const cloneForDisplay = value => {
      if (Array.isArray(value)) return value.map(cloneForDisplay);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneForDisplay(item)]));
      }
      return value;
    };
    const formatRuntimePluginValue = value => escapeHtml(JSON.stringify(cloneForDisplay(value), null, 2));
    const renderRuntimePluginReviewDetail = () => {
      const root = byId("runtime-plugin-review-detail");
      if (!root) return;
      const review = state.runtimePluginReview || null;
      if (!review?.serverRunner) {
        root.innerHTML = '<div class="state-item muted">Create a server runner to review runtime plugin composition.</div>';
        setStatus("runtime-plugin-review-note", review?.note || "Runtime plugin review shows authored runner intent only.");
        return;
      }
      const row = runtimePluginReviewRow(review.selectedPluginId || "");
      if (!row) {
        root.innerHTML = '<div class="state-item muted">No discovered plugin packages for this server runner.</div>';
        setStatus("runtime-plugin-review-note", review.note || "Runtime plugin review shows authored runner intent only.");
        return;
      }
      const preview = row.installed ? row.removePreview : row.installPreview;
      const renderCodeItems = values => values.length
        ? values.map(value => '<div class="state-item"><code>' + formatRuntimePluginValue(value) + '</code></div>').join("")
        : '<div class="state-item muted">None.</div>';
      const previewDelta = preview?.delta ? [
        { addedBundleIds: preview.delta.addedBundleIds, removedBundleIds: preview.delta.removedBundleIds },
        { addedCapabilityIds: preview.delta.addedCapabilityIds, removedCapabilityIds: preview.delta.removedCapabilityIds },
        { addedRoutes: preview.delta.addedRoutes, removedRoutes: preview.delta.removedRoutes },
        { addedSurfaces: preview.delta.addedSurfaces, removedSurfaces: preview.delta.removedSurfaces },
        {
          addedHandlerMetadata: preview.delta.addedHandlerMetadata,
          removedHandlerMetadata: preview.delta.removedHandlerMetadata,
          changedHandlerMetadata: preview.delta.changedHandlerMetadata
        }
      ] : [];
      root.innerHTML = [
        '<div class="state-item">',
        '<strong>Operator Summary</strong>',
        '<code>' + escapeHtml(runtimePluginPreviewSummary(review, row)) + '</code>',
        '</div>',
        '<div class="state-item">',
        '<strong>' + escapeHtml(row.displayName || row.plugin) + '</strong>',
        '<code>' + escapeHtml(row.plugin) + (row.version ? " [" + escapeHtml(row.version) + "]" : "") + '</code>',
        '<code>' + formatRuntimePluginValue({
          statusBadges: row.statusBadges,
          installed: row.installed,
          installable: row.installable,
          missingPackage: row.missingPackage,
          discoveryPath: row.discoveryPath,
          description: row.description
        }) + '</code>',
        '</div>',
        '<div class="state-item">',
        '<strong>Metadata And Trust</strong>',
        '<code>' + formatRuntimePluginValue({
          execution: row.execution,
          trust: row.trust,
          provenance: row.metadata?.provenance ?? null,
          permissions: row.metadata?.permissions ?? [],
          compatibleRuntimeProfiles: row.metadata?.compatibleRuntimeProfiles ?? [],
          compatibleShells: row.metadata?.compatibleShells ?? []
        }) + '</code>',
        '</div>',
        '<div class="state-item">',
        '<strong>Dependencies</strong>',
        '<code>' + formatRuntimePluginValue({
          direct: row.dependencies?.direct ?? [],
          missing: row.dependencies?.missing ?? [],
          reverseDependents: row.dependencies?.reverseDependents ?? [],
          blockingReasons: row.blockingReasons ?? []
        }) + '</code>',
        '</div>',
        '<div class="state-item">',
        '<strong>Declared Manifest Contributions</strong>',
        renderCodeItems([
          { capabilities: row.declaredManifestContributions?.capabilities ?? [] },
          { routes: row.declaredManifestContributions?.routes ?? [] },
          { surfaces: row.declaredManifestContributions?.surfaces ?? [] },
          { providers: row.declaredManifestContributions?.providers ?? [] }
        ]),
        '</div>',
        '<div class="state-item">',
        '<strong>Resolved Executable Contributions</strong>',
        renderCodeItems([
          { bundles: row.resolvedBundles ?? [] },
          { capabilities: row.resolvedRuntimeContributions?.capabilities ?? [] },
          { routes: row.resolvedRuntimeContributions?.routes ?? [] },
          { surfaces: row.resolvedRuntimeContributions?.surfaces ?? [] },
          { handlerSets: row.resolvedRuntimeContributions?.handlerSets ?? [] }
        ]),
        '</div>',
        '<div class="state-item">',
        '<strong>Current Runner Composition</strong>',
        '<code>' + formatRuntimePluginValue(row.currentComposition || review.currentComposition || null) + '</code>',
        '</div>',
        '<div class="state-item">',
        '<strong>' + (row.installed ? "Remove Preview" : "Install Preview") + '</strong>',
        '<code>' + formatRuntimePluginValue(preview || {
          available: false,
          note: row.installed ? "Plugin is not currently authored on this runner." : "Plugin is already authored on this runner."
        }) + '</code>',
        (preview?.available && preview?.delta?.effectiveNoOp ? '<div class="state-item muted">Effective runtime composition is unchanged for this action.</div>' : ''),
        (previewDelta.length ? renderCodeItems(previewDelta) : ''),
        '</div>'
      ].join("");
      const reviewSummary = runtimePluginPreviewSummary(review, row);
      setStatus("runtime-plugin-review-note", (review.note || "Runtime plugin review shows authored runner intent only.") + (reviewSummary ? " " + reviewSummary : ""));
    };
    const loadRuntimePluginReview = async (serverRunnerId, { selectedPluginId = null } = {}) => {
      const runnerId = typeof serverRunnerId === "string" ? serverRunnerId.trim() : "";
      if (!runnerId) {
        state.runtimePluginReview = {
          serverRunner: null,
          activeProfile: state.model?.runtimeProfile || null,
          authoredPluginIds: [],
          currentComposition: null,
          packages: [],
          selectedPluginId: "",
          note: "Runtime plugin review shows authored runner intent only."
        };
        return;
      }
      const requestId = ++runtimePluginReviewRequestId;
      const query = new URLSearchParams({ serverRunner: runnerId });
      const review = await request("/api/runtime/plugin-reviews?" + query.toString());
      if (requestId !== runtimePluginReviewRequestId) return;
      const requestedPluginId = typeof selectedPluginId === "string" && selectedPluginId.trim()
        ? selectedPluginId.trim()
        : (state.runtimePluginReview?.selectedPluginId || "");
      const resolvedPluginId = review.packages.some(row => row.plugin === requestedPluginId)
        ? requestedPluginId
        : (review.packages[0]?.plugin || "");
      state.runtimePluginReview = {
        ...review,
        selectedPluginId: resolvedPluginId
      };
    };
    const mcpServerInventoryLabel = row => {
      const transports = (row.transports || []).join(", ") || "none";
      const runtimeState = row.attachedToActiveRuntime ? "active runtime" : "authored only";
      const path = row.httpPath ? " -> " + row.httpPath : "";
      return row.id + " @" + (row.serverRunner || "no runner") + " [" + transports + "] [" + runtimeState + "]" + path;
    };
    const mcpToolInventoryLabel = row => {
      const summary = (row.tools || []).map(tool => tool.tool + " [" + tool.actingMode + "]").join(", ");
      return row.id + " -> " + (summary || "no installed tools");
    };
    const capabilityCatalogRow = capabilityId => (state.bootstrapState?.capabilityCatalog || []).find(row => row.id === capabilityId) || null;
    const capabilityInstallRow = (capabilityId, targetKind, target) => (state.bootstrapState?.capabilityInstalls || [])
      .find(row => row.capability === capabilityId && row.targetKind === targetKind && row.target === target) || null;
    const capabilityTargetRow = (targetKind, targetId) => capabilityTargetsFor(targetKind).find(row => row.id === targetId) || null;
    const parseJsonArrayInput = raw => {
      const text = typeof raw === "string" ? raw.trim() : "";
      if (!text) return { ok: true, value: [] };
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) return { ok: false, reason: "must be a JSON array" };
        return { ok: true, value: parsed };
      } catch {
        return { ok: false, reason: "must be valid JSON" };
      }
    };
    const contextBindableTargets = contextId => (state.model?.contextBindableTargets || []).filter(row => !row.context || row.context === contextId);
    const contextScopeRows = (contextId, sourceKind = null) => (state.bootstrapState?.contextScopes || []).filter(row => row.context === contextId && (!sourceKind || row.sourceKind === sourceKind));
    const contextExportRows = contextId => (state.bootstrapState?.contextExports || []).filter(row => row.context === contextId);
    const refreshCapabilityTargetOptions = (kindSelectId, targetSelectId) => {
      const kind = byId(kindSelectId)?.value || "";
      const rows = capabilityTargetsFor(kind);
      const label = row => kind === "routePage" ? row.id + " " + (row.path || "") : row.id;
      fillSelect(targetSelectId, rows, row => row.id, label, { includeBlank: false });
    };
    const refreshRuntimePluginInstallOptions = (runnerSelectId, pluginSelectId) => {
      const serverRunnerId = byId(runnerSelectId)?.value || "";
      const rows = serverRunnerId ? runtimePluginAvailabilityForRunner(serverRunnerId) : [];
      fillSelect(pluginSelectId, rows, row => row.plugin, runtimePluginOptionLabel, { includeBlank: false });
    };
    const refreshRuntimePluginRemoveOptions = (runnerSelectId, pluginSelectId) => {
      const serverRunnerId = byId(runnerSelectId)?.value || "";
      const rows = serverRunnerId
        ? runtimePluginAvailabilityForRunner(serverRunnerId).filter(row => row.installed)
        : [];
      fillSelect(pluginSelectId, rows, row => row.plugin, runtimePluginOptionLabel, { includeBlank: false });
    };
    const syncRuntimePluginHelp = ({
      runnerSelectId,
      pluginSelectId,
      helpId,
      buttonFormId,
      allowInstalled = false,
      requireInstalled = false
    }) => {
      const serverRunnerId = byId(runnerSelectId)?.value || "";
      const pluginId = byId(pluginSelectId)?.value || "";
      const row = runtimePluginAvailabilityRow(serverRunnerId, pluginId);
      const button = byId(buttonFormId)?.querySelector('button[type="submit"]');
      const allowed = row
        ? (requireInstalled ? row.installed : (allowInstalled ? true : row.installable))
        : false;
      if (button) button.disabled = !allowed;
      setStatus(helpId, runtimePluginSummary(row));
    };
    const syncCapabilityHelp = ({
      capabilitySelectId,
      kindSelectId,
      targetSelectId,
      helpId,
      buttonFormId,
      requireInstalled = false
    }) => {
      const capabilityId = byId(capabilitySelectId)?.value || "";
      const targetKind = byId(kindSelectId)?.value || "";
      const targetId = byId(targetSelectId)?.value || "";
      const capability = capabilityCatalogRow(capabilityId);
      const target = capabilityTargetRow(targetKind, targetId);
      const existing = capabilityInstallRow(capabilityId, targetKind, targetId);
      const button = byId(buttonFormId)?.querySelector('button[type="submit"]');
      if (!capability || !targetKind || !targetId || !target) {
        if (button) button.disabled = true;
        setStatus(helpId, requireInstalled
          ? "Choose an installed capability target to remove."
          : "Choose a capability, target kind, and target to see placement and source guidance.");
        return;
      }
      const placements = Array.isArray(capability.placement) ? capability.placement : [];
      const placementOk = placements.includes(targetKind);
      const sourceState = capability.capabilitySourceState || "catalog-only";
      const packageSources = (capability.packageSources || []).map(row => row.pluginId).filter(Boolean);
      const issues = [];
      if (!placementOk) issues.push("capability does not support target kind " + targetKind);
      if (requireInstalled && !existing) issues.push("capability is not installed on this target");
      if (!requireInstalled && existing) issues.push("capability is already installed on this target");
      const help = [
        "Capability " + capability.id + " supports placements: " + (placements.join(", ") || "(none)") + ".",
        "Source state: " + sourceState + (packageSources.length ? " via " + packageSources.join(", ") + "." : "."),
        "Target: " + target.id + (target.context ? " @" + target.context : "") + "."
      ].join(" ") + (issues.length ? " Blocking issues: " + issues.join("; ") + "." : "");
      if (button) button.disabled = issues.length > 0;
      setStatus(helpId, help);
    };
    const syncMcpServerHelp = ({
      formId,
      runnerSelectId,
      helpId,
      serviceIdentityFieldName,
      transportsFieldName
    }) => {
      const form = byId(formId);
      const runnerId = byId(runnerSelectId)?.value || "";
      const serviceIdentity = String(formField(form, serviceIdentityFieldName)?.value || "").trim();
      const transportsInput = String(formField(form, transportsFieldName)?.value || "");
      const transports = parseJsonArrayInput(transportsInput);
      const button = form?.querySelector('button[type="submit"]');
      if (!runnerId) {
        if (button) button.disabled = true;
        setStatus(helpId, "Choose a server runner to expose MCP transports on its runtime.");
        return;
      }
      if (!transports.ok) {
        if (button) button.disabled = true;
        setStatus(helpId, "Transports JSON " + transports.reason + ".");
        return;
      }
      const normalizedTransports = transports.value.map(value => String(value)).filter(Boolean);
      const transportSummary = normalizedTransports.length ? normalizedTransports.join(", ") : "none";
      const parts = [
        "Runner " + runnerId + " will expose transports: " + transportSummary + "."
      ];
      if (normalizedTransports.includes("http")) parts.push("HTTP transport will mount a runtime path for this MCP server.");
      if (normalizedTransports.includes("stdio")) parts.push("STDIO transport stays shell-facing.");
      parts.push(serviceIdentity
        ? "Service-mode tools can run as " + serviceIdentity + "."
        : "Service identity is optional here, but required later for service-mode tool installs.");
      if (button) button.disabled = normalizedTransports.length === 0;
      setStatus(helpId, parts.join(" "));
    };
    const refreshMcpToolInstallOptions = (serverSelectId, toolSelectId) => {
      const serverId = byId(serverSelectId)?.value || "";
      const rows = serverId ? mcpAvailableToolsForServer(serverId) : [];
      fillSelect(toolSelectId, rows, row => row.name, mcpToolOptionLabel, { includeBlank: false });
    };
    const refreshMcpToolRemoveOptions = (serverSelectId, toolSelectId) => {
      const serverId = byId(serverSelectId)?.value || "";
      const rows = serverId ? mcpInstalledToolsForServer(serverId) : [];
      fillSelect(toolSelectId, rows, row => row.tool, mcpInstalledToolOptionLabel, { includeBlank: false });
    };
    const syncMcpToolInstallHelp = ({
      serverSelectId,
      toolSelectId,
      actingModeSelectId,
      helpId,
      buttonFormId
    }) => {
      const serverId = byId(serverSelectId)?.value || "";
      const toolId = byId(toolSelectId)?.value || "";
      const actingMode = byId(actingModeSelectId)?.value || "delegated";
      const server = mcpServerRow(serverId);
      const tool = mcpSupportedToolRow(toolId);
      const button = byId(buttonFormId)?.querySelector('button[type="submit"]');
      let help = "Choose an MCP server and tool.";
      let allowed = Boolean(server && tool);
      if (server && tool) {
        const toolTitle = tool.title ? tool.name + " [" + tool.title + "]" : tool.name;
        const modeCopy = actingMode === "service"
          ? (server.serviceIdentity
            ? "Service mode will run as " + server.serviceIdentity + "."
            : "Service mode requires a serviceIdentity on the selected MCP server.")
          : "Delegated mode will run as the calling actor.";
        const httpCopy = server.httpPath
          ? " HTTP path: " + server.httpPath + "."
          : " HTTP transport is not enabled on this MCP server.";
        help = "Installing " + toolTitle + " on " + server.id + ". " + modeCopy + " Scope JSON narrows what the installed tool may act on." + httpCopy;
        if (actingMode === "service" && !server.serviceIdentity) allowed = false;
      }
      if (button) button.disabled = !allowed;
      setStatus(helpId, help);
    };
    const syncMcpToolRemoveHelp = ({
      serverSelectId,
      toolSelectId,
      helpId,
      buttonFormId
    }) => {
      const serverId = byId(serverSelectId)?.value || "";
      const toolId = byId(toolSelectId)?.value || "";
      const server = mcpServerRow(serverId);
      const install = mcpInstalledToolsForServer(serverId).find(row => row.tool === toolId) || null;
      const button = byId(buttonFormId)?.querySelector('button[type="submit"]');
      const allowed = Boolean(server && install);
      if (button) button.disabled = !allowed;
      if (!server || !install) {
        setStatus(helpId, "Choose an installed MCP tool to remove.");
        return;
      }
      setStatus(helpId, "Removing " + install.tool + " from " + server.id + " (" + install.actingMode + ", " + mcpScopeSummary(install) + "). Service identity: " + (server.serviceIdentity || "none") + ".");
    };
    const refreshContextBindingTargetOptions = (contextSelectId, targetSelectId) => {
      const contextId = byId(contextSelectId)?.value || "";
      const rows = contextId ? contextBindableTargets(contextId) : [];
      fillSelect(targetSelectId, rows, row => row.id, row => row.id + (row.context ? " @" + row.context : ""), { includeBlank: false });
    };
    const refreshContextExportTargetOptions = (contextSelectId, targetSelectId) => {
      const contextId = byId(contextSelectId)?.value || "";
      const rows = contextId ? contextScopeRows(contextId, "local") : [];
      fillSelect(targetSelectId, rows, row => row.target, row => row.name + " -> " + row.target, { includeBlank: false });
    };
    const refreshContextImportExportOptions = (sourceContextSelectId, exportNameSelectId) => {
      const contextId = byId(sourceContextSelectId)?.value || "";
      const rows = contextId ? contextExportRows(contextId) : [];
      fillSelect(exportNameSelectId, rows, row => row.name, row => row.name + " -> " + row.target, { includeBlank: false });
    };
    const renderStateList = (id, rows, label) => {
      const root = byId(id);
      if (!root) return;
      const previousKeys = stateSnapshots.get(id) || new Set();
      const nextKeys = new Set();
      root.innerHTML = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "state-item muted";
        empty.textContent = "None yet.";
        root.append(empty);
        stateSnapshots.set(id, nextKeys);
        return;
      }
      for (const row of rows) {
        const key = rowKey(row);
        nextKeys.add(key);
        const item = document.createElement("div");
        item.className = "state-item";
        if (previousKeys.size && !previousKeys.has(key)) item.setAttribute("data-tutorial-changed", "true");
        const title = document.createElement("strong");
        title.textContent = label(row);
        const code = document.createElement("code");
        code.textContent = JSON.stringify(row, null, 2);
        item.append(title, code);
        root.append(item);
      }
      stateSnapshots.set(id, nextKeys);
    };
    const revealTarget = target => {
      let current = target?.parentElement || null;
      while (current) {
        if (current.tagName === "DETAILS") current.open = true;
        current = current.parentElement;
      }
    };
    const tutorialState = createBootstrapTutorialStateRuntime({
      tutorial,
      state,
      stepIndex,
      currentSurfacePage,
      localProgressKey,
      request,
      byId,
      renderPage: () => render()
    });
    const {
      currentSuggestions,
      tutorialStep,
      tutorialDisabledPages,
      tutorialDisabledScopeKeys,
      tutorialReplayStepId,
      tutorialReplayScopeKey,
      tutorialStepScope,
      tutorialStepConcepts,
      tutorialRevealedConcepts,
      tutorialSurfaceState,
      loadTutorialProgress,
    } = tutorialState;
    const continueTutorialOnPage = async page => {
      if (page === "app") {
        await openAppHome(byId("open-app-link").href, { advance: false });
        return;
      }
      if (page === "bootstrap") {
        const target = new URL("/_bootstrap", window.location.href);
        if (window.location.pathname === target.pathname) {
          window.location.reload();
          return;
        }
        window.location.assign(target.toString());
        return;
      }
      if (page === "world") {
        const target = new URL("/world", window.location.href);
        if (window.location.pathname === target.pathname) {
          window.location.reload();
          return;
        }
        window.location.assign(target.toString());
      }
    };
    const openAppHome = async (href, { advance = false } = {}) => {
      if (state.model?.appReady !== true) {
        setStatus("bootstrap-status", "Home route is not ready yet.");
        return;
      }
      if (advance) await advanceTutorial();
      const target = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (target.origin === current.origin && target.pathname === current.pathname && target.search === current.search && target.hash === current.hash) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
    };
    const tutorialController = createBootstrapTutorialController({
      tutorial,
      state,
      currentSurfacePage,
      autoCompletableChapters,
      escapeHtml,
      byId,
      byTarget,
      setStatus,
      formField,
      sleep,
      revealTarget,
      renderPage: () => render(),
      openAppHome,
      continueTutorialOnPage,
      tutorialState
    });
    const {
      advanceTutorial,
      renderTutorialCard,
      renderTutorialOverlay,
      requestMaybeAdvanceTutorial,
      bindTutorialInteractions
    } = tutorialController;
    const refresh = async () => {
      const previousReviewRunnerId = byId("runtime-plugin-review-runner")?.value
        || state.runtimePluginReview?.serverRunner
        || "";
      state.model = await request("/api/bootstrap-model");
      state.bootstrapState = await request("/api/bootstrap-state");
      state.session = await request("/api/session");
      state.desktopShell = desktopApi()
        ? await desktopApi().getDesktopShellState()
        : null;
      const availableReviewRunnerIds = (state.bootstrapState?.serverRunners || []).map(row => row.id);
      const fallbackReviewRunnerId = availableReviewRunnerIds.includes(previousReviewRunnerId)
        ? previousReviewRunnerId
        : (availableReviewRunnerIds[0] || "");
      await loadRuntimePluginReview(fallbackReviewRunnerId);
      await loadTutorialProgress();
      render();
      await requestMaybeAdvanceTutorial();
      render();
    };
    const render = () => {
      const model = state.model || {};
      const authored = state.bootstrapState || {};
      const operator = authored.operator || {};
      const session = state.session || {};
      const appReady = model.appReady === true;
      const identityForm = byId("identity-form");
      const identityHeading = byId("identity-heading");
      const identityCopy = byId("identity-copy");
      const identitySubmitButton = byId("identity-submit-button");
      const identityCreateNewButton = byId("identity-create-new");
      const editingIdentity = (authored.identities || []).find(row => row.id === currentIdentityEditId()) || null;
      byId("bootstrap-summary").textContent = appReady
        ? "The app route exists. This seam remains available for recovery and harness edits."
        : "No reachable app home route exists yet. Bootstrap owns the landing experience until the app boundary is wired.";
      byId("open-app-link").href = "/";
      byId("desktop-summary").textContent = state.desktopShell
        ? "Active shell " + (state.desktopShell.shellId || "desktop") + " / " + (state.desktopShell.runtimeStatus || "idle") + " on " + (state.desktopShell.worldHome || "(no world home)") + " with profile " + (state.desktopShell.runtimeProfile || "full") + ". Powers: " + ((state.desktopShell.availablePowers || []).join(", ") || "(none)") + "."
        : "Desktop shell unavailable in this session.";
      byId("session-summary").textContent = session.authenticated
        ? "Signed in as " + session.label + " (" + session.actor + ")" + (session.homeContext ? " / " + session.homeContext : "") + (session.perspective ? " in " + session.perspective : "")
        : ((authored.identities || []).length ? "Sign in to continue editing the bootstrap seam." : "No identities yet. Create the first identity to continue.");
      byId("operator-summary").textContent = operator.contract
        ? "Persistence " + (operator.contract.persistence?.mode || "unknown") + " on " + (operator.contract.layout || "unknown") + (operator.contract.worldHome ? " at " + operator.contract.worldHome : "") + "."
        : "Operator contract unavailable on this runtime.";
      byId("operator-warning").textContent = operator.mutations?.enabled === false
        ? "Operator mutations disabled: " + (operator.mutations.reason || "unknown reason") + "."
        : "Restore and import replace current world truth. Use preserve-current when you need a safety backup first.";

      fillSelect("widget-kind", model.widgetKinds || [], x => x, x => x, { includeBlank: false });
      fillSelect("identity-home-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("context-parent", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("perspective-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("context-binding-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("context-binding-remove-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("context-export-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("context-export-remove-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("context-import-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("context-import-remove-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("context-import-source-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("context-import-remove-source-context", authored.contexts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("widget-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("widget-parent", authored.widgets || [], x => x.id, x => x.id);
      fillSelect("program-root-widget", authored.widgets || [], x => x.id, x => x.id);
      fillSelect("program-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("backend-program-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("backend-program-version-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("backend-program-version-soul", authored.backendPrograms || [], x => x.soul, x => x.soul, { includeBlank: false });
      fillSelect("backend-program-version-transition-strategy", ["compatible", "migrate", "block", "fork"], x => x, x => x, { includeBlank: false });
      fillSelect("backend-step-version", authored.backendProgramVersions || [], x => x.version, x => x.version, { includeBlank: false });
      fillSelect("backend-step-op", model.supportedBackendOps || [], x => x, x => x, { includeBlank: false });
      fillSelect("backend-program-activate-soul", authored.backendPrograms || [], x => x.soul, x => x.soul, { includeBlank: false });
      fillSelect("backend-program-rollback-soul", authored.backendPrograms || [], x => x.soul, x => x.soul, { includeBlank: false });
      fillSelect("route-root-widget", authored.widgets || [], x => x.id, x => x.id);
      fillSelect("route-frontend-program", authored.frontendPrograms || [], x => x.id, x => x.id);
      fillSelect("route-backend-program-soul", authored.backendPrograms || [], x => x.soul, x => x.soul);
      fillSelect("route-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("step-program", authored.frontendPrograms || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("step-op", model.supportedFrontendOps || [], x => x, x => x, { includeBlank: false });
      fillSelect("route-method", model.supportedMethods || [], x => x, x => x, { includeBlank: false });
      fillSelect("route-handler", model.supportedHandlers || [], x => x, x => x, { includeBlank: false });
      fillSelect("serve-route", authored.routes || [], x => x.id, x => x.id);
      fillSelect("serve-server-runner", authored.serverRunners || [], x => x.id, x => x.id);
      fillSelect("serve-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("runner-handler-set", model.supportedHandlerSets || [], x => x, x => x);
      fillSelect("runner-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("runner-backend-host", model.backendHosts || [], x => x.id, x => x.id);
      fillSelect("runner-frontend-host", model.frontendHosts || [], x => x.id, x => x.id);
      fillSelect("runtime-plugin-review-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("runtime-plugin-install-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("runtime-plugin-remove-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("runtime-plugin-install-proposal-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("runtime-plugin-remove-proposal-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("mcp-server-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("mcp-server-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("mcp-tool-install-server", authored.mcpServers || [], x => x.id, mcpServerOptionLabel, { includeBlank: false });
      fillSelect("mcp-tool-remove-server", authored.mcpServers || [], x => x.id, mcpServerOptionLabel, { includeBlank: false });
      fillSelect("mcp-server-proposal-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("mcp-server-proposal-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("mcp-tool-install-proposal-server", authored.mcpServers || [], x => x.id, mcpServerOptionLabel, { includeBlank: false });
      fillSelect("mcp-tool-remove-proposal-server", authored.mcpServers || [], x => x.id, mcpServerOptionLabel, { includeBlank: false });
      fillSelect("mcp-tool-install-acting-mode", model.supportedMcpActingModes || [], x => x, x => x, { includeBlank: false });
      fillSelect("mcp-tool-install-proposal-acting-mode", model.supportedMcpActingModes || [], x => x, x => x, { includeBlank: false });
      fillSelect("capability-context", authored.contexts || [], x => x.id, x => x.id);
      fillSelect("capability-install-capability", authored.capabilityCatalog || [], x => x.id, x => x.id + (x.version ? " [" + x.version + "]" : ""), { includeBlank: false });
      fillSelect("capability-remove-capability", authored.capabilityCatalog || [], x => x.id, x => x.id + (x.version ? " [" + x.version + "]" : ""), { includeBlank: false });
      fillSelect("capability-install-kind", model.capabilityTargetKinds || [], x => x, x => x, { includeBlank: false });
      fillSelect("capability-remove-kind", model.capabilityTargetKinds || [], x => x, x => x, { includeBlank: false });
      fillSelect("stewardship-target-kind", model.stewardshipTargetKinds || [], x => x, x => x, { includeBlank: false });
      fillSelect("stewardship-remove-target-kind", model.stewardshipTargetKinds || [], x => x, x => x, { includeBlank: false });
      fillSelect("stewardship-target", [...(authored.contexts || []), ...(authored.perspectives || [])], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("stewardship-remove-target", [...(authored.contexts || []), ...(authored.perspectives || [])], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("proposal-target-process", model.proposalTargetProcesses || [], x => x, x => x, { includeBlank: false });
      fillSelect("proposal-approve-id", (authored.proposals || []).filter(row => row.status === "open"), x => x.id, x => x.id, { includeBlank: false });
      fillSelect("proposal-reject-id", (authored.proposals || []).filter(row => row.status === "open"), x => x.id, x => x.id, { includeBlank: false });
      fillSelect("operator-restore-artifact", operator.inventory?.backups || [], x => x.id, x => x.id + " [" + (x.status || "unknown") + "]", { includeBlank: false });
      fillSelect("operator-import-artifact", operator.inventory?.imports || [], x => x.id, x => x.id + " [" + (x.status || "unknown") + "]", { includeBlank: false });
      refreshCapabilityTargetOptions("capability-install-kind", "capability-install-target");
      refreshCapabilityTargetOptions("capability-remove-kind", "capability-remove-target");
      refreshContextBindingTargetOptions("context-binding-context", "context-binding-target");
      refreshContextBindingTargetOptions("context-binding-remove-context", "context-binding-remove-target");
      refreshContextExportTargetOptions("context-export-context", "context-export-target");
      refreshContextExportTargetOptions("context-export-remove-context", "context-export-remove-target");
      refreshContextImportExportOptions("context-import-source-context", "context-import-export-name");
      refreshContextImportExportOptions("context-import-remove-source-context", "context-import-remove-export-name");
      refreshBackendProgramVersionOptions("backend-program-version-soul", "backend-program-version-transition-from");
      refreshBackendProgramVersionOptions("backend-program-activate-soul", "backend-program-activate-version", { includeBlank: false });
      fillSelect("runtime-plugin-review-plugin", runtimePluginReviewRows(), row => row.plugin, runtimePluginReviewOptionLabel, { includeBlank: false });
      const runtimePluginReviewRunner = byId("runtime-plugin-review-runner");
      if (runtimePluginReviewRunner && state.runtimePluginReview?.serverRunner && [...runtimePluginReviewRunner.options].some(option => option.value === state.runtimePluginReview.serverRunner)) {
        runtimePluginReviewRunner.value = state.runtimePluginReview.serverRunner;
      }
      const runtimePluginReviewPlugin = byId("runtime-plugin-review-plugin");
      if (runtimePluginReviewPlugin && state.runtimePluginReview?.selectedPluginId && [...runtimePluginReviewPlugin.options].some(option => option.value === state.runtimePluginReview.selectedPluginId)) {
        runtimePluginReviewPlugin.value = state.runtimePluginReview.selectedPluginId;
      }
      if (state.runtimePluginReview) state.runtimePluginReview.selectedPluginId = runtimePluginReviewPlugin?.value || "";
      refreshRuntimePluginInstallOptions("runtime-plugin-install-runner", "runtime-plugin-install-plugin");
      refreshRuntimePluginRemoveOptions("runtime-plugin-remove-runner", "runtime-plugin-remove-plugin");
      refreshRuntimePluginInstallOptions("runtime-plugin-install-proposal-runner", "runtime-plugin-install-proposal-plugin");
      refreshRuntimePluginRemoveOptions("runtime-plugin-remove-proposal-runner", "runtime-plugin-remove-proposal-plugin");
      refreshMcpToolInstallOptions("mcp-tool-install-server", "mcp-tool-install-tool");
      refreshMcpToolRemoveOptions("mcp-tool-remove-server", "mcp-tool-remove-tool");
      refreshMcpToolInstallOptions("mcp-tool-install-proposal-server", "mcp-tool-install-proposal-tool");
      refreshMcpToolRemoveOptions("mcp-tool-remove-proposal-server", "mcp-tool-remove-proposal-tool");
      syncRuntimePluginHelp({
        runnerSelectId: "runtime-plugin-install-runner",
        pluginSelectId: "runtime-plugin-install-plugin",
        helpId: "runtime-plugin-install-help",
        buttonFormId: "runtime-plugin-install-form"
      });
      syncRuntimePluginHelp({
        runnerSelectId: "runtime-plugin-remove-runner",
        pluginSelectId: "runtime-plugin-remove-plugin",
        helpId: "runtime-plugin-remove-help",
        buttonFormId: "runtime-plugin-remove-form",
        requireInstalled: true
      });
      syncRuntimePluginHelp({
        runnerSelectId: "runtime-plugin-install-proposal-runner",
        pluginSelectId: "runtime-plugin-install-proposal-plugin",
        helpId: "runtime-plugin-install-proposal-help",
        buttonFormId: "runtime-plugin-install-proposal-form"
      });
      syncRuntimePluginHelp({
        runnerSelectId: "runtime-plugin-remove-proposal-runner",
        pluginSelectId: "runtime-plugin-remove-proposal-plugin",
        helpId: "runtime-plugin-remove-proposal-help",
        buttonFormId: "runtime-plugin-remove-proposal-form",
        requireInstalled: true
      });
      syncCapabilityHelp({
        capabilitySelectId: "capability-install-capability",
        kindSelectId: "capability-install-kind",
        targetSelectId: "capability-install-target",
        helpId: "capability-install-help",
        buttonFormId: "capability-install-form"
      });
      syncCapabilityHelp({
        capabilitySelectId: "capability-remove-capability",
        kindSelectId: "capability-remove-kind",
        targetSelectId: "capability-remove-target",
        helpId: "capability-remove-help",
        buttonFormId: "capability-remove-form",
        requireInstalled: true
      });
      syncBackendProgramActivateHelp();
      syncBackendProgramRollbackHelp();
      syncProposalHelp();
      syncProposalApproveHelp();
      syncMcpServerHelp({
        formId: "mcp-server-form",
        runnerSelectId: "mcp-server-runner",
        helpId: "mcp-server-help",
        serviceIdentityFieldName: "serviceIdentity",
        transportsFieldName: "transportsJson"
      });
      syncMcpServerHelp({
        formId: "mcp-server-proposal-form",
        runnerSelectId: "mcp-server-proposal-runner",
        helpId: "mcp-server-proposal-help",
        serviceIdentityFieldName: "serviceIdentity",
        transportsFieldName: "transportsJson"
      });
      syncMcpToolInstallHelp({
        serverSelectId: "mcp-tool-install-server",
        toolSelectId: "mcp-tool-install-tool",
        actingModeSelectId: "mcp-tool-install-acting-mode",
        helpId: "mcp-tool-install-help",
        buttonFormId: "mcp-tool-install-form"
      });
      syncMcpToolRemoveHelp({
        serverSelectId: "mcp-tool-remove-server",
        toolSelectId: "mcp-tool-remove-tool",
        helpId: "mcp-tool-remove-help",
        buttonFormId: "mcp-tool-remove-form"
      });
      syncMcpToolInstallHelp({
        serverSelectId: "mcp-tool-install-proposal-server",
        toolSelectId: "mcp-tool-install-proposal-tool",
        actingModeSelectId: "mcp-tool-install-proposal-acting-mode",
        helpId: "mcp-tool-install-proposal-help",
        buttonFormId: "mcp-tool-install-proposal-form"
      });
      syncMcpToolRemoveHelp({
        serverSelectId: "mcp-tool-remove-proposal-server",
        toolSelectId: "mcp-tool-remove-proposal-tool",
        helpId: "mcp-tool-remove-proposal-help",
        buttonFormId: "mcp-tool-remove-proposal-form"
      });
      updateRouteAuthoringFields();

      renderStateList("state-contexts", authored.contexts || [], row => row.id + (row.parent ? " <- " + row.parent : "") + ((row.capabilities || []).length ? " -> " + row.capabilities.join(", ") : ""));
      renderStateList("state-context-bindings", authored.contextBindings || [], row => row.context + " :: " + row.name + " -> " + row.target);
      renderStateList("state-context-exports", authored.contextExports || [], row => row.context + " :: " + row.name + " -> " + row.target);
      renderStateList("state-context-imports", authored.contextImports || [], row => row.context + " <- " + row.sourceContext + " :: " + row.name + " => " + row.exportName);
      renderStateList("state-context-scopes", authored.contextScopes || [], row => row.context + " :: " + row.name + " -> " + row.target + (row.sourceKind === "import" ? " [import]" : " [local]"));
      renderStateList("state-perspectives", authored.perspectives || [], row => row.id + (row.context ? " @" + row.context : ""));
      renderStateList("state-stewardships", authored.stewardships || [], row => row.steward + " -> " + row.target);
      renderStateList("state-proposals", authored.proposals || [], row => row.id + " [" + row.status + "] " + row.targetProcess);
      renderStateList("state-authority", authored.authority ? [
        "actor: " + (authored.authority.actor || "(none)"),
        "contexts: " + (authored.authority.mutationContexts || []).join(", ")
      ] : [], row => row);
      renderStateList("state-identities", authored.identities || [], row => row.id + " -> " + row.actor);
      renderStateList("state-widgets", authored.widgets || [], row => row.id + " (" + row.kind + ")");
      renderStateList("state-programs", authored.frontendPrograms || [], row => row.id + " -> " + row.rootWidget);
      renderStateList("state-steps", authored.frontendSteps || [], row => row.program + " / " + row.event + " / " + row.op + " / " + row.order);
      renderStateList("state-backend-programs", authored.backendPrograms || [], row => row.soul + (row.context ? " @" + row.context : ""));
      renderStateList("state-backend-program-versions", authored.backendProgramVersions || [], row => row.version + " -> " + row.soul + (row.active ? " [active]" : ""));
      renderStateList("state-backend-steps", authored.backendSteps || [], row => row.version + " / " + row.event + " / " + row.op + " / " + row.order);
      renderStateList("state-routes", authored.routes || [], row => row.id + " " + row.method + " " + row.path + (row.params?.backendProgramSoul ? " -> " + row.params.backendProgramSoul : ""));
      renderStateList("state-serves", authored.servedRoutes || [], row => row.serverRunner + " -> " + row.id);
      renderStateList("state-runners", authored.serverRunners || [], row => row.id + (row.handlerSet ? " [" + row.handlerSet + "]" : ""));
      renderStateList("state-capabilities", authored.capabilityCatalog || [], row => row.id + (row.placement?.length ? " -> " + row.placement.join(", ") : ""));
      renderStateList("state-capability-installs", authored.capabilityInstalls || [], row => row.targetKind + " " + row.target + " -> " + row.capability);
      renderStateList("state-runtime-plugin-installs", authored.runtimePluginInstalls || [], row => row.serverRunner + " -> " + row.plugin);
      renderStateList("state-runtime-plugin-availability", authored.runtimePluginAvailability || [], row => row.serverRunner + " :: " + row.plugin + (row.installed ? " [installed]" : (row.installable ? " [installable]" : " [blocked]")));
      renderRuntimePluginReviewDetail();
      renderStateList("mcp-server-inventory", authored.mcp?.servers || [], mcpServerInventoryLabel);
      renderStateList("mcp-tool-inventory", (authored.mcp?.servers || []).filter(row => (row.tools || []).length), mcpToolInventoryLabel);
      renderStateList("state-mcp-servers", authored.mcp?.servers || [], mcpServerInventoryLabel);
      renderStateList("state-mcp-tool-installs", (authored.mcp?.servers || []).filter(row => (row.tools || []).length), mcpToolInventoryLabel);
      renderStateList("state-operator-backups", operator.inventory?.backups || [], row => row.id + " / witnesses " + row.witnessCount + " / observations " + row.observationCount);
      renderStateList("state-operator-exports", operator.inventory?.exports || [], row => row.id + " / witnesses " + row.witnessCount + " / observations " + row.observationCount);
      renderStateList("state-operator-imports", operator.inventory?.imports || [], row => row.id + " / " + (row.status || "unknown"));
      renderStateList("state-operator-activity", operator.recentActivity || [], row => row.process + " / " + (row.body?.artifactId || row.id));

      const identityPrefillKey = editingIdentity
        ? JSON.stringify([editingIdentity.id, editingIdentity.label, editingIdentity.username, editingIdentity.password, editingIdentity.homeContext, editingIdentity.homePerspective])
        : "";
      if (editingIdentity) {
        identityHeading.textContent = "Edit Identity";
        identityCopy.textContent = "This handoff edits the real authored identity through bootstrap. Identity id and actor stay fixed in this first slice.";
        identitySubmitButton.textContent = "Save Identity";
        identityCreateNewButton.hidden = false;
        if (identityForm.dataset.identityPrefillKey !== identityPrefillKey) {
          formField(identityForm, "id").value = editingIdentity.id || "";
          formField(identityForm, "actor").value = editingIdentity.actor || "";
          formField(identityForm, "label").value = editingIdentity.label || "";
          formField(identityForm, "username").value = editingIdentity.username || "";
          formField(identityForm, "password").value = editingIdentity.password || "";
          formField(identityForm, "homePerspective").value = editingIdentity.homePerspective || "";
          formField(identityForm, "homeContext").value = editingIdentity.homeContext || "";
          identityForm.dataset.identityPrefillKey = identityPrefillKey;
        }
      } else {
        identityHeading.textContent = "Create First Identity";
        identityCopy.textContent = "Create the first user when the world is blank. After identities exist, normal session auth is required for bootstrap edits.";
        identitySubmitButton.textContent = "Create Identity";
        identityCreateNewButton.hidden = true;
        if (identityForm.dataset.identityPrefillKey) {
          identityForm.reset();
          identityForm.dataset.identityPrefillKey = "";
        }
      }
      const identityIdField = formField(identityForm, "id");
      const identityActorField = formField(identityForm, "actor");
      if (identityIdField) identityIdField.disabled = Boolean(editingIdentity);
      if (identityActorField) identityActorField.disabled = Boolean(editingIdentity);

      const editingEnabled = session.authenticated || !(authored.identities || []).length;
      for (const formId of ["context-form", "perspective-form", "context-binding-form", "context-binding-remove-form", "context-export-form", "context-export-remove-form", "context-import-form", "context-import-remove-form", "stewardship-form", "stewardship-remove-form", "proposal-form", "proposal-approve-form", "proposal-reject-form", "widget-form", "program-form", "step-form", "backend-program-form", "backend-program-version-form", "backend-step-form", "backend-program-activate-form", "backend-program-rollback-form", "route-form", "serve-form", "runner-form", "runtime-plugin-install-form", "runtime-plugin-remove-form", "runtime-plugin-install-proposal-form", "runtime-plugin-remove-proposal-form", "mcp-server-form", "mcp-tool-install-form", "mcp-tool-remove-form", "mcp-server-proposal-form", "mcp-tool-install-proposal-form", "mcp-tool-remove-proposal-form", "capability-form", "capability-install-form", "capability-remove-form", "operator-backup-form", "operator-export-form", "operator-restore-form", "operator-import-form"]) {
        const form = byId(formId);
        if (!form) continue;
        const operatorLocked = formId.startsWith("operator-") && operator.mutations?.enabled === false;
        form.querySelectorAll("input,select,textarea,button").forEach(el => { el.disabled = !editingEnabled || operatorLocked; });
      }
      for (const buttonId of ["desktop-open-world", "desktop-create-world", "desktop-reveal-world"]) {
        const button = byId(buttonId);
        if (!button) continue;
        button.disabled = !state.desktopShell;
      }
      byId("create-todo-starter").disabled = !editingEnabled || appReady;
      renderTutorialCard();
      renderTutorialOverlay();
      window.__witnessTutorial = {
        currentStepId: state.tutorialProgress?.stepId || null,
        currentChapterId: state.tutorialProgress?.chapterId || null,
        currentPage: tutorialStep()?.page || null,
        currentScopeKey: tutorialStepScope(tutorialStep())?.key || null,
        currentConceptIds: tutorialStepConcepts(tutorialStep()).map(concept => concept.id),
        revealedConceptIds: tutorialRevealedConcepts(state.tutorialProgress).map(concept => concept.id),
        suggestions: currentSuggestions.map(suggestion => ({ id: suggestion.id, title: suggestion.title, actionKind: suggestion.action?.kind || null })),
        replayScopeKey: tutorialReplayScopeKey(state.tutorialProgress),
        replayStepId: tutorialReplayStepId(state.tutorialProgress),
        completedAt: state.tutorialProgress?.completedAt || null,
        hidden: state.tutorialProgress?.hidden === true,
        disabledScopeKeys: tutorialDisabledScopeKeys(state.tutorialProgress),
        disabledContextIds: tutorialState.tutorialDisabledContextIds(state.tutorialProgress),
        disabledPages: tutorialDisabledPages(state.tutorialProgress),
        surfacePage: currentSurfacePage,
        surfaceStatus: tutorialSurfaceState().kind
      };
    };
    const widget = overrides => postJson("/api/widgets", overrides);
    const route = overrides => postJson("/api/routes", overrides);
    const serve = overrides => postJson("/api/serve-mounts", overrides);
    const program = overrides => postJson("/api/frontend-programs", overrides);
    const step = overrides => postJson("/api/frontend-steps", overrides);
    const backendProgram = overrides => postJson("/api/backend-programs", overrides);
    const backendProgramVersion = overrides => postJson("/api/backend-program-versions", overrides);
    const backendStep = overrides => postJson("/api/backend-steps", overrides);
    const activateBackendProgramVersion = ({ soul, version }) => postJson("/api/backend-program-versions/" + encodeURIComponent(soul) + "/activate", { version });
    const rollbackBackendProgramVersion = ({ soul }) => postJson("/api/backend-program-versions/" + encodeURIComponent(soul) + "/rollback", {});
    const runner = overrides => postJson("/api/server-runners", overrides);
    const contextCreate = overrides => postJson("/api/contexts", overrides);
    const perspectiveCreate = overrides => postJson("/api/perspectives", overrides);
    const stewardshipCreate = overrides => postJson("/api/stewardships", overrides);
    const proposalCreate = overrides => postJson("/api/proposals", overrides);
    const operatorAction = (url, body) => postJson(url, body);
    const runtimePluginProposalBody = ({ id, serverRunner, plugin, reason }, action) => ({
      id,
      targetProcess: "runtimePlugin." + action,
      targetKind: "serverRunner",
      targetId: serverRunner,
      bodyJson: JSON.stringify({ serverRunner, plugin }),
      reason: reason || ""
    });
    const mcpServerProposalBody = ({ id, serverId, label, serverRunner, context, serviceIdentity, transportsJson, reason }) => {
      const body = {
        id: serverId,
        label: label || serverId,
        serverRunner,
        transportsJson: transportsJson || '["stdio","http"]'
      };
      if (context) body.context = context;
      if (serviceIdentity) body.serviceIdentity = serviceIdentity;
      return {
        id,
        targetProcess: "mcpServer.define",
        targetKind: "serverRunner",
        targetId: serverRunner,
        bodyJson: JSON.stringify(body),
        reason: reason || ""
      };
    };
    const mcpToolProposalBody = ({ id, server, tool, actingMode, scopeContextsJson, scopeTargetsJson, reason }, action) => ({
      id,
      targetProcess: "mcpTool." + action,
      targetKind: "serverRunner",
      targetId: mcpServerRow(server)?.serverRunner || server,
      bodyJson: JSON.stringify({
        server,
        tool,
        actingMode: actingMode || "delegated",
        scopeContextsJson: scopeContextsJson || "[]",
        scopeTargetsJson: scopeTargetsJson || "[]"
      }),
      reason: reason || ""
    });

    async function createTodoStarter() {
      const model = state.model || {};
      const authored = state.bootstrapState || {};
      const backendHost = model.backendHosts?.[0]?.id || "backendHost";
      const frontendHost = model.frontendHosts?.[0]?.id || "frontendHost";
      for (const definition of blueprint.contexts || []) {
        const contextId = definition.id || "";
        if ((authored.contexts || []).some(row => row.id === contextId)) continue;
        await contextCreate({
          ...definition,
          owner: definition.owner === "frontendHost" ? frontendHost : (definition.owner === "backendHost" ? backendHost : definition.owner)
        });
      }
      if (!(authored.serverRunners || []).some(row => row.id === blueprint.runner.id)) {
        await runner({ ...blueprint.runner, backendHost, frontendHost });
      }
      for (const definition of blueprint.widgets) await widget(definition);
      for (const definition of blueprint.operatingWidgets || []) await widget(definition);
      await program({ ...blueprint.program });
      for (const definition of blueprint.operatingPrograms || []) await program({ ...definition });
      for (const definition of blueprint.backendPrograms || []) await backendProgram(definition);
      for (const definition of blueprint.backendProgramVersions || []) await backendProgramVersion(definition);
      for (const definition of blueprint.backendSteps || []) await backendStep(definition);
      for (const definition of blueprint.backendActivations || []) await activateBackendProgramVersion(definition);
      for (const definition of blueprint.steps) await step(definition);
      for (const definition of blueprint.operatingSteps || []) await step(definition);
      for (const definition of blueprint.routes) await route(definition);
      for (const definition of blueprint.operatingRoutes || []) await route(definition);
      for (const definition of blueprint.serves) await serve(definition);
    }

    const bindCreate = (formId, statusId, path, transform) => {
      byId(formId).addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        try {
          const data = transform(readForm(form));
          await postJson(path, data);
          setStatus(statusId, "Saved.");
          form.reset();
          await refresh();
        } catch (error) {
          setStatus(statusId, error.message);
        }
      });
    };
    const bindOperatorAction = (formId, statusId, path, transform, successText) => {
      byId(formId).addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        try {
          const data = transform(readForm(form));
          const result = await operatorAction(path, data);
          const restartRequired = result.restartRequired === true
            ? " Restart required to reload derived runtime state."
            : "";
          setStatus(statusId, successText + restartRequired);
          if (formId === "operator-backup-form" || formId === "operator-export-form") form.reset();
          await refresh();
        } catch (error) {
          setStatus(statusId, error.message);
        }
      });
    };

    byId("refresh-bootstrap").addEventListener("click", () => refresh().catch(error => setStatus("bootstrap-status", error.message)));
    byId("desktop-open-world").addEventListener("click", async () => {
      if (!desktopApi()) return;
      try {
        const result = await desktopApi().openWorldHome();
        if (result?.canceled) {
          setStatus("desktop-status", "Open world canceled.");
          return;
        }
        setStatus("desktop-status", "Switching to the selected world home.");
      } catch (error) {
        setStatus("desktop-status", error.message);
      }
    });
    byId("desktop-create-world").addEventListener("click", async () => {
      if (!desktopApi()) return;
      try {
        const result = await desktopApi().createWorldHome();
        if (result?.canceled) {
          setStatus("desktop-status", "Create world canceled.");
          return;
        }
        setStatus("desktop-status", "Switching to the new world home.");
      } catch (error) {
        setStatus("desktop-status", error.message);
      }
    });
    byId("desktop-reveal-world").addEventListener("click", async () => {
      if (!desktopApi()) return;
      try {
        const result = await desktopApi().revealWorldHome();
        setStatus("desktop-status", result?.ok === false ? (result.reason || "Unable to reveal world home.") : "Revealed current world home.");
      } catch (error) {
        setStatus("desktop-status", error.message);
      }
    });
    byId("identity-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        const editId = currentIdentityEditId();
        if (editId) {
          await postJson("/api/identities/" + encodeURIComponent(editId), data, "PATCH");
          setStatus("identity-status", "Identity updated.");
        } else {
          if (!data.id && data.username) data.id = "identity." + data.username.trim();
          await postJson("/api/identities", data);
          setStatus("identity-status", "Identity created.");
          form.reset();
        }
        await refresh();
      } catch (error) {
        setStatus("identity-status", error.message);
      }
    });
    byId("identity-create-new").addEventListener("click", () => {
      setIdentityEditId("");
      setStatus("identity-status", "");
      const form = byId("identity-form");
      form.reset();
      form.dataset.identityPrefillKey = "";
      render();
    });
    byId("session-form").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const data = readForm(event.currentTarget);
        const result = await postJson("/api/session", data);
        setStatus("bootstrap-status", "Signed in as " + result.label + ".");
        await refresh();
      } catch (error) {
        setStatus("bootstrap-status", error.message);
      }
    });
    byId("logout-session").addEventListener("click", async () => {
      try {
        await request("/api/session", { method: "DELETE" });
        setStatus("bootstrap-status", "Signed out.");
        await refresh();
      } catch (error) {
        setStatus("bootstrap-status", error.message);
      }
    });
    byId("create-todo-starter").addEventListener("click", async () => {
      setStatus("starter-status", "Creating minimal todo app...");
      try {
        await createTodoStarter();
        setStatus("starter-status", "Todo starter created. Open the app at / and inspect it at /world.");
        await refresh();
      } catch (error) {
        setStatus("starter-status", error.message);
      }
    });
    byId("open-app-link").addEventListener("click", async event => {
      const current = tutorialStep();
      event.preventDefault();
      await openAppHome(event.currentTarget.href, { advance: current?.id === "open-app" });
    });

    bindCreate("widget-form", "widget-status", "/api/widgets", data => ({
      ...data,
      attach: boolValue(data.attach),
      template: boolValue(data.template),
      order: data.order ? Number(data.order) : undefined,
      level: data.level ? Number(data.level) : undefined
    }));
    bindCreate("context-form", "context-status", "/api/contexts", data => data);
    bindCreate("perspective-form", "perspective-status", "/api/perspectives", data => data);
    bindCreate("context-binding-form", "context-binding-status", "/api/context-bindings", data => data);
    bindCreate("context-export-form", "context-export-status", "/api/context-exports", data => data);
    bindCreate("context-import-form", "context-import-status", "/api/context-imports", data => data);
    bindCreate("stewardship-form", "stewardship-status", "/api/stewardships", data => data);
    bindCreate("program-form", "program-status", "/api/frontend-programs", data => data);
    bindCreate("step-form", "step-status", "/api/frontend-steps", data => ({
      ...data,
      order: data.order ? Number(data.order) : undefined
    }));
    bindCreate("backend-program-form", "backend-program-status", "/api/backend-programs", data => data);
    bindCreate("backend-program-version-form", "backend-program-version-status", "/api/backend-program-versions", data => ({
      ...data,
      index: data.index ? Number(data.index) : undefined
    }));
    bindCreate("backend-step-form", "backend-step-status", "/api/backend-steps", data => ({
      ...data,
      order: data.order ? Number(data.order) : undefined
    }));
    byId("backend-program-activate-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/backend-program-versions/" + encodeURIComponent(data.soul || "") + "/activate", { version: data.version });
        setStatus("backend-program-activate-status", "Activated.");
        await refresh();
      } catch (error) {
        setStatus("backend-program-activate-status", error.message);
      }
    });
    byId("backend-program-rollback-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/backend-program-versions/" + encodeURIComponent(data.soul || "") + "/rollback", {});
        setStatus("backend-program-rollback-status", "Rolled back.");
        await refresh();
      } catch (error) {
        setStatus("backend-program-rollback-status", error.message);
      }
    });
    bindCreate("route-form", "route-status", "/api/routes", data => ({
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== "")),
      liveProjection: boolValue(data.liveProjection)
    }));
    bindCreate("serve-form", "serve-status", "/api/serve-mounts", data => data);
    bindCreate("runner-form", "runner-status", "/api/server-runners", data => data);
    bindCreate("runtime-plugin-install-form", "runtime-plugin-install-status", "/api/runtime-plugin-installs", data => data);
    bindCreate("mcp-server-form", "mcp-server-status", "/api/mcp-servers", data => ({
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== ""))
    }));
    bindCreate("mcp-tool-install-form", "mcp-tool-install-status", "/api/mcp-tool-installs", data => ({
      ...data,
      actingMode: data.actingMode || "delegated",
      scopeContextsJson: data.scopeContextsJson || "[]",
      scopeTargetsJson: data.scopeTargetsJson || "[]"
    }));
    bindCreate("capability-form", "capability-status", "/api/capabilities", data => data);
    bindCreate("capability-install-form", "capability-install-status", "/api/capability-installs", data => data);
    bindCreate("proposal-form", "proposal-status", "/api/proposals", data => data);
    bindOperatorAction("operator-backup-form", "operator-backup-status", "/api/operator/backups", data => ({
      label: data.label || "",
      includeDerived: boolValue(data.includeDerived)
    }), "Backup created.");
    bindOperatorAction("operator-export-form", "operator-export-status", "/api/operator/exports", data => ({
      label: data.label || ""
    }), "Export created.");
    bindOperatorAction("operator-restore-form", "operator-restore-status", "/api/operator/restores", data => ({
      artifactId: data.artifactId || "",
      preserveCurrent: boolValue(data.preserveCurrent)
    }), "World restored.");
    bindOperatorAction("operator-import-form", "operator-import-status", "/api/operator/imports", data => ({
      artifactId: data.artifactId || "",
      preserveCurrent: boolValue(data.preserveCurrent)
    }), "Artifact imported.");
    byId("context-binding-remove-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/context-bindings", data, "DELETE");
        setStatus("context-binding-remove-status", "Removed.");
        await refresh();
      } catch (error) {
        setStatus("context-binding-remove-status", error.message);
      }
    });
    byId("context-export-remove-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/context-exports", data, "DELETE");
        setStatus("context-export-remove-status", "Removed.");
        await refresh();
      } catch (error) {
        setStatus("context-export-remove-status", error.message);
      }
    });
    byId("context-import-remove-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/context-imports", data, "DELETE");
        setStatus("context-import-remove-status", "Removed.");
        await refresh();
      } catch (error) {
        setStatus("context-import-remove-status", error.message);
      }
    });
    byId("proposal-approve-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/proposals/" + encodeURIComponent(data.id) + "/approve", {});
        setStatus("proposal-approve-status", "Approved.");
        await refresh();
      } catch (error) {
        setStatus("proposal-approve-status", error.message);
      }
    });
    byId("proposal-reject-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/proposals/" + encodeURIComponent(data.id) + "/reject", { reason: data.reason || "" });
        setStatus("proposal-reject-status", "Rejected.");
        await refresh();
      } catch (error) {
        setStatus("proposal-reject-status", error.message);
      }
    });
    byId("stewardship-remove-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/stewardships", data, "DELETE");
        setStatus("stewardship-remove-status", "Removed.");
        await refresh();
      } catch (error) {
        setStatus("stewardship-remove-status", error.message);
      }
    });
    byId("capability-remove-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/capability-installs", data, "DELETE");
        setStatus("capability-remove-status", "Removed.");
        await refresh();
      } catch (error) {
        setStatus("capability-remove-status", error.message);
      }
    });
    byId("runtime-plugin-remove-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/runtime-plugin-installs", data, "DELETE");
        setStatus("runtime-plugin-remove-status", "Removed.");
        await refresh();
      } catch (error) {
        setStatus("runtime-plugin-remove-status", error.message);
      }
    });
    byId("mcp-tool-remove-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await postJson("/api/mcp-tool-installs", data, "DELETE");
        setStatus("mcp-tool-remove-status", "Removed.");
        await refresh();
      } catch (error) {
        setStatus("mcp-tool-remove-status", error.message);
      }
    });
    byId("runtime-plugin-install-proposal-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await proposalCreate(runtimePluginProposalBody(data, "install"));
        setStatus("runtime-plugin-install-proposal-status", "Saved.");
        form.reset();
        await refresh();
      } catch (error) {
        setStatus("runtime-plugin-install-proposal-status", error.message);
      }
    });
    byId("runtime-plugin-remove-proposal-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await proposalCreate(runtimePluginProposalBody(data, "remove"));
        setStatus("runtime-plugin-remove-proposal-status", "Saved.");
        form.reset();
        await refresh();
      } catch (error) {
        setStatus("runtime-plugin-remove-proposal-status", error.message);
      }
    });
    byId("mcp-server-proposal-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await proposalCreate(mcpServerProposalBody(data));
        setStatus("mcp-server-proposal-status", "Saved.");
        form.reset();
        await refresh();
      } catch (error) {
        setStatus("mcp-server-proposal-status", error.message);
      }
    });
    byId("mcp-tool-install-proposal-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await proposalCreate(mcpToolProposalBody(data, "install"));
        setStatus("mcp-tool-install-proposal-status", "Saved.");
        form.reset();
        await refresh();
      } catch (error) {
        setStatus("mcp-tool-install-proposal-status", error.message);
      }
    });
    byId("mcp-tool-remove-proposal-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = readForm(form);
        await proposalCreate(mcpToolProposalBody(data, "remove"));
        setStatus("mcp-tool-remove-proposal-status", "Saved.");
        form.reset();
        await refresh();
      } catch (error) {
        setStatus("mcp-tool-remove-proposal-status", error.message);
      }
    });
    byId("capability-install-kind").addEventListener("change", () => {
      refreshCapabilityTargetOptions("capability-install-kind", "capability-install-target");
      syncCapabilityHelp({
        capabilitySelectId: "capability-install-capability",
        kindSelectId: "capability-install-kind",
        targetSelectId: "capability-install-target",
        helpId: "capability-install-help",
        buttonFormId: "capability-install-form"
      });
    });
    byId("capability-remove-kind").addEventListener("change", () => {
      refreshCapabilityTargetOptions("capability-remove-kind", "capability-remove-target");
      syncCapabilityHelp({
        capabilitySelectId: "capability-remove-capability",
        kindSelectId: "capability-remove-kind",
        targetSelectId: "capability-remove-target",
        helpId: "capability-remove-help",
        buttonFormId: "capability-remove-form",
        requireInstalled: true
      });
    });
    byId("backend-program-version-soul").addEventListener("change", () => refreshBackendProgramVersionOptions("backend-program-version-soul", "backend-program-version-transition-from"));
    byId("backend-program-activate-soul").addEventListener("change", () => {
      refreshBackendProgramVersionOptions("backend-program-activate-soul", "backend-program-activate-version", { includeBlank: false });
      syncBackendProgramActivateHelp();
    });
    byId("context-binding-context").addEventListener("change", () => refreshContextBindingTargetOptions("context-binding-context", "context-binding-target"));
    byId("context-binding-remove-context").addEventListener("change", () => refreshContextBindingTargetOptions("context-binding-remove-context", "context-binding-remove-target"));
    byId("context-export-context").addEventListener("change", () => refreshContextExportTargetOptions("context-export-context", "context-export-target"));
    byId("context-export-remove-context").addEventListener("change", () => refreshContextExportTargetOptions("context-export-remove-context", "context-export-remove-target"));
    byId("context-import-source-context").addEventListener("change", () => refreshContextImportExportOptions("context-import-source-context", "context-import-export-name"));
    byId("context-import-remove-source-context").addEventListener("change", () => refreshContextImportExportOptions("context-import-remove-source-context", "context-import-remove-export-name"));
    byId("runtime-plugin-review-runner").addEventListener("change", async () => {
      try {
        await loadRuntimePluginReview(byId("runtime-plugin-review-runner")?.value || "");
        render();
      } catch (error) {
        setStatus("runtime-plugin-review-note", error.message);
      }
    });
    byId("runtime-plugin-review-plugin").addEventListener("change", () => {
      if (state.runtimePluginReview) state.runtimePluginReview.selectedPluginId = byId("runtime-plugin-review-plugin")?.value || "";
      renderRuntimePluginReviewDetail();
    });
    byId("backend-program-activate-version").addEventListener("change", syncBackendProgramActivateHelp);
    byId("backend-program-rollback-soul").addEventListener("change", syncBackendProgramRollbackHelp);
    for (const proposalFieldName of ["targetProcess", "targetKind", "targetId", "bodyJson"]) {
      formField(byId("proposal-form"), proposalFieldName).addEventListener(proposalFieldName === "bodyJson" ? "input" : "change", syncProposalHelp);
    }
    byId("proposal-approve-id").addEventListener("change", syncProposalApproveHelp);
    for (const [runnerSelectId, pluginSelectId, refreshOptions, helpId, formId, requireInstalled] of [
      ["runtime-plugin-install-runner", "runtime-plugin-install-plugin", refreshRuntimePluginInstallOptions, "runtime-plugin-install-help", "runtime-plugin-install-form", false],
      ["runtime-plugin-remove-runner", "runtime-plugin-remove-plugin", refreshRuntimePluginRemoveOptions, "runtime-plugin-remove-help", "runtime-plugin-remove-form", true],
      ["runtime-plugin-install-proposal-runner", "runtime-plugin-install-proposal-plugin", refreshRuntimePluginInstallOptions, "runtime-plugin-install-proposal-help", "runtime-plugin-install-proposal-form", false],
      ["runtime-plugin-remove-proposal-runner", "runtime-plugin-remove-proposal-plugin", refreshRuntimePluginRemoveOptions, "runtime-plugin-remove-proposal-help", "runtime-plugin-remove-proposal-form", true]
    ]) {
      byId(runnerSelectId).addEventListener("change", () => {
        refreshOptions(runnerSelectId, pluginSelectId);
        syncRuntimePluginHelp({ runnerSelectId, pluginSelectId, helpId, buttonFormId: formId, requireInstalled });
      });
      byId(pluginSelectId).addEventListener("change", () => {
        syncRuntimePluginHelp({ runnerSelectId, pluginSelectId, helpId, buttonFormId: formId, requireInstalled });
      });
    }
    for (const [capabilitySelectId, kindSelectId, targetSelectId, helpId, formId, requireInstalled] of [
      ["capability-install-capability", "capability-install-kind", "capability-install-target", "capability-install-help", "capability-install-form", false],
      ["capability-remove-capability", "capability-remove-kind", "capability-remove-target", "capability-remove-help", "capability-remove-form", true]
    ]) {
      byId(capabilitySelectId).addEventListener("change", () => {
        syncCapabilityHelp({ capabilitySelectId, kindSelectId, targetSelectId, helpId, buttonFormId: formId, requireInstalled });
      });
      byId(targetSelectId).addEventListener("change", () => {
        syncCapabilityHelp({ capabilitySelectId, kindSelectId, targetSelectId, helpId, buttonFormId: formId, requireInstalled });
      });
    }
    for (const [formId, runnerSelectId, helpId] of [
      ["mcp-server-form", "mcp-server-runner", "mcp-server-help"],
      ["mcp-server-proposal-form", "mcp-server-proposal-runner", "mcp-server-proposal-help"]
    ]) {
      byId(runnerSelectId).addEventListener("change", () => {
        syncMcpServerHelp({
          formId,
          runnerSelectId,
          helpId,
          serviceIdentityFieldName: "serviceIdentity",
          transportsFieldName: "transportsJson"
        });
      });
      formField(byId(formId), "serviceIdentity").addEventListener("input", () => {
        syncMcpServerHelp({
          formId,
          runnerSelectId,
          helpId,
          serviceIdentityFieldName: "serviceIdentity",
          transportsFieldName: "transportsJson"
        });
      });
      formField(byId(formId), "transportsJson").addEventListener("input", () => {
        syncMcpServerHelp({
          formId,
          runnerSelectId,
          helpId,
          serviceIdentityFieldName: "serviceIdentity",
          transportsFieldName: "transportsJson"
        });
      });
    }
    for (const [serverSelectId, toolSelectId, actingModeSelectId, helpId, formId, removeMode] of [
      ["mcp-tool-install-server", "mcp-tool-install-tool", "mcp-tool-install-acting-mode", "mcp-tool-install-help", "mcp-tool-install-form", false],
      ["mcp-tool-remove-server", "mcp-tool-remove-tool", null, "mcp-tool-remove-help", "mcp-tool-remove-form", true],
      ["mcp-tool-install-proposal-server", "mcp-tool-install-proposal-tool", "mcp-tool-install-proposal-acting-mode", "mcp-tool-install-proposal-help", "mcp-tool-install-proposal-form", false],
      ["mcp-tool-remove-proposal-server", "mcp-tool-remove-proposal-tool", null, "mcp-tool-remove-proposal-help", "mcp-tool-remove-proposal-form", true]
    ]) {
      byId(serverSelectId).addEventListener("change", () => {
        if (removeMode) refreshMcpToolRemoveOptions(serverSelectId, toolSelectId);
        else refreshMcpToolInstallOptions(serverSelectId, toolSelectId);
        if (removeMode) syncMcpToolRemoveHelp({ serverSelectId, toolSelectId, helpId, buttonFormId: formId });
        else syncMcpToolInstallHelp({ serverSelectId, toolSelectId, actingModeSelectId, helpId, buttonFormId: formId });
      });
      byId(toolSelectId).addEventListener("change", () => {
        if (removeMode) syncMcpToolRemoveHelp({ serverSelectId, toolSelectId, helpId, buttonFormId: formId });
        else syncMcpToolInstallHelp({ serverSelectId, toolSelectId, actingModeSelectId, helpId, buttonFormId: formId });
      });
      if (actingModeSelectId) {
        byId(actingModeSelectId).addEventListener("change", () => {
          syncMcpToolInstallHelp({ serverSelectId, toolSelectId, actingModeSelectId, helpId, buttonFormId: formId });
        });
      }
    }
    for (const routeFieldId of ["route-handler", "route-method", "route-backend-program-soul", "route-root-widget"]) {
      byId(routeFieldId).addEventListener("change", updateRouteAuthoringFields);
    }
    bindTutorialInteractions();
    refresh().catch(error => setStatus("bootstrap-status", error.message));
  })();
  </script>
</body>
</html>`;
}

export function bootstrapSummary(model = {}) {
  return {
    appReady: model.appReady === true,
    homeReason: model.appReady === true ? "reachable home route" : (model.homeReason || "bootstrap fallback active")
  };
}
