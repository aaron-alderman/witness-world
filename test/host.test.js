import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer, hostCapabilities } from "../src/host.js";
import { applyWitnessToml, applyWitnessDocs, loadWitnessTomlFile, parseWitnessToml } from "../src/dsl.js";
import { grantIdentityActorAssumption } from "../src/modules.js";

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-todo-"));
  return path.join(dir, "todos.json");
}

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

async function openSession(serverUrl, { username = "aaron", password = username, ...rest } = {}) {
  const response = await fetch(`${serverUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, ...rest })
  });
  return {
    response,
    body: await response.json(),
    cookie: cookieHeader(response.headers.get("set-cookie"))
  };
}

function applyMinimalTodoDsl(world, extra = "", { allowActorHeader = false } = {}) {
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "todo_app_widget"
kind = "Page"
props = { title = "Witness Todo" }

[[serverRunner]]
actor = "adam"
id = "server_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
storage = { todoProjection = "todos.json", privateNotesProjection = "notes.json" }
allowActorHeader = ${allowActorHeader ? "true" : "false"}

[[identity]]
actor = "aaron"
id = "identity.aaron"
label = "Aaron"
username = "aaron"
password = "aaron"
homePerspective = "aaron:personal"

[[identity]]
actor = "callan"
id = "identity.callan"
label = "Callan"
username = "callan"
password = "callan"
homePerspective = "callan:personal"

[[context]]
actor = "adam"
id = "frontend"
label = "Frontend"
owner = "frontendHost"
stewards = ["aaron"]

[[widget]]
actor = "adam"
id = "todo_form"
kind = "Form"
props = {}

[[widget]]
actor = "adam"
id = "todo_input"
kind = "TextInput"
props = { name = "title", placeholder = "New todo" }

[[widget]]
actor = "adam"
id = "todo_add_button"
kind = "Button"
props = { text = "Add", type = "submit" }

[[widget]]
actor = "adam"
id = "todo_status"
kind = "Text"
props = { text = "", role = "app-status" }

[[widget]]
actor = "adam"
id = "todo_list"
kind = "Box"
props = {}

[[attachWidget]]
actor = "adam"
parent = "todo_form"
child = "todo_input"
order = 0

[[attachWidget]]
actor = "adam"
parent = "todo_form"
child = "todo_add_button"
order = 1

[[attachWidget]]
actor = "adam"
parent = "todo_app_widget"
child = "todo_form"
order = 0

[[attachWidget]]
actor = "adam"
parent = "todo_app_widget"
child = "todo_status"
order = 1

[[attachWidget]]
actor = "adam"
parent = "todo_app_widget"
child = "todo_list"
order = 2

[[route]]
actor = "adam"
id = "home_route"
path = "/"
serves = "page"
method = "GET"
handler = "page.home"
params = { rootWidget = "todo_app_widget" }

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "home_route"

[[route]]
actor = "adam"
id = "session_read_route"
path = "/api/session"
serves = "session"
method = "GET"
handler = "session.read"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "session_read_route"

[[route]]
actor = "adam"
id = "session_open_route"
path = "/api/session"
serves = "session"
method = "POST"
handler = "session.open"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "session_open_route"

[[route]]
actor = "adam"
id = "session_logout_route"
path = "/api/session"
serves = "session"
method = "DELETE"
handler = "session.logout"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "session_logout_route"

[[route]]
actor = "adam"
id = "todos_list_route"
path = "/api/todos"
serves = "todos"
method = "GET"
handler = "todos.list"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "todos_list_route"

[[route]]
actor = "adam"
id = "todos_create_route"
path = "/api/todos"
serves = "todos"
method = "POST"
handler = "todos.create"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "todos_create_route"

[[route]]
actor = "adam"
id = "todos_update_route"
path = "/api/todos/:id"
serves = "todos"
method = "PATCH"
handler = "todos.update"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "todos_update_route"

[[route]]
actor = "adam"
id = "todos_delete_route"
path = "/api/todos/:id"
serves = "todos"
method = "DELETE"
handler = "todos.delete"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "todos_delete_route"

[[route]]
actor = "adam"
id = "notes_list_route"
path = "/api/private-notes"
serves = "privateNote"
method = "GET"
handler = "privateNotes.list"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "notes_list_route"

[[route]]
actor = "adam"
id = "notes_create_route"
path = "/api/private-notes"
serves = "privateNote"
method = "POST"
handler = "privateNotes.create"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "notes_create_route"

[[route]]
actor = "adam"
id = "witnesses_route"
path = "/api/witnesses"
serves = "witness"
method = "GET"
handler = "witnesses.list"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "witnesses_route"

[[route]]
actor = "adam"
id = "widget_versions_activate_route"
path = "/api/widget-versions/:soul/activate"
serves = "widgetVersion"
method = "POST"
handler = "widgetVersions.activate"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "widget_versions_activate_route"

[[route]]
actor = "adam"
id = "widget_versions_rollback_route"
path = "/api/widget-versions/:soul/rollback"
serves = "widgetVersion"
method = "POST"
handler = "widgetVersions.rollback"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "widget_versions_rollback_route"

[[route]]
actor = "adam"
id = "widgets_create_route"
path = "/api/widgets"
serves = "widgetEditor"
method = "POST"
handler = "widgets.create"
params = { rootWidget = "todo_app_widget" }

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "widgets_create_route"

${extra}
`);
}

test("backend and frontend capabilities are split", () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const backend = hostCapabilities(world, "backendHost");
  const frontend = hostCapabilities(world, "frontendHost");

  assert.equal(backend.has("fs.json.write"), true);
  assert.equal(backend.has("http.serve"), true);
  assert.equal(frontend.has("dom.render"), true);
  assert.equal(frontend.has("http.fetch"), true);
  assert.equal(frontend.has("fs.json.write"), false);
});

test("server starts only with backend and frontend capability envelopes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  applyMinimalTodoDsl(world);

  const failed = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  assert.equal(failed.ok, false);
  assert.equal(world.allWitnesses().at(-1).process, "server.start.failed");
});

test("server start requires an explicit runner when multiple server runners exist", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = parseWitnessToml(`
[[serverRunner]]
actor = "adam"
id = "one"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "adam"
id = "two"
backendHost = "backendHost"
frontendHost = "frontendHost"
`);
  applyWitnessDocs(world, docs);

  const failed = await startServer(world, {
    actor: "adam",
    runtimeRoot: path.dirname(await tempStore())
  });

  assert.equal(failed.ok, false);
  assert.equal(world.allWitnesses().at(-1).process, "server.start.failed");
  assert.deepEqual(world.allWitnesses().at(-1).body.serverRunners, ["one", "two"]);
});

test("runtime.config resolves runner config bindings and redacts secret values from inspection", async () => {
  const originalSecret = process.env.WITNESS_RUNTIME_SECRET;
  const originalMissing = process.env.WITNESS_RUNTIME_MISSING;
  process.env.WITNESS_RUNTIME_SECRET = "super-secret-token";
  delete process.env.WITNESS_RUNTIME_MISSING;

  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world, `
[[serverRunner]]
actor = "adam"
id = "config_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
storage = { todoProjection = "todos-alt.json", privateNotesProjection = "notes-alt.json" }
runtimeConfig = { publicBaseUrl = { value = "https://world.test" }, mode = { default = "local" }, serviceToken = { secret = "WITNESS_RUNTIME_SECRET" }, fallbackMode = { secret = "WITNESS_RUNTIME_MISSING", default = "fallback" } }
allowActorHeader = true
`);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "config_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    assert.equal(server.ok, true);
    const response = await fetch(`${server.url}/api/runtime-config`, {
      headers: { "x-witness-actor": "adam" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.serverRunner, "config_runner");
    assert.equal(body.values.publicBaseUrl, "https://world.test");
    assert.equal(body.values.mode, "local");
    assert.equal(Object.prototype.hasOwnProperty.call(body.values, "serviceToken"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body.values, "fallbackMode"), false);
    assert.equal(body.fields.find(field => field.name === "serviceToken").secret, true);
    assert.equal(body.fields.find(field => field.name === "serviceToken").redacted, true);
    assert.equal(body.fields.find(field => field.name === "serviceToken").secretRef, "WITNESS_RUNTIME_SECRET");
    assert.equal(body.fields.find(field => field.name === "fallbackMode").source, "default");
    assert.equal(body.fields.find(field => field.name === "fallbackMode").secret, true);
    assert.equal(JSON.stringify(body).includes("super-secret-token"), false);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, {
      headers: { "x-witness-actor": "adam" }
    });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.runtimeConfig.fieldCount, 4);
    assert.equal(diagnosticsBody.runtimeConfig.missingCount, 0);
    assert.equal(JSON.stringify(diagnosticsBody).includes("super-secret-token"), false);
  } finally {
    await server.close();
    if (originalSecret === undefined) delete process.env.WITNESS_RUNTIME_SECRET;
    else process.env.WITNESS_RUNTIME_SECRET = originalSecret;
    if (originalMissing === undefined) delete process.env.WITNESS_RUNTIME_MISSING;
    else process.env.WITNESS_RUNTIME_MISSING = originalMissing;
  }
});

test("runtime.config blocks server start when a required secret reference is missing", async () => {
  const originalMissing = process.env.WITNESS_REQUIRED_SECRET;
  delete process.env.WITNESS_REQUIRED_SECRET;

  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "config_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"
runtimeConfig = { serviceToken = { secret = "WITNESS_REQUIRED_SECRET" } }
`);

  try {
    const failed = await startServer(world, {
      actor: "adam",
      serverRunnerId: "config_runner",
      runtimeRoot: path.dirname(await tempStore())
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "runtime config unresolved");
    assert.equal(world.allWitnesses().at(-1).process, "server.start.failed");
    assert.equal(world.allWitnesses().at(-1).body.reason, "runtime config unresolved");
    assert.equal(world.allWitnesses().at(-1).body.runtimeConfigFailures[0].field, "serviceToken");
    assert.equal(world.allWitnesses().at(-1).body.runtimeConfigFailures[0].secretRef, "WITNESS_REQUIRED_SECRET");
  } finally {
    if (originalMissing === undefined) delete process.env.WITNESS_REQUIRED_SECRET;
    else process.env.WITNESS_REQUIRED_SECRET = originalMissing;
  }
});

test("session api authenticates authored identities and cookie actor wins over request header", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const failed = await fetch(`${server.url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "wrong" })
    });
    assert.equal(failed.status, 401);
    assert.equal(world.allWitnesses().some(w => w.process === "session.open.failed"), true);

    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.perspective, "aaron:personal");

    const session = await fetch(`${server.url}/api/session`, {
      headers: { cookie: login.cookie }
    }).then(r => r.json());
    assert.equal(session.authenticated, true);
    assert.equal(session.identity, "identity.aaron");
    assert.equal(session.actor, "aaron");
    assert.equal(session.authenticatedIdentity, "identity.aaron");
    assert.equal(session.authenticatedActor, "aaron");
    assert.equal(session.effectiveIdentity, "identity.aaron");
    assert.equal(session.effectiveActor, "aaron");
    assert.equal(session.authorityMode, "direct");
    assert.equal(session.assumptionGrantId, null);
    assert.equal(session.label, "Aaron");
    assert.equal(session.homeContext, null);
    assert.equal(session.perspective, "aaron:personal");

    const note = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: login.cookie,
        "x-witness-actor": "callan"
      },
      body: JSON.stringify({ text: "cookie beats header" })
    }).then(r => r.json());
    assert.equal(note.note.actor, "aaron");
    assert.equal(world.allWitnesses().at(-1).actor, "aaron");
  } finally {
    await server.close();
  }
});

test("raw actor headers are ignored by default and only work for runners that opt in", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const rejected = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
      body: JSON.stringify({ text: "should not authenticate" })
    });
    assert.equal(rejected.status, 401);
  } finally {
    await server.close();
  }

  const worldWithOptIn = createWorld();
  declareBackendHost(worldWithOptIn, { actor: "adam", id: "backendHost" });
  declareFrontendHost(worldWithOptIn, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(worldWithOptIn, "", { allowActorHeader: true });

  const optedIn = await startServer(worldWithOptIn, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const accepted = await fetch(`${optedIn.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
      body: JSON.stringify({ text: "explicit dev actor path" })
    });
    assert.equal(accepted.status, 201);
    const body = await accepted.json();
    assert.equal(body.note.actor, "aaron");
  } finally {
    await optedIn.close();
  }
});

test("demo app end-to-end: frontend request, backend json store, witnesses", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  applyMinimalTodoDsl(world);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    assert.equal(server.ok, true);

    const html = await fetch(server.url).then(r => r.text());
    assert.match(html, /Witness Todo/);
    assert.match(html, /data-widget="todo_app_widget"/);
    assert.match(html, /data-widget="todo_form"/);
    assert.doesNotMatch(html, /data-todo-form/);
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });

    const created = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ title: "Ship witness kernel" })
    }).then(r => r.json());

    assert.equal(created.todo.title, "Ship witness kernel");

    const list = await fetch(`${server.url}/api/todos`).then(r => r.json());
    assert.deepEqual(list.todos.map(t => t.title), ["Ship witness kernel"]);

    const processes = world.allWitnesses().map(w => w.process);
    const obsProcesses = world.allObservations().map(w => w.process);
    assert.equal(processes.includes("server.start"), true);
    assert.equal(obsProcesses.includes("frontend.render"), true);
    assert.equal(processes.includes("widget.renderHtml"), true);
    assert.equal(processes.includes("todo.create"), true);
    assert.equal(obsProcesses.includes("backend.readTodos"), true);
  } finally {
    await server.close();
  }
});

test("widget pages default live projection on and allow explicit opt-out", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world, `
[[widget]]
actor = "adam"
id = "static_root"
kind = "Page"
props = { title = "Static" }

[[frontendProgram]]
actor = "adam"
id = "static_program"
rootWidget = "static_root"

[[step]]
actor = "adam"
program = "static_program"
event = "load"
op = "setText"
params = { widget = "static_status", text = "loaded" }

[[widget]]
actor = "adam"
id = "static_status"
kind = "Text"
props = { text = "" }

[[attachWidget]]
actor = "adam"
parent = "static_root"
child = "static_status"
order = 0

[[route]]
actor = "adam"
id = "static_route"
path = "/static"
serves = "page"
method = "GET"
handler = "page.home"
params = { rootWidget = "static_root", frontendProgram = "static_program", liveProjection = false }

[[route]]
actor = "adam"
id = "dynamic_route"
path = "/dynamic"
serves = "page"
method = "GET"
handler = "page.home"
params = { rootWidget = "static_root", frontendProgram = "static_program" }

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "static_route"

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "dynamic_route"
`);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const defaultHtml = await fetch(`${server.url}/dynamic`).then(r => r.text());
    assert.match(defaultHtml, /"liveProjection":true/);

    const staticHtml = await fetch(`${server.url}/static`).then(r => r.text());
    assert.match(staticHtml, /"liveProjection":false/);
  } finally {
    await server.close();
  }
});


test("demo server supports done/delete actions and witness inspector data", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    assert.equal(server.ok, true);

    const html = await fetch(server.url).then(r => r.text());
    assert.match(html, /Witness Inspector/);
    assert.match(html, /renderCollection/);
    assert.match(html, /patchJson/);
    assert.match(html, /deleteJson/);
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });

    const created = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ title: "Make witnesses visible" })
    }).then(r => r.json());

    const updated = await fetch(`${server.url}/api/todos/${created.todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ done: true })
    }).then(r => r.json());

    assert.equal(updated.todo.done, true);

    const witnessesBeforeDelete = await fetch(`${server.url}/api/witnesses`).then(r => r.json());
    assert.equal(witnessesBeforeDelete.witnesses.some(w => w.process === "todo.update"), true);

    const deleted = await fetch(`${server.url}/api/todos/${created.todo.id}`, { method: "DELETE", headers: { cookie: login.cookie } }).then(r => r.json());
    assert.equal(deleted.ok, true);
    assert.equal(deleted.id, created.todo.id);

    const list = await fetch(`${server.url}/api/todos`).then(r => r.json());
    assert.deepEqual(list.todos, []);

    const processes = world.allWitnesses().map(w => w.process);
    assert.equal(processes.includes("todo.create"), true);
    assert.equal(processes.includes("todo.update"), true);
    assert.equal(processes.includes("todo.delete"), true);
    assert.equal(world.allObservations().some(w => w.process === "backend.readWitnesses"), true);
  } finally {
    await server.close();
  }
});

test("demo /api/todos list, create, update, and delete routes run through authored backend programs and switch versions live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertTodoShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["authority", "todos"]);
      assert.equal(Array.isArray(body.todos), true);
      assert.equal(typeof body.authority?.mode, "string");
    };
    const assertCreatedShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["authority", "todo", "witness"]);
      assert.equal(typeof body.todo?.title, "string");
      assert.equal(typeof body.authority?.mode, "string");
    };
    const assertUpdatedShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["todo", "witness"]);
      assert.equal(typeof body.todo?.title, "string");
      assert.equal(typeof body.todo?.done, "boolean");
    };
    const assertDeletedShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["id", "ok", "witness"]);
      assert.equal(body.ok, true);
      assert.equal(typeof body.id, "string");
    };

    const before = await fetch(`${server.url}/api/todos`).then(r => r.json());
    assertTodoShape(before);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.list.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const createdBeforeActivate = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ title: "Authored create v1" })
    }).then(r => r.json());
    assertCreatedShape(createdBeforeActivate);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.create.v1");
    const updatedBeforeActivate = await fetch(`${server.url}/api/todos/${createdBeforeActivate.todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ done: true })
    }).then(r => r.json());
    assertUpdatedShape(updatedBeforeActivate);
    assert.equal(updatedBeforeActivate.todo.done, true);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.update.v1");
    const deletedBeforeActivate = await fetch(`${server.url}/api/todos/${createdBeforeActivate.todo.id}`, {
      method: "DELETE",
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertDeletedShape(deletedBeforeActivate);
    assert.equal(deletedBeforeActivate.id, createdBeforeActivate.todo.id);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.delete.v1");

    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.todos.list/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.todos.list.v2" })
    });
    assert.equal(activated.status, 200);
    const activatedCreate = await fetch(`${server.url}/api/backend-program-versions/todo.todos.create/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.todos.create.v2" })
    });
    assert.equal(activatedCreate.status, 200);
    const activatedUpdate = await fetch(`${server.url}/api/backend-program-versions/todo.todos.update/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.todos.update.v2" })
    });
    assert.equal(activatedUpdate.status, 200);
    const activatedDelete = await fetch(`${server.url}/api/backend-program-versions/todo.todos.delete/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.todos.delete.v2" })
    });
    assert.equal(activatedDelete.status, 200);

    const afterActivate = await fetch(`${server.url}/api/todos`).then(r => r.json());
    assertTodoShape(afterActivate);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.list.v2");
    const createdAfterActivate = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ title: "Authored create v2" })
    }).then(r => r.json());
    assertCreatedShape(createdAfterActivate);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.create.v2");
    const updatedAfterActivate = await fetch(`${server.url}/api/todos/${createdAfterActivate.todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ done: true })
    }).then(r => r.json());
    assertUpdatedShape(updatedAfterActivate);
    assert.equal(updatedAfterActivate.todo.done, true);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.update.v2");
    const deletedAfterActivate = await fetch(`${server.url}/api/todos/${createdAfterActivate.todo.id}`, {
      method: "DELETE",
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertDeletedShape(deletedAfterActivate);
    assert.equal(deletedAfterActivate.id, createdAfterActivate.todo.id);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.delete.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.todos.list/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);
    const rolledBackCreate = await fetch(`${server.url}/api/backend-program-versions/todo.todos.create/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBackCreate.status, 200);
    const rolledBackUpdate = await fetch(`${server.url}/api/backend-program-versions/todo.todos.update/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBackUpdate.status, 200);
    const rolledBackDelete = await fetch(`${server.url}/api/backend-program-versions/todo.todos.delete/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBackDelete.status, 200);

    const afterRollback = await fetch(`${server.url}/api/todos`).then(r => r.json());
    assertTodoShape(afterRollback);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.list.v1");
    const createdAfterRollback = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ title: "Authored create rollback" })
    }).then(r => r.json());
    assertCreatedShape(createdAfterRollback);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.create.v1");
    const updatedAfterRollback = await fetch(`${server.url}/api/todos/${createdAfterRollback.todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ done: true })
    }).then(r => r.json());
    assertUpdatedShape(updatedAfterRollback);
    assert.equal(updatedAfterRollback.todo.done, true);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.update.v1");
    const deletedAfterRollback = await fetch(`${server.url}/api/todos/${createdAfterRollback.todo.id}`, {
      method: "DELETE",
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertDeletedShape(deletedAfterRollback);
    assert.equal(deletedAfterRollback.id, createdAfterRollback.todo.id);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.todos.delete.v1");
  } finally {
    await server.close();
  }
});

test("private notes routes run through authored backend programs and switch versions live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertNotesShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["notes", "privacy"]);
      assert.equal(Array.isArray(body.notes), true);
      assert.equal(typeof body.privacy?.mode, "string");
    };
    const assertCreatedShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["note", "privacy"]);
      assert.equal(typeof body.note?.text, "string");
      assert.equal(typeof body.privacy?.mode, "string");
    };

    const before = await fetch(`${server.url}/api/private-notes`).then(r => r.json());
    assertNotesShape(before);
    assert.equal(before.privacy.mode, "signin");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.list.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const createdBeforeActivate = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ text: "Authored private note v1" })
    }).then(r => r.json());
    assertCreatedShape(createdBeforeActivate);
    assert.equal(createdBeforeActivate.note.text, "Authored private note v1");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.create.v1");

    const activatedList = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.list/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.privateNotes.list.v2" })
    });
    assert.equal(activatedList.status, 200);
    const activatedCreate = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.create/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.privateNotes.create.v2" })
    });
    assert.equal(activatedCreate.status, 200);

    const afterActivate = await fetch(`${server.url}/api/private-notes`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertNotesShape(afterActivate);
    assert.equal(afterActivate.notes.some(note => note.text === "Authored private note v1"), true);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.list.v2");

    const createdAfterActivate = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ text: "Authored private note v2" })
    }).then(r => r.json());
    assertCreatedShape(createdAfterActivate);
    assert.equal(createdAfterActivate.note.text, "Authored private note v2");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.create.v2");

    const rolledBackList = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.list/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBackList.status, 200);
    const rolledBackCreate = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.create/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBackCreate.status, 200);

    const afterRollback = await fetch(`${server.url}/api/private-notes`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertNotesShape(afterRollback);
    assert.equal(afterRollback.notes.some(note => note.text === "Authored private note v2"), true);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.list.v1");

    const createdAfterRollback = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ text: "Authored private note rollback" })
    }).then(r => r.json());
    assertCreatedShape(createdAfterRollback);
    assert.equal(createdAfterRollback.note.text, "Authored private note rollback");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.create.v1");
  } finally {
    await server.close();
  }
});

test("widgets create route runs through authored backend programs, stamps frontend context, and returns proposals for non-stewards", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertWidgetShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["widget", "witness"]);
      assert.equal(typeof body.widget?.id, "string");
      assert.equal(typeof body.widget?.kind, "string");
    };

    const denied = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "unsigned_widget", kind: "Text", text: "Unsigned widget" })
    });
    assert.equal(denied.status, 401);

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const createdBeforeActivate = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ id: "authored_widget_v1", kind: "Text", text: "Authored widget v1" })
    }).then(r => r.json());
    assertWidgetShape(createdBeforeActivate);
    assert.equal(createdBeforeActivate.widget.parent, "todo_app_widget");
    assert.equal(createdBeforeActivate.widget.context, "frontend");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.widgets.create.v1");

    const proposed = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: callan.cookie },
      body: JSON.stringify({ id: "callan_widget", kind: "Text", text: "Callan widget" })
    });
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.proposal.targetProcess, "widget.define");
    assert.equal(proposedBody.proposal.targetKind, "context");
    assert.equal(proposedBody.proposal.targetId, "frontend");
    assert.equal(proposedBody.statusMessage, "Proposed widget for review.");
    assert.equal(world.allWitnesses().some(w => w.process === "widget.define" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);

    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.widgets.create/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.widgets.create.v2" })
    });
    assert.equal(activated.status, 200);

    const createdAfterActivate = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ id: "authored_widget_v2", kind: "Text", text: "Authored widget v2" })
    }).then(r => r.json());
    assertWidgetShape(createdAfterActivate);
    assert.equal(createdAfterActivate.widget.parent, "todo_app_widget");
    assert.equal(createdAfterActivate.widget.context, "frontend");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.widgets.create.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.widgets.create/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const createdAfterRollback = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ id: "authored_widget_rollback", kind: "Text", text: "Authored widget rollback" })
    }).then(r => r.json());
    assertWidgetShape(createdAfterRollback);
    assert.equal(createdAfterRollback.widget.parent, "todo_app_widget");
    assert.equal(createdAfterRollback.widget.context, "frontend");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.widgets.create.v1");
  } finally {
    await server.close();
  }
});

test("witnesses list route runs through authored backend programs and preserves query passthrough live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertWitnessShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["offset", "total", "witnesses"]);
      assert.equal(Array.isArray(body.witnesses), true);
      assert.equal(typeof body.offset, "number");
      assert.equal(typeof body.total, "number");
      assert.equal(body.total >= body.witnesses.length, true);
    };

    const listedBeforeActivate = await fetch(`${server.url}/api/witnesses`).then(r => r.json());
    assertWitnessShape(listedBeforeActivate);
    assert.equal(listedBeforeActivate.offset, 0);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.witnesses.list.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.witnesses.list/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.witnesses.list.v2" })
    });
    assert.equal(activated.status, 200);

    const listedAfterActivate = await fetch(`${server.url}/api/witnesses?offset=1`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertWitnessShape(listedAfterActivate);
    assert.equal(listedAfterActivate.offset, 1);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.witnesses.list.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.witnesses.list/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const listedAfterRollback = await fetch(`${server.url}/api/witnesses?offset=2`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertWitnessShape(listedAfterRollback);
    assert.equal(listedAfterRollback.offset, 2);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.witnesses.list.v1");
  } finally {
    await server.close();
  }
});

test("witnesses list route runs through authored backend programs, preserves actor visibility, and switches versions live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertWitnessShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["offset", "total", "witnesses"]);
      assert.equal(Array.isArray(body.witnesses), true);
    };

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const note = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ text: "Witness visibility note" })
    }).then(r => r.json());
    assert.equal(note.note.text, "Witness visibility note");

    const signedOutWitnesses = await fetch(`${server.url}/api/witnesses`).then(r => r.json());
    assertWitnessShape(signedOutWitnesses);
    assert.equal(typeof signedOutWitnesses.witnesses.at(0)?.bodyJson, "string");
    assert.equal(signedOutWitnesses.witnesses.some(w => w.process === "privateNote.create"), false);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.witnesses.list.v1");

    const aaronWitnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertWitnessShape(aaronWitnesses);
    assert.equal(aaronWitnesses.witnesses.some(w => w.process === "privateNote.create"), true);

    const callanWitnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callan.cookie }
    }).then(r => r.json());
    assertWitnessShape(callanWitnesses);
    assert.equal(callanWitnesses.witnesses.some(w => w.process === "privateNote.create"), false);

    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.witnesses.list/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.witnesses.list.v2" })
    });
    assert.equal(activated.status, 200);

    const afterActivate = await fetch(`${server.url}/api/witnesses?offset=1`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertWitnessShape(afterActivate);
    assert.equal(afterActivate.offset, 1);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.witnesses.list.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.witnesses.list/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const afterRollback = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertWitnessShape(afterRollback);
    assert.equal(afterRollback.witnesses.some(w => w.process === "privateNote.create"), true);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.witnesses.list.v1");
  } finally {
    await server.close();
  }
});

test("simulate network error route runs through authored backend programs and preserves the failure contract live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertFailureShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["error"]);
      assert.equal(body.error, "simulated network error");
    };

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });

    const failedBeforeActivate = await fetch(`${server.url}/api/simulate-network-error`, {
      headers: { cookie: aaron.cookie }
    });
    assert.equal(failedBeforeActivate.status, 503);
    assertFailureShape(await failedBeforeActivate.json());
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.network.simulateError.v1");

    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.network.simulateError/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.network.simulateError.v2" })
    });
    assert.equal(activated.status, 200);

    const failedAfterActivate = await fetch(`${server.url}/api/simulate-network-error`, {
      headers: { cookie: aaron.cookie }
    });
    assert.equal(failedAfterActivate.status, 503);
    assertFailureShape(await failedAfterActivate.json());
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.network.simulateError.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.network.simulateError/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const failedAfterRollback = await fetch(`${server.url}/api/simulate-network-error`, {
      headers: { cookie: aaron.cookie }
    });
    assert.equal(failedAfterRollback.status, 503);
    assertFailureShape(await failedAfterRollback.json());
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.network.simulateError.v1");
    assert.equal(world.allWitnesses().filter(w => w.process === "network.simulated.failed" && w.actor === "aaron").length >= 3, true);
  } finally {
    await server.close();
  }
});

test("world graph route runs through authored backend programs and preserves the projected graph contract live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertWorldGraphShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["astNodes", "graph"]);
      assert(Array.isArray(body.graph?.nodes));
      assert(Array.isArray(body.graph?.edges));
      assert.equal(typeof body.astNodes?.byFile, "object");
      assert.equal(typeof body.astNodes?.byTarget, "object");
    };

    const beforeActivate = await fetch(`${server.url}/api/world-graph`).then(r => r.json());
    assertWorldGraphShape(beforeActivate);
    assert(beforeActivate.graph.nodes.some(node => node.id === "todo_app_widget"));
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.worldGraph.read.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.worldGraph.read/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.worldGraph.read.v2" })
    });
    assert.equal(activated.status, 200);

    const afterActivate = await fetch(`${server.url}/api/world-graph`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertWorldGraphShape(afterActivate);
    assert(afterActivate.graph.nodes.some(node => node.id === "todo_app_widget"));
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.worldGraph.read.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.worldGraph.read/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const afterRollback = await fetch(`${server.url}/api/world-graph`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertWorldGraphShape(afterRollback);
    assert(afterRollback.graph.nodes.some(node => node.id === "todo_app_widget"));
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.worldGraph.read.v1");
  } finally {
    await server.close();
  }
});

test("process view route runs through authored backend programs and preserves backend run inspection query passthrough live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertProcessViewShape = body => {
      assert.equal(body.selection.program, "todo.todos.list.v1");
      assert.equal(body.selection.event, "request");
      assert.equal(Array.isArray(body.catalog), true);
      assert.equal(Array.isArray(body.runs), true);
      assert.equal(body.run.requests.some(request => request.handler === "todos.readModel"), true);
      assert.equal(body.run.requests.some(request => request.url === "/api/todos"), true);
    };

    await fetch(`${server.url}/api/todos`).then(r => r.json());
    const todoRunId = world.allObservations()
      .filter(w => w.process === "backend.process.start" && w.body?.program === "todo.todos.list.v1")
      .at(-1)?.body?.runId;
    assert.ok(todoRunId, "expected /api/todos backend run");

    const beforeActivate = await fetch(`${server.url}/api/process-view?program=todo.todos.list.v1&event=request&runId=${todoRunId}`).then(r => r.json());
    assertProcessViewShape(beforeActivate);
    assert.equal(beforeActivate.selection.runId, todoRunId);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processView.read.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.processView.read/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.processView.read.v2" })
    });
    assert.equal(activated.status, 200);

    const afterActivate = await fetch(`${server.url}/api/process-view?program=todo.todos.list.v1&event=request&runId=${todoRunId}`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertProcessViewShape(afterActivate);
    assert.equal(afterActivate.selection.runId, todoRunId);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processView.read.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.processView.read/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const afterRollback = await fetch(`${server.url}/api/process-view?program=todo.todos.list.v1&event=request&runId=${todoRunId}`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertProcessViewShape(afterRollback);
    assert.equal(afterRollback.selection.runId, todoRunId);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processView.read.v1");
  } finally {
    await server.close();
  }
});

test("process run route runs through authored backend programs and preserves replay inspection for backend runs live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertProcessRunShape = body => {
      assert.equal(body.run.program, "todo.todos.list.v1");
      assert.equal(body.run.event, "request");
      assert.equal(body.run.requests.some(request => request.handler === "todos.readModel"), true);
      assert.equal(body.run.requests.some(request => request.url === "/api/todos"), true);
      assert.equal(body.replay.cursor, 1);
      assert.equal(body.replay.max >= 1, true);
    };

    await fetch(`${server.url}/api/todos`).then(r => r.json());
    const todoRunId = world.allObservations()
      .filter(w => w.process === "backend.process.start" && w.body?.program === "todo.todos.list.v1")
      .at(-1)?.body?.runId;
    assert.ok(todoRunId, "expected /api/todos backend run");

    const beforeActivate = await fetch(`${server.url}/api/process-runs/${todoRunId}?replay=1`).then(r => r.json());
    assertProcessRunShape(beforeActivate);
    assert.equal(beforeActivate.run.runId, todoRunId);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processRun.read.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.processRun.read/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.processRun.read.v2" })
    });
    assert.equal(activated.status, 200);

    const afterActivate = await fetch(`${server.url}/api/process-runs/${todoRunId}?replay=1`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertProcessRunShape(afterActivate);
    assert.equal(afterActivate.run.runId, todoRunId);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processRun.read.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.processRun.read/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const afterRollback = await fetch(`${server.url}/api/process-runs/${todoRunId}?replay=1`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertProcessRunShape(afterRollback);
    assert.equal(afterRollback.run.runId, todoRunId);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processRun.read.v1");
  } finally {
    await server.close();
  }
});

test("process events route runs through authored backend programs and preserves trace ingest success and validation live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const validTrace = body => fetch(`${server.url}/api/process-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        process: "frontend.process.start",
        runId: "trace-run",
        program: "todo_frontend_program",
        event: "load",
        timestamp: Date.now(),
        ...body
      })
    });

    const invalidTrace = process => fetch(`${server.url}/api/process-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ process })
    });

    const beforeActivate = await validTrace({});
    assert.equal(beforeActivate.status, 200);
    const beforeActivateBody = await beforeActivate.json();
    assert.equal(beforeActivateBody.ok, true);
    assert.equal(typeof beforeActivateBody.id, "string");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processEvents.record.v1");

    const beforeInvalid = await invalidTrace("frontend.process.nope");
    assert.equal(beforeInvalid.status, 400);
    assert.deepEqual(await beforeInvalid.json(), { error: "unknown process trace", process: "frontend.process.nope" });
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processEvents.record.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const activated = await fetch(`${server.url}/api/backend-program-versions/todo.processEvents.record/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.processEvents.record.v2" })
    });
    assert.equal(activated.status, 200);

    const afterActivate = await validTrace({ nodeId: "step-1", op: "fetchJson" });
    assert.equal(afterActivate.status, 200);
    const afterActivateBody = await afterActivate.json();
    assert.equal(afterActivateBody.ok, true);
    assert.equal(typeof afterActivateBody.id, "string");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processEvents.record.v2");

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/todo.processEvents.record/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const afterRollback = await invalidTrace("frontend.process.invalid");
    assert.equal(afterRollback.status, 400);
    assert.deepEqual(await afterRollback.json(), { error: "unknown process trace", process: "frontend.process.invalid" });
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.processEvents.record.v1");
    assert.equal(world.allWitnesses().some(w => w.process === "frontend.process.start" && w.body?.runId === "trace-run"), true);
  } finally {
    await server.close();
  }
});

test("shared todo routes expose authority metadata and return proposals for signed-in non-stewards", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const signedOut = await fetch(`${server.url}/api/todos`).then(r => r.json());
    assert.equal(signedOut.authority.mode, "signin");
    const unsignedWrite = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Unsigned write" })
    });
    assert.equal(unsignedWrite.status, 401);

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const created = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ title: "Governed todo" })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();

    const proposeMode = await fetch(`${server.url}/api/todos`, {
      headers: { cookie: callan.cookie }
    }).then(r => r.json());
    assert.equal(proposeMode.authority.mode, "propose");

    const proposedCreate = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: callan.cookie },
      body: JSON.stringify({ title: "Callan proposal" })
    });
    assert.equal(proposedCreate.status, 202);
    const proposedCreateBody = await proposedCreate.json();
    assert.equal(proposedCreateBody.proposal.targetProcess, "todo.create");
    assert.equal(world.allWitnesses().some(w => w.process === "todo.create" && w.actor === "callan"), false);

    const proposedUpdate = await fetch(`${server.url}/api/todos/${createdBody.todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: callan.cookie },
      body: JSON.stringify({ done: true })
    });
    assert.equal(proposedUpdate.status, 202);
    const proposedUpdateBody = await proposedUpdate.json();
    assert.equal(proposedUpdateBody.proposal.targetProcess, "todo.update");

    const proposedDelete = await fetch(`${server.url}/api/todos/${createdBody.todo.id}`, {
      method: "DELETE",
      headers: { cookie: callan.cookie }
    });
    assert.equal(proposedDelete.status, 202);
    const proposedDeleteBody = await proposedDelete.json();
    assert.equal(proposedDeleteBody.proposal.targetProcess, "todo.delete");

    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "todo.update" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "todo.delete" && w.actor === "callan"), false);
  } finally {
    await server.close();
  }
});

test("personal projections: identity session, themes, and private notes are session-scoped", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const html = await fetch(server.url).then(r => r.text());
    assert.match(html, /Personal Projection/);
    assert.match(html, /Private Notes/);
    assert.match(html, /initSession/);
    assert.match(html, /renderCollection/);

    const session = await fetch(`${server.url}/api/session`).then(r => r.json());
    assert.deepEqual(session, {
      authenticated: false,
      identity: null,
      actor: null,
      authenticatedIdentity: null,
      authenticatedActor: null,
      effectiveIdentity: null,
      effectiveActor: null,
      authorityMode: "direct",
      assumptionGrantId: null,
      label: null,
      authenticatedLabel: null,
      effectiveLabel: null,
      profile: { displayName: null, jobTitle: null, initials: null },
      authenticatedProfile: { displayName: null, jobTitle: null, initials: null },
      effectiveProfile: { displayName: null, jobTitle: null, initials: null },
      roles: [],
      featureAccess: {},
      homeContext: null,
      perspective: null,
      authenticatedHomeContext: null,
      authenticatedPerspective: null,
      effectiveHomeContext: null,
      effectivePerspective: null
    });

    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.identity, "identity.aaron");
    assert.equal(login.body.actor, "aaron");
    assert.equal(login.body.authenticatedIdentity, "identity.aaron");
    assert.equal(login.body.authenticatedActor, "aaron");
    assert.equal(login.body.effectiveIdentity, "identity.aaron");
    assert.equal(login.body.effectiveActor, "aaron");
    assert.equal(login.body.authorityMode, "direct");
    assert.ok(login.cookie);

    const signedOutNotes = await fetch(`${server.url}/api/private-notes`).then(r => r.json());
    assert.deepEqual(signedOutNotes.notes, []);
    assert.equal(signedOutNotes.privacy.mode, "signin");
    assert.equal(signedOutNotes.privacy.visibility, "actor-private");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.list.v1");

    const note = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ text: "Aaron-only thought" })
    }).then(r => r.json());
    assert.equal(note.note.text, "Aaron-only thought");
    assert.equal(note.privacy.mode, "private");
    assert.equal(note.privacy.actor, "aaron");
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.create.v1");

    const aaronNotes = await fetch(`${server.url}/api/private-notes`, {
      headers: { cookie: login.cookie }
    }).then(r => r.json());
    const callanLogin = await openSession(server.url, { username: "callan", password: "callan" });
    const callanNotes = await fetch(`${server.url}/api/private-notes`, {
      headers: { cookie: callanLogin.cookie }
    }).then(r => r.json());

    assert.deepEqual(aaronNotes.notes.map(n => n.text), ["Aaron-only thought"]);
    assert.equal(aaronNotes.privacy.mode, "private");
    assert.equal(aaronNotes.privacy.actor, "aaron");
    assert.deepEqual(callanNotes.notes, []);
    assert.equal(callanNotes.privacy.mode, "private");
    assert.equal(callanNotes.privacy.actor, "callan");

    const aaronWitnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: login.cookie }
    }).then(r => r.json());
    const callanWitnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: callanLogin.cookie }
    }).then(r => r.json());

    assert.equal(aaronWitnesses.witnesses.some(w => w.process === "privateNote.create"), true);
    assert.equal(callanWitnesses.witnesses.some(w => w.process === "privateNote.create"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "session.open" && w.actor === "aaron"), true);
  } finally {
    await server.close();
  }
});

test("session open can assume a granted actor and subsequent requests act as the effective actor", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  grantIdentityActorAssumption(world, {
    actor: "adam",
    identityId: "identity.aaron",
    targetActor: "callan"
  });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const login = await openSession(server.url, {
      username: "aaron",
      password: "aaron",
      assumeActor: "callan"
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.authenticatedIdentity, "identity.aaron");
    assert.equal(login.body.authenticatedActor, "aaron");
    assert.equal(login.body.effectiveIdentity, "identity.callan");
    assert.equal(login.body.effectiveActor, "callan");
    assert.equal(login.body.identity, "identity.callan");
    assert.equal(login.body.actor, "callan");
    assert.equal(login.body.authorityMode, "assumed");
    assert.equal(login.body.assumptionGrantId, "identity.aaron=>callan");

    const note = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ text: "Assumed note" })
    }).then(r => r.json());
    assert.equal(note.privacy.actor, "callan");

    const readback = await fetch(`${server.url}/api/session`, {
      headers: { cookie: login.cookie }
    }).then(r => r.json());
    assert.equal(readback.authenticatedIdentity, "identity.aaron");
    assert.equal(readback.effectiveActor, "callan");
    assert.equal(readback.authorityMode, "assumed");

    const openWitness = world.allWitnesses().findLast(w => w.process === "session.open");
    assert.equal(openWitness?.body?.authenticatedIdentity, "identity.aaron");
    assert.equal(openWitness?.body?.effectiveActor, "callan");
    assert.equal(openWitness?.body?.authorityMode, "assumed");
  } finally {
    await server.close();
  }
});

test("session open rejects ungranted actor assumptions without creating a session", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const response = await fetch(`${server.url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "aaron",
        password: "aaron",
        assumeActor: "callan"
      })
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { error: "assumption denied" });

    const failureWitness = world.allWitnesses().findLast(w => w.process === "session.open.failed");
    assert.equal(failureWitness?.body?.username, "aaron");
    assert.equal(failureWitness?.body?.assumeActor, "callan");
    assert.equal(failureWitness?.body?.reason, "assumption denied");
    assert.equal(world.allWitnesses().some(w => w.process === "session.open"), false);
  } finally {
    await server.close();
  }
});

test("authority grant APIs create, list, reject duplicates, revoke, and block new assumed sessions", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });
  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    assert.equal(login.response.status, 200);

    const created = await fetch(`${server.url}/api/authority/grants`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: login.cookie
      },
      body: JSON.stringify({
        identityId: "identity.aaron",
        targetActor: "callan"
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.grant.id, "identity.aaron=>callan");
    assert.equal(createdBody.grant.active, true);
    assert.equal(createdBody.grant.status, "active");
    assert.equal(createdBody.grant.identity.id, "identity.aaron");
    assert.equal(createdBody.grant.targetIdentity.id, "identity.callan");

    const listed = await fetch(`${server.url}/api/authority/grants?identity=identity.aaron&actor=callan`, {
      headers: { cookie: login.cookie }
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.grants.length, 1);
    assert.equal(listedBody.grants[0].id, "identity.aaron=>callan");
    assert.equal(listedBody.grants[0].active, true);

    const duplicate = await fetch(`${server.url}/api/authority/grants`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: login.cookie
      },
      body: JSON.stringify({
        identityId: "identity.aaron",
        targetActor: "callan"
      })
    });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).grant.id, "identity.aaron=>callan");

    const revoked = await fetch(`${server.url}/api/authority/grants/${encodeURIComponent("identity.aaron=>callan")}`, {
      method: "DELETE",
      headers: { cookie: login.cookie }
    });
    assert.equal(revoked.status, 200);
    const revokedBody = await revoked.json();
    assert.equal(revokedBody.changed, true);
    assert.equal(revokedBody.grant.active, false);
    assert.equal(revokedBody.grant.status, "revoked");

    const relisted = await fetch(`${server.url}/api/authority/grants?identity=identity.aaron&actor=callan`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(relisted.grants[0].active, false);
    assert.equal(relisted.grants[0].revokedBy, "aaron");

    const assumedLogin = await openSession(server.url, {
      username: "aaron",
      password: "aaron",
      assumeActor: "callan"
    });
    assert.equal(assumedLogin.response.status, 403);
    assert.deepEqual(assumedLogin.body, { error: "assumption denied" });
  } finally {
    await server.close();
  }
});

test("private notes routes run through authored backend programs and switch versions live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const assertListShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["notes", "privacy"]);
      assert.equal(Array.isArray(body.notes), true);
      assert.equal(body.privacy.visibility, "actor-private");
    };
    const assertCreatedShape = body => {
      assert.deepEqual(Object.keys(body).sort(), ["note", "privacy"]);
      assert.equal(typeof body.note?.text, "string");
      assert.equal(body.privacy.visibility, "actor-private");
    };

    const signedOutList = await fetch(`${server.url}/api/private-notes`).then(r => r.json());
    assertListShape(signedOutList);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.list.v1");

    const aaron = await openSession(server.url, { username: "aaron", password: "aaron" });
    const createdBeforeActivate = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ text: "Authored private note v1" })
    }).then(r => r.json());
    assertCreatedShape(createdBeforeActivate);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.create.v1");

    const activatedList = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.list/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.privateNotes.list.v2" })
    });
    assert.equal(activatedList.status, 200);
    const activatedCreate = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.create/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ version: "todo.privateNotes.create.v2" })
    });
    assert.equal(activatedCreate.status, 200);

    const listAfterActivate = await fetch(`${server.url}/api/private-notes`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertListShape(listAfterActivate);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.list.v2");
    const createdAfterActivate = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ text: "Authored private note v2" })
    }).then(r => r.json());
    assertCreatedShape(createdAfterActivate);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.create.v2");

    const rolledBackList = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.list/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBackList.status, 200);
    const rolledBackCreate = await fetch(`${server.url}/api/backend-program-versions/todo.privateNotes.create/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(rolledBackCreate.status, 200);

    const listAfterRollback = await fetch(`${server.url}/api/private-notes`, {
      headers: { cookie: aaron.cookie }
    }).then(r => r.json());
    assertListShape(listAfterRollback);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.list.v1");
    const createdAfterRollback = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({ text: "Authored private note rollback" })
    }).then(r => r.json());
    assertCreatedShape(createdAfterRollback);
    assert.equal(world.allObservations().filter(w => w.process === "backend.process.start").at(-1)?.body?.program, "todo.privateNotes.create.v1");
  } finally {
    await server.close();
  }
});

test("server can activate widget versions through backend API", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-version-"));
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Version API" }

[[route]]
actor = "adam"
id = "home_route"
path = "/"
serves = "page"
method = "GET"
handler = "page.home"
params = { rootWidget = "root" }

[[widgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v1"
kind = "Text"
index = 0
props = { text = "Banner v1" }

[[widgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v2"
kind = "Text"
index = 1
props = { text = "Banner v2" }

[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v1"
to = "banner_v2"
strategy = "compatible"

[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v2"
to = "banner_v1"
strategy = "compatible"

[[activateWidgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v1"

[[attachWidget]]
actor = "adam"
parent = "root"
child = "banner"
order = 0
`);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: tmp
  });

  assert.equal(server.ok, true);
  let html = await (await fetch(server.url)).text();
  assert.match(html, /Banner v1/);
  const login = await openSession(server.url, { username: "aaron", password: "aaron" });

  const res = await fetch(`${server.url}/api/widget-versions/banner/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: login.cookie },
    body: JSON.stringify({ version: "banner_v2" })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "activated");

  html = await (await fetch(server.url)).text();
  assert.match(html, /Banner v2/);
  assert.equal(world.allWitnesses().at(-1).process, "widget.renderHtml");
  assert(world.allWitnesses().some(w => w.process === "activateWidgetVersion" && w.actor === "aaron"));

  await server.close();
});

test("widget version api blocks by default, surfaces forkRequired, and rolls back to the previous version", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-version-policy-"));
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyMinimalTodoDsl(world, `
[[context]]
actor = "adam"
id = "ctx.shared"
owner = "adam"
stewards = ["aaron"]

[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Version API" }

[[route]]
actor = "adam"
id = "home_route"
path = "/"
serves = "page"
method = "GET"
handler = "page.home"
params = { rootWidget = "root" }

[[widgetVersion]]
actor = "adam"
context = "ctx.shared"
soul = "banner"
version = "banner_v1"
kind = "Text"
index = 0
props = { text = "Banner v1" }

[[widgetVersion]]
actor = "adam"
context = "ctx.shared"
soul = "banner"
version = "banner_v2"
kind = "Text"
index = 1
props = { text = "Banner v2" }

[[widgetVersion]]
actor = "adam"
context = "ctx.shared"
soul = "banner"
version = "banner_v3"
kind = "Text"
index = 2
props = { text = "Banner v3" }

[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v1"
to = "banner_v2"
strategy = "migrate"

[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v2"
to = "banner_v3"
strategy = "fork"

[[activateWidgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v1"

[[attachWidget]]
actor = "adam"
parent = "root"
child = "banner"
order = 0
`);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: tmp
  });

  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const blocked = await fetch(`${server.url}/api/widget-versions/banner/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ version: "banner_v3" })
    });
    assert.equal(blocked.status, 409);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.status, "blocked");
    assert.equal(blockedBody.witness.process, "activateWidgetVersion.blocked");

    const migrated = await fetch(`${server.url}/api/widget-versions/banner/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ version: "banner_v2" })
    });
    assert.equal(migrated.status, 200);
    const migratedBody = await migrated.json();
    assert.equal(migratedBody.status, "migrated");
    assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.migrate"), true);

    const forkRequired = await fetch(`${server.url}/api/widget-versions/banner/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ version: "banner_v3" })
    });
    assert.equal(forkRequired.status, 409);
    const forkBody = await forkRequired.json();
    assert.equal(forkBody.status, "forkRequired");
    assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.fork.requested"), true);

    const rollback = await fetch(`${server.url}/api/widget-versions/banner/rollback`, {
      method: "POST",
      headers: { cookie: login.cookie }
    });
    assert.equal(rollback.status, 200);
    const rollbackBody = await rollback.json();
    assert.equal(rollbackBody.status, "rolledBack");
    assert.equal(rollbackBody.version, "banner_v1");
    assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.rollback"), true);
  } finally {
    await server.close();
  }
});

test("shared widget version APIs return proposals for signed-in unauthorized actors", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const activate = await fetch(`${server.url}/api/widget-versions/todo_versioned_banner/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: callan.cookie },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    assert.equal(activate.status, 202);
    const activateBody = await activate.json();
    assert.equal(activateBody.status, "proposed");
    assert.equal(activateBody.statusMessage, "Proposed widget version activation for review.");
    assert.equal(activateBody.proposal?.targetProcess, "widgetVersion.activate");
    assert.equal(activateBody.proposal?.targetId, "todo_versioned_banner");

    const rollback = await fetch(`${server.url}/api/widget-versions/todo_versioned_banner/rollback`, {
      method: "POST",
      headers: { cookie: callan.cookie }
    });
    assert.equal(rollback.status, 202);
    const rollbackBody = await rollback.json();
    assert.equal(rollbackBody.status, "proposed");
    assert.equal(rollbackBody.statusMessage, "Proposed widget version rollback for review.");
    assert.equal(rollbackBody.proposal?.targetProcess, "widgetVersion.rollback");
    assert.equal(rollbackBody.proposal?.targetId, "todo_versioned_banner");

    assert.equal(world.allWitnesses().some(w => w.process === "activateWidgetVersion" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.rollback" && w.actor === "callan"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "proposal.create" && w.actor === "callan"), true);
  } finally {
    await server.close();
  }
});

test("process graph lab exposes simulated network failure as a witnessed UI scenario", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const html = await fetch(server.url).then(r => r.text());
    assert.match(html, /Process Graph Lab/);
    assert.match(html, /Simulate network error/);
    assert.match(html, /simulateNetworkError/);
    assert.match(html, /allowFailure/);
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });

    const res = await fetch(`${server.url}/api/simulate-network-error`, {
      headers: { cookie: login.cookie }
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "simulated network error");

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { cookie: login.cookie }
    }).then(r => r.json());
    assert.equal(witnesses.witnesses.some(w => w.process === "network.simulated.failed"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "network.simulated.failed" && w.actor === "aaron"), true);
  } finally {
    await server.close();
  }
});

test("generated frontend engine is syntactically valid browser JavaScript", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const html = await fetch(server.url).then(r => r.text());
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert(scripts.length > 0, "expected generated executable script");
    for (const script of scripts) {
      assert.doesNotThrow(() => new Function(script));
    }
    assert.match(scripts.join("\n"), /\(async \(\) => \{/);
    assert.doesNotMatch(scripts.join("\n"), /for \(const step of program\.steps\.filter\(s => s\.event === event\)/);
  } finally {
    await server.close();
  }
});

test("world graph endpoint is reachable and includes projected nodes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const body = await fetch(`${server.url}/api/world-graph`).then(r => r.json());
    assert(Array.isArray(body.graph.nodes));
    assert(Array.isArray(body.graph.edges));
    assert(body.graph.nodes.some(n => n.id === "todo_app_widget"));
  } finally {
    await server.close();
  }
});

test("private notes endpoint returns empty list without request actor", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  applyMinimalTodoDsl(world);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const response = await fetch(`${server.url}/api/private-notes`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.notes, []);
    assert.equal(body.privacy.mode, "signin");
    assert.equal(body.privacy.visibility, "actor-private");
  } finally {
    await server.close();
  }
});

test("logout emits session.logout witness", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  applyMinimalTodoDsl(world);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const response = await fetch(`${server.url}/api/session`, { method: "DELETE", headers: { cookie: login.cookie } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { ok: true });
    assert.equal(world.allWitnesses().some(w => w.process === "session.logout" && w.actor === "aaron"), true);
  } finally {
    await server.close();
  }
});

