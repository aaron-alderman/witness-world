import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { WitnessLog } from "../src/witness-log.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "../src/projections.js";
import { declareBackendHost, declareFrontendHost, startTodoServer } from "../src/host.js";
import { applyWitnessToml, applyWitnessDocs, loadWitnessTomlFile } from "../src/dsl.js";

async function tempPath(name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-hardening-"));
  return path.join(dir, name);
}

async function tempStore() {
  return tempPath("todos.json");
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
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startTodoServer(world, {
    actor: "adam",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    rootWidget: "todo_app_widget",
    frontendProgram: "todo_frontend_program",
    storePath: await tempStore()
  });

  try {
    const created = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-witness-actor": "aaron" },
      body: JSON.stringify({ kind: "Text", text: "Hello", parent: "todo_app_widget" })
    }).then(r => r.json());

    assert.match(created.widget.id, /^thing_[0-9a-f]{24}$/);
    assert.equal(created.widget.id.includes("widget-"), false);
  } finally {
    await server.close();
  }
});

test("malformed JSON requests are witnessed as request failures", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startTodoServer(world, {
    actor: "adam",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    rootWidget: "todo_app_widget",
    frontendProgram: "todo_frontend_program",
    storePath: await tempStore()
  });

  try {
    const response = await fetch(`${server.url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json"
    });

    assert.equal(response.status, 500);
    assert.equal(world.allObservations().at(-1).process, "todoServer.request.failed");
  } finally {
    await server.close();
  }
});
