import assert from "node:assert/strict";
import test from "node:test";
import {
  bindBootstrapHostRefresh,
  renderBootstrapHostRefreshFactory
} from "./bootstrap-host-refresh.js";

test("bindBootstrapHostRefresh refreshes for allowed authored sources", async () => {
  const listeners = new Map();
  const calls = [];
  const target = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    }
  };

  bindBootstrapHostRefresh({
    target,
    refresh: async () => {
      calls.push("refresh");
    }
  });

  await listeners.get("witness:host-refresh")({ detail: { source: "bootstrap-starter-controls", reason: "create-todo-starter" } });
  await listeners.get("witness:host-refresh")({ detail: { source: "bootstrap-top-cards", reason: "refresh-bootstrap-button" } });
  await listeners.get("witness:host-refresh")({ detail: { source: "bootstrap-capability-controls", reason: "capability-install" } });

  assert.deepEqual(calls, ["refresh", "refresh", "refresh"]);
});

test("bindBootstrapHostRefresh ignores unknown sources and reports refresh failures", async () => {
  const listeners = new Map();
  const statuses = [];
  const target = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    }
  };

  bindBootstrapHostRefresh({
    target,
    refresh: async () => {
      throw new Error("refresh failed");
    },
    setBootstrapStatus: message => statuses.push(message)
  });

  await listeners.get("witness:host-refresh")({ detail: { source: "not-bootstrap" } });
  assert.deepEqual(statuses, []);

  await listeners.get("witness:host-refresh")({ detail: { source: "bootstrap-proposal-create-controls", reason: "proposal-create" } });
  await Promise.resolve();

  assert.deepEqual(statuses, ["refresh failed"]);
});

test("renderBootstrapHostRefreshFactory exposes the shared browser seam", () => {
  const factory = renderBootstrapHostRefreshFactory();

  assert.equal(factory.includes("const bindBootstrapHostRefresh ="), true);
  assert.equal(factory.includes('"bootstrap-capability-controls"'), true);
  assert.equal(factory.includes('"bootstrap-starter-controls"'), true);
  assert.equal(factory.includes('"witness:host-refresh"'), true);
});
