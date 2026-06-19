import test from "node:test";
import assert from "node:assert/strict";
import {
  runtimePluginProposalBody,
  mcpServerProposalBody,
  mcpToolProposalBody
} from "./bootstrap-proposal-adjacent.js";

test("runtime plugin proposal helper shapes install and remove shared-route bodies", () => {
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
    serverRunner: "demo_server",
    plugin: "plugin.canvas",
    reason: "Need canvas"
  });
  assert.deepEqual(remove, {
    id: "proposal.runtime-plugin.remove.canvas",
    serverRunner: "demo_server",
    plugin: "plugin.canvas",
    reason: ""
  });
});

test("mcp server proposal helper shapes optional fields and shared-route defaults", () => {
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
    proposalId: "proposal.mcp.server.ops",
    id: "ops_mcp",
    label: "ops_mcp",
    serverRunner: "demo_server",
    transportsJson: '["stdio","http"]',
    reason: ""
  });
  assert.deepEqual(full, {
    proposalId: "proposal.mcp.server.personal",
    id: "personal_mcp",
    label: "Personal MCP",
    serverRunner: "demo_server",
    transportsJson: '["http"]',
    context: "ctx.ops",
    serviceIdentity: "aaron",
    reason: "Need service-mode server"
  });
});

test("mcp tool proposal helper shapes shared-route bodies for install and remove", () => {
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
    server: "ops_mcp",
    tool: "world.read",
    actingMode: "delegated",
    scopeContextsJson: '["ctx.docs"]',
    scopeTargetsJson: '["ctx.docs:home"]',
    reason: "Need world reads"
  });
  assert.deepEqual(remove, {
    id: "proposal.mcp.tool.remove.ops",
    server: "ops_mcp",
    tool: "world.read",
    reason: ""
  });
});
