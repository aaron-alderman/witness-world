import { TODO_TUTORIAL_ID, todoStarterBlueprint, todoTutorialDefinition } from "./tutorials.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderBootstrapPage() {
  const tutorial = todoTutorialDefinition();
  const blueprint = todoStarterBlueprint();
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
    .tutorial-concept-list { display: grid; gap: 8px; margin-top: 8px; }
    .tutorial-concept { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: rgba(255,255,255,.72); }
    .tutorial-concept strong { display: block; margin-bottom: 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); font-family: var(--mono); }
    .tutorial-concept span { display: block; font-size: 13px; line-height: 1.45; color: var(--muted); }
    .tutorial-suggestion-list { display: grid; gap: 10px; margin-top: 8px; }
    .tutorial-suggestion { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: rgba(255,255,255,.82); display: grid; gap: 8px; }
    .tutorial-suggestion strong { display: block; font-size: 14px; color: var(--ink); }
    .tutorial-suggestion p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
    .tutorial-disabled-list { display: grid; gap: 10px; margin-top: 8px; }
    .tutorial-disabled-item { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: rgba(255,255,255,.82); display: grid; gap: 8px; }
    .tutorial-disabled-item strong { display: block; font-size: 14px; color: var(--ink); }
    .tutorial-disabled-item p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
    [data-tutorial-focus-scope="true"], [data-tutorial-current] { position: relative; z-index: 7; }
    [data-tutorial-current] { outline: 3px solid var(--accent); outline-offset: 4px; border-radius: 8px; scroll-margin-top: 130px; animation: tutorial-focus-pulse 1.35s ease-in-out infinite; }
    [data-tutorial-changed="true"] { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(122, 77, 42, .18); animation: tutorial-changed-pulse 1.15s ease-in-out 2; }
    [data-tutorial-changed="true"] strong { animation: tutorial-text-pulse 1.15s ease-in-out 2; }
    #tutorial-dimmer { position: fixed; inset: 0; z-index: 5; background: rgba(31, 27, 23, .44); backdrop-filter: blur(2px); pointer-events: none; }
    #tutorial-overlay { position: fixed; width: 360px; max-width: calc(100vw - 24px); z-index: 8; background: rgba(255,253,248,.98); border: 1px solid var(--line); border-radius: 16px; padding: 16px; box-shadow: 0 16px 40px rgba(35, 21, 8, .2); pointer-events: none; }
    #tutorial-overlay h3 { margin: 0 0 8px; font-size: 1.05rem; }
    #tutorial-overlay p { margin: 0 0 10px; font-size: 14px; line-height: 1.5; color: var(--muted); }
    #tutorial-overlay .tutorial-meta { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }
    #tutorial-overlay button, #tutorial-overlay-handle { pointer-events: auto; }
    #tutorial-overlay-handle { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin: -4px -4px 10px; padding: 4px; cursor: grab; user-select: none; }
    #tutorial-overlay-handle:active { cursor: grabbing; }
    .tutorial-handle-copy { min-width: 0; }
    .tutorial-handle-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); font-family: var(--mono); }
    .tutorial-handle-grip { color: var(--muted); font-size: 18px; line-height: 1; padding-top: 2px; }
    .tutorial-click-pulse { position: fixed; width: 22px; height: 22px; margin-left: -11px; margin-top: -11px; border-radius: 999px; border: 2px solid rgba(122, 77, 42, .65); background: rgba(122, 77, 42, .12); z-index: 9; pointer-events: none; animation: tutorial-click-pulse .55s ease-out forwards; }
    .tutorial-auto-click { animation: tutorial-button-click .5s ease-out; }
    .tutorial-hidden { display: none !important; }
    body.tutorial-dragging { user-select: none; }
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
      <article class="card" id="tutorial-card" data-tutorial-target="tutorial-card">
        <div class="badge">Guided Tutorial</div>
        <h2>Build The Todo App From Scratch</h2>
        <p>This tutorial uses the real bootstrap builders and the real runtime. It teaches identities, runner wiring, widgets, programs, routes, mounts, and then continues into the live app to exercise real behavior.</p>
        <div class="chapter-list" id="tutorial-chapters"></div>
        <p class="muted" id="tutorial-summary">Loading tutorial status...</p>
        <div class="grid two">
          <div>
            <div class="kicker">Current Concepts</div>
            <div class="tutorial-concept-list" id="tutorial-current-concepts"></div>
          </div>
          <div>
            <div class="kicker">Revealed Concepts</div>
            <div class="tutorial-concept-list" id="tutorial-revealed-concepts"></div>
          </div>
        </div>
        <div>
          <div class="kicker">Suggested Next Moves</div>
          <div class="tutorial-suggestion-list" id="tutorial-suggestions"></div>
        </div>
        <div>
          <div class="kicker">Disabled Guidance Surfaces</div>
          <div class="tutorial-disabled-list" id="tutorial-disabled-pages"></div>
        </div>
        <div class="actions">
          <button type="button" id="tutorial-start">Start Tutorial</button>
          <button type="button" id="tutorial-resume" class="secondary">Resume Tutorial</button>
          <button type="button" id="tutorial-restart-chapter" class="secondary">Restart Chapter</button>
          <button type="button" id="tutorial-restart-from-here" class="secondary">Restart From Here</button>
          <button type="button" id="tutorial-back" class="secondary">Back</button>
          <button type="button" id="tutorial-skip" class="secondary">Skip Chapter</button>
          <button type="button" id="tutorial-disable-page" class="secondary">Disable On This Page</button>
          <button type="button" id="tutorial-exit" class="secondary">Exit</button>
          <button type="button" id="tutorial-reset" class="secondary">Reset Tutorial</button>
        </div>
        <p class="status" id="tutorial-status"></p>
      </article>

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
  <div id="tutorial-dimmer" class="tutorial-hidden" aria-hidden="true"></div>
  <aside id="tutorial-overlay" class="tutorial-hidden" aria-live="polite">
    <div id="tutorial-overlay-handle">
      <div class="tutorial-handle-copy">
        <div class="tutorial-meta" id="tutorial-overlay-meta"></div>
        <div class="tutorial-handle-kicker">Drag tutorial window</div>
      </div>
      <div class="tutorial-handle-grip" aria-hidden="true">::</div>
    </div>
    <h3 id="tutorial-overlay-title"></h3>
    <p id="tutorial-overlay-body"></p>
    <div class="tutorial-concept-list" id="tutorial-overlay-concepts"></div>
    <div class="actions">
      <button type="button" id="tutorial-next">Next</button>
      <button type="button" class="secondary" id="tutorial-restart-current">Restart Chapter</button>
      <button type="button" class="secondary" id="tutorial-replay-current">Restart From Here</button>
      <button type="button" class="secondary" id="tutorial-finish-chapter">Finish Chapter For Me</button>
      <button type="button" class="secondary" id="tutorial-disable-current-page">Disable On This Page</button>
      <button type="button" class="secondary" id="tutorial-overlay-resume">Resume</button>
    </div>
  </aside>
  <script>
  (() => {
    const tutorial = ${jsonForScript(tutorial)};
    const blueprint = ${jsonForScript(blueprint)};
    const currentSurfacePage = "bootstrap";
    const localProgressKey = "witness.tutorial." + tutorial.id;
    const state = { model: null, bootstrapState: null, session: null, tutorialProgress: null };
    const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
    const autoCompletableChapters = new Set(["widgets", "program", "routes"]);
    const stateSnapshots = new Map();
    const pulseTimers = new WeakMap();
    const overlayDrag = { active: false, manual: false, left: 24, top: 24, offsetX: 0, offsetY: 0 };
    let lastRenderedStepId = null;
    let tutorialAutoRunning = false;
    let activeFocusScope = null;
    let activeHighlightTarget = null;
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
    const tutorialStep = () => tutorial.steps.find(step => step.id === state.tutorialProgress?.stepId) || null;
    const revealTarget = target => {
      let current = target?.parentElement || null;
      while (current) {
        if (current.tagName === "DETAILS") current.open = true;
        current = current.parentElement;
      }
    };
    const previousTutorialStep = () => {
      const index = stepIndex.get(state.tutorialProgress?.stepId ?? "") ?? -1;
      return index > 0 ? tutorial.steps[index - 1] : null;
    };
    const firstTutorialStepInChapter = chapterId => tutorial.steps.find(step => step.chapterId === chapterId) || null;
    const nextTutorialStep = () => {
      const index = stepIndex.get(state.tutorialProgress?.stepId ?? "") ?? -1;
      return index >= 0 ? (tutorial.steps[index + 1] || null) : (tutorial.steps[0] || null);
    };
    const currentStepIndex = progress => stepIndex.get(progress?.stepId ?? "") ?? -1;
    const currentSuggestions = [];
    const conceptMap = new Map((tutorial.concepts || []).map(concept => [concept.id, concept]));
    const knownTutorialPages = [...new Set(tutorial.steps.map(step => typeof step.page === "string" ? step.page : "").filter(Boolean))];
    const tutorialDisabledPages = progress => [...new Set((Array.isArray(progress?.disabledPages) ? progress.disabledPages : []).map(String).filter(page => knownTutorialPages.includes(page)))];
    const tutorialReplayStepId = progress => {
      const id = typeof progress?.replayStepId === "string" ? progress.replayStepId : "";
      return tutorial.steps.some(step => step.id === id) ? id : null;
    };
    const tutorialPageLabel = page => page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
    const tutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => conceptMap.get(id)).filter(Boolean);
    const tutorialRevealedConcepts = progress => {
      const lastIndex = progress?.completedAt ? ((tutorial.steps?.length || 1) - 1) : currentStepIndex(progress);
      if (lastIndex < 0) return [];
      const conceptIds = [];
      for (const step of tutorial.steps.slice(0, lastIndex + 1)) {
        for (const concept of tutorialStepConcepts(step)) {
          if (!conceptIds.includes(concept.id)) conceptIds.push(concept.id);
        }
      }
      return conceptIds.map(id => conceptMap.get(id)).filter(Boolean);
    };
    const tutorialSurfaceState = () => {
      const progress = state.tutorialProgress;
      const current = tutorialStep();
      if (!progress || !current) return { kind: "idle", page: null };
      if (progress.completedAt) return { kind: "completed", page: current.page || null };
      if (progress.hidden) return { kind: "hidden", page: current.page || null };
      if ((current.page || null) !== currentSurfacePage) return { kind: "offpage", page: current.page || null };
      if (tutorialDisabledPages(progress).includes(currentSurfacePage)) return { kind: "disabled", page: current.page || null };
      return { kind: "active", page: current.page || null };
    };
    const clearTutorialPageDisabled = (progress, page = currentSurfacePage) => ({
      ...progress,
      disabledPages: tutorialDisabledPages(progress).filter(candidate => candidate !== page)
    });
    const disableTutorialOnCurrentPage = progress => ({
      ...progress,
      hidden: false,
      disabledPages: [...new Set([...tutorialDisabledPages(progress), currentSurfacePage])]
    });
    const mergeProgress = (localProgress, remoteProgress) => {
      if (!localProgress) return remoteProgress || null;
      if (!remoteProgress) return localProgress || null;
      if (localProgress.completedAt && !remoteProgress.completedAt) return localProgress;
      if (remoteProgress.completedAt && !localProgress.completedAt) return remoteProgress;
      const localIndex = currentStepIndex(localProgress);
      const remoteIndex = currentStepIndex(remoteProgress);
      if (localIndex > remoteIndex) return localProgress;
      if (remoteIndex > localIndex) return remoteProgress;
      const merged = localProgress.hidden === false && remoteProgress.hidden === true ? localProgress : remoteProgress;
      return {
        ...merged,
        disabledPages: [...new Set([...tutorialDisabledPages(localProgress), ...tutorialDisabledPages(remoteProgress)])],
        replayStepId: tutorialReplayStepId(localProgress) || tutorialReplayStepId(remoteProgress) || null
      };
    };
    const readLocalProgress = () => {
      try {
        const raw = localStorage.getItem(localProgressKey);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };
    const writeLocalProgress = progress => {
      if (!progress) localStorage.removeItem(localProgressKey);
      else localStorage.setItem(localProgressKey, JSON.stringify(progress));
    };
    const tutorialApi = async (method, body = null) => {
      const options = { method };
      if (body != null) {
        options.headers = { "content-type": "application/json" };
        options.body = JSON.stringify(body);
      }
      return request("/api/tutorial-progress/" + encodeURIComponent(tutorial.id), options);
    };
    const persistTutorialProgress = async progress => {
      state.tutorialProgress = progress;
      if (!progress) {
        writeLocalProgress(null);
        if (state.session?.authenticated) await tutorialApi("DELETE");
        return;
      }
      if (state.session?.authenticated) {
        await tutorialApi("PUT", progress);
        writeLocalProgress(null);
      } else {
        writeLocalProgress(progress);
      }
    };
    const loadTutorialProgress = async () => {
      const localProgress = readLocalProgress();
      const remote = state.session?.authenticated ? await tutorialApi("GET").catch(() => ({ progress: null })) : { progress: null };
      const merged = mergeProgress(localProgress, remote.progress);
      state.tutorialProgress = merged;
      if (state.session?.authenticated && merged) {
        await tutorialApi("PUT", merged).catch(() => {});
        writeLocalProgress(null);
      }
    };
    const defaultProgress = () => ({
      tutorialId: tutorial.id,
      chapterId: tutorial.steps[0]?.chapterId || null,
      stepId: tutorial.steps[0]?.id || null,
      chapterStatus: tutorial.steps.length ? "in_progress" : "idle",
      draftInputs: {},
      completedAt: null,
      hidden: false,
      disabledPages: [],
      replayStepId: null
    });
    const restartCurrentChapter = async () => {
      const chapterId = state.tutorialProgress?.chapterId || tutorialStep()?.chapterId || null;
      const first = firstTutorialStepInChapter(chapterId);
      if (!state.tutorialProgress || !first) return;
      await persistTutorialProgress({
        ...state.tutorialProgress,
        chapterId: first.chapterId,
        stepId: first.id,
        chapterStatus: "in_progress",
        draftInputs: {},
        completedAt: null,
        hidden: false,
        replayStepId: null
      });
      render();
    };
    const restartFromHere = async () => {
      const current = tutorialStep();
      if (!state.tutorialProgress || !current) return;
      await persistTutorialProgress({
        ...state.tutorialProgress,
        chapterId: current.chapterId,
        stepId: current.id,
        chapterStatus: "in_progress",
        draftInputs: {},
        completedAt: null,
        hidden: false,
        replayStepId: current.id
      });
      render();
    };
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
    const setFieldValue = (field, value) => {
      if (!field) return;
      if (field.type === "checkbox") field.checked = value === true;
      else field.value = value == null ? "" : String(value);
    };
    const fillForm = (target, payload) => {
      revealTarget(target);
      const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
      if (!form || !payload) return;
      for (const [key, value] of Object.entries(payload)) {
        const field = formField(form, key);
        if (!field) continue;
        setFieldValue(field, value);
        pulseNode(field, 960);
      }
    };
    const focusTutorialTarget = targetName => {
      const target = byTarget(targetName);
      if (!target) return false;
      revealTarget(target);
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      pulseNode(target, 1200);
      const focusable = target.matches?.("input,select,textarea,button,a,summary")
        ? target
        : target.querySelector?.("input,select,textarea,button,a,summary,[tabindex]");
      focusable?.focus?.({ preventScroll: true });
      return true;
    };
    const renderConceptList = (id, concepts, emptyText) => {
      const root = byId(id);
      if (!root) return;
      root.innerHTML = "";
      if (!concepts.length) {
        const empty = document.createElement("div");
        empty.className = "tutorial-concept";
        const label = document.createElement("span");
        label.textContent = emptyText;
        empty.append(label);
        root.append(empty);
        return;
      }
      for (const concept of concepts) {
        const item = document.createElement("div");
        item.className = "tutorial-concept";
        const title = document.createElement("strong");
        title.textContent = concept.label;
        const summary = document.createElement("span");
        summary.textContent = concept.summary;
        item.append(title, summary);
        root.append(item);
      }
    };
    const setSuggestionRows = suggestions => {
      currentSuggestions.splice(0, currentSuggestions.length, ...suggestions);
      const root = byId("tutorial-suggestions");
      if (!root) return;
      root.innerHTML = "";
      if (!suggestions.length) {
        const empty = document.createElement("div");
        empty.className = "tutorial-suggestion";
        const copy = document.createElement("p");
        copy.textContent = "No extra curation yet. The visible controls remain the source of truth.";
        empty.append(copy);
        root.append(empty);
        return;
      }
      for (const suggestion of suggestions) {
        const item = document.createElement("div");
        item.className = "tutorial-suggestion";
        const title = document.createElement("strong");
        title.textContent = suggestion.title;
        const body = document.createElement("p");
        body.textContent = suggestion.body;
        const actions = document.createElement("div");
        actions.className = "actions";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.dataset.suggestionId = suggestion.id;
        button.textContent = suggestion.buttonLabel;
        actions.append(button);
        item.append(title, body, actions);
        root.append(item);
      }
    };
    const tutorialDisabledPageRows = progress => {
      const current = tutorialStep();
      return tutorialDisabledPages(progress).map(page => ({
        page,
        label: tutorialPageLabel(page),
        currentStepTitle: current?.page === page ? current.title : null,
        isCurrentSurface: page === currentSurfacePage
      }));
    };
    const setDisabledPageRows = rows => {
      const root = byId("tutorial-disabled-pages");
      if (!root) return;
      root.innerHTML = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "tutorial-disabled-item";
        const body = document.createElement("p");
        body.textContent = "No guidance surfaces are currently disabled.";
        empty.append(body);
        root.append(empty);
        return;
      }
      for (const row of rows) {
        const item = document.createElement("div");
        item.className = "tutorial-disabled-item";
        const title = document.createElement("strong");
        title.textContent = row.label;
        const body = document.createElement("p");
        body.textContent = row.currentStepTitle
          ? ("Current step there: " + row.currentStepTitle + ".")
          : "Guidance is disabled on this surface, but you can re-enable it without losing progress.";
        const actions = document.createElement("div");
        actions.className = "actions";
        const enableButton = document.createElement("button");
        enableButton.type = "button";
        enableButton.className = "secondary";
        enableButton.dataset.disabledEnable = row.page;
        enableButton.textContent = row.isCurrentSurface ? "Enable Here" : "Enable Guidance";
        actions.append(enableButton);
        if (!row.isCurrentSurface) {
          const openButton = document.createElement("button");
          openButton.type = "button";
          openButton.className = "secondary";
          openButton.dataset.disabledOpen = row.page;
          openButton.textContent = "Open " + row.label;
          actions.append(openButton);
        }
        item.append(title, body, actions);
        root.append(item);
      }
    };
    const tutorialSuggestions = () => {
      const suggestions = [];
      const current = tutorialStep();
      const progress = state.tutorialProgress;
      const surface = tutorialSurfaceState();
      const appReady = state.model?.appReady === true;
      const identityCount = (state.bootstrapState?.identities || []).length;
      const add = (id, title, body, buttonLabel, action) => suggestions.push({ id, title, body, buttonLabel, action });
      if (!progress) {
        add("start-tutorial", "Start The Guided Build", "Follow the same real bootstrap and app surfaces step by step.", "Start Tutorial", { kind: "startTutorial" });
        if (!identityCount) {
          add("create-first-identity", "Create The First Identity", "A real actor is the first boundary. The identity form below is the next concrete move.", "Show Identity Form", { kind: "focusTarget", target: "identity-form" });
        } else if (!state.session?.authenticated) {
          add("sign-in", "Sign In To Keep Editing", "Identities already exist, so bootstrap writes now go through the normal session path.", "Show Session Form", { kind: "focusTarget", target: "session-form" });
        } else if (!appReady) {
          add("starter-shortcut", "Use The Fast Path Or Keep Building", "The starter shortcut uses the same authored structures as the tutorial. You can inspect or trigger it directly.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
        } else {
          add("open-live-app", "Open The Live App", "A served home route exists now, so the next truthful move is to use the app boundary itself.", "Open App", { kind: "openApp" });
        }
        return suggestions;
      }
      if (progress.completedAt) {
        if (appReady) {
          add("open-live-app", "Open The Live App", "The tutorial is complete and the route is live. Use the app directly.", "Open App", { kind: "openApp" });
        }
        add("inspect-authored-state", "Inspect The Authored World", "The bootstrap state panel shows the exact authored structures the tutorial built.", "Show Authored State", { kind: "focusTarget", target: "authored-state" });
        return suggestions;
      }
      if (surface.kind === "hidden") {
        add("resume-tutorial", "Resume The Current Tutorial Step", "The tutorial is paused but the current step and its real controls remain available.", "Resume Tutorial", { kind: "resumeTutorial" });
        return suggestions;
      }
      if (surface.kind === "disabled") {
        add("enable-current-page", "Re-Enable Guidance On This Page", "Guidance is disabled here, but the current step is still recoverable without resetting progress.", "Enable Guidance", { kind: "enableCurrentPage" });
        return suggestions;
      }
      if (surface.kind === "offpage") {
        if (surface.page && tutorialDisabledPages(progress).includes(surface.page)) {
          add("enable-offpage-surface", "Re-Enable Guidance On " + tutorialPageLabel(surface.page), "The current step belongs on the " + tutorialPageLabel(surface.page) + " surface, but guidance is disabled there until you turn it back on.", "Enable Guidance", { kind: "enablePage", page: surface.page });
        }
        add("continue-surface", "Continue On The Relevant Surface", "The current step belongs on the " + tutorialPageLabel(surface.page) + " surface, not this page.", "Continue On " + tutorialPageLabel(surface.page), { kind: "continueSurface", page: surface.page });
        return suggestions.slice(0, 2);
      }
      if (current?.id === "open-app") {
        add("open-live-app", "Cross The App Boundary", "This step becomes real by opening the live app you just wired.", "Open App", { kind: "openApp" });
        return suggestions;
      }
      if (current?.target) {
        add("show-current-control", "Use The Current Real Control", "The tutorial is pointing at a real authored control on this page. Work through that exact surface.", "Show Current Control", { kind: "focusTarget", target: current.target });
      }
      if (!appReady && state.session?.authenticated) {
        add("starter-shortcut", "Inspect The Fast Path", "If you want a denser path, the starter shortcut remains available and uses the same underlying structures.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
      }
      return suggestions.slice(0, 2);
    };
    const runSuggestion = async suggestion => {
      if (!suggestion?.action) return;
      if (suggestion.action.kind === "startTutorial") {
        byId("tutorial-start").click();
        return;
      }
      if (suggestion.action.kind === "resumeTutorial") {
        byId("tutorial-resume").click();
        return;
      }
      if (suggestion.action.kind === "enableCurrentPage") {
        await persistTutorialProgress(clearTutorialPageDisabled(state.tutorialProgress));
        render();
        return;
      }
      if (suggestion.action.kind === "enablePage") {
        await persistTutorialProgress(clearTutorialPageDisabled(state.tutorialProgress, suggestion.action.page));
        render();
        return;
      }
      if (suggestion.action.kind === "continueSurface") {
        await continueTutorialOnPage(suggestion.action.page);
        return;
      }
      if (suggestion.action.kind === "openApp") {
        await openAppHome(byId("open-app-link").href, { advance: false });
        return;
      }
      if (suggestion.action.kind === "focusTarget") {
        focusTutorialTarget(suggestion.action.target);
      }
    };
    const tutorialChapters = () => {
      const ids = [];
      for (const step of tutorial.steps) {
        if (!ids.includes(step.chapterId)) ids.push(step.chapterId);
      }
      return ids;
    };
    const chapterState = chapterId => {
      const currentIndex = currentStepIndex(state.tutorialProgress);
      const chapterSteps = tutorial.steps.filter(step => step.chapterId === chapterId);
      const firstIndex = chapterSteps.length ? currentStepIndex({ stepId: chapterSteps[0].id }) : -1;
      const lastIndex = chapterSteps.length ? currentStepIndex({ stepId: chapterSteps[chapterSteps.length - 1].id }) : -1;
      if (state.tutorialProgress?.completedAt || currentIndex > lastIndex) return "done";
      if (currentIndex >= firstIndex && currentIndex <= lastIndex) return "active";
      return "todo";
    };
    const renderTutorialCard = () => {
      const current = tutorialStep();
      const progress = state.tutorialProgress;
      const surface = tutorialSurfaceState();
      const currentConcepts = current ? tutorialStepConcepts(current) : [];
      const revealedConcepts = tutorialRevealedConcepts(progress);
      const suggestions = tutorialSuggestions();
      const disabledPages = tutorialDisabledPageRows(progress);
      const chapters = tutorialChapters();
      byId("tutorial-chapters").innerHTML = chapters.map(chapterId => {
        const chapterSteps = tutorial.steps.filter(step => step.chapterId === chapterId);
        const title = chapterSteps[0]?.title || chapterId;
        const status = chapterState(chapterId);
        return '<div class="chapter-item chapter-' + status + '"><div class="chapter-dot"></div><div><strong>' + escapeHtml(title) + '</strong><div>' + escapeHtml(chapterId) + '</div></div></div>';
      }).join("");
      renderConceptList("tutorial-current-concepts", currentConcepts, progress ? "No concept tagged on this step yet." : "Start the tutorial to reveal concepts.");
      renderConceptList("tutorial-revealed-concepts", revealedConcepts, "No concepts revealed yet.");
      setSuggestionRows(suggestions);
      setDisabledPageRows(disabledPages);
      byId("tutorial-start").disabled = Boolean(progress) || tutorialAutoRunning;
      byId("tutorial-resume").disabled = !progress || Boolean(progress.completedAt) || tutorialAutoRunning || surface.kind === "active";
      byId("tutorial-resume").textContent = surface.kind === "offpage"
        ? ("Continue On " + tutorialPageLabel(surface.page))
        : (surface.kind === "disabled" ? "Enable On This Page" : "Resume Tutorial");
      byId("tutorial-back").disabled = !previousTutorialStep() || tutorialAutoRunning;
      byId("tutorial-skip").disabled = !progress || Boolean(progress.completedAt) || tutorialAutoRunning;
      byId("tutorial-exit").disabled = !progress || Boolean(progress.hidden) || Boolean(progress.completedAt) || tutorialAutoRunning;
      byId("tutorial-reset").disabled = !progress || tutorialAutoRunning;
      byId("tutorial-restart-from-here").disabled = !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning;
      byId("tutorial-disable-page").disabled = !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning || current.page !== currentSurfacePage;
      byId("tutorial-restart-chapter").disabled = !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning;
      byId("tutorial-summary").textContent = !progress
        ? "Start the guided build to learn the platform through the real bootstrap seam."
        : progress.completedAt
          ? "Tutorial complete. The app is wired and you have used the real surface."
          : surface.kind === "offpage"
            ? (surface.page && tutorialDisabledPages(progress).includes(surface.page)
                ? ("Current guidance continues on the " + tutorialPageLabel(surface.page) + " surface, but guidance is disabled there until you re-enable it. Current step: " + (current?.title || "Tutorial in progress.") + ".")
                : ("Current guidance continues on the " + tutorialPageLabel(surface.page) + " surface: " + (current?.title || "Tutorial in progress.") + "."))
            : surface.kind === "disabled"
              ? ("Guidance is disabled on this page. " + (current ? current.title + " stays available on the " + tutorialPageLabel(current.page) + " surface." : ""))
              : surface.kind === "hidden"
                ? ("Tutorial paused. Resume to continue with " + (current?.title || "the next step") + ".")
                : tutorialReplayStepId(progress) === current?.id
                  ? ("Replaying this step from here: " + current.title + ". This replays guidance only and does not roll back authored state.")
                  : (current ? current.title + " (" + current.chapterId + " / " + current.page + ")" : "Tutorial in progress.");
    };
    const canAutoFinishChapter = current => Boolean(current && current.page === "bootstrap" && autoCompletableChapters.has(current.chapterId) && !state.tutorialProgress?.completedAt);
    const clearTutorialScope = () => {
      if (activeHighlightTarget?.isConnected) activeHighlightTarget.removeAttribute("data-tutorial-current");
      if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute("data-tutorial-focus-scope");
      activeHighlightTarget = null;
      activeFocusScope = null;
    };
    const clearTutorialHighlight = () => {
      clearTutorialScope();
      document.querySelectorAll("[data-tutorial-current]").forEach(node => node.removeAttribute("data-tutorial-current"));
      document.querySelectorAll("[data-tutorial-focus-scope]").forEach(node => node.removeAttribute("data-tutorial-focus-scope"));
    };
    const pulseNode = (node, duration = 1400) => {
      if (!node) return;
      node.setAttribute("data-tutorial-changed", "true");
      const pending = pulseTimers.get(node);
      if (pending) clearTimeout(pending);
      pulseTimers.set(node, setTimeout(() => {
        if (node.isConnected) node.removeAttribute("data-tutorial-changed");
      }, duration));
    };
    const flashAutoClick = node => {
      if (!node) return;
      pulseNode(node, 720);
      node.classList.add("tutorial-auto-click");
      setTimeout(() => node.classList.remove("tutorial-auto-click"), 520);
      const rect = node.getBoundingClientRect();
      const pulse = document.createElement("div");
      pulse.className = "tutorial-click-pulse";
      pulse.style.left = (rect.left + (rect.width / 2)) + "px";
      pulse.style.top = (rect.top + (rect.height / 2)) + "px";
      document.body.append(pulse);
      setTimeout(() => pulse.remove(), 620);
    };
    const focusScopeFor = target => target?.matches?.("form,details,.card") ? target : target?.closest?.("form,details,.card") || target || null;
    const setOverlayPosition = (left, top, { manual = false } = {}) => {
      const overlay = byId("tutorial-overlay");
      if (!overlay) return;
      const maxLeft = Math.max(12, window.innerWidth - overlay.offsetWidth - 12);
      const maxTop = Math.max(12, window.innerHeight - overlay.offsetHeight - 12);
      const nextLeft = Math.max(12, Math.min(maxLeft, left));
      const nextTop = Math.max(12, Math.min(maxTop, top));
      overlay.style.left = nextLeft + "px";
      overlay.style.top = nextTop + "px";
      overlay.style.right = "auto";
      overlayDrag.left = nextLeft;
      overlayDrag.top = nextTop;
      if (manual) overlayDrag.manual = true;
    };
    const positionOverlay = target => {
      const overlay = byId("tutorial-overlay");
      if (overlayDrag.manual) {
        setOverlayPosition(overlayDrag.left, overlayDrag.top);
        return;
      }
      if (!target) {
        setOverlayPosition(window.innerWidth - overlay.offsetWidth - 24, 24);
        return;
      }
      const rect = target.getBoundingClientRect();
      const top = Math.max(18, Math.min(window.innerHeight - overlay.offsetHeight - 18, rect.bottom + 12));
      const left = rect.left + overlay.offsetWidth + 18 > window.innerWidth ? Math.max(12, rect.right - overlay.offsetWidth) : Math.max(12, rect.left);
      setOverlayPosition(left, top);
    };
    const renderTutorialOverlay = () => {
      const overlay = byId("tutorial-overlay");
      const dimmer = byId("tutorial-dimmer");
      const current = tutorialStep();
      const surface = tutorialSurfaceState();
      clearTutorialHighlight();
      if (!state.tutorialProgress || state.tutorialProgress.completedAt || !current || surface.kind !== "active") {
        overlay.classList.add("tutorial-hidden");
        dimmer.classList.add("tutorial-hidden");
        return;
      }
      const target = current.target ? byTarget(current.target) : null;
      const focusScope = focusScopeFor(target);
      if (focusScope) {
        revealTarget(focusScope);
        focusScope.setAttribute("data-tutorial-focus-scope", "true");
        activeFocusScope = focusScope;
      }
      if (target) {
        revealTarget(target);
        target.setAttribute("data-tutorial-current", "true");
        activeHighlightTarget = target;
        if (lastRenderedStepId !== current.id) target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      byId("tutorial-overlay-meta").textContent = current.chapterId.toUpperCase();
      byId("tutorial-overlay-title").textContent = current.title;
      byId("tutorial-overlay-body").textContent = current.body;
      renderConceptList("tutorial-overlay-concepts", tutorialStepConcepts(current), "This step uses the current structure without unlocking a new concept.");
      byId("tutorial-next").textContent = current.nextLabel || "Next";
      byId("tutorial-next").disabled = tutorialAutoRunning;
      byId("tutorial-restart-current").disabled = tutorialAutoRunning;
      byId("tutorial-replay-current").disabled = tutorialAutoRunning;
      byId("tutorial-finish-chapter").disabled = tutorialAutoRunning || !canAutoFinishChapter(current);
      byId("tutorial-finish-chapter").classList.toggle("tutorial-hidden", !canAutoFinishChapter(current));
      byId("tutorial-disable-current-page").disabled = tutorialAutoRunning;
      byId("tutorial-overlay-resume").classList.toggle("tutorial-hidden", true);
      dimmer.classList.remove("tutorial-hidden");
      overlay.classList.remove("tutorial-hidden");
      positionOverlay(target);
      lastRenderedStepId = current.id;
    };
    const isStepComplete = current => {
      if (!current) return false;
      const check = current.completeWhen || {};
      const authored = state.bootstrapState || {};
      switch (check.kind) {
        case "identityExists":
          return (authored.identities || []).some(row => row.id === check.id);
        case "sessionAuthenticated":
          return state.session?.authenticated === true && state.session?.actor === check.actor;
        case "serverRunnerExists":
          return (authored.serverRunners || []).some(row => row.id === check.id);
        case "widgetExists":
          return (authored.widgets || []).some(row => row.id === check.id);
        case "programExists":
          return (authored.frontendPrograms || []).some(row => row.id === check.id);
        case "frontendStepExists":
          return (authored.frontendSteps || []).some(row => row.program === check.program && row.event === check.event && row.op === check.op && Number(row.order) === Number(check.order));
        case "routeExists":
          return (authored.routes || []).some(row => row.id === check.id);
        case "serveExists":
          return (authored.servedRoutes || []).some(row => row.id === check.route && row.serverRunner === check.serverRunner);
        case "appRouteReady":
          return state.model?.appReady === true;
        case "manualAdvance":
        case "complete":
        default:
          return false;
      }
    };
    const advanceTutorial = async () => {
      const current = tutorialStep();
      if (!current) return;
      const currentIndex = currentStepIndex(state.tutorialProgress);
      const next = tutorial.steps[currentIndex + 1] || null;
      if (!next) {
        await persistTutorialProgress({ ...state.tutorialProgress, chapterStatus: "completed", completedAt: new Date().toISOString(), replayStepId: null });
      } else {
        await persistTutorialProgress({
          ...state.tutorialProgress,
          chapterId: next.chapterId,
          stepId: next.id,
          chapterStatus: "in_progress",
          completedAt: null,
          hidden: false,
          replayStepId: null
        });
      }
      renderTutorialCard();
      renderTutorialOverlay();
    };
    const maybeAdvanceTutorial = async () => {
      let current = tutorialStep();
      while (state.tutorialProgress && current && !state.tutorialProgress.hidden && !state.tutorialProgress.completedAt && tutorialReplayStepId(state.tutorialProgress) !== current.id && isStepComplete(current)) {
        await advanceTutorial();
        current = tutorialStep();
      }
    };
    let tutorialAdvanceRunning = false;
    let tutorialAdvanceQueued = false;
    const requestMaybeAdvanceTutorial = async () => {
      if (tutorialAdvanceRunning) {
        tutorialAdvanceQueued = true;
        return;
      }
      tutorialAdvanceRunning = true;
      try {
        do {
          tutorialAdvanceQueued = false;
          await maybeAdvanceTutorial();
        } while (tutorialAdvanceQueued);
      } finally {
        tutorialAdvanceRunning = false;
      }
    };
    const waitFor = async (check, timeout = 15000, interval = 80) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await check()) return true;
        await sleep(interval);
      }
      throw new Error("Timed out waiting for tutorial state.");
    };
    const submitTutorialForm = async target => {
      const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
      if (!form) throw new Error("Tutorial target is not a form.");
      const submitter = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (!submitter) throw new Error("Tutorial form has no submit control.");
      flashAutoClick(submitter);
      await sleep(120);
      submitter.click();
    };
    const autoCompleteCurrentChapter = async () => {
      const startingStep = tutorialStep();
      const chapterId = startingStep?.chapterId;
      if (!chapterId) return;
      while (state.tutorialProgress && tutorialStep()?.chapterId === chapterId && !state.tutorialProgress.completedAt) {
        const current = tutorialStep();
        if (!current) break;
        if (isStepComplete(current)) {
          await advanceTutorial();
          continue;
        }
        if (!current.target || !current.payload) throw new Error("Step " + current.id + " cannot be auto-completed.");
        const target = byTarget(current.target);
        if (!target) throw new Error("Missing tutorial target for " + current.id + ".");
        fillForm(target, current.payload);
        await persistTutorialProgress({ ...state.tutorialProgress, draftInputs: current.payload, hidden: false, replayStepId: null });
        renderTutorialOverlay();
        await sleep(180);
        await submitTutorialForm(target);
        const previousStepId = current.id;
        await waitFor(() => (state.tutorialProgress?.stepId !== previousStepId) || Boolean(state.tutorialProgress?.completedAt));
        await sleep(120);
      }
    };
    const clearReplayForInteraction = async eventTarget => {
      const current = tutorialStep();
      const replayStepId = tutorialReplayStepId(state.tutorialProgress);
      if (!current || replayStepId !== current.id) return;
      const target = current.target ? byTarget(current.target) : null;
      const element = eventTarget?.nodeType === Node.ELEMENT_NODE ? eventTarget : eventTarget?.parentElement || null;
      if (!target || !element) return;
      if (!(element === target || target.contains(element) || element.closest?.('[data-tutorial-target="' + CSS.escape(current.target) + '"]'))) return;
      await persistTutorialProgress({ ...state.tutorialProgress, replayStepId: null });
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
    byId("tutorial-suggestions").addEventListener("click", async event => {
      const button = event.target.closest("button[data-suggestion-id]");
      if (!button) return;
      const suggestion = currentSuggestions.find(row => row.id === button.dataset.suggestionId);
      if (!suggestion) return;
      try {
        await runSuggestion(suggestion);
      } catch (error) {
        setStatus("tutorial-status", error.message);
      }
    });
    byId("tutorial-disabled-pages").addEventListener("click", async event => {
      const enableButton = event.target.closest("button[data-disabled-enable]");
      const openButton = event.target.closest("button[data-disabled-open]");
      try {
        if (enableButton) {
          if (!state.tutorialProgress) return;
          await persistTutorialProgress(clearTutorialPageDisabled(state.tutorialProgress, enableButton.dataset.disabledEnable));
          setStatus("tutorial-status", "Guidance re-enabled on " + tutorialPageLabel(enableButton.dataset.disabledEnable) + ".");
          render();
          return;
        }
        if (openButton) {
          await continueTutorialOnPage(openButton.dataset.disabledOpen);
        }
      } catch (error) {
        setStatus("tutorial-status", error.message);
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

    byId("tutorial-overlay-handle").addEventListener("pointerdown", event => {
      const overlay = byId("tutorial-overlay");
      if (overlay.classList.contains("tutorial-hidden")) return;
      const rect = overlay.getBoundingClientRect();
      overlayDrag.active = true;
      overlayDrag.manual = true;
      overlayDrag.left = rect.left;
      overlayDrag.top = rect.top;
      overlayDrag.offsetX = event.clientX - rect.left;
      overlayDrag.offsetY = event.clientY - rect.top;
      document.body.classList.add("tutorial-dragging");
      event.preventDefault();
    });
    window.addEventListener("pointermove", event => {
      if (!overlayDrag.active) return;
      setOverlayPosition(event.clientX - overlayDrag.offsetX, event.clientY - overlayDrag.offsetY, { manual: true });
    });
    window.addEventListener("pointerup", () => {
      overlayDrag.active = false;
      document.body.classList.remove("tutorial-dragging");
    });
    document.addEventListener("click", event => {
      void clearReplayForInteraction(event.target).catch(() => {});
    });
    document.addEventListener("submit", event => {
      void clearReplayForInteraction(event.target).catch(() => {});
    }, true);

    byId("tutorial-start").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await persistTutorialProgress(defaultProgress());
      setStatus("tutorial-status", "Tutorial started.");
      render();
    });
    byId("tutorial-resume").addEventListener("click", async () => {
      if (!state.tutorialProgress) return;
      const surface = tutorialSurfaceState();
      if (surface.kind === "offpage") {
        await continueTutorialOnPage(surface.page);
        return;
      }
      if (surface.kind === "disabled") {
        await persistTutorialProgress(clearTutorialPageDisabled(state.tutorialProgress));
      } else {
        await persistTutorialProgress({ ...state.tutorialProgress, hidden: false });
      }
      render();
    });
    byId("tutorial-back").addEventListener("click", async () => {
      const previous = previousTutorialStep();
      if (!state.tutorialProgress || !previous) return;
      await persistTutorialProgress({
        ...state.tutorialProgress,
        chapterId: previous.chapterId,
        stepId: previous.id,
        hidden: false,
        completedAt: null,
        replayStepId: isStepComplete(previous) ? previous.id : null
      });
      render();
    });
    byId("tutorial-skip").addEventListener("click", async () => {
      const current = tutorialStep();
      if (!state.tutorialProgress || !current) return;
      const next = tutorial.steps.find(step => step.chapterId !== current.chapterId && (stepIndex.get(step.id) > stepIndex.get(current.id)));
      if (!next) {
        await persistTutorialProgress({ ...state.tutorialProgress, completedAt: new Date().toISOString(), chapterStatus: "completed", replayStepId: null });
      } else {
        await persistTutorialProgress({ ...state.tutorialProgress, chapterId: next.chapterId, stepId: next.id, hidden: false, replayStepId: null });
      }
      render();
    });
    byId("tutorial-exit").addEventListener("click", async () => {
      if (!state.tutorialProgress) return;
      await persistTutorialProgress({ ...state.tutorialProgress, hidden: true, replayStepId: null });
      render();
    });
    byId("tutorial-disable-page").addEventListener("click", async () => {
      const current = tutorialStep();
      if (!state.tutorialProgress || !current || current.page !== currentSurfacePage) return;
      await persistTutorialProgress(disableTutorialOnCurrentPage(state.tutorialProgress));
      setStatus("tutorial-status", "Guidance disabled on the Bootstrap page.");
      render();
    });
    byId("tutorial-reset").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await persistTutorialProgress(null);
      setStatus("tutorial-status", "Tutorial progress cleared.");
      render();
    });
    byId("tutorial-restart-from-here").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await restartFromHere();
      setStatus("tutorial-status", "Restarted this step from here. Guidance was replayed without rolling back authored state.");
    });
    byId("tutorial-restart-chapter").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await restartCurrentChapter();
      setStatus("tutorial-status", "Chapter restarted from its first step.");
    });
    byId("tutorial-restart-current").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await restartCurrentChapter();
      setStatus("tutorial-status", "Chapter restarted from its first step.");
    });
    byId("tutorial-replay-current").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await restartFromHere();
      setStatus("tutorial-status", "Restarted this step from here. Guidance was replayed without rolling back authored state.");
    });
    byId("tutorial-disable-current-page").addEventListener("click", async () => {
      const current = tutorialStep();
      if (!state.tutorialProgress || !current || current.page !== currentSurfacePage) return;
      await persistTutorialProgress(disableTutorialOnCurrentPage(state.tutorialProgress));
      setStatus("tutorial-status", "Guidance disabled on the Bootstrap page.");
      renderTutorialCard();
      renderTutorialOverlay();
    });
    byId("tutorial-finish-chapter").addEventListener("click", async () => {
      const current = tutorialStep();
      if (!canAutoFinishChapter(current) || tutorialAutoRunning) return;
      tutorialAutoRunning = true;
      setStatus("tutorial-status", "Completing this chapter through the real builders...");
      renderTutorialCard();
      renderTutorialOverlay();
      try {
        await autoCompleteCurrentChapter();
        setStatus("tutorial-status", "Chapter completed.");
      } catch (error) {
        setStatus("tutorial-status", error.message);
      } finally {
        tutorialAutoRunning = false;
        renderTutorialCard();
        renderTutorialOverlay();
      }
    });
    byId("tutorial-next").addEventListener("click", async () => {
      const current = tutorialStep();
      if (!current) return;
      if (!state.tutorialProgress) {
        await persistTutorialProgress(defaultProgress());
        render();
        return;
      }
      if (current.completeWhen?.kind === "manualAdvance") {
        await advanceTutorial();
        return;
      }
      const target = current.target ? byTarget(current.target) : null;
      if (current.payload && target) {
        fillForm(target, current.payload);
        await persistTutorialProgress({ ...state.tutorialProgress, draftInputs: current.payload, hidden: false });
        setStatus("tutorial-status", "Prefilled and submitting the real control...");
        renderTutorialOverlay();
        const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
        if (form) {
          await sleep(120);
          await submitTutorialForm(target);
          return;
        }
        setStatus("tutorial-status", "Prefilled the real control. Use it to continue.");
        return;
      }
      setStatus("tutorial-status", "Use the highlighted control to continue.");
      renderTutorialOverlay();
    });

    window.addEventListener("resize", () => renderTutorialOverlay());
    window.addEventListener("scroll", () => renderTutorialOverlay(), { passive: true });
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
