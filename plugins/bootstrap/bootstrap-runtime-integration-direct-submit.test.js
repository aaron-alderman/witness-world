import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBootstrapRuntimeIntegrationDirectSubmit,
  buildBootstrapRuntimeIntegrationDirectSubmitRequest,
  renderBootstrapRuntimeIntegrationDirectSubmitFactory,
  runBootstrapRuntimeIntegrationDirectSubmit
} from "./bootstrap-runtime-integration-direct-submit.js";

test("direct runtime integration submit request builder preserves direct payload contracts", () => {
  assert.deepEqual(
    buildBootstrapRuntimeIntegrationDirectSubmitRequest({
      detail: {
        family: "runtime-plugin-install",
        serverRunner: "demo_server",
        plugin: "plugin.inspect"
      }
    }),
    {
      url: "/api/runtime-plugin-installs",
      body: {
        serverRunner: "demo_server",
        plugin: "plugin.inspect"
      }
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
      }
    }),
    {
      url: "/api/mcp-servers",
      body: {
        id: "personal_mcp",
        label: "Personal MCP",
        serverRunner: "demo_server",
        transportsJson: "[\"http\"]"
      }
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
      }
    }),
    {
      url: "/api/mcp-tool-installs",
      body: {
        server: "personal_mcp",
        tool: "world.read",
        actingMode: "delegated",
        scopeContextsJson: "[]",
        scopeTargetsJson: "[]"
      }
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
    postJson: async (url, body) => {
      calls.push({ url, body });
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
    }
  }]);
  assert.deepEqual(statuses, [{ id: "mcp-tool-install-status", text: "Saved." }]);
  assert.deepEqual(resets, ["mcp-tool-install-form"]);
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
  assert.equal(factory.includes("const buildBootstrapRuntimeIntegrationDirectSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapRuntimeIntegrationDirectSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapRuntimeIntegrationDirectSubmit ="), true);
});
