import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { relation, thing } from "../../src/kernel.js";
import { requestBootstrapProposalCreate } from "../../src/bootstrap-authoring.js";
export function createPracticalBackendOauthHandlers({
  world,
  backendHost,
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
        profile: normalizeAuthOAuthProfile(body?.profile)
      };
      flow.authorizeUrl = `${flow.callbackUrl}?state=${encodeURIComponent(flow.state)}&code=stub-success`;
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
      if (code === "stub-fail") {
        emitAuthOauthFlow({ actor: requestSession?.actor || backendHost, flow, process: "auth.oauth.callback.failed", reason: "stub oauth code rejected" });
        sendJson(res, 401, { error: "stub oauth code rejected" });
        return;
      }

      const profile = normalizeAuthOAuthProfile(flow.profile);
      emitAuthOauthFlow({
        actor: requestSession?.actor || backendHost,
        flow,
        process: "auth.oauth.callback",
        providerAccountId: profile.externalId
      });

      const existingLink = currentOauthLinkByProviderAccount(flow.serverRunner, flow.provider, profile.externalId);
      if (flow.action === "link") {
        if (!requestSession) {
          emitAuthOauthFlow({ actor: backendHost, flow, process: "auth.oauth.link.failed", reason: "sign in first to link an oauth account", providerAccountId: profile.externalId });
          sendJson(res, 401, { error: "sign in first to link an oauth account" });
          return;
        }
        if (existingLink && existingLink.identity && existingLink.identity !== requestSession.identity) {
          emitAuthOauthLink({
            actor: requestSession.actor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "oauth account already linked to another identity"
          });
          sendJson(res, 409, { error: "oauth account already linked to another identity" });
          return;
        }
        const identity = currentIdentityIndex().byId[requestSession.identity] ?? null;
        if (!identity) {
          emitAuthOauthLink({
            actor: requestSession.actor,
            flow,
            identity: null,
            profile,
            process: "auth.oauth.link.failed",
            reason: "signed-in identity not found"
          });
          sendJson(res, 409, { error: "signed-in identity not found" });
          return;
        }
        const linkId = emitAuthOauthLink({ actor: requestSession.actor, flow, identity, profile, createdIdentity: false });
        emitAuthOauthSession({ actor: requestSession.actor, flow, identity, session: requestSession, createdIdentity: false });
        sendJson(res, 200, {
          linked: true,
          createdIdentity: false,
          link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId) ?? {
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
        link: authOAuthReadShape(currentOauthLinkForRunner(flow.serverRunner, linkId) ?? {
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
      const links = oauthLinksForRunner(serverRunnerId).map(authOAuthReadShape);
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
      const link = currentOauthLinkForRunner(serverRunnerId, params.id || "");
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

export function createPracticalBackendRuntimeConfigHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget
}) {
  return {
    "runtimeConfig.read": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["runtime.config"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "runtimeConfig.read.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "runtimeConfig.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const fields = appContext?.runtimeConfigFields ?? [];
      world.observe({
        process: "runtimeConfig.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:runtimeConfig`)],
        body: {
          serverRunner: serverRunnerId,
          fieldCount: fields.length,
          resolvedCount: fields.filter(field => field.resolved === true).length
        }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        values: Object.fromEntries(
          fields
            .filter(field => field.exposed === true && field.resolved === true && field.secret !== true)
            .map(field => [field.name, field.value])
        ),
        fields
      });
    }
  };
}

export function createPracticalBackendJobsHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget
}) {
  return {
    "jobs.queue.enqueue": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const queued = appContext?.jobs?.enqueue({
        actor: requestActor,
        handler: body.handler,
        payload: body.payload,
        delayMs: body.delayMs,
        idempotencyKey: body.idempotencyKey,
        maxAttempts: body.maxAttempts,
        retryDelayMs: body.retryDelayMs
      });
      if (!queued?.ok) {
        world.emit({
          process: "jobs.queue.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: queued?.reason || "queue unavailable",
            handler: typeof body.handler === "string" ? body.handler : null,
            idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null
          }
        });
        sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
        return;
      }
      sendJson(res, queued.status || 201, { created: queued.created === true, job: queued.job, witness: queued.witness });
    },

    "jobs.queue.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const jobs = appContext?.jobs?.list?.() ?? [];
      world.observe({
        process: "jobs.queue.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:jobs`)],
        body: { serverRunner: serverRunnerId, count: jobs.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, jobs });
    },

    "jobs.queue.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const job = appContext?.jobs?.get?.(params.id || "") ?? null;
      if (!job) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: "job not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "job not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "jobs.queue.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", job.id)],
        body: { serverRunner: serverRunnerId, id: job.id, status: job.status }
      });
      sendJson(res, 200, { job });
    }
  };
}

export function createPracticalBackendHttpOutboundHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  normalizeOutboundRequest,
  outboundTitle,
  executeHttpOutbound,
  responseHeadersToObject,
  looksJsonContentType,
  pickExternalRefId,
  currentOutboundForRunner,
  outboundReadShape,
  isRetryableOutboundStatus,
  delayWithSignal,
  outboundFailureResponseStatus,
  outboundRequestsForRunner
}) {
  return {
    "http.outbound.send": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "http.outbound.request.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const normalized = normalizeOutboundRequest({ body, actor: requestActor, appContext, serverRunnerId });
      if (!normalized.ok) {
        world.emit({ process: "http.outbound.request.failed", actor: requestActor, claims: [], body: { reason: normalized.reason, serverRunner: serverRunnerId } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const requestRow = normalized.outbound;
      const requestWitness = world.emit({
        process: "http.outbound.request",
        actor: requestActor,
        claims: [
          thing(requestRow.id),
          relation(requestRow.id, "hasModuleKind", "outboundRequest"),
          relation(requestActor, "owns", requestRow.id),
          relation(requestRow.id, "hasTitle", outboundTitle(requestRow)),
          ...(requestRow.context ? [relation(requestRow.id, "inContext", requestRow.context)] : [])
        ],
        body: {
          id: requestRow.id,
          serverRunner: serverRunnerId,
          target: requestRow.target,
          url: requestRow.url,
          method: requestRow.method,
          requestHeaderNames: requestRow.requestHeaderNames,
          requestBodyKind: requestRow.requestBodyKind,
          timeoutMs: requestRow.timeoutMs,
          maxAttempts: requestRow.maxAttempts,
          retryDelayMs: requestRow.retryDelayMs,
          context: requestRow.context,
          correlationId: requestRow.correlationId,
          authKind: requestRow.authKind,
          authConfigKey: requestRow.authConfigKey
        }
      });

      for (let attempt = 1; attempt <= requestRow.maxAttempts; attempt += 1) {
        world.emit({
          process: "http.outbound.attempt",
          actor: requestActor,
          claims: [relation(serverRunnerId, "runs", requestRow.id)],
          body: {
            id: requestRow.id,
            serverRunner: serverRunnerId,
            target: requestRow.target,
            url: requestRow.url,
            method: requestRow.method,
            transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
            attempt,
            timeoutMs: requestRow.timeoutMs,
            maxAttempts: requestRow.maxAttempts,
            retryDelayMs: requestRow.retryDelayMs,
            correlationId: requestRow.correlationId
          }
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestRow.timeoutMs);
        let result = null;
        let reason = null;
        try {
          result = await executeHttpOutbound(requestRow, {
            appContext,
            signal: controller.signal,
            attempt
          });
        } catch (error) {
          reason = controller.signal.aborted
            ? "outbound timeout"
            : (error instanceof Error ? error.message : String(error));
        } finally {
          clearTimeout(timeout);
        }

        if (result) {
          const responseHeaders = responseHeadersToObject(result.headers);
          const responseContentType = responseHeaders["content-type"] || null;
          const externalRefId = pickExternalRefId(responseHeaders);
          const responseJson = looksJsonContentType(responseContentType) && result.bodyText
            ? (() => {
                try {
                  return JSON.parse(result.bodyText);
                } catch {
                  return null;
                }
              })()
            : null;
          const responsePayload = {
            transport: result.transport,
            status: result.status,
            contentType: responseContentType,
            externalRefId,
            correlationId: responseHeaders["x-correlation-id"] || requestRow.correlationId,
            json: responseJson,
            text: responseJson == null ? result.bodyText : null
          };
          if (result.status >= 200 && result.status < 300) {
            world.emit({
              process: "http.outbound.succeeded",
              actor: requestActor,
              claims: [relation(requestRow.id, "sentVia", `${result.transport}.http.outbound`)],
              body: {
                id: requestRow.id,
                serverRunner: serverRunnerId,
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                attempt,
                responseStatus: result.status,
                responseContentType,
                externalRefId,
                correlationId: responsePayload.correlationId
              }
            });
            sendJson(res, 200, {
              outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id) ?? {
                id: requestRow.id,
                title: outboundTitle(requestRow),
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                status: "succeeded",
                context: requestRow.context,
                serverRunner: serverRunnerId,
                authKind: requestRow.authKind,
                authConfigKey: requestRow.authConfigKey,
                requestHeaderNames: requestRow.requestHeaderNames,
                requestBodyKind: requestRow.requestBodyKind,
                timeoutMs: requestRow.timeoutMs,
                maxAttempts: requestRow.maxAttempts,
                retryDelayMs: requestRow.retryDelayMs,
                attempt,
                correlationId: responsePayload.correlationId,
                externalRefId,
                responseStatus: result.status,
                responseContentType,
                lastError: null
              }),
              response: responsePayload,
              witness: requestWitness.id
            });
            return;
          }
          reason = `outbound response status ${result.status}`;
          if (attempt < requestRow.maxAttempts && isRetryableOutboundStatus(result.status)) {
            const delayMs = requestRow.retryDelayMs * (2 ** Math.max(0, attempt - 1));
            world.emit({
              process: "http.outbound.retry",
              actor: requestActor,
              claims: [],
              body: {
                id: requestRow.id,
                serverRunner: serverRunnerId,
                target: requestRow.target,
                url: requestRow.url,
                method: requestRow.method,
                transport: result.transport,
                attempt,
                responseStatus: result.status,
                responseContentType,
                externalRefId,
                correlationId: responsePayload.correlationId,
                reason,
                delayMs
              }
            });
            await delayWithSignal(delayMs);
            continue;
          }
          world.emit({
            process: "http.outbound.failed",
            actor: requestActor,
            claims: [],
            body: {
              id: requestRow.id,
              serverRunner: serverRunnerId,
              target: requestRow.target,
              url: requestRow.url,
              method: requestRow.method,
              transport: result.transport,
              attempt,
              responseStatus: result.status,
              responseContentType,
              externalRefId,
              correlationId: responsePayload.correlationId,
              reason
            }
          });
          sendJson(res, outboundFailureResponseStatus(reason, result.status), {
            error: reason,
            outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id)),
            response: responsePayload,
            witness: requestWitness.id
          });
          return;
        }

        if (attempt < requestRow.maxAttempts) {
          const delayMs = requestRow.retryDelayMs * (2 ** Math.max(0, attempt - 1));
          world.emit({
            process: "http.outbound.retry",
            actor: requestActor,
            claims: [],
            body: {
              id: requestRow.id,
              serverRunner: serverRunnerId,
              target: requestRow.target,
              url: requestRow.url,
              method: requestRow.method,
              transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
              attempt,
              correlationId: requestRow.correlationId,
              reason,
              delayMs
            }
          });
          await delayWithSignal(delayMs);
          continue;
        }

        world.emit({
          process: "http.outbound.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: requestRow.id,
            serverRunner: serverRunnerId,
            target: requestRow.target,
            url: requestRow.url,
            method: requestRow.method,
            transport: requestRow.url.startsWith("stub://") ? "stub" : "network",
            attempt,
            correlationId: requestRow.correlationId,
            reason
          }
        });
        sendJson(res, outboundFailureResponseStatus(reason), {
          error: reason,
          outbound: outboundReadShape(currentOutboundForRunner(serverRunnerId, requestRow.id)),
          witness: requestWitness.id
        });
        return;
      }
    },

    "http.outbound.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "http.outbound.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "http.outbound.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "http.outbound.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const outbound = outboundRequestsForRunner(serverRunnerId).map(outboundReadShape);
      world.observe({
        process: "http.outbound.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:http.outbound`)],
        body: { serverRunner: serverRunnerId, count: outbound.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, outbound });
    },

    "http.outbound.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["http.outbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "http.outbound.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const row = currentOutboundForRunner(serverRunnerId, params.id || "");
      if (!row) {
        world.observe({ process: "http.outbound.read.failed", actor: requestActor, claims: [], body: { reason: "outbound request not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "outbound request not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "http.outbound.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", row.id)],
        body: { serverRunner: serverRunnerId, id: row.id, status: row.status }
      });
      sendJson(res, 200, { outbound: outboundReadShape(row) });
    }
  };
}

export function createPracticalBackendNotificationsHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  enqueueNotification,
  notificationsForRunner,
  notificationReadShape,
  currentNotificationForRunner
}) {
  return {
    "notify.email.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "email", req, res, requestActor, appContext });
    },

    "notify.sms.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "sms", req, res, requestActor, appContext });
    },

    "notifications.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const notifications = notificationsForRunner(serverRunnerId).map(notificationReadShape);
      world.observe({
        process: "notifications.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:notifications`)],
        body: { serverRunner: serverRunnerId, count: notifications.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, notifications });
    },

    "notifications.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const notification = currentNotificationForRunner(serverRunnerId, params.id || "");
      if (!notification) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: "notification not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "notification not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "notifications.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", notification.id)],
        body: { serverRunner: serverRunnerId, id: notification.id, status: notification.status }
      });
      sendJson(res, 200, { notification: notificationReadShape(notification) });
    }
  };
}

export function createPracticalBackendWebhookHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  readBody,
  normalizeWebhookDelivery,
  webhookTitle,
  verifyWebhookSignature,
  webhookReadShape,
  currentWebhookForRunner,
  webhookDeliveriesForRunner,
  webhookPayloadPathFor
}) {
  return {
    "webhook.inbound.receive": async ({ req, res, params, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound", "jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "webhook.inbound.receive.failed", actor: backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, target: params.target || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const payloadBytes = await readBody(req);
      const normalized = normalizeWebhookDelivery({
        target: params.target || "",
        req,
        payloadBytes,
        appContext,
        serverRunnerId: appContext?.serverRunnerId || ""
      });
      if (!normalized.ok) {
        world.emit({ process: "webhook.inbound.receive.failed", actor: backendHost, claims: [], body: { reason: normalized.reason, target: params.target || "" } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const delivery = normalized.webhook;
      world.emit({
        process: "webhook.inbound.receive",
        actor: backendHost,
        claims: [
          thing(delivery.id),
          relation(delivery.id, "hasModuleKind", "webhookDelivery"),
          relation(backendHost, "owns", delivery.id),
          relation(delivery.id, "hasTitle", webhookTitle(delivery))
        ],
        body: {
          id: delivery.id,
          serverRunner: delivery.serverRunner,
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId
        }
      });

      if (!verifyWebhookSignature(delivery.signature, delivery.expectedSignature)) {
        world.emit({
          process: "webhook.inbound.verify.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            correlationId: delivery.correlationId,
            reason: "invalid webhook signature"
          }
        });
        sendJson(res, 401, {
          error: "invalid webhook signature",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "invalid",
            replayStatus: null,
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "invalid webhook signature"
          })
        });
        return;
      }

      const now = Date.now();
      if (Math.abs(now - delivery.timestampMs) > delivery.replayWindowMs) {
        world.emit({
          process: "webhook.inbound.replay.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            reason: "delivery timestamp outside replay window"
          }
        });
        sendJson(res, 409, {
          error: "delivery timestamp outside replay window",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "verified",
            replayStatus: "duplicate",
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "delivery timestamp outside replay window"
          })
        });
        return;
      }

      const duplicate = webhookDeliveriesForRunner(delivery.serverRunner).find(row =>
        row.id !== delivery.id
        && row.target === delivery.target
        && row.deliveryId === delivery.deliveryId
        && row.signatureStatus === "verified"
        && row.replayStatus === "accepted"
      );
      if (duplicate) {
        world.emit({
          process: "webhook.inbound.replay.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            receivedAt: delivery.receivedAt,
            correlationId: delivery.correlationId,
            reason: "duplicate delivery"
          }
        });
        sendJson(res, 409, {
          error: "duplicate delivery",
          delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
            id: delivery.id,
            title: webhookTitle(delivery),
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            contentType: delivery.contentType,
            sizeBytes: delivery.sizeBytes,
            storageKey: null,
            status: "rejected",
            signatureStatus: "verified",
            replayStatus: "duplicate",
            receivedAt: delivery.receivedAt,
            timestamp: delivery.timestamp,
            correlationId: delivery.correlationId,
            context: null,
            serverRunner: delivery.serverRunner,
            jobId: null,
            attempt: 0,
            maxAttempts: delivery.maxAttempts,
            retryDelayMs: delivery.retryDelayMs,
            lastError: "duplicate delivery"
          })
        });
        return;
      }

      const storageKey = `${delivery.id}/payload`;
      const payloadPath = webhookPayloadPathFor(appContext, delivery.id);
      try {
        await fs.mkdir(path.dirname(payloadPath), { recursive: true });
        await fs.writeFile(payloadPath, payloadBytes);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "webhook payload storage failed";
        world.emit({
          process: "webhook.inbound.accept.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            correlationId: delivery.correlationId,
            reason
          }
        });
        sendJson(res, 500, { error: reason });
        return;
      }

      const queued = appContext?.jobs?.enqueue({
        actor: backendHost,
        handler: "webhook.inbound.process",
        payload: { webhookId: delivery.id },
        maxAttempts: delivery.maxAttempts,
        retryDelayMs: delivery.retryDelayMs,
        idempotencyKey: `${delivery.target}:${delivery.deliveryId}`
      });
      if (!queued?.ok) {
        await fs.rm(payloadPath, { force: true }).catch(() => {});
        world.emit({
          process: "webhook.inbound.accept.failed",
          actor: backendHost,
          claims: [],
          body: {
            id: delivery.id,
            serverRunner: delivery.serverRunner,
            target: delivery.target,
            deliveryId: delivery.deliveryId,
            correlationId: delivery.correlationId,
            reason: queued?.reason || "queue unavailable"
          }
        });
        sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
        return;
      }

      world.emit({
        process: "webhook.inbound.accepted",
        actor: backendHost,
        claims: [relation(delivery.id, "sentVia", "webhook.inbound")],
        body: {
          id: delivery.id,
          serverRunner: delivery.serverRunner,
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          storageKey,
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId,
          jobId: queued.job?.id ?? null
        }
      });
      sendJson(res, 202, {
        delivery: webhookReadShape(currentWebhookForRunner(delivery.serverRunner, delivery.id) ?? {
          id: delivery.id,
          title: webhookTitle(delivery),
          target: delivery.target,
          deliveryId: delivery.deliveryId,
          contentType: delivery.contentType,
          sizeBytes: delivery.sizeBytes,
          storageKey,
          status: "accepted",
          signatureStatus: "verified",
          replayStatus: "accepted",
          receivedAt: delivery.receivedAt,
          timestamp: delivery.timestamp,
          correlationId: delivery.correlationId,
          context: null,
          serverRunner: delivery.serverRunner,
          jobId: queued.job?.id ?? null,
          attempt: 0,
          maxAttempts: delivery.maxAttempts,
          retryDelayMs: delivery.retryDelayMs,
          lastError: null
        }),
        job: queued.job
      });
    },

    "webhook.inbound.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "webhook.inbound.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "webhook.inbound.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "webhook.inbound.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const deliveries = webhookDeliveriesForRunner(serverRunnerId).map(webhookReadShape);
      world.observe({
        process: "webhook.inbound.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:webhooks`)],
        body: { serverRunner: serverRunnerId, count: deliveries.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, deliveries });
    },

    "webhook.inbound.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["webhook.inbound"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "webhook.inbound.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const delivery = currentWebhookForRunner(serverRunnerId, params.id || "");
      if (!delivery) {
        world.observe({ process: "webhook.inbound.read.failed", actor: requestActor, claims: [], body: { reason: "webhook delivery not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "webhook delivery not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "webhook.inbound.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", delivery.id)],
        body: { serverRunner: serverRunnerId, id: delivery.id, status: delivery.status }
      });
      sendJson(res, 200, { delivery: webhookReadShape(delivery) });
    }
  };
}

export function createPracticalBackendDbSqlHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  emitDbSqlDatasourceResolve,
  currentSqlDatasourceForRunner,
  sqlOperationsForRunner,
  dbSqlDatasourceReadShape,
  dbSqlOperationReadShape,
  dbSqlDatasourceId,
  dbSqlDatasourceTitle,
  dbSqlOperationId,
  dbSqlOperationTitle,
  emitDbSqlOperation,
  currentSqlOperationForRunner
}) {
  return {
    "db.sql.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "db.sql.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({
        actor: requestActor,
        datasource: inspection.datasource,
        ok: inspection.ok,
        reason: inspection.ok ? null : inspection.reason
      });
      if (!inspection.ok && !inspection.datasource) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: inspection.reason || "db.sql runtime unavailable", serverRunner: serverRunnerId } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const projectedDatasource = inspection.datasource
        ? (currentSqlDatasourceForRunner(serverRunnerId, inspection.datasource.id) ?? inspection.datasource)
        : null;
      const operations = sqlOperationsForRunner(serverRunnerId).map(dbSqlOperationReadShape);
      world.observe({
        process: "db.sql.inspect",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:db.sql`)],
        body: { serverRunner: serverRunnerId, operationCount: operations.length, datasourceId: projectedDatasource?.id ?? null }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        datasource: projectedDatasource ? dbSqlDatasourceReadShape({
          ...projectedDatasource,
          operationCount: operations.length
        }) : null,
        operations,
        warning: inspection.ok ? null : inspection.reason
      });
    },

    "db.sql.migrate": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.migrate.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      if (!inspection.ok) {
        const datasource = inspection.datasource ?? {
          id: dbSqlDatasourceId(serverRunnerId),
          title: dbSqlDatasourceTitle({}),
          serverRunner: serverRunnerId,
          provider: "sqlite",
          datasourceName: "main"
        };
        const failedId = dbSqlOperationId();
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId: failedId,
          title: dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null }),
          datasource,
          ok: false,
          body: { reason: inspection.reason || "db.sql runtime unavailable" }
        });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: inspection.datasource.datasourceName });
      const result = await appContext.dbSql.migrate({ migrations: body?.migrations });
      if (!result.ok) {
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId,
          title,
          datasource: result.datasource || inspection.datasource,
          ok: false,
          body: { reason: result.reason || "migration failed" }
        });
        sendJson(res, result.status || 500, { error: result.reason || "migration failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "migrate",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "migrate",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length,
          stepCount: 0,
          lastError: null
        }),
        applied: result.applied,
        skipped: result.skipped
      });
    },

    "db.sql.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "query", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.query({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "query failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "query failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "query",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { rowCount: result.rowCount }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "query",
          status: "succeeded",
          rowCount: result.rowCount,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        rows: result.rows
      });
    },

    "db.sql.command": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.command.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "command", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.command({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "command failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "command failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "command",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "command",
          status: "succeeded",
          rowCount: 0,
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      });
    },

    "db.sql.transaction": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.transaction.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "transaction", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.transaction({ steps: body?.steps });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "transaction failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "transaction failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "transaction",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { stepCount: result.results.length }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "transaction",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: result.results.length,
          lastError: null
        }),
        results: result.results
      });
    }
  };
}

export function createPracticalBackendSearchIndexHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  emitSearchIndexEvent,
  currentSearchIndexForRunner,
  searchIndexReadShape
}) {
  const fallbackIndex = serverRunnerId => ({
    id: `searchIndex:${serverRunnerId}:main`,
    title: `${serverRunnerId} Search Index`,
    serverRunner: serverRunnerId,
    provider: "local-text",
    name: "main"
  });

  return {
    "search.index.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = await appContext?.searchIndex?.inspect?.();
      if (!inspection?.ok) {
        emitSearchIndexEvent({
          actor: requestActor,
          process: "search.index.inspect.failed",
          index: inspection?.index || fallbackIndex(serverRunnerId),
          body: { reason: inspection?.reason || "search index unavailable" }
        });
        sendJson(res, inspection?.status || 503, { error: inspection?.reason || "search index unavailable" });
        return;
      }
      const index = inspection.index
        ? searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, inspection.index.id) ?? inspection.index)
        : null;
      world.observe({
        process: "search.index.inspect",
        actor: requestActor,
        claims: [relation(requestActor, "read", "search.index")],
        body: { serverRunner: serverRunnerId, built: Boolean(index), documentCount: index?.documentCount ?? 0 }
      });
      sendJson(res, 200, { index });
    },

    "search.index.build": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.build.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const built = await appContext?.searchIndex?.build?.({ documents: body?.documents, assetIds: body?.assetIds });
      const index = built?.index || fallbackIndex(serverRunnerId);
      if (!built?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.build.failed", index, body: { reason: built?.reason || "search index build failed" } });
        sendJson(res, built?.status || 500, { error: built?.reason || "search index build failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.build",
        index: built.index,
        body: {
          sourceCount: built.index.sourceCount,
          documentCount: built.index.documentCount,
          assetCount: built.index.assetCount,
          queryCount: built.index.queryCount,
          lastBuiltAt: built.index.lastBuiltAt,
          path: built.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, built.index.id) ?? built.index) });
    },

    "search.index.reindex": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.reindex.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindex?.();
      const index = rebuilt?.index || fallbackIndex(serverRunnerId);
      if (!rebuilt?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.reindex.failed", index, body: { reason: rebuilt?.reason || "search index reindex failed" } });
        sendJson(res, rebuilt?.status || 500, { error: rebuilt?.reason || "search index reindex failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id) ?? rebuilt.index) });
    },

    "search.index.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = await appContext?.searchIndex?.query?.({ q: body?.q, limit: body?.limit });
      const index = result?.index || fallbackIndex(serverRunnerId);
      if (!result?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.query.failed", index, body: { reason: result?.reason || "search query failed" } });
        sendJson(res, result?.status || 500, { error: result?.reason || "search query failed" });
        return;
      }
      const hits = result.hits.map(hit => ({
        ...hit,
        ...(hit.assetId ? {
          contentUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/content`,
          textUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/text`
        } : {})
      }));
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.query",
        index: result.index,
        body: {
          q: result.q,
          limit: result.limit,
          hitCount: hits.length,
          queryCount: result.index.queryCount,
          lastQueryAt: result.index.lastQueryAt
        }
      });
      sendJson(res, 200, {
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, result.index.id) ?? result.index),
        hits
      });
    }
  };
}

export function createPracticalBackendBackendSeamsHandlers({
  world,
  backendHost,
  frontendHost,
  send,
  sendJson,
  assetDiagnostics,
  renderBackendSeamsPage,
  runtimeBundleSummaryForProfile,
  getRuntimeBundleHandlerDiagnostics,
  defaultRuntimeProfile
}) {
  return {
    "page.backendSeams": async ({ res, requestActor, appContext }) => {
      if (!requestActor) {
        world.observe({ process: "frontend.renderBackendSeamsPage.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const diagnostics = await assetDiagnostics(appContext);
      world.observe({
        process: "frontend.renderBackendSeamsPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", "backendSeams")],
        body: { assets: diagnostics.assets.total, assetsRoot: diagnostics.storage.assetsRoot }
      });
      send(res, 200, "text/html; charset=utf-8", renderBackendSeamsPage(diagnostics));
    },

    "backendSeams.read": async ({ res, requestActor, appContext }) => {
      if (!requestActor) {
        world.observe({ process: "backend.readBackendSeams.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const diagnostics = await assetDiagnostics(appContext);
      world.observe({
        process: "backend.readBackendSeams",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "backendSeams")],
        body: {
          runtimeProfile: appContext.runtimeProfile,
          runtimeConfigFields: diagnostics.runtimeConfig.fieldCount,
          runtimeConfigMissing: diagnostics.runtimeConfig.missingCount,
          dbSqlDatasources: diagnostics.dbSql.datasourceCount,
          dbSqlOperations: diagnostics.dbSql.operationCount,
          dbSqlFailures: diagnostics.failures.dbSqlFailed.length,
          searchIndexes: diagnostics.search.indexCount,
          searchQueries: diagnostics.search.queryCount,
          searchFailures: diagnostics.failures.searchIndexFailed.length,
          oauthFlows: diagnostics.oauth.flowCount,
          oauthLinks: diagnostics.oauth.linkCount,
          oauthFailures: diagnostics.failures.authOauthFailed.length,
          assets: diagnostics.assets.total,
          assetsRoot: diagnostics.storage.assetsRoot,
          blobsRoot: diagnostics.storage.blobsRoot,
          assetIngestRetryable: diagnostics.assets.ingestRetryableCount,
          assetSearchRefreshable: diagnostics.assets.searchRefreshableCount,
          assetUploadFailures: diagnostics.failures.assetUploadFailed.length,
          assetContentReadFailures: diagnostics.failures.assetContentReadFailed.length,
          fsBlobFailures: diagnostics.failures.fsBlobFailed.length,
          fsStreamFailures: diagnostics.failures.fsStreamFailed.length
        }
      });
      sendJson(res, 200, {
        ...diagnostics,
        runtime: {
          profile: appContext.runtimeProfile || defaultRuntimeProfile,
          ...(appContext.runtimeBundleSummary ?? runtimeBundleSummaryForProfile(appContext.runtimeProfile || defaultRuntimeProfile)),
          handlerImplementations: getRuntimeBundleHandlerDiagnostics()
        }
      });
    }
  };
}

export function createPracticalBackendFsBlobHandlers({
  world,
  backendHost,
  send,
  sendJson,
  readBody,
  headerValue,
  requireBackendCapabilities,
  resolveBlobScope,
  listBlobFolder,
  loadBlobRecord,
  blobStorageDirectoryFor,
  composeBlobFileRecord,
  normalizeBlobPath
}) {
  return {
    "fs.blob.list": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const folderPath = requestUrl.searchParams.get("path") || "";
      const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath });
      if (!listed.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor, claims: [], body: { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: folderPath } });
        sendJson(res, listed.status || 404, { error: listed.reason });
        return;
      }
      world.observe({
        process: "fs.blob.list",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: listed.folder.path, count: listed.items.length }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, folder: listed.folder, items: listed.items });
    },

    "fs.blob.meta": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      if (!blobPath) {
        const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath: "" });
        world.observe({
          process: listed.ok ? "fs.blob.meta" : "fs.blob.meta.failed",
          actor: requestActor,
          claims: [],
          body: listed.ok
            ? { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "", kind: "folder", childCount: listed.folder.childCount }
            : { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" }
        });
        if (!listed.ok) {
          sendJson(res, listed.status || 404, { error: listed.reason });
          return;
        }
        sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: listed.folder });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      world.observe({
        process: "fs.blob.meta",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: record.record.path, kind: record.record.kind }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.record });
    },

    "fs.blob.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.blob.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      const bytes = await fs.readFile(record.contentPath);
      world.observe({
        process: "fs.blob.read",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: record.record.path,
          sizeBytes: record.record.sizeBytes,
          blobRef: record.record.blobRef
        }
      });
      send(res, 200, record.record.mimeType || "application/octet-stream", bytes, {
        "cache-control": "no-store",
        "content-length": String(bytes.length)
      });
    },

    "fs.blob.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const bytes = await readBody(req);
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const contentPath = path.join(resolvedDir.directory, "blob");
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      const updatedAt = new Date().toISOString();
      try {
        await fs.mkdir(resolvedDir.directory, { recursive: true });
        await fs.writeFile(contentPath, bytes);
        await fs.writeFile(metaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          updatedAt
        }, null, 2));
      } catch (error) {
        world.emit({
          process: "fs.blob.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage write failed" });
        return;
      }
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.blob.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.blob.delete": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const normalized = normalizeBlobPath(blobPath);
      if (!normalized.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: normalized.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: normalized.path });
      if (!record.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      if (record.record.kind === "folder" && record.record.path === "") {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "cannot delete blob scope root", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" } });
        sendJson(res, 409, { error: "cannot delete blob scope root" });
        return;
      }
      const recursive = requestUrl.searchParams.get("recursive") === "true";
      if (record.record.kind === "folder" && !recursive && record.record.childCount > 0) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "blob folder delete requires recursive=true", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, 409, { error: "blob folder delete requires recursive=true" });
        return;
      }
      const targetPath = record.directory || blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, normalized.path).directory;
      try {
        await fs.rm(targetPath, { recursive: true, force: false });
      } catch (error) {
        world.emit({
          process: "fs.blob.delete.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage delete failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: normalized.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage delete failed" });
        return;
      }
      world.emit({
        process: "fs.blob.delete",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: normalized.path,
          kind: record.record.kind
        }
      });
      sendJson(res, 200, { ok: true, deleted: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path, kind: record.record.kind } });
    }
  };
}

export function createPracticalBackendFsStreamHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  requireBackendCapabilities,
  resolveBlobScope,
  loadBlobRecord,
  blobStorageDirectoryFor,
  composeBlobFileRecord,
  headerValue,
  parseStreamFailureLimit,
  streamReadableToFile,
  streamFileToFile
}) {
  return {
    "fs.stream.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.stream.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      world.observe({
        process: "fs.stream.read",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: record.record.path,
          sizeBytes: record.record.sizeBytes,
          blobRef: record.record.blobRef
        }
      });
      res.writeHead(200, {
        "content-type": record.record.mimeType || "application/octet-stream",
        "content-length": String(record.record.sizeBytes),
        "cache-control": "no-store"
      });
      const stream = createReadStream(record.contentPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "stream read failed" });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "fs.stream.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const contentPath = path.join(resolvedDir.directory, "blob");
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      let streamed = null;
      try {
        streamed = await streamReadableToFile(req, contentPath, { failAfterBytes });
      } catch (error) {
        if (!existed) {
          await fs.rm(resolvedDir.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream write failed" });
        return;
      }
      const updatedAt = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify({
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        path: resolvedDir.path,
        mimeType,
        sizeBytes: streamed.sizeBytes,
        updatedAt
      }, null, 2));
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.stream.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          sizeBytes: streamed.sizeBytes,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.stream.copy": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const body = await readJson(req);
      const fromPath = typeof body.fromPath === "string" ? body.fromPath : "";
      const toPath = typeof body.toPath === "string" ? body.toPath : "";
      const source = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: fromPath });
      if (!source.ok || source.record.kind !== "file") {
        const reason = source.ok ? "source path is a folder" : source.reason;
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, source.ok ? 409 : (source.status || 404), { error: reason });
        return;
      }
      const target = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, toPath);
      if (!target.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: target.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, target.status || 400, { error: target.reason });
        return;
      }
      if (source.record.path === target.path) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: "source and target path must differ", scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, 409, { error: "source and target path must differ" });
        return;
      }
      const targetContentPath = path.join(target.directory, "blob");
      const targetMetaPath = path.join(target.directory, "meta.json");
      let targetExisted = true;
      try {
        await fs.stat(targetContentPath);
      } catch {
        targetExisted = false;
      }
      try {
        const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
        const copied = await streamFileToFile(source.contentPath, targetContentPath, { failAfterBytes });
        const updatedAt = new Date().toISOString();
        await fs.writeFile(targetMetaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: target.path,
          mimeType: source.record.mimeType,
          sizeBytes: copied.sizeBytes,
          updatedAt
        }, null, 2));
        const record = await composeBlobFileRecord({
          appContext,
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          blobPath: target.path,
          metadata: { mimeType: source.record.mimeType, updatedAt }
        });
        world.emit({
          process: "fs.stream.copy",
          actor: requestActor,
          claims: [],
          body: {
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath: source.record.path,
            toPath: target.path,
            sizeBytes: copied.sizeBytes,
            chunkCount: copied.chunkCount,
            maxChunkBytes: copied.maxChunkBytes,
            drainCount: copied.drainCount,
            writeHighWaterMarkBytes: copied.writeHighWaterMarkBytes
          }
        });
        sendJson(res, 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
      } catch (error) {
        if (!targetExisted) {
          await fs.rm(target.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.copy.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream copy failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath,
            toPath
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream copy failed" });
      }
    }
  };
}

export function createPracticalBackendAssetSurfaceHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  currentAssetById,
  ensureReadableAssetAccess,
  assetPathFor,
  assetTextPathFor,
  assetTextUrl,
  assetThumbnailPathFor,
  authorityServices,
  sendGateFailure,
  requireBackendCapabilities,
  attachmentTargetsForAsset,
  currentThingExists,
  currentThingKind,
  assetAttachedToTarget,
  runAssetAttach,
  runAssetDetach
}) {
  const { ensureTargetAuthority } = authorityServices;
  const assetAttachmentProposalId = (process, assetId, targetId) => {
    const processPart = String(process || "asset.attachment").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const assetPart = String(assetId || "asset").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const targetPart = String(targetId || "target").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.${processPart}.${assetPart}.${targetPart}`;
  };
  const assetAttachmentProposalConfig = ({ process, assetId, targetId }) => {
    if (!assetId || !targetId) return null;
    if (process === "asset.attach") {
      return {
        targetProcess: process,
        targetKind: "thing",
        targetId: assetId,
        reason: "Attach a shared asset through witnessed proposal",
        statusMessage: "Proposed asset attachment for review."
      };
    }
    if (process === "asset.detach") {
      return {
        targetProcess: process,
        targetKind: "thing",
        targetId: assetId,
        reason: "Remove a shared asset attachment through witnessed proposal",
        statusMessage: "Proposed asset detachment for review."
      };
    }
    return null;
  };
  const createAssetAttachmentProposal = ({ actor, process, assetId, targetId, perspective = null }) => {
    const config = assetAttachmentProposalConfig({ process, assetId, targetId });
    if (!config) return null;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: assetAttachmentProposalId(config.targetProcess, assetId, targetId),
        targetProcess: config.targetProcess,
        targetKind: config.targetKind,
        targetId: config.targetId,
        bodyJson: JSON.stringify({ asset: assetId, target: targetId, perspective }),
        reason: config.reason
      }
    });
  };
  return {
    "asset.content.read": async ({ res, params, requestActor, requestUrl, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const wantsDownload = requestUrl?.searchParams?.get("download") === "1";
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.content.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      const assetPath = assetPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(assetPath);
      } catch {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "asset content missing", storageKey: asset.storageKey } });
        sendJson(res, 404, { error: "asset content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.content.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          mimeType: asset.mimeType,
          sizeBytes: stat.size,
          storageKey: asset.storageKey,
          visibility: asset.visibility,
          context: asset.context,
          contentUrl: asset.contentUrl,
          disposition: wantsDownload ? "attachment" : "inline"
        }
      });
      const fileName = String(asset.title || asset.originalName || asset.id).replace(/["\r\n]/g, "_");
      res.writeHead(200, {
        "content-type": asset.mimeType || "application/octet-stream",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${fileName}"`
      });
      const stream = createReadStream(assetPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "asset stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.text.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.text.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.textRef !== "string" || !asset.textRef) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text not available" } });
        sendJson(res, 404, { error: "derived text not available", id: asset.id });
        return;
      }
      const textPath = assetTextPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(textPath);
      } catch {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text missing", textRef: asset.textRef } });
        sendJson(res, 404, { error: "derived text missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.text.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          textRef: asset.textRef,
          textUrl: assetTextUrl(asset.id),
          textStatus: asset.textStatus ?? null,
          textExtractor: asset.textExtractor ?? null,
          textBytes: asset.textBytes ?? stat.size,
          visibility: asset.visibility
        }
      });
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.derived.txt"`
      });
      const stream = createReadStream(textPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "derived text stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.thumbnail.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.thumbnailRef !== "string" || !asset.thumbnailRef || typeof asset.thumbnailUrl !== "string" || !asset.thumbnailUrl) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail not available" } });
        sendJson(res, 404, { error: "thumbnail not available", id: asset.id });
        return;
      }
      const thumbnailPath = assetThumbnailPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(thumbnailPath);
      } catch {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail content missing", thumbnailRef: asset.thumbnailRef } });
        sendJson(res, 404, { error: "thumbnail content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.thumbnail.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          thumbnailRef: asset.thumbnailRef,
          thumbnailUrl: asset.thumbnailUrl,
          visibility: asset.visibility,
          sizeBytes: stat.size,
          imageWidth: asset.imageWidth ?? null,
          imageHeight: asset.imageHeight ?? null
        }
      });
      res.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.thumbnail.svg"`
      });
      const stream = createReadStream(thumbnailPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "thumbnail stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.attachments.list": async ({ res, params, requestActor }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "asset.attachments.read.failed", actor: backendHost, claims: [], body: { id: asset.id, reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason } });
        sendGateFailure(res, gate);
        return;
      }
      const attachments = attachmentTargetsForAsset(asset.id);
      world.observe({
        process: "asset.attachments.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", asset.id)],
        body: { id: asset.id, count: attachments.length }
      });
      sendJson(res, 200, { asset, attachments });
    },

    "asset.attach": async ({ req, res, params, requestActor }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.attach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.attach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = await readJson(req);
      const target = typeof body?.target === "string" && body.target.trim() ? body.target.trim() : "";
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      if (!currentThingExists(target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target not found" } });
        sendJson(res, 404, { error: "target not found", target });
        return;
      }
      const targetKind = currentThingKind(target);
      if (targetKind === "asset" || targetKind === "projectionInstance" || targetKind === "perspective") {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target cannot hold asset attachments" } });
        sendJson(res, 409, { error: "target cannot hold asset attachments", target });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        if (assetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.attach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.attach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        if (targetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.attach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.attach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset already attached to target" } });
        sendJson(res, 409, { error: "asset already attached to target", asset: asset.id, target });
        return;
      }
      const witness = runAssetAttach({ actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 201, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    },

    "asset.detach": async ({ req, res, params, requestActor, requestUrl }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.detach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.detach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = req.method === "DELETE" ? null : await readJson(req).catch(() => null);
      const target = typeof body?.target === "string" && body.target.trim()
        ? body.target.trim()
        : String(requestUrl.searchParams.get("target") || "").trim();
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        if (assetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.detach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.detach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        if (targetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.detach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.detach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (!assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset attachment not current" } });
        sendJson(res, 404, { error: "asset attachment not current", asset: asset.id, target });
        return;
      }
      const witness = runAssetDetach({ actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    }
  };
}

export function createPracticalBackendAssetWorkflowHandlers({
  world,
  backendHost,
  sendJson,
  requireBackendCapabilities,
  headerValue,
  parseMultipartAssetUpload,
  parseRawAssetUpload,
  normalizeAssetVisibility,
  resolveAssetDropContext,
  assetStorageKey,
  assetContentUrl,
  assetDownloadUrl,
  assetPathFor,
  streamReadableToFile,
  randomUUID,
  currentAssetById,
  authorityServices,
  sendGateFailure,
  canMutateTarget,
  emitSearchIndexEvent,
  currentSearchIndexForRunner,
  searchIndexReadShape
}) {
  const { ensureTargetAuthority } = authorityServices;
  return {
    "asset.upload": async ({ req, res, requestUrl, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        world.emit({ process: "asset.upload.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const capabilityGate = requireBackendCapabilities(["upload.asset", "fs.blob", "fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: capabilityGate.reason, missing: capabilityGate.missing }
        });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const contentType = headerValue(req.headers["content-type"]).toLowerCase();
      const parsedUpload = contentType.startsWith("multipart/form-data")
        ? await parseMultipartAssetUpload(req)
        : parseRawAssetUpload(req, requestUrl);
      if (!parsedUpload.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: parsedUpload.reason } });
        sendJson(res, parsedUpload.status || 400, { error: parsedUpload.reason });
        return;
      }
      const perspectiveId = parsedUpload.perspectiveId || requestUrl.searchParams.get("perspective") || "";
      if (!perspectiveId) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing perspective id" } });
        sendJson(res, 400, { error: "missing perspective id" });
        return;
      }
      const originalName = parsedUpload.originalName;
      const mimeType = parsedUpload.mimeType;
      const explicitContextId = parsedUpload.explicitContextId || null;
      const visibilityInput = normalizeAssetVisibility(parsedUpload.visibilityRaw, appContext?.runtimeConfig ?? {});
      if (!originalName) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing filename header", perspective: perspectiveId } });
        sendJson(res, 400, { error: parsedUpload.uploadKind === "multipart" ? "multipart upload requires a filename" : "missing x-witness-file-name header" });
        return;
      }
      if (!mimeType) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing content type", perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: "missing content-type header" });
        return;
      }
      if (!visibilityInput.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: visibilityInput.reason, perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: visibilityInput.reason });
        return;
      }
      const resolvedContext = resolveAssetDropContext({
        actor: requestActor,
        perspectiveId,
        requestSession,
        explicitContextId
      });
      if (!resolvedContext.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: resolvedContext.reason,
            perspective: perspectiveId,
            originalName,
            homeContext: requestSession?.homeContext ?? null
          }
        });
        sendJson(res, resolvedContext.status || 400, { error: resolvedContext.reason });
        return;
      }
      const assetId = `asset_${randomUUID()}`;
      const storageKey = assetStorageKey(assetId);
      const contentUrl = assetContentUrl(assetId);
      const visibility = visibilityInput.value;
      const assetPath = assetPathFor(appContext, assetId);
      let streamed = null;

      try {
        streamed = await streamReadableToFile(parsedUpload.source, assetPath);
      } catch (error) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "asset storage write failed",
            perspective: perspectiveId,
            originalName,
            storageKey,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "asset storage write failed" });
        return;
      }
      if (!streamed.sizeBytes) {
        await fs.rm(assetPath, { force: true }).catch(() => {});
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: "empty upload body", perspective: perspectiveId, originalName, context: resolvedContext.contextId }
        });
        sendJson(res, 400, { error: "empty upload body" });
        return;
      }
      const sizeBytes = streamed.sizeBytes;

      const witness = world.emit({
        process: "asset.upload",
        actor: requestActor,
        claims: [
          thing(assetId),
          relation(requestActor, "owns", assetId),
          relation(assetId, "hasModuleKind", "asset"),
          relation(assetId, "hasTitle", originalName),
          relation(assetId, "inContext", resolvedContext.contextId)
        ],
        body: {
          id: assetId,
          originalName,
          mimeType,
          sizeBytes,
          declaredSizeBytes: parsedUpload.declaredSizeBytes,
          uploadKind: parsedUpload.uploadKind,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey,
          contentUrl,
          visibility,
          context: resolvedContext.contextId
        }
      });
      let processing = null;
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId },
        idempotencyKey: `asset.ingest:${assetId}`
      });
      if (queued?.ok && queued.job) {
        world.emit({
          process: "asset.ingest.enqueue",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            jobId: queued.job.id,
            handler: queued.job.handler,
            availableAt: queued.job.availableAt,
            idempotencyKey: queued.job.idempotencyKey
          }
        });
        processing = {
          status: queued.job.status || "queued",
          jobId: queued.job.id,
          attempt: queued.job.attempt ?? 0
        };
      } else {
        world.emit({
          process: "asset.ingest.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            reason: queued?.reason || "asset ingestion queue unavailable"
          }
        });
        processing = {
          status: "enqueue-failed",
          jobId: null,
          attempt: 0,
          error: queued?.reason || "asset ingestion queue unavailable"
        };
      }
      sendJson(res, 201, {
        asset: {
          id: assetId,
          title: originalName,
          mimeType,
          sizeBytes,
          storageKey,
          visibility,
          context: resolvedContext.contextId,
          contentUrl,
          downloadUrl: assetDownloadUrl(contentUrl)
        },
        processing,
        witness: witness.id
      });
    },

    "asset.ingest.retry": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset", "jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.ingest.retry.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden" } });
        sendGateFailure(res, gate);
        return;
      }
      if (asset.processingStatus === "queued" || asset.processingStatus === "running") {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: "asset ingestion already active", jobId: asset.processingJobId ?? null } });
        sendJson(res, 409, { error: "asset ingestion already active", id: asset.id, jobId: asset.processingJobId ?? null });
        return;
      }
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId: asset.id }
      });
      if (!queued?.ok || !queued.job) {
        const reason = queued?.reason || "asset ingestion queue unavailable";
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason } });
        sendJson(res, queued?.status || 503, { error: reason, id: asset.id });
        return;
      }
      const witness = world.emit({
        process: "asset.ingest.retry",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: appContext?.serverRunnerId || null,
          previousJobId: asset.processingJobId ?? null,
          previousStatus: asset.processingStatus ?? null,
          jobId: queued.job.id,
          handler: queued.job.handler,
          availableAt: queued.job.availableAt,
          attempt: queued.job.attempt ?? 0
        }
      });
      sendJson(res, queued.created === false ? 200 : 201, {
        asset: currentAssetById(asset.id) ?? asset,
        job: queued.job,
        witness: witness.id
      });
    },

    "asset.search.reindex": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.search.reindex.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "");
      if (!asset) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden", serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindexAsset?.(asset.id);
      if (!rebuilt?.ok || !rebuilt.index) {
        const reason = rebuilt?.reason || "asset search reindex failed";
        world.emit({
          process: "asset.search.reindex.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: asset.id,
            serverRunner: serverRunnerId,
            reason,
            searchPolicy: rebuilt?.repair?.policy || asset.searchPolicy || null,
            disposition: rebuilt?.repair?.disposition || null
          }
        });
        sendJson(res, rebuilt?.status || 500, { error: reason, id: asset.id, repair: rebuilt?.repair ?? null });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      const witness = world.emit({
        process: "asset.search.reindex",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: serverRunnerId,
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          completedAt: new Date(Date.now()).toISOString()
        }
      });
      sendJson(res, 200, {
        asset: {
          ...(currentAssetById(asset.id) ?? asset),
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          searchError: null
        },
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id) ?? rebuilt.index),
        repair: rebuilt.repair ?? null,
        witness: witness.id
      });
    }
  };
}

