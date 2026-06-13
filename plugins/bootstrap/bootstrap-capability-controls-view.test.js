import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapCapabilityBaseSelectView,
  buildBootstrapCapabilityBaseSelectView,
  renderBootstrapCapabilityBaseSelectViewFactory
} from "./bootstrap-capability-controls-view.js";

test("capability base-select view derives live option sets and preserves current selections", () => {
  const view = buildBootstrapCapabilityBaseSelectView({
    readSelectValue: id => ({
      "capability-context": "ctx.docs",
      "capability-install-capability": "notes.sidebar",
      "capability-remove-capability": "notes.sidebar",
      "capability-install-kind": "routePage",
      "capability-remove-kind": "routePage"
    }[id] || ""),
    contextRows: [{ id: "ctx.docs" }, { id: "ctx.ops" }],
    capabilityCatalog: [{ id: "notes.sidebar", version: "1.2.3" }, { id: "nav.shell" }],
    capabilityTargetKinds: ["routePage", "serverRunner"]
  });

  assert.deepEqual(view, {
    createContext: {
      contextOptions: [
        { value: "ctx.docs", label: "ctx.docs" },
        { value: "ctx.ops", label: "ctx.ops" }
      ],
      selectedContextId: "ctx.docs"
    },
    installCapability: {
      capabilityOptions: [
        { value: "notes.sidebar", label: "notes.sidebar [1.2.3]" },
        { value: "nav.shell", label: "nav.shell" }
      ],
      selectedCapabilityId: "notes.sidebar"
    },
    removeCapability: {
      capabilityOptions: [
        { value: "notes.sidebar", label: "notes.sidebar [1.2.3]" },
        { value: "nav.shell", label: "nav.shell" }
      ],
      selectedCapabilityId: "notes.sidebar"
    },
    installKind: {
      targetKindOptions: [
        { value: "routePage", label: "routePage" },
        { value: "serverRunner", label: "serverRunner" }
      ],
      selectedTargetKind: "routePage"
    },
    removeKind: {
      targetKindOptions: [
        { value: "routePage", label: "routePage" },
        { value: "serverRunner", label: "serverRunner" }
      ],
      selectedTargetKind: "routePage"
    }
  });
});

test("capability base-select view falls back to the first live option when the current selection is stale", () => {
  const view = buildBootstrapCapabilityBaseSelectView({
    readSelectValue: id => ({
      "capability-context": "ctx.missing",
      "capability-install-capability": "capability.missing",
      "capability-remove-capability": "capability.missing",
      "capability-install-kind": "missingKind",
      "capability-remove-kind": "missingKind"
    }[id] || ""),
    contextRows: [{ id: "ctx.docs" }],
    capabilityCatalog: [{ id: "notes.sidebar" }],
    capabilityTargetKinds: ["routePage"]
  });

  assert.equal(view.createContext.selectedContextId, "ctx.docs");
  assert.equal(view.installCapability.selectedCapabilityId, "notes.sidebar");
  assert.equal(view.removeCapability.selectedCapabilityId, "notes.sidebar");
  assert.equal(view.installKind.selectedTargetKind, "routePage");
  assert.equal(view.removeKind.selectedTargetKind, "routePage");
});

test("capability base-select apply helper pushes options and selected values through the shared seam", () => {
  const calls = [];
  applyBootstrapCapabilityBaseSelectView({
    view: {
      createContext: {
        contextOptions: [{ value: "ctx.docs", label: "ctx.docs" }],
        selectedContextId: "ctx.docs"
      },
      installCapability: {
        capabilityOptions: [{ value: "notes.sidebar", label: "notes.sidebar" }],
        selectedCapabilityId: "notes.sidebar"
      },
      removeCapability: {
        capabilityOptions: [{ value: "notes.sidebar", label: "notes.sidebar" }],
        selectedCapabilityId: "notes.sidebar"
      },
      installKind: {
        targetKindOptions: [{ value: "routePage", label: "routePage" }],
        selectedTargetKind: "routePage"
      },
      removeKind: {
        targetKindOptions: [{ value: "routePage", label: "routePage" }],
        selectedTargetKind: "routePage"
      }
    },
    fillSelect: (id, options, getValue, getLabel, config) => calls.push([
      "fillSelect",
      id,
      options.map(row => ({ value: getValue(row), label: getLabel(row) })),
      config
    ]),
    setSelectedValue: (id, value) => calls.push(["setSelectedValue", id, value])
  });

  assert.deepEqual(calls, [
    ["fillSelect", "capability-context", [{ value: "ctx.docs", label: "ctx.docs" }], undefined],
    ["setSelectedValue", "capability-context", "ctx.docs"],
    ["fillSelect", "capability-install-capability", [{ value: "notes.sidebar", label: "notes.sidebar" }], { includeBlank: false }],
    ["setSelectedValue", "capability-install-capability", "notes.sidebar"],
    ["fillSelect", "capability-remove-capability", [{ value: "notes.sidebar", label: "notes.sidebar" }], { includeBlank: false }],
    ["setSelectedValue", "capability-remove-capability", "notes.sidebar"],
    ["fillSelect", "capability-install-kind", [{ value: "routePage", label: "routePage" }], { includeBlank: false }],
    ["setSelectedValue", "capability-install-kind", "routePage"],
    ["fillSelect", "capability-remove-kind", [{ value: "routePage", label: "routePage" }], { includeBlank: false }],
    ["setSelectedValue", "capability-remove-kind", "routePage"]
  ]);
});

test("capability base-select view factory exposes the browser helper seam", () => {
  const factory = renderBootstrapCapabilityBaseSelectViewFactory();
  assert.equal(factory.includes("const buildBootstrapCapabilityBaseSelectView ="), true);
  assert.equal(factory.includes("const applyBootstrapCapabilityBaseSelectView ="), true);
});
