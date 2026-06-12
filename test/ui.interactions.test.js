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

async function openSession(serverUrl, { username = "aaron", password = username } = {}) {
  const response = await fetch(`${serverUrl}/api/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });
  return {
    response,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || ""
  };
}

async function cookieHeaderFor(context, url) {
  const cookies = await context.cookies(url);
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}

test("frontend form and click interactions mutate rendered state and witnesses", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    let navigationCount = 0;
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) navigationCount += 1;
    });

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => {
      const username = document.querySelector('[data-widget="todo_username_input"]');
      const password = document.querySelector('[data-widget="todo_password_input"]');
      return Boolean(username && password);
    });

    await page.fill('[data-widget="todo_username_input"]', "aaron");
    await page.fill('[data-widget="todo_password_input"]', "aaron");
    await page.locator('[data-widget="todo_open_button"]').click();
    await page.waitForFunction(() => {
      const sessionStatus = document.querySelector('[data-widget="todo_session_status"]');
      const bodyActor = document.body.dataset.actor;
      return Boolean(sessionStatus && sessionStatus.textContent.includes("Signed in as Aaron") && bodyActor === "aaron");
    });
    const sessionCookie = await cookieHeaderFor(page.context(), server.url);
    const navigationsAfterLogin = navigationCount;

    await page.locator('[data-widget="todo_activate_v2"]').click();
    await page.waitForFunction(() => {
      const banner = document.querySelector('[data-widget="todo_versioned_banner"]');
      return Boolean(banner && banner.textContent && banner.textContent.includes("Versioned widget: v2"));
    });
    assert.equal(navigationCount, navigationsAfterLogin, "widget activation should not trigger a page navigation");

    await page.fill('[data-widget="todo_input"]', "Write harness tests");
    await page.locator('[data-widget="todo_add_button"]').click();
    await page.waitForFunction(() => {
      const input = document.querySelector('[data-widget="todo_input"]');
      const status = document.querySelector('[data-role="app-status"]');
      return Boolean((input && input.value === "") || (status && status.textContent.includes("Saving...")));
    });
    await waitUntil(async () => {
      const afterTodos = await readTodos(server.url);
      return Array.isArray(afterTodos.todos) && afterTodos.todos.some(todo => todo.title === "Write harness tests");
    }, { message: "todo creation persisted in api response" });

    const afterCreate = await readTodos(server.url, { cookie: sessionCookie });
    const createdTodo = afterCreate.todos?.find(todo => todo.title === "Write harness tests");
    assert.ok(createdTodo, "expected created todo in api response");
    const firstToggle = page.locator(`[data-action="toggleTodo"][data-id="${createdTodo.id}"]`).first();
    await firstToggle.waitFor();
    const targetTodoId = await firstToggle.getAttribute("data-id");
    const targetTodoButtonSaysDone = await firstToggle.getAttribute("data-done") === "true";
    const targetTodoOriginalDone = !targetTodoButtonSaysDone;
    assert.ok(targetTodoId, "expected a rendered todo action button");

    await firstToggle.click();
    await waitUntil(async () => {
      const updatedTodos = await readTodos(server.url, { cookie: sessionCookie });
      const updated = updatedTodos.todos?.find(todo => todo.id === targetTodoId);
      return updated && updated.done !== targetTodoOriginalDone;
    }, { message: "todo toggled via api response" });

    await page.locator(`[data-action="deleteTodo"][data-id="${targetTodoId}"]`).first().click();
    await waitUntil(async () => {
      const updatedTodos = await readTodos(server.url, { cookie: sessionCookie });
      return !updatedTodos.todos?.some(todo => todo.id === targetTodoId);
    }, { message: "todo removed from api store" });

    await page.locator('[data-widget="todo_simulate_network_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return status && status.textContent.includes("Simulated network failure witnessed.");
    });

    const witnessResponse = await fetch(`${server.url}/api/witnesses`, { headers: { cookie: sessionCookie }}).then(r => r.json());
    assert.equal(witnessResponse.witnesses.some(w => w.process === "network.simulated.failed"), true);

    await page.locator('[data-widget="todo_logout_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="todo_session_status"]');
      return status && status.textContent.includes("Not signed in");
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

test("shared todo page switches shared controls into proposal mode for signed-in non-stewards", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ title: "Shared seed" })
    });

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.fill('[data-widget="todo_username_input"]', "callan");
    await page.fill('[data-widget="todo_password_input"]', "callan");
    await page.locator('[data-widget="todo_open_button"]').click();
    await page.waitForFunction(() => {
      const sessionStatus = document.querySelector('[data-widget="todo_session_status"]');
      const addButton = document.querySelector('[data-widget="todo_add_button"]');
      const widgetButton = document.querySelector('[data-widget="todo_widget_editor_button"]');
      const activateV2 = document.querySelector('[data-widget="todo_activate_v2"]');
      const rollback = document.querySelector('[data-widget="todo_rollback_version"]');
      const status = document.querySelector('[data-role="app-status"]');
      return Boolean(
        sessionStatus?.textContent?.includes("Signed in as Callan")
          && addButton?.textContent?.includes("Propose Add")
          && widgetButton?.textContent?.includes("Propose Add Widget")
          && activateV2?.textContent?.includes("Propose Activate v2")
          && rollback?.textContent?.includes("Propose Rollback")
          && status?.textContent?.includes("proposed for review")
      );
    });

    const callanCookie = await cookieHeaderFor(page.context(), server.url);
    await page.fill('[data-widget="todo_input"]', "Callan proposal");
    await page.locator('[data-widget="todo_add_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return Boolean(status?.textContent?.includes("Proposed add for review."));
    });

    const todos = await readTodos(server.url, { cookie: callanCookie });
    assert.equal(todos.todos.some(todo => todo.title === "Callan proposal"), false);

    await page.selectOption('[data-widget="todo_widget_kind"]', "Text");
    await page.fill('[data-widget="todo_widget_text"]', "Callan widget proposal");
    await page.locator('[data-widget="todo_widget_editor_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-role="app-status"]');
      return Boolean(status?.textContent?.includes("Proposed widget for review."));
    });

    await page.locator('[data-widget="todo_activate_v2"]').click();
    await page.waitForFunction(() => {
      const banner = document.querySelector('[data-widget="todo_versioned_banner"]');
      const status = document.querySelector('[data-role="app-status"]');
      return Boolean(
        banner?.textContent?.includes("Versioned widget: v1")
          && status?.textContent?.includes("Proposed widget version activation for review.")
      );
    });

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanCookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "proposal.create"), true);
    assert.equal(witnesses.witnesses.some(w => w.process === "todo.create" && w.actor === "callan"), false);
    assert.equal(witnesses.witnesses.some(w => w.process === "widget.define" && w.actor === "callan"), false);
    assert.equal(witnesses.witnesses.some(w => w.process === "activateWidgetVersion" && w.actor === "callan"), false);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("private notes surface stays explicitly actor-private across sign-in state", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => {
      const notesStatus = document.querySelector('[data-role="private-notes-status"]');
      return Boolean(notesStatus?.textContent?.includes("belong only to you"));
    });

    await page.fill('[data-widget="todo_username_input"]', "aaron");
    await page.fill('[data-widget="todo_password_input"]', "aaron");
    await page.locator('[data-widget="todo_open_button"]').click();
    await page.waitForFunction(() => {
      const notesStatus = document.querySelector('[data-role="private-notes-status"]');
      return Boolean(notesStatus?.textContent?.includes("Only you can see these notes"));
    });

    await page.fill('[data-widget="todo_private_note_input"]', "Private seam");
    await page.locator('[data-widget="todo_private_note_button"]').click();
    await page.waitForFunction(() => {
      const list = document.querySelector('[data-role="private-note-list"]');
      return Boolean(list?.textContent?.includes("Private seam"));
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
