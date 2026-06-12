import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { canCreateInContext, canManageContext, canMutateTarget, projectors } from "./kernel.js";
import { canvasProcessHandlers } from "./canvas-processes.js";
import {
  clearSessionCookieHeader,
  headerValue,
  readBody,
  readJson,
  send,
  sendJson,
  sessionCookieHeader
} from "./runtime-http-utils.js";
import { executeMcpTool, mcpToolDefinition, mcpToolNames, resolveMcpToolScope, MCP_PROTOCOL_VERSION } from "./mcp.js";
import { isoAt, nonNegativeInteger, positiveInteger, runtimeConfigLookup, runtimeConfigScalar } from "./runtime-config-utils.js";
import { renderBackendSeamsPage } from "./runtime-backend-seams-page.js";
import { createAuthoringBundleServices } from "./runtime-authoring-services.js";
import { createRuntimeBundleHandlers } from "./runtime-bundle-handler-assembly.js";
import {
  createMcpBundleSupportServices,
  createRuntimeProjectionServices
} from "./runtime-bundle-support-services.js";
import { createPracticalBackendSupportServices } from "./runtime-practical-backend-support-services.js";
import { createPracticalBackendIoServices } from "./runtime-practical-backend-io-services.js";
import { createPracticalBackendAssetServices } from "./runtime-practical-backend-asset-services.js";
import { createRuntimeAuthOAuthSupportServices } from "./runtime-auth-oauth-support-services.js";
import { createPracticalBackendDbSearchServices } from "./runtime-practical-backend-db-search-services.js";
import {
  dbSqlDatasourceId,
  dbSqlDatasourceTitle,
  dbSqlOperationId,
  dbSqlOperationTitle,
  delayWithSignal,
  executeHttpOutbound,
  notificationTitle
} from "./runtime-practical-backend-glue.js";
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
  runtimePluginRoot = null,
  runtimePluginIds = [],
  authoredRuntimePluginIds = [],
  supportedFrontendOps = [],
  supportedBackendOps = [],
  frontendTraceProcesses = [],
  createRuntimeProjectionServicesImpl = createRuntimeProjectionServices,
  createMcpBundleSupportServicesImpl = createMcpBundleSupportServices,
  createAuthoringBundleServicesImpl = createAuthoringBundleServices,
  createPracticalBackendAssetServicesImpl = createPracticalBackendAssetServices,
  createRuntimeSessionServicesImpl = createRuntimeSessionServices,
  createRuntimeAuthOAuthSupportServicesImpl = createRuntimeAuthOAuthSupportServices,
  createPracticalBackendDbSearchServicesImpl = createPracticalBackendDbSearchServices,
  createPracticalBackendSupportServicesImpl = createPracticalBackendSupportServices,
  createPracticalBackendIoServicesImpl = createPracticalBackendIoServices,
  createRuntimeBundleHandlersImpl = createRuntimeBundleHandlers
}) {
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
  } = createMcpBundleSupportServicesImpl({
    world,
    backendHost,
    mcpInternalToken,
    runtimeConfigLookup,
    resolveMcpToolScope,
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
    mcpToolNames,
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
  const assetIngestRetryUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/ingest/retry`;
  const assetSearchReindexUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/search/reindex`;
  const assetsRootFor = appContext => appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
  const blobsRootFor = appContext => appContext?.storage?.blobsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "blobs");
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
  } = createPracticalBackendAssetServicesImpl({
    world,
    backendHost,
    runtimeConfigLookup,
    headerValue,
    assetsRootFor,
    canCreateInContext: (actor, contextId) => canCreateInContext(world, actor, contextId),
    canMutateTarget: (actor, target) => canMutateTarget(world, actor, target),
    currentPerspectiveById,
    defineContext: value => defineContext(world, value)
  });
  const {
    createSessionForIdentity,
    sessionResponseShape,
    syncSessionIdentity,
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
  } = createRuntimeAuthOAuthSupportServicesImpl({
    world,
    backendHost,
    randomUUID,
    runtimeConfigLookup,
    headerValue
  });
  const notificationReadShape = row => ({
    id: row.id,
    title: row.title,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    sender: row.sender,
    preview: row.preview,
    transport: row.transport,
    status: row.status,
    context: row.context,
    jobId: row.jobId,
    providerMessageId: row.providerMessageId,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    retryDelayMs: row.retryDelayMs,
    lastError: row.lastError
  });
  const outboundReadShape = row => ({
    id: row.id,
    title: row.title,
    target: row.target,
    url: row.url,
    method: row.method,
    transport: row.transport,
    status: row.status,
    context: row.context,
    serverRunner: row.serverRunner,
    authKind: row.authKind,
    authConfigKey: row.authConfigKey,
    requestHeaderNames: row.requestHeaderNames,
    requestBodyKind: row.requestBodyKind,
    timeoutMs: row.timeoutMs,
    maxAttempts: row.maxAttempts,
    retryDelayMs: row.retryDelayMs,
    attempt: row.attempt,
    correlationId: row.correlationId,
    externalRefId: row.externalRefId,
    responseStatus: row.responseStatus,
    responseContentType: row.responseContentType,
    lastError: row.lastError
  });
  const webhookReadShape = row => ({
    id: row.id,
    title: row.title,
    target: row.target,
    deliveryId: row.deliveryId,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    status: row.status,
    signatureStatus: row.signatureStatus,
    replayStatus: row.replayStatus,
    receivedAt: row.receivedAt,
    timestamp: row.timestamp,
    correlationId: row.correlationId,
    context: row.context,
    serverRunner: row.serverRunner,
    jobId: row.jobId,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    retryDelayMs: row.retryDelayMs,
    lastError: row.lastError
  });
  const {
    dbSqlDatasourceReadShape,
    dbSqlOperationReadShape,
    searchIndexReadShape,
    emitDbSqlDatasourceResolve,
    emitDbSqlOperation,
    emitSearchIndexEvent
  } = createPracticalBackendDbSearchServicesImpl({
    world,
    backendHost
  });
  const normalizeNotificationRequest = ({ channel, body, actor, serverRunnerId }) => {
    const recipient = typeof body?.to === "string" ? body.to.trim() : "";
    if (!recipient) return { ok: false, status: 400, reason: "recipient required" };
    const subject = channel === "email"
      ? (typeof body?.subject === "string" ? body.subject.trim() : "")
      : null;
    if (channel === "email" && !subject) return { ok: false, status: 400, reason: "subject required" };
    const hasText = typeof body?.text === "string";
    const hasTemplate = typeof body?.template === "string" && body.template.trim();
    if (!hasText && !hasTemplate) return { ok: false, status: 400, reason: "text or template required" };
    if (hasText && hasTemplate) return { ok: false, status: 400, reason: "choose text or template" };
    const vars = body?.vars && typeof body.vars === "object" && !Array.isArray(body.vars) ? { ...body.vars } : {};
    const contextId = typeof body?.context === "string" && body.context.trim() ? body.context.trim() : null;
    if (contextId) {
      const gate = canCreateInContext(world, actor, contextId);
      if (!gate.ok) return gate;
    }
    return {
      ok: true,
      notification: {
        id: `notification_${randomUUID()}`,
        channel,
        actor,
        serverRunner: serverRunnerId,
        context: contextId,
        to: recipient,
        subject,
        text: hasText ? String(body.text) : null,
        template: hasTemplate ? String(body.template) : null,
        vars,
        delayMs: nonNegativeInteger(body?.delayMs, 0),
        maxAttempts: positiveInteger(body?.maxAttempts, 3),
        retryDelayMs: positiveInteger(body?.retryDelayMs, 50),
        idempotencyKey: typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : null
      }
    };
  };
  const {
    notificationsForRunner,
    currentNotificationForRunner,
    outboundRequestsForRunner,
    currentOutboundForRunner,
    webhookDeliveriesForRunner,
    currentWebhookForRunner,
    currentSqlDatasourceForRunner,
    sqlOperationsForRunner,
    currentSqlOperationForRunner,
    currentSearchIndexForRunner,
    oauthLinksForRunner,
    currentOauthLinkForRunner,
    currentOauthLinkByProviderAccount,
    assetDiagnostics,
    enqueueNotification
  } = createPracticalBackendSupportServicesImpl({
    world,
    backendHost,
    currentBackendCapabilities,
    assetsRootFor,
    blobsRootFor,
    assetIngestRetryUrl,
    assetSearchReindexUrl,
    requireBackendCapabilities,
    canMutateTarget,
    sendGateFailure,
    sendJson,
    readJson,
    normalizeNotificationRequest,
    notificationTitle,
    notificationReadShape
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
  } = createPracticalBackendIoServicesImpl({
    blobsRootFor,
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
      mcpToolNames,
      assetDiagnostics,
      renderBackendSeamsPage,
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
      runAssetAttach: ({ actor, asset, target, perspective }) => canvasProcessHandlers["asset.attach"](world, { actor, asset, target, perspective }),
      runAssetDetach: ({ actor, asset, target, perspective }) => canvasProcessHandlers["asset.detach"](world, { actor, asset, target, perspective }),
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
      streamReadableToFile,
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
      outboundRequestsForRunner,
      enqueueNotification,
      notificationsForRunner,
      notificationReadShape,
      currentNotificationForRunner,
      readBody,
      normalizeWebhookDelivery,
      webhookTitle,
      verifyWebhookSignature,
      webhookReadShape,
      currentWebhookForRunner,
      webhookDeliveriesForRunner,
      webhookPayloadPathFor,
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
      sanitizeAuthOauthSegment,
      createIdentity,
      createSessionForIdentity,
      oauthLinksForRunner,
      sessionCookieHeader,
      clearSessionCookieHeader,
      tutorialProgressFor,
      setTutorialProgress,
      currentMcpServerIndex,
      currentMcpToolInstalls,
      mcpToolAvailable,
      validateMcpOrigin,
      resolveMcpPrincipal,
      MCP_PROTOCOL_VERSION,
      mcpToolDefinition,
      mcpScopeAllows,
      executeMcpTool,
      invokeRouteHandler,
      parseStreamFailureLimit,
      streamFileToFile
    }
  });
  return handlers;
}
