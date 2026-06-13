import test from "node:test";
import assert from "node:assert/strict";
import { bundleId, handlerCatalog, routes, createHandlers } from "./runtime.js";
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
