import { handlerCatalog } from "./handler-catalog.js";

export const bundleId = "bundle-fs-json";
export { handlerCatalog };
export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);

export function createHandlers() {
  return {};
}

export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };
