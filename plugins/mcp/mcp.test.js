import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes } from "./runtime.js";
import { createMcpBundleSupportServices } from "./mcp-support-services.js";
import { MCP_PROTOCOL_VERSION, executeMcpTool, listSupportedMcpTools, mcpToolNames, resolveMcpToolScope } from "./mcp-tools.js";

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
  assert.equal(toolNames.includes("platform.read"), true);
  assert.equal(toolNames.includes("platform.branch"), true);
  assert.equal(toolNames.includes("platform.proposal"), true);
  assert.equal(toolNames.includes("platform.changeSet"), true);
  assert.equal(toolNames.includes("platform.test"), true);
  assert.equal(toolNames.includes("db.sql"), true);
  assert.equal(listSupportedMcpTools().every(tool => toolNames.includes(tool.name)), true);
  assert.deepEqual(resolveMcpToolScope("world.read", { view: "processRun", runId: "run-1" }), {
    contextIds: [],
    targetIds: ["run-1"]
  });
  const worldRead = listSupportedMcpTools().find(tool => tool.name === "world.read");
  const authoringWrite = listSupportedMcpTools().find(tool => tool.name === "authoring.write");
  const platformRead = listSupportedMcpTools().find(tool => tool.name === "platform.read");
  const platformBranch = listSupportedMcpTools().find(tool => tool.name === "platform.branch");
  const platformProposal = listSupportedMcpTools().find(tool => tool.name === "platform.proposal");
  const platformChangeSet = listSupportedMcpTools().find(tool => tool.name === "platform.changeSet");
  const platformTest = listSupportedMcpTools().find(tool => tool.name === "platform.test");
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("authoringMatrix"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("gaps"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("proposals"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("branches"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testGates"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testRedGreen"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testRuns"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("candidateSnapshots"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("runtimeRevisions"), true);
  assert.deepEqual(platformBranch.inputSchema.properties.operation.enum, ["list", "read", "create"]);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "parentBranchId"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "epic"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "feature"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "defect"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("runtimePlugin.install"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("changeSet.create"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("changeSet.apply"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("branch.create"), true);
  assert.equal(platformProposal.inputSchema.properties.operation.enum.includes("approve"), true);
  assert.deepEqual(platformChangeSet.inputSchema.properties.operation.enum, ["list", "read", "create", "edit", "removeEdit", "validate", "apply", "reject", "abandon"]);
  assert.deepEqual(platformTest.inputSchema.properties.operation.enum, ["list", "read", "run"]);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("process.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("type.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("projection.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("message.create"), true);
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
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    resolveMcpToolScope: () => ({ contextIds: ["ctx.docs"], targetIds: [] }),
    hostCapabilities: () => projected.backendCapabilities,
    headerValue: value => String(value || "")
  });

  assert.equal(services.currentMcpServerIndex().byId["mcp.demo"].id, "mcp.demo");
  assert.deepEqual(services.currentMcpToolInstalls(), projected.mcpToolInstalls);
  assert.equal(services.mcpToolAvailable("db.sql"), true);
  assert.equal(services.mcpToolAvailable("storage.blob"), false);
  assert.equal(services.mcpToolAvailable("platform.read"), false);
  assert.equal(services.mcpToolAvailable("platform.changeSet"), false);
  assert.equal(services.mcpToolAvailable("platform.test"), false);
  projected.backendCapabilities.add("platform.self");
  assert.equal(services.mcpToolAvailable("platform.read"), true);
  assert.equal(services.mcpToolAvailable("platform.changeSet"), true);
  assert.equal(services.mcpToolAvailable("platform.test"), true);
  assert.deepEqual(
    services.validateMcpOrigin({ headers: { origin: "http://localhost:3000", host: "127.0.0.1:8787" } }),
    { ok: true }
  );
  assert.deepEqual(
    services.resolveMcpPrincipal({
      req: { headers: { authorization: "Bearer svc-token" } },
      requestActor: null,
      requestIdentity: null,
      requestSession: null,
      mcpServer: { id: "mcp.demo", serviceIdentity: "service.actor" },
      appContext: { runtimeConfig: { "mcp.mcp.demo.token": "svc-token" } }
    }),
    {
      ok: true,
      actingMode: "service",
      actor: "service.actor",
      identity: null,
      authenticatedIdentity: null,
      authenticatedActor: "service.actor",
      effectiveIdentity: null,
      effectiveActor: "service.actor",
      authorityMode: "service",
      assumptionGrantId: null,
      transport: "http"
    }
  );
  assert.equal(services.mcpScopeAllows(projected.mcpToolInstalls[0], {}, {}).ok, true);
});

test("platform MCP proposal tool routes through platform proposal handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: request.handler === "platform.proposal.create" ? 201 : 200, body: { ok: true, handler: request.handler } };
  };

  const created = await executeMcpTool("platform.proposal", {
    args: {
      action: "runtimePlugin.install",
      id: "proposal.platform.install",
      body: { serverRunner: "runner.platform", plugin: "plugin.platform" },
      reason: "Install platform"
    },
    callHandler
  });
  assert.equal(created.isError, false);
  assert.equal(calls.at(-1).handler, "platform.proposal.create");
  assert.equal(calls.at(-1).path, "/api/platform-proposals");
  assert.equal(calls.at(-1).body.action, "runtimePlugin.install");

  const approved = await executeMcpTool("platform.proposal", {
    args: { operation: "approve", proposalId: "proposal.platform.install" },
    callHandler
  });
  assert.equal(approved.isError, false);
  assert.equal(calls.at(-1).handler, "platform.proposal.approve");
  assert.equal(calls.at(-1).params.id, "proposal.platform.install");
});

test("platform MCP read tool routes runtime revision view through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null } };
  };

  const result = await executeMcpTool("platform.read", {
    args: { view: "runtimeRevisions", id: "branch.demo" },
    callHandler
  });
  assert.equal(result.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "runtimeRevisions");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const testGateResult = await executeMcpTool("platform.read", {
    args: { view: "testGates", id: "branch.demo" },
    callHandler
  });
  assert.equal(testGateResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testGates");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const testRunResult = await executeMcpTool("platform.read", {
    args: { view: "testRuns", id: "branch.demo" },
    callHandler
  });
  assert.equal(testRunResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testRuns");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const redGreenResult = await executeMcpTool("platform.read", {
    args: { view: "testRedGreen", id: "branch.demo" },
    callHandler
  });
  assert.equal(redGreenResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testRedGreen");
  assert.equal(calls.at(-1).query.id, "branch.demo");
});

test("platform MCP branch tool routes through platform branch handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: request.handler === "platform.branch.create" ? 201 : 200, body: { ok: true, handler: request.handler, id: request.params?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.branch", {
    args: { operation: "list" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.branch.list");
  assert.equal(calls.at(-1).path, "/api/platform-branches");

  const created = await executeMcpTool("platform.branch", {
    args: {
      operation: "create",
      id: "branch.platform.console",
      title: "Platform Console",
      parentBranchId: "branch.platform.root",
      epic: "platform",
      feature: "console",
      defect: "none"
    },
    callHandler
  });
  assert.equal(created.isError, false);
  assert.equal(calls.at(-1).handler, "platform.branch.create");
  assert.equal(calls.at(-1).path, "/api/platform-branches");
  assert.equal(calls.at(-1).body.parentBranchId, "branch.platform.root");
  assert.equal(calls.at(-1).body.epic, "platform");
  assert.equal(calls.at(-1).body.feature, "console");
  assert.equal(calls.at(-1).body.defect, "none");

  const read = await executeMcpTool("platform.branch", {
    args: { operation: "read", id: "branch.platform.console" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.branch.read");
  assert.equal(calls.at(-1).params.id, "branch.platform.console");
});

test("platform MCP change-set tool routes through platform change-set handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, id: request.params?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "list"
    },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.list");
  assert.equal(calls.at(-1).path, "/api/platform-change-sets");

  const created = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "create",
      id: "changeset.platform.console",
      branchId: "branch.platform.console",
      title: "Platform console slice"
    },
    callHandler
  });
  assert.equal(created.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.create");
  assert.equal(calls.at(-1).path, "/api/platform-change-sets");

  const edited = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "edit",
      changeSetId: "changeset.platform.console",
      edits: [{ path: "plugins/platform/platform-console.rvm", content: "module plugin.platform.console {}" }]
    },
    callHandler
  });
  assert.equal(edited.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.edit");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const read = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "read",
      changeSetId: "changeset.platform.console"
    },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.read");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const removed = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "removeEdit",
      changeSetId: "changeset.platform.console",
      pathHash: "abc123"
    },
    callHandler
  });
  assert.equal(removed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.removeEdit");
  assert.equal(calls.at(-1).params.pathHash, "abc123");

  const validated = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "validate",
      changeSetId: "changeset.platform.console"
    },
    callHandler
  });
  assert.equal(validated.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.validate");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const applied = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "apply",
      changeSetId: "changeset.platform.console"
    },
    callHandler
  });
  assert.equal(applied.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.apply");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const rejected = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "reject",
      changeSetId: "changeset.platform.console",
      reason: "No longer needed"
    },
    callHandler
  });
  assert.equal(rejected.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.reject");

  const abandoned = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "abandon",
      changeSetId: "changeset.platform.console",
      reason: "Superseded"
    },
    callHandler
  });
  assert.equal(abandoned.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.abandon");
});

test("platform MCP test tool routes through platform test-run handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: request.handler === "platform.testRun.create" ? 201 : 200, body: { ok: true, handler: request.handler, id: request.params?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.test", {
    args: { operation: "list", id: "branch.demo" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testRuns");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const ran = await executeMcpTool("platform.test", {
    args: {
      operation: "run",
      id: "testRun.platform.demo",
      gateId: "gate:plugins/platform/platform.test.js",
      branchId: "branch.platform.demo",
      changeSetId: "changeSet:platform-demo",
      candidateSnapshotId: "candidateSnapshot:platform-demo:1"
    },
    callHandler
  });
  assert.equal(ran.isError, false);
  assert.equal(calls.at(-1).handler, "platform.testRun.create");
  assert.equal(calls.at(-1).path, "/api/platform-test-runs");
  assert.equal(calls.at(-1).body.id, "testRun.platform.demo");
  assert.equal(calls.at(-1).body.gateId, "gate:plugins/platform/platform.test.js");

  const read = await executeMcpTool("platform.test", {
    args: { operation: "read", id: "testRun.platform.demo" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.testRun.read");
  assert.equal(calls.at(-1).path, "/api/platform-test-runs/testRun.platform.demo");
  assert.equal(calls.at(-1).params.id, "testRun.platform.demo");
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
