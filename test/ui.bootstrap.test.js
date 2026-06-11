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
