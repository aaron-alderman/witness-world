import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookieHeader,
  headerValue,
  readJson,
  resolveRequestContext,
  sendJson,
  sessionCookieHeader,
  sseFrame
} from "../src/runtime-http-utils.js";

test("runtime HTTP utils shape SSE frames, headers, and session cookies", () => {
  assert.equal(sseFrame(3, { id: "w3", process: "todo.create" }), 'data: {"count":3,"id":"w3","process":"todo.create"}\n\n');
  assert.equal(headerValue(["alpha", "beta"]), "alpha");
  assert.equal(headerValue("solo"), "solo");
  assert.equal(sessionCookieHeader("session-1"), "witness_session=session-1; Path=/; HttpOnly; SameSite=Lax");
  assert.equal(clearSessionCookieHeader(), "witness_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
});

test("runtime HTTP utils resolve request context from cookie-backed session before actor header", () => {
  const request = {
    headers: {
      cookie: "witness_session=session-1",
      "x-witness-actor": "header-actor"
    }
  };
  const sessionStore = new Map([["session-1", {
    actor: "cookie-actor",
    identity: "identity.cookie",
    authenticatedIdentity: "identity.cookie",
    authenticatedActor: "cookie-actor",
    effectiveIdentity: "identity.cookie",
    effectiveActor: "cookie-actor",
    authorityMode: "direct",
    assumptionGrantId: null
  }]]);

  assert.deepEqual(resolveRequestContext(request, sessionStore), {
    actor: "cookie-actor",
    identity: "identity.cookie",
    authenticatedIdentity: "identity.cookie",
    authenticatedActor: "cookie-actor",
    effectiveIdentity: "identity.cookie",
    effectiveActor: "cookie-actor",
    authorityMode: "direct",
    assumptionGrantId: null,
    session: {
      actor: "cookie-actor",
      identity: "identity.cookie",
      authenticatedIdentity: "identity.cookie",
      authenticatedActor: "cookie-actor",
      effectiveIdentity: "identity.cookie",
      effectiveActor: "cookie-actor",
      authorityMode: "direct",
      assumptionGrantId: null
    }
  });
  assert.deepEqual(resolveRequestContext({ headers: { "x-witness-actor": "header-actor" } }, sessionStore, { allowActorHeader: true }), {
    actor: "header-actor",
    identity: null,
    authenticatedIdentity: null,
    authenticatedActor: "header-actor",
    effectiveIdentity: null,
    effectiveActor: "header-actor",
    authorityMode: "direct",
    assumptionGrantId: null,
    session: null
  });
});

test("runtime HTTP utils prefer canonical authority tuple over compatibility aliases", () => {
  const request = {
    headers: {
      cookie: "witness_session=session-2"
    }
  };
  const sessionStore = new Map([["session-2", {
    actor: "legacy-actor",
    identity: "identity.legacy",
    authenticatedIdentity: "identity.aaron",
    authenticatedActor: "aaron",
    effectiveIdentity: "identity.callan",
    effectiveActor: "callan",
    authorityMode: "assumed",
    assumptionGrantId: "identity.aaron=>callan"
  }]]);
  assert.deepEqual(resolveRequestContext(request, sessionStore), {
    actor: "callan",
    identity: "identity.callan",
    authenticatedIdentity: "identity.aaron",
    authenticatedActor: "aaron",
    effectiveIdentity: "identity.callan",
    effectiveActor: "callan",
    authorityMode: "assumed",
    assumptionGrantId: "identity.aaron=>callan",
    session: sessionStore.get("session-2")
  });
});

test("runtime HTTP utils send JSON and parse request bodies", async () => {
  const writes = [];
  const response = {
    writeHead(status, headers) {
      writes.push({ status, headers });
    },
    end(body) {
      writes.push({ body });
    }
  };
  sendJson(response, 201, { ok: true }, { "x-test": "1" });
  assert.deepEqual(writes, [
    { status: 201, headers: { "content-type": "application/json", "x-test": "1" } },
    { body: JSON.stringify({ ok: true }) }
  ]);

  const listeners = new Map();
  const request = {
    on(event, listener) {
      listeners.set(event, listener);
    }
  };
  const parsedPromise = readJson(request);
  listeners.get("data")(Buffer.from('{"value":42}', "utf8"));
  listeners.get("end")();
  assert.deepEqual(await parsedPromise, { value: 42 });
});
