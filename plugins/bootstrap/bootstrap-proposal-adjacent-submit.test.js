import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bindBootstrapProposalAdjacentSubmit,
  buildBootstrapProposalAdjacentSubmitBody,
  buildBootstrapProposalAdjacentSubmitRequest,
  runBootstrapProposalAdjacentSubmit
} from "./bootstrap-proposal-adjacent-submit.js";
import {
  bootstrapProposalAdjacentSubmitContractsByFamily,
  loadBootstrapProposalAdjacentSubmitContracts
} from "./bootstrap-proposal-adjacent-submit-contracts.js";
import {
  runtimePluginProposalBody,
  mcpServerProposalBody,
  mcpToolProposalBody
} from "./bootstrap-proposal-adjacent.js";

test("proposal-adjacent submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-proposal-adjacent-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapProposalAdjacentSubmitContracts();

  assert.equal(source.includes('family = "runtime-plugin-install"'), true);
  assert.equal(source.includes('url = "/api/proposals"'), true);
  assert.equal(source.includes('bodyBuilder = "mcpToolProposalBody"'), true);
  assert.equal(contracts["mcp-tool-install"].resolveServerRunner, true);
  assert.equal(contracts["mcp-server"].bodyBuilder, "mcpServerProposalBody");
});

test("proposal-adjacent submit body builder uses the documented contract routing", () => {
  assert.deepEqual(
    buildBootstrapProposalAdjacentSubmitBody({
      contract: bootstrapProposalAdjacentSubmitContractsByFamily["runtime-plugin-remove"],
      detail: {
        id: "proposal.runtime-plugin.remove.canvas",
        serverRunner: "demo_server",
        plugin: "plugin.canvas",
        reason: "No longer needed"
      },
      runtimePluginProposalBodyFn: runtimePluginProposalBody
    }),
    runtimePluginProposalBody({
      id: "proposal.runtime-plugin.remove.canvas",
      serverRunner: "demo_server",
      plugin: "plugin.canvas",
      reason: "No longer needed"
    }, "remove")
  );
});

test("proposal-adjacent submit request builder preserves the authored proposal endpoint", () => {
  assert.deepEqual(
    buildBootstrapProposalAdjacentSubmitRequest({
      detail: {
        family: "mcp-server",
        id: "proposal.mcp.server.ops",
        serverId: "ops_mcp",
        serverRunner: "demo_server",
        label: "ops_mcp",
        transportsJson: "[\"http\"]",
        reason: "Need server"
      },
      contractsByFamily: bootstrapProposalAdjacentSubmitContractsByFamily,
      mcpServerProposalBodyFn: mcpServerProposalBody
    }),
    {
      url: "/api/proposals",
      body: mcpServerProposalBody({
        id: "proposal.mcp.server.ops",
        serverId: "ops_mcp",
        serverRunner: "demo_server",
        label: "ops_mcp",
        transportsJson: "[\"http\"]",
        reason: "Need server"
      }),
      successText: "Saved."
    }
  );
});

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
    contractsByFamily: bootstrapProposalAdjacentSubmitContractsByFamily,
    runtimePluginProposalBodyFn: runtimePluginProposalBody,
    postJson: async (url, body) => { calls.push({ url, body }); },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => { refreshed += 1; }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/proposals",
    body: runtimePluginProposalBody({
      id: "proposal.runtime-plugin.install.canvas",
      serverRunner: "demo_server",
      plugin: "plugin.canvas",
      reason: "Need canvas"
    }, "install")
  }]);
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
    contractsByFamily: bootstrapProposalAdjacentSubmitContractsByFamily,
    mcpToolProposalBodyFn: mcpToolProposalBody,
    postJson: async (url, body) => { calls.push({ url, body }); },
    resolveServerRunner: server => server === "ops_mcp" ? "demo_server" : server,
    refresh: async () => {},
    setStatus: () => {},
    resetForm: () => {}
  });

  assert.deepEqual(calls, [{
    url: "/api/proposals",
    body: mcpToolProposalBody({
      id: "proposal.mcp.tool.install.ops",
      server: "ops_mcp",
      serverRunner: "demo_server",
      tool: "world.read",
      actingMode: "delegated",
      scopeContextsJson: '["ctx.docs"]',
      scopeTargetsJson: '["ctx.docs:home"]',
      reason: "Need reads"
    }, "install")
  }]);
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
    contractsByFamily: bootstrapProposalAdjacentSubmitContractsByFamily,
    mcpServerProposalBodyFn: mcpServerProposalBody,
    postJson: async () => { throw new Error("server conflict"); },
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
    postJson: async (url, body) => {
      created.push({ url, body });
    },
    contractsByFamily: bootstrapProposalAdjacentSubmitContractsByFamily,
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
  assert.deepEqual(created, [{
    url: "/api/proposals",
    body: runtimePluginProposalBody({
      id: "proposal.runtime-plugin.install.canvas",
      serverRunner: "demo_server",
      plugin: "plugin.canvas",
      reason: "Need canvas"
    }, "install")
  }]);
  assert.deepEqual(statuses, [{ id: "runtime-plugin-install-proposal-status", text: "Saved." }]);
  assert.deepEqual(resets, ["runtime-plugin-install-proposal-form"]);
  assert.equal(refreshed, 1);

  const factorySource = await readFile(new URL("./bootstrap-proposal-adjacent-submit.js", import.meta.url), "utf8");
  assert.equal(factorySource.includes("bootstrapProposalAdjacentSubmitContractsByFamily"), true);
});
