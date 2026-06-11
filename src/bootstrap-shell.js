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
        <div class="actions">
          <button type="button" id="tutorial-start">Start Tutorial</button>
          <button type="button" id="tutorial-resume" class="secondary">Resume Tutorial</button>
          <button type="button" id="tutorial-back" class="secondary">Back</button>
          <button type="button" id="tutorial-skip" class="secondary">Skip Chapter</button>
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
        <h2>Create First Identity</h2>
        <p>Create the first user when the world is blank. After identities exist, normal session auth is required for bootstrap edits.</p>
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
          <div class="actions"><button type="submit" data-tutorial-target="identity-submit">Create Identity</button></div>
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
              <label>Order<input name="order" type="number" placeholder="0" data-tutorial-target="widget-order" /></label>
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
              <label>Serves<input name="serves" data-tutorial-target="route-serves" /></label>
              <label>Method<select id="route-method" name="method" data-tutorial-target="route-method"></select></label>
            </div>
            <div class="grid two">
              <label>Handler<select id="route-handler" name="handler" data-tutorial-target="route-handler"></select></label>
              <label>Page Name<input name="page" placeholder="home" data-tutorial-target="route-page" /></label>
            </div>
            <div class="grid two">
              <label>Root Widget<select id="route-root-widget" name="rootWidget" data-tutorial-target="route-root-widget"></select></label>
              <label>Frontend Program<select id="route-frontend-program" name="frontendProgram" data-tutorial-target="route-frontend-program"></select></label>
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
              <label>Backend Host<select id="runner-backend-host" name="backendHost" data-tutorial-target="runner-backend-host"></select></label>
              <label>Frontend Host<select id="runner-frontend-host" name="frontendHost" data-tutorial-target="runner-frontend-host"></select></label>
            </div>
            <div class="grid two">
              <label>Todo Projection<input name="todoProjection" value="witness-world-bootstrap-todos.json" data-tutorial-target="runner-todo-projection" /></label>
              <label>Private Notes Projection<input name="privateNotesProjection" value="witness-world-bootstrap-private-notes.json" data-tutorial-target="runner-private-notes-projection" /></label>
            </div>
            <div class="actions"><button type="submit" data-tutorial-target="runner-submit">Create Server Runner</button></div>
          </form>
          <p class="status" id="runner-status"></p>
        </details>
      </article>

      <article class="card">
        <div class="badge">Fast Path</div>
        <details>
          <summary><strong>Advanced Shortcut</strong></summary>
          <p class="note">This remains available as a quick seam for experienced users. It is not used by the tutorial.</p>
          <div class="actions">
            <button type="button" id="create-todo-starter">Create Todo Starter</button>
          </div>
          <p class="status" id="starter-status"></p>
        </details>
      </article>
    </section>

    <aside class="column">
      <article class="card">
        <div class="badge">Current World</div>
        <h2>Authored State</h2>
        <p>The tutorial uses the same authored structures shown here. Nothing is hidden behind a fake wizard layer.</p>
        <div class="stack">
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
    <div class="actions">
      <button type="button" id="tutorial-next">Next</button>
      <button type="button" class="secondary" id="tutorial-finish-chapter">Finish Chapter For Me</button>
      <button type="button" class="secondary" id="tutorial-overlay-resume">Resume</button>
    </div>
  </aside>
  <script>
  (() => {
    const tutorial = ${jsonForScript(tutorial)};
    const blueprint = ${jsonForScript(blueprint)};
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
    const nextTutorialStep = () => {
      const index = stepIndex.get(state.tutorialProgress?.stepId ?? "") ?? -1;
      return index >= 0 ? (tutorial.steps[index + 1] || null) : (tutorial.steps[0] || null);
    };
    const currentStepIndex = progress => stepIndex.get(progress?.stepId ?? "") ?? -1;
    const mergeProgress = (localProgress, remoteProgress) => {
      if (!localProgress) return remoteProgress || null;
      if (!remoteProgress) return localProgress || null;
      if (localProgress.completedAt && !remoteProgress.completedAt) return localProgress;
      if (remoteProgress.completedAt && !localProgress.completedAt) return remoteProgress;
      const localIndex = currentStepIndex(localProgress);
      const remoteIndex = currentStepIndex(remoteProgress);
      if (localIndex > remoteIndex) return localProgress;
      if (remoteIndex > localIndex) return remoteProgress;
      return localProgress.hidden === false && remoteProgress.hidden === true ? localProgress : remoteProgress;
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
      hidden: false
    });
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
      const chapters = tutorialChapters();
      byId("tutorial-chapters").innerHTML = chapters.map(chapterId => {
        const chapterSteps = tutorial.steps.filter(step => step.chapterId === chapterId);
        const title = chapterSteps[0]?.title || chapterId;
        const status = chapterState(chapterId);
        return '<div class="chapter-item chapter-' + status + '"><div class="chapter-dot"></div><div><strong>' + escapeHtml(title) + '</strong><div>' + escapeHtml(chapterId) + '</div></div></div>';
      }).join("");
      byId("tutorial-start").disabled = Boolean(progress) || tutorialAutoRunning;
      byId("tutorial-resume").disabled = !(progress && progress.hidden === true) || tutorialAutoRunning;
      byId("tutorial-back").disabled = !previousTutorialStep() || tutorialAutoRunning;
      byId("tutorial-skip").disabled = !progress || Boolean(progress.completedAt) || tutorialAutoRunning;
      byId("tutorial-exit").disabled = !progress || Boolean(progress.hidden) || Boolean(progress.completedAt) || tutorialAutoRunning;
      byId("tutorial-reset").disabled = !progress || tutorialAutoRunning;
      byId("tutorial-summary").textContent = !progress
        ? "Start the guided build to learn the platform through the real bootstrap seam."
        : progress.completedAt
          ? "Tutorial complete. The app is wired and you have used the real surface."
          : (current ? current.title + " (" + current.chapterId + ")" : "Tutorial in progress.");
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
      clearTutorialHighlight();
      if (!state.tutorialProgress || state.tutorialProgress.hidden || state.tutorialProgress.completedAt || !current) {
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
      byId("tutorial-next").textContent = current.nextLabel || "Next";
      byId("tutorial-next").disabled = tutorialAutoRunning;
      byId("tutorial-finish-chapter").disabled = tutorialAutoRunning || !canAutoFinishChapter(current);
      byId("tutorial-finish-chapter").classList.toggle("tutorial-hidden", !canAutoFinishChapter(current));
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
        await persistTutorialProgress({ ...state.tutorialProgress, chapterStatus: "completed", completedAt: new Date().toISOString() });
      } else {
        await persistTutorialProgress({
          ...state.tutorialProgress,
          chapterId: next.chapterId,
          stepId: next.id,
          chapterStatus: "in_progress",
          completedAt: null,
          hidden: false
        });
      }
      renderTutorialCard();
      renderTutorialOverlay();
    };
    const maybeAdvanceTutorial = async () => {
      let current = tutorialStep();
      while (state.tutorialProgress && current && !state.tutorialProgress.hidden && !state.tutorialProgress.completedAt && isStepComplete(current)) {
        await advanceTutorial();
        current = tutorialStep();
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
        await persistTutorialProgress({ ...state.tutorialProgress, draftInputs: current.payload, hidden: false });
        renderTutorialOverlay();
        await sleep(180);
        await submitTutorialForm(target);
        const previousStepId = current.id;
        await waitFor(() => (state.tutorialProgress?.stepId !== previousStepId) || Boolean(state.tutorialProgress?.completedAt));
        await sleep(120);
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
    const refresh = async () => {
      state.model = await request("/api/bootstrap-model");
      state.bootstrapState = await request("/api/bootstrap-state");
      state.session = await request("/api/session");
      await loadTutorialProgress();
      render();
      await maybeAdvanceTutorial();
      render();
    };
    const render = () => {
      const model = state.model || {};
      const authored = state.bootstrapState || {};
      const session = state.session || {};
      const appReady = model.appReady === true;
      byId("bootstrap-summary").textContent = appReady
        ? "The app route exists. This seam remains available for recovery and harness edits."
        : "No reachable app home route exists yet. Bootstrap owns the landing experience until the app boundary is wired.";
      byId("open-app-link").href = "/";
      byId("session-summary").textContent = session.authenticated
        ? "Signed in as " + session.label + " (" + session.actor + ")" + (session.perspective ? " in " + session.perspective : "")
        : ((authored.identities || []).length ? "Sign in to continue editing the bootstrap seam." : "No identities yet. Create the first identity to continue.");

      fillSelect("widget-kind", model.widgetKinds || [], x => x, x => x, { includeBlank: false });
      fillSelect("widget-parent", authored.widgets || [], x => x.id, x => x.id);
      fillSelect("program-root-widget", authored.widgets || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("route-root-widget", authored.widgets || [], x => x.id, x => x.id);
      fillSelect("route-frontend-program", authored.frontendPrograms || [], x => x.id, x => x.id);
      fillSelect("step-program", authored.frontendPrograms || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("step-op", model.supportedFrontendOps || [], x => x, x => x, { includeBlank: false });
      fillSelect("route-method", model.supportedMethods || [], x => x, x => x, { includeBlank: false });
      fillSelect("route-handler", model.supportedHandlers || [], x => x, x => x, { includeBlank: false });
      fillSelect("serve-route", authored.routes || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("serve-server-runner", authored.serverRunners || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("runner-handler-set", model.supportedHandlerSets || [], x => x, x => x);
      fillSelect("runner-backend-host", model.backendHosts || [], x => x.id, x => x.id, { includeBlank: false });
      fillSelect("runner-frontend-host", model.frontendHosts || [], x => x.id, x => x.id, { includeBlank: false });

      renderStateList("state-identities", authored.identities || [], row => row.id + " -> " + row.actor);
      renderStateList("state-widgets", authored.widgets || [], row => row.id + " (" + row.kind + ")");
      renderStateList("state-programs", authored.frontendPrograms || [], row => row.id + " -> " + row.rootWidget);
      renderStateList("state-steps", authored.frontendSteps || [], row => row.program + " / " + row.event + " / " + row.op + " / " + row.order);
      renderStateList("state-routes", authored.routes || [], row => row.id + " " + row.method + " " + row.path);
      renderStateList("state-serves", authored.servedRoutes || [], row => row.serverRunner + " -> " + row.id);
      renderStateList("state-runners", authored.serverRunners || [], row => row.id + (row.handlerSet ? " [" + row.handlerSet + "]" : ""));

      const editingEnabled = session.authenticated || !(authored.identities || []).length;
      for (const formId of ["widget-form", "program-form", "step-form", "route-form", "serve-form", "runner-form"]) {
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
        completedAt: state.tutorialProgress?.completedAt || null,
        hidden: state.tutorialProgress?.hidden === true
      };
    };
    const widget = overrides => postJson("/api/widgets", overrides);
    const route = overrides => postJson("/api/routes", overrides);
    const serve = overrides => postJson("/api/serve-mounts", overrides);
    const program = overrides => postJson("/api/frontend-programs", overrides);
    const step = overrides => postJson("/api/frontend-steps", overrides);
    const runner = overrides => postJson("/api/server-runners", overrides);

    async function createTodoStarter() {
      const model = state.model || {};
      const authored = state.bootstrapState || {};
      const backendHost = model.backendHosts?.[0]?.id || "backendHost";
      const frontendHost = model.frontendHosts?.[0]?.id || "frontendHost";
      if (!(authored.serverRunners || []).some(row => row.id === blueprint.runner.id)) {
        await runner({ ...blueprint.runner, backendHost, frontendHost });
      }
      for (const definition of blueprint.widgets) await widget(definition);
      await program({ ...blueprint.program });
      for (const definition of blueprint.steps) await step(definition);
      for (const definition of blueprint.routes) await route(definition);
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
        if (!data.id && data.username) data.id = "identity." + data.username.trim();
        await postJson("/api/identities", data);
        setStatus("identity-status", "Identity created.");
        form.reset();
        await refresh();
      } catch (error) {
        setStatus("identity-status", error.message);
      }
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
        setStatus("starter-status", "Todo starter created. Open the app at /.");
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

    byId("tutorial-start").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await persistTutorialProgress(defaultProgress());
      setStatus("tutorial-status", "Tutorial started.");
      render();
    });
    byId("tutorial-resume").addEventListener("click", async () => {
      if (!state.tutorialProgress) return;
      await persistTutorialProgress({ ...state.tutorialProgress, hidden: false });
      render();
    });
    byId("tutorial-back").addEventListener("click", async () => {
      const previous = previousTutorialStep();
      if (!state.tutorialProgress || !previous) return;
      await persistTutorialProgress({ ...state.tutorialProgress, chapterId: previous.chapterId, stepId: previous.id, hidden: false, completedAt: null });
      render();
    });
    byId("tutorial-skip").addEventListener("click", async () => {
      const current = tutorialStep();
      if (!state.tutorialProgress || !current) return;
      const next = tutorial.steps.find(step => step.chapterId !== current.chapterId && (stepIndex.get(step.id) > stepIndex.get(current.id)));
      if (!next) {
        await persistTutorialProgress({ ...state.tutorialProgress, completedAt: new Date().toISOString(), chapterStatus: "completed" });
      } else {
        await persistTutorialProgress({ ...state.tutorialProgress, chapterId: next.chapterId, stepId: next.id, hidden: false });
      }
      render();
    });
    byId("tutorial-exit").addEventListener("click", async () => {
      if (!state.tutorialProgress) return;
      await persistTutorialProgress({ ...state.tutorialProgress, hidden: true });
      render();
    });
    byId("tutorial-reset").addEventListener("click", async () => {
      overlayDrag.manual = false;
      await persistTutorialProgress(null);
      setStatus("tutorial-status", "Tutorial progress cleared.");
      render();
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
