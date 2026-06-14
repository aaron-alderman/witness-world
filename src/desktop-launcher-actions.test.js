import assert from "node:assert/strict";
import test from "node:test";
import {
  bindDesktopLauncherAction,
  renderDesktopLauncherActionsFactory,
  runDesktopLauncherAction
} from "./desktop-launcher-actions.js";

function createFakeButton() {
  return {
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };
}

test("desktop launcher action helper preserves working, canceled, and failed bridge semantics", async () => {
  const statuses = [];
  let refreshes = 0;

  const canceled = await runDesktopLauncherAction({
    desktop: {
      async openWorldHome() {
        return { canceled: true };
      }
    },
    action: "openWorldHome",
    setStatus: text => statuses.push(text),
    refresh: async () => {
      refreshes += 1;
    },
    workingLabel: "Opening world...",
    canceledLabel: "Open world canceled."
  });
  assert.deepEqual(canceled, { canceled: true });
  assert.deepEqual(statuses, ["Opening world...", "Open world canceled."]);
  assert.equal(refreshes, 0);

  statuses.length = 0;
  const failed = await runDesktopLauncherAction({
    desktop: {
      async createWorldHome() {
        return { ok: false, reason: "busy" };
      }
    },
    action: "createWorldHome",
    setStatus: text => statuses.push(text),
    refresh: async () => {
      refreshes += 1;
    },
    workingLabel: "Creating world...",
    canceledLabel: "Create world canceled."
  });
  assert.deepEqual(failed, { ok: false, reason: "busy" });
  assert.deepEqual(statuses, ["Creating world...", "busy"]);
  assert.equal(refreshes, 1);
});

test("desktop launcher action binder wires the explicit bridge contract through click handlers", async () => {
  const button = createFakeButton();
  const statuses = [];
  const calls = [];
  bindDesktopLauncherAction({
    button,
    desktop: {
      async openWorldHome() {
        calls.push("open");
        return { ok: true };
      }
    },
    action: "openWorldHome",
    setStatus: text => statuses.push(text),
    refresh: async () => {},
    workingLabel: "Opening world...",
    canceledLabel: "Open world canceled."
  });

  await button.listeners.get("click")();
  assert.deepEqual(calls, ["open"]);
  assert.deepEqual(statuses, ["Opening world..."]);
});

test("desktop launcher action helper factory exposes the shared browser helpers", () => {
  const factory = renderDesktopLauncherActionsFactory();
  assert.equal(factory.includes("const runDesktopLauncherAction ="), true);
  assert.equal(factory.includes("const bindDesktopLauncherAction ="), true);
});
