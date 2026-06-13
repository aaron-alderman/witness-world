import { moduleProjectors } from "../../src/modules.js";

export function createMcpBundleSupportServices({
  world,
  backendHost,
  mcpInternalToken = null,
  runtimeConfigLookup,
  resolveMcpToolScope,
  hostCapabilities,
  headerValue
}) {
  const currentMcpServerIndex = () => world.project(moduleProjectors.mcpServerIndex);
  const currentMcpToolInstalls = () => world.project(moduleProjectors.mcpToolInstalls);
  const currentBackendCapabilities = () => hostCapabilities(world, backendHost);
  const scopeContextForTarget = targetId => {
    if (!targetId) return null;
    const moduleKind = world.project(moduleProjectors.modules).get(targetId) ?? null;
    if (moduleKind === "context") return targetId;
    return world.project(moduleProjectors.objectContexts).get(targetId) ?? null;
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
      default:
        return true;
    }
  };
  const resolveMcpPrincipal = ({ req, requestActor, mcpServer, appContext }) => {
    const transport = String(headerValue(req?.headers?.["x-witness-mcp-transport"]) || "http").trim().toLowerCase();
    const overrideToken = headerValue(req?.headers?.["x-witness-mcp-internal-token"]).trim();
    const overrideActor = headerValue(req?.headers?.["x-witness-mcp-actor"]).trim() || null;
    const bearer = headerValue(req?.headers?.authorization).trim();
    const serviceToken = runtimeConfigLookup(appContext?.runtimeConfig ?? {}, `mcp.${mcpServer.id}.token`);
    const validServiceToken = typeof serviceToken === "string" && serviceToken.trim()
      ? bearer === `Bearer ${serviceToken.trim()}`
      : false;
    if (transport === "stdio" && overrideActor && (!mcpInternalToken || overrideToken === mcpInternalToken)) {
      return { ok: true, actingMode: "delegated", actor: overrideActor, transport };
    }
    if (transport === "stdio" && mcpServer.serviceIdentity) {
      return { ok: true, actingMode: "service", actor: mcpServer.serviceIdentity, transport };
    }
    if (validServiceToken) {
      if (!mcpServer.serviceIdentity) return { ok: false, status: 403, reason: "mcp server has no service identity", transport };
      return { ok: true, actingMode: "service", actor: mcpServer.serviceIdentity, transport };
    }
    if (requestActor) return { ok: true, actingMode: "delegated", actor: requestActor, transport };
    return { ok: true, actingMode: null, actor: null, transport };
  };
  const mcpScopeAllows = (install, args, appContext) => {
    if ((!install.scopeContexts || !install.scopeContexts.length) && (!install.scopeTargets || !install.scopeTargets.length)) {
      return { ok: true, reason: null };
    }
    const scope = resolveMcpToolScope(install.tool, args ?? {}, appContext);
    const contextIds = new Set(scope.contextIds ?? []);
    const targetIds = new Set(scope.targetIds ?? []);
    for (const targetId of targetIds) {
      const contextId = scopeContextForTarget(targetId);
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
