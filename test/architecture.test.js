import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld, createThing, projectors } from "../src/kernel.js";
import { WitnessLog } from "../src/witness-log.js";
import { thingId, versionId } from "../src/ids.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "../plugins/demo/projections.js";
import { runGates, textRequired } from "../src/gates.js";

async function tempFile(name = "witnesses.jsonl") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-"));
  return path.join(dir, name);
}

test("witness log is append-only and can reload the canonical world", async () => {
  const file = await tempFile();
  const world1 = createWorld({ witnessLogPath: file });
  createThing(world1, { actor: "adam", id: "aaron" });

  const world2 = createWorld({ witnessLogPath: file });

  assert.deepEqual(world2.allWitnesses().map(w => w.id), world1.allWitnesses().map(w => w.id));
  const text = await fs.readFile(file, "utf8");
  assert.equal(text.trim().split(/\r?\n/).length, world1.allWitnesses().length);
});

test("stable identity helpers do not depend on labels as mutable state", () => {
  assert.equal(thingId("todo", { title: "A", ordinal: 1 }), thingId("todo", { ordinal: 1, title: "A" }));
  assert.notEqual(thingId("todo", { title: "A", ordinal: 1 }), thingId("todo", { title: "A", ordinal: 2 }));
  assert.equal(versionId("widget:todo", "v1"), versionId("widget:todo", "v1"));
});

test("todo state is projected from witnesses rather than canonical JSON records", () => {
  const world = createWorld();
  world.emit({ process: "todo.create", actor: "aaron", claims: [], body: { todo: { id: "t1", title: "One", done: false } } });
  world.emit({ process: "todo.update", actor: "aaron", claims: [], body: { todo: { id: "t1", done: true } } });
  world.emit({ process: "todo.create", actor: "aaron", claims: [], body: { todo: { id: "t2", title: "Two", done: false } } });
  world.emit({ process: "todo.delete", actor: "aaron", claims: [], body: { id: "t2" } });

  assert.deepEqual(todoState(world.allWitnesses()), [{ id: "t1", title: "One", done: true }]);
});

test("private notes and visible witnesses are actor-scoped projections", () => {
  const world = createWorld();
  world.emit({ process: "privateNote.create", actor: "aaron", claims: [], body: { note: { id: "n1", actor: "aaron", text: "A" } } });
  world.emit({ process: "privateNote.create", actor: "callan", claims: [], body: { note: { id: "n2", actor: "callan", text: "C" } } });

  assert.deepEqual(privateNotesFor(world.allWitnesses(), "aaron").map(n => n.text), ["A"]);
  assert.equal(publicWitnessesFor(world.allWitnesses(), "aaron").some(w => w.body?.note?.text === "C"), false);
  assert.equal(publicWitnessesFor(world.allWitnesses(), "callan").some(w => w.body?.note?.text === "A"), false);
});

test("gates emit blocking witnesses instead of throwing", () => {
  const world = createWorld();
  const result = runGates(world, { actor: "aaron", process: "todo.create", gates: [textRequired("title")], context: { title: "" } });

  assert.equal(result.ok, false);
  assert.equal(world.allWitnesses().at(-1).process, "todo.create.blocked");
  assert.equal(world.allWitnesses().at(-1).body.gate, "title.required");
});

// sanity check the class itself for tests that want an explicit in-memory log
// rather than createWorld's convenience wrapper.
test("witness log preserves observed repetitions and replace preserves ordering", () => {
  const log = new WitnessLog();
  log.append({ id: "w1", process: "first" });
  log.append({ id: "w1", process: "first again" });
  assert.deepEqual(log.all().map(w => w.process), ["first", "first again"]);
  log.replace([{ id: "w2", process: "second" }, { id: "w3", process: "third" }]);
  assert.deepEqual(log.all().map(w => w.process), ["second", "third"]);
});

test("witness log can buffer startup persistence and preserve ordered replay", async () => {
  const file = await tempFile("buffered-witnesses.jsonl");
  const log = new WitnessLog({ file, bufferedPersistence: true });
  log.append({ id: "w1", process: "first" });
  log.append({ id: "w2", process: "second" });
  await log.commitBufferedPersistence({ mode: "post-ready" });
  log.append({ id: "w3", process: "third" });
  await log.flushPersistence();

  const replayed = new WitnessLog({ file });
  assert.deepEqual(replayed.all().map(w => w.process), ["first", "second", "third"]);
});

test("world exposes reusable indexes and keeps built-in projections consistent", () => {
  const world = createWorld();
  world.registerIndex("custom.count", {
    seed: witnesses => witnesses.length,
    apply: state => state + 1,
    snapshot: state => state
  });

  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "adam", id: "callan" });

  assert.equal(world.readIndex("custom.count"), world.allWitnesses().length);
  assert.deepEqual([...world.project(projectors.things)].sort(), [...projectors.things(world.allWitnesses())].sort());

  const replaced = world.allWitnesses().slice(0, 2);
  world._replaceWitnesses(replaced);
  assert.equal(world.readIndex("custom.count"), replaced.length);
});
