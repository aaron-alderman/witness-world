import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startBlankUiServer, startBlankUiServerWithWorldHome, waitForAppReady } from "./support/harness.js";

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

function lastApiRequestBody(api, routePath) {
  const request = [...api.getCalls(routePath)].reverse().find(call => call.type === "request");
  assert.ok(request?.postData, `expected API request for ${routePath}`);
  return JSON.parse(request.postData);
}

function widgetInput(input) {
  const id = typeof input?.id === "string" && input.id.trim() ? input.id.trim() : "widget";
  return {
    guidanceTarget: input?.guidanceTarget ?? input?.tutorialTarget ?? id,
    ...input
  };
}

async function readTodos(serverUrl, headers = {}) {
  return fetch(`${serverUrl}/api/todos`, { headers }).then(response => response.json());
}

async function readNotes(serverUrl, headers = {}) {
  return fetch(`${serverUrl}/api/private-notes`, { headers }).then(response => response.json());
}

async function readWitnesses(serverUrl, headers = {}) {
  return fetch(`${serverUrl}/api/witnesses`, { headers }).then(response => response.json());
}

async function openStarterDetails(page) {
  await page.locator('summary').filter({ hasText: "Advanced Shortcut" }).evaluate(node => {
    node.parentElement.open = true;
  });
}

test("blank world can bootstrap into a working todo app purely through the UI", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, context, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));
    assert.equal(await page.locator('#backend-program-form').count(), 1);
    assert.equal(await page.locator('#route-backend-program-soul').count(), 1);

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

    await openStarterDetails(page);
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await page.waitForFunction(() => document.getElementById("create-todo-starter")?.disabled === true);

    await page.locator("#open-app-link").click();
    await waitForAppReady(page);
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="todo_session_status"]');
      return Boolean(status && status.textContent.includes("Signed in as Aaron"));
    });

    const sessionCookie = await cookieHeaderFor(context, server.url);
    const bootstrapState = await fetch(`${server.url}/api/bootstrap-state`, {
      headers: { cookie: sessionCookie }
    }).then(response => response.json());
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.todos.list"), true);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.todos.create"), true);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.todos.update"), true);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.todos.delete"), true);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.privateNotes.list"), true);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.privateNotes.create"), true);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.widgets.create"), true);
    assert.equal(bootstrapState.backendPrograms.filter(row => row.soul === "todo.widgets.create").length, 1);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.witnesses.list"), true);
    assert.equal(bootstrapState.backendPrograms.filter(row => row.soul === "todo.witnesses.list").length, 1);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.network.simulateError"), true);
    assert.equal(bootstrapState.backendPrograms.filter(row => row.soul === "todo.network.simulateError").length, 1);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.worldGraph.read"), true);
    assert.equal(bootstrapState.backendPrograms.filter(row => row.soul === "todo.worldGraph.read").length, 1);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.processView.read"), true);
    assert.equal(bootstrapState.backendPrograms.filter(row => row.soul === "todo.processView.read").length, 1);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.processRun.read"), true);
    assert.equal(bootstrapState.backendPrograms.filter(row => row.soul === "todo.processRun.read").length, 1);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === "todo.processEvents.record"), true);
    assert.equal(bootstrapState.backendPrograms.filter(row => row.soul === "todo.processEvents.record").length, 1);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.todos.list.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.todos.create.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.todos.update.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.todos.delete.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.privateNotes.list.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.privateNotes.create.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.widgets.create.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.filter(row => row.version === "todo.widgets.create.v1").length, 1);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.witnesses.list.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.filter(row => row.version === "todo.witnesses.list.v1").length, 1);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.network.simulateError.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.filter(row => row.version === "todo.network.simulateError.v1").length, 1);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.worldGraph.read.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.filter(row => row.version === "todo.worldGraph.read.v1").length, 1);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.processView.read.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.filter(row => row.version === "todo.processView.read.v1").length, 1);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.processRun.read.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.filter(row => row.version === "todo.processRun.read.v1").length, 1);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.version === "todo.processEvents.record.v1" && row.active === true), true);
    assert.equal(bootstrapState.backendProgramVersions.filter(row => row.version === "todo.processEvents.record.v1").length, 1);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.todos.list.v2" && row.op === "run"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.todos.create.v1" && row.op === "request.readJson"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.todos.update.v1" && row.op === "state.assign"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.todos.delete.v1" && row.op === "handler.invoke"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.privateNotes.list.v1" && row.op === "response.json"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.privateNotes.create.v1" && row.op === "request.readJson"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.widgets.create.v1" && row.op === "handler.invoke"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.witnesses.list.v1" && row.op === "handler.invoke"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.network.simulateError.v1" && row.op === "response.error"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.worldGraph.read.v2" && row.op === "run"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.processView.read.v2" && row.op === "run"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.processRun.read.v2" && row.op === "run"), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === "todo.processEvents.record.v2" && row.op === "response.error"), true);
    assert.equal(bootstrapState.routes.some(row => row.id === "events_stream_route" && row.handler === "events.stream"), true);

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

    const witnesses = await readWitnesses(server.url, { cookie: sessionCookie });
    assert.equal(Array.isArray(witnesses.witnesses), true);
    assert.equal(typeof witnesses.total, "number");

    const simulatedFailure = await fetch(`${server.url}/api/simulate-network-error`, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(simulatedFailure.status, 503);
    assert.equal((await simulatedFailure.json()).error, "simulated network error");

    const worldGraph = await fetch(`${server.url}/api/world-graph`, {
      headers: { cookie: sessionCookie }
    }).then(response => response.json());
    assert.equal(Array.isArray(worldGraph.graph?.nodes), true);
    assert.equal(Array.isArray(worldGraph.graph?.edges), true);

    const processView = await fetch(`${server.url}/api/process-view?program=todo.todos.list.v1&event=request`, {
      headers: { cookie: sessionCookie }
    }).then(response => response.json());
    assert.equal(processView.selection.program, "todo.todos.list.v1");
    assert.equal(processView.selection.event, "request");
    assert.equal(Array.isArray(processView.catalog), true);
    assert.equal(Array.isArray(processView.runs), true);
    assert.equal(processView.run.requests.some(request => request.handler === "todos.readModel"), true);

    const processRun = await fetch(`${server.url}/api/process-runs/${processView.run.runId}?replay=1`, {
      headers: { cookie: sessionCookie }
    }).then(response => response.json());
    assert.equal(processRun.run.runId, processView.run.runId);
    assert.equal(processRun.run.requests.some(request => request.handler === "todos.readModel"), true);
    assert.equal(processRun.replay.cursor, 1);

    const recordedTrace = await fetch(`${server.url}/api/process-events`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ process: "frontend.process.start", runId: "bootstrap-trace-run", program: "todo_frontend_program", event: "load", timestamp: Date.now() })
    });
    assert.equal(recordedTrace.status, 200);
    assert.equal((await recordedTrace.json()).ok, true);

    const bootstrapPage = await fetch(`${server.url}/_bootstrap`, { headers: { cookie: sessionCookie } }).then(response => response.text());
    assert.match(bootstrapPage, /Semi-Internal Bootstrap Seam/);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can author backend programs, versions, and steps through authored backend controls", async () => {
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

    const sessionCookie = await cookieHeaderFor(context, server.url);
    const backendContext = "demo:backend";
    const contextCreateResponse = await fetch(`${server.url}/api/contexts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie
      },
      body: JSON.stringify({ id: backendContext })
    });
    assert.equal(contextCreateResponse.status, 201);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));

    await page.evaluate(() => {
      const heading = [...document.querySelectorAll("summary")].find(node => node.textContent?.includes("Backend Programs"));
      heading?.closest("details")?.setAttribute("open", "");
    });
    await waitUntil(async () => {
      const values = await page.locator('#backend-program-context option').evaluateAll(options => options.map(option => option.value));
      return values.includes(backendContext);
    }, { message: "backend context available to backend authoring forms" });

    const alphaSoul = "demo.backend.alpha";
    const betaSoul = "demo.backend.beta";
    const alphaVersion = "demo.backend.alpha.v1";
    const betaVersion = "demo.backend.beta.v1";

    await page.fill('#backend-program-form input[name="soul"]', alphaSoul);
    await page.fill('#backend-program-form input[name="label"]', "Demo Backend Alpha");
    await page.selectOption('#backend-program-context', backendContext);
    await page.locator('#backend-program-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("backend-program-status")?.textContent.includes("Saved."));
    await waitUntil(async () => {
      const values = await page.locator('#backend-program-version-soul option').evaluateAll(options => options.map(option => option.value));
      return values.includes(alphaSoul);
    }, { message: "alpha backend program available to version form" });

    await page.fill('#backend-program-form input[name="soul"]', betaSoul);
    await page.fill('#backend-program-form input[name="label"]', "Demo Backend Beta");
    await page.selectOption('#backend-program-context', backendContext);
    await page.locator('#backend-program-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("backend-program-status")?.textContent.includes("Saved."));
    await waitUntil(async () => {
      const values = await page.locator('#backend-program-version-soul option').evaluateAll(options => options.map(option => option.value));
      return values.includes(betaSoul);
    }, { message: "beta backend program available to version form" });

    await page.selectOption('#backend-program-version-soul', alphaSoul);
    await page.selectOption('#backend-program-version-context', backendContext);
    await page.fill('#backend-program-version-form input[name="version"]', alphaVersion);
    await page.locator('#backend-program-version-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("backend-program-version-status")?.textContent.includes("Saved."));
    await waitUntil(async () => {
      const values = await page.locator('#backend-step-version option').evaluateAll(options => options.map(option => option.value));
      return values.includes(alphaVersion);
    }, { message: "alpha backend version available to backend step form" });

    await page.selectOption('#backend-program-version-soul', betaSoul);
    await page.selectOption('#backend-program-version-context', backendContext);
    await page.fill('#backend-program-version-form input[name="version"]', betaVersion);
    await page.locator('#backend-program-version-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("backend-program-version-status")?.textContent.includes("Saved."));
    await waitUntil(async () => {
      const values = await page.locator('#backend-step-version option').evaluateAll(options => options.map(option => option.value));
      return values.includes(betaVersion);
    }, { message: "beta backend version available to backend step form" });

    await page.selectOption('#backend-program-version-soul', alphaSoul);
    await waitUntil(async () => {
      const values = await page.locator('#backend-program-version-transition-from option').evaluateAll(options => options.map(option => option.value));
      return values.includes(alphaVersion) && !values.includes(betaVersion);
    }, { message: "alpha backend transition options recomputed through authored change trigger" });

    await page.selectOption('#backend-program-version-soul', betaSoul);
    await waitUntil(async () => {
      const values = await page.locator('#backend-program-version-transition-from option').evaluateAll(options => options.map(option => option.value));
      return values.includes(betaVersion) && !values.includes(alphaVersion);
    }, { message: "beta backend transition options recomputed through authored change trigger" });

    const backendOp = await page.locator('#backend-step-op').evaluate(select => {
      const options = [...select.options].map(option => option.value).filter(Boolean);
      return options[0] || "";
    });
    assert.notEqual(backendOp, "");
    await page.selectOption('#backend-step-version', alphaVersion);
    await page.selectOption('#backend-step-op', backendOp);
    await page.fill('#backend-step-form input[name="event"]', "request");
    await page.locator('#backend-step-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("backend-step-status")?.textContent.includes("Saved."));

    const bootstrapState = await fetch(`${server.url}/api/bootstrap-state`, {
      headers: { cookie: sessionCookie }
    }).then(response => response.json());
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === alphaSoul), true);
    assert.equal(bootstrapState.backendPrograms.some(row => row.soul === betaSoul), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.soul === alphaSoul && row.version === alphaVersion), true);
    assert.equal(bootstrapState.backendProgramVersions.some(row => row.soul === betaSoul && row.version === betaVersion), true);
    assert.equal(bootstrapState.backendSteps.some(row => row.version === alphaVersion && row.event === "request" && row.op === backendOp), true);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can create an operator export through the authored top-card program", async () => {
  const { server, close: closeServer } = await startBlankUiServerWithWorldHome();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

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

    await page.fill('#operator-export-form input[name="label"]', "portable-world");
    await page.locator('#operator-export-form button[type="submit"]').click();
    await page.waitForFunction(() => {
      const exportList = document.getElementById("state-operator-exports");
      return Boolean(exportList && exportList.textContent && exportList.textContent.includes("portable-world"));
    });

    const bootstrapState = await fetch(`${server.url}/api/bootstrap-state`, {
      headers: { cookie: await cookieHeaderFor(page.context(), server.url) }
    }).then(response => response.json());
    assert.equal((bootstrapState.operator?.inventory?.exports || []).length >= 1, true);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can create backups and perform restore/import through the authored top-card program", async () => {
  const { server, operatorContract, close: closeServer } = await startBlankUiServerWithWorldHome();
  const { page, context, runtime, api, close: closeBrowser } = await launchBrowser();

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

    const cookie = await cookieHeaderFor(context, server.url);
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/widgets", widgetInput({ id: "alpha_page", kind: "Page", title: "Alpha", attach: false }))).status, 201);

    await page.fill('#operator-backup-form input[name="label"]', "alpha");
    await page.locator('#operator-backup-form input[name="includeDerived"]').check();
    await page.locator('#operator-backup-form button[type="submit"]').click();

    const backupBody = lastApiRequestBody(api, "/api/operator/backups");
    assert.deepEqual(backupBody, {
      label: "alpha",
      includeDerived: true
    });

    let backupId = "";
    await waitUntil(async () => {
      const stateAfterBackup = await fetch(`${server.url}/api/bootstrap-state`, {
        headers: { cookie }
      }).then(response => response.json());
      backupId = stateAfterBackup.operator?.inventory?.backups?.[0]?.id || "";
      return Boolean(backupId);
    }, { message: "backup artifact after authored backup submit" });
    assert.ok(backupId, "expected a backup artifact after authored backup submit");
    await page.waitForFunction(expected => {
      const list = document.getElementById("state-operator-backups");
      return Boolean(list && list.textContent && list.textContent.includes(expected));
    }, backupId);

    const createdExport = await post("/api/operator/exports", { label: "alpha-export" });
    assert.equal(createdExport.status, 201);
    const exportBody = await createdExport.json();
    const importedArtifactId = exportBody.artifact.id;
    await fs.cp(exportBody.artifact.path, path.join(operatorContract.directories.importsRoot, importedArtifactId), { recursive: true });

    assert.equal((await post("/api/widgets", widgetInput({ id: "beta_page", kind: "Page", title: "Beta", attach: false }))).status, 201);

    await page.selectOption('#operator-restore-artifact', backupId);
    await page.locator('#operator-restore-form input[name="preserveCurrent"]').check();
    await page.locator('#operator-restore-form button[type="submit"]').click();

    const restoreBody = lastApiRequestBody(api, "/api/operator/restores");
    assert.deepEqual(restoreBody, {
      artifactId: backupId,
      preserveCurrent: true
    });

    await waitUntil(async () => {
      const state = await fetch(`${server.url}/api/bootstrap-state`, {
        headers: { cookie }
      }).then(response => response.json());
      return state.widgets?.some(row => row.id === "alpha_page") && !state.widgets?.some(row => row.id === "beta_page");
    }, { message: "restore result reflected in bootstrap state" });

    await page.waitForFunction(() => {
      const widgetList = document.getElementById("state-widgets");
      const text = widgetList?.textContent || "";
      return text.includes("alpha_page (Page)") && !text.includes("beta_page (Page)");
    });

    assert.equal((await post("/api/widgets", widgetInput({ id: "gamma_page", kind: "Page", title: "Gamma", attach: false }))).status, 201);

    await waitUntil(async () => {
      const state = await fetch(`${server.url}/api/bootstrap-state`, {
        headers: { cookie }
      }).then(response => response.json());
      return state.operator?.inventory?.imports?.some(row => row.id === importedArtifactId);
    }, { message: "import candidate reflected in bootstrap state" });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));
    await page.waitForFunction(importId => {
      const select = document.getElementById("operator-import-artifact");
      return Boolean(select && [...select.options].some(option => option.value === importId));
    }, importedArtifactId);
    await page.selectOption('#operator-import-artifact', importedArtifactId);
    await page.locator('#operator-import-form input[name="preserveCurrent"]').check();
    await page.locator('#operator-import-form button[type="submit"]').click();

    const importBody = lastApiRequestBody(api, "/api/operator/imports");
    assert.deepEqual(importBody, {
      artifactId: importedArtifactId,
      preserveCurrent: true
    });

    await waitUntil(async () => {
      const state = await fetch(`${server.url}/api/bootstrap-state`, {
        headers: { cookie }
      }).then(response => response.json());
      return state.widgets?.some(row => row.id === "alpha_page") && !state.widgets?.some(row => row.id === "gamma_page");
    }, { timeoutMs: 15000, message: "import result reflected in bootstrap state" });

    await page.waitForFunction(importId => {
      const importList = document.getElementById("state-operator-imports");
      const widgetList = document.getElementById("state-widgets");
      const importText = importList?.textContent || "";
      const widgetText = widgetList?.textContent || "";
      return importText.includes(importId) && widgetText.includes("alpha_page (Page)") && !widgetText.includes("gamma_page (Page)");
    }, importedArtifactId);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI routes authored top-card refresh and desktop actions through explicit host adapters", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.addInitScript(() => {
      window.__desktopCalls = [];
      window.witnessDesktop = {
        async getDesktopShellState() {
          return {
            shellId: "desktop",
            runtimeStatus: "idle",
            worldHome: "C:/worlds/demo",
            runtimeProfile: "full",
            availablePowers: ["open", "create", "reveal"]
          };
        },
        async openWorldHome() {
          window.__desktopCalls.push("open");
          return { ok: true };
        },
        async createWorldHome() {
          window.__desktopCalls.push("create");
          return { canceled: true };
        },
        async revealWorldHome() {
          window.__desktopCalls.push("reveal");
          return { ok: false, reason: "No world home to reveal." };
        }
      };
    });

    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));
    await page.waitForFunction(() => {
      const summary = document.getElementById("desktop-summary");
      const openButton = document.getElementById("desktop-open-world");
      return Boolean(
        summary && summary.textContent.includes("C:/worlds/demo")
        && openButton && openButton.disabled === false
      );
    });

    assert.equal((await page.locator("#state-identities").textContent())?.includes("identity.desktop"), false);
    await fetch(`${server.url}/api/identities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "identity.desktop",
        actor: "desktop",
        label: "Desktop User",
        username: "desktop",
        password: "desktop",
        homePerspective: "desktop:personal"
      })
    });
    assert.equal((await page.locator("#state-identities").textContent())?.includes("identity.desktop"), false);

    await page.locator("#refresh-bootstrap").click();
    await page.waitForFunction(() => document.getElementById("state-identities")?.textContent.includes("identity.desktop"));

    await page.locator("#desktop-open-world").click();
    await page.waitForFunction(() => document.getElementById("desktop-status")?.textContent.includes("Switching to the selected world home."));
    assert.deepEqual(await page.evaluate(() => window.__desktopCalls.slice()), ["open"]);

    await page.locator("#desktop-create-world").click();
    await page.waitForFunction(() => document.getElementById("desktop-status")?.textContent.includes("Create world canceled."));
    assert.deepEqual(await page.evaluate(() => window.__desktopCalls.slice()), ["open", "create"]);

    await page.locator("#desktop-reveal-world").click();
    await page.waitForFunction(() => document.getElementById("desktop-status")?.textContent.includes("No world home to reveal."));
    assert.deepEqual(await page.evaluate(() => window.__desktopCalls.slice()), ["open", "create", "reveal"]);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can create and update identities through the authored top-card program with projection-driven edit mode", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, context, runtime, api, close: closeBrowser } = await launchBrowser();

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

    assert.deepEqual(lastApiRequestBody(api, "/api/identities"), {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homeContext: "",
      homePerspective: "aaron:personal"
    });

    await page.fill('#session-form input[name="username"]', "aaron");
    await page.fill('#session-form input[name="password"]', "aaron");
    await page.locator('#session-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));

    await page.goto(`${server.url}/?identity=identity.aaron`);
    await page.waitForFunction(() => {
      const heading = document.getElementById("identity-heading");
      const submit = document.getElementById("identity-submit-button");
      const idField = document.querySelector('#identity-form input[name="id"]');
      const actorField = document.querySelector('#identity-form input[name="actor"]');
      return Boolean(
        heading && heading.textContent.includes("Edit Identity")
        && submit && submit.textContent.includes("Save Identity")
        && idField && idField.disabled === true
        && actorField && actorField.disabled === true
      );
    });

    await page.fill('#identity-form input[name="label"]', "Aaron Updated");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("identity-status")?.textContent.includes("Identity updated."));
    await page.waitForURL(url => url.searchParams.get("identity") === "identity.aaron");

    const patchRequest = [...api.getCalls("/api/identities/identity.aaron")].reverse().find(call => call.type === "request");
    assert.ok(patchRequest?.postData, "expected PATCH request for identity update");
    assert.equal(patchRequest.method, "PATCH");
    const patchBody = JSON.parse(patchRequest.postData);
    assert.equal(patchBody.label, "Aaron Updated");
    assert.equal(patchBody.username, "aaron");
    assert.equal(patchBody.password, "aaron");
    assert.equal(patchBody.homePerspective, "aaron:personal");
    assert.equal(patchBody.homeContext ?? "", "");

    const bootstrapState = await fetch(`${server.url}/api/bootstrap-state`, {
      headers: { cookie: await cookieHeaderFor(context, server.url) }
    }).then(response => response.json());
    const updatedIdentity = (bootstrapState.identities || []).find(row => row.id === "identity.aaron");
    assert.equal(updatedIdentity?.label, "Aaron Updated");

    await page.locator('#identity-create-new').click();
    await page.waitForURL(url => url.searchParams.get("identity") === null);
    await page.waitForFunction(() => {
      const heading = document.getElementById("identity-heading");
      const submit = document.getElementById("identity-submit-button");
      const idField = document.querySelector('#identity-form input[name="id"]');
      const actorField = document.querySelector('#identity-form input[name="actor"]');
      return Boolean(
        heading && heading.textContent.includes("Create First Identity")
        && submit && submit.textContent.includes("Create Identity")
        && idField && idField.disabled === false && idField.value === ""
        && actorField && actorField.disabled === false && actorField.value === ""
      );
    });

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

    await openStarterDetails(page);
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
    await page.selectOption('#capability-install-kind', "serverRunner");
    await page.waitForFunction(() => document.getElementById("capability-install-help")?.textContent.includes("does not support target kind serverRunner"));
    await page.waitForFunction(() => document.querySelector('#capability-install-form button[type="submit"]')?.disabled === true);
    await page.selectOption('#capability-install-kind', "routePage");
    await page.selectOption('#capability-install-target', "home_page_route");
    await page.waitForFunction(() => document.getElementById("capability-install-help")?.textContent.includes("supports placements: routePage"));
    await page.waitForFunction(() => document.getElementById("capability-install-help")?.textContent.includes("Source state: both"));
    await page.waitForFunction(() => document.querySelector('#capability-install-form button[type="submit"]')?.disabled === false);
    await page.locator('#capability-install-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("capability-install-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-capability-installs")?.textContent.includes("home_page_route"));

    await page.selectOption('#capability-remove-capability', "notes.sidebar");
    await page.selectOption('#capability-remove-kind', "routePage");
    await page.selectOption('#capability-remove-target', "home_page_route");
    await page.waitForFunction(() => document.getElementById("capability-remove-help")?.textContent.includes("supports placements: routePage"));
    await page.waitForFunction(() => document.querySelector('#capability-remove-form button[type="submit"]')?.disabled === false);
    await page.locator('#capability-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("capability-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-capability-installs")?.textContent.includes("notes.sidebar"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can install, remove, propose, and approve runtime plugins for a server runner", async () => {
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

    await openStarterDetails(page);
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    await page.locator('summary').filter({ hasText: "Runtime Plugins" }).evaluate(node => { node.parentElement.open = true; });

    await page.selectOption('#runtime-plugin-remove-runner', "demo_server");
    await page.selectOption('#runtime-plugin-remove-plugin', "plugin.inspect");
    await page.locator('#runtime-plugin-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.inspect"));

    await page.selectOption('#runtime-plugin-install-runner', "demo_server");
    await page.selectOption('#runtime-plugin-install-plugin', "plugin.inspect");
    await page.locator('#runtime-plugin-install-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-install-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.inspect"));

    await page.selectOption('#runtime-plugin-remove-runner', "demo_server");
    await page.selectOption('#runtime-plugin-remove-plugin', "plugin.canvas");
    await page.locator('#runtime-plugin-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.canvas"));

    await page.selectOption('#runtime-plugin-install-proposal-runner', "demo_server");
    await page.fill('#runtime-plugin-install-proposal-form input[name="id"]', "proposal.runtime-plugin.install.canvas");
    await page.selectOption('#runtime-plugin-install-proposal-plugin', "plugin.canvas");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-install-proposal-help")?.textContent.includes("Installable on profile"));
    await page.waitForFunction(() => document.querySelector('#runtime-plugin-install-proposal-form button[type="submit"]')?.disabled === false);
    await page.fill('#runtime-plugin-install-proposal-form input[name="reason"]', "Need canvas on this runner");
    await page.locator('#runtime-plugin-install-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-install-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.runtime-plugin.install.canvas [open] runtimePlugin.install"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.runtime-plugin.install.canvas");
    await page.waitForFunction(() => document.querySelector('#proposal-approve-form button[type="submit"]')?.disabled === false);
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.canvas"));

    await page.locator('summary').filter({ hasText: "Runtime Plugins" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#runtime-plugin-remove-proposal-runner', "demo_server");
    await page.fill('#runtime-plugin-remove-proposal-form input[name="id"]', "proposal.runtime-plugin.remove.canvas");
    await page.selectOption('#runtime-plugin-remove-proposal-plugin', "plugin.canvas");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-remove-proposal-help")?.textContent.includes("Already installed on this server runner"));
    await page.waitForFunction(() => document.querySelector('#runtime-plugin-remove-proposal-form button[type="submit"]')?.disabled === false);
    await page.fill('#runtime-plugin-remove-proposal-form input[name="reason"]', "Remove canvas from this runner");
    await page.locator('#runtime-plugin-remove-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-remove-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.runtime-plugin.remove.canvas [open] runtimePlugin.remove"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.runtime-plugin.remove.canvas");
    await page.waitForFunction(() => document.querySelector('#proposal-approve-form button[type="submit"]')?.disabled === false);
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => !document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.canvas"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can author MCP servers and manage MCP tool installs with proposal parity", async () => {
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

    await openStarterDetails(page);
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    await page.locator('summary').filter({ hasText: "MCP" }).evaluate(node => { node.parentElement.open = true; });

    await page.fill('#mcp-server-form input[name="id"]', "personal_mcp");
    await page.fill('#mcp-server-form input[name="label"]', "Personal MCP");
    await page.selectOption('#mcp-server-runner', "demo_server");
    await page.fill('#mcp-server-form input[name="serviceIdentity"]', "aaron");
    await page.fill('#mcp-server-form textarea[name="transportsJson"]', '["http"]');
    await page.waitForFunction(() => document.getElementById("mcp-server-help")?.textContent.includes("HTTP transport will mount a runtime path"));
    await page.waitForFunction(() => document.getElementById("mcp-server-help")?.textContent.includes("Service-mode tools can run as aaron"));
    await page.locator('#mcp-server-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-server-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-mcp-servers")?.textContent.includes("personal_mcp"));
    await page.waitForFunction(() => document.getElementById("mcp-server-inventory")?.textContent.includes("/mcp/personal_mcp"));

    await page.selectOption('#mcp-tool-install-server', "personal_mcp");
    await page.selectOption('#mcp-tool-install-tool', "authoring.write");
    await page.selectOption('#mcp-tool-install-acting-mode', "service");
    await page.fill('#mcp-tool-install-form textarea[name="scopeContextsJson"]', '["ctx.docs"]');
    await page.fill('#mcp-tool-install-form textarea[name="scopeTargetsJson"]', '["ctx.docs:home"]');
    await page.waitForFunction(() => document.getElementById("mcp-tool-install-help")?.textContent.includes("Installing authoring.write"));
    await page.waitForFunction(() => document.getElementById("mcp-tool-install-help")?.textContent.includes("Service mode will run as aaron"));
    await page.locator('#mcp-tool-install-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-tool-install-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-mcp-tool-installs")?.textContent.includes("authoring.write"));

    await page.selectOption('#mcp-tool-remove-server', "personal_mcp");
    await page.selectOption('#mcp-tool-remove-tool', "authoring.write");
    await page.locator('#mcp-tool-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-tool-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-mcp-tool-installs")?.textContent.includes("authoring.write"));

    await page.fill('#mcp-server-proposal-form input[name="id"]', "proposal.mcp.server.ops");
    await page.fill('#mcp-server-proposal-form input[name="serverId"]', "ops_mcp");
    await page.fill('#mcp-server-proposal-form input[name="label"]', "Ops MCP");
    await page.selectOption('#mcp-server-proposal-runner', "demo_server");
    await page.fill('#mcp-server-proposal-form input[name="serviceIdentity"]', "ops-bot");
    await page.fill('#mcp-server-proposal-form textarea[name="transportsJson"]', '["stdio","http"]');
    await page.waitForFunction(() => document.getElementById("mcp-server-proposal-help")?.textContent.includes("HTTP transport will mount a runtime path"));
    await page.waitForFunction(() => document.getElementById("mcp-server-proposal-help")?.textContent.includes("Service-mode tools can run as ops-bot"));
    await page.waitForFunction(() => document.querySelector('#mcp-server-proposal-form button[type="submit"]')?.disabled === false);
    await page.fill('#mcp-server-proposal-form input[name="reason"]', "Need an ops MCP server");
    await page.locator('#mcp-server-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-server-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.mcp.server.ops [open] mcpServer.define"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.mcp.server.ops");
    await page.waitForFunction(() => document.querySelector('#proposal-approve-form button[type="submit"]')?.disabled === false);
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-mcp-servers")?.textContent.includes("ops_mcp"));

    await page.locator('summary').filter({ hasText: "MCP" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#mcp-tool-install-proposal-server', "ops_mcp");
    await page.fill('#mcp-tool-install-proposal-form input[name="id"]', "proposal.mcp.tool.install.ops");
    await page.selectOption('#mcp-tool-install-proposal-tool', "world.read");
    await page.selectOption('#mcp-tool-install-proposal-acting-mode', "delegated");
    await page.waitForFunction(() => document.getElementById("mcp-tool-install-proposal-help")?.textContent.includes("Installing world.read"));
    await page.waitForFunction(() => document.getElementById("mcp-tool-install-proposal-help")?.textContent.includes("Delegated mode will run as the calling actor."));
    await page.waitForFunction(() => document.querySelector('#mcp-tool-install-proposal-form button[type="submit"]')?.disabled === false);
    await page.fill('#mcp-tool-install-proposal-form input[name="reason"]', "Need world reads on ops server");
    await page.locator('#mcp-tool-install-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-tool-install-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.mcp.tool.install.ops [open] mcpTool.install"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.mcp.tool.install.ops");
    await page.waitForFunction(() => document.querySelector('#proposal-approve-form button[type="submit"]')?.disabled === false);
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-mcp-tool-installs")?.textContent.includes("world.read"));

    await page.locator('summary').filter({ hasText: "MCP" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#mcp-tool-remove-proposal-server', "ops_mcp");
    await page.fill('#mcp-tool-remove-proposal-form input[name="id"]', "proposal.mcp.tool.remove.ops");
    await page.selectOption('#mcp-tool-remove-proposal-tool', "world.read");
    await page.waitForFunction(() => document.getElementById("mcp-tool-remove-proposal-help")?.textContent.includes("Removing world.read from ops_mcp"));
    await page.waitForFunction(() => document.querySelector('#mcp-tool-remove-proposal-form button[type="submit"]')?.disabled === false);
    await page.fill('#mcp-tool-remove-proposal-form input[name="reason"]', "Remove world reads from ops server");
    await page.locator('#mcp-tool-remove-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-tool-remove-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.mcp.tool.remove.ops [open] mcpTool.remove"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.mcp.tool.remove.ops");
    await page.waitForFunction(() => document.querySelector('#proposal-approve-form button[type="submit"]')?.disabled === false);
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => !document.getElementById("state-mcp-tool-installs")?.textContent.includes("world.read"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI shows authored runtime plugin review details and composition previews", async () => {
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

    await openStarterDetails(page);
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    await page.locator('summary').filter({ hasText: "Runtime Plugins" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#runtime-plugin-review-runner', "demo_server");
    await page.waitForFunction(() => document.querySelectorAll('#runtime-plugin-review-plugin option').length > 0);
    await page.selectOption('#runtime-plugin-review-plugin', "plugin.inspect");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Inspect Bundle Bridge"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Remove Preview"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Operator Summary"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-note")?.textContent.includes("Installed on profile"));

    await page.selectOption('#runtime-plugin-review-plugin', "plugin.notes-sidebar");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("metadata-only"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-note")?.textContent.includes("Blocked on profile"));

    await page.selectOption('#runtime-plugin-remove-runner', "demo_server");
    await page.selectOption('#runtime-plugin-remove-plugin', "plugin.inspect");
    await page.locator('#runtime-plugin-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-remove-status")?.textContent.includes("Removed."));
    await page.selectOption('#runtime-plugin-review-plugin', "plugin.inspect");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Install Preview"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-note")?.textContent.includes("Installable on profile"));

    await page.selectOption('#runtime-plugin-install-runner', "demo_server");
    await page.selectOption('#runtime-plugin-install-plugin', "plugin.inspect");
    await page.locator('#runtime-plugin-install-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-install-status")?.textContent.includes("Saved."));
    await page.selectOption('#runtime-plugin-review-plugin', "plugin.inspect");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Remove Preview"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("installed"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI shows inline route handler guidance while authoring routes", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));

    await page.locator('summary').filter({ hasText: "Routes And Mounts" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#route-handler', "events.stream");
    await page.waitForFunction(() => document.getElementById("route-help")?.textContent.includes("events.stream"));
    await page.waitForFunction(() => document.getElementById("route-help")?.textContent.includes("stream -> stream"));
    await page.waitForFunction(() => document.getElementById("route-help")?.textContent.includes("Supported methods: GET"));

    await page.selectOption('#route-method', "POST");
    await page.waitForFunction(() => document.getElementById("route-help")?.textContent.includes("selected method POST is unsupported"));
    await page.waitForFunction(() => document.querySelector('#route-form button[type="submit"]')?.disabled === true);

    await page.selectOption('#route-handler', "backendProgram.run");
    await page.selectOption('#route-method', "GET");
    await page.waitForFunction(() => document.getElementById("route-help")?.textContent.includes("backendProgram.run"));
    await page.waitForFunction(() => document.getElementById("route-help")?.textContent.includes("choose a backend program soul"));
    await page.waitForFunction(() => document.querySelector('#route-form button[type="submit"]')?.disabled === true);
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
    await page.fill('#proposal-form input[name="id"]', "proposal.perspective.platform-home");
    await page.selectOption('#proposal-target-process', "perspective.define");
    await page.fill('#proposal-form input[name="targetKind"]', "perspective");
    await page.fill('#proposal-form input[name="targetId"]', "platform.home");
    await page.fill('#proposal-form textarea[name="bodyJson"]', '{"id":"platform.home","title":"Platform Home","context":"ctx.platform"}');
    await page.fill('#proposal-form input[name="reason"]', "Need a governed platform perspective");
    await page.locator('#proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.perspective.platform-home [open] perspective.define"));

    await page.selectOption('#proposal-approve-id', "proposal.perspective.platform-home");
    await page.waitForFunction(() => {
      const text = document.getElementById("proposal-approve-help")?.textContent || "";
      return text.includes("Proposed by aaron.")
        && text.includes("Proposal targets perspective.define on perspective platform.home.");
    });
    await page.waitForFunction(() => document.querySelector('#proposal-approve-form button[type="submit"]')?.disabled === false);
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.perspective.platform-home [approved] perspective.define"));
    await page.waitForFunction(() => document.getElementById("state-perspectives")?.textContent.includes("platform.home"));
    await page.waitForFunction(() => document.getElementById("state-authority")?.textContent.includes("ctx.platform"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can reject a governed proposal through the authored review controls", async () => {
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

    await page.locator('summary').filter({ hasText: "Proposals" }).click();
    await page.fill('#proposal-form input[name="id"]', "proposal.widget.reject-home");
    await page.selectOption('#proposal-target-process', "widget.define");
    await page.fill('#proposal-form input[name="targetKind"]', "widget");
    await page.fill('#proposal-form input[name="targetId"]', "reject_home");
    await page.fill('#proposal-form textarea[name="bodyJson"]', '{"id":"reject_home","kind":"Page","title":"Rejected Home","attach":false}');
    await page.fill('#proposal-form input[name="reason"]', "This should be rejected for test coverage");
    await page.locator('#proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.widget.reject-home [open] widget.define"));

    await page.selectOption('#proposal-reject-id', "proposal.widget.reject-home");
    await page.fill('#proposal-reject-form input[name="reason"]', "Rejected through authored review controls");
    await page.locator('#proposal-reject-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-reject-status")?.textContent.includes("Rejected."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.widget.reject-home [rejected] widget.define"));
    await page.waitForFunction(() => !document.getElementById("state-widgets")?.textContent.includes("reject_home (Page)"));
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI shows governed backend version and proposal guidance before submit", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, context, close: closeBrowser } = await launchBrowser();

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

    await openStarterDetails(page);
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    const sessionCookie = await cookieHeaderFor(context, server.url);
    await waitUntil(async () => {
      const state = await fetch(`${server.url}/api/bootstrap-state`, {
        headers: { cookie: sessionCookie }
      }).then(response => response.json());
      return state.backendProgramVersions?.some(row => row.version === "todo.todos.list.v1");
    }, { message: "starter backend version state" });

    await page.goto(`${server.url}/_bootstrap`);
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));

    const bootstrapState = await fetch(`${server.url}/api/bootstrap-state`, {
      headers: { cookie: sessionCookie }
    }).then(response => response.json());
    assert.equal(bootstrapState.backendProgramTransitions.some(row =>
      row.soul === "todo.todos.list"
        && row.from === "todo.todos.list.v1"
        && row.to === "todo.todos.list.v2"
        && row.strategy === "compatible"
    ), true);
    assert.equal(bootstrapState.backendProgramActivationHistory.some(row =>
      row.soul === "todo.todos.list" && row.version === "todo.todos.list.v1"
    ), true);
    assert.equal(Array.isArray(bootstrapState.widgetVersionTransitions), true);
    assert.equal(Array.isArray(bootstrapState.widgetVersionActivationHistory), true);

    await page.locator('summary').filter({ hasText: "Backend Programs" }).click();
    await page.selectOption('#backend-program-activate-soul', "todo.todos.create");
    await page.selectOption('#backend-program-activate-soul', "todo.todos.list");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#backend-program-activate-version option')].map(option => option.value);
      return values.includes("todo.todos.list.v2");
    });
    await page.selectOption('#backend-program-activate-version', "todo.todos.list.v2");
    await page.waitForFunction(() => {
      const text = document.getElementById("backend-program-activate-help")?.textContent || "";
      return text.includes("Current active version: todo.todos.list.v1.")
        && text.includes("Target version: todo.todos.list.v2")
        && text.includes("Transition strategy: compatible.")
        && text.includes("Current actor can mutate context backend directly.");
    });

    await page.locator('#backend-program-activate-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("backend-program-activate-status")?.textContent.includes("Activated."));
    await page.selectOption('#backend-program-rollback-soul', "todo.todos.list");
    await page.waitForFunction(() => {
      const text = document.getElementById("backend-program-rollback-help")?.textContent || "";
      return text.includes("Current active version: todo.todos.list.v2.")
        && text.includes("Rollback target from activation history: todo.todos.list.v1.");
    });

    await page.locator('summary').filter({ hasText: "Proposals" }).click();
    await page.fill('#proposal-form input[name="id"]', "proposal.backend.rollback.todo.todos.list");
    await page.selectOption('#proposal-target-process', "backendProgramVersion.rollback");
    await page.fill('#proposal-form input[name="targetKind"]', "backendProgram");
    await page.fill('#proposal-form input[name="targetId"]', "todo.todos.list");
    await page.fill('#proposal-form textarea[name="bodyJson"]', "{}");
    await page.waitForFunction(() => {
      const text = document.getElementById("proposal-help")?.textContent || "";
      return text.includes("Body JSON must include soul.")
        && document.querySelector('#proposal-form button[type="submit"]')?.disabled === true;
    });
    await page.fill('#proposal-form textarea[name="bodyJson"]', '{"soul":"todo.todos.list"}');
    await page.fill('#proposal-form input[name="reason"]', "Restore the previous backend program version");
    await page.waitForFunction(() => {
      const text = document.getElementById("proposal-help")?.textContent || "";
      return text.includes("Backend program rollback proposal for soul todo.todos.list.")
        && text.includes('Body JSON should include {"soul":"todo.todos.list"}.')
        && text.includes("Current active version: todo.todos.list.v2.")
        && text.includes("Expected rollback target: todo.todos.list.v1.")
        && text.includes("Current actor can mutate context backend directly.");
    });

    await page.locator('#proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.backend.rollback.todo.todos.list [open] backendProgramVersion.rollback"));

    await page.selectOption('#proposal-approve-id', "proposal.backend.rollback.todo.todos.list");
    await page.waitForFunction(() => {
      const text = document.getElementById("proposal-approve-help")?.textContent || "";
      return text.includes("Proposed by aaron.")
        && text.includes("Backend program rollback proposal for soul todo.todos.list.")
        && text.includes('Body JSON should include {"soul":"todo.todos.list"}.')
        && text.includes("Expected rollback target: todo.todos.list.v1.");
    });
    await page.waitForFunction(() => document.querySelector('#proposal-approve-form button[type="submit"]')?.disabled === false);

    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.backend.rollback.todo.todos.list [approved] backendProgramVersion.rollback"));
    await page.waitForFunction(() => {
      const text = document.getElementById("backend-program-activate-help")?.textContent || "";
      return text.includes("Current active version: todo.todos.list.v1.");
    });
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI recomputes scoped target and export options through authored change triggers", async () => {
  const { server, close: closeServer } = await startBlankUiServer();
  const { page, context, close: closeBrowser } = await launchBrowser();

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

    const cookie = await cookieHeaderFor(context, server.url);
    const post = async (pathname, body) => {
      const response = await fetch(`${server.url}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(body)
      });
      assert.equal(response.ok, true, `${pathname} ${response.status}`);
    };

    await post("/api/contexts", { id: "ctx.source", label: "Source" });
    await post("/api/contexts", { id: "ctx.target", label: "Target" });
    await post("/api/widgets", widgetInput({ id: "source_page", kind: "Page", title: "Source", attach: false, context: "ctx.source" }));
    await post("/api/widgets", widgetInput({ id: "target_page", kind: "Page", title: "Target", attach: false, context: "ctx.target" }));
    await post("/api/perspectives", { id: "source.board", title: "Source Board", context: "ctx.source" });
    await post("/api/perspectives", { id: "target.board", title: "Target Board", context: "ctx.target" });
    await post("/api/context-bindings", { context: "ctx.source", name: "homePage", target: "source_page" });
    await post("/api/context-bindings", { context: "ctx.target", name: "landingPage", target: "target_page" });
    await post("/api/context-exports", { context: "ctx.source", name: "homePage", target: "source_page" });
    await post("/api/context-exports", { context: "ctx.target", name: "landingPage", target: "target_page" });

    await page.reload();
    await page.waitForFunction(() => document.body.textContent.includes("Recover And Author The App Boundary"));
    await page.waitForFunction(() => document.getElementById("session-summary")?.textContent.includes("Signed in as Aaron"));
    await page.locator('summary').filter({ hasText: "Naming And Scope" }).evaluate(node => { node.parentElement.open = true; });
    await page.locator('summary').filter({ hasText: "Stewardship" }).evaluate(node => { node.parentElement.open = true; });

    await page.selectOption('#context-binding-context', "ctx.target");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#context-binding-target option')].map(option => option.value);
      return values.includes("target_page") && !values.includes("source_page");
    });

    await page.selectOption('#context-binding-remove-context', "ctx.target");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#context-binding-remove-target option')].map(option => option.value);
      return values.includes("target_page") && !values.includes("source_page");
    });

    await page.selectOption('#context-export-context', "ctx.target");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#context-export-target option')].map(option => option.value);
      return values.includes("target_page") && !values.includes("source_page");
    });

    await page.selectOption('#context-export-remove-context', "ctx.target");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#context-export-remove-target option')].map(option => option.value);
      return values.includes("target_page") && !values.includes("source_page");
    });

    await page.selectOption('#context-import-source-context', "ctx.target");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#context-import-export-name option')].map(option => option.value);
      return values.includes("landingPage") && !values.includes("homePage");
    });

    await page.selectOption('#context-import-remove-source-context', "ctx.target");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#context-import-remove-export-name option')].map(option => option.value);
      return values.includes("landingPage") && !values.includes("homePage");
    });

    await page.selectOption('#stewardship-target-kind', "perspective");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#stewardship-target option')].map(option => option.value);
      return values.includes("source.board")
        && values.includes("target.board")
        && !values.includes("ctx.source")
        && !values.includes("ctx.target");
    });

    await page.selectOption('#stewardship-remove-target-kind', "perspective");
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('#stewardship-remove-target option')].map(option => option.value);
      return values.includes("source.board")
        && values.includes("target.board")
        && !values.includes("ctx.source")
        && !values.includes("ctx.target");
    });
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap UI can bind, export, import, consume, and remove contextual names", async () => {
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
    await page.waitForFunction(() => {
      const kind = document.getElementById("widget-kind");
      const context = document.getElementById("widget-context");
      const hasPage = [...(kind?.options || [])].some(option => option.value === "Page");
      const hasContext = [...(context?.options || [])].some(option => option.value === "ctx.source");
      return hasPage && hasContext;
    });
    await page.selectOption('#widget-kind', "Page");
    await page.selectOption('#widget-context', "ctx.source");
    await page.fill('#widget-form input[name="title"]', "Home");
    await page.locator('#widget-form input[name="attach"]').uncheck();
    await page.locator('#widget-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("widget-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-widgets")?.textContent.includes("page_root (Page)"));

    await page.locator('summary').filter({ hasText: "Naming And Scope" }).evaluate(node => { node.parentElement.open = true; });
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

    await page.locator('summary').filter({ hasText: "Frontend Programs" }).evaluate(node => { node.parentElement.open = true; });
    await page.fill('#program-form input[name="id"]', "landing_program");
    await page.selectOption('#program-context', "ctx.target");
    await page.fill('#program-form input[name="rootWidgetRef"]', "landingPage");
    await page.locator('#program-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-programs")?.textContent.includes("landing_program -> page_root"));
    await page.waitForFunction(() => document.getElementById("state-context-scopes")?.textContent.includes("ctx.target :: landingPage -> page_root [import]"));

    await page.fill('#identity-form input[name="id"]', "identity.callan");
    await page.fill('#identity-form input[name="actor"]', "callan");
    await page.fill('#identity-form input[name="label"]', "Callan");
    await page.fill('#identity-form input[name="username"]', "callan");
    await page.fill('#identity-form input[name="password"]', "callan");
    await page.fill('#identity-form input[name="homePerspective"]', "callan:personal");
    await page.locator('#identity-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-identities")?.textContent.includes("identity.callan"));

    await page.locator('summary').filter({ hasText: "Stewardship" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#stewardship-target-kind', "context");
    await page.selectOption('#stewardship-target', "ctx.source");
    await page.fill('#stewardship-form input[name="steward"]', "callan");
    await page.locator('#stewardship-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("state-stewardships")?.textContent.includes("callan -> ctx.source"));

    await page.locator('summary').filter({ hasText: "Naming And Scope" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#context-import-remove-context', "ctx.target");
    await page.selectOption('#context-import-remove-source-context', "ctx.source");
    await page.selectOption('#context-import-remove-export-name', "homePage");
    await page.fill('#context-import-remove-form input[name="name"]', "landingPage");
    await page.locator('#context-import-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("context-import-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-context-imports")?.textContent.includes("ctx.target <- ctx.source :: landingPage => homePage"));

    await page.selectOption('#context-export-remove-context', "ctx.source");
    await page.fill('#context-export-remove-form input[name="name"]', "homePage");
    await page.selectOption('#context-export-remove-target', "page_root");
    await page.locator('#context-export-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("context-export-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-context-exports")?.textContent.includes("ctx.source :: homePage -> page_root"));

    await page.selectOption('#context-binding-remove-context', "ctx.source");
    await page.fill('#context-binding-remove-form input[name="name"]', "homePage");
    await page.selectOption('#context-binding-remove-target', "page_root");
    await page.locator('#context-binding-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("context-binding-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-context-bindings")?.textContent.includes("ctx.source :: homePage -> page_root"));

    await page.locator('summary').filter({ hasText: "Stewardship" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#stewardship-remove-target-kind', "context");
    await page.selectOption('#stewardship-remove-target', "ctx.source");
    await page.fill('#stewardship-remove-form input[name="steward"]', "callan");
    await page.locator('#stewardship-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("stewardship-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-stewardships")?.textContent.includes("callan -> ctx.source"));
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

    await openStarterDetails(page);
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
