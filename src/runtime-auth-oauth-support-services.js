import { relation, thing } from "./kernel.js";

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
    const configuredProviderRaw = runtimeConfigLookup(runtimeConfig ?? {}, "auth.oauth.provider");
    const configuredProvider = typeof configuredProviderRaw === "string" ? configuredProviderRaw.trim() : "";
    const provider = requestedProvider || configuredProvider;
    if (!provider) return { ok: false, status: 503, reason: "auth.oauth.provider not configured" };
    if (configuredProvider && requestedProvider && configuredProvider !== requestedProvider) {
      return { ok: false, status: 409, reason: `auth.oauth provider mismatch: configured ${configuredProvider}, requested ${requestedProvider}` };
    }
    if (provider !== "stub") return { ok: false, status: 501, reason: `${provider} oauth adapter not implemented` };
    const autoCreateRaw = runtimeConfigLookup(runtimeConfig ?? {}, "auth.oauth.autoCreate");
    return {
      ok: true,
      status: 200,
      provider,
      autoCreate: autoCreateRaw == null ? true : autoCreateRaw === true || String(autoCreateRaw).trim().toLowerCase() === "true"
    };
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
