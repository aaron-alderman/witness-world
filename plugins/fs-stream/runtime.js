import { handlerCatalog } from "./handler-catalog.js";
import { createFsStreamHandlers } from "./handlers.js";
import {
  parseStreamFailureLimit,
  streamFileToFile,
  streamReadableToFile
} from "./stream-utils.js";

export const bundleId = "bundle-fs-stream";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

export const routes = Object.freeze([
  exactRoute("POST", "/api/fs/streams/copy", "fs.stream.copy"),
  exactRoute("GET", "/api/fs/streams/content", "fs.stream.read"),
  exactRoute("PUT", "/api/fs/streams/content", "fs.stream.write")
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "fs-stream.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "fs.stream",
        label: "Stream Storage",
        providerAdapters: Object.freeze([
          Object.freeze({ id: "local-disk", label: "Local disk", status: "shipped", default: true })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["storageKey"]),
          failure: Object.freeze(["fs.stream.write.failed", "fs.stream.copy.failed"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([])
      })
    ])
  },
  {
    kind: "supportServiceFactory",
    id: "fs-stream.support",
    factory: () => ({
      parseStreamFailureLimit,
      streamFileToFile,
      streamReadableToFile
    })
  }
]);

export function createHandlers(deps) {
  return createFsStreamHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
