import { moduleProjectors } from "../../src/modules.js";
import { normalizeAuthorityTuple } from "../../src/runtime-authz.js";

export function createMcpBundleSupportServices({
  world,
  backendHost,
  mcpInternalToken = null,
  runtimeConfigLookup,
  resolveMcpToolScope,
  hostCapabilities,
  headerValue
}) {
  const projectFor = appContext => appContext?.project ?? (projector => world.project(projector));
  const currentMcpServerIndex = (appContext = null) => projectFor(appContext)(moduleProjectors.mcpServerIndex);
  const currentMcpToolInstalls = (appContext = null) => projectFor(appContext)(moduleProjectors.mcpToolInstalls);
  const currentBackendCapabilities = () => hostCapabilities(world, backendHost);
  const scopeContextForTarget = (targetId, appContext = null) => {
    if (!targetId) return null;
    const project = projectFor(appContext);
    const moduleKind = project(moduleProjectors.modules).get(targetId) ?? null;
    if (moduleKind === "context") return targetId;
    return project(moduleProjectors.objectContexts).get(targetId) ?? null;
  };
  const isLoopbackOriginHost = host => {
    const normalized = String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
  };
  const validateMcpOrigin = req => {
    const origin = headerValue(req?.headers?.origin).trim();
    if (!origin) return { ok: true };
    try {
      const parsed = new URL(origin);
      const requestHost = headerValue(req?.headers?.host).trim().toLowerCase();
      if (parsed.host.toLowerCase() === requestHost) return { ok: true };
      if (isLoopbackOriginHost(parsed.hostname)) return { ok: true };
      return { ok: false, reason: "origin not allowed for local mcp endpoint" };
    } catch {
      return { ok: false, reason: "origin not allowed for local mcp endpoint" };
    }
  };
  const mcpToolAvailable = toolName => {
    const capabilities = currentBackendCapabilities();
    switch (toolName) {
      case "storage.blob":
        return capabilities.has("fs.blob");
      case "storage.stream":
        return capabilities.has("fs.stream");
      case "asset.manage":
        return capabilities.has("upload.asset");
      case "db.sql":
        return capabilities.has("db.sql");
      case "search.index":
        return capabilities.has("search.index");
      case "jobs.queue":
        return capabilities.has("jobs.queue");
      case "http.outbound":
        return capabilities.has("http.outbound");
      case "webhook.inbound":
        return capabilities.has("webhook.inbound");
      case "notifications":
        return capabilities.has("jobs.queue") && (capabilities.has("notify.email") || capabilities.has("notify.sms"));
      case "platform.read":
      case "platform.proposal":
      case "platform.changeSet":
        return capabilities.has("platform.self");
      default:
        return true;
    }
  };
  const resolveMcpPrincipal = ({ req, requestActor, requestIdentity, requestSession, mcpServer, appContext }) => {
    const transport = String(headerValue(req?.headers?.["x-witness-mcp-transport"]) || "http").trim().toLowerCase();
    const overrideToken = headerValue(req?.headers?.["x-witness-mcp-internal-token"]).trim();
    const overrideActor = headerValue(req?.headers?.["x-witness-mcp-actor"]).trim() || null;
    const bearer = headerValue(req?.headers?.authorization).trim();
    const serviceToken = runtimeConfigLookup(appContext?.runtimeConfig ?? {}, `mcp.${mcpServer.id}.token`);
    const validServiceToken = typeof serviceToken === "string" && serviceToken.trim()
      ? bearer === `Bearer ${serviceToken.trim()}`
      : false;
    const requestAuthority = requestSession
      ? normalizeAuthorityTuple(requestSession, { allowAliases: true })
      : normalizeAuthorityTuple({
          authenticatedIdentity: requestIdentity?.id ?? requestIdentity ?? null,
          authenticatedActor: requestActor,
          effectiveIdentity: requestIdentity?.id ?? requestIdentity ?? null,
          effectiveActor: requestActor,
          authorityMode: "direct"
        });
    const okPrincipal = (actingMode, authority) => ({
      ok: true,
      actingMode,
      actor: authority.effectiveActor,
      identity: authority.effectiveIdentity,
      authenticatedIdentity: authority.authenticatedIdentity,
      authenticatedActor: authority.authenticatedActor,
      effectiveIdentity: authority.effectiveIdentity,
      effectiveActor: authority.effectiveActor,
      authorityMode: authority.authorityMode,
      assumptionGrantId: authority.assumptionGrantId,
      transport
    });
    if (transport === "stdio" && overrideActor && (!mcpInternalToken || overrideToken === mcpInternalToken)) {
      return okPrincipal("delegated", normalizeAuthorityTuple({
        authenticatedActor: overrideActor,
        effectiveActor: overrideActor,
        authorityMode: "direct"
      }));
    }
    if (transport === "stdio" && mcpServer.serviceIdentity) {
      return okPrincipal("service", normalizeAuthorityTuple({
        authenticatedActor: mcpServer.serviceIdentity,
        effectiveActor: mcpServer.serviceIdentity,
        authorityMode: "service"
      }));
    }
    if (validServiceToken) {
      if (!mcpServer.serviceIdentity) return { ok: false, status: 403, reason: "mcp server has no service identity", transport };
      return okPrincipal("service", normalizeAuthorityTuple({
        authenticatedActor: mcpServer.serviceIdentity,
        effectiveActor: mcpServer.serviceIdentity,
        authorityMode: "service"
      }));
    }
    if (requestAuthority.effectiveActor) return okPrincipal("delegated", requestAuthority);
    return okPrincipal(null, requestAuthority);
  };
  const mcpScopeAllows = (install, args, appContext) => {
    if ((!install.scopeContexts || !install.scopeContexts.length) && (!install.scopeTargets || !install.scopeTargets.length)) {
      return { ok: true, reason: null };
    }
    const scope = resolveMcpToolScope(install.tool, args ?? {}, appContext);
    const contextIds = new Set(scope.contextIds ?? []);
    const targetIds = new Set(scope.targetIds ?? []);
    for (const targetId of targetIds) {
      const contextId = scopeContextForTarget(targetId, appContext);
      if (contextId) contextIds.add(contextId);
    }
    if (install.scopeTargets.length && !install.scopeTargets.some(targetId => targetIds.has(targetId))) {
      return { ok: false, reason: "tool call is outside installed mcp target scope" };
    }
    if (install.scopeContexts.length && !install.scopeContexts.some(contextId => contextIds.has(contextId))) {
      return { ok: false, reason: "tool call is outside installed mcp context scope" };
    }
    return { ok: true, reason: null };
  };

  return {
    currentMcpServerIndex,
    currentMcpToolInstalls,
    mcpToolAvailable,
    validateMcpOrigin,
    resolveMcpPrincipal,
    mcpScopeAllows
  };
}
