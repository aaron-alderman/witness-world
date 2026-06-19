import {
  renderEngentusDebugPage,
  renderEngentusDebugSupportScript
} from "./engentus-debug-sidecar.js";

export const bundleId = "bundle-engentus-dev-diagnostics";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze(["engentus.debug.page"]),
  pageHandlers: Object.freeze(["engentus.debug.page"]),
  dispatchHandlers: Object.freeze(["engentus.debug.page"]),
  handlerMetadata: Object.freeze({
    "engentus.debug.page": Object.freeze({ routeKind: "page", responseKind: "page", methods: Object.freeze(["GET"]) })
  })
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const capabilities = Object.freeze([]);
export const providers = Object.freeze([
  {
    kind: "surfaceRuntimeSupportAssets",
    id: "engentus.shell.expectations",
    factory(context = {}) {
      if (context?.rootSurface?.id !== "EngentusRoot") return null;
      return {
        scriptBody: `
${context?.devMode === true
  ? `import { registerEngentusShellExpectationProvider } from "/app-static/app/helpers/engentus-shell-runtime-expectations.js";
registerEngentusShellExpectationProvider(window);`
  : ""}
${renderEngentusDebugSupportScript()}
        `.trim()
      };
    }
  }
]);

export function createHandlers({ send } = {}) {
  return {
    "engentus.debug.page": async ({ res, requestUrl, requestSession, appContext }) => {
      const featureAccess = requestSession?.featureAccess ?? {};
      const platformConfigAccess = (
        featureAccess["engentus.platform_config"]
        ?? requestSession?.featureAccess__engentus_platform_config
      ) || "hidden";
      if (platformConfigAccess !== "granted") {
        send?.(res, 403, "text/html", renderEngentusDebugPage({
          previewSessionId: null,
          wcssPreviewSessionId: null,
          debugSessionId: null,
          previewSession: {
            id: "",
            status: "forbidden",
            invalidReason: "engentus.platform_config access is required to open the debug sidecar.",
            sources: []
          }
        }));
        return;
      }
      const previewSessionId = requestUrl?.searchParams?.get("previewSessionId")?.trim() || null;
      const wcssPreviewSessionId = requestUrl?.searchParams?.get("wcssPreview")?.trim() || null;
      const debugSessionId = requestUrl?.searchParams?.get("debugSessionId")?.trim() || null;
      const previewSession = previewSessionId
        ? (appContext?.appPreviewSessionManager?.readSession(previewSessionId) ?? null)
        : null;
      send?.(res, 200, "text/html", renderEngentusDebugPage({
        previewSessionId,
        wcssPreviewSessionId,
        debugSessionId,
        previewSession
      }), appContext?.devMode ? { "cache-control": "no-cache" } : {});
    }
  };
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
