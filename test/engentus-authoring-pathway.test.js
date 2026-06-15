import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { MCP_PROTOCOL_VERSION } from "../plugins/mcp/mcp-tools.js";
import { runCanonicalAuthoringPathwayProbe } from "../scripts/mcp-authoring-replay-probe.mjs";

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-engentus-authoring-pathway-"));
}

async function startAuthoringProbeServer() {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile: "authoring" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile: "authoring" });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeStartupMode: "bootstrap",
    runtimePluginIds: ["plugin.mcp"]
  });
  assert.equal(server.ok, true);
  return server;
}

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

async function requestJson(serverUrl, pathname, {
  method = "POST",
  cookie = "",
  body = null,
  token = null,
  protocolVersion = null
} = {}) {
  const response = await fetch(`${serverUrl}${pathname}`, {
    method,
    headers: {
      ...(body != null ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {})
    },
    ...(body != null ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null
  };
}

async function ensureBootstrapSession(serverUrl, {
  identityId = "identity.aaron",
  actor = "aaron",
  label = "Aaron",
  username = "aaron",
  password = "aaron"
} = {}) {
  let login = await requestJson(serverUrl, "/api/session", {
    body: { username, password }
  });
  if (login.response.status === 200) return cookieHeader(login.response.headers.get("set-cookie"));
  const created = await requestJson(serverUrl, "/api/identities", {
    body: {
      id: identityId,
      actor,
      label,
      username,
      password,
      homePerspective: `${actor}:personal`
    }
  });
  assert.ok([201, 409].includes(created.response.status));
  login = await requestJson(serverUrl, "/api/session", {
    body: { username, password }
  });
  assert.equal(login.response.status, 200);
  return cookieHeader(login.response.headers.get("set-cookie"));
}

async function mcpRequest(serverUrl, serverId, payload, {
  token,
  protocolVersion = null
} = {}) {
  return requestJson(serverUrl, `/mcp/${encodeURIComponent(serverId)}`, {
    token,
    protocolVersion,
    body: payload
  });
}

async function provisionAuthoringMcpServer(serverUrl) {
  const cookie = await ensureBootstrapSession(serverUrl);
  const stamp = `pathway_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const runnerId = `${stamp}_runner`;
  const mcpServerId = `${stamp}_mcp`;
  const token = `${stamp}_token`;
  assert.equal((await requestJson(serverUrl, "/api/server-runners", {
    cookie,
    body: {
      id: runnerId,
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      runtimeConfigJson: JSON.stringify({
        [`mcp.${mcpServerId}.token`]: { value: token }
      })
    }
  })).response.status, 201);
  assert.equal((await requestJson(serverUrl, "/api/mcp-servers", {
    cookie,
    body: {
      id: mcpServerId,
      label: "Pathway MCP",
      serverRunner: runnerId,
      serviceIdentity: "aaron",
      transports: ["http"]
    }
  })).response.status, 201);
  for (const tool of ["authoring.write", "world.read"]) {
    assert.equal((await requestJson(serverUrl, "/api/mcp-tool-installs", {
      cookie,
      body: {
        server: mcpServerId,
        tool,
        actingMode: "service"
      }
    })).response.status, 201);
  }
  const initialized = await mcpRequest(serverUrl, mcpServerId, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} }
  }, { token });
  assert.equal(initialized.response.status, 200);
  return { mcpServerId, token };
}

async function mcpToolCall(serverUrl, serverId, token, name, args, id = 1) {
  const result = await mcpRequest(serverUrl, serverId, {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  }, {
    token,
    protocolVersion: MCP_PROTOCOL_VERSION
  });
  assert.equal(result.response.status, 200);
  return result.body.result;
}

test("canonical docs encode the single-track canonical authoring pathway probe", async () => {
  const [desireSpa, policy, pathwayPlaybook] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "docs", "DESIRE-SPA.md"), "utf8"),
    fs.readFile(path.join(process.cwd(), "docs", "LLM-AUTHORING-POLICY.md"), "utf8"),
    fs.readFile(path.join(process.cwd(), "docs", "AUTHORING-REPLAY-PLAYBOOK.md"), "utf8")
  ]);

  assert.match(desireSpa, /canonical authoring pathway probe/i);
  assert.match(desireSpa, /minimal static authored `page\.surface` projection/i);
  assert.match(desireSpa, /route-selected alternate authored `page\.surface` output/i);
  assert.match(policy, /canonical authoring pathway probe/i);
  assert.match(policy, /Blocked means stop, not improvise/i);
  assert.match(policy, /There is no second lane/i);
  assert.match(pathwayPlaybook, /Canonical Authoring Pathway Probe/i);
  assert.match(pathwayPlaybook, /minimal static authored `page\.surface` projection/i);
  assert.match(pathwayPlaybook, /route-selected alternate authored surface output is\s+the next rung/i);
});

test("canonical authoring pathway probe proves the first static page.surface rung", { timeout: 10000 }, async () => {
  const server = await startAuthoringProbeServer();
  try {
    const result = await runCanonicalAuthoringPathwayProbe(server.url);
    assert.equal(result.ok, true);
    assert.deepEqual(result.capabilityChecks.canonicalFrontendModel, ["surface", "process", "projection", "capability"]);
    assert.equal(result.capabilityChecks.publicSurfaceCreate, true);
    assert.equal(result.capabilityChecks.publicProcessCreate, true);
    assert.equal(result.capabilityChecks.publicTypeCreate, true);
    assert.equal(result.capabilityChecks.publicProjectionCreate, true);
    assert.equal(result.capabilityChecks.legacyWidgetCreateHidden, true);
    assert.equal(result.capabilityChecks.legacyFrontendProgramHidden, true);
    assert.equal(result.pathwayProbe.surfaceHttpStatus, 200);
    assert.equal(result.pathwayProbe.staticSurfaceProjectionVisible, true);
    assert.equal(result.pathwayProbe.blockedResetHostVisible, false);
    assert.equal(result.pathwayProbe.firstBlockedRung, null);
    assert.equal(result.blockers.firstBlocked, null);
    assert.deepEqual(result.pathwayProbe.rungResults.map(row => row.id), [
      "matrixBaseline",
      "canonicalActionsExist",
      "staticSurfaceProjection"
    ]);
    assert.equal(result.pathwayProbe.rungResults.every(row => row.status === "supported"), true);
    assert.equal(result.stateChecks.rootSurfacePresent, true);
  } finally {
    await server.close();
  }
});

test("live constrained MCP discovery exposes canonical frontend actions and hides legacy widget-program actions", { timeout: 10000 }, async () => {
  const server = await startAuthoringProbeServer();
  try {
    const { mcpServerId, token } = await provisionAuthoringMcpServer(server.url);
    const listed = await mcpRequest(server.url, mcpServerId, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }, {
      token,
      protocolVersion: MCP_PROTOCOL_VERSION
    });
    assert.equal(listed.response.status, 200);
    const authoringWrite = listed.body.result.tools.find(tool => tool.name === "authoring.write");
    assert.ok(authoringWrite);
    const actions = authoringWrite.inputSchema.properties.action.enum;
    assert.equal(actions.includes("surface.create"), true);
    assert.equal(actions.includes("process.create"), true);
    assert.equal(actions.includes("type.create"), true);
    assert.equal(actions.includes("projection.create"), true);
    assert.equal(actions.includes("message.create"), true);
    assert.equal(actions.includes("frontendProgram.create"), false);
    assert.equal(actions.includes("frontendStep.create"), false);
    assert.equal(actions.includes("widget.create"), false);
    assert.equal(actions.includes("widget.update"), false);
  } finally {
    await server.close();
  }
});

test("live constrained MCP keeps canonical authoring actions available while page.surface exposes pathway semantics", { timeout: 10000 }, async () => {
  const server = await startAuthoringProbeServer();
  try {
    const { mcpServerId, token } = await provisionAuthoringMcpServer(server.url);
    const matrix = await mcpToolCall(server.url, mcpServerId, token, "world.read", {
      view: "authoringMatrix"
    }, 3);
    assert.equal(matrix.isError, false);
    assert.deepEqual(matrix.structuredContent.baseline.publicFrontendModel, ["surface", "process", "projection", "capability"]);

    const processCreate = await mcpToolCall(server.url, mcpServerId, token, "authoring.write", {
      action: "process.create",
      body: { id: "process.demo", handles: [], emits: [], rules: [], state: [] }
    }, 4);
    assert.equal(processCreate.isError, false);
    assert.equal(processCreate.structuredContent.process.id, "process.demo");
    assert.equal(processCreate.structuredContent.witness.process, "desire.defineProcess");

    const typeCreate = await mcpToolCall(server.url, mcpServerId, token, "authoring.write", {
      action: "type.create",
      body: { id: "state.demo", role: "state", valueType: "text", initial: "demo" }
    }, 5);
    assert.equal(typeCreate.isError, false);
    assert.equal(typeCreate.structuredContent.type.id, "state.demo");
    assert.equal(typeCreate.structuredContent.witness.process, "desire.defineType");

    const projectionCreate = await mcpToolCall(server.url, mcpServerId, token, "authoring.write", {
      action: "projection.create",
      body: { id: "projection.demo", projectionKind: "detail", source: "process.demo", props: {} }
    }, 6);
    assert.equal(projectionCreate.isError, false);
    assert.equal(projectionCreate.structuredContent.projection.id, "projection.demo");
    assert.equal(projectionCreate.structuredContent.witness.process, "desire.defineProjection");

    const matrixAfter = await mcpToolCall(server.url, mcpServerId, token, "world.read", {
      view: "authoringMatrix"
    }, 7);
    assert.equal(matrixAfter.isError, false);
    assert.equal(matrixAfter.structuredContent.publicAuthoringConcepts.projection.status, "supported");
    assert.equal(matrixAfter.structuredContent.publicAuthoringConcepts.process.status, "supported");
    assert.equal(matrixAfter.structuredContent.publicAuthoringConcepts.type.status, "supported");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].status, "partial");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pairings.surface, "supported");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pairings.process, "blocked");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pairings.projection, "blocked");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pathwaySemantics.blockedResetHost.status, "supported");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pathwaySemantics.staticSurfaceProjection.status, "supported");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pathwaySemantics.routeSelectedSurface.status, "blocked");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pathwaySemantics.interactiveSurfaceExecution.status, "blocked");
  } finally {
    await server.close();
  }
});
