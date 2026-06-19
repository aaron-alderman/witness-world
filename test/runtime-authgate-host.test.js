import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

// A runner with requireAuth = true is default-deny: every endpoint needs an authenticated session
// except the sign-in/OAuth/MCP allowlist. allowActorHeader = true lets the x-witness-actor header
// stand in for a session, so we can exercise both the denied (no header) and allowed (header) paths
// against the same endpoints without a full login round-trip.
async function startGatedServer() {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "gated_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
requireAuth = true

[[runtimePluginInstall]]
actor = "adam"
serverRunner = "gated_server"
plugin = "plugin.notifications"

[[runtimePluginInstall]]
actor = "adam"
serverRunner = "gated_server"
plugin = "plugin.oauth"
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "gated_server",
    runtimeProfile: "authoring",
    runtimePluginIds: ["plugin.demo"]
  });
  assert.equal(server.ok, true);
  return { world, server };
}

function request(server, { method = "GET", path, actor = null } = {}) {
  const target = new URL(path, server.url);
  const headers = {};
  if (actor) headers["x-witness-actor"] = actor;
  if (method === "POST") headers["content-type"] = "application/json";
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers
    }, response => {
      response.resume();
      response.once("end", () => resolve({ status: response.statusCode ?? 0 }));
    });
    req.once("error", reject);
    if (method === "POST") req.write("{}");
    req.end();
  });
}

test("requireAuth runner denies unauthenticated requests but allows authenticated ones", async () => {
  const { server } = await startGatedServer();
  try {
    // No session, non-exempt endpoint → gate denies with 401.
    const denied = await request(server, { path: "/api/notifications" });
    assert.equal(denied.status, 401);

    // Same endpoint with an authenticated actor → gate passes (handler runs; not a gate 401).
    const allowed = await request(server, { path: "/api/notifications", actor: "adam" });
    assert.notEqual(allowed.status, 401);
  } finally {
    await server.close?.();
  }
});

test("requireAuth runner exempts the sign-in and OAuth entry endpoints", async () => {
  const { server } = await startGatedServer();
  try {
    // Reading/creating a session must be reachable without auth, else nobody could ever sign in.
    const session = await request(server, { path: "/api/session" });
    assert.notEqual(session.status, 401);

    // OAuth start is the login entry point — exempt from the gate (it returns its own status).
    const oauthStart = await request(server, { method: "POST", path: "/api/oauth/start" });
    assert.notEqual(oauthStart.status, 401);
  } finally {
    await server.close?.();
  }
});
