import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRuntimeDiagnosticsForProfile,
  dispatchHandlerIdsForProfile,
  genericHandlerFactoriesForProfile,
  handlerSetDefinitionsForProfile,
  matchRuntimeBundleRoute,
  runtimeBundleManifests,
  runtimeBundleSummaryForProfile,
  runtimeProfilePluginIds,
  runtimeRouteEntriesForProfile,
  runtimeSurfaceEntriesForProfile
} from "../src/runtime-bundles.js";
import {
  composeRuntimeBundleHandlers,
  runtimeBundleHandlerCatalog
} from "../src/runtime-bundle-handlers.js";
import { readRuntimePluginCatalog } from "../src/runtime-plugin-utils.js";
import { loadRuntimePluginModules } from "../src/runtime-plugin-loader.js";

async function loadedOptions(profileName, configuredPluginIds = []) {
  const catalog = await readRuntimePluginCatalog({ runtimeProfile: profileName, configuredPluginIds });
  const loaded = await loadRuntimePluginModules({ pluginCatalog: catalog });
  assert.deepEqual(loaded.failures, []);
  return {
    additionalBundleIds: catalog.addedBundleIds,
    bundleOverrides: loaded.bundleOverrides
  };
}

test("static bundle catalogs are core-only and optional catalogs arrive through loaded plugin overrides", async () => {
  const core = runtimeBundleHandlerCatalog("bundle-core-runtime");
  const inspectStatic = runtimeBundleHandlerCatalog("bundle-inspect");

  assert.equal(core.dispatchHandlers.includes("session.read"), true);
  assert.equal(core.dispatchHandlers.includes("authority.grants.read"), true);
  assert.deepEqual(inspectStatic.dispatchHandlers, []);

  const options = await loadedOptions("minimal", ["plugin.inspect"]);
  const summary = runtimeBundleSummaryForProfile("minimal", options);
  assert.equal(summary.dispatchHandlers.includes("events.stream"), true);
  assert.equal(summary.pageHandlers.includes("page.world"), true);
  assert.equal(summary.handlerMetadata["events.stream"].routeKind, "stream");
});

test("core runtime bundle exposes authority grant routes and metadata", () => {
  const summary = runtimeBundleSummaryForProfile("minimal");
  assert.deepEqual(matchRuntimeBundleRoute("minimal", "GET", "/api/authority/grants"), {
    handler: "authority.grants.read",
    params: {}
  });
  assert.deepEqual(matchRuntimeBundleRoute("minimal", "POST", "/api/authority/grants"), {
    handler: "authority.grants.create",
    params: {}
  });
  assert.deepEqual(matchRuntimeBundleRoute("minimal", "DELETE", "/api/authority/grants/identity.aaron%3D%3Ecallan"), {
    handler: "authority.grants.revoke",
    params: { grantId: "identity.aaron=>callan" }
  });
  assert.deepEqual(matchRuntimeBundleRoute("minimal", "GET", "/api/runtime/backend-revisions/events"), {
    handler: "backend.revision.events",
    params: {}
  });
  assert.equal(summary.handlerMetadata["authority.grants.read"].routeKind, "json");
  assert.deepEqual(summary.handlerMetadata["authority.grants.revoke"].methods, ["DELETE"]);
  assert.deepEqual(summary.handlerMetadata["backend.revision.events"].methods, ["GET"]);
});

test("active bundle handler composition filters inactive implementations and reports drift", async () => {
  const options = await loadedOptions("minimal", ["plugin.inspect"]);
  const summary = runtimeBundleSummaryForProfile("minimal", options);
  const availableHandlers = {
    __sessionStore: new Map(),
    "page.home": () => {},
    "page.world": () => {},
    "events.stream": () => {},
    "db.sql.query": () => {}
  };

  const minimal = composeRuntimeBundleHandlers({
    activeBundleIds: ["bundle-core-runtime"],
    availableHandlers,
    reservedHandlerIds: ["__sessionStore"]
  });
  assert.equal(Object.prototype.hasOwnProperty.call(minimal.handlers, "page.world"), false);
  assert.equal(minimal.diagnostics.extraHandlerIds.includes("page.world"), true);

  const inspect = composeRuntimeBundleHandlers({
    activeBundleIds: summary.bundleIds,
    availableHandlers,
    reservedHandlerIds: ["__sessionStore"],
    handlerCatalogsByBundleId: Object.fromEntries(summary.bundles.map(bundle => [bundle.id, bundle.handlerCatalog]))
  });
  assert.equal(Object.prototype.hasOwnProperty.call(inspect.handlers, "page.world"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(inspect.handlers, "events.stream"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(inspect.handlers, "db.sql.query"), false);
});

test("generic handler factories are resolved from materialized active runtime bundles", async () => {
  const minimal = genericHandlerFactoriesForProfile("minimal");
  const options = await loadedOptions("minimal", ["plugin.inspect"]);
  const inspect = genericHandlerFactoriesForProfile("minimal", options);

  assert.deepEqual(minimal.map(entry => entry.bundleId), ["bundle-core-runtime"]);
  assert.equal(inspect.some(entry => entry.bundleId === "bundle-core-runtime"), true);
  assert.equal(inspect.some(entry => entry.bundleId === "bundle-inspect"), true);
});

test("runtime profiles are seed plugin presets with core-only static composition", () => {
  assert.deepEqual(runtimeProfilePluginIds("minimal"), []);
  assert.deepEqual(runtimeProfilePluginIds("authoring"), ["plugin.authoring", "plugin.tutorial", "plugin.starter"]);
  assert.deepEqual(runtimeProfilePluginIds("inspect"), ["plugin.inspect"]);
  assert.deepEqual(runtimeProfilePluginIds("practical-backend"), ["plugin.practical-backend"]);
  assert.deepEqual(runtimeProfilePluginIds("full"), [
    "plugin.authoring",
    "plugin.tutorial",
    "plugin.starter",
    "plugin.inspect",
    "plugin.canvas",
    "plugin.mcp",
    "plugin.practical-backend",
    "plugin.demo",
    "plugin.eden",
    "plugin.platform"
  ]);

  const full = runtimeBundleSummaryForProfile("full");
  assert.deepEqual(full.profilePluginIds, runtimeProfilePluginIds("full"));
  assert.deepEqual(full.profileCoreBundleIds, ["bundle-core-runtime"]);
  assert.deepEqual(full.bundleIds, ["bundle-core-runtime"]);
});

test("handler sets, routes, and surfaces are absent until owning plugin runtimes are loaded", async () => {
  assert.equal(Object.prototype.hasOwnProperty.call(handlerSetDefinitionsForProfile("full"), "demo"), false);
  assert.equal(runtimeSurfaceEntriesForProfile("full", "world-command").some(surface => surface.id === "surface:world-mode:graph"), false);

  const fullOptions = await loadedOptions("full");
  const fullHandlerSets = handlerSetDefinitionsForProfile("full", fullOptions);
  const fullSurfaces = runtimeSurfaceEntriesForProfile("full", "world-command", fullOptions);

  assert.equal(Object.prototype.hasOwnProperty.call(fullHandlerSets, "demo"), true);
  assert.equal(fullSurfaces.some(surface => surface.id === "surface:world-mode:graph"), true);
});

test("route and dispatch ownership varies by loaded plugin composition", async () => {
  const minimalHandlers = dispatchHandlerIdsForProfile("minimal");
  const inspectOptions = await loadedOptions("minimal", ["plugin.inspect"]);
  const inspectHandlers = dispatchHandlerIdsForProfile("minimal", inspectOptions);

  assert.equal(minimalHandlers.includes("events.stream"), false);
  assert.equal(inspectHandlers.includes("events.stream"), true);
  assert.equal(matchRuntimeBundleRoute("minimal", "GET", "/api/events"), null);
  assert.deepEqual(matchRuntimeBundleRoute("minimal", "GET", "/api/events", inspectOptions), {
    handler: "events.stream",
    params: {}
  });
});

test("internal runtime bundle manifests expose seed skeleton contract metadata", () => {
  const manifests = runtimeBundleManifests();
  const inspect = manifests.find(manifest => manifest.id === "bundle-inspect");

  assert.equal(manifests.some(manifest => manifest.id === "bundle-core-runtime"), true);
  assert.ok(inspect);
  assert.equal(inspect.displayName, "Inspect");
  assert.deepEqual(inspect.handlerCatalog.dispatchHandlers, []);
  assert.deepEqual(inspect.contributes.routes, []);
});

test("runtime diagnostics summarize seed profile and loaded composition separately", async () => {
  const options = await loadedOptions("minimal", ["plugin.inspect"]);
  const summary = runtimeBundleSummaryForProfile("minimal", options);
  const diagnostics = buildRuntimeDiagnosticsForProfile({
    requestedProfile: "minimal",
    profileName: "minimal",
    additionalBundleIds: options.additionalBundleIds,
    bundleOverrides: options.bundleOverrides,
    pluginAddedBundleIds: options.additionalBundleIds,
    installedHostCapabilities: {
      backend: ["http.serve", "runtime.config"],
      frontend: ["dom.render", "http.fetch"]
    }
  });

  assert.equal(diagnostics.activeProfile, "minimal");
  assert.equal(diagnostics.authoringPolicy.mode, "unconstrained");
  assert.equal(diagnostics.authoringMatrix.publicAuthoringConcepts.surface.status, "supported");
  assert.equal(diagnostics.authoringMatrix.publicAuthoringConcepts.process.status, "supported");
  assert.equal(diagnostics.authoringMatrix.publicAuthoringConcepts.frontendProgram.status, "legacy_only");
  assert.deepEqual(diagnostics.profilePluginIds, []);
  assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-inspect"), true);
  assert.equal(diagnostics.activeBundles.find(bundle => bundle.id === "bundle-inspect")?.ownerClass, "runtime-plugin");
  assert.equal(diagnostics.surfaces.some(surface => surface.id === "surface:process-view"), true);
  assert.equal(diagnostics.surfaces.find(surface => surface.id === "surface:process-view")?.ownerClass, "runtime-plugin");
  assert.equal(diagnostics.handlerMetadata["events.stream"].routeKind, "stream");
  assert.equal(diagnostics.handlerMetadata["events.stream"].ownerClass, "runtime-plugin");
  assert.equal(diagnostics.routes.find(route => route.handler === "events.stream")?.ownerClass, "runtime-plugin");
  assert.equal(diagnostics.shells.shells.find(shell => shell.id === "browser")?.ownerClass, "shell");
});

test("runtime diagnostics include authored, operator, and effective runtime plugin request state", () => {
  const diagnostics = buildRuntimeDiagnosticsForProfile({
    requestedProfile: "minimal",
    profileName: "minimal",
    pluginCatalogSummary: {
      pluginRoot: "/plugins",
      activeProfile: "minimal",
      discoveredCount: 2,
      validCount: 2,
      invalidCount: 0,
      ignoredCount: 0,
      compatibleCount: 2,
      installableCount: 2,
      executableCount: 2,
      requestedCount: 2,
      eligibleCount: 2,
      activeCount: 2,
      rejectedCount: 1,
      trustStateCounts: { unsigned: 2 }
    },
    authoredPluginIds: ["plugin.inspect"],
    operatorPluginIds: ["plugin.canvas"],
    effectivePluginIds: ["plugin.inspect", "plugin.canvas"],
    configuredPluginIds: ["plugin.canvas"],
    activePluginIds: ["plugin.inspect", "plugin.canvas"],
    rejectedPlugins: [{ id: "plugin.nope", reasons: ["plugin package not found"], requestedSources: ["operator"] }],
    pluginAddedBundleIds: ["bundle-inspect", "bundle-canvas"]
  });

  assert.deepEqual(diagnostics.plugins.authoredPluginIds, ["plugin.inspect"]);
  assert.deepEqual(diagnostics.plugins.operatorPluginIds, ["plugin.canvas"]);
  assert.deepEqual(diagnostics.plugins.effectivePluginIds, ["plugin.inspect", "plugin.canvas"]);
  assert.deepEqual(diagnostics.plugins.rejectedPlugins[0].requestedSources, ["operator"]);
  assert.equal(diagnostics.authoringPolicy.mode, "unconstrained");
});
