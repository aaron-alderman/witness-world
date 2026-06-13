import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { relation } from "./kernel.js";
import { ensureCapabilityDefinition, installCapability, moduleProjectors } from "./modules.js";
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
  createRuntimeAppContextForRunner,
  createRuntimeResolverForServer
} from "./runtime-startup-services.js";
import {
  createBuiltinAssetJobHandlers
} from "../plugins/assets/job-handlers.js";
import {
  createBuiltinNotificationJobHandlers
} from "../plugins/notifications/job-handlers.js";
import {
  createBuiltinWebhookJobHandlers
} from "../plugins/webhooks/job-handlers.js";
import { createDbSqlRuntime } from "../plugins/sqlite/provider-runtime.js";
import { createInProcessJobQueue } from "../plugins/jobs/provider-runtime.js";
import { createSearchIndexRuntime } from "../plugins/search/provider-runtime.js";
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
  providedCapabilityIdsForProfile,
  runtimeCapabilityDefinitionsForProfile,
  runtimeBuiltinSeedContributionsForProfile,
  runtimeBundleSummaryForProfile,
  runtimeSurfaceEntriesForProfile,
  startupRequiredHostCapabilitiesForProfile
} from "./runtime-bundles.js";
import {
  readRuntimePluginCatalog,
  resolveConfiguredRuntimePluginIds,
  resolveRuntimePluginRoot
} from "./runtime-plugin-utils.js";
import {
  applyRuntimePluginLoadState,
  loadRuntimePluginModules
} from "./runtime-plugin-loader.js";
import { buildRuntimeOperatorContract } from "./runtime-operator-contract.js";
import { createRuntimeOperatorService } from "./runtime-operator-service.js";

function canvasLibFilesForRuntime() {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const canvasDir = path.join(srcDir, "..", "plugins", "canvas");
  const edenDir = path.join(srcDir, "..", "plugins", "eden");
  return new Map([
    ["canvas-core.js", path.join(canvasDir, "canvas-core.js")],
    ["projectors-core.js", path.join(canvasDir, "projectors-core.js")],
    ["canvas-projection.js", path.join(canvasDir, "canvas-projection.js")],
    ["eden-personal-box.js", path.join(edenDir, "eden-personal-box.js")],
    ["eden-page-theme.js", path.join(edenDir, "eden-page-theme.js")],
    ["eden-capability-install.js", path.join(edenDir, "eden-capability-install.js")],
    ["eden-academy.js", path.join(edenDir, "eden-academy.js")],
    ["eden-organization.js", path.join(edenDir, "eden-organization.js")],
    ["eden-theory.js", path.join(edenDir, "eden-theory.js")]
  ]);
}

export async function startRuntimeServer(world, {
  actor,
  serverRunnerId = null,
  port = 0,
  runtimeRoot,
  logger,
  mcpInternalToken = null,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  runtimePluginIds = null,
  runtimeStartupMode = "serve",
  runtimeOperatorContract = null,
  env = process.env
}, deps) {
  const {
    createGenericRouteHandlers,
    hostCapabilities,
    resolveRuntimeConfig,
    resolveServerRunner,
    resolveStartupRunner,
    resolveStorageConfig,
    httpModule = http,
    fsModule = fs,
    ensureRuntimeBuiltins: ensureRuntimeBuiltinsImpl = ensureRuntimeBuiltins,
    runtimeBundleSummaryForProfile: runtimeBundleSummaryForProfileImpl = runtimeBundleSummaryForProfile,
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
    createBuiltinAssetJobHandlers: createBuiltinAssetJobHandlersImpl = createBuiltinAssetJobHandlers,
    createBuiltinNotificationJobHandlers: createBuiltinNotificationJobHandlersImpl = createBuiltinNotificationJobHandlers,
    createBuiltinWebhookJobHandlers: createBuiltinWebhookJobHandlersImpl = createBuiltinWebhookJobHandlers,
    createInProcessJobQueue: createInProcessJobQueueImpl = createInProcessJobQueue,
    createDbSqlRuntime: createDbSqlRuntimeImpl = createDbSqlRuntime,
    createSearchIndexRuntime: createSearchIndexRuntimeImpl = createSearchIndexRuntime,
    resolveRuntimePluginRoot: resolveRuntimePluginRootImpl = resolveRuntimePluginRoot,
    resolveConfiguredRuntimePluginIds: resolveConfiguredRuntimePluginIdsImpl = resolveConfiguredRuntimePluginIds,
    readRuntimePluginCatalog: readRuntimePluginCatalogImpl = readRuntimePluginCatalog,
    defaultHostCapabilitiesForProfile: defaultHostCapabilitiesForProfileImpl = defaultHostCapabilitiesForProfile,
    loadRuntimePluginModules: loadRuntimePluginModulesImpl = loadRuntimePluginModules,
    applyRuntimePluginLoadState: applyRuntimePluginLoadStateImpl = applyRuntimePluginLoadState
  } = deps;

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
  const authoredRuntimePluginIds = (runtimePluginInstallIndex?.byServerRunner?.[serverRunner.id] ?? [])
    .map(row => row.plugin);
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
  const activeRuntimeProfile = resolvedRuntime.profile;
  const compositionOptions = { additionalBundleIds, bundleOverrides };
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
    sendJson,
    readJson,
    handlerSetFactories,
    createBuiltinAssetJobHandlers: createBuiltinAssetJobHandlersImpl,
    createBuiltinNotificationJobHandlers: createBuiltinNotificationJobHandlersImpl,
    createBuiltinWebhookJobHandlers: createBuiltinWebhookJobHandlersImpl,
    createInProcessJobQueue: createInProcessJobQueueImpl,
    createDbSqlRuntime: createDbSqlRuntimeImpl,
    createSearchIndexRuntime: createSearchIndexRuntimeImpl,
    resolveStorageConfig,
    resolveRuntimeConfig,
    env,
    createRuntimeAppContext: createRuntimeAppContextImpl
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

  appContext.requestedRuntimeProfile = runtimeProfile;
  appContext.runtimeProfile = activeRuntimeProfile;
  appContext.runtimeStartupMode = runtimeStartupMode;
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
  const attachEventsStream = context => {
    if (!context) return context;
    context.eventsStream = {
      open(res, req) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(sseFrame(world.allWitnesses().length, world.allWitnesses().at(-1) ?? null));
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
    runtimePluginRoot,
    runtimePluginIds: effectiveRuntimePluginCatalog.operatorPluginIds,
    authoredRuntimePluginIds: effectiveRuntimePluginCatalog.authoredPluginIds
  });
  const mountedRoutesFor = runnerId => world.project(moduleProjectors.servedRoutes)
    .filter(route => route.serverRunner === runnerId)
    .map(route => ({ ...route, matcher: compileRouteMatcher(route.path) }));
  const runtimeResolver = createRuntimeResolverForServerImpl({
    world,
    bootstrapRunner: serverRunner,
    bootstrapContext: appContext,
    runtimeRoot,
    sendJson,
    readJson,
    handlerSetFactories,
    createBuiltinAssetJobHandlers: createBuiltinAssetJobHandlersImpl,
    createBuiltinNotificationJobHandlers: createBuiltinNotificationJobHandlersImpl,
    createBuiltinWebhookJobHandlers: createBuiltinWebhookJobHandlersImpl,
    createInProcessJobQueue: createInProcessJobQueueImpl,
    createDbSqlRuntime: createDbSqlRuntimeImpl,
    createSearchIndexRuntime: createSearchIndexRuntimeImpl,
    resolveStorageConfig,
    resolveRuntimeConfig,
    env,
    createRuntimeAppContext: createRuntimeAppContextImpl,
    createUnavailableRuntimeAppContext: createUnavailableRuntimeAppContextImpl,
    createRuntimeContextResolver: createRuntimeContextResolverImpl,
    resolveLiveRunner: () => resolveServerRunner(world, null)
  });
  const { runtimeContexts, resolveActiveRuntime } = runtimeResolver;
  const canvasLibFiles = canvasLibFilesForRuntime();
  const sseClients = new Set();
  let sseLastCount = world.allWitnesses().length;
  const sseWatcher = setInterval(() => {
    const count = world.allWitnesses().length;
    if (count <= sseLastCount) return;
    const witnesses = world.allWitnesses();
    for (let index = sseLastCount; index < count; index += 1) {
      const witness = witnesses[index] ?? null;
      const frame = sseFrame(index + 1, witness);
      for (const client of sseClients) client.write(frame);
    }
    sseLastCount = count;
  }, 250);
  sseWatcher.unref?.();

  const server = httpModule.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const runtime = await resolveActiveRuntime();
    attachEventsStream(runtime.context);
    const requestContext = resolveRequestContext(req, sessionStore, { allowActorHeader: runtime.runner.allowActorHeader === true });
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    let matchedRoute = null;
    const witnessCountBefore = world.allWitnesses().length;
    logger.info("http.request.start", { requestId, method: req.method, url: req.url, actor: requestContext.actor });
    res.on("finish", () => {
      logger.info("http.request.finish", { requestId, method: req.method, url: req.url, statusCode: res.statusCode, durationMs: Date.now() - startedAt });
    });

    try {
      if (req.method === "GET" && req.url?.startsWith("/canvas-lib/")) {
        const name = decodeURIComponent(req.url.slice("/canvas-lib/".length));
        const resolvedFile = canvasLibFiles.get(name);
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

      const mountedRouteTable = mountedRoutesFor(runtime.runner.id);
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
        if (genericEndpoint) {
          const handler = genericHandlers[genericEndpoint.handler];
          if (!activeDispatchHandlers.has(genericEndpoint.handler) || typeof handler !== "function") {
            sendJson(res, 404, { error: "not found" });
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
            appContext: runtime.context
          });
          return;
        }
      }

      if (!matched) {
        sendJson(res, 404, { error: "not found" });
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
        sendJson(res, 404, { error: "not found" });
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

      await handler({
        req,
        res,
        requestId,
        requestUrl,
        route: matched.route,
        params: matched.params,
        requestActor: requestContext.actor,
        requestIdentity: requestContext.identity,
        requestSession: requestContext.session,
        appContext: runtime.context
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("http.request.failed", { requestId, method: req.method, url: req.url, actor: requestContext.actor, durationMs: Date.now() - startedAt, error: err });
      world.observe({
        process: "server.request.failed",
        actor: backendHost,
        claims: [],
        body: { requestId, method: req.method, url: req.url, message, serverRunner: runtime.runner.id }
      });
      sendJson(res, 500, { error: "internal error", requestId });
    } finally {
      const emittedWitnesses = world.allWitnesses().slice(witnessCountBefore);
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
      ...mountedRoutesFor(serverRunner.id).map(route => relation(serverRunner.id, "serves", route.id))
    ],
      body: {
        url,
        serverRunner: serverRunner.id,
      backendHost,
      frontendHost,
      handlerSet: serverRunner.handlerSet ?? null,
        actors: appContext.actors,
        storage,
        routeCount: mountedRoutesFor(serverRunner.id).length,
        runtimePlugins: effectiveRuntimePluginCatalog.activePluginIds
      }
    });

  return {
    ok: true,
    url,
    runtimeBundleSummary: resolvedRuntime,
    runtimePluginCatalog: effectiveRuntimePluginCatalog,
    close: () => {
      clearInterval(sseWatcher);
      for (const client of sseClients) client.end();
      sseClients.clear();
      for (const context of new Set(runtimeContexts.values())) context?.close?.();
      server.closeAllConnections?.();
      return new Promise(resolve => server.close(resolve));
    }
  };
}
