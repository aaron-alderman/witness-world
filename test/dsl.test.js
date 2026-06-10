import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import { parseWitnessToml, applyWitnessToml } from "../src/dsl.js";
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
  assert.equal(docs.length, 11);
  assert.equal(docs[1].kind, "compiler");
  assert.deepEqual(docs.at(-1).values.body, { x: 12, y: 34 });
});

test("applies witness DSL to build compiler and browser runner ladder", () => {
  const world = createWorld();
  const witnesses = applyWitnessToml(world, script);

  assert.equal(witnesses.length, 11);
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
