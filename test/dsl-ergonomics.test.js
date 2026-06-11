import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { frontendProgram, widgetTree } from "../src/widgets.js";

const oldStyle = `
[[widget]]
actor = "adam"
id = "app"
kind = "Page"
props = { title = "Demo" }

[[widget]]
actor = "adam"
id = "title"
kind = "Heading"
props = { text = "Demo", level = 1 }

[[widget]]
actor = "adam"
id = "form"
kind = "Form"
props = { role = "todo-form" }

[[widget]]
actor = "adam"
id = "input"
kind = "Input"
props = { name = "title", placeholder = "New todo" }

[[widget]]
actor = "adam"
id = "add"
kind = "Button"
props = { text = "Add", type = "submit" }

[[attachWidget]]
actor = "adam"
parent = "app"
child = "title"
order = 0

[[attachWidget]]
actor = "adam"
parent = "app"
child = "form"
order = 1

[[attachWidget]]
actor = "adam"
parent = "form"
child = "input"
order = 0

[[attachWidget]]
actor = "adam"
parent = "form"
child = "add"
order = 1

[[frontendProgram]]
actor = "adam"
id = "program"
rootWidget = "app"

[[frontendStep]]
actor = "adam"
program = "program"
event = "load"
order = 0
op = "setText"
params = { widget = "status", text = "Ready" }
`;

const ergonomic = `
[[defaults]]
actor = "adam"
program = "program"

[[page]]
id = "app"
title = "Demo"
children = ["title", "form"]

[[heading]]
id = "title"
text = "Demo"
level = 1

[[form]]
id = "form"
role = "todo-form"
children = ["input", "add"]

[[input]]
id = "input"
name = "title"
placeholder = "New todo"

[[button]]
id = "add"
text = "Add"
type = "submit"

[[frontendProgram]]
id = "program"
rootWidget = "app"

[[step]]
on = "load"
order = 0
op = "setText"
widget = "status"
text = "Ready"
`;

test("ergonomic widget DSL compiles to the same widget tree as explicit DSL", () => {
  const oldWorld = createWorld();
  const newWorld = createWorld();

  applyWitnessToml(oldWorld, oldStyle);
  applyWitnessToml(newWorld, ergonomic);

  assert.deepEqual(
    newWorld.project(w => widgetTree(w, "app")),
    oldWorld.project(w => widgetTree(w, "app"))
  );
});

test("ergonomic step syntax lowers unknown keys into frontend step params", () => {
  const world = createWorld();
  applyWitnessToml(world, ergonomic);

  const program = world.project(w => frontendProgram(w, "program"));
  assert.deepEqual(program.steps, [
    {
      event: "load",
      op: "setText",
      order: 0,
      params: { widget: "status", text: "Ready" },
      when: null,
      repeat: null,
      after: []
    }
  ]);
  assert.equal(program.graph.length, 1);
  assert.deepEqual(program.graph[0].after, []);
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hostCapabilities } from "../src/host.js";
import { loadWitnessTomlFile, applyWitnessDocs } from "../src/dsl.js";

test("thin main imports split context files into one witnessed graph", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-dsl-import-"));
  await fs.writeFile(path.join(dir, "main.wtoml"), `[app]\nid = "demo"\nimports = ["./common.wtoml", "./frontend.wtoml"]\nspawn = ["frontend"]\n`);
  await fs.writeFile(path.join(dir, "common.wtoml"), `[context.frontend]\nactor = "browser"\ncapabilities = ["dom.render", "http.fetch"]\n`);
  await fs.writeFile(path.join(dir, "frontend.wtoml"), `[[defaults]]\ncontext = "frontend"\nprogram = "p"\n\n[[page]]\nid = "root"\nchildren = ["title"]\n\n[[heading]]\nid = "title"\ntext = "Imported"\nlevel = 1\n\n[[frontendProgram]]\nid = "p"\nrootWidget = "root"\n`);

  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(dir, "main.wtoml"));
  applyWitnessDocs(world, docs);

  assert.equal(hostCapabilities(world, "frontend").has("dom.render"), true);
  assert.equal(world.project(w => widgetTree(w, "root")).children[0].props.text, "Imported");
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.app.define"), true);
});

test("context defaults set actor without leaking context into widget props", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[context.frontend]
actor = "browser"
capabilities = ["dom.render"]

[[defaults]]
context = "frontend"

[[text]]
id = "status"
text = "Ready"
`);

  const define = world.allWitnesses().find(w => w.process === "defineWidget" && w.body.id === "status");
  assert.equal(define.actor, "browser");
  assert.equal("context" in define.body.props, false);
  assert.equal(define.body.props.text, "Ready");
});
