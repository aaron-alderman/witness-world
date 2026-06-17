import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createThing, createWorld } from "../../src/kernel.js";
import { createServerRunner, installRuntimePlugin, moduleProjectors } from "../../src/modules.js";
import {
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove
} from "../server-runner-authoring/server-runner-processes.js";
import { readRuntimePluginCatalog } from "../../src/runtime-plugin-utils.js";

const practicalBackendDependencies = [
  "plugin.fs-json",
  "plugin.secret",
  "plugin.sql",
  "plugin.jobs",
  "plugin.search",
  "plugin.notifications",
  "plugin.webhooks",
  "plugin.http-outbound",
  "plugin.oauth",
  "plugin.runtime-config",
  "plugin.backend-seams",
  "plugin.fs-blob",
  "plugin.fs-stream",
  "plugin.assets"
];

test("practical-backend is a pure meta package over concrete backend child plugins", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.dependsOnPlugins, practicalBackendDependencies);
  assert.equal(manifest.runtime, undefined);
  assert.equal(manifest.activatesBundles, undefined);

  const catalog = await readRuntimePluginCatalog({
    runtimeProfile: "minimal",
    configuredPluginIds: ["plugin.practical-backend"]
  });
  const practical = catalog.packages.find(row => row.id === "plugin.practical-backend");
  assert.equal(practical.execution.mode, "meta-package");
  assert.equal(practical.activation.active, true);
  assert.equal(catalog.activePluginIds.includes("plugin.secret"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.sql"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.jobs"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.search"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.notifications"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.webhooks"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.http-outbound"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.oauth"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.runtime-config"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.backend-seams"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.fs-json"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.fs-blob"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.fs-stream"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.assets"), true);
  assert.equal(catalog.activePluginIds.includes("plugin.practical-backend-core"), false);
  assert.equal(catalog.addedBundleIds.includes("bundle-secret"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-sql"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-jobs"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-search"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-notifications"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-webhooks"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-http-outbound"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-oauth"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-runtime-config"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-backend-seams"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-fs-json"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-fs-blob"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-fs-stream"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-assets"), true);
  assert.equal(catalog.addedBundleIds.includes("bundle-practical-backend"), false);
});

function setupRunnerWorld() {
  const world = createWorld();
  createThing(world, { actor: "system", id: "backendHost" });
  createThing(world, { actor: "system", id: "frontendHost" });
  createServerRunner(world, {
    actor: "aaron",
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost"
  });
  return world;
}

function installedPlugins(world) {
  return world.project(moduleProjectors.runtimePluginInstalls)
    .map(row => row.plugin)
    .sort();
}

function packageRow(id, { dependsOnPlugins = [], executable = true } = {}) {
  return {
    id,
    validation: { ok: true, errors: [] },
    compatibility: { compatible: true, reasons: [] },
    execution: { executable },
    manifest: { dependsOnPlugins }
  };
}

test("installing practical-backend authors concrete child dependencies first", async () => {
  const world = setupRunnerWorld();
  const pluginCatalog = await readRuntimePluginCatalog({ runtimeProfile: "minimal" });

  const result = requestBootstrapRuntimePluginInstall(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.practical-backend" },
    pluginCatalog
  });

  assert.equal(result.ok, true);
  assert.deepEqual(installedPlugins(world), [
    "plugin.assets",
    "plugin.backend-seams",
    "plugin.fs-blob",
    "plugin.fs-json",
    "plugin.fs-stream",
    "plugin.http-outbound",
    "plugin.jobs",
    "plugin.notifications",
    "plugin.oauth",
    "plugin.practical-backend",
    "plugin.runtime-config",
    "plugin.search",
    "plugin.secret",
    "plugin.sql",
    "plugin.webhooks"
  ]);
  assert.deepEqual(result.runtimePluginInstalls.map(row => row.plugin), [
    "plugin.fs-json",
    "plugin.secret",
    "plugin.sql",
    "plugin.jobs",
    "plugin.search",
    "plugin.notifications",
    "plugin.webhooks",
    "plugin.http-outbound",
    "plugin.oauth",
    "plugin.runtime-config",
    "plugin.backend-seams",
    "plugin.fs-blob",
    "plugin.fs-stream",
    "plugin.assets",
    "plugin.practical-backend"
  ]);

  const reinstall = requestBootstrapRuntimePluginInstall(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.practical-backend" },
    pluginCatalog
  });
  assert.equal(reinstall.ok, false);
  assert.equal(reinstall.status, 409);
  assert.deepEqual(installedPlugins(world), [
    "plugin.assets",
    "plugin.backend-seams",
    "plugin.fs-blob",
    "plugin.fs-json",
    "plugin.fs-stream",
    "plugin.http-outbound",
    "plugin.jobs",
    "plugin.notifications",
    "plugin.oauth",
    "plugin.practical-backend",
    "plugin.runtime-config",
    "plugin.search",
    "plugin.secret",
    "plugin.sql",
    "plugin.webhooks"
  ]);
});

test("practical-backend remove modes keep or cascade dependency rows explicitly", async () => {
  const pluginCatalog = await readRuntimePluginCatalog({ runtimeProfile: "minimal" });

  const pluginOnlyWorld = setupRunnerWorld();
  requestBootstrapRuntimePluginInstall(pluginOnlyWorld, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.practical-backend" },
    pluginCatalog
  });
  const pluginOnly = requestBootstrapRuntimePluginRemove(pluginOnlyWorld, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.practical-backend", removeMode: "pluginOnly" },
    pluginCatalog
  });
  assert.equal(pluginOnly.ok, true);
  assert.deepEqual(installedPlugins(pluginOnlyWorld), [
    "plugin.assets",
    "plugin.backend-seams",
    "plugin.fs-blob",
    "plugin.fs-json",
    "plugin.fs-stream",
    "plugin.http-outbound",
    "plugin.jobs",
    "plugin.notifications",
    "plugin.oauth",
    "plugin.runtime-config",
    "plugin.search",
    "plugin.secret",
    "plugin.sql",
    "plugin.webhooks"
  ]);

  const cascadeWorld = setupRunnerWorld();
  requestBootstrapRuntimePluginInstall(cascadeWorld, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.practical-backend" },
    pluginCatalog
  });
  const cascade = requestBootstrapRuntimePluginRemove(cascadeWorld, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.practical-backend", removeMode: "cascadeUnused" },
    pluginCatalog
  });
  assert.equal(cascade.ok, true);
  assert.deepEqual(installedPlugins(cascadeWorld), []);
});

test("dependency integrity blocks unsafe removes and cyclic installs", () => {
  const world = setupRunnerWorld();
  installRuntimePlugin(world, { actor: "aaron", serverRunner: "runner-1", plugin: "plugin.sql" });
  installRuntimePlugin(world, { actor: "aaron", serverRunner: "runner-1", plugin: "plugin.other" });
  const pluginCatalog = {
    packages: [
      packageRow("plugin.sql"),
      packageRow("plugin.other", { dependsOnPlugins: ["plugin.sql"] })
    ]
  };

  const blockedRemove = requestBootstrapRuntimePluginRemove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.sql", removeMode: "cascadeAll" },
    pluginCatalog
  });
  assert.equal(blockedRemove.ok, false);
  assert.equal(blockedRemove.status, 409);

  const cyclicWorld = setupRunnerWorld();
  const cyclicCatalog = {
    packages: [
      packageRow("plugin.a", { dependsOnPlugins: ["plugin.b"] }),
      packageRow("plugin.b", { dependsOnPlugins: ["plugin.a"] })
    ]
  };
  const cyclicInstall = requestBootstrapRuntimePluginInstall(cyclicWorld, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { serverRunner: "runner-1", plugin: "plugin.a" },
    pluginCatalog: cyclicCatalog
  });
  assert.equal(cyclicInstall.ok, false);
  assert.equal(cyclicInstall.error, "runtime plugin dependencies invalid");
});
