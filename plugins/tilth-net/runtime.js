import { createTilthNetHandlers } from "./tilth-net-docs.js";

export const bundleId = "bundle-tilth-net";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "docs.read",
    "recognized.read",
    "identities.read",
    "identity.claim",
    "identity.card",
    "identity.recognize",
    "identity.recognize.intent",
    "recognize-intents.read",
    "doc.put",
    "repos.read",
    "repo.announce",
    "repo.open",
    "repo.close",
    "sessions.read",
    "session.announce",
    "session.share",
    "session.unshare",
    "commons.observe",
    "commons.read",
    "commons.pull.folder",
    "commons.pull",
    "commons.pull.result",
    "commons.pulls.read"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const providers = Object.freeze([]);

export function createHandlers(deps) {
  return createTilthNetHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
