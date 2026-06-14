import test from "node:test";
import assert from "node:assert/strict";
import {
  renderWorldGraphCanvasView,
  renderWorldGraphViewFactory,
  renderWorldInspectorView
} from "./world-graph-view.js";

test("world graph canvas view renders nodes, groups, and relation labels", () => {
  const nodes = [
    { id: "todo_form", label: "Todo Form", kind: "widget", href: "/todo", x: 10, y: 20, badges: [{ label: "live" }] },
    { id: "todo_process", label: "Todo Process", kind: "process", href: "/process", x: 300, y: 80, badges: [] }
  ];
  const html = renderWorldGraphCanvasView({
    width: 900,
    height: 480,
    nodes,
    edges: [{ from: "todo_form", to: "todo_process", rel: "runs", style: "relation" }],
    groups: [{ id: "todo", label: "Todo", x: 0, y: 0, width: 640, height: 320 }],
    byId: Object.fromEntries(nodes.map(node => [node.id, node])),
    selectedId: "todo_form",
    escapeHtml: value => String(value)
  });

  assert.equal(html.includes('class="world-graph-canvas"'), true);
  assert.equal(html.includes("world-context-box"), true);
  assert.equal(html.includes("world-graph-svg"), true);
  assert.equal(html.includes("world-node-selected"), true);
  assert.equal(html.includes(">runs</text>"), true);
});

test("world inspector view renders kind list and selected object details", () => {
  const byId = {
    todo_form: {
      id: "todo_form",
      label: "Todo Form",
      kind: "widget",
      context: "todo",
      href: "/todo",
      badges: [{ label: "live" }],
      properties: [{ key: "title", value: { type: "string", value: "Todo" } }],
      values: [{ key: "owner", value: { type: "ref", target: "todo_user" } }],
      associationProperties: [{ from: "todo_form", rel: "owns", to: "todo_user", properties: [{ key: "mode", value: "write" }] }],
      sources: [{ file: "todo.wtoml", line: 2, section: "widget", values: { id: "todo_form" } }],
      recentWitnesses: [{ id: "w1", process: "defineWidget", actor: "alice" }],
      processSelection: { program: "todo_form", event: "submit" },
      widgetVersionState: { soul: "todo_form", activeVersion: "v2", rollbackAvailable: true, rollbackVersion: "v1", history: [{ version: "v1", actor: "alice", witnessId: "w1" }] },
      widgetVersions: [{ soul: "todo_form", version: "v1", kind: "widget", index: 1, isActive: false, propsPreview: { text: "Todo" } }]
    },
    todo_user: { id: "todo_user", label: "Todo User", kind: "identity", context: "todo" }
  };
  const edges = [{ from: "todo_form", to: "todo_user", rel: "owns", properties: [{ key: "mode", value: "write" }] }];
  const linkRef = value => '<button data-world-select="' + value + '">' + value + "</button>";
  const linkKind = value => '<button data-world-kind="' + value + '">' + value + "</button>";
  const linkPrimitive = (kind, value) => '<button data-world-primitive-kind="' + kind + '">' + value + "</button>";

  const kindHtml = renderWorldInspectorView({
    selectedKind: "widget",
    nodes: Object.values(byId),
    selectedId: "todo_form",
    byId,
    edges,
    linkRef,
    linkKind,
    linkPrimitive,
    escapeHtml: value => String(value)
  });
  assert.equal(kindHtml.includes("Back to selected object"), true);
  assert.equal(kindHtml.includes('data-world-select="todo_form"'), true);

  const detailHtml = renderWorldInspectorView({
    selectedKind: "",
    nodes: Object.values(byId),
    selectedId: "todo_form",
    byId,
    edges,
    worldGraphVersionStatus: { soul: "todo_form", level: "ok", message: "Rolled back" },
    linkRef,
    linkKind,
    linkPrimitive,
    escapeHtml: value => String(value)
  });
  assert.equal(detailHtml.includes("Selected Object"), true);
  assert.equal(detailHtml.includes("Association properties"), true);
  assert.equal(detailHtml.includes("Recent witnesses"), true);
  assert.equal(detailHtml.includes("Activation history"), true);
  assert.equal(detailHtml.includes("Rolled back"), true);
  assert.equal(detailHtml.includes('class="surface-status-box"'), true);
  assert.equal(detailHtml.includes('class="surface-actions-compact"'), true);
  assert.equal(detailHtml.includes('class="surface-item world-version-item"'), true);
});

test("world graph view factory exposes the extracted browser helpers", () => {
  const factory = renderWorldGraphViewFactory();
  assert.equal(factory.includes("const renderWorldInspectorView ="), true);
  assert.equal(factory.includes("const renderWorldGraphCanvasView ="), true);
});
