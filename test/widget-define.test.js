import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { requestWidgetDefine } from "../plugins/authoring-core/authoring-core-processes.js";

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

[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Root" }
`);
  return world;
}

test("requestWidgetDefine applies root fallback and emits generic widget.define semantics", () => {
  const world = seededWorld();
  const result = requestWidgetDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "Text", text: "Hello world" },
    defaultParent: "root"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.widget.parent, "root");
  assert.equal(result.widget.order, 999);
  assert.equal(result.witness.process, "widget.define");
  assert.equal(world.allWitnesses().some(w => w.process === "defineWidget"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "attachWidget"), true);
});

test("requestWidgetDefine returns structured type gate failures outside the demo handler set", () => {
  const world = seededWorld();
  const result = requestWidgetDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "Nope", text: "Hello", order: "later" },
    defaultParent: "root"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.witness.process, "widget.define.blocked");
  assert.equal(result.witness.body.failures.some(f => f.field === "kind"), true);
  assert.equal(result.witness.body.failures.some(f => f.field === "order"), true);
});

test("requestWidgetDefine keeps detached widgets detached even when a root fallback exists", () => {
  const world = seededWorld();
  const result = requestWidgetDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "detached_page", kind: "Heading", text: "Detached", attach: false },
    defaultParent: "root"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.widget.parent, null);
  assert.equal(world.allWitnesses().some(w => w.process === "attachWidget" && w.body?.child === "detached_page"), false);
});
