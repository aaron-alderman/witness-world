import { relation } from "../../src/kernel.js";

export function createBackendSeamsHandlers({
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
