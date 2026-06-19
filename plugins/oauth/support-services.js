import { relation, thing } from "../../src/kernel.js";

// OIDC-family providers all resolve to the generic OIDC/OAuth2 adapter. Named vendors are config
// presets (endpoints + field mapping + any required headers); the operator supplies only credentials.
const OAUTH_PROVIDER_PRESETS = Object.freeze({
  oidc: Object.freeze({}),
  google: Object.freeze({
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    externalIdField: "sub"
  }),
  github: Object.freeze({
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    scope: "read:user user:email",
    externalIdField: "id",
    usernameField: "login",
    labelField: "name",
    // GitHub's user API rejects requests without a User-Agent.
    userinfoHeaders: Object.freeze({ "user-agent": "witness-world-oauth", accept: "application/vnd.github+json" })
  })
});

const OIDC_FAMILY_PROVIDERS = new Set(Object.keys(OAUTH_PROVIDER_PRESETS));

export function createRuntimeAuthOAuthSupportServices({
  world,
  backendHost,
  randomUUID,
  runtimeConfigLookup,
  headerValue
}) {
  const authOAuthFlowId = () => `oauthFlow:${randomUUID()}`;
  const authOAuthLinkId = (provider, providerAccountId) => `oauthLink:${encodeURIComponent(provider)}:${encodeURIComponent(providerAccountId)}`;
  const authOAuthFlowTitle = ({ provider, action, providerAccountId = null }) => `${provider} OAuth ${action}${providerAccountId ? ` ${providerAccountId}` : ""}`;
  const authOAuthLinkTitle = ({ provider, providerAccountId, label = null }) => label ? `${provider} ${label}` : `${provider} account ${providerAccountId}`;
  const authOAuthReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    identity: row.identity,
    actor: row.actor,
    label: row.label,
    status: row.status,
    createdIdentity: row.createdIdentity,
    lastError: row.lastError
  });
  const sanitizeAuthOauthSegment = value => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || "user";
  };
  const authOAuthCallbackBaseUrl = (req, appContext) => {
    const configured = runtimeConfigLookup(appContext?.runtimeConfig ?? {}, "auth.oauth.callbackBaseUrl");
    if (typeof configured === "string" && configured.trim()) return configured.replace(/\/+$/, "");
    const host = headerValue(req.headers.host) || "127.0.0.1";
    return `http://${host}/api/oauth/callback`;
  };
  const normalizeAuthOAuthConfig = ({ runtimeConfig, requestedProvider = null }) => {
    // A runner may enable several providers at once via `auth.oauth.providers = ["google","github"]`
    // (so a host can offer both Gmail and GitHub sign-in). The legacy single `auth.oauth.provider`
    // key still works and defines a one-entry allowlist. `providers` takes precedence when present.
    const configuredProviderRaw = runtimeConfigLookup(runtimeConfig ?? {}, "auth.oauth.provider");
    const configuredProvider = typeof configuredProviderRaw === "string" ? configuredProviderRaw.trim() : "";
    // `providers` may be an array (when set programmatically) or a comma/space-delimited string —
    // the latter because the runtime-config seam only carries scalar values, not arrays.
    const configuredProvidersRaw = runtimeConfigLookup(runtimeConfig ?? {}, "auth.oauth.providers");
    const configuredProvidersList = Array.isArray(configuredProvidersRaw)
      ? configuredProvidersRaw
      : (typeof configuredProvidersRaw === "string" ? configuredProvidersRaw.split(/[\s,]+/) : []);
    const configuredProviders = [...new Set(
      configuredProvidersList.map(value => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
    )];
    const enabledProviders = configuredProviders.length
      ? configuredProviders
      : (configuredProvider ? [configuredProvider] : []);
    if (!enabledProviders.length) return { ok: false, status: 503, reason: "auth.oauth.provider not configured" };
    let provider;
    if (requestedProvider) {
      if (!enabledProviders.includes(requestedProvider)) {
        return { ok: false, status: 409, reason: `auth.oauth provider not enabled: requested ${requestedProvider}, enabled ${enabledProviders.join(", ")}` };
      }
      provider = requestedProvider;
    } else if (enabledProviders.length === 1) {
      provider = enabledProviders[0];
    } else {
      return { ok: false, status: 400, reason: `auth.oauth provider required: choose one of ${enabledProviders.join(", ")}` };
    }
    if (provider !== "stub" && !OIDC_FAMILY_PROVIDERS.has(provider)) {
      return { ok: false, status: 501, reason: `${provider} oauth adapter not implemented` };
    }
    const autoCreateRaw = runtimeConfigLookup(runtimeConfig ?? {}, "auth.oauth.autoCreate");
    const resolved = {
      ok: true,
      status: 200,
      provider,
      autoCreate: autoCreateRaw == null ? true : autoCreateRaw === true || String(autoCreateRaw).trim().toLowerCase() === "true"
    };
    if (OIDC_FAMILY_PROVIDERS.has(provider)) {
      // Named vendors (google, github) are presets over the generic OIDC adapter: endpoints default
      // from the preset, operator supplies clientId/clientSecret. Generic "oidc" has no preset, so all
      // endpoints stay required. Every key is overridable for self-hosted/Enterprise deployments.
      const preset = OAUTH_PROVIDER_PRESETS[provider] ?? {};
      const cfg = key => {
        const value = runtimeConfigLookup(runtimeConfig ?? {}, `auth.oauth.${provider}.${key}`);
        return typeof value === "string" && value.trim() ? value.trim() : null;
      };
      const oidc = {
        clientId: cfg("clientId"),
        clientSecret: cfg("clientSecret"),
        authorizeUrl: cfg("authorizeUrl") || preset.authorizeUrl || null,
        tokenUrl: cfg("tokenUrl") || preset.tokenUrl || null,
        userinfoUrl: cfg("userinfoUrl") || preset.userinfoUrl || null,
        scope: cfg("scope") || preset.scope || "openid email profile",
        redirectUri: cfg("redirectUri"),
        externalIdField: cfg("externalIdField") || preset.externalIdField || "sub",
        usernameField: cfg("usernameField") || preset.usernameField || null,
        labelField: cfg("labelField") || preset.labelField || null,
        userinfoHeaders: preset.userinfoHeaders ?? null
      };
      const missing = ["clientId", "clientSecret", "authorizeUrl", "tokenUrl", "userinfoUrl"]
        .filter(key => !oidc[key]);
      if (missing.length) {
        return { ok: false, status: 503, reason: `auth.oauth.${provider} config missing: ${missing.map(key => `auth.oauth.${provider}.${key}`).join(", ")}` };
      }
      resolved.oidc = oidc;
      resolved.redirectUri = oidc.redirectUri;
    }
    return resolved;
  };
  const normalizeAuthOAuthProfile = profile => {
    const object = profile && typeof profile === "object" ? profile : {};
    const externalId = typeof object.externalId === "string" && object.externalId.trim()
      ? object.externalId.trim()
      : "stub-user";
    const actor = typeof object.actor === "string" && object.actor.trim()
      ? object.actor.trim()
      : sanitizeAuthOauthSegment(typeof object.username === "string" && object.username.trim() ? object.username : externalId);
    const username = typeof object.username === "string" && object.username.trim()
      ? object.username.trim()
      : actor;
    const label = typeof object.label === "string" && object.label.trim()
      ? object.label.trim()
      : `Stub ${username}`;
    return { externalId, actor, username, label };
  };
  const emitAuthOauthFlow = ({ actor, flow, process, reason = null, providerAccountId = null, identity = null, createdIdentity = false }) => world.emit({
    process,
    actor,
    claims: [
      thing(flow.id),
      relation(flow.id, "hasModuleKind", "oauthFlow"),
      relation(backendHost, "owns", flow.id),
      relation(flow.id, "hasTitle", authOAuthFlowTitle({ provider: flow.provider, action: flow.action, providerAccountId })),
      ...(identity ? [relation(flow.id, "resolvedIdentity", identity)] : [])
    ],
    body: {
      id: flow.id,
      serverRunner: flow.serverRunner,
      provider: flow.provider,
      state: flow.state,
      action: flow.action,
      requestedIdentity: flow.requestedIdentity ?? null,
      callbackUrl: flow.callbackUrl,
      authorizeUrl: flow.authorizeUrl,
      ...(providerAccountId ? { providerAccountId } : {}),
      ...(identity ? { identity } : {}),
      ...(createdIdentity ? { createdIdentity: true } : {}),
      ...(reason ? { reason } : {})
    }
  });
  const emitAuthOauthLink = ({ actor, flow, identity, profile, createdIdentity = false, process = "auth.oauth.link", reason = null }) => {
    const linkId = authOAuthLinkId(flow.provider, profile.externalId);
    world.emit({
      process,
      actor,
      claims: [
        thing(linkId),
        relation(linkId, "hasModuleKind", "oauthLink"),
        relation(backendHost, "owns", linkId),
        relation(linkId, "hasTitle", authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity?.label ?? profile.label })),
        ...(identity?.id ? [relation(linkId, "linksIdentity", identity.id)] : [])
      ],
      body: {
        id: flow.id,
        linkId,
        serverRunner: flow.serverRunner,
        provider: flow.provider,
        providerAccountId: profile.externalId,
        identity: identity?.id ?? null,
        actor: identity?.actor ?? null,
        label: identity?.label ?? profile.label,
        createdIdentity,
        ...(reason ? { reason } : {})
      }
    });
    return linkId;
  };
  const emitAuthOauthSession = ({ actor, flow, identity, session, createdIdentity = false, process = "auth.oauth.session", reason = null }) => world.emit({
    process,
    actor,
    claims: [
      ...(identity?.id ? [relation(identity.id, "authenticatedAs", identity.actor)] : []),
      ...(identity?.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
    ],
    body: {
      id: flow.id,
      serverRunner: flow.serverRunner,
      provider: flow.provider,
      identity: identity?.id ?? null,
      actor: identity?.actor ?? null,
      sessionId: session?.id ?? null,
      createdIdentity,
      ...(reason ? { reason } : {})
    }
  });

  return {
    authOAuthFlowId,
    authOAuthLinkId,
    authOAuthFlowTitle,
    authOAuthLinkTitle,
    authOAuthReadShape,
    sanitizeAuthOauthSegment,
    authOAuthCallbackBaseUrl,
    normalizeAuthOAuthConfig,
    normalizeAuthOAuthProfile,
    emitAuthOauthFlow,
    emitAuthOauthLink,
    emitAuthOauthSession
  };
}
