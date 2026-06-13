function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderBackendSeamsPage(diagnostics) {
  const json = escapeHtml(JSON.stringify(diagnostics, null, 2));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Backend Seams</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: #f4f1e8;
        color: #1f1d1a;
      }
      body {
        margin: 0;
        padding: 32px;
        background:
          radial-gradient(circle at top right, rgba(208, 143, 54, 0.18), transparent 32%),
          linear-gradient(180deg, #f7f3ea 0%, #efe8db 100%);
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        background: rgba(255, 252, 247, 0.94);
        border: 1px solid #d8ccb5;
        border-radius: 18px;
        box-shadow: 0 18px 48px rgba(55, 39, 13, 0.12);
        padding: 28px;
      }
      h1, h2 {
        margin: 0 0 12px;
      }
      p {
        margin: 0 0 20px;
        line-height: 1.5;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }
      .fact {
        background: #fffaf0;
        border: 1px solid #e5d8bf;
        border-radius: 12px;
        padding: 14px;
      }
      .fact strong,
      .fact span {
        display: block;
      }
      .fact strong {
        font-size: 0.85rem;
        color: #6e5d44;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      pre {
        overflow: auto;
        background: #1f1f1f;
        color: #f7f1e3;
        padding: 18px;
        border-radius: 14px;
        font-size: 0.9rem;
        line-height: 1.45;
      }
      a {
        color: #854f0e;
      }
      .repair-list {
        display: grid;
        gap: 12px;
        margin: 0 0 24px;
      }
      .repair-item {
        background: #fffaf0;
        border: 1px solid #e5d8bf;
        border-radius: 12px;
        padding: 14px;
      }
      .repair-item p {
        margin: 0 0 10px;
      }
      .repair-item form {
        margin: 0;
      }
      button {
        border: 1px solid #854f0e;
        background: #fff;
        color: #854f0e;
        border-radius: 999px;
        padding: 8px 14px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Backend Seams</h1>
      <p>Operator-visible inspection for the current practical backend slice. This page is intentionally narrow: it reports the shipped files, jobs, SQL, search, OAuth, outbound HTTP, inbound webhook, and stub notification seams, local runtime status, and recent witnessed failures.</p>
      <section class="facts">
        <div class="fact"><strong>Capabilities</strong><span>${diagnostics.capabilities.length}</span></div>
        <div class="fact"><strong>Config Fields</strong><span>${diagnostics.runtimeConfig.fieldCount}</span></div>
        <div class="fact"><strong>Missing Config</strong><span>${diagnostics.runtimeConfig.missingCount}</span></div>
        <div class="fact"><strong>Queued Jobs</strong><span>${diagnostics.jobs.queuedCount}</span></div>
        <div class="fact"><strong>Dead Jobs</strong><span>${diagnostics.jobs.deadLetterCount}</span></div>
        <div class="fact"><strong>SQL Operations</strong><span>${diagnostics.dbSql.operationCount}</span></div>
        <div class="fact"><strong>SQL Failures</strong><span>${diagnostics.failures.dbSqlFailed.length}</span></div>
        <div class="fact"><strong>Search Indexes</strong><span>${diagnostics.search.indexCount}</span></div>
        <div class="fact"><strong>Search Failures</strong><span>${diagnostics.failures.searchIndexFailed.length}</span></div>
        <div class="fact"><strong>OAuth Links</strong><span>${diagnostics.oauth.linkCount}</span></div>
        <div class="fact"><strong>OAuth Failures</strong><span>${diagnostics.failures.authOauthFailed.length}</span></div>
        <div class="fact"><strong>Outbound Calls</strong><span>${diagnostics.outbound.total}</span></div>
        <div class="fact"><strong>Outbound Failures</strong><span>${diagnostics.failures.httpOutboundFailed.length + diagnostics.failures.httpOutboundRequestFailed.length}</span></div>
        <div class="fact"><strong>Webhook Deliveries</strong><span>${diagnostics.webhooks.total}</span></div>
        <div class="fact"><strong>Webhook Rejections</strong><span>${diagnostics.webhooks.rejectedCount}</span></div>
        <div class="fact"><strong>Notifications</strong><span>${diagnostics.notifications.total}</span></div>
        <div class="fact"><strong>Assets</strong><span>${diagnostics.assets.total}</span></div>
        <div class="fact"><strong>Retryable Ingest</strong><span>${diagnostics.assets.ingestRetryableCount}</span></div>
        <div class="fact"><strong>Stale Search Assets</strong><span>${diagnostics.assets.searchRefreshableCount}</span></div>
        <div class="fact"><strong>Files Contexts</strong><span>${diagnostics.filesContexts.length}</span></div>
        <div class="fact"><strong>Upload Failures</strong><span>${diagnostics.failures.assetUploadFailed.length}</span></div>
        <div class="fact"><strong>Read Failures</strong><span>${diagnostics.failures.assetContentReadFailed.length}</span></div>
        <div class="fact"><strong>Job Dead Letters</strong><span>${diagnostics.failures.jobDeadLetter.length}</span></div>
        <div class="fact"><strong>Webhook Failures</strong><span>${diagnostics.failures.webhookReceiveFailed.length + diagnostics.failures.webhookRejected.length}</span></div>
        <div class="fact"><strong>Notify Render Failures</strong><span>${diagnostics.failures.notifyEmailRenderFailed.length + diagnostics.failures.notifySmsRenderFailed.length}</span></div>
        <div class="fact"><strong>Blob Failures</strong><span>${diagnostics.failures.fsBlobFailed.length}</span></div>
        <div class="fact"><strong>Stream Failures</strong><span>${diagnostics.failures.fsStreamFailed.length}</span></div>
      </section>
      <h2>Asset Repair Queue</h2>
      ${diagnostics.repairs.ingestRetryable.length
        ? `<div class="repair-list">${diagnostics.repairs.ingestRetryable.map(asset => `
            <div class="repair-item">
              <p><strong>${escapeHtml(asset.title || asset.id)}</strong><br>Ingest status: ${escapeHtml(asset.processingStatus || "unknown")}${asset.processingError ? `<br>Reason: ${escapeHtml(asset.processingError)}` : ""}</p>
              <form method="post" action="${escapeHtml(asset.retryUrl)}">
                <button type="submit">Retry ingest</button>
              </form>
            </div>
          `).join("")}</div>`
        : `<p>No asset ingestion repairs are currently queued for operator action.</p>`}
      <h2>Asset Search Refresh</h2>
      ${diagnostics.repairs.searchRefreshable.length
        ? `<div class="repair-list">${diagnostics.repairs.searchRefreshable.map(asset => `
            <div class="repair-item">
              <p><strong>${escapeHtml(asset.title || asset.id)}</strong><br>Search policy: ${escapeHtml(asset.searchPolicy || "unknown")}${asset.lastBuiltAt ? `<br>Last built: ${escapeHtml(asset.lastBuiltAt)}` : ""}${asset.assetUpdatedAt ? `<br>Asset updated: ${escapeHtml(asset.assetUpdatedAt)}` : ""}</p>
              <form method="post" action="${escapeHtml(asset.reindexUrl)}">
                <button type="submit">Refresh asset search</button>
              </form>
            </div>
          `).join("")}</div>`
        : `<p>No stale asset-backed search entries are waiting for repair.</p>`}
      <p>Raw JSON: <a href="/api/backend-seams">/api/backend-seams</a>  |  Runtime config: <a href="/api/runtime-config">/api/runtime-config</a>  |  SQL: <a href="/api/db/sql">/api/db/sql</a>  |  Search: <a href="/api/search/index">/api/search/index</a>  |  OAuth Links: <a href="/api/oauth/links">/api/oauth/links</a>  |  Jobs: <a href="/api/jobs">/api/jobs</a>  |  Outbound: <a href="/api/http/outbound">/api/http/outbound</a>  |  Webhooks: <a href="/api/webhooks">/api/webhooks</a>  |  Notifications: <a href="/api/notifications">/api/notifications</a></p>
      <h2>Diagnostics</h2>
      <pre id="backend-seams-json">${json}</pre>
    </main>
  </body>
</html>`;
}
