import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer, waitForAppReady } from "./support/harness.js";

async function waitUntil(predicate, { timeoutMs = 5000, stepMs = 50, message = "condition not met" } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, stepMs));
  }
  throw new Error(`Timed out waiting for: ${message}`);
}

async function readTodos(serverUrl, headers = {}) {
  const response = await fetch(`${serverUrl}/api/todos`, { headers });
  return response.json();
}

async function createTodo(serverUrl, title, actor) {
  const response = await fetch(`${serverUrl}/api/todos`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(actor ? { "x-witness-actor": actor } : {})
    },
    body: JSON.stringify({ title })
  });
  return response.json();
}

test("frontend form and click interactions mutate rendered state and witnesses", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    const baselineTodos = await readTodos(server.url, { "x-witness-actor": "aaron" });
    if (!Array.isArray(baselineTodos.todos) || baselineTodos.todos.length === 0) {
      await createTodo(server.url, "Seeded todo", "aaron");
    }
    const seededTodos = await readTodos(server.url, { "x-witness-actor": "aaron" });
    const baselineTodoCount = Array.isArray(seededTodos.todos) ? seededTodos.todos.length : 0;
    assert.ok(baselineTodoCount > 0);

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => {
      const select = document.querySelector('[data-widget="todo_actor_select"]');
      return Boolean(select && select.querySelector('option[value="aaron"]'));
    });

    await page.selectOption('[data-widget="todo_actor_select"]', "aaron");
    await page.locator('[data-widget="todo_open_button"]').click();
    await page.waitForFunction(() => {
      const sessionRoot = document.querySelector('[data-widget="todo_session"]');
      const bodyActor = document.body.dataset.actor;
      return Boolean(sessionRoot && bodyActor === "aaron" && window.localStorage.getItem("witness.actor") === "aaron");
    });

    await page.fill('[data-widget="todo_input"]', "Write harness tests");
    await page.locator('[data-widget="todo_add_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return status && status.textContent.includes("Saving...");
    });
    await waitUntil(async () => {
      const afterTodos = await readTodos(server.url);
      return Array.isArray(afterTodos.todos) && afterTodos.todos.length > baselineTodoCount;
    }, { message: "todo creation persisted in api response" });

    const firstToggle = page.locator('[data-action="toggleTodo"]').first();
    await firstToggle.waitFor();
    const targetTodoId = await firstToggle.getAttribute("data-id");
    const targetTodoButtonSaysDone = await firstToggle.getAttribute("data-done") === "true";
    const targetTodoOriginalDone = !targetTodoButtonSaysDone;
    assert.ok(targetTodoId, "expected a rendered todo action button");

    await firstToggle.click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return status && status.textContent.includes("Updating...");
    });
    await waitUntil(async () => {
      const updatedTodos = await readTodos(server.url, { "x-witness-actor": "aaron" });
      const updated = updatedTodos.todos?.find(todo => todo.id === targetTodoId);
      return updated && updated.done !== targetTodoOriginalDone;
    }, { message: "todo toggled via api response" });

    await page.locator(`[data-action="deleteTodo"][data-id="${targetTodoId}"]`).first().click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return status && status.textContent.includes("Deleting...");
    });
    await waitUntil(async () => {
      const updatedTodos = await readTodos(server.url, { "x-witness-actor": "aaron" });
      return !updatedTodos.todos?.some(todo => todo.id === targetTodoId);
    }, { message: "todo removed from api store" });

    await page.locator('[data-widget="todo_simulate_network_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return status && status.textContent.includes("Simulated network failure witnessed.");
    });

    const witnessResponse = await fetch(`${server.url}/api/witnesses`, { headers: { "x-witness-actor": "aaron" }}).then(r => r.json());
    assert.equal(witnessResponse.witnesses.some(w => w.process === "network.simulated.failed"), true);

    await page.locator('[data-widget="todo_logout_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="todo_session_status"]');
      return status && status.textContent.includes("No personal projection selected");
    });

    await page.fill('[data-widget="todo_private_note_input"]', "should fail without actor");
    await page.locator('[data-widget="todo_private_note_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return status && status.textContent.startsWith("Failed:");
    });
    assert.match((await page.locator('[data-role="app-status"]').textContent()) || "", /Failed:/);

    const runtimeMessages = [
      ...runtime.pageErrors.map(error => error.message),
      ...runtime.consoleErrors.map(error => error.message)
    ];
    const unexpectedMessages = runtimeMessages.filter(message => {
      if (message.includes("503")) return false;
      if (message.includes("401")) return false;
      return message.trim().length > 0;
    });
    assert.equal(unexpectedMessages.length, 0, `runtime errors detected:\n${unexpectedMessages.join("\n")}`);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
