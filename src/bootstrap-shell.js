import { TODO_TUTORIAL_ID } from "./tutorials.js";
import { bootstrapTutorialPageData } from "./tutorial-runtime-ui.js";
import {
  renderBootstrapTutorialStyles,
  renderBootstrapTutorialCard,
  renderBootstrapTutorialOverlay
} from "./tutorial-bootstrap-ui.js";
import { renderBootstrapTutorialStateFactory } from "./tutorial-bootstrap-client.js";
import { renderBootstrapTutorialControllerFactory } from "./tutorial-bootstrap-controller-client.js";

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
            <div class="actions"><button type="submit">Create Proposal</button></div>
          </form>
          <p class="status" id="proposal-status"></p>

          <form id="proposal-approve-form" class="stack">
            <div class="grid two">
              <label>Open Proposal<select id="proposal-approve-id" name="id"></select></label>
              <label></label>
            </div>
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
              <label>Root Widget<select id="route-root-widget" name="rootWidget" data-tutorial-target="route-root-widget"></select></label>
              <label>Root Widget Ref<input name="rootWidgetRef" placeholder="context name" /></label>
            </div>
            <div class="grid two">
              <label>Frontend Program<select id="route-frontend-program" name="frontendProgram" data-tutorial-target="route-frontend-program"></select></label>
              <label></label>
            </div>
            <label><span class="kicker">Live Projection</span><input name="liveProjection" type="checkbox" checked data-tutorial-target="route-live-projection" /></label>
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
          <p class="status" id="capability-install-status"></p>

          <form id="capability-remove-form" class="stack">
            <div class="grid two">
              <label>Capability<select id="capability-remove-capability" name="capability"></select></label>
              <label>Target Kind<select id="capability-remove-kind" name="targetKind"></select></label>
            </div>
            <label>Target<select id="capability-remove-target" name="target"></select></label>
            <div class="actions"><button type="submit" class="secondary">Remove Capability</button></div>
          </form>
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
    const state = { model: null, bootstrapState: null, session: null, tutorialProgress: null };
    const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
    const autoCompletableChapters = new Set(["widgets", "program", "routes"]);
    const stateSnapshots = new Map();
    const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const byId = id => document.getElementById(id);
    const byTarget = target => document.querySelector('[data-tutorial-target="' + CSS.escape(target) + '"]');
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
    const capabilityTargetsFor = kind => {
      const targets = state.model?.capabilityTargets || {};
      if (kind === "context") return targets.contexts || [];
      if (kind === "serverRunner") return targets.serverRunners || [];
      if (kind === "routePage") return targets.routePages || [];
      return [];
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
      tutorialReplayStepId,
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
      state.model = await request("/api/bootstrap-model");
      state.bootstrapState = await request("/api/bootstrap-state");
      state.session = await request("/api/session");
      await loadTutorialProgress();
      render();
      await requestMaybeAdvanceTutorial();
      render();
    };
    const render = () => {
      const model = state.model || {};
      const authored = state.bootstrapState || {};
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
      byId("session-summary").textContent = session.authenticated
        ? "Signed in as " + session.label + " (" + session.actor + ")" + (session.homeContext ? " / " + session.homeContext : "") + (session.perspective ? " in " + session.perspective : "")
        : ((authored.identities || []).length ? "Sign in to continue editing the bootstrap seam." : "No identities yet. Create the first identity to continue.");

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
      fillSelect("route-root-widget", authored.widgets || [], x => x.id, x => x.id);
      fillSelect("route-frontend-program", authored.frontendPrograms || [], x => x.id, x => x.id);
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
      refreshCapabilityTargetOptions("capability-install-kind", "capability-install-target");
      refreshCapabilityTargetOptions("capability-remove-kind", "capability-remove-target");
      refreshContextBindingTargetOptions("context-binding-context", "context-binding-target");
      refreshContextBindingTargetOptions("context-binding-remove-context", "context-binding-remove-target");
      refreshContextExportTargetOptions("context-export-context", "context-export-target");
      refreshContextExportTargetOptions("context-export-remove-context", "context-export-remove-target");
      refreshContextImportExportOptions("context-import-source-context", "context-import-export-name");
      refreshContextImportExportOptions("context-import-remove-source-context", "context-import-remove-export-name");

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
      renderStateList("state-routes", authored.routes || [], row => row.id + " " + row.method + " " + row.path);
      renderStateList("state-serves", authored.servedRoutes || [], row => row.serverRunner + " -> " + row.id);
      renderStateList("state-runners", authored.serverRunners || [], row => row.id + (row.handlerSet ? " [" + row.handlerSet + "]" : ""));
      renderStateList("state-capabilities", authored.capabilityCatalog || [], row => row.id + (row.placement?.length ? " -> " + row.placement.join(", ") : ""));
      renderStateList("state-capability-installs", authored.capabilityInstalls || [], row => row.targetKind + " " + row.target + " -> " + row.capability);

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
      for (const formId of ["context-form", "perspective-form", "context-binding-form", "context-binding-remove-form", "context-export-form", "context-export-remove-form", "context-import-form", "context-import-remove-form", "stewardship-form", "stewardship-remove-form", "proposal-form", "proposal-approve-form", "proposal-reject-form", "widget-form", "program-form", "step-form", "route-form", "serve-form", "runner-form", "capability-form", "capability-install-form", "capability-remove-form"]) {
        const form = byId(formId);
        if (!form) continue;
        form.querySelectorAll("input,select,textarea,button").forEach(el => { el.disabled = !editingEnabled; });
      }
      byId("create-todo-starter").disabled = !editingEnabled || appReady;
      renderTutorialCard();
      renderTutorialOverlay();
      window.__witnessTutorial = {
        currentStepId: state.tutorialProgress?.stepId || null,
        currentChapterId: state.tutorialProgress?.chapterId || null,
        currentPage: tutorialStep()?.page || null,
        currentConceptIds: tutorialStepConcepts(tutorialStep()).map(concept => concept.id),
        revealedConceptIds: tutorialRevealedConcepts(state.tutorialProgress).map(concept => concept.id),
        suggestions: currentSuggestions.map(suggestion => ({ id: suggestion.id, title: suggestion.title, actionKind: suggestion.action?.kind || null })),
        replayStepId: tutorialReplayStepId(state.tutorialProgress),
        completedAt: state.tutorialProgress?.completedAt || null,
        hidden: state.tutorialProgress?.hidden === true,
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
    const runner = overrides => postJson("/api/server-runners", overrides);
    const contextCreate = overrides => postJson("/api/contexts", overrides);
    const perspectiveCreate = overrides => postJson("/api/perspectives", overrides);
    const stewardshipCreate = overrides => postJson("/api/stewardships", overrides);
    const proposalCreate = overrides => postJson("/api/proposals", overrides);

    async function createTodoStarter() {
      const model = state.model || {};
      const authored = state.bootstrapState || {};
      const backendHost = model.backendHosts?.[0]?.id || "backendHost";
      const frontendHost = model.frontendHosts?.[0]?.id || "frontendHost";
      if (!(authored.serverRunners || []).some(row => row.id === blueprint.runner.id)) {
        await runner({ ...blueprint.runner, backendHost, frontendHost });
      }
      for (const definition of blueprint.widgets) await widget(definition);
      for (const definition of blueprint.operatingWidgets || []) await widget(definition);
      await program({ ...blueprint.program });
      for (const definition of blueprint.operatingPrograms || []) await program({ ...definition });
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

    byId("refresh-bootstrap").addEventListener("click", () => refresh().catch(error => setStatus("bootstrap-status", error.message)));
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
    bindCreate("route-form", "route-status", "/api/routes", data => ({
      ...data,
      liveProjection: boolValue(data.liveProjection)
    }));
    bindCreate("serve-form", "serve-status", "/api/serve-mounts", data => data);
    bindCreate("runner-form", "runner-status", "/api/server-runners", data => data);
    bindCreate("capability-form", "capability-status", "/api/capabilities", data => data);
    bindCreate("capability-install-form", "capability-install-status", "/api/capability-installs", data => data);
    bindCreate("proposal-form", "proposal-status", "/api/proposals", data => data);
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
    byId("capability-install-kind").addEventListener("change", () => refreshCapabilityTargetOptions("capability-install-kind", "capability-install-target"));
    byId("capability-remove-kind").addEventListener("change", () => refreshCapabilityTargetOptions("capability-remove-kind", "capability-remove-target"));
    byId("context-binding-context").addEventListener("change", () => refreshContextBindingTargetOptions("context-binding-context", "context-binding-target"));
    byId("context-binding-remove-context").addEventListener("change", () => refreshContextBindingTargetOptions("context-binding-remove-context", "context-binding-remove-target"));
    byId("context-export-context").addEventListener("change", () => refreshContextExportTargetOptions("context-export-context", "context-export-target"));
    byId("context-export-remove-context").addEventListener("change", () => refreshContextExportTargetOptions("context-export-remove-context", "context-export-remove-target"));
    byId("context-import-source-context").addEventListener("change", () => refreshContextImportExportOptions("context-import-source-context", "context-import-export-name"));
    byId("context-import-remove-source-context").addEventListener("change", () => refreshContextImportExportOptions("context-import-remove-source-context", "context-import-remove-export-name"));
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
