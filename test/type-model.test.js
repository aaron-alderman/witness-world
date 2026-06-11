import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { compatibleWithType, typeModelProjection, validateProcessInput, validateProcessOutput } from "../src/type-model.js";

function seededWorld() {
  const world = createWorld();
  applyWitnessToml(world, `
[[trait]]
actor = "system"
id = "textual"

[[trait]]
actor = "system"
id = "numeric"

[[trait]]
actor = "system"
id = "enumerated"

[[valueType]]
actor = "system"
id = "widget.kind"
compatibleWith = ["textual", "enumerated"]
editor = { control = "select", options = ["Text", "Heading"] }

[[valueType]]
actor = "system"
id = "widget.text"
compatibleWith = ["textual"]
editor = { control = "text" }

[[valueType]]
actor = "system"
id = "widget.order"
compatibleWith = ["numeric"]
editor = { control = "number" }

[[valueType]]
actor = "system"
id = "widget.id"
compatibleWith = ["textual"]
editor = { control = "text" }

[[valueType]]
actor = "system"
id = "widget.parent"
compatibleWith = ["widget.text"]
editor = { control = "text" }

[[processSpec]]
actor = "system"
id = "widget_define_spec"
process = "widget.define"
inputs = [{ name = "kind", accepts = "widget.kind", required = true }, { name = "text", accepts = "widget.text", required = true }, { name = "parent", accepts = "widget.parent", required = false }, { name = "order", accepts = "widget.order", required = false }]
outputs = [{ name = "id", accepts = "widget.id", required = true }, { name = "kind", accepts = "widget.kind", required = true }, { name = "parent", accepts = "widget.parent", required = true }, { name = "text", accepts = "widget.text", required = true }, { name = "order", accepts = "widget.order", required = true }]
`);
  return world;
}

test("type model resolves exact and transitive compatibility", () => {
  const model = typeModelProjection(seededWorld().allWitnesses());
  assert.equal(compatibleWithType(model, "widget.kind", "widget.kind"), true);
  assert.equal(compatibleWithType(model, "widget.kind", "textual"), true);
  assert.equal(compatibleWithType(model, "widget.parent", "textual"), true);
});

test("incompatible types are rejected", () => {
  const model = typeModelProjection(seededWorld().allWitnesses());
  assert.equal(compatibleWithType(model, "widget.order", "textual"), false);
  const result = validateProcessInput(model, "widget.define", { kind: "Text", text: "Hello", order: "later" });
  assert.equal(result.ok, false);
  assert.equal(result.failures.some(f => f.field === "order" && f.expected === "widget.order"), true);
});

test("cyclic compatibility graphs do not loop", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[trait]]
actor = "system"
id = "textual"

[[valueType]]
actor = "system"
id = "a"
compatibleWith = ["b"]
editor = { control = "text" }

[[valueType]]
actor = "system"
id = "b"
compatibleWith = ["a", "textual"]
editor = { control = "text" }
`);
  const model = typeModelProjection(world.allWitnesses());
  assert.equal(compatibleWithType(model, "a", "textual"), true);
  assert.equal(compatibleWithType(model, "b", "textual"), true);
});

test("typed process input coercion and output validation follow process specs", () => {
  const model = typeModelProjection(seededWorld().allWitnesses());
  const input = validateProcessInput(model, "widget.define", { kind: "Text", text: "Hello", parent: "root", order: "3" }, { coerceStrings: true });
  assert.equal(input.ok, true);
  assert.equal(typeof input.value.order, "number");
  assert.equal(input.value.order, 3);

  const output = validateProcessOutput(model, "widget.define", { id: "thing_1", kind: "Text", parent: "root", text: "Hello", order: 3 });
  assert.equal(output.ok, true);
});
