import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, routes, surfaces } from "./runtime.js";
import { renderBackendSeamsPage } from "./backend-seams-page.js";
import { createPracticalBackendSupportServices } from "./support-services.js";

function diagnosticsFixture() {
  return {
    capabilities: [],
    runtimeConfig: { fieldCount: 2, missingCount: 1 },
    jobs: { queuedCount: 0, deadLetterCount: 0 },
    dbSql: { datasourceCount: 1, operationCount: 3 },
    search: { indexCount: 1, queryCount: 2 },
    oauth: { flowCount: 1, linkCount: 1 },
    outbound: { total: 4 },
    webhooks: { total: 2, rejectedCount: 1 },
    notifications: { total: 5 },
    assets: { total: 6, ingestRetryableCount: 1, searchRefreshableCount: 1 },
    filesContexts: [],
    storage: { assetsRoot: "/tmp/assets", blobsRoot: "/tmp/blobs" },
    repairs: { ingestRetryable: [], searchRefreshable: [] },
    failures: {
      dbSqlFailed: [],
      searchIndexFailed: [],
      authOauthFailed: [],
      httpOutboundFailed: [],
      httpOutboundRequestFailed: [],
      assetUploadFailed: [],
      assetContentReadFailed: [],
      fsBlobFailed: [],
      fsStreamFailed: [],
      jobDeadLetter: [],
      webhookReceiveFailed: [],
      webhookRejected: [],
      notifyEmailRenderFailed: [],
      notifySmsRenderFailed: []
    }
  };
}

test("backend-seams plugin owns catalog, routes, surface, manifest, and handler factory", async () => {
  assert.equal(bundleId, "bundle-backend-seams");
  assert.deepEqual(handlerCatalog.authorableHandlers, ["backendSeams.read", "page.backendSeams"]);
  assert.deepEqual(handlerCatalog.pageHandlers, ["page.backendSeams"]);
  assert.deepEqual(handlerCatalog.dispatchHandlers, ["page.backendSeams", "backendSeams.read"]);
  assert.equal(routes.some(route => route.method === "GET" && route.path === "/backend-seams" && route.handler === "page.backendSeams"), true);
  assert.equal(routes.some(route => route.method === "GET" && route.path === "/api/backend-seams" && route.handler === "backendSeams.read"), true);
  assert.equal(surfaces.some(surface => surface.id === "surface:backend-seams" && surface.href === "/backend-seams"), true);
  assert.equal(typeof createHandlers, "function");

  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.activatesBundles, ["bundle-backend-seams"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(manifest.contributes.routes.some(route => route.path === "/api/backend-seams"), true);
  assert.equal(manifest.contributes.surfaces.some(surface => surface.id === "surface:backend-seams"), true);
});

test("backend-seams plugin owns practical backend support service registry", async () => {
  const supportSource = await readFile(new URL("./support-services.js", import.meta.url), "utf8");

  assert.equal(typeof createPracticalBackendSupportServices, "function");
  assert.equal(supportSource.includes("export function createPracticalBackendSupportServices"), true);
  assert.equal(supportSource.includes("assetDiagnostics"), true);
  assert.equal(supportSource.includes("enqueueNotification"), true);
  await assert.rejects(readFile(new URL("../../src/runtime-practical-backend-support-services.js", import.meta.url), "utf8"));
});

test("backend-seams declares repair actions through authored semantic click handlers", async () => {
  const pageSource = await readFile(new URL("./backend-seams-page.wtoml", import.meta.url), "utf8");
  const html = renderBackendSeamsPage(diagnosticsFixture());

  assert.equal(pageSource.includes('action = "retryAssetIngest"'), true);
  assert.equal(pageSource.includes('on = "click:retryAssetIngest"'), true);
  assert.equal(pageSource.includes('action = "refreshAssetSearch"'), true);
  assert.equal(pageSource.includes('on = "click:refreshAssetSearch"'), true);
  assert.match(html, /data-action="retryAssetIngest"/);
  assert.match(html, /data-action="refreshAssetSearch"/);
  assert.match(html, /click:retryAssetIngest/);
  assert.match(html, /click:refreshAssetSearch/);
});

test("backend-seams handlers render page and expose diagnostics read model", async () => {
  const observations = [];
  const responses = [];
  const fixture = diagnosticsFixture();
  const handlers = createHandlers({
    world: {
      observe(event) {
        observations.push(event);
      }
    },
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    send: (_res, status, contentType, body) => {
      responses.push({ status, contentType, body });
    },
    sendJson: (_res, status, body) => {
      responses.push({ status, body });
    },
    assetDiagnostics: async () => fixture,
    renderBackendSeamsPage,
    runtimeBundleSummaryForProfile: profile => ({ bundleIds: ["bundle-core-runtime", "bundle-backend-seams"], profile }),
    getRuntimeBundleHandlerDiagnostics: () => ({ activeBundleIds: ["bundle-backend-seams"] }),
    defaultRuntimeProfile: "full"
  });

  await handlers["page.backendSeams"]({
    res: {},
    requestActor: "aaron",
    appContext: { runtimeProfile: "minimal" }
  });
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].contentType, "text/html; charset=utf-8");
  assert.match(responses[0].body, /<h1[^>]*>Backend Seams<\/h1>/);
  assert.match(responses[0].body, /\/api\/backend-seams/);
  assert.match(responses[0].body, /backend_seams_json|backend-seams-initial-state/);

  await handlers["backendSeams.read"]({
    res: {},
    requestActor: "aaron",
    appContext: { runtimeProfile: "minimal" }
  });
  assert.equal(responses[1].status, 200);
  assert.equal(responses[1].body.runtime.profile, "minimal");
  assert.deepEqual(responses[1].body.runtime.bundleIds, ["bundle-core-runtime", "bundle-backend-seams"]);
  assert.deepEqual(responses[1].body.runtime.handlerImplementations.activeBundleIds, ["bundle-backend-seams"]);
  assert.equal(observations.some(event => event.process === "frontend.renderBackendSeamsPage"), true);
  assert.equal(observations.some(event => event.process === "backend.readBackendSeams"), true);
});

test("backend-seams handlers reject unsigned requests", async () => {
  const observations = [];
  const responses = [];
  const handlers = createHandlers({
    world: {
      observe(event) {
        observations.push(event);
      }
    },
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    send: () => {
      throw new Error("send should not be called");
    },
    sendJson: (_res, status, body) => {
      responses.push({ status, body });
    },
    assetDiagnostics: async () => diagnosticsFixture(),
    renderBackendSeamsPage,
    runtimeBundleSummaryForProfile: () => ({}),
    getRuntimeBundleHandlerDiagnostics: () => ({}),
    defaultRuntimeProfile: "full"
  });

  await handlers["backendSeams.read"]({ res: {}, requestActor: null, appContext: {} });
  await handlers["page.backendSeams"]({ res: {}, requestActor: null, appContext: {} });
  assert.deepEqual(responses, [
    { status: 401, body: { error: "sign in first" } },
    { status: 401, body: { error: "sign in first" } }
  ]);
  assert.equal(observations.some(event => event.process === "backend.readBackendSeams.failed"), true);
  assert.equal(observations.some(event => event.process === "frontend.renderBackendSeamsPage.failed"), true);
});
