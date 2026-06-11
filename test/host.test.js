import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer, hostCapabilities } from "../src/host.js";
import { applyWitnessToml, applyWitnessDocs, loadWitnessTomlFile, parseWitnessToml } from "../src/dsl.js";

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-todo-"));
  return path.join(dir, "todos.json");
}

function applyMinimalTodoDsl(world, extra = "") {
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

    const created = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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


test("demo server supports done/delete actions and witness inspector data", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
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

    const created = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Make witnesses visible" })
    }).then(r => r.json());

    const updated = await fetch(`${server.url}/api/todos/${created.todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true })
    }).then(r => r.json());

    assert.equal(updated.todo.done, true);

    const witnessesBeforeDelete = await fetch(`${server.url}/api/witnesses`).then(r => r.json());
    assert.equal(witnessesBeforeDelete.witnesses.some(w => w.process === "todo.update"), true);

    const deleted = await fetch(`${server.url}/api/todos/${created.todo.id}`, { method: "DELETE" }).then(r => r.json());
    assert.deepEqual(deleted, { ok: true, id: created.todo.id });

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

test("personal projections: actor session, themes, and private notes are actor-scoped", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
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
    assert.deepEqual(session.actors.map(a => a.id), ["aaron", "callan"]);

    const login = await fetch(`${server.url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
      body: JSON.stringify({ actor: "aaron" })
    }).then(r => r.json());
    assert.equal(login.actor.id, "aaron");

    const note = await fetch(`${server.url}/api/private-notes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
      body: JSON.stringify({ text: "Aaron-only thought" })
    }).then(r => r.json());
    assert.equal(note.note.text, "Aaron-only thought");

    const aaronNotes = await fetch(`${server.url}/api/private-notes`, {
      headers: { "x-witness-actor": "aaron" }
    }).then(r => r.json());
    const callanNotes = await fetch(`${server.url}/api/private-notes`, {
      headers: { "x-witness-actor": "callan" }
    }).then(r => r.json());

    assert.deepEqual(aaronNotes.notes.map(n => n.text), ["Aaron-only thought"]);
    assert.deepEqual(callanNotes.notes, []);

    const aaronWitnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { "x-witness-actor": "aaron" }
    }).then(r => r.json());
    const callanWitnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { "x-witness-actor": "callan" }
    }).then(r => r.json());

    assert.equal(aaronWitnesses.witnesses.some(w => w.process === "privateNote.create"), true);
    assert.equal(callanWitnesses.witnesses.some(w => w.process === "privateNote.create"), false);
    assert.equal(world.allWitnesses().some(w => w.process === "session.login" && w.actor === "aaron"), true);
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

  const res = await fetch(`${server.url}/api/widget-versions/banner/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
    body: JSON.stringify({ version: "banner_v2" })
  });
  assert.equal(res.status, 200);

  html = await (await fetch(server.url)).text();
  assert.match(html, /Banner v2/);
  assert.equal(world.allWitnesses().at(-1).process, "widget.renderHtml");
  assert(world.allWitnesses().some(w => w.process === "activateWidgetVersion" && w.actor === "aaron"));

  await server.close();
});

test("process graph lab exposes simulated network failure as a witnessed UI scenario", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
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

    const res = await fetch(`${server.url}/api/simulate-network-error`, {
      headers: { "x-witness-actor": "aaron" }
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "simulated network error");

    const witnesses = await fetch(`${server.url}/api/witnesses`, {
      headers: { "x-witness-actor": "aaron" }
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

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
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

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const body = await fetch(`${server.url}/api/world-graph`, {
      headers: { "x-witness-actor": "aaron" }
    }).then(r => r.json());
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
    await fetch(`${server.url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
      body: JSON.stringify({ actor: "aaron" })
    }).then(r => r.json());

    const response = await fetch(`${server.url}/api/session`, { method: "DELETE", headers: { "x-witness-actor": "aaron" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { ok: true });
    assert.equal(world.allObservations().some(w => w.process === "session.logout" && w.actor === "aaron"), true);
  } finally {
    await server.close();
  }
});
