import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { createRuntimeAuthOAuthSupportServices } from "../src/runtime-auth-oauth-support-services.js";

test("runtime auth oauth support services normalize config, callback base URL, and profile defaults", () => {
  const services = createRuntimeAuthOAuthSupportServices({
    world: createWorld(),
    backendHost: "backendHost",
    randomUUID: () => "uuid-1",
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    headerValue: value => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "")
  });

  assert.equal(services.authOAuthFlowId(), "oauthFlow:uuid-1");
  assert.equal(
    services.authOAuthCallbackBaseUrl(
      { headers: { host: "example.test:8787" } },
      { runtimeConfig: {} }
    ),
    "http://example.test:8787/api/oauth/callback"
  );
  assert.equal(
    services.authOAuthCallbackBaseUrl(
      { headers: { host: "ignored.test" } },
      { runtimeConfig: { "auth.oauth.callbackBaseUrl": "https://app.example.test/oauth/" } }
    ),
    "https://app.example.test/oauth"
  );
  assert.deepEqual(
    services.normalizeAuthOAuthConfig({
      runtimeConfig: {
        "auth.oauth.provider": "stub",
        "auth.oauth.autoCreate": "false"
      }
    }),
    { ok: true, status: 200, provider: "stub", autoCreate: false }
  );
  assert.deepEqual(
    services.normalizeAuthOAuthProfile({ externalId: "Ext 1", username: "Ada User" }),
    {
      externalId: "Ext 1",
      actor: "ada-user",
      username: "Ada User",
      label: "Stub Ada User"
    }
  );
});

test("runtime auth oauth support services emit flow, link, and session witnesses with bundle-owned metadata", () => {
  const world = createWorld();
  const services = createRuntimeAuthOAuthSupportServices({
    world,
    backendHost: "backendHost",
    randomUUID: () => "uuid-2",
    runtimeConfigLookup: () => undefined,
    headerValue: value => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "")
  });
  const flow = {
    id: "oauthFlow:uuid-2",
    serverRunner: "runner-1",
    provider: "stub",
    state: "state-1",
    action: "login",
    requestedIdentity: null,
    callbackUrl: "http://127.0.0.1/api/oauth/callback/stub",
    authorizeUrl: "http://127.0.0.1/api/oauth/callback/stub?state=state-1"
  };
  const identity = {
    id: "identity.oauth.stub.ada",
    actor: "ada",
    label: "Ada",
    homePerspective: "perspective.ada"
  };
  const profile = {
    externalId: "acct-1",
    label: "Ada"
  };

  services.emitAuthOauthFlow({
    actor: "backendHost",
    flow,
    process: "auth.oauth.start",
    providerAccountId: "acct-1",
    identity: identity.id,
    createdIdentity: true
  });
  const linkId = services.emitAuthOauthLink({
    actor: "backendHost",
    flow,
    identity,
    profile,
    createdIdentity: true
  });
  services.emitAuthOauthSession({
    actor: identity.actor,
    flow,
    identity,
    session: { id: "session-1" },
    createdIdentity: true
  });

  assert.equal(linkId, "oauthLink:stub:acct-1");
  assert.equal(services.authOAuthLinkTitle({ provider: "stub", providerAccountId: "acct-1", label: "Ada" }), "stub Ada");
  assert.deepEqual(
    services.authOAuthReadShape({
      id: linkId,
      title: "stub Ada",
      serverRunner: "runner-1",
      provider: "stub",
      providerAccountId: "acct-1",
      identity: identity.id,
      actor: identity.actor,
      label: identity.label,
      status: "linked",
      createdIdentity: true,
      lastError: null
    }),
    {
      id: linkId,
      title: "stub Ada",
      serverRunner: "runner-1",
      provider: "stub",
      providerAccountId: "acct-1",
      identity: identity.id,
      actor: identity.actor,
      label: identity.label,
      status: "linked",
      createdIdentity: true,
      lastError: null
    }
  );

  const oauthWitnesses = world.allWitnesses().filter(witness => witness.process.startsWith("auth.oauth."));
  assert.equal(oauthWitnesses.length, 3);
  assert.equal(oauthWitnesses[0].process, "auth.oauth.start");
  assert.equal(oauthWitnesses[0].body.providerAccountId, "acct-1");
  assert.equal(oauthWitnesses[1].process, "auth.oauth.link");
  assert.equal(oauthWitnesses[1].body.linkId, linkId);
  assert.equal(oauthWitnesses[2].process, "auth.oauth.session");
  assert.equal(oauthWitnesses[2].body.sessionId, "session-1");
});
