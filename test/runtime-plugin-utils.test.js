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
    await writePlugin(root, "notes-sidebar", {
      id: "plugin.inspect",
      version: "0.1.0",
      displayName: "Inspect Bridge",
      description: "Inspect bundle bridge",
      kind: "plugin",
      activatesBundles: ["bundle-inspect"],
      contributes: {}
    });

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
    assert.equal(discovered.packages[0].execution.mode, "bundle-bridge");
    assert.equal(discovered.packages[0].resolvedBundles.some(row => row.id === "bundle-inspect"), true);
    assert.equal(discovered.packages[0].resolvedRuntimeContributions.surfaces.some(row => row.id === "surface:world"), true);
    assert.equal(discovered.packages[0].resolvedRuntimeContributions.handlerMetadata["events.stream"].routeKind, "stream");
    assert.deepEqual(discovered.packages[0].resolvedRuntimeContributions.routes.find(route => route.handler === "events.stream")?.handlerMetadata?.methods, ["GET"]);
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
    assert.deepEqual(full.addedBundleIds, []);
    assert.deepEqual(full.selection.activeBundleIds, ["bundle-inspect"]);
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

test("plugin activation rejects dependency-incomplete authored installs with source attribution", async () => {
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

    assert.deepEqual(discovered.effectivePluginIds, ["plugin.inspect"]);
    assert.equal(discovered.packages.find(row => row.id === "plugin.inspect")?.activation.active, false);
    assert.equal(discovered.rejectedPlugins.some(entry =>
      entry.id === "plugin.inspect"
      && entry.requestedSources.includes("authored")
      && entry.reasons.some(reason => reason.includes("missing requested plugin dependencies: plugin.canvas"))
    ), true);
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
      displayName: "Practical Backend Bridge",
      description: "Backend bridge",
      kind: "plugin",
      activatesBundles: ["bundle-practical-backend"],
      contributes: {
        capabilities: [{ id: "db.sql" }],
        routes: [{ path: "/declared-backend", handler: "backendProgram.run" }],
        surfaces: [{ id: "surface:declared-backend", title: "Declared Backend" }],
        providers: [{ id: "provider.backend", kind: "bundle-bridge" }]
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
    assert.equal(backend.installPreview?.delta.addedBundleIds.includes("bundle-practical-backend"), true);
    assert.equal(backend.installPreview?.delta.addedCapabilityIds.includes("db.sql"), true);
    assert.equal(backend.installPreview?.delta.addedRoutes.length > 0, true);
    assert.equal(backend.declaredManifestContributions.routes.some(route => route.path === "/declared-backend"), true);
    assert.equal(backend.resolvedRuntimeContributions.routes.some(route => route.matcher === "/declared-backend"), false);
    assert.equal(inspect.declaredManifestContributions.routes.some(route =>
      route.path === "/declared-world" && route.handlerMetadata?.routeKind === "page"
    ), true);
    assert.equal(inspect.resolvedRuntimeContributions.handlerMetadata["events.stream"].routeKind, "stream");
    assert.equal(inspect.installPreview?.delta.addedHandlerMetadata.some(row =>
      row.handler === "events.stream" && row.metadata?.routeKind === "stream"
    ), true);
    assert.deepEqual(inspect.installPreview?.delta.addedRoutes.find(route => route.handler === "events.stream")?.handlerMetadata?.methods, ["GET"]);
    assert.equal(notes.installPreview?.available, false);
    assert.equal(notes.blockingReasons.some(reason => reason.includes("metadata-only")), true);
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
    assert.equal(missingInspect.installPreview?.available, false);
    assert.equal(missingInspect.blockingReasons.some(reason => reason.includes("missing plugin dependencies: plugin.canvas")), true);

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

    const fullReview = await readRuntimePluginReviews({
      pluginRoot: root,
      runtimeProfile: "full",
      serverRunnerId: "demo_server",
      authoredPluginIds: []
    });
    const fullInspect = fullReview.packages.find(row => row.plugin === "plugin.inspect");
    assert.ok(fullInspect);
    assert.equal(fullInspect.installPreview?.available, false);
    assert.equal(fullInspect.blockingReasons.some(reason => reason.includes("missing plugin dependencies: plugin.canvas")), true);

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
