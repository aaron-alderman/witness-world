import test from "node:test";
import assert from "node:assert/strict";
import {
  bindSurfaceInspectorActions,
  renderSurfaceInspectorActionsFactory
} from "./surface-inspector-actions.js";

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

test("surface inspector actions binder routes chrome, refresh, and navigation actions through the shared seam", async () => {
  const toggle = createNode();
  const close = createNode();
  const clear = createNode();
  const refresh = createNode();
  const select = createNode();
  const world = createNode();
  const worldMode = createNode({ "data-surface-inspector-world-mode": "source" });
  const openProcess = createNode();
  const overlay = {
    querySelectorAll(selector) {
      switch (selector) {
        case "[data-surface-inspector-toggle]": return [toggle];
        case "[data-surface-inspector-close]": return [close];
        case "[data-surface-inspector-clear]": return [clear];
        case "[data-surface-inspector-refresh]": return [refresh];
        case "[data-surface-inspector-select]": return [select];
        case "[data-surface-inspector-world]": return [world];
        case "[data-surface-inspector-world-mode]": return [worldMode];
        case "[data-surface-inspector-open-process]": return [openProcess];
        default: return [];
      }
    }
  };
  const state = {
    surfaceInspectorOpen: false,
    surfaceInspectorMenu: { x: 1 },
    surfaceInspectorSelectedId: "todo_form"
  };
  const calls = [];
  const windowTarget = {
    location: {
      assign(url) {
        calls.push(["assign", url]);
      }
    }
  };

  bindSurfaceInspectorActions({
    overlay,
    state,
    clearSurfaceInspectorHighlight: () => calls.push("clear-highlight"),
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    selectedSurfaceWidgetId: () => state.surfaceInspectorSelectedId,
    applySurfaceInspectorHighlight: id => calls.push(["highlight", id]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    invalidateSurfaceInspectorGraph: () => calls.push("invalidate-graph"),
    invalidateSurfaceInspectorWidgets: () => calls.push("invalidate-widgets"),
    selectSurfaceInspectorWidget: async (id, options) => calls.push(["select-widget", id, options.statusMessage]),
    worldSurfaceHref: ({ select, mode }) => mode ? `/world?select=${select}&mode=${mode}` : `/world?select=${select}`,
    selectedSurfaceInspectorProcessSelection: () => ({ program: "todo_frontend_program", event: "todo.submit" }),
    processViewHref: ({ program, event }) => `/process?program=${program}&event=${event}`,
    windowTarget
  });

  const clickEvent = () => ({ prevented: false, preventDefault() { this.prevented = true; } });

  const toggleEvent = clickEvent();
  await toggle.listener("click")(toggleEvent);
  assert.equal(toggleEvent.prevented, true);
  assert.equal(state.surfaceInspectorOpen, true);

  const refreshEvent = clickEvent();
  await refresh.listener("click")(refreshEvent);
  assert.equal(refreshEvent.prevented, true);

  world.listener("click")(clickEvent());
  worldMode.listener("click")(clickEvent());
  openProcess.listener("click")(clickEvent());

  const selectEvent = clickEvent();
  select.listener("click")(selectEvent);
  assert.equal(selectEvent.prevented, true);
  assert.equal(state.surfaceInspectorMenu, null);

  const clearEvent = clickEvent();
  clear.listener("click")(clearEvent);
  assert.equal(clearEvent.prevented, true);
  assert.equal(state.surfaceInspectorSelectedId, "");

  const closeEvent = clickEvent();
  close.listener("click")(closeEvent);
  assert.equal(closeEvent.prevented, true);
  assert.equal(state.surfaceInspectorOpen, false);

  assert.deepEqual(calls, [
    ["status", "Inspector enabled. Right-click any widget on the live page.", "ok"],
    ["highlight", "todo_form"],
    "update",
    ["select-widget", "todo_form", "Inspector metadata refreshed for todo_form."],
    ["assign", "/world?select=todo_form"],
    ["assign", "/world?select=todo_form&mode=source"],
    ["assign", "/process?program=todo_frontend_program&event=todo.submit"],
    "update",
    "clear-highlight",
    ["status", "Selection cleared. Right-click another widget to inspect it.", "ok"],
    "update",
    "clear-highlight",
    "update"
  ]);
});

test("surface inspector actions factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceInspectorActionsFactory();
  assert.equal(factory.includes("const bindSurfaceInspectorActions ="), true);
});
