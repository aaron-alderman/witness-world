import { relation } from "./kernel.js";
import {
  widgetDefinitions,
  frontendProgramsProjection
} from "./widgets.js";
import {
  APP_REVISION_EVENTS_PATH,
  APP_SOURCE_WRITE_PATH
} from "./app-snapshot-manager.js";
import { runProcessGraph } from "./process-graph.js";
import { moduleProjectors } from "./modules.js";
import {
  SUPPORTED_BACKEND_OPS,
  activeBackendProgramDefinition
} from "./backend-programs.js";
import { renderInactiveRuntimeWidgetPage } from "./runtime-page-fallbacks.js";
import { normalizePathname, renderSurfaceShellPage } from "./runtime-surface-shell.js";
import { createGuidanceBundleHandlers, guidanceConfigForSession } from "./runtime-guidance.js";

function widgetPageGuidanceSurface(world, {
  route = null,
  rootWidget = null,
  frontendProgramId = null,
  guidancePage = null
} = {}) {
  const witnesses = world.allWitnesses();
  const routeRows = new Map(moduleProjectors.routes(witnesses).map(row => [row.id, row]));
  const widgetRows = new Map(widgetDefinitions(witnesses).map(row => [row.id, row]));
  const programRows = new Map(frontendProgramsProjection(witnesses).map(row => [row.id, row]));
  const routeRow = route?.id ? routeRows.get(route.id) ?? route : route;
  const programRow = frontendProgramId ? programRows.get(frontendProgramId) ?? null : null;
  const widgetRow = rootWidget ? widgetRows.get(rootWidget) ?? null : null;
  return {
    page: typeof guidancePage === "string" && guidancePage.trim() ? guidancePage.trim() : null,
    context: programRow?.context ?? widgetRow?.context ?? routeRow?.context ?? null,
    routeId: routeRow?.id ?? route?.id ?? null,
    rootWidgetId: widgetRow?.id ?? rootWidget ?? null,
    frontendProgramId: programRow?.id ?? frontendProgramId ?? null
  };
}

export function createCoreRuntimeBundleHandlers({
  world,
  backendHost,
  frontendHost,
  send,
  sendJson,
  readJson,
  requestActors,
  requestVisibleWitnesses,
  currentIdentityIndex,
  sessionStore,
  createSessionForIdentity,
  sessionResponseShape,
  sessionCookieHeader,
  clearSessionCookieHeader,
  tutorialProgressFor,
  setTutorialProgress,
  guidanceProgressFor,
  setGuidanceProgress,
  runtimeProfile,
  requestedRuntimeProfile = null,
  currentBackendCapabilities,
  currentFrontendCapabilities,
  handlerSetDefinitions = {},
  buildRuntimeDiagnosticsForProfile,
  getRuntimePluginCatalog,
  getRuntimePluginReviews,
  invokeRouteHandler,
  supportedBackendOps = SUPPORTED_BACKEND_OPS,
  coreHooks = {},
  runtimeContributions = null,
  appSnapshotManager = null,
  currentAppRenderWorld = null
}) {
  const renderWidgetPageHook = coreHooks.renderWidgetPage ?? ((_world, { rootWidget }) => renderInactiveRuntimeWidgetPage({ rootWidget }));
  const projectPagePresentationThemeHook = coreHooks.projectPagePresentationTheme
    ?? coreHooks.projectEdenPageTheme
    ?? (() => null);
  const buildMountedChartRuntimeHook = coreHooks.buildMountedChartRuntime
    ?? (() => null);
  const guidanceConfigForSessionHook = coreHooks.guidanceConfigForSession
    ?? coreHooks.appGuidanceConfigForSession
    ?? coreHooks.appTutorialConfigForSession
    ?? (() => null);
  const guidanceHandlers = createGuidanceBundleHandlers({
    sendJson,
    readJson,
    tutorialProgressFor,
    setTutorialProgress,
    guidanceProgressFor,
    setGuidanceProgress,
    runtimeContributions
  });
  const lowerCaseHeaders = headers => Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [String(key).toLowerCase(), Array.isArray(value) ? value.map(String) : String(value ?? "")])
  );
  const readPath = (value, path) => String(path || "").split(".").filter(Boolean).reduce((current, key) => current == null ? undefined : current[key], value);
  const writePath = (target, path, value) => {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) return;
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index];
      if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[parts.at(-1)] = value;
  };
  const interpolateString = (value, scope) => {
    const text = String(value ?? "");
    const exact = text.match(/^\$\{([A-Za-z0-9_.-]+)\}$/);
    if (exact) return readPath(scope, exact[1]);
    return text.replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_, expression) => {
      const resolved = readPath(scope, expression);
      return resolved == null ? "" : String(resolved);
    });
  };
  const interpolateValue = (value, scope) => {
    if (typeof value === "string") return interpolateString(value, scope);
    if (Array.isArray(value)) return value.map(item => interpolateValue(item, scope));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateValue(item, scope)]));
    return value;
  };
  const backendSessionShape = requestSession => requestSession
    ? {
        authenticated: true,
        actor: requestSession.actor ?? null,
        identity: requestSession.identity ?? null,
        label: requestSession.label ?? null,
        perspective: requestSession.perspective ?? null
      }
    : {
        authenticated: false,
        actor: null,
        identity: null,
        label: null,
        perspective: null
      };
  const devHtmlHeaders = appContext => appContext?.devMode ? { "cache-control": "no-cache" } : {};
  const appRenderWorld = appContext => appContext?.appSnapshotManager?.getActiveSnapshot()?.world
    ?? (typeof currentAppRenderWorld === "function" ? currentAppRenderWorld() : null)
    ?? world;
  const maybeInjectDevClient = (html, appContext) => {
    const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
    if (!snapshotManager || appContext?.devMode !== true) return html;
    return snapshotManager.injectDevClient(html, snapshotManager.getActiveSnapshot());
  };
  const revisionEventFrame = payload => `data: ${JSON.stringify(payload)}\n\n`;
  const executeBackendProgramRoute = async ({
    req,
    res,
    params,
    route,
    requestUrl,
    requestActor,
    requestIdentity,
    requestSession,
    appContext
  }) => {
    const soul = route?.params?.backendProgramSoul ?? null;
    const program = soul ? activeBackendProgramDefinition(world.allWitnesses(), soul) : null;
    if (!program) {
      sendJson(res, 404, { error: "active backend program not configured", backendProgramSoul: soul });
      return;
    }
    const runId = `backend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const state = {
      request: {
        method: req.method || "GET",
        path: requestUrl?.pathname ?? route?.path ?? "/",
        params: { ...(params ?? {}) },
        query: Object.fromEntries(requestUrl?.searchParams?.entries?.() ?? []),
        headers: lowerCaseHeaders(req.headers)
      },
      session: backendSessionShape(requestSession),
      actor: requestActor ?? null,
      identity: requestIdentity ?? null,
      route: {
        id: route?.id ?? null,
        path: route?.path ?? null,
        handler: route?.handler ?? null,
        params: { ...(route?.params ?? {}) }
      },
      event: {}
    };
    const scopeFor = extra => ({ state, event: state.event || {}, ...extra });
    const responseState = { sent: false };
    const recordTrace = (process, body = {}) => world.observe({
      process,
      actor: requestActor || backendHost,
      claims: [],
      body: {
        runId,
        program: program.id,
        event: "request",
        timestamp: Date.now(),
        ...body
      }
    });
    const executeStep = async (step, stateRef, executionScope = {}) => {
      const params = interpolateValue(step.params || {}, scopeFor(executionScope));
      if (step.op === "request.readJson") {
        const into = typeof params.into === "string" && params.into.trim() ? params.into.trim() : "requestBody";
        writePath(stateRef, into, await readJson(req));
        return;
      }
      if (step.op === "state.assign") {
        const into = typeof params.into === "string" && params.into.trim() ? params.into.trim() : "";
        if (!into) throw new Error("state.assign requires into");
        const nextValue = Object.prototype.hasOwnProperty.call(params, "value")
          ? params.value
          : (typeof params.from === "string" ? readPath(stateRef, params.from) : null);
        writePath(stateRef, into, nextValue);
        return;
      }
      if (step.op === "handler.invoke") {
        const handler = typeof params.handler === "string" && params.handler.trim() ? params.handler.trim() : "";
        if (!handler) throw new Error("handler.invoke requires handler");
        const requestPath = typeof params.path === "string" && params.path.trim()
          ? params.path.trim()
          : `/__backend-program/${encodeURIComponent(program.soul)}/${encodeURIComponent(handler)}`;
        const requestBody = Object.prototype.hasOwnProperty.call(params, "body")
          ? params.body
          : (typeof params.from === "string" && params.from.trim() ? readPath(stateRef, params.from.trim()) : null);
        const witnessCountBefore = world.allWitnesses().length;
        const result = await invokeRouteHandler({
          handler,
          method: typeof params.method === "string" && params.method.trim() ? params.method.trim().toUpperCase() : "POST",
          path: requestPath,
          query: params.query && typeof params.query === "object" ? params.query : {},
          params: params.params && typeof params.params === "object" ? params.params : {},
          body: requestBody,
          requestActor,
          requestIdentity,
          requestSession,
          appContext,
          route: {
            id: `${route?.id || "backend-program-route"}:${handler}`,
            path: requestPath,
            handler,
            params: params.params && typeof params.params === "object" ? params.params : {}
          }
        });
        const emittedWitnesses = world.allWitnesses().slice(witnessCountBefore);
        const failedWitnesses = emittedWitnesses.filter(witness => witness.process.endsWith(".failed") || witness.process.endsWith(".blocked"));
        world.observe({
          process: "backend.request.finish",
          actor: requestActor || backendHost,
          claims: [],
          body: {
            requestId: `${runId}:${step.id}:${handler}`,
            method: typeof params.method === "string" && params.method.trim() ? params.method.trim().toUpperCase() : "POST",
            url: requestPath,
            statusCode: result.status || 0,
            route: null,
            handler,
            runId,
            stepId: step.id,
            emittedWitnessIds: emittedWitnesses.map(witness => witness.id),
            failureWitnessIds: failedWitnesses.map(witness => witness.id)
          }
        });
        const into = typeof params.into === "string" && params.into.trim() ? params.into.trim() : "lastResponse";
        writePath(stateRef, into, result.body ?? null);
        if ((result.status || 500) >= 400 && params.allowFailure !== true) {
          throw new Error(result.body?.error || `handler ${handler} failed`);
        }
        return;
      }
      if (step.op === "response.json") {
        const status = Number.isFinite(Number(params.status))
          ? Number(params.status)
          : (typeof params.statusFrom === "string" && params.statusFrom.trim()
              ? Number(readPath(stateRef, params.statusFrom.trim()) ?? 200)
              : 200);
        const body = Object.prototype.hasOwnProperty.call(params, "body")
          ? params.body
          : (typeof params.from === "string" && params.from.trim() ? readPath(stateRef, params.from.trim()) : null);
        responseState.sent = true;
        sendJson(res, status, body ?? {});
        return;
      }
      if (step.op === "response.error") {
        const status = Number.isFinite(Number(params.status))
          ? Number(params.status)
          : (typeof params.statusFrom === "string" && params.statusFrom.trim()
              ? Number(readPath(stateRef, params.statusFrom.trim()) ?? 400)
              : 400);
        const error = typeof params.message === "string" && params.message.trim()
          ? params.message.trim()
          : (typeof params.messageFrom === "string" && params.messageFrom.trim()
              ? String(readPath(stateRef, params.messageFrom.trim()) ?? "backend program error")
              : "backend program error");
        const body = params.body && typeof params.body === "object"
          ? { ...params.body }
          : (typeof params.bodyFrom === "string" && params.bodyFrom.trim()
              ? { ...(readPath(stateRef, params.bodyFrom.trim()) ?? {}) }
              : {});
        responseState.sent = true;
        sendJson(res, status, { error, ...body });
        return;
      }
      if (step.op === "run") {
        const eventName = typeof params.event === "string" && params.event.trim() ? params.event.trim() : "";
        if (!eventName) throw new Error("run requires event");
        await runEvent(eventName, stateRef);
        return;
      }
      throw new Error(`unsupported backend op ${step.op}`);
    };
    const runEvent = async (eventName, stateRef = state) => {
      state.event = { name: eventName };
      const nodes = (program.graph || program.steps || []).filter(step => step.event === eventName);
      if (!nodes.length) return;
      await runProcessGraph(
        nodes,
        eventName,
        async (node, nextState, executionScope) => {
          await executeStep(node, nextState, executionScope);
        },
        stateRef,
        {
          onNodeStart: async node => {
            recordTrace("backend.step.start", { nodeId: node.id || "", op: node.op || "" });
          },
          onNodeSkipped: async node => {
            recordTrace("backend.step.skipped", { nodeId: node.id || "", op: node.op || "" });
          },
          onNodeDone: async node => {
            recordTrace("backend.step.done", { nodeId: node.id || "", op: node.op || "" });
          },
          onNodeFailed: async (node, error) => {
            recordTrace("backend.step.failed", { nodeId: node.id || "", op: node.op || "", message: error instanceof Error ? error.message : String(error) });
          }
        }
      );
    };
    recordTrace("backend.process.start", { actor: requestActor ?? null });
    try {
      await runEvent("request");
      recordTrace("backend.process.done", {});
      if (!responseState.sent) sendJson(res, 500, { error: "backend program produced no response", backendProgramSoul: soul, program: program.id });
    } catch (error) {
      recordTrace("backend.process.failed", { message: error instanceof Error ? error.message : String(error) });
      if (!responseState.sent) sendJson(res, 500, { error: error instanceof Error ? error.message : String(error), backendProgramSoul: soul, program: program.id });
    }
  };
  return {
    ...guidanceHandlers,
    "session.read": async ({ res, requestActor, requestIdentity, requestSession }) => {
      world.observe({
        process: "session.read",
        actor: requestActor || backendHost,
        claims: [],
        body: { authenticated: Boolean(requestSession), identity: requestIdentity || null, actor: requestActor || null }
      });
      if (!requestSession) {
        sendJson(res, 200, { authenticated: false, identity: null, actor: null, label: null, homeContext: null, perspective: null });
        return;
      }
      sendJson(res, 200, sessionResponseShape(requestSession));
    },

    "session.open": async ({ req, res }) => {
      const body = await readJson(req);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const identityIndex = currentIdentityIndex();
      const identity = username ? identityIndex.byUsername[username] ?? null : null;
      if (!identity || identity.password !== password) {
        world.emit({
          process: "session.open.failed",
          actor: backendHost,
          claims: [],
          body: { username, reason: !identity ? "unknown username" : "invalid password" }
        });
        sendJson(res, 401, { error: "invalid credentials" });
        return;
      }
      const session = createSessionForIdentity(identity);
      world.emit({
        process: "session.open",
        actor: identity.actor,
        claims: [
          relation(identity.id, "authenticatedAs", identity.actor),
          ...(identity.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
        ],
        body: {
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          homeContext: identity.homeContext ?? null,
          perspective: identity.homePerspective ?? null
        }
      });
      sendJson(res, 200, sessionResponseShape(session), { "set-cookie": sessionCookieHeader(session.id) });
    },

    "session.logout": async ({ res, requestSession, requestActor }) => {
      if (requestSession?.id) sessionStore.delete(requestSession.id);
      world.emit({
        process: "session.logout",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          identity: requestSession?.identity ?? null,
          actor: requestActor || null,
          perspective: requestSession?.perspective ?? null
        }
      });
      sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookieHeader() });
    },

    "backendProgram.run": async args => {
      await executeBackendProgramRoute(args);
    },

    "page.home": async ({ res, route, appContext, requestSession }) => {
      const params = route.params ?? {};
      const rootWidget = params.rootWidget ?? null;
      if (!rootWidget) {
        sendJson(res, 404, { error: "page not configured", route: route.id });
        return;
      }
      const page = params.page ?? "home";
      const excludeWidgetRoles = Array.isArray(params.excludeWidgetRoles) ? params.excludeWidgetRoles : ["world-graph-body"];
      world.observe({
        process: "frontend.render",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || rootWidget)],
        body: { route: route.path }
      });
      const pageTheme = projectPagePresentationThemeHook(requestVisibleWitnesses(requestSession?.actor || null, appContext), {
        actor: requestSession?.actor || null,
        pageId: rootWidget
      });
        const guidanceSurface = widgetPageGuidanceSurface(world, {
          route,
          rootWidget,
          frontendProgramId: params.frontendProgram ?? null,
          guidancePage: "app"
        });
        const guidance = guidanceConfigForSession({
          requestSession,
          tutorialProgressFor,
          guidanceProgressFor,
          runtimeContributions,
          surface: guidanceSurface
        });
        const compatibilityTutorial = guidance ?? guidanceConfigForSessionHook({
          requestSession,
          tutorialProgressFor,
          guidanceProgressFor,
          surface: guidanceSurface
        });
        send(res, 200, "text/html", renderWidgetPageHook(world, {
          actor: frontendHost,
          rootWidget,
        frontendProgram: params.frontendProgram ?? null,
        appConfig: {
          actors: requestActors(appContext),
          page,
          excludeWidgetRoles,
          pageChrome: pageTheme,
          liveProjection: params.liveProjection !== false,
            runtimeSurfaces: appContext.runtimeSurfaceEntries ?? [],
            surfaceContext: guidanceSurface.context,
            surfaceRouteId: guidanceSurface.routeId,
            surfaceRootWidgetId: guidanceSurface.rootWidgetId,
            surfaceProgramId: guidanceSurface.frontendProgramId,
            guidance,
            tutorial: compatibilityTutorial
          }
        }));
      },

    "page.surface": async ({ res, route, requestUrl, appContext }) => {
      const rootSurfaceId = route?.params?.rootSurface ?? null;
      if (!rootSurfaceId) {
        sendJson(res, 404, { error: "surface page not configured", route: route?.id ?? null });
        return;
      }
      const renderWorld = appRenderWorld(appContext);
      const html = renderSurfaceShellPage(renderWorld, {
        rootSurfaceId,
        requestPathname: normalizePathname(requestUrl?.pathname ?? route?.path ?? "/"),
        route,
        browserRuntimeCapabilities: (appContext?.runtimeContributions?.capabilityDefinitions ?? [])
          .map(definition => typeof definition?.id === "string" ? definition.id : "")
          .filter(Boolean),
        buildMountedChartRuntime: args => buildMountedChartRuntimeHook({
          ...args,
          world: renderWorld
        })
      });
      if (!html) {
        sendJson(res, 404, { error: "surface page not found", rootSurface: rootSurfaceId });
        return;
      }
      world.observe({
        process: "frontend.render",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route?.serves || rootSurfaceId)],
        body: { route: requestUrl?.pathname ?? route?.path ?? "/", rootSurface: rootSurfaceId }
      });
      send(res, 200, "text/html", maybeInjectDevClient(html, appContext), devHtmlHeaders(appContext));
    },

    "app.revision.events": async ({ req, res, appContext }) => {
      const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
      if (!snapshotManager || appContext?.devMode !== true) {
        sendJson(res, 404, { error: "app revision events unavailable" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      res.write(revisionEventFrame(snapshotManager.getLastRevisionEvent()));
      const unsubscribe = snapshotManager.subscribe(event => {
        res.write(revisionEventFrame(event));
      });
      req.on("close", () => {
        unsubscribe();
        try { res.end(); } catch {}
      });
    },

    "app.source.write": async ({ req, res, appContext }) => {
      const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
      if (!snapshotManager) {
        sendJson(res, 404, { error: "app source updates unavailable" });
        return;
      }
      const body = await readJson(req);
      try {
        const result = await snapshotManager.applySourceEdits(body?.edits ?? [], { persist: true, trigger: "post" });
        sendJson(res, 200, {
          ...result,
          endpoint: APP_SOURCE_WRITE_PATH
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },

    "runtime.diagnostics.read": async ({ res, appContext }) => {
      const pluginCatalog = appContext?.runtimePluginCatalog ?? await getRuntimePluginCatalog({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: appContext?.serverRunnerId ?? null
      });
      const operatorState = await appContext?.runtimeOperatorService?.state?.();
      const diagnostics = buildRuntimeDiagnosticsForProfile({
        requestedProfile: appContext?.requestedRuntimeProfile ?? requestedRuntimeProfile ?? runtimeProfile,
        profileName: appContext?.runtimeProfile ?? runtimeProfile,
        additionalBundleIds: appContext?.runtimeAdditionalBundleIds ?? pluginCatalog.addedBundleIds,
        bundleOverrides: appContext?.runtimeBundleOverrides ?? {},
        startupRunner: {
          id: appContext?.serverRunnerId ?? null,
          backendHost,
          frontendHost,
          handlerSet: appContext?.handlerSet ?? null,
          bootstrapOnly: appContext?.bootstrapOnly === true
        },
        startupMode: appContext?.runtimeStartupMode ?? "serve",
        installedHostCapabilities: {
          backend: [...currentBackendCapabilities()],
          frontend: [...currentFrontendCapabilities()]
        },
        handlerSetDefinitions,
        operatorContract: appContext?.runtimeOperatorContract ?? null,
        operatorState,
        pluginCatalogSummary: pluginCatalog.summary,
        authoredPluginIds: pluginCatalog.authoredPluginIds,
        operatorPluginIds: pluginCatalog.operatorPluginIds,
        effectivePluginIds: pluginCatalog.effectivePluginIds,
        configuredPluginIds: pluginCatalog.configuredPluginIds,
        activePluginIds: pluginCatalog.activePluginIds,
        rejectedPlugins: pluginCatalog.rejectedPlugins,
        pluginAddedBundleIds: pluginCatalog.addedBundleIds
      });
      diagnostics.appSnapshot = appContext?.appSnapshotManager?.diagnostics?.() ?? null;
      world.observe({
        process: "runtime.diagnostics.read",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "runtimeDiagnostics")],
        body: {
          requestedProfile: diagnostics.requestedProfile,
          activeProfile: diagnostics.activeProfile,
          bundleCount: diagnostics.activeBundles.length,
          routeCount: diagnostics.routes.length,
          surfaceCount: diagnostics.surfaces.length
        }
      });
      sendJson(res, 200, diagnostics);
    },

    "runtime.plugins.read": async ({ res, appContext }) => {
      const pluginCatalog = appContext?.runtimePluginCatalog ?? await getRuntimePluginCatalog({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: appContext?.serverRunnerId ?? null
      });
      world.observe({
        process: "runtime.plugins.read",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "runtimePlugins")],
        body: {
          activeProfile: pluginCatalog.activeProfile,
          discoveredCount: pluginCatalog.summary.discoveredCount,
          validCount: pluginCatalog.summary.validCount,
          invalidCount: pluginCatalog.summary.invalidCount
        }
      });
      sendJson(res, 200, pluginCatalog);
    },

    "runtime.pluginReviews.read": async ({ res, requestUrl, appContext }) => {
      const serverRunnerId = requestUrl?.searchParams?.get("serverRunner") || "";
      const pluginId = requestUrl?.searchParams?.get("plugin") || "";
      const serverRunner = world.project(moduleProjectors.serverRunners)
        .find(row => row.id === serverRunnerId) ?? null;
      if (!serverRunner) {
        sendJson(res, 404, { error: "server runner not found", serverRunner: serverRunnerId || null });
        return;
      }
      const review = await getRuntimePluginReviews({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId,
        pluginId
      });
      world.observe({
        process: "runtime.pluginReviews.read",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "runtimePluginReviews")],
        body: {
          serverRunner: serverRunnerId,
          plugin: pluginId || null,
          packageCount: review.packages.length,
          authoredPluginCount: review.authoredPluginIds.length
        }
      });
      sendJson(res, 200, review);
    }
  };
}
