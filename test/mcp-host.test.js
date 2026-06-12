import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { MCP_PROTOCOL_VERSION } from "../src/mcp.js";

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-mcp-host-"));
}

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

async function openSession(serverUrl, { username = "aaron", password = username } = {}) {
  const response = await fetch(`${serverUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    response,
    body: await response.json(),
    cookie: cookieHeader(response.headers.get("set-cookie"))
  };
}

async function startBlankServer() {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost" });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: await tempRuntimeRoot()
  });
  assert.equal(server.ok, true);
  return { world, server };
}

async function requestJson(serverUrl, pathname, { method = "POST", cookie = "", body = null } = {}) {
  const response = await fetch(`${serverUrl}${pathname}`, {
    method,
    headers: {
      ...(body != null ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {})
    },
    ...(body != null ? { body: JSON.stringify(body) } : {})
  });
  return {
    response,
    body: await response.json()
  };
}

async function mcpRequest(serverUrl, serverId, payload, {
  cookie = "",
  token = null,
  protocolVersion = null,
  origin = null,
  method = "POST"
} = {}) {
  const response = await fetch(`${serverUrl}/mcp/${encodeURIComponent(serverId)}`, {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
      ...(origin ? { origin } : {})
    },
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {})
  });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null
  };
}

test("mcp http supports initialize, filtered tool listing, tool calls, and local-only hardening", async () => {
  const { server } = await startBlankServer();
  try {
    assert.equal((await requestJson(server.url, "/api/identities", {
      body: {
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "aaron",
        homePerspective: "aaron:personal"
      }
    })).response.status, 201);
    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    assert.equal((await requestJson(server.url, "/api/server-runners", {
      cookie: login.cookie,
      body: {
        id: "mcp_runner",
        backendHost: "backendHost",
        frontendHost: "frontendHost"
      }
    })).response.status, 201);
    assert.equal((await requestJson(server.url, "/api/mcp-servers", {
      cookie: login.cookie,
      body: {
        id: "personal_mcp",
        label: "Personal MCP",
        serverRunner: "mcp_runner",
        transports: ["http"]
      }
    })).response.status, 201);
    assert.equal((await requestJson(server.url, "/api/mcp-tool-installs", {
      cookie: login.cookie,
      body: {
        server: "personal_mcp",
        tool: "world.read",
        actingMode: "delegated"
      }
    })).response.status, 201);

    const initialize = await mcpRequest(server.url, "personal_mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} }
    }, { cookie: login.cookie });
    assert.equal(initialize.response.status, 200);
    assert.equal(initialize.body.result.protocolVersion, MCP_PROTOCOL_VERSION);

    const missingHeader = await mcpRequest(server.url, "personal_mcp", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }, { cookie: login.cookie });
    assert.equal(missingHeader.response.status, 400);
    assert.equal(missingHeader.body.error.message, "mcp-protocol-version header required");

    const getRejected = await mcpRequest(server.url, "personal_mcp", null, {
      cookie: login.cookie,
      method: "GET"
    });
    assert.equal(getRejected.response.status, 405);

    const originRejected = await mcpRequest(server.url, "personal_mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} }
    }, { cookie: login.cookie, origin: "https://example.com" });
    assert.equal(originRejected.response.status, 403);

    const list = await mcpRequest(server.url, "personal_mcp", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
      params: {}
    }, { cookie: login.cookie, protocolVersion: MCP_PROTOCOL_VERSION });
    assert.equal(list.response.status, 200);
    assert.deepEqual(list.body.result.tools.map(tool => tool.name), ["world.read"]);

    const call = await mcpRequest(server.url, "personal_mcp", {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "world.read",
        arguments: { view: "bootstrapState" }
      }
    }, { cookie: login.cookie, protocolVersion: MCP_PROTOCOL_VERSION });
    assert.equal(call.response.status, 200);
    assert.equal(call.body.result.isError, false);
    assert.equal(call.body.result.structuredContent.serverRunners.some(row => row.id === "mcp_runner"), true);
    assert.equal(call.body.result.structuredContent.mcpServers.some(row => row.id === "personal_mcp"), true);
  } finally {
    await server.close();
  }
});

test("mcp http service tools use bearer auth and enforce installed context scopes", async () => {
  const { server } = await startBlankServer();
  try {
    assert.equal((await requestJson(server.url, "/api/identities", {
      body: {
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "aaron",
        homePerspective: "aaron:personal"
      }
    })).response.status, 201);
    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    assert.equal((await requestJson(server.url, "/api/server-runners", {
      cookie: login.cookie,
      body: {
        id: "mcp_runner",
        backendHost: "backendHost",
        frontendHost: "frontendHost",
        runtimeConfigJson: JSON.stringify({
          "mcp.service_world.token": { value: "topsecret" }
        })
      }
    })).response.status, 201);
    assert.equal((await requestJson(server.url, "/api/contexts", {
      cookie: login.cookie,
      body: { id: "ctx.docs", label: "Docs" }
    })).response.status, 201);
    assert.equal((await requestJson(server.url, "/api/contexts", {
      cookie: login.cookie,
      body: { id: "ctx.other", label: "Other" }
    })).response.status, 201);
    assert.equal((await requestJson(server.url, "/api/mcp-servers", {
      cookie: login.cookie,
      body: {
        id: "service_world",
        label: "Service World",
        serverRunner: "mcp_runner",
        serviceIdentity: "aaron",
        transports: ["http"]
      }
    })).response.status, 201);
    assert.equal((await requestJson(server.url, "/api/mcp-tool-installs", {
      cookie: login.cookie,
      body: {
        server: "service_world",
        tool: "authoring.write",
        actingMode: "service",
        scopeContexts: ["ctx.docs"]
      }
    })).response.status, 201);

    const initialize = await mcpRequest(server.url, "service_world", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} }
    }, { token: "topsecret" });
    assert.equal(initialize.response.status, 200);

    const list = await mcpRequest(server.url, "service_world", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }, { token: "topsecret", protocolVersion: MCP_PROTOCOL_VERSION });
    assert.equal(list.response.status, 200);
    assert.deepEqual(list.body.result.tools.map(tool => tool.name), ["authoring.write"]);

    const allowed = await mcpRequest(server.url, "service_world", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "authoring.write",
        arguments: {
          action: "context.create",
          body: {
            id: "ctx.docs.child",
            label: "Docs Child",
            parent: "ctx.docs"
          }
        }
      }
    }, { token: "topsecret", protocolVersion: MCP_PROTOCOL_VERSION });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.body.result.isError, false);
    assert.equal(allowed.body.result.structuredContent.context.id, "ctx.docs.child");

    const blocked = await mcpRequest(server.url, "service_world", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "authoring.write",
        arguments: {
          action: "context.create",
          body: {
            id: "ctx.other.child",
            label: "Other Child",
            parent: "ctx.other"
          }
        }
      }
    }, { token: "topsecret", protocolVersion: MCP_PROTOCOL_VERSION });
    assert.equal(blocked.response.status, 200);
    assert.equal(blocked.body.result.isError, true);
    assert.equal(blocked.body.result.structuredContent.error, "tool call is outside installed mcp context scope");
  } finally {
    await server.close();
  }
});
