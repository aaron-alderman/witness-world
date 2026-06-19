import assert from "node:assert/strict";
import test from "node:test";
import { bundleId, createHandlers, handlerCatalog, providers, routes, surfaces } from "./runtime.js";

test("engentus dev diagnostics plugin exposes a dev-only support-assets bundle", () => {
  assert.equal(bundleId, "bundle-engentus-dev-diagnostics");
  assert.deepEqual(routes, []);
  assert.deepEqual(surfaces, []);
  assert.equal(typeof createHandlers, "function");
  assert.deepEqual(handlerCatalog.pageHandlers, ["engentus.debug.page"]);
  assert.equal(providers.some(provider => provider.kind === "surfaceRuntimeSupportAssets"), true);
});

test("engentus dev diagnostics support script wires the debug sidecar on Engentus surfaces", () => {
  const provider = providers.find(entry => entry.kind === "surfaceRuntimeSupportAssets");
  const asset = provider.factory({ rootSurface: { id: "EngentusRoot" }, devMode: true });

  assert.equal(typeof asset?.scriptBody, "string");
  assert.match(asset.scriptBody, /Open Debug View/);
  assert.match(asset.scriptBody, /BroadcastChannel/);
  assert.match(asset.scriptBody, /highlight-target/);
  assert.match(asset.scriptBody, /set-inspect-mode/);
  assert.match(asset.scriptBody, /hover-target/);
  assert.match(asset.scriptBody, /wcssPreview/);
  assert.match(asset.scriptBody, /__sourceryCompanionPinned/);
  assert.match(asset.scriptBody, /registerEngentusShellExpectationProvider/);
});

test("engentus debug page handler requires platform-config access", async () => {
  const responses = [];
  const handlers = createHandlers({
    send: (_res, status, contentType, body) => responses.push({ status, contentType, body })
  });

  await handlers["engentus.debug.page"]({
    res: {},
    requestUrl: new URL("http://localhost/engentus/debug"),
    requestSession: {
      featureAccess__engentus_platform_config: "hidden"
    },
    appContext: {}
  });

  assert.equal(responses[0].status, 403);
  assert.equal(responses[0].contentType, "text/html");
  assert.match(responses[0].body, /access is required to open the debug sidecar/i);
});

test("engentus debug page renders the focused inspector layout for granted sessions", async () => {
  const responses = [];
  const handlers = createHandlers({
    send: (_res, status, contentType, body) => responses.push({ status, contentType, body })
  });

  await handlers["engentus.debug.page"]({
    res: {},
    requestUrl: new URL("http://localhost/engentus/debug?previewSessionId=preview-1&debugSessionId=debug-1"),
    requestSession: {
      featureAccess__engentus_platform_config: "granted"
    },
    appContext: {
      appPreviewSessionManager: {
        readSession() {
          return {
            id: "preview-1",
            status: "active",
            previewRevision: 2,
            invalidReason: null,
            sources: [{ file: "C:/tmp/app/shell-auth.rvm", sourceId: "app/shell-auth.rvm" }]
          };
        }
      }
    }
  });

  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].contentType, "text/html");
  assert.match(responses[0].body, /Focused Component/);
  assert.match(responses[0].body, /Authored Properties/);
  assert.match(responses[0].body, /Pick In Tab 1/);
  assert.match(responses[0].body, /Candidate Matches/);
  assert.match(responses[0].body, /WCSS Tokens/);
  assert.match(responses[0].body, /Generated CSS/);
  assert.match(responses[0].body, /debug-selection-target/);
});
