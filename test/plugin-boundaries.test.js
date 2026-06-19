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

async function srcPluginImports() {
  const srcRoot = path.join(repoRoot, "src");
  const files = await findFiles(srcRoot, file => file.endsWith(".js"));
  const imports = [];
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    for (const match of source.matchAll(/from\s+["'](\.\.\/plugins\/[^"']+)["']/g)) {
      imports.push({
        file: path.relative(repoRoot, file).replace(/\\/g, "/"),
        specifier: match[1]
      });
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
  "secret.store",
  "db.sql",
  "fs.blob",
  "fs.stream",
  "jobs.",
  "notify.",
  "notifications.",
  "http.outbound",
  "platform.",
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
  "bundle-secret": { dir: "secret", handlers: ["secret.store.list", "secret.store.read", "secret.store.create"] },
  "bundle-sql": { dir: "sql", handlers: ["db.sql.inspect", "db.sql.query", "db.sql.command"] },
  "bundle-webhooks": { dir: "webhooks", handlers: ["webhook.inbound.receive", "webhook.inbound.list", "webhook.inbound.read"] }
});

const GENERIC_PLUGIN_SRC_IMPORT_TARGETS = Object.freeze([
  "src/backend-programs.js",
  "src/desire/host-op-migration.js",
  "src/desire/index.js",
  "src/dsl.js",
  "src/gates.js",
  "src/ids.js",
  "src/kernel.js",
  "src/modules.js",
  "src/process-graph.js",
  "src/projectors-core.js",
  "src/runtime-builtins.js",
  "src/runtime-config-utils.js",
  "src/runtime-guidance-bootstrap-client.js",
  "src/runtime-guidance-bootstrap-controller-client.js",
  "src/runtime-guidance-bootstrap-ui.js",
  "src/runtime-guidance-client-adapter.js",
  "src/runtime-guidance-client-bootstrap.js",
  "src/runtime-guidance-client-interactions.js",
  "src/runtime-guidance-client-runtime.js",
  "src/runtime-guidance-client-state.js",
  "src/runtime-guidance-client.js",
  "src/runtime-guidance-action-registry.js",
  "src/runtime-guidance-companion-shell.js",
  "src/runtime-guidance-runtime-issue-suggestions.js",
  "src/runtime-guidance-disabled-scopes-actions.js",
  "src/runtime-guidance-disabled-scopes-view.js",
  "src/runtime-guidance-model.js",
  "src/runtime-guidance-scope-anchors.js",
  "src/runtime-guidance-scope-inventory-factory.js",
  "src/runtime-guidance-scope-inventory.js",
  "src/runtime-guidance-overlay-actions.js",
  "src/runtime-guidance-overlay-dom.js",
  "src/runtime-guidance-overlay-drag.js",
  "src/runtime-guidance-overlay-interactions.js",
  "src/runtime-guidance-overlay-view.js",
  "src/runtime-guidance-progress-runtime.js",
  "src/runtime-guidance-progress-state.js",
  "src/runtime-guidance-runtime-actions.js",
  "src/runtime-guidance.js",
  "src/runtime-page-state.js",
  "src/runtime-presentation.js",
  "src/runtime-surface-kit.js",
  "src/runtime-widget-page.js",
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

const LARGE_SRC_CEREMONY_ALLOWLIST = Object.freeze({
  "src/app-project.js": "generic app projection and authored app composition ceremony",
  "src/backend-programs.js": "stable authored backend-program ABI",
  "src/cli.js": "CLI transport and startup orchestration",
  "src/desktop-session-manager.js": "desktop runtime lifecycle ceremony",
  "src/dsl.js": "generic DSL apply/load orchestration",
  "src/kernel.js": "generic world/kernel mechanics",
  "src/modules.js": "generic witnessed-state projection host and stable ABI",
  "src/runtime-builtins.js": "core builtin traits, universal capabilities, and generic process specs",
  "src/runtime-bundles.js": "seed-backed profile and bundle composition mechanics",
  "src/runtime-core-handlers.js": "core session, diagnostics, runtime catalog, home page hook invocation, and backend-program ABI dispatch",
  "src/runtime-guidance-bootstrap-client.js": "core guidance progress client runtime and session persistence helpers",
  "src/runtime-guidance-bootstrap-controller-client.js": "core guidance overlay controller and authored bootstrap guidance interaction ceremony",
  "src/runtime-guidance-client-adapter.js": "core live guidance client projection and runtime snapshot helpers",
  "src/runtime-guidance-action-registry.js": "core guidance action audit registry and suggestion action truth metadata",
  "src/runtime-guidance-companion-shell.js": "core unified Sourcery companion shell for runtime issues and guidance recovery",
  "src/runtime-guidance-runtime-issue-suggestions.js": "core runtime-issue to ambient suggestion projection for the companion shell",
  "src/runtime-guidance-model.js": "core guidance progress normalization, scope disabling, and authored guidance state helpers",
  "src/runtime-guidance-scope-inventory.js": "core guidance scope inventory projection across active, muted, and completed scopes",
  "src/runtime-guidance-scope-anchors.js": "core guidance scope-anchor builders for authored widget and bootstrap operator surfaces",
  "src/runtime-guidance-overlay-actions.js": "core live guidance overlay action choreography",
  "src/runtime-guidance-overlay-view.js": "core live guidance overlay rendering and disabled-scope panel projection",
  "src/runtime-guidance-progress-state.js": "core live guidance surface-state and disabled-scope derivation helpers",
  "src/runtime-operator-service.js": "operator filesystem/import/export service ceremony",
  "src/runtime-plugin-loader.js": "plugin runtime ABI validation and active module loading",
  "src/runtime-plugin-utils.js": "plugin discovery, validation, dependency expansion, catalog, review, and composition read models",
  "src/runtime-presentation.js": "core page presentation themes, CSS variable emission, and shared surface-kit styling",
  "src/runtime-route-handlers.js": "generic route assembly, active dependency delegation, inactive guards, and diagnostics ceremony",
  "src/runtime-server.js": "server startup, lifecycle, transport, and active static asset dispatch",
  "src/runtime-surface-shell.js": "generic surface route host reset and blocked host projection",
  "src/runtime-widget-page.js": "generic authored widget-page rendering and lightweight frontend program runtime",
  "src/type-model.js": "generic type model",
  "src/widgets.js": "generic authored-widget ABI"
});

const COMPLETION_CONTRADICTION_PHRASES = Object.freeze([
  ["migration", "debt"].join(" "),
  ["tracked", "debt"].join(" "),
  ["remaining", "optional-domain"].join(" "),
  ["Open", "Work"].join(" "),
  ["Closure", "Evidence"].join(" "),
  ["Passing", "commands"].join(" "),
  "tr" + "anche"
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
    "secret.store",
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
  assert.deepEqual(runtimeProfilePluginIds("full"), profileSeed.profiles.full.plugins);
  assert.equal(catalogSeed.bundles.some(bundle => bundle.id === "bundle-inspect" && bundle.plugin === "plugin.inspect"), true);
});

test("bootstrap consumes generic guidance and starter registries without tutorial-owned imports", async () => {
  const bootstrapManifest = JSON.parse(await fs.readFile(path.join(pluginsRoot, "bootstrap", "plugin.json"), "utf8"));
  const bootstrapReadModelsSource = await fs.readFile(path.join(pluginsRoot, "bootstrap", "bootstrap-contribution-state.js"), "utf8");
  const bootstrapPageScriptSource = await fs.readFile(path.join(pluginsRoot, "bootstrap", "bootstrap-page-script.js"), "utf8");
  const tutorialRuntimeSource = await fs.readFile(path.join(pluginsRoot, "tutorial", "runtime.js"), "utf8");
  const starterRuntimeSource = await fs.readFile(path.join(pluginsRoot, "starter", "runtime.js"), "utf8");
  const tutorialManifest = JSON.parse(await fs.readFile(path.join(pluginsRoot, "tutorial", "plugin.json"), "utf8"));
  const starterManifest = JSON.parse(await fs.readFile(path.join(pluginsRoot, "starter", "plugin.json"), "utf8"));

  assert.deepEqual(bootstrapManifest.dependsOnPlugins ?? [], []);
  assert.equal(bootstrapReadModelsSource.includes("runtimeContributions?.guidanceDefinitions"), true);
  assert.equal(bootstrapReadModelsSource.includes("runtimeContributions?.starterBlueprints"), true);
  assert.equal(bootstrapReadModelsSource.includes("../tutorial/"), false);
  assert.equal(bootstrapReadModelsSource.includes("../starter/"), false);
  assert.equal(bootstrapPageScriptSource.includes("./bootstrap-guidance-runtime.js"), true);
  assert.equal(bootstrapPageScriptSource.includes("./bootstrap-guidance-runtime-view.js"), true);
  assert.equal(bootstrapPageScriptSource.includes("./bootstrap-tutorial-runtime.js"), false);
  assert.equal(bootstrapPageScriptSource.includes("./bootstrap-tutorial-runtime-view.js"), false);

  assert.deepEqual(tutorialManifest.dependsOnPlugins ?? [], []);
  assert.deepEqual(starterManifest.dependsOnPlugins ?? [], []);
  assert.equal(tutorialRuntimeSource.includes('kind: "guidanceDefinitions"'), true);
  assert.equal(tutorialRuntimeSource.includes('kind: "starterBlueprints"'), false);
  assert.equal(tutorialRuntimeSource.includes("createGuidanceBundleHandlers"), false);
  assert.equal(tutorialRuntimeSource.includes("routes = Object.freeze([])"), true);
  assert.equal(starterRuntimeSource.includes('kind: "starterBlueprints"'), true);
  assert.equal(starterRuntimeSource.includes('kind: "guidanceDefinitions"'), false);
  assert.equal(starterRuntimeSource.includes("routes = Object.freeze([])"), true);
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

test("route handler optional helper ownership stays plugin-delegated", async () => {
  const routeHandlersSource = await fs.readFile(path.join(repoRoot, "src", "runtime-route-handlers.js"), "utf8");
  const forbiddenLocalHelpers = [
    /function\s+normalizeNotificationRequest\b/,
    /const\s+normalizeNotificationRequest\b/,
    /function\s+notificationReadShape\b/,
    /const\s+notificationReadShape\s*=/,
    /function\s+outboundReadShape\b/,
    /const\s+outboundReadShape\s*=/,
    /function\s+webhookReadShape\b/,
    /const\s+webhookReadShape\s*=/,
    /function\s+defaultAssetsRootFor\b/,
    /const\s+defaultAssetsRootFor\b/,
    /function\s+defaultBlobsRootFor\b/,
    /const\s+defaultBlobsRootFor\b/,
    /assetIngestRetryUrl/,
    /assetSearchReindexUrl/,
    /path\.resolve/
  ];

  for (const pattern of forbiddenLocalHelpers) {
    assert.equal(pattern.test(routeHandlersSource), false, `${pattern} should not be implemented in runtime-route-handlers.js`);
  }
  assert.equal(routeHandlersSource.includes("supportServices.notificationReadShape"), true);
  assert.equal(routeHandlersSource.includes("supportServices.outboundReadShape"), true);
  assert.equal(routeHandlersSource.includes("supportServices.webhookReadShape"), true);
  assert.equal(routeHandlersSource.includes("supportServices.createPracticalBackendAssetServices"), true);
  assert.equal(routeHandlersSource.includes("supportServices.createPracticalBackendSupportServices"), true);
  assert.equal(routeHandlersSource.includes("createPracticalBackendIoServicesImpl"), true);
  assert.equal(routeHandlersSource.includes("createPracticalBackendIoServicesResolved"), true);
});

test("src does not statically import optional plugin implementation modules", async () => {
  assert.deepEqual(await srcPluginImports(), []);
});

test("core app context has no optional provider fallback factory seam", async () => {
  const appContextSource = await fs.readFile(path.join(repoRoot, "src", "runtime-app-context.js"), "utf8");
  const startupServicesSource = await fs.readFile(path.join(repoRoot, "src", "runtime-startup-services.js"), "utf8");
  const forbiddenFallbackNames = [
    "createBuiltinAssetJobHandlers",
    "createBuiltinNotificationJobHandlers",
    "createBuiltinWebhookJobHandlers",
    "createInProcessJobQueue",
    "createDbSqlRuntime",
    "createSearchIndexRuntime"
  ];

  for (const name of forbiddenFallbackNames) {
    assert.equal(appContextSource.includes(name), false, `${name} must not be a core app-context fallback`);
    assert.equal(startupServicesSource.includes(name), false, `${name} must not be passed through startup services`);
  }
  assert.equal(appContextSource.includes('providerRuntimeFactories["jobs.queue"] ??'), false);
  assert.equal(appContextSource.includes('providerRuntimeFactories["db.sql"] ??'), false);
  assert.equal(appContextSource.includes('providerRuntimeFactories["search.index"] ??'), false);
  assert.equal(appContextSource.includes("runtimeContributions?.providerRuntimeFactories"), true);
  assert.equal(appContextSource.includes("runtimeContributions?.jobHandlerFactories"), true);
});

test("plugin-to-src import audit stays explicitly classified", async () => {
  const imports = await pluginSrcImports();
  const discoveredTargets = [...imports.keys()].sort();
  const classifiedTargets = [...GENERIC_PLUGIN_SRC_IMPORT_TARGETS].sort();

  assert.deepEqual(discoveredTargets, classifiedTargets);
  const backendProgramsSource = await fs.readFile(path.join(repoRoot, "src", "backend-programs.js"), "utf8");
  const runtimeBuiltinsSource = await fs.readFile(path.join(repoRoot, "src", "runtime-builtins.js"), "utf8");
  const desireApplySource = await fs.readFile(path.join(repoRoot, "src", "desire", "apply.js"), "utf8");
  const demoRuntimeBuiltinsSource = await fs.readFile(path.join(pluginsRoot, "demo", "runtime-builtins.js"), "utf8");
  const mcpAuthoringRuntimeBuiltinsSource = await fs.readFile(path.join(pluginsRoot, "mcp-authoring", "runtime-builtins.js"), "utf8");
  const mcpAuthoringRuntimeSource = await fs.readFile(path.join(pluginsRoot, "mcp-authoring", "runtime.js"), "utf8");
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
  assert.equal(runtimeBuiltinsSource.includes("todoProjection"), false);
  assert.equal(runtimeBuiltinsSource.includes("privateNotesProjection"), false);
  assert.equal(runtimeBuiltinsSource.includes("widget.guidanceTarget"), true);
  assert.equal(runtimeBuiltinsSource.includes("guidanceTarget"), true);
  assert.equal(runtimeBuiltinsSource.includes("widget.tutorialTarget"), false);
  assert.equal(runtimeBuiltinsSource.includes("tutorialTarget"), false);
  assert.equal(runtimeBuiltinsSource.includes("mcp_server_define_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("mcp_tool_install_spec"), false);
  assert.equal(runtimeBuiltinsSource.includes("mcp_tool_remove_spec"), false);
  assert.equal(desireApplySource.includes('"mcpServer"'), false);
  assert.equal(desireApplySource.includes('"mcpToolInstall"'), false);
  assert.equal(desireApplySource.includes('"mcpToolRemove"'), false);
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
  assert.equal(demoRuntimeBuiltinsSource.includes("todoProjection"), true);
  assert.equal(demoRuntimeBuiltinsSource.includes("privateNotesProjection"), true);
  assert.equal(mcpAuthoringRuntimeBuiltinsSource.includes("mcp_server_define_spec"), true);
  assert.equal(mcpAuthoringRuntimeBuiltinsSource.includes("mcp_tool_install_spec"), true);
  assert.equal(mcpAuthoringRuntimeBuiltinsSource.includes("mcp_tool_remove_spec"), true);
  assert.equal(mcpAuthoringRuntimeSource.includes("mcpAuthoringRuntimeDeclarations"), false);
  assert.equal(await pathExists(path.join(pluginsRoot, "tutorial", "runtime-builtins.js")), false);
});

test("DSL ownership keeps plugin activation core but feature declarations plugin-owned or generic", async () => {
  const desireApplySource = await fs.readFile(path.join(repoRoot, "src", "desire", "apply.js"), "utf8");
  const desireRvmSource = await fs.readFile(path.join(repoRoot, "src", "desire", "rvm.js"), "utf8");
  const chartRuntimeSource = await fs.readFile(path.join(pluginsRoot, "chart-runtime", "runtime.js"), "utf8");
  const mcpAuthoringRuntimeSource = await fs.readFile(path.join(pluginsRoot, "mcp-authoring", "runtime.js"), "utf8");

  assert.equal(desireApplySource.includes('"runtimePluginInstall"'), true);
  assert.equal(desireApplySource.includes('"runtimePluginRemove"'), true);
  assert.equal(desireApplySource.includes('"mcpServer"'), true);
  assert.equal(desireApplySource.includes('"mcpToolInstall"'), true);
  assert.equal(desireApplySource.includes('"mcpToolRemove"'), true);
  assert.equal(mcpAuthoringRuntimeSource.includes("mcpAuthoringRuntimeDeclarations"), false);

  assert.equal(desireRvmSource.includes('case "chart"'), true);
  assert.equal(desireRvmSource.includes("planChart"), false);
  assert.equal(desireRvmSource.includes("renderChartHtml"), false);
  assert.equal(chartRuntimeSource.includes('bundleId = "bundle-chart-runtime"'), true);
  assert.equal(chartRuntimeSource.includes('"page.chart"'), true);
});

test("deleted src plugin stubs stay absent", async () => {
  for (const relativePath of REMOVED_PLUGIN_SRC_STUBS) {
    assert.equal(await pathExists(path.join(repoRoot, relativePath)), false, `${relativePath} should stay deleted`);
  }
});

test("large top-level src files stay explicitly classified as ceremony or ABI", async () => {
  const srcRoot = path.join(repoRoot, "src");
  const entries = await fs.readdir(srcRoot, { withFileTypes: true });
  const largeFiles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const relativePath = `src/${entry.name}`;
    const stat = await fs.stat(path.join(srcRoot, entry.name));
    if (stat.size > 8000) largeFiles.push(relativePath);
  }

  assert.deepEqual(
    largeFiles.sort(),
    Object.keys(LARGE_SRC_CEREMONY_ALLOWLIST).sort()
  );
  for (const [relativePath, classification] of Object.entries(LARGE_SRC_CEREMONY_ALLOWLIST)) {
    assert.equal(typeof classification === "string" && classification.trim().length > 0, true, `${relativePath} must have a classification`);
    for (const phrase of COMPLETION_CONTRADICTION_PHRASES) {
      assert.equal(classification.includes(phrase), false, `${relativePath} classification should not contain stale completion debt wording`);
    }
  }
});

test("plugin migration control doc stays current-state only", async () => {
  const controlSource = await fs.readFile(path.join(repoRoot, "docs", "PLUGIN-MIGRATION-CONTROL.md"), "utf8");

  for (const heading of ["## Current Baseline", "## Completion Baseline", "## Completion Criteria", "## Verification Gates"]) {
    assert.equal(controlSource.includes(heading), true, `${heading} should be present`);
  }
  for (const phrase of COMPLETION_CONTRADICTION_PHRASES) {
    assert.equal(controlSource.includes(phrase), false, `control doc should not contain stale phrase ${phrase}`);
  }
  assert.equal(/^- \[[ xX]\]/m.test(controlSource), false, "control doc should not carry checklist status syntax");
});

test("process-view support services stay generic process ABI", async () => {
  const source = await fs.readFile(path.join(repoRoot, "src", "runtime-bundle-support-services.js"), "utf8");

  assert.equal(source.includes("../plugins/"), false);
  assert.equal(source.includes("plugin.inspect"), false);
  assert.equal(source.includes("worldGraph"), false);
  assert.equal(source.includes("renderProcess"), false);
  assert.equal(source.includes("backend.process.start"), true);
  assert.equal(source.includes("backend.step.done"), true);
});

test("backend-program execution stays classified as stable core ABI", async () => {
  const coreHandlersSource = await fs.readFile(path.join(repoRoot, "src", "runtime-core-handlers.js"), "utf8");
  const backendProgramsSource = await fs.readFile(path.join(repoRoot, "src", "backend-programs.js"), "utf8");

  assert.equal(backendProgramsSource.includes("Generic authored backend-program ABI"), true);
  assert.equal(coreHandlersSource.includes('"backendProgram.run"'), true);
  assert.equal(coreHandlersSource.includes("activeBackendProgramDefinition"), true);
  assert.equal(coreHandlersSource.includes("../plugins/"), false);
  assert.equal(coreHandlersSource.includes("todo_create_spec"), false);
  assert.equal(coreHandlersSource.includes("privateNotesProjection"), false);
});
