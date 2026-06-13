import test from "node:test";
import assert from "node:assert/strict";
import {
  bindSurfaceInspectorFormActions,
  readSurfaceInspectorWidgetPatch,
  renderSurfaceInspectorFormActionsFactory,
  submitSurfaceInspectorEditForm,
  submitSurfaceInspectorProposalForm,
  submitSurfaceInspectorVersionProposalForm,
  surfaceInspectorWidgetPatchChanged
} from "./surface-inspector-form-actions.js";

class FakeCheckbox {
  constructor(checked = false) {
    this.checked = checked;
  }
}

function createForm(attributes = {}, fields = {}, hiddenChecked = false) {
  const listeners = new Map();
  return {
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    listener(type) {
      return listeners.get(type);
    },
    querySelector(selector) {
      if (selector === '[name="hidden"]') return new FakeCheckbox(hiddenChecked);
      return null;
    },
    fields
  };
}

function createFormDataFactory() {
  return form => ({
    get(name) {
      return form.fields[name] ?? null;
    }
  });
}

test("surface inspector form helpers read patches and detect authored changes", () => {
  const form = createForm({}, { text: "Updated", title: "Card", class: "panel" }, true);
  const patch = readSurfaceInspectorWidgetPatch({
    form,
    createFormData: createFormDataFactory(),
    inputCtor: FakeCheckbox
  });

  assert.deepEqual(patch, {
    text: "Updated",
    title: "Card",
    class: "panel",
    hidden: true
  });
  assert.equal(surfaceInspectorWidgetPatchChanged({
    current: { props: { text: "Old", title: "Card", class: "panel", hidden: false } },
    patch
  }), true);
  assert.equal(surfaceInspectorWidgetPatchChanged({
    current: { props: { text: "Updated", title: "Card", class: "panel", hidden: true } },
    patch
  }), false);
});

test("surface inspector edit submit helper validates authority, avoids no-op saves, and persists edits through the shared seam", async () => {
  const current = { props: { text: "Old", title: "Card", class: "panel", hidden: false } };
  const form = createForm({ "data-widget-id": "todo_form" }, { text: "Updated", title: "Card", class: "panel" }, true);
  const calls = [];

  const denied = await submitSurfaceInspectorEditForm({
    form,
    selectedSurfaceWidgetAuthored: () => current,
    selectedSurfaceWidgetEditAuthority: () => ({ ok: false, reason: "Readonly" }),
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    readWidgetPatch: options => readSurfaceInspectorWidgetPatch({
      ...options,
      createFormData: createFormDataFactory(),
      inputCtor: FakeCheckbox
    })
  });
  assert.equal(denied, false);

  const noChanges = await submitSurfaceInspectorEditForm({
    form: createForm({ "data-widget-id": "todo_form" }, { text: "Old", title: "Card", class: "panel" }, false),
    selectedSurfaceWidgetAuthored: () => current,
    selectedSurfaceWidgetEditAuthority: () => ({ ok: true, reason: "" }),
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    readWidgetPatch: options => readSurfaceInspectorWidgetPatch({
      ...options,
      createFormData: createFormDataFactory(),
      inputCtor: FakeCheckbox
    })
  });
  assert.equal(noChanges, false);

  const saved = await submitSurfaceInspectorEditForm({
    form,
    selectedSurfaceWidgetAuthored: () => current,
    selectedSurfaceWidgetEditAuthority: () => ({ ok: true, reason: "" }),
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    patchSurfaceWidget: async ({ id, patch }) => {
      calls.push(["patch", id, patch]);
      return { ok: true, body: {} };
    },
    invalidateSurfaceInspectorGraph: () => calls.push("invalidate-graph"),
    invalidateSurfaceInspectorWidgets: () => calls.push("invalidate-widgets"),
    refreshProjection: async () => calls.push("refresh"),
    selectSurfaceInspectorWidget: async (id, options) => calls.push(["select", id, options.statusMessage]),
    readWidgetPatch: options => readSurfaceInspectorWidgetPatch({
      ...options,
      createFormData: createFormDataFactory(),
      inputCtor: FakeCheckbox
    })
  });
  assert.equal(saved, true);

  assert.deepEqual(calls, [
    ["status", "Readonly", "error"],
    "update",
    ["status", "No widget changes to save.", "ok"],
    "update",
    ["status", "Saving todo_form...", "ok"],
    "update",
    ["patch", "todo_form", { text: "Updated", title: "Card", class: "panel", hidden: true }],
    "invalidate-graph",
    "invalidate-widgets",
    "refresh",
    ["select", "todo_form", "Saved todo_form."]
  ]);
});

test("surface inspector proposal helpers route widget and version proposals through the shared seam", async () => {
  const current = { props: { text: "Old", title: "Card", class: "panel", hidden: false } };
  const widgetCalls = [];
  const widgetForm = createForm({ "data-widget-id": "todo_form" }, { text: "Updated", title: "Card", class: "panel", reason: "Need it" }, true);

  const widgetDenied = await submitSurfaceInspectorProposalForm({
    form: widgetForm,
    selectedSurfaceWidgetAuthored: () => current,
    selectedSurfaceWidgetEditAuthority: () => ({ ok: false, reason: "Sign in first" }),
    currentActor: () => "",
    setSurfaceInspectorStatus: (message, level) => widgetCalls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => widgetCalls.push("update"),
    readWidgetPatch: options => readSurfaceInspectorWidgetPatch({
      ...options,
      createFormData: createFormDataFactory(),
      inputCtor: FakeCheckbox
    }),
    createFormData: createFormDataFactory()
  });
  assert.equal(widgetDenied, false);

  const widgetProposed = await submitSurfaceInspectorProposalForm({
    form: widgetForm,
    selectedSurfaceWidgetAuthored: () => current,
    selectedSurfaceWidgetEditAuthority: () => ({ ok: false, reason: "Need proposal" }),
    currentActor: () => "adam",
    setSurfaceInspectorStatus: (message, level) => widgetCalls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => widgetCalls.push("update"),
    proposeSurfaceWidgetPatch: async ({ id, patch, reason }) => {
      widgetCalls.push(["propose", id, patch, reason]);
      return { ok: true, body: { proposal: { id: "proposal-1" } } };
    },
    readWidgetPatch: options => readSurfaceInspectorWidgetPatch({
      ...options,
      createFormData: createFormDataFactory(),
      inputCtor: FakeCheckbox
    }),
    createFormData: createFormDataFactory()
  });
  assert.equal(widgetProposed, true);

  const versionCalls = [];
  const versionForm = createForm({
    "data-surface-inspector-proposal-process": "widgetVersion.activate",
    "data-surface-inspector-proposal-soul": "todo_form",
    "data-surface-inspector-proposal-version": "v2"
  }, { reason: "Upgrade now" });

  const versionDenied = await submitSurfaceInspectorVersionProposalForm({
    form: versionForm,
    selectedSurfaceWidgetEditAuthority: () => ({ ok: false, reason: "Sign in first" }),
    currentActor: () => "",
    setSurfaceInspectorStatus: (message, level) => versionCalls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => versionCalls.push("update"),
    createFormData: createFormDataFactory()
  });
  assert.equal(versionDenied, false);

  const versionProposed = await submitSurfaceInspectorVersionProposalForm({
    form: versionForm,
    selectedSurfaceWidgetEditAuthority: () => ({ ok: false, reason: "Need proposal" }),
    currentActor: () => "adam",
    setSurfaceInspectorStatus: (message, level) => versionCalls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => versionCalls.push("update"),
    proposeSurfaceWidgetVersionAction: async payload => {
      versionCalls.push(["propose-version", payload]);
      return { ok: true, proposalId: "proposal-2" };
    },
    createFormData: createFormDataFactory()
  });
  assert.equal(versionProposed, true);

  assert.deepEqual(widgetCalls, [
    ["status", "Sign in first", "error"],
    "update",
    ["status", "Creating proposal for todo_form...", "ok"],
    "update",
    ["propose", "todo_form", { text: "Updated", title: "Card", class: "panel", hidden: true }, "Need it"],
    ["status", "Proposed todo_form as proposal-1.", "ok"],
    "update"
  ]);
  assert.deepEqual(versionCalls, [
    ["status", "Sign in first", "error"],
    "update",
    ["status", "Creating proposal to activate v2...", "ok"],
    "update",
    ["propose-version", {
      targetProcess: "widgetVersion.activate",
      soul: "todo_form",
      version: "v2",
      reason: "Upgrade now"
    }],
    ["status", "Proposed activate v2 as proposal-2.", "ok"],
    "update"
  ]);
});

test("surface inspector form binder wires edit, proposal, and version proposal submits through the shared seam", async () => {
  const editForm = createForm({ "data-widget-id": "todo_form" }, { text: "Updated", title: "Card", class: "panel" }, true);
  const proposalForm = createForm({ "data-widget-id": "todo_form" }, { text: "Updated", title: "Card", class: "panel", reason: "Need it" }, true);
  const versionForm = createForm({
    "data-surface-inspector-proposal-process": "widgetVersion.rollback",
    "data-surface-inspector-proposal-soul": "todo_form",
    "data-surface-inspector-proposal-version": "v1"
  }, { reason: "Revert" });
  const overlay = {
    querySelectorAll(selector) {
      switch (selector) {
        case "[data-surface-inspector-edit-form]": return [editForm];
        case "[data-surface-inspector-proposal-form]": return [proposalForm];
        case "[data-surface-inspector-version-proposal-form]": return [versionForm];
        default: return [];
      }
    }
  };
  const calls = [];

  bindSurfaceInspectorFormActions({
    overlay,
    selectedSurfaceWidgetAuthored: () => ({ props: { text: "Old", title: "Card", class: "panel", hidden: false } }),
    selectedSurfaceWidgetEditAuthority: () => ({ ok: false, reason: "Need proposal" }),
    currentActor: () => "adam",
    setSurfaceInspectorStatus: (message, level) => calls.push(["status", message, level]),
    updateSurfaceInspectorUi: () => calls.push("update"),
    patchSurfaceWidget: async () => {
      calls.push("patch");
      return { ok: false, body: { error: "Denied" } };
    },
    proposeSurfaceWidgetPatch: async () => {
      calls.push("propose-widget");
      return { ok: true, proposalId: "proposal-1" };
    },
    proposeSurfaceWidgetVersionAction: async () => {
      calls.push("propose-version");
      return { ok: true, proposalId: "proposal-2" };
    },
    readWidgetPatch: options => readSurfaceInspectorWidgetPatch({
      ...options,
      createFormData: createFormDataFactory(),
      inputCtor: FakeCheckbox
    }),
    createFormData: createFormDataFactory(),
    inputCtor: FakeCheckbox
  });

  const submitEvent = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  const editEvent = submitEvent();
  await editForm.listener("submit")(editEvent);
  assert.equal(editEvent.prevented, true);

  const proposalEvent = submitEvent();
  await proposalForm.listener("submit")(proposalEvent);
  assert.equal(proposalEvent.prevented, true);

  const versionEvent = submitEvent();
  await versionForm.listener("submit")(versionEvent);
  assert.equal(versionEvent.prevented, true);

  assert.deepEqual(calls, [
    ["status", "Need proposal", "error"],
    "update",
    ["status", "Creating proposal for todo_form...", "ok"],
    "update",
    "propose-widget",
    ["status", "Proposed todo_form as proposal-1.", "ok"],
    "update",
    ["status", "Creating proposal to rollback todo_form...", "ok"],
    "update",
    "propose-version",
    ["status", "Proposed rollback todo_form as proposal-2.", "ok"],
    "update"
  ]);
});

test("surface inspector form actions factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceInspectorFormActionsFactory();
  assert.equal(factory.includes("const bindSurfaceInspectorFormActions ="), true);
  assert.equal(factory.includes("const submitSurfaceInspectorEditForm ="), true);
  assert.equal(factory.includes("const submitSurfaceInspectorProposalForm ="), true);
  assert.equal(factory.includes("const submitSurfaceInspectorVersionProposalForm ="), true);
});
