import { handlerCatalog } from "./handler-catalog.js";
import { createHttpOutboundHandlers } from "./handlers.js";
import {
  createHttpOutboundIoServices,
  looksJsonContentType,
  outboundReadShape,
  responseHeadersToObject
} from "./io-services.js";
import {
  delayWithSignal,
  executeHttpOutbound
} from "./glue.js";
import { httpOutboundModuleProjectors } from "./projections.js";

export const bundleId = "bundle-http-outbound";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/http/outbound", "http.outbound.list"),
  exactRoute("POST", "/api/http/outbound", "http.outbound.send"),
  patternRoute("GET", /^\/api\/http\/outbound\/([^/]+)$/, "http.outbound.read", ["id"])
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "http-outbound.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "http.outbound",
        label: "HTTP Outbound",
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["externalRefId", "correlationId"])
        })
      })
    ])
  },
  {
    kind: "moduleProjectors",
    id: "http-outbound.projections",
    projectors: httpOutboundModuleProjectors
  },
  {
    kind: "supportServiceFactory",
    id: "http-outbound.support",
    factory: () => ({
      createHttpOutboundIoServices,
      looksJsonContentType,
      responseHeadersToObject,
      outboundReadShape,
      delayWithSignal,
      executeHttpOutbound
    })
  }
]);

export function createHandlers(deps) {
  return createHttpOutboundHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
