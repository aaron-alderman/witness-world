function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderBootstrapPage() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Witness Bootstrap</title>
  <style>
    :root { --bg: #f4f1ea; --card: #fffdf8; --line: #d9d2c7; --ink: #1f1b17; --muted: #6a635b; --accent: #7a4d2a; --accent-soft: #efe1d3; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: linear-gradient(180deg, #f7f2eb 0%, #efe9df 100%); color: var(--ink); }
    header { padding: 28px 32px 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.7); backdrop-filter: blur(6px); position: sticky; top: 0; z-index: 2; }
    header small { display: inline-block; text-transform: uppercase; letter-spacing: .16em; color: var(--muted); font-size: 11px; margin-bottom: 8px; }
    header h1 { margin: 0 0 8px; font-size: 2rem; }
    header p { margin: 0; max-width: 900px; color: var(--muted); line-height: 1.5; }
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
    textarea { min-height: 96px; resize: vertical; }
    button { border: 1px solid #734e31; background: #7a4d2a; color: white; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
    button.secondary { background: white; color: var(--accent); }
    button:disabled { opacity: .55; cursor: default; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .status { min-height: 1.2em; color: var(--accent); }
    .muted { color: var(--muted); }
    .state-list { display: grid; gap: 8px; max-height: 340px; overflow: auto; }
    .state-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: #fff; }
    .state-item strong { display: block; margin-bottom: 3px; }
    .state-item code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--muted); white-space: pre-wrap; }
    .hide { display: none !important; }
    .note { border-left: 4px solid var(--accent); padding-left: 10px; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); }
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
      <article class="card">
        <div class="badge">Platform Harness</div>
        <h2>Bootstrap Status</h2>
        <p id="bootstrap-summary">Loading bootstrap state...</p>
        <div class="actions">
          <a href="/" id="open-app-link"><button type="button" class="secondary">Open App</button></a>
          <button type="button" class="secondary" id="refresh-bootstrap">Refresh</button>
        </div>
        <p class="status" id="bootstrap-status"></p>
      </article>

      <article class="card">
        <div class="badge">Identity</div>
        <h2>Create First Identity</h2>
        <p>Create the first user when the world is blank. After identities exist, normal session auth is required for bootstrap edits.</p>
        <form id="identity-form" class="stack">
          <div class="grid two">
            <label>Identity Id<input name="id" placeholder="identity.aaron" /></label>
            <label>Actor<input name="actor" placeholder="aaron" /></label>
          </div>
          <div class="grid two">
            <label>Label<input name="label" placeholder="Aaron" /></label>
            <label>Username<input name="username" placeholder="aaron" /></label>
          </div>
          <div class="grid two">
            <label>Password<input name="password" placeholder="aaron" /></label>
            <label>Home Perspective<input name="homePerspective" placeholder="aaron:personal" /></label>
          </div>
          <div class="actions"><button type="submit">Create Identity</button></div>
        </form>
        <p class="status" id="identity-status"></p>
      </article>

      <article class="card">
        <div class="badge">Session</div>
        <h2>Sign In To Keep Editing</h2>
        <form id="session-form" class="stack">
          <div class="grid two">
            <label>Username<input name="username" autocomplete="username" /></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" /></label>
          </div>
          <div class="actions">
            <button type="submit">Sign In</button>
            <button type="button" class="secondary" id="logout-session">Logout</button>
          </div>
        </form>
        <p id="session-summary" class="muted">Loading session…</p>
      </article>

      <article class="card" id="starter-card">
        <div class="badge">App Builder</div>
        <h2>Create Minimal Todo App</h2>
        <p class="note">This is the bare-minimum bootstrap path. It wires the app through the current runtime and existing demo handler set without exposing internal compiler or primitive machinery.</p>
        <div class="actions">
          <button type="button" id="create-todo-starter">Create Todo Starter</button>
        </div>
        <p class="status" id="starter-status"></p>
      </article>

      <article class="card">
        <div class="badge">App Surface</div>
        <h2>Focused Builders</h2>
        <p>These forms edit app-visible structures. Advanced step conditions and params use JSON when needed, but the main surface stays oriented around the app rather than the substrate.</p>

        <details open>
          <summary><strong>Widgets</strong></summary>
          <form id="widget-form" class="stack">
            <div class="grid two">
              <label>Id<input name="id" placeholder="todo_title" /></label>
              <label>Kind<select id="widget-kind" name="kind"></select></label>
            </div>
            <div class="grid two">
              <label>Parent<select id="widget-parent" name="parent"></select></label>
              <label>Order<input name="order" type="number" placeholder="0" /></label>
            </div>
            <div class="grid two">
              <label>Text<input name="text" /></label>
              <label>Title<input name="title" /></label>
            </div>
            <div class="grid two">
              <label>Role<input name="role" /></label>
              <label>Class<input name="class" /></label>
            </div>
            <div class="grid two">
              <label>Name<input name="name" /></label>
              <label>Type<input name="type" /></label>
            </div>
            <div class="grid two">
              <label>Placeholder<input name="placeholder" /></label>
              <label>Autocomplete<input name="autocomplete" /></label>
            </div>
            <div class="grid two">
              <label>Href<input name="href" /></label>
              <label>Action<input name="action" /></label>
            </div>
            <div class="grid two">
              <label>Label<input name="label" /></label>
              <label>Value Type<input name="valueType" /></label>
            </div>
            <div class="grid two">
              <label>Data Id<input name="dataId" /></label>
              <label>Data Done<input name="dataDone" /></label>
            </div>
            <div class="grid two">
              <label>Event Soul<input name="eventSoul" /></label>
              <label>Event Version<input name="eventVersion" /></label>
            </div>
            <div class="grid two">
              <label>Heading Level<input name="level" type="number" /></label>
              <label><span class="kicker">Template</span><input name="template" type="checkbox" /></label>
            </div>
            <label><span class="kicker">Attach To Parent</span><input name="attach" type="checkbox" checked /></label>
            <div class="actions"><button type="submit">Create Widget</button></div>
          </form>
          <p class="status" id="widget-status"></p>
        </details>

        <details>
          <summary><strong>Frontend Programs</strong></summary>
          <form id="program-form" class="stack">
            <div class="grid two">
              <label>Program Id<input name="id" /></label>
              <label>Root Widget<select id="program-root-widget" name="rootWidget"></select></label>
            </div>
            <div class="actions"><button type="submit">Create Program</button></div>
          </form>
          <p class="status" id="program-status"></p>

          <form id="step-form" class="stack">
            <div class="grid two">
              <label>Program<select id="step-program" name="program"></select></label>
              <label>Event<input name="event" placeholder="load" /></label>
            </div>
            <div class="grid two">
              <label>Operation<select id="step-op" name="op"></select></label>
              <label>Order<input name="order" type="number" value="0" /></label>
            </div>
            <label>Params JSON<textarea name="paramsJson" placeholder='{"widget":"todo_status","text":"Ready"}'></textarea></label>
            <label>When JSON<textarea name="whenJson" placeholder='{"path":"session.authenticated","truthy":true}'></textarea></label>
            <label>Repeat JSON<textarea name="repeatJson" placeholder='{"forEach":{"from":"todoResponse.todos","as":"item"}}'></textarea></label>
            <label>After JSON<textarea name="afterJson" placeholder='["program=todo_frontend_program/trigger=load/step[1]/operation=fetchJson"]'></textarea></label>
            <div class="actions"><button type="submit">Create Step</button></div>
          </form>
          <p class="status" id="step-status"></p>
        </details>

        <details>
          <summary><strong>Routes And Mounts</strong></summary>
          <form id="route-form" class="stack">
            <div class="grid two">
              <label>Route Id<input name="id" /></label>
              <label>Path<input name="path" placeholder="/" /></label>
            </div>
            <div class="grid two">
              <label>Serves<input name="serves" /></label>
              <label>Method<select id="route-method" name="method"></select></label>
            </div>
            <div class="grid two">
              <label>Handler<select id="route-handler" name="handler"></select></label>
              <label>Page Name<input name="page" placeholder="home" /></label>
            </div>
            <div class="grid two">
              <label>Root Widget<select id="route-root-widget" name="rootWidget"></select></label>
              <label>Frontend Program<select id="route-frontend-program" name="frontendProgram"></select></label>
            </div>
            <label><span class="kicker">Live Projection</span><input name="liveProjection" type="checkbox" checked /></label>
            <div class="actions"><button type="submit">Create Route</button></div>
          </form>
          <p class="status" id="route-status"></p>

          <form id="serve-form" class="stack">
            <div class="grid two">
              <label>Server Runner<select id="serve-server-runner" name="serverRunner"></select></label>
              <label>Route<select id="serve-route" name="route"></select></label>
            </div>
            <div class="actions"><button type="submit">Create Serve Mount</button></div>
          </form>
          <p class="status" id="serve-status"></p>
        </details>

        <details>
          <summary><strong>Runtime Wiring</strong></summary>
          <form id="runner-form" class="stack">
            <div class="grid two">
              <label>Runner Id<input name="id" value="demo_server" /></label>
              <label>Handler Set<select id="runner-handler-set" name="handlerSet"></select></label>
            </div>
            <div class="grid two">
              <label>Backend Host<select id="runner-backend-host" name="backendHost"></select></label>
              <label>Frontend Host<select id="runner-frontend-host" name="frontendHost"></select></label>
            </div>
            <div class="grid two">
              <label>Todo Projection<input name="todoProjection" value="witness-world-bootstrap-todos.json" /></label>
              <label>Private Notes Projection<input name="privateNotesProjection" value="witness-world-bootstrap-private-notes.json" /></label>
            </div>
            <div class="actions"><button type="submit">Create Server Runner</button></div>
          </form>
          <p class="status" id="runner-status"></p>
        </details>
      </article>
    </section>

    <aside class="column">
      <article class="card">
        <div class="badge">Current State</div>
        <h2>Authored World</h2>
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
            <h3>Programs</h3>
            <div id="state-programs" class="state-list"></div>
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
  <script>
  (() => {
    const state = { model: null, bootstrapState: null, session: null };
    const byId = id => document.getElementById(id);
    const setStatus = (id, text) => { const el = byId(id); if (el) el.textContent = text || ""; };
    const readForm = form => Object.fromEntries(new FormData(form).entries());
    const boolValue = formData => formData === "on";
    const postJson = async (url, body) => {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "request failed");
      return data;
    };
    const request = async (url, options = {}) => {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "request failed");
      return data;
    };
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
      root.innerHTML = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "state-item muted";
        empty.textContent = "None yet.";
        root.append(empty);
        return;
      }
      for (const row of rows) {
        const item = document.createElement("div");
        item.className = "state-item";
        const title = document.createElement("strong");
        title.textContent = label(row);
        const code = document.createElement("code");
        code.textContent = JSON.stringify(row, null, 2);
        item.append(title, code);
        root.append(item);
      }
    };
    const refresh = async () => {
      state.model = await request("/api/bootstrap-model");
      state.bootstrapState = await request("/api/bootstrap-state");
      state.session = await request("/api/session");
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
        : (authored.identities?.length ? "Sign in to continue editing the bootstrap seam." : "No identities yet. Create the first identity to continue.");

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
    };

    const widget = (overrides) => postJson("/api/widgets", overrides);
    const route = (overrides) => postJson("/api/routes", overrides);
    const serve = (overrides) => postJson("/api/serve-mounts", overrides);
    const program = (overrides) => postJson("/api/frontend-programs", overrides);
    const step = (overrides) => postJson("/api/frontend-steps", overrides);
    const runner = (overrides) => postJson("/api/server-runners", overrides);

    async function createTodoStarter() {
      const model = state.model;
      const authored = state.bootstrapState;
      const backendHost = model.backendHosts?.[0]?.id || "backendHost";
      const frontendHost = model.frontendHosts?.[0]?.id || "frontendHost";
      if (!(authored.serverRunners || []).some(row => row.id === "demo_server")) {
        await runner({ id: "demo_server", backendHost, frontendHost, handlerSet: "demo", todoProjection: "witness-world-bootstrap-todos.json", privateNotesProjection: "witness-world-bootstrap-private-notes.json" });
      }

      const widgets = [
        { id: "todo_app_widget", kind: "Page", title: "Witness Todo", attach: false },
        { id: "todo_session", kind: "Box", parent: "todo_app_widget", order: 0, class: "session-panel", role: "session-panel" },
        { id: "todo_session_title", kind: "Text", parent: "todo_session", order: 0, text: "Personal Projection" },
        { id: "todo_session_form", kind: "Form", parent: "todo_session", order: 1, role: "login-form" },
        { id: "todo_username_input", kind: "Input", parent: "todo_session_form", order: 0, name: "username", placeholder: "Username", autocomplete: "username" },
        { id: "todo_password_input", kind: "Input", parent: "todo_session_form", order: 1, name: "password", placeholder: "Password", type: "password", autocomplete: "current-password" },
        { id: "todo_open_button", kind: "Button", parent: "todo_session_form", order: 2, text: "Sign in", type: "submit" },
        { id: "todo_logout_button", kind: "Button", parent: "todo_session_form", order: 3, text: "Logout", type: "button", action: "logout" },
        { id: "todo_session_status", kind: "Text", parent: "todo_session", order: 2, text: "Not signed in", role: "session-status" },
        { id: "todo_title", kind: "Heading", parent: "todo_app_widget", order: 1, text: "Witness Todo", level: 1 },
        { id: "todo_form", kind: "Form", parent: "todo_app_widget", order: 2, role: "todo-form" },
        { id: "todo_input", kind: "Input", parent: "todo_form", order: 0, name: "title", placeholder: "New todo" },
        { id: "todo_add_button", kind: "Button", parent: "todo_form", order: 1, text: "Add", type: "submit" },
        { id: "todo_status", kind: "Text", parent: "todo_app_widget", order: 3, text: "", class: "status", role: "app-status" },
        { id: "todo_list", kind: "Box", parent: "todo_app_widget", order: 4, role: "todo-list" },
        { id: "todo_private_notes", kind: "Box", parent: "todo_app_widget", order: 5, class: "private-notes", role: "private-notes" },
        { id: "todo_private_notes_title", kind: "Heading", parent: "todo_private_notes", order: 0, text: "Private Notes", level: 2 },
        { id: "todo_private_notes_form", kind: "Form", parent: "todo_private_notes", order: 1, role: "private-note-form" },
        { id: "todo_private_note_input", kind: "Input", parent: "todo_private_notes_form", order: 0, name: "text", placeholder: "Only your perspective can see this" },
        { id: "todo_private_note_button", kind: "Button", parent: "todo_private_notes_form", order: 1, text: "Save note", type: "submit" },
        { id: "todo_private_note_list", kind: "Box", parent: "todo_private_notes", order: 2, class: "private-note-list", role: "private-note-list" },
        { id: "todo_widget_editor", kind: "Box", parent: "todo_app_widget", order: 6, class: "widget-editor", role: "widget-editor" },
        { id: "todo_widget_editor_title", kind: "Heading", parent: "todo_widget_editor", order: 0, text: "Widget Editor", level: 2 },
        { id: "todo_widget_editor_form", kind: "Form", parent: "todo_widget_editor", order: 1, role: "widget-editor-form" },
        { id: "todo_widget_kind", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 0, name: "kind", valueType: "widget.kind", label: "Kind", placeholder: "Choose a widget kind" },
        { id: "todo_widget_text", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 1, name: "text", valueType: "widget.text", label: "Text", placeholder: "Widget text" },
        { id: "todo_widget_parent", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 2, name: "parent", valueType: "widget.parent", label: "Parent", placeholder: "Parent widget id, blank = root" },
        { id: "todo_widget_order", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 3, name: "order", valueType: "widget.order", label: "Order", placeholder: "Optional order" },
        { id: "todo_widget_editor_button", kind: "Button", parent: "todo_widget_editor_form", order: 4, text: "Add widget", type: "submit" },
        { id: "todo_item_template", kind: "Box", attach: false, template: true, class: "\${item.done ? 'todo-row done' : 'todo-row'}" },
        { id: "todo_item_title_template", kind: "Text", parent: "todo_item_template", order: 0, template: true, text: "\${item.title}", class: "todo-title" },
        { id: "todo_item_actions_template", kind: "Box", parent: "todo_item_template", order: 1, template: true, class: "todo-actions" },
        { id: "todo_item_toggle_template", kind: "Button", parent: "todo_item_actions_template", order: 0, template: true, text: "\${item.done ? 'Undo' : 'Done'}", type: "button", action: "toggleTodo", dataId: "\${item.id}", dataDone: "\${!item.done}" },
        { id: "todo_item_delete_template", kind: "Button", parent: "todo_item_actions_template", order: 1, template: true, text: "Delete", type: "button", action: "deleteTodo", dataId: "\${item.id}" },
        { id: "private_note_template", kind: "Text", attach: false, template: true, class: "private-note", text: "\${item.text}" },
        { id: "private_note_empty_template", kind: "Text", attach: false, template: true, class: "private-note", text: "Sign in to see private notes." }
      ];
      for (const definition of widgets) await widget(definition);

      await program({ id: "todo_frontend_program", rootWidget: "todo_app_widget" });

      const steps = [
        { program: "todo_frontend_program", event: "load", op: "initSession", order: 0, paramsJson: "{}" },
        { program: "todo_frontend_program", event: "load", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "todo_session_status", text: "\${state.session && state.session.authenticated ? 'Signed in as ' + state.session.label + ' (' + state.session.actor + ')' + (state.session.perspective ? ' in ' + state.session.perspective : '') : 'Not signed in'}" }) },
        { program: "todo_frontend_program", event: "load", op: "setText", order: 2, paramsJson: JSON.stringify({ widget: "todo_status", text: "Loading..." }) },
        { program: "todo_frontend_program", event: "load", op: "fetchJson", order: 3, paramsJson: JSON.stringify({ url: "/api/todos", into: "todoResponse" }) },
        { program: "todo_frontend_program", event: "load", op: "renderCollection", order: 4, paramsJson: JSON.stringify({ widget: "todo_list", from: "todoResponse.todos", template: "todo_item_template" }) },
        { program: "todo_frontend_program", event: "load", op: "fetchJson", order: 5, paramsJson: JSON.stringify({ url: "/api/private-notes", into: "privateNotesResponse" }) },
        { program: "todo_frontend_program", event: "load", op: "renderCollection", order: 6, paramsJson: JSON.stringify({ widget: "todo_private_note_list", from: "privateNotesResponse.notes", template: "private_note_template", emptyWidget: "private_note_empty_template" }) },
        { program: "todo_frontend_program", event: "load", op: "setText", order: 7, paramsJson: JSON.stringify({ widget: "todo_status", text: "Ready" }) },
        { program: "todo_frontend_program", event: "submit:todo_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_form", into: "draftTodo" }) },
        { program: "todo_frontend_program", event: "submit:todo_form", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "todo_status", text: "Saving..." }) },
        { program: "todo_frontend_program", event: "submit:todo_form", op: "postJson", order: 2, paramsJson: JSON.stringify({ url: "/api/todos", method: "POST", from: "draftTodo", pick: ["title"], into: "createdTodo" }) },
        { program: "todo_frontend_program", event: "submit:todo_form", op: "clearForm", order: 3, paramsJson: JSON.stringify({ widget: "todo_form" }) },
        { program: "todo_frontend_program", event: "submit:todo_form", op: "run", order: 4, paramsJson: JSON.stringify({ event: "load" }) },
        { program: "todo_frontend_program", event: "click:toggleTodo", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "Updating..." }) },
        { program: "todo_frontend_program", event: "click:toggleTodo", op: "patchJson", order: 1, paramsJson: JSON.stringify({ url: "/api/todos/\${event.id}", body: { done: "\${event.done}" }, into: "updatedTodo" }) },
        { program: "todo_frontend_program", event: "click:toggleTodo", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
        { program: "todo_frontend_program", event: "click:deleteTodo", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "Deleting..." }) },
        { program: "todo_frontend_program", event: "click:deleteTodo", op: "deleteJson", order: 1, paramsJson: JSON.stringify({ url: "/api/todos/\${event.id}", into: "deletedTodo" }) },
        { program: "todo_frontend_program", event: "click:deleteTodo", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
        { program: "todo_frontend_program", event: "submit:todo_session_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_session_form", into: "sessionDraft" }) },
        { program: "todo_frontend_program", event: "submit:todo_session_form", op: "setSession", order: 1, paramsJson: JSON.stringify({ from: "sessionDraft" }) },
        { program: "todo_frontend_program", event: "submit:todo_session_form", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
        { program: "todo_frontend_program", event: "click:logout", op: "logout", order: 0, paramsJson: "{}" },
        { program: "todo_frontend_program", event: "click:logout", op: "run", order: 1, paramsJson: JSON.stringify({ event: "load" }) },
        { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_private_notes_form", into: "privateNoteDraft" }) },
        { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "postJson", order: 1, paramsJson: JSON.stringify({ url: "/api/private-notes", from: "privateNoteDraft", pick: ["text"], into: "privateNoteCreated" }) },
        { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "clearForm", order: 2, paramsJson: JSON.stringify({ widget: "todo_private_notes_form" }) },
        { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "run", order: 3, paramsJson: JSON.stringify({ event: "load" }) },
        { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_widget_editor_form", into: "widgetDraft", schema: "widget.define" }) },
        { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "postJson", order: 1, paramsJson: JSON.stringify({ url: "/api/widgets", method: "POST", from: "widgetDraft", into: "widgetCreated" }) },
        { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "clearForm", order: 2, paramsJson: JSON.stringify({ widget: "todo_widget_editor_form" }) },
        { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "run", order: 3, paramsJson: JSON.stringify({ event: "load" }) },
        { program: "todo_frontend_program", event: "error", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "Failed: \${event.message}" }) }
      ];
      for (const definition of steps) await step(definition);

      const routes = [
        { id: "home_page_route", path: "/", serves: "todoAppView", method: "GET", handler: "page.home", rootWidget: "todo_app_widget", frontendProgram: "todo_frontend_program", page: "home", liveProjection: true },
        { id: "session_read_route", path: "/api/session", serves: "session", method: "GET", handler: "session.read" },
        { id: "session_open_route", path: "/api/session", serves: "session", method: "POST", handler: "session.open" },
        { id: "session_logout_route", path: "/api/session", serves: "session", method: "DELETE", handler: "session.logout" },
        { id: "todos_list_route", path: "/api/todos", serves: "todoStore", method: "GET", handler: "todos.list" },
        { id: "todos_create_route", path: "/api/todos", serves: "todoStore", method: "POST", handler: "todos.create" },
        { id: "todos_update_route", path: "/api/todos/:id", serves: "todoStore", method: "PATCH", handler: "todos.update" },
        { id: "todos_delete_route", path: "/api/todos/:id", serves: "todoStore", method: "DELETE", handler: "todos.delete" },
        { id: "private_notes_list_route", path: "/api/private-notes", serves: "privateNotes", method: "GET", handler: "privateNotes.list" },
        { id: "private_notes_create_route", path: "/api/private-notes", serves: "privateNotes", method: "POST", handler: "privateNotes.create" },
        { id: "widgets_create_route", path: "/api/widgets", serves: "widgetEditor", method: "POST", handler: "widgets.create", defaultRootWidget: "todo_app_widget" },
        { id: "process_events_route", path: "/api/process-events", serves: "processEvents", method: "POST", handler: "processEvents.record" }
      ];
      for (const definition of routes) await route(definition);
      for (const definition of routes) await serve({ serverRunner: "demo_server", route: definition.id });
    }

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
      const form = event.currentTarget;
      try {
        const data = readForm(form);
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
