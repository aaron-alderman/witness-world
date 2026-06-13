import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapScopedControlsView,
  buildBootstrapScopedControlsView,
  buildScopedContextSelectView,
  buildContextBindingTargetView,
  buildContextExportTargetView,
  buildContextImportExportView,
  buildStewardshipTargetView,
  renderBootstrapScopedControlsViewFactory
} from "./bootstrap-scoped-controls-view.js";

test("scoped controls helper view builders derive target and export fallbacks", () => {
  assert.deepEqual(buildScopedContextSelectView({
    contextId: "ctx-a",
    contextRows: [{ id: "ctx-a" }, { id: "ctx-b" }]
  }), {
    contextOptions: [
      { value: "ctx-a", label: "ctx-a" },
      { value: "ctx-b", label: "ctx-b" }
    ],
    selectedContextId: "ctx-a"
  });

  assert.deepEqual(buildContextBindingTargetView({
    contextId: "ctx-a",
    targetId: "widget-a",
    contextBindableTargets: () => [{ id: "widget-a", context: "ctx-a" }]
  }), {
    targetOptions: [{ value: "widget-a", label: "widget-a @ctx-a" }],
    selectedTargetId: "widget-a",
    submitDisabled: false
  });

  assert.deepEqual(buildContextExportTargetView({
    contextId: "ctx-a",
    targetId: "widget-a",
    contextScopeRows: () => [{ name: "export-a", target: "widget-a" }]
  }), {
    targetOptions: [{ value: "widget-a", label: "export-a -> widget-a" }],
    selectedTargetId: "widget-a",
    submitDisabled: false
  });

  assert.deepEqual(buildContextImportExportView({
    sourceContextId: "ctx-a",
    exportName: "export-a",
    contextExportRows: () => [{ name: "export-a", target: "widget-a" }]
  }), {
    exportOptions: [{ value: "export-a", label: "export-a -> widget-a" }],
    selectedExportName: "export-a",
    submitDisabled: false
  });

  assert.deepEqual(buildStewardshipTargetView({
    targetKind: "context",
    targetId: "ctx-a",
    stewardshipTargetKinds: ["context", "perspective"],
    stewardshipTargetsFor: kind => kind === "context" ? [{ id: "ctx-a" }] : []
  }), {
    kindOptions: [
      { value: "context", label: "context" },
      { value: "perspective", label: "perspective" }
    ],
    selectedTargetKind: "context",
    targetOptions: [{ value: "ctx-a", label: "ctx-a" }],
    selectedTargetId: "ctx-a",
    submitDisabled: false
  });
});

test("scoped controls view builder derives all create/remove families", () => {
  const view = buildBootstrapScopedControlsView({
    readSelectValue: id => ({
      "context-binding-context": "ctx-a",
      "context-binding-target": "widget-a",
      "context-binding-remove-context": "ctx-a",
      "context-binding-remove-target": "widget-a",
      "context-export-context": "ctx-a",
      "context-export-target": "widget-a",
      "context-export-remove-context": "ctx-a",
      "context-export-remove-target": "widget-a",
      "context-import-source-context": "ctx-a",
      "context-import-export-name": "export-a",
      "context-import-remove-source-context": "ctx-a",
      "context-import-remove-export-name": "export-a",
      "stewardship-target-kind": "context",
      "stewardship-target": "ctx-a",
      "stewardship-remove-target-kind": "context",
      "stewardship-remove-target": "ctx-a"
    }[id] || ""),
    contextRows: [{ id: "ctx-a" }],
    contextBindableTargets: () => [{ id: "widget-a", context: "ctx-a" }],
    contextScopeRows: () => [{ name: "export-a", target: "widget-a" }],
    contextExportRows: () => [{ name: "export-a", target: "widget-a" }],
    stewardshipTargetKinds: ["context"],
    stewardshipTargetsFor: () => [{ id: "ctx-a" }]
  });

  assert.equal(view.bindingCreateContext.selectedContextId, "ctx-a");
  assert.equal(view.importCreateSourceContext.selectedContextId, "ctx-a");
  assert.equal(view.bindingCreate.selectedTargetId, "widget-a");
  assert.equal(view.bindingRemove.selectedTargetId, "widget-a");
  assert.equal(view.exportCreate.selectedTargetId, "widget-a");
  assert.equal(view.exportRemove.selectedTargetId, "widget-a");
  assert.equal(view.importCreate.selectedExportName, "export-a");
  assert.equal(view.importRemove.selectedExportName, "export-a");
  assert.equal(view.stewardshipCreate.selectedTargetId, "ctx-a");
  assert.equal(view.stewardshipRemove.selectedTargetId, "ctx-a");
});

test("scoped controls view builder falls back to the first live context before deriving dependent options", () => {
  const view = buildBootstrapScopedControlsView({
    readSelectValue: id => ({
      "context-binding-context": "ctx-missing",
      "context-binding-target": "widget-a",
      "context-import-source-context": "ctx-missing",
      "context-import-export-name": "export-a"
    }[id] || ""),
    contextRows: [{ id: "ctx-a" }],
    contextBindableTargets: contextId => contextId === "ctx-a" ? [{ id: "widget-a", context: "ctx-a" }] : [],
    contextScopeRows: () => [],
    contextExportRows: contextId => contextId === "ctx-a" ? [{ name: "export-a", target: "widget-a" }] : [],
    stewardshipTargetKinds: [],
    stewardshipTargetsFor: () => []
  });

  assert.equal(view.bindingCreateContext.selectedContextId, "ctx-a");
  assert.equal(view.bindingCreate.selectedTargetId, "widget-a");
  assert.equal(view.importCreateSourceContext.selectedContextId, "ctx-a");
  assert.equal(view.importCreate.selectedExportName, "export-a");
});

test("scoped controls apply helper pushes options, selections, and disabled state", () => {
  const calls = [];
  applyBootstrapScopedControlsView({
    editingDisabled: true,
    view: {
      bindingCreateContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      bindingRemoveContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      exportCreateContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      exportRemoveContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      importCreateContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      importRemoveContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      importCreateSourceContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      importRemoveSourceContext: { contextOptions: [{ value: "ctx-a", label: "ctx-a" }], selectedContextId: "ctx-a" },
      bindingCreate: { targetOptions: [{ value: "widget-a", label: "widget-a" }], selectedTargetId: "widget-a", submitDisabled: false },
      bindingRemove: { targetOptions: [{ value: "widget-a", label: "widget-a" }], selectedTargetId: "widget-a", submitDisabled: true },
      exportCreate: { targetOptions: [{ value: "widget-a", label: "widget-a" }], selectedTargetId: "widget-a", submitDisabled: false },
      exportRemove: { targetOptions: [{ value: "widget-a", label: "widget-a" }], selectedTargetId: "widget-a", submitDisabled: false },
      importCreate: { exportOptions: [{ value: "export-a", label: "export-a" }], selectedExportName: "export-a", submitDisabled: false },
      importRemove: { exportOptions: [{ value: "export-a", label: "export-a" }], selectedExportName: "export-a", submitDisabled: false },
      stewardshipCreate: {
        kindOptions: [{ value: "context", label: "context" }],
        selectedTargetKind: "context",
        targetOptions: [{ value: "ctx-a", label: "ctx-a" }],
        selectedTargetId: "ctx-a",
        submitDisabled: false
      },
      stewardshipRemove: {
        kindOptions: [{ value: "context", label: "context" }],
        selectedTargetKind: "context",
        targetOptions: [{ value: "ctx-a", label: "ctx-a" }],
        selectedTargetId: "ctx-a",
        submitDisabled: true
      }
    },
    fillSelect: (id, options, getValue, getLabel, config) => calls.push([
      "fillSelect",
      id,
      options.map(row => ({ value: getValue(row), label: getLabel(row) })),
      config
    ]),
    setSelectedValue: (id, value) => calls.push(["setSelectedValue", id, value]),
    setSubmitDisabled: (id, value) => calls.push(["setSubmitDisabled", id, value])
  });

  assert.deepEqual(calls.slice(0, 16), [
    ["fillSelect", "context-binding-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-binding-context", "ctx-a"],
    ["fillSelect", "context-binding-remove-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-binding-remove-context", "ctx-a"],
    ["fillSelect", "context-export-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-export-context", "ctx-a"],
    ["fillSelect", "context-export-remove-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-export-remove-context", "ctx-a"],
    ["fillSelect", "context-import-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-import-context", "ctx-a"],
    ["fillSelect", "context-import-remove-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-import-remove-context", "ctx-a"],
    ["fillSelect", "context-import-source-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-import-source-context", "ctx-a"],
    ["fillSelect", "context-import-remove-source-context", [{ value: "ctx-a", label: "ctx-a" }], { includeBlank: false }],
    ["setSelectedValue", "context-import-remove-source-context", "ctx-a"]
  ]);

  assert.deepEqual(calls.slice(-8), [
    ["setSubmitDisabled", "context-binding-form", true],
    ["setSubmitDisabled", "context-binding-remove-form", true],
    ["setSubmitDisabled", "context-export-form", true],
    ["setSubmitDisabled", "context-export-remove-form", true],
    ["setSubmitDisabled", "context-import-form", true],
    ["setSubmitDisabled", "context-import-remove-form", true],
    ["setSubmitDisabled", "stewardship-form", true],
    ["setSubmitDisabled", "stewardship-remove-form", true]
  ]);
});

test("scoped controls view factory exposes shared helper seam", () => {
  const factory = renderBootstrapScopedControlsViewFactory();
  assert.equal(factory.includes("const buildScopedContextSelectView ="), true);
  assert.equal(factory.includes("const buildBootstrapScopedControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapScopedControlsView ="), true);
});
