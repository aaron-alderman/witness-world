import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { WitnessLog } from "../src/witness-log.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "../plugins/demo/projections.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml, applyWitnessDocs, loadWitnessTomlFile } from "../src/dsl.js";

async function tempPath(name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-hardening-"));
  return path.join(dir, name);
}

async function tempStore() {
  return tempPath("todos.json");
}

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

async function openSession(serverUrl, { username = "aaron", password = username } = {}) {
  const response = await fetch(`${serverUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    response,
    body: await response.json(),
    cookie: cookieHeader(response.headers.get("set-cookie"))
  };
}

test("repeated identical process attempts remain distinct witnessed occurrences", () => {
  const world = createWorld();

  const a = world.emit({ process: "ping", actor: "adam", claims: [], body: { value: 1 } });
  const b = world.emit({ process: "ping", actor: "adam", claims: [], body: { value: 1 } });

  assert.notEqual(a.id, b.id);
  assert.equal(b.cause, a.id);
});

test("reloaded worlds continue the causal witness chain", async () => {
  const file = await tempPath("witnesses.jsonl");
  const world1 = createWorld({ witnessLogPath: file });
  const first = world1.emit({ process: "first", actor: "adam", claims: [], body: {} });

  const world2 = createWorld({ witnessLogPath: file });
  const second = world2.emit({ process: "second", actor: "adam", claims: [], body: {} });

  assert.equal(second.cause, first.id);

  const world3 = createWorld({ witnessLogPath: file });
  assert.deepEqual(world3.allWitnesses().map(w => w.process).slice(-2), ["first", "second"]);
});

test("projection cache tampering does not change projected todo state", async () => {
  const storePath = await tempStore();
  const world = createWorld();
  world.emit({ process: "todo.create", actor: "aaron", claims: [], body: { todo: { id: "t1", title: "canonical", done: false } } });

  await fs.writeFile(storePath, JSON.stringify([{ id: "evil", title: "cache only", done: false }]), "utf8");

  assert.deepEqual(todoState(world.allWitnesses()).map(t => t.title), ["canonical"]);
});

test("private note projection does not leak through visible witness projection", () => {
  const world = createWorld();
  world.emit({ process: "privateNote.create", actor: "aaron", claims: [], body: { note: { id: "n1", actor: "aaron", text: "secret" } } });
  world.emit({ process: "todo.create", actor: "callan", claims: [], body: { todo: { id: "t1", title: "public", done: false } } });

  assert.deepEqual(privateNotesFor(world.allWitnesses(), "callan"), []);
  assert.equal(JSON.stringify(publicWitnessesFor(world.allWitnesses(), "callan")).includes("secret"), false);
  assert.equal(JSON.stringify(publicWitnessesFor(world.allWitnesses(), "aaron")).includes("secret"), true);
});

test("widget editor creates stable thing-style ids rather than host timestamp ids", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore()),
    runtimeProfile: "minimal"
  });

  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const response = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ kind: "Text", text: "Hello", parent: "todo_app_widget", order: 4 })
    });
    const created = await response.json();

    assert.match(created.widget.id, /^thing_[0-9a-f]{24}$/);
    assert.equal(created.widget.id.includes("widget-"), false);
    assert.equal(created.widget.order, 4);
    assert.equal(created.witness.process, "widget.define");
  } finally {
    await server.close();
  }
});

test("typed widget.define rejects incompatible inputs with structured failures", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore()),
    runtimeProfile: "minimal"
  });

  try {
    const login = await openSession(server.url, { username: "aaron", password: "aaron" });
    const response = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ kind: "Nope", text: "Hello", order: "later" })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.witness.process, "widget.define.blocked");
    assert.equal(body.witness.body.gate, "type.compatibility");
    assert.equal(body.witness.body.failures.some(f => f.field === "kind"), true);
    assert.equal(body.witness.body.failures.some(f => f.field === "order"), true);
  } finally {
    await server.close();
  }
});

test("typed widget.define emits failed witness when process spec output is incompatible", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[trait]]
actor = "system"
id = "textual"

[[trait]]
actor = "system"
id = "numeric"

[[valueType]]
actor = "system"
id = "widget.kind"
compatibleWith = ["textual"]
editor = { control = "text" }

[[valueType]]
actor = "system"
id = "widget.text"
compatibleWith = ["textual"]
editor = { control = "text" }

[[valueType]]
actor = "system"
id = "widget.parent"
compatibleWith = ["textual"]
editor = { control = "text" }

[[valueType]]
actor = "system"
id = "widget.order"
compatibleWith = ["numeric"]
editor = { control = "number" }

[[processSpec]]
actor = "system"
id = "widget_define_spec"
process = "widget.define"
inputs = [{ name = "kind", accepts = "widget.kind", required = true }, { name = "text", accepts = "widget.text", required = true }]
outputs = [{ name = "id", accepts = "widget.text", required = true }, { name = "kind", accepts = "widget.order", required = true }, { name = "parent", accepts = "widget.parent", required = true }, { name = "text", accepts = "widget.text", required = true }, { name = "order", accepts = "widget.order", required = true }]

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
allowActorHeader = true

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
`);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: path.dirname(await tempStore())
  });

  try {
    const response = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
      body: JSON.stringify({ kind: "Text", text: "Hello" })
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.witness.process, "widget.define.failed");
    assert.equal(body.witness.body.failures.some(f => f.field === "kind"), true);
  } finally {
    await server.close();
  }
});

test("malformed JSON requests are witnessed as request failures", async () => {
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
    const response = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json"
    });

    assert.equal(response.status, 500);
    assert.equal(
      world.allObservations().some(observation =>
        observation.process === "server.request.failed"
        || observation.process === "backend.process.failed"
      ),
      true
    );
  } finally {
    await server.close();
  }
});

