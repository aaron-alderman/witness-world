export const bundleId = "bundle-engentus-dev-diagnostics";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const capabilities = Object.freeze([]);
export const providers = Object.freeze([
  {
    kind: "surfaceRuntimeSupportAssets",
    id: "engentus.shell.expectations",
    factory(context = {}) {
      if (context?.devMode !== true) return null;
      if (context?.rootSurface?.id !== "EngentusRoot") return null;
      return {
        scriptBody: `
import { registerEngentusShellExpectationProvider } from "/app-static/app/helpers/engentus-shell-runtime-expectations.js";
registerEngentusShellExpectationProvider(window);
        `.trim()
      };
    }
  }
]);

export function createHandlers() {
  return {};
}

export default {
  bundleId,
  handlerCatalog,
  capabilities,
  routes,
  surfaces,
  providers,
  createHandlers
};
