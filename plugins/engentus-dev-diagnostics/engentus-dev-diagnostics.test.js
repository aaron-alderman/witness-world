import assert from "node:assert/strict";
import test from "node:test";
import { bundleId, createHandlers, providers, routes, surfaces } from "./runtime.js";

test("engentus dev diagnostics plugin exposes a dev-only support-assets bundle", () => {
  assert.equal(bundleId, "bundle-engentus-dev-diagnostics");
  assert.deepEqual(routes, []);
  assert.deepEqual(surfaces, []);
  assert.equal(typeof createHandlers, "function");
  assert.equal(providers.some(provider => provider.kind === "surfaceRuntimeSupportAssets"), true);
});
