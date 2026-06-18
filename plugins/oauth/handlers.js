import { relation } from "../../src/kernel.js";
import { createOAuthProvider } from "./oauth-providers.js";

export function createOauthHandlers({
  world,
  backendHost,
  fetchImpl,
  readJson,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  randomUUID,
  normalizeAuthOAuthConfig,
  authOAuthFlowId,
  authOAuthCallbackBaseUrl,
  normalizeAuthOAuthProfile,
  emitAuthOauthFlow,
  currentOauthLinkByProviderAccount,
  emitAuthOauthLink,
  emitAuthOauthSession,
  currentOauthLinkForRunner,
  authOAuthReadShape,
  authOAuthLinkTitle,
  currentIdentityIndex,
  sanitizeAuthOauthSegment,
  createIdentity,
  createSessionForIdentity,
  sessionResponseShape,
  sessionCookieHeader,
  oauthLinksForRunner,
  authorityServices
}) {
  const { ensureTargetAuthority } = authorityServices;
  return {
    "auth.oauth.start": async ({ req, res, requestSession, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const body = await readJson(req);
      const requestedProvider = typeof body?.provider === "string" ? body.provider.trim() : "";
      const resolvedConfig = normalizeAuthOAuthConfig({ runtimeConfig: appContext?.runtimeConfig ?? {}, requestedProvider });
      if (!resolvedConfig.ok) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: resolvedConfig.reason } });
        sendJson(res, resolvedConfig.status || 503, { error: resolvedConfig.reason });
        return;
      }
      const action = typeof body?.action === "string" && body.action.trim()
        ? body.action.trim()
        : (requestSession ? "link" : "login");
      if (!["login", "link"].includes(action)) {
        world.emit({ process: "auth.oauth.start.failed", actor: requestSession?.actor || backendHost, claims: [], body: { reason: "auth.oauth action must be login or link", provider: resolvedConfig.provider } });
        sendJson(res, 400, { error: "auth.oauth action must be login or link" });
        return;
      }
      if (action === "link" && !requestSession) {
        world.emit({ process: "auth.oauth.start.failed", actor: backendHost, claims: [], body: { reason: "sign in first to link an oauth account", provider: resolvedConfig.provider } });
        sendJson(res, 401, { error: "sign in first to link an oauth account" });
        return;
      }

      const flow = {
        id: authOAuthFlowId(),
        serverRunner: appContext?.serverRunnerId || "",
        provider: resolvedConfig.provider,
        state: randomUUID(),
        action,
        requestedIdentity: requestSession?.identity ?? null,
        callbackUrl: `${authOAuthCallbackBaseUrl(req, appContext)}/${encodeURIComponent(resolvedConfig.provider)}`,
        authorizeUrl: null,
        // The stub carries its profile in the flow; real providers resolve it from userinfo at callback.
        profile: resolvedConfig.provider === "stub" ? normalizeAuthOAuthProfile(body?.profile) : null
      };
      flow.authorizeUrl = createOAuthProvider(resolvedConfig).buildAuthorizeUrl({ callbackUrl: flow.callbackUrl, state: flow.state });
      appContext.authOAuth?.pendingFlows?.set?.(flow.state, flow);
      emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.start" });
      sendJson(res, 200, {
        flow: {
          id: flow.id,
          provider: flow.provider,
          action: flow.action,
          state: flow.state,
          callbackUrl: flow.callbackUrl,
          authorizeUrl: flow.authorizeUrl
        }
      });
    },

    "auth.oauth.callback": async ({ req, res, params, requestSession, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const provider = params.provider || "";
      const state = requestUrl.searchParams.get("state") || "";
      const code = requestUrl.searchParams.get("code") || "";
      const pendingFlows = appContext?.authOAuth?.pendingFlows;
      const flow = pendingFlows?.get?.(state) ?? null;
      if (!capabilityGate.ok) {
        world.emit({ process: "auth.oauth.callback.failed", actor: requestSession?.actor || backendHost, claims: [], body: { id: flow?.id ?? null, provider, state, reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!flow || flow.provider !== provider) {
        world.emit({ process: "auth.oauth.callback.failed", actor: requestSession?.actor || backendHost, claims: [], body: { provider, state, reason: "unknown oauth flow state" } });
        sendJson(res, 400, { error: "unknown oauth flow state" });
        return;
      }
      pendingFlows.delete(state);

      const resolvedConfig = normalizeAuthOAuthConfig({ runtimeConfig: appContext?.runtimeConfig ?? {}, requestedProvider: provider });
      if (!resolvedConfig.ok) {
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason: resolvedConfig.reason });
        sendJson(res, resolvedConfig.status || 503, { error: resolvedConfig.reason });
        return;
      }
      if (requestUrl.searchParams.get("error")) {
        const reason = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error") || "oauth provider returned an error";
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason });
        sendJson(res, 400, { error: reason });
        return;
      }
      let rawProfile;
      try {
        rawProfile = await createOAuthProvider(resolvedConfig).resolveProfile({
          flow,
          code,
          callbackUrl: flow.callbackUrl,
          fetchImpl
        });
      } catch (error) {
        const status = Number.isFinite(error?.status) ? error.status : 401;
        const reason = error?.reason || (error instanceof Error ? error.message : String(error));
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason });
        sendJson(res, status, { error: reason });
        return;
      }

      const profile = normalizeAuthOAuthProfile(rawProfile);
      emitAuthOauthFlow({
        actor: requestSession?.actor || backendHost,
        flow,
        process: "auth.oauth.callback",
        providerAccountId: profile.externalId
      });

      const existingLink = currentOauthLinkByProviderAccount(flow.serverRunner, flow.provider, profile.externalId, appContext);
      if (flow.action === "link") {
        if (!requestSession) {
          emitAuthOauthFlow({ actor: backendHost, flow, process: "auth.oauth.link.failed", reason: "sign in first to link an oauth account", providerAccountId: profile.externalId });
          sendJson(res, 401, { error: "sign in first to link an oauth account" });
          return;
        }
        const authenticatedIdentityId = requestSession.authenticatedIdentity ?? null;
        const authenticatedActor = requestSession.authenticatedActor ?? backendHost;
        if (existingLink && existingLink.identity && existingLink.identity !== authenticatedIdentityId) {
          emitAuthOauthLink({
            actor: authenticatedActor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth account already linked to another identity"
          });
          sendJson(res, 409, { error: "oauth account already linked to another identity" });
          return;
        }
        const identity = authenticatedIdentityId ? (currentIdentityIndex().byId[authenticatedIdentityId] ?? null) : null;
        if (!identity) {
          emitAuthOauthLink({
            actor: authenticatedActor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "signed-in identity not found"
          });
          sendJson(res, 409, { error: "signed-in identity not found" });
          return;
        }
        const linkId = emitAuthOauthLink({ actor: authenticatedActor, flow, identity, profile, createdIdentity: false });
        emitAuthOauthSession({ actor: authenticatedActor, flow, identity, session: requestSession, createdIdentity: false });
        sendJson(res, 200, {
          linked: true,
          createdIdentity: false,
          link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId, appContext) ?? {
            id: linkId,
            title: authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity.label }),
            serverRunner: flow.serverRunner,
            provider: flow.provider,
            providerAccountId: profile.externalId,
            identity: identity.id,
            actor: identity.actor,
            label: identity.label,
            status: "linked",
            createdIdentity: false,
            lastError: null
          }),
          session: sessionResponseShape(requestSession)
        });
        return;
      }

      let identity = existingLink?.identity ? currentIdentityIndex().byId[existingLink.identity] ?? null : null;
      let createdIdentity = false;
      if (!identity) {
        if (!resolvedConfig.autoCreate) {
          emitAuthOauthLink({
            actor: backendHost,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth identity is not linked and auto-create is disabled"
          });
          sendJson(res, 409, { error: "oauth identity is not linked and auto-create is disabled" });
          return;
        }
        const identityId = `identity.oauth.${flow.provider}.${sanitizeAuthOauthSegment(profile.externalId)}`;
        const identityIndex = currentIdentityIndex();
        if (identityIndex.byId[identityId] || identityIndex.byUsername[profile.username] || (identityIndex.byActor[profile.actor] ?? []).length) {
          emitAuthOauthLink({
            actor: backendHost,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth-created identity would collide with an existing identity"
          });
          sendJson(res, 409, { error: "oauth-created identity would collide with an existing identity" });
          return;
        }
        createIdentity(world, {
          actor: backendHost,
          id: identityId,
          identityActor: profile.actor,
          label: profile.label,
          username: profile.username,
          password: randomUUID()
        });
        identity = currentIdentityIndex().byId[identityId] ?? null;
        createdIdentity = true;
      }
      if (!identity) {
        emitAuthOauthFlow({ actor: backendHost, flow, process: "auth.oauth.session.failed", reason: "oauth identity resolution failed", providerAccountId: profile.externalId });
        sendJson(res, 500, { error: "oauth identity resolution failed" });
        return;
      }
      const linkId = emitAuthOauthLink({ actor: backendHost, flow, identity, profile, createdIdentity });
      const session = createSessionForIdentity(identity);
      emitAuthOauthSession({ actor: identity.actor, flow, identity, session, createdIdentity });
      sendJson(res, 200, {
        linked: true,
        createdIdentity,
        identity: {
          id: identity.id,
          actor: identity.actor,
          label: identity.label,
          username: identity.username,
          homeContext: identity.homeContext ?? null,
          homePerspective: identity.homePerspective ?? null
        },
        link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId, appContext) ?? {
          id: linkId,
          title: authOAuthLinkTitle({ provider: flow.provider, providerAccountId: profile.externalId, label: identity.label }),
          serverRunner: flow.serverRunner,
          provider: flow.provider,
          providerAccountId: profile.externalId,
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          status: "linked",
          createdIdentity,
          lastError: null
        }),
        session: sessionResponseShape(session)
      }, { "set-cookie": sessionCookieHeader(session.id) });
    },

    "auth.oauth.links.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = ensureTargetAuthority(requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "auth.oauth.links.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const links = oauthLinksForRunner(serverRunnerId, appContext).map(authOAuthReadShape);
      world.observe({ process: "auth.oauth.links.list", actor: requestActor, claims: [relation(requestActor, "read", "auth.oauth.links")], body: { serverRunner: serverRunnerId, count: links.length } });
      sendJson(res, 200, { links });
    },

    "auth.oauth.links.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["auth.oauth"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = ensureTargetAuthority(requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const link = currentOauthLinkForRunner(serverRunnerId, params.id || "", appContext);
      if (!link) {
        world.observe({ process: "auth.oauth.links.read.failed", actor: requestActor, claims: [], body: { reason: "oauth link not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "oauth link not found" });
        return;
      }
      world.observe({ process: "auth.oauth.links.read", actor: requestActor, claims: [relation(requestActor, "read", link.id)], body: { serverRunner: serverRunnerId, id: link.id } });
      sendJson(res, 200, { link: authOAuthReadShape(link) });
    }
  };
}
