import test from "node:test";
import assert from "node:assert/strict";
import {
  bindSurfaceInspectorVersionActions,
  renderSurfaceInspectorVersionActionsFactory,
  runSurfaceInspectorActivateAction,
  runSurfaceInspectorRollbackAction
} from "./surface-inspector-version-actions.js";

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

test("surface inspector version activate helper routes success and failure through the shared seam", async () => {
  const calls = [];

  const missing = await runSurfaceInspectorActivateAction();
  assert.equal(missing, false);

  const failed = await runSurfaceInspectorActivateAction({
    soul: "todo_form",
    version: "v2",
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    activateSurfaceWidgetVersion: async () => ({ ok: false, body: { error: "Denied" } })
  });
  assert.equal(failed, false);

  const succeeded = await runSurfaceInspectorActivateAction({
    soul: "todo_form",
    version: "v2",
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    activateSurfaceWidgetVersion: async ({ soul, version }) => {
      calls.push(["activate", soul, version]);
      return { ok: true, body: { status: "migrated" } };
    },
    invalidateSurfaceInspectorGraph: () => calls.push("invalidate-graph"),
    refreshProjection: async () => calls.push("refresh"),
    selectSurfaceInspectorWidget: async (id, options) => calls.push(["select", id, options.statusMessage])
  });
  assert.equal(succeeded, true);

  assert.deepEqual(calls, [
    ["status", "Activating v2...", "ok"],
    "update",
    ["status", "Denied", "error"],
    "update",
    ["status", "Activating v2...", "ok"],
    "update",
    ["activate", "todo_form", "v2"],
    "invalidate-graph",
    "refresh",
    ["select", "todo_form", "Activated v2 (migrated)"]
  ]);
});

test("surface inspector version rollback helper routes success and failure through the shared seam", async () => {
  const calls = [];

  const missing = await runSurfaceInspectorRollbackAction();
  assert.equal(missing, false);

  const failed = await runSurfaceInspectorRollbackAction({
    soul: "todo_form",
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    rollbackSurfaceWidgetVersion: async () => ({ ok: false, body: { error: "Rollback denied" } })
  });
  assert.equal(failed, false);

  const succeeded = await runSurfaceInspectorRollbackAction({
    soul: "todo_form",
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    rollbackSurfaceWidgetVersion: async ({ soul }) => {
      calls.push(["rollback", soul]);
      return { ok: true, body: { version: "v1" } };
    },
    invalidateSurfaceInspectorGraph: () => calls.push("invalidate-graph"),
    refreshProjection: async () => calls.push("refresh"),
    selectSurfaceInspectorWidget: async (id, options) => calls.push(["select", id, options.statusMessage])
  });
  assert.equal(succeeded, true);

  assert.deepEqual(calls, [
    ["status", "Rolling back todo_form...", "ok"],
    "update",
    ["status", "Rollback denied", "error"],
    "update",
    ["status", "Rolling back todo_form...", "ok"],
    "update",
    ["rollback", "todo_form"],
    "invalidate-graph",
    "refresh",
    ["select", "todo_form", "Rolled back to v1."]
  ]);
});

test("surface inspector version binder wires activate and rollback buttons through the shared seam", async () => {
  const activate = createNode({
    "data-surface-inspector-activate": "todo_form",
    "data-surface-inspector-version": "v2"
  });
  const rollback = createNode({
    "data-surface-inspector-rollback": "todo_form"
  });
  const overlay = {
    querySelectorAll(selector) {
      switch (selector) {
        case "[data-surface-inspector-activate]": return [activate];
        case "[data-surface-inspector-rollback]": return [rollback];
        default: return [];
      }
    }
  };
  const calls = [];

  bindSurfaceInspectorVersionActions({
    overlay,
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    activateSurfaceWidgetVersion: async ({ soul, version }) => {
      calls.push(["activate", soul, version]);
      return { ok: true, body: {} };
    },
    rollbackSurfaceWidgetVersion: async ({ soul }) => {
      calls.push(["rollback", soul]);
      return { ok: true, body: { version: "v1" } };
    },
    invalidateSurfaceInspectorGraph: () => calls.push("invalidate-graph"),
    refreshProjection: async () => calls.push("refresh"),
    selectSurfaceInspectorWidget: async (id, options) => calls.push(["select", id, options.statusMessage])
  });

  const clickEvent = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  const activateEvent = clickEvent();
  await activate.listener("click")(activateEvent);
  assert.equal(activateEvent.prevented, true);

  const rollbackEvent = clickEvent();
  await rollback.listener("click")(rollbackEvent);
  assert.equal(rollbackEvent.prevented, true);

  assert.deepEqual(calls, [
    ["status", "Activating v2...", "ok"],
    "update",
    ["activate", "todo_form", "v2"],
    "invalidate-graph",
    "refresh",
    ["select", "todo_form", "Activated v2."],
    ["status", "Rolling back todo_form...", "ok"],
    "update",
    ["rollback", "todo_form"],
    "invalidate-graph",
    "refresh",
    ["select", "todo_form", "Rolled back to v1."]
  ]);
});

test("surface inspector version actions factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceInspectorVersionActionsFactory();
  assert.equal(factory.includes("const bindSurfaceInspectorVersionActions ="), true);
  assert.equal(factory.includes("const runSurfaceInspectorActivateAction ="), true);
  assert.equal(factory.includes("const runSurfaceInspectorRollbackAction ="), true);
});
