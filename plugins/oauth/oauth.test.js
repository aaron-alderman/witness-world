import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, createHandlers, handlerCatalog, providers, routes, surfaces } from "./runtime.js";
import { createRuntimeAuthOAuthSupportServices } from "./support-services.js";

test("oauth plugin owns auth.oauth catalog, routes, and handler factory", async () => {
  assert.equal(bundleId, "bundle-oauth");
  assert.equal(handlerCatalog.dispatchHandlers.includes("auth.oauth.start"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("auth.oauth.callback"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("auth.oauth.links.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("auth.oauth.links.read"), true);
  assert.equal(routes.some(route => route.handler === "auth.oauth.start"), true);
  assert.equal(routes.some(route => route.handler === "auth.oauth.links.read"), true);
  assert.equal(surfaces.length, 0);
  assert.equal(typeof createHandlers, "function");

  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.activatesBundles, ["bundle-oauth"]);
  assert.equal(manifest.contributes.capabilities.some(row => row.id === "auth.oauth"), true);
});

test("oauth plugin owns OAuth support service normalization and read-shaping", () => {
  const emitted = [];
  const services = createRuntimeAuthOAuthSupportServices({
    world: {
      emit(event) {
        emitted.push(event);
        return { id: "witness-1", ...event };
      }
    },
    backendHost: "backendHost",
    randomUUID: () => "fixed",
    runtimeConfigLookup: (config, key) => config?.[key],
    headerValue: value => Array.isArray(value) ? String(value[0] || "") : String(value || "")
  });

  assert.equal(services.authOAuthFlowId(), "oauthFlow:fixed");
  assert.equal(services.normalizeAuthOAuthConfig({ runtimeConfig: { "auth.oauth.provider": "stub" } }).ok, true);
  assert.equal(services.normalizeAuthOAuthConfig({ runtimeConfig: {} }).reason, "auth.oauth.provider not configured");
  assert.equal(services.authOAuthCallbackBaseUrl({ headers: { host: "example.test" } }, { runtimeConfig: {} }), "http://example.test/api/oauth/callback");
  assert.equal(services.sanitizeAuthOauthSegment("A User!"), "a-user");

  const flow = {
    id: "flow-1",
    serverRunner: "runner-1",
    provider: "stub",
    state: "state",
    action: "login",
    callbackUrl: "http://cb",
    authorizeUrl: "http://auth"
  };
  services.emitAuthOauthFlow({ actor: "adam", flow, process: "auth.oauth.start" });
  assert.equal(emitted[0].process, "auth.oauth.start");
});

test("oauth plugin registers OAuth flow and link read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "oauth.flow.demo" });
  createThing(world, { actor: "system", id: "oauth.link.demo" });
  world.emit({
    process: "defineIdentity",
    actor: "system",
    body: {
      id: "identity.ada",
      actor: "ada",
      label: "Ada",
      username: "ada",
      password: "pw"
    }
  });
  world.emit({
    process: "defineOauthFlow",
    actor: "system",
    claims: [
      relation("oauth.flow.demo", "hasModuleKind", "oauthFlow"),
      relation("oauth.flow.demo", "hasTitle", "Demo OAuth Flow")
    ],
    body: { id: "oauth.flow.demo" }
  });
  world.emit({
    process: "defineOauthLink",
    actor: "system",
    claims: [
      relation("oauth.link.demo", "hasModuleKind", "oauthLink"),
      relation("oauth.link.demo", "hasTitle", "Demo OAuth Link")
    ],
    body: { id: "oauth.link.demo" }
  });
  world.emit({
    process: "auth.oauth.start",
    actor: "system",
    body: {
      id: "oauth.flow.demo",
      serverRunner: "runner.demo",
      provider: "stub",
      state: "state-1",
      action: "login",
      requestedIdentity: "identity.ada",
      callbackUrl: "http://example.test/callback",
      authorizeUrl: "http://example.test/auth"
    }
  });
  world.emit({
    process: "auth.oauth.link",
    actor: "system",
    body: {
      id: "oauth.flow.demo",
      linkId: "oauth.link.demo",
      serverRunner: "runner.demo",
      provider: "stub",
      providerAccountId: "acct-1",
      identity: "identity.ada",
      label: "Ada Account",
      createdIdentity: true
    }
  });

  assert.deepEqual(world.project(moduleProjectors.oauthFlows), [{
    id: "oauth.flow.demo",
    title: "Demo OAuth Flow",
    owner: "system",
    context: null,
    serverRunner: "runner.demo",
    provider: "stub",
    state: "state-1",
    action: "login",
    requestedIdentity: "identity.ada",
    linkedIdentity: "identity.ada",
    createdIdentity: "identity.ada",
    providerAccountId: "acct-1",
    status: "created",
    callbackUrl: "http://example.test/callback",
    authorizeUrl: "http://example.test/auth",
    lastError: null
  }]);
  assert.equal(world.project(moduleProjectors.oauthFlowIndex).byState["state-1"].id, "oauth.flow.demo");
  assert.deepEqual(world.project(moduleProjectors.oauthLinks), [{
    id: "oauth.link.demo",
    title: "Demo OAuth Link",
    owner: "system",
    context: null,
    serverRunner: "runner.demo",
    provider: "stub",
    providerAccountId: "acct-1",
    identity: "identity.ada",
    actor: "ada",
    label: "Ada Account",
    flowId: "oauth.flow.demo",
    status: "linked",
    createdIdentity: true,
    lastError: null
  }]);
  assert.equal(world.project(moduleProjectors.oauthLinkIndex).byProviderAccount["stub:acct-1"].id, "oauth.link.demo");
}));
