import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBootstrapProposalAdjacentSubmit,
  runBootstrapProposalAdjacentSubmit
} from "./bootstrap-proposal-adjacent-submit.js";
import {
  runtimePluginProposalBody,
  mcpServerProposalBody,
  mcpToolProposalBody
} from "./bootstrap-proposal-adjacent.js";

test("proposal-adjacent submit helper routes runtime plugin proposals and resets on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapProposalAdjacentSubmit({
    detail: {
      family: "runtime-plugin-install",
      formId: "runtime-plugin-install-proposal-form",
      statusId: "runtime-plugin-install-proposal-status",
      id: "proposal.runtime-plugin.install.canvas",
      serverRunner: "demo_server",
      plugin: "plugin.canvas",
      reason: "Need canvas"
    },
    runtimePluginProposalBodyFn: runtimePluginProposalBody,
    proposalCreate: async body => { calls.push(body); },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => { refreshed += 1; }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [runtimePluginProposalBody({
    id: "proposal.runtime-plugin.install.canvas",
    serverRunner: "demo_server",
    plugin: "plugin.canvas",
    reason: "Need canvas"
  }, "install")]);
  assert.deepEqual(statuses, [{ id: "runtime-plugin-install-proposal-status", text: "Saved." }]);
  assert.deepEqual(resets, ["runtime-plugin-install-proposal-form"]);
  assert.equal(refreshed, 1);
});

test("proposal-adjacent submit helper resolves MCP tool runner before creating proposal", async () => {
  const calls = [];

  await runBootstrapProposalAdjacentSubmit({
    detail: {
      family: "mcp-tool-install",
      formId: "mcp-tool-install-proposal-form",
      statusId: "mcp-tool-install-proposal-status",
      id: "proposal.mcp.tool.install.ops",
      server: "ops_mcp",
      tool: "world.read",
      actingMode: "delegated",
      scopeContextsJson: '["ctx.docs"]',
      scopeTargetsJson: '["ctx.docs:home"]',
      reason: "Need reads"
    },
    mcpToolProposalBodyFn: mcpToolProposalBody,
    proposalCreate: async body => { calls.push(body); },
    resolveServerRunner: server => server === "ops_mcp" ? "demo_server" : server,
    refresh: async () => {},
    setStatus: () => {},
    resetForm: () => {}
  });

  assert.deepEqual(calls, [mcpToolProposalBody({
    id: "proposal.mcp.tool.install.ops",
    server: "ops_mcp",
    serverRunner: "demo_server",
    tool: "world.read",
    actingMode: "delegated",
    scopeContextsJson: '["ctx.docs"]',
    scopeTargetsJson: '["ctx.docs:home"]',
    reason: "Need reads"
  }, "install")]);
});

test("proposal-adjacent submit helper reports errors and does not reset on failure", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapProposalAdjacentSubmit({
    detail: {
      family: "mcp-server",
      formId: "mcp-server-proposal-form",
      statusId: "mcp-server-proposal-status",
      id: "proposal.mcp.server.ops",
      serverId: "ops_mcp",
      serverRunner: "demo_server"
    },
    mcpServerProposalBodyFn: mcpServerProposalBody,
    proposalCreate: async () => { throw new Error("server conflict"); },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => { refreshed += 1; }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "mcp-server-proposal-status", text: "server conflict" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("proposal-adjacent submit helper returns false for unsupported families", async () => {
  const ok = await runBootstrapProposalAdjacentSubmit({
    detail: { family: "unknown" }
  });

  assert.equal(ok, false);
});

test("proposal-adjacent submit binder ignores unrelated sources and handles matching events", async () => {
  const listeners = new Map();
  const statuses = [];
  const resets = [];
  const created = [];
  let refreshed = 0;

  const handler = bindBootstrapProposalAdjacentSubmit({
    target: {
      addEventListener(type, fn) {
        listeners.set(type, fn);
      }
    },
    proposalCreate: async body => {
      created.push(body);
    },
    refresh: async () => {
      refreshed += 1;
    },
    setStatus: (id, text) => {
      statuses.push({ id, text });
    },
    resetForm: formId => {
      resets.push(formId);
    },
    runtimePluginProposalBodyFn: runtimePluginProposalBody
  });

  assert.equal(typeof handler, "function");
  assert.equal(typeof listeners.get("witness:bootstrap-proposal-adjacent-submit"), "function");

  const ignored = await listeners.get("witness:bootstrap-proposal-adjacent-submit")({
    detail: {
      source: "elsewhere",
      family: "runtime-plugin-install"
    }
  });
  assert.equal(ignored, false);

  const handled = await listeners.get("witness:bootstrap-proposal-adjacent-submit")({
    detail: {
      source: "bootstrap-proposal-adjacent-controls",
      family: "runtime-plugin-install",
      formId: "runtime-plugin-install-proposal-form",
      statusId: "runtime-plugin-install-proposal-status",
      id: "proposal.runtime-plugin.install.canvas",
      serverRunner: "demo_server",
      plugin: "plugin.canvas",
      reason: "Need canvas"
    }
  });

  assert.equal(handled, true);
  assert.deepEqual(created, [runtimePluginProposalBody({
    id: "proposal.runtime-plugin.install.canvas",
    serverRunner: "demo_server",
    plugin: "plugin.canvas",
    reason: "Need canvas"
  }, "install")]);
  assert.deepEqual(statuses, [{ id: "runtime-plugin-install-proposal-status", text: "Saved." }]);
  assert.deepEqual(resets, ["runtime-plugin-install-proposal-form"]);
  assert.equal(refreshed, 1);
});
