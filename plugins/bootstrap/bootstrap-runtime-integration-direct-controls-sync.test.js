import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapRuntimeIntegrationDirectControlsView,
  buildBootstrapRuntimeIntegrationDirectControlsSyncDeps,
  bindBootstrapRuntimeIntegrationDirectControlsSync,
  createBootstrapRuntimeIntegrationDirectControlsSyncHandler,
  createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder,
  renderBootstrapRuntimeIntegrationDirectControlsSyncFactory,
  runBootstrapRuntimeIntegrationDirectControlsSync,
  syncBootstrapRuntimeIntegrationDirectControlsState
} from "./bootstrap-runtime-integration-direct-controls-sync.js";

function createDirectControlsHarness() {
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

test("direct runtime integration sync builds runtime plugin install view, preserves other families, and applies through the shared seam", () => {
  const harness = createDirectControlsHarness();

  const view = syncBootstrapRuntimeIntegrationDirectControlsState({
    family: "runtime-plugin-install",
    existingView: {
      runtimePluginRemove: { stale: false },
      mcpToolRemove: { selectedToolId: "keep.me" }
    },
    authored: { serverRunners: [{ id: "demo_server" }] },
    runtimeProfile: "minimal",
    readSelectValue: id => {
      if (id === "runtime-plugin-install-runner") return "demo_server";
      if (id === "runtime-plugin-install-plugin") return "plugin.demo";
      return "";
    },
    buildServerRunnerOptionsFn: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildRuntimePluginInstallOptionsFn: () => [{ value: "plugin.demo", label: "plugin.demo" }],
    buildRuntimePluginControlViewFn: () => ({ helpText: "Installable on minimal.", submitDisabled: false }),
    runtimePluginAvailabilityForRunner: () => [{ plugin: "plugin.demo" }],
    runtimePluginAvailabilityRow: () => ({ plugin: "plugin.demo" })
  });

  assert.equal(view.runtimePluginInstall.selectedRunnerId, "demo_server");
  assert.equal(view.runtimePluginInstall.selectedPluginId, "plugin.demo");
  assert.equal(view.runtimePluginInstall.helpText, "Installable on minimal.");
  assert.deepEqual(view.mcpToolRemove, { selectedToolId: "keep.me" });

  applyBootstrapRuntimeIntegrationDirectControlsView({
    family: "runtime-plugin-install",
    view,
    fillSelect: harness.fillSelect,
    setSelectedValue: harness.setSelectedValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.deepEqual(harness.calls, [
    ["fillSelect", "runtime-plugin-install-runner", ["demo_server"]],
    ["setSelectedValue", "runtime-plugin-install-runner", "demo_server"],
    ["fillSelect", "runtime-plugin-install-plugin", ["plugin.demo"]],
    ["setSelectedValue", "runtime-plugin-install-plugin", "plugin.demo"],
    ["setStatus", "runtime-plugin-install-help", "Installable on minimal."],
    ["setSubmitDisabled", "runtime-plugin-install-form", false]
  ]);
});

test("direct runtime integration sync helper recomputes and applies MCP tool install state through the shared seam", () => {
  const harness = createDirectControlsHarness();

  const result = runBootstrapRuntimeIntegrationDirectControlsSync({
    family: "mcp-tool-install",
    existingView: {},
    authored: {
      mcpServers: [{ id: "notes", tools: [{ tool: "notes.search" }] }]
    },
    supportedMcpActingModes: ["delegated", "service"],
    readSelectValue: id => {
      if (id === "mcp-tool-install-server") return "notes";
      if (id === "mcp-tool-install-tool") return "notes.write";
      if (id === "mcp-tool-install-acting-mode") return "service";
      return "";
    },
    buildMcpServerOptionsFn: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildMcpToolInstallOptionsFn: () => [{ value: "notes.write", label: "notes.write" }],
    buildMcpToolInstallControlViewFn: () => ({ helpText: "Service identity required for service mode.", submitDisabled: true }),
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
    ["fillSelect", "mcp-tool-install-server", ["notes"]],
    ["setSelectedValue", "mcp-tool-install-server", "notes"],
    ["fillSelect", "mcp-tool-install-tool", ["notes.write"]],
    ["setSelectedValue", "mcp-tool-install-tool", "notes.write"],
    ["fillSelect", "mcp-tool-install-acting-mode", ["delegated", "service"]],
    ["setSelectedValue", "mcp-tool-install-acting-mode", "service"],
    ["setStatus", "mcp-tool-install-help", "Service identity required for service mode."],
    ["setSubmitDisabled", "mcp-tool-install-form", true]
  ]);
});

test("direct runtime integration sync helper supports full refresh without a family", () => {
  const harness = createDirectControlsHarness();

  const result = runBootstrapRuntimeIntegrationDirectControlsSync({
    authored: {
      serverRunners: [{ id: "runner-a" }],
      contexts: [{ id: "ctx-a" }],
      mcpServers: [{ id: "server-a", tools: [{ tool: "tool.installed" }] }]
    },
    runtimeProfile: "full",
    supportedMcpActingModes: ["delegated", "service"],
    readSelectValue: id => ({
      "runtime-plugin-install-runner": "runner-a",
      "runtime-plugin-install-plugin": "plugin-a",
      "runtime-plugin-remove-runner": "runner-a",
      "runtime-plugin-remove-plugin": "plugin-a",
      "mcp-server-runner": "runner-a",
      "mcp-server-context": "ctx-a",
      "mcp-tool-install-server": "server-a",
      "mcp-tool-install-tool": "tool.next",
      "mcp-tool-install-acting-mode": "service",
      "mcp-tool-remove-server": "server-a",
      "mcp-tool-remove-tool": "tool.installed"
    }[id] || ""),
    readFieldValue: (formId, fieldName) => (
      formId === "mcp-server-form" && fieldName === "serviceIdentity" ? "svc-a" :
      formId === "mcp-server-form" && fieldName === "transportsJson" ? "[\"http\"]" :
      ""
    ),
    buildServerRunnerOptionsFn: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildMcpServerOptionsFn: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildRuntimePluginInstallOptionsFn: () => [{ value: "plugin-a", label: "plugin-a" }],
    buildRuntimePluginRemoveOptionsFn: () => [{ value: "plugin-a", label: "plugin-a" }],
    buildRuntimePluginControlViewFn: ({ requireInstalled = false }) => ({
      helpText: requireInstalled ? "Remove plugin-a." : "Install plugin-a.",
      submitDisabled: false
    }),
    buildMcpServerControlViewFn: () => ({ helpText: "Server ok.", submitDisabled: false }),
    buildMcpToolInstallOptionsFn: () => [{ value: "tool.next", label: "tool.next" }],
    buildMcpToolRemoveOptionsFn: () => [{ value: "tool.installed", label: "tool.installed" }],
    buildMcpToolInstallControlViewFn: () => ({ helpText: "Install tool.next.", submitDisabled: false }),
    buildMcpToolRemoveControlViewFn: () => ({ helpText: "Remove tool.installed.", submitDisabled: false }),
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
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "runtime-plugin-install-runner"), true);
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "mcp-server-context"), true);
  assert.equal(harness.calls.some(call => call[0] === "fillSelect" && call[1] === "mcp-tool-remove-tool"), true);
});

test("direct runtime integration deps builder keeps state and DOM reads live at event time and exposes the factory seam", () => {
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
    ["runtime-plugin-install-runner", runnerSelect],
    ["runtime-plugin-install-plugin", pluginSelect],
    ["mcp-server-form", mcpForm],
    ["runtime-plugin-install-form", {
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return this.button;
        return null;
      },
      button: { disabled: false }
    }]
  ]);
  const state = {
    bootstrapState: { serverRunners: [{ id: "runner.current" }] },
    model: { runtimeProfile: "minimal", supportedMcpActingModes: ["delegated"] }
  };
  const liveState = {
    authored: () => state.bootstrapState || {},
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
  const buildDeps = createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder({
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
    }
  });

  state.bootstrapState = { serverRunners: [{ id: "runner.next" }] };
  state.model = { runtimeProfile: "full", supportedMcpActingModes: ["delegated", "service"] };
  runnerSelect.value = "runner.current";

  const deps = buildDeps();
  assert.deepEqual(deps.authored, { serverRunners: [{ id: "runner.next" }] });
  assert.equal(deps.runtimeProfile, "full");
  assert.deepEqual(deps.supportedMcpActingModes, ["delegated", "service"]);
  assert.equal(deps.readSelectValue("runtime-plugin-install-runner"), "runner.current");
  assert.equal(deps.readFieldValue("mcp-server-form", "serviceIdentity"), "identity.demo");
  deps.setSelectedValue("runtime-plugin-install-runner", "runner.next");
  assert.equal(runnerSelect.value, "runner.next");
  deps.setSelectedValue("runtime-plugin-install-runner", "runner.missing");
  assert.equal(runnerSelect.value, "runner.next");
  deps.setSubmitDisabled("runtime-plugin-install-form", true);
  assert.equal(nodes.get("runtime-plugin-install-form").button.disabled, true);
  deps.fillSelect("runtime-plugin-install-plugin", [{ value: "plugin.demo" }]);
  deps.setStatus("runtime-plugin-install-help", "Installable on full.");
  assert.deepEqual(fillCalls, [["runtime-plugin-install-plugin", ["plugin.demo"]]]);
  assert.deepEqual(statusCalls, [["runtime-plugin-install-help", "Installable on full."]]);

  const directDeps = buildBootstrapRuntimeIntegrationDirectControlsSyncDeps({
    liveState,
    dom: {
      byId: id => nodes.get(id) || null,
      formField: (form, fieldName) => form?.fields?.[fieldName] || null
    }
  });
  assert.equal(directDeps.readSelectValue("runtime-plugin-install-runner"), "runner.next");

  const factory = renderBootstrapRuntimeIntegrationDirectControlsSyncFactory();
  assert.equal(factory.includes("const buildBootstrapRuntimeIntegrationDirectControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapRuntimeIntegrationDirectControlsView ="), true);
  assert.equal(factory.includes("const syncBootstrapRuntimeIntegrationDirectControlsState ="), true);
  assert.equal(factory.includes("const runBootstrapRuntimeIntegrationDirectControlsSync ="), true);
  assert.equal(factory.includes("const createBootstrapRuntimeIntegrationDirectControlsSyncHandler ="), true);
  assert.equal(factory.includes("const bindBootstrapRuntimeIntegrationDirectControlsSync ="), true);
  assert.equal(factory.includes("const buildBootstrapRuntimeIntegrationDirectControlsSyncDeps ="), true);
  assert.equal(factory.includes("const createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder ="), true);
});

test("direct runtime integration sync bridge routes semantic families through one shared handler", () => {
  const calls = [];
  const buildDeps = () => ({
    authored: {
      serverRunners: [{ id: "runner-a" }],
      mcpServers: []
    },
    readSelectValue: id => ({
      "runtime-plugin-install-runner": "runner-a",
      "runtime-plugin-install-plugin": "plugin-a"
    }[id] || ""),
    buildServerRunnerOptionsFn: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildRuntimePluginInstallOptionsFn: () => [{ value: "plugin-a", label: "plugin-a" }],
    buildRuntimePluginControlViewFn: () => ({ helpText: "Install plugin-a.", submitDisabled: false }),
    runtimePluginAvailabilityForRunner: () => [{ plugin: "plugin-a" }],
    runtimePluginAvailabilityRow: () => ({ plugin: "plugin-a" }),
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

  const handler = createBootstrapRuntimeIntegrationDirectControlsSyncHandler({ buildDeps });
  const result = handler({ detail: { family: "runtime-plugin-install" } });

  assert.equal(result.handled, true);
  assert.deepEqual(calls, [
    ["fillSelect", "runtime-plugin-install-runner", ["runner-a"]],
    ["setSelectedValue", "runtime-plugin-install-runner", "runner-a"],
    ["fillSelect", "runtime-plugin-install-plugin", ["plugin-a"]],
    ["setSelectedValue", "runtime-plugin-install-plugin", "plugin-a"],
    ["setStatus", "runtime-plugin-install-help", "Install plugin-a."],
    ["setSubmitDisabled", "runtime-plugin-install-form", false]
  ]);

  const registered = [];
  const target = {
    addEventListener(name, fn) {
      registered.push([name, fn]);
    }
  };
  const bound = bindBootstrapRuntimeIntegrationDirectControlsSync({ target, buildDeps });
  assert.equal(registered.length, 1);
  assert.equal(registered[0][0], "witness:bootstrap-runtime-integration-direct-sync");
  assert.equal(typeof bound, "function");
});
