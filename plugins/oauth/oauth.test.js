import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, routes, surfaces } from "./runtime.js";
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
