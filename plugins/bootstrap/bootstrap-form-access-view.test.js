import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBootstrapFormAccessView,
  buildBootstrapFormAccessView,
  renderBootstrapFormAccessViewFactory
} from "./bootstrap-form-access-view.js";

test("form access view derives edit gating from session, identities, and operator state", () => {
  assert.deepEqual(buildBootstrapFormAccessView({
    bootstrapState: { identities: [] },
    session: { authenticated: false },
    operator: { mutations: { enabled: true } }
  }), {
    editingDisabled: false,
    operatorMutationsDisabled: false
  });

  assert.deepEqual(buildBootstrapFormAccessView({
    bootstrapState: { identities: [{ id: "identity.aaron" }] },
    session: { authenticated: false },
    operator: { mutations: { enabled: false } }
  }), {
    editingDisabled: true,
    operatorMutationsDisabled: true
  });
});

test("form access view disables authored controls and operator forms explicitly", () => {
  const contextControls = [{ disabled: false }, { disabled: false }];
  const operatorControls = [{ disabled: false }, { disabled: false }];
  const forms = new Map([
    ["context-form", { querySelectorAll: () => contextControls }],
    ["operator-backup-form", { querySelectorAll: () => operatorControls }]
  ]);

  applyBootstrapFormAccessView({
    view: {
      editingDisabled: false,
      operatorMutationsDisabled: true
    },
    byId: id => forms.get(id) || null
  });

  assert.deepEqual(contextControls.map(row => row.disabled), [false, false]);
  assert.deepEqual(operatorControls.map(row => row.disabled), [true, true]);

  applyBootstrapFormAccessView({
    view: {
      editingDisabled: true,
      operatorMutationsDisabled: false
    },
    byId: id => forms.get(id) || null
  });

  assert.deepEqual(contextControls.map(row => row.disabled), [true, true]);
  assert.deepEqual(operatorControls.map(row => row.disabled), [true, true]);
});

test("form access view factory exposes the shared browser seam", () => {
  const factory = renderBootstrapFormAccessViewFactory();

  assert.equal(factory.includes("const buildBootstrapFormAccessView ="), true);
  assert.equal(factory.includes("const applyBootstrapFormAccessView ="), true);
  assert.equal(factory.includes('"operator-backup-form"'), true);
});
