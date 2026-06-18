import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes } from "./runtime.js";
import { createMcpBundleSupportServices } from "./mcp-support-services.js";
import { MCP_PROTOCOL_VERSION, executeMcpTool, listSupportedMcpTools, mcpToolNames, resolveMcpToolScope } from "./mcp-tools.js";
import { createHandlers as createPlatformHandlers, providers as platformProviders } from "../platform/runtime.js";

function buildRequestUrl(path, query = {}) {
  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function normalizePlatformParity(value) {
  if (Array.isArray(value)) return value.map(normalizePlatformParity);
  if (!value || typeof value !== "object") return value;
  const normalized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      key === "witness"
      || key === "startWitness"
      || key === "finishWitness"
      || key === "summaries"
      || key === "createdAt"
      || key === "updatedAt"
      || key === "capturedAt"
      || key === "producedAt"
      || key === "startedAt"
      || key === "finishedAt"
      || key === "latestActivityAt"
    ) {
      continue;
    }
    normalized[key] = normalizePlatformParity(entry);
  }
  return normalized;
}

function createPlatformParityHarness({
  world = createWorld(),
  appContext = null
} = {}) {
  const handlers = createPlatformHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    platformTestRunner: async ({ command, timeoutMs }) => ({
      startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: "2026-06-18T00:00:01.000Z",
      durationMs: 1000,
      exitCode: 0,
      signal: null,
      status: "passed",
      stdout: `TAP version 13\n1..1\nok 1 - ran ${command}\n`,
      stderr: `<?xml version="1.0" encoding="UTF-8"?><testsuite name="platform" tests="1" failures="0" errors="0" skipped="0"></testsuite>`,
      timedOut: false,
      error: null,
      timeoutMs
    }),
    sendGateFailure: (res, gate) => {
      res.status = gate.status;
      res.body = { error: gate.reason };
    },
    send: (res, status, contentType, body) => {
      res.status = status;
      res.body = body;
      res.contentType = contentType;
    },
    sendJson: (res, status, body) => {
      res.status = status;
      res.body = body;
      res.contentType = "application/json";
    }
  });
  const resolvedAppContext = appContext ?? {
    runtimeProfile: "full",
    project: projector => world.project(projector)
  };
  return {
    world,
    async callHandler(request) {
      const res = {};
      await handlers[request.handler]({
        req: {
          body: request.body ?? {},
          headers: request.headers ?? {},
          on: () => {}
        },
        res,
        params: request.params ?? {},
        requestUrl: buildRequestUrl(request.path, request.query ?? {}),
        requestActor: "aaron",
        requestSession: { id: "session.platform" },
        appContext: resolvedAppContext
      });
      return {
        status: res.status ?? 500,
        body: res.body,
        contentType: res.contentType ?? "application/json",
        buffer: Buffer.from(typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? {}))
      };
    }
  };
}

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
  assert.equal(toolNames.includes("platform.docs"), true);
  assert.equal(toolNames.includes("platform.roadmap"), true);
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
  const platformDocs = listSupportedMcpTools().find(tool => tool.name === "platform.docs");
  const platformRoadmap = listSupportedMcpTools().find(tool => tool.name === "platform.roadmap");
  const platformBranch = listSupportedMcpTools().find(tool => tool.name === "platform.branch");
  const platformProposal = listSupportedMcpTools().find(tool => tool.name === "platform.proposal");
  const platformChangeSet = listSupportedMcpTools().find(tool => tool.name === "platform.changeSet");
  const platformTest = listSupportedMcpTools().find(tool => tool.name === "platform.test");
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("authoringMatrix"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("docs"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("roadmap"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("gaps"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("proposals"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("branches"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testGates"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testRedGreen"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testRuns"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("candidateSnapshots"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("runtimeRevisions"), true);
  assert.deepEqual(platformDocs.inputSchema.properties.operation.enum, ["list", "read"]);
  assert.deepEqual(platformRoadmap.inputSchema.properties.operation.enum, ["list", "read"]);
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
  assert.deepEqual(platformTest.inputSchema.properties.operation.enum, ["list", "read", "run", "runSelected"]);
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
  assert.equal(services.mcpToolAvailable("platform.docs"), false);
  assert.equal(services.mcpToolAvailable("platform.roadmap"), false);
  assert.equal(services.mcpToolAvailable("platform.changeSet"), false);
  assert.equal(services.mcpToolAvailable("platform.test"), false);
  projected.backendCapabilities.add("platform.self");
  assert.equal(services.mcpToolAvailable("platform.read"), true);
  assert.equal(services.mcpToolAvailable("platform.docs"), true);
  assert.equal(services.mcpToolAvailable("platform.roadmap"), true);
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

test("platform MCP docs tool routes docs and roadmap task reads through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null, id: request.query?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.docs", {
    args: { operation: "list" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "docs");
  assert.equal(calls.at(-1).query.id, undefined);

  const read = await executeMcpTool("platform.docs", {
    args: { operation: "read", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "docs");
  assert.equal(calls.at(-1).query.id, "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
});

test("platform MCP roadmap tool routes roadmap reads through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null, id: request.query?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.roadmap", {
    args: { operation: "list" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "roadmap");
  assert.equal(calls.at(-1).query.id, undefined);

  const read = await executeMcpTool("platform.roadmap", {
    args: { operation: "read", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "roadmap");
  assert.equal(calls.at(-1).query.id, "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
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

  const selected = await executeMcpTool("platform.test", {
    args: {
      operation: "runSelected",
      branchId: "branch.platform.demo",
      changeSetId: "changeSet:platform-demo",
      candidateSnapshotId: "candidateSnapshot:platform-demo:1"
    },
    callHandler
  });
  assert.equal(selected.isError, false);
  assert.equal(calls.at(-1).handler, "platform.testRun.create");
  assert.equal(calls.at(-1).path, "/api/platform-test-runs");
  assert.equal(calls.at(-1).body.gateId, undefined);
  assert.equal(calls.at(-1).body.branchId, "branch.platform.demo");
  assert.equal(calls.at(-1).body.changeSetId, "changeSet:platform-demo");
  assert.equal(calls.at(-1).body.candidateSnapshotId, "candidateSnapshot:platform-demo:1");

  const read = await executeMcpTool("platform.test", {
    args: { operation: "read", id: "testRun.platform.demo" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.testRun.read");
  assert.equal(calls.at(-1).path, "/api/platform-test-runs/testRun.platform.demo");
  assert.equal(calls.at(-1).params.id, "testRun.platform.demo");
});

test("implemented platform MCP tools stay in parity with direct platform handler responses", async () => withRegisteredPluginProjectors(platformProviders, async () => {
  const direct = createPlatformParityHarness();
  const viaMcp = createPlatformParityHarness();

  const directDocs = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "docs" }
  });
  const mcpDocs = await executeMcpTool("platform.docs", {
    args: { operation: "list" },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpDocs.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpDocs.structuredContent), normalizePlatformParity(directDocs.body));

  const directRoadmap = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "roadmap", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" }
  });
  const mcpRoadmap = await executeMcpTool("platform.roadmap", {
    args: { operation: "read", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpRoadmap.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpRoadmap.structuredContent), normalizePlatformParity(directRoadmap.body));

  const branchBody = {
    id: "branch.parity.demo",
    title: "Parity branch",
    parentBranchId: null,
    epic: "platform",
    feature: "parity",
    defect: null
  };
  const directBranchCreate = await direct.callHandler({
    handler: "platform.branch.create",
    method: "POST",
    path: "/api/platform-branches",
    body: branchBody
  });
  const mcpBranchCreate = await executeMcpTool("platform.branch", {
    args: {
      operation: "create",
      id: branchBody.id,
      title: branchBody.title,
      epic: branchBody.epic,
      feature: branchBody.feature
    },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpBranchCreate.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpBranchCreate.structuredContent), normalizePlatformParity(directBranchCreate.body));

  const directBranchRead = await direct.callHandler({
    handler: "platform.branch.read",
    method: "GET",
    path: `/api/platform-branches/${encodeURIComponent(branchBody.id)}`,
    params: { id: branchBody.id }
  });
  const mcpBranchRead = await executeMcpTool("platform.branch", {
    args: { operation: "read", id: branchBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpBranchRead.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpBranchRead.structuredContent), normalizePlatformParity(directBranchRead.body));

  const changeSetBody = {
    id: "changeset.parity.demo",
    branchId: branchBody.id,
    title: "Parity change set",
    reason: "Parity test"
  };
  const directChangeSetCreate = await direct.callHandler({
    handler: "platform.changeSet.create",
    method: "POST",
    path: "/api/platform-change-sets",
    body: changeSetBody
  });
  const mcpChangeSetCreate = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "create",
      id: changeSetBody.id,
      branchId: changeSetBody.branchId,
      title: changeSetBody.title,
      reason: changeSetBody.reason
    },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpChangeSetCreate.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpChangeSetCreate.structuredContent), normalizePlatformParity(directChangeSetCreate.body));

  const directChangeSetRead = await direct.callHandler({
    handler: "platform.changeSet.read",
    method: "GET",
    path: `/api/platform-change-sets/${encodeURIComponent(changeSetBody.id)}`,
    params: { id: changeSetBody.id }
  });
  const mcpChangeSetRead = await executeMcpTool("platform.changeSet", {
    args: { operation: "read", changeSetId: changeSetBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpChangeSetRead.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpChangeSetRead.structuredContent), normalizePlatformParity(directChangeSetRead.body));

  const proposalBody = {
    id: "proposal.platform.parity",
    action: "branch.create",
    body: {
      id: "branch.platform.proposal.parity",
      title: "Proposal parity branch"
    },
    reason: "Parity proposal"
  };
  const directProposalCreate = await direct.callHandler({
    handler: "platform.proposal.create",
    method: "POST",
    path: "/api/platform-proposals",
    body: proposalBody
  });
  const mcpProposalCreate = await executeMcpTool("platform.proposal", {
    args: proposalBody,
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpProposalCreate.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpProposalCreate.structuredContent), normalizePlatformParity(directProposalCreate.body));

  const directTestList = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "testRuns", id: branchBody.id }
  });
  const mcpTestList = await executeMcpTool("platform.test", {
    args: { operation: "list", id: branchBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpTestList.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpTestList.structuredContent), normalizePlatformParity(directTestList.body));

  const testRunBody = {
    id: "testRun.parity.demo",
    gateId: "gate:plugins/platform/platform.test.js",
    branchId: branchBody.id
  };
  const directTestRun = await direct.callHandler({
    handler: "platform.testRun.create",
    method: "POST",
    path: "/api/platform-test-runs",
    body: testRunBody
  });
  const mcpTestRun = await executeMcpTool("platform.test", {
    args: {
      operation: "run",
      id: testRunBody.id,
      gateId: testRunBody.gateId,
      branchId: testRunBody.branchId
    },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpTestRun.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpTestRun.structuredContent), normalizePlatformParity(directTestRun.body));

  const directTestRead = await direct.callHandler({
    handler: "platform.testRun.read",
    method: "GET",
    path: `/api/platform-test-runs/${encodeURIComponent(testRunBody.id)}`,
    params: { id: testRunBody.id }
  });
  const mcpTestRead = await executeMcpTool("platform.test", {
    args: { operation: "read", id: testRunBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpTestRead.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpTestRead.structuredContent), normalizePlatformParity(directTestRead.body));
}));

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
