import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { MCP_PROTOCOL_VERSION } from "../plugins/mcp/mcp-tools.js";
import { runReplayProbe } from "../scripts/mcp-authoring-replay-probe.mjs";

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

test("canonical docs encode the reset single-track replay pathway", async () => {
  const [desireSpa, policy, replayPlaybook] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "docs", "DESIRE-SPA.md"), "utf8"),
    fs.readFile(path.join(process.cwd(), "docs", "LLM-AUTHORING-POLICY.md"), "utf8"),
    fs.readFile(path.join(process.cwd(), "docs", "AUTHORING-REPLAY-PLAYBOOK.md"), "utf8")
  ]);

  assert.match(desireSpa, /plugin\.authoring/i);
  assert.match(desireSpa, /single-track method/i);
  assert.match(desireSpa, /page\.surface` still resolves as a route host/i);
  assert.match(desireSpa, /blocked\/reset host page only/i);
  assert.match(desireSpa, /there is one approved advancement lane/i);
  assert.match(policy, /plugin\.authoring` only/i);
  assert.match(policy, /Blocked means stop, not improvise/i);
  assert.match(policy, /There is no second lane/i);
  assert.match(policy, /serves blocked\/reset host output only/i);
  assert.match(replayPlaybook, /Stop at the first missing primitive/i);
  assert.match(replayPlaybook, /page\.surface` resolves to blocked\/reset host output/i);
  assert.match(replayPlaybook, /only approved proof lane/i);
});

test("MCP replay now proves the blocked reset host and emits one structured blocked handoff", { timeout: 10000 }, async () => {
  const server = await startAuthoringProbeServer();
  try {
    const result = await runReplayProbe(server.url);
    assert.equal(result.ok, true);
    assert.deepEqual(result.capabilityChecks.canonicalFrontendModel, ["surface", "process", "projection", "capability"]);
    assert.equal(result.capabilityChecks.publicSurfaceCreate, true);
    assert.equal(result.capabilityChecks.publicProcessCreate, true);
    assert.equal(result.capabilityChecks.publicTypeCreate, true);
    assert.equal(result.capabilityChecks.publicProjectionCreate, true);
    assert.equal(result.capabilityChecks.legacyWidgetCreateHidden, true);
    assert.equal(result.capabilityChecks.legacyFrontendProgramHidden, true);
    assert.equal(result.replay.surfaceHttpStatus, 200);
    assert.equal(result.replay.surfaceBlockedHostVisible, true);
    assert.equal(result.replay.surfaceHomeHttpStatus, 200);
    assert.equal(result.replay.surfaceHomeBlockedHostVisible, true);
    assert.equal(result.replay.firstBlockedRung, "page.surface");
    assert.equal(result.stateChecks.processPresent, true);
    assert.equal(result.stateChecks.typePresent, true);
    assert.equal(result.stateChecks.projectionPresent, true);
    assert.equal(result.blockers.firstBlocked.limitationType, "platform");
    assert.match(result.blockers.firstBlocked.missingPrimitive, /blocked reset host/i);
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

test("live constrained MCP keeps canonical authoring actions available while page.surface remains blocked", { timeout: 10000 }, async () => {
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
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].status, "blocked");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pairings.surface, "blocked");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pairings.process, "blocked");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].pairings.projection, "blocked");
    assert.equal(matrixAfter.structuredContent.runtimeConsumers["page.surface"].interactiveProjection, "blocked");
    assert.match(matrixAfter.structuredContent.runtimeConsumers["page.surface"].reason, /removed because it embedded app and capability authority/i);
  } finally {
    await server.close();
  }
});
