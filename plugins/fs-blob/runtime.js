import { handlerCatalog } from "./handler-catalog.js";
import { createFsBlobHandlers } from "./handlers.js";
import { createFsBlobIoServices } from "./io-services.js";

export const bundleId = "bundle-fs-blob";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/fs/blobs", "fs.blob.list"),
  exactRoute("DELETE", "/api/fs/blobs", "fs.blob.delete"),
  exactRoute("GET", "/api/fs/blobs/meta", "fs.blob.meta"),
  exactRoute("GET", "/api/fs/blobs/content", "fs.blob.read"),
  exactRoute("PUT", "/api/fs/blobs/content", "fs.blob.write")
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "fs-blob.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "fs.blob",
        label: "Blob Storage",
        providerAdapters: Object.freeze([
          Object.freeze({ id: "local-disk", label: "Local disk", status: "shipped", default: true })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["storageKey"]),
          failure: Object.freeze(["fs.blob.write.failed", "fs.blob.read.failed"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([])
      })
    ])
  },
  {
    kind: "supportServiceFactory",
    id: "fs-blob.support",
    factory: () => ({
      createFsBlobIoServices
    })
  }
]);

export function createHandlers(deps) {
  return createFsBlobHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
