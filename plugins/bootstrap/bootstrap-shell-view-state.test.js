import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapShellViewState,
  renderBootstrapShellViewStateFactory,
  syncBootstrapShellViewState
} from "./bootstrap-shell-view-state.js";

test("bootstrap shell view state sync projects starter, desktop, and form access slices together", () => {
  const state = {
    model: { appReady: false },
    bootstrapState: {
      identities: [{ id: "identity.aaron" }],
      activeStarterBlueprint: { blueprint: {} },
      operator: { mutations: { enabled: true } }
    },
    session: { authenticated: true },
    desktopShell: { shellId: "desktop" }
  };

  const nextState = syncBootstrapShellViewState({ state });

  assert.equal(nextState, state);
  assert.deepEqual(state.starterControlsView, { starterDisabled: false });
  assert.deepEqual(state.desktopControlsView, { desktopButtonsDisabled: false });
  assert.deepEqual(state.formAccessView, {
    editingDisabled: false,
    operatorMutationsDisabled: false
  });
});

test("bootstrap shell view state apply fans projected views into the documented DOM targets", () => {
  const identityControls = [{ disabled: false }];
  const operatorControls = [{ disabled: false }];
  const controls = new Map([
    ["create-todo-starter", { disabled: false }],
    ["context-form", { querySelectorAll: () => identityControls }],
    ["operator-backup-form", { querySelectorAll: () => operatorControls }],
    ["desktop-open-world", { disabled: false }],
    ["desktop-create-world", { disabled: false }],
    ["desktop-reveal-world", { disabled: false }]
  ]);

  applyBootstrapShellViewState({
    state: {
      starterControlsView: { starterDisabled: true },
      desktopControlsView: { desktopButtonsDisabled: true },
      formAccessView: {
        editingDisabled: true,
        operatorMutationsDisabled: true
      }
    },
    byId: id => controls.get(id) || null
  });

  assert.equal(controls.get("create-todo-starter").disabled, true);
  assert.equal(controls.get("desktop-open-world").disabled, true);
  assert.equal(controls.get("desktop-create-world").disabled, true);
  assert.equal(controls.get("desktop-reveal-world").disabled, true);
  assert.equal(identityControls[0].disabled, true);
  assert.equal(operatorControls[0].disabled, true);
});

test("bootstrap shell view state factory exposes the shared browser helpers", () => {
  const factory = renderBootstrapShellViewStateFactory();
  assert.equal(factory.includes("const syncBootstrapShellViewState ="), true);
  assert.equal(factory.includes("const applyBootstrapShellViewState ="), true);
});
