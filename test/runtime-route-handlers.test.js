import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeRouteHandlers } from "../src/runtime-route-handlers.js";

test("runtime route handlers compose bundle factory deps and invoke extracted handlers outside host.js", async () => {
  let captured = null;
  const handlers = createRuntimeRouteHandlers({
    world: {
      project() {
        return [];
      }
    },
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    sessionStore: new Map(),
    logger: { info() {}, error() {} },
    runtimeProfile: "full",
    runtimeBundleSummary: {
      bundles: [],
      authorableHandlers: ["demo.echo"],
      pageHandlers: ["page.home"],
      dispatchHandlers: ["demo.echo"]
    },
    runtimeSurfaceEntries: [],
    handlerSetDefinitions: { demo: {} },
    send(res, status, type, body) {
      res.writeHead(status, { "content-type": type });
      res.end(body);
    },
    sendJson(res, status, body) {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    readJson: async () => ({}),
    hostCapabilities: () => new Set(["jobs.queue", "http.serve"]),
    hostIdsByCapability: (_world, capability) => capability === "http.serve" ? ["backendHost"] : ["frontendHost"],
    runtimeConfigLookup: () => undefined,
    runtimeConfigScalar: value => typeof value === "string",
    positiveInteger: value => Number.parseInt(String(value ?? "0"), 10) || 0,
    nonNegativeInteger: value => Math.max(0, Number.parseInt(String(value ?? "0"), 10) || 0),
    isoAt: () => "2026-06-12T00:00:00.000Z",
    headerValue: value => String(value ?? ""),
    notificationTitle: channel => channel,
    dbSqlDatasourceId: () => "dbsql:runner-1:main",
    dbSqlDatasourceTitle: () => "main (sqlite)",
    dbSqlOperationId: () => "sqlop_1",
    dbSqlOperationTitle: () => "query main",
    delayWithSignal: async () => {},
    executeHttpOutbound: async () => ({ status: 200 }),
    parseStreamFailureLimit: value => value,
    readBody: async () => Buffer.from(""),
    renderBackendSeamsPage: diagnostics => JSON.stringify(diagnostics),
    responseHeadersToObject: headers => headers,
    looksJsonContentType: value => String(value).includes("json"),
    sessionCookieHeader: sessionId => `session=${sessionId}`,
    clearSessionCookieHeader: () => "session=; Max-Age=0",
    streamReadableToFile: async () => ({ sizeBytes: 0 }),
    streamFileToFile: async () => ({ sizeBytes: 0 }),
    webhookPayloadPathFor: () => "/tmp/webhook",
    supportedFrontendOps: ["setText", "fetchJson"],
    supportedBackendOps: ["handler.invoke", "response.json"],
    frontendTraceProcesses: ["frontend.process.start"],
    createRuntimeProjectionServicesImpl: () => ({
      requestVisibleWitnesses: () => [],
      requestActors: () => [],
      processSelection: () => [],
      processViewInputs: () => ({})
    }),
    createMcpBundleSupportServicesImpl: () => ({
      currentMcpServerIndex: () => [],
      currentMcpToolInstalls: () => [],
      mcpToolAvailable: () => false,
      validateMcpOrigin: () => ({ ok: true }),
      resolveMcpPrincipal: () => null,
      mcpScopeAllows: () => true
    }),
    createAuthoringBundleServicesImpl: () => ({
      requireBootstrapActor: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: () => ({ ok: true }),
      ensureIdentityAuthority: () => ({ ok: true }),
      executeBootstrapProposal: async () => ({ ok: true })
    }),
    createPracticalBackendAssetServicesImpl: () => ({
      parseMultipartAssetUpload: async () => ({}),
      parseRawAssetUpload: async () => ({}),
      assetDownloadUrl: () => "/asset/download",
      assetContentUrl: () => "/asset/content",
      assetTextUrl: () => "/asset/text",
      assetThumbnailUrl: () => "/asset/thumbnail",
      assetStorageKey: () => "asset/blob",
      assetPathFor: () => "/asset/blob",
      assetTextPathFor: () => "/asset/text",
      assetThumbnailPathFor: () => "/asset/thumb",
      currentAssetById: () => null,
      ensureReadableAssetAccess: () => ({ ok: true }),
      normalizeAssetVisibility: value => value,
      resolveAssetDropContext: () => null
    }),
    createRuntimeSessionServicesImpl: () => ({
      createSessionForIdentity: () => ({ id: "session-1" }),
      sessionResponseShape: () => ({ authenticated: true }),
      syncSessionIdentity: () => {},
      tutorialProgressFor: () => null,
      setTutorialProgress: () => {}
    }),
    createRuntimeAuthOAuthSupportServicesImpl: () => ({
      authOAuthFlowId: () => "flow-1",
      authOAuthLinkTitle: () => "Link",
      authOAuthReadShape: row => row,
      sanitizeAuthOauthSegment: value => value,
      authOAuthCallbackBaseUrl: () => "http://127.0.0.1",
      normalizeAuthOAuthConfig: value => value,
      normalizeAuthOAuthProfile: value => value,
      emitAuthOauthFlow: () => {},
      emitAuthOauthLink: () => {},
      emitAuthOauthSession: () => {}
    }),
    createPracticalBackendDbSearchServicesImpl: () => ({
      dbSqlDatasourceReadShape: row => row,
      dbSqlOperationReadShape: row => row,
      searchIndexReadShape: row => row,
      emitDbSqlDatasourceResolve: () => {},
      emitDbSqlOperation: () => {},
      emitSearchIndexEvent: () => {}
    }),
    createPracticalBackendSupportServicesImpl: () => ({
      notificationsForRunner: () => [],
      currentNotificationForRunner: () => null,
      outboundRequestsForRunner: () => [],
      currentOutboundForRunner: () => null,
      webhookDeliveriesForRunner: () => [],
      currentWebhookForRunner: () => null,
      currentSqlDatasourceForRunner: () => null,
      sqlOperationsForRunner: () => [],
      currentSqlOperationForRunner: () => null,
      currentSearchIndexForRunner: () => null,
      oauthLinksForRunner: () => [],
      currentOauthLinkForRunner: () => null,
      currentOauthLinkByProviderAccount: () => null,
      assetDiagnostics: () => ({}),
      enqueueNotification: async () => ({ ok: true })
    }),
    createPracticalBackendIoServicesImpl: () => ({
      normalizeOutboundRequest: value => value,
      outboundTitle: () => "Outbound",
      normalizeWebhookDelivery: value => value,
      webhookTitle: () => "Webhook",
      verifyWebhookSignature: () => ({ ok: true }),
      resolveBlobScope: () => ({ ok: true }),
      listBlobFolder: async () => [],
      loadBlobRecord: async () => null,
      blobStorageDirectoryFor: () => "/tmp/blobs",
      composeBlobFileRecord: () => ({}),
      normalizeBlobPath: value => value,
      pickExternalRefId: () => "ext-1",
      isRetryableOutboundStatus: () => false,
      outboundFailureResponseStatus: () => 502
    }),
    createRuntimeBundleHandlersImpl: config => {
      captured = config;
      return {
        "demo.echo": async ({ res, params }) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ echoed: params.value }));
        }
      };
    }
  });

  assert.equal(typeof handlers["demo.echo"], "function");
  assert.deepEqual(captured.activeBundleIds, []);
  assert.deepEqual(captured.factoryDeps.supportedFrontendOps, ["setText", "fetchJson"]);
  assert.deepEqual(captured.factoryDeps.supportedBackendOps, ["handler.invoke", "response.json"]);
  assert.deepEqual(captured.factoryDeps.frontendTraceProcesses, ["frontend.process.start"]);
  assert.deepEqual(captured.factoryDeps.backendHosts, ["backendHost"]);
  assert.deepEqual(captured.factoryDeps.frontendHosts, ["frontendHost"]);

  const invoked = await captured.factoryDeps.invokeRouteHandler({
    handler: "demo.echo",
    path: "/api/echo",
    params: { value: "ok" },
    appContext: { handlers: {} }
  });
  assert.equal(invoked.status, 200);
  assert.deepEqual(invoked.body, { echoed: "ok" });
});
