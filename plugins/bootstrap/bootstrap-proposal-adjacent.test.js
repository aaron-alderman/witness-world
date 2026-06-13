import test from "node:test";
import assert from "node:assert/strict";
import {
  runtimePluginProposalBody,
  mcpServerProposalBody,
  mcpToolProposalBody
} from "./bootstrap-proposal-adjacent.js";

test("runtime plugin proposal helper shapes install and remove proposals", () => {
  const install = runtimePluginProposalBody({
    id: "proposal.runtime-plugin.install.canvas",
    serverRunner: "demo_server",
    plugin: "plugin.canvas",
    reason: "Need canvas"
  }, "install");
  const remove = runtimePluginProposalBody({
    id: "proposal.runtime-plugin.remove.canvas",
    serverRunner: "demo_server",
    plugin: "plugin.canvas"
  }, "remove");

  assert.deepEqual(install, {
    id: "proposal.runtime-plugin.install.canvas",
    targetProcess: "runtimePlugin.install",
    targetKind: "serverRunner",
    targetId: "demo_server",
    bodyJson: JSON.stringify({ serverRunner: "demo_server", plugin: "plugin.canvas" }),
    reason: "Need canvas"
  });
  assert.deepEqual(remove, {
    id: "proposal.runtime-plugin.remove.canvas",
    targetProcess: "runtimePlugin.remove",
    targetKind: "serverRunner",
    targetId: "demo_server",
    bodyJson: JSON.stringify({ serverRunner: "demo_server", plugin: "plugin.canvas" }),
    reason: ""
  });
});

test("mcp server proposal helper shapes optional fields and defaults", () => {
  const minimal = mcpServerProposalBody({
    id: "proposal.mcp.server.ops",
    serverId: "ops_mcp",
    serverRunner: "demo_server"
  });
  const full = mcpServerProposalBody({
    id: "proposal.mcp.server.personal",
    serverId: "personal_mcp",
    label: "Personal MCP",
    serverRunner: "demo_server",
    context: "ctx.ops",
    serviceIdentity: "aaron",
    transportsJson: '["http"]',
    reason: "Need service-mode server"
  });

  assert.deepEqual(minimal, {
    id: "proposal.mcp.server.ops",
    targetProcess: "mcpServer.define",
    targetKind: "serverRunner",
    targetId: "demo_server",
    bodyJson: JSON.stringify({
      id: "ops_mcp",
      label: "ops_mcp",
      serverRunner: "demo_server",
      transportsJson: '["stdio","http"]'
    }),
    reason: ""
  });
  assert.deepEqual(full, {
    id: "proposal.mcp.server.personal",
    targetProcess: "mcpServer.define",
    targetKind: "serverRunner",
    targetId: "demo_server",
    bodyJson: JSON.stringify({
      id: "personal_mcp",
      label: "Personal MCP",
      serverRunner: "demo_server",
      transportsJson: '["http"]',
      context: "ctx.ops",
      serviceIdentity: "aaron"
    }),
    reason: "Need service-mode server"
  });
});

test("mcp tool proposal helper shapes runner fallback and JSON defaults", () => {
  const install = mcpToolProposalBody({
    id: "proposal.mcp.tool.install.ops",
    server: "ops_mcp",
    serverRunner: "demo_server",
    tool: "world.read",
    actingMode: "delegated",
    scopeContextsJson: '["ctx.docs"]',
    scopeTargetsJson: '["ctx.docs:home"]',
    reason: "Need world reads"
  }, "install");
  const remove = mcpToolProposalBody({
    id: "proposal.mcp.tool.remove.ops",
    server: "ops_mcp",
    tool: "world.read"
  }, "remove");

  assert.deepEqual(install, {
    id: "proposal.mcp.tool.install.ops",
    targetProcess: "mcpTool.install",
    targetKind: "serverRunner",
    targetId: "demo_server",
    bodyJson: JSON.stringify({
      server: "ops_mcp",
      tool: "world.read",
      actingMode: "delegated",
      scopeContextsJson: '["ctx.docs"]',
      scopeTargetsJson: '["ctx.docs:home"]'
    }),
    reason: "Need world reads"
  });
  assert.deepEqual(remove, {
    id: "proposal.mcp.tool.remove.ops",
    targetProcess: "mcpTool.remove",
    targetKind: "serverRunner",
    targetId: "ops_mcp",
    bodyJson: JSON.stringify({
      server: "ops_mcp",
      tool: "world.read",
      actingMode: "delegated",
      scopeContextsJson: "[]",
      scopeTargetsJson: "[]"
    }),
    reason: ""
  });
});
