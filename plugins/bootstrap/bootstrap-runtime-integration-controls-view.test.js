import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRuntimePluginControlView,
  buildMcpServerControlView,
  buildMcpToolInstallControlView,
  buildMcpToolRemoveControlView,
  parseBootstrapJsonArrayInput
} from "./bootstrap-runtime-integration-controls-view.js";

test("runtime plugin control view reflects installable and blocked states", () => {
  assert.deepEqual(buildRuntimePluginControlView({
    row: {
      installed: false,
      installable: true,
      dependsOnPlugins: ["plugin.inspect"]
    },
    profile: "full"
  }), {
    helpText: "Installable on profile full. Depends on: plugin.inspect.",
    submitDisabled: false
  });

  assert.deepEqual(buildRuntimePluginControlView({
    row: {
      installed: false,
      installable: false,
      reasons: ["missing package", "wrong shell"]
    },
    profile: "minimal"
  }), {
    helpText: "Blocked on profile minimal: missing package; wrong shell",
    submitDisabled: true
  });
});

test("runtime plugin control view honors requireInstalled mode", () => {
  assert.deepEqual(buildRuntimePluginControlView({
    row: {
      installed: true,
      installable: false
    },
    profile: "full",
    requireInstalled: true
  }), {
    helpText: "Already installed on this server runner for profile full.",
    submitDisabled: false
  });
});

test("mcp server control view validates runner and transports JSON", () => {
  assert.deepEqual(buildMcpServerControlView({
    parseJsonArrayInputFn: () => ({ ok: true, value: [] })
  }), {
    helpText: "Choose a server runner to expose MCP transports on its runtime.",
    submitDisabled: true
  });

  assert.deepEqual(buildMcpServerControlView({
    runnerId: "demo_server",
    transportsInput: "bad",
    parseJsonArrayInputFn: () => ({ ok: false, reason: "must be valid JSON" })
  }), {
    helpText: "Transports JSON must be valid JSON.",
    submitDisabled: true
  });

  assert.deepEqual(buildMcpServerControlView({
    runnerId: "demo_server",
    serviceIdentity: "operator.demo",
    transportsInput: '["stdio","http"]',
    parseJsonArrayInputFn: () => ({ ok: true, value: ["stdio", "http"] })
  }), {
    helpText: "Runner demo_server will expose transports: stdio, http. HTTP transport will mount a runtime path for this MCP server. STDIO transport stays shell-facing. Service-mode tools can run as operator.demo.",
    submitDisabled: false
  });
});

test("runtime integration controls parser accepts blank and rejects non-array JSON", () => {
  assert.deepEqual(parseBootstrapJsonArrayInput(""), { ok: true, value: [] });
  assert.deepEqual(parseBootstrapJsonArrayInput('{"x":1}'), { ok: false, reason: "must be a JSON array" });
  assert.deepEqual(parseBootstrapJsonArrayInput("[1,2]"), { ok: true, value: [1, 2] });
});

test("mcp tool install control view enforces service identity for service mode", () => {
  assert.deepEqual(buildMcpToolInstallControlView({}), {
    helpText: "Choose an MCP server and tool.",
    submitDisabled: true
  });

  assert.deepEqual(buildMcpToolInstallControlView({
    server: { id: "ops_mcp", serviceIdentity: "", httpPath: "/mcp/ops" },
    tool: { name: "world.read", title: "World Read" },
    actingMode: "service"
  }), {
    helpText: "Installing world.read [World Read] on ops_mcp. Service mode requires a serviceIdentity on the selected MCP server. Scope JSON narrows what the installed tool may act on. HTTP path: /mcp/ops.",
    submitDisabled: true
  });
});

test("mcp tool remove control view summarizes installed tool state", () => {
  assert.deepEqual(buildMcpToolRemoveControlView({}), {
    helpText: "Choose an installed MCP tool to remove.",
    submitDisabled: true
  });

  assert.deepEqual(buildMcpToolRemoveControlView({
    server: { id: "ops_mcp", serviceIdentity: "operator.demo" },
    install: { tool: "world.read", actingMode: "delegated" },
    scopeSummary: "contexts: ctx.docs"
  }), {
    helpText: "Removing world.read from ops_mcp (delegated, contexts: ctx.docs). Service identity: operator.demo.",
    submitDisabled: false
  });
});
