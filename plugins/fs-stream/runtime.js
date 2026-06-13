import { handlerCatalog } from "./handler-catalog.js";
import { createFsStreamHandlers } from "./handlers.js";

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

export function createHandlers(deps) {
  return createFsStreamHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
