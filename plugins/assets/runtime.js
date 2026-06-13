import { handlerCatalog } from "./handler-catalog.js";
import {
  createAssetSurfaceHandlers,
  createAssetWorkflowHandlers
} from "./handlers.js";
import {
  assetDerivedTextPathForAppContext,
  assetDerivedTextStorageKey,
  assetDerivedThumbnailPathForAppContext,
  assetDerivedThumbnailStorageKey,
  assetThumbnailUrlForId,
  createPracticalBackendAssetServices
} from "./asset-services.js";
import {
  extractAssetSearchText,
  extractAssetThumbnail,
  supportsDerivedAssetSearchText
} from "./asset-derived-utils.js";
import { createBuiltinAssetJobHandlers } from "./job-handlers.js";
import { assetModuleProjectors } from "./projections.js";

export const bundleId = "bundle-assets";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
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

export const surfaces = Object.freeze([]);

const handlerFactories = Object.freeze([
  createAssetSurfaceHandlers,
  createAssetWorkflowHandlers
]);

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "assets.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "upload.asset",
        label: "Upload Asset",
        dependsOn: Object.freeze(["fs.blob", "fs.stream"]),
        providerAdapters: Object.freeze([
          Object.freeze({ id: "local-disk", label: "Local disk", status: "shipped", default: true })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["storageKey", "contentUrl", "textRef", "thumbnailRef", "thumbnailUrl"])
        })
      })
    ])
  },
  {
    kind: "moduleProjectors",
    id: "assets.projections",
    projectors: assetModuleProjectors
  },
  {
    kind: "supportServiceFactory",
    id: "assets.support",
    factory: () => ({
      createPracticalBackendAssetServices
    })
  },
  {
    kind: "jobHandlerFactory",
    id: "assets",
    factory: deps => createBuiltinAssetJobHandlers({
      ...deps,
      supportsDerivedAssetSearchText,
      extractAssetSearchText,
      extractAssetThumbnail,
      assetDerivedTextPathForAppContext,
      assetDerivedTextStorageKey,
      assetDerivedThumbnailPathForAppContext,
      assetDerivedThumbnailStorageKey,
      assetThumbnailUrlForId
    })
  }
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
  providers,
  createHandlers
};
