import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

// One process, one world, two server runners bound to different hosts. The master host activates
// plugin.notifications; the engentus host does not. Host-header dispatch must route each request to
// the right runner, and a bundle endpoint must only answer on the host that activates its plugin.
async function startMultiHostServer() {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "master_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
default = true
hosts = ["platform.localhost"]

[[serverRunner]]
actor = "adam"
id = "engentus_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
hosts = ["engentus.localhost"]

[[runtimePluginInstall]]
actor = "adam"
serverRunner = "master_server"
plugin = "plugin.notifications"
`);
  const server = await startServer(world, {
    actor: "adam",
    runtimeProfile: "authoring",
    runtimePluginIds: ["plugin.demo"]
  });
  assert.equal(server.ok, true);
  return { world, server };
}

function get(server, pathname, host) {
  const target = new URL(pathname, server.url);
  return new Promise((resolve, reject) => {
    const request = http.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: {
        host,
        "x-witness-actor": "adam"
      }
    }, response => {
      response.resume();
      response.once("end", () => resolve({ status: response.statusCode ?? 0 }));
    });
    request.once("error", reject);
    request.end();
  });
}

test("multi-host: a bundle endpoint answers only on the host that activates its plugin", async () => {
  const { server } = await startMultiHostServer();
  try {
    // master_server installs plugin.notifications, so /api/notifications is mounted there. It may
    // return 401/503 depending on auth/capability, but it must NOT be a profile-gated 404.
    const onMaster = await get(server, "/api/notifications", "platform.localhost");
    assert.notEqual(onMaster.status, 404);

    // engentus_server does not install the plugin, so the same bundle endpoint is not mounted.
    const onEngentus = await get(server, "/api/notifications", "engentus.localhost");
    assert.equal(onEngentus.status, 404);

    // Unknown host falls back to the default runner (master), so it behaves like the master host.
    const onUnknown = await get(server, "/api/notifications", "unknown.localhost");
    assert.notEqual(onUnknown.status, 404);
  } finally {
    await server.close?.();
  }
});

test("multi-host: profile-activated bundle endpoints stay mounted on every host", async () => {
  const { server } = await startMultiHostServer();
  try {
    const onMaster = await get(server, "/_bootstrap", "platform.localhost");
    assert.notEqual(onMaster.status, 404);

    const onEngentus = await get(server, "/_bootstrap", "engentus.localhost");
    assert.notEqual(onEngentus.status, 404);

    const onUnknown = await get(server, "/_bootstrap", "unknown.localhost");
    assert.notEqual(onUnknown.status, 404);
  } finally {
    await server.close?.();
  }
});
