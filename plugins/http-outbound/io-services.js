export function responseHeadersToObject(headers) {
  const rows = {};
  if (!headers) return rows;
  if (typeof headers.entries === "function") {
    for (const [name, value] of headers.entries()) rows[String(name).toLowerCase()] = String(value);
    return rows;
  }
  for (const [name, value] of Object.entries(headers)) rows[String(name).toLowerCase()] = String(value);
  return rows;
}

export function looksJsonContentType(value) {
  const contentType = String(value || "").toLowerCase();
  return contentType.startsWith("application/json") || contentType.includes("+json");
}

export function createHttpOutboundIoServices({
  runtimeConfigLookup,
  runtimeConfigScalar,
  positiveInteger,
  randomUUID,
  canCreateInContext
}) {
  const normalizeHttpOutboundConfig = runtimeConfig => ({
    timeoutMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.timeoutMs"), 1000),
    maxAttempts: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.maxAttempts"), 2),
    retryDelayMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "http.outbound.retryDelayMs"), 50)
  });

  const httpOutboundId = () => `outbound_${randomUUID()}`;
  const outboundTitle = ({ target = null, method = "GET", url = null } = {}) => {
    if (target) return target;
    return `${method} ${url || "outbound"}`;
  };

  const normalizeHeaderMap = input => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: true, value: {} };
    const headers = {};
    for (const [name, raw] of Object.entries(input)) {
      const key = String(name || "").trim().toLowerCase();
      if (!key) return { ok: false, reason: "header name required" };
      if (raw == null) continue;
      if (!runtimeConfigScalar(raw)) return { ok: false, reason: `header ${key} must be a scalar` };
      headers[key] = String(raw);
    }
    return { ok: true, value: headers };
  };

  const headerNamesFromMap = headers => Object.keys(headers || {}).map(name => String(name).toLowerCase()).sort();

  const outboundBodyKind = body => {
    if (Object.prototype.hasOwnProperty.call(body || {}, "json")) return "json";
    if (typeof body?.text === "string") return "text";
    return "none";
  };

  const normalizeOutboundRequest = ({ body, actor, appContext, serverRunnerId }) => {
    const target = typeof body?.target === "string" ? body.target.trim() : "";
    if (!target) return { ok: false, status: 400, reason: "target required" };
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return { ok: false, status: 400, reason: "url required" };
    let parsedUrl = null;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { ok: false, status: 400, reason: "url must be absolute" };
    }
    if (!["http:", "https:", "stub:"].includes(parsedUrl.protocol)) {
      return { ok: false, status: 400, reason: "url protocol must be http, https, or stub" };
    }
    const method = typeof body?.method === "string" && body.method.trim()
      ? body.method.trim().toUpperCase()
      : "POST";
    if (!/^[A-Z]+$/.test(method)) return { ok: false, status: 400, reason: "method must be a token" };
    const headerMap = normalizeHeaderMap(body?.headers);
    if (!headerMap.ok) return { ok: false, status: 400, reason: headerMap.reason };
    const bodyKind = outboundBodyKind(body);
    if (bodyKind === "json" && typeof body?.text === "string") {
      return { ok: false, status: 400, reason: "choose json or text" };
    }
    let bodyText = null;
    let jsonBody = null;
    if (bodyKind === "json") {
      jsonBody = body.json;
      try {
        bodyText = JSON.stringify(body.json ?? null);
      } catch {
        return { ok: false, status: 400, reason: "json body must be serializable" };
      }
      if (!headerMap.value["content-type"]) headerMap.value["content-type"] = "application/json";
    } else if (bodyKind === "text") {
      bodyText = String(body.text);
      if (!headerMap.value["content-type"]) headerMap.value["content-type"] = "text/plain; charset=utf-8";
    }
    const defaults = normalizeHttpOutboundConfig(appContext.runtimeConfig);
    const timeoutMs = positiveInteger(body?.timeoutMs, defaults.timeoutMs);
    const maxAttempts = positiveInteger(body?.maxAttempts, defaults.maxAttempts);
    const retryDelayMs = positiveInteger(body?.retryDelayMs, defaults.retryDelayMs);
    const contextId = typeof body?.context === "string" && body.context.trim() ? body.context.trim() : null;
    if (contextId) {
      const gate = canCreateInContext(actor, contextId);
      if (!gate.ok) return gate;
    }
    const correlationId = typeof body?.correlationId === "string" && body.correlationId.trim()
      ? body.correlationId.trim()
      : `corr_${randomUUID()}`;
    headerMap.value["x-witness-correlation-id"] = correlationId;
    let authKind = null;
    let authConfigKey = null;
    if (body?.auth != null) {
      if (!body.auth || typeof body.auth !== "object" || Array.isArray(body.auth)) {
        return { ok: false, status: 400, reason: "auth must be an object" };
      }
      authKind = typeof body.auth.kind === "string" ? body.auth.kind.trim().toLowerCase() : "";
      authConfigKey = typeof body.auth.configKey === "string" ? body.auth.configKey.trim() : "";
      if (!authKind || !authConfigKey) return { ok: false, status: 400, reason: "auth kind and configKey required" };
      const configValue = appContext.runtimeConfig?.[authConfigKey];
      if (!runtimeConfigScalar(configValue)) {
        return { ok: false, status: 400, reason: `runtime config value missing for ${authConfigKey}` };
      }
      if (authKind === "bearer") {
        headerMap.value.authorization = `Bearer ${String(configValue)}`;
      } else if (authKind === "header") {
        const headerName = typeof body.auth.header === "string" ? body.auth.header.trim().toLowerCase() : "";
        if (!headerName) return { ok: false, status: 400, reason: "auth.header required for header auth" };
        headerMap.value[headerName] = String(configValue);
      } else {
        return { ok: false, status: 400, reason: "auth kind must be bearer or header" };
      }
    }
    return {
      ok: true,
      outbound: {
        id: httpOutboundId(),
        actor,
        serverRunner: serverRunnerId,
        target,
        url,
        method,
        headers: headerMap.value,
        requestHeaderNames: headerNamesFromMap(headerMap.value),
        requestBodyKind: bodyKind,
        bodyText,
        jsonBody,
        timeoutMs,
        maxAttempts,
        retryDelayMs,
        context: contextId,
        correlationId,
        authKind: authKind || null,
        authConfigKey: authConfigKey || null
      }
    };
  };

  const pickExternalRefId = headers => {
    const rows = responseHeadersToObject(headers);
    return rows["x-external-id"] || rows["x-provider-id"] || rows["x-request-id"] || null;
  };

  const isRetryableOutboundStatus = status => status === 408 || status === 429 || status >= 500;

  const outboundFailureResponseStatus = (reason, responseStatus = null) => {
    if (reason === "outbound timeout") return 504;
    if (Number.isFinite(responseStatus) && responseStatus >= 400 && responseStatus < 500) return 502;
    return 502;
  };

  return {
    normalizeOutboundRequest,
    outboundTitle,
    pickExternalRefId,
    isRetryableOutboundStatus,
    outboundFailureResponseStatus
  };
}
