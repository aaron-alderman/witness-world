import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBootstrapMcpScopeSummary,
  buildBootstrapRuntimeIntegrationState,
  renderBootstrapRuntimeIntegrationStateFactory
} from "./bootstrap-runtime-integration-state.js";

test("runtime integration state derives MCP and runtime plugin selectors from authored/model state", () => {
  const state = buildBootstrapRuntimeIntegrationState({
    authored: {
      mcp: {
        servers: [
          {
            id: "notes",
            serverRunner: "demo_server",
            tools: [{ tool: "notes.search", actingMode: "delegated" }]
          }
        ]
      },
      runtimePluginAvailability: [
        { serverRunner: "demo_server", plugin: "plugin.demo" },
        { serverRunner: "other_server", plugin: "plugin.other" }
      ]
    },
    model: {
      supportedMcpTools: [
        { name: "notes.search", title: "Search Notes" },
        { name: "notes.write", title: "Write Notes" }
      ]
    }
  });

  assert.deepEqual(state.runtimePluginAvailabilityForRunner("demo_server"), [
    { serverRunner: "demo_server", plugin: "plugin.demo" }
  ]);
  assert.deepEqual(state.runtimePluginAvailabilityRow("demo_server", "plugin.demo"), {
    serverRunner: "demo_server",
    plugin: "plugin.demo"
  });
  assert.deepEqual(state.mcpServerRow("notes"), {
    id: "notes",
    serverRunner: "demo_server",
    tools: [{ tool: "notes.search", actingMode: "delegated" }]
  });
  assert.deepEqual(state.mcpInstalledToolsForServer("notes"), [
    { tool: "notes.search", actingMode: "delegated" }
  ]);
  assert.deepEqual(state.mcpSupportedTools(), [
    { name: "notes.search", title: "Search Notes" },
    { name: "notes.write", title: "Write Notes" }
  ]);
  assert.deepEqual(state.mcpSupportedToolRow("notes.write"), {
    name: "notes.write",
    title: "Write Notes"
  });
  assert.equal(state.mcpScopeSummary({ scopeContexts: ["ctx.docs"], scopeTargets: ["ctx.docs:home"] }), "contexts: ctx.docs / targets: ctx.docs:home");
  assert.equal(state.resolveServerRunner("notes"), "demo_server");
  assert.equal(state.resolveServerRunner("missing"), "missing");
});

test("runtime integration scope summary defaults to unscoped", () => {
  assert.equal(buildBootstrapMcpScopeSummary({}), "unscoped");
});

test("runtime integration state factory exposes the shared browser seam", () => {
  const factory = renderBootstrapRuntimeIntegrationStateFactory();

  assert.equal(factory.includes("const buildBootstrapMcpScopeSummary ="), true);
  assert.equal(factory.includes("const buildBootstrapRuntimeIntegrationState ="), true);
  assert.equal(factory.includes("runtimePluginAvailabilityForRunner"), true);
});
