import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBootstrapStarterControlsView,
  buildBootstrapStarterControlsView,
  renderBootstrapStarterControlsViewFactory
} from "./bootstrap-starter-controls-view.js";

test("starter controls view disables starter when app is ready or editing is unavailable", () => {
  assert.deepEqual(buildBootstrapStarterControlsView({
    model: { appReady: true },
    bootstrapState: { identities: [], activeStarterBlueprint: { blueprint: {} } },
    session: { authenticated: false }
  }), { starterDisabled: true });

  assert.deepEqual(buildBootstrapStarterControlsView({
    model: { appReady: false },
    bootstrapState: { identities: [{ id: "identity.aaron" }], activeStarterBlueprint: { blueprint: {} } },
    session: { authenticated: false }
  }), { starterDisabled: true });

  assert.deepEqual(buildBootstrapStarterControlsView({
    model: { appReady: false },
    bootstrapState: { identities: [], activeStarterBlueprint: { blueprint: {} } },
    session: { authenticated: false }
  }), { starterDisabled: false });
});

test("starter controls view applies disabled state to the starter button", () => {
  const button = { disabled: false };

  applyBootstrapStarterControlsView({
    view: { starterDisabled: true },
    byId: id => id === "create-todo-starter" ? button : null
  });
  assert.equal(button.disabled, true);

  applyBootstrapStarterControlsView({
    view: { starterDisabled: false },
    byId: id => id === "create-todo-starter" ? button : null
  });
  assert.equal(button.disabled, false);
});

test("starter controls view factory exposes the shared browser seam", () => {
  const factory = renderBootstrapStarterControlsViewFactory();

  assert.equal(factory.includes("const buildBootstrapStarterControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapStarterControlsView ="), true);
  assert.equal(factory.includes('"create-todo-starter"'), true);
});
