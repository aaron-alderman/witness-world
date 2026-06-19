import assert from "node:assert/strict";
import test from "node:test";
import { runtimeBundleSummaryForProfile } from "../src/runtime-bundles.js";
import { loadRuntimePluginModules } from "../src/runtime-plugin-loader.js";
import { readRuntimePluginCatalog } from "../src/runtime-plugin-utils.js";

const PLATFORM_RUNTIME_OWNER_NOTE = "Behavior is owned by the Platform Self Model runtime plugin.";

async function loadedPlatformOptions() {
  const catalog = await readRuntimePluginCatalog({
    runtimeProfile: "minimal",
    configuredPluginIds: ["plugin.platform"]
  });
  const loaded = await loadRuntimePluginModules({ pluginCatalog: catalog });
  assert.deepEqual(loaded.failures, []);
  return {
    additionalBundleIds: catalog.addedBundleIds,
    bundleOverrides: loaded.bundleOverrides
  };
}

test("platform runtime declares handler ownership explicitly through its handler catalog", async () => {
  const options = await loadedPlatformOptions();
  const summary = runtimeBundleSummaryForProfile("minimal", options);

  const handler = summary.handlerMetadata["platform.changeSet.apply"];
  assert.equal(handler.ownerClass, "runtime-plugin");
  assert.equal(handler.ownerBundleId, "bundle-platform");
  assert.equal(handler.ownerPluginId, "plugin.platform");
  assert.equal(handler.ownerNote, PLATFORM_RUNTIME_OWNER_NOTE);
  assert.deepEqual(handler.methods, ["POST"]);

  const route = summary.routes.find(row => row.handler === "platform.changeSet.apply");
  assert.ok(route);
  assert.equal(route.ownerClass, "runtime-plugin");
  assert.equal(route.ownerBundleId, "bundle-platform");
  assert.equal(route.ownerPluginId, "plugin.platform");
  assert.equal(route.ownerNote, PLATFORM_RUNTIME_OWNER_NOTE);
});

test("platform governance inventory keeps explicit platform route ownership visible", async () => {
  const options = await loadedPlatformOptions();
  const summary = runtimeBundleSummaryForProfile("minimal", options);

  const governanceRoute = summary.governanceRoutes.find(row => row.handler === "platform.changeSet.apply");
  assert.ok(governanceRoute);
  assert.equal(governanceRoute.governanceMode, "operator-only");
  assert.equal(governanceRoute.ownerClass, "runtime-plugin");
  assert.equal(governanceRoute.ownerBundleId, "bundle-platform");
  assert.equal(governanceRoute.ownerPluginId, "plugin.platform");
});
