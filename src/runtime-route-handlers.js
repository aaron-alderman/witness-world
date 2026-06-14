import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { canCreateInContext, canManageContext, canMutateTarget, projectors } from "./kernel.js";
import {
  clearSessionCookieHeader,
  headerValue,
  readBody,
  readJson,
  send,
  sendJson,
  sessionCookieHeader
} from "./runtime-http-utils.js";
import { isoAt, positiveInteger, runtimeConfigLookup, runtimeConfigScalar } from "./runtime-config-utils.js";
import { createAuthoringBundleServices } from "./runtime-authoring-services.js";
import { createRuntimeBundleHandlers } from "./runtime-bundle-handler-assembly.js";
import {
  createRuntimeProjectionServices
} from "./runtime-bundle-support-services.js";
import { createRuntimeSessionServices } from "./runtime-session-services.js";
import { createIdentity, defineContext, moduleProjectors } from "./modules.js";
import {
  buildRuntimeDiagnosticsForProfile,
  authorableHandlerIdsForProfile,
  DEFAULT_RUNTIME_PROFILE,
  dispatchHandlerIdsForProfile,
  handlerMetadataForProfile,
  pageHandlerIdsForProfile,
  runtimeBundleSummaryForProfile
} from "./runtime-bundles.js";
import {
  buildPluginCapabilitySourceIndex,
  readRuntimePluginCatalog,
  readRuntimePluginReviews
} from "./runtime-plugin-utils.js";
import { renderInactiveBackendSeamsPage } from "./runtime-page-fallbacks.js";

const unavailable = name => () => {
  throw new Error(`${name} is unavailable in the active runtime composition`);
};

const unavailableAsync = name => async () => {
  throw new Error(`${name} is unavailable in the active runtime composition`);
};

function emptyMcpBundleSupportServices() {
  return {
    currentMcpServerIndex: () => ({ rows: [], byId: {} }),
    currentMcpToolInstalls: () => [],
    mcpToolAvailable: () => false,
    validateMcpOrigin: () => ({ ok: false, status: 404, reason: "MCP plugin is inactive" }),
    resolveMcpPrincipal: () => ({ ok: false, status: 404, reason: "MCP plugin is inactive" }),
    mcpScopeAllows: () => false
  };
}

function emptyObjectFactory() {
  return {};
}

export function createRuntimeRouteHandlers({
  world,
  backendHost,
  frontendHost,
  sessionStore,
  logger,
  mcpInternalToken = null,
  runtimeProfile = DEFAULT_RUNTIME_PROFILE,
  runtimeBundleSummary = null,
  runtimeSurfaceEntries = [],
  handlerSetDefinitions = {},
  hostCapabilities,
  hostIdsByCapability,
  parseStreamFailureLimit,
  responseHeadersToObject,
  looksJsonContentType,
  streamReadableToFile,
  streamFileToFile,
  webhookPayloadPathFor,
  runtimeContributions = null,
  runtimePluginRoot = null,
  runtimePluginIds = [],
  authoredRuntimePluginIds = [],
  supportedFrontendOps = [],
  supportedBackendOps = [],
  frontendTraceProcesses = [],
  createRuntimeProjectionServicesImpl = createRuntimeProjectionServices,
  createMcpBundleSupportServicesImpl = null,
  createAuthoringBundleServicesImpl = createAuthoringBundleServices,
  createPracticalBackendAssetServicesImpl = null,
  createRuntimeSessionServicesImpl = createRuntimeSessionServices,
  createRuntimeAuthOAuthSupportServicesImpl = null,
  createPracticalBackendDbSearchServicesImpl = null,
  createPracticalBackendSupportServicesImpl = null,
  createPracticalBackendIoServicesImpl = null,
  createRuntimeBundleHandlersImpl = createRuntimeBundleHandlers
}) {
  const supportServices = runtimeContributions?.supportServices ?? {};
  const coreHooks = runtimeContributions?.coreHooks ?? {};
  // Optional-domain defaults below are inactive composition guards and test seams.
  // Executable feature behavior must arrive through active plugin supportServices,
  // coreHooks, provider factories, job handler factories, or loaded bundle handlers.
  const mcpToolNamesImpl = supportServices.mcpToolNames ?? (() => []);
  const resolveMcpToolScopeImpl = supportServices.resolveMcpToolScope ?? (() => null);
  const mcpToolDefinitionImpl = supportServices.mcpToolDefinition ?? (() => null);
  const executeMcpToolImpl = supportServices.executeMcpTool ?? unavailableAsync("executeMcpTool");
  const mcpProtocolVersion = supportServices.MCP_PROTOCOL_VERSION ?? "inactive";
  const responseHeadersToObjectImpl = responseHeadersToObject ?? supportServices.responseHeadersToObject ?? (headers => Object.fromEntries(Object.entries(headers ?? {})));
  const looksJsonContentTypeImpl = looksJsonContentType ?? supportServices.looksJsonContentType ?? (value => String(value || "").toLowerCase().includes("json"));
  const executeHttpOutboundImpl = supportServices.executeHttpOutbound ?? unavailableAsync("executeHttpOutbound");
  const delayWithSignalImpl = supportServices.delayWithSignal ?? unavailableAsync("delayWithSignal");
  const webhookPayloadPathForImpl = webhookPayloadPathFor ?? supportServices.webhookPayloadPathFor ?? unavailable("webhookPayloadPathFor");
  const streamReadableToFileImpl = streamReadableToFile ?? supportServices.streamReadableToFile ?? unavailableAsync("streamReadableToFile");
  const streamFileToFileImpl = streamFileToFile ?? supportServices.streamFileToFile ?? unavailableAsync("streamFileToFile");
  const parseStreamFailureLimitImpl = parseStreamFailureLimit ?? supportServices.parseStreamFailureLimit ?? (() => 0);
  const renderBackendSeamsPageImpl = supportServices.renderBackendSeamsPage ?? (() => renderInactiveBackendSeamsPage());
  const notificationTitleImpl = supportServices.notificationTitle ?? (row => row?.title ?? row?.id ?? "Notification");
  const notificationReadShapeImpl = supportServices.notificationReadShape ?? unavailable("notificationReadShape");
  const outboundReadShapeImpl = supportServices.outboundReadShape ?? unavailable("outboundReadShape");
  const webhookReadShapeImpl = supportServices.webhookReadShape ?? unavailable("webhookReadShape");
  const dbSqlDatasourceIdImpl = supportServices.dbSqlDatasourceId ?? (row => row?.id ?? null);
  const dbSqlDatasourceTitleImpl = supportServices.dbSqlDatasourceTitle ?? (row => row?.title ?? row?.id ?? "SQL datasource");
  const dbSqlOperationIdImpl = supportServices.dbSqlOperationId ?? (row => row?.id ?? null);
  const dbSqlOperationTitleImpl = supportServices.dbSqlOperationTitle ?? (row => row?.title ?? row?.id ?? "SQL operation");
  const canvasProcessHandlersImpl = supportServices.canvasProcessHandlers ?? {};
  const createMcpBundleSupportServicesResolved = createMcpBundleSupportServicesImpl
    ?? supportServices.createMcpBundleSupportServices
    ?? emptyMcpBundleSupportServices;
  const createPracticalBackendAssetServicesResolved = createPracticalBackendAssetServicesImpl
    ?? supportServices.createPracticalBackendAssetServices
    ?? emptyObjectFactory;
  const createRuntimeAuthOAuthSupportServicesResolved = createRuntimeAuthOAuthSupportServicesImpl
    ?? supportServices.createRuntimeAuthOAuthSupportServices
    ?? emptyObjectFactory;
  const createPracticalBackendDbSearchServicesResolved = createPracticalBackendDbSearchServicesImpl
    ?? supportServices.createPracticalBackendDbSearchServices
    ?? emptyObjectFactory;
  const createPracticalBackendSupportServicesResolved = createPracticalBackendSupportServicesImpl
    ?? supportServices.createPracticalBackendSupportServices
    ?? emptyObjectFactory;
  const createPracticalBackendIoServicesResolved = createPracticalBackendIoServicesImpl
    ?? (options => ({
      ...(supportServices.createFsBlobIoServices?.(options) ?? {}),
      ...(supportServices.createHttpOutboundIoServices?.(options) ?? {}),
      ...(supportServices.createWebhookIoServices?.(options) ?? {})
    }));
  const currentIdentityIndex = () => world.project(moduleProjectors.identityIndex);
  const {
    requestVisibleWitnesses,
    requestActors,
    processSelection,
    processViewInputs
  } = createRuntimeProjectionServicesImpl({ world });
  const {
    currentMcpServerIndex,
    currentMcpToolInstalls,
    mcpToolAvailable,
    validateMcpOrigin,
    resolveMcpPrincipal,
    mcpScopeAllows
  } = createMcpBundleSupportServicesResolved({
    world,
    backendHost,
    mcpInternalToken,
    runtimeConfigLookup,
    resolveMcpToolScope: resolveMcpToolScopeImpl,
    hostCapabilities,
    headerValue
  });
  let handlers = null;
  const encodeQuery = query => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value == null || value === "") continue;
      params.set(key, String(value));
    }
    const encoded = params.toString();
    return encoded ? `?${encoded}` : "";
  };
  const supportedHandlerSets = Object.keys(handlerSetDefinitions);
  const supportedHandlers = runtimeBundleSummary?.authorableHandlers ?? authorableHandlerIdsForProfile(runtimeProfile);
  const supportedPageHandlers = runtimeBundleSummary?.pageHandlers ?? pageHandlerIdsForProfile(runtimeProfile);
  const supportedHandlerMetadata = runtimeBundleSummary?.handlerMetadata ?? handlerMetadataForProfile(runtimeProfile);
  const activeDispatchHandlers = new Set(runtimeBundleSummary?.dispatchHandlers ?? dispatchHandlerIdsForProfile(runtimeProfile));
  const activeBundleIds = (runtimeBundleSummary ?? runtimeBundleSummaryForProfile(runtimeProfile)).bundleIds
    ?? ((runtimeBundleSummary ?? runtimeBundleSummaryForProfile(runtimeProfile)).bundles ?? []).map(bundle => bundle.id);
  const runtimePluginInstallIdsForRunner = serverRunnerId => {
    const installIndex = world.project(moduleProjectors.runtimePluginInstallIndex);
    return (installIndex?.byServerRunner?.[serverRunnerId] ?? []).map(row => row.plugin);
  };
  const getRuntimePluginCatalog = async (options = {}) => {
    const activeProfile = typeof options === "string"
      ? options
      : (options?.activeProfile ?? runtimeProfile);
    const serverRunnerId = typeof options === "object" && options
      ? (options.serverRunnerId ?? null)
      : null;
    const configuredPluginIds = typeof options === "object" && options && Array.isArray(options.configuredPluginIds)
      ? options.configuredPluginIds
      : runtimePluginIds;
    const authoredPluginIds = typeof options === "object" && options && Array.isArray(options.authoredPluginIds)
      ? options.authoredPluginIds
      : (serverRunnerId ? runtimePluginInstallIdsForRunner(serverRunnerId) : authoredRuntimePluginIds);
    return readRuntimePluginCatalog({
      pluginRoot: runtimePluginRoot,
      runtimeProfile: activeProfile,
      configuredPluginIds,
      authoredPluginIds
    });
  };
  const getRuntimePluginReviews = async (options = {}) => {
    const activeProfile = options?.activeProfile ?? runtimeProfile;
    const serverRunnerId = options?.serverRunnerId ?? null;
    const authoredPluginIds = Array.isArray(options?.authoredPluginIds)
      ? options.authoredPluginIds
      : (serverRunnerId ? runtimePluginInstallIdsForRunner(serverRunnerId) : authoredRuntimePluginIds);
    const pluginId = typeof options?.pluginId === "string" && options.pluginId.trim()
      ? options.pluginId.trim()
      : null;
    return readRuntimePluginReviews({
      pluginRoot: runtimePluginRoot,
      runtimeProfile: activeProfile,
      serverRunnerId,
      authoredPluginIds,
      pluginId
    });
  };
  const invokeRouteHandler = async ({
    handler,
    method = "GET",
    path: requestPath,
    query = {},
    params = {},
    body = null,
    rawBody = null,
    headers = {},
    requestActor = null,
    requestIdentity = null,
    requestSession = null,
    appContext = null,
    route = null
  }) => {
    const requestBody = rawBody ?? (body == null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)));
    const inferredContentType = body != null && rawBody == null ? "application/json" : "application/octet-stream";
    const req = Readable.from(requestBody.length ? [requestBody] : []);
    req.method = method;
    req.url = `${requestPath}${encodeQuery(query)}`;
    req.headers = Object.fromEntries(
      Object.entries({
        ...(requestBody.length ? { "content-type": inferredContentType, "content-length": String(requestBody.length) } : {}),
        ...headers
      }).map(([key, value]) => [String(key).toLowerCase(), value])
    );
    const chunks = [];
    let responseCommitted = false;
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(status, nextHeaders = {}) {
        responseCommitted = true;
        this.statusCode = status;
        this.headers = { ...this.headers, ...nextHeaders };
      },
      write(chunk) {
        responseCommitted = true;
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end(chunk) {
        responseCommitted = true;
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    };
    if (!activeDispatchHandlers.has(handler)) {
      return {
        status: 404,
        body: { error: "route handler unavailable in runtime profile", handler, profile: runtimeProfile },
        headers: { "content-type": "application/json" },
        buffer: Buffer.from(JSON.stringify({ error: "route handler unavailable in runtime profile", handler, profile: runtimeProfile })),
        contentType: "application/json"
      };
    }
    const handlerFn = handlers?.[handler] || appContext?.handlers?.[handler];
    if (!handlerFn) {
      return {
        status: 500,
        body: { error: "route handler not configured", handler },
        headers: { "content-type": "application/json" },
        buffer: Buffer.from(JSON.stringify({ error: "route handler not configured", handler })),
        contentType: "application/json"
      };
    }
    const returned = await handlerFn({
      req,
      res,
      requestId: `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      requestUrl: new URL(req.url, "http://127.0.0.1"),
      route,
      params,
      requestActor,
      requestIdentity,
      requestSession,
      appContext
    });
    if (!responseCommitted && chunks.length === 0 && returned !== undefined) {
      const routeResult = returned
        && typeof returned === "object"
        && Number.isFinite(Number(returned.status))
        && Object.prototype.hasOwnProperty.call(returned, "body")
        ? {
            status: Number(returned.status),
            body: returned.body,
            headers: returned.headers && typeof returned.headers === "object" ? returned.headers : {}
          }
        : null;
      const syntheticBody = routeResult ? routeResult.body : returned;
      const syntheticHeaders = routeResult?.headers ?? {};
      const buffer = Buffer.from(JSON.stringify(syntheticBody));
      return {
        status: routeResult?.status ?? res.statusCode,
        body: syntheticBody,
        headers: { "content-type": "application/json", ...syntheticHeaders },
        buffer,
        contentType: "application/json"
      };
    }
    const buffer = Buffer.concat(chunks);
    const responseHeaders = Object.fromEntries(Object.entries(res.headers).map(([key, value]) => [String(key).toLowerCase(), value]));
    const contentType = String(responseHeaders["content-type"] || "");
    if (contentType.includes("application/json")) {
      let parsed = {};
      try {
        parsed = buffer.length ? JSON.parse(buffer.toString("utf8")) : {};
      } catch {
        parsed = { raw: buffer.toString("utf8") };
      }
      return { status: res.statusCode, body: parsed, headers: responseHeaders, buffer, contentType };
    }
    return { status: res.statusCode, body: null, headers: responseHeaders, buffer, contentType };
  };
  const backendHosts = hostIdsByCapability(world, "http.serve");
  const frontendHosts = hostIdsByCapability(world, "dom.render");
  const authoringServices = createAuthoringBundleServicesImpl({
    world,
    backendHost,
    currentIdentityIndex,
    supportedHandlerSets,
    supportedHandlers,
    supportedHandlerMetadata,
    supportedFrontendOps,
    supportedBackendOps,
    mcpToolNames: mcpToolNamesImpl,
    createAuthoringProposalExecutor: supportServices.createAuthoringProposalExecutor,
    getRuntimePluginCatalog
  });
  const authorityServices = authoringServices;
  const sendGateFailure = (res, gate) => sendJson(res, gate.status || 403, { error: gate.reason || "forbidden" });
  const requireBackendCapabilities = capabilities => {
    const available = hostCapabilities(world, backendHost);
    const missing = capabilities.filter(capability => !available.has(capability));
    if (!missing.length) return { ok: true, status: 200, reason: null };
    return { ok: false, status: 503, reason: "missing backend capabilities", missing };
  };
  const currentBackendCapabilities = () => hostCapabilities(world, backendHost);
  const currentThingIds = () => world.project(projectors.things);
  const currentThingExists = thingId => currentThingIds().has(thingId);
  const currentThingKind = thingId => world.project(moduleProjectors.modules).get(thingId) ?? null;
  const currentThingTitle = thingId => world.project(projectors.currentRelations)
    .find(row => row.from === thingId && row.rel === "hasTitle")
    ?.to ?? thingId;
  const currentThingContext = thingId => world.project(moduleProjectors.objectContexts).get(thingId) ?? null;
  const attachmentTargetsForAsset = assetId => world.project(projectors.currentRelations)
    .filter(row => row.rel === "attachedAsset" && row.to === assetId)
    .map(row => ({
      id: row.from,
      title: currentThingTitle(row.from),
      kind: currentThingKind(row.from),
      context: currentThingContext(row.from)
    }))
    .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));
  const assetAttachedToTarget = (assetId, targetId) => world.project(projectors.currentRelations)
    .some(row => row.from === targetId && row.rel === "attachedAsset" && row.to === assetId);
  const currentPerspectiveById = perspectiveId => world.project(moduleProjectors.perspectives).find(row => row.id === perspectiveId) ?? null;
  const {
    parseMultipartAssetUpload,
    parseRawAssetUpload,
    assetDownloadUrl,
    assetContentUrl,
    assetTextUrl,
    assetThumbnailUrl,
    assetStorageKey,
    assetPathFor,
    assetTextPathFor,
    assetThumbnailPathFor,
    currentAssetById,
    ensureReadableAssetAccess,
    normalizeAssetVisibility,
    resolveAssetDropContext
  } = createPracticalBackendAssetServicesResolved({
    world,
    backendHost,
    runtimeConfigLookup,
    headerValue,
    canCreateInContext: (actor, contextId) => canCreateInContext(world, actor, contextId),
    canMutateTarget: (actor, target) => canMutateTarget(world, actor, target),
    currentPerspectiveById,
    defineContext: value => defineContext(world, value)
  });
  const {
    createSessionForIdentity,
    sessionResponseShape,
    syncSessionIdentity,
    guidanceProgressFor,
    setGuidanceProgress,
    tutorialProgressFor,
    setTutorialProgress
  } = createRuntimeSessionServicesImpl({ sessionStore });
  const {
    authOAuthFlowId,
    authOAuthLinkTitle,
    authOAuthReadShape,
    sanitizeAuthOauthSegment,
    authOAuthCallbackBaseUrl,
    normalizeAuthOAuthConfig,
    normalizeAuthOAuthProfile,
    emitAuthOauthFlow,
    emitAuthOauthLink,
    emitAuthOauthSession
  } = createRuntimeAuthOAuthSupportServicesResolved({
    world,
    backendHost,
    randomUUID,
    runtimeConfigLookup,
    headerValue
  });
  const {
    dbSqlDatasourceReadShape,
    dbSqlOperationReadShape,
    searchIndexReadShape,
    emitDbSqlDatasourceResolve,
    emitDbSqlOperation,
    emitSearchIndexEvent
  } = createPracticalBackendDbSearchServicesResolved({
    world,
    backendHost
  });
  const unavailableNotificationEnqueue = async ({ channel, res, requestActor }) => {
    const required = channel === "sms" ? ["notify.sms"] : ["notify.email"];
    const capabilityGate = requireBackendCapabilities(required);
    if (!capabilityGate.ok) {
      sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
      return;
    }
    if (!requestActor) {
      sendJson(res, 401, { error: "sign in first" });
      return;
    }
    sendJson(res, 503, { error: "notification queue support is unavailable in active runtime composition" });
  };
  const {
    notificationsForRunner = () => [],
    currentNotificationForRunner = () => null,
    outboundRequestsForRunner = () => [],
    currentOutboundForRunner = () => null,
    webhookDeliveriesForRunner = () => [],
    currentWebhookForRunner = () => null,
    currentSqlDatasourceForRunner = () => null,
    sqlOperationsForRunner = () => [],
    currentSqlOperationForRunner = () => null,
    currentSearchIndexForRunner = () => null,
    oauthLinksForRunner = () => [],
    currentOauthLinkForRunner = () => null,
    currentOauthLinkByProviderAccount = () => null,
    assetDiagnostics = () => ({}),
    enqueueNotification = unavailableNotificationEnqueue
  } = createPracticalBackendSupportServicesResolved({
    world,
    backendHost,
    currentBackendCapabilities,
    requireBackendCapabilities,
    canCreateInContext: (actor, contextId) => canCreateInContext(world, actor, contextId),
    canMutateTarget,
    sendGateFailure,
    sendJson,
    readJson,
    notificationTitle: notificationTitleImpl,
    notificationReadShape: notificationReadShapeImpl
  });
  const {
    normalizeOutboundRequest,
    outboundTitle,
    normalizeWebhookDelivery,
    webhookTitle,
    verifyWebhookSignature,
    resolveBlobScope,
    listBlobFolder,
    loadBlobRecord,
    blobStorageDirectoryFor,
    composeBlobFileRecord,
    normalizeBlobPath,
    pickExternalRefId,
    isRetryableOutboundStatus,
    outboundFailureResponseStatus
  } = createPracticalBackendIoServicesResolved({
    runtimeConfigLookup,
    runtimeConfigScalar,
    positiveInteger,
    isoAt,
    randomUUID,
    headerValue,
    canCreateInContext: (actor, contextId) => canCreateInContext(world, actor, contextId),
    canManageContext: (actor, contextId) => canManageContext(world, actor, contextId),
    canMutateTarget: (actor, target) => canMutateTarget(world, actor, target)
  });
  handlers = createRuntimeBundleHandlersImpl({
    runtimeProfile,
    activeBundleIds,
    sessionStore,
    bundleManifests: runtimeBundleSummary?.bundles ?? [],
    factoryDeps: {
      world,
      backendHost,
      frontendHost,
      logger,
      send,
      sendJson,
      readJson,
      requestActors,
      requestVisibleWitnesses,
      processSelection,
      processViewInputs,
      frontendTraceProcesses,
      runtimeProfile,
      runtimeBundleSummary,
      authoringServices,
      authorityServices,
      sendGateFailure,
      syncSessionIdentity,
      sessionResponseShape,
      supportedPageHandlers,
      supportedHandlerSets,
      supportedHandlers,
      supportedHandlerMetadata,
      supportedFrontendOps,
      supportedBackendOps,
      requestedRuntimeProfile: runtimeProfile,
      currentBackendCapabilities,
      currentFrontendCapabilities: () => hostCapabilities(world, frontendHost),
      handlerSetDefinitions,
      buildRuntimeDiagnosticsForProfile,
      getRuntimePluginCatalog,
      getRuntimePluginReviews,
      getRuntimeOperatorState: async appContext => appContext?.runtimeOperatorService?.state?.() ?? null,
      buildPluginCapabilitySourceIndex,
      backendHosts,
      frontendHosts,
      mcpToolNames: mcpToolNamesImpl,
      assetDiagnostics,
      renderBackendSeamsPage: renderBackendSeamsPageImpl,
      runtimeBundleSummaryForProfile,
      defaultRuntimeProfile: DEFAULT_RUNTIME_PROFILE,
      currentAssetById,
      ensureReadableAssetAccess,
      assetPathFor,
      assetTextPathFor,
      assetTextUrl,
      assetThumbnailPathFor,
      attachmentTargetsForAsset,
      currentThingExists,
      currentThingKind,
      assetAttachedToTarget,
      runAssetAttach: ({ actor, asset, target, perspective }) => canvasProcessHandlersImpl["asset.attach"]?.(world, { actor, asset, target, perspective }),
      runAssetDetach: ({ actor, asset, target, perspective }) => canvasProcessHandlersImpl["asset.detach"]?.(world, { actor, asset, target, perspective }),
      requireBackendCapabilities,
      headerValue,
      parseMultipartAssetUpload,
      parseRawAssetUpload,
      normalizeAssetVisibility,
      resolveAssetDropContext,
      assetStorageKey,
      assetContentUrl,
      assetDownloadUrl,
      resolveBlobScope,
      listBlobFolder,
      loadBlobRecord,
      blobStorageDirectoryFor,
      composeBlobFileRecord,
      normalizeBlobPath,
      streamReadableToFile: streamReadableToFileImpl,
      canMutateTarget,
      normalizeOutboundRequest,
      outboundTitle,
      executeHttpOutbound: executeHttpOutboundImpl,
      responseHeadersToObject: responseHeadersToObjectImpl,
      looksJsonContentType: looksJsonContentTypeImpl,
      pickExternalRefId,
      currentOutboundForRunner,
      outboundReadShape: outboundReadShapeImpl,
      isRetryableOutboundStatus,
      delayWithSignal: delayWithSignalImpl,
      outboundFailureResponseStatus,
      outboundRequestsForRunner,
      enqueueNotification,
      notificationsForRunner,
      notificationReadShape: notificationReadShapeImpl,
      currentNotificationForRunner,
      readBody,
      normalizeWebhookDelivery,
      webhookTitle,
      verifyWebhookSignature,
      webhookReadShape: webhookReadShapeImpl,
      currentWebhookForRunner,
      webhookDeliveriesForRunner,
      webhookPayloadPathFor: webhookPayloadPathForImpl,
      emitDbSqlDatasourceResolve,
      currentSqlDatasourceForRunner,
      sqlOperationsForRunner,
      dbSqlDatasourceReadShape,
      dbSqlOperationReadShape,
      dbSqlDatasourceId: dbSqlDatasourceIdImpl,
      dbSqlDatasourceTitle: dbSqlDatasourceTitleImpl,
      dbSqlOperationId: dbSqlOperationIdImpl,
      dbSqlOperationTitle: dbSqlOperationTitleImpl,
      emitDbSqlOperation,
      currentSqlOperationForRunner,
      emitSearchIndexEvent,
      currentSearchIndexForRunner,
      searchIndexReadShape,
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
      sessionStore,
      runtimeContributions,
      sanitizeAuthOauthSegment,
      createIdentity,
      createSessionForIdentity,
      oauthLinksForRunner,
      sessionCookieHeader,
      clearSessionCookieHeader,
      guidanceProgressFor,
      setGuidanceProgress,
      tutorialProgressFor,
      setTutorialProgress,
      currentMcpServerIndex,
      currentMcpToolInstalls,
      mcpToolAvailable,
      validateMcpOrigin,
      resolveMcpPrincipal,
      MCP_PROTOCOL_VERSION: mcpProtocolVersion,
      mcpToolDefinition: mcpToolDefinitionImpl,
      mcpScopeAllows,
      executeMcpTool: executeMcpToolImpl,
      invokeRouteHandler,
      parseStreamFailureLimit: parseStreamFailureLimitImpl,
      streamFileToFile: streamFileToFileImpl,
      coreHooks
    }
  });
  return handlers;
}
