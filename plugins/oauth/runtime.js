import { handlerCatalog } from "./handler-catalog.js";
import { createOauthHandlers } from "./handlers.js";
import { createRuntimeAuthOAuthSupportServices } from "./support-services.js";
import { oauthModuleProjectors } from "./projections.js";

export const bundleId = "bundle-oauth";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("POST", "/api/oauth/start", "auth.oauth.start"),
  exactRoute("GET", "/api/oauth/links", "auth.oauth.links.list"),
  patternRoute("GET", /^\/api\/oauth\/links\/([^/]+)$/, "auth.oauth.links.read", ["id"]),
  patternRoute("GET", /^\/api\/oauth\/callback\/([^/]+)$/, "auth.oauth.callback", ["provider"])
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "oauth.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "auth.oauth",
        label: "OAuth",
        providerAdapters: Object.freeze([
          Object.freeze({ id: "stub", label: "Stub provider", status: "shipped", default: true }),
          Object.freeze({ id: "oidc", label: "Generic OIDC/OAuth2", status: "shipped" }),
          Object.freeze({ id: "google", label: "Google", status: "shipped" }),
          Object.freeze({ id: "github", label: "GitHub", status: "shipped" })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["providerAccountId"]),
          failure: Object.freeze(["auth.oauth.start.failed", "auth.oauth.callback.failed", "auth.oauth.link.failed"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([
          Object.freeze({ name: "auth.oauth.provider", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.autoCreate", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.callbackBaseUrl", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.clientId", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.clientSecret", accepts: "runtimeConfig.key", source: "secret" }),
          Object.freeze({ name: "auth.oauth.oidc.authorizeUrl", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.tokenUrl", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.userinfoUrl", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.scope", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.redirectUri", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.externalIdField", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.usernameField", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.oidc.labelField", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.google.clientId", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.google.clientSecret", accepts: "runtimeConfig.key", source: "secret" }),
          Object.freeze({ name: "auth.oauth.github.clientId", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "auth.oauth.github.clientSecret", accepts: "runtimeConfig.key", source: "secret" })
        ])
      })
    ])
  },
  {
    kind: "moduleProjectors",
    id: "oauth.projections",
    projectors: oauthModuleProjectors
  },
  {
    kind: "supportServiceFactory",
    id: "oauth.support",
    factory: () => ({
      createRuntimeAuthOAuthSupportServices
    })
  }
]);

export function createHandlers(deps) {
  return createOauthHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
