import test from "node:test";
import assert from "node:assert/strict";
import {
  bindSurfaceCommandActions,
  renderSurfaceCommandActionsFactory
} from "./surface-command-actions.js";

function createNode(attributes = {}) {
  const listeners = new Map();
  return {
    value: "",
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

test("surface command action binder routes toggle, query, command run, and result navigation through the shared seam", async () => {
  const toggle = createNode();
  const close = createNode();
  const input = createNode();
  const run = createNode({ "data-surface-command-run": "1" });
  const resultWorld = createNode();
  const resultSource = createNode();
  const resultBootstrap = createNode();
  const overlay = {
    querySelectorAll(selector) {
      switch (selector) {
        case "[data-surface-command-toggle]": return [toggle];
        case "[data-surface-command-close]": return [close];
        case "[data-surface-command-input]": return [input];
        case "[data-surface-command-run]": return [run];
        case "[data-surface-command-result-world]": return [resultWorld];
        case "[data-surface-command-result-source]": return [resultSource];
        case "[data-surface-command-result-bootstrap]": return [resultBootstrap];
        default: return [];
      }
    }
  };
  const state = {
    surfaceCommandOpen: false,
    surfaceCommandQuery: "",
    surfaceCommandResult: { identity: "todo_form", bootstrapHref: "/_bootstrap?select=todo_form" },
    surfaceCommandFocusRequested: false
  };
  const calls = [];
  const windowTarget = {
    location: {
      assign(url) {
        calls.push(["assign", url]);
      }
    }
  };

  bindSurfaceCommandActions({
    overlay,
    state,
    ensureSurfaceInspectorGraph: async () => {
      calls.push("ensure");
    },
    updateSurfaceInspectorUi: () => {
      calls.push("update");
    },
    visibleSurfaceCommands: () => [{ id: "first" }, { id: "second" }],
    executeSurfaceCommand: async item => {
      calls.push(["execute", item.id]);
    },
    worldSurfaceHref: ({ select, mode }) => mode ? `/world?select=${select}&mode=${mode}` : `/world?select=${select}`,
    windowTarget
  });

  const clickEvent = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  const toggleEvent = clickEvent();
  toggle.listener("click")(toggleEvent);
  assert.equal(toggleEvent.prevented, true);
  assert.equal(state.surfaceCommandOpen, true);
  assert.equal(state.surfaceCommandFocusRequested, true);

  input.value = "dom.render";
  input.listener("input")();
  assert.equal(state.surfaceCommandQuery, "dom.render");
  assert.equal(state.surfaceCommandResult, null);

  const keyEvent = { key: "Enter", prevented: false, preventDefault() { this.prevented = true; } };
  await input.listener("keydown")(keyEvent);
  assert.equal(keyEvent.prevented, true);

  const runEvent = clickEvent();
  await run.listener("click")(runEvent);
  assert.equal(runEvent.prevented, true);

  state.surfaceCommandResult = { identity: "todo_form", bootstrapHref: "/_bootstrap?select=todo_form" };
  resultWorld.listener("click")(clickEvent());
  resultSource.listener("click")(clickEvent());
  resultBootstrap.listener("click")(clickEvent());

  const closeEvent = clickEvent();
  close.listener("click")(closeEvent);
  assert.equal(closeEvent.prevented, true);
  assert.equal(state.surfaceCommandOpen, false);
  assert.equal(state.surfaceCommandQuery, "");
  assert.equal(state.surfaceCommandResult, null);

  await Promise.resolve();
  assert.deepEqual(calls, [
    "ensure",
    "update",
    "update",
    ["execute", "first"],
    "update",
    ["execute", "second"],
    ["assign", "/world?select=todo_form"],
    ["assign", "/world?select=todo_form&mode=source"],
    ["assign", "/_bootstrap?select=todo_form"],
    "update"
  ]);
});

test("surface command actions factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceCommandActionsFactory();
  assert.equal(factory.includes("const bindSurfaceCommandActions ="), true);
});
