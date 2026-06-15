import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectActiveRuntimeContributions } from "../src/runtime-active-contributions.js";
import { runtimeBundleSummaryForProfile } from "../src/runtime-bundles.js";
import { loadRuntimePluginModules } from "../src/runtime-plugin-loader.js";
import { readRuntimePluginCatalog } from "../src/runtime-plugin-utils.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repoRoot, "plugins");

async function contributionsFor(pluginIds = []) {
  return contributionsForProfile("minimal", pluginIds);
}

async function contributionsForProfile(runtimeProfile = "minimal", pluginIds = []) {
  const pluginCatalog = await readRuntimePluginCatalog({
    pluginRoot,
    runtimeProfile,
    configuredPluginIds: pluginIds
  });
  assert.equal(pluginCatalog.selection.hasBlockingErrors, false);
  const loadResult = await loadRuntimePluginModules({ pluginCatalog });
  assert.equal(loadResult.hasBlockingErrors, false);
  const summary = runtimeBundleSummaryForProfile(runtimeProfile, {
    additionalBundleIds: [
      ...(pluginCatalog.addedBundleIds ?? []),
      ...Object.keys(loadResult.bundleOverrides ?? {})
    ],
    bundleOverrides: loadResult.bundleOverrides
  });
  return {
    pluginCatalog,
    loadResult,
    summary,
    contributions: collectActiveRuntimeContributions({ bundles: summary.bundles })
  };
}

test("minimal runtime has no optional active contribution maps", async () => {
  const { contributions } = await contributionsFor([]);

  assert.deepEqual(Object.keys(contributions.supportServices), []);
  assert.deepEqual(Object.keys(contributions.coreHooks), ["renderWidgetPage"]);
  assert.deepEqual(Object.keys(contributions.providerRuntimeFactories), []);
  assert.deepEqual(Object.keys(contributions.jobHandlerFactories), []);
  assert.deepEqual([...contributions.staticAssetFiles.keys()], []);
});

test("default minimal, authoring, and full profiles all expose the generic widget-page hook", async () => {
  const minimal = await contributionsForProfile("minimal", []);
  const authoring = await contributionsForProfile("authoring", []);
  const full = await contributionsForProfile("full", []);

  assert.equal(typeof minimal.contributions.coreHooks.renderWidgetPage, "function");
  assert.equal(typeof authoring.contributions.coreHooks.renderWidgetPage, "function");
  assert.equal(typeof full.contributions.coreHooks.renderWidgetPage, "function");
});

test("minimal plus inspect contributes inspect routes without owning the widget-page hook", async () => {
  const base = await contributionsFor([]);
  const { summary, contributions } = await contributionsFor(["plugin.inspect"]);

  assert.equal(summary.bundleIds.includes("bundle-inspect"), true);
  assert.equal(summary.routes.some(route => route.handler === "events.stream"), true);
  assert.equal(typeof contributions.coreHooks.renderWidgetPage, "function");
  assert.deepEqual(Object.keys(contributions.coreHooks), Object.keys(base.contributions.coreHooks));
  assert.deepEqual(Object.keys(contributions.providerRuntimeFactories), []);
});

test("minimal plus practical-backend expands child plugins into backend providers and jobs", async () => {
  const { pluginCatalog, summary, contributions } = await contributionsFor(["plugin.practical-backend"]);

  assert.equal(pluginCatalog.effectivePluginIds.includes("plugin.sqlite"), true);
  assert.equal(pluginCatalog.effectivePluginIds.includes("plugin.jobs"), true);
  assert.equal(summary.bundleIds.includes("bundle-sqlite"), true);
  assert.equal(summary.bundleIds.includes("bundle-practical-backend"), false);
  assert.equal(typeof contributions.providerRuntimeFactories["db.sql"], "function");
  assert.equal(typeof contributions.providerRuntimeFactories["jobs.queue"], "function");
  assert.equal(typeof contributions.providerRuntimeFactories["search.index"], "function");
  assert.equal(typeof contributions.jobHandlerFactories.assets, "function");
  assert.equal(typeof contributions.jobHandlerFactories.notifications, "function");
  assert.equal(typeof contributions.jobHandlerFactories.webhooks, "function");
});

test("canvas static assets exist only when canvas plugin is active", async () => {
  const inactive = await contributionsFor([]);
  const active = await contributionsFor(["plugin.canvas"]);

  assert.equal(inactive.contributions.staticAssetFiles.has("canvas-core.js"), false);
  assert.equal(active.contributions.staticAssetFiles.has("canvas-core.js"), true);
  assert.equal(active.contributions.staticAssetFiles.get("canvas-core.js").endsWith(path.join("plugins", "canvas", "canvas-core.js")), true);
});

test("active contribution collection rejects duplicate support service keys", () => {
  assert.throws(
    () => collectActiveRuntimeContributions({
      bundles: [
        {
          id: "bundle-a",
          contributes: {
            providers: [{
              kind: "supportServiceFactory",
              id: "a.support",
              factory: () => ({ sharedService: () => "a" })
            }]
          }
        },
        {
          id: "bundle-b",
          contributes: {
            providers: [{
              kind: "supportServiceFactory",
              id: "b.support",
              factory: () => ({ sharedService: () => "b" })
            }]
          }
        }
      ]
    }),
    /duplicate runtime contribution sharedService/
  );
});

test("active contribution collection rejects malformed provider entries", () => {
  assert.throws(
    () => collectActiveRuntimeContributions({
      bundles: [{
        id: "bundle-provider",
        contributes: {
          providers: [{ kind: "providerRuntimeFactory", id: "db.sql" }]
        }
      }]
    }),
    /provider runtime factory bundle-provider:db\.sql must expose id and factory/
  );

  assert.throws(
    () => collectActiveRuntimeContributions({
      bundles: [{
        id: "bundle-projectors",
        contributes: {
          providers: [{
            kind: "moduleProjectors",
            id: "bad.projectors",
            projectors: { broken: "not a function" }
          }]
        }
      }]
    }),
    /module projector provider bundle-projectors:bad\.projectors must expose function projector broken/
  );
});
