import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld, canMutateTarget } from "../src/kernel.js";
import { applyWitnessToml, applyWitnessDocs, loadWitnessTomlFile } from "../src/dsl.js";
import {
  widgetTree,
  frontendProgram,
  templateWidgetTrees,
  widgetVersionTransitions
} from "../src/widgets.js";
import { renderWidgetPage } from "../plugins/inspect/widget-page.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "../plugins/inspect/widget-versions.js";

test("todo UI is generated from primitive widgets, template widgets, and credential-backed session steps", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const tree = world.project(w => widgetTree(w, "todo_app_widget"));
  assert.equal(tree.kind, "Page");
  assert.equal(tree.children.some(child => child.id === "todo_form"), true);
  assert.equal(tree.children.some(child => child.id === "todo_list"), true);

  const templates = world.project(templateWidgetTrees).map(widget => widget.id);
  assert.equal(templates.includes("todo_item_template"), true);
  assert.equal(templates.includes("private_note_template"), true);

  const program = world.project(w => frontendProgram(w, "todo_frontend_program"));
  assert.equal(program.steps.some(step => step.op === "renderCollection"), true);
  assert.equal(program.steps.some(step => step.event === "error"), true);
  assert.equal(program.steps.some(step => step.op === "renderList"), false);
  assert.equal(program.steps.some(step => step.op === "renderPrivateNotes"), false);
  assert.equal(program.steps.some(step => step.op === "postWidgetDefinition"), false);
  assert.equal(program.steps.some(step => step.op === "activateWidgetVersion"), false);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "todo_app_widget", frontendProgram: "todo_frontend_program" });
  assert.match(html, /data-widget="todo_form"/);
  assert.match(html, /data-widget-template="todo_item_template"/);
  assert.match(html, /data-widget="todo_username_input"/);
  assert.match(html, /data-widget="todo_password_input"/);
  assert.match(html, /renderCollection/);
  assert.match(html, /safeRun\('load'\)/);
  assert.match(html, /refreshProjection/);
  assert.doesNotMatch(html, /TodoForm|TodoList|LoginPanel|PrivateNotes|WitnessInspector/);
  assert.doesNotMatch(html, /run\('load'\)\.catch\(err => setText\('todo_status'/);
  assert.equal(world.allWitnesses().at(-1).process, "widget.renderHtml");
});

test("template widgets render as inert templates without actor-select composites", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Templates" }

[[text]]
actor = "adam"
id = "row_template"
template = true
text = "\${item.label}"
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root" });
  assert.match(html, /<template data-widget-template="row_template">/);
  assert.match(html, /\$\{item\.label\}/);
});

test("frontend form interpreter reads forms and collection templates without hard-coded status fallback", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Runtime" }

[[form]]
actor = "adam"
id = "editor_form"
props = { role = "widget-editor-form" }

[[attachWidget]]
actor = "adam"
parent = "root"
child = "editor_form"
order = 0

[[text]]
actor = "adam"
id = "error_template"
kind = "Text"
template = true
text = "\${event.message}"

[[frontendProgram]]
actor = "adam"
id = "program"
rootWidget = "root"

[[frontendStep]]
actor = "adam"
program = "program"
event = "submit:editor_form"
order = 0
op = "readForm"
params = { widget = "editor_form", into = "draft" }

[[frontendStep]]
actor = "adam"
program = "program"
event = "error"
order = 0
op = "setText"
params = { widget = "root", text = "\${event.message}" }
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  assert.match(html, /const formForWidget = widget/);
  assert.match(html, /renderCollection/);
  assert.match(html, /dispatchError/);
  assert.match(html, /safeRun/);
  assert.doesNotMatch(html, /todo_status/);
});

test("value editor renders controls chosen by value type metadata", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[trait]]
actor = "adam"
id = "textual"

[[trait]]
actor = "adam"
id = "enumerated"

[[valueType]]
actor = "adam"
id = "widget.kind"
compatibleWith = ["textual", "enumerated"]
editor = { control = "select", options = ["Text", "Heading"] }

[[valueType]]
actor = "adam"
id = "widget.text"
compatibleWith = ["textual"]
editor = { control = "text" }

[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Typed" }

[[widget]]
actor = "adam"
id = "kind_editor"
kind = "ValueEditor"
props = { name = "kind", valueType = "widget.kind", label = "Kind" }

[[widget]]
actor = "adam"
id = "text_editor"
kind = "ValueEditor"
props = { name = "text", valueType = "widget.text", label = "Text", placeholder = "Widget text" }

[[attachWidget]]
actor = "adam"
parent = "root"
child = "kind_editor"
order = 0

[[attachWidget]]
actor = "adam"
parent = "root"
child = "text_editor"
order = 1
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root" });
  assert.match(html, /<select[^>]*data-value-type="widget.kind"[^>]*data-editor-control="select"/);
  assert.match(html, /<option value="Text">Text<\/option>/);
  assert.match(html, /<input[^>]*data-value-type="widget.text"[^>]*data-editor-control="text"[^>]*placeholder="Widget text"/);
});

test("versioned widget soul renders its active version and can flip versions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Versions" }

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

[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v1"
to = "banner_v2"
strategy = "compatible"

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

  let html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root" });
  assert.match(html, /Banner v1/);
  assert.match(html, /data-widget-version="banner_v1"/);
  assert.doesNotMatch(html, /Banner v2/);

  applyWitnessToml(world, `
[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v2"
to = "banner_v1"
strategy = "compatible"
`);
  requestWidgetVersionActivation(world, { actor: "adam", soul: "banner", version: "banner_v2" });

  html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root" });
  assert.match(html, /Banner v2/);
  assert.match(html, /data-widget-version="banner_v2"/);
  assert.doesNotMatch(html, /Banner v1/);
});

test("widget version transitions default to block and authored strategies drive activation and rollback", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Transitions" }

[[widgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v1"
kind = "Text"
props = { text = "Banner v1" }

[[widgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v2"
kind = "Text"
props = { text = "Banner v2" }

[[widgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v3"
kind = "Text"
props = { text = "Banner v3" }

[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v1"
to = "banner_v2"
strategy = "migrate"

[[widgetVersionTransition]]
actor = "adam"
soul = "banner"
from = "banner_v2"
to = "banner_v3"
strategy = "fork"

[[activateWidgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v1"
`);

  const transitions = widgetVersionTransitions(world.allWitnesses());
  assert.equal(transitions.length, 2);
  assert.equal(transitions[0].strategy, "migrate");

  const migrated = requestWidgetVersionActivation(world, { actor: "adam", soul: "banner", version: "banner_v2" });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.status, "migrated");
  assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.migrate"), true);

  const blocked = requestWidgetVersionActivation(world, { actor: "adam", soul: "banner", version: "banner_v1" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.witness.process, "activateWidgetVersion.blocked");

  const forkRequired = requestWidgetVersionActivation(world, { actor: "adam", soul: "banner", version: "banner_v3" });
  assert.equal(forkRequired.ok, false);
  assert.equal(forkRequired.status, "forkRequired");
  assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.fork.requested"), true);

  const rolledBack = rollbackWidgetVersion(world, { actor: "adam", soul: "banner" });
  assert.equal(rolledBack.ok, true);
  assert.equal(rolledBack.status, "rolledBack");
  assert.equal(rolledBack.version, "banner_v1");
  assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.rollback"), true);
});

test("widget version souls and versions inherit authored context for stewardship-based mutation", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "adam"
id = "ctx.shared"
owner = "adam"
stewards = ["aaron"]

[[widgetVersion]]
actor = "adam"
context = "ctx.shared"
soul = "banner"
version = "banner_v1"
kind = "Text"
props = { text = "Banner v1" }
`);

  assert.equal(canMutateTarget(world, "aaron", "banner").ok, true);
  assert.equal(canMutateTarget(world, "aaron", "banner_v1").ok, true);
  assert.equal(canMutateTarget(world, "callan", "banner").ok, false);
  assert.equal(canMutateTarget(world, "callan", "banner_v1").ok, false);
});

test("widget tree projection is idempotent when DSL is reapplied", () => {
  const world = createWorld();
  const dsl = `
[[defaults]]
actor = "adam"
program = "program"

[[page]]
id = "root"
children = ["title", "form"]

[[heading]]
id = "title"
text = "Hello"
level = 1

[[form]]
id = "form"
children = ["input", "button"]
role = "todo-form"

[[input]]
id = "input"
name = "title"

[[button]]
id = "button"
text = "Add"
type = "submit"

[[text]]
id = "row_template"
template = true
text = "\${item.title}"

[[frontendProgram]]
id = "program"
rootWidget = "root"

[[step]]
on = "load"
order = 0
op = "setText"
widget = "title"
text = "Ready"
`;

  applyWitnessToml(world, dsl);
  applyWitnessToml(world, dsl);
  applyWitnessToml(world, dsl);
  applyWitnessToml(world, dsl);

  const tree = world.project(w => widgetTree(w, "root"));
  assert.deepEqual(tree.children.map(child => child.id), ["title", "form"]);
  assert.deepEqual(tree.children[1].children.map(child => child.id), ["input", "button"]);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  assert.equal((html.match(/data-widget="title"/g) ?? []).length, 1);
  assert.equal((html.match(/data-widget="form"/g) ?? []).length, 1);
  assert.equal((html.match(/data-widget="input"/g) ?? []).length, 1);
  assert.equal((html.match(/data-widget="button"/g) ?? []).length, 1);
  assert.equal((html.match(/data-widget-template="row_template"/g) ?? []).length, 1);

  const program = world.project(w => frontendProgram(w, "program"));
  assert.equal(program.steps.length, 1);
});
