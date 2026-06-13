import test from "node:test";
import assert from "node:assert/strict";
import {
  bindWorldGraphActions,
  renderWorldGraphActionsFactory
} from "./world-graph-actions.js";

function createNode(attributes = {}) {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    listener(type) {
      return listeners.get(type);
    }
  };
}

test("world graph actions binder routes navigation, source, version, process, and primitive actions through the shared seam", async () => {
  const mode = createNode({ "data-world-mode": "source" });
  const select = createNode({ "data-world-select": "todo_form" });
  const kind = createNode({ "data-world-kind": "widget" });
  const clearKind = createNode();
  const sourceFile = createNode({ "data-world-source-file": "world/app.rvm", "data-world-source-focus": "todo_form" });
  const activate = createNode({ "data-world-widget-activate": "todo_form", "data-world-widget-version": "v2" });
  const rollback = createNode({ "data-world-widget-rollback": "todo_form" });
  const openProcess = createNode({ "data-world-open-process-program": "todo_program", "data-world-open-process-event": "todo.submit" });
  const jump = createNode({ "data-world-jump-to-graph": "context.todo" });
  const closeSource = createNode();
  const primitive = createNode({ "data-world-primitive": "todo_form", "data-world-primitive-kind": "widget" });
  const closePrimitive = createNode();
  const root = {
    querySelectorAll(selector) {
      switch (selector) {
        case "[data-world-mode]": return [mode];
        case "[data-world-node-id], [data-world-select]": return [select];
        case "[data-world-kind]": return [kind];
        case "[data-world-clear-kind]": return [clearKind];
        case "[data-world-source-file]": return [sourceFile];
        case "[data-world-widget-activate]": return [activate];
        case "[data-world-widget-rollback]": return [rollback];
        case "[data-world-open-process-program]": return [openProcess];
        case "[data-world-jump-to-graph]": return [jump];
        case "[data-world-close-source]": return [closeSource];
        case "[data-world-primitive], [data-world-primitive-kind-only]": return [primitive];
        case "[data-world-close-primitive]": return [closePrimitive];
        default: return [];
      }
    }
  };
  const calls = [];
  const state = {
    worldGraphMode: "graph",
    worldGraphSource: "stale",
    worldGraphSelectedKind: "",
    worldGraphPrimitiveMode: false,
    worldGraphSourceFocus: "selected",
    worldGraphSelectedPrimitiveKind: "",
    worldGraphSelectedPrimitiveValue: ""
  };
  let selectedId = "selected";

  bindWorldGraphActions({
    root,
    state,
    draw: () => calls.push("draw"),
    currentMode: () => state.worldGraphMode,
    openSourceForSelected: async () => calls.push(["open-selected-source", selectedId]),
    openSourceFile: async (file, focusId) => calls.push(["open-source-file", file, focusId]),
    requestWidgetVersionChange: async payload => calls.push(["activate", payload]),
    requestWidgetVersionRollback: async payload => calls.push(["rollback", payload]),
    processViewHref: ({ program, event }) => `/process?program=${program}&event=${event}`,
    getSelectedId: () => selectedId,
    setSelectedId: id => {
      selectedId = id;
      calls.push(["set-selected", id]);
    },
    windowTarget: {
      location: {
        assign(url) {
          calls.push(["assign", url]);
        }
      }
    }
  });

  const clickEvent = () => ({ prevented: false, preventDefault() { this.prevented = true; } });

  await mode.listener("click")(clickEvent());
  await select.listener("click")(clickEvent());
  kind.listener("click")(clickEvent());
  clearKind.listener("click")(clickEvent());
  await sourceFile.listener("click")(clickEvent());
  await activate.listener("click")(clickEvent());
  await rollback.listener("click")(clickEvent());
  openProcess.listener("click")(clickEvent());
  jump.listener("click")(clickEvent());
  closeSource.listener("click")(clickEvent());
  primitive.listener("click")(clickEvent());
  closePrimitive.listener("click")(clickEvent());

  assert.equal(selectedId, "context.todo");
  assert.equal(state.worldGraphMode, "graph");
  assert.equal(state.worldGraphPrimitiveMode, false);
  assert.deepEqual(calls, [
    "draw",
    ["set-selected", "todo_form"],
    ["open-selected-source", "todo_form"],
    "draw",
    "draw",
    "draw",
    ["open-source-file", "world/app.rvm", "todo_form"],
    "draw",
    ["activate", { soul: "todo_form", version: "v2" }],
    ["rollback", { soul: "todo_form" }],
    ["assign", "/process?program=todo_program&event=todo.submit"],
    ["set-selected", "context.todo"],
    "draw",
    "draw",
    "draw",
    "draw"
  ]);
});

test("world graph actions factory exposes the shared browser helpers", () => {
  const factory = renderWorldGraphActionsFactory();
  assert.equal(factory.includes("const bindWorldGraphActions ="), true);
});
