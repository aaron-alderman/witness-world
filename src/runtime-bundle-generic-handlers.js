import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { authorityForActor, relation, thing, projectors } from "./kernel.js";
import {
  renderWidgetPage,
  requestWidgetVersionActivation,
  rollbackWidgetVersion,
  widgetDefinitions,
  widgetVersions,
  widgetVersionTransitions,
  widgetVersionActivationHistory,
  frontendProgramsProjection,
  frontendStepsProjection
} from "./widgets.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { processRunProjection, processViewProjection, renderProcessPage } from "./process-view.js";
import { runProcessGraph } from "./process-graph.js";
import { canvasProcessHandlers } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection, edenNeighborhoodProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { renderBootstrapPage } from "./bootstrap-shell.js";
import {
  requestBootstrapIdentityDefine,
  requestBootstrapIdentityUpdate,
  requestBootstrapContextDefine,
  requestBootstrapPerspectiveDefine,
  requestBootstrapContextBindingCreate,
  requestBootstrapContextBindingRemove,
  requestBootstrapContextExportCreate,
  requestBootstrapContextExportRemove,
  requestBootstrapContextImportCreate,
  requestBootstrapContextImportRemove,
  requestBootstrapStewardshipGrant,
  requestBootstrapStewardshipRevoke,
  requestBootstrapProposalCreate,
  requestBootstrapProposalApprove,
  requestBootstrapProposalReject,
  requestBootstrapServerRunnerDefine,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  requestBootstrapCapabilityRemove,
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove,
  requestBootstrapMcpServerDefine,
  requestBootstrapMcpToolInstall,
  requestBootstrapMcpToolRemove,
  requestBootstrapFrontendProgramDefine,
  requestBootstrapFrontendStepDefine,
  requestBootstrapBackendProgramDefine,
  requestBootstrapBackendProgramVersionDefine,
  requestBootstrapBackendStepDefine,
  requestBootstrapBackendProgramVersionActivate,
  requestBootstrapBackendProgramVersionRollback,
  requestWidgetDefine,
  requestWidgetUpdate
} from "./bootstrap-authoring.js";
import { listSupportedMcpTools } from "./mcp.js";
import { moduleProjectors } from "./modules.js";
import {
  SUPPORTED_BACKEND_OPS,
  activeBackendProgramDefinition,
  backendProgramsProjection,
  backendProgramVersionDefinition,
  backendProgramVersionTransitions,
  backendProgramActivationHistory,
  backendProgramVersionsProjection,
  backendStepsProjection
} from "./backend-programs.js";
import { renderEdenPage } from "./eden-page.js";
import { tutorialDefinition, normalizeTutorialProgress } from "./tutorials.js";
import { appTutorialConfigForSession } from "./tutorial-runtime-ui.js";
import {
  projectEdenPersonalBoxItems,
  requestEdenPersonalBoxItemCreate,
  requestEdenPersonalBoxItemDelete,
  requestEdenPersonalBoxItemUpdate
} from "./eden-personal-box.js";
import { projectEdenPageTheme, requestEdenPageThemeSet } from "./eden-page-theme.js";
import { projectEdenAcademyState } from "./eden-academy.js";
import {
  edenOrganizationContextId,
  edenOrganizationContextLabel,
  edenOrganizationProposalBody,
  nextEdenOrganizationProposalId,
  projectEdenOrganizationState
} from "./eden-organization.js";
import {
  requestEdenTheoryAssessmentPass,
  requestEdenTheoryLessonStudy,
  requestEdenTheoryTeachBack
} from "./eden-theory.js";
import { projectEdenCapabilityInstallState } from "./eden-capability-install.js";
import { requestEdenCapabilityInstall } from "./eden-capability-install-request.js";
import {
  projectEdenVersionState,
  requestEdenVersionActivate,
  requestEdenVersionPublish,
  requestEdenVersionRollback
} from "./eden-versions.js";
import {
  ensureTodoTargetAuthority,
  requestTodoCreate,
  requestTodoDelete,
  requestTodoUpdate
} from "./todo-runtime.js";
import { typeModelProjection } from "./type-model.js";

function widgetPageTutorialSurface(world, {
  route = null,
  rootWidget = null,
  frontendProgramId = null,
  tutorialPage = null
} = {}) {
  const witnesses = world.allWitnesses();
  const routeRows = new Map(moduleProjectors.routes(witnesses).map(row => [row.id, row]));
  const widgetRows = new Map(widgetDefinitions(witnesses).map(row => [row.id, row]));
  const programRows = new Map(frontendProgramsProjection(witnesses).map(row => [row.id, row]));
  const routeRow = route?.id ? routeRows.get(route.id) ?? route : route;
  const programRow = frontendProgramId ? programRows.get(frontendProgramId) ?? null : null;
  const widgetRow = rootWidget ? widgetRows.get(rootWidget) ?? null : null;
  return {
    page: typeof tutorialPage === "string" && tutorialPage.trim() ? tutorialPage.trim() : null,
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
  runtimeProfile,
  requestedRuntimeProfile = null,
  currentBackendCapabilities,
  currentFrontendCapabilities,
  handlerSetDefinitions = {},
  buildRuntimeDiagnosticsForProfile,
  getRuntimePluginCatalog,
  getRuntimePluginReviews,
  invokeRouteHandler,
  supportedBackendOps = SUPPORTED_BACKEND_OPS
}) {
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
      const pageTheme = projectEdenPageTheme(requestVisibleWitnesses(requestSession?.actor || null, appContext), {
        actor: requestSession?.actor || null,
        pageId: rootWidget
      });
      const tutorialSurface = widgetPageTutorialSurface(world, {
        route,
        rootWidget,
        frontendProgramId: params.frontendProgram ?? null,
        tutorialPage: "app"
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
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
          surfaceContext: tutorialSurface.context,
          surfaceRouteId: tutorialSurface.routeId,
          surfaceRootWidgetId: tutorialSurface.rootWidgetId,
          surfaceProgramId: tutorialSurface.frontendProgramId,
          tutorial: appTutorialConfigForSession({ requestSession, tutorialProgressFor, surface: tutorialSurface })
        }
      }));
    },

    "runtime.diagnostics.read": async ({ res, appContext }) => {
      const pluginCatalog = await getRuntimePluginCatalog({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: appContext?.serverRunnerId ?? null
      });
      const operatorState = await appContext?.runtimeOperatorService?.state?.();
      const diagnostics = buildRuntimeDiagnosticsForProfile({
        requestedProfile: appContext?.requestedRuntimeProfile ?? requestedRuntimeProfile ?? runtimeProfile,
        profileName: appContext?.runtimeProfile ?? runtimeProfile,
        additionalBundleIds: appContext?.runtimeAdditionalBundleIds ?? pluginCatalog.addedBundleIds,
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
      const pluginCatalog = await getRuntimePluginCatalog({
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

export function createTutorialBundleHandlers({
  sendJson,
  readJson,
  tutorialProgressFor,
  setTutorialProgress
}) {
  return {
    "tutorial.progress.read": async ({ res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      const definition = tutorialDefinition(tutorialId);
      const stored = tutorialProgressFor(requestSession, tutorialId);
      sendJson(res, 200, { tutorialId, progress: definition ? normalizeTutorialProgress(definition, stored) : stored });
    },

    "tutorial.progress.write": async ({ req, res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      if (!requestSession?.id) {
        sendJson(res, 200, { tutorialId, progress: null, localOnly: true });
        return;
      }
      const definition = tutorialDefinition(tutorialId);
      if (!definition) {
        sendJson(res, 404, { error: "tutorial not found", tutorialId });
        return;
      }
      const body = await readJson(req);
      const progress = body && typeof body === "object" ? normalizeTutorialProgress(definition, { tutorialId, ...body }) : null;
      if (progress?.stepId && !definition.steps.some(step => step.id === progress.stepId)) {
        sendJson(res, 400, { error: "unknown tutorial step", tutorialId, stepId: progress.stepId });
        return;
      }
      setTutorialProgress(requestSession, tutorialId, progress);
      sendJson(res, 200, { tutorialId, progress: tutorialProgressFor(requestSession, tutorialId) });
    },

    "tutorial.progress.delete": async ({ res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      if (!requestSession?.id) {
        sendJson(res, 200, { tutorialId, ok: true, localOnly: true });
        return;
      }
      setTutorialProgress(requestSession, tutorialId, null);
      sendJson(res, 200, { tutorialId, ok: true });
    }
  };
}

export function createAuthoringBootstrapReadModels({
  world,
  runtimeProfile,
  runtimeBundleSummary,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedPageHandlers,
  supportedHandlerSets,
  supportedFrontendOps,
  supportedBackendOps,
  backendHosts,
  frontendHosts,
  getRuntimePluginCatalog,
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const runtimePluginAvailabilityRows = ({
    serverRunners = [],
    runtimePluginInstalls = [],
    pluginPackages = []
  }) => {
    const installedIndex = new Set(
      runtimePluginInstalls.map(row => `${row.serverRunner}\u0000${row.plugin}`)
    );
    return serverRunners.flatMap(serverRunner => pluginPackages.map(pluginPackage => {
      const key = `${serverRunner.id}\u0000${pluginPackage.id}`;
      const installed = installedIndex.has(key);
      const dependsOnPlugins = [...(pluginPackage.metadata?.dependsOnPlugins ?? [])];
      const missingDependencies = dependsOnPlugins.filter(pluginId => !installedIndex.has(`${serverRunner.id}\u0000${pluginId}`));
      const reasons = [];
      if (installed) reasons.push("already installed on server runner");
      if (!pluginPackage.validation?.ok) reasons.push(...(pluginPackage.validation?.errors ?? []));
      if (!pluginPackage.execution?.executable) reasons.push("plugin package is metadata-only");
      if (!pluginPackage.compatibility?.compatible) {
        reasons.push(...((pluginPackage.compatibility?.reasons ?? []).map(reason =>
          reason === "runtime-profile-incompatible"
            ? "runtime profile incompatible"
            : reason
        )));
      }
      if (missingDependencies.length) {
        reasons.push(`missing plugin dependencies: ${missingDependencies.join(", ")}`);
      }
      return {
        serverRunner: serverRunner.id,
        plugin: pluginPackage.id,
        displayName: pluginPackage.metadata?.displayName ?? pluginPackage.id,
        version: pluginPackage.metadata?.version ?? null,
        description: pluginPackage.metadata?.description ?? null,
        discoveryPath: pluginPackage.discoveryPath,
        installed,
        executable: pluginPackage.execution?.executable === true,
        compatible: pluginPackage.compatibility?.compatible === true,
        installable: !installed
          && pluginPackage.validation?.ok === true
          && pluginPackage.execution?.executable === true
          && pluginPackage.compatibility?.compatible === true
          && missingDependencies.length === 0,
        reasons,
        dependsOnPlugins,
        missingDependencies,
        validationErrors: [...(pluginPackage.validation?.errors ?? [])],
        compatibilityReasons: [...(pluginPackage.compatibility?.reasons ?? [])],
        executionMode: pluginPackage.execution?.mode ?? null,
        executionReason: pluginPackage.execution?.reason ?? null
      };
    })).sort((left, right) =>
      String(left.serverRunner).localeCompare(String(right.serverRunner))
      || String(left.plugin).localeCompare(String(right.plugin))
    );
  };

  const mcpBootstrapState = ({
    mcpServers = [],
    mcpToolInstalls = [],
    appContext = null
  }) => {
    const supportedToolMap = new Map(
      listSupportedMcpTools().map(tool => [tool.name, tool])
    );
    const activeServerRunner = appContext?.serverRunnerId ?? null;
    const servers = mcpServers.map(server => {
      const tools = mcpToolInstalls
        .filter(row => row.server === server.id)
        .map(row => ({
          ...row,
          definition: supportedToolMap.get(row.tool) ?? null
        }));
      return {
        ...server,
        attachedToActiveRuntime: Boolean(server.serverRunner && activeServerRunner && server.serverRunner === activeServerRunner),
        transportVisibility: {
          stdio: server.transports.includes("stdio"),
          http: server.transports.includes("http")
        },
        httpPath: server.transports.includes("http") ? `/mcp/${encodeURIComponent(server.id)}` : null,
        tools
      };
    });
    return {
      activeServerRunner,
      servers
    };
  };

  const bootstrapState = async (requestActor = null, appContext = null) => {
    const routes = world.project(moduleProjectors.routes);
    const servedRoutes = world.project(moduleProjectors.servedRoutes);
    const serverRunners = world.project(moduleProjectors.serverRunners);
    const contexts = world.project(moduleProjectors.contexts);
    const contextBindings = world.project(moduleProjectors.contextBindings);
    const contextExports = world.project(moduleProjectors.contextExports);
    const contextImports = world.project(moduleProjectors.contextImports);
    const contextScopes = world.project(moduleProjectors.contextScopes);
    const perspectives = world.project(moduleProjectors.perspectives);
    const stewardships = world.project(moduleProjectors.stewardships);
    const proposals = world.project(moduleProjectors.proposals);
    const capabilities = world.project(moduleProjectors.capabilities);
    const capabilityCatalog = world.project(moduleProjectors.capabilityCatalog);
    const capabilityInstalls = world.project(moduleProjectors.capabilityInstalls);
    const runtimePluginInstalls = world.project(moduleProjectors.runtimePluginInstalls);
    const mcpServers = world.project(moduleProjectors.mcpServers);
    const mcpToolInstalls = world.project(moduleProjectors.mcpToolInstalls);
    const identities = world.project(moduleProjectors.identities);
    const widgets = widgetDefinitions(world.allWitnesses());
    const widgetVersionRows = widgetVersions(world.allWitnesses());
    const widgetTransitions = widgetVersionTransitions(world.allWitnesses());
    const widgetActivationHistoryRows = [...widgetVersionActivationHistory(world.allWitnesses()).values()].flat();
    const frontendPrograms = frontendProgramsProjection(world.allWitnesses());
    const frontendSteps = frontendStepsProjection(world.allWitnesses());
    const backendPrograms = backendProgramsProjection(world.allWitnesses());
    const backendProgramVersions = backendProgramVersionsProjection(world.allWitnesses());
    const backendProgramTransitions = backendProgramVersionTransitions(world.allWitnesses());
    const backendProgramActivationRows = [...backendProgramActivationHistory(world.allWitnesses()).values()].flat();
    const backendSteps = backendStepsProjection(world.allWitnesses());
    const pluginCatalog = await getRuntimePluginCatalog({
      activeProfile: runtimeProfile,
      serverRunnerId: null,
      configuredPluginIds: [],
      authoredPluginIds: []
    });
    const capabilityPluginSources = buildPluginCapabilitySourceIndex({
      capabilityCatalog,
      pluginPackages: pluginCatalog.packages
    });
    const runtimePluginAvailability = runtimePluginAvailabilityRows({
      serverRunners,
      runtimePluginInstalls,
      pluginPackages: pluginCatalog.packages
    });
    const operator = await getRuntimeOperatorState(appContext);
    return {
      contexts,
      contextBindings,
      contextExports,
      contextImports,
      contextScopes,
      perspectives,
      stewardships,
      authority: authorityForActor(world, requestActor),
      proposals,
      capabilities,
      capabilityCatalog: capabilityPluginSources.capabilityCatalog,
      capabilityPackageSources: capabilityPluginSources.capabilityPackageSources,
      capabilityInstalls,
      runtimePluginInstalls,
      runtimePluginAvailability,
      pluginCatalog,
      operator,
      mcp: mcpBootstrapState({ mcpServers, mcpToolInstalls, appContext }),
      mcpServers,
      mcpToolInstalls,
      identities,
      widgets,
      widgetVersions: widgetVersionRows,
      widgetVersionTransitions: widgetTransitions,
      widgetVersionActivationHistory: widgetActivationHistoryRows,
      frontendPrograms,
      frontendSteps,
      backendPrograms,
      backendProgramVersions,
      backendProgramTransitions,
      backendProgramActivationHistory: backendProgramActivationRows,
      backendSteps,
      routes,
      servedRoutes,
      serverRunners
    };
  };

  const bootstrapModel = async () => {
    const authored = await bootstrapState();
    const homeRoute = authored.servedRoutes.find(route => route.method === "GET" && route.path === "/" && route.handler === "page.home");
    const appReady = Boolean(homeRoute && homeRoute.params?.rootWidget);
    const typeModel = world.project(typeModelProjection);
    const pageRoutes = (authored.routes || []).filter(route => {
      if (!String(route.handler || "").startsWith("page.")) return false;
      const rootWidget = route.params?.rootWidget ?? null;
      const widget = (authored.widgets || []).find(row => row.id === rootWidget);
      return widget?.kind === "Page";
    });
    return {
      appReady,
      homeReason: appReady ? "reachable home route" : "no reachable app home route",
      widgetKinds: ["Page", "Box", "Section", "Heading", "Text", "Form", "Input", "Select", "Option", "Button", "Link", "List", "ValueEditor"],
      supportedMethods: ["GET", "POST", "PATCH", "DELETE"],
      supportedHandlers,
      supportedHandlerMetadata,
      supportedPageHandlers,
      supportedHandlerSets,
      supportedFrontendOps,
      supportedBackendOps,
      supportedMcpTransports: ["stdio", "http"],
      supportedMcpActingModes: ["delegated", "service"],
      supportedMcpTools: listSupportedMcpTools(),
      runtimeProfile,
      runtimeBundles: runtimeBundleSummary?.bundles ?? [],
      runtimeRoutes: runtimeBundleSummary?.routes ?? [],
      runtimeSurfaces: runtimeBundleSummary?.surfaces ?? [],
      providedRuntimeCapabilities: runtimeBundleSummary?.capabilities ?? [],
      backendHosts: backendHosts.map(id => ({ id })),
      frontendHosts: frontendHosts.map(id => ({ id })),
      pluginExecutionMode: "bundle-bridge",
      processSpecs: Object.values(typeModel.processSpecsByProcess ?? {}),
      capabilityTargetKinds: ["context", "serverRunner", "routePage"],
      stewardshipTargetKinds: ["context", "perspective"],
      capabilityTargets: {
        contexts: authored.contexts || [],
        serverRunners: authored.serverRunners || [],
        routePages: pageRoutes
      },
      contextBindableTargets: [
        ...(authored.identities || []),
        ...(authored.contexts || []),
        ...(authored.perspectives || []),
        ...(authored.widgets || []),
        ...(authored.frontendPrograms || []),
        ...(authored.backendPrograms || []),
        ...(authored.backendProgramVersions || []),
        ...(authored.routes || []),
        ...(authored.serverRunners || []),
        ...(authored.mcpServers || []),
        ...(authored.capabilities || [])
      ],
      attachableContexts: authored.contexts || [],
      proposalTargetProcesses: [
        "identity.update",
        "todo.create",
        "todo.update",
        "todo.delete",
        "canvas.place",
        "canvas.move",
        "canvas.moveMany",
        "canvas.style",
        "canvas.remove",
        "canvas.removeMany",
        "canvas.duplicate",
        "canvas.camera",
        "canvas.grid",
        "canvas.batch",
        "canvas.createThing",
        "canvas.perspective.create",
        "canvas.thing.setTitle",
        "canvas.relate",
        "canvas.unrelate",
        "asset.attach",
        "asset.detach",
        "context.define",
        "context.bind",
        "context.unbind",
        "context.export",
        "context.unexport",
        "context.import",
        "context.unimport",
        "perspective.define",
        "stewardship.grant",
        "stewardship.revoke",
        "widget.define",
        "widget.update",
        "widgetVersion.activate",
        "widgetVersion.rollback",
        "edenVersions.publish",
        "frontendProgram.define",
        "frontendStep.define",
        "backendProgram.define",
        "backendProgramVersion.define",
        "backendStep.define",
        "backendProgramVersion.activate",
        "backendProgramVersion.rollback",
        "route.define",
        "serve.define",
        "serverRunner.define",
        "mcpServer.define",
        "capability.define",
        "capability.install",
        "capability.remove",
        "runtimePlugin.install",
        "runtimePlugin.remove",
        "mcpTool.install",
        "mcpTool.remove"
      ]
    };
  };

  return {
    getBootstrapModel: bootstrapModel,
    getBootstrapState: bootstrapState
  };
}

export function executeEdenVersionPublishProposal({
  world,
  actor,
  backendHost,
  proposal,
  body,
  ensureTargetAuthority
}) {
  const soul = body.soul || proposal.targetId || "";
  const gate = ensureTargetAuthority(actor, soul);
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
  const result = requestEdenVersionPublish(world, {
    actor,
    backendHost,
    surfaceId: body.surfaceId ?? "eden.surface.versions",
    soul,
    publishedVersion: body.publishedVersion ?? null,
    draftVersion: body.draftVersion ?? null,
    body
  });
  return result.ok
    ? { ok: true, witnessIds: [result.witness.id].filter(Boolean) }
    : { ok: false, status: result.status || 400, error: result.error || "eden version publish failed", witness: result.witness };
}

export function createAuthoringProposalExecutor({
  world,
  backendHost,
  supportedHandlerSets,
  supportedHandlers,
  supportedFrontendOps,
  supportedBackendOps,
  ensureIdentityAuthority,
  ensureTargetAuthority,
  ensureContextAuthority,
  mcpToolNames,
  getRuntimePluginCatalog
}) {
  const canvasProposalResult = witness => {
    if (witness?.process?.endsWith(".failed") || witness?.process?.endsWith(".blocked")) {
      return {
        ok: false,
        status: Number.isInteger(witness.body?.status) ? witness.body.status : 400,
        error: witness.body?.reason || "canvas proposal execution failed",
        witness
      };
    }
    return { ok: true, witnessIds: [witness.id].filter(Boolean) };
  };
  const runContextCanvasProposal = (actor, process, body) => {
    const gate = body.context ? ensureContextAuthority(actor, body.context) : { ok: true };
    if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
    return canvasProposalResult(canvasProcessHandlers[process](world, { actor, ...body }));
  };
  return actor => async proposal => {
    const body = proposal.body ?? {};
    switch (proposal.targetProcess) {
      case "identity.update": {
        const gate = ensureIdentityAuthority(actor, body.id || proposal.targetId || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapIdentityUpdate(world, {
          actor,
          backendHost,
          body: { ...body, id: body.id || proposal.targetId || "" }
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "todo.create": {
        const gate = ensureContextAuthority(actor, proposal.targetId || body.context || "frontend");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestTodoCreate(world, {
          actor,
          backendHost,
          body
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "todo.update": {
        const gate = ensureTodoTargetAuthority(world, actor, body.id || proposal.targetId || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestTodoUpdate(world, {
          actor,
          backendHost,
          body: { ...body, id: body.id || proposal.targetId || "" }
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "todo.delete": {
        const gate = ensureTodoTargetAuthority(world, actor, body.id || proposal.targetId || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestTodoDelete(world, {
          actor,
          backendHost,
          body: { ...body, id: body.id || proposal.targetId || "" }
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "canvas.place":
      case "canvas.move":
      case "canvas.moveMany":
      case "canvas.style":
      case "canvas.remove":
      case "canvas.removeMany":
      case "canvas.duplicate":
      case "canvas.camera":
      case "canvas.grid":
      case "canvas.batch":
      case "canvas.createThing":
      case "canvas.perspective.create":
        return runContextCanvasProposal(actor, proposal.targetProcess, body);
      case "canvas.thing.setTitle": {
        const thingId = body.thing || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, thingId);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        return canvasProposalResult(canvasProcessHandlers["canvas.thing.setTitle"](world, { actor, ...body, thing: thingId }));
      }
      case "canvas.relate": {
        const from = body.from || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, from);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        return canvasProposalResult(canvasProcessHandlers["canvas.relate"](world, { actor, ...body, from }));
      }
      case "canvas.unrelate": {
        const from = body.from || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, from);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        return canvasProposalResult(canvasProcessHandlers["canvas.unrelate"](world, { actor, ...body, from }));
      }
      case "asset.attach": {
        const assetId = body.asset || proposal.targetId || "";
        const targetId = body.target || "";
        const assetGate = ensureTargetAuthority(actor, assetId);
        if (!assetGate.ok) return { ok: false, status: assetGate.status, error: assetGate.reason };
        const targetGate = ensureTargetAuthority(actor, targetId);
        if (!targetGate.ok) return { ok: false, status: targetGate.status, error: targetGate.reason };
        return canvasProposalResult(canvasProcessHandlers["asset.attach"](world, { actor, ...body, asset: assetId, target: targetId }));
      }
      case "asset.detach": {
        const assetId = body.asset || proposal.targetId || "";
        const targetId = body.target || "";
        const assetGate = ensureTargetAuthority(actor, assetId);
        if (!assetGate.ok) return { ok: false, status: assetGate.status, error: assetGate.reason };
        const targetGate = ensureTargetAuthority(actor, targetId);
        if (!targetGate.ok) return { ok: false, status: targetGate.status, error: targetGate.reason };
        return canvasProposalResult(canvasProcessHandlers["asset.detach"](world, { actor, ...body, asset: assetId, target: targetId }));
      }
      case "context.define": {
        const gate = body.parent ? ensureTargetAuthority(actor, body.parent) : { ok: true };
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.bind": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextBindingCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unbind": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextBindingRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.export": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextExportCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unexport": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextExportRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.import": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextImportCreate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "context.unimport": {
        const gate = ensureContextAuthority(actor, body.context);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapContextImportRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "perspective.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapPerspectiveDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "stewardship.grant": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapStewardshipGrant(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "stewardship.revoke": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapStewardshipRevoke(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widget.define": {
        const gate = body.context ? ensureContextAuthority(actor, body.context) : (body.parent ? ensureTargetAuthority(actor, body.parent) : { ok: true });
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widget.update": {
        const gate = ensureTargetAuthority(actor, body.id || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetUpdate(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "widgetVersion.activate": {
        const soul = body.soul || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestWidgetVersionActivation(world, {
          actor,
          soul,
          version: body.version ?? null
        });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || []).map(entry => entry.id).filter(Boolean) }
          : { ok: false, status: result.status === "failed" ? 400 : 409, error: result.witness.body?.reason || "widget version activation failed", witness: result.witness };
      }
      case "widgetVersion.rollback": {
        const soul = body.soul || proposal.targetId || "";
        const gate = ensureTargetAuthority(actor, soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = rollbackWidgetVersion(world, { actor, soul });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || []).map(entry => entry.id).filter(Boolean) }
          : { ok: false, status: 409, error: result.witness.body?.reason || "widget version rollback failed", witness: result.witness };
      }
      case "edenVersions.publish": {
        return executeEdenVersionPublishProposal({
          world,
          actor,
          backendHost,
          proposal,
          body,
          ensureTargetAuthority
        });
      }
      case "frontendProgram.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapFrontendProgramDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "frontendStep.define": {
        const gate = ensureTargetAuthority(actor, body.program);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapFrontendStepDefine(world, { actor, backendHost, body, allowedOps: supportedFrontendOps });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendProgram.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendProgramVersion.define": {
        const gate = ensureTargetAuthority(actor, body.soul);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramVersionDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendStep.define": {
        const gate = ensureTargetAuthority(actor, body.version);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendStepDefine(world, { actor, backendHost, body, allowedOps: supportedBackendOps });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "backendProgramVersion.activate": {
        const gate = ensureTargetAuthority(actor, body.soul || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramVersionActivate(world, { actor, backendHost, body });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
          : result;
      }
      case "backendProgramVersion.rollback": {
        const gate = ensureTargetAuthority(actor, body.soul || "");
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapBackendProgramVersionRollback(world, { actor, backendHost, body });
        return result.ok
          ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
          : result;
      }
      case "route.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapRouteDefine(world, { actor, backendHost, body, allowedHandlers: supportedHandlers, handlerMetadataById: supportedHandlerMetadata });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "serve.define": {
        const gate = body.serverRunner
          ? ensureTargetAuthority(actor, body.serverRunner)
          : ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapServeDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "serverRunner.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapServerRunnerDefine(world, { actor, backendHost, body, allowedHandlerSets: supportedHandlerSets });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpServer.define": {
        const gate = body.serverRunner
          ? ensureTargetAuthority(actor, body.serverRunner)
          : ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpServerDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.define": {
        const gate = ensureContextAuthority(actor, body.context ?? null);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityDefine(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.install": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityInstall(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "capability.remove": {
        const gate = ensureTargetAuthority(actor, body.target);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapCapabilityRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "runtimePlugin.install": {
        const gate = ensureTargetAuthority(actor, body.serverRunner);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const pluginCatalog = await getRuntimePluginCatalog({
          activeProfile: body.runtimeProfile ?? null,
          serverRunnerId: body.serverRunner ?? null
        });
        const result = requestBootstrapRuntimePluginInstall(world, {
          actor,
          backendHost,
          body,
          pluginCatalog
        });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "runtimePlugin.remove": {
        const gate = ensureTargetAuthority(actor, body.serverRunner);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapRuntimePluginRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpTool.install": {
        const gate = ensureTargetAuthority(actor, body.server);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpToolInstall(world, { actor, backendHost, body, allowedTools: mcpToolNames() });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      case "mcpTool.remove": {
        const gate = ensureTargetAuthority(actor, body.server);
        if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        const result = requestBootstrapMcpToolRemove(world, { actor, backendHost, body });
        return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
      }
      default:
        return { ok: false, status: 400, error: "proposal target process not supported" };
    }
  };
}

export function createAuthoringBundleHandlers({
  world,
  backendHost,
  runtimeProfile,
  runtimeBundleSummary,
  readJson,
  authoringServices,
  sendGateFailure,
  syncSessionIdentity,
  sessionResponseShape,
  supportedPageHandlers,
  supportedHandlerSets,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedFrontendOps,
  supportedBackendOps,
  backendHosts,
  frontendHosts,
  mcpToolNames,
  send,
  sendJson,
  getRuntimePluginCatalog,
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const {
    requireBootstrapActor,
    ensureIdentityAuthority,
    ensureTargetAuthority,
    ensureContextAuthority,
    executeBootstrapProposal
  } = authoringServices;
  const { getBootstrapModel, getBootstrapState } = createAuthoringBootstrapReadModels({
    world,
    runtimeProfile,
    runtimeBundleSummary,
    supportedHandlers,
    supportedHandlerMetadata,
    supportedPageHandlers,
    supportedHandlerSets,
    supportedFrontendOps,
    supportedBackendOps,
    backendHosts,
    frontendHosts,
    getRuntimePluginCatalog,
    buildPluginCapabilitySourceIndex,
    getRuntimeOperatorState
  });
  const sendOperatorError = (res, error) => {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    sendJson(res, status, {
      error: error instanceof Error ? error.message : String(error),
      ...(error?.details ? { details: error.details } : {}),
      ...(error?.summary ? { artifact: error.summary } : {})
    });
  };
  return {
    "bootstrap.model.read": async ({ res }) => {
      sendJson(res, 200, await getBootstrapModel());
    },

    "bootstrap.state.read": async ({ res, requestActor, appContext }) => {
      sendJson(res, 200, await getBootstrapState(requestActor, appContext));
    },

    "bootstrap.page": async ({ res }) => {
      send(res, 200, "text/html; charset=utf-8", renderBootstrapPage());
    },

    "operator.state.read": async ({ res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      sendJson(res, 200, await getRuntimeOperatorState(appContext));
    },

    "operator.backup": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const artifact = await appContext?.runtimeOperatorService?.backup?.({
          label: body?.label ?? "",
          includeDerived: body?.includeDerived === true,
          actor: gate.actor
        });
        sendJson(res, 201, { artifact, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

    "operator.export": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const artifact = await appContext?.runtimeOperatorService?.exportWorld?.({
          label: body?.label ?? "",
          actor: gate.actor
        });
        sendJson(res, 201, { artifact, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

    "operator.restore": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const result = await appContext?.runtimeOperatorService?.restore?.({
          artifactId: body?.artifactId ?? "",
          preserveCurrent: body?.preserveCurrent === true,
          actor: gate.actor
        });
        sendJson(res, 200, { ...result, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

    "operator.import": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const result = await appContext?.runtimeOperatorService?.importWorld?.({
          artifactId: body?.artifactId ?? "",
          preserveCurrent: body?.preserveCurrent === true,
          actor: gate.actor
        });
        sendJson(res, 200, { ...result, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

    "identity.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { identity: result.identity, witness: result.witness });
    },

    "identity.update": async ({ req, res, requestActor, requestSession, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const identityId = typeof params?.id === "string" ? params.id : "";
      const auth = ensureIdentityAuthority(gate.actor, identityId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityUpdate(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, id: identityId }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      const nextSession = syncSessionIdentity(requestSession, result.identity);
      sendJson(res, result.status, {
        identity: result.identity,
        witness: result.witness,
        ...(nextSession ? { session: sessionResponseShape(nextSession) } : {})
      });
    },

    "context.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.parent ? ensureTargetAuthority(gate.actor, body.parent) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { context: result.context, witness: result.witness });
    },

    "perspective.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapPerspectiveDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { perspective: result.perspective, witness: result.witness });
    },

    "contextBinding.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextBinding.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextExport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextExport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextImport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "contextImport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "stewardship.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipGrant(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "stewardship.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipRevoke(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "proposal.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapProposalCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.approve": async ({ res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        executeTarget: executeBootstrapProposal(gate.actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.reject": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapProposalReject(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        reason: typeof body.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "capability.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capability: result.capability, witness: result.witness });
    },

    "capability.install": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityInstall(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    },

    "capability.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapCapabilityRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    },

    "runtimePlugin.install": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.serverRunner);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const pluginCatalog = await getRuntimePluginCatalog({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: body.serverRunner ?? null
      });
      const result = requestBootstrapRuntimePluginInstall(world, {
        actor: gate.actor,
        backendHost,
        body,
        pluginCatalog
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { runtimePluginInstall: result.runtimePluginInstall, witness: result.witness });
    },

    "runtimePlugin.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.serverRunner);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapRuntimePluginRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { runtimePluginInstall: result.runtimePluginInstall, witness: result.witness });
    },

    "serverRunner.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapServerRunnerDefine(world, { actor: gate.actor, backendHost, body, allowedHandlerSets: supportedHandlerSets });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { serverRunner: result.serverRunner, witness: result.witness });
    },

    "mcpServer.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.serverRunner
        ? ensureTargetAuthority(gate.actor, body.serverRunner)
        : ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpServerDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpServer: result.mcpServer, witness: result.witness });
    },

    "mcpTool.install": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.server);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolInstall(world, { actor: gate.actor, backendHost, body, allowedTools: mcpToolNames() });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
    },

    "mcpTool.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.server);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
    },

    "route.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapRouteDefine(world, { actor: gate.actor, backendHost, body, allowedHandlers: supportedHandlers, handlerMetadataById: supportedHandlerMetadata });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { route: result.route, witness: result.witness });
    },

    "serve.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.serverRunner
        ? ensureTargetAuthority(gate.actor, body.serverRunner)
        : ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapServeDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { serve: result.serve, witness: result.witness });
    },

    "frontendProgram.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapFrontendProgramDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { frontendProgram: result.frontendProgram, witness: result.witness });
    },

    "frontendStep.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.program);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapFrontendStepDefine(world, { actor: gate.actor, backendHost, body, allowedOps: supportedFrontendOps });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { step: result.step, witness: result.witness });
    },

    "backendProgram.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendProgramDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgram: result.backendProgram, witness: result.witness });
    },

    "backendProgramVersion.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.soul);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendProgramVersionDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
    },

    "backendStep.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.version);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendStepDefine(world, { actor: gate.actor, backendHost, body, allowedOps: supportedBackendOps });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { step: result.step, witness: result.witness });
    },

    "backendProgramVersions.activate": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const soul = params?.soul || body.soul || "";
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendProgramVersionActivate(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        ok: true,
        status: result.activationStatus,
        backendProgramVersion: result.backendProgramVersion,
        witness: result.witness
      });
    },

    "backendProgramVersions.rollback": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = req ? await readJson(req) : {};
      const soul = params?.soul || body.soul || "";
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendProgramVersionRollback(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, {
        ok: true,
        status: result.rollbackStatus,
        backendProgramVersion: result.backendProgramVersion,
        witness: result.witness
      });
    },

    "widgets.create": async ({ req, res, requestActor, route }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.context ? ensureContextAuthority(gate.actor, body.context) : (body.parent ? ensureTargetAuthority(gate.actor, body.parent) : { ok: true });
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetDefine(world, {
        actor: gate.actor,
        backendHost,
        body,
        defaultParent: route?.params?.rootWidget ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    },

    "widgets.update": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const widgetId = params.id || "";
      const auth = ensureTargetAuthority(gate.actor, widgetId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestWidgetUpdate(world, {
        actor: gate.actor,
        backendHost,
        body: { ...(body || {}), id: widgetId }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    }
  };
}

export function createPracticalBackendOauthHandlers({
  world,
  backendHost,
  readJson,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  randomUUID,
  normalizeAuthOAuthConfig,
  authOAuthFlowId,
  authOAuthCallbackBaseUrl,
  normalizeAuthOAuthProfile,
  emitAuthOauthFlow,
  currentOauthLinkByProviderAccount,
  emitAuthOauthLink,
  emitAuthOauthSession,
  currentOauthLinkForRunner,
  authOAuthReadShape,
  authOAuthLinkTitle,
  currentIdentityIndex,
  sanitizeAuthOauthSegment,
  createIdentity,
  createSessionForIdentity,
  sessionResponseShape,
  sessionCookieHeader,
  oauthLinksForRunner,
  authorityServices
}) {
  const { ensureTargetAuthority } = authorityServices;
  return {
    "auth.oauth.start": async ({ req, res, requestSession, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const body = await readJson(req);
      const requestedProvider = typeof body?.provider === "string" ? body.provider.trim() : "";
      const resolvedConfig = normalizeAuthOAuthConfig({ runtimeConfig: appContext?.runtimeConfig ?? {}, requestedProvider });
      if (!resolvedConfig.ok) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: resolvedConfig.reason } });
        sendJson(res, resolvedConfig.status || 503, { error: resolvedConfig.reason });
        return;
      }
      const action = typeof body?.action === "string" && body.action.trim()
        ? body.action.trim()
        : (requestSession ? "link" : "login");
      if (!["login", "link"].includes(action)) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: "auth.oauth action must be login or link", provider: resolvedConfig.provider } });
        sendJson(res, 400, { error: "auth.oauth action must be login or link" });
        return;
      }
      if (action === "link" && !requestSession) {
        world.emit({ process: "auth.oauth.start.failed", actor: backendHost, claims: [], body: { reason: "sign in first to link an oauth account", provider: resolvedConfig.provider } });
        sendJson(res, 401, { error: "sign in first to link an oauth account" });
        return;
      }

      const flow = {
        id: authOAuthFlowId(),
        serverRunner: appContext?.serverRunnerId || "",
        provider: resolvedConfig.provider,
        state: randomUUID(),
        action,
        requestedIdentity: requestSession?.identity ?? null,
        callbackUrl: `${authOAuthCallbackBaseUrl(req, appContext)}/${encodeURIComponent(resolvedConfig.provider)}`,
        authorizeUrl: null,
        profile: normalizeAuthOAuthProfile(body?.profile)
      };
      flow.authorizeUrl = `${flow.callbackUrl}?state=${encodeURIComponent(flow.state)}&code=stub-success`;
      appContext.authOAuth?.pendingFlows?.set?.(flow.state, flow);
      emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.start" });
      sendJson(res, 200, {
        flow: {
          id: flow.id,
          provider: flow.provider,
          action: flow.action,
          state: flow.state,
          callbackUrl: flow.callbackUrl,
          authorizeUrl: flow.authorizeUrl
        }
      });
    },

    "auth.oauth.callback": async ({ req, res, params, requestSession, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const provider = params.provider || "";
      const state = requestUrl.searchParams.get("state") || "";
      const code = requestUrl.searchParams.get("code") || "";
      const pendingFlows = appContext?.authOAuth?.pendingFlows;
      const flow = pendingFlows?.get?.(state) ?? null;
      if (!capabilityGate.ok) {
        world.emit({ process: "auth.oauth.callback.failed", actor: requestSession?.actor || backendHost, claims: [], body: { id: flow?.id ?? null, provider, state, reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!flow || flow.provider !== provider) {
        world.emit({ process: "auth.oauth.callback.failed", actor: requestSession?.actor || backendHost, claims: [], body: { provider, state, reason: "unknown oauth flow state" } });
        sendJson(res, 400, { error: "unknown oauth flow state" });
        return;
      }
      pendingFlows.delete(state);

      const resolvedConfig = normalizeAuthOAuthConfig({ runtimeConfig: appContext?.runtimeConfig ?? {}, requestedProvider: provider });
      if (!resolvedConfig.ok) {
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason: resolvedConfig.reason });
        sendJson(res, resolvedConfig.status || 503, { error: resolvedConfig.reason });
        return;
      }
      if (requestUrl.searchParams.get("error")) {
        const reason = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error") || "oauth provider returned an error";
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason });
        sendJson(res, 400, { error: reason });
        return;
      }
      if (code === "stub-fail") {
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason: "stub oauth code rejected" });
        sendJson(res, 401, { error: "stub oauth code rejected" });
        return;
      }

      const profile = normalizeAuthOAuthProfile(flow.profile);
      emitAuthOauthFlow({
        actor: requestSession?.actor || backendHost,
        flow,
        process: "auth.oauth.callback",
        providerAccountId: profile.externalId
      });

      const existingLink = currentOauthLinkByProviderAccount(flow.serverRunner, flow.provider, profile.externalId);
      if (flow.action === "link") {
        if (!requestSession) {
          emitAuthOauthFlow({ actor: backendHost, flow, process: "auth.oauth.link.failed", reason: "sign in first to link an oauth account", providerAccountId: profile.externalId });
          sendJson(res, 401, { error: "sign in first to link an oauth account" });
          return;
        }
        if (existingLink && existingLink.identity && existingLink.identity !== requestSession.identity) {
          emitAuthOauthLink({
            actor: requestSession.actor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth account already linked to another identity"
          });
          sendJson(res, 409, { error: "oauth account already linked to another identity" });
          return;
        }
        const identity = currentIdentityIndex().byId[requestSession.identity] ?? null;
        if (!identity) {
          emitAuthOauthLink({
            actor: requestSession.actor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "signed-in identity not found"
          });
          sendJson(res, 409, { error: "signed-in identity not found" });
          return;
        }
        const linkId = emitAuthOauthLink({ actor: requestSession.actor, flow, identity, profile, createdIdentity: false });
        emitAuthOauthSession({ actor: requestSession.actor, flow, identity, session: requestSession, createdIdentity: false });
        sendJson(res, 200, {
          linked: true,
          createdIdentity: false,
          link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId) ?? {
            id: linkId,
            title: authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity.label }),
            serverRunner: flow.serverRunner,
            provider: flow.provider,
            providerAccountId: profile.externalId,
            identity: identity.id,
            actor: identity.actor,
            label: identity.label,
            status: "linked",
            createdIdentity: false,
            lastError: null
          }),
          session: sessionResponseShape(requestSession)
        });
        return;
      }

      let identity = existingLink?.identity ? currentIdentityIndex().byId[existingLink.identity] ?? null : null;
      let createdIdentity = false;
      if (!identity) {
        if (!resolvedConfig.autoCreate) {
          emitAuthOauthLink({
            actor: backendHost,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth identity is not linked and auto-create is disabled"
          });
          sendJson(res, 409, { error: "oauth identity is not linked and auto-create is disabled" });
          return;
        }
        const identityId = `identity.oauth.${flow.provider}.${sanitizeAuthOauthSegment(profile.externalId)}`;
        const identityIndex = currentIdentityIndex();
        if (identityIndex.byId[identityId] || identityIndex.byUsername[profile.username] || (identityIndex.byActor[profile.actor] ?? []).length) {
          emitAuthOauthLink({
            actor: backendHost,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth-created identity would collide with an existing identity"
          });
          sendJson(res, 409, { error: "oauth-created identity would collide with an existing identity" });
          return;
        }
        createIdentity(world, {
          actor: backendHost,
          id: identityId,
          identityActor: profile.actor,
          label: profile.label,
          username: profile.username,
          password: randomUUID()
        });
        identity = currentIdentityIndex().byId[identityId] ?? null;
        createdIdentity = true;
      }
      if (!identity) {
        emitAuthOauthFlow({ actor: backendHost, flow, process: "auth.oauth.session.failed", reason: "oauth identity resolution failed", providerAccountId: profile.externalId });
        sendJson(res, 500, { error: "oauth identity resolution failed" });
        return;
      }
      const linkId = emitAuthOauthLink({ actor: backendHost, flow, identity, profile, createdIdentity });
      const session = createSessionForIdentity(identity);
      emitAuthOauthSession({ actor: identity.actor, flow, identity, session, createdIdentity });
      sendJson(res, 200, {
        linked: true,
        createdIdentity,
        identity: {
          id: identity.id,
          actor: identity.actor,
          label: identity.label,
          username: identity.username,
          homeContext: identity.homeContext ?? null,
          homePerspective: identity.homePerspective ?? null
        },
        link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId) ?? {
          id: linkId,
          title: authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity.label }),
          serverRunner: flow.serverRunner,
          provider: flow.provider,
          providerAccountId: profile.externalId,
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          status: "linked",
          createdIdentity,
          lastError: null
        }),
        session: sessionResponseShape(session)
      }, { "set-cookie": sessionCookieHeader(session.id) });
    },

    "auth.oauth.links.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = ensureTargetAuthority(requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const links = oauthLinksForRunner(serverRunnerId).map(authOAuthReadShape);
      world.observe({ process: "auth.oauth.links.list", actor: requestActor, claims: [relation(requestActor, "read", "auth.oauth.links")], body: { serverRunner: serverRunnerId, count: links.length } });
      sendJson(res, 200, { links });
    },

    "auth.oauth.links.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = ensureTargetAuthority(requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const link = currentOauthLinkForRunner(serverRunnerId, params.id || "");
      if (!link) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor, claims: [], body: { reason: "oauth link not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "oauth link not found" });
        return;
      }
      world.observe({ process: "auth.oauth.links.read", actor: requestActor, claims: [relation(requestActor, "read", link.id)], body: { serverRunner: serverRunnerId, id: link.id } });
      sendJson(res, 200, { link: authOAuthReadShape(link) });
    }
  };
}

export function createPracticalBackendRuntimeConfigHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget
}) {
  return {
    "runtimeConfig.read": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["runtime.config"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "runtimeConfig.read.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const fields = appContext?.runtimeConfigFields ?? [];
      world.observe({
        process: "runtimeConfig.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:runtimeConfig`)],
        body: {
          serverRunner: serverRunnerId,
          fieldCount: fields.length,
          resolvedCount: fields.filter(field => field.resolved === true).length
        }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        values: Object.fromEntries(
          fields
            .filter(field => field.exposed === true && field.resolved === true && field.secret !== true)
            .map(field => [field.name, field.value])
        ),
        fields
      });
    }
  };
}

export function createPracticalBackendJobsHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget
}) {
  return {
    "jobs.queue.enqueue": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const queued = appContext?.jobs?.enqueue({
        actor: requestActor,
        handler: body.handler,
        payload: body.payload,
        delayMs: body.delayMs,
        idempotencyKey: body.idempotencyKey,
        maxAttempts: body.maxAttempts,
        retryDelayMs: body.retryDelayMs
      });
      if (!queued?.ok) {
        world.emit({
          process: "jobs.queue.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: queued?.reason || "queue unavailable",
            handler: typeof body.handler === "string" ? body.handler : null,
            idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null
          }
        });
        sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
        return;
      }
      sendJson(res, queued.status || 201, { created: queued.created === true, job: queued.job, witness: queued.witness });
    },

    "jobs.queue.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const jobs = appContext?.jobs?.list?.() ?? [];
      world.observe({
        process: "jobs.queue.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:jobs`)],
        body: { serverRunner: serverRunnerId, count: jobs.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, jobs });
    },

    "jobs.queue.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const job = appContext?.jobs?.get?.(params.id || "") ?? null;
      if (!job) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: "job not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "job not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "jobs.queue.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", job.id)],
        body: { serverRunner: serverRunnerId, id: job.id, status: job.status }
      });
      sendJson(res, 200, { job });
    }
  };
}

export function createPracticalBackendHttpOutboundHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  normalizeOutboundRequest,
  outboundTitle,
  executeHttpOutbound,
  responseHeadersToObject,
  looksJsonContentType,
  pickExternalRefId,
  currentOutboundForRunner,
  outboundReadShape,
  isRetryableOutboundStatus,
  delayWithSignal,
  outboundFailureResponseStatus,
  outboundRequestsForRunner
}) {
  return {
    "http.outbound.send": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "http.outbound.request.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const normalized = normalizeOutboundRequest({ body, actor: requestActor, appContext, serverRunnerId });
      if (!normalized.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor, claims: [], body: { reason: normalized.reason, serverRunner: serverRunnerId } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const requestRow = normalized.outbound;
      const requestWitness = world.emit({
        process: "http.outbound.request",
        actor: requestActor,
        claims: [
          thing(requestRow.id),
          relation(requestRow.id, "hasModuleKind", "outboundRequest"),
          relation(requestActor, "owns", requestRow.id),
          relation(requestRow.id, "hasTitle", outboundTitle(requestRow)),
          ...(requestRow.context ? [relation(requestRow.id, "inContext", requestRow.context)] : [])
        ],
        body: {
          id: requestRow.id,
          serverRunner: serverRunnerId,
          target: requestRow.target,
          url: requestRow.url,
          method: requestRow.method,
          requestHeaderNames: requestRow.requestHeaderNames,
          requestBodyKind: requestRow.requestBodyKind,
          timeoutMs: requestRow.timeoutMs,
          maxAttempts: requestRow.maxAttempts,
          retryDelayMs: requestRow.retryDelayMs,
          context: requestRow.context,
          correlationId: requestRow.correlationId,
          authKind: requestRow.authKind,
          authConfigKey: requestRow.authConfigKey
        }
      });

      for (let attempt = 1; attempt <= requestRow.maxAttempts; attempt += 1) {
        world.emit({
          process: "http.outbound.attempt",
          actor: requestActor,
          claims: [relation(serverRunnerId, "runs", requestRow.id)],
          body: {
            id: requestRow.id,
            serverRunner: serverRunnerId,
            target: requestRow.target,
            url: requestRow.url,
            method: requestRow.method,
            transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
            attempt,
            timeoutMs: requestRow.timeoutMs,
            maxAttempts: requestRow.maxAttempts,
            retryDelayMs: requestRow.retryDelayMs,
            correlationId: requestRow.correlationId
          }
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestRow.timeoutMs);
        let result = null;
        let reason = null;
        try {
          result = await executeHttpOutbound(requestRow, {
            appContext,
            signal: controller.signal,
            attempt
          });
        } catch (error) {
          reason = controller.signal.aborted
            ? "outbound timeout"
            : (error instanceof Error ? error.message : String(error));
        } finally {
          clearTimeout(timeout);
        }

        if (result) {
          const responseHeaders = responseHeadersToObject(result.headers);
          const responseContentType = responseHeaders["content-type"] || null;
          const externalRefId = pickExternalRefId(responseHeaders);
          const responseJson = looksJsonContentType(responseContentType) && result.bodyText
            ? (() => {
                try {
                  return JSON.parse(result.bodyText);
                } catch {
                  return null;
                }
              })()
            : null;
          const responsePayload = {
            transport: result.transport,
            status: result.status,
            contentType: responseContentType,
            externalRefId,
            correlationId: responseHeaders["x-correlation-id"] || requestRow.correlationId,
            json: responseJson,
            text: responseJson == null ? result.bodyText : null
          };
          if (result.status >= 200 && result.status < 300) {
            world.emit({
              process: "http.outbound.succeeded",
              actor: requestActor,
              claims: [relation(requestRow.id, "sentVia", `${result.transport}.http.outbound`)],
              body: {
                id: requestRow.id,
                serverRunner: serverRunnerId,
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                attempt,
                responseStatus: result.status,
                responseContentType,
                externalRefId,
                correlationId: responsePayload.correlationId
              }
            });
            sendJson(res, 200, {
              outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id) ?? {
                id: requestRow.id,
                title: outboundTitle(requestRow),
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                status: "succeeded",
                context: requestRow.context,
                serverRunner: serverRunnerId,
                authKind: requestRow.authKind,
                authConfigKey: requestRow.authConfigKey,
                requestHeaderNames: requestRow.requestHeaderNames,
                requestBodyKind: requestRow.requestBodyKind,
                timeoutMs: requestRow.timeoutMs,
                maxAttempts: requestRow.maxAttempts,
                retryDelayMs: requestRow.retryDelayMs,
                attempt,
                correlationId: responsePayload.correlationId,
                externalRefId,
                responseStatus: result.status,
                responseContentType,
                lastError: null
              }),
              response: responsePayload,
              witness: requestWitness.id
            });
            return;
          }
          reason = `outbound response status ${result.status}`;
          if (attempt < requestRow.maxAttempts && isRetryableOutboundStatus(result.status)) {
            const delayMs = requestRow.retryDelayMs * (2 ** Math.max(0, attempt - 1));
            world.emit({
              process: "http.outbound.retry",
              actor: requestActor,
              claims: [],
              body: {
                id: requestRow.id,
                serverRunner: serverRunnerId,
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                attempt,
                responseStatus: result.status,
                responseContentType,
                externalRefId,
                correlationId: responsePayload.correlationId,
                reason,
                delayMs
              }
            });
            await delayWithSignal(delayMs);
            continue;
          }
          world.emit({
            process: "http.outbound.failed",
            actor: requestActor,
            claims: [],
            body: {
              id: requestRow.id,
              serverRunner: serverRunnerId,
              target: requestRow.target,
              url: requestRow.url,
              method: requestRow.method,
              transport: result.transport,
              attempt,
              responseStatus: result.status,
              responseContentType,
              externalRefId,
              correlationId: responsePayload.correlationId,
              reason
            }
          });
          sendJson(res, outboundFailureResponseStatus(reason, result.status), {
            error: reason,
            outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id)),
            response: responsePayload,
            witness: requestWitness.id
          });
          return;
        }

        if (attempt < requestRow.maxAttempts) {
          const delayMs = requestRow.retryDelayMs * (2 ** Math.max(0, attempt - 1));
          world.emit({
            process: "http.outbound.retry",
            actor: requestActor,
            claims: [],
            body: {
              id: requestRow.id,
              serverRunner: serverRunnerId,
              target: requestRow.target,
              url: requestRow.url,
              method: requestRow.method,
              transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
              attempt,
              correlationId: requestRow.correlationId,
              reason,
              delayMs
            }
          });
          await delayWithSignal(delayMs);
          continue;
        }

        world.emit({
          process: "http.outbound.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: requestRow.id,
            serverRunner: serverRunnerId,
            target: requestRow.target,
            url: requestRow.url,
            method: requestRow.method,
            transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
            attempt,
            correlationId: requestRow.correlationId,
            reason
          }
        });
        sendJson(res, outboundFailureResponseStatus(reason), {
          error: reason,
          outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id)),
          witness: requestWitness.id
        });
        return;
      }
    },

    "http.outbound.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "http.outbound.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "http.outbound.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "http.outbound.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const outbound = outboundRequestsForRunner(serverRunnerId).map(outboundReadShape);
      world.observe({
        process: "http.outbound.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:http.outbound`)],
        body: { serverRunner: serverRunnerId, count: outbound.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, outbound });
    },

    "http.outbound.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "http.outbound.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const row = currentOutboundForRunner(serverRunnerId, params.id || "");
      if (!row) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor, claims: [], body: { reason: "outbound request not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "outbound request not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "http.outbound.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", row.id)],
        body: { serverRunner: serverRunnerId, id: row.id, status: row.status }
      });
      sendJson(res, 200, { outbound: outboundReadShape(row) });
    }
  };
}

export function createPracticalBackendNotificationsHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  enqueueNotification,
  notificationsForRunner,
  notificationReadShape,
  currentNotificationForRunner
}) {
  return {
    "notify.email.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "email", req, res, requestActor, appContext });
    },

    "notify.sms.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "sms", req, res, requestActor, appContext });
    },

    "notifications.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const notifications = notificationsForRunner(serverRunnerId).map(notificationReadShape);
      world.observe({
        process: "notifications.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:notifications`)],
        body: { serverRunner: serverRunnerId, count: notifications.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, notifications });
    },

    "notifications.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const notification = currentNotificationForRunner(serverRunnerId, params.id || "");
      if (!notification) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: "notification not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "notification not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "notifications.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", notification.id)],
        body: { serverRunner: serverRunnerId, id: notification.id, status: notification.status }
      });
      sendJson(res, 200, { notification: notificationReadShape(notification) });
    }
  };
}

export function createPracticalBackendWebhookHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  readBody,
  normalizeWebhookDelivery,
  webhookTitle,
  verifyWebhookSignature,
  webhookReadShape,
  currentWebhookForRunner,
  webhookDeliveriesForRunner,
  webhookPayloadPathFor
}) {
  return {
    "webhook.inbound.receive": async ({ req, res, params, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound", "jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "webhook.inbound.receive.failed", actor: backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, target: params.target || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const payloadBytes = await readBody(req);
      const normalized = normalizeWebhookDelivery({
        target: params.target || "",
        req,
        payloadBytes,
        appContext,
        serverRunnerId: appContext?.serverRunnerId || ""
      });
      if (!normalized.ok) {
        world.emit({ process: "webhook.inbound.receive.failed", actor: backendHost, claims: [], body: { reason: normalized.reason, target: params.target || "" } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const delivery = normalized.webhook;
      world.emit({
        process: "webhook.inbound.receive",
        actor: backendHost,
        claims: [
          thing(delivery.id),
          relation(delivery.id, "hasModuleKind", "webhookDelivery"),
          relation(backendHost, "owns", delivery.id),
          relation(delivery.id, "hasTitle", webhookTitle(delivery))
        ],
        body: {
          id: delivery.id,
          serverRunner: delivery.serverRunner,
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId
        }
      });

      if (!verifyWebhookSignature(delivery.signature, delivery.expectedSignature)) {
        world.emit({
          process: "webhook.inbound.verify.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            correlationId: delivery.correlationId,
            reason: "invalid webhook signature"
          }
        });
        sendJson(res, 401, {
          error: "invalid webhook signature",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "invalid",
            replayStatus: null,
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "invalid webhook signature"
          })
        });
        return;
      }

      const now = Date.now();
      if (Math.abs(now - delivery.timestampMs) > delivery.replayWindowMs) {
        world.emit({
          process: "webhook.inbound.replay.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            reason: "delivery timestamp outside replay window"
          }
        });
        sendJson(res, 409, {
          error: "delivery timestamp outside replay window",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "verified",
            replayStatus: "duplicate",
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "delivery timestamp outside replay window"
          })
        });
        return;
      }

      const duplicate = webhookDeliveriesForRunner(delivery.serverRunner).find(row =>
        row.id !== delivery.id
        && row.target === delivery.target
        && row.deliveryId === delivery.deliveryId
        && row.signatureStatus === "verified"
        && row.replayStatus === "accepted"
      );
      if (duplicate) {
        world.emit({
          process: "webhook.inbound.replay.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            correlationId: delivery.correlationId,
            reason: "duplicate delivery"
          }
        });
        sendJson(res, 409, {
          error: "duplicate delivery",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "verified",
            replayStatus: "duplicate",
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "duplicate delivery"
          })
        });
        return;
      }

      const storageKey = `${delivery.id}/payload`;
      const payloadPath = webhookPayloadPathFor(appContext, delivery.id);
      try {
        await fs.mkdir(path.dirname(payloadPath), { recursive: true });
        await fs.writeFile(payloadPath, payloadBytes);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "webhook payload storage failed";
        world.emit({
          process: "webhook.inbound.accept.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            correlationId: delivery.correlationId,
            reason
          }
        });
        sendJson(res, 500, { error: reason });
        return;
      }

      const queued = appContext?.jobs?.enqueue({
        actor: backendHost,
        handler: "webhook.inbound.process",
        payload: { webhookId: delivery.id },
        maxAttempts: delivery.maxAttempts,
        retryDelayMs: delivery.retryDelayMs,
        idempotencyKey: `${delivery.target}:${delivery.deliveryId}`
      });
      if (!queued?.ok) {
        await fs.rm(payloadPath, { force: true }).catch(() => {});
        world.emit({
          process: "webhook.inbound.accept.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            correlationId: delivery.correlationId,
            reason: queued?.reason || "queue unavailable"
          }
        });
        sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
        return;
      }

      world.emit({
        process: "webhook.inbound.accepted",
        actor: backendHost,
        claims: [relation(delivery.id, "sentVia", "webhook.inbound")],
        body: {
          id: delivery.id,
          serverRunner: delivery.serverRunner,
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          storageKey,
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId,
          jobId: queued.job?.id ?? null
        }
      });
      sendJson(res, 202, {
        delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
          id: delivery.id,
          title: webhookTitle(delivery),
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          storageKey,
          status: "accepted",
          signatureStatus: "verified",
          replayStatus: "accepted",
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId,
          context: null,
          serverRunner: delivery.serverRunner,
          jobId: queued.job?.id ?? null,
          attempt: 0,
          maxAttempts: delivery.maxAttempts,
          retryDelayMs: delivery.retryDelayMs,
          lastError: null
        }),
        job: queued.job
      });
    },

    "webhook.inbound.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "webhook.inbound.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "webhook.inbound.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "webhook.inbound.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const deliveries = webhookDeliveriesForRunner(serverRunnerId).map(webhookReadShape);
      world.observe({
        process: "webhook.inbound.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:webhooks`)],
        body: { serverRunner: serverRunnerId, count: deliveries.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, deliveries });
    },

    "webhook.inbound.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "webhook.inbound.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const delivery = currentWebhookForRunner(serverRunnerId, params.id || "");
      if (!delivery) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor, claims: [], body: { reason: "webhook delivery not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "webhook delivery not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "webhook.inbound.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", delivery.id)],
        body: { serverRunner: serverRunnerId, id: delivery.id, status: delivery.status }
      });
      sendJson(res, 200, { delivery: webhookReadShape(delivery) });
    }
  };
}

export function createPracticalBackendDbSqlHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  emitDbSqlDatasourceResolve,
  currentSqlDatasourceForRunner,
  sqlOperationsForRunner,
  dbSqlDatasourceReadShape,
  dbSqlOperationReadShape,
  dbSqlDatasourceId,
  dbSqlDatasourceTitle,
  dbSqlOperationId,
  dbSqlOperationTitle,
  emitDbSqlOperation,
  currentSqlOperationForRunner
}) {
  return {
    "db.sql.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "db.sql.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({
        actor: requestActor,
        datasource: inspection.datasource,
        ok: inspection.ok,
        reason: inspection.ok ? null : inspection.reason
      });
      if (!inspection.ok && !inspection.datasource) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: inspection.reason || "db.sql runtime unavailable", serverRunner: serverRunnerId } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const projectedDatasource = inspection.datasource
        ? (currentSqlDatasourceForRunner(serverRunnerId, inspection.datasource.id) ?? inspection.datasource)
        : null;
      const operations = sqlOperationsForRunner(serverRunnerId).map(dbSqlOperationReadShape);
      world.observe({
        process: "db.sql.inspect",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:db.sql`)],
        body: { serverRunner: serverRunnerId, operationCount: operations.length, datasourceId: projectedDatasource?.id ?? null }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        datasource: projectedDatasource ? dbSqlDatasourceReadShape({
          ...projectedDatasource,
          operationCount: operations.length
        }) : null,
        operations,
        warning: inspection.ok ? null : inspection.reason
      });
    },

    "db.sql.migrate": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.migrate.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      if (!inspection.ok) {
        const datasource = inspection.datasource ?? {
          id: dbSqlDatasourceId(serverRunnerId),
          title: dbSqlDatasourceTitle({}),
          serverRunner: serverRunnerId,
          provider: "sqlite",
          datasourceName: "main"
        };
        const failedId = dbSqlOperationId();
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId: failedId,
          title: dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null }),
          datasource,
          ok: false,
          body: { reason: inspection.reason || "db.sql runtime unavailable" }
        });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: inspection.datasource.datasourceName });
      const result = await appContext.dbSql.migrate({ migrations: body?.migrations });
      if (!result.ok) {
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId,
          title,
          datasource: result.datasource || inspection.datasource,
          ok: false,
          body: { reason: result.reason || "migration failed" }
        });
        sendJson(res, result.status || 500, { error: result.reason || "migration failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "migrate",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "migrate",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length,
          stepCount: 0,
          lastError: null
        }),
        applied: result.applied,
        skipped: result.skipped
      });
    },

    "db.sql.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "query", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.query({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "query failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "query failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "query",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { rowCount: result.rowCount }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "query",
          status: "succeeded",
          rowCount: result.rowCount,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        rows: result.rows
      });
    },

    "db.sql.command": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.command.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "command", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.command({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "command failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "command failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "command",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "command",
          status: "succeeded",
          rowCount: 0,
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      });
    },

    "db.sql.transaction": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.transaction.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "transaction", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.transaction({ steps: body?.steps });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "transaction failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "transaction failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "transaction",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { stepCount: result.results.length }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "transaction",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: result.results.length,
          lastError: null
        }),
        results: result.results
      });
    }
  };
}

export function createPracticalBackendSearchIndexHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  emitSearchIndexEvent,
  currentSearchIndexForRunner,
  searchIndexReadShape
}) {
  const fallbackIndex = serverRunnerId => ({
    id: `searchIndex:${serverRunnerId}:main`,
    title: `${serverRunnerId} Search Index`,
    serverRunner: serverRunnerId,
    provider: "local-text",
    name: "main"
  });

  return {
    "search.index.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = await appContext?.searchIndex?.inspect?.();
      if (!inspection?.ok) {
        emitSearchIndexEvent({
          actor: requestActor,
          process: "search.index.inspect.failed",
          index: inspection?.index || fallbackIndex(serverRunnerId),
          body: { reason: inspection?.reason || "search index unavailable" }
        });
        sendJson(res, inspection?.status || 503, { error: inspection?.reason || "search index unavailable" });
        return;
      }
      const index = inspection.index
        ? searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, inspection.index.id) ?? inspection.index)
        : null;
      world.observe({
        process: "search.index.inspect",
        actor: requestActor,
        claims: [relation(requestActor, "read", "search.index")],
        body: { serverRunner: serverRunnerId, built: Boolean(index), documentCount: index?.documentCount ?? 0 }
      });
      sendJson(res, 200, { index });
    },

    "search.index.build": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.build.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const built = await appContext?.searchIndex?.build?.({ documents: body?.documents, assetIds: body?.assetIds });
      const index = built?.index || fallbackIndex(serverRunnerId);
      if (!built?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.build.failed", index, body: { reason: built?.reason || "search index build failed" } });
        sendJson(res, built?.status || 500, { error: built?.reason || "search index build failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.build",
        index: built.index,
        body: {
          sourceCount: built.index.sourceCount,
          documentCount: built.index.documentCount,
          assetCount: built.index.assetCount,
          queryCount: built.index.queryCount,
          lastBuiltAt: built.index.lastBuiltAt,
          path: built.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, built.index.id) ?? built.index) });
    },

    "search.index.reindex": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.reindex.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindex?.();
      const index = rebuilt?.index || fallbackIndex(serverRunnerId);
      if (!rebuilt?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.reindex.failed", index, body: { reason: rebuilt?.reason || "search index reindex failed" } });
        sendJson(res, rebuilt?.status || 500, { error: rebuilt?.reason || "search index reindex failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id) ?? rebuilt.index) });
    },

    "search.index.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = await appContext?.searchIndex?.query?.({ q: body?.q, limit: body?.limit });
      const index = result?.index || fallbackIndex(serverRunnerId);
      if (!result?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.query.failed", index, body: { reason: result?.reason || "search query failed" } });
        sendJson(res, result?.status || 500, { error: result?.reason || "search query failed" });
        return;
      }
      const hits = result.hits.map(hit => ({
        ...hit,
        ...(hit.assetId ? {
          contentUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/content`,
          textUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/text`
        } : {})
      }));
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.query",
        index: result.index,
        body: {
          q: result.q,
          limit: result.limit,
          hitCount: hits.length,
          queryCount: result.index.queryCount,
          lastQueryAt: result.index.lastQueryAt
        }
      });
      sendJson(res, 200, {
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, result.index.id) ?? result.index),
        hits
      });
    }
  };
}

export function createPracticalBackendBackendSeamsHandlers({
  world,
  backendHost,
  frontendHost,
  send,
  sendJson,
  assetDiagnostics,
  renderBackendSeamsPage,
  runtimeBundleSummaryForProfile,
  getRuntimeBundleHandlerDiagnostics,
  defaultRuntimeProfile
}) {
  return {
    "page.backendSeams": async ({ res, requestActor, appContext }) => {
      if (!requestActor) {
        world.observe({ process: "frontend.renderBackendSeamsPage.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const diagnostics = await assetDiagnostics(appContext);
      world.observe({
        process: "frontend.renderBackendSeamsPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", "backendSeams")],
        body: { assets: diagnostics.assets.total, assetsRoot: diagnostics.storage.assetsRoot }
      });
      send(res, 200, "text/html; charset=utf-8", renderBackendSeamsPage(diagnostics));
    },

    "backendSeams.read": async ({ res, requestActor, appContext }) => {
      if (!requestActor) {
        world.observe({ process: "backend.readBackendSeams.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const diagnostics = await assetDiagnostics(appContext);
      world.observe({
        process: "backend.readBackendSeams",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "backendSeams")],
        body: {
          runtimeProfile: appContext.runtimeProfile,
          runtimeConfigFields: diagnostics.runtimeConfig.fieldCount,
          runtimeConfigMissing: diagnostics.runtimeConfig.missingCount,
          dbSqlDatasources: diagnostics.dbSql.datasourceCount,
          dbSqlOperations: diagnostics.dbSql.operationCount,
          dbSqlFailures: diagnostics.failures.dbSqlFailed.length,
          searchIndexes: diagnostics.search.indexCount,
          searchQueries: diagnostics.search.queryCount,
          searchFailures: diagnostics.failures.searchIndexFailed.length,
          oauthFlows: diagnostics.oauth.flowCount,
          oauthLinks: diagnostics.oauth.linkCount,
          oauthFailures: diagnostics.failures.authOauthFailed.length,
          assets: diagnostics.assets.total,
          assetsRoot: diagnostics.storage.assetsRoot,
          blobsRoot: diagnostics.storage.blobsRoot,
          assetIngestRetryable: diagnostics.assets.ingestRetryableCount,
          assetSearchRefreshable: diagnostics.assets.searchRefreshableCount,
          assetUploadFailures: diagnostics.failures.assetUploadFailed.length,
          assetContentReadFailures: diagnostics.failures.assetContentReadFailed.length,
          fsBlobFailures: diagnostics.failures.fsBlobFailed.length,
          fsStreamFailures: diagnostics.failures.fsStreamFailed.length
        }
      });
      sendJson(res, 200, {
        ...diagnostics,
        runtime: {
          profile: appContext.runtimeProfile || defaultRuntimeProfile,
          ...(appContext.runtimeBundleSummary ?? runtimeBundleSummaryForProfile(appContext.runtimeProfile || defaultRuntimeProfile)),
          handlerImplementations: getRuntimeBundleHandlerDiagnostics()
        }
      });
    }
  };
}

export function createPracticalBackendFsBlobHandlers({
  world,
  backendHost,
  send,
  sendJson,
  readBody,
  headerValue,
  requireBackendCapabilities,
  resolveBlobScope,
  listBlobFolder,
  loadBlobRecord,
  blobStorageDirectoryFor,
  composeBlobFileRecord,
  normalizeBlobPath
}) {
  return {
    "fs.blob.list": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const folderPath = requestUrl.searchParams.get("path") || "";
      const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath });
      if (!listed.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor, claims: [], body: { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: folderPath } });
        sendJson(res, listed.status || 404, { error: listed.reason });
        return;
      }
      world.observe({
        process: "fs.blob.list",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: listed.folder.path, count: listed.items.length }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, folder: listed.folder, items: listed.items });
    },

    "fs.blob.meta": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      if (!blobPath) {
        const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath: "" });
        world.observe({
          process: listed.ok ? "fs.blob.meta" : "fs.blob.meta.failed",
          actor: requestActor,
          claims: [],
          body: listed.ok
            ? { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "", kind: "folder", childCount: listed.folder.childCount }
            : { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" }
        });
        if (!listed.ok) {
          sendJson(res, listed.status || 404, { error: listed.reason });
          return;
        }
        sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: listed.folder });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      world.observe({
        process: "fs.blob.meta",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: record.record.path, kind: record.record.kind }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.record });
    },

    "fs.blob.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.blob.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      const bytes = await fs.readFile(record.contentPath);
      world.observe({
        process: "fs.blob.read",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: record.record.path,
          sizeBytes: record.record.sizeBytes,
          blobRef: record.record.blobRef
        }
      });
      send(res, 200, record.record.mimeType || "application/octet-stream", bytes, {
        "cache-control": "no-store",
        "content-length": String(bytes.length)
      });
    },

    "fs.blob.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const bytes = await readBody(req);
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const contentPath = path.join(resolvedDir.directory, "blob");
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      const updatedAt = new Date().toISOString();
      try {
        await fs.mkdir(resolvedDir.directory, { recursive: true });
        await fs.writeFile(contentPath, bytes);
        await fs.writeFile(metaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          updatedAt
        }, null, 2));
      } catch (error) {
        world.emit({
          process: "fs.blob.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage write failed" });
        return;
      }
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.blob.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.blob.delete": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const normalized = normalizeBlobPath(blobPath);
      if (!normalized.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: normalized.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: normalized.path });
      if (!record.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      if (record.record.kind === "folder" && record.record.path === "") {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "cannot delete blob scope root", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" } });
        sendJson(res, 409, { error: "cannot delete blob scope root" });
        return;
      }
      const recursive = requestUrl.searchParams.get("recursive") === "true";
      if (record.record.kind === "folder" && !recursive && record.record.childCount > 0) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "blob folder delete requires recursive=true", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, 409, { error: "blob folder delete requires recursive=true" });
        return;
      }
      const targetPath = record.directory || blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, normalized.path).directory;
      try {
        await fs.rm(targetPath, { recursive: true, force: false });
      } catch (error) {
        world.emit({
          process: "fs.blob.delete.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage delete failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: normalized.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage delete failed" });
        return;
      }
      world.emit({
        process: "fs.blob.delete",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: normalized.path,
          kind: record.record.kind
        }
      });
      sendJson(res, 200, { ok: true, deleted: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path, kind: record.record.kind } });
    }
  };
}

export function createPracticalBackendFsStreamHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  requireBackendCapabilities,
  resolveBlobScope,
  loadBlobRecord,
  blobStorageDirectoryFor,
  composeBlobFileRecord,
  headerValue,
  parseStreamFailureLimit,
  streamReadableToFile,
  streamFileToFile
}) {
  return {
    "fs.stream.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.stream.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      world.observe({
        process: "fs.stream.read",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: record.record.path,
          sizeBytes: record.record.sizeBytes,
          blobRef: record.record.blobRef
        }
      });
      res.writeHead(200, {
        "content-type": record.record.mimeType || "application/octet-stream",
        "content-length": String(record.record.sizeBytes),
        "cache-control": "no-store"
      });
      const stream = createReadStream(record.contentPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "stream read failed" });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "fs.stream.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const contentPath = path.join(resolvedDir.directory, "blob");
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      let streamed = null;
      try {
        streamed = await streamReadableToFile(req, contentPath, { failAfterBytes });
      } catch (error) {
        if (!existed) {
          await fs.rm(resolvedDir.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream write failed" });
        return;
      }
      const updatedAt = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify({
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        path: resolvedDir.path,
        mimeType,
        sizeBytes: streamed.sizeBytes,
        updatedAt
      }, null, 2));
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.stream.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          sizeBytes: streamed.sizeBytes,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.stream.copy": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const body = await readJson(req);
      const fromPath = typeof body.fromPath === "string" ? body.fromPath : "";
      const toPath = typeof body.toPath === "string" ? body.toPath : "";
      const source = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: fromPath });
      if (!source.ok || source.record.kind !== "file") {
        const reason = source.ok ? "source path is a folder" : source.reason;
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, source.ok ? 409 : (source.status || 404), { error: reason });
        return;
      }
      const target = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, toPath);
      if (!target.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: target.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, target.status || 400, { error: target.reason });
        return;
      }
      if (source.record.path === target.path) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: "source and target path must differ", scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, 409, { error: "source and target path must differ" });
        return;
      }
      const targetContentPath = path.join(target.directory, "blob");
      const targetMetaPath = path.join(target.directory, "meta.json");
      let targetExisted = true;
      try {
        await fs.stat(targetContentPath);
      } catch {
        targetExisted = false;
      }
      try {
        const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
        const copied = await streamFileToFile(source.contentPath, targetContentPath, { failAfterBytes });
        const updatedAt = new Date().toISOString();
        await fs.writeFile(targetMetaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: target.path,
          mimeType: source.record.mimeType,
          sizeBytes: copied.sizeBytes,
          updatedAt
        }, null, 2));
        const record = await composeBlobFileRecord({
          appContext,
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          blobPath: target.path,
          metadata: { mimeType: source.record.mimeType, updatedAt }
        });
        world.emit({
          process: "fs.stream.copy",
          actor: requestActor,
          claims: [],
          body: {
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath: source.record.path,
            toPath: target.path,
            sizeBytes: copied.sizeBytes,
            chunkCount: copied.chunkCount,
            maxChunkBytes: copied.maxChunkBytes,
            drainCount: copied.drainCount,
            writeHighWaterMarkBytes: copied.writeHighWaterMarkBytes
          }
        });
        sendJson(res, 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
      } catch (error) {
        if (!targetExisted) {
          await fs.rm(target.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.copy.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream copy failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath,
            toPath
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream copy failed" });
      }
    }
  };
}

export function createPracticalBackendAssetSurfaceHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  currentAssetById,
  ensureReadableAssetAccess,
  assetPathFor,
  assetTextPathFor,
  assetTextUrl,
  assetThumbnailPathFor,
  authorityServices,
  sendGateFailure,
  requireBackendCapabilities,
  attachmentTargetsForAsset,
  currentThingExists,
  currentThingKind,
  assetAttachedToTarget,
  runAssetAttach,
  runAssetDetach
}) {
  const { ensureTargetAuthority } = authorityServices;
  const assetAttachmentProposalId = (process, assetId, targetId) => {
    const processPart = String(process || "asset.attachment").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const assetPart = String(assetId || "asset").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const targetPart = String(targetId || "target").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.${processPart}.${assetPart}.${targetPart}`;
  };
  const assetAttachmentProposalConfig = ({ process, assetId, targetId }) => {
    if (!assetId || !targetId) return null;
    if (process === "asset.attach") {
      return {
        targetProcess: process,
        targetKind: "thing",
        targetId: assetId,
        reason: "Attach a shared asset through witnessed proposal",
        statusMessage: "Proposed asset attachment for review."
      };
    }
    if (process === "asset.detach") {
      return {
        targetProcess: process,
        targetKind: "thing",
        targetId: assetId,
        reason: "Remove a shared asset attachment through witnessed proposal",
        statusMessage: "Proposed asset detachment for review."
      };
    }
    return null;
  };
  const createAssetAttachmentProposal = ({ actor, process, assetId, targetId, perspective = null }) => {
    const config = assetAttachmentProposalConfig({ process, assetId, targetId });
    if (!config) return null;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: assetAttachmentProposalId(config.targetProcess, assetId, targetId),
        targetProcess: config.targetProcess,
        targetKind: config.targetKind,
        targetId: config.targetId,
        bodyJson: JSON.stringify({ asset: assetId, target: targetId, perspective }),
        reason: config.reason
      }
    });
  };
  return {
    "asset.content.read": async ({ res, params, requestActor, requestUrl, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const wantsDownload = requestUrl?.searchParams?.get("download") === "1";
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.content.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      const assetPath = assetPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(assetPath);
      } catch {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "asset content missing", storageKey: asset.storageKey } });
        sendJson(res, 404, { error: "asset content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.content.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          mimeType: asset.mimeType,
          sizeBytes: stat.size,
          storageKey: asset.storageKey,
          visibility: asset.visibility,
          context: asset.context,
          contentUrl: asset.contentUrl,
          disposition: wantsDownload ? "attachment" : "inline"
        }
      });
      const fileName = String(asset.title || asset.originalName || asset.id).replace(/["\r\n]/g, "_");
      res.writeHead(200, {
        "content-type": asset.mimeType || "application/octet-stream",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${fileName}"`
      });
      const stream = createReadStream(assetPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "asset stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.text.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.text.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.textRef !== "string" || !asset.textRef) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text not available" } });
        sendJson(res, 404, { error: "derived text not available", id: asset.id });
        return;
      }
      const textPath = assetTextPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(textPath);
      } catch {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text missing", textRef: asset.textRef } });
        sendJson(res, 404, { error: "derived text missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.text.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          textRef: asset.textRef,
          textUrl: assetTextUrl(asset.id),
          textStatus: asset.textStatus ?? null,
          textExtractor: asset.textExtractor ?? null,
          textBytes: asset.textBytes ?? stat.size,
          visibility: asset.visibility
        }
      });
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.derived.txt"`
      });
      const stream = createReadStream(textPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "derived text stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.thumbnail.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.thumbnailRef !== "string" || !asset.thumbnailRef || typeof asset.thumbnailUrl !== "string" || !asset.thumbnailUrl) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail not available" } });
        sendJson(res, 404, { error: "thumbnail not available", id: asset.id });
        return;
      }
      const thumbnailPath = assetThumbnailPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(thumbnailPath);
      } catch {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail content missing", thumbnailRef: asset.thumbnailRef } });
        sendJson(res, 404, { error: "thumbnail content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.thumbnail.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          thumbnailRef: asset.thumbnailRef,
          thumbnailUrl: asset.thumbnailUrl,
          visibility: asset.visibility,
          sizeBytes: stat.size,
          imageWidth: asset.imageWidth ?? null,
          imageHeight: asset.imageHeight ?? null
        }
      });
      res.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.thumbnail.svg"`
      });
      const stream = createReadStream(thumbnailPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "thumbnail stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.attachments.list": async ({ res, params, requestActor }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "asset.attachments.read.failed", actor: backendHost, claims: [], body: { id: asset.id, reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason } });
        sendGateFailure(res, gate);
        return;
      }
      const attachments = attachmentTargetsForAsset(asset.id);
      world.observe({
        process: "asset.attachments.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", asset.id)],
        body: { id: asset.id, count: attachments.length }
      });
      sendJson(res, 200, { asset, attachments });
    },

    "asset.attach": async ({ req, res, params, requestActor }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.attach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.attach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = await readJson(req);
      const target = typeof body?.target === "string" && body.target.trim() ? body.target.trim() : "";
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      if (!currentThingExists(target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target not found" } });
        sendJson(res, 404, { error: "target not found", target });
        return;
      }
      const targetKind = currentThingKind(target);
      if (targetKind === "asset" || targetKind === "projectionInstance" || targetKind === "perspective") {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target cannot hold asset attachments" } });
        sendJson(res, 409, { error: "target cannot hold asset attachments", target });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        if (assetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.attach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.attach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        if (targetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.attach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.attach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset already attached to target" } });
        sendJson(res, 409, { error: "asset already attached to target", asset: asset.id, target });
        return;
      }
      const witness = runAssetAttach({ actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 201, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    },

    "asset.detach": async ({ req, res, params, requestActor, requestUrl }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.detach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.detach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = req.method === "DELETE" ? null : await readJson(req).catch(() => null);
      const target = typeof body?.target === "string" && body.target.trim()
        ? body.target.trim()
        : String(requestUrl.searchParams.get("target") || "").trim();
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        if (assetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.detach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.detach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        if (targetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.detach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.detach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (!assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset attachment not current" } });
        sendJson(res, 404, { error: "asset attachment not current", asset: asset.id, target });
        return;
      }
      const witness = runAssetDetach({ actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    }
  };
}

export function createPracticalBackendAssetWorkflowHandlers({
  world,
  backendHost,
  sendJson,
  requireBackendCapabilities,
  headerValue,
  parseMultipartAssetUpload,
  parseRawAssetUpload,
  normalizeAssetVisibility,
  resolveAssetDropContext,
  assetStorageKey,
  assetContentUrl,
  assetDownloadUrl,
  assetPathFor,
  streamReadableToFile,
  randomUUID,
  currentAssetById,
  authorityServices,
  sendGateFailure,
  canMutateTarget,
  emitSearchIndexEvent,
  currentSearchIndexForRunner,
  searchIndexReadShape
}) {
  const { ensureTargetAuthority } = authorityServices;
  return {
    "asset.upload": async ({ req, res, requestUrl, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        world.emit({ process: "asset.upload.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const capabilityGate = requireBackendCapabilities(["upload.asset", "fs.blob", "fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: capabilityGate.reason, missing: capabilityGate.missing }
        });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const contentType = headerValue(req.headers["content-type"]).toLowerCase();
      const parsedUpload = contentType.startsWith("multipart/form-data")
        ? await parseMultipartAssetUpload(req)
        : parseRawAssetUpload(req, requestUrl);
      if (!parsedUpload.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: parsedUpload.reason } });
        sendJson(res, parsedUpload.status || 400, { error: parsedUpload.reason });
        return;
      }
      const perspectiveId = parsedUpload.perspectiveId || requestUrl.searchParams.get("perspective") || "";
      if (!perspectiveId) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing perspective id" } });
        sendJson(res, 400, { error: "missing perspective id" });
        return;
      }
      const originalName = parsedUpload.originalName;
      const mimeType = parsedUpload.mimeType;
      const explicitContextId = parsedUpload.explicitContextId || null;
      const visibilityInput = normalizeAssetVisibility(parsedUpload.visibilityRaw, appContext?.runtimeConfig ?? {});
      if (!originalName) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing filename header", perspective: perspectiveId } });
        sendJson(res, 400, { error: parsedUpload.uploadKind === "multipart" ? "multipart upload requires a filename" : "missing x-witness-file-name header" });
        return;
      }
      if (!mimeType) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing content type", perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: "missing content-type header" });
        return;
      }
      if (!visibilityInput.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: visibilityInput.reason, perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: visibilityInput.reason });
        return;
      }
      const resolvedContext = resolveAssetDropContext({
        actor: requestActor,
        perspectiveId,
        requestSession,
        explicitContextId
      });
      if (!resolvedContext.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: resolvedContext.reason,
            perspective: perspectiveId,
            originalName,
            homeContext: requestSession?.homeContext ?? null
          }
        });
        sendJson(res, resolvedContext.status || 400, { error: resolvedContext.reason });
        return;
      }
      const assetId = `asset_${randomUUID()}`;
      const storageKey = assetStorageKey(assetId);
      const contentUrl = assetContentUrl(assetId);
      const visibility = visibilityInput.value;
      const assetPath = assetPathFor(appContext, assetId);
      let streamed = null;

      try {
        streamed = await streamReadableToFile(parsedUpload.source, assetPath);
      } catch (error) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "asset storage write failed",
            perspective: perspectiveId,
            originalName,
            storageKey,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "asset storage write failed" });
        return;
      }
      if (!streamed.sizeBytes) {
        await fs.rm(assetPath, { force: true }).catch(() => {});
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: "empty upload body", perspective: perspectiveId, originalName, context: resolvedContext.contextId }
        });
        sendJson(res, 400, { error: "empty upload body" });
        return;
      }
      const sizeBytes = streamed.sizeBytes;

      const witness = world.emit({
        process: "asset.upload",
        actor: requestActor,
        claims: [
          thing(assetId),
          relation(requestActor, "owns", assetId),
          relation(assetId, "hasModuleKind", "asset"),
          relation(assetId, "hasTitle", originalName),
          relation(assetId, "inContext", resolvedContext.contextId)
        ],
        body: {
          id: assetId,
          originalName,
          mimeType,
          sizeBytes,
          declaredSizeBytes: parsedUpload.declaredSizeBytes,
          uploadKind: parsedUpload.uploadKind,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey,
          contentUrl,
          visibility,
          context: resolvedContext.contextId
        }
      });
      let processing = null;
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId },
        idempotencyKey: `asset.ingest:${assetId}`
      });
      if (queued?.ok && queued.job) {
        world.emit({
          process: "asset.ingest.enqueue",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            jobId: queued.job.id,
            handler: queued.job.handler,
            availableAt: queued.job.availableAt,
            idempotencyKey: queued.job.idempotencyKey
          }
        });
        processing = {
          status: queued.job.status || "queued",
          jobId: queued.job.id,
          attempt: queued.job.attempt ?? 0
        };
      } else {
        world.emit({
          process: "asset.ingest.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            reason: queued?.reason || "asset ingestion queue unavailable"
          }
        });
        processing = {
          status: "enqueue-failed",
          jobId: null,
          attempt: 0,
          error: queued?.reason || "asset ingestion queue unavailable"
        };
      }
      sendJson(res, 201, {
        asset: {
          id: assetId,
          title: originalName,
          mimeType,
          sizeBytes,
          storageKey,
          visibility,
          context: resolvedContext.contextId,
          contentUrl,
          downloadUrl: assetDownloadUrl(contentUrl)
        },
        processing,
        witness: witness.id
      });
    },

    "asset.ingest.retry": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset", "jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.ingest.retry.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden" } });
        sendGateFailure(res, gate);
        return;
      }
      if (asset.processingStatus === "queued" || asset.processingStatus === "running") {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: "asset ingestion already active", jobId: asset.processingJobId ?? null } });
        sendJson(res, 409, { error: "asset ingestion already active", id: asset.id, jobId: asset.processingJobId ?? null });
        return;
      }
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId: asset.id }
      });
      if (!queued?.ok || !queued.job) {
        const reason = queued?.reason || "asset ingestion queue unavailable";
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason } });
        sendJson(res, queued?.status || 503, { error: reason, id: asset.id });
        return;
      }
      const witness = world.emit({
        process: "asset.ingest.retry",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: appContext?.serverRunnerId || null,
          previousJobId: asset.processingJobId ?? null,
          previousStatus: asset.processingStatus ?? null,
          jobId: queued.job.id,
          handler: queued.job.handler,
          availableAt: queued.job.availableAt,
          attempt: queued.job.attempt ?? 0
        }
      });
      sendJson(res, queued.created === false ? 200 : 201, {
        asset: currentAssetById(asset.id) ?? asset,
        job: queued.job,
        witness: witness.id
      });
    },

    "asset.search.reindex": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.search.reindex.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden", serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindexAsset?.(asset.id);
      if (!rebuilt?.ok || !rebuilt.index) {
        const reason = rebuilt?.reason || "asset search reindex failed";
        world.emit({
          process: "asset.search.reindex.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: asset.id,
            serverRunner: serverRunnerId,
            reason,
            searchPolicy: rebuilt?.repair?.policy || asset.searchPolicy || null,
            disposition: rebuilt?.repair?.disposition || null
          }
        });
        sendJson(res, rebuilt?.status || 500, { error: reason, id: asset.id, repair: rebuilt?.repair ?? null });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      const witness = world.emit({
        process: "asset.search.reindex",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: serverRunnerId,
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          completedAt: new Date(Date.now()).toISOString()
        }
      });
      sendJson(res, 200, {
        asset: {
          ...(currentAssetById(asset.id) ?? asset),
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          searchError: null
        },
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id) ?? rebuilt.index),
        repair: rebuilt.repair ?? null,
        witness: witness.id
      });
    }
  };
}

export function createEdenBundleHandlers({
  world,
  backendHost,
  frontendHost,
  send,
  sendJson,
  readJson,
  requestVisibleWitnesses,
  authoringServices,
  sendGateFailure
}) {
  const {
    requireBootstrapActor,
    ensureTargetAuthority,
    executeBootstrapProposal
  } = authoringServices;
  const edenOrganizationSurface = (requestActor, appContext, route) => {
    const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
    const surfaceId = route?.params?.surfaceId ?? "eden.surface.commons";
    const visible = requestVisibleWitnesses(requestActor, appContext);
    const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
    const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
    return { neighborhoodId, surfaceId, visible, model, surface };
  };
  const projectEdenOrganizationRuntime = (requestActor, appContext, surface) => projectEdenOrganizationState(
    requestVisibleWitnesses(requestActor, appContext),
    {
      actor: requestActor,
      surfaceId: surface?.id ?? "eden.surface.commons",
      contextParent: surface?.contextParent,
      guestSteward: surface?.guestSteward,
      proposalTargetProcess: surface?.proposalTargetProcess,
      proposalTargetKind: surface?.proposalTargetKind,
      proposalTargetId: surface?.proposalTargetId,
      proposalBody: surface?.proposalBody
    }
  );
  const edenVersionAuthorityState = (requestActor, soul) => {
    if (!requestActor) {
      return {
        authenticated: false,
        canMutate: false,
        canPropose: false,
        reason: "sign in to change versions"
      };
    }
    const gate = ensureTargetAuthority(requestActor, soul || "");
    return {
      authenticated: true,
      canMutate: Boolean(gate?.ok),
      canPropose: !gate?.ok,
      reason: gate?.ok ? null : (gate?.reason || "forbidden")
    };
  };
  const edenCapabilityInstallAuthorityState = (requestActor, target) => {
    if (!requestActor) {
      return {
        authenticated: false,
        canMutate: false,
        canPropose: false,
        reason: "sign in to install capabilities"
      };
    }
    const gate = ensureTargetAuthority(requestActor, target || "");
    return {
      authenticated: true,
      canMutate: Boolean(gate?.ok),
      canPropose: gate?.status === 403,
      reason: gate?.ok ? null : (gate?.reason || "forbidden")
    };
  };
  const edenVersionStateForRequest = ({ requestActor, surfaceId, soul, publishedVersion = null, draftVersion = null }) => ({
    ...projectEdenVersionState(world.allWitnesses(), {
      surfaceId,
      soul,
      publishedVersion,
      draftVersion
    }),
    authority: edenVersionAuthorityState(requestActor, soul)
  });
  const edenCapabilityInstallStateForRequest = ({
    requestActor,
    appContext,
    surfaceId,
    target,
    targetKind,
    targetLabel,
    recommendedCapabilities = []
  }) => ({
    ...projectEdenCapabilityInstallState(requestVisibleWitnesses(requestActor, appContext), {
      actor: requestActor,
      surfaceId,
      target,
      targetKind,
      targetLabel,
      recommendedCapabilities
    }),
    authority: edenCapabilityInstallAuthorityState(requestActor, target)
  });
  const theorySurfaceForRequest = (requestActor, appContext, route) => {
    const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
    const surfaceId = route?.params?.surfaceId ?? "eden.surface.tree";
    const visible = requestVisibleWitnesses(requestActor, appContext);
    const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
    const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
    return { neighborhoodId, surfaceId, visible, surface };
  };

  return {
    "edenPersonalBox.read": async ({ res, requestActor, requestSession, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const items = projectEdenPersonalBoxItems(world.allWitnesses(), { actor: requestActor, surfaceId });
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        surfaceId,
        items
      });
    },

    "edenPersonalBox.create": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const body = await readJson(req);
      const result = requestEdenPersonalBoxItemCreate(world, { actor: requestActor, backendHost, surfaceId, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { item: result.item, witness: result.witness });
    },

    "edenPersonalBox.update": async ({ req, res, requestActor, params, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const body = await readJson(req);
      const result = requestEdenPersonalBoxItemUpdate(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        itemId: params.id || "",
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { item: result.item, witness: result.witness });
    },

    "edenPersonalBox.delete": async ({ res, requestActor, params, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const result = requestEdenPersonalBoxItemDelete(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        itemId: params.id || ""
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { ok: true, id: result.id, witness: result.witness });
    },

    "edenPageTheme.read": async ({ res, requestActor, route, appContext }) => {
      const pageId = route?.params?.pageId ?? "todo_app_widget";
      const pageTheme = projectEdenPageTheme(requestVisibleWitnesses(requestActor, appContext), { actor: requestActor, pageId });
      sendJson(res, 200, {
        actor: requestActor || null,
        pageId,
        pageTheme
      });
    },

    "edenPageTheme.write": async ({ req, res, requestActor, route }) => {
      const pageId = route?.params?.pageId ?? "todo_app_widget";
      const body = await readJson(req);
      const result = requestEdenPageThemeSet(world, { actor: requestActor, backendHost, pageId, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 200, { pageTheme: result.pageTheme, witness: result.witness });
    },

    "edenAcademy.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      if (!model) {
        sendJson(res, 404, { error: "eden neighborhood not configured", neighborhood: neighborhoodId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        academy: projectEdenAcademyState(visible, {
          actor: requestActor,
          neighborhoodId,
          quests: model.academy?.quests || []
        }),
        surfaces: model.surfaces.map(surface => ({
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : []
        })),
        checkpoints: model.checkpoints.map(checkpoint => ({
          id: checkpoint.id,
          quests: Array.isArray(checkpoint.quests) ? checkpoint.quests : []
        }))
      });
    },

    "edenOrganization.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        organizationState: surface.runtime,
        surface: {
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : [],
          quests: Array.isArray(surface.quests) ? surface.quests : []
        }
      });
    },

    "edenOrganization.createContext": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const auth = surface.contextParent ? ensureTargetAuthority(gate.actor, surface.contextParent) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      if (surface.runtime.contextExists) {
        sendJson(res, 200, {
          context: surface.runtime.context,
          organizationState: surface.runtime
        });
        return;
      }
      const result = requestBootstrapContextDefine(world, {
        actor: gate.actor,
        backendHost,
        body: {
          id: edenOrganizationContextId(gate.actor),
          label: edenOrganizationContextLabel(gate.actor),
          parent: surface.contextParent ?? null
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        context: result.context,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.grantStewardship": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      if (!surface.runtime.contextExists) {
        sendJson(res, 409, { error: "start a group first", organizationState: surface.runtime });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, surface.runtime.contextId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      if (surface.runtime.hasGuestStewardship) {
        sendJson(res, 200, {
          stewardship: surface.runtime.guestGrant,
          organizationState: surface.runtime
        });
        return;
      }
      const result = requestBootstrapStewardshipGrant(world, {
        actor: gate.actor,
        backendHost,
        body: {
          steward: surface.runtime.guestSteward,
          target: surface.runtime.contextId,
          targetKind: "context"
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        stewardship: result.stewardship,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.createProposal": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      if (!surface.runtime.contextExists) {
        sendJson(res, 409, { error: "start a group first", organizationState: surface.runtime });
        return;
      }
      if (!surface.runtime.hasGuestStewardship) {
        sendJson(res, 409, { error: "grant stewardship first", organizationState: surface.runtime });
        return;
      }
      if (surface.runtime.openProposal) {
        sendJson(res, 200, {
          proposal: surface.runtime.openProposal,
          organizationState: surface.runtime
        });
        return;
      }
      const template = surface.runtime.proposalTemplate || {};
      const result = requestBootstrapProposalCreate(world, {
        actor: gate.actor,
        backendHost,
        body: {
          id: nextEdenOrganizationProposalId(world.allWitnesses(), gate.actor),
          targetProcess: template.targetProcess || "widget.define",
          targetKind: template.targetKind || "widget",
          targetId: template.targetId || null,
          bodyJson: JSON.stringify(
            template.body && typeof template.body === "object"
              ? template.body
              : edenOrganizationProposalBody(gate.actor, { contextId: surface.runtime.contextId, widgetId: surface.runtime.noticeWidgetId })
          ),
          reason: `Open ${edenOrganizationContextLabel(gate.actor)} through a witnessed proposal`
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        proposal: result.proposal,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.approveProposal": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const proposalId = surface.runtime.openProposal?.id || null;
      if (!proposalId) {
        sendJson(res, 404, { error: "no open organization proposal", organizationState: surface.runtime });
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor: gate.actor,
        backendHost,
        proposalId,
        executeTarget: executeBootstrapProposal(gate.actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        proposal: result.proposal,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenTheory.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        theoryState: surface.runtime,
        surface: {
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : [],
          quests: Array.isArray(surface.quests) ? surface.quests : []
        }
      });
    },

    "edenTheory.study": async ({ res, requestActor, requestSession, route, appContext, params }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const result = requestEdenTheoryLessonStudy(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessonId: params.id || "",
        lessons: surface.theoryLessons || []
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenTheory.assess": async ({ res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const result = requestEdenTheoryAssessmentPass(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessons: surface.theoryLessons || []
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenTheory.teachBack": async ({ req, res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const body = await readJson(req);
      const result = requestEdenTheoryTeachBack(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessons: surface.theoryLessons || [],
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenCapabilityInstall.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.world";
      const target = route?.params?.target ?? "frontend";
      const targetKind = route?.params?.targetKind ?? "context";
      const targetLabel = route?.params?.targetLabel ?? target;
      const recommendedCapabilities = Array.isArray(route?.params?.recommendedCapabilities)
        ? route.params.recommendedCapabilities
        : [];
      const capabilityState = edenCapabilityInstallStateForRequest({
        requestActor,
        appContext,
        surfaceId,
        target,
        targetKind,
        targetLabel,
        recommendedCapabilities
      });
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        capabilityState
      });
    },

    "edenCapabilityInstall.install": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.world";
      const target = route?.params?.target ?? "frontend";
      const targetKind = route?.params?.targetKind ?? "context";
      const targetLabel = route?.params?.targetLabel ?? target;
      const recommendedCapabilities = Array.isArray(route?.params?.recommendedCapabilities)
        ? route.params.recommendedCapabilities
        : [];
      const body = await readJson(req);
      const result = requestEdenCapabilityInstall(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        target,
        targetKind,
        targetLabel,
        recommendedCapabilities,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          capabilityState: {
            ...(result.capabilityState ?? edenCapabilityInstallStateForRequest({
              requestActor,
              appContext: null,
              surfaceId,
              target,
              targetKind,
              targetLabel,
              recommendedCapabilities
            })),
            authority: edenCapabilityInstallAuthorityState(requestActor, target)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        capabilityInstall: result.capabilityInstall,
        witness: result.witness,
        capabilityState: {
          ...result.capabilityState,
          authority: edenCapabilityInstallAuthorityState(requestActor, target)
        }
      });
    },

    "edenVersions.read": async ({ res, route, requestActor }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const versionState = edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion });
      sendJson(res, 200, { surfaceId, soul, versionState });
    },

    "edenVersions.activate": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestEdenVersionActivate(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.activationStatus,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "edenVersions.rollback": async ({ res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestEdenVersionRollback(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.rollbackStatus,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "edenVersions.publish": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestEdenVersionPublish(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "page.edenCanvas": async ({ res, route, requestActor, requestSession, appContext }) => {
      const neighborhoodId = route.params?.neighborhood ?? "eden.neighborhood.home";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      if (!model) {
        sendJson(res, 404, { error: "eden neighborhood not configured", neighborhood: neighborhoodId });
        return;
      }
      model.session = requestSession
        ? {
            authenticated: true,
            actor: requestSession.actor,
            identity: requestSession.identity,
            label: requestSession.label
          }
        : {
            authenticated: false,
            actor: null,
            identity: null,
            label: null
          };
      world.observe({
        process: "frontend.renderEdenPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || neighborhoodId)],
        body: { route: route.path, neighborhood: neighborhoodId }
      });
      send(res, 200, "text/html", renderEdenPage({ model }));
    }
  };
}

export function createInspectBundleHandlers({
  world,
  backendHost,
  frontendHost,
  logger,
  send,
  sendJson,
  readJson,
  sendGateFailure,
  authorityServices,
  requestActors,
  requestVisibleWitnesses,
  processSelection,
  processViewInputs,
  frontendTraceProcesses
}) {
  const { ensureTargetAuthority, ensureContextAuthority } = authorityServices;
  const widgetVersionProposalId = (targetProcess, soul) => {
    const processPart = String(targetProcess || "widgetVersion.action").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const soulPart = String(soul || "widget").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.${processPart}.${soulPart}.${world.allWitnesses().length + 1}`;
  };
  const createWidgetVersionProposal = ({ actor, targetProcess, soul, version = null }) => {
    const body = targetProcess === "widgetVersion.activate"
      ? { soul, version }
      : { soul };
    const reason = targetProcess === "widgetVersion.activate"
      ? `Request activation of ${version || "a shared widget version"} on ${soul || "the shared widget"}`
      : `Request rollback of ${soul || "the shared widget"} to its previous version`;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: widgetVersionProposalId(targetProcess, soul),
        targetProcess,
        targetKind: "widget",
        targetId: soul || null,
        bodyJson: JSON.stringify(body),
        reason
      }
    });
  };
  const widgetVersionProposalStatusMessage = targetProcess => targetProcess === "widgetVersion.rollback"
    ? "Proposed widget version rollback for review."
    : "Proposed widget version activation for review.";
  const widgetVersionDirectStatusMessage = ({ targetProcess, version = null, rolledBackTo = null }) => targetProcess === "widgetVersion.rollback"
    ? `Rolled back to ${rolledBackTo || "the previous version"}.`
    : `Activated ${version || "the requested version"}.`;
  const canvasProposalId = (targetProcess, targetId) => {
    const processPart = String(targetProcess || "canvas.action").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const targetPart = String(targetId || "canvas").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.${processPart}.${targetPart}.${world.allWitnesses().length + 1}`;
  };
  const canvasProposalConfig = ({ process, params = {} }) => {
    switch (process) {
      case "canvas.perspective.create":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Create a shared canvas perspective through witnessed proposal",
              statusMessage: "Proposed canvas perspective for review."
            }
          : null;
      case "canvas.thing.setTitle":
        return params.thing
          ? {
              targetProcess: process,
              targetKind: "thing",
              targetId: params.thing,
              reason: "Rename a shared canvas thing through witnessed proposal",
              statusMessage: "Proposed canvas title update for review."
            }
          : null;
      case "canvas.relate":
        return params.from
          ? {
              targetProcess: process,
              targetKind: "thing",
              targetId: params.from,
              reason: "Create a shared canvas relation through witnessed proposal",
              statusMessage: "Proposed canvas relation for review."
            }
          : null;
      case "canvas.unrelate":
        return params.from
          ? {
              targetProcess: process,
              targetKind: "thing",
              targetId: params.from,
              reason: "Remove a shared canvas relation through witnessed proposal",
              statusMessage: "Proposed canvas relation removal for review."
            }
          : null;
      default:
        return null;
    }
  };
  const createCanvasProposal = ({ actor, process, params = {} }) => {
    const config = canvasProposalConfig({ process, params });
    if (!config) return null;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: canvasProposalId(config.targetProcess, config.targetId),
        targetProcess: config.targetProcess,
        targetKind: config.targetKind,
        targetId: config.targetId,
        bodyJson: JSON.stringify(params),
        reason: config.reason
      }
    });
  };
  return {
    "widgetVersions.activate": async ({ req, res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "activateWidgetVersion.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const version = typeof body.version === "string" ? body.version : null;
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = createWidgetVersionProposal({
            actor: requestActor,
            targetProcess: "widgetVersion.activate",
            soul: params.soul || "",
            version
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            soul: params.soul || "",
            version,
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: widgetVersionProposalStatusMessage("widgetVersion.activate")
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetVersionActivation(world, { actor: requestActor, soul: params.soul || "", version });
      if (result.status === "failed") {
        sendJson(res, 400, { error: result.witness.body?.reason || "unknown widget version", status: result.status, soul: result.soul, version, witness: result.witness });
        return;
      }
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "widget version transition blocked", status: result.status, soul: result.soul, version, witnesses: result.witnesses, witness: result.witness });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        soul: result.soul,
        version,
        witnesses: result.witnesses,
        witness: result.witness,
        statusMessage: widgetVersionDirectStatusMessage({ targetProcess: "widgetVersion.activate", version })
      });
    },

    "widgetVersions.rollback": async ({ res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "widgetVersion.rollback.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = createWidgetVersionProposal({
            actor: requestActor,
            targetProcess: "widgetVersion.rollback",
            soul: params.soul || ""
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            soul: params.soul || "",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: widgetVersionProposalStatusMessage("widgetVersion.rollback")
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = rollbackWidgetVersion(world, { actor: requestActor, soul: params.soul || "" });
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "rollback unavailable", status: result.status, soul: result.soul, witness: result.witness });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        soul: result.soul,
        version: result.version,
        witnesses: result.witnesses,
        witness: result.witness,
        statusMessage: widgetVersionDirectStatusMessage({ targetProcess: "widgetVersion.rollback", rolledBackTo: result.version })
      });
    },

    "page.world": async ({ res, route, appContext }) => {
      const params = route.params ?? {};
      const rootWidget = params.rootWidget ?? null;
      if (!rootWidget) {
        sendJson(res, 404, { error: "world graph page not configured" });
        return;
      }
      world.observe({
        process: "frontend.renderWorldPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || rootWidget)],
        body: { route: route.path }
      });
      const tutorialSurface = widgetPageTutorialSurface(world, {
        route,
        rootWidget,
        frontendProgramId: params.frontendProgram ?? null,
        tutorialPage: "world"
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget,
        frontendProgram: params.frontendProgram ?? null,
        appConfig: {
          actors: requestActors(appContext),
          page: params.page ?? "world",
          liveProjection: params.liveProjection !== false,
          runtimeSurfaces: appContext.runtimeSurfaceEntries ?? [],
          surfaceContext: tutorialSurface.context,
          surfaceRouteId: tutorialSurface.routeId,
          surfaceRootWidgetId: tutorialSurface.rootWidgetId,
          surfaceProgramId: tutorialSurface.frontendProgramId
        }
      }));
    },

    "page.process": async ({ res, route, requestUrl, requestActor, appContext }) => {
      world.emit({
        process: "frontend.renderProcessPage",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || "processView")],
        body: {
          route: route.path || "/process",
          ...processSelection(requestUrl)
        }
      });
      const model = processViewProjection(processViewInputs(requestActor, appContext), processSelection(requestUrl));
      send(res, 200, "text/html", renderProcessPage(model, { currentPath: route.path || "/process" }));
    },

    "witnesses.list": async ({ res, requestUrl, requestActor, appContext }) => {
      const rawOffset = requestUrl.searchParams.get("offset");
      const visible = requestVisibleWitnesses(requestActor, appContext).map(witness => ({
        ...witness,
        bodyJson: JSON.stringify(witness.body ?? {})
      }));
      if (rawOffset === null) {
        world.observe({
          process: "backend.readWitnesses",
          actor: backendHost,
          claims: [relation(backendHost, "read", "witnessLog")],
          body: { count: world.allWitnesses().length }
        });
        sendJson(res, 200, { witnesses: visible, offset: 0, total: visible.length });
        return;
      }
      const offset = Math.max(0, Math.min(visible.length, Number(rawOffset) || 0));
      sendJson(res, 200, { witnesses: visible.slice(offset), offset, total: visible.length });
    },

    "worldGraph.read": async ({ res, requestActor, requestId, appContext }) => {
      world.observe({
        process: "backend.readWorldGraph",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "worldGraph")],
        body: { count: world.allWitnesses().length }
      });
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const graph = worldGraphProjection(visible);
      const ast = astNodesProjection(visible);
      const astNodes = {
        byFile: Object.fromEntries([...ast.byFile.entries()].map(([file, nodes]) => [file, nodes])),
        byTarget: Object.fromEntries([...ast.byTarget.entries()].map(([target, nodes]) => [target, nodes]))
      };
      logger.info("worldGraph.projected", { requestId, witnesses: visible.length, nodes: graph.nodes.length, edges: graph.edges.length });
      sendJson(res, 200, { graph, astNodes });
    },

    "processView.read": async ({ res, requestUrl, requestActor, appContext }) => {
      world.emit({
        process: "backend.readProcessView",
        actor: requestActor || backendHost,
        claims: [],
        body: processSelection(requestUrl)
      });
      const model = processViewProjection(processViewInputs(requestActor, appContext), processSelection(requestUrl));
      sendJson(res, 200, model);
    },

    "processRun.read": async ({ res, requestUrl, requestActor, params, appContext }) => {
      const replay = requestUrl.searchParams.get("replay");
      const run = processRunProjection(processViewInputs(requestActor, appContext), { runId: params.runId || "", replay });
      if (!run) {
        sendJson(res, 404, { error: "process run not found", runId: params.runId || "" });
        return;
      }
      sendJson(res, 200, run);
    },

    "events.stream": async ({ req, res, requestActor, appContext }) => {
      const stream = appContext?.eventsStream;
      if (!stream || typeof stream.open !== "function") {
        sendJson(res, 503, { error: "events stream unavailable" });
        return;
      }
      const opened = stream.open(res, req) ?? {};
      world.observe({
        process: "backend.eventsStream",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "streams", "witnessLog")],
        body: {
          clients: Number.isFinite(opened.clients) ? opened.clients : null,
          serverRunner: opened.serverRunner ?? appContext?.serverRunnerId ?? null
        }
      });
    },

    "processEvents.record": async ({ req, res, requestActor }) => {
      const body = await readJson(req);
      const process = typeof body.process === "string" ? body.process : "";
      if (!frontendTraceProcesses.has(process)) {
        sendJson(res, 400, { error: "unknown process trace", process });
        return;
      }
      const witness = world.emit({
        process,
        actor: requestActor || frontendHost,
        claims: [],
        body: {
          runId: typeof body.runId === "string" ? body.runId : "",
          program: typeof body.program === "string" ? body.program : "",
          event: typeof body.event === "string" ? body.event : "",
          nodeId: typeof body.nodeId === "string" ? body.nodeId : "",
          op: typeof body.op === "string" ? body.op : "",
          status: typeof body.status === "string" ? body.status : "",
          frontier: Array.isArray(body.frontier) ? body.frontier : [],
          repeat: body.repeat ?? null,
          repeatCount: Number.isFinite(body.repeatCount) ? body.repeatCount : null,
          message: typeof body.message === "string" ? body.message : "",
          eventData: body.eventData ?? null,
          timestamp: Number.isFinite(body.timestamp) ? body.timestamp : Date.now()
        }
      });
      sendJson(res, 200, { ok: true, id: witness.id });
    },

    "source.read": async ({ res, requestUrl }) => {
      const requested = requestUrl.searchParams.get("file") || "";
      const allowed = new Set(world.allWitnesses()
        .filter(witness => witness.process === "dsl.source.annotate" && typeof witness.body?.file === "string")
        .map(witness => path.resolve(witness.body.file)));
      const resolvedFile = path.resolve(requested);
      if (!allowed.has(resolvedFile)) {
        world.observe({ process: "backend.readSource.failed", actor: backendHost, claims: [], body: { file: requested, reason: "source file not in witnessed imports" } });
        sendJson(res, 404, { error: "source file not available", file: requested });
        return;
      }
      const text = await fs.readFile(resolvedFile, "utf8");
      world.observe({ process: "backend.readSource", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
      sendJson(res, 200, { file: resolvedFile, text });
    }
  };
}

export function createCanvasBundleHandlers({
  world,
  backendHost,
  frontendHost,
  send,
  sendJson,
  readJson,
  authorityServices,
  requestActors,
  requestVisibleWitnesses
}) {
  const { ensureTargetAuthority, ensureContextAuthority } = authorityServices;
  const perspectiveContextId = perspectiveId => world
    .project(projectors.currentRelations)
    .find(row => row.from === perspectiveId && row.rel === "inContext")
    ?.to ?? null;
  const canvasProposalId = (process, targetId) => `proposal.${process}.${targetId}`;
  const canvasProposalConfig = ({ process, params = {} }) => {
    switch (process) {
      case "canvas.move":
      case "canvas.moveMany":
      case "canvas.batch":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Change shared canvas layout through witnessed proposal",
              statusMessage: "Proposed canvas layout change for review."
            }
          : null;
      case "canvas.place":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Place an existing thing on a shared canvas through witnessed proposal",
              statusMessage: "Proposed canvas placement for review."
            }
          : null;
      case "canvas.style":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Change shared canvas styling through witnessed proposal",
              statusMessage: "Proposed canvas style change for review."
            }
          : null;
      case "canvas.remove":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Remove a shared canvas item through witnessed proposal",
              statusMessage: "Proposed canvas removal for review."
            }
          : null;
      case "canvas.removeMany":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Remove shared canvas items through witnessed proposal",
              statusMessage: "Proposed canvas removals for review."
            }
          : null;
      case "canvas.duplicate":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Duplicate a shared canvas item through witnessed proposal",
              statusMessage: "Proposed canvas duplicate for review."
            }
          : null;
      case "canvas.camera":
      case "canvas.grid":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Adjust shared canvas view settings through witnessed proposal",
              statusMessage: "Proposed canvas view change for review."
            }
          : null;
      case "canvas.createThing":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Create a shared canvas thing through witnessed proposal",
              statusMessage: "Proposed canvas thing for review."
            }
          : null;
      case "canvas.perspective.create":
        return params.context
          ? {
              targetProcess: process,
              targetKind: "context",
              targetId: params.context,
              reason: "Create a shared canvas perspective through witnessed proposal",
              statusMessage: "Proposed canvas perspective for review."
            }
          : null;
      case "canvas.thing.setTitle":
        return params.thing
          ? {
              targetProcess: process,
              targetKind: "thing",
              targetId: params.thing,
              reason: "Rename a shared canvas thing through witnessed proposal",
              statusMessage: "Proposed canvas title update for review."
            }
          : null;
      case "canvas.relate":
        return params.from
          ? {
              targetProcess: process,
              targetKind: "thing",
              targetId: params.from,
              reason: "Create a shared canvas relation through witnessed proposal",
              statusMessage: "Proposed canvas relation for review."
            }
          : null;
      case "canvas.unrelate":
        return params.from
          ? {
              targetProcess: process,
              targetKind: "thing",
              targetId: params.from,
              reason: "Remove a shared canvas relation through witnessed proposal",
              statusMessage: "Proposed canvas relation removal for review."
            }
          : null;
      default:
        return null;
    }
  };
  const createCanvasProposal = ({ actor, process, params = {} }) => {
    const config = canvasProposalConfig({ process, params });
    if (!config) return null;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: canvasProposalId(config.targetProcess, config.targetId),
        targetProcess: config.targetProcess,
        targetKind: config.targetKind,
        targetId: config.targetId,
        bodyJson: JSON.stringify(params),
        reason: config.reason
      }
    });
  };
  return {
    "page.canvas": async ({ res, route, appContext }) => {
      world.observe({
        process: "frontend.renderCanvasPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || "canvasView")],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderCanvasPage({ actors: requestActors(appContext) }));
    },

    "canvas.perspectives.list": async ({ res, requestActor, appContext }) => {
      const perspectives = perspectivesProjection(requestVisibleWitnesses(requestActor, appContext));
      world.observe({
        process: "backend.readPerspectives",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { count: perspectives.length }
      });
      sendJson(res, 200, { perspectives });
    },

    "canvas.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const perspective = requestUrl.searchParams.get("perspective") || "";
      const canvas = canvasProjection(requestVisibleWitnesses(requestActor, appContext), perspective);
      if (!canvas) {
        world.observe({ process: "backend.readCanvas.failed", actor: backendHost, claims: [], body: { perspective, reason: "unknown perspective" } });
        sendJson(res, 404, { error: "unknown perspective", perspective });
        return;
      }
      world.observe({
        process: "backend.readCanvas",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { perspective, instances: canvas.instances.length, connectors: canvas.connectors.length }
      });
      sendJson(res, 200, { canvas });
    },

    "canvas.process": async ({ req, res, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "canvas.process.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const handler = canvasProcessHandlers[body.process];
      if (!handler) {
        world.emit({ process: "canvas.process.failed", actor: requestActor, claims: [], body: { process: body.process, reason: "unknown canvas process" } });
        sendJson(res, 400, { error: "unknown canvas process", process: body.process });
        return;
      }
      if (body.process === "canvas.perspective.create") {
        const contextId = typeof body.params?.context === "string" && body.params.context.trim() ? body.params.context.trim() : null;
        const gate = contextId ? ensureContextAuthority(requestActor, contextId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: body.params ?? {} });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: body.params ?? {} })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      if (body.process === "canvas.createThing") {
        const perspectiveId = typeof body.params?.perspective === "string" && body.params.perspective.trim() ? body.params.perspective.trim() : "";
        const contextId = perspectiveId ? perspectiveContextId(perspectiveId) : null;
        const gate = contextId ? ensureContextAuthority(requestActor, contextId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposalParams = contextId ? { ...(body.params ?? {}), context: contextId } : (body.params ?? {});
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: proposalParams });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: proposalParams })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      if ([
        "canvas.place",
        "canvas.move",
        "canvas.moveMany",
        "canvas.style",
        "canvas.remove",
        "canvas.removeMany",
        "canvas.duplicate",
        "canvas.camera",
        "canvas.grid",
        "canvas.batch"
      ].includes(body.process)) {
        const perspectiveId = typeof body.params?.perspective === "string" && body.params.perspective.trim() ? body.params.perspective.trim() : "";
        const contextId = perspectiveId ? perspectiveContextId(perspectiveId) : null;
        const gate = contextId ? ensureContextAuthority(requestActor, contextId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposalParams = contextId ? { ...(body.params ?? {}), context: contextId } : (body.params ?? {});
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: proposalParams });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: proposalParams })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      if (body.process === "canvas.thing.setTitle" || body.process === "canvas.relate" || body.process === "canvas.unrelate") {
        const targetId = body.process === "canvas.thing.setTitle"
          ? String(body.params?.thing || "").trim()
          : String(body.params?.from || "").trim();
        const gate = targetId ? ensureTargetAuthority(requestActor, targetId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: body.params ?? {} });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: body.params ?? {} })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      const witness = handler(world, { actor: requestActor, ...(body.params ?? {}) });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, Number.isInteger(witness.body?.status) ? witness.body.status : 400, { error: witness.body.reason ?? "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness });
    }
  };
}

export function createMcpBundleHandlers({
  currentMcpServerIndex,
  currentMcpToolInstalls,
  mcpToolAvailable,
  validateMcpOrigin,
  resolveMcpPrincipal,
  readBody,
  headerValue,
  MCP_PROTOCOL_VERSION,
  mcpToolDefinition,
  mcpScopeAllows,
  executeMcpTool,
  invokeRouteHandler,
  sendJson
}) {
  return {
    "mcp.http": async ({ req, res, params, requestActor, requestIdentity, requestSession, appContext }) => {
      const mcpServer = currentMcpServerIndex().byId[params.id || ""] ?? null;
      if (!mcpServer) {
        sendJson(res, 404, { error: "mcp server not found", id: params.id || "" });
        return;
      }
      if (mcpServer.serverRunner !== appContext?.serverRunnerId) {
        sendJson(res, 404, { error: "mcp server not available on this runtime", id: mcpServer.id, serverRunner: mcpServer.serverRunner });
        return;
      }
      const originGate = validateMcpOrigin(req);
      if (!originGate.ok) {
        sendJson(res, 403, { error: originGate.reason });
        return;
      }
      const principal = resolveMcpPrincipal({ req, requestActor, mcpServer, appContext });
      if (!principal.ok) {
        sendJson(res, principal.status || 403, { error: principal.reason || "forbidden" });
        return;
      }
      if (!mcpServer.transports.includes(principal.transport)) {
        sendJson(res, 404, { error: "mcp transport not enabled on server", transport: principal.transport, server: mcpServer.id });
        return;
      }
      if ((req.method || "GET").toUpperCase() === "GET") {
        sendJson(res, 405, { error: "streaming GET not implemented" }, { allow: "POST" });
        return;
      }
      const bodyBuffer = await readBody(req);
      let message = null;
      try {
        message = bodyBuffer.length ? JSON.parse(bodyBuffer.toString("utf8")) : null;
      } catch (error) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `parse error: ${error instanceof Error ? error.message : String(error)}` }
        });
        return;
      }
      if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: { code: -32600, message: "invalid request" }
        });
        return;
      }
      const method = message.method;
      const isNotification = !Object.prototype.hasOwnProperty.call(message, "id");
      const protocolHeader = headerValue(req.headers["mcp-protocol-version"]).trim();
      if (principal.transport === "http" && method !== "initialize" && !protocolHeader) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: isNotification ? null : (message.id ?? null),
          error: {
            code: -32602,
            message: "mcp-protocol-version header required",
            data: { supported: [MCP_PROTOCOL_VERSION] }
          }
        });
        return;
      }
      if (principal.transport === "http" && method !== "initialize" && protocolHeader !== MCP_PROTOCOL_VERSION) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: isNotification ? null : (message.id ?? null),
          error: {
            code: -32602,
            message: "unsupported protocol version",
            data: { supported: [MCP_PROTOCOL_VERSION], requested: protocolHeader }
          }
        });
        return;
      }
      if (method === "initialize") {
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false }
            },
            serverInfo: {
              name: mcpServer.id,
              title: mcpServer.label || mcpServer.id,
              version: "0.36.0"
            },
            instructions: "Witness World MCP server"
          }
        });
        return;
      }
      if (isNotification) {
        res.writeHead(202, {});
        res.end();
        return;
      }
      if (method === "ping") {
        sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result: {} });
        return;
      }
      const installs = currentMcpToolInstalls()
        .filter(row => row.server === mcpServer.id)
        .filter(row => row.actingMode === principal.actingMode)
        .filter(row => mcpToolAvailable(row.tool));
      if (method === "tools/list") {
        const toolRows = installs
          .map(row => mcpToolDefinition(row.tool))
          .filter(Boolean)
          .map(tool => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema
          }));
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            tools: toolRows,
            nextCursor: null
          }
        });
        return;
      }
      if (method === "tools/call") {
        const toolName = typeof message.params?.name === "string" ? message.params.name : "";
        const install = installs.find(row => row.tool === toolName) ?? null;
        if (!install) {
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: "tool not installed for this principal", tool: toolName }, null, 2) }],
              structuredContent: { error: "tool not installed for this principal", tool: toolName },
              isError: true
            }
          });
          return;
        }
        const args = message.params?.arguments && typeof message.params.arguments === "object"
          ? message.params.arguments
          : {};
        const scopeGate = mcpScopeAllows(install, args, appContext);
        if (!scopeGate.ok) {
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: scopeGate.reason, tool: toolName }, null, 2) }],
              structuredContent: { error: scopeGate.reason, tool: toolName },
              isError: true
            }
          });
          return;
        }
        const result = await executeMcpTool(toolName, {
          args,
          appContext,
          callHandler: request => invokeRouteHandler({
            ...request,
            requestActor: principal.actor,
            requestIdentity: requestIdentity?.actor === principal.actor ? requestIdentity : null,
            requestSession: requestSession?.actor === principal.actor ? requestSession : null,
            appContext
          })
        });
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result
        });
        return;
      }
      sendJson(res, 400, {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "method not found" }
      });
    }
  };
}
