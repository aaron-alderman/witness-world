import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startBlankUiServer, waitForAppReady } from "./support/harness.js";

async function waitUntil(predicate, { timeoutMs = 5000, stepMs = 50, message = "condition not met" } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, stepMs));
  }
  throw new Error(`Timed out waiting for: ${message}`);
}

async function cookieHeaderFor(context, url) {
  const cookies = await context.cookies(url);
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}

async function readTodos(serverUrl, headers = {}) {
  return fetch(`${serverUrl}/api/todos`, { headers }).then(response => response.json());
}

async function readNotes(serverUrl, headers = {}) {
  return fetch(`${serverUrl}/api/private-notes`, { headers }).then(response => response.json());
}

test("blank world can bootstrap into a working todo app purely through the UI", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, context, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));

    await page.fill('#identity-form input[name="id"]', "identity.aaron");
    await page.fill('#identity-form input[name="actor"]', "aaron");
    await page.fill('#identity-form input[name="label"]', "Aaron");
    await page.fill('#identity-form input[name="username"]', "aaron");
    await page.fill('#identity-form input[name="password"]', "aaron");
    await page.fill('#identity-form input[name="homePerspective"]', "aaron:personal");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("identity-status")?.textContent.includes("Identity created."));

    await page.fill('#session-form input[name="username"]', "aaron");
    await page.fill('#session-form input[name="password"]', "aaron");
    await page.locator('#session-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    await page.locator("#open-app-link").click();
    await waitForAppReady(page);
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="todo_session_status"]');
      return Boolean(status && status.textContent.includes("Signed in as Aaron"));
    });

    const sessionCookie = await cookieHeaderFor(context, server.url);

    await page.fill('[data-widget="todo_input"]', "Bootstrap todo");
    await page.locator('[data-widget="todo_add_button"]').click();
    await waitUntil(async () => {
      const todos = await readTodos(server.url, { cookie: sessionCookie });
      return Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === "Bootstrap todo");
    }, { message: "todo created through bootstrap-authored app" });

    const createdTodos = await readTodos(server.url, { cookie: sessionCookie });
    const createdTodo = createdTodos.todos.find(todo => todo.title === "Bootstrap todo");
    assert.ok(createdTodo, "expected bootstrap-created todo");

    await page.locator(`[data-action="toggleTodo"][data-id="${createdTodo.id}"]`).click();
    await waitUntil(async () => {
      const todos = await readTodos(server.url, { cookie: sessionCookie });
      return todos.todos?.some(todo => todo.id === createdTodo.id && todo.done === true);
    }, { message: "todo toggled through bootstrap-authored app" });

    await page.locator(`[data-action="deleteTodo"][data-id="${createdTodo.id}"]`).click();
    await waitUntil(async () => {
      const todos = await readTodos(server.url, { cookie: sessionCookie });
      return !todos.todos?.some(todo => todo.id === createdTodo.id);
    }, { message: "todo deleted through bootstrap-authored app" });

    await page.fill('[data-widget="todo_private_note_input"]', "Bootstrap private note");
    await page.locator('[data-widget="todo_private_note_button"]').click();
    await waitUntil(async () => {
      const notes = await readNotes(server.url, { cookie: sessionCookie });
      return Array.isArray(notes.notes) && notes.notes.some(note => note.text === "Bootstrap private note");
    }, { message: "private note created through bootstrap-authored app" });

    const bootstrapPage = await fetch(`${server.url}/_bootstrap`, { headers: { cookie: sessionCookie } }).then(response => response.text());
    assert.match(bootstrapPage, /Semi-Internal Bootstrap Seam/);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can define, install, and remove a route-page capability", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));

    await page.fill('#identity-form input[name="id"]', "identity.aaron");
    await page.fill('#identity-form input[name="actor"]', "aaron");
    await page.fill('#identity-form input[name="label"]', "Aaron");
    await page.fill('#identity-form input[name="username"]', "aaron");
    await page.fill('#identity-form input[name="password"]', "aaron");
    await page.fill('#identity-form input[name="homePerspective"]', "aaron:personal");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("identity-status")?.textContent.includes("Identity created."));

    await page.fill('#session-form input[name="username"]', "aaron");
    await page.fill('#session-form input[name="password"]', "aaron");
    await page.locator('#session-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    await page.locator('summary').filter({ hasText: 'Capabilities' }).click();
    await page.fill('#capability-form input[name="id"]', "notes.sidebar");
    await page.fill('#capability-form input[name="label"]', "Notes Sidebar");
    await page.fill('#capability-form input[name="version"]', "0.1.0");
    await page.fill('#capability-form textarea[name="placementJson"]', '["routePage"]');
    await page.fill('#capability-form textarea[name="dependsOnJson"]', '[]');
    await page.locator('#capability-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("capability-status")?.textContent.includes("Saved."));

    await page.selectOption('#capability-install-capability', "notes.sidebar");
    await page.selectOption('#capability-install-kind', "routePage");
    await page.selectOption('#capability-install-target', "home_page_route");
    await page.locator('#capability-install-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("capability-install-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-capability-installs")?.textContent.includes("home_page_route"));

    await page.selectOption('#capability-remove-capability', "notes.sidebar");
    await page.selectOption('#capability-remove-kind', "routePage");
    await page.selectOption('#capability-remove-target', "home_page_route");
    await page.locator('#capability-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("capability-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-capability-installs")?.textContent.includes("notes.sidebar"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can create governance objects and approve a guarded proposal", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));

    await page.fill('#identity-form input[name="id"]', "identity.aaron");
    await page.fill('#identity-form input[name="actor"]', "aaron");
    await page.fill('#identity-form input[name="label"]', "Aaron");
    await page.fill('#identity-form input[name="username"]', "aaron");
    await page.fill('#identity-form input[name="password"]', "aaron");
    await page.fill('#identity-form input[name="homePerspective"]', "aaron:personal");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("identity-status")?.textContent.includes("Identity created."));

    await page.fill('#session-form input[name="username"]', "aaron");
    await page.fill('#session-form input[name="password"]', "aaron");
    await page.locator('#session-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));

    await page.fill('#identity-form input[name="id"]', "identity.callan");
    await page.fill('#identity-form input[name="actor"]', "callan");
    await page.fill('#identity-form input[name="label"]', "Callan");
    await page.fill('#identity-form input[name="username"]', "callan");
    await page.fill('#identity-form input[name="password"]', "callan");
    await page.fill('#identity-form input[name="homePerspective"]', "callan:personal");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-identities")?.textContent.includes("identity.callan"));

    await page.fill('#context-form input[name="id"]', "ctx.platform");
    await page.fill('#context-form input[name="label"]', "Platform");
    await page.locator('#context-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("context-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-contexts")?.textContent.includes("ctx.platform"));

    await page.fill('#perspective-form input[name="id"]', "platform.board");
    await page.fill('#perspective-form input[name="title"]', "Platform Board");
    await page.selectOption('#perspective-context', "ctx.platform");
    await page.locator('#perspective-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("perspective-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-perspectives")?.textContent.includes("platform.board"));

    await page.locator('summary').filter({ hasText: "Stewardship" }).click();
    await page.selectOption('#stewardship-target-kind', "context");
    await page.selectOption('#stewardship-target', "ctx.platform");
    await page.fill('#stewardship-form input[name="steward"]', "callan");
    await page.locator('#stewardship-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("stewardship-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-stewardships")?.textContent.includes("callan -> ctx.platform"));

    await page.locator('summary').filter({ hasText: "Proposals" }).click();
    await page.fill('#proposal-form input[name="id"]', "proposal.widget.platform-home");
    await page.selectOption('#proposal-target-process', "widget.define");
    await page.fill('#proposal-form input[name="targetKind"]', "widget");
    await page.fill('#proposal-form input[name="targetId"]', "platform_home");
    await page.fill('#proposal-form textarea[name="bodyJson"]', '{"id":"platform_home","kind":"Page","title":"Platform Home","attach":false,"context":"ctx.platform"}');
    await page.fill('#proposal-form input[name="reason"]', "Need a governed home page");
    await page.locator('#proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.widget.platform-home [open] widget.define"));

    await page.selectOption('#proposal-approve-id', "proposal.widget.platform-home");
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.widget.platform-home [approved] widget.define"));
    await page.waitForFunction(() => document.getElementById("state-widgets")?.textContent.includes("platform_home (Page)"));
    await page.waitForFunction(() => document.getElementById("state-authority")?.textContent.includes("ctx.platform"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can bind, export, import, and consume contextual names", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));

    await page.fill('#identity-form input[name="id"]', "identity.aaron");
    await page.fill('#identity-form input[name="actor"]', "aaron");
    await page.fill('#identity-form input[name="label"]', "Aaron");
    await page.fill('#identity-form input[name="username"]', "aaron");
    await page.fill('#identity-form input[name="password"]', "aaron");
    await page.fill('#identity-form input[name="homePerspective"]', "aaron:personal");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("identity-status")?.textContent.includes("Identity created."));

    await page.fill('#session-form input[name="username"]', "aaron");
    await page.fill('#session-form input[name="password"]', "aaron");
    await page.locator('#session-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));

    await page.fill('#context-form input[name="id"]', "ctx.source");
    await page.fill('#context-form input[name="label"]', "Source");
    await page.locator('#context-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-contexts")?.textContent.includes("ctx.source"));

    await page.fill('#context-form input[name="id"]', "ctx.target");
    await page.fill('#context-form input[name="label"]', "Target");
    await page.selectOption('#context-parent', "ctx.source");
    await page.locator('#context-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-contexts")?.textContent.includes("ctx.target"));

    await page.fill('#widget-form input[name="id"]', "page_root");
    await page.selectOption('#widget-kind', "Page");
    await page.selectOption('#widget-context', "ctx.source");
    await page.fill('#widget-form input[name="title"]', "Home");
    await page.locator('#widget-form input[name="attach"]').uncheck();
    await page.locator('#widget-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-widgets")?.textContent.includes("page_root (Page)"));

    await page.locator('summary').filter({ hasText: "Naming And Scope" }).click();
    await page.selectOption('#context-binding-context', "ctx.source");
    await page.fill('#context-binding-form input[name="name"]', "homePage");
    await page.selectOption('#context-binding-target', "page_root");
    await page.locator('#context-binding-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-context-bindings")?.textContent.includes("ctx.source :: homePage -> page_root"));

    await page.selectOption('#context-export-context', "ctx.source");
    await page.fill('#context-export-form input[name="name"]', "homePage");
    await page.selectOption('#context-export-target', "page_root");
    await page.locator('#context-export-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-context-exports")?.textContent.includes("ctx.source :: homePage -> page_root"));

    await page.selectOption('#context-import-context', "ctx.target");
    await page.selectOption('#context-import-source-context', "ctx.source");
    await page.selectOption('#context-import-export-name', "homePage");
    await page.fill('#context-import-form input[name="name"]', "landingPage");
    await page.locator('#context-import-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-context-imports")?.textContent.includes("ctx.target <- ctx.source :: landingPage => homePage"));

    await page.locator('summary').filter({ hasText: "Frontend Programs" }).click();
    await page.fill('#program-form input[name="id"]', "landing_program");
    await page.selectOption('#program-context', "ctx.target");
    await page.fill('#program-form input[name="rootWidgetRef"]', "landingPage");
    await page.locator('#program-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-programs")?.textContent.includes("landing_program -> page_root"));
    await page.waitForFunction(() => document.getElementById("state-context-scopes")?.textContent.includes("ctx.target :: landingPage -> page_root [import]"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI surfaces truthful next-step suggestions from real world state", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));

    await page.waitForFunction(() => {
      const suggestions = window.__witnessTutorial?.suggestions || [];
      return suggestions.some(row => row.id === "create-first-identity")
        && document.getElementById("tutorial-suggestions")?.textContent.includes("Create The First Identity");
    });

    await page.fill('#identity-form input[name="id"]', "identity.aaron");
    await page.fill('#identity-form input[name="actor"]', "aaron");
    await page.fill('#identity-form input[name="label"]', "Aaron");
    await page.fill('#identity-form input[name="username"]', "aaron");
    await page.fill('#identity-form input[name="password"]', "aaron");
    await page.fill('#identity-form input[name="homePerspective"]', "aaron:personal");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("identity-status")?.textContent.includes("Identity created."));

    await page.fill('#session-form input[name="username"]', "aaron");
    await page.fill('#session-form input[name="password"]', "aaron");
    await page.locator('#session-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));
    await page.waitForFunction(() => {
      const suggestions = window.__witnessTutorial?.suggestions || [];
      return suggestions.some(row => row.id === "starter-shortcut")
        && document.getElementById("tutorial-suggestions")?.textContent.includes("Show Starter Control");
    });

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await page.waitForFunction(() => {
      const suggestions = window.__witnessTutorial?.suggestions || [];
      return suggestions.some(row => row.id === "open-live-app")
        && document.getElementById("tutorial-suggestions")?.textContent.includes("Open The Live App");
    });

    await page.locator('#tutorial-suggestions button[data-suggestion-id="open-live-app"]').click();
    await waitForAppReady(page);
    await page.waitForFunction(() => document.body.textContent.includes("Witness Todo"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
