import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildPluginCapabilitySourceIndex,
  discoverRuntimePluginPackages,
  readRuntimePluginCatalog,
  readRuntimePluginReviews,
  resolveConfiguredRuntimePluginIds,
  resolveRuntimePluginRoot
} from "../src/runtime-plugin-utils.js";

async function tempPluginRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-plugins-"));
}

async function writePlugin(root, directoryName, manifest) {
  const pluginDir = path.join(root, directoryName);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2));
  return pluginDir;
}

async function writePluginRuntime(pluginDir, source = "export default {};\n") {
  await fs.writeFile(path.join(pluginDir, "runtime.js"), source);
}

test("runtime plugin root resolves from cwd by default and honors env override", () => {
  const defaultRoot = resolveRuntimePluginRoot({ env: {}, cwd: "C:/workspace/world" });
  const overridden = resolveRuntimePluginRoot({ env: { RUNTIME_PLUGIN_ROOT: "D:/plugins" }, cwd: "C:/workspace/world" });

  assert.equal(defaultRoot, path.resolve("C:/workspace/world", "plugins"));
  assert.equal(overridden, path.resolve("D:/plugins"));
});

test("configured runtime plugin ids come from env by default and CLI when provided", () => {
  assert.deepEqual(
    resolveConfiguredRuntimePluginIds({ env: { RUNTIME_PLUGINS: "plugin.inspect, plugin.authoring, plugin.inspect" } }),
    ["plugin.inspect", "plugin.authoring"]
  );
  assert.deepEqual(
    resolveConfiguredRuntimePluginIds({
      env: { RUNTIME_PLUGINS: "plugin.authoring" },
      runtimePluginIds: ["plugin.inspect", "plugin.inspect", "plugin.canvas"]
    }),
    ["plugin.inspect", "plugin.canvas"]
  );
});

test("plugin discovery finds valid executable local plugin packages through bundle bindings", async () => {
  const root = await tempPluginRoot();
  try {
    const pluginDir = await writePlugin(root, "notes-sidebar", {
      id: "plugin.inspect",
      version: "0.1.0",
      displayName: "Inspect Bridge",
      description: "Inspect bundle bridge",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-local-inspect"],
      contributes: {}
    });
    await writePluginRuntime(pluginDir, "export const bundleId = 'bundle-local-inspect'; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} }; export const routes = []; export const surfaces = []; export function createHandlers() { return {}; }\n");

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "minimal"
    });

    assert.equal(discovered.summary.validCount, 1);
    assert.equal(discovered.summary.invalidCount, 0);
    assert.equal(discovered.packages[0].id, "plugin.inspect");
    assert.equal(discovered.packages[0].compatibility.compatible, true);
    assert.equal(discovered.packages[0].installability.installableInPrinciple, true);
    assert.equal(discovered.packages[0].execution.executable, true);
    assert.equal(discovered.packages[0].execution.mode, "plugin-owned");
    assert.equal(discovered.packages[0].metadata.runtime.entry, "./runtime.js");
    assert.equal(discovered.packages[0].runtimeModule.loadStatus, "not-loaded");
    assert.equal(discovered.packages[0].resolvedBundles.some(row => row.id === "bundle-local-inspect"), true);
    assert.deepEqual(discovered.packages[0].resolvedRuntimeContributions.surfaces, []);
    assert.deepEqual(discovered.packages[0].resolvedRuntimeContributions.routes, []);
    assert.deepEqual(Object.keys(discovered.packages[0].resolvedRuntimeContributions.handlerMetadata), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin discovery preserves typed style, theme, widget, renderer, and authoring-tool contributions", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "design-system", {
      id: "plugin.design-system",
      version: "0.1.0",
      displayName: "Design System",
      description: "Typed authoring contributions",
      kind: "plugin",
      contributes: {
        styles: [{ id: "styles.engentus-base", family: "surface" }],
        themes: [{ id: "theme.engentus", documentModel: "wcss" }],
        widgets: [{ id: "widget.color-swatch", kind: "authoring" }],
        renderers: [{ id: "renderer.wcss-browser", output: "text/css" }],
        authoringTools: [{ id: "authoring.wcss-inspector", kind: "inspector" }]
      }
    });

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "full"
    });

    assert.equal(discovered.summary.validCount, 1);
    assert.deepEqual(discovered.packages[0].metadata.contributes.styles, [
      { id: "styles.engentus-base", family: "surface" }
    ]);
    assert.deepEqual(discovered.packages[0].metadata.contributes.themes, [
      { id: "theme.engentus", documentModel: "wcss" }
    ]);
    assert.deepEqual(discovered.packages[0].metadata.contributes.widgets, [
      { id: "widget.color-swatch", kind: "authoring" }
    ]);
    assert.deepEqual(discovered.packages[0].metadata.contributes.renderers, [
      { id: "renderer.wcss-browser", output: "text/css" }
    ]);
    assert.deepEqual(discovered.packages[0].metadata.contributes.authoringTools, [
      { id: "authoring.wcss-inspector", kind: "inspector" }
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin discovery rejects invalid runtime entry paths and missing runtime modules", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "absolute", {
      id: "plugin.absolute",
      version: "0.1.0",
      displayName: "Absolute",
      description: "Absolute path plugin",
      kind: "plugin",
      runtime: { entry: "C:/bad/runtime.js" },
      activatesBundles: ["bundle-local-absolute"],
      contributes: {}
    });
    await writePlugin(root, "escape", {
      id: "plugin.escape",
      version: "0.1.0",
      displayName: "Escape",
      description: "Escaping plugin",
      kind: "plugin",
      runtime: { entry: "../runtime.js" },
      activatesBundles: ["bundle-local-escape"],
      contributes: {}
    });
    await writePlugin(root, "missing", {
      id: "plugin.missing-runtime",
      version: "0.1.0",
      displayName: "Missing Runtime",
      description: "Missing runtime file plugin",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-local-missing"],
      contributes: {}
    });

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "minimal"
    });

    assert.equal(discovered.summary.validCount, 0);
    assert.equal(discovered.invalidPackages.some(row => row.validation.errors.some(error => error.includes("must not be absolute"))), true);
    assert.equal(discovered.invalidPackages.some(row => row.validation.errors.some(error => error.includes("must stay inside the plugin directory"))), true);
    assert.equal(discovered.invalidPackages.some(row => row.validation.errors.some(error => error.includes("runtime.entry not found"))), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("metadata-only plugin packages remain discoverable and non-executable", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "notes-sidebar", {
      id: "plugin.notes-sidebar",
      version: "0.1.0",
      displayName: "Notes Sidebar",
      description: "Notes sidebar package",
      kind: "plugin",
      contributes: {
        capabilities: [{ id: "notes.sidebar" }]
      }
    });

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "full"
    });

    assert.equal(discovered.summary.validCount, 1);
    assert.equal(discovered.packages[0].execution.executable, false);
    assert.equal(discovered.packages[0].execution.reason.includes("metadata-only"), true);
    assert.equal(discovered.packages[0].trust.state, "unsigned");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin discovery normalizes compatible shells and trust-facing provenance metadata", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "reviewed", {
      id: "plugin.reviewed",
      version: "1.0.0",
      displayName: "Reviewed Plugin",
      description: "Reviewed package",
      kind: "plugin",
      compatibleShells: ["browser", "mcp"],
      requiresRuntimeVersion: "0.x",
      updateChannel: "stable",
      provenance: {
        source: "imported",
        origin: "https://example.invalid/store/reviewed",
        channel: "stable",
        trust: "reviewed",
        reviewed: true,
        reviewedAt: "2026-06-12",
        signature: {
          status: "verified",
          keyId: "sig-1"
        }
      },
      contributes: {}
    });

    const discovered = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "full"
    });

    assert.deepEqual(discovered.packages[0].metadata.compatibleShells, ["browser", "mcp"]);
    assert.equal(discovered.packages[0].metadata.requiresRuntimeVersion, "0.x");
    assert.equal(discovered.packages[0].metadata.updateChannel, "stable");
    assert.equal(discovered.packages[0].trust.state, "reviewed");
    assert.equal(discovered.packages[0].trust.signatureStatus, "verified");
    assert.equal(discovered.summary.trustStateCounts.reviewed, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin discovery marks duplicate ids, missing dependencies, unknown profiles, and unknown bundles invalid", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "one", {
      id: "plugin.duplicate",
      version: "1.0.0",
      displayName: "One",
      description: "Duplicate one",
      kind: "plugin",
      contributes: {}
    });
    await writePlugin(root, "two", {
      id: "plugin.duplicate",
      version: "1.0.0",
      displayName: "Two",
      description: "Duplicate two",
      kind: "plugin",
      dependsOnPlugins: ["plugin.missing"],
      compatibleRuntimeProfiles: ["future-profile"],
      activatesBundles: ["bundle.nope"],
      contributes: {}
    });

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "full"
    });

    assert.equal(discovered.summary.validCount, 0);
    assert.equal(discovered.summary.invalidCount, 2);
    assert.equal(discovered.invalidPackages.every(row => row.validation.errors.some(error => error.includes("duplicate plugin id"))), true);
    assert.equal(discovered.invalidPackages.some(row => row.validation.errors.some(error => error.includes("missing plugin dependencies"))), true);
    assert.equal(discovered.invalidPackages.some(row => row.validation.errors.some(error => error.includes("unknown runtime profiles"))), true);
    assert.equal(discovered.invalidPackages.some(row => row.validation.errors.some(error => error.includes("unknown runtime bundles"))), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin discovery allows standalone plugin-owned bundle ids when a runtime module is present", async () => {
  const root = await tempPluginRoot();
  try {
    const pluginDir = await writePlugin(root, "wcss-runtime", {
      id: "plugin.wcss-runtime",
      version: "1.0.0",
      displayName: "WCSS Runtime",
      description: "Generic runtime stylesheet delivery",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-wcss-runtime"],
      contributes: {}
    });
    await writePluginRuntime(pluginDir, `export default { bundles: { "bundle-wcss-runtime": { handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} }, routes: [], surfaces: [], createHandlers() { return {}; } } } };`);

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "minimal"
    });

    assert.equal(discovered.summary.validCount, 1);
    assert.equal(discovered.validPackages[0].validation.ok, true);
    assert.deepEqual(discovered.validPackages[0].manifest.activatesBundles, ["bundle-wcss-runtime"]);
    assert.deepEqual(discovered.validPackages[0].resolvedBundles.map(bundle => bundle.id), ["bundle-wcss-runtime"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin discovery allows runtime plugins to target existing core bundles as the core-override lane", async () => {
  const root = await tempPluginRoot();
  try {
    const pluginDir = await writePlugin(root, "core-runtime", {
      id: "plugin.core-runtime",
      version: "1.0.0",
      displayName: "Core Runtime",
      description: "Valid runtime plugin targeting an existing core bundle",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      activatesBundles: ["bundle-assets"],
      contributes: {}
    });
    await writePluginRuntime(pluginDir, `export default { bundles: { "bundle-assets": { handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} }, routes: [], surfaces: [], createHandlers() { return {}; } } } };`);

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "minimal"
    });

    assert.equal(discovered.summary.validCount, 1);
    assert.equal(discovered.validPackages[0].validation.ok, true);
    assert.deepEqual(discovered.validPackages[0].resolvedBundles.map(bundle => bundle.id), ["bundle-assets"]);
    assert.equal(discovered.validPackages[0].resolvedBundles[0].kind, "internal");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin discovery reports malformed manifests without breaking the catalog", async () => {
  const root = await tempPluginRoot();
  try {
    const pluginDir = path.join(root, "broken");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, "plugin.json"), "{not-json");
    await fs.writeFile(path.join(root, "README.txt"), "ignore me");

    const discovered = await discoverRuntimePluginPackages({
      pluginRoot: root,
      runtimeProfile: "minimal"
    });

    assert.equal(discovered.summary.invalidCount, 1);
    assert.equal(discovered.summary.ignoredCount, 1);
    assert.equal(discovered.invalidPackages[0].validation.errors.some(error => error.startsWith("invalid JSON:")), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin compatibility follows profile metadata and startup activation stays explicit", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "authoring-only", {
      id: "plugin.inspect",
      version: "0.2.0",
      displayName: "Inspect Bridge",
      description: "Inspect package",
      kind: "plugin",
      compatibleRuntimeProfiles: ["full"],
      activatesBundles: ["bundle-inspect"],
      contributes: {}
    });

    const minimal = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.inspect"]
    });
    const full = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "full",
      configuredPluginIds: ["plugin.inspect"]
    });

    assert.equal(minimal.packages[0].compatibility.compatible, false);
    assert.equal(minimal.packages[0].compatibility.reasons.includes("runtime-profile-incompatible"), true);
    assert.equal(minimal.packages[0].activation.requested, true);
    assert.equal(minimal.packages[0].activation.active, false);
    assert.equal(minimal.rejectedPlugins.some(entry => entry.id === "plugin.inspect"), true);
    assert.equal(full.packages[0].compatibility.compatible, true);
    assert.equal(full.packages[0].activation.active, true);
    assert.deepEqual(full.activePluginIds, ["plugin.inspect"]);
    assert.deepEqual(full.addedBundleIds, ["bundle-inspect"]);
    assert.deepEqual(full.selection.activeBundleIds, ["bundle-inspect"]);

    const startup = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "full",
      startupPluginIds: ["plugin.inspect"]
    });
    assert.deepEqual(startup.startupPluginIds, ["plugin.inspect"]);
    assert.deepEqual(startup.packages[0].activation.requestedSources, ["profile", "startup"]);
    assert.equal(startup.summary.requestedSourceCounts.startup, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin catalog reports authored, operator, and effective runtime plugin requests with source attribution", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "inspect", {
      id: "plugin.inspect",
      version: "0.2.0",
      displayName: "Inspect Bridge",
      description: "Inspect package",
      kind: "plugin",
      activatesBundles: ["bundle-inspect"],
      contributes: {}
    });
    await writePlugin(root, "canvas", {
      id: "plugin.canvas",
      version: "0.2.0",
      displayName: "Canvas Bridge",
      description: "Canvas package",
      kind: "plugin",
      activatesBundles: ["bundle-canvas"],
      contributes: {}
    });

    const discovered = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      authoredPluginIds: ["plugin.inspect"],
      configuredPluginIds: ["plugin.canvas", "plugin.inspect"]
    });

    assert.deepEqual(discovered.authoredPluginIds, ["plugin.inspect"]);
    assert.deepEqual(discovered.operatorPluginIds, ["plugin.canvas", "plugin.inspect"]);
    assert.deepEqual(discovered.effectivePluginIds, ["plugin.inspect", "plugin.canvas"]);
    assert.deepEqual(discovered.activePluginIds, ["plugin.canvas", "plugin.inspect"]);
    assert.deepEqual(discovered.packages.find(row => row.id === "plugin.inspect")?.activation.requestedSources, ["authored", "operator"]);
    assert.deepEqual(discovered.packages.find(row => row.id === "plugin.canvas")?.activation.requestedSources, ["operator"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin activation expands authored plugin dependencies with source attribution", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "inspect", {
      id: "plugin.inspect",
      version: "0.2.0",
      displayName: "Inspect Bridge",
      description: "Inspect package",
      kind: "plugin",
      dependsOnPlugins: ["plugin.canvas"],
      activatesBundles: ["bundle-inspect"],
      contributes: {}
    });
    await writePlugin(root, "canvas", {
      id: "plugin.canvas",
      version: "0.2.0",
      displayName: "Canvas Bridge",
      description: "Canvas package",
      kind: "plugin",
      activatesBundles: ["bundle-canvas"],
      contributes: {}
    });

    const discovered = await readRuntimePluginCatalog({
      pluginRoot: root,
      runtimeProfile: "minimal",
      authoredPluginIds: ["plugin.inspect"]
    });

    assert.deepEqual(discovered.effectivePluginIds, ["plugin.inspect", "plugin.canvas"]);
    assert.equal(discovered.packages.find(row => row.id === "plugin.inspect")?.activation.active, true);
    assert.equal(discovered.packages.find(row => row.id === "plugin.canvas")?.activation.active, true);
    assert.deepEqual(discovered.packages.find(row => row.id === "plugin.canvas")?.activation.requestedSources, ["authored"]);
    assert.deepEqual(discovered.rejectedPlugins, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plugin capability source index distinguishes package-only, catalog-only, and overlapping capability sources", () => {
  const pluginPackages = [
    {
      id: "plugin.notes-sidebar",
      discoveryPath: "/plugins/notes-sidebar/plugin.json",
      validation: { ok: true, errors: [] },
      compatibility: { activeProfile: "full", compatible: true, reasons: [] },
      execution: { executable: false, reason: "metadata-only plugin package; provider loading is not enabled" },
      declaredCapabilityIds: ["notes.sidebar", "shared.capability"],
      metadata: {
        displayName: "Notes Sidebar",
        version: "0.1.0",
        provenance: { source: "local-example" }
      }
    }
  ];
  const capabilityCatalog = [
    { id: "dom.render", version: "0", installCount: 1 },
    { id: "shared.capability", version: "1.0.0", installCount: 0 }
  ];

  const bridged = buildPluginCapabilitySourceIndex({ capabilityCatalog, pluginPackages });

  assert.equal(bridged.capabilityCatalog.find(row => row.id === "dom.render")?.capabilitySourceState, "catalog-only");
  assert.equal(bridged.capabilityCatalog.find(row => row.id === "shared.capability")?.capabilitySourceState, "both");
  assert.equal(bridged.capabilityPackageSources.find(row => row.capabilityId === "notes.sidebar")?.sourceState, "package-only");
  assert.equal(bridged.capabilityPackageSources.find(row => row.capabilityId === "shared.capability")?.packages[0].pluginId, "plugin.notes-sidebar");
});

test("runtime plugin reviews show executable composition deltas and metadata-only blocking honestly", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "practical-backend", {
      id: "plugin.practical-backend",
      version: "0.2.0",
      displayName: "Practical Backend Meta",
      description: "Backend meta package",
      kind: "plugin",
      dependsOnPlugins: ["plugin.secret", "plugin.sql", "plugin.jobs", "plugin.search", "plugin.notifications", "plugin.webhooks", "plugin.http-outbound", "plugin.oauth", "plugin.runtime-config", "plugin.backend-seams", "plugin.fs-json", "plugin.fs-blob", "plugin.fs-stream", "plugin.assets"],
      contributes: {
        capabilities: [{ id: "secret.store" }, { id: "db.sql" }],
        routes: [{ path: "/declared-backend", handler: "backendProgram.run" }],
        surfaces: [{ id: "surface:declared-backend", title: "Declared Backend" }],
        providers: [{ id: "provider.backend", kind: "meta-package" }]
      }
    });
    await writePlugin(root, "secret", {
      id: "plugin.secret",
      version: "0.2.0",
      displayName: "Secrets",
      description: "Runner secrets",
      kind: "plugin",
      activatesBundles: ["bundle-secret"],
      contributes: {
        capabilities: [{ id: "secret.store" }]
      }
    });
    await writePlugin(root, "sql", {
      id: "plugin.sql",
      version: "0.2.0",
      displayName: "SQL",
      description: "Generic DB SQL",
      kind: "plugin",
      dependsOnPlugins: ["plugin.secret"],
      activatesBundles: ["bundle-sql"],
      contributes: {
        capabilities: [{ id: "db.sql" }]
      }
    });
    await writePlugin(root, "jobs", {
      id: "plugin.jobs",
      version: "0.2.0",
      displayName: "Jobs",
      description: "Jobs queue",
      kind: "plugin",
      activatesBundles: ["bundle-jobs"],
      contributes: {
        capabilities: [{ id: "jobs.queue" }]
      }
    });
    await writePlugin(root, "search", {
      id: "plugin.search",
      version: "0.2.0",
      displayName: "Search",
      description: "Search index",
      kind: "plugin",
      activatesBundles: ["bundle-search"],
      contributes: {
        capabilities: [{ id: "search.index" }]
      }
    });
    await writePlugin(root, "notifications", {
      id: "plugin.notifications",
      version: "0.2.0",
      displayName: "Notifications",
      description: "Email/SMS notifications",
      kind: "plugin",
      dependsOnPlugins: ["plugin.jobs"],
      activatesBundles: ["bundle-notifications"],
      contributes: {
        capabilities: [{ id: "notify.email" }, { id: "notify.sms" }]
      }
    });
    await writePlugin(root, "webhooks", {
      id: "plugin.webhooks",
      version: "0.2.0",
      displayName: "Webhooks",
      description: "Inbound webhooks",
      kind: "plugin",
      dependsOnPlugins: ["plugin.jobs"],
      activatesBundles: ["bundle-webhooks"],
      contributes: {
        capabilities: [{ id: "webhook.inbound" }]
      }
    });
    await writePlugin(root, "http-outbound", {
      id: "plugin.http-outbound",
      version: "0.2.0",
      displayName: "HTTP Outbound",
      description: "Outbound HTTP",
      kind: "plugin",
      activatesBundles: ["bundle-http-outbound"],
      contributes: {
        capabilities: [{ id: "http.outbound" }]
      }
    });
    await writePlugin(root, "oauth", {
      id: "plugin.oauth",
      version: "0.2.0",
      displayName: "OAuth",
      description: "OAuth authentication",
      kind: "plugin",
      activatesBundles: ["bundle-oauth"],
      contributes: {
        capabilities: [{ id: "auth.oauth" }]
      }
    });
    await writePlugin(root, "runtime-config", {
      id: "plugin.runtime-config",
      version: "0.2.0",
      displayName: "Runtime Config",
      description: "Runtime config read route",
      kind: "plugin",
      activatesBundles: ["bundle-runtime-config"],
      contributes: {
        capabilities: [{ id: "runtime.config" }]
      }
    });
    await writePlugin(root, "backend-seams", {
      id: "plugin.backend-seams",
      version: "0.2.0",
      displayName: "Backend Seams",
      description: "Backend seam diagnostics",
      kind: "plugin",
      activatesBundles: ["bundle-backend-seams"],
      contributes: {
        routes: [{ method: "GET", path: "/api/backend-seams", handler: "backendSeams.read" }],
        surfaces: [{ id: "surface:backend-seams", title: "Open Backend Seams" }]
      }
    });
    await writePlugin(root, "fs-blob", {
      id: "plugin.fs-blob",
      version: "0.2.0",
      displayName: "Blob File Storage",
      description: "Blob file storage",
      kind: "plugin",
      activatesBundles: ["bundle-fs-blob"],
      contributes: {
        capabilities: [{ id: "fs.blob" }],
        routes: [{ method: "GET", path: "/api/fs/blobs", handler: "fs.blob.list" }]
      }
    });
    await writePlugin(root, "fs-json", {
      id: "plugin.fs-json",
      version: "0.2.0",
      displayName: "JSON File Capabilities",
      description: "JSON file read/write host capabilities",
      kind: "plugin",
      activatesBundles: ["bundle-fs-json"],
      contributes: {
        capabilities: [{ id: "fs.json.read" }, { id: "fs.json.write" }]
      }
    });
    await writePlugin(root, "fs-stream", {
      id: "plugin.fs-stream",
      version: "0.2.0",
      displayName: "Stream File Storage",
      description: "Stream file storage",
      kind: "plugin",
      dependsOnPlugins: ["plugin.fs-blob"],
      activatesBundles: ["bundle-fs-stream"],
      contributes: {
        capabilities: [{ id: "fs.stream" }],
        routes: [{ method: "GET", path: "/api/fs/streams/content", handler: "fs.stream.read" }]
      }
    });
    await writePlugin(root, "assets", {
      id: "plugin.assets",
      version: "0.2.0",
      displayName: "Assets",
      description: "Asset upload and content APIs",
      kind: "plugin",
      dependsOnPlugins: ["plugin.fs-blob", "plugin.fs-stream", "plugin.jobs", "plugin.search"],
      activatesBundles: ["bundle-assets"],
      contributes: {
        capabilities: [{ id: "upload.asset" }],
        routes: [{ method: "POST", path: "/api/assets", handler: "asset.upload" }]
      }
    });
    await writePlugin(root, "notes-sidebar", {
      id: "plugin.notes-sidebar",
      version: "0.1.0",
      displayName: "Notes Sidebar",
      description: "Metadata only",
      kind: "plugin",
      contributes: {
        capabilities: [{ id: "notes.sidebar" }],
        routes: [{ path: "/declared-notes", handler: "page.notes" }],
        surfaces: [{ id: "surface:notes-sidebar", title: "Notes Sidebar" }],
        providers: [{ id: "provider.notes", kind: "widget-runtime" }]
      }
    });
    await writePlugin(root, "inspect", {
      id: "plugin.inspect",
      version: "0.2.0",
      displayName: "Inspect Bridge",
      description: "Inspect bundle",
      kind: "plugin",
      activatesBundles: ["bundle-inspect"],
      contributes: {
        routes: [{ path: "/declared-world", handler: "page.world" }],
        surfaces: [{ id: "surface:declared-world", title: "Declared World" }]
      }
    });

    const reviews = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "minimal",
      serverRunnerId: "demo_server",
      authoredPluginIds: []
    });

    const backend = reviews.packages.find(row => row.plugin === "plugin.practical-backend");
    const inspect = reviews.packages.find(row => row.plugin === "plugin.inspect");
    const notes = reviews.packages.find(row => row.plugin === "plugin.notes-sidebar");
    assert.ok(backend);
    assert.ok(inspect);
    assert.ok(notes);
    assert.equal(backend.installPreview?.available, true);
    assert.equal(backend.execution.mode, "meta-package");
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-secret"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-sql"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-jobs"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-search"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-notifications"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-webhooks"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-http-outbound"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-oauth"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-runtime-config"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-backend-seams"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-fs-json"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-fs-blob"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-fs-stream"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-assets"), true);
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-practical-backend"), false);
    assert.equal(backend.declaredManifestContributions.capabilities.some(row => row.id === "secret.store"), true);
    assert.equal(backend.declaredManifestContributions.capabilities.some(row => row.id === "db.sql"), true);
    assert.deepEqual(backend.installPreview?.delta.addedCapabilityIds, []);
    assert.deepEqual(backend.installPreview?.delta.addedRoutes, []);
    assert.equal(backend.declaredManifestContributions.routes.some(route => route.path === "/declared-backend"), true);
    assert.equal(backend.resolvedRuntimeContributions.routes.some(route => route.matcher === "/declared-backend"), false);
    assert.equal(inspect.declaredManifestContributions.routes.some(route => route.path === "/declared-world"), true);
    assert.deepEqual(Object.keys(inspect.resolvedRuntimeContributions.handlerMetadata), []);
    assert.deepEqual(inspect.installPreview?.delta.addedHandlerMetadata, []);
    assert.deepEqual(inspect.installPreview?.delta.addedRoutes, []);
    assert.equal(notes.installPreview?.available, false);
    assert.equal(notes.blockingReasons.some(reason => reason.includes("metadata-only")), true);
    assert.equal(notes.reconcileActions.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("runtime plugin reviews report no-op installs, missing dependencies, and reverse-dependent remove warnings", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "inspect", {
      id: "plugin.inspect",
      version: "0.2.0",
      displayName: "Inspect Bridge",
      description: "Inspect bundle",
      kind: "plugin",
      dependsOnPlugins: ["plugin.canvas"],
      activatesBundles: ["bundle-inspect"],
      contributes: {
        surfaces: [{ id: "surface:declared-world", title: "Declared World" }]
      }
    });
    await writePlugin(root, "canvas", {
      id: "plugin.canvas",
      version: "0.2.0",
      displayName: "Canvas Bridge",
      description: "Canvas bundle",
      kind: "plugin",
      activatesBundles: ["bundle-canvas"],
      contributes: {}
    });

    const missingDependency = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "minimal",
      serverRunnerId: "demo_server",
      authoredPluginIds: []
    });
    const missingInspect = missingDependency.packages.find(row => row.plugin === "plugin.inspect");
    assert.ok(missingInspect);
    assert.equal(missingInspect.installPreview?.available, true);
    assert.equal(missingInspect.installPreview?.delta.addedBundleIds.includes("bundle-canvas"), true);

    const installed = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "minimal",
      serverRunnerId: "demo_server",
      authoredPluginIds: ["plugin.canvas", "plugin.inspect"]
    });
    const canvas = installed.packages.find(row => row.plugin === "plugin.canvas");
    assert.ok(canvas);
    assert.equal(canvas.removePreview?.available, true);
    assert.equal(canvas.removePreview?.warnings.some(reason => reason.includes("plugin.inspect")), true);
    assert.equal(missingInspect.reconcileActions.some(action =>
      action.id === "install-missing-dependency:plugin.canvas"
      && action.targetProcess === "runtimePlugin.reconcile"
      && action.available === true
    ), true);

    const fullReview = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "full",
      serverRunnerId: "demo_server",
      authoredPluginIds: []
    });
    const fullInspect = fullReview.packages.find(row => row.plugin === "plugin.inspect");
    assert.ok(fullInspect);
    assert.equal(fullInspect.installPreview?.available, true);
    assert.equal(fullInspect.installPreview?.delta.effectiveNoOp, true);

    const fullNoOp = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "full",
      serverRunnerId: "demo_server",
      authoredPluginIds: ["plugin.canvas"]
    });
    const noOpInspect = fullNoOp.packages.find(row => row.plugin === "plugin.inspect");
    assert.ok(noOpInspect);
    assert.equal(noOpInspect.installPreview?.available, true);
    assert.equal(noOpInspect.installPreview?.delta.effectiveNoOp, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("runtime plugin reviews expose reconcile actions for broken installed and missing authored plugin intent", async () => {
  const root = await tempPluginRoot();
  try {
    await writePlugin(root, "notes-sidebar", {
      id: "plugin.notes-sidebar",
      version: "0.1.0",
      displayName: "Notes Sidebar",
      description: "Metadata only",
      kind: "plugin",
      contributes: {
        capabilities: [{ id: "notes.sidebar" }]
      }
    });

    const brokenInstalled = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "minimal",
      serverRunnerId: "demo_server",
      authoredPluginIds: ["plugin.notes-sidebar"]
    });
    const notes = brokenInstalled.packages.find(row => row.plugin === "plugin.notes-sidebar");
    assert.ok(notes);
    assert.equal(notes.reconcileActions.some(action =>
      action.id === "remove-broken-install"
      && action.targetProcess === "runtimePlugin.reconcile"
      && action.available === true
      && action.preview?.action === "remove"
    ), true);

    const missingIntent = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "minimal",
      serverRunnerId: "demo_server",
      authoredPluginIds: ["plugin.missing"]
    });
    const missing = missingIntent.packages.find(row => row.plugin === "plugin.missing");
    assert.ok(missing);
    assert.equal(missing.reconcileActions.some(action =>
      action.id === "cleanup-missing-intent"
      && action.targetProcess === "runtimePlugin.reconcile"
      && action.available === true
      && action.preview?.action === "remove"
    ), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
