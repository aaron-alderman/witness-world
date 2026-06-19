import { createTilthHandlers } from "./tilth-sessions.js";

export const bundleId = "bundle-tilth";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "sessions.read",
    "session.import",
    "session.markDesire",
    "session.repoIndex.request",
    "session.transcriptPreview.request",
    "session.aiSummary.request",
    "repoIndex.requests.read",
    "repoIndex.repos.read",
    "repoIndex.request.result",
    "transcriptPreview.requests.read",
    "transcriptPreview.request.result",
    "aiSummary.requests.read",
    "aiSummary.request.result"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const providers = Object.freeze([]);

export function createHandlers(deps) {
  return createTilthHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
