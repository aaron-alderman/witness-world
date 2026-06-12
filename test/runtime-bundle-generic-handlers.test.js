import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import {
  createInspectBundleHandlers,
  createPracticalBackendOauthHandlers
} from "../src/runtime-bundle-generic-handlers.js";

test("inspect bundle handlers consume shared authority services for widget version gates", async () => {
  const world = createWorld();
  const calls = [];
  let gated = null;
  const handlers = createInspectBundleHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    logger: { info() {}, error() {} },
    send: () => {},
    sendJson: () => {
      throw new Error("sendJson should not be called when gate fails");
    },
    readJson: async () => ({}),
    sendGateFailure: (_res, gate) => {
      gated = gate;
    },
    authorityServices: {
      ensureTargetAuthority(actor, target) {
        calls.push({ actor, target });
        return { ok: false, status: 403, reason: "forbidden" };
      }
    },
    requestActors: () => [],
    requestVisibleWitnesses: () => [],
    processSelection: () => ({}),
    processViewInputs: () => ({}),
    frontendTraceProcesses: new Set()
  });

  await handlers["widgetVersions.rollback"]({
    res: {},
    params: { soul: "banner" },
    requestActor: "aaron"
  });

  assert.deepEqual(calls, [{ actor: "aaron", target: "banner" }]);
  assert.deepEqual(gated, { ok: false, status: 403, reason: "forbidden" });
});

test("practical-backend oauth handlers consume shared authority services for runner-scoped reads", async () => {
  const world = createWorld();
  const calls = [];
  let gated = null;
  const handlers = createPracticalBackendOauthHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => ({}),
    sendJson: () => {
      throw new Error("sendJson should not be called when gate fails");
    },
    sendGateFailure: (_res, gate) => {
      gated = gate;
    },
    requireBackendCapabilities: () => ({ ok: true, status: 200, reason: null }),
    randomUUID: () => "uuid",
    normalizeAuthOAuthConfig: () => ({ ok: true, provider: "stub", autoCreate: true }),
    authOAuthFlowId: () => "oauth-flow",
    authOAuthCallbackBaseUrl: () => "http://127.0.0.1/api/oauth/callback",
    normalizeAuthOAuthProfile: () => ({ externalId: "stub-user", actor: "stub-user", username: "stub-user", label: "Stub User" }),
    emitAuthOauthFlow: () => ({}),
    currentOauthLinkByProviderAccount: () => null,
    emitAuthOauthLink: () => "oauth-link",
    emitAuthOauthSession: () => ({}),
    currentOauthLinkForRunner: () => null,
    authOAuthReadShape: row => row,
    authOAuthLinkTitle: () => "OAuth Link",
    currentIdentityIndex: () => ({ byId: {}, byUsername: {}, rows: [] }),
    sanitizeAuthOauthSegment: value => value,
    createIdentity: () => {
      throw new Error("createIdentity should not be called in gate failure test");
    },
    createSessionForIdentity: () => {
      throw new Error("createSessionForIdentity should not be called in gate failure test");
    },
    sessionResponseShape: () => ({}),
    sessionCookieHeader: () => "",
    oauthLinksForRunner: () => [],
    authorityServices: {
      ensureTargetAuthority(actor, target) {
        calls.push({ actor, target });
        return { ok: false, status: 403, reason: "forbidden" };
      }
    }
  });

  await handlers["auth.oauth.links.list"]({
    res: {},
    requestActor: "aaron",
    appContext: { serverRunnerId: "runner-1" }
  });

  assert.deepEqual(calls, [{ actor: "aaron", target: "runner-1" }]);
  assert.deepEqual(gated, { ok: false, status: 403, reason: "forbidden" });
});
