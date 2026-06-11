import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { widgetTree, renderWidgetPage, frontendProgram } from "../src/widgets.js";

const widgetDsl = `
[[widget]]
actor = "adam"
id = "todo_root"
kind = "Page"
props = { title = "Witness Todo" }

[[widget]]
actor = "adam"
id = "todo_title"
kind = "Heading"
props = { text = "Witness Todo" }

[[widget]]
actor = "adam"
id = "todo_form"
kind = "TodoForm"
props = { inputPlaceholder = "New todo", buttonText = "Add" }

[[widget]]
actor = "adam"
id = "todo_status"
kind = "Status"
props = { text = "" }

[[widget]]
actor = "adam"
id = "todo_list"
kind = "TodoList"
props = {}

[[attachWidget]]
actor = "adam"
parent = "todo_root"
child = "todo_title"
order = 0

[[attachWidget]]
actor = "adam"
parent = "todo_root"
child = "todo_form"
order = 1

[[attachWidget]]
actor = "adam"
parent = "todo_root"
child = "todo_status"
order = 2

[[attachWidget]]
actor = "adam"
parent = "todo_root"
child = "todo_list"
order = 3

[[frontendProgram]]
actor = "adam"
id = "todo_frontend_program"
rootWidget = "todo_root"

[[frontendStep]]
actor = "adam"
program = "todo_frontend_program"
event = "load"
order = 0
op = "fetchJson"
params = { url = "/api/todos", into = "todoResponse" }

[[frontendStep]]
actor = "adam"
program = "todo_frontend_program"
event = "load"
order = 1
op = "renderList"
params = { widget = "todo_list", from = "todoResponse.todos", itemTextPath = "title" }
`;

test("todo UI is generated from widget and frontend-program witnesses declared in DSL", () => {
  const world = createWorld();
  applyWitnessToml(world, widgetDsl);

  const tree = world.project(w => widgetTree(w, "todo_root"));
  assert.equal(tree.kind, "Page");
  assert.deepEqual(tree.children.map(c => c.kind), ["Heading", "TodoForm", "Status", "TodoList"]);

  const program = world.project(w => frontendProgram(w, "todo_frontend_program"));
  assert.equal(program.steps.length, 2);
  assert.equal(program.steps[0].op, "fetchJson");

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "todo_root", frontendProgram: "todo_frontend_program" });
  assert.match(html, /data-todo-form/);
  assert.match(html, /data-todo-list/);
  assert.match(html, /witness-frontend-program/);
  assert.match(html, /fetchJson/);
  assert.doesNotMatch(html, /async function loadTodos/);
  assert.equal(world.allWitnesses().at(-1).process, "widget.renderHtml");
});

test("frontend form interpreter reads nested forms for composite widgets", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Regression" }

[[widget]]
actor = "adam"
id = "session"
kind = "LoginPanel"
props = { title = "Session" }

[[attachWidget]]
actor = "adam"
parent = "root"
child = "session"
order = 0

[[frontendProgram]]
actor = "adam"
id = "program"
rootWidget = "root"

[[frontendStep]]
actor = "adam"
program = "program"
event = "submit:session"
order = 0
op = "readForm"
params = { widget = "session", into = "sessionDraft" }
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  assert.match(html, /const formForWidget = widget/);
  assert.match(html, /el\.matches\?\.\('form'\)/);
  assert.match(html, /widget ' \+ widget \+ ' does not contain a form/);
});

test("primitive widget composition renders without hard-coded composite widget kinds", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Primitive" }

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
id = "button"
kind = "Button"
props = { text = "Add", type = "submit" }

[[attachWidget]]
actor = "adam"
parent = "root"
child = "form"
order = 0

[[attachWidget]]
actor = "adam"
parent = "form"
child = "input"
order = 0

[[attachWidget]]
actor = "adam"
parent = "form"
child = "button"
order = 1
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root" });
  assert.match(html, /<form data-widget="form" data-todo-form>/);
  assert.match(html, /<input data-widget="input" name="title" placeholder="New todo"/);
  assert.match(html, /<button data-widget="button" type="submit">Add<\/button>/);
  assert.doesNotMatch(html, /data-kind="TodoForm"/);
});

test("widget editor operation is represented in generated frontend program", () => {
  const world = createWorld();
  const dsl = `
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

[[processSpec]]
actor = "adam"
id = "widget_define_spec"
process = "widget.define"
inputs = [{ name = "kind", accepts = "widget.kind", required = true }, { name = "text", accepts = "widget.text", required = true }]
outputs = [{ name = "id", accepts = "widget.text", required = true }]

[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Editor" }

[[widget]]
actor = "adam"
id = "editor_kind"
kind = "ValueEditor"
props = { name = "kind", valueType = "widget.kind", label = "Kind" }

[[widget]]
actor = "adam"
id = "editor_text"
kind = "ValueEditor"
props = { name = "text", valueType = "widget.text", label = "Text" }

[[attachWidget]]
actor = "adam"
parent = "editor_form"
child = "editor_kind"
order = 0

[[attachWidget]]
actor = "adam"
parent = "editor_form"
child = "editor_text"
order = 1

[[widget]]
actor = "adam"
id = "editor_form"
kind = "Form"
props = { role = "widget-editor-form" }

[[attachWidget]]
actor = "adam"
parent = "root"
child = "editor_form"
order = 0

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
params = { widget = "editor_form", into = "widgetDraft", schema = "widget.define" }

[[frontendStep]]
actor = "adam"
program = "program"
event = "submit:editor_form"
order = 1
op = "postWidgetDefinition"
params = { from = "widgetDraft", into = "widgetCreated" }
`;
  applyWitnessToml(world, dsl);
  const program = world.project(w => frontendProgram(w, "program"));
  assert.equal(program.steps[0].op, "readForm");
  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  assert.match(html, /postWidgetDefinition/);
  assert.match(html, /\/api\/widgets/);
  assert.match(html, /data-value-type="widget.kind"/);
  assert.match(html, /data-editor-control="select"/);
  assert.match(html, /widget\.define/);
  assert.match(html, /readTypedForm/);
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
[[activateWidgetVersion]]
actor = "adam"
soul = "banner"
version = "banner_v2"
`);

  html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root" });
  assert.match(html, /Banner v2/);
  assert.match(html, /data-widget-version="banner_v2"/);
  assert.doesNotMatch(html, /Banner v1/);
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
  assert.deepEqual(tree.children.map(c => c.id), ["title", "form"]);
  assert.deepEqual(tree.children[1].children.map(c => c.id), ["input", "button"]);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  assert.equal((html.match(/data-widget="title"/g) ?? []).length, 1);
  assert.equal((html.match(/data-widget="form"/g) ?? []).length, 1);
  assert.equal((html.match(/data-widget="input"/g) ?? []).length, 1);
  assert.equal((html.match(/data-widget="button"/g) ?? []).length, 1);

  const program = world.project(w => frontendProgram(w, "program"));
  assert.equal(program.steps.length, 1);
});
