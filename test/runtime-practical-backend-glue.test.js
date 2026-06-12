import assert from "node:assert/strict";
import test from "node:test";
import {
  dbSqlDatasourceId,
  dbSqlDatasourceTitle,
  dbSqlOperationId,
  dbSqlOperationTitle,
  delayWithSignal,
  executeHttpOutbound,
  notificationTitle
} from "../src/runtime-practical-backend-glue.js";
import { isoAt, nonNegativeInteger, positiveInteger, runtimeConfigLookup, runtimeConfigScalar } from "../src/runtime-config-utils.js";
import { renderBackendSeamsPage } from "../src/runtime-backend-seams-page.js";

test("runtime config utils resolve nested keys and numeric/time coercions", () => {
  assert.equal(runtimeConfigScalar("x"), true);
  assert.equal(runtimeConfigScalar(1), true);
  assert.equal(runtimeConfigScalar(false), true);
  assert.equal(runtimeConfigScalar({}), false);
  assert.equal(runtimeConfigLookup({ auth: { oauth: { provider: "stub" } } }, "auth.oauth.provider"), "stub");
  assert.equal(runtimeConfigLookup({ "\"flat.key\"": 7 }, "flat.key"), 7);
  assert.equal(positiveInteger("12", 3), 12);
  assert.equal(positiveInteger("0", 3, { minimum: 1 }), 3);
  assert.equal(nonNegativeInteger("-1", 9), 9);
  assert.match(isoAt(0), /^1970-01-01T00:00:00.000Z$/);
});

test("practical backend glue provides stable titles and stub outbound behavior", async () => {
  assert.equal(dbSqlDatasourceId("runner-1"), "dbsql:runner-1:main");
  assert.equal(dbSqlDatasourceTitle({ provider: "sqlite", datasourceName: "main" }), "main (sqlite)");
  assert.match(dbSqlOperationId(), /^sqlop_/);
  assert.equal(dbSqlOperationTitle({ kind: "query", datasourceName: "main" }), "query main");
  assert.equal(notificationTitle("email", { subject: "Hello" }), "Hello");
  assert.equal(notificationTitle("sms", { to: "+1555" }), "+1555");

  await delayWithSignal(0);
  const stub = await executeHttpOutbound({
    id: "outbound-1",
    target: "stub-target",
    method: "POST",
    url: "stub://echo?status=201",
    requestBodyKind: "json",
    jsonBody: { ok: true },
    bodyText: "{\"ok\":true}",
    headers: { authorization: "secret", "x-id": "123" },
    authKind: "bearer",
    authConfigKey: "service",
    correlationId: "corr-1"
  }, {
    appContext: { httpOutboundStubState: new Map() },
    signal: null,
    attempt: 1
  });
  assert.equal(stub.transport, "stub");
  assert.equal(stub.status, 201);
  assert.match(stub.bodyText, /stub-target/);
  assert.match(stub.bodyText, /\[redacted\]/);
});

test("backend seams page renderer escapes diagnostic content", () => {
  const html = renderBackendSeamsPage({
    capabilities: [],
    runtimeConfig: { fieldCount: 0, missingCount: 0 },
    jobs: { queuedCount: 0, deadLetterCount: 0 },
    dbSql: { operationCount: 0 },
    search: { indexCount: 0 },
    oauth: { linkCount: 0 },
    outbound: { total: 0 },
    webhooks: { total: 0, rejectedCount: 0 },
    notifications: { total: 0 },
    assets: { total: 0, ingestRetryableCount: 0, searchRefreshableCount: 0 },
    filesContexts: [],
    failures: {
      dbSqlFailed: [],
      searchIndexFailed: [],
      authOauthFailed: [],
      httpOutboundFailed: [],
      httpOutboundRequestFailed: [],
      assetUploadFailed: [],
      assetContentReadFailed: [],
      jobDeadLetter: [],
      webhookReceiveFailed: [],
      webhookRejected: [],
      notifyEmailRenderFailed: [],
      notifySmsRenderFailed: [],
      fsBlobFailed: [],
      fsStreamFailed: []
    },
    repairs: {
      ingestRetryable: [{ id: "asset-1", title: "<script>", processingStatus: "dead-letter", processingError: "boom", retryUrl: "/retry?x=<y>" }],
      searchRefreshable: []
    }
  });
  assert.match(html, /Backend Seams/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /\/retry\?x=&lt;y&gt;/);
});
