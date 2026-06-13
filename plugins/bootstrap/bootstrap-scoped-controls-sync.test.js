import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapScopedControlsState,
  bindBootstrapScopedControlsSync,
  buildBootstrapScopedControlsSyncDeps,
  createBootstrapScopedControlsSyncDepsBuilder,
  createBootstrapScopedControlsSyncDepsBuilderFromBootstrap,
  createBootstrapScopedControlsSyncHandler,
  renderBootstrapScopedControlsSyncFactory,
  runBootstrapScopedControlsSync,
  syncBootstrapScopedControlsState
} from "./bootstrap-scoped-controls-sync.js";

function createScopedHarness() {
  const calls = [];
  return {
    calls,
    fillSelect(id, rows) {
      calls.push(["fillSelect", id, rows.map(row => row.value)]);
    },
    setSelectedValue(id, value) {
      calls.push(["setSelectedValue", id, value]);
    },
    setSubmitDisabled(id, value) {
      calls.push(["setSubmitDisabled", id, value]);
    }
  };
}

class FakeOption {
  constructor(label, value) {
    this.label = label;
    this.text = label;
    this.value = value;
  }
}

function createSelectNode(initialValue, optionValues = []) {
  let currentValue = initialValue;
  return {
    options: optionValues.map(value => ({ value, label: value })),
    get value() {
      return currentValue;
    },
    set value(nextValue) {
      currentValue = nextValue;
    },
    append(option) {
      this.options.push(option);
    },
    set innerHTML(_value) {
      this.options = [];
      currentValue = "";
    }
  };
}

function withDomGlobals(callback) {
  const previousCss = globalThis.CSS;
  const previousOption = globalThis.Option;
  globalThis.CSS = { escape: value => String(value) };
  globalThis.Option = FakeOption;
  try {
    callback();
  } finally {
    globalThis.CSS = previousCss;
    globalThis.Option = previousOption;
  }
}

test("scoped state sync builds shared view and apply uses the shared control application seam", () => {
  const harness = createScopedHarness();
  const view = syncBootstrapScopedControlsState({
    readSelectValue: id => {
      if (id === "context-binding-context") return "ctx.home";
      if (id === "context-binding-target") return "widget.home";
      if (id === "stewardship-target-kind") return "context";
      if (id === "stewardship-target") return "ctx.home";
      return "";
    },
    contextRows: [{ id: "ctx.home" }],
    contextBindableTargets: () => [{ id: "widget.home", context: "ctx.home" }],
    contextScopeRows: () => [],
    contextExportRows: () => [],
    stewardshipTargetKinds: ["context"],
    stewardshipTargetsFor: () => [{ id: "ctx.home" }]
  });

  assert.equal(view.bindingCreateContext.selectedContextId, "ctx.home");
  assert.equal(view.bindingCreate.selectedTargetId, "widget.home");
  assert.equal(view.stewardshipCreate.selectedTargetKind, "context");

  applyBootstrapScopedControlsState({
    view,
    authored: { identities: [] },
    session: { authenticated: true },
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.deepEqual(harness.calls.slice(0, 6), [
    ["fillSelect", "context-binding-context", ["ctx.home"]],
    ["setSelectedValue", "context-binding-context", "ctx.home"],
    ["fillSelect", "context-binding-remove-context", ["ctx.home"]],
    ["setSelectedValue", "context-binding-remove-context", "ctx.home"],
    ["fillSelect", "context-export-context", ["ctx.home"]],
    ["setSelectedValue", "context-export-context", "ctx.home"]
  ]);
  assert.deepEqual(harness.calls.slice(-8), [
    ["setSubmitDisabled", "context-binding-form", false],
    ["setSubmitDisabled", "context-binding-remove-form", false],
    ["setSubmitDisabled", "context-export-form", true],
    ["setSubmitDisabled", "context-export-remove-form", true],
    ["setSubmitDisabled", "context-import-form", true],
    ["setSubmitDisabled", "context-import-remove-form", true],
    ["setSubmitDisabled", "stewardship-form", false],
    ["setSubmitDisabled", "stewardship-remove-form", false]
  ]);
});

test("scoped sync helper filters source and family before recomputing and applying state", () => {
  const harness = createScopedHarness();
  const result = runBootstrapScopedControlsSync({
    detail: { source: "bootstrap-scoped-controls", family: "context-binding-target" },
    authored: { identities: [] },
    session: { authenticated: true },
    readSelectValue: id => {
      if (id === "context-binding-context") return "ctx.home";
      if (id === "context-binding-target") return "widget.home";
      return "";
    },
    contextRows: [{ id: "ctx.home" }],
    contextBindableTargets: () => [{ id: "widget.home", context: "ctx.home" }],
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.equal(result.handled, true);
  assert.equal(result.view.bindingCreate.selectedTargetId, "widget.home");
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "context-binding-target"), true);

  assert.deepEqual(runBootstrapScopedControlsSync({
    detail: { source: "bootstrap-remove-controls", family: "unknown" },
    existingView: { stale: true }
  }), { handled: false, view: { stale: true } });
});

test("scoped sync factory, deps builder, and binding keep state and DOM reads live at event time", () => {
  const bindingContext = {
    value: "ctx.next",
    options: [{ value: "ctx.current" }, { value: "ctx.next" }]
  };
  const bindingTarget = {
    value: "widget.next",
    options: [{ value: "widget.current" }, { value: "widget.next" }]
  };
  const button = { disabled: false };
  const nodes = new Map([
    ["context-binding-context", bindingContext],
    ["context-binding-target", bindingTarget],
    ["context-binding-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return button;
        return null;
      }
    }]
  ]);
  const state = {
    bootstrapState: { identities: [], contexts: [{ id: "ctx.current" }] },
    session: { authenticated: false },
    model: {
      contextBindableTargets: [{ id: "widget.current", context: "ctx.current" }],
      stewardshipTargetKinds: ["context"]
    }
  };
  const liveState = {
    authored: () => state.bootstrapState || {},
    session: () => state.session || {},
    contextRows: () => state.bootstrapState?.contexts || [],
    contextBindableTargets: contextId => (state.model?.contextBindableTargets || []).filter(row => !row.context || row.context === contextId),
    contextScopeRows: (contextId, sourceKind = null) => (state.bootstrapState?.contextScopes || [])
      .filter(row => row.context === contextId && (!sourceKind || row.sourceKind === sourceKind)),
    contextExportRows: contextId => (state.bootstrapState?.contextExports || []).filter(row => row.context === contextId),
    stewardshipTargetKinds: () => state.model?.stewardshipTargetKinds || [],
    stewardshipTargetsFor: targetKind => {
      const authored = state.bootstrapState || {};
      if (targetKind === "context") return authored.contexts || [];
      if (targetKind === "perspective") return authored.perspectives || [];
      return [];
    }
  };
  const fillCalls = [];
  const buildDeps = createBootstrapScopedControlsSyncDepsBuilder({
    liveState,
    dom: {
      byId: id => nodes.get(id) || null,
      fillSelect(id, rows) {
        fillCalls.push([id, rows.map(row => row.value)]);
      }
    }
  });

  state.bootstrapState = { identities: [{ id: "identity.aaron" }], contexts: [{ id: "ctx.next" }] };
  state.session = { authenticated: true };
  state.model = {
    contextBindableTargets: [{ id: "widget.next", context: "ctx.next" }],
    stewardshipTargetKinds: ["context", "perspective"]
  };

  const deps = buildDeps();
  assert.deepEqual(deps.authored, { identities: [{ id: "identity.aaron" }], contexts: [{ id: "ctx.next" }] });
  assert.deepEqual(deps.session, { authenticated: true });
  assert.equal(deps.readSelectValue("context-binding-context"), "ctx.next");
  assert.deepEqual(deps.contextBindableTargets("ctx.next"), [{ id: "widget.next", context: "ctx.next" }]);
  deps.setSelectedValue("context-binding-context", "ctx.current");
  assert.equal(bindingContext.value, "ctx.current");
  deps.setSubmitDisabled("context-binding-form", true);
  assert.equal(button.disabled, true);
  deps.fillSelect("context-binding-target", [{ value: "widget.next" }]);
  assert.deepEqual(fillCalls, [["context-binding-target", ["widget.next"]]]);

  const created = createBootstrapScopedControlsSyncHandler();
  assert.deepEqual(created({ detail: { source: "other", family: "context-binding-target" } }), { handled: false, view: {} });

  const listeners = [];
  const target = {
    addEventListener(eventName, handler) {
      listeners.push([eventName, typeof handler]);
      this.handler = handler;
    }
  };
  const harness = createScopedHarness();
  bindBootstrapScopedControlsSync({
    target,
    authored: { identities: [], contexts: [{ id: "ctx.home" }] },
    session: { authenticated: true },
    readSelectValue: id => {
      if (id === "context-binding-context") return "ctx.home";
      if (id === "context-binding-target") return "widget.home";
      return "";
    },
    contextRows: [{ id: "ctx.home" }],
    contextBindableTargets: () => [{ id: "widget.home", context: "ctx.home" }],
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setSubmitDisabled: harness.setSubmitDisabled
  });
  assert.deepEqual(listeners, [["witness:bootstrap-dependent-select-sync", "function"]]);
  const bound = target.handler({ detail: { source: "bootstrap-scoped-controls", family: "context-binding-target" } });
  assert.equal(bound.handled, true);
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "context-binding-target"), true);

  const factory = renderBootstrapScopedControlsSyncFactory();
  assert.equal(factory.includes("const syncBootstrapScopedControlsState ="), true);
  assert.equal(factory.includes("const applyBootstrapScopedControlsState ="), true);
  assert.equal(factory.includes("const runBootstrapScopedControlsSync ="), true);
  assert.equal(factory.includes("const buildBootstrapScopedControlsSyncDeps ="), true);
  assert.equal(factory.includes("const createBootstrapScopedControlsSyncDepsBuilder ="), true);
  assert.equal(factory.includes("const createBootstrapScopedControlsSyncDepsBuilderFromBootstrap ="), true);
  assert.equal(factory.includes("const createBootstrapScopedControlsSyncHandler ="), true);
  assert.equal(factory.includes("const bindBootstrapScopedControlsSync ="), true);
});

test("scoped bootstrap dep-builder seam resolves browser globals and live state from bootstrap state", () => {
  withDomGlobals(() => {
    const previousDocument = globalThis.document;
    const bindingContext = createSelectNode("ctx.next", ["ctx.current", "ctx.next"]);
    const bindingTarget = createSelectNode("widget.next", ["widget.current", "widget.next"]);
    const button = { disabled: false };
    const nodes = new Map([
      ["context-binding-context", bindingContext],
      ["context-binding-target", bindingTarget],
      ["context-binding-form", {
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return button;
          return null;
        }
      }]
    ]);
    globalThis.document = {
      getElementById(id) {
        return nodes.get(id) || null;
      }
    };
    const state = {
      bootstrapState: { identities: [], contexts: [{ id: "ctx.current" }] },
      session: { authenticated: false },
      model: {
        contextBindableTargets: [{ id: "widget.current", context: "ctx.current" }],
        stewardshipTargetKinds: ["context"]
      }
    };

    try {
      const buildDeps = createBootstrapScopedControlsSyncDepsBuilderFromBootstrap({ state });
      state.bootstrapState = { identities: [{ id: "identity.aaron" }], contexts: [{ id: "ctx.next" }] };
      state.session = { authenticated: true };
      state.model = {
        contextBindableTargets: [{ id: "widget.next", context: "ctx.next" }],
        stewardshipTargetKinds: ["context", "perspective"]
      };

      const deps = buildDeps();
      assert.deepEqual(deps.authored, { identities: [{ id: "identity.aaron" }], contexts: [{ id: "ctx.next" }] });
      assert.deepEqual(deps.session, { authenticated: true });
      assert.equal(deps.readSelectValue("context-binding-context"), "ctx.next");
      assert.deepEqual(deps.contextBindableTargets("ctx.next"), [{ id: "widget.next", context: "ctx.next" }]);
      deps.setSelectedValue("context-binding-context", "ctx.current");
      assert.equal(bindingContext.value, "ctx.current");
      deps.fillSelect("context-binding-target", [{ value: "widget.next", label: "widget.next" }], row => row.value, row => row.label, { includeBlank: false });
      assert.deepEqual(bindingTarget.options.map(option => option.value), ["widget.next"]);
      deps.setSubmitDisabled("context-binding-form", true);
      assert.equal(button.disabled, true);
    } finally {
      globalThis.document = previousDocument;
    }
  });
});

test("scoped sync dep builder exposes the shared live dependency packet directly", () => {
  const button = { disabled: false };
  const nodes = new Map([
    ["context-binding-context", { value: "ctx.home", options: [{ value: "ctx.home" }] }],
    ["context-binding-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return button;
        return null;
      }
    }]
  ]);
  const deps = buildBootstrapScopedControlsSyncDeps({
    liveState: {
      authored: () => ({ identities: [], contexts: [{ id: "ctx.home" }] }),
      session: () => ({ authenticated: true }),
      contextRows: () => [{ id: "ctx.home" }],
      contextBindableTargets: () => [],
      contextScopeRows: () => [],
      contextExportRows: () => [],
      stewardshipTargetKinds: () => ["context"],
      stewardshipTargetsFor: () => [{ id: "ctx.home" }]
    },
    dom: {
      byId: id => nodes.get(id) || null
    }
  });

  assert.equal(deps.readSelectValue("context-binding-context"), "ctx.home");
  assert.deepEqual(deps.contextRows, [{ id: "ctx.home" }]);
  assert.deepEqual(deps.stewardshipTargetKinds, ["context"]);
  deps.setSubmitDisabled("context-binding-form", true);
  assert.equal(button.disabled, true);
});
