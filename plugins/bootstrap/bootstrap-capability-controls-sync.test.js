import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapCapabilityControlsView,
  bindBootstrapCapabilityControlsSync,
  createBootstrapCapabilityControlsRuntime,
  createBootstrapCapabilityControlsRuntimeFromBootstrap,
  buildBootstrapCapabilityControlsSyncDeps,
  createBootstrapCapabilityControlsSyncDepsBuilder,
  renderBootstrapCapabilityControlsSyncFactory,
  runBootstrapCapabilityControlsRender,
  runBootstrapCapabilityControlsSync,
  syncBootstrapCapabilityControlsState
} from "./bootstrap-capability-controls-sync.js";

function createCapabilityHarness() {
  const calls = [];
  return {
    calls,
    fillSelect(id, rows) {
      calls.push(["fillSelect", id, rows.map(row => row.value)]);
    },
    setSelectedValue(id, value) {
      calls.push(["setSelectedValue", id, value]);
    },
    setStatus(id, value) {
      calls.push(["setStatus", id, value]);
    },
    setSubmitDisabled(id, value) {
      calls.push(["setSubmitDisabled", id, value]);
    }
  };
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

test("capability sync builds install target/help view, preserves other families, and applies through the shared seam", () => {
  const harness = createCapabilityHarness();
  const view = syncBootstrapCapabilityControlsState({
    family: "capability-install",
    existingView: {
      capabilityRemove: { selectedTargetId: "keep.me" }
    },
    authored: {
      capabilityCatalog: [{
        id: "notes.sidebar",
        placement: ["routePage"],
        capabilitySourceState: "both",
        packageSources: [{ pluginId: "plugin.notes" }]
      }],
      capabilityInstalls: []
    },
    model: {
      capabilityTargets: {
        routePages: [{ id: "home_page_route", path: "/home" }]
      }
    },
    readSelectValue: id => ({
      "capability-install-capability": "notes.sidebar",
      "capability-install-kind": "routePage",
      "capability-install-target": "home_page_route"
    }[id] || "")
  });

  assert.equal(view.capabilityInstall.selectedTargetId, "home_page_route");
  assert.equal(view.capabilityInstall.submitDisabled, false);
  assert.equal(view.capabilityInstall.helpText.includes("supports placements: routePage"), true);
  assert.equal(view.capabilityInstall.helpText.includes("Source state: both via plugin.notes."), true);
  assert.deepEqual(view.capabilityRemove, { selectedTargetId: "keep.me" });

  applyBootstrapCapabilityControlsView({
    family: "capability-install",
    view,
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.deepEqual(harness.calls, [
    ["fillSelect", "capability-install-target", ["home_page_route"]],
    ["setSelectedValue", "capability-install-target", "home_page_route"],
    ["setStatus", "capability-install-help", view.capabilityInstall.helpText],
    ["setSubmitDisabled", "capability-install-form", false]
  ]);
});

test("capability sync recomputes invalid placement guidance and installed-only removal through the shared seam", () => {
  const installHarness = createCapabilityHarness();
  const installResult = runBootstrapCapabilityControlsSync({
    family: "capability-install",
    authored: {
      capabilityCatalog: [{
        id: "notes.sidebar",
        placement: ["routePage"],
        capabilitySourceState: "both",
        packageSources: []
      }],
      capabilityInstalls: []
    },
    model: {
      capabilityTargets: {
        serverRunners: [{ id: "demo_server" }]
      }
    },
    readSelectValue: id => ({
      "capability-install-capability": "notes.sidebar",
      "capability-install-kind": "serverRunner",
      "capability-install-target": "demo_server"
    }[id] || ""),
    fillSelect: installHarness.fillSelect,
    setSelectedValue: installHarness.setSelectedValue,
    setStatus: installHarness.setStatus,
    setSubmitDisabled: installHarness.setSubmitDisabled
  });
  assert.equal(installResult.handled, true);
  assert.equal(installResult.view.capabilityInstall.submitDisabled, true);
  assert.equal(installResult.view.capabilityInstall.helpText.includes("does not support target kind serverRunner"), true);

  const removeHarness = createCapabilityHarness();
  const removeResult = runBootstrapCapabilityControlsSync({
    family: "capability-remove",
    authored: {
      capabilityCatalog: [{
        id: "notes.sidebar",
        placement: ["routePage"],
        capabilitySourceState: "both",
        packageSources: []
      }],
      capabilityInstalls: [{
        capability: "notes.sidebar",
        targetKind: "routePage",
        target: "home_page_route"
      }]
    },
    model: {
      capabilityTargets: {
        routePages: [{ id: "home_page_route", path: "/home" }]
      }
    },
    readSelectValue: id => ({
      "capability-remove-capability": "notes.sidebar",
      "capability-remove-kind": "routePage",
      "capability-remove-target": "home_page_route"
    }[id] || ""),
    fillSelect: removeHarness.fillSelect,
    setSelectedValue: removeHarness.setSelectedValue,
    setStatus: removeHarness.setStatus,
    setSubmitDisabled: removeHarness.setSubmitDisabled
  });
  assert.equal(removeResult.handled, true);
  assert.equal(removeResult.view.capabilityRemove.submitDisabled, false);
  assert.equal(removeResult.view.capabilityRemove.helpText.includes("supports placements: routePage"), true);
  assert.deepEqual(removeHarness.calls, [
    ["fillSelect", "capability-remove-target", ["home_page_route"]],
    ["setSelectedValue", "capability-remove-target", "home_page_route"],
    ["setStatus", "capability-remove-help", removeResult.view.capabilityRemove.helpText],
    ["setSubmitDisabled", "capability-remove-form", false]
  ]);
});

test("capability sync helper supports full refresh without a family", () => {
  const harness = createCapabilityHarness();
  const result = runBootstrapCapabilityControlsSync({
    authored: {
      capabilityCatalog: [{
        id: "notes.sidebar",
        placement: ["routePage"],
        capabilitySourceState: "both",
        packageSources: []
      }],
      capabilityInstalls: [{
        capability: "notes.sidebar",
        targetKind: "routePage",
        target: "home_page_route"
      }]
    },
    model: {
      capabilityTargets: {
        routePages: [{ id: "home_page_route", path: "/home" }]
      }
    },
    readSelectValue: id => ({
      "capability-install-capability": "notes.sidebar",
      "capability-install-kind": "routePage",
      "capability-install-target": "home_page_route",
      "capability-remove-capability": "notes.sidebar",
      "capability-remove-kind": "routePage",
      "capability-remove-target": "home_page_route"
    }[id] || ""),
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });
  assert.equal(result.handled, true);
  assert.equal(result.view.capabilityInstall.selectedTargetId, "home_page_route");
  assert.equal(result.view.capabilityRemove.selectedTargetId, "home_page_route");
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "capability-install-target"), true);
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "capability-remove-target"), true);
});

test("capability render helper sequences shared base-select projection before target/help recompute", () => {
  const harness = createCapabilityHarness();
  const result = runBootstrapCapabilityControlsRender({
    authored: {
      contexts: [{ id: "ctx.docs" }],
      capabilityCatalog: [{
        id: "notes.sidebar",
        version: "1.2.3",
        placement: ["routePage"],
        capabilitySourceState: "both",
        packageSources: []
      }],
      capabilityInstalls: []
    },
    model: {
      capabilityTargetKinds: ["routePage"],
      capabilityTargets: {
        routePages: [{ id: "home_page_route", path: "/home" }]
      }
    },
    readSelectValue: id => ({
      "capability-context": "ctx.docs",
      "capability-install-capability": "notes.sidebar",
      "capability-remove-capability": "notes.sidebar",
      "capability-install-kind": "routePage",
      "capability-remove-kind": "routePage",
      "capability-install-target": "home_page_route",
      "capability-remove-target": "home_page_route"
    }[id] || ""),
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.equal(result.handled, true);
  assert.deepEqual(harness.calls.slice(0, 10), [
    ["fillSelect", "capability-context", ["ctx.docs"]],
    ["setSelectedValue", "capability-context", "ctx.docs"],
    ["fillSelect", "capability-install-capability", ["notes.sidebar"]],
    ["setSelectedValue", "capability-install-capability", "notes.sidebar"],
    ["fillSelect", "capability-remove-capability", ["notes.sidebar"]],
    ["setSelectedValue", "capability-remove-capability", "notes.sidebar"],
    ["fillSelect", "capability-install-kind", ["routePage"]],
    ["setSelectedValue", "capability-install-kind", "routePage"],
    ["fillSelect", "capability-remove-kind", ["routePage"]],
    ["setSelectedValue", "capability-remove-kind", "routePage"]
  ]);
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "capability-install-target"), true);
  assert.equal(harness.calls.some(call => call[0] === "setStatus" && call[1] === "capability-install-help"), true);
});

test("capability deps builder keeps state and DOM reads live at event time and exposes the factory seam", () => {
  const targetSelect = {
    value: "home_page_route",
    options: [{ value: "home_page_route" }, { value: "admin_page_route" }]
  };
  const button = { disabled: false };
  const statusCalls = [];
  const fillCalls = [];
  const nodes = new Map([
    ["capability-install-target", targetSelect],
    ["capability-install-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return button;
        return null;
      }
    }]
  ]);
  const state = {
    bootstrapState: {
      capabilityCatalog: [],
      capabilityInstalls: []
    },
    model: {
      capabilityTargets: {
        routePages: [{ id: "home_page_route", path: "/home" }]
      }
    }
  };
  const liveState = {
    authored: () => state.bootstrapState || {},
    model: () => state.model || {}
  };
  const buildDeps = createBootstrapCapabilityControlsSyncDepsBuilder({
    liveState,
    dom: {
      byId: id => nodes.get(id) || null,
      fillSelect(id, rows) {
        fillCalls.push([id, rows.map(row => row.value)]);
      },
      setStatus(id, value) {
        statusCalls.push([id, value]);
      }
    }
  });

  state.bootstrapState = {
    capabilityCatalog: [{ id: "notes.sidebar", placement: ["routePage"] }],
    capabilityInstalls: []
  };
  state.model = {
    capabilityTargets: {
      routePages: [{ id: "admin_page_route", path: "/admin" }]
    }
  };

  const deps = buildDeps();
  assert.deepEqual(deps.authored, state.bootstrapState);
  assert.deepEqual(deps.model, state.model);
  assert.equal(deps.readSelectValue("capability-install-target"), "home_page_route");
  deps.setSelectedValue("capability-install-target", "admin_page_route");
  assert.equal(targetSelect.value, "admin_page_route");
  deps.setSelectedValue("capability-install-target", "missing");
  assert.equal(targetSelect.value, "admin_page_route");
  deps.setSubmitDisabled("capability-install-form", true);
  assert.equal(button.disabled, true);
  deps.fillSelect("capability-install-target", [{ value: "admin_page_route" }]);
  deps.setStatus("capability-install-help", "Install ok.");
  assert.deepEqual(fillCalls, [["capability-install-target", ["admin_page_route"]]]);
  assert.deepEqual(statusCalls, [["capability-install-help", "Install ok."]]);

  const directDeps = buildBootstrapCapabilityControlsSyncDeps({
    liveState,
    dom: {
      byId: id => nodes.get(id) || null
    }
  });
  assert.equal(directDeps.readSelectValue("capability-install-target"), "admin_page_route");

  const factory = renderBootstrapCapabilityControlsSyncFactory();
  assert.equal(factory.includes("const capabilityTargetRowsFor ="), true);
  assert.equal(factory.includes("const capabilityTargetLabel ="), true);
  assert.equal(factory.includes("const firstMatchingValue ="), true);
  assert.equal(factory.includes("const buildBootstrapCapabilityBaseSelectView ="), true);
  assert.equal(factory.includes("const applyBootstrapCapabilityBaseSelectView ="), true);
  assert.equal(factory.includes("const buildBootstrapCapabilityControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapCapabilityControlsView ="), true);
  assert.equal(factory.includes("const syncBootstrapCapabilityControlsState ="), true);
  assert.equal(factory.includes("const runBootstrapCapabilityControlsSync ="), true);
  assert.equal(factory.includes("const runBootstrapCapabilityControlsRender ="), true);
  assert.equal(factory.includes("const createBootstrapCapabilityControlsRuntime ="), true);
  assert.equal(factory.includes("const createBootstrapCapabilityControlsRuntimeFromBootstrap ="), true);
  assert.equal(factory.includes("const bindBootstrapCapabilityControlsSync ="), true);
  assert.equal(factory.includes("const buildBootstrapCapabilityControlsSyncDeps ="), true);
  assert.equal(factory.includes("const createBootstrapCapabilityControlsSyncDepsBuilder ="), true);
});

test("capability runtime seam owns dep-builder construction for bind and render", () => {
  const listeners = new Map();
  const calls = [];
  const targetSelect = {
    value: "home_page_route",
    options: [{ value: "home_page_route" }]
  };
  const target = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    }
  };
  const nodes = new Map([
    ["capability-install-target", targetSelect],
    ["capability-install-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return { disabled: false };
        return null;
      }
    }]
  ]);
  const state = {
    bootstrapState: {
      contexts: [{ id: "ctx.docs" }],
      capabilityCatalog: [{
        id: "notes.sidebar",
        placement: ["routePage"],
        capabilitySourceState: "both"
      }],
      capabilityInstalls: []
    },
    model: {
      capabilityTargetKinds: ["routePage"],
      capabilityTargets: {
        routePages: [{ id: "home_page_route", path: "/home" }]
      }
    }
  };
  const runtime = createBootstrapCapabilityControlsRuntime({
    target,
    liveState: {
      authored: () => state.bootstrapState || {},
      model: () => state.model || {}
    },
    dom: {
      byId: id => nodes.get(id) || null,
      readSelectValue: id => ({
        "capability-context": "ctx.docs",
        "capability-install-capability": "notes.sidebar",
        "capability-remove-capability": "notes.sidebar",
        "capability-install-kind": "routePage",
        "capability-remove-kind": "routePage",
        "capability-install-target": "home_page_route"
      }[id] || ""),
      fillSelect(id, rows) {
        calls.push(["fillSelect", id, rows.map(row => row.value)]);
      },
      setSelectedValue(id, value) {
        calls.push(["setSelectedValue", id, value]);
      },
      setStatus(id, value) {
        calls.push(["setStatus", id, value]);
      },
      setSubmitDisabled(id, value) {
        calls.push(["setSubmitDisabled", id, value]);
      }
    }
  });

  runtime.bind();
  const renderResult = runtime.render();
  assert.equal(renderResult.handled, true);
  assert.equal(listeners.has("witness:bootstrap-capability-controls-sync"), true);
  assert.equal(calls.some(call => call[0] === "fillSelect" && call[1] === "capability-context"), true);
  assert.equal(calls.some(call => call[0] === "setStatus" && call[1] === "capability-install-help"), true);
});

test("capability bootstrap runtime-construction seam can resolve browser globals while building live readers and DOM helpers", () => {
  const listeners = new Map();
  const createButton = { disabled: false };
  const targetSelect = createSelectNode("home_page_route", ["home_page_route"]);
  const originalOption = globalThis.Option;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.Option = function Option(label, value) {
    return { label, value };
  };
  const nodes = new Map([
    ["capability-context", createSelectNode("ctx.docs", ["ctx.docs"])],
    ["capability-install-capability", createSelectNode("notes.sidebar", ["notes.sidebar"])],
    ["capability-remove-capability", createSelectNode("notes.sidebar", ["notes.sidebar"])],
    ["capability-install-kind", createSelectNode("routePage", ["routePage"])],
    ["capability-remove-kind", createSelectNode("routePage", ["routePage"])],
    ["capability-install-target", targetSelect],
    ["capability-remove-target", createSelectNode("home_page_route", ["home_page_route"])],
    ["capability-install-help", { textContent: "" }],
    ["capability-remove-help", { textContent: "" }],
    ["capability-install-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return createButton;
        return null;
      }
    }],
    ["capability-remove-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return { disabled: false };
        return null;
      }
    }]
  ]);
  const target = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    }
  };
  const state = {
    bootstrapState: {
      contexts: [{ id: "ctx.docs" }],
      capabilityCatalog: [{
        id: "notes.sidebar",
        placement: ["routePage"],
        capabilitySourceState: "both"
      }],
      capabilityInstalls: []
    },
    model: {
      capabilityTargetKinds: ["routePage"],
      capabilityTargets: {
        routePages: [{ id: "home_page_route", path: "/home" }]
      }
    }
  };
  const document = {
    getElementById(id) {
      return nodes.get(id) || null;
    }
  };
  globalThis.window = target;
  globalThis.document = document;
  const runtime = createBootstrapCapabilityControlsRuntimeFromBootstrap({ state });

  try {
    runtime.bind();
    const renderResult = runtime.render();

    assert.equal(renderResult.handled, true);
    assert.equal(listeners.has("witness:bootstrap-capability-controls-sync"), true);
    assert.equal(nodes.get("capability-install-help").textContent.includes("supports placements: routePage"), true);
    assert.equal(createButton.disabled, false);

    nodes.set("capability-install-target", createSelectNode("home_page_route", ["home_page_route"]));
    const originalHelp = nodes.get("capability-install-help").textContent;
    state.model = {
      capabilityTargetKinds: ["routePage"],
      capabilityTargets: {
        routePages: [{ id: "admin_page_route", path: "/admin" }]
      }
    };
    listeners.get("witness:bootstrap-capability-controls-sync")({
      detail: {
        source: "bootstrap-capability-controls",
        family: "capability-install",
        trigger: "kind"
      }
    });
    assert.notEqual(nodes.get("capability-install-help").textContent, originalHelp);
    assert.equal(nodes.get("capability-install-target").value, "admin_page_route");
  } finally {
    globalThis.Option = originalOption;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test("capability sync binding reacts only to authored capability trigger events", () => {
  const listeners = new Map();
  const families = [];
  const target = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    }
  };

  bindBootstrapCapabilityControlsSync({
    target,
    buildDeps: () => ({
      authored: {
        capabilityCatalog: [{ id: "notes.sidebar", placement: ["routePage"] }],
        capabilityInstalls: []
      },
      model: {
        capabilityTargets: {
          routePages: [{ id: "home_page_route", path: "/home" }]
        }
      },
      readSelectValue: id => {
        families.push(id);
        return ({
          "capability-install-capability": "notes.sidebar",
          "capability-install-kind": "routePage",
          "capability-install-target": "home_page_route"
        }[id] || "");
      }
    })
  });

  listeners.get("witness:bootstrap-capability-controls-sync")({ detail: { source: "not-bootstrap", family: "capability-install" } });
  assert.deepEqual(families, []);

  listeners.get("witness:bootstrap-capability-controls-sync")({ detail: { source: "bootstrap-capability-controls", family: "capability-install", trigger: "capability" } });
  assert.equal(families.includes("capability-install-capability"), true);
  assert.equal(families.includes("capability-install-kind"), true);
  assert.equal(families.includes("capability-install-target"), true);

  const afterInstall = families.length;
  listeners.get("witness:bootstrap-capability-controls-sync")({ detail: { source: "bootstrap-remove-controls", family: "capability-remove", trigger: "target" } });
  assert.ok(families.length > afterInstall);
});
