import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes, createHandlers } from "./runtime.js";
import { createHttpOutboundIoServices, responseHeadersToObject } from "./io-services.js";
import { delayWithSignal, executeHttpOutbound } from "./glue.js";

test("http-outbound plugin owns http.outbound catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-http-outbound");
  assert.equal(handlerCatalog.dispatchHandlers.includes("http.outbound.send"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("http.outbound.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("http.outbound.read"), true);
  assert.equal(routes.some(route => route.handler === "http.outbound.send"), true);
  assert.equal(routes.some(route => route.handler === "http.outbound.list"), true);
  assert.equal(typeof createHandlers, "function");
});

test("http-outbound plugin owns outbound request normalization helpers", () => {
  const services = createHttpOutboundIoServices({
    runtimeConfigLookup: (config, key) => config?.[key],
    runtimeConfigScalar: value => ["string", "number", "boolean"].includes(typeof value),
    positiveInteger: (value, fallback) => Number.isInteger(value) && value > 0 ? value : fallback,
    randomUUID: () => "fixed",
    canCreateInContext: () => ({ ok: true })
  });
  const normalized = services.normalizeOutboundRequest({
    actor: "alice",
    serverRunnerId: "runner-1",
    appContext: {
      runtimeConfig: {
        "http.outbound.timeoutMs": 1200,
        "http.outbound.maxAttempts": 4,
        "http.outbound.retryDelayMs": 75
      }
    },
    body: {
      target: "Example",
      url: "stub://echo",
      json: { ok: true },
      headers: { "X-Test": "1" }
    }
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.outbound.id, "outbound_fixed");
  assert.equal(normalized.outbound.headers["content-type"], "application/json");
  assert.equal(normalized.outbound.headers["x-witness-correlation-id"], "corr_fixed");
  assert.equal(services.outboundTitle(normalized.outbound), "Example");
  assert.equal(services.pickExternalRefId({ "x-request-id": "req-1" }), "req-1");
  assert.equal(services.isRetryableOutboundStatus(503), true);
  assert.equal(services.outboundFailureResponseStatus("outbound timeout"), 504);
  assert.deepEqual(responseHeadersToObject(new Headers({ "X-Test": "1" })), { "x-test": "1" });
});

test("http-outbound plugin owns stub outbound transport glue", async () => {
  await delayWithSignal(0);
  const response = await executeHttpOutbound({
    id: "outbound-1",
    url: "stub://echo",
    method: "POST",
    target: "Example",
    requestBodyKind: "json",
    jsonBody: { ok: true },
    headers: {},
    correlationId: "corr-1"
  }, {
    appContext: { httpOutboundStubState: new Map() },
    attempt: 1,
    signal: new AbortController().signal
  });
  assert.equal(response.transport, "stub");
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.bodyText).target, "Example");
});

test("http-outbound uses witness-core bridge for non-stub outbound when core authority is configured", async () => {
  const calls = [];
  const response = await executeHttpOutbound({
    url: "http://127.0.0.1:4010/outbound",
    method: "POST",
    headers: { authorization: "Bearer token" },
    bodyText: "{\"ok\":true}",
    timeoutMs: 1200,
    actor: "alice"
  }, {
    appContext: {
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async executeHttpOutbound(input) {
          calls.push(input);
          return {
            transport: "network",
            status: 202,
            headers: { "content-type": "application/json" },
            bodyText: "{\"ok\":true}"
          };
        }
      },
      sessionId: "session-1",
      surfaceId: "surface-1",
      httpOutboundStubState: new Map()
    },
    attempt: 1,
    signal: new AbortController().signal
  });

  assert.equal(response.status, 202);
  assert.deepEqual(calls, [{
    url: "http://127.0.0.1:4010/outbound",
    method: "POST",
    headers: { authorization: "Bearer token" },
    bodyText: "{\"ok\":true}",
    timeoutMs: 1200,
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "alice"
    }
  }]);
});

test("http-outbound routes https targets through witness-core when core authority is configured", async () => {
  const calls = [];
  const response = await executeHttpOutbound({
    url: "https://api.example.test/outbound",
    method: "POST",
    headers: { authorization: "Bearer token" },
    bodyText: "{\"ok\":true}",
    timeoutMs: 1200,
    actor: "alice"
  }, {
    appContext: {
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async executeHttpOutbound(input) {
          calls.push(input);
          return {
            transport: "network",
            status: 202,
            headers: { "content-type": "application/json" },
            bodyText: "{\"ok\":true}"
          };
        }
      },
      sessionId: "session-1",
      surfaceId: "surface-1",
      httpOutboundStubState: new Map()
    },
    attempt: 1,
    signal: new AbortController().signal
  });

  assert.equal(response.status, 202);
  assert.deepEqual(calls, [{
    url: "https://api.example.test/outbound",
    method: "POST",
    headers: { authorization: "Bearer token" },
    bodyText: "{\"ok\":true}",
    timeoutMs: 1200,
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "alice"
    }
  }]);
});

test("http-outbound keeps stub transport local even when witness-core is configured", async () => {
  let bridgeCalled = false;
  const response = await executeHttpOutbound({
    id: "outbound-1",
    url: "stub://echo",
    method: "POST",
    target: "Example",
    requestBodyKind: "json",
    jsonBody: { ok: true },
    bodyText: "{\"ok\":true}",
    headers: {},
    correlationId: "corr-1",
    timeoutMs: 1200
  }, {
    appContext: {
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async executeHttpOutbound() {
          bridgeCalled = true;
          throw new Error("bridge should not be used for stub transport");
        }
      },
      httpOutboundStubState: new Map()
    },
    attempt: 1,
    signal: new AbortController().signal
  });

  assert.equal(response.transport, "stub");
  assert.equal(bridgeCalled, false);
});

test("http-outbound bridge failures do not silently fall back to direct fetch", async () => {
  await assert.rejects(
    executeHttpOutbound({
      url: "http://127.0.0.1:4010/outbound",
      method: "GET",
      headers: {},
      timeoutMs: 1200
    }, {
      appContext: {
        witnessCoreBridge: {
          coreUrl: "http://127.0.0.1:8788",
          async executeHttpOutbound() {
            throw Object.assign(new Error("witness core unavailable"), {
              status: 503,
              code: "WITNESS_CORE_UNAVAILABLE"
            });
          }
        },
        httpOutboundStubState: new Map()
      },
      attempt: 1,
      signal: new AbortController().signal
    }),
    error => error?.status === 503 && error?.code === "WITNESS_CORE_UNAVAILABLE"
  );
});

test("http-outbound plugin registers outbound request read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "outbound.demo" });
  world.emit({
    process: "defineOutboundRequest",
    actor: "system",
    claims: [
      relation("outbound.demo", "hasModuleKind", "outboundRequest"),
      relation("outbound.demo", "hasTitle", "Demo Outbound")
    ],
    body: { id: "outbound.demo" }
  });
  world.emit({
    process: "http.outbound.succeeded",
    actor: "system",
    body: {
      id: "outbound.demo",
      context: "ctx.demo",
      serverRunner: "runner.demo",
      target: "Example",
      url: "stub://echo",
      method: "POST",
      transport: "stub",
      authKind: "none",
      requestHeaderNames: ["content-type"],
      requestBodyKind: "json",
      timeoutMs: 1200,
      maxAttempts: 4,
      retryDelayMs: 75,
      attempt: 2,
      correlationId: "corr-1",
      externalRefId: "req-1",
      responseStatus: 200,
      responseContentType: "application/json"
    }
  });

  assert.deepEqual(world.project(moduleProjectors.outboundRequests), [{
    id: "outbound.demo",
    title: "Demo Outbound",
    owner: "system",
    context: "ctx.demo",
    serverRunner: "runner.demo",
    target: "Example",
    url: "stub://echo",
    method: "POST",
    transport: "stub",
    status: "succeeded",
    authKind: "none",
    authConfigKey: null,
    requestHeaderNames: ["content-type"],
    requestBodyKind: "json",
    timeoutMs: 1200,
    maxAttempts: 4,
    retryDelayMs: 75,
    attempt: 2,
    correlationId: "corr-1",
    externalRefId: "req-1",
    responseStatus: 200,
    responseContentType: "application/json",
    lastError: null
  }]);
  assert.equal(world.project(moduleProjectors.outboundRequestIndex).byId["outbound.demo"].status, "succeeded");
}));
