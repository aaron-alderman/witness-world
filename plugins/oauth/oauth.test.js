import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, createHandlers, handlerCatalog, providers, routes, surfaces } from "./runtime.js";
import { createOAuthProvider } from "./oauth-providers.js";
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

test("oauth oidc provider routes plain-http token and userinfo exchange through witness-core when configured", async () => {
  const provider = createOAuthProvider({
    oidc: {
      clientId: "client-1",
      clientSecret: "secret-1",
      authorizeUrl: "http://127.0.0.1:4010/authorize",
      tokenUrl: "http://127.0.0.1:4010/token",
      userinfoUrl: "http://127.0.0.1:4010/userinfo",
      scope: "openid profile",
      externalIdField: "sub",
      usernameField: "preferred_username",
      labelField: "name"
    }
  });
  const calls = [];

  const profile = await provider.resolveProfile({
    code: "code-1",
    callbackUrl: "http://127.0.0.1:3000/api/oauth/callback/oidc",
    fetchImpl: async () => {
      throw new Error("direct fetch should not be used for plain-http witness-core oauth requests");
    },
    witnessCoreBridge: {
      coreUrl: "http://127.0.0.1:8788",
      async executeHttpOutbound(input) {
        calls.push(input);
        if (input.url.endsWith("/token")) {
          return {
            transport: "network",
            status: 200,
            headers: { "content-type": "application/json" },
            bodyText: "{\"access_token\":\"token-1\"}"
          };
        }
        return {
          transport: "network",
          status: 200,
          headers: { "content-type": "application/json" },
          bodyText: "{\"sub\":\"acct-1\",\"preferred_username\":\"ada\",\"name\":\"Ada Lovelace\"}"
        };
      }
    },
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "adam"
    }
  });

  assert.deepEqual(profile, {
    externalId: "acct-1",
    username: "ada",
    label: "Ada Lovelace"
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://127.0.0.1:4010/token");
  assert.equal(calls[0].method, "POST");
  assert.match(String(calls[0].bodyText || ""), /grant_type=authorization_code/);
  assert.equal(calls[0].correlation.actor, "adam");
  assert.equal(calls[1].url, "http://127.0.0.1:4010/userinfo");
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[1].headers.authorization, "Bearer token-1");
});

test("oauth oidc provider propagates witness-core bridge failure instead of silently falling back for plain-http requests", async () => {
  const provider = createOAuthProvider({
    oidc: {
      clientId: "client-1",
      clientSecret: "secret-1",
      authorizeUrl: "http://127.0.0.1:4010/authorize",
      tokenUrl: "http://127.0.0.1:4010/token",
      userinfoUrl: "http://127.0.0.1:4010/userinfo",
      scope: "openid profile",
      externalIdField: "sub"
    }
  });

  await assert.rejects(
    provider.resolveProfile({
      code: "code-1",
      callbackUrl: "http://127.0.0.1:3000/api/oauth/callback/oidc",
      fetchImpl: async () => {
        throw new Error("direct fetch should not be used");
      },
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async executeHttpOutbound() {
          throw Object.assign(new Error("witness core unavailable"), {
            status: 503,
            code: "WITNESS_CORE_UNAVAILABLE"
          });
        }
      },
      correlation: {
        sessionId: "session-1",
        surfaceId: "surface-1",
        actor: "adam"
      }
    }),
    error => error?.status === 503 && error?.code === "WITNESS_CORE_UNAVAILABLE"
  );
});

test("oauth oidc provider routes https token and userinfo exchange through witness-core when authoritative mode is configured", async () => {
  const calls = [];
  const provider = createOAuthProvider({
    oidc: {
      clientId: "client-1",
      clientSecret: "secret-1",
      authorizeUrl: "https://accounts.example.test/authorize",
      tokenUrl: "https://accounts.example.test/token",
      userinfoUrl: "https://accounts.example.test/userinfo",
      scope: "openid profile",
      externalIdField: "sub"
    }
  });

  assert.deepEqual(
    await provider.resolveProfile({
      code: "code-1",
      callbackUrl: "http://127.0.0.1:3000/api/oauth/callback/oidc",
      fetchImpl: async () => {
        throw new Error("direct fetch should not be used when witness-core authority is configured");
      },
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async executeHttpOutbound(input) {
          calls.push(input);
          if (input.url.endsWith("/token")) {
            return {
              status: 200,
              headers: { "content-type": "application/json" },
              bodyText: JSON.stringify({ access_token: "https-token" })
            };
          }
          if (input.url.endsWith("/userinfo")) {
            return {
              status: 200,
              headers: { "content-type": "application/json" },
              bodyText: JSON.stringify({ sub: "user-https", preferred_username: "ada" })
            };
          }
          throw new Error(`unexpected outbound url ${input.url}`);
        }
      },
      correlation: {
        sessionId: "session-1",
        surfaceId: "surface-1",
        actor: "adam"
      }
    }),
    { externalId: "user-https", username: "ada", label: "ada" }
  );
  assert.deepEqual(calls.map(entry => entry.url), [
    "https://accounts.example.test/token",
    "https://accounts.example.test/userinfo"
  ]);
  assert.equal(calls[0].correlation.actor, "adam");
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
