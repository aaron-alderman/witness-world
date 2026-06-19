import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapRuntimeIntegrationDirectSubmitContractsByFamily,
  loadBootstrapRuntimeIntegrationDirectSubmitContracts
} from "./bootstrap-runtime-integration-direct-submit-contracts.js";
import {
  bindBootstrapRuntimeIntegrationDirectSubmit,
  buildBootstrapRuntimeIntegrationDirectSubmitRequest,
  renderBootstrapRuntimeIntegrationDirectSubmitFactory,
  runBootstrapRuntimeIntegrationDirectSubmit
} from "./bootstrap-runtime-integration-direct-submit.js";

test("direct runtime integration submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-runtime-integration-direct-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapRuntimeIntegrationDirectSubmitContracts();

  assert.equal(source.includes('family = "mcp-server"'), true);
  assert.equal(source.includes('defaultValue = "delegated"'), true);
  assert.equal(contracts["mcp-server"].omitBlankStrings, true);
  assert.equal(Array.isArray(contracts["mcp-tool-install"].fields), true);
});

test("direct runtime integration submit request builder preserves direct payload contracts", () => {
  assert.deepEqual(
    buildBootstrapRuntimeIntegrationDirectSubmitRequest({
      detail: {
        family: "runtime-plugin-install",
        serverRunner: "demo_server",
        plugin: "plugin.inspect"
      },
      contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
    }),
    {
      url: "/api/runtime-plugin-installs",
      body: {
        serverRunner: "demo_server",
        plugin: "plugin.inspect"
      },
      successText: "Saved.",
      resetOnSuccess: true
    }
  );

  assert.deepEqual(
    buildBootstrapRuntimeIntegrationDirectSubmitRequest({
      detail: {
        family: "runtime-plugin-remove",
        serverRunner: "demo_server",
        plugin: "plugin.inspect"
      },
      contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
    }),
    {
      url: "/api/runtime-plugin-installs",
      method: "DELETE",
      body: {
        serverRunner: "demo_server",
        plugin: "plugin.inspect"
      },
      successText: "Removed.",
      resetOnSuccess: false
    }
  );

  assert.deepEqual(
    buildBootstrapRuntimeIntegrationDirectSubmitRequest({
      detail: {
        family: "mcp-server",
        id: "personal_mcp",
        label: "Personal MCP",
        serverRunner: "demo_server",
        context: "",
        serviceIdentity: "",
        transportsJson: "[\"http\"]"
      },
      contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
    }),
    {
      url: "/api/mcp-servers",
      body: {
        id: "personal_mcp",
        label: "Personal MCP",
        serverRunner: "demo_server",
        transportsJson: "[\"http\"]"
      },
      successText: "Saved.",
      resetOnSuccess: true
    }
  );

  assert.deepEqual(
    buildBootstrapRuntimeIntegrationDirectSubmitRequest({
      detail: {
        family: "mcp-tool-install",
        server: "personal_mcp",
        tool: "world.read",
        actingMode: "",
        scopeContextsJson: "",
        scopeTargetsJson: ""
      },
      contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
    }),
    {
      url: "/api/mcp-tool-installs",
      body: {
        server: "personal_mcp",
        tool: "world.read",
        actingMode: "delegated",
        scopeContextsJson: "[]",
        scopeTargetsJson: "[]"
      },
      successText: "Saved.",
      resetOnSuccess: true
    }
  );

  assert.deepEqual(
    buildBootstrapRuntimeIntegrationDirectSubmitRequest({
      detail: {
        family: "mcp-tool-remove",
        server: "personal_mcp",
        tool: "world.read"
      },
      contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
    }),
    {
      url: "/api/mcp-tool-installs",
      method: "DELETE",
      body: {
        server: "personal_mcp",
        tool: "world.read"
      },
      successText: "Removed.",
      resetOnSuccess: false
    }
  );
});

test("direct runtime integration submit helper posts, resets, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapRuntimeIntegrationDirectSubmit({
    detail: {
      family: "mcp-tool-install",
      formId: "mcp-tool-install-form",
      statusId: "mcp-tool-install-status",
      server: "personal_mcp",
      tool: "authoring.write",
      actingMode: "service",
      scopeContextsJson: "[\"ctx.docs\"]",
      scopeTargetsJson: "[\"ctx.docs:home\"]"
    },
    contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily,
    postJson: async (url, body, method) => {
      calls.push({ url, body, method });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/mcp-tool-installs",
    body: {
      server: "personal_mcp",
      tool: "authoring.write",
      actingMode: "service",
      scopeContextsJson: "[\"ctx.docs\"]",
      scopeTargetsJson: "[\"ctx.docs:home\"]"
    },
    method: "POST"
  }]);
  assert.deepEqual(statuses, [{ id: "mcp-tool-install-status", text: "Saved." }]);
  assert.deepEqual(resets, ["mcp-tool-install-form"]);
  assert.equal(refreshed, 1);
});

test("direct runtime integration submit helper preserves remove semantics without reset", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapRuntimeIntegrationDirectSubmit({
    detail: {
      family: "runtime-plugin-remove",
      formId: "runtime-plugin-remove-form",
      statusId: "runtime-plugin-remove-status",
      serverRunner: "demo_server",
      plugin: "plugin.inspect"
    },
    contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily,
    postJson: async (url, body, method) => {
      calls.push({ url, body, method });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/runtime-plugin-installs",
    body: {
      serverRunner: "demo_server",
      plugin: "plugin.inspect"
    },
    method: "DELETE"
  }]);
  assert.deepEqual(statuses, [{ id: "runtime-plugin-remove-status", text: "Removed." }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 1);
});

test("direct runtime integration submit helper reports errors without reset or refresh", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapRuntimeIntegrationDirectSubmit({
    detail: {
      family: "mcp-server",
      formId: "mcp-server-form",
      statusId: "mcp-server-status",
      id: "personal_mcp"
    },
    contractsByFamily: bootstrapRuntimeIntegrationDirectSubmitContractsByFamily,
    postJson: async () => {
      throw new Error("server conflict");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "mcp-server-status", text: "server conflict" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("direct runtime integration submit bridge binds one documented event family", async () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapRuntimeIntegrationDirectSubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-runtime-integration-direct-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapRuntimeIntegrationDirectSubmitFactory();
  assert.equal(factory.includes("const bootstrapRuntimeIntegrationDirectSubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const bootstrapRuntimeIntegrationDirectOmitBlankStringFields ="), true);
  assert.equal(factory.includes("const buildBootstrapRuntimeIntegrationDirectSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapRuntimeIntegrationDirectSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapRuntimeIntegrationDirectSubmit ="), true);
});
