import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapProposalAdjacentControlsState,
  bindBootstrapProposalAdjacentSync,
  buildBootstrapProposalAdjacentSyncDeps,
  createBootstrapProposalAdjacentSyncDepsBuilder,
  createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap,
  createBootstrapProposalAdjacentSyncHandler,
  renderBootstrapProposalAdjacentSyncFactory,
  runBootstrapProposalAdjacentSync,
  syncBootstrapProposalAdjacentControlsState
} from "./bootstrap-proposal-adjacent-sync.js";

function createProposalAdjacentHarness() {
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

class FakeOption {
  constructor(label, value) {
    this.label = label;
    this.text = label;
    this.value = value;
  }
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

test("proposal-adjacent state sync builds runtime plugin install view and apply uses shared control application", () => {
  const harness = createProposalAdjacentHarness();

  const view = syncBootstrapProposalAdjacentControlsState({
    family: "runtime-plugin-install",
    existingView: {},
    authored: { identities: [], serverRunners: [{ id: "demo_server" }] },
    runtimeProfile: "minimal",
    readSelectValue: id => {
      if (id === "runtime-plugin-install-proposal-runner") return "demo_server";
      if (id === "runtime-plugin-install-proposal-plugin") return "plugin.demo";
      return "";
    },
    buildServerRunnerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildRuntimePluginInstallOptions: () => [{ value: "plugin.demo", label: "plugin.demo" }],
    buildRuntimePluginControlView: () => ({ helpText: "Installable on minimal.", submitDisabled: false }),
    runtimePluginAvailabilityForRunner: () => [{ plugin: "plugin.demo" }],
    runtimePluginAvailabilityRow: () => ({ plugin: "plugin.demo" })
  });

  assert.equal(view.runtimePluginInstall.selectedRunnerId, "demo_server");
  assert.equal(view.runtimePluginInstall.selectedPluginId, "plugin.demo");
  assert.equal(view.runtimePluginInstall.helpText, "Installable on minimal.");

  applyBootstrapProposalAdjacentControlsState({
    family: "runtime-plugin-install",
    view,
    authored: { identities: [] },
    session: { authenticated: true },
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.deepEqual(harness.calls, [
    ["fillSelect", "runtime-plugin-install-proposal-runner", ["demo_server"]],
    ["setSelectedValue", "runtime-plugin-install-proposal-runner", "demo_server"],
    ["fillSelect", "runtime-plugin-install-proposal-plugin", ["plugin.demo"]],
    ["setSelectedValue", "runtime-plugin-install-proposal-plugin", "plugin.demo"],
    ["setStatus", "runtime-plugin-install-proposal-help", "Installable on minimal."],
    ["setSubmitDisabled", "runtime-plugin-install-proposal-form", false]
  ]);
});

test("proposal-adjacent sync helper recomputes and applies MCP tool install state through the shared seam", () => {
  const harness = createProposalAdjacentHarness();

  const result = runBootstrapProposalAdjacentSync({
    detail: { family: "mcp-tool-install", trigger: "server" },
    existingView: {},
    authored: {
      identities: [{ id: "identity.aaron" }],
      mcpServers: [{ id: "notes", tools: [{ tool: "notes.search" }] }]
    },
    session: { authenticated: false },
    supportedMcpActingModes: ["delegated", "service"],
    readSelectValue: id => {
      if (id === "mcp-tool-install-proposal-server") return "notes";
      if (id === "mcp-tool-install-proposal-tool") return "notes.write";
      if (id === "mcp-tool-install-proposal-acting-mode") return "service";
      return "";
    },
    buildMcpServerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildMcpToolInstallOptions: () => [{ value: "notes.write", label: "notes.write" }],
    buildMcpToolInstallControlView: () => ({ helpText: "Service identity required for service mode.", submitDisabled: true }),
    mcpSupportedTools: () => [{ name: "notes.write" }],
    mcpInstalledToolsForServer: () => [{ tool: "notes.search" }],
    mcpServerRow: () => ({ id: "notes" }),
    mcpSupportedToolRow: () => ({ name: "notes.write" }),
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.equal(result.handled, true);
  assert.equal(result.view.mcpToolInstall.selectedServerId, "notes");
  assert.equal(result.view.mcpToolInstall.selectedToolId, "notes.write");
  assert.equal(result.view.mcpToolInstall.selectedActingMode, "service");
  assert.deepEqual(harness.calls, [
    ["fillSelect", "mcp-tool-install-proposal-server", ["notes"]],
    ["setSelectedValue", "mcp-tool-install-proposal-server", "notes"],
    ["fillSelect", "mcp-tool-install-proposal-tool", ["notes.write"]],
    ["setSelectedValue", "mcp-tool-install-proposal-tool", "notes.write"],
    ["fillSelect", "mcp-tool-install-proposal-acting-mode", ["delegated", "service"]],
    ["setSelectedValue", "mcp-tool-install-proposal-acting-mode", "service"],
    ["setStatus", "mcp-tool-install-proposal-help", "Service identity required for service mode."],
    ["setSubmitDisabled", "mcp-tool-install-proposal-form", true]
  ]);
});

test("proposal-adjacent sync helper supports full refresh without event detail", () => {
  const harness = createProposalAdjacentHarness();

  const result = runBootstrapProposalAdjacentSync({
    authored: {
      identities: [],
      serverRunners: [{ id: "runner-a" }],
      contexts: [{ id: "ctx-a" }],
      mcpServers: [{ id: "server-a", tools: [{ tool: "tool.installed" }] }]
    },
    session: { authenticated: true },
    runtimeProfile: "full",
    supportedMcpActingModes: ["delegated", "service"],
    readSelectValue: id => ({
      "runtime-plugin-install-proposal-runner": "runner-a",
      "runtime-plugin-install-proposal-plugin": "plugin-a",
      "runtime-plugin-remove-proposal-runner": "runner-a",
      "runtime-plugin-remove-proposal-plugin": "plugin-a",
      "mcp-server-proposal-runner": "runner-a",
      "mcp-server-proposal-context": "ctx-a",
      "mcp-tool-install-proposal-server": "server-a",
      "mcp-tool-install-proposal-tool": "tool.next",
      "mcp-tool-install-proposal-acting-mode": "service",
      "mcp-tool-remove-proposal-server": "server-a",
      "mcp-tool-remove-proposal-tool": "tool.installed"
    }[id] || ""),
    readFieldValue: (formId, fieldName) => (
      formId === "mcp-server-proposal-form" && fieldName === "serviceIdentity" ? "svc-a" :
      formId === "mcp-server-proposal-form" && fieldName === "transportsJson" ? "[\"http\"]" :
      ""
    ),
    buildServerRunnerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildMcpServerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildRuntimePluginInstallOptions: () => [{ value: "plugin-a", label: "plugin-a" }],
    buildRuntimePluginRemoveOptions: () => [{ value: "plugin-a", label: "plugin-a" }],
    buildRuntimePluginControlView: ({ requireInstalled = false }) => ({
      helpText: requireInstalled ? "Remove plugin-a." : "Install plugin-a.",
      submitDisabled: false
    }),
    buildMcpServerControlView: () => ({ helpText: "Server ok.", submitDisabled: false }),
    buildMcpToolInstallOptions: () => [{ value: "tool.next", label: "tool.next" }],
    buildMcpToolRemoveOptions: () => [{ value: "tool.installed", label: "tool.installed" }],
    buildMcpToolInstallControlView: () => ({ helpText: "Install tool.next.", submitDisabled: false }),
    buildMcpToolRemoveControlView: () => ({ helpText: "Remove tool.installed.", submitDisabled: false }),
    runtimePluginAvailabilityForRunner: () => [{ plugin: "plugin-a" }],
    runtimePluginAvailabilityRow: () => ({ plugin: "plugin-a" }),
    mcpSupportedTools: () => [{ name: "tool.next" }, { name: "tool.installed" }],
    mcpInstalledToolsForServer: () => [{ tool: "tool.installed" }],
    mcpServerRow: () => ({ id: "server-a", serviceIdentity: "svc-a" }),
    mcpSupportedToolRow: toolId => ({ name: toolId }),
    mcpScopeSummary: () => "scoped",
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.equal(result.handled, true);
  assert.equal(result.view.runtimePluginInstall.selectedPluginId, "plugin-a");
  assert.equal(result.view.mcpServer.selectedContextId, "ctx-a");
  assert.equal(result.view.mcpToolInstall.selectedToolId, "tool.next");
  assert.equal(result.view.mcpToolRemove.selectedToolId, "tool.installed");
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "runtime-plugin-install-proposal-runner"), true);
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "mcp-server-proposal-context"), true);
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "mcp-tool-remove-proposal-tool"), true);
});

test("proposal-adjacent sync helper returns false for unsupported families and exposes sync/apply factory seam", () => {
  assert.deepEqual(runBootstrapProposalAdjacentSync({
    detail: { family: "unknown", trigger: "none" }
  }), { handled: false, view: {} });
  const created = createBootstrapProposalAdjacentSyncHandler();
  assert.deepEqual(created({ detail: { source: "other", family: "runtime-plugin-install" } }), { handled: false, view: {} });
  const factory = renderBootstrapProposalAdjacentSyncFactory();
  assert.equal(factory.includes("const syncBootstrapProposalAdjacentControlsState ="), true);
  assert.equal(factory.includes("const applyBootstrapProposalAdjacentControlsState ="), true);
  assert.equal(factory.includes("const runBootstrapProposalAdjacentSync ="), true);
  assert.equal(factory.includes("const buildBootstrapProposalAdjacentSyncDeps ="), true);
  assert.equal(factory.includes("const createBootstrapProposalAdjacentSyncDepsBuilder ="), true);
  assert.equal(factory.includes("const createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap ="), true);
  assert.equal(factory.includes("const createBootstrapProposalAdjacentSyncHandler ="), true);
  assert.equal(factory.includes("const bindBootstrapProposalAdjacentSync ="), true);
});

test("proposal-adjacent sync deps builder resolves state and DOM adapters at event time", () => {
  const runnerSelect = {
    value: "runner.next",
    options: [{ value: "runner.current" }, { value: "runner.next" }]
  };
  const pluginSelect = {
    value: "plugin.demo",
    options: [{ value: "plugin.demo" }, { value: "plugin.alt" }]
  };
  const mcpForm = {
    fields: {
      serviceIdentity: { value: "identity.demo" },
      transportsJson: { value: "[\"stdio\"]" }
    },
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return this.button;
      return null;
    },
    button: { disabled: false }
  };
  const statusCalls = [];
  const fillCalls = [];
  const nodes = new Map([
    ["runtime-plugin-install-proposal-runner", runnerSelect],
    ["runtime-plugin-install-proposal-plugin", pluginSelect],
    ["mcp-server-proposal-form", mcpForm],
    ["runtime-plugin-install-proposal-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return this.button;
        return null;
      },
      button: { disabled: false }
    }]
  ]);
  const state = {
    bootstrapState: { identities: [] },
    session: { authenticated: false },
    model: { runtimeProfile: "minimal", supportedMcpActingModes: ["delegated"] }
  };
  const liveState = {
    authored: () => state.bootstrapState || {},
    session: () => state.session || {},
    model: () => state.model || {},
    runtimeProfile: () => state.model?.runtimeProfile || "full",
    supportedMcpActingModes: () => state.model?.supportedMcpActingModes || [],
    runtimeIntegrationState: () => ({
      runtimePluginAvailabilityForRunner: () => [],
      runtimePluginAvailabilityRow: () => null,
      mcpSupportedTools: () => [],
      mcpInstalledToolsForServer: () => [],
      mcpServerRow: () => null,
      mcpSupportedToolRow: () => null,
      mcpScopeSummary: () => "unscoped"
    })
  };
  const buildDeps = createBootstrapProposalAdjacentSyncDepsBuilder({
    liveState,
    dom: {
      byId: id => nodes.get(id) || null,
      formField: (form, fieldName) => form?.fields?.[fieldName] || null,
      fillSelect(id, rows) {
        fillCalls.push([id, rows.map(row => row.value)]);
      },
      setStatus(id, value) {
        statusCalls.push([id, value]);
      }
    },
    buildServerRunnerOptions: rows => rows
  });

  state.bootstrapState = { identities: [{ id: "identity.aaron" }] };
  state.session = { authenticated: true };
  state.model = { runtimeProfile: "full", supportedMcpActingModes: ["delegated", "service"] };
  runnerSelect.value = "runner.current";

  const deps = buildDeps();
  assert.deepEqual(deps.authored, { identities: [{ id: "identity.aaron" }] });
  assert.deepEqual(deps.session, { authenticated: true });
  assert.equal(deps.runtimeProfile, "full");
  assert.deepEqual(deps.supportedMcpActingModes, ["delegated", "service"]);
  assert.equal(deps.readSelectValue("runtime-plugin-install-proposal-runner"), "runner.current");
  assert.equal(deps.readFieldValue("mcp-server-proposal-form", "serviceIdentity"), "identity.demo");
  deps.setSelectedValue("runtime-plugin-install-proposal-runner", "runner.next");
  assert.equal(runnerSelect.value, "runner.next");
  deps.setSelectedValue("runtime-plugin-install-proposal-runner", "runner.missing");
  assert.equal(runnerSelect.value, "runner.next");
  deps.setSubmitDisabled("runtime-plugin-install-proposal-form", true);
  assert.equal(nodes.get("runtime-plugin-install-proposal-form").button.disabled, true);
  deps.fillSelect("runtime-plugin-install-proposal-plugin", [{ value: "plugin.demo" }]);
  deps.setStatus("runtime-plugin-install-proposal-help", "Installable on full.");
  assert.deepEqual(fillCalls, [["runtime-plugin-install-proposal-plugin", ["plugin.demo"]]]);
  assert.deepEqual(statusCalls, [["runtime-plugin-install-proposal-help", "Installable on full."]]);
});

test("proposal-adjacent bootstrap dep-builder seam resolves browser globals and live state from bootstrap state", () => {
  withDomGlobals(() => {
    const previousDocument = globalThis.document;
    const runnerSelect = {
      value: "runner.current",
      options: [{ value: "runner.current" }, { value: "runner.next" }],
      append(option) {
        this.options.push(option);
      },
      set innerHTML(value) {
        this._innerHTML = value;
        if (value === "") this.options = [];
      }
    };
    const pluginSelect = {
      value: "plugin.demo",
      options: [{ value: "plugin.demo" }],
      append(option) {
        this.options.push(option);
      },
      set innerHTML(value) {
        this._innerHTML = value;
        if (value === "") this.options = [];
      }
    };
    const statusNode = { textContent: "" };
    const button = { disabled: false };
    const form = {
      elements: {
        namedItem(name) {
          return form.fields[name] || null;
        }
      },
      fields: {
        serviceIdentity: { value: "identity.demo" }
      },
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return button;
        if (selector === '[name="serviceIdentity"]') return this.fields.serviceIdentity;
        return null;
      }
    };
    const nodes = new Map([
      ["runtime-plugin-install-proposal-runner", runnerSelect],
      ["runtime-plugin-install-proposal-plugin", pluginSelect],
      ["runtime-plugin-install-proposal-help", statusNode],
      ["runtime-plugin-install-proposal-form", {
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return button;
          return null;
        }
      }],
      ["mcp-server-proposal-form", form]
    ]);
    globalThis.document = {
      getElementById(id) {
        return nodes.get(id) || null;
      }
    };
    const state = {
      bootstrapState: { identities: [] },
      session: { authenticated: false },
      model: { runtimeProfile: "minimal", supportedMcpActingModes: ["delegated"] }
    };

    try {
      const buildDeps = createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap({ state });
      state.bootstrapState = { identities: [{ id: "identity.aaron" }] };
      state.session = { authenticated: true };
      state.model = { runtimeProfile: "full", supportedMcpActingModes: ["delegated", "service"] };

      const deps = buildDeps();
      assert.deepEqual(deps.authored, { identities: [{ id: "identity.aaron" }] });
      assert.deepEqual(deps.session, { authenticated: true });
      assert.equal(deps.runtimeProfile, "full");
      assert.deepEqual(deps.supportedMcpActingModes, ["delegated", "service"]);
      assert.equal(deps.readSelectValue("runtime-plugin-install-proposal-runner"), "runner.current");
      assert.equal(deps.readFieldValue("mcp-server-proposal-form", "serviceIdentity"), "identity.demo");
      deps.setSelectedValue("runtime-plugin-install-proposal-runner", "runner.next");
      assert.equal(runnerSelect.value, "runner.next");
      deps.fillSelect("runtime-plugin-install-proposal-plugin", [{ value: "plugin.alt", label: "plugin.alt" }], row => row.value, row => row.label, { includeBlank: false });
      assert.deepEqual(pluginSelect.options.map(option => option.value), ["plugin.alt"]);
      deps.setStatus("runtime-plugin-install-proposal-help", "Installable on full.");
      assert.equal(statusNode.textContent, "Installable on full.");
      deps.setSubmitDisabled("runtime-plugin-install-proposal-form", true);
      assert.equal(button.disabled, true);
    } finally {
      globalThis.document = previousDocument;
    }
  });
});

test("proposal-adjacent sync binding registers one listener and routes through the shared handler", () => {
  const calls = [];
  const target = {
    addEventListener(eventName, handler) {
      calls.push(["addEventListener", eventName, typeof handler]);
      this.handler = handler;
    }
  };

  bindBootstrapProposalAdjacentSync({
    target,
    authored: { identities: [], serverRunners: [{ id: "demo_server" }] },
    session: { authenticated: true },
    runtimeProfile: "minimal",
    readSelectValue: id => {
      if (id === "runtime-plugin-install-proposal-runner") return "demo_server";
      if (id === "runtime-plugin-install-proposal-plugin") return "plugin.demo";
      return "";
    },
    buildServerRunnerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildRuntimePluginInstallOptions: () => [{ value: "plugin.demo", label: "plugin.demo" }],
    buildRuntimePluginControlView: () => ({ helpText: "Installable on minimal.", submitDisabled: false }),
    runtimePluginAvailabilityForRunner: () => [{ plugin: "plugin.demo" }],
    runtimePluginAvailabilityRow: () => ({ plugin: "plugin.demo" }),
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
  });

  assert.deepEqual(calls[0], ["addEventListener", "witness:bootstrap-proposal-adjacent-sync", "function"]);
  const result = target.handler({ detail: { source: "bootstrap-proposal-adjacent-controls", family: "runtime-plugin-install" } });
  assert.equal(result.handled, true);
  assert.deepEqual(calls.slice(1), [
    ["fillSelect", "runtime-plugin-install-proposal-runner", ["demo_server"]],
    ["setSelectedValue", "runtime-plugin-install-proposal-runner", "demo_server"],
    ["fillSelect", "runtime-plugin-install-proposal-plugin", ["plugin.demo"]],
    ["setSelectedValue", "runtime-plugin-install-proposal-plugin", "plugin.demo"],
    ["setStatus", "runtime-plugin-install-proposal-help", "Installable on minimal."],
    ["setSubmitDisabled", "runtime-plugin-install-proposal-form", false]
  ]);
});

test("proposal-adjacent sync dep builder exposes the shared live dependency packet directly", () => {
  const button = { disabled: false };
  const nodes = new Map([
    ["runtime-plugin-install-proposal-runner", { value: "demo_server", options: [{ value: "demo_server" }] }],
    ["runtime-plugin-install-proposal-plugin", { value: "plugin.demo", options: [{ value: "plugin.demo" }] }],
    ["runtime-plugin-install-proposal-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return button;
        return null;
      }
    }]
  ]);
  const deps = buildBootstrapProposalAdjacentSyncDeps({
    liveState: {
      authored: () => ({ identities: [] }),
      session: () => ({ authenticated: true }),
      model: () => ({ runtimeProfile: "minimal", supportedMcpActingModes: ["delegated"] }),
      runtimeProfile: () => "minimal",
      supportedMcpActingModes: () => ["delegated"],
      runtimeIntegrationState: () => ({
        runtimePluginAvailabilityForRunner: () => [],
        runtimePluginAvailabilityRow: () => null,
        mcpSupportedTools: () => [],
        mcpInstalledToolsForServer: () => [],
        mcpServerRow: () => null,
        mcpSupportedToolRow: () => null,
        mcpScopeSummary: () => "unscoped"
      })
    },
    dom: {
      byId: id => nodes.get(id) || null,
      setStatus() {}
    }
  });
  assert.equal(deps.readSelectValue("runtime-plugin-install-proposal-runner"), "demo_server");
  deps.setSubmitDisabled("runtime-plugin-install-proposal-form", true);
  assert.equal(button.disabled, true);
});
