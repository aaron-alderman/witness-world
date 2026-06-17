import { handlerCatalog } from "./handler-catalog.js";
import { createPipelineRuntimeHandlers } from "./handlers.js";

export const bundleId = "bundle-pipeline-runtime";

export { handlerCatalog };

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createPipelineRuntimeHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
