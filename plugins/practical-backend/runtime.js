import { handlerCatalog } from "./handler-catalog.js";
import {
  createPracticalBackendAssetSurfaceHandlers,
  createPracticalBackendAssetWorkflowHandlers,
  createPracticalBackendBackendSeamsHandlers,
  createPracticalBackendDbSqlHandlers,
  createPracticalBackendFsBlobHandlers,
  createPracticalBackendFsStreamHandlers,
  createPracticalBackendHttpOutboundHandlers,
  createPracticalBackendJobsHandlers,
  createPracticalBackendNotificationsHandlers,
  createPracticalBackendOauthHandlers,
  createPracticalBackendRuntimeConfigHandlers,
  createPracticalBackendSearchIndexHandlers,
  createPracticalBackendWebhookHandlers
} from "./handlers.js";

export const bundleId = "bundle-practical-backend";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

function surfaceEntry({
  id,
  title,
  href,
  action = null,
  search,
  subtitle = "",
  type = "surface",
  tier = "internal",
  contexts = ["app-command", "world-command"]
}) {
  return {
    id,
    title,
    subtitle,
    href,
    action,
    type,
    tier,
    contexts,
    search: search || `${title} ${subtitle} ${href || ""}`
  };
}

export const routes = Object.freeze([
  exactRoute("GET", "/backend-seams", "page.backendSeams"),
  exactRoute("GET", "/api/backend-seams", "backendSeams.read"),
  exactRoute("GET", "/api/runtime-config", "runtimeConfig.read"),
  exactRoute("GET", "/api/db/sql", "db.sql.inspect"),
  exactRoute("POST", "/api/db/sql/migrate", "db.sql.migrate"),
  exactRoute("POST", "/api/db/sql/query", "db.sql.query"),
  exactRoute("POST", "/api/db/sql/command", "db.sql.command"),
  exactRoute("POST", "/api/db/sql/transaction", "db.sql.transaction"),
  exactRoute("GET", "/api/search/index", "search.index.inspect"),
  exactRoute("POST", "/api/search/index/build", "search.index.build"),
  exactRoute("POST", "/api/search/index/reindex", "search.index.reindex"),
  exactRoute("POST", "/api/search/index/query", "search.index.query"),
  exactRoute("POST", "/api/oauth/start", "auth.oauth.start"),
  exactRoute("GET", "/api/oauth/links", "auth.oauth.links.list"),
  patternRoute("GET", /^\/api\/oauth\/links\/([^/]+)$/, "auth.oauth.links.read", ["id"]),
  patternRoute("GET", /^\/api\/oauth\/callback\/([^/]+)$/, "auth.oauth.callback", ["provider"]),
  exactRoute("GET", "/api/http/outbound", "http.outbound.list"),
  exactRoute("POST", "/api/http/outbound", "http.outbound.send"),
  patternRoute("GET", /^\/api\/http\/outbound\/([^/]+)$/, "http.outbound.read", ["id"]),
  exactRoute("GET", "/api/webhooks", "webhook.inbound.list"),
  patternRoute("GET", /^\/api\/webhooks\/([^/]+)$/, "webhook.inbound.read", ["id"]),
  patternRoute("POST", /^\/api\/webhooks\/inbound\/([^/]+)$/, "webhook.inbound.receive", ["target"]),
  exactRoute("GET", "/api/jobs", "jobs.queue.list"),
  exactRoute("POST", "/api/jobs", "jobs.queue.enqueue"),
  patternRoute("GET", /^\/api\/jobs\/([^/]+)$/, "jobs.queue.read", ["id"]),
  exactRoute("POST", "/api/notify/email", "notify.email.enqueue"),
  exactRoute("POST", "/api/notify/sms", "notify.sms.enqueue"),
  exactRoute("GET", "/api/notifications", "notifications.list"),
  patternRoute("GET", /^\/api\/notifications\/([^/]+)$/, "notifications.read", ["id"]),
  exactRoute("GET", "/api/fs/blobs", "fs.blob.list"),
  exactRoute("DELETE", "/api/fs/blobs", "fs.blob.delete"),
  exactRoute("GET", "/api/fs/blobs/meta", "fs.blob.meta"),
  exactRoute("GET", "/api/fs/blobs/content", "fs.blob.read"),
  exactRoute("PUT", "/api/fs/blobs/content", "fs.blob.write"),
  exactRoute("POST", "/api/fs/streams/copy", "fs.stream.copy"),
  exactRoute("GET", "/api/fs/streams/content", "fs.stream.read"),
  exactRoute("PUT", "/api/fs/streams/content", "fs.stream.write"),
  exactRoute("POST", "/api/assets", "asset.upload"),
  patternRoute("GET", /^\/api\/assets\/([^/]+)\/attachments$/, "asset.attachments.list", ["id"]),
  patternRoute("POST", /^\/api\/assets\/([^/]+)\/attachments$/, "asset.attach", ["id"]),
  patternRoute("DELETE", /^\/api\/assets\/([^/]+)\/attachments$/, "asset.detach", ["id"]),
  patternRoute("POST", /^\/api\/assets\/([^/]+)\/ingest\/retry$/, "asset.ingest.retry", ["id"]),
  patternRoute("POST", /^\/api\/assets\/([^/]+)\/search\/reindex$/, "asset.search.reindex", ["id"]),
  patternRoute("GET", /^\/api\/assets\/([^/]+)\/content$/, "asset.content.read", ["id"]),
  patternRoute("GET", /^\/api\/assets\/([^/]+)\/text$/, "asset.text.read", ["id"]),
  patternRoute("GET", /^\/api\/assets\/([^/]+)\/thumbnail$/, "asset.thumbnail.read", ["id"])
]);

export const surfaces = Object.freeze([
  surfaceEntry({
    id: "surface:backend-seams",
    title: "Open Backend Seams",
    subtitle: "Diagnostics surface",
    href: "/backend-seams",
    type: "surface",
    tier: "internal",
    contexts: ["world-command"],
    search: "backend seams diagnostics hidden internal operator /backend-seams"
  })
]);

const handlerFactories = Object.freeze([
  createPracticalBackendAssetSurfaceHandlers,
  createPracticalBackendAssetWorkflowHandlers,
  createPracticalBackendBackendSeamsHandlers,
  createPracticalBackendOauthHandlers,
  createPracticalBackendRuntimeConfigHandlers,
  createPracticalBackendJobsHandlers,
  createPracticalBackendHttpOutboundHandlers,
  createPracticalBackendNotificationsHandlers,
  createPracticalBackendWebhookHandlers,
  createPracticalBackendDbSqlHandlers,
  createPracticalBackendFsBlobHandlers,
  createPracticalBackendFsStreamHandlers,
  createPracticalBackendSearchIndexHandlers
]);

export function createHandlers(deps) {
  return Object.assign(
    {},
    ...handlerFactories.map(factory => factory(deps))
  );
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
