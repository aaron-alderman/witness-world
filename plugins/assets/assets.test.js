import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { defineContext, definePerspective, moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { loadRuntimePluginModules } from "../../src/runtime-plugin-loader.js";
import { readRuntimePluginCatalog } from "../../src/runtime-plugin-utils.js";
import { runtimeBundleSummaryForProfile } from "../../src/runtime-bundles.js";
import { bundleId, createHandlers, handlerCatalog, providers, routes, surfaces } from "./runtime.js";
import {
  assetContentUrlForId,
  assetDerivedTextPathForAppContext,
  assetTextUrlForId,
  createPracticalBackendAssetServices
} from "./asset-services.js";

test("assets plugin owns asset catalog, routes, manifest, and handler factory", async () => {
  assert.equal(bundleId, "bundle-assets");
  assert.deepEqual(handlerCatalog.authorableHandlers, [
    "asset.ingest.retry",
    "asset.search.reindex",
    "asset.attachments.list",
    "asset.attach",
    "asset.detach"
  ]);
  assert.equal(handlerCatalog.dispatchHandlers.includes("asset.upload"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("asset.content.read"), true);
  assert.equal(routes.some(route => route.method === "POST" && route.path === "/api/assets" && route.handler === "asset.upload"), true);
  assert.equal(routes.some(route => route.handler === "asset.search.reindex"), true);
  assert.deepEqual(surfaces, []);
  assert.equal(typeof createHandlers, "function");

  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.dependsOnPlugins, [
    "plugin.fs-blob",
    "plugin.fs-stream",
    "plugin.jobs",
    "plugin.search"
  ]);
  assert.deepEqual(manifest.activatesBundles, ["bundle-assets"]);
  assert.deepEqual(manifest.contributes.capabilities, [{ id: "upload.asset" }]);
});

test("minimal plus assets activates required dependency plugins and asset routes only", async () => {
  const catalog = await readRuntimePluginCatalog({
    runtimeProfile: "minimal",
    configuredPluginIds: ["plugin.assets"]
  });
  assert.equal(catalog.activePluginIds.includes("plugin.assets"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.fs-blob"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.fs-stream"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.jobs"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.search"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.practical-backend-core"), false);
  assert.equal(catalog.addedBundleIds.includes("bundle-assets"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-practical-backend"), false);

  const loadResult = await loadRuntimePluginModules({ pluginCatalog: catalog });
  assert.equal(loadResult.hasBlockingErrors, false);
  const summary = runtimeBundleSummaryForProfile("minimal", {
    additionalBundleIds: [
      ...catalog.addedBundleIds,
      ...Object.keys(loadResult.bundleOverrides)
    ],
    bundleOverrides: loadResult.bundleOverrides
  });
  assert.equal(summary.capabilities.includes("upload.asset"), true);
  assert.equal(summary.capabilities.includes("fs.blob"), true);
  assert.equal(summary.capabilities.includes("fs.stream"), true);
  assert.equal(summary.capabilities.includes("jobs.queue"), true);
  assert.equal(summary.capabilities.includes("search.index"), true);
  assert.equal(summary.routes.some(route => route.handler === "asset.upload"), true);
  assert.equal(summary.routes.some(route => route.handler === "backendSeams.read"), false);
  assert.equal(summary.routes.some(route => route.handler === "auth.oauth.start"), false);
});

test("plain minimal does not expose asset behavior", () => {
  const summary = runtimeBundleSummaryForProfile("minimal");
  assert.equal(summary.capabilities.includes("upload.asset"), false);
  assert.equal(summary.routes.some(route => String(route.handler).startsWith("asset.")), false);
});

test("asset support services are package-owned", () => {
  const world = createWorld();
  defineContext(world, { actor: "adam", id: "ctx.home", label: "Home" });
  definePerspective(world, { actor: "adam", id: "perspective.home", title: "Home", context: "ctx.home" });
  const services = createPracticalBackendAssetServices({
    world,
    backendHost: "backendHost",
    runtimeConfigLookup: (config, key) => config?.[key],
    headerValue: value => String(value || ""),
    assetsRootFor: appContext => path.resolve(appContext.runtimeRoot, "assets"),
    canCreateInContext: () => ({ ok: true }),
    canMutateTarget: () => ({ ok: true }),
    currentPerspectiveById: perspectiveId => world.project(moduleProjectors.perspectives).find(row => row.id === perspectiveId) ?? null,
    defineContext: value => defineContext(world, value)
  });

  assert.equal(assetContentUrlForId("asset/1"), "/api/assets/asset%2F1/content");
  assert.equal(assetTextUrlForId("asset/1"), "/api/assets/asset%2F1/text");
  assert.match(assetDerivedTextPathForAppContext({ runtimeRoot: "C:/runtime" }, "asset/1"), /assets[\\/]asset%2F1[\\/]derived[\\/]text\.txt$/);
  assert.equal(services.assetStorageKey("asset-1"), "asset-1/blob");
  assert.deepEqual(services.normalizeAssetVisibility("public", { "upload.asset.publicEnabled": true }), { ok: true, value: "public" });
  assert.equal(services.resolveAssetDropContext({
    actor: "adam",
    perspectiveId: "perspective.home",
    requestSession: { homeContext: "ctx.home" }
  }).contextId, "ctx.home");
});

test("assets plugin registers asset read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  defineContext(world, { actor: "system", id: "ctx.assets", label: "Assets" });
  createThing(world, { actor: "system", id: "asset.demo" });
  createThing(world, { actor: "system", id: "target.demo" });
  world.emit({
    process: "defineAsset",
    actor: "system",
    claims: [
      relation("asset.demo", "hasModuleKind", "asset"),
      relation("asset.demo", "hasTitle", "Demo Asset"),
      relation("target.demo", "hasTitle", "Target"),
      relation("target.demo", "hasModuleKind", "widget"),
      relation("asset.demo", "inContext", "ctx.assets"),
      relation("target.demo", "inContext", "ctx.assets"),
      relation("target.demo", "attachedAsset", "asset.demo")
    ],
    body: { id: "asset.demo" }
  });
  world.emit({
    process: "asset.upload",
    actor: "system",
    body: {
      id: "asset.demo",
      originalName: "demo.txt",
      mimeType: "text/plain",
      sizeBytes: 12,
      storageKey: "asset.demo/blob",
      visibility: "private",
      context: "ctx.assets",
      contentUrl: "/api/assets/asset.demo/content"
    }
  });
  world.emit({
    process: "asset.ingest.enqueue.failed",
    actor: "system",
    body: {
      id: "asset.demo",
      reason: "queue unavailable"
    }
  });
  world.emit({
    process: "asset.search.reindex.failed",
    actor: "system",
    body: {
      id: "asset.demo",
      reason: "index unavailable"
    }
  });

  const row = world.project(moduleProjectors.assetIndex).byId["asset.demo"];
  assert.equal(row.title, "Demo Asset");
  assert.equal(row.owner, "system");
  assert.equal(row.context, "ctx.assets");
  assert.equal(row.contextTitle, "ctx.assets");
  assert.equal(row.originalName, "demo.txt");
  assert.equal(row.mimeType, "text/plain");
  assert.equal(row.downloadUrl, "/api/assets/asset.demo/content?download=1");
  assert.equal(row.processingStatus, "enqueue-failed");
  assert.equal(row.processingError, "queue unavailable");
  assert.equal(row.canRetryIngest, true);
  assert.equal(row.ingestRetryUrl, "/api/assets/asset.demo/ingest/retry");
  assert.equal(row.searchError, "index unavailable");
  assert.equal(row.canRefreshSearch, true);
  assert.equal(row.searchReindexUrl, "/api/assets/asset.demo/search/reindex");
  assert.deepEqual(row.attachedTo, ["target.demo"]);
  assert.deepEqual(row.attachedToRows, [{
    id: "target.demo",
    title: "Target",
    kind: "widget",
    context: "ctx.assets",
    contextTitle: "ctx.assets"
  }]);
}));
