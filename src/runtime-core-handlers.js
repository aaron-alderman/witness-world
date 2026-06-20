import { relation } from "./kernel.js";
import {
  APP_PREVIEW_SESSIONS_PATH,
  APP_REVISION_EVENTS_PATH,
  BACKEND_REVISION_EVENTS_PATH,
  APP_SOURCE_WRITE_PATH
} from "./app-snapshot-manager.js";
import { runProcessGraph } from "./process-graph.js";
import {
  grantIdentityActorAssumption,
  moduleProjectorByName,
  moduleProjectors,
  revokeIdentityActorAssumption
} from "./modules.js";
import {
  SUPPORTED_BACKEND_OPS,
  activeBackendProgramDefinition
} from "./backend-programs.js";
import { normalizePathname, readSurfaceMapFromWorld } from "./runtime-surface-shell.js";
import { renderSurfacePage } from "./runtime-surface-page.js";
import { createGuidanceBundleHandlers, guidanceConfigForSession } from "./runtime-guidance.js";
import { renderGuidanceClient } from "./runtime-guidance-client.js";
import {
  AUTHORING_MODE_MCP_ONLY,
  blockedDirectMutationResponse,
  cloneRuntimeAuthoringPolicy,
  createRuntimeAuthoringPolicy,
  defaultRuntimeAuthoringMode
} from "./runtime-authoring-policy.js";
import {
  authSummaryForAuthority,
  identityActorAssumptionGrantHistory,
  normalizeAuthorityTuple,
  resolveSessionAuthorityForIdentity
} from "./runtime-authz.js";
import {
  cloneRuntimeOwnerChain,
  describeMountedRouteOwnership
} from "./runtime-ownership.js";
import { describeMountedRouteGovernance } from "./runtime-governance.js";
import {
  currentPreviewManager,
  previewAwareAppContext,
  resolvePreviewSessionRequest
} from "./runtime-preview.js";

function escapeScriptBody(source) {
  return String(source ?? "").replaceAll("</script", "<\\/script");
}

function injectRuntimeWindowValue(html, globalName, value) {
  const script = `<script>\nwindow[${JSON.stringify(globalName)}] = ${escapeScriptBody(JSON.stringify(value))};\n</script>`;
  return String(html).includes("</body>")
    ? String(html).replace("</body>", `${script}</body>`)
    : `${html}\n${script}`;
}

function escapeBodyAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function injectHtmlBeforeBodyEnd(html, fragment = "") {
  if (!fragment) return html;
  return String(html).includes("</body>")
    ? String(html).replace("</body>", `${fragment}</body>`)
    : `${html}\n${fragment}`;
}

function injectBodyAttributes(html, attrs = {}) {
  const serialized = Object.entries(attrs)
    .map(([key, value]) => {
      const normalizedKey = String(key || "").trim();
      const normalizedValue = String(value || "").trim();
      return normalizedKey && normalizedValue ? `${normalizedKey}="${escapeBodyAttr(normalizedValue)}"` : "";
    })
    .filter(Boolean)
    .join(" ");
  if (!serialized) return html;
  return String(html).replace(/<body(?![^>]*\bdata-surface-context=)([^>]*)>/i, (match, rest) => `<body${rest} ${serialized}>`);
}

function resolveGuidanceRuntimeContributions(primary = null, fallback = null) {
  const primaryCount = Array.isArray(primary?.guidanceDefinitions) ? primary.guidanceDefinitions.length : 0;
  if (primaryCount > 0) return primary;
  const fallbackCount = Array.isArray(fallback?.guidanceDefinitions) ? fallback.guidanceDefinitions.length : 0;
  return fallbackCount > 0 ? fallback : primary;
}

function injectPreviewSessionClient(html, {
  previewSessionId,
  previewRevision = 0,
  debugSessionId = null
} = {}) {
  if (!previewSessionId) return html;
  const script = `<script>
(() => {
  const previewSessionId = ${JSON.stringify(previewSessionId)};
  const currentRevision = ${JSON.stringify(Number(previewRevision || 0))};
  const debugSessionId = ${JSON.stringify(debugSessionId)};
  if (!previewSessionId || typeof EventSource !== "function") return;
  const path = ${JSON.stringify(APP_PREVIEW_SESSIONS_PATH)} + "/" + encodeURIComponent(previewSessionId) + "/events";
  const source = new EventSource(path);
  const clearPreviewQueryAndReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("previewSessionId");
    if (debugSessionId) url.searchParams.delete("debugSessionId");
    window.location.assign(url.toString());
  };
  source.onmessage = event => {
    try {
      const payload = JSON.parse(event.data || "{}");
      if (payload.status === "deleted") {
        source.close();
        clearPreviewQueryAndReload();
        return;
      }
      if (payload.status === "stale") {
        source.close();
        window.location.reload();
        return;
      }
      if (Number(payload.previewRevision || 0) <= currentRevision) return;
      source.close();
      window.location.reload();
    } catch {}
  };
  source.onerror = () => {
    try { source.close(); } catch {}
  };
})();
</script>`;
  return String(html).includes("</body>")
    ? String(html).replace("</body>", `${script}</body>`)
    : `${html}\n${script}`;
}

function renderPreviewSessionStatePage({
  title,
  heading,
  detail,
  currentPath = "/"
} = {}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { font: 14px/1.5 system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 760px; margin: 10vh auto; padding: 24px; }
      .card { border: 1px solid rgba(148,163,184,.28); border-radius: 16px; background: rgba(15,23,42,.92); padding: 24px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 16px; color: #cbd5e1; }
      a { color: #93c5fd; }
      code { color: #f8fafc; }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>${heading}</h1>
        <p>${detail}</p>
        <p><a href="${currentPath}">Return to the live app</a></p>
      </div>
    </main>
  </body>
</html>`;
}

function normalizeSourceryMuteRules(value) {
  return Array.isArray(value)
    ? value
      .filter(rule => rule && typeof rule === "object")
      .map(rule => ({
        scopeKind: typeof rule.scopeKind === "string" ? rule.scopeKind.trim().toLowerCase() : "context",
        scopeId: typeof rule.scopeId === "string" && rule.scopeId.trim() ? rule.scopeId.trim() : null,
        durationKind: typeof rule.durationKind === "string" && rule.durationKind.trim() ? rule.durationKind.trim() : null,
        expiresAt: typeof rule.expiresAt === "string" && rule.expiresAt.trim() ? rule.expiresAt.trim() : null,
        permanent: rule.permanent === true
      }))
    : [];
}

function muteRuleIsActive(rule) {
  if (!rule) return false;
  if (rule.permanent === true) return true;
  if (!rule.expiresAt) return false;
  const expiresAt = Date.parse(rule.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function sourceryMutedForContext(rules = [], {
  appId = null,
  rootSurfaceId = null,
  routeId = null,
  pathname = null
} = {}) {
  const contextIds = new Set([rootSurfaceId, routeId, pathname].filter(Boolean).map(String));
  for (const rule of normalizeSourceryMuteRules(rules)) {
    if (!muteRuleIsActive(rule)) continue;
    if (rule.scopeKind === "global") return true;
    if (rule.scopeKind === "app" && rule.scopeId && rule.scopeId === appId) return true;
    if ((rule.scopeKind === "surface" || rule.scopeKind === "context") && rule.scopeId && contextIds.has(rule.scopeId)) {
      return true;
    }
  }
  return false;
}

function runtimeMutationsBlocked(appContext) {
  return appContext?.runtimeSupervision?.mutationsEnabled === false;
}

function runtimeDrainingPayload(appContext) {
  return {
    error: "runtime draining",
    instanceId: appContext?.runtimeSupervision?.instanceId ?? null,
    role: appContext?.runtimeSupervision?.role ?? null
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
  syncSessionAuthSummary,
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
  authorityServices = {},
  invokeRouteHandler,
  supportedBackendOps = SUPPORTED_BACKEND_OPS,
  coreHooks = {},
  runtimeContributions = null,
  appSnapshotManager = null,
  currentAppRenderWorld = null
}) {
  const witnessCount = () => typeof world?.witnessCount === "function"
    ? Number(world.witnessCount() || 0)
    : Number(world?.allWitnesses?.().length || 0);
  const {
    requireBootstrapActor = actor => actor ? { ok: true, actor, bootstrapException: false } : { ok: false, status: 401, reason: "sign in first" },
    ensureIdentityAuthority = () => ({ ok: false, status: 403, reason: "identity authority unavailable" })
  } = authorityServices ?? {};
  const witnessesSince = index => typeof world?.witnessesSince === "function"
    ? world.witnessesSince(index)
    : world?.allWitnesses?.().slice(index) ?? [];
  const sessionOpenResponsePayloadHook = coreHooks.sessionOpenResponsePayload
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
  const normalizeWitnessClaims = claims => Array.isArray(claims)
    ? claims.flatMap(claim => {
        if (!claim || typeof claim !== "object") return [];
        if (claim.op === "thing") {
          const thingId = typeof claim.thing === "string" && claim.thing.trim() ? claim.thing.trim() : "";
          return thingId ? [{ op: "thing", thing: thingId }] : [];
        }
        if (claim.op === "relation") {
          const from = typeof claim.from === "string" && claim.from.trim() ? claim.from.trim() : "";
          const rel = typeof claim.rel === "string" && claim.rel.trim() ? claim.rel.trim() : "";
          const to = typeof claim.to === "string" && claim.to.trim() ? claim.to.trim() : "";
          if (!from || !rel || !to) return [];
          return [relation(from, rel, to, claim.meta && typeof claim.meta === "object" ? claim.meta : {})];
        }
        return [];
      })
    : [];
  const normalizedRequestAuthority = ({
    requestActor = null,
    requestIdentity = null,
    requestSession = null
  } = {}) => requestSession
    ? normalizeAuthorityTuple(requestSession, { allowAliases: true })
    : normalizeAuthorityTuple({
        authenticatedIdentity: requestIdentity?.id ?? requestIdentity ?? null,
        authenticatedActor: requestActor,
        effectiveIdentity: requestIdentity?.id ?? requestIdentity ?? null,
        effectiveActor: requestActor,
        authorityMode: "direct"
      });
  const authorityGrantReadShape = grantRow => {
    if (!grantRow) return null;
    const identityIndex = currentIdentityIndex();
    const identity = grantRow.identityId ? (identityIndex.byId[grantRow.identityId] ?? null) : null;
    const targetIdentity = grantRow.targetActor ? (identityIndex.byActor[grantRow.targetActor]?.[0] ?? null) : null;
    return {
      id: grantRow.id,
      identityId: grantRow.identityId,
      targetActor: grantRow.targetActor,
      active: grantRow.active === true,
      status: grantRow.active === true ? "active" : "revoked",
      identity: identity ? {
        id: identity.id,
        actor: identity.actor,
        label: identity.label ?? null,
        username: identity.username ?? null
      } : null,
      targetIdentity: targetIdentity ? {
        id: targetIdentity.id,
        actor: targetIdentity.actor,
        label: targetIdentity.label ?? null,
        username: targetIdentity.username ?? null
      } : null,
      grantedWitnessId: grantRow.grantedWitnessId ?? null,
      grantedBy: grantRow.grantedBy ?? null,
      revokedWitnessId: grantRow.revokedWitnessId ?? null,
      revokedBy: grantRow.revokedBy ?? null
    };
  };
  const backendSessionShape = requestSession => {
    if (!requestSession) {
      return {
        authenticated: false,
        actor: null,
        identity: null,
        authenticatedIdentity: null,
        authenticatedActor: null,
        effectiveIdentity: null,
        effectiveActor: null,
        authorityMode: "direct",
        assumptionGrantId: null,
        label: null,
        perspective: null
      };
    }
    const authority = normalizeAuthorityTuple(requestSession, { allowAliases: true });
    return {
      authenticated: true,
      actor: authority.effectiveActor ?? null,
      identity: authority.effectiveIdentity ?? null,
      authenticatedIdentity: authority.authenticatedIdentity ?? null,
      authenticatedActor: authority.authenticatedActor ?? null,
      effectiveIdentity: authority.effectiveIdentity ?? null,
      effectiveActor: authority.effectiveActor ?? null,
      authorityMode: authority.authorityMode ?? "direct",
      assumptionGrantId: authority.assumptionGrantId ?? null,
      label: requestSession.label ?? null,
      perspective: requestSession.perspective ?? null
    };
  };
  const devHtmlHeaders = appContext => appContext?.devMode ? { "cache-control": "no-cache" } : {};
  const resolveSessionOpenRouteKey = (body, summary) => {
    const defaultRouteKey = typeof body?.defaultRouteKey === "string" && body.defaultRouteKey.trim()
      ? body.defaultRouteKey.trim()
      : "home";
    const pendingRouteKey = typeof body?.pendingRouteKey === "string" && body.pendingRouteKey.trim()
      ? body.pendingRouteKey.trim()
      : "";
    const pendingFeatureId = typeof body?.pendingFeatureId === "string" && body.pendingFeatureId.trim()
      ? body.pendingFeatureId.trim()
      : "";
    if (!pendingRouteKey || !pendingFeatureId) return defaultRouteKey;
    const access = summary?.featureAccess?.[pendingFeatureId] ?? "granted";
    if (access === "granted") return pendingRouteKey;
    if (access === "hidden") {
      return typeof body?.notFoundRouteKey === "string" && body.notFoundRouteKey.trim()
        ? body.notFoundRouteKey.trim()
        : defaultRouteKey;
    }
    if (access === "locked") {
      return typeof body?.forbiddenRouteKey === "string" && body.forbiddenRouteKey.trim()
        ? body.forbiddenRouteKey.trim()
        : defaultRouteKey;
    }
    return defaultRouteKey;
  };
  const appRenderWorld = appContext => appContext?.appSnapshotManager?.getActiveSnapshot()?.world
    ?? (typeof currentAppRenderWorld === "function" ? currentAppRenderWorld() : null)
    ?? world;
  const resolvePreviewManager = async appContext => {
    const existingManager = currentPreviewManager(appContext);
    if (existingManager) return existingManager;
    if (appContext?.appSnapshotManagerReady && typeof appContext.appSnapshotManagerReady.then === "function") {
      try {
        await appContext.appSnapshotManagerReady;
      } catch {}
    }
    return currentPreviewManager(appContext);
  };
  const withLatestWitnessCoreState = status => {
    if (!status || typeof status !== "object") return null;
    const latestState = typeof status?.serving?.latestGenerationState === "string"
      ? status.serving.latestGenerationState
      : (typeof status?.latestState === "string"
          ? status.latestState
          : (typeof status?.state === "string" ? status.state : null));
    return {
      ...status,
      latestState
    };
  };
  const currentWitnessCoreStatus = async appContext => {
    const store = appContext?.witnessCoreStatusStore ?? null;
    if (typeof store?.refresh === "function") {
      try {
        return withLatestWitnessCoreState(await store.refresh());
      } catch {}
    }
    if (typeof store?.getStatus === "function") {
      return withLatestWitnessCoreState(store.getStatus());
    }
    return null;
  };
  const latestPublishedGreenGenerationId = status => {
    const generations = Array.isArray(status?.generations) ? status.generations : [];
    for (let index = generations.length - 1; index >= 0; index -= 1) {
      const generation = generations[index];
      const id = typeof generation?.id === "string" ? generation.id.trim() : "";
      if (!id || id.startsWith("preview-")) continue;
      if (generation?.state === "green_local") return id;
    }
    return null;
  };
  const maybeInjectDevClient = (html, appContext) => {
    const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
    if (!snapshotManager || appContext?.devMode !== true) return html;
    return snapshotManager.injectDevClient(html, snapshotManager.getActiveSnapshot());
  };
  const companionConfigForSurfaceRequest = ({
    rootSurfaceId,
    route,
    requestUrl,
    requestSession,
    appContext,
    previewSession = null
  } = {}) => {
    if (rootSurfaceId !== "EngentusRoot") return null;
    const featureAccess = requestSession?.featureAccess ?? {};
    const canOpenDebug = (
      featureAccess["engentus.platform_config"]
      ?? requestSession?.featureAccess__engentus_platform_config
    ) === "granted";
    const identityId = requestSession?.effectiveIdentity
      ?? requestSession?.identity
      ?? requestSession?.authenticatedIdentity
      ?? null;
    const identity = identityId ? (currentIdentityIndex()?.byId?.[identityId] ?? null) : null;
    const appId = appContext?.requestSnapshot?.appProject?.appId
      ?? appContext?.appSnapshotManager?.getActiveSnapshot?.()?.appProject?.appId
      ?? "engentus";
    const sourceryVisible = !sourceryMutedForContext(identity?.sourceryMuteRules ?? [], {
      appId,
      rootSurfaceId,
      routeId: route?.id ?? null,
      pathname: requestUrl?.pathname ?? route?.path ?? "/"
    });
    return {
      appId,
      rootSurfaceId,
      routeId: route?.id ?? null,
      pathname: requestUrl?.pathname ?? route?.path ?? "/",
      previewSessionId: previewSession?.id ?? null,
      previewRevision: previewSession?.previewRevision ?? 0,
      wcssPreviewSessionId: requestUrl?.searchParams?.get("wcssPreview")?.trim() || null,
      debugSessionId: requestUrl?.searchParams?.get("debugSessionId")?.trim() || null,
      canOpenDebug,
      sourceryVisible
    };
  };
  const backendProcessRequestHandler = processId => {
    const id = typeof processId === "string" && processId.trim() ? processId.trim() : "";
    return id ? (runtimeContributions?.backendProcessRequestHandlers?.[id] ?? null) : null;
  };
  const normalizeBackendProcessRequestResult = (processId, result) => {
    if (result && typeof result === "object") {
      const status = Number.isInteger(result.status)
        ? result.status
        : (result.ok === false ? 500 : 200);
      return {
        ok: result.ok !== false,
        status,
        payload: Object.prototype.hasOwnProperty.call(result, "payload") ? result.payload : null,
        error: typeof result.error === "string" && result.error.trim() ? result.error.trim() : null
      };
    }
    return {
      ok: false,
      status: 500,
      payload: null,
      error: `process ${processId} returned an invalid result`
    };
  };
  const revisionEventFrame = payload => `data: ${JSON.stringify(payload)}\n\n`;
  const backendRevisionEventPayload = event => ({
    revision: Number(event?.revision ?? event?.appRevision ?? 0),
    branch: event?.branchId ? String(event.branchId) : null,
    changeSet: event?.changeSetId ? String(event.changeSetId) : null,
    trigger: String(event?.trigger || "initial"),
    changedSources: Array.isArray(event?.changedSources) ? event.changedSources.map(String) : [],
    status: String(event?.status || "active")
  });
  const currentAuthoringPolicy = appContext => cloneRuntimeAuthoringPolicy(
    appContext?.runtimeAuthoringPolicy
    ?? createRuntimeAuthoringPolicy({
      mode: defaultRuntimeAuthoringMode({
        runtimeStartupMode: appContext?.runtimeStartupMode ?? "serve"
      })
    })
  );
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
    const previewSessionId = requestUrl?.searchParams?.get("previewSessionId")?.trim() || null;
    const previewManager = await resolvePreviewManager(appContext);
    if (previewManager && previewSessionId && typeof previewManager.hydrateSession === "function") {
      await previewManager.hydrateSession(previewSessionId);
    }
    const previewRequest = resolvePreviewSessionRequest({ appContext, requestUrl });
    if (!previewRequest.ok && previewRequest.reason === "stale") {
      sendJson(res, 409, {
        error: previewRequest.session?.invalidReason || "preview no longer matches the active snapshot",
        previewSession: previewRequest.session ?? null
      });
      return;
    }
    const requestWorld = previewRequest.ok
      ? previewRequest.world
      : world;
    const requestAppContext = previewRequest.ok
      ? previewAwareAppContext(appContext, requestWorld)
      : appContext;
    const requestWitnessCount = () => typeof requestWorld?.witnessCount === "function"
      ? Number(requestWorld.witnessCount() || 0)
      : Number(requestWorld?.allWitnesses?.().length || 0);
    const requestWitnessesSince = index => typeof requestWorld?.witnessesSince === "function"
      ? requestWorld.witnessesSince(index)
      : requestWorld.allWitnesses().slice(Number(index || 0));
    const soul = route?.params?.backendProgramSoul ?? null;
    const program = soul ? activeBackendProgramDefinition(requestWorld.allWitnesses(), soul) : null;
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
    const recordTrace = (process, body = {}) => requestWorld.observe({
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
        const witnessCountBefore = requestWitnessCount();
        const result = await invokeRouteHandler({
          handler,
          method: typeof params.method === "string" && params.method.trim() ? params.method.trim().toUpperCase() : "POST",
          path: requestPath,
          query: {
            ...(params.query && typeof params.query === "object" ? params.query : {}),
            ...(previewRequest.previewSessionId ? { previewSessionId: previewRequest.previewSessionId } : {})
          },
          params: params.params && typeof params.params === "object" ? params.params : {},
          body: requestBody,
          requestActor,
          requestIdentity,
          requestSession,
          appContext: requestAppContext,
          route: {
            id: `${route?.id || "backend-program-route"}:${handler}`,
            path: requestPath,
            handler,
            params: params.params && typeof params.params === "object" ? params.params : {}
          }
        });
        const emittedWitnesses = requestWitnessesSince(witnessCountBefore);
        const failedWitnesses = emittedWitnesses.filter(witness => witness.process.endsWith(".failed") || witness.process.endsWith(".blocked"));
        requestWorld.observe({
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
      if (step.op === "process.request") {
        const processId = typeof params.process === "string" && params.process.trim() ? params.process.trim() : "";
        if (!processId) throw new Error("process.request requires process");
        const handler = backendProcessRequestHandler(processId);
        if (typeof handler !== "function") throw new Error(`unknown backend process requester ${processId}`);
        const requestBody = Object.prototype.hasOwnProperty.call(params, "body")
          ? params.body
          : (typeof params.from === "string" && params.from.trim() ? readPath(stateRef, params.from.trim()) : null);
        const witnessCountBefore = requestWitnessCount();
        const normalizedResult = normalizeBackendProcessRequestResult(processId, await handler({
          world: requestWorld,
          backendHost,
          frontendHost,
          process: processId,
          body: requestBody,
          params,
          requestActor,
          requestIdentity,
          requestSession,
          route,
          appContext: requestAppContext
        }));
        const emittedWitnesses = requestWitnessesSince(witnessCountBefore);
        const failedWitnesses = emittedWitnesses.filter(witness => witness.process.endsWith(".failed") || witness.process.endsWith(".blocked"));
        requestWorld.observe({
          process: "backend.request.finish",
          actor: requestActor || backendHost,
          claims: [],
          body: {
            requestId: `${runId}:${step.id}:${processId}`,
            method: "PROCESS",
            url: `process:${processId}`,
            statusCode: normalizedResult.status || 0,
            route: null,
            handler: null,
            process: processId,
            runId,
            stepId: step.id,
            emittedWitnessIds: emittedWitnesses.map(witness => witness.id),
            failureWitnessIds: failedWitnesses.map(witness => witness.id)
          }
        });
        const into = typeof params.into === "string" && params.into.trim() ? params.into.trim() : "lastResponse";
        writePath(stateRef, into, normalizedResult);
        if ((normalizedResult.status || 500) >= 400 && params.allowFailure !== true) {
          throw new Error(normalizedResult.error || `process ${processId} failed`);
        }
        return;
      }
      if (step.op === "project.read") {
        const projectorName = typeof params.projector === "string" && params.projector.trim() ? params.projector.trim() : "";
        if (!projectorName) throw new Error("project.read requires projector");
        const projector = moduleProjectorByName(projectorName, {
          fallback: () => {
            throw new Error(`unknown module projector ${projectorName}`);
          }
        });
        const projectionOptions = params.options && typeof params.options === "object"
          ? { ...params.options }
          : {};
        if (!Object.prototype.hasOwnProperty.call(projectionOptions, "requestActor")) projectionOptions.requestActor = requestActor ?? null;
        if (!Object.prototype.hasOwnProperty.call(projectionOptions, "requestIdentity")) projectionOptions.requestIdentity = requestIdentity ?? null;
        if (!Object.prototype.hasOwnProperty.call(projectionOptions, "requestSession")) projectionOptions.requestSession = requestSession ?? null;
        if (!Object.prototype.hasOwnProperty.call(projectionOptions, "appContext")) projectionOptions.appContext = requestAppContext ?? null;
        if (!Object.prototype.hasOwnProperty.call(projectionOptions, "observations")) projectionOptions.observations = requestWorld.allObservations();
        const requestId = `${runId}:${step.id}:${projectorName}`;
        try {
          const value = requestWorld.project(projector, projectionOptions);
          requestWorld.observe({
            process: "backend.request.finish",
            actor: requestActor || backendHost,
            claims: [],
            body: {
              requestId,
              method: "PROJECT",
              url: `project:${projectorName}`,
              statusCode: 200,
              route: null,
              handler: null,
              projector: projectorName,
              runId,
              stepId: step.id,
              emittedWitnessIds: [],
              failureWitnessIds: []
            }
          });
          const into = typeof params.into === "string" && params.into.trim() ? params.into.trim() : "projectionResult";
          writePath(stateRef, into, value);
          return;
        } catch (error) {
          requestWorld.observe({
            process: "backend.request.finish",
            actor: requestActor || backendHost,
            claims: [],
            body: {
              requestId,
              method: "PROJECT",
              url: `project:${projectorName}`,
              statusCode: 500,
              route: null,
              handler: null,
              projector: projectorName,
              runId,
              stepId: step.id,
              emittedWitnessIds: [],
              failureWitnessIds: []
            }
          });
          throw error;
        }
      }
      if (step.op === "witness.emit") {
        const process = typeof params.process === "string" && params.process.trim() ? params.process.trim() : "";
        if (!process) throw new Error("witness.emit requires process");
        const actor = typeof params.actor === "string" && params.actor.trim()
          ? params.actor.trim()
          : (requestActor || backendHost);
        const body = params.body && typeof params.body === "object" ? params.body : {};
        const witness = requestWorld.emit({
          process,
          actor,
          claims: normalizeWitnessClaims(params.claims),
          body
        });
        const into = typeof params.into === "string" && params.into.trim() ? params.into.trim() : "";
        if (into) writePath(stateRef, into, witness);
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
      const authoritySummary = requestSession
        ? authSummaryForAuthority(world, requestSession)
        : authSummaryForAuthority(world, {
            authenticatedActor: requestActor,
            effectiveActor: requestActor,
            effectiveIdentity: requestIdentity
          });
      world.observe({
        process: "session.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          authenticated: Boolean(requestSession),
          identity: requestIdentity || null,
          actor: requestActor || null,
          authenticatedIdentity: authoritySummary.authenticatedIdentity?.id ?? null,
          authenticatedActor: authoritySummary.authenticatedActor ?? null,
          effectiveIdentity: authoritySummary.effectiveIdentity?.id ?? null,
          effectiveActor: authoritySummary.effectiveActor ?? null,
          authorityMode: authoritySummary.authorityMode ?? "direct",
          assumptionGrantId: authoritySummary.assumptionGrantId ?? null
        }
      });
      if (!requestSession) {
        sendJson(res, 200, {
          authenticated: false,
          identity: null,
          actor: null,
          authenticatedIdentity: null,
          authenticatedActor: null,
          effectiveIdentity: null,
          effectiveActor: null,
          authorityMode: "direct",
          assumptionGrantId: null,
          label: null,
          authenticatedLabel: null,
          effectiveLabel: null,
          profile: { displayName: null, jobTitle: null, initials: null },
          authenticatedProfile: { displayName: null, jobTitle: null, initials: null },
          effectiveProfile: { displayName: null, jobTitle: null, initials: null },
          roles: [],
          featureAccess: {},
          homeContext: null,
          perspective: null,
          authenticatedHomeContext: null,
          authenticatedPerspective: null,
          effectiveHomeContext: null,
          effectivePerspective: null
        });
        return;
      }
      const syncedSession = authoritySummary?.effectiveActor
        ? (syncSessionAuthSummary?.(requestSession, authoritySummary) ?? requestSession)
        : requestSession;
      sendJson(res, 200, sessionResponseShape(syncedSession));
    },

    "session.open": async ({ req, res, appContext }) => {
      const body = await readJson(req);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const assumeActor = typeof body.assumeActor === "string" ? body.assumeActor.trim() : "";
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
      const authority = resolveSessionAuthorityForIdentity(world, identity, { assumeActor });
      if (!authority.ok) {
        world.emit({
          process: "session.open.failed",
          actor: identity.actor,
          claims: [],
          body: {
            username,
            assumeActor: assumeActor || null,
            reason: authority.reason
          }
        });
        sendJson(res, Number(authority.status || 403), { error: authority.reason || "assumption denied" });
        return;
      }
      const session = createSessionForIdentity({
        ...identity,
        displayName: authority.authenticatedIdentity?.displayName ?? identity.displayName ?? null,
        jobTitle: authority.authenticatedIdentity?.jobTitle ?? identity.jobTitle ?? null,
        initials: authority.authenticatedIdentity?.initials ?? identity.initials ?? null
      }, authority);
      const syncedSession = syncSessionAuthSummary?.(session, authority) ?? session;
      const resumeRouteKey = resolveSessionOpenRouteKey(body, authority);
      const additionalSessionOpenPayload = await Promise.resolve(sessionOpenResponsePayloadHook({
        req,
        res,
        body,
        world,
        appContext: appContext ?? null,
        identity,
        authority,
        session,
        syncedSession,
        resumeRouteKey
      })) ?? {};
      world.emit({
        process: "session.open",
        actor: identity.actor,
        claims: [
          relation(identity.id, "authenticatedAs", identity.actor),
          ...(identity.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
        ],
        body: {
          identity: syncedSession.identity ?? null,
          actor: syncedSession.actor ?? null,
          authenticatedIdentity: syncedSession.authenticatedIdentity ?? null,
          authenticatedActor: syncedSession.authenticatedActor ?? null,
          effectiveIdentity: syncedSession.effectiveIdentity ?? null,
          effectiveActor: syncedSession.effectiveActor ?? null,
          authorityMode: syncedSession.authorityMode ?? "direct",
          assumptionGrantId: syncedSession.assumptionGrantId ?? null,
          label: syncedSession.label ?? identity.label,
          homeContext: syncedSession.homeContext ?? null,
          perspective: syncedSession.perspective ?? null,
          resumeRouteKey
        }
      });
      sendJson(res, 200, {
        ...sessionResponseShape(syncedSession),
        ...(additionalSessionOpenPayload && typeof additionalSessionOpenPayload === "object" ? additionalSessionOpenPayload : {}),
        resumeRouteKey
      }, { "set-cookie": sessionCookieHeader(syncedSession.id) });
    },

    "session.logout": async ({ res, requestSession, requestActor }) => {
      const authority = normalizedRequestAuthority({ requestActor, requestSession });
      if (requestSession?.id) sessionStore.delete(requestSession.id);
      world.emit({
        process: "session.logout",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          identity: authority.effectiveIdentity ?? null,
          actor: authority.effectiveActor ?? requestActor ?? null,
          authenticatedIdentity: authority.authenticatedIdentity ?? null,
          authenticatedActor: authority.authenticatedActor ?? null,
          effectiveIdentity: authority.effectiveIdentity ?? null,
          effectiveActor: authority.effectiveActor ?? null,
          authorityMode: authority.authorityMode ?? "direct",
          assumptionGrantId: authority.assumptionGrantId ?? null,
          perspective: requestSession?.perspective ?? null
        }
      });
      sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookieHeader() });
    },

    "authority.grants.read": async ({ res, requestActor, requestUrl }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendJson(res, gate.status || 401, { error: gate.reason || "sign in first" });
        return;
      }
      const identityId = requestUrl?.searchParams?.get("identity")?.trim() || "";
      const targetActor = requestUrl?.searchParams?.get("actor")?.trim() || "";
      const grants = identityActorAssumptionGrantHistory(world, {
        identityId: identityId || null,
        targetActor: targetActor || null
      }).map(authorityGrantReadShape);
      world.observe({
        process: "authority.grants.read",
        actor: gate.actor,
        claims: [],
        body: {
          identityId: identityId || null,
          targetActor: targetActor || null,
          count: grants.length
        }
      });
      sendJson(res, 200, {
        grants,
        filters: {
          identity: identityId || null,
          actor: targetActor || null
        }
      });
    },

    "authority.grants.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendJson(res, gate.status || 401, { error: gate.reason || "sign in first" });
        return;
      }
      const body = await readJson(req);
      const identityId = typeof body?.identityId === "string" && body.identityId.trim()
        ? body.identityId.trim()
        : "";
      const targetActor = typeof body?.targetActor === "string" && body.targetActor.trim()
        ? body.targetActor.trim()
        : "";
      if (!identityId || !targetActor) {
        sendJson(res, 400, { error: "identityId and targetActor are required" });
        return;
      }
      const identityGate = ensureIdentityAuthority(gate.actor, identityId);
      if (!identityGate.ok) {
        sendJson(res, identityGate.status || 403, { error: identityGate.reason || "forbidden" });
        return;
      }
      const existingGrant = identityActorAssumptionGrantHistory(world, {
        identityId,
        targetActor
      }).at(-1) ?? null;
      if (existingGrant?.active === true) {
        sendJson(res, 409, {
          error: "assumption grant already active",
          grant: authorityGrantReadShape(existingGrant)
        });
        return;
      }
      const witness = grantIdentityActorAssumption(world, {
        actor: gate.actor,
        identityId,
        targetActor
      });
      const grant = authorityGrantReadShape(identityActorAssumptionGrantHistory(world, {
        identityId,
        targetActor
      }).at(-1) ?? null);
      world.observe({
        process: "authority.grants.create",
        actor: gate.actor,
        claims: [],
        body: {
          id: grant?.id ?? `${identityId}=>${targetActor}`,
          identityId,
          targetActor
        }
      });
      sendJson(res, 201, { grant, witness });
    },

    "authority.grants.revoke": async ({ res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendJson(res, gate.status || 401, { error: gate.reason || "sign in first" });
        return;
      }
      const grantId = typeof params?.grantId === "string" && params.grantId.trim()
        ? params.grantId.trim()
        : "";
      const existingGrant = identityActorAssumptionGrantHistory(world, { grantId }).at(-1) ?? null;
      if (!existingGrant) {
        sendJson(res, 404, { error: "authority grant not found", id: grantId || null });
        return;
      }
      const identityGate = ensureIdentityAuthority(gate.actor, existingGrant.identityId);
      if (!identityGate.ok) {
        sendJson(res, identityGate.status || 403, { error: identityGate.reason || "forbidden" });
        return;
      }
      let witness = null;
      if (existingGrant.active === true) {
        witness = revokeIdentityActorAssumption(world, {
          actor: gate.actor,
          identityId: existingGrant.identityId,
          targetActor: existingGrant.targetActor
        });
      }
      const grant = authorityGrantReadShape(identityActorAssumptionGrantHistory(world, { grantId }).at(-1) ?? existingGrant);
      world.observe({
        process: "authority.grants.revoke",
        actor: gate.actor,
        claims: [],
        body: {
          id: grant?.id ?? existingGrant.id,
          identityId: existingGrant.identityId,
          targetActor: existingGrant.targetActor,
          changed: existingGrant.active === true
        }
      });
      sendJson(res, 200, {
        grant,
        changed: existingGrant.active === true,
        witness
      });
    },

    "backendProgram.run": async args => {
      await executeBackendProgramRoute(args);
    },

    "page.surface": async ({ res, route, requestUrl, requestSession, appContext }) => {
      const rootSurfaceId = route?.params?.rootSurface ?? null;
      const pageStatus = Number(route?.params?.responseStatus ?? 200) || 200;
      if (!rootSurfaceId) {
        sendJson(res, 404, { error: "surface page not configured", route: route?.id ?? null });
        return;
      }
      const previewSessionId = requestUrl?.searchParams?.get("previewSessionId")?.trim() || null;
      const previewManager = await resolvePreviewManager(appContext);
      if (previewManager && previewSessionId && typeof previewManager.hydrateSession === "function") {
        await previewManager.hydrateSession(previewSessionId);
      }
      const previewResolution = resolvePreviewSessionRequest({ appContext, requestUrl });
      if (!previewResolution.ok && previewResolution.reason === "stale") {
        send(
          res,
          409,
          "text/html",
          renderPreviewSessionStatePage({
            title: "Preview Stale",
            heading: "Preview no longer matches the active snapshot",
            detail: previewResolution.session?.invalidReason || "The active app snapshot changed while the preview session was open.",
            currentPath: normalizePathname(requestUrl?.pathname ?? route?.path ?? "/")
          }),
          devHtmlHeaders(appContext)
        );
        return;
      }
      const renderWorld = previewResolution.ok
        ? previewResolution.world
        : appRenderWorld(appContext);
      const html = renderSurfacePage(renderWorld, {
        rootSurfaceId,
        requestPathname: normalizePathname(requestUrl?.pathname ?? route?.path ?? "/"),
        route,
        stylesheetQuery: {
          wcssPreview: requestUrl?.searchParams?.get("wcssPreview")?.trim() || null
        },
        browserRuntimeCapabilities: (appContext?.runtimeContributions?.capabilityDefinitions ?? [])
          .map(definition => typeof definition?.id === "string" ? definition.id : "")
          .filter(Boolean),
        runtimePreloads: [
          ...renderWorld.project(moduleProjectors.runtimePreloads),
          ...((Array.isArray(route?.params?.preloadPolicies) ? route.params.preloadPolicies : []).map(policy => structuredClone(policy)))
        ],
        routeStateDescriptor: route?.params?.routeState ?? null,
        queryBindings: route?.params?.queryBindings ?? [],
        initialStateOverrides: route?.params?.initialStateOverrides ?? null,
        surfaceCapabilityRenderers: appContext?.runtimeContributions?.surfaceCapabilityRenderers ?? [],
        capabilityPreloadProviders: appContext?.runtimeContributions?.capabilityPreloadProviders ?? [],
        surfaceRuntimeSupportAssets: appContext?.runtimeContributions?.surfaceRuntimeSupportAssets ?? [],
        devMode: appContext?.devMode === true,
        witnessCoreUrl: appContext?.witnessCoreUrl ?? null
      });
      if (!html) {
        sendJson(res, 404, { error: "surface page not found", rootSurface: rootSurfaceId });
        return;
      }
      let responseHtml = html;
      const surfaceGuidance = guidanceConfigForSession({
        requestSession,
        tutorialProgressFor,
        guidanceProgressFor,
        runtimeContributions: resolveGuidanceRuntimeContributions(
          appContext?.runtimeContributions ?? null,
          runtimeContributions
        ),
        surface: {
          page: "app",
          context: route?.context ?? "frontend",
          routeId: route?.id ?? null,
          rootWidgetId: null,
          frontendProgramId: null
        }
      });
      responseHtml = injectBodyAttributes(responseHtml, {
        "data-surface-context": route?.context ?? "frontend",
        "data-surface-route": route?.id ?? null
      });
      responseHtml = injectHtmlBeforeBodyEnd(responseHtml, renderGuidanceClient(surfaceGuidance));
      if (previewResolution.ok) {
        responseHtml = injectPreviewSessionClient(responseHtml, {
          previewSessionId,
          previewRevision: previewResolution.session?.previewRevision ?? 0,
          debugSessionId: requestUrl?.searchParams?.get("debugSessionId")?.trim() || null
        });
      }
      const companionConfig = companionConfigForSurfaceRequest({
        rootSurfaceId,
        route,
        requestUrl,
        requestSession,
        appContext,
        previewSession: previewResolution.session ?? null
      });
      if (companionConfig) {
        responseHtml = injectRuntimeWindowValue(responseHtml, "__engentusDebugConfig", companionConfig);
        responseHtml = injectRuntimeWindowValue(responseHtml, "__sourceryCompanionEnabled", companionConfig.sourceryVisible !== false);
      }
      world.observe({
        process: "frontend.render",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route?.serves || rootSurfaceId)],
        body: { route: requestUrl?.pathname ?? route?.path ?? "/", rootSurface: rootSurfaceId }
      });
      send(res, pageStatus, "text/html", maybeInjectDevClient(responseHtml, appContext), devHtmlHeaders(appContext));
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

    "backend.revision.events": async ({ req, res, appContext }) => {
      const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
      if (!snapshotManager) {
        sendJson(res, 404, { error: "backend revision events unavailable" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      res.write(revisionEventFrame(backendRevisionEventPayload(snapshotManager.getLastRevisionEvent())));
      const unsubscribe = snapshotManager.subscribe(event => {
        res.write(revisionEventFrame(backendRevisionEventPayload(event)));
      });
      req.on("close", () => {
        unsubscribe();
        try { res.end(); } catch {}
      });
    },

    "app.snapshot.promoteCurrent": async ({ res, appContext }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
      if (!snapshotManager) {
        sendJson(res, 503, { error: "app snapshot manager unavailable" });
        return;
      }
      if (!snapshotManager.getActiveSnapshot?.()) {
        sendJson(res, 409, { error: "active snapshot unavailable" });
        return;
      }
      const witnessCoreBridge = appContext?.witnessCoreBridge ?? null;
      let witnessCoreStatus = await currentWitnessCoreStatus(appContext);
      let witnessCoreGenerationId = null;
      if (witnessCoreBridge) {
        witnessCoreGenerationId = latestPublishedGreenGenerationId(witnessCoreStatus);
        if (!witnessCoreGenerationId) {
          sendJson(res, 409, { error: "published green generation unavailable" });
          return;
        }
        try {
          await witnessCoreBridge.promoteGeneration({ id: witnessCoreGenerationId });
          witnessCoreStatus = await currentWitnessCoreStatus(appContext);
        } catch (error) {
          sendJson(res, 502, {
            error: error instanceof Error ? error.message : String(error)
          });
          return;
        }
      }
      const promoted = snapshotManager.promoteActiveSnapshot?.() ?? null;
      if (!promoted) {
        sendJson(res, 409, { error: "active snapshot unavailable" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        snapshot: promoted,
        witnessCoreGenerationId,
        witnessCoreServing: witnessCoreStatus?.serving ?? null,
        servingState: snapshotManager.servingState?.({
          witnessCoreStatus
        }) ?? null
      });
    },

    "app.snapshot.rollbackStable": async ({ res, appContext }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
      if (!snapshotManager) {
        sendJson(res, 503, { error: "app snapshot manager unavailable" });
        return;
      }
      if (!snapshotManager.getStableSnapshot?.()) {
        sendJson(res, 409, { error: "stable snapshot unavailable" });
        return;
      }
      const witnessCoreBridge = appContext?.witnessCoreBridge ?? null;
      let witnessCoreStatus = await currentWitnessCoreStatus(appContext);
      let witnessCoreGenerationId = null;
      if (witnessCoreBridge) {
        witnessCoreGenerationId = typeof witnessCoreStatus?.aliases?.last_good === "string" && witnessCoreStatus.aliases.last_good.trim()
          ? witnessCoreStatus.aliases.last_good.trim()
          : null;
        if (!witnessCoreGenerationId) {
          sendJson(res, 409, { error: "last good generation unavailable" });
          return;
        }
        try {
          await witnessCoreBridge.rollbackGeneration({ id: witnessCoreGenerationId });
          witnessCoreStatus = await currentWitnessCoreStatus(appContext);
        } catch (error) {
          sendJson(res, 502, {
            error: error instanceof Error ? error.message : String(error)
          });
          return;
        }
      }
      const rolledBack = snapshotManager.rollbackToStable?.() ?? null;
      if (!rolledBack) {
        sendJson(res, 409, { error: "stable snapshot unavailable" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        snapshot: rolledBack,
        witnessCoreGenerationId,
        witnessCoreServing: witnessCoreStatus?.serving ?? null,
        servingState: snapshotManager.servingState?.({
          witnessCoreStatus
        }) ?? null
      });
    },

    "app.snapshot.serveLive": async ({ res, appContext }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
      if (!snapshotManager) {
        sendJson(res, 503, { error: "app snapshot manager unavailable" });
        return;
      }
      const witnessCoreBridge = appContext?.witnessCoreBridge ?? null;
      let witnessCoreStatus = await currentWitnessCoreStatus(appContext);
      if (witnessCoreBridge) {
        try {
          await witnessCoreBridge.requestServeLive();
          witnessCoreStatus = await currentWitnessCoreStatus(appContext);
        } catch (error) {
          sendJson(res, 502, {
            error: error instanceof Error ? error.message : String(error)
          });
          return;
        }
      }
      const servingLive = snapshotManager.requestServeLive?.() ?? null;
      sendJson(res, 200, {
        ok: true,
        snapshot: servingLive,
        witnessCoreServing: witnessCoreStatus?.serving ?? null,
        servingState: snapshotManager.servingState?.({
          witnessCoreStatus
        }) ?? null
      });
    },

    "app.preview.session.create": async ({ res, appContext, requestActor, requestSession }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      try {
        const previewSession = previewManager.createSession({
          correlation: {
            sessionId: requestSession?.id ?? null,
            surfaceId: null,
            actor: requestActor ?? null
          }
        });
        if (typeof previewManager.flushSessionPersistence === "function") {
          await previewManager.flushSessionPersistence(previewSession?.id ?? "");
        }
        sendJson(res, 201, { previewSession });
      } catch (error) {
        sendJson(res, 409, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },

    "app.preview.session.read": async ({ res, params, appContext }) => {
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      if (typeof previewManager.hydrateSession === "function") {
        await previewManager.hydrateSession(params?.id ?? "");
      }
      const previewSession = previewManager.readSession(params?.id ?? "");
      if (!previewSession) {
        sendJson(res, 404, { error: "preview session not found" });
        return;
      }
      sendJson(res, 200, { previewSession });
    },

    "app.preview.session.patchSources": async ({ req, res, params, appContext }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      try {
        const body = await readJson(req);
        const edits = Array.isArray(body?.edits) ? body.edits : [];
        const previewSession = await previewManager.patchSources(params?.id ?? "", edits);
        sendJson(res, 200, { previewSession });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = /not found/i.test(message) ? 404 : 400;
        sendJson(res, status, { error: message });
      }
    },

    "app.preview.session.patchCandidates": async ({ req, res, params, appContext }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      try {
        const body = await readJson(req);
        const result = await previewManager.patchCandidates(
          params?.id ?? "",
          Array.isArray(body?.candidates) ? body.candidates : []
        );
        sendJson(res, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = /not found/i.test(message) ? 404 : 400;
        sendJson(res, status, { error: message });
      }
    },

    "app.preview.session.delete": async ({ res, params, appContext }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      if (!await previewManager.deleteSession(params?.id ?? "")) {
        sendJson(res, 404, { error: "preview session not found" });
        return;
      }
      sendJson(res, 200, { ok: true });
    },

    "app.preview.session.events": async ({ req, res, params, appContext }) => {
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      if (typeof previewManager.hydrateSession === "function") {
        await previewManager.hydrateSession(params?.id ?? "");
      }
      const previewSession = previewManager.readSession(params?.id ?? "");
      if (!previewSession) {
        sendJson(res, 404, { error: "preview session not found" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      res.write(revisionEventFrame(previewSession.event ?? previewSession));
      const unsubscribe = previewManager.subscribe(params?.id ?? "", event => {
        res.write(revisionEventFrame(event?.event ?? event));
      });
      req.on("close", () => {
        unsubscribe();
        try { res.end(); } catch {}
      });
    },

    "app.preview.session.source.read": async ({ res, params, requestUrl, appContext }) => {
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      const file = requestUrl?.searchParams?.get("file")?.trim() || "";
      const source = await previewManager.readSource(params?.id ?? "", file);
      if (!source) {
        sendJson(res, 404, { error: "preview source not found", file });
        return;
      }
      sendJson(res, 200, source);
    },

    "app.preview.session.targets.read": async ({ res, params, requestUrl, appContext }) => {
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      if (typeof previewManager.hydrateSession === "function") {
        await previewManager.hydrateSession(params?.id ?? "");
      }
      const query = requestUrl?.searchParams?.get("query")?.trim() || "";
      const descriptorJson = requestUrl?.searchParams?.get("descriptor")?.trim() || "";
      let descriptor = null;
      if (descriptorJson) {
        try {
          descriptor = JSON.parse(descriptorJson);
        } catch {
          sendJson(res, 400, { error: "descriptor must be valid JSON" });
          return;
        }
      }
      const preferredTarget = requestUrl?.searchParams?.get("preferredTarget")?.trim() || "";
      const result = previewManager.readTargetSources(params?.id ?? "", query, {
        descriptor,
        preferredTarget
      });
      if (!result) {
        sendJson(res, 404, { error: "preview target not found", query });
        return;
      }
      sendJson(res, 200, result);
    },

    "app.preview.session.inspect.read": async ({ res, params, requestUrl, appContext }) => {
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      const target = requestUrl?.searchParams?.get("target")?.trim() || "";
      const descriptorJson = requestUrl?.searchParams?.get("descriptor")?.trim() || "";
      let descriptor = null;
      if (descriptorJson) {
        try {
          descriptor = JSON.parse(descriptorJson);
        } catch {
          sendJson(res, 400, { error: "descriptor must be valid JSON" });
          return;
        }
      }
      const preferredTarget = requestUrl?.searchParams?.get("preferredTarget")?.trim() || "";
      const inspection = await previewManager.inspectTarget(params?.id ?? "", target, {
        descriptor,
        preferredTarget
      });
      if (!inspection) {
        sendJson(res, 404, { error: "preview target not found", target });
        return;
      }
      sendJson(res, 200, inspection);
    },

    "app.preview.session.properties.patch": async ({ req, res, params, appContext }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const previewManager = await resolvePreviewManager(appContext);
      if (!previewManager) {
        sendJson(res, 503, { error: "app preview sessions unavailable" });
        return;
      }
      try {
        const body = await readJson(req);
        const result = await previewManager.patchTargetProperty(params?.id ?? "", {
          target: body?.target ?? "",
          property: body?.property ?? "",
          value: body?.value
        });
        sendJson(res, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = /not found/i.test(message) ? 404 : 400;
        sendJson(res, status, { error: message });
      }
    },

    "app.source.write": async ({ req, res, appContext, requestActor, requestSession }) => {
      if (runtimeMutationsBlocked(appContext)) {
        sendJson(res, 409, runtimeDrainingPayload(appContext));
        return;
      }
      const authoringPolicy = currentAuthoringPolicy(appContext);
      if (authoringPolicy.mode === AUTHORING_MODE_MCP_ONLY) {
        sendJson(res, 403, blockedDirectMutationResponse({
          attemptedAuthoringPath: APP_SOURCE_WRITE_PATH,
          goal: "mutate app sources through the runtime host",
          minimumHumanAction: "stop and route the change through plugin.authoring or the human platform lane",
          proof: [
            "MCP-authoring-only mode forbids direct runtime/file fallback mutation",
            "no proposal artifact may be created automatically"
          ]
        }));
        return;
      }
      const snapshotManager = appContext?.appSnapshotManager ?? appSnapshotManager;
      if (!snapshotManager) {
        sendJson(res, 404, { error: "app source updates unavailable" });
        return;
      }
      const body = await readJson(req);
      try {
        const result = await snapshotManager.applySourceEdits(body?.edits ?? [], {
          persist: true,
          trigger: "post",
          reason: "app.source.write",
          correlation: {
            sessionId: requestSession?.id ?? null,
            surfaceId: appContext?.serverRunnerId ?? null,
            actor: requestActor ?? null
          }
        });
        sendJson(res, 200, {
          ...result,
          endpoint: APP_SOURCE_WRITE_PATH
        });
      } catch (error) {
        const status = Number(error?.status || error?.httpStatus || 400);
        const payload = {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
        if (typeof error?.code === "string" && error.code) payload.code = error.code;
        for (const key of ["path", "expectedHash", "actualHash", "size", "modifiedAt", "exists"]) {
          if (error?.[key] !== undefined) payload[key] = error[key];
        }
        sendJson(res, status, payload);
      }
    },

    "runtime.supervision.activate": async ({ res, appContext }) => {
      const supervision = appContext?.runtimeSupervision ?? null;
      if (!supervision) {
        sendJson(res, 404, { error: "runtime supervision unavailable" });
        return;
      }
      supervision.role = "active";
      supervision.mutationsEnabled = true;
      supervision.watchersEnabled = appContext?.devMode === true;
      supervision.lastStateAt = new Date().toISOString();
      appContext?.appSnapshotManager?.setWatcherMode?.(supervision.watchersEnabled);
      sendJson(res, 200, {
        ok: true,
        instanceId: supervision.instanceId ?? null,
        role: supervision.role,
        mutationsEnabled: supervision.mutationsEnabled,
        watchersEnabled: supervision.watchersEnabled
      });
    },

    "runtime.supervision.quiesce": async ({ res, appContext }) => {
      const supervision = appContext?.runtimeSupervision ?? null;
      if (!supervision) {
        sendJson(res, 404, { error: "runtime supervision unavailable" });
        return;
      }
      supervision.role = "draining";
      supervision.mutationsEnabled = false;
      supervision.watchersEnabled = false;
      supervision.lastStateAt = new Date().toISOString();
      appContext?.appSnapshotManager?.setWatcherMode?.(false);
      sendJson(res, 200, {
        ok: true,
        instanceId: supervision.instanceId ?? null,
        role: supervision.role,
        mutationsEnabled: supervision.mutationsEnabled,
        watchersEnabled: supervision.watchersEnabled
      });
    },

    "runtime.diagnostics.read": async ({ res, appContext }) => {
      const runnerState = appContext?.serverRunnerId && typeof appContext?.resolveRunnerRuntimeState === "function"
        ? await appContext.resolveRunnerRuntimeState(appContext.serverRunnerId)
        : null;
      const pluginCatalog = appContext?.runtimePluginCatalog ?? await getRuntimePluginCatalog({
        activeProfile: runnerState?.profileState?.effectiveRuntimeProfile ?? appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: appContext?.serverRunnerId ?? null
      });
      const activeHandlerSetDefinitions = appContext?.runtimeHandlerSetDefinitions ?? handlerSetDefinitions;
      const operatorState = await appContext?.runtimeOperatorService?.state?.();
      const diagnostics = buildRuntimeDiagnosticsForProfile({
        requestedProfile: appContext?.requestedRuntimeProfile ?? requestedRuntimeProfile ?? runtimeProfile,
        profileName: appContext?.runtimeProfile ?? runtimeProfile,
        authoredRuntimeProfile: appContext?.authoredRuntimeProfile ?? null,
        effectiveRuntimeProfileSource: appContext?.effectiveRuntimeProfileSource ?? null,
        runtimeProfileOverrideActive: appContext?.runtimeProfileOverrideActive === true,
        runtimeProfileOverrideProfile: appContext?.runtimeProfileOverrideProfile ?? null,
        additionalBundleIds: appContext?.runtimeAdditionalBundleIds ?? pluginCatalog.addedBundleIds,
        bundleOverrides: appContext?.runtimeBundleOverrides ?? {},
        startupRunner: {
          id: appContext?.serverRunnerId ?? null,
          backendHost,
          frontendHost,
          handlerSet: appContext?.handlerSet ?? null,
          bootstrapOnly: appContext?.bootstrapOnly === true,
          startupOwned: appContext?.startupRunnerOwned === true
        },
        startupMode: appContext?.runtimeStartupMode ?? "serve",
        installedHostCapabilities: {
          backend: [...currentBackendCapabilities()],
          frontend: [...currentFrontendCapabilities()]
        },
        handlerSetDefinitions: activeHandlerSetDefinitions,
        operatorContract: appContext?.runtimeOperatorContract ?? null,
        operatorState,
        pluginCatalogSummary: pluginCatalog.summary,
        startupPluginIds: pluginCatalog.startupPluginIds,
        authoredPluginIds: pluginCatalog.authoredPluginIds,
        operatorPluginIds: pluginCatalog.operatorPluginIds,
        effectivePluginIds: pluginCatalog.effectivePluginIds,
        configuredPluginIds: pluginCatalog.configuredPluginIds,
        activePluginIds: pluginCatalog.activePluginIds,
        rejectedPlugins: pluginCatalog.rejectedPlugins,
        pluginAddedBundleIds: pluginCatalog.addedBundleIds,
        authoringPolicy: currentAuthoringPolicy(appContext),
        handlerSetProviders: appContext?.runtimeContributions?.handlerSetProviders ?? {}
      });
      diagnostics.mountedRoutes = world.project(moduleProjectors.servedRoutes)
        .filter(route => !appContext?.serverRunnerId || route.serverRunner === appContext.serverRunnerId)
        .map(route => {
          const ownership = describeMountedRouteOwnership({
            route,
            handlerMetadataById: diagnostics.handlerMetadata ?? {},
            handlerSetDefinitions: activeHandlerSetDefinitions,
            handlerSetProviders: appContext?.runtimeContributions?.handlerSetProviders ?? {}
          });
          const governance = describeMountedRouteGovernance({
            route,
            governanceRoutes: diagnostics.governanceRoutes ?? []
          });
          const handlerMetadata = diagnostics.handlerMetadata?.[String(route.handler || "")] ?? null;
          return {
            id: route.id,
            serverRunner: route.serverRunner ?? null,
            method: route.method,
            path: route.path,
            handler: route.handler,
            serves: route.serves ?? null,
            params: route.params && typeof route.params === "object" ? { ...route.params } : {},
            ...ownership,
            ...governance,
            ownerChain: cloneRuntimeOwnerChain(ownership.ownerChain),
            handlerMetadata: handlerMetadata
              ? {
                  ...handlerMetadata,
                  ownerChain: cloneRuntimeOwnerChain(handlerMetadata.ownerChain)
                }
              : null
          };
        });
      diagnostics.appSnapshot = appContext?.appSnapshotManager?.diagnostics?.() ?? null;
      diagnostics.startup = appContext?.startupTelemetry?.snapshot?.() ?? null;
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
      const runnerState = typeof appContext?.resolveRunnerRuntimeState === "function"
        ? await appContext.resolveRunnerRuntimeState(serverRunnerId)
        : null;
      const review = await getRuntimePluginReviews({
        activeProfile: runnerState?.profileState?.effectiveRuntimeProfile ?? appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId,
        authoredPluginIds: runnerState?.runtimePluginCatalog?.authoredPluginIds ?? null,
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
