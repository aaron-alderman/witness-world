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

async function tempRepoPluginRoot() {
  return fs.mkdtemp(path.join(process.cwd(), ".tmp-witness-plugin-loader-"));
}

async function writePlugin(root, directoryName, manifest, runtimeSource = null) {
  const pluginDir = path.join(root, directoryName);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2));
  if (runtimeSource != null) {
    await fs.writeFile(path.join(pluginDir, "runtime.js"), runtimeSource, "utf8");
  }
  return pluginDir;
}

function normalize(value) {
  return String(value || "").replaceAll("\\", "/");
}

test("plugin runtime loader can import from a witness-core materialized scratch mirror with relative imports", async () => {
  const root = await tempRepoPluginRoot();
  try {
    const pluginDir = await writePlugin(root, "demo", {
      id: "plugin.demo",
      version: "0.1.0",
      displayName: "Demo",
      description: "Demo plugin runtime",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-demo-local"],
      contributes: {}
    }, `
      import { createBundle } from "./helper.js";
      export default { bundles: { "bundle-demo-local": createBundle() } };
    `);
    await fs.writeFile(path.join(pluginDir, "helper.js"), `
      export function createBundle() {
        return {
          handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["demo.read"], handlerMetadata: {} },
          routes: [{ kind: "exact", method: "GET", path: "/demo", handler: "demo.read", params: {} }],
          surfaces: [],
          createHandlers() { return { "demo.read": async () => {} }; }
        };
      }
    `, "utf8");

    const relativeRoot = normalize(path.relative(process.cwd(), root));
    const relativeManifest = normalize(path.relative(process.cwd(), path.join(pluginDir, "plugin.json")));
    const relativeRuntime = normalize(path.relative(process.cwd(), path.join(pluginDir, "runtime.js")));
    const relativeHelper = normalize(path.relative(process.cwd(), path.join(pluginDir, "helper.js")));
    const bridgeCalls = [];
    const bridge = {
      async listSourceDirectory({ path: sourceId }) {
        bridgeCalls.push({ kind: "list", path: sourceId });
        if (sourceId === relativeRoot) {
          return {
            path: sourceId,
            exists: true,
            entries: [{ name: "demo", isFile: false, isDirectory: true }]
          };
        }
        if (sourceId === `${relativeRoot}/demo`) {
          return {
            path: sourceId,
            exists: true,
            entries: [
              { name: "plugin.json", isFile: true, isDirectory: false },
              { name: "runtime.js", isFile: true, isDirectory: false },
              { name: "helper.js", isFile: true, isDirectory: false }
            ]
          };
        }
        return { path: sourceId, exists: false, entries: [] };
      },
      async readSource({ path: sourceId }) {
        bridgeCalls.push({ kind: "read", path: sourceId });
        if (sourceId === relativeManifest) {
          return {
            path: sourceId,
            content: JSON.stringify({
              id: "plugin.demo",
              version: "0.1.0",
              displayName: "Demo",
              description: "Demo plugin runtime",
              kind: "plugin",
              runtime: { entry: "./runtime.js" },
              activatesBundles: ["bundle-demo-local"],
              contributes: {}
            }, null, 2)
          };
        }
        if (sourceId === relativeRuntime) {
          return {
            path: sourceId,
            content: `
              import { createBundle } from "./helper.js";
              export default { bundles: { "bundle-demo-local": createBundle() } };
            `
          };
        }
        if (sourceId === relativeHelper) {
          return {
            path: sourceId,
            content: `
              export function createBundle() {
                return {
                  handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["demo.read"], handlerMetadata: {} },
                  routes: [{ kind: "exact", method: "GET", path: "/demo", handler: "demo.read", params: {} }],
                  surfaces: [],
                  createHandlers() { return { "demo.read": async () => {} }; }
                };
              }
            `
          };
        }
        throw new Error(`unexpected read ${sourceId}`);
      },
      async statSource({ path: sourceId }) {
        bridgeCalls.push({ kind: "stat", path: sourceId });
        if ([relativeRuntime, relativeHelper].includes(sourceId)) {
          return {
            path: sourceId,
            exists: true,
            isFile: true,
            isDirectory: false,
            size: 128,
            modifiedAt: "1700000000000"
          };
        }
        throw new Error(`unexpected stat ${sourceId}`);
      }
    };
    const guardedFs = {
      ...fs,
      async readFile(target, encoding) {
        const resolved = path.resolve(String(target || ""));
        if (resolved.startsWith(root)) {
          throw new Error(`plugin runtime load read escaped witness-core bridge: ${resolved}`);
        }
        return await fs.readFile(target, encoding);
      },
      async readdir(target, options) {
        const resolved = path.resolve(String(target || ""));
        if (resolved.startsWith(root)) {
          throw new Error(`plugin runtime load readdir escaped witness-core bridge: ${resolved}`);
        }
        return await fs.readdir(target, options);
      },
      async stat(target) {
        const resolved = path.resolve(String(target || ""));
        if (resolved.startsWith(root)) {
          throw new Error(`plugin runtime load stat escaped witness-core bridge: ${resolved}`);
        }
        return await fs.stat(target);
      }
    };

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.demo"],
      generationBridge: bridge,
      fsModule: guardedFs,
      cwd: process.cwd()
    });
    const loadResult = await loadRuntimePluginModules({
      pluginCatalog,
      generationBridge: bridge,
      fsModule: guardedFs,
      cwd: process.cwd()
    });
    const loadedCatalog = applyRuntimePluginLoadState(pluginCatalog, loadResult);
    const demo = loadedCatalog.packages.find(row => row.id === "plugin.demo");

    assert.equal(loadResult.hasBlockingErrors, false);
    assert.ok(loadResult.bundleOverrides["bundle-demo-local"]);
    assert.equal(demo.runtimeModule.loadStatus, "loaded");
    assert.match(normalize(demo.runtimeModule.resolvedPath), /\.witness-core\/runtime-plugin-modules\/plugin\.demo-/);
    assert.equal(path.resolve(demo.runtimeModule.resolvedPath).startsWith(root), false);
    assert.equal(bridgeCalls.some(call => call.kind === "list" && call.path === `${relativeRoot}/demo`), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === relativeRuntime), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === relativeHelper), true);
    assert.equal(bridgeCalls.some(call => call.kind === "stat" && call.path === relativeRuntime), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader fails closed when a core-connected runtime path is outside witness-core scope", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "outside", {
      id: "plugin.outside",
      version: "0.1.0",
      displayName: "Outside",
      description: "Out of scope plugin runtime",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-outside"],
      contributes: {}
    }, `export default { bundles: { "bundle-outside": { handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} }, routes: [], surfaces: [], createHandlers() { return {}; } } } };`);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.outside"]
    });
    const guardedFs = {
      ...fs,
      async stat(target) {
        throw new Error(`plugin runtime load stat escaped witness-core boundary: ${target}`);
      },
      async readFile(target, encoding) {
        throw new Error(`plugin runtime load read escaped witness-core boundary: ${target} ${encoding ?? ""}`);
      },
      async readdir(target, options) {
        throw new Error(`plugin runtime load readdir escaped witness-core boundary: ${target} ${JSON.stringify(options ?? {})}`);
      }
    };
    const loadResult = await loadRuntimePluginModules({
      pluginCatalog,
      generationBridge: {
        async listSourceDirectory() {
          throw new Error("bridge should not be called for out-of-scope runtime path");
        },
        async readSource() {
          throw new Error("bridge should not be called for out-of-scope runtime path");
        },
        async statSource() {
          throw new Error("bridge should not be called for out-of-scope runtime path");
        }
      },
      fsModule: guardedFs,
      cwd: process.cwd(),
      requireGenerationBridgeForCanonicalImports: true
    });

    assert.equal(loadResult.hasBlockingErrors, true);
    assert.equal(loadResult.pluginStates["plugin.outside"].loadStatus, "failed");
    assert.equal(loadResult.failures.some(entry =>
      entry.id === "plugin.outside"
      && entry.reasons.some(reason => reason.includes("WITNESS_CORE_REQUIRED") || reason.includes("witness-core capability"))
    ), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader fails closed when witness-core authority is required but the bridge is unavailable", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "missing-bridge", {
      id: "plugin.missing-bridge",
      version: "0.1.0",
      displayName: "Missing Bridge",
      description: "Plugin runtime without witness-core bridge",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-missing-bridge"],
      contributes: {}
    }, `export default { bundles: { "bundle-missing-bridge": { handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} }, routes: [], surfaces: [], createHandlers() { return {}; } } } };`);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.missing-bridge"]
    });
    const loadResult = await loadRuntimePluginModules({
      pluginCatalog,
      fsModule: {
        async stat(target) {
          throw new Error(`plugin runtime load stat escaped missing witness-core bridge: ${target}`);
        },
        async readFile(target, encoding) {
          throw new Error(`plugin runtime load read escaped missing witness-core bridge: ${target} ${encoding ?? ""}`);
        },
        async readdir(target, options) {
          throw new Error(`plugin runtime load readdir escaped missing witness-core bridge: ${target} ${JSON.stringify(options ?? {})}`);
        },
        async mkdir() {
          throw new Error("plugin runtime load scratch mkdir should not run without witness-core bridge");
        },
        async writeFile() {
          throw new Error("plugin runtime load scratch write should not run without witness-core bridge");
        }
      },
      cwd: process.cwd(),
      requireGenerationBridgeForCanonicalImports: true
    });

    assert.equal(loadResult.hasBlockingErrors, true);
    assert.equal(loadResult.pluginStates["plugin.missing-bridge"].loadStatus, "failed");
    assert.equal(loadResult.failures.some(entry =>
      entry.id === "plugin.missing-bridge"
      && entry.reasons.some(reason => reason.includes("WITNESS_CORE_REQUIRED") || reason.includes("witness-core capability"))
    ), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

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
      activatesBundles: ["bundle-authoring-local", "bundle-tutorial-local"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-authoring-local": {
            handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["bootstrap.page"], handlerMetadata: {} },
            routes: [{ kind: "exact", method: "GET", path: "/_bootstrap", handler: "bootstrap.page", params: {} }],
            surfaces: [{ id: "surface:bootstrap", title: "Bootstrap", href: "/_bootstrap", action: null, search: "bootstrap", type: "surface", tier: "harness", contexts: ["app-command"] }],
            createHandlers() { return { "bootstrap.page": async () => {} }; }
          },
          "bundle-tutorial-local": {
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
    assert.deepEqual(Object.keys(loadResult.bundleOverrides).sort(), ["bundle-authoring-local", "bundle-tutorial-local"]);
    assert.equal(loadResult.bundleOverrides["bundle-authoring-local"].pluginId, "plugin.authoring");
    assert.equal(authoring.runtimeModule.loadStatus, "loaded");
    assert.deepEqual([...authoring.runtimeModule.bundleIds].sort(), ["bundle-authoring-local", "bundle-tutorial-local"]);
    assert.equal(authoring.resolvedRuntimeContributions.routes.find(route => route.handler === "bootstrap.page")?.ownerClass, "runtime-plugin");
    assert.equal(authoring.resolvedRuntimeContributions.routes.find(route => route.handler === "bootstrap.page")?.ownerPluginId, "plugin.authoring");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader loads standalone plugin-owned bundle ids that are not seeded in core", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "wcss-runtime", {
      id: "plugin.wcss-runtime",
      version: "0.1.0",
      displayName: "WCSS Runtime",
      description: "Generic stylesheet runtime plugin",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-wcss-runtime"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-wcss-runtime": {
            handlerCatalog: {
              authorableHandlers: ["wcss.stylesheet.read"],
              pageHandlers: [],
              dispatchHandlers: ["wcss.stylesheet.read"],
              handlerMetadata: {
                "wcss.stylesheet.read": { routeKind: "resource", responseKind: "resource", methods: ["GET"] }
              }
            },
            routes: [],
            surfaces: [],
            createHandlers() { return { "wcss.stylesheet.read": async () => {} }; }
          }
        }
      };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.wcss-runtime"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const loadedCatalog = applyRuntimePluginLoadState(pluginCatalog, loadResult);
    const pluginRow = loadedCatalog.packages.find(row => row.id === "plugin.wcss-runtime");

    assert.equal(loadResult.hasBlockingErrors, false);
    assert.ok(loadResult.bundleOverrides["bundle-wcss-runtime"]);
    assert.equal(loadResult.bundleOverrides["bundle-wcss-runtime"].kind, "plugin");
    assert.equal(pluginRow.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(pluginRow.runtimeModule.bundleIds, ["bundle-wcss-runtime"]);
    assert.equal(pluginRow.resolvedRuntimeContributions.handlerMetadata["wcss.stylesheet.read"].ownerClass, "runtime-plugin");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("broken active product plugin fails instead of falling back to core implementation", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "inspect", {
      id: "plugin.inspect",
      version: "0.1.0",
      displayName: "Inspect",
      description: "Broken inspect product plugin runtime",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-inspect-local"],
      contributes: {}
    }, `
      export const bundleId = "bundle-inspect-local";
      export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} };
      export const routes = [];
      export const surfaces = [];
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.inspect"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const loadedCatalog = applyRuntimePluginLoadState(pluginCatalog, loadResult);
    const inspect = loadedCatalog.packages.find(row => row.id === "plugin.inspect");

    assert.equal(loadResult.hasBlockingErrors, true);
    assert.equal(Object.prototype.hasOwnProperty.call(loadResult.bundleOverrides, "bundle-inspect-local"), false);
    assert.equal(inspect.runtimeModule.loadStatus, "failed");
    assert.equal(loadResult.failures.some(entry =>
      entry.id === "plugin.inspect"
      && entry.reasons.some(reason => reason.includes("runtime bundle bundle-inspect-local must export createHandlers(deps)"))
    ), true);
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
      activatesBundles: ["bundle-shared-local"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-shared-local": {
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
      activatesBundles: ["bundle-shared-local"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-shared-local": {
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
      activatesBundles: ["bundle-demo-local"],
      contributes: {}
    }, `
      export default {
        bundles: {
          "bundle-demo-local": {
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
    const providers = loadResult.bundleOverrides["bundle-demo-local"]?.contributes?.providers ?? [];
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

test("plugin runtime loader preserves plugin-owned module projector providers", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "assets", {
      id: "plugin.assets",
      version: "0.1.0",
      displayName: "Assets",
      description: "Asset read models",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-assets-local"],
      contributes: {}
    }, `
      export function assets() { return [{ id: "asset.plugin" }]; }
      export function assetIndex() { return { rows: assets(), byId: { "asset.plugin": { id: "asset.plugin" } } }; }
      export default {
        bundles: {
          "bundle-assets-local": {
            handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} },
            routes: [],
            surfaces: [],
            providers: [{
              kind: "moduleProjectors",
              id: "assets.projections",
              projectors: { assets, assetIndex }
            }],
            createHandlers() { return {}; }
          }
        }
      };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.assets"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const providers = loadResult.bundleOverrides["bundle-assets-local"]?.contributes?.providers ?? [];
    const projectorProvider = providers.find(provider => provider.kind === "moduleProjectors" && provider.id === "assets.projections");

    assert.equal(loadResult.hasBlockingErrors, false);
    assert.equal(typeof projectorProvider?.projectors?.assets, "function");
    assert.equal(typeof projectorProvider?.projectors?.assetIndex, "function");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader supports DESIRE extension-only plugin modules", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "dashboard", {
      id: "plugin.dashboard",
      version: "0.1.0",
      displayName: "Dashboard",
      description: "Dashboard DESIRE extension",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      contributes: {}
    }, `
      export function applyDashboardRuntime(world, doc) {
        return world.emit({ process: "plugin.dashboard.runtime", actor: "plugin.dashboard", claims: [], body: { id: doc.values.id } });
      }
      export function elaborateDashboard() { return []; }
      export const desireExtensions = {
        elaborators: [{ id: "plugin.dashboard.elaborator", sourceLanguage: "rvm", sourceKind: "dashboard", elaborate: elaborateDashboard }],
        runtimeDeclarations: [{ kind: "dashboardRuntime", apply: applyDashboardRuntime }]
      };
      export default { desireExtensions };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.dashboard"]
    });
    const pluginPackage = pluginCatalog.packages.find(row => row.id === "plugin.dashboard");
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const loadedCatalog = applyRuntimePluginLoadState(pluginCatalog, loadResult);
    const loadedPackage = loadedCatalog.packages.find(row => row.id === "plugin.dashboard");

    assert.equal(pluginPackage.execution.mode, "plugin-owned");
    assert.equal(pluginPackage.activation.active, true);
    assert.equal(loadResult.hasBlockingErrors, false);
    assert.deepEqual(loadResult.desireExtensions.elaborators.map(row => row.id), ["plugin.dashboard.elaborator"]);
    assert.deepEqual(loadResult.desireExtensions.runtimeDeclarations.map(row => row.kind), ["dashboardRuntime"]);
    assert.deepEqual(loadResult.desireExtensions.rvmForms.map(row => row.kind), []);
    assert.deepEqual(Object.keys(loadResult.bundleOverrides), []);
    assert.equal(loadedPackage.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(loadedPackage.runtimeModule.desireExtensions.elaborators, ["plugin.dashboard.elaborator"]);
    assert.deepEqual(loadedPackage.runtimeModule.desireExtensions.runtimeDeclarations, ["dashboardRuntime"]);
    assert.deepEqual(loadedPackage.runtimeModule.desireExtensions.rvmForms, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader rejects malformed DESIRE extension exports", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "broken", {
      id: "plugin.broken",
      version: "0.1.0",
      displayName: "Broken",
      description: "Broken DESIRE extension",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      contributes: {}
    }, `
      export default {
        desireExtensions: {
          elaborators: [{ id: "plugin.broken.elaborator", sourceLanguage: "rvm", sourceKind: "broken" }],
          runtimeDeclarations: [{ kind: "brokenRuntime" }]
        }
      };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.broken"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });

    assert.equal(loadResult.hasBlockingErrors, true);
    assert.equal(loadResult.failures.some(entry =>
      entry.id === "plugin.broken"
      && entry.reasons.some(reason => reason.includes("desireExtensions.elaborators[0].elaborate must be a function"))
      && entry.reasons.some(reason => reason.includes("desireExtensions.runtimeDeclarations[0].apply must be a function"))
      && !entry.reasons.some(reason => reason.includes("desireExtensions.rvmForms"))
    ), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader supports plugin-owned RVM form extensions", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "pipeline", {
      id: "plugin.pipeline-runtime",
      version: "0.1.0",
      displayName: "Pipeline",
      description: "Pipeline authoring extension",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      contributes: {}
    }, `
      export const desireExtensions = {
        rvmForms: [{
          kind: "sync",
          parse(form) { return { lines: form.bodyLines.length }; },
          serialize(payload) { return \`sync \${payload.name} {\\n}\`; },
          validate() {},
          normalize() { return { nodes: [], runtimeResiduals: [] }; }
        }]
      };
      export default { desireExtensions };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.pipeline-runtime"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const loadedCatalog = applyRuntimePluginLoadState(pluginCatalog, loadResult);
    const loadedPackage = loadedCatalog.packages.find(row => row.id === "plugin.pipeline-runtime");

    assert.equal(loadResult.hasBlockingErrors, false);
    assert.deepEqual(loadResult.desireExtensions.rvmForms.map(row => row.kind), ["sync"]);
    assert.deepEqual(loadedPackage.runtimeModule.desireExtensions.rvmForms, ["sync"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin runtime loader rejects duplicate active DESIRE runtime declaration kinds", async () => {
  const root = await tempPluginRoot();
  try {
    for (const id of ["alpha", "beta"]) {
      await writePlugin(root, id, {
        id: `plugin.${id}`,
        version: "0.1.0",
        displayName: id,
        description: `${id} DESIRE extension`,
        kind: "plugin",
        runtime: { entry: "./runtime.js" },
        contributes: {}
      }, `
        export function applyShared(world) {
          return world.emit({ process: "plugin.shared", actor: "plugin.${id}", claims: [], body: {} });
        }
        export default {
          desireExtensions: {
            runtimeDeclarations: [{ kind: "sharedRuntime", apply: applyShared }]
          }
        };
      `);
    }

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.alpha", "plugin.beta"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });

    assert.equal(loadResult.hasBlockingErrors, true);
    assert.equal(loadResult.failures.some(entry =>
      entry.id === "plugin.beta"
      && entry.reasons.some(reason => reason.includes("DESIRE runtime declaration already claimed by plugin.alpha: sharedRuntime"))
    ), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
