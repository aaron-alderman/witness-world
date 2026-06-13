import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  runtimeProfilePluginIds,
  providedCapabilityIdsForProfile,
  runtimeBundleManifests,
  runtimeRouteEntriesForProfile
} from "../src/runtime-bundles.js";
import { runtimeBundleHandlerCatalog } from "../src/runtime-bundle-handlers.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsRoot = path.join(repoRoot, "plugins");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findFiles(root, predicate) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFiles(fullPath, predicate));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function pluginPackages() {
  const dirs = await fs.readdir(pluginsRoot, { withFileTypes: true });
  const packages = [];
  for (const dir of dirs.filter(entry => entry.isDirectory())) {
    const pluginDir = path.join(pluginsRoot, dir.name);
    const manifestPath = path.join(pluginDir, "plugin.json");
    if (!await pathExists(manifestPath)) continue;
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const tests = await findFiles(pluginDir, file => file.endsWith(".test.js"));
    packages.push({ dir: dir.name, pluginDir, manifest, tests });
  }
  return packages.sort((left, right) => left.dir.localeCompare(right.dir));
}

async function pluginSrcImports() {
  const files = await findFiles(pluginsRoot, file => file.endsWith(".js") && !file.endsWith(".test.js"));
  const imports = new Map();
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    for (const match of source.matchAll(/from\s+["']((?:\.\.\/)+(?:src\/[^"']+))["']/g)) {
      const normalized = match[1].replace(/\\/g, "/");
      const suffix = normalized.split("src/")[1];
      const target = `src/${suffix}`;
      if (!imports.has(target)) imports.set(target, []);
      imports.get(target).push(path.relative(repoRoot, file).replace(/\\/g, "/"));
    }
  }
  return imports;
}

function bundleIds() {
  return runtimeBundleManifests().map(bundle => bundle.id);
}

function bundleManifest(bundleId) {
  return runtimeBundleManifests().find(bundle => bundle.id === bundleId) ?? null;
}

const OPTIONAL_HANDLER_PREFIXES = [
  "asset.",
  "auth.oauth",
  "backendSeams.",
  "db.sql",
  "fs.blob",
  "fs.stream",
  "jobs.",
  "notify.",
  "notifications.",
  "http.outbound",
  "runtimeConfig.",
  "search.index",
  "webhook."
];

const PRACTICAL_BACKEND_CHILD_OWNERSHIP = Object.freeze({
  "bundle-assets": { dir: "assets", handlers: ["asset.upload", "asset.content.read", "asset.search.reindex"] },
  "bundle-backend-seams": { dir: "backend-seams", handlers: ["backendSeams.read", "page.backendSeams"] },
  "bundle-fs-blob": { dir: "fs-blob", handlers: ["fs.blob.list", "fs.blob.read", "fs.blob.write"] },
  "bundle-fs-json": { dir: "fs-json", handlers: [] },
  "bundle-fs-stream": { dir: "fs-stream", handlers: ["fs.stream.read", "fs.stream.write", "fs.stream.copy"] },
  "bundle-http-outbound": { dir: "http-outbound", handlers: ["http.outbound.send", "http.outbound.list", "http.outbound.read"] },
  "bundle-jobs": { dir: "jobs", handlers: ["jobs.queue.enqueue", "jobs.queue.list", "jobs.queue.read"] },
  "bundle-notifications": { dir: "notifications", handlers: ["notify.email.enqueue", "notify.sms.enqueue", "notifications.list"] },
  "bundle-oauth": { dir: "oauth", handlers: ["auth.oauth.start", "auth.oauth.callback", "auth.oauth.links.list"] },
  "bundle-runtime-config": { dir: "runtime-config", handlers: ["runtimeConfig.read"] },
  "bundle-search": { dir: "search", handlers: ["search.index.inspect", "search.index.build", "search.index.query"] },
  "bundle-sqlite": { dir: "sqlite", handlers: ["db.sql.inspect", "db.sql.query", "db.sql.command"] },
  "bundle-webhooks": { dir: "webhooks", handlers: ["webhook.inbound.receive", "webhook.inbound.list", "webhook.inbound.read"] }
});

const GENERIC_PLUGIN_SRC_IMPORT_TARGETS = Object.freeze([
  "src/backend-programs.js",
  "src/gates.js",
  "src/ids.js",
  "src/kernel.js",
  "src/modules.js",
  "src/process-graph.js",
  "src/projectors-core.js",
  "src/runtime-config-utils.js",
  "src/type-model.js",
  "src/widgets.js"
]);

const REMOVED_PLUGIN_SRC_STUBS = Object.freeze([
  "src/bootstrap-authoring.js",
  "src/bootstrap-shell.js",
  "src/canvas-core.js",
  "src/canvas-page.js",
  "src/canvas-processes.js",
  "src/canvas-projection.js",
  "src/canvas-undo.js",
  "src/demo.js",
  "src/demo-handler-set.js",
  "src/eden-academy.js",
  "src/eden-capability-install-request.js",
  "src/eden-capability-install.js",
  "src/eden-organization.js",
  "src/eden-page-theme.js",
  "src/eden-page.js",
  "src/eden-personal-box.js",
  "src/eden-theory.js",
  "src/eden-versions.js",
  "src/mcp.js",
  "src/private-notes-runtime.js",
  "src/process-view.js",
  "src/projections.js",
  "src/runtime-asset-derived-utils.js",
  "src/runtime-auth-oauth-support-services.js",
  "src/runtime-backend-seams-page.js",
  "src/runtime-builtin-job-handlers.js",
  "src/runtime-default-job-handlers.js",
  "src/runtime-practical-backend-db-search-services.js",
  "src/runtime-practical-backend-asset-services.js",
  "src/runtime-practical-backend-glue.js",
  "src/runtime-practical-backend-io-services.js",
  "src/runtime-practical-backend-support-services.js",
  "src/runtime-provider-runtimes.js",
  "src/runtime-stream-utils.js",
  "src/todo-runtime.js",
  "src/tutorial-app-client.js",
  "src/tutorial-bootstrap-client.js",
  "src/tutorial-bootstrap-controller-client.js",
  "src/tutorial-bootstrap-ui.js",
  "src/tutorial-runtime-ui.js",
  "src/tutorials.js",
  "src/widget-define.js",
  "src/world-graph.js"
]);

test("every executable plugin has co-located tests", async () => {
  const executableWithoutTests = (await pluginPackages())
    .filter(pkg => typeof pkg.manifest?.runtime?.entry === "string")
    .filter(pkg => pkg.tests.length === 0)
    .map(pkg => pkg.manifest.id);

  assert.deepEqual(executableWithoutTests, []);
});

test("meta plugin packages stay executable-empty", async () => {
  const packages = await pluginPackages();
  const practicalBackend = packages.find(pkg => pkg.manifest.id === "plugin.practical-backend");

  assert.ok(practicalBackend);
  assert.equal(practicalBackend.manifest.runtime, undefined);
  assert.equal(practicalBackend.manifest.activatesBundles, undefined);
  assert.equal(await pathExists(path.join(practicalBackend.pluginDir, "runtime.js")), false);
  assert.equal(practicalBackend.tests.length > 0, true);
});

test("deleted practical-backend catch-all package and bundle stay absent from active registries", async () => {
  assert.equal(await pathExists(path.join(pluginsRoot, "practical-backend-core")), false);
  assert.equal((await pluginPackages()).some(pkg => pkg.manifest.id === "plugin.practical-backend-core"), false);
  assert.equal(bundleIds().includes("bundle-practical-backend"), false);
  assert.deepEqual(runtimeBundleHandlerCatalog("bundle-practical-backend").dispatchHandlers, []);
});

test("practical-backend child handler ids are owned by concrete plugin runtime modules", async () => {
  const coreHandlers = new Set(runtimeBundleHandlerCatalog("bundle-core-runtime").dispatchHandlers);
  for (const [bundleId, ownership] of Object.entries(PRACTICAL_BACKEND_CHILD_OWNERSHIP)) {
    const runtime = await import(pathToFileURL(path.join(pluginsRoot, ownership.dir, "runtime.js")).href);
    const catalog = runtime.handlerCatalog;
    const dispatchHandlers = new Set(catalog.dispatchHandlers);
    const manifest = bundleManifest(bundleId);

    assert.ok(manifest, `${bundleId} should exist`);
    for (const handlerId of ownership.handlers) {
      assert.equal(dispatchHandlers.has(handlerId), true, `${bundleId} should own ${handlerId}`);
      assert.equal(coreHandlers.has(handlerId), false, `${handlerId} must not be core-owned`);
    }
  }

  const fsJsonManifest = JSON.parse(await fs.readFile(path.join(pluginsRoot, "fs-json", "plugin.json"), "utf8"));
  assert.deepEqual(fsJsonManifest.contributes.capabilities.map(entry => entry.id), ["fs.json.read", "fs.json.write"]);
});

test("plugin-owned optional routes and capabilities stay out of minimal core", () => {
  const minimalRoutes = runtimeRouteEntriesForProfile("minimal");
  const minimalCapabilities = providedCapabilityIdsForProfile("minimal");
  const optionalRouteHandlers = minimalRoutes
    .map(route => String(route.handler || ""))
    .filter(handler => OPTIONAL_HANDLER_PREFIXES.some(prefix => handler.startsWith(prefix)));

  assert.deepEqual(optionalRouteHandlers, []);
  assert.deepEqual(minimalCapabilities.filter(capability => [
    "auth.oauth",
    "db.sql",
    "fs.blob",
    "fs.json.read",
    "fs.json.write",
    "fs.stream",
    "http.outbound",
    "jobs.queue",
    "notify.email",
    "notify.sms",
    "search.index",
    "upload.asset",
    "webhook.inbound"
  ].includes(capability)), []);
});

test("plugin-owned route handlers are not declared by the core runtime bundle", () => {
  const coreBundle = bundleManifest("bundle-core-runtime");
  const coreRouteHandlers = coreBundle.contributes.routes.map(route => String(route.handler || ""));
  const coreCatalogHandlers = runtimeBundleHandlerCatalog("bundle-core-runtime").dispatchHandlers;
  const leakedHandlers = [...coreRouteHandlers, ...coreCatalogHandlers]
    .filter(handler => OPTIONAL_HANDLER_PREFIXES.some(prefix => handler.startsWith(prefix)));

  assert.deepEqual(leakedHandlers, []);
});

test("runtime profiles are seed-backed and global first-party plugin registries stay absent", async () => {
  const runtimeBundlesSource = await fs.readFile(path.join(repoRoot, "src", "runtime-bundles.js"), "utf8");
  const runtimeBundleHandlersSource = await fs.readFile(path.join(repoRoot, "src", "runtime-bundle-handlers.js"), "utf8");
  const profileSeed = JSON.parse(await fs.readFile(path.join(repoRoot, "store", "seeds", "runtime-profiles.json"), "utf8"));
  const catalogSeed = JSON.parse(await fs.readFile(path.join(repoRoot, "store", "seeds", "first-party-plugin-catalog.json"), "utf8"));

  assert.equal(await pathExists(path.join(pluginsRoot, "first-party-runtime-registry.js")), false);
  assert.equal(await pathExists(path.join(pluginsRoot, "first-party-runtime-services.js")), false);
  assert.equal(await pathExists(path.join(pluginsRoot, "first-party-job-handlers.js")), false);
  assert.equal(runtimeBundlesSource.includes("first-party-runtime-registry"), false);
  assert.equal(runtimeBundlesSource.includes("FIRST_PARTY_PLUGIN_BUNDLE_SPECS"), false);
  assert.equal(runtimeBundlesSource.includes("runtimeProfilePresetsFromSeeds"), true);
  assert.equal(runtimeBundleHandlersSource.includes("FIRST_PARTY_PLUGIN_HANDLER_CATALOGS"), false);
  assert.deepEqual(profileSeed.profiles.full.plugins, [
    "plugin.authoring",
    "plugin.inspect",
    "plugin.canvas",
    "plugin.mcp",
    "plugin.practical-backend",
    "plugin.demo",
    "plugin.eden"
  ]);
  assert.deepEqual(runtimeProfilePluginIds("full"), profileSeed.profiles.full.plugins);
  assert.equal(catalogSeed.bundles.some(bundle => bundle.id === "bundle-inspect" && bundle.plugin === "plugin.inspect"), true);
});

test("src widgets module stays generic authored-widget ABI plus compatibility exports", async () => {
  const widgetsSource = await fs.readFile(path.join(repoRoot, "src", "widgets.js"), "utf8");
  const ownedFunctionExports = [...widgetsSource.matchAll(/^export function (\w+)/gm)].map(match => match[1]).sort();

  assert.deepEqual(ownedFunctionExports, [
    "activateWidgetVersion",
    "activeWidgetVersions",
    "attachWidget",
    "defineFrontendProgram",
    "defineFrontendStep",
    "defineWidget",
    "defineWidgetVersion",
    "defineWidgetVersionTransition",
    "frontendProgram",
    "frontendProgramsProjection",
    "frontendStepsProjection",
    "stableJson",
    "templateWidgetTrees",
    "updateWidget",
    "widgetDefinitions",
    "widgetTree",
    "widgetVersionActivationHistory",
    "widgetVersionTransitionIndex",
    "widgetVersionTransitions",
    "widgetVersions"
  ].sort());

  assert.equal(widgetsSource.includes("../plugins/inspect/widget-versions.js"), false);
  assert.equal(widgetsSource.includes("../plugins/inspect/widget-page.js"), false);
  assert.equal(widgetsSource.includes("export function requestWidgetVersionActivation"), false);
  assert.equal(widgetsSource.includes("export function rollbackWidgetVersion"), false);
  assert.equal(widgetsSource.includes("export function renderWidgetPage"), false);
  assert.equal(widgetsSource.includes("renderTutorialClient"), false);
  assert.equal(widgetsSource.includes("resolveEdenPageTheme"), false);
  assert.equal(widgetsSource.includes("function renderDocument"), false);
});

test("global first-party service barrels stay absent", async () => {
  const routeHandlersSource = await fs.readFile(path.join(repoRoot, "src", "runtime-route-handlers.js"), "utf8");
  const pluginSupportSource = await fs.readFile(path.join(pluginsRoot, "backend-seams", "support-services.js"), "utf8");

  assert.equal(routeHandlersSource.includes("./runtime-practical-backend-support-services.js"), false);
  assert.equal(routeHandlersSource.includes("../plugins/first-party-runtime-services.js"), false);
  assert.equal(await pathExists(path.join(pluginsRoot, "first-party-runtime-services.js")), false);
  assert.equal(await pathExists(path.join(pluginsRoot, "first-party-job-handlers.js")), false);
  assert.equal(await pathExists(path.join(repoRoot, "src", "runtime-practical-backend-support-services.js")), false);
  assert.equal(pluginSupportSource.includes("export function createPracticalBackendSupportServices"), true);
  assert.equal(pluginSupportSource.includes("assetDiagnostics"), true);
  assert.equal(pluginSupportSource.includes("enqueueNotification"), true);
});

test("plugin-to-src import audit stays explicitly classified", async () => {
  const imports = await pluginSrcImports();
  const discoveredTargets = [...imports.keys()].sort();
  const classifiedTargets = [...GENERIC_PLUGIN_SRC_IMPORT_TARGETS].sort();

  assert.deepEqual(discoveredTargets, classifiedTargets);
  const backendProgramsSource = await fs.readFile(path.join(repoRoot, "src", "backend-programs.js"), "utf8");
  const runtimeBuiltinsSource = await fs.readFile(path.join(repoRoot, "src", "runtime-builtins.js"), "utf8");
  const demoRuntimeBuiltinsSource = await fs.readFile(path.join(pluginsRoot, "demo", "runtime-builtins.js"), "utf8");
  const mcpAuthoringRuntimeBuiltinsSource = await fs.readFile(path.join(pluginsRoot, "mcp-authoring", "runtime-builtins.js"), "utf8");
  const manifests = await Promise.all((await pluginPackages()).map(pkg => fs.readFile(path.join(pkg.pluginDir, "plugin.json"), "utf8").then(JSON.parse)));
  const manifestCapabilityIds = new Set(manifests.flatMap(manifest =>
    (manifest.contributes?.capabilities ?? []).map(entry => String(entry?.id ?? entry)).filter(Boolean)
  ));

  assert.equal(backendProgramsSource.includes("Generic authored backend-program ABI"), true);
  assert.equal(backendProgramsSource.includes("todo_create_spec"), false);
  assert.equal(backendProgramsSource.includes("renderWidgetPage"), false);

  assert.equal(runtimeBuiltinsSource.includes("todo_create_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("todo_update_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("todo_delete_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("mcp_server_define_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("mcp_tool_install_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("mcp_tool_remove_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("fs.json.read"), false);
  assert.equal(runtimeBuiltinsSource.includes("upload.asset"), false);
  assert.equal(runtimeBuiltinsSource.includes("db.sql"), false);
  assert.equal(runtimeBuiltinsSource.includes("jobs.queue"), false);
  assert.equal(runtimeBuiltinsSource.includes("search.index"), false);
  assert.equal(runtimeBuiltinsSource.includes("webhook.inbound"), false);
  assert.equal(runtimeBuiltinsSource.includes("notify.email"), false);
  assert.equal(runtimeBuiltinsSource.includes("auth.oauth"), false);
  assert.equal(await pathExists(path.join(pluginsRoot, "first-party-capabilities.js")), false);
  assert.equal(manifestCapabilityIds.has("fs.json.read"), true);
  assert.equal(manifestCapabilityIds.has("upload.asset"), true);
  assert.equal(manifestCapabilityIds.has("db.sql"), true);
  assert.equal(manifestCapabilityIds.has("jobs.queue"), true);
  assert.equal(manifestCapabilityIds.has("search.index"), true);
  assert.equal(manifestCapabilityIds.has("webhook.inbound"), true);
  assert.equal(manifestCapabilityIds.has("notify.email"), true);
  assert.equal(manifestCapabilityIds.has("auth.oauth"), true);
  assert.equal(demoRuntimeBuiltinsSource.includes("todo_create_spec"), true);
  assert.equal(demoRuntimeBuiltinsSource.includes("todo_update_spec"), true);
  assert.equal(demoRuntimeBuiltinsSource.includes("todo_delete_spec"), true);
  assert.equal(mcpAuthoringRuntimeBuiltinsSource.includes("mcp_server_define_spec"), true);
  assert.equal(mcpAuthoringRuntimeBuiltinsSource.includes("mcp_tool_install_spec"), true);
  assert.equal(mcpAuthoringRuntimeBuiltinsSource.includes("mcp_tool_remove_spec"), true);
});

test("deleted src plugin stubs stay absent", async () => {
  for (const relativePath of REMOVED_PLUGIN_SRC_STUBS) {
    assert.equal(await pathExists(path.join(repoRoot, relativePath)), false, `${relativePath} should stay deleted`);
  }
});
