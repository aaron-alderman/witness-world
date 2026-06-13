import test from "node:test";
import assert from "node:assert/strict";
import {
  buildServerRunnerOptions,
  buildMcpServerOptions,
  buildRuntimePluginInstallOptions,
  buildRuntimePluginRemoveOptions,
  buildMcpToolInstallOptions,
  buildMcpToolRemoveOptions
} from "./bootstrap-runtime-integration-options-view.js";

test("runtime integration option view builds server runner and MCP server options", () => {
  assert.deepEqual(buildServerRunnerOptions([
    { id: "demo_server" },
    { id: "ops_server" }
  ]), [
    { value: "demo_server", label: "demo_server" },
    { value: "ops_server", label: "ops_server" }
  ]);

  assert.deepEqual(buildMcpServerOptions([
    { id: "ops_mcp", serverRunner: "demo_server", transports: ["stdio", "http"] },
    { id: "personal_mcp", serverRunner: "", transports: [] }
  ]), [
    { value: "ops_mcp", label: "ops_mcp @demo_server [stdio, http]" },
    { value: "personal_mcp", label: "personal_mcp @no runner [no transport]" }
  ]);
});

test("runtime integration option view builds runtime plugin install/remove options", () => {
  const availability = [
    {
      plugin: "plugin.inspect",
      installed: false,
      installable: true,
      executable: true,
      compatible: true,
      missingDependencies: [],
      version: "1.0.0"
    },
    {
      plugin: "plugin.canvas",
      installed: true,
      installable: false,
      executable: true,
      compatible: true,
      missingDependencies: []
    }
  ];

  assert.deepEqual(buildRuntimePluginInstallOptions({
    serverRunnerId: "demo_server",
    availabilityRows: availability
  }), [
    { value: "plugin.inspect", label: "plugin.inspect [1.0.0] {installable}" },
    { value: "plugin.canvas", label: "plugin.canvas {installed}" }
  ]);

  assert.deepEqual(buildRuntimePluginRemoveOptions({
    serverRunnerId: "demo_server",
    availabilityRows: availability
  }), [
    { value: "plugin.canvas", label: "plugin.canvas {installed}" }
  ]);
});

test("runtime integration option view builds MCP tool install/remove options", () => {
  const supportedTools = [
    { name: "world.read", title: "World Read" },
    { name: "authoring.write", title: "Authoring Write" }
  ];
  const installedTools = [
    {
      tool: "world.read",
      actingMode: "delegated",
      scopeContexts: ["ctx.docs"],
      scopeTargets: []
    }
  ];

  assert.deepEqual(buildMcpToolInstallOptions({
    serverId: "ops_mcp",
    supportedTools,
    installedTools
  }), [
    { value: "authoring.write", label: "authoring.write [Authoring Write]" }
  ]);

  assert.deepEqual(buildMcpToolRemoveOptions({
    serverId: "ops_mcp",
    installedTools,
    supportedTools
  }), [
    { value: "world.read", label: "world.read [World Read] {delegated, contexts: ctx.docs}" }
  ]);
});
