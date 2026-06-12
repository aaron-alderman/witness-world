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

async function readWitnesses(serverUrl, headers = {}) {
  return fetch(`${serverUrl}/api/witnesses`, { headers }).then(response => response.json());
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

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    await page.locator('summary').filter({ hasText: "Runtime Plugins" }).evaluate(node => { node.parentElement.open = true; });

    await page.selectOption('#runtime-plugin-install-runner', "demo_server");
    await page.selectOption('#runtime-plugin-install-plugin', "plugin.inspect");
    await page.locator('#runtime-plugin-install-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-install-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.inspect"));

    await page.selectOption('#runtime-plugin-remove-runner', "demo_server");
    await page.selectOption('#runtime-plugin-remove-plugin', "plugin.inspect");
    await page.locator('#runtime-plugin-remove-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-remove-status")?.textContent.includes("Removed."));
    await page.waitForFunction(() => !document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.inspect"));

    await page.selectOption('#runtime-plugin-install-proposal-runner', "demo_server");
    await page.fill('#runtime-plugin-install-proposal-form input[name="id"]', "proposal.runtime-plugin.install.canvas");
    await page.selectOption('#runtime-plugin-install-proposal-plugin', "plugin.canvas");
    await page.fill('#runtime-plugin-install-proposal-form input[name="reason"]', "Need canvas on this runner");
    await page.locator('#runtime-plugin-install-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-install-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.runtime-plugin.install.canvas [open] runtimePlugin.install"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.runtime-plugin.install.canvas");
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-runtime-plugin-installs")?.textContent.includes("demo_server -> plugin.canvas"));

    await page.locator('summary').filter({ hasText: "Runtime Plugins" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#runtime-plugin-remove-proposal-runner', "demo_server");
    await page.fill('#runtime-plugin-remove-proposal-form input[name="id"]', "proposal.runtime-plugin.remove.canvas");
    await page.selectOption('#runtime-plugin-remove-proposal-plugin', "plugin.canvas");
    await page.fill('#runtime-plugin-remove-proposal-form input[name="reason"]', "Remove canvas from this runner");
    await page.locator('#runtime-plugin-remove-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("runtime-plugin-remove-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.runtime-plugin.remove.canvas [open] runtimePlugin.remove"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.runtime-plugin.remove.canvas");
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

    await page.locator('details').last().evaluate(node => { node.open = true; });
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
    await page.fill('#mcp-server-proposal-form textarea[name="transportsJson"]', '["stdio","http"]');
    await page.fill('#mcp-server-proposal-form input[name="reason"]', "Need an ops MCP server");
    await page.locator('#mcp-server-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-server-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.mcp.server.ops [open] mcpServer.define"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.mcp.server.ops");
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-mcp-servers")?.textContent.includes("ops_mcp"));

    await page.locator('summary').filter({ hasText: "MCP" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#mcp-tool-install-proposal-server', "ops_mcp");
    await page.fill('#mcp-tool-install-proposal-form input[name="id"]', "proposal.mcp.tool.install.ops");
    await page.selectOption('#mcp-tool-install-proposal-tool', "world.read");
    await page.selectOption('#mcp-tool-install-proposal-acting-mode', "delegated");
    await page.fill('#mcp-tool-install-proposal-form input[name="reason"]', "Need world reads on ops server");
    await page.locator('#mcp-tool-install-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-tool-install-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.mcp.tool.install.ops [open] mcpTool.install"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.mcp.tool.install.ops");
    await page.locator('#proposal-approve-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("proposal-approve-status")?.textContent.includes("Approved."));
    await page.waitForFunction(() => document.getElementById("state-mcp-tool-installs")?.textContent.includes("world.read"));

    await page.locator('summary').filter({ hasText: "MCP" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#mcp-tool-remove-proposal-server', "ops_mcp");
    await page.fill('#mcp-tool-remove-proposal-form input[name="id"]', "proposal.mcp.tool.remove.ops");
    await page.selectOption('#mcp-tool-remove-proposal-tool', "world.read");
    await page.fill('#mcp-tool-remove-proposal-form input[name="reason"]', "Remove world reads from ops server");
    await page.locator('#mcp-tool-remove-proposal-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("mcp-tool-remove-proposal-status")?.textContent.includes("Saved."));
    await page.waitForFunction(() => document.getElementById("state-proposals")?.textContent.includes("proposal.mcp.tool.remove.ops [open] mcpTool.remove"));

    await page.locator('summary').filter({ hasText: "Proposals" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#proposal-approve-id', "proposal.mcp.tool.remove.ops");
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

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    await page.locator('summary').filter({ hasText: "Runtime Plugins" }).evaluate(node => { node.parentElement.open = true; });
    await page.selectOption('#runtime-plugin-review-runner', "demo_server");
    await page.waitForFunction(() => document.querySelectorAll('#runtime-plugin-review-plugin option').length > 0);
    await page.selectOption('#runtime-plugin-review-plugin', "plugin.inspect");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Inspect Bundle Bridge"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Install Preview"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("Operator Summary"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-note")?.textContent.includes("Installable on profile"));

    await page.selectOption('#runtime-plugin-review-plugin', "plugin.notes-sidebar");
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-detail")?.textContent.includes("metadata-only"));
    await page.waitForFunction(() => document.getElementById("runtime-plugin-review-note")?.textContent.includes("Blocked on profile"));

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

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator('#create-todo-starter').click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));

    const sessionCookie = await cookieHeaderFor(context, server.url);
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
    await page.selectOption('#backend-program-activate-soul', "todo.todos.list");
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
