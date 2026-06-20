import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { relation } from "./kernel.js";
import { createModuleProjectorContext, ensureCapabilityDefinition, installCapability, moduleProjectors } from "./modules.js";
import {
  headerValue,
  readJson,
  resolveRequestContext,
  sendJson,
  sseFrame
} from "./runtime-http-utils.js";
import {
  createRuntimeAppContext,
  createUnavailableRuntimeAppContext
} from "./runtime-app-context.js";
import {
  AppPreviewSessionManager,
  AppSnapshotManager
} from "./app-snapshot-manager.js";
import {
  createRuntimeAppContextForRunner
} from "./runtime-startup-services.js";
import { createRuntimeContextResolver } from "./runtime-context-resolver.js";
import {
  compileRouteMatcher,
  matchDeclaredRoute,
  matchGenericEndpoint,
  shouldServeBootstrapFallback
} from "./runtime-routing.js";
import { ensureRuntimeBuiltins } from "./runtime-builtins.js";
import { createRuntimeVerificationPersistence } from "./runtime-verification-persistence.js";
import { createMaterializedViewRegistry } from "./materialized-views.js";
import {
  DEFAULT_BOOTSTRAP_RUNTIME_PROFILE,
  DEFAULT_RUNTIME_PROFILE,
  defaultHostCapabilitiesForProfile,
  dispatchHandlerIdsForProfile,
  effectiveRuntimeProfileForRunner,
  handlerSetDefinitionsForProfile,
  handlerSetFactoriesForProfile,
  handlerMetadataForProfile,
  matchRuntimeBundleRoute,
  providedCapabilityIdsForProfile,
  runtimeCapabilityDefinitionsForProfile,
  runtimeBuiltinSeedContributionsForProfile,
  runtimeBundleSummaryForProfile,
  runtimeSurfaceEntriesForProfile,
  startupRequiredHostCapabilitiesForProfile
} from "./runtime-bundles.js";
import { renderCompositionGatedPage } from "./runtime-page-fallbacks.js";
import {
  readRuntimePluginCatalog,
  resolveConfiguredRuntimePluginIds,
  resolveRuntimePluginRoot
} from "./runtime-plugin-utils.js";
import {
  createRuntimeAuthoringPolicy,
  defaultRuntimeAuthoringMode
} from "./runtime-authoring-policy.js";
import { evaluateRouteAccess } from "./runtime-authz.js";
import {
  applyRuntimePluginLoadState,
  loadRuntimePluginModules
} from "./runtime-plugin-loader.js";
import { collectActiveRuntimeContributions } from "./runtime-active-contributions.js";
import { buildRuntimeOperatorContract } from "./runtime-operator-contract.js";
import { createRuntimeOperatorService } from "./runtime-operator-service.js";
import { resolveRunnerPromotionPolicy } from "./runtime-promotion-policy.js";
import { resolveRunnerVerificationPolicy } from "./runtime-verification-policy.js";
import { createStartupTelemetry } from "./startup-telemetry.js";
import { createRuntimeProcessHealthMonitor } from "./runtime-process-health.js";
import { createWitnessCoreBridge, createWitnessCoreStatusStore } from "./witness-core-bridge.js";
import { retiredLegacyFrontendRouteState } from "./legacy-frontend-bridge.js";

function surfaceRowsFromWitnesses(witnesses = []) {
  const rows = new Map();
  for (const witness of witnesses ?? []) {
    if (witness?.process !== "desire.defineSurface" || typeof witness?.body?.id !== "string" || !witness.body.id.trim()) continue;
    rows.set(witness.body.id, witness.body);
  }
  return [...rows.values()];
}

function uniqueStrings(values = []) {
  return [...new Set((values ?? []).map(String).filter(Boolean))];
}

function mergePluginCatalogs(catalogs = []) {
  const packageById = new Map();
  const rejectedById = new Map();
  for (const catalog of catalogs ?? []) {
    for (const pluginPackage of catalog?.packages ?? []) {
      const requestedSources = uniqueStrings(pluginPackage?.activation?.requestedSources ?? []);
      const current = packageById.get(pluginPackage.id);
      if (!current) {
        packageById.set(pluginPackage.id, {
          ...pluginPackage,
          activation: {
            ...(pluginPackage?.activation ?? {}),
            active: pluginPackage?.activation?.active === true,
            requestedSources
          }
        });
        continue;
      }
      packageById.set(pluginPackage.id, {
        ...current,
        activation: {
          ...(current.activation ?? {}),
          active: current?.activation?.active === true || pluginPackage?.activation?.active === true,
          requestedSources: uniqueStrings([
            ...(current?.activation?.requestedSources ?? []),
            ...requestedSources
          ])
        }
      });
    }
    for (const rejected of catalog?.rejectedPlugins ?? []) {
      const current = rejectedById.get(rejected.id) ?? {
        id: rejected.id,
        reasons: [],
        requestedSources: []
      };
      current.reasons = uniqueStrings([...(current.reasons ?? []), ...(rejected?.reasons ?? [])]);
      current.requestedSources = uniqueStrings([...(current.requestedSources ?? []), ...(rejected?.requestedSources ?? [])]);
      rejectedById.set(rejected.id, current);
    }
  }
  return {
    packages: [...packageById.values()].sort((left, right) => String(left.id || "").localeCompare(String(right.id || ""))),
    rejectedPlugins: [...rejectedById.values()].sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")))
  };
}

export async function startRuntimeServer(world, {
  actor,
  serverRunnerId = null,
  port = 0,
  runtimeRoot,
  appProject = null,
  logger,
  mcpInternalToken = null,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  runtimeProfileExplicit = false,
  runtimePluginIds = null,
  startupRuntimePluginIds = null,
  runtimeStartupMode = "serve",
  runtimeAuthoringMode = null,
  runtimeOperatorContract = null,
  devMode = null,
  env = process.env,
  backgroundStartupPolicy = null,
  startupPersistenceCommitMode = "post-ready",
  startupTelemetry = createStartupTelemetry({ mode: runtimeStartupMode })
}, deps) {
  const {
    createGenericRouteHandlers,
    hostCapabilities,
    buildBootstrapStartupRunner = () => null,
    resolveRuntimeConfig,
    resolveServerRunner,
    resolveRunnerForHost,
    resolveStartupRunner,
    resolveStorageConfig,
    httpModule = http,
    fsModule = fs,
    ensureRuntimeBuiltins: ensureRuntimeBuiltinsImpl = ensureRuntimeBuiltins,
    runtimeBundleSummaryForProfile: runtimeBundleSummaryForProfileImpl = runtimeBundleSummaryForProfile,
    handlerMetadataForProfile: handlerMetadataForProfileImpl = handlerMetadataForProfile,
    runtimeSurfaceEntriesForProfile: runtimeSurfaceEntriesForProfileImpl = runtimeSurfaceEntriesForProfile,
    dispatchHandlerIdsForProfile: dispatchHandlerIdsForProfileImpl = dispatchHandlerIdsForProfile,
    handlerSetFactoriesForProfile: handlerSetFactoriesForProfileImpl = handlerSetFactoriesForProfile,
    handlerSetDefinitionsForProfile: handlerSetDefinitionsForProfileImpl = handlerSetDefinitionsForProfile,
    providedCapabilityIdsForProfile: providedCapabilityIdsForProfileImpl = providedCapabilityIdsForProfile,
    runtimeCapabilityDefinitionsForProfile: runtimeCapabilityDefinitionsForProfileImpl = runtimeCapabilityDefinitionsForProfile,
    runtimeBuiltinSeedContributionsForProfile: runtimeBuiltinSeedContributionsForProfileImpl = runtimeBuiltinSeedContributionsForProfile,
    startupRequiredHostCapabilitiesForProfile: startupRequiredHostCapabilitiesForProfileImpl = startupRequiredHostCapabilitiesForProfile,
    createRuntimeAppContextForRunner: createRuntimeAppContextForRunnerImpl = createRuntimeAppContextForRunner,
    createRuntimeAppContext: createRuntimeAppContextImpl = createRuntimeAppContext,
    createUnavailableRuntimeAppContext: createUnavailableRuntimeAppContextImpl = createUnavailableRuntimeAppContext,
    createRuntimeContextResolver: createRuntimeContextResolverImpl = createRuntimeContextResolver,
    resolveRuntimePluginRoot: resolveRuntimePluginRootImpl = resolveRuntimePluginRoot,
    resolveConfiguredRuntimePluginIds: resolveConfiguredRuntimePluginIdsImpl = resolveConfiguredRuntimePluginIds,
    readRuntimePluginCatalog: readRuntimePluginCatalogImpl = readRuntimePluginCatalog,
    defaultHostCapabilitiesForProfile: defaultHostCapabilitiesForProfileImpl = defaultHostCapabilitiesForProfile,
    loadRuntimePluginModules: loadRuntimePluginModulesImpl = loadRuntimePluginModules,
    applyRuntimePluginLoadState: applyRuntimePluginLoadStateImpl = applyRuntimePluginLoadState,
    collectActiveRuntimeContributions: collectActiveRuntimeContributionsImpl = collectActiveRuntimeContributions,
    createRuntimeVerificationPersistence: createRuntimeVerificationPersistenceImpl = createRuntimeVerificationPersistence,
    AppSnapshotManagerClass = AppSnapshotManager
  } = deps;
  startupTelemetry ??= createStartupTelemetry({ mode: runtimeStartupMode });

  const handleProfileGatedAbsence = async ({ req, res, appContext, pathname, method }) => {
    const isHtml = String(req.headers["accept"] || "").includes("text/html");
    if (!isHtml) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    const compositionOptions = {
      additionalBundleIds: appContext?.runtimeAdditionalBundleIds ?? [],
      bundleOverrides: appContext?.runtimeBundleOverrides ?? {}
    };
    const fullMatched = matchRuntimeBundleRoute("full", method, pathname, compositionOptions);
    if (fullMatched) {
      const handlerMetadata = handlerMetadataForProfileImpl("full", compositionOptions);
      const metadata = handlerMetadata[String(fullMatched.route.handler)];
      const html = renderCompositionGatedPage({
        title: metadata?.displayName || "Feature Unavailable",
        heading: metadata?.displayName || "Feature Unavailable",
        reason: "This route is defined but its handler is inactive in the current profile.",
        requiredProfile: metadata?.bundleId ? null : "full",
        requiredBundles: metadata?.bundleId ? [metadata.bundleId] : [],
        activeProfile: appContext?.runtimeProfile ?? null
      });
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const html = renderCompositionGatedPage({
      title: "Not Found",
      heading: "Not Found",
      reason: "The requested path was not found in the current runtime composition.",
      activeProfile: appContext?.runtimeProfile ?? null
    });
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  };
  const handleRetiredLegacyFrontendRoute = async ({ req, res, route, routeWorld, appContext }) => {
    const surfaceMap = routeWorld ? new Map(surfaceRowsFromWitnesses(routeWorld.allWitnesses?.() ?? []).map(surface => [surface.id, surface])) : new Map();
    const retired = retiredLegacyFrontendRouteState(route, rootSurfaceId => surfaceMap.get(rootSurfaceId) ?? null);
    if (!retired) return false;
    const body = {
      error: "legacy frontend route retired",
      route: route?.id ?? null,
      handler: route?.handler ?? null,
      message: retired.message
    };
    const wantsHtml = String(req.headers["accept"] || "").includes("text/html");
    if (!wantsHtml) {
      sendJson(res, 410, body);
      return true;
    }
    const html = renderCompositionGatedPage({
      title: "Legacy Frontend Retired",
      heading: "Legacy Frontend Retired",
      reason: retired.message,
      activeProfile: appContext?.runtimeProfile ?? null
    });
    res.writeHead(410, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  };
  const handleRetiredLegacyFrontendAuthoringEndpoint = async ({ req, res, pathname, appContext }) => {
    const normalizedPath = typeof pathname === "string" ? pathname.trim() : "";
    if (!["/api/frontend-programs", "/api/frontend-steps"].includes(normalizedPath)) return false;
    const retiredAction = normalizedPath === "/api/frontend-programs"
      ? "frontendProgram.create"
      : "frontendStep.create";
    const message = `${retiredAction} is retired. Author app frontend with canonical page.surface nouns (surface, process, projection, collection, boundary, and policy), or run frontend.upliftLegacy to migrate existing legacy routes.`;
    const body = {
      error: "legacy frontend authoring retired",
      path: normalizedPath,
      message
    };
    const wantsHtml = String(req.headers["accept"] || "").includes("text/html");
    if (!wantsHtml) {
      sendJson(res, 410, body);
      return true;
    }
    const html = renderCompositionGatedPage({
      title: "Legacy Frontend Authoring Retired",
      heading: "Legacy Frontend Authoring Retired",
      reason: message,
      activeProfile: appContext?.runtimeProfile ?? null
    });
    res.writeHead(410, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  };
  const logInfo = typeof logger?.info === "function"
    ? (event, fields) => logger.info(event, fields)
    : () => {};
  const logError = typeof logger?.error === "function"
    ? (event, fields) => logger.error(event, fields)
    : () => {};
  const pinnedSnapshotManager = (snapshotManager, snapshot) => {
    if (!snapshotManager || !snapshot) return snapshotManager;
    return new Proxy(snapshotManager, {
      get(target, property, receiver) {
        if (property === "getActiveSnapshot") return () => snapshot;
        if (property === "getPinnedSnapshot") return () => snapshot;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  };
  const requestScopedAppContext = appContext => {
    const liveSnapshotManager = appContext?.appSnapshotManager ?? null;
    const witnessCoreStatus = appContext?.witnessCoreStatusStore?.getStatus?.()
      ? {
          ...(appContext.witnessCoreStatusStore.getStatus() ?? {}),
          latestState: appContext.witnessCoreStatusStore.getLatestState?.() ?? null
        }
      : null;
    const snapshot = liveSnapshotManager?.getServingSnapshot?.({ witnessCoreStatus })
      ?? liveSnapshotManager?.getActiveSnapshot?.()
      ?? null;
    if (!appContext || !liveSnapshotManager || !snapshot) return appContext;
    const scoped = Object.create(appContext);
    scoped.appSnapshotManager = pinnedSnapshotManager(liveSnapshotManager, snapshot);
    scoped.requestSnapshot = snapshot;
    scoped.requestAppRevision = Number(snapshot.appRevision || 0);
    scoped.requestServingState = liveSnapshotManager?.servingState?.({ witnessCoreStatus }) ?? null;
    return scoped;
  };
  const activeDevMode = devMode ?? (runtimeStartupMode === "serve" && appProject != null);
  const resolveBackgroundPhasePolicy = (configured, fallback) => {
    const minDelayMs = Number(configured?.minDelayMs);
    const quietWindowMs = Number(configured?.quietWindowMs);
    const maxDelayMs = Number(configured?.maxDelayMs);
    return {
      minDelayMs: Number.isFinite(minDelayMs) ? Math.max(0, minDelayMs) : fallback.minDelayMs,
      quietWindowMs: Number.isFinite(quietWindowMs) ? Math.max(0, quietWindowMs) : fallback.quietWindowMs,
      maxDelayMs: Number.isFinite(maxDelayMs) ? Math.max(0, maxDelayMs) : fallback.maxDelayMs
    };
  };
  const effectiveBackgroundStartupPolicy = {
    verificationPersistence: resolveBackgroundPhasePolicy(backgroundStartupPolicy?.verificationPersistence, {
      minDelayMs: 150,
      quietWindowMs: 250,
      maxDelayMs: 1500
    }),
    testMonitor: resolveBackgroundPhasePolicy(backgroundStartupPolicy?.testMonitor, {
      minDelayMs: 1000,
      quietWindowMs: 1000,
      maxDelayMs: 5000
    }),
    appSnapshotInitialBuild: resolveBackgroundPhasePolicy(backgroundStartupPolicy?.appSnapshotInitialBuild, {
      minDelayMs: activeDevMode === true ? 2500 : 5000,
      quietWindowMs: 1500,
      maxDelayMs: activeDevMode === true ? 12000 : 20000
    })
  };

  const runtimePluginRoot = resolveRuntimePluginRootImpl({ env });
  const configuredRuntimePluginIds = resolveConfiguredRuntimePluginIdsImpl({ env, runtimePluginIds });
  const startupDefaultRuntimePluginIds = Array.isArray(startupRuntimePluginIds)
    ? [...new Set(startupRuntimePluginIds.map(String).filter(Boolean))]
    : [];

  let resolved = resolveStartupRunner(world, serverRunnerId);
  if (
    runtimeStartupMode === "bootstrap"
    && !serverRunnerId
    && resolved.ok
    && resolved.runner?.bootstrapOnly === true
  ) {
    const startupRunner = buildBootstrapStartupRunner(world, { startupOwned: true });
    if (startupRunner) {
      resolved = { ok: true, runner: startupRunner };
    }
  }
  if (!resolved.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: resolved.body ?? { reason: resolved.reason }
    });
    return { ok: false, reason: resolved.reason };
  }

  const serverRunner = resolved.runner;
  const startupOverrideProfile = runtimeProfileExplicit ? runtimeProfile : null;
  const runtimeAuthoringPolicy = createRuntimeAuthoringPolicy({
    mode: runtimeAuthoringMode ?? defaultRuntimeAuthoringMode({ runtimeStartupMode })
  });
  const authoredServerRunners = world.project(moduleProjectors.serverRunners);
  const candidateRunnersById = new Map();
  for (const runner of authoredServerRunners ?? []) {
    if (runner?.id) candidateRunnersById.set(runner.id, runner);
  }
  if (serverRunner?.id && !candidateRunnersById.has(serverRunner.id)) {
    candidateRunnersById.set(serverRunner.id, serverRunner);
  }
  const runnerCatalogSeedById = new Map();
  const readRunnerCatalogSeed = async runner => {
    if (!runner?.id) return null;
    const cacheVersion = Number(world?.allWitnesses?.().length || 0);
    const cachedSeed = runnerCatalogSeedById.get(runner.id);
    if (cachedSeed && cachedSeed.witnessCount === cacheVersion) return cachedSeed.seed;
    const profileState = effectiveRuntimeProfileForRunner({
      serverRunner: runner,
      startupOverrideProfile,
      startupMode: runtimeStartupMode,
      fallbackProfile: runtimeProfile
    });
    const runtimePluginInstallIndex = world.project(moduleProjectors.runtimePluginInstallIndex);
    const authoredRuntimePluginIds = runner.bootstrapOnly === true
      ? []
      : uniqueStrings((runtimePluginInstallIndex?.byServerRunner?.[runner.id] ?? []).map(row => row.plugin));
    const startupPluginIdsForRunner = runner.startupOwned === true
      ? startupDefaultRuntimePluginIds
      : [];
    const runtimePluginCatalog = await readRuntimePluginCatalogImpl({
      pluginRoot: runtimePluginRoot,
      runtimeProfile: profileState.effectiveRuntimeProfile,
      configuredPluginIds: configuredRuntimePluginIds,
      startupPluginIds: startupPluginIdsForRunner,
      authoredPluginIds: authoredRuntimePluginIds
    });
    const seed = {
      runner,
      profileState,
      authoredRuntimePluginIds,
      startupPluginIds: startupPluginIdsForRunner,
      runtimePluginCatalog
    };
    runnerCatalogSeedById.set(runner.id, { witnessCount: cacheVersion, seed });
    return seed;
  };
  const runnerCatalogSeeds = await startupTelemetry.runPhase("runtime.plugins.catalog", async () => {
    const seeds = [];
    for (const runner of candidateRunnersById.values()) {
      const seed = await readRunnerCatalogSeed(runner);
      if (seed) seeds.push(seed);
    }
    return seeds;
  }, {
    label: "Read runtime plugin catalog"
  });
  const blockingCatalogSeed = runnerCatalogSeeds.find(seed => seed.runtimePluginCatalog?.selection?.hasBlockingErrors);
  if (blockingCatalogSeed) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        reason: "runtime plugins unresolved",
        serverRunner: blockingCatalogSeed.runner.id,
        pluginRoot: runtimePluginRoot,
        authoredRuntimePlugins: blockingCatalogSeed.runtimePluginCatalog.authoredPluginIds,
        operatorRuntimePlugins: blockingCatalogSeed.runtimePluginCatalog.operatorPluginIds,
        effectiveRuntimePlugins: blockingCatalogSeed.runtimePluginCatalog.effectivePluginIds,
        rejectedRuntimePlugins: blockingCatalogSeed.runtimePluginCatalog.rejectedPlugins,
        runtimeProfile: blockingCatalogSeed.profileState.effectiveRuntimeProfile
      }
    });
    return {
      ok: false,
      reason: "runtime plugins unresolved",
      runtimePluginCatalog: blockingCatalogSeed.runtimePluginCatalog
    };
  }
  const mergedRuntimePluginCatalog = mergePluginCatalogs(
    runnerCatalogSeeds.map(seed => seed.runtimePluginCatalog)
  );
  const runtimePluginLoadResult = await startupTelemetry.runPhase("runtime.plugins.load", () => loadRuntimePluginModulesImpl({
    pluginCatalog: mergedRuntimePluginCatalog
  }), {
    label: "Load runtime plugin modules"
  });
  const startupRuntimePluginSeed = runnerCatalogSeedById.get(serverRunner.id) ?? runnerCatalogSeeds[0] ?? null;
  const effectiveRuntimePluginCatalog = startupRuntimePluginSeed
    ? applyRuntimePluginLoadStateImpl(startupRuntimePluginSeed.runtimePluginCatalog, runtimePluginLoadResult)
    : null;
  if (runtimePluginLoadResult.hasBlockingErrors) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        reason: "runtime plugin modules unresolved",
        serverRunner: serverRunner.id,
        pluginRoot: runtimePluginRoot,
        authoredRuntimePlugins: effectiveRuntimePluginCatalog?.authoredPluginIds ?? [],
        operatorRuntimePlugins: effectiveRuntimePluginCatalog?.operatorPluginIds ?? [],
        effectiveRuntimePlugins: effectiveRuntimePluginCatalog?.effectivePluginIds ?? [],
        rejectedRuntimePlugins: mergedRuntimePluginCatalog.rejectedPlugins ?? []
      }
    });
    return {
      ok: false,
      reason: "runtime plugin modules unresolved",
      runtimePluginCatalog: effectiveRuntimePluginCatalog ?? mergedRuntimePluginCatalog
    };
  }
  const bundleOverrides = runtimePluginLoadResult.bundleOverrides ?? {};
  const runnerStateCache = new Map();
  const runnerContextCache = new Map();
  const projectionContextRemovers = [];
  const currentWorldWitnessCount = () => Number(world?.allWitnesses?.().length || 0);
  const buildRunnerState = async runner => {
    if (!runner?.id) return { ok: false, reason: "server runner missing" };
    const cacheVersion = currentWorldWitnessCount();
    const cachedState = runnerStateCache.get(runner.id);
    if (cachedState && cachedState.witnessCount === cacheVersion) return cachedState.state;
    const seed = await readRunnerCatalogSeed(runner);
    const runtimePluginCatalog = applyRuntimePluginLoadStateImpl(seed.runtimePluginCatalog, runtimePluginLoadResult);
    const additionalBundleIds = uniqueStrings(runtimePluginCatalog.addedBundleIds ?? []);
    const compositionOptions = {
      additionalBundleIds,
      bundleOverrides
    };
    const runtimeBundleSummary = runtimeBundleSummaryForProfileImpl(seed.profileState.effectiveRuntimeProfile, compositionOptions);
    let runtimeContributions;
    let projectionContext;
    let removeProjectionContext = () => {};
    try {
      runtimeContributions = collectActiveRuntimeContributionsImpl({
        bundles: runtimeBundleSummary.bundles ?? []
      });
      projectionContext = createModuleProjectorContext(runtimeContributions.moduleProjectors ?? {}, {
        owner: `runtime.activePlugins:${runner.id}`
      });
      removeProjectionContext = world._pushProjectionContext?.(projectionContext) ?? (() => {});
      projectionContextRemovers.push(removeProjectionContext);
    } catch (error) {
      const state = {
        ok: false,
        reason: "runtime plugin contributions unresolved",
        error
      };
      runnerStateCache.set(runner.id, { witnessCount: cacheVersion, state });
      return state;
    }
    try {
      ensureRuntimeBuiltinsImpl(world, {
        capabilityIds: providedCapabilityIdsForProfileImpl(seed.profileState.effectiveRuntimeProfile, compositionOptions),
        capabilityDefinitions: runtimeCapabilityDefinitionsForProfileImpl(seed.profileState.effectiveRuntimeProfile, compositionOptions),
        seedContributions: runtimeBuiltinSeedContributionsForProfileImpl(seed.profileState.effectiveRuntimeProfile, compositionOptions)
      });
    } catch (error) {
      const state = {
        ok: false,
        reason: "runtime builtins unresolved",
        error
      };
      runnerStateCache.set(runner.id, { witnessCount: cacheVersion, state });
      return state;
    }
    const backendHost = runner.backendHost;
    const frontendHost = runner.frontendHost;
    if (!backendHost || !frontendHost) {
      const state = {
        ok: false,
        reason: "server runner host bindings incomplete",
        backendHost,
        frontendHost
      };
      runnerStateCache.set(runner.id, { witnessCount: cacheVersion, state });
      return state;
    }
    const backendDefaults = defaultHostCapabilitiesForProfileImpl(seed.profileState.effectiveRuntimeProfile, "backend", compositionOptions);
    const frontendDefaults = defaultHostCapabilitiesForProfileImpl(seed.profileState.effectiveRuntimeProfile, "frontend", compositionOptions);
    for (const capability of backendDefaults) {
      if (hostCapabilities(world, backendHost).has(capability)) continue;
      ensureCapabilityDefinition(world, {
        actor,
        id: capability,
        label: capability,
        provenance: { source: "server.start.defaultHostCapabilities" }
      });
      installCapability(world, { actor, capability, target: backendHost, targetKind: "host" });
    }
    for (const capability of frontendDefaults) {
      if (hostCapabilities(world, frontendHost).has(capability)) continue;
      ensureCapabilityDefinition(world, {
        actor,
        id: capability,
        label: capability,
        provenance: { source: "server.start.defaultHostCapabilities" }
      });
      installCapability(world, { actor, capability, target: frontendHost, targetKind: "host" });
    }
    const backendCaps = hostCapabilities(world, backendHost);
    const frontendCaps = hostCapabilities(world, frontendHost);
    const requiredBackend = startupRequiredHostCapabilitiesForProfileImpl(seed.profileState.effectiveRuntimeProfile, "backend", compositionOptions);
    const requiredFrontend = startupRequiredHostCapabilitiesForProfileImpl(seed.profileState.effectiveRuntimeProfile, "frontend", compositionOptions);
    const missingBackend = requiredBackend.filter(capability => !backendCaps.has(capability));
    const missingFrontend = requiredFrontend.filter(capability => !frontendCaps.has(capability));
    const runtimeConfigResult = resolveRuntimeConfig(runner.runtimeConfig, env);
    const state = {
      ok: missingBackend.length === 0 && missingFrontend.length === 0 && runtimeConfigResult.ok !== false,
      reason: missingBackend.length || missingFrontend.length
        ? "missing host capabilities"
        : (runtimeConfigResult.ok === false ? "runtime config unresolved" : null),
      runner,
      profileState: seed.profileState,
      runtimePluginCatalog,
      runtimeBundleSummary,
      runtimeAdditionalBundleIds: additionalBundleIds,
      runtimeBundleOverrides: bundleOverrides,
      runtimeSurfaceEntries: runtimeSurfaceEntriesForProfileImpl(seed.profileState.effectiveRuntimeProfile, null, compositionOptions),
      activeDispatchHandlers: new Set(
        runtimeBundleSummary.dispatchHandlers
        ?? dispatchHandlerIdsForProfileImpl(seed.profileState.effectiveRuntimeProfile, compositionOptions)
      ),
      handlerSetFactories: handlerSetFactoriesForProfileImpl(seed.profileState.effectiveRuntimeProfile, compositionOptions),
      handlerSetDefinitions: handlerSetDefinitionsForProfileImpl(seed.profileState.effectiveRuntimeProfile, compositionOptions),
      runtimeContributions,
      projectionContext,
      removeProjectionContext,
      runtimeConfigResult,
      missingBackend,
      missingFrontend,
      storage: resolveStorageConfig(runner.storage, runtimeRoot),
      backendHost,
      frontendHost
    };
    runnerStateCache.set(runner.id, { witnessCount: cacheVersion, state });
    return state;
  };
  const bootstrapRuntimeState = await startupTelemetry.runPhase("runtime.runnerState", () => buildRunnerState(serverRunner), {
    label: "Resolve startup runner runtime state"
  });
  if (!bootstrapRuntimeState?.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        serverRunner: serverRunner.id,
        reason: bootstrapRuntimeState?.reason ?? "runtime state unresolved",
        backendHost: bootstrapRuntimeState?.backendHost ?? null,
        frontendHost: bootstrapRuntimeState?.frontendHost ?? null,
        missingBackend: bootstrapRuntimeState?.missingBackend ?? [],
        missingFrontend: bootstrapRuntimeState?.missingFrontend ?? [],
        runtimeConfigFailures: bootstrapRuntimeState?.runtimeConfigResult?.failures ?? [],
        message: bootstrapRuntimeState?.error instanceof Error
          ? bootstrapRuntimeState.error.message
          : (bootstrapRuntimeState?.error ? String(bootstrapRuntimeState.error) : null)
      }
    });
    return { ok: false, reason: bootstrapRuntimeState?.reason ?? "runtime state unresolved" };
  }
  // Universal auth gate (opt-in per runner via `requireAuth`). On a gated runner every endpoint
  // requires an authenticated session except an allowlist: the auth/session endpoints needed to sign
  // in, MCP (which carries its own industry-standard auth — see plugins/mcp), and any route that
  // explicitly opts out with `params.auth.public = true`. Routes that declare their own auth policy
  // (params.auth.featureId / login pages) are left to the existing per-route flow (evaluateRouteAccess),
  // which the gate must not pre-empt. Runners without requireAuth are unchanged (dev/bootstrap/demo).
  const authGateExemptPath = (pathname, method) => {
    if (pathname === "/api/session") return true; // sign-in / sign-out / read current session
    if (pathname.startsWith("/mcp/")) return true; // MCP resource servers authenticate themselves
    if (method === "POST" && pathname === "/api/oauth/start") return true;
    if (pathname.startsWith("/api/oauth/callback/")) return true;
    return false;
  };
  const requestDeniedByAuthGate = (runner, requestContext, { pathname, method, matchedRoute }) => {
    if (runner?.requireAuth !== true) return false;
    if (requestContext?.authenticatedActor) return false; // a real authenticated session
    if (authGateExemptPath(pathname, method)) return false;
    if (matchedRoute?.params?.auth?.public === true) return false;
    if (matchedRoute?.params?.auth) return false; // route owns its auth flow (login/forbidden pages)
    return true;
  };
  const unionAdditionalBundleIds = uniqueStrings(
    (await Promise.all([...candidateRunnersById.values()].map(async runner => {
      const state = await buildRunnerState(runner);
      return state?.runtimeAdditionalBundleIds ?? [];
    }))).flat()
  );
  const unionCompositionOptions = {
    additionalBundleIds: unionAdditionalBundleIds,
    bundleOverrides
  };
  const unionRuntimeBundleSummary = runtimeBundleSummaryForProfileImpl("full", unionCompositionOptions);
  const unionRuntimeContributions = collectActiveRuntimeContributionsImpl({
    bundles: unionRuntimeBundleSummary.bundles ?? []
  });
  const unionHandlerSetDefinitions = handlerSetDefinitionsForProfileImpl("full", unionCompositionOptions);
  const backendHost = bootstrapRuntimeState.backendHost;
  const frontendHost = bootstrapRuntimeState.frontendHost;
  const decorateAppContext = (appContext, runner, runnerState) => {
    appContext.requestedRuntimeProfile = runtimeProfile;
    appContext.authoredRuntimeProfile = runnerState.profileState.authoredRuntimeProfile;
    appContext.runtimeProfile = runnerState.profileState.effectiveRuntimeProfile;
    appContext.effectiveRuntimeProfile = runnerState.profileState.effectiveRuntimeProfile;
    appContext.effectiveRuntimeProfileSource = runnerState.profileState.effectiveRuntimeProfileSource;
    appContext.runtimeProfileOverrideActive = runnerState.profileState.overrideActive === true;
    appContext.runtimeProfileOverrideProfile = startupOverrideProfile;
    appContext.runtimeStartupMode = runtimeStartupMode;
    appContext.runtimeAuthoringPolicy = runtimeAuthoringPolicy;
    appContext.runtimeBundleSummary = runnerState.runtimeBundleSummary;
    appContext.runtimeAdditionalBundleIds = runnerState.runtimeAdditionalBundleIds;
    appContext.runtimeBundleOverrides = runnerState.runtimeBundleOverrides;
    appContext.runtimeSurfaceEntries = runnerState.runtimeSurfaceEntries;
    appContext.runtimeHandlerSetDefinitions = runnerState.handlerSetDefinitions;
    appContext.runtimePluginCatalog = runnerState.runtimePluginCatalog;
    appContext.startupRunnerOwned = runner.startupOwned === true;
    appContext.authoredRuntimePluginIds = runnerState.runtimePluginCatalog.authoredPluginIds;
    appContext.startupRuntimePluginIds = runnerState.runtimePluginCatalog.startupPluginIds;
    appContext.runtimePluginIds = runnerState.runtimePluginCatalog.operatorPluginIds;
    appContext.operatorRuntimePluginIds = runnerState.runtimePluginCatalog.operatorPluginIds;
    appContext.effectiveRuntimePluginIds = runnerState.runtimePluginCatalog.effectivePluginIds;
    appContext.activeRuntimePluginIds = runnerState.runtimePluginCatalog.activePluginIds;
    appContext.activeDispatchHandlers = runnerState.activeDispatchHandlers;
    appContext.startupTelemetry = startupTelemetry;
    appContext.witnessCoreUrl = typeof env.WITNESS_CORE_URL === "string" && env.WITNESS_CORE_URL.trim()
      ? env.WITNESS_CORE_URL.trim()
      : null;
    appContext.witnessCoreBridge = createWitnessCoreBridge({
      coreUrl: appContext.witnessCoreUrl,
      logger
    });
    appContext.witnessCoreStatusStore = createWitnessCoreStatusStore({
      coreUrl: appContext.witnessCoreUrl,
      logger
    });
    appContext.resourceProbes = startupTelemetry.probeCollector ?? null;
    appContext.materializedViews = createMaterializedViewRegistry({
      world,
      probeCollector: appContext.resourceProbes
    });
    const verificationPolicy = resolveRunnerVerificationPolicy({
      serverRunner: runner,
      runtimeProfile: runnerState.profileState.effectiveRuntimeProfile,
      runtimeConfig: appContext.runtimeConfig
    });
    const promotionPolicy = resolveRunnerPromotionPolicy({
      serverRunner: runner,
      runtimeProfile: runnerState.profileState.effectiveRuntimeProfile
    });
    appContext.verificationPolicy = verificationPolicy;
    appContext.verificationPolicySource = verificationPolicy.source;
    appContext.verificationPolicyDiagnostics = verificationPolicy.diagnostics ?? [];
    appContext.promotionPolicy = promotionPolicy;
    appContext.promotionPolicySource = promotionPolicy.source;
    appContext.promotionPolicyDiagnostics = promotionPolicy.diagnostics ?? [];
    appContext.verificationPersistence = null;
    appContext.verificationPersistenceDiagnostics = [];
    appContext.runtimeOperatorContract = runtimeOperatorContract ?? buildRuntimeOperatorContract({
      startupMode: runtimeStartupMode,
      layout: "runtime-root-only",
      persistenceMode: "warm-compatibility",
      runtimeRoot,
      storage: appContext.storage,
      notes: ["Runtime started without an explicit WORLD_HOME-derived operator contract, so diagnostics are reporting the active runtime-root view only."]
    });
    appContext.runtimeOperatorService = createRuntimeOperatorService({
      world,
      operatorContract: appContext.runtimeOperatorContract,
      storage: appContext.storage
    });
    appContext.handlerSet = runner.handlerSet ?? null;
    appContext.bootstrapOnly = runner.bootstrapOnly === true;
    appContext.devMode = activeDevMode === true;
    appContext.runtimeSupervision = {
      instanceId: typeof env.WITNESS_RUNTIME_INSTANCE_ID === "string" && env.WITNESS_RUNTIME_INSTANCE_ID.trim()
        ? env.WITNESS_RUNTIME_INSTANCE_ID.trim()
        : null,
      role: typeof env.WITNESS_RUNTIME_ROLE === "string" && env.WITNESS_RUNTIME_ROLE.trim()
        ? env.WITNESS_RUNTIME_ROLE.trim()
        : "active",
      mutationsEnabled: env.WITNESS_RUNTIME_MUTATIONS_ENABLED === "false" ? false : true,
      watchersEnabled: env.WITNESS_RUNTIME_WATCHERS_ENABLED === "false"
        ? false
        : (activeDevMode === true),
      lastStateAt: new Date().toISOString()
    };
    appContext.appSnapshotManager = null;
    appContext.appPreviewSessionManager = null;
    appContext.appSnapshotManagerReady = null;
    appContext.resolveRunnerRuntimeState = async runnerId => {
      if (!runnerId) return null;
      if (runnerId === runner.id) return runnerState;
      const targetRunner = world.project(moduleProjectors.serverRunners).find(row => row.id === runnerId)
        ?? (serverRunner.id === runnerId ? serverRunner : null);
      return targetRunner ? buildRunnerState(targetRunner) : null;
    };
    return appContext;
  };
  const createRunnerAppContext = async (runner, runnerState, { failClosed = false } = {}) => {
    if (!runnerState?.ok) {
      if (failClosed) {
        return { ok: false, reason: runnerState?.reason ?? "runtime state unresolved" };
      }
      return createUnavailableRuntimeAppContextImpl({
        world,
        reason: runnerState?.reason ?? "runtime state unresolved",
        identities: world.project(moduleProjectors.identityIndex).rows
      });
    }
    const created = await createRuntimeAppContextForRunnerImpl({
      world,
      serverRunner: runner,
      runtimeRoot,
      appProject,
      sendJson,
      readJson,
      handlerSetFactories: runnerState.handlerSetFactories,
      runtimeContributions: runnerState.runtimeContributions,
      projectionContext: runnerState.projectionContext,
      resolveStorageConfig,
      resolveRuntimeConfig,
      env,
      createRuntimeAppContext: createRuntimeAppContextImpl
    });
    if (!created?.ok) {
      if (failClosed) return created;
      return createUnavailableRuntimeAppContextImpl({
        world,
        reason: created?.reason ?? "runtime app context unresolved",
        identities: world.project(moduleProjectors.identityIndex).rows
      });
    }
    return decorateAppContext(created, runner, runnerState);
  };
  const appContext = await startupTelemetry.runPhase("runtime.appContext", () => createRunnerAppContext(
    serverRunner,
    bootstrapRuntimeState,
    { failClosed: true }
  ), {
    label: "Create runtime app context"
  });
  if (!appContext.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, reason: appContext.reason, handlerSet: serverRunner.handlerSet ?? null }
    });
    return { ok: false, reason: appContext.reason };
  }
  runnerContextCache.set(serverRunner.id, {
    witnessCount: currentWorldWitnessCount(),
    context: appContext
  });
  const currentWitnessCount = () => typeof world?.witnessCount === "function"
    ? Number(world.witnessCount() || 0)
    : Number(world?.allWitnesses?.().length || 0);
  const currentLastWitness = () => typeof world?.lastWitness === "function"
    ? world.lastWitness()
    : world?.allWitnesses?.().at(-1) ?? null;
  const witnessesSince = index => typeof world?.witnessesSince === "function"
    ? world.witnessesSince(index)
    : world?.allWitnesses?.().slice(index) ?? [];
  const attachEventsStream = context => {
    if (!context) return context;
    context.eventsStream = {
      open(res, req) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(sseFrame(currentWitnessCount(), currentLastWitness()));
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return { clients: sseClients.size, serverRunner: context.serverRunnerId ?? serverRunner.id };
      }
    };
    return context;
  };
  attachEventsStream(appContext);
  const storage = appContext.storage;

  const sessionStore = new Map();
  const genericHandlers = createGenericRouteHandlers({
    world,
    backendHost,
    frontendHost,
    sessionStore,
    logger,
    mcpInternalToken,
    runtimeProfile: appContext.runtimeProfile,
    runtimeBundleSummary: unionRuntimeBundleSummary,
    runtimeSurfaceEntries: appContext.runtimeSurfaceEntries,
    handlerSetDefinitions: unionHandlerSetDefinitions,
    runtimeContributions: unionRuntimeContributions,
    runtimePluginRoot,
    runtimePluginIds: appContext.runtimePluginIds,
    startupRuntimePluginIds: appContext.startupRuntimePluginIds,
    authoredRuntimePluginIds: appContext.authoredRuntimePluginIds,
    appSnapshotManager: appContext.appSnapshotManager ?? null,
    currentAppRenderWorld: () => appContext.appSnapshotManager?.getActiveSnapshot()?.world ?? world
  });
  const backgroundStartupTasks = [];
  const deferredClosers = [];
  let serverClosing = false;
  let activeRequestCount = 0;
  let lastRequestActivityAt = Date.now();
  let runtimeContexts = new Map();
  let resolveActiveRuntime = null;
  const registerDeferredCloser = closer => {
    if (typeof closer === "function") deferredClosers.push(closer);
  };
  const waitForMs = delayMs => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
  const waitForRequestPriorityWindow = async ({
    minDelayMs = 0,
    quietWindowMs = 0,
    maxDelayMs = 0
  } = {}) => {
    const waitStartedAt = Date.now();
    if (minDelayMs > 0) await waitForMs(minDelayMs);
    while (!serverClosing) {
      const elapsedMs = Date.now() - waitStartedAt;
      const idleForMs = Date.now() - lastRequestActivityAt;
      if (activeRequestCount === 0 && idleForMs >= quietWindowMs) {
        return {
          waitedMs: elapsedMs,
          idleForMs,
          maxDelayExceeded: false
        };
      }
      if (maxDelayMs > 0 && elapsedMs >= maxDelayMs) {
        return {
          waitedMs: elapsedMs,
          idleForMs,
          maxDelayExceeded: true
        };
      }
      const remainingQuietMs = Math.max(0, quietWindowMs - idleForMs);
      const remainingMaxMs = maxDelayMs > 0 ? Math.max(0, maxDelayMs - elapsedMs) : 250;
      const nextWaitMs = Math.max(25, Math.min(
        remainingQuietMs || 25,
        remainingMaxMs || 25,
        250
      ));
      await waitForMs(nextWaitMs);
    }
    return {
      waitedMs: Date.now() - waitStartedAt,
      idleForMs: Date.now() - lastRequestActivityAt,
      maxDelayExceeded: false
    };
  };
  const trackBackgroundStartup = (id, label, work, { detail = null } = {}) => {
    const phase = startupTelemetry.beginPhase(id, {
      label,
      blocking: false,
      detail
    });
    const task = Promise.resolve()
      .then(work)
      .then(detail => {
        phase.complete(detail && typeof detail === "object" ? detail : null);
        return detail;
      })
      .catch(error => {
        phase.fail(error);
        logError("startup.background.failed", {
          serverRunner: serverRunner.id,
          phase: id,
          error
        });
        world.observe({
          process: "server.start.background.failed",
          actor,
          claims: [],
          body: {
            serverRunner: serverRunner.id,
            phase: id,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        return null;
      });
    backgroundStartupTasks.push(task);
    return task;
  };
  const scheduleBackgroundStartup = (id, label, policy, work) => trackBackgroundStartup(
    id,
    label,
    async () => {
      const gate = await waitForRequestPriorityWindow(policy);
      const result = await work();
      return {
        waitedMs: gate.waitedMs,
        idleForMs: gate.idleForMs,
        maxDelayExceeded: gate.maxDelayExceeded,
        ...(result && typeof result === "object" ? result : {})
      };
    },
    {
      detail: {
        lazy: true,
        minDelayMs: policy.minDelayMs,
        quietWindowMs: policy.quietWindowMs,
        maxDelayMs: policy.maxDelayMs
      }
    }
  );
  const mountedRoutesCache = new WeakMap();
  const mountedRoutesFor = (runnerId, runtimeContext = null) => {
    const routeWorld = runtimeContext?.appSnapshotManager?.getActiveSnapshot()?.world ?? world;
    const witnessCount = Number(routeWorld?.allWitnesses?.().length || 0);
    const cached = mountedRoutesCache.get(routeWorld);
    if (cached && cached.witnessCount === witnessCount && cached.byRunner.has(runnerId)) {
      return cached.byRunner.get(runnerId);
    }
    const byRunner = cached && cached.witnessCount === witnessCount
      ? cached.byRunner
      : new Map();
    const table = routeWorld.project(moduleProjectors.servedRoutes)
      .filter(route => route.serverRunner === runnerId)
      .map(route => ({ ...route, matcher: compileRouteMatcher(route.path) }));
    byRunner.set(runnerId, table);
    mountedRoutesCache.set(routeWorld, { witnessCount, byRunner });
    return table;
  };
  ({ runtimeContexts, resolveActiveRuntime } = createRuntimeContextResolverImpl({
    bootstrapRunner: serverRunner,
    bootstrapContext: appContext,
    resolveLiveRunner: requestHost => (
      typeof resolveRunnerForHost === "function"
        ? resolveRunnerForHost(world, requestHost ?? null)
        : resolveServerRunner(world, null)
    ),
    createContextForRunner: async liveRunner => {
      const cacheVersion = currentWorldWitnessCount();
      const cachedContext = runnerContextCache.get(liveRunner.id);
      if (cachedContext && cachedContext.witnessCount === cacheVersion) return cachedContext.context;
      const runnerState = await buildRunnerState(liveRunner);
      const liveContext = await createRunnerAppContext(liveRunner, runnerState);
      attachEventsStream(liveContext);
      runnerContextCache.set(liveRunner.id, {
        witnessCount: cacheVersion,
        context: liveContext
      });
      return liveContext;
    },
    createUnavailableContext: reason => createUnavailableRuntimeAppContextImpl({
      world,
      reason,
      identities: world.project(moduleProjectors.identityIndex).rows
    })
  }));
  const staticPluginFiles = unionRuntimeContributions.staticAssetFiles ?? new Map();
  const sseClients = new Set();
  const appStaticRoot = appContext.appRoot;
  const APP_STATIC_PREFIX = "/app-static/";
  const trimString = value => typeof value === "string" && value.trim() ? value.trim() : "";
  const authSurfaceStateOverrides = ({
    route,
    requestActor,
    requestIdentity,
    requestPathname,
    decision,
    pendingRouteKey = "",
    pendingFeatureId = "",
    pendingPath = "",
    authStatus = ""
  } = {}) => {
    const stateMap = route?.params?.auth?.stateMap;
    if (!stateMap || typeof stateMap !== "object") return null;
    const overrides = {};
    const write = (key, value) => {
      const stateId = trimString(stateMap[key]);
      if (!stateId) return;
      overrides[stateId] = value;
    };
    write("actor", requestActor ?? "");
    write("identity", (typeof requestIdentity === "string" ? requestIdentity : requestIdentity?.id) ?? decision?.identity?.id ?? "");
    write("displayName", decision?.profile?.displayName ?? "");
    write("jobTitle", decision?.profile?.jobTitle ?? "");
    write("initials", decision?.profile?.initials ?? "");
    write("authStatus", authStatus);
    write("pendingRouteKey", pendingRouteKey);
    write("pendingFeatureId", pendingFeatureId);
    write("pendingPath", pendingPath);
    write("currentPath", requestPathname ?? "");
    write("millForceAccess", decision?.featureAccess?.["engentus.mill_force"] ?? "login");
    write("platformConfigAccess", decision?.featureAccess?.["engentus.platform_config"] ?? "hidden");
    const routeStateId = trimString(route?.params?.routeState?.state);
    const routeDefault = trimString(route?.params?.defaultScreen);
    if (routeStateId && routeDefault) overrides[routeStateId] = routeDefault;
    return overrides;
  };
  const authPageSpecFor = (route, branch) => {
    const params = route?.params?.auth?.[branch];
    if (!params || typeof params !== "object") return null;
    const routePath = trimString(params.routePath);
    if (!routePath) return null;
    return {
      routePath,
      routeKey: trimString(params.routeKey),
      responseStatus: Number(params.responseStatus || 200) || 200
    };
  };

  function mimeTypeForAppStatic(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
      case ".css":
        return "text/css; charset=utf-8";
      case ".js":
        return "text/javascript; charset=utf-8";
      case ".svg":
        return "image/svg+xml";
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".gif":
        return "image/gif";
      case ".webp":
        return "image/webp";
      case ".ico":
        return "image/x-icon";
      case ".json":
        return "application/json; charset=utf-8";
      case ".txt":
        return "text/plain; charset=utf-8";
      default:
        return "application/octet-stream";
    }
  }
  let sseLastCount = currentWitnessCount();
  const sseWatcher = setInterval(() => {
    const count = currentWitnessCount();
    if (count <= sseLastCount) return;
    const nextWitnesses = witnessesSince(sseLastCount);
    for (let index = 0; index < nextWitnesses.length; index += 1) {
      const witness = nextWitnesses[index] ?? null;
      const frame = sseFrame(sseLastCount + index + 1, witness);
      for (const client of sseClients) client.write(frame);
    }
    sseLastCount = count;
  }, 250);
  sseWatcher.unref?.();

  const runtimeProcessHealthMonitor = createRuntimeProcessHealthMonitor({
    runtimeConfig: appContext.runtimeConfig,
    probeCollector: appContext.resourceProbes,
    getRuntimeCounts: () => ({
      activeRequests: activeRequestCount,
      sseClients: sseClients.size,
      runtimeContexts: runtimeContexts.size,
      previewSessions: appContext.appPreviewSessionManager?.diagnostics?.().sessionCount ?? 0,
      snapshotWatchers: appContext.appSnapshotManager?.diagnostics?.().watcherCount ?? 0
    }),
    getServingState: () => {
      const witnessCoreStatus = appContext.witnessCoreStatusStore?.getStatus?.()
        ? {
            ...(appContext.witnessCoreStatusStore.getStatus() ?? {}),
            latestState: appContext.witnessCoreStatusStore.getLatestState?.() ?? null
          }
        : null;
      return appContext.appSnapshotManager?.servingState?.({ witnessCoreStatus }) ?? null;
    },
    getReadyState: () => {
      if (serverClosing) return false;
      if (appProject && !appContext.appSnapshotManager) return false;
      return appContext.startupTelemetry?.snapshot?.().meaningfulReadyAtMs != null;
    }
  });
  appContext.runtimeProcessHealthMonitor = runtimeProcessHealthMonitor;

  const supervisionPayload = supervision => ({
    ok: true,
    instanceId: supervision?.instanceId ?? null,
    role: supervision?.role ?? "active",
    mutationsEnabled: supervision?.mutationsEnabled !== false,
    watchersEnabled: supervision?.watchersEnabled === true
  });

  const server = httpModule.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const countTowardRequestPressure = !(req.method === "GET" && requestUrl.pathname === "/api/runtime/process-health");
    if (countTowardRequestPressure) {
      activeRequestCount += 1;
      lastRequestActivityAt = Date.now();
    }
    const startedAt = Date.now();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const runtime = await resolveActiveRuntime(req.headers?.host ?? null);
    if (appContext.appSnapshotManager && runtime.context && !runtime.context.appSnapshotManager) {
      runtime.context.appSnapshotManager = appContext.appSnapshotManager;
      runtime.context.devMode = activeDevMode === true;
    }
    attachEventsStream(runtime.context);
    const requestContext = resolveRequestContext(req, sessionStore, { allowActorHeader: runtime.runner.allowActorHeader === true });
    if (req.method === "GET" && requestUrl.pathname === "/api/runtime/process-health") {
      sendJson(res, 200, {
        ...runtimeProcessHealthMonitor.snapshot(),
        instanceId: runtime.context?.runtimeSupervision?.instanceId ?? null,
        role: runtime.context?.runtimeSupervision?.role ?? "active",
        mutationsEnabled: runtime.context?.runtimeSupervision?.mutationsEnabled !== false,
        watchersEnabled: runtime.context?.runtimeSupervision?.watchersEnabled === true
      });
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/runtime/supervision/activate") {
      const supervision = runtime.context?.runtimeSupervision ?? appContext.runtimeSupervision ?? null;
      if (!supervision) {
        sendJson(res, 404, { error: "runtime supervision unavailable" });
        return;
      }
      supervision.role = "active";
      supervision.mutationsEnabled = true;
      supervision.watchersEnabled = supervision.watchersEnabled === true && runtime.context?.devMode === true;
      supervision.lastStateAt = new Date().toISOString();
      runtime.context?.appSnapshotManager?.setWatcherMode?.(supervision.watchersEnabled);
      sendJson(res, 200, supervisionPayload(supervision));
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/runtime/supervision/quiesce") {
      const supervision = runtime.context?.runtimeSupervision ?? appContext.runtimeSupervision ?? null;
      if (!supervision) {
        sendJson(res, 404, { error: "runtime supervision unavailable" });
        return;
      }
      supervision.role = "draining";
      supervision.mutationsEnabled = false;
      supervision.watchersEnabled = false;
      supervision.lastStateAt = new Date().toISOString();
      runtime.context?.appSnapshotManager?.setWatcherMode?.(false);
      sendJson(res, 200, supervisionPayload(supervision));
      return;
    }
    let matchedRoute = null;
    const witnessCountBefore = currentWitnessCount();
    logInfo("http.request.start", { requestId, method: req.method, url: req.url, actor: requestContext.actor });
    res.on("finish", () => {
      logInfo("http.request.finish", { requestId, method: req.method, url: req.url, statusCode: res.statusCode, durationMs: Date.now() - startedAt });
    });

    try {
      if (req.method === "GET" && appStaticRoot && requestUrl.pathname.startsWith(APP_STATIC_PREFIX)) {
        const relativePath = decodeURIComponent(requestUrl.pathname.slice(APP_STATIC_PREFIX.length));
        const resolvedPath = path.resolve(appStaticRoot, relativePath);
        const relative = path.relative(appStaticRoot, resolvedPath);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        try {
          const bytes = await fsModule.readFile(resolvedPath);
          res.writeHead(200, { "content-type": mimeTypeForAppStatic(resolvedPath), "cache-control": "no-cache" });
          res.end(bytes);
        } catch {
          sendJson(res, 404, { error: "not found" });
        }
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/canvas-lib/")) {
        const name = decodeURIComponent(req.url.slice("/canvas-lib/".length));
        const resolvedFile = staticPluginFiles.get(name);
        if (!resolvedFile) {
          world.observe({ process: "backend.readCanvasLib.failed", actor: backendHost, claims: [], body: { name, reason: "not in canvas-lib whitelist" } });
          sendJson(res, 404, { error: "unknown canvas-lib module", name });
          return;
        }
        const text = await fsModule.readFile(resolvedFile, "utf8");
        world.observe({ process: "backend.readCanvasLib", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" });
        res.end(text);
        return;
      }

      if (
        runtime.context?.devMode
        && runtime.context?.appSnapshotManager
        && runtime.context?.runtimeSupervision?.watchersEnabled !== false
      ) {
        await runtime.context.appSnapshotManager.ensureFresh({ trigger: "request" });
      }
      const activeAppContext = requestScopedAppContext(runtime.context);

      const mountedRouteTable = mountedRoutesFor(runtime.runner.id, activeAppContext);
      const matched = matchDeclaredRoute(mountedRouteTable, req.method || "GET", requestUrl.pathname);

      if (requestDeniedByAuthGate(runtime.runner, requestContext, {
        pathname: requestUrl.pathname,
        method: req.method || "GET",
        matchedRoute: matched?.route ?? null
      })) {
        world.observe({
          process: "backend.authGate.denied",
          actor: backendHost,
          claims: [],
          body: { serverRunner: runtime.runner.id, method: req.method || "GET", path: requestUrl.pathname }
        });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }

      if (shouldServeBootstrapFallback({
        world,
        routeTable: mountedRouteTable,
        runtimeBundleSummary: activeAppContext?.runtimeBundleSummary ?? null,
        method: req.method || "GET",
        pathname: requestUrl.pathname
      })) {
        await genericHandlers["bootstrap.page"]({
          req,
          res,
          requestId,
          requestUrl,
          route: null,
          params: {},
          requestActor: requestContext.actor,
          requestIdentity: requestContext.identity,
          requestSession: requestContext.session,
          appContext: activeAppContext
        });
        return;
      }

      if (!matched) {
        if (await handleRetiredLegacyFrontendAuthoringEndpoint({
          req,
          res,
          pathname: requestUrl.pathname,
          appContext: activeAppContext
        })) {
          world.observe({
            process: "backend.route.retired",
            actor: backendHost,
            claims: [],
            body: {
              path: requestUrl.pathname,
              method: req.method || "GET",
              reason: "legacy frontend authoring retired"
            }
          });
          return;
        }
        const liveGenericEndpoint = matchGenericEndpoint(req.method || "GET", requestUrl.pathname, activeAppContext?.runtimeProfile ?? appContext.runtimeProfile, {
          additionalBundleIds: activeAppContext?.runtimeAdditionalBundleIds ?? [],
          bundleOverrides: activeAppContext?.runtimeBundleOverrides ?? bundleOverrides
        });
        const bootstrapGenericEndpoint = runtimeStartupMode === "bootstrap" && activeAppContext !== appContext
          ? matchGenericEndpoint(req.method || "GET", requestUrl.pathname, appContext.runtimeProfile, {
              additionalBundleIds: appContext.runtimeAdditionalBundleIds ?? [],
              bundleOverrides: appContext.runtimeBundleOverrides ?? bundleOverrides
            })
          : null;
        const genericEndpoint = liveGenericEndpoint ?? bootstrapGenericEndpoint;
        const genericEndpointContext = (
          liveGenericEndpoint
          && (activeAppContext?.activeDispatchHandlers ?? new Set()).has(liveGenericEndpoint.handler)
        )
          ? activeAppContext
          : (
              bootstrapGenericEndpoint
              && (appContext?.activeDispatchHandlers ?? new Set()).has(bootstrapGenericEndpoint.handler)
            )
            ? appContext
            : activeAppContext;
        const selectedGenericEndpoint = genericEndpointContext === appContext && bootstrapGenericEndpoint
          ? bootstrapGenericEndpoint
          : genericEndpoint;
        if (false) {
          // Endpoint belongs to a plugin bundle this host does not activate — behave as not-mounted.
          await handleProfileGatedAbsence({ req, res, appContext: activeAppContext, pathname: requestUrl.pathname, method: req.method || "GET" });
          return;
        }
        if (selectedGenericEndpoint) {
          const routeHandlers = {
            ...genericHandlers,
            ...(genericEndpointContext?.handlers ?? {})
          };
          const handler = routeHandlers[selectedGenericEndpoint.handler];
          if (!(genericEndpointContext?.activeDispatchHandlers ?? new Set()).has(selectedGenericEndpoint.handler) || typeof handler !== "function") {
            await handleProfileGatedAbsence({ req, res, appContext: activeAppContext, pathname: requestUrl.pathname, method: req.method || "GET" });
            return;
          }
          await handler({
            req,
            res,
            requestId,
            requestUrl,
            route: null,
            params: { ...(selectedGenericEndpoint.params ?? {}) },
            requestActor: requestContext.actor,
            requestIdentity: requestContext.identity,
            requestSession: requestContext.session,
            appContext: genericEndpointContext
          });
          return;
        }
      }

      if (!matched) {
        await handleProfileGatedAbsence({ req, res, appContext: activeAppContext, pathname: requestUrl.pathname, method: req.method || "GET" });
        return;
      }
      matchedRoute = matched.route;
      const routeWorld = activeAppContext?.appSnapshotManager?.getActiveSnapshot()?.world ?? world;
      if (await handleRetiredLegacyFrontendRoute({ req, res, route: matched.route, routeWorld, appContext: activeAppContext })) {
        world.observe({
          process: "backend.route.retired",
          actor: backendHost,
          claims: [],
          body: { route: matched.route.id, method: matched.route.method, path: matched.route.path, handler: matched.route.handler, reason: "legacy frontend retired" }
        });
        return;
      }
      if (!(activeAppContext?.activeDispatchHandlers ?? new Set()).has(matched.route.handler)) {
        world.observe({
          process: "backend.route.failed",
          actor: backendHost,
          claims: [],
          body: {
            route: matched.route.id,
            method: matched.route.method,
            path: matched.route.path,
            handler: matched.route.handler,
            reason: "handler unavailable in runtime profile",
            runtimeProfile: activeAppContext?.runtimeProfile ?? null
          }
        });
        await handleProfileGatedAbsence({ req, res, appContext: activeAppContext, pathname: requestUrl.pathname, method: req.method || "GET" });
        return;
      }
      const routeHandlers = {
        ...genericHandlers,
        ...(runtime.context.handlers ?? {})
      };
      const handler = matched.route.handler ? routeHandlers[matched.route.handler] : null;
      if (!handler) {
        world.observe({
          process: "backend.route.failed",
          actor: backendHost,
          claims: [],
          body: { route: matched.route.id, method: matched.route.method, path: matched.route.path, reason: "no handler" }
        });
        sendJson(res, 500, { error: "route handler not configured", route: matched.route.id });
        return;
      }
      const accessDecision = evaluateRouteAccess(routeWorld, matched.route, requestContext);
      if (!accessDecision.ok) {
        if (matched.route.handler === "page.surface") {
          const denialBranch = accessDecision.access === "login"
            ? "login"
            : accessDecision.access === "hidden"
              ? "notFound"
              : "forbidden";
          const authPage = authPageSpecFor(matched.route, denialBranch);
          if (authPage) {
            const denialRoute = {
              ...matched.route,
              params: {
                ...(matched.route.params ?? {}),
                defaultScreen: authPage.routeKey || matched.route.params?.defaultScreen || "",
                responseStatus: authPage.responseStatus,
                initialStateOverrides: authSurfaceStateOverrides({
                  route: matched.route,
                  requestActor: requestContext.actor,
                  requestIdentity: requestContext.identity,
                  requestPathname: requestUrl.pathname,
                  decision: accessDecision,
                  pendingRouteKey: accessDecision.access === "login"
                    ? trimString(matched.route.params?.auth?.resumeRouteKey ?? matched.route.params?.defaultScreen ?? "")
                    : "",
                  pendingFeatureId: accessDecision.access === "login" ? trimString(accessDecision.featureId) : "",
                  pendingPath: accessDecision.access === "login" ? requestUrl.pathname : "",
                  authStatus: accessDecision.identity ? "signedIn" : "idle"
                })
              }
            };
            await handler({
              req,
              res,
              requestId,
              requestUrl: new URL(authPage.routePath, "http://127.0.0.1"),
              route: denialRoute,
              params: matched.params,
              requestActor: requestContext.actor,
              requestIdentity: requestContext.identity,
              requestSession: requestContext.session,
              appContext: activeAppContext
            });
            return;
          }
        }
        if (accessDecision.access === "login") {
          sendJson(res, 401, { error: "sign in first" });
          return;
        }
        if (accessDecision.access === "hidden") {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        sendJson(res, 403, { error: "forbidden" });
        return;
      }
      const authorizedRoute = matched.route.handler === "page.surface"
        ? {
            ...matched.route,
            params: {
              ...(matched.route.params ?? {}),
              initialStateOverrides: authSurfaceStateOverrides({
                route: matched.route,
                requestActor: requestContext.actor,
                requestIdentity: requestContext.identity,
                requestPathname: requestUrl.pathname,
                decision: accessDecision,
                authStatus: accessDecision.identity ? "signedIn" : "idle"
              })
            }
          }
        : matched.route;

      await handler({
        req,
        res,
        requestId,
        requestUrl,
        route: authorizedRoute,
        params: matched.params,
        requestActor: requestContext.actor,
        requestIdentity: requestContext.identity,
        requestSession: requestContext.session,
        appContext: activeAppContext
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError("http.request.failed", { requestId, method: req.method, url: req.url, actor: requestContext.actor, durationMs: Date.now() - startedAt, error: err });
      world.observe({
        process: "server.request.failed",
        actor: backendHost,
        claims: [],
        body: { requestId, method: req.method, url: req.url, message, serverRunner: runtime.runner.id }
      });
      sendJson(res, 500, { error: "internal error", requestId });
    } finally {
      if (countTowardRequestPressure) {
        activeRequestCount = Math.max(0, activeRequestCount - 1);
        lastRequestActivityAt = Date.now();
      }
      const emittedWitnesses = witnessesSince(witnessCountBefore);
      const failedWitnesses = emittedWitnesses.filter(witness => witness.process.endsWith(".failed") || witness.process.endsWith(".blocked"));
      world.observe({
        process: "backend.request.finish",
        actor: requestContext.actor || backendHost,
        claims: matchedRoute ? [relation(backendHost, "handled", matchedRoute.id)] : [],
        body: {
          requestId,
          method: req.method || "GET",
          url: req.url || "/",
          statusCode: res.statusCode || 0,
          durationMs: Date.now() - startedAt,
          route: matchedRoute?.id ?? null,
          handler: matchedRoute?.handler ?? null,
          runId: headerValue(req.headers["x-witness-process-run"]),
          stepId: headerValue(req.headers["x-witness-step-id"]),
          emittedWitnessIds: emittedWitnesses.map(witness => witness.id),
          failureWitnessIds: failedWitnesses.map(witness => witness.id)
        }
      });
    }
  });

  await startupTelemetry.runPhase("runtime.listen", () => new Promise(resolve => server.listen(port, "127.0.0.1", resolve)), {
    label: "Bind HTTP listener"
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  if (startupPersistenceCommitMode === "pre-ready") {
    await startupTelemetry.runPhase("runtime.persistence.commit", () => world.flushPersistence?.(), {
      label: "Persist startup witnesses"
    });
  }
  startupTelemetry.mark("listenReady", { url, serverRunner: serverRunner.id });
  startupTelemetry.mark("meaningfulReady", { url, serverRunner: serverRunner.id });
  if (startupPersistenceCommitMode !== "pre-ready") {
    trackBackgroundStartup(
      "runtime.persistence.commit",
      "Persist startup witnesses",
      async () => {
        await world.commitBufferedPersistence?.({ mode: "post-ready" });
        return { commitMode: "post-ready" };
      },
      {
        detail: {
          lazy: true,
          commitMode: "post-ready"
        }
      }
    );
  }

  const verificationPersistenceReady = scheduleBackgroundStartup(
    "runtime.verificationPersistence",
    "Initialize verification persistence",
    effectiveBackgroundStartupPolicy.verificationPersistence,
    async () => {
      const verificationPersistence = await createRuntimeVerificationPersistenceImpl({
        serverRunner,
        appProject,
        runtimeRoot,
        runtimeOperatorContract: appContext.runtimeOperatorContract,
        runtimeProfile: appContext.runtimeProfile
      });
      if (serverClosing) {
        try {
          verificationPersistence?.close?.();
        } catch {}
        return { closedBeforeAttach: true };
      }
      appContext.verificationPersistence = verificationPersistence;
      appContext.verificationPersistenceDiagnostics = verificationPersistence?.inspect?.().diagnostics ?? [];
      registerDeferredCloser(() => {
        try {
          verificationPersistence?.close?.();
        } catch {}
      });
      return {
        diagnosticsCount: appContext.verificationPersistenceDiagnostics.length
      };
    }
  );

  scheduleBackgroundStartup(
    "runtime.testMonitor.initialize",
    "Initialize platform test monitor",
    effectiveBackgroundStartupPolicy.testMonitor,
    async () => {
      await verificationPersistenceReady;
      await appContext.providerRuntimes?.["platform.testMonitor"]?.initialize?.();
      return { initialized: true };
    }
  );

  if (appProject) {
    appContext.appSnapshotManagerReady = scheduleBackgroundStartup(
      "runtime.appSnapshot.initialBuild",
      "Build initial app snapshot",
      effectiveBackgroundStartupPolicy.appSnapshotInitialBuild,
      async () => {
        const appSnapshotManager = await AppSnapshotManagerClass.create({
          appProject,
          runtimeProfile: appContext.runtimeProfile,
          runtimePluginIds: configuredRuntimePluginIds,
          env,
          devMode: activeDevMode === true,
          logger,
          generationBridge: appContext.witnessCoreBridge,
          fsModule,
          watchEnabled: appContext.runtimeSupervision?.watchersEnabled !== false,
          requireGenerationBridgeForPublishedWrites: Boolean(appContext.witnessCoreUrl)
        });
        if (serverClosing) {
          appSnapshotManager.close();
          return { closedBeforeAttach: true };
        }
        appContext.appSnapshotManager = appSnapshotManager;
        appContext.appPreviewSessionManager = new AppPreviewSessionManager({
          appSnapshotManager,
          generationBridge: appContext.witnessCoreBridge,
          logger,
          fsModule
        });
        registerDeferredCloser(() => appSnapshotManager.close());
        return {
          appRevision: Number(appSnapshotManager.appRevision || 0),
          sourceCount: Number(appSnapshotManager.diagnostics?.().sourceCount || 0),
          devMode: activeDevMode === true
        };
      }
    );
  }

  const startupReady = Promise.allSettled(backgroundStartupTasks).then(() => startupTelemetry.snapshot());

  world.emit({
    process: "server.start",
    actor,
    claims: [
      relation(backendHost, "serves", serverRunner.id),
      relation(frontendHost, "renders", serverRunner.id),
      ...mountedRoutesFor(serverRunner.id, appContext).map(route => relation(serverRunner.id, "serves", route.id))
    ],
      body: {
        url,
        serverRunner: serverRunner.id,
      backendHost,
      frontendHost,
      handlerSet: serverRunner.handlerSet ?? null,
        actors: appContext.actors,
        storage,
        routeCount: mountedRoutesFor(serverRunner.id, appContext).length,
        runtimePlugins: effectiveRuntimePluginCatalog.activePluginIds
      }
    });

  return {
    ok: true,
    url,
    runtimeBundleSummary: appContext.runtimeBundleSummary,
    runtimePluginCatalog: appContext.runtimePluginCatalog,
    runtimeContext: appContext,
    getStartupTelemetry: () => startupTelemetry.snapshot(),
    subscribeStartupTelemetry: listener => startupTelemetry.subscribe?.(listener) ?? (() => {}),
    startupReady,
    close: async () => {
      serverClosing = true;
      runtimeProcessHealthMonitor.close();
      clearInterval(sseWatcher);
      for (const client of sseClients) client.end();
      sseClients.clear();
      for (const context of new Set(runtimeContexts.values())) context?.close?.();
      const appContextClose = typeof appContext.close === "function" ? appContext.close.bind(appContext) : null;
      appContext.witnessCoreStatusStore?.close?.();
      await appContextClose?.();
      await Promise.allSettled(backgroundStartupTasks);
      await world.flushPersistence?.();
      while (deferredClosers.length) {
        const closer = deferredClosers.pop();
        try {
          closer?.();
        } catch {}
      }
      while (projectionContextRemovers.length) {
        const removeProjectionContext = projectionContextRemovers.pop();
        try {
          removeProjectionContext?.();
        } catch {}
      }
      server.closeAllConnections?.();
      return new Promise(resolve => server.close(resolve));
    }
  };
}
