import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, routes, surfaces } from "./runtime.js";

test("runtime-config plugin owns runtimeConfig.read catalog, route, and handler factory", async () => {
  assert.equal(bundleId, "bundle-runtime-config");
  assert.equal(handlerCatalog.dispatchHandlers.includes("runtimeConfig.read"), true);
  assert.equal(handlerCatalog.authorableHandlers.includes("runtimeConfig.read"), true);
  assert.equal(routes.some(route => route.method === "GET" && route.path === "/api/runtime-config" && route.handler === "runtimeConfig.read"), true);
  assert.equal(surfaces.length, 0);
  assert.equal(typeof createHandlers, "function");

  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.activatesBundles, ["bundle-runtime-config"]);
  assert.equal(manifest.contributes.capabilities.some(row => row.id === "runtime.config"), true);
});

test("runtime-config handler exposes only resolved non-secret config values", async () => {
  const observations = [];
  let response = null;
  const handlers = createHandlers({
    world: {
      observe(event) {
        observations.push(event);
      }
    },
    backendHost: "backendHost",
    sendJson: (_res, status, body) => {
      response = { status, body };
    },
    sendGateFailure: () => {
      throw new Error("sendGateFailure should not be called");
    },
    requireBackendCapabilities: () => ({ ok: true }),
    canMutateTarget: () => ({ ok: true })
  });

  await handlers["runtimeConfig.read"]({
    res: {},
    requestActor: "aaron",
    appContext: {
      serverRunnerId: "runner-1",
      runtimeConfigFields: [
        { name: "publicBaseUrl", value: "https://example.test", exposed: true, resolved: true },
        { name: "serviceToken", value: "secret", exposed: false, secret: true, resolved: true },
        { name: "missingValue", exposed: true, resolved: false }
      ]
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.values, { publicBaseUrl: "https://example.test" });
  assert.equal(response.body.fields.length, 3);
  assert.equal(observations[0].process, "runtimeConfig.read");
  assert.equal(observations[0].body.fieldCount, 3);
  assert.equal(observations[0].body.resolvedCount, 2);
});
