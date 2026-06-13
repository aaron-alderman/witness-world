import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapProposalAdjacentControlsView,
  buildBootstrapProposalAdjacentControlsView,
  renderBootstrapProposalAdjacentControlsViewFactory
} from "./bootstrap-proposal-adjacent-controls-view.js";

test("proposal-adjacent controls view builder derives runtime plugin install and MCP tool install state", () => {
  const view = buildBootstrapProposalAdjacentControlsView({
    authored: {
      serverRunners: [{ id: "runner-a" }],
      mcpServers: [{ id: "server-a" }]
    },
    runtimeProfile: "minimal",
    supportedMcpActingModes: ["delegated", "service"],
    readSelectValue: id => ({
      "runtime-plugin-install-proposal-runner": "runner-a",
      "runtime-plugin-install-proposal-plugin": "plugin-a",
      "mcp-tool-install-proposal-server": "server-a",
      "mcp-tool-install-proposal-tool": "tool-a",
      "mcp-tool-install-proposal-acting-mode": "service"
    }[id] || ""),
    buildServerRunnerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildMcpServerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildRuntimePluginInstallOptions: () => [{ value: "plugin-a", label: "plugin-a" }],
    buildRuntimePluginControlView: ({ row, profile }) => ({
      helpText: row.plugin + " on " + profile,
      submitDisabled: false
    }),
    runtimePluginAvailabilityForRunner: () => [{ plugin: "plugin-a" }],
    runtimePluginAvailabilityRow: () => ({ plugin: "plugin-a" }),
    buildMcpToolInstallOptions: () => [{ value: "tool-a", label: "tool-a" }],
    buildMcpToolInstallControlView: ({ server, tool, actingMode }) => ({
      helpText: server.id + ":" + tool.name + ":" + actingMode,
      submitDisabled: false
    }),
    mcpSupportedTools: () => [{ name: "tool-a" }],
    mcpInstalledToolsForServer: () => [],
    mcpServerRow: () => ({ id: "server-a", serviceIdentity: "svc" }),
    mcpSupportedToolRow: () => ({ name: "tool-a" })
  });

  assert.deepEqual(view.runtimePluginInstall, {
    runnerOptions: [{ value: "runner-a", label: "runner-a" }],
    selectedRunnerId: "runner-a",
    pluginOptions: [{ value: "plugin-a", label: "plugin-a" }],
    selectedPluginId: "plugin-a",
    helpText: "plugin-a on minimal",
    submitDisabled: false
  });
  assert.deepEqual(view.mcpToolInstall, {
    serverOptions: [{ value: "server-a", label: "server-a" }],
    selectedServerId: "server-a",
    toolOptions: [{ value: "tool-a", label: "tool-a" }],
    selectedToolId: "tool-a",
    actingModeOptions: [
      { value: "delegated", label: "delegated" },
      { value: "service", label: "service" }
    ],
    selectedActingMode: "service",
    helpText: "server-a:tool-a:service",
    submitDisabled: false
  });
});

test("proposal-adjacent controls view builder preserves other families during scoped recompute", () => {
  const existingView = {
    runtimePluginInstall: { helpText: "keep-me" }
  };
  const view = buildBootstrapProposalAdjacentControlsView({
    family: "mcp-server",
    existingView,
    authored: {
      contexts: [{ id: "ctx-a" }],
      serverRunners: [{ id: "runner-a" }]
    },
    readSelectValue: id => ({
      "mcp-server-proposal-runner": "runner-a",
      "mcp-server-proposal-context": "ctx-a"
    }[id] || ""),
    readFieldValue: (formId, fieldName) => (
      formId === "mcp-server-proposal-form" && fieldName === "serviceIdentity" ? "svc-a" :
      formId === "mcp-server-proposal-form" && fieldName === "transportsJson" ? "[\"http\"]" :
      ""
    ),
    buildServerRunnerOptions: rows => rows.map(row => ({ value: row.id, label: row.id })),
    buildMcpServerControlView: ({ runnerId, serviceIdentity }) => ({
      helpText: runnerId + ":" + serviceIdentity,
      submitDisabled: false
    })
  });

  assert.equal(view.runtimePluginInstall.helpText, "keep-me");
  assert.deepEqual(view.mcpServer, {
    runnerOptions: [{ value: "runner-a", label: "runner-a" }],
    selectedRunnerId: "runner-a",
    contextOptions: [{ value: "ctx-a", label: "ctx-a" }],
    selectedContextId: "ctx-a",
    helpText: "runner-a:svc-a",
    submitDisabled: false
  });
});

test("proposal-adjacent controls view apply helper pushes select, help, and disabled state", () => {
  const calls = [];
  applyBootstrapProposalAdjacentControlsView({
    family: "mcp-tool-remove",
    editingDisabled: true,
    view: {
      mcpToolRemove: {
        serverOptions: [{ value: "server-a", label: "server-a" }],
        selectedServerId: "server-a",
        toolOptions: [{ value: "tool-a", label: "tool-a" }],
        selectedToolId: "tool-a",
        helpText: "remove tool-a",
        submitDisabled: false
      }
    },
    fillSelect: (id, options, getValue, getLabel, config) => calls.push([
      "fillSelect",
      id,
      options.map(row => ({ value: getValue(row), label: getLabel(row) })),
      config
    ]),
    setSelectedValue: (id, value) => calls.push(["setSelectedValue", id, value]),
    setStatus: (id, text) => calls.push(["setStatus", id, text]),
    setSubmitDisabled: (formId, disabled) => calls.push(["setSubmitDisabled", formId, disabled])
  });

  assert.deepEqual(calls, [
    ["fillSelect", "mcp-tool-remove-proposal-server", [{ value: "server-a", label: "server-a" }], { includeBlank: false }],
    ["setSelectedValue", "mcp-tool-remove-proposal-server", "server-a"],
    ["fillSelect", "mcp-tool-remove-proposal-tool", [{ value: "tool-a", label: "tool-a" }], { includeBlank: false }],
    ["setSelectedValue", "mcp-tool-remove-proposal-tool", "tool-a"],
    ["setStatus", "mcp-tool-remove-proposal-help", "remove tool-a"],
    ["setSubmitDisabled", "mcp-tool-remove-proposal-form", true]
  ]);
});

test("proposal-adjacent controls view factory exposes shared helper seam", () => {
  const factory = renderBootstrapProposalAdjacentControlsViewFactory();
  assert.equal(factory.includes("const buildBootstrapProposalAdjacentControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapProposalAdjacentControlsView ="), true);
});
