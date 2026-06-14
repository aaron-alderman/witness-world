import test from "node:test";
import assert from "node:assert/strict";
import {
  renderWorldBrowserViewFactory,
  renderWorldPrimitiveBrowserView,
  renderWorldProcessExplorerView,
  renderWorldSourceDocumentView,
  renderWorldThingListView,
  renderWorldWitnessBrowserView,
  sourceDefinitionRange
} from "./world-browser-view.js";

test("world browser source document view renders source workbench and highlights focused definitions", () => {
  const byId = {
    todo_form: {
      sources: [{ file: "todo.wtoml", line: 2 }]
    }
  };
  const html = renderWorldSourceDocumentView({
    doc: { file: "todo.wtoml", text: "[[widget]]\nid = \"todo_form\"\ntext = \"Todo\"" },
    sourceFiles: [{ file: "todo.wtoml" }],
    worldGraphSourceFocus: "todo_form",
    selectedId: "todo_form",
    byId,
    escapeHtml: value => String(value)
  });

  assert.deepEqual(sourceDefinitionRange("[[widget]]\nid = \"todo_form\"\ntext = \"Todo\"", "todo_form", byId, "todo_form"), { start: 1, end: 2 });
  assert.equal(html.includes("world-source-workbench"), true);
  assert.equal(html.includes("surface-split-pane"), true);
  assert.equal(html.includes("world-source-highlight"), true);
  assert.equal(html.includes('data-world-select="todo_form"'), true);

  const emptyHtml = renderWorldSourceDocumentView({
    doc: null,
    sourceFiles: [],
    worldGraphSourceFocus: "",
    selectedId: "",
    byId: {},
    escapeHtml: value => String(value)
  });
  assert.equal(emptyHtml.includes("surface-empty-state"), true);
  assert.equal(emptyHtml.includes("No witnessed source files."), true);
});

test("world browser collection views render thing, witness, process, and primitive branches", () => {
  const thingHtml = renderWorldThingListView({
    nodes: [
      { id: "todo_form", label: "Todo Form", kind: "widget", context: "todo" },
      { id: "todo_add", label: "Todo Add", kind: "process", context: "todo" }
    ],
    selectedKind: "widget",
    escapeHtml: value => String(value)
  });
  assert.equal(thingHtml.includes("Thing List"), true);
  assert.equal(thingHtml.includes("surface-item-button"), true);
  assert.equal(thingHtml.includes('data-world-kind="widget"'), true);

  const witnessHtml = renderWorldWitnessBrowserView({
    selectedNode: {
      id: "todo_form",
      label: "Todo Form",
      kind: "widget",
      recentWitnesses: [{ id: "w1", process: "defineWidget", actor: "alice", body: { ok: true } }]
    },
    escapeHtml: value => String(value)
  });
  assert.equal(witnessHtml.includes("Witness Browser"), true);
  assert.equal(witnessHtml.includes("surface-code"), true);
  assert.equal(witnessHtml.includes("defineWidget"), true);

  const processHtml = renderWorldProcessExplorerView();
  assert.equal(processHtml.includes("surface-link-item"), true);
  assert.equal(processHtml.includes("Open Process View"), true);

  const primitiveHtml = renderWorldPrimitiveBrowserView({
    primitiveIndex: new Map([
      ["string", new Map([
        ["Todo", { value: "Todo", count: 2, where: new Set(["todo_form.title", "todo_form\u2192title"]) }]
      ])]
    ]),
    selectedKind: "string",
    selectedValue: "Todo",
    byId: { todo_form: { id: "todo_form" } },
    escapeHtml: value => String(value)
  });
  assert.equal(primitiveHtml.includes("Primitive browser"), true);
  assert.equal(primitiveHtml.includes("surface-item-button"), true);
  assert.equal(primitiveHtml.includes('data-world-primitive-kind-only="string"'), true);
  assert.equal(primitiveHtml.includes('data-world-select="todo_form"'), true);
});

test("world browser view factory exposes the extracted browser helpers", () => {
  const factory = renderWorldBrowserViewFactory();
  assert.equal(factory.includes("const sourceDefinitionRange ="), true);
  assert.equal(factory.includes("const renderWorldSourceDocumentView ="), true);
  assert.equal(factory.includes("const renderWorldWitnessBrowserView ="), true);
  assert.equal(factory.includes("const renderWorldPrimitiveBrowserView ="), true);
});
