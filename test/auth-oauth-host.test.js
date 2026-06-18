import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0] || "";
}

// Minimal OIDC provider double: serves /token and /userinfo so the generic OIDC adapter exercises a
// real token exchange + userinfo fetch through the server's injected fetch.
function startMockOidcProvider({
  tokenStatus = 200,
  userinfoStatus = 200,
  accessToken = "tok_abc",
  userinfo = { sub: "oidc-user-1", preferred_username: "oidcuser", name: "OIDC User" }
} = {}) {
  const received = { tokenBody: null, userinfoAuth: null, userinfoHeaders: null };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === "/token") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        received.tokenBody = body;
        res.statusCode = tokenStatus;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(tokenStatus < 300 ? { access_token: accessToken, token_type: "bearer" } : { error: "token_failed" }));
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/userinfo") {
      received.userinfoAuth = req.headers.authorization || null;
      received.userinfoHeaders = req.headers;
      res.statusCode = userinfoStatus;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(userinfoStatus < 300 ? userinfo : { error: "userinfo_failed" }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        received,
        close: () => new Promise(done => server.close(done))
      });
    });
  });
}

function oidcRuntimeConfig(providerUrl) {
  return namedOauthRuntimeConfig("oidc", providerUrl);
}

// Named-vendor presets supply endpoint defaults; tests override them to the local mock so the preset's
// field mapping / required headers are exercised deterministically.
function namedOauthRuntimeConfig(provider, providerUrl) {
  return [
    `"auth.oauth.provider" = "${provider}"`,
    `"auth.oauth.autoCreate" = true`,
    `"auth.oauth.${provider}.clientId" = "client-1"`,
    `"auth.oauth.${provider}.clientSecret" = "secret-1"`,
    `"auth.oauth.${provider}.authorizeUrl" = "${providerUrl}/authorize"`,
    `"auth.oauth.${provider}.tokenUrl" = "${providerUrl}/token"`,
    `"auth.oauth.${provider}.userinfoUrl" = "${providerUrl}/userinfo"`
  ].join(", ");
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
    assert.equal(callbackBody.session.authenticatedIdentity, callbackBody.identity.id);
    assert.equal(callbackBody.session.authenticatedActor, "stub-user-1");
    assert.equal(callbackBody.session.effectiveIdentity, callbackBody.identity.id);
    assert.equal(callbackBody.session.effectiveActor, "stub-user-1");
    assert.equal(callbackBody.session.authorityMode, "direct");

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
    assert.equal(diagnosticsBody.oauth.providers.includes("stub"), true);

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
    assert.equal(linkedBody.session.authenticatedIdentity, "identity.aaron");
    assert.equal(linkedBody.session.effectiveActor, "aaron");
    assert.equal(linkedBody.session.authorityMode, "direct");

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
    assert.equal(loginCallbackBody.session.authenticatedIdentity, "identity.aaron");
    assert.equal(loginCallbackBody.session.effectiveActor, "aaron");
    assert.equal(loginCallbackBody.session.authorityMode, "direct");

    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.link" && witness.body?.identity === "identity.aaron"));
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.session" && witness.body?.identity === "identity.aaron"));
  } finally {
    await server.close();
  }
});

test("auth.oauth oidc provider exchanges the code, fetches userinfo, and links a real identity", async () => {
  const provider = await startMockOidcProvider();
  const { world, server } = await startOauthServer({ runtimeConfig: oidcRuntimeConfig(provider.url) });
  try {
    const started = await postOauthStart(server, { provider: "oidc" });
    assert.equal(started.status, 200);
    const startedBody = await started.json();
    assert.equal(startedBody.flow.provider, "oidc");
    const authorizeUrl = new URL(startedBody.flow.authorizeUrl);
    assert.equal(authorizeUrl.origin + authorizeUrl.pathname, `${provider.url}/authorize`);
    assert.equal(authorizeUrl.searchParams.get("client_id"), "client-1");
    assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
    assert.equal(authorizeUrl.searchParams.get("state"), startedBody.flow.state);

    const callback = await oauthCallback(server, "oidc", { state: startedBody.flow.state, code: "real-code-1" });
    assert.equal(callback.status, 200);
    const callbackBody = await callback.json();
    assert.equal(callbackBody.createdIdentity, true);
    assert.equal(callbackBody.link.providerAccountId, "oidc-user-1");
    assert.equal(callbackBody.identity.actor, "oidcuser");
    assert.equal(callbackBody.session.authenticated, true);

    // The provider actually received the authorization code and confidential client secret.
    assert.match(provider.received.tokenBody, /code=real-code-1/);
    assert.match(provider.received.tokenBody, /client_secret=secret-1/);
    assert.equal(provider.received.userinfoAuth, "Bearer tok_abc");

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.oauth.providerAccountCount, 1);
    assert.equal(diagnosticsBody.oauth.providers.includes("oidc"), true);

    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.callback" && witness.body?.providerAccountId === "oidc-user-1"));
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.session"));
  } finally {
    await server.close();
    await provider.close();
  }
});

test("auth.oauth oidc token exchange failure witnesses callback.failed and creates no link", async () => {
  const provider = await startMockOidcProvider({ tokenStatus: 500 });
  const { world, server } = await startOauthServer({ runtimeConfig: oidcRuntimeConfig(provider.url) });
  try {
    const started = await postOauthStart(server, { provider: "oidc" });
    const startedBody = await started.json();

    const callback = await oauthCallback(server, "oidc", { state: startedBody.flow.state, code: "real-code-2" });
    assert.equal(callback.status, 502);
    assert.match((await callback.json()).error, /token exchange responded 500/);
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.callback.failed" && witness.body?.id === startedBody.flow.id));

    const listed = await listOauthLinks(server);
    assert.equal((await listed.json()).links.length, 0);
  } finally {
    await server.close();
    await provider.close();
  }
});

test("auth.oauth oidc links a signed-in identity onto the existing session", async () => {
  const provider = await startMockOidcProvider({ userinfo: { sub: "oidc-aaron", preferred_username: "aaron-oidc", name: "Aaron OIDC" } });
  const { world, server } = await startOauthServer({
    runtimeConfig: oidcRuntimeConfig(provider.url),
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

    const linkStart = await postOauthStart(server, { provider: "oidc", action: "link" }, { cookie: login.cookie });
    assert.equal(linkStart.status, 200);
    const linkStartBody = await linkStart.json();
    assert.equal(linkStartBody.flow.action, "link");

    const linked = await oauthCallback(server, "oidc", { state: linkStartBody.flow.state, code: "real-code-3" }, { cookie: login.cookie });
    assert.equal(linked.status, 200);
    const linkedBody = await linked.json();
    assert.equal(linkedBody.createdIdentity, false);
    assert.equal(linkedBody.link.identity, "identity.aaron");
    assert.equal(linkedBody.link.providerAccountId, "oidc-aaron");

    const definedIdentities = world.allWitnesses().filter(witness => witness.process === "defineIdentity");
    assert.equal(definedIdentities.length, 1);
  } finally {
    await server.close();
    await provider.close();
  }
});

test("auth.oauth google preset links a real identity via the OIDC adapter", async () => {
  const provider = await startMockOidcProvider({ userinfo: { sub: "google-sub-1", email: "user@gmail.test", name: "Google User" } });
  const { world, server } = await startOauthServer({ runtimeConfig: namedOauthRuntimeConfig("google", provider.url) });
  try {
    const started = await postOauthStart(server, { provider: "google" });
    assert.equal(started.status, 200);
    const startedBody = await started.json();
    assert.equal(startedBody.flow.provider, "google");
    assert.equal(new URL(startedBody.flow.authorizeUrl).pathname, "/authorize");

    const callback = await oauthCallback(server, "google", { state: startedBody.flow.state, code: "google-code" });
    assert.equal(callback.status, 200);
    const callbackBody = await callback.json();
    assert.equal(callbackBody.createdIdentity, true);
    assert.equal(callbackBody.link.providerAccountId, "google-sub-1");

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.oauth.providers.includes("google"), true);
    assert.equal(diagnosticsBody.oauth.providerAccountCount, 1);
    assert(world.allWitnesses().some(witness => witness.process === "auth.oauth.callback" && witness.body?.providerAccountId === "google-sub-1"));
  } finally {
    await server.close();
    await provider.close();
  }
});

test("auth.oauth github preset coerces the numeric id and sends the required User-Agent", async () => {
  const provider = await startMockOidcProvider({ userinfo: { id: 12345, login: "octocat", name: "The Octocat" } });
  const { world, server } = await startOauthServer({ runtimeConfig: namedOauthRuntimeConfig("github", provider.url) });
  try {
    const started = await postOauthStart(server, { provider: "github" });
    assert.equal(started.status, 200);
    const startedBody = await started.json();
    assert.equal(startedBody.flow.provider, "github");

    const callback = await oauthCallback(server, "github", { state: startedBody.flow.state, code: "github-code" });
    assert.equal(callback.status, 200);
    const callbackBody = await callback.json();
    assert.equal(callbackBody.createdIdentity, true);
    assert.equal(callbackBody.link.providerAccountId, "12345");
    assert.equal(callbackBody.identity.actor, "octocat");

    // GitHub's user API requires a User-Agent; the preset must supply it through the generic adapter.
    assert.ok(provider.received.userinfoHeaders["user-agent"]);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.oauth.providers.includes("github"), true);
    assert.equal(diagnosticsBody.oauth.providerAccountCount, 1);
  } finally {
    await server.close();
    await provider.close();
  }
});
