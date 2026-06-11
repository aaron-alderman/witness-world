import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import { parseWitnessToml, applyWitnessToml, applyWitnessDocs } from "../src/dsl.js";
import { moduleProjectors } from "../src/modules.js";

const script = `
# Compiler ladder
[[thing]]
actor = "adam"
id = "aaron"

[[compiler]]
actor = "aaron"
id = "compiler_0"

[[description]]
actor = "aaron"
id = "compiler_1_description"
language = "witness-ir"
source = "compiler subset v1"

[[compile]]
actor = "aaron"
compiler = "compiler_0"
description = "compiler_1_description"
output = "compiler_1_artifact"

# Browser host
[[serverRunner]]
actor = "aaron"
id = "server_runner"

[context.common]
actor = "system"

[[identity]]
context = "common"
id = "identity.aaron"
actor = "aaron"
label = "Aaron"
username = "aaron"
password = "aaron"
homePerspective = "aaron:personal"

[[frontendRunner]]
actor = "aaron"
id = "frontend_runner"

[[view]]
actor = "aaron"
id = "aaron_canvas"
target = "aaron"

[[render]]
actor = "aaron"
frontendRunner = "frontend_runner"
view = "aaron_canvas"
frame = "frame_1"

[[route]]
actor = "aaron"
id = "root_route"
path = "/"
serves = "frame_1"

[[serve]]
actor = "aaron"
serverRunner = "server_runner"
route = "root_route"

[[action]]
actor = "aaron"
frontendRunner = "frontend_runner"
id = "drag_aaron_proxy"
target = "aaron"
body = { x = 12, y = 34 }
`;

test("parses TOML-ish witness DSL into ordered documents", () => {
  const docs = parseWitnessToml(script);
  assert.equal(docs.length, 13);
  assert.equal(docs[1].kind, "compiler");
  assert.deepEqual(docs.find(doc => doc.kind === "action")?.values.body, { x: 12, y: 34 });
});

test("applies witness DSL to build compiler and browser runner ladder", () => {
  const world = createWorld();
  const witnesses = applyWitnessToml(world, script);

  assert.equal(witnesses.length, 13);
  assert.deepEqual(world.project(moduleProjectors.compiledArtifacts), [
    { artifact: "compiler_1_artifact", source: "compiler_1_description", compiler: "compiler_0" }
  ]);
  assert.deepEqual(world.project(moduleProjectors.renderedFrames), [
    { frame: "frame_1", view: "aaron_canvas", runner: "frontend_runner" }
  ]);
  assert.equal(
    world.project(projectors.currentRelations).some(r => r.from === "server_runner" && r.rel === "serves" && r.to === "root_route"),
    true
  );
  assert.equal(world.project(moduleProjectors.identityIndex).byUsername.aaron.id, "identity.aaron");
  assert.equal(world.allWitnesses().some(w => w.process === "emitUserAction" && w.body.x === 12), true);
});

test("rejects unsupported DSL value syntax", () => {
  assert.throws(() => {
    parseWitnessToml(`
[[thing]]
actor = "adam"
id = "bad_thing"
note = null
`);
  }, /unsupported value/);
});

test("records unknown DSL sections as dsl.unknownSection witnesses", () => {
  const world = createWorld();
  const witnesses = applyWitnessToml(world, `
[[mystery]]
actor = "adam"
id = "mystery_object"
`);
  assert.equal(witnesses.at(-1).process, "dsl.unknownSection");
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.unknownSection"), true);
});

test("missing required fields in DSL relation section fail fast", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[relation]]
actor = "adam"
from = "thing_a"
rel = "owns"
`);
  }, /missing required key: to/);
});

test("clone witness requires clone source fields", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[clone]]
actor = "adam"
source = "w"
`);
  }, /missing required key: clone/);
});

test("transfer DSL section updates ownership via transferOwnership", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "adam"
id = "aaron"

[[thing]]
actor = "aaron"
id = "w"

[[transfer]]
actor = "aaron"
thing = "w"
from = "aaron"
to = "callan"
  `);
  assert.equal(world.project(projectors.owners).get("w"), "callan");
  assert.equal(world.allWitnesses().some(w => w.process === "transferOwnership.failed"), false);
});

test("type-model DSL sections emit witnessed definitions and source annotations", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[[trait]]
actor = "system"
id = "textual"

[[valueType]]
actor = "system"
id = "widget.text"
compatibleWith = ["textual"]
editor = { control = "text" }

[[processSpec]]
actor = "system"
id = "widget_define_spec"
process = "widget.define"
inputs = [{ name = "text", accepts = "widget.text", required = true }]
outputs = [{ name = "id", accepts = "widget.text", required = true }]
`).map(doc => ({ ...doc, file: "C:/demo/types.wtoml" }));

  applyWitnessDocs(world, docs);

  assert.equal(world.allWitnesses().some(w => w.process === "defineTrait" && w.body.id === "textual"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "defineValueType" && w.body.id === "widget.text"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "defineProcessSpec" && w.body.process === "widget.define"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.source.annotate" && w.body.section === "trait" && w.body.target === "textual"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.source.annotate" && w.body.section === "valueType" && w.body.target === "widget.text"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.source.annotate" && w.body.section === "processSpec" && w.body.target === "widget_define_spec"), true);
});
