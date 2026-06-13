import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBootstrapBackendVersionControlsView,
  buildBootstrapBackendVersionControlsProjection,
  buildBootstrapBackendVersionControlsView,
  renderBootstrapBackendVersionControlsViewFactory
} from "./bootstrap-backend-version-controls-view.js";

test("backend version controls projection derives activate and rollback guidance from bootstrap rows", () => {
  const view = buildBootstrapBackendVersionControlsProjection({
    activateSoul: "todo.todos.list",
    activateVersion: "todo.todos.list.v2",
    rollbackSoul: "todo.todos.list",
    backendProgramRows: [{ soul: "todo.todos.list", context: "ctx.todo" }],
    backendProgramVersionRows: [
      { soul: "todo.todos.list", version: "todo.todos.list.v1", active: true, index: 1 },
      { soul: "todo.todos.list", version: "todo.todos.list.v2", active: false, index: 2 }
    ],
    backendProgramTransitionRows: [
      { soul: "todo.todos.list", from: "todo.todos.list.v1", to: "todo.todos.list.v2", strategy: "migrate" }
    ],
    backendProgramActivationHistoryRows: [
      { soul: "todo.todos.list", version: "todo.todos.list.v0" },
      { soul: "todo.todos.list", version: "todo.todos.list.v1" }
    ],
    authorityContexts: ["ctx.todo"]
  });

  assert.equal(view.activate.selectedSoul, "todo.todos.list");
  assert.equal(view.activate.selectedVersion, "todo.todos.list.v2");
  assert.equal(view.activate.helpText.includes("Transition strategy: migrate."), true);
  assert.equal(view.activate.submitDisabled, false);
  assert.equal(view.rollback.selectedSoul, "todo.todos.list");
  assert.equal(view.rollback.helpText.includes("Rollback target from activation history: todo.todos.list.v0."), true);
  assert.equal(view.rollback.submitDisabled, false);
});

test("backend version controls view preserves activate and rollback projection state", () => {
  const view = buildBootstrapBackendVersionControlsView({
    activate: {
      soulOptions: [{ value: "todo.todos.list", label: "todo.todos.list" }],
      selectedSoul: "todo.todos.list",
      versionOptions: [{ value: "todo.todos.list.v2", label: "todo.todos.list.v2" }],
      selectedVersion: "todo.todos.list.v2",
      helpText: "Activate guidance",
      submitDisabled: true
    },
    rollback: {
      soulOptions: [{ value: "todo.todos.list", label: "todo.todos.list" }],
      selectedSoul: "todo.todos.list",
      helpText: "Rollback guidance",
      submitDisabled: false
    }
  });

  assert.equal(view.activate.selectedSoul, "todo.todos.list");
  assert.equal(view.activate.selectedVersion, "todo.todos.list.v2");
  assert.equal(view.activate.submitDisabled, true);
  assert.equal(view.rollback.submitDisabled, false);
});

test("backend version controls view applies options, help text, and disabled state", () => {
  const values = {};
  const statuses = {};
  const buttons = {
    activate: { disabled: false },
    rollback: { disabled: false }
  };
  const selectFactory = id => ({
    options: [{ value: values[id] || "" }]
  });
  const nodes = new Map([
    ["backend-program-activate-soul", selectFactory("backend-program-activate-soul")],
    ["backend-program-activate-version", selectFactory("backend-program-activate-version")],
    ["backend-program-rollback-soul", selectFactory("backend-program-rollback-soul")],
    ["backend-program-activate-form", { querySelector: () => buttons.activate }],
    ["backend-program-rollback-form", { querySelector: () => buttons.rollback }]
  ]);

  applyBootstrapBackendVersionControlsView({
    view: {
      activate: {
        soulOptions: [{ value: "todo.todos.list", label: "todo.todos.list" }],
        selectedSoul: "todo.todos.list",
        versionOptions: [{ value: "todo.todos.list.v2", label: "todo.todos.list.v2" }],
        selectedVersion: "todo.todos.list.v2",
        helpText: "Activate guidance",
        submitDisabled: true
      },
      rollback: {
        soulOptions: [{ value: "todo.todos.list", label: "todo.todos.list" }],
        selectedSoul: "todo.todos.list",
        helpText: "Rollback guidance",
        submitDisabled: false
      }
    },
    fillSelect: (id, rows) => {
      values[id] = rows[0]?.value || "";
      const node = nodes.get(id);
      if (node) node.options = rows.map(row => ({ value: row.value }));
    },
    byId: id => nodes.get(id) || null,
    setStatus: (id, text) => {
      statuses[id] = text;
    },
    editingDisabled: false,
    operatorDisabled: true
  });

  assert.equal(values["backend-program-activate-soul"], "todo.todos.list");
  assert.equal(values["backend-program-activate-version"], "todo.todos.list.v2");
  assert.equal(values["backend-program-rollback-soul"], "todo.todos.list");
  assert.equal(statuses["backend-program-activate-help"], "Activate guidance");
  assert.equal(statuses["backend-program-rollback-help"], "Rollback guidance");
  assert.equal(buttons.activate.disabled, true);
  assert.equal(buttons.rollback.disabled, true);
});

test("backend version controls view factory exposes the shared browser seam", () => {
  const factory = renderBootstrapBackendVersionControlsViewFactory();

  assert.equal(factory.includes("const buildBootstrapBackendVersionControlsProjection ="), true);
  assert.equal(factory.includes("const buildBootstrapBackendVersionControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapBackendVersionControlsView ="), true);
  assert.equal(factory.includes('"backend-program-activate-soul"'), true);
});
