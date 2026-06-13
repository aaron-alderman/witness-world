import { createMcpAuthoringBundleHandlers } from "./mcp-authoring-handlers.js";

function exactRoute(method, path, handler, params = {}) {
  return Object.freeze({ kind: "exact", method, path, handler, params });
}

export const bundleId = "bundle-mcp-authoring";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "mcpServer.create",
    "mcpTool.install",
    "mcpTool.remove"
  ]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "mcpServer.create",
    "mcpTool.install",
    "mcpTool.remove"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  exactRoute("POST", "/api/mcp-servers", "mcpServer.create"),
  exactRoute("POST", "/api/mcp-tool-installs", "mcpTool.install"),
  exactRoute("DELETE", "/api/mcp-tool-installs", "mcpTool.remove")
]);

export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createMcpAuthoringBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
