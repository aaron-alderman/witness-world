import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes } from "./runtime.js";
import { createMcpBundleSupportServices } from "./mcp-support-services.js";
import { MCP_PROTOCOL_VERSION, listSupportedMcpTools, mcpToolNames, resolveMcpToolScope } from "./mcp-tools.js";

test("mcp plugin exposes MCP HTTP route ownership", () => {
  assert.equal(bundleId, "bundle-mcp");
  assert.equal(handlerCatalog.dispatchHandlers.includes("mcp.http"), true);
  assert.equal(routes.some(route => route.handler === "mcp.http"), true);
});

test("mcp plugin owns protocol constants and supported tool catalog", () => {
  assert.equal(MCP_PROTOCOL_VERSION, "2025-06-18");
  const toolNames = mcpToolNames();
  assert.equal(toolNames.includes("world.read"), true);
  assert.equal(toolNames.includes("authoring.write"), true);
  assert.equal(toolNames.includes("db.sql"), true);
  assert.equal(listSupportedMcpTools().every(tool => toolNames.includes(tool.name)), true);
  assert.deepEqual(resolveMcpToolScope("world.read", { view: "processRun", runId: "run-1" }), {
    contextIds: [],
    targetIds: ["run-1"]
  });
  const worldRead = listSupportedMcpTools().find(tool => tool.name === "world.read");
  const authoringWrite = listSupportedMcpTools().find(tool => tool.name === "authoring.write");
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("authoringMatrix"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("process.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("projection.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("frontendProgram.create"), false);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("widget.create"), false);
});

test("mcp plugin owns origin, principal, and scope support services", () => {
  const projected = {
    mcpServerIndex: { byId: { "mcp.demo": { id: "mcp.demo" } } },
    mcpToolInstalls: [{ server: "mcp.demo", tool: "world.read", actingMode: "delegated", scopeContexts: ["ctx.docs"], scopeTargets: [] }],
    modules: new Map([["ctx.docs", "context"]]),
    objectContexts: new Map(),
    backendCapabilities: new Set(["db.sql"])
  };
  const world = {
    project(projector) {
      if (projector === moduleProjectors.mcpServerIndex) return projected.mcpServerIndex;
      if (projector === moduleProjectors.mcpToolInstalls) return projected.mcpToolInstalls;
      if (projector === moduleProjectors.modules) return projected.modules;
      if (projector === moduleProjectors.objectContexts) return projected.objectContexts;
      return null;
    }
  };
  const services = createMcpBundleSupportServices({
    world,
    backendHost: {},
    mcpInternalToken: "secret",
    runtimeConfigLookup: () => null,
    resolveMcpToolScope: () => ({ contextIds: ["ctx.docs"], targetIds: [] }),
    hostCapabilities: () => projected.backendCapabilities,
    headerValue: value => String(value || "")
  });

  assert.equal(services.currentMcpServerIndex().byId["mcp.demo"].id, "mcp.demo");
  assert.deepEqual(services.currentMcpToolInstalls(), projected.mcpToolInstalls);
  assert.equal(services.mcpToolAvailable("db.sql"), true);
  assert.equal(services.mcpToolAvailable("storage.blob"), false);
  assert.deepEqual(
    services.validateMcpOrigin({ headers: { origin: "http://localhost:3000", host: "127.0.0.1:8787" } }),
    { ok: true }
  );
  assert.equal(services.mcpScopeAllows(projected.mcpToolInstalls[0], {}, {}).ok, true);
});

test("mcp runtime ownership is not implemented in core compatibility files", async () => {
  const routeHandlersSource = await readFile(new URL("../../src/runtime-route-handlers.js", import.meta.url), "utf8");

  await assert.rejects(readFile(new URL("../../src/mcp.js", import.meta.url), "utf8"));
  assert.equal(routeHandlersSource.includes("../plugins/mcp/mcp-tools.js"), false);
  assert.equal(routeHandlersSource.includes("../plugins/mcp/mcp-support-services.js"), false);
  assert.equal(routeHandlersSource.includes("from \"./mcp.js\""), false);
});

test("mcp plugin registers MCP server and tool install read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "mcp.demo" });
  world.emit({
    process: "defineMcpServer",
    actor: "system",
    claims: [
      relation("mcp.demo", "hasModuleKind", "mcpServer"),
      relation("mcp.demo", "usesServerRunner", "runner.demo"),
      relation("mcp.demo", "serviceIdentity", "identity.mcp"),
      relation("mcp.demo", "supportsTransport", "stdio"),
      relation("mcp.demo", "supportsTransport", "http"),
      relation("mcp.demo", "supportsTransport", "invalid"),
      relation("mcp.demo", "exposesMcpTool", "world.read", {
        actingMode: "service",
        scopeContexts: ["ctx.demo", "ctx.demo"],
        scopeTargets: ["page.demo"]
      })
    ],
    body: {
      id: "mcp.demo",
      label: "Demo MCP",
      serverRunner: "runner.initial",
      serviceIdentity: "identity.initial",
      transports: ["stdio"]
    }
  });

  assert.deepEqual(world.project(moduleProjectors.mcpServers), [{
    id: "mcp.demo",
    label: "Demo MCP",
    serverRunner: "runner.demo",
    serviceIdentity: "identity.mcp",
    transports: ["http", "stdio"],
    context: null
  }]);
  assert.equal(world.project(moduleProjectors.mcpServerIndex).byId["mcp.demo"].serverRunner, "runner.demo");
  assert.deepEqual(world.project(moduleProjectors.mcpToolInstalls), [{
    server: "mcp.demo",
    tool: "world.read",
    actingMode: "service",
    scopeContexts: ["ctx.demo"],
    scopeTargets: ["page.demo"],
    witness: world.project(moduleProjectors.mcpToolInstalls)[0].witness
  }]);
  assert.equal(world.project(moduleProjectors.mcpToolInstallIndex).byServer["mcp.demo"][0].tool, "world.read");
}));
