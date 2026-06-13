import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readRuntimePluginCatalog } from "../src/runtime-plugin-utils.js";
import { applyRuntimePluginLoadState, loadRuntimePluginModules } from "../src/runtime-plugin-loader.js";

async function tempPluginRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-plugin-loader-"));
}

async function writePlugin(root, directoryName, manifest, runtimeSource = null) {
  const pluginDir = path.join(root, directoryName);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2));
  if (runtimeSource != null) {
    await fs.writeFile(path.join(pluginDir, "runtime.js"), runtimeSource, "utf8");
  }
}

test("plugin runtime loader supports multi-bundle plugin-owned modules", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "authoring", {
      id: "plugin.authoring",
      version: "0.1.0",
      displayName: "Authoring Plugin",
      description: "Authoring plugin runtime",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-authoring", "bundle-tutorial"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-authoring": {
            handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["bootstrap.page"], handlerMetadata: {} },
            routes: [{ kind: "exact", method: "GET", path: "/_bootstrap", handler: "bootstrap.page", params: {} }],
            surfaces: [{ id: "surface:bootstrap", title: "Bootstrap", href: "/_bootstrap", action: null, search: "bootstrap", type: "surface", tier: "harness", contexts: ["app-command"] }],
            createHandlers() { return { "bootstrap.page": async () => {} }; }
          },
          "bundle-tutorial": {
            handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["tutorial.progress.read"], handlerMetadata: {} },
            routes: [{ kind: "pattern", method: "GET", pattern: /^\\/api\\/tutorial-progress\\/([^/]+)$/, handler: "tutorial.progress.read", paramNames: ["tutorialId"] }],
            surfaces: [],
            createHandlers() { return { "tutorial.progress.read": async () => {} }; }
          }
        }
      };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "authoring",
      configuredPluginIds: ["plugin.authoring"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const loadedCatalog = applyRuntimePluginLoadState(pluginCatalog, loadResult);
    const authoring = loadedCatalog.packages.find(row => row.id === "plugin.authoring");

    assert.equal(loadResult.hasBlockingErrors, false);
    assert.deepEqual(Object.keys(loadResult.bundleOverrides).sort(), ["bundle-authoring", "bundle-tutorial"]);
    assert.equal(authoring.runtimeModule.loadStatus, "loaded");
    assert.deepEqual([...authoring.runtimeModule.bundleIds].sort(), ["bundle-authoring", "bundle-tutorial"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader rejects duplicate active bundle claims across plugins", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "alpha", {
      id: "plugin.alpha",
      version: "0.1.0",
      displayName: "Alpha",
      description: "Alpha plugin runtime",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-authoring"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-authoring": {
            handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} },
            routes: [],
            surfaces: [],
            createHandlers() { return {}; }
          }
        }
      };
    `);
    await writePlugin(root, "beta", {
      id: "plugin.beta",
      version: "0.1.0",
      displayName: "Beta",
      description: "Beta plugin runtime",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-authoring"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-authoring": {
            handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} },
            routes: [],
            surfaces: [],
            createHandlers() { return {}; }
          }
        }
      };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.alpha", "plugin.beta"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });

    assert.equal(loadResult.hasBlockingErrors, true);
    assert.equal(loadResult.failures.some(entry => entry.id === "plugin.beta" && entry.reasons.some(reason => reason.includes("already claimed"))), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader preserves plugin-owned handler-set providers", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "demo", {
      id: "plugin.demo",
      version: "0.1.0",
      displayName: "Demo",
      description: "Demo handler set plugin runtime",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-demo"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-demo": {
            handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} },
            routes: [],
            surfaces: [],
            providers: [{
              kind: "handlerSet",
              id: "demo",
              definition: { handlers: ["todos.readModel"], jobHandlers: ["demo.echo"] },
              factory() { return { handlers: {}, jobHandlers: {} }; }
            }],
            createHandlers() { return {}; }
          }
        }
      };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.demo"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const providers = loadResult.bundleOverrides["bundle-demo"]?.contributes?.providers ?? [];
    const handlerSetProvider = providers.find(provider => provider.kind === "handlerSet" && provider.id === "demo");

    assert.equal(loadResult.hasBlockingErrors, false);
    assert.equal(Boolean(handlerSetProvider), true);
    assert.deepEqual(handlerSetProvider.definition.handlers, ["todos.readModel"]);
    assert.deepEqual(handlerSetProvider.definition.jobHandlers, ["demo.echo"]);
    assert.equal(typeof handlerSetProvider.factory, "function");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
