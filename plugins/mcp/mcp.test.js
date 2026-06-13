import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleId, handlerCatalog, routes } from "./runtime.js";
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
      return projected[projector.name];
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
  assert.equal(routeHandlersSource.includes("../plugins/mcp/mcp-tools.js"), true);
  assert.equal(routeHandlersSource.includes("../plugins/mcp/mcp-support-services.js"), true);
  assert.equal(routeHandlersSource.includes("from \"./mcp.js\""), false);
});
