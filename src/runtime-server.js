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
import { AppSnapshotManager } from "./app-snapshot-manager.js";
import {
  createRuntimeAppContextForRunner,
  createRuntimeResolverForServer
} from "./runtime-startup-services.js";
import { createRuntimeContextResolver } from "./runtime-context-resolver.js";
import {
  compileRouteMatcher,
  matchDeclaredRoute,
  matchGenericEndpoint,
  shouldServeBootstrapFallback
} from "./runtime-routing.js";
import { ensureRuntimeBuiltins } from "./runtime-builtins.js";
import {
  DEFAULT_RUNTIME_PROFILE,
  defaultHostCapabilitiesForProfile,
  dispatchHandlerIdsForProfile,
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
import { resolveRunnerVerificationPolicy } from "./runtime-verification-policy.js";

export async function startRuntimeServer(world, {
  actor,
  serverRunnerId = null,
  port = 0,
  runtimeRoot,
  appProject = null,
  logger,
  mcpInternalToken = null,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  runtimePluginIds = null,
  runtimeStartupMode = "serve",
  runtimeAuthoringMode = null,
  runtimeOperatorContract = null,
  devMode = null,
  env = process.env
}, deps) {
  const {
    createGenericRouteHandlers,
    hostCapabilities,
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
    createRuntimeResolverForServer: createRuntimeResolverForServerImpl = createRuntimeResolverForServer,
    createRuntimeAppContext: createRuntimeAppContextImpl = createRuntimeAppContext,
    createUnavailableRuntimeAppContext: createUnavailableRuntimeAppContextImpl = createUnavailableRuntimeAppContext,
    createRuntimeContextResolver: createRuntimeContextResolverImpl = createRuntimeContextResolver,
    resolveRuntimePluginRoot: resolveRuntimePluginRootImpl = resolveRuntimePluginRoot,
    resolveConfiguredRuntimePluginIds: resolveConfiguredRuntimePluginIdsImpl = resolveConfiguredRuntimePluginIds,
    readRuntimePluginCatalog: readRuntimePluginCatalogImpl = readRuntimePluginCatalog,
    defaultHostCapabilitiesForProfile: defaultHostCapabilitiesForProfileImpl = defaultHostCapabilitiesForProfile,
    loadRuntimePluginModules: loadRuntimePluginModulesImpl = loadRuntimePluginModules,
    applyRuntimePluginLoadState: applyRuntimePluginLoadStateImpl = applyRuntimePluginLoadState,
    collectActiveRuntimeContributions: collectActiveRuntimeContributionsImpl = collectActiveRuntimeContributions
  } = deps;

  const handleProfileGatedAbsence = async ({ req, res, appContext, pathname, method }) => {
    const isHtml = String(req.headers["accept"] || "").includes("text/html");
    if (!isHtml) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    const compositionOptions = {
      operatorPluginIds: appContext?.operatorRuntimePluginIds ?? [],
      authoredPluginIds: appContext?.authoredRuntimePluginIds ?? []
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
    const snapshot = liveSnapshotManager?.getActiveSnapshot?.() ?? null;
    if (!appContext || !liveSnapshotManager || !snapshot) return appContext;
    const scoped = Object.create(appContext);
    scoped.appSnapshotManager = pinnedSnapshotManager(liveSnapshotManager, snapshot);
    scoped.requestSnapshot = snapshot;
    scoped.requestAppRevision = Number(snapshot.appRevision || 0);
    return scoped;
  };
  const activeDevMode = devMode ?? (runtimeStartupMode === "serve" && appProject != null);

  const runtimePluginRoot = resolveRuntimePluginRootImpl({ env });
  const configuredRuntimePluginIds = resolveConfiguredRuntimePluginIdsImpl({ env, runtimePluginIds });

  const resolved = resolveStartupRunner(world, serverRunnerId);
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
  const runtimePluginInstallIndex = world.project(moduleProjectors.runtimePluginInstallIndex);
  // Load plugin modules authored for ANY runner, not just the primary: a multi-host instance must
  // have every host's handlers available. Per-runner route filtering (servedRoutes) still scopes
  // which routes each host actually exposes, so loading extra handler code is inert for other hosts.
  const authoredRuntimePluginIds = [...new Set(
    (runtimePluginInstallIndex?.rows ?? []).map(row => row.plugin)
  )];
  const runtimePluginCatalog = await readRuntimePluginCatalogImpl({
    pluginRoot: runtimePluginRoot,
    runtimeProfile,
    configuredPluginIds: configuredRuntimePluginIds,
    authoredPluginIds: authoredRuntimePluginIds
  });
  if (runtimePluginCatalog.selection.hasBlockingErrors) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        reason: "runtime plugins unresolved",
        serverRunner: serverRunner.id,
        pluginRoot: runtimePluginRoot,
        authoredRuntimePlugins: runtimePluginCatalog.authoredPluginIds,
        operatorRuntimePlugins: runtimePluginCatalog.operatorPluginIds,
        effectiveRuntimePlugins: runtimePluginCatalog.effectivePluginIds,
        rejectedRuntimePlugins: runtimePluginCatalog.rejectedPlugins
      }
    });
    return { ok: false, reason: "runtime plugins unresolved", runtimePluginCatalog };
  }
  const runtimePluginLoadResult = await loadRuntimePluginModulesImpl({
    pluginCatalog: runtimePluginCatalog
  });
  const effectiveRuntimePluginCatalog = applyRuntimePluginLoadStateImpl(runtimePluginCatalog, runtimePluginLoadResult);
  if (runtimePluginLoadResult.hasBlockingErrors) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        reason: "runtime plugin modules unresolved",
        serverRunner: serverRunner.id,
        pluginRoot: runtimePluginRoot,
        authoredRuntimePlugins: effectiveRuntimePluginCatalog.authoredPluginIds,
        operatorRuntimePlugins: effectiveRuntimePluginCatalog.operatorPluginIds,
        effectiveRuntimePlugins: effectiveRuntimePluginCatalog.effectivePluginIds,
        rejectedRuntimePlugins: effectiveRuntimePluginCatalog.rejectedPlugins
      }
    });
    return { ok: false, reason: "runtime plugin modules unresolved", runtimePluginCatalog: effectiveRuntimePluginCatalog };
  }
  const bundleOverrides = runtimePluginLoadResult.bundleOverrides ?? {};
  const additionalBundleIds = [...new Set([
    ...(runtimePluginCatalog.addedBundleIds ?? []),
    ...Object.keys(bundleOverrides)
  ])];
  const resolvedRuntime = runtimeBundleSummaryForProfileImpl(runtimeProfile, {
    additionalBundleIds,
    bundleOverrides
  });
  let runtimeContributions;
  let projectionContext;
  let removeWorldProjectionContext = () => {};
  try {
    runtimeContributions = collectActiveRuntimeContributionsImpl({
      bundles: resolvedRuntime.bundles ?? []
    });
    projectionContext = createModuleProjectorContext(runtimeContributions.moduleProjectors ?? {}, {
      owner: `runtime.activePlugins:${serverRunner.id}`
    });
    removeWorldProjectionContext = world._pushProjectionContext?.(projectionContext) ?? (() => {});
  } catch (error) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        reason: "runtime plugin contributions unresolved",
        message: error instanceof Error ? error.message : String(error)
      }
    });
    return { ok: false, reason: "runtime plugin contributions unresolved", error };
  }
  const activeRuntimeProfile = resolvedRuntime.profile;
  const compositionOptions = { additionalBundleIds, bundleOverrides };
  // Per-runner bundle gating (multi-host): plugin-contributed bundles are loaded process-wide so
  // every host's handlers exist, but a bundle's generic endpoints must only answer on runners that
  // actually install the plugin. Map each plugin id to the bundle(s) it owns, and treat the set of
  // plugin-added bundle ids as "opt-in" (base profile bundles stay available to all runners).
  const pluginBundleIdsByPlugin = new Map();
  for (const pluginPackage of effectiveRuntimePluginCatalog.packages ?? []) {
    const ids = pluginPackage?.runtimeModule?.bundleIds ?? [];
    if (ids.length) pluginBundleIdsByPlugin.set(pluginPackage.id, new Set(ids));
  }
  const optInBundleIds = new Set(additionalBundleIds);
  const activeAddedBundlesForRunner = runnerId => {
    const active = new Set();
    const installs = world.project(moduleProjectors.runtimePluginInstallIndex)?.byServerRunner?.[runnerId] ?? [];
    for (const row of installs) {
      const owned = pluginBundleIdsByPlugin.get(row.plugin);
      if (owned) for (const bundleId of owned) active.add(bundleId);
    }
    return active;
  };
  // True when a matched generic endpoint belongs to an opt-in bundle this runner does not activate.
  const genericEndpointGatedForRunner = (endpoint, runnerId) => {
    const bundleId = endpoint?.bundleId ?? null;
    if (!bundleId || !optInBundleIds.has(bundleId)) return false;
    return !activeAddedBundlesForRunner(runnerId).has(bundleId);
  };
  const runtimeSurfaceEntries = runtimeSurfaceEntriesForProfileImpl(activeRuntimeProfile, null, compositionOptions);
  const activeDispatchHandlers = new Set(resolvedRuntime.dispatchHandlers ?? dispatchHandlerIdsForProfileImpl(activeRuntimeProfile, compositionOptions));
  const handlerSetFactories = handlerSetFactoriesForProfileImpl(activeRuntimeProfile, compositionOptions);
  const handlerSetDefinitions = handlerSetDefinitionsForProfileImpl(activeRuntimeProfile, compositionOptions);
  ensureRuntimeBuiltinsImpl(world, {
    capabilityIds: providedCapabilityIdsForProfileImpl(activeRuntimeProfile, compositionOptions),
    capabilityDefinitions: runtimeCapabilityDefinitionsForProfileImpl(activeRuntimeProfile, compositionOptions),
    seedContributions: runtimeBuiltinSeedContributionsForProfileImpl(activeRuntimeProfile, compositionOptions)
  });
  const backendHost = serverRunner.backendHost;
  const frontendHost = serverRunner.frontendHost;
  if (!backendHost || !frontendHost) {
    removeWorldProjectionContext();
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, backendHost, frontendHost, reason: "server runner host bindings incomplete" }
    });
    return { ok: false, reason: "server runner host bindings incomplete" };
  }

  const backendDefaults = defaultHostCapabilitiesForProfileImpl(activeRuntimeProfile, "backend", compositionOptions);
  const frontendDefaults = defaultHostCapabilitiesForProfileImpl(activeRuntimeProfile, "frontend", compositionOptions);
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
  const requiredBackend = startupRequiredHostCapabilitiesForProfileImpl(activeRuntimeProfile, "backend", compositionOptions);
  const requiredFrontend = startupRequiredHostCapabilitiesForProfileImpl(activeRuntimeProfile, "frontend", compositionOptions);
  const missingBackend = requiredBackend.filter(capability => !backendCaps.has(capability));
  const missingFrontend = requiredFrontend.filter(capability => !frontendCaps.has(capability));
  if (missingBackend.length || missingFrontend.length) {
    removeWorldProjectionContext();
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, backendHost, frontendHost, missingBackend, missingFrontend }
    });
    return { ok: false, reason: "missing host capabilities" };
  }

  const runtimeConfig = resolveRuntimeConfig(serverRunner.runtimeConfig, env);
  if (!runtimeConfig.ok) {
    removeWorldProjectionContext();
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: {
        serverRunner: serverRunner.id,
        reason: "runtime config unresolved",
        runtimeConfig: runtimeConfig.fields,
        runtimeConfigFailures: runtimeConfig.failures
      }
    });
    return { ok: false, reason: "runtime config unresolved" };
  }

  const appContext = await createRuntimeAppContextForRunnerImpl({
    world,
    serverRunner,
    runtimeRoot,
    appProject,
    sendJson,
    readJson,
    handlerSetFactories,
    runtimeContributions,
    projectionContext,
    resolveStorageConfig,
    resolveRuntimeConfig,
    env,
    createRuntimeAppContext: createRuntimeAppContextImpl
  });
  if (!appContext.ok) {
    removeWorldProjectionContext();
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, reason: appContext.reason, handlerSet: serverRunner.handlerSet ?? null }
    });
    return { ok: false, reason: appContext.reason };
  }

  appContext.requestedRuntimeProfile = runtimeProfile;
  appContext.runtimeProfile = activeRuntimeProfile;
  appContext.runtimeStartupMode = runtimeStartupMode;
  appContext.runtimeAuthoringPolicy = createRuntimeAuthoringPolicy({
    mode: runtimeAuthoringMode ?? defaultRuntimeAuthoringMode({ runtimeStartupMode })
  });
  appContext.runtimeBundleSummary = resolvedRuntime;
  appContext.runtimeAdditionalBundleIds = additionalBundleIds;
  appContext.runtimeBundleOverrides = bundleOverrides;
  appContext.runtimeSurfaceEntries = runtimeSurfaceEntries;
  appContext.runtimePluginCatalog = effectiveRuntimePluginCatalog;
  appContext.authoredRuntimePluginIds = effectiveRuntimePluginCatalog.authoredPluginIds;
  appContext.runtimePluginIds = effectiveRuntimePluginCatalog.operatorPluginIds;
  appContext.operatorRuntimePluginIds = effectiveRuntimePluginCatalog.operatorPluginIds;
  appContext.effectiveRuntimePluginIds = effectiveRuntimePluginCatalog.effectivePluginIds;
  appContext.activeRuntimePluginIds = effectiveRuntimePluginCatalog.activePluginIds;
  const verificationPolicy = resolveRunnerVerificationPolicy({
    serverRunner,
    runtimeProfile: activeRuntimeProfile,
    runtimeConfig: appContext.runtimeConfig
  });
  appContext.verificationPolicy = verificationPolicy;
  appContext.verificationPolicySource = verificationPolicy.source;
  appContext.verificationPolicyDiagnostics = verificationPolicy.diagnostics ?? [];
  await appContext.providerRuntimes?.["platform.testMonitor"]?.initialize?.();
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
  appContext.handlerSet = serverRunner.handlerSet ?? null;
  appContext.bootstrapOnly = serverRunner.bootstrapOnly === true;
  appContext.devMode = activeDevMode === true;
  if (appProject) {
    const appSnapshotManager = await AppSnapshotManager.create({
      appProject,
      runtimeProfile: activeRuntimeProfile,
      runtimePluginIds: configuredRuntimePluginIds,
      env,
      devMode: activeDevMode === true,
      logger,
      fsModule
    });
    appContext.appSnapshotManager = appSnapshotManager;
    const priorClose = typeof appContext.close === "function" ? appContext.close.bind(appContext) : null;
    appContext.close = () => {
      appSnapshotManager.close();
      priorClose?.();
    };
  }
  const storage = appContext.storage;

  const sessionStore = new Map();
  const genericHandlers = createGenericRouteHandlers({
    world,
    backendHost,
    frontendHost,
    sessionStore,
    logger,
    mcpInternalToken,
    runtimeProfile: activeRuntimeProfile,
    runtimeBundleSummary: resolvedRuntime,
    runtimeSurfaceEntries,
    handlerSetDefinitions,
    runtimeContributions,
    runtimePluginRoot,
    runtimePluginIds: effectiveRuntimePluginCatalog.operatorPluginIds,
    authoredRuntimePluginIds: effectiveRuntimePluginCatalog.authoredPluginIds,
    appSnapshotManager: appContext.appSnapshotManager ?? null,
    currentAppRenderWorld: () => appContext.appSnapshotManager?.getActiveSnapshot()?.world ?? world
  });
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
  const runtimeResolver = createRuntimeResolverForServerImpl({
    world,
    bootstrapRunner: serverRunner,
    bootstrapContext: appContext,
    runtimeRoot,
    appProject,
    sendJson,
    readJson,
    handlerSetFactories,
    runtimeContributions,
    projectionContext,
    resolveStorageConfig,
    resolveRuntimeConfig,
    env,
    createRuntimeAppContext: createRuntimeAppContextImpl,
    createUnavailableRuntimeAppContext: createUnavailableRuntimeAppContextImpl,
    createRuntimeContextResolver: createRuntimeContextResolverImpl,
    resolveLiveRunner: requestHost => (
      typeof resolveRunnerForHost === "function"
        ? resolveRunnerForHost(world, requestHost ?? null)
        : resolveServerRunner(world, null)
    )
  });
  const { runtimeContexts, resolveActiveRuntime } = runtimeResolver;
  const staticPluginFiles = runtimeContributions.staticAssetFiles ?? new Map();
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

  const server = httpModule.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const runtime = await resolveActiveRuntime(req.headers?.host ?? null);
    if (appContext.appSnapshotManager && runtime.context && !runtime.context.appSnapshotManager) {
      runtime.context.appSnapshotManager = appContext.appSnapshotManager;
      runtime.context.devMode = activeDevMode === true;
    }
    attachEventsStream(runtime.context);
    const requestContext = resolveRequestContext(req, sessionStore, { allowActorHeader: runtime.runner.allowActorHeader === true });
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
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

      if (runtime.context?.devMode && runtime.context?.appSnapshotManager) {
        await runtime.context.appSnapshotManager.ensureFresh({ trigger: "request" });
      }
      const activeAppContext = requestScopedAppContext(runtime.context);

      const mountedRouteTable = mountedRoutesFor(runtime.runner.id, activeAppContext);
      const matched = matchDeclaredRoute(mountedRouteTable, req.method || "GET", requestUrl.pathname);

      if (shouldServeBootstrapFallback({
        world,
        routeTable: mountedRouteTable,
        runtimeBundleSummary: resolvedRuntime,
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
          appContext: runtime.context
        });
        return;
      }

      if (!matched) {
        const genericEndpoint = matchGenericEndpoint(req.method || "GET", requestUrl.pathname, activeRuntimeProfile, compositionOptions);
        if (genericEndpoint && genericEndpointGatedForRunner(genericEndpoint, runtime.runner.id)) {
          // Endpoint belongs to a plugin bundle this host does not activate — behave as not-mounted.
          await handleProfileGatedAbsence({ req, res, appContext: activeAppContext, pathname: requestUrl.pathname, method: req.method || "GET" });
          return;
        }
        if (genericEndpoint) {
          const routeHandlers = {
            ...genericHandlers,
            ...(runtime.context.handlers ?? {})
          };
          const handler = routeHandlers[genericEndpoint.handler];
          if (!activeDispatchHandlers.has(genericEndpoint.handler) || typeof handler !== "function") {
            await handleProfileGatedAbsence({ req, res, appContext: activeAppContext, pathname: requestUrl.pathname, method: req.method || "GET" });
            return;
          }
          await handler({
            req,
            res,
            requestId,
            requestUrl,
            route: null,
            params: { ...(genericEndpoint.params ?? {}) },
            requestActor: requestContext.actor,
            requestIdentity: requestContext.identity,
            requestSession: requestContext.session,
            appContext: activeAppContext
          });
          return;
        }
      }

      if (!matched) {
        await handleProfileGatedAbsence({ req, res, appContext: activeAppContext, pathname: requestUrl.pathname, method: req.method || "GET" });
        return;
      }
      matchedRoute = matched.route;
      if (!activeDispatchHandlers.has(matched.route.handler)) {
        world.observe({
          process: "backend.route.failed",
          actor: backendHost,
          claims: [],
          body: { route: matched.route.id, method: matched.route.method, path: matched.route.path, handler: matched.route.handler, reason: "handler unavailable in runtime profile", runtimeProfile }
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
      const routeWorld = activeAppContext?.appSnapshotManager?.getActiveSnapshot()?.world ?? world;
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

  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

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
    runtimeBundleSummary: resolvedRuntime,
    runtimePluginCatalog: effectiveRuntimePluginCatalog,
    runtimeContext: appContext,
    close: () => {
      clearInterval(sseWatcher);
      for (const client of sseClients) client.end();
      sseClients.clear();
      for (const context of new Set(runtimeContexts.values())) context?.close?.();
      removeWorldProjectionContext();
      server.closeAllConnections?.();
      return new Promise(resolve => server.close(resolve));
    }
  };
}
