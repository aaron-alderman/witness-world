import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0] || "";
}

async function openSession(serverUrl, { username = "aaron", password = "aaron" } = {}) {
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

async function startOauthServer({ runtimeConfig, extra = "" } = {}) {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "oauth_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
runtimeConfig = { ${runtimeConfig || `"auth.oauth.provider" = "stub", "auth.oauth.autoCreate" = true`} }
${extra}
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "oauth_server"
  });
  return { world, server };
}

function postOauthStart(server, body, headers = {}) {
  return fetch(`${server.url}/api/oauth/start`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

function oauthCallback(server, provider, { state, code = "stub-success" }, headers = {}) {
  return fetch(`${server.url}/api/oauth/callback/${encodeURIComponent(provider)}?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`, {
    headers
  });
}

function listOauthLinks(server, headers = { "x-witness-actor": "adam" }) {
  return fetch(`${server.url}/api/oauth/links`, { headers });
}

function readOauthLink(server, id, headers = { "x-witness-actor": "adam" }) {
  return fetch(`${server.url}/api/oauth/links/${encodeURIComponent(id)}`, { headers });
}

test("auth.oauth creates a linked identity on first stub login and exposes inspection endpoints", async () => {
  const { world, server } = await startOauthServer();
  try {
    const started = await postOauthStart(server, {
      provider: "stub",
      profile: {
        externalId: "stub-account-1",
        username: "stub-user-1",
        actor: "stub-user-1",
        label: "Stub User One"
      }
    });
    assert.equal(started.status, 200);
    const startedBody = await started.json();
    assert.equal(startedBody.flow.provider, "stub");
    assert.equal(startedBody.flow.action, "login");

    const callback = await oauthCallback(server, "stub", { state: startedBody.flow.state });
    assert.equal(callback.status, 200);
    const callbackBody = await callback.json();
    assert.equal(callbackBody.createdIdentity, true);
    assert.equal(callbackBody.identity.actor, "stub-user-1");
    assert.equal(callbackBody.link.providerAccountId, "stub-account-1");
    assert.equal(callbackBody.session.authenticated, true);

    const session = await fetch(`${server.url}/api/session`, {
      headers: { cookie: cookieHeader(callback.headers.get("set-cookie")) }
    });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).identity, callbackBody.identity.id);

    const listed = await listOauthLinks(server);
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.links.length, 1);
    assert.equal(listBody.links[0].id, callbackBody.link.id);

    const read = await readOauthLink(server, callbackBody.link.id);
    assert.equal(read.status, 200);
    const readBody = await read.json();
    assert.equal(readBody.link.identity, callbackBody.identity.id);
    assert.equal(readBody.link.status, "linked");

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.oauth.linkCount, 1);
    assert.equal(diagnosticsBody.oauth.failedCount, 0);
    assert.equal(diagnosticsBody.oauth.providerAccountCount, 1);
    assert.equal(diagnosticsBody.backendCapabilities.find(row => row.id === "auth.oauth").providerAdapters.some(row => row.id === "stub" && row.default === true), true);

    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.start"));
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.callback"));
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.link"));
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.session"));
    assert(world.allWitnesses().some(witness => witness.process === "defineIdentity" && witness.body?.id === callbackBody.identity.id));
  } finally {
    await server.close();
  }
});

test("auth.oauth records a failed stub callback without creating a link", async () => {
  const { world, server } = await startOauthServer();
  try {
    const started = await postOauthStart(server, {
      provider: "stub",
      profile: {
        externalId: "stub-account-fail",
        username: "stub-user-fail",
        actor: "stub-user-fail",
        label: "Stub User Fail"
      }
    });
    assert.equal(started.status, 200);
    const startedBody = await started.json();

    const callback = await oauthCallback(server, "stub", { state: startedBody.flow.state, code: "stub-fail" });
    assert.equal(callback.status, 401);
    assert.equal((await callback.json()).error, "stub oauth code rejected");
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.callback.failed" && witness.body?.id === startedBody.flow.id));

    const listed = await listOauthLinks(server);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).links.length, 0);
  } finally {
    await server.close();
  }
});

test("auth.oauth links a signed-in identity and later logs in through the existing oauth link", async () => {
  const { world, server } = await startOauthServer({
    extra: `
[[identity]]
actor = "aaron"
id = "identity.aaron"
label = "Aaron"
username = "aaron"
password = "aaron"
homePerspective = "aaron:personal"
`
  });
  try {
    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    const linkStart = await postOauthStart(server, {
      provider: "stub",
      action: "link",
      profile: {
        externalId: "stub-aaron-link",
        username: "stub-aaron-link",
        actor: "stub-aaron-link",
        label: "Aaron Stub"
      }
    }, { cookie: login.cookie });
    assert.equal(linkStart.status, 200);
    const linkStartBody = await linkStart.json();
    assert.equal(linkStartBody.flow.action, "link");

    const linked = await oauthCallback(server, "stub", { state: linkStartBody.flow.state }, { cookie: login.cookie });
    assert.equal(linked.status, 200);
    const linkedBody = await linked.json();
    assert.equal(linkedBody.createdIdentity, false);
    assert.equal(linkedBody.link.identity, "identity.aaron");
    assert.equal(linkedBody.session.identity, "identity.aaron");

    const definedIdentities = world.allWitnesses().filter(witness => witness.process === "defineIdentity");
    assert.equal(definedIdentities.length, 1);

    const loginStart = await postOauthStart(server, {
      provider: "stub",
      profile: {
        externalId: "stub-aaron-link",
        username: "ignored",
        actor: "ignored",
        label: "Ignored"
      }
    });
    assert.equal(loginStart.status, 200);
    const loginStartBody = await loginStart.json();
    assert.equal(loginStartBody.flow.action, "login");

    const loginCallback = await oauthCallback(server, "stub", { state: loginStartBody.flow.state });
    assert.equal(loginCallback.status, 200);
    const loginCallbackBody = await loginCallback.json();
    assert.equal(loginCallbackBody.createdIdentity, false);
    assert.equal(loginCallbackBody.identity.id, "identity.aaron");
    assert.equal(loginCallbackBody.session.identity, "identity.aaron");

    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.link" && witness.body?.identity === "identity.aaron"));
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.session" && witness.body?.identity === "identity.aaron"));
  } finally {
    await server.close();
  }
});
