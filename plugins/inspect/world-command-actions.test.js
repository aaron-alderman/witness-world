import test from "node:test";
import assert from "node:assert/strict";
import {
  bindWorldCommandActions,
  bindWorldCommandShortcuts,
  renderWorldCommandActionsFactory,
  syncWorldCommandFocus
} from "./world-command-actions.js";

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

test("world command actions binder routes open, close, typing, submit, and result actions through the shared seam", async () => {
  const toggle = createNode();
  const close = createNode();
  const input = createNode();
  const run = createNode({ "data-world-command-run": "1" });
  const root = {
    querySelectorAll(selector) {
      switch (selector) {
        case "[data-world-command-toggle]": return [toggle];
        case "[data-world-command-close]": return [close];
        case "[data-world-command-input]": return [input];
        case "[data-world-command-run]": return [run];
        default: return [];
      }
    }
  };
  const state = {
    worldCommandOpen: false,
    worldCommandQuery: "",
    worldCommandFocusRequested: false
  };
  const calls = [];
  const items = [{ id: "first" }, { id: "second" }];

  bindWorldCommandActions({
    root,
    state,
    draw: () => calls.push("draw"),
    visibleWorldCommands: () => items,
    executeWorldCommand: async item => calls.push(["execute", item.id])
  });

  const clickEvent = () => ({ prevented: false, preventDefault() { this.prevented = true; } });

  const toggleEvent = clickEvent();
  toggle.listener("click")(toggleEvent);
  assert.equal(toggleEvent.prevented, true);
  assert.equal(state.worldCommandOpen, true);
  assert.equal(state.worldCommandFocusRequested, true);

  input.value = "widget";
  input.listener("input")();
  assert.equal(state.worldCommandQuery, "widget");
  assert.equal(state.worldCommandFocusRequested, true);

  const enterEvent = { key: "Enter", prevented: false, preventDefault() { this.prevented = true; } };
  await input.listener("keydown")(enterEvent);
  assert.equal(enterEvent.prevented, true);

  const runEvent = clickEvent();
  await run.listener("click")(runEvent);
  assert.equal(runEvent.prevented, true);

  const closeEvent = clickEvent();
  close.listener("click")(closeEvent);
  assert.equal(closeEvent.prevented, true);
  assert.equal(state.worldCommandOpen, false);
  assert.equal(state.worldCommandQuery, "");

  assert.deepEqual(calls, [
    "draw",
    "draw",
    ["execute", "first"],
    ["execute", "second"],
    "draw"
  ]);
});

test("world command focus helper focuses the live input when requested", () => {
  const calls = [];
  const input = {
    value: "widget",
    focus() {
      calls.push("focus");
    },
    setSelectionRange(start, end) {
      calls.push(["range", start, end]);
    }
  };
  const state = {
    worldCommandOpen: true,
    worldCommandFocusRequested: true
  };
  const root = {
    querySelector(selector) {
      return selector === "[data-world-command-input]" ? input : null;
    }
  };

  const focused = syncWorldCommandFocus({ root, state });

  assert.equal(focused, true);
  assert.equal(state.worldCommandFocusRequested, false);
  assert.deepEqual(calls, ["focus", ["range", 6, 6]]);
});

test("world command shortcuts open and close the palette through the shared seam", () => {
  let handler = null;
  const calls = [];
  const state = {
    worldCommandOpen: false,
    worldCommandQuery: "",
    worldCommandFocusRequested: false
  };
  const activeElement = {
    matches() {
      return false;
    },
    isContentEditable: false
  };

  bindWorldCommandShortcuts({
    state,
    draw: () => calls.push("draw"),
    windowTarget: {
      addEventListener(type, fn) {
        if (type === "keydown") handler = fn;
      }
    },
    documentTarget: { activeElement }
  });

  const ctrlK = { key: "k", ctrlKey: true, metaKey: false, prevented: false, preventDefault() { this.prevented = true; } };
  handler(ctrlK);
  assert.equal(ctrlK.prevented, true);
  assert.equal(state.worldCommandOpen, true);

  state.worldCommandQuery = "widget";
  const escapeEvent = { key: "Escape", ctrlKey: false, metaKey: false, prevented: false, preventDefault() { this.prevented = true; } };
  handler(escapeEvent);
  assert.equal(escapeEvent.prevented, true);
  assert.equal(state.worldCommandOpen, false);
  assert.equal(state.worldCommandQuery, "");

  const slashEvent = { key: "/", ctrlKey: false, metaKey: false, prevented: false, preventDefault() { this.prevented = true; } };
  handler(slashEvent);
  assert.equal(slashEvent.prevented, true);
  assert.equal(state.worldCommandOpen, true);
  assert.equal(state.worldCommandFocusRequested, true);

  assert.deepEqual(calls, ["draw", "draw", "draw"]);
});

test("world command actions factory exposes the shared browser helpers", () => {
  const factory = renderWorldCommandActionsFactory();
  assert.equal(factory.includes("const bindWorldCommandActions ="), true);
  assert.equal(factory.includes("const syncWorldCommandFocus ="), true);
  assert.equal(factory.includes("const bindWorldCommandShortcuts ="), true);
});
