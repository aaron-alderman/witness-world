import test from "node:test";
import assert from "node:assert/strict";
import {
  bindSurfaceCommandIdentityActions,
  renderSurfaceCommandIdentityActionsFactory,
  submitSurfaceCommandIdentityForm
} from "./surface-command-identity-actions.js";

function createFormNode(identityId = "adam") {
  const listeners = new Map();
  return {
    getAttribute(name) {
      return name === "data-identity-id" ? identityId : null;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    listener(type) {
      return listeners.get(type);
    }
  };
}

test("surface command identity submit helper validates readiness, no-op saves, and successful saves through the shared seam", async () => {
  const state = {
    surfaceCommandResult: { kind: "whoami", authenticated: true, identity: "adam" },
    surfaceBootstrapIdentities: [{ id: "adam", label: "Old", username: "old", homeContext: "ctx.old", homePerspective: "pers.old" }],
    surfaceBootstrapIdentitiesById: {
      adam: { id: "adam", label: "Old", username: "old", homeContext: "ctx.old", homePerspective: "pers.old" }
    }
  };
  const updates = [];
  const buildSurfaceWhoamiResult = () => ({ kind: "whoami", identity: "adam", authenticated: true });
  const currentSurfaceIdentityRecord = () => state.surfaceBootstrapIdentitiesById.adam;

  const notReady = await submitSurfaceCommandIdentityForm({
    form: createFormNode("adam"),
    state: { ...state, surfaceCommandResult: { kind: "whoami", authenticated: false, identity: "adam" } },
    buildSurfaceWhoamiResult,
    currentSurfaceIdentityRecord,
    updateSurfaceInspectorUi: () => updates.push("not-ready"),
    readIdentityFields: () => ({ label: "", username: "", password: "", homeContext: "", homePerspective: "" })
  });
  assert.equal(notReady, false);

  const noChanges = await submitSurfaceCommandIdentityForm({
    form: createFormNode("adam"),
    state,
    buildSurfaceWhoamiResult,
    currentSurfaceIdentityRecord,
    updateSurfaceInspectorUi: () => updates.push("no-changes"),
    readIdentityFields: () => ({ label: "Old", username: "old", password: "", homeContext: "ctx.old", homePerspective: "pers.old" })
  });
  assert.equal(noChanges, false);
  assert.equal(state.surfaceCommandResult.statusMessage, "No identity changes to save.");

  const savedCalls = [];
  const saved = await submitSurfaceCommandIdentityForm({
    form: createFormNode("adam"),
    state,
    buildSurfaceWhoamiResult,
    currentSurfaceIdentityRecord,
    patchSurfaceIdentity: async ({ id, patch }) => {
      savedCalls.push([id, patch]);
      return {
        ok: true,
        body: {
          session: { actor: "adam", identity: "adam", authenticated: true },
          identity: { id: "adam", label: "Aaron", username: "aaron", homeContext: "ctx.todo", homePerspective: "pers.todo" }
        }
      };
    },
    applyTheme: () => updates.push("apply-theme"),
    updateSurfaceInspectorUi: () => updates.push("saved"),
    readIdentityFields: () => ({ label: "Aaron", username: "aaron", password: "secret", homeContext: "ctx.todo", homePerspective: "pers.todo" })
  });
  assert.equal(saved, true);
  assert.deepEqual(savedCalls, [[
    "adam",
    { label: "Aaron", username: "aaron", password: "secret", homeContext: "ctx.todo", homePerspective: "pers.todo" }
  ]]);
  assert.equal(state.surfaceBootstrapIdentitiesById.adam.label, "Aaron");
  assert.equal(state.surfaceCommandResult.statusMessage, "Saved adam.");
  assert.deepEqual(updates, ["not-ready", "no-changes", "saved", "apply-theme", "saved"]);
});

test("surface command identity binder wires identity-form submits through the shared seam", async () => {
  const form = createFormNode("adam");
  const overlay = {
    querySelectorAll(selector) {
      return selector === "[data-surface-command-identity-form]" ? [form] : [];
    }
  };
  const calls = [];
  bindSurfaceCommandIdentityActions({
    overlay,
    state: {
      surfaceCommandResult: { kind: "whoami", authenticated: true, identity: "adam" },
      surfaceBootstrapIdentities: [{ id: "adam", label: "Old", username: "old" }],
      surfaceBootstrapIdentitiesById: { adam: { id: "adam", label: "Old", username: "old" } }
    },
    buildSurfaceWhoamiResult: () => ({ kind: "whoami", identity: "adam", authenticated: true }),
    currentSurfaceIdentityRecord: () => ({ id: "adam", label: "Old", username: "old" }),
    patchSurfaceIdentity: async () => {
      calls.push("patch");
      return { ok: false, body: { error: "Denied" } };
    },
    updateSurfaceInspectorUi: () => calls.push("update"),
    readIdentityFields: () => ({ label: "Aaron", username: "aaron", password: "", homeContext: "", homePerspective: "" })
  });

  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  form.listener("submit")(event);
  assert.equal(event.prevented, true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ["update", "patch", "update"]);
});

test("surface command identity actions factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceCommandIdentityActionsFactory();
  assert.equal(factory.includes("const bindSurfaceCommandIdentityActions ="), true);
  assert.equal(factory.includes("const submitSurfaceCommandIdentityForm ="), true);
});
