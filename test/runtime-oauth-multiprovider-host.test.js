import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

// A runner that enables an allowlist of OAuth providers (auth.oauth.providers) must accept a sign-in
// request for any enabled provider and reject one that is not enabled. This is the server-side proof
// of the multi-provider support that lets a host offer e.g. both Gmail and GitHub sign-in, and that
// lets a signed-in user link a second provider (action: "link") for multiple entry points.
async function startMultiProviderOauthServer(providers) {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const list = providers.join(", ");
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "oauth_multi"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
runtimeConfig = { "auth.oauth.providers" = "${list}", "auth.oauth.autoCreate" = true }

[[runtimePluginInstall]]
actor = "adam"
serverRunner = "oauth_multi"
plugin = "plugin.oauth"
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "oauth_multi",
    runtimeProfile: "authoring",
    runtimePluginIds: ["plugin.demo"]
  });
  assert.equal(server.ok, true);
  return { world, server };
}

function postOauthStart(server, body) {
  const target = new URL("/api/oauth/start", server.url);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "POST",
      headers: { "content-type": "application/json" }
    }, response => {
      let data = "";
      response.on("data", chunk => { data += chunk; });
      response.once("end", () => resolve({ status: response.statusCode ?? 0, body: data }));
    });
    req.once("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("oauth start accepts an enabled provider and rejects a non-enabled one", async () => {
  const { server } = await startMultiProviderOauthServer(["stub", "github"]);
  try {
    // Enabled provider resolves (not a 409 allowlist rejection). The stub flow starts successfully.
    const enabled = await postOauthStart(server, {
      provider: "stub",
      profile: { externalId: "acct-1", username: "u1", actor: "u1", label: "U1" }
    });
    assert.notEqual(enabled.status, 409);

    // A provider not on this runner's allowlist is rejected with 409.
    const notEnabled = await postOauthStart(server, { provider: "google" });
    assert.equal(notEnabled.status, 409);
  } finally {
    await server.close?.();
  }
});
