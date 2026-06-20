export function normalizeWitnessCoreUrl(value) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\/$/, "") : "";
}

export function createWitnessCoreRequestError(message, {
  status = 500,
  code = null,
  details = null
} = {}) {
  const error = new Error(message);
  error.status = Number(status || 500);
  if (code) error.code = String(code);
  if (details && typeof details === "object") Object.assign(error, details);
  return error;
}

function buildTransportUrl(coreUrl, path, query = null) {
  const url = new URL(`${coreUrl}${path}`);
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;
      url.searchParams.set(String(key), String(value));
    }
  }
  return String(url);
}

async function parseErrorPayload(response) {
  try {
    const payload = await response.json();
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function createWitnessCoreHttpTransport({
  coreUrl = null,
  fetchImpl = globalThis.fetch,
  logger = null
} = {}) {
  const normalizedCoreUrl = normalizeWitnessCoreUrl(coreUrl);
  if (!normalizedCoreUrl || typeof fetchImpl !== "function") return null;

  const requestJson = async ({
    path,
    method = "GET",
    query = null,
    body = null,
    headers = null,
    cache = null,
    errorPrefix = "witness core request",
    allowNotFound = false,
    notFoundValue = null,
    conflictCode = null
  } = {}) => {
    const options = { method };
    if (cache) options.cache = cache;
    if (headers && typeof headers === "object") {
      options.headers = { ...headers };
    }
    if (body != null) {
      options.headers = {
        "content-type": "application/json; charset=utf-8",
        ...(options.headers ?? {})
      };
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(buildTransportUrl(normalizedCoreUrl, path, query), options);
    } catch (error) {
      logger?.warn?.("witnessCore.httpTransport.unavailable", {
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      throw createWitnessCoreRequestError("witness core unavailable", {
        status: 503,
        code: "WITNESS_CORE_UNAVAILABLE",
        details: {
          cause: error instanceof Error ? error.message : String(error)
        }
      });
    }
    if (allowNotFound && response?.status === 404) return notFoundValue;
    if (!response?.ok) {
      const details = await parseErrorPayload(response);
      const message = typeof details?.error === "string" && details.error
        ? details.error
        : "request rejected";
      throw createWitnessCoreRequestError(
        `${errorPrefix} failed (${response?.status || "unknown"}): ${message}`,
        {
          status: response?.status || 500,
          code: typeof details?.code === "string" && details.code
            ? details.code
            : (response?.status === 409 ? conflictCode : null),
          details
        }
      );
    }
    return await response.json();
  };

  const requestText = async ({
    path,
    method = "GET",
    query = null,
    headers = null,
    cache = null,
    errorPrefix = "witness core request",
    allowNotFound = false,
    notFoundValue = null
  } = {}) => {
    const options = { method };
    if (cache) options.cache = cache;
    if (headers && typeof headers === "object") options.headers = { ...headers };
    let response;
    try {
      response = await fetchImpl(buildTransportUrl(normalizedCoreUrl, path, query), options);
    } catch (error) {
      logger?.warn?.("witnessCore.httpTransport.unavailable", {
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      throw createWitnessCoreRequestError("witness core unavailable", {
        status: 503,
        code: "WITNESS_CORE_UNAVAILABLE",
        details: {
          cause: error instanceof Error ? error.message : String(error)
        }
      });
    }
    if (allowNotFound && response?.status === 404) return notFoundValue;
    if (!response?.ok) {
      const details = await response.text().catch(() => "");
      throw createWitnessCoreRequestError(
        `${errorPrefix} failed (${response?.status || "unknown"}): ${details || "request rejected"}`,
        {
          status: response?.status || 500
        }
      );
    }
    return await response.text();
  };

  const openEventStream = async ({
    path = "/events",
    headers = null,
    signal = null,
    cache = "no-store",
    errorPrefix = "witness core event stream"
  } = {}) => {
    const options = {};
    if (cache) options.cache = cache;
    if (headers && typeof headers === "object") options.headers = { ...headers };
    if (signal) options.signal = signal;
    let response;
    try {
      response = await fetchImpl(buildTransportUrl(normalizedCoreUrl, path), options);
    } catch (error) {
      logger?.warn?.("witnessCore.httpTransport.eventsUnavailable", {
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      throw createWitnessCoreRequestError("witness core unavailable", {
        status: 503,
        code: "WITNESS_CORE_UNAVAILABLE",
        details: {
          cause: error instanceof Error ? error.message : String(error)
        }
      });
    }
    if (!response?.ok) {
      const details = await response.text().catch(() => "");
      throw createWitnessCoreRequestError(
        `${errorPrefix} failed (${response?.status || "unknown"}): ${details || "request rejected"}`,
        {
          status: response?.status || 500
        }
      );
    }
    return response;
  };

  return {
    kind: "witness-core-http-transport/v1",
    coreUrl: normalizedCoreUrl,
    requestJson,
    requestText,
    openEventStream
  };
}
