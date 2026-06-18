import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { executeDemoProposalTarget } from "./demo-proposal-targets.js";
import { privateNotesPrivacyState } from "./private-notes-runtime.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "./projections.js";
import { providers } from "./runtime.js";
import { requestTodoCreate, requestTodoUpdate, requestTodoDelete } from "./todo-runtime.js";

test("demo plugin owns demo handler-set provider", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const handlerSetSource = await readFile(new URL("./handler-set.js", import.meta.url), "utf8");

  assert.equal(manifest.id, "plugin.demo");
  assert.deepEqual(manifest.activatesBundles, ["bundle-demo"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(runtimeSource.includes('bundleId = "bundle-demo"'), true);
  assert.equal(providers.some(provider => provider.kind === "handlerSet" && provider.id === "demo"), true);
  assert.equal(providers.some(provider => provider.kind === "moduleProjectors" && provider.id === "demo.projections"), true);
  assert.equal(providers.some(provider => provider.kind === "runtimeBuiltinSeeds" && provider.processSpecs?.some(spec => spec.id === "demo_server_runner_storage_spec")), true);
  assert.equal(runtimeSource.includes("handlerSetProvider = DEMO_HANDLER_SET_PROVIDER"), true);
  assert.equal(handlerSetSource.includes('kind: "handlerSet"'), true);
  assert.equal(handlerSetSource.includes('id: "demo"'), true);
  assert.equal(handlerSetSource.includes("factory: createDemoHandlerSet"), true);
  assert.equal(handlerSetSource.includes('"todos.list"'), true);
  assert.equal(handlerSetSource.includes('"demo.echo"'), true);
});

test("demo plugin owns todo, private-note, and public witness helpers", () => {
  const world = createWorld();
  world.emit({ process: "todo.create", actor: "aaron", claims: [], body: { todo: { id: "t1", title: "One", done: false } } });
  world.emit({ process: "todo.update", actor: "aaron", claims: [], body: { todo: { id: "t1", done: true } } });
  world.emit({ process: "privateNote.create", actor: "aaron", claims: [], body: { note: { id: "n1", text: "secret" } } });

  assert.deepEqual(todoState(world.allWitnesses()), [{ id: "t1", title: "One", done: true }]);
  assert.deepEqual(privateNotesFor(world.allWitnesses(), "aaron").map(note => note.text), ["secret"]);
  assert.equal(publicWitnessesFor(world.allWitnesses(), "callan").some(w => w.body?.note?.text === "secret"), false);
  assert.equal(privateNotesPrivacyState(null).mode, "signin");
  assert.equal(privateNotesPrivacyState("aaron").mode, "private");
});

test("demo plugin exposes projector-backed read models through runtime providers", () => {
  const world = createWorld();
  world.emit({ process: "todo.create", actor: "aaron", claims: [], body: { todo: { id: "t1", title: "One", done: false } } });
  world.emit({ process: "privateNote.create", actor: "aaron", claims: [], body: { note: { id: "n1", text: "secret" } } });

  const projectorProvider = providers.find(provider => provider.kind === "moduleProjectors" && provider.id === "demo.projections");
  assert.ok(projectorProvider);
  assert.equal(typeof projectorProvider.projectors["demo.todosReadModel"], "function");
  assert.equal(typeof projectorProvider.projectors["demo.privateNotesReadModel"], "function");

  const todoModel = projectorProvider.projectors["demo.todosReadModel"](world.allWitnesses(), { requestActor: "aaron" });
  assert.deepEqual(todoModel.todos.map(todo => todo.title), ["One"]);
  assert.equal(todoModel.authority.mode, "mutate");

  const privateNotesModel = projectorProvider.projectors["demo.privateNotesReadModel"](world.allWitnesses(), { requestActor: "aaron" });
  assert.deepEqual(privateNotesModel.notes.map(note => note.text), ["secret"]);
  assert.equal(privateNotesModel.privacy.mode, "private");
});

test("demo plugin owns todo mutation runtime and proposal target execution", async () => {
  const world = createWorld();
  const createResult = requestTodoCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "todo-1", title: "Write tests" },
    contextId: null
  });
  assert.equal(createResult.ok, true);

  const updateResult = requestTodoUpdate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "todo-1", done: true }
  });
  assert.equal(updateResult.ok, true);
  assert.equal(todoState(world.allWitnesses()).find(todo => todo.id === "todo-1")?.done, true);

  const deleteResult = requestTodoDelete(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "todo-1" }
  });
  assert.equal(deleteResult.ok, true);
  assert.equal(todoState(world.allWitnesses()).some(todo => todo.id === "todo-1"), false);

  const proposalWorld = createWorld();
  const proposalResult = executeDemoProposalTarget({
    world: proposalWorld,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "todo.create", targetId: "frontend" },
    body: { id: "todo-2", title: "Via proposal" },
    ensureContextAuthority: () => ({ ok: true })
  });
  assert.equal(proposalResult.ok, true);
  assert.equal(todoState(proposalWorld.allWitnesses()).find(todo => todo.id === "todo-2")?.title, "Via proposal");
});

test("demo runtime ownership is not implemented in core compatibility files", async () => {
  for (const file of [
    "../../src/projections.js",
    "../../src/private-notes-runtime.js",
    "../../src/todo-runtime.js"
  ]) {
    await assert.rejects(readFile(new URL(file, import.meta.url), "utf8"));
  }

  const proposalExecutorSource = await readFile(new URL("../proposals/proposal-executor.js", import.meta.url), "utf8");
  assert.equal(proposalExecutorSource.includes("../demo/demo-proposal-targets.js"), true);
  assert.equal(proposalExecutorSource.includes("../../src/todo-runtime.js"), false);
  assert.equal(proposalExecutorSource.includes("requestTodoCreate"), false);
});
