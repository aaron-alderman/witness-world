import {
  WITNESS_CORE_TRANSPORT_METHODS,
  WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
  WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS,
  createWitnessCoreTransportCall,
  createWitnessCoreTransportSubscribe
} from "./witness-core-transport-contract.js";

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
    bodyText = null,
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
    if (bodyText != null) {
      options.headers = { ...(options.headers ?? {}) };
      options.body = String(bodyText);
    } else if (body != null) {
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

  const call = async (message = {}) => {
    const request = createWitnessCoreTransportCall(message);
    const args = request.args && typeof request.args === "object" ? request.args : {};
    switch (request.method) {
      case WITNESS_CORE_TRANSPORT_METHODS.generationPublish:
        return await requestJson({
          path: "/generations",
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=utf-8"
          },
          bodyText: String(args.form ?? ""),
          errorPrefix: "witness core generation publish"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.sourceRead:
        return await requestJson({
          path: "/capabilities/fs/read",
          method: "GET",
          query: args.query ?? null,
          errorPrefix: "witness core source capability",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.sourceStat:
        return await requestJson({
          path: "/capabilities/fs/stat",
          method: "GET",
          query: args.query ?? null,
          errorPrefix: "witness core source capability",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.sourceList:
        return await requestJson({
          path: "/capabilities/fs/list",
          method: "GET",
          query: args.query ?? null,
          errorPrefix: "witness core source capability",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.sourceWrite:
        return await requestJson({
          path: "/capabilities/fs/write",
          method: "PUT",
          body: args.body ?? null,
          errorPrefix: "witness core source capability",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.sourcePatch:
        return await requestJson({
          path: "/capabilities/fs/patch",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core source capability",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.verificationPersistenceRequest:
        return await requestJson({
          path: "/verification-persistence",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.httpOutboundExecute:
        return await requestJson({
          path: "/capabilities/network/http-outbound",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.sqliteTestConnection:
      case WITNESS_CORE_TRANSPORT_METHODS.sqliteMigrate:
      case WITNESS_CORE_TRANSPORT_METHODS.sqliteQuery:
      case WITNESS_CORE_TRANSPORT_METHODS.sqliteCommand:
      case WITNESS_CORE_TRANSPORT_METHODS.sqliteTransaction:
        return await requestJson({
          path: "/capabilities/db/sqlite",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.sqlTestConnection:
      case WITNESS_CORE_TRANSPORT_METHODS.sqlReadOrderedBatch:
      case WITNESS_CORE_TRANSPORT_METHODS.sqlWriteRows:
        return await requestJson({
          path: "/capabilities/db/sql",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.publishedAuthoringTransaction:
        return await requestJson({
          path: "/transactions/published-authoring",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.previewSessionCreate:
        return await requestJson({
          path: "/preview-sessions",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.previewSessionRead:
        return await requestJson({
          path: `/preview-sessions/${encodeURIComponent(String(args.id || ""))}`,
          method: "GET",
          cache: "no-store",
          allowNotFound: true,
          notFoundValue: null,
          errorPrefix: "witness core preview session read"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.previewSessionWrite:
        return await requestJson({
          path: `/preview-sessions/${encodeURIComponent(String(args.id || ""))}`,
          method: "PUT",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.previewSessionDelete: {
        const payload = await requestJson({
          path: `/preview-sessions/${encodeURIComponent(String(args.id || ""))}`,
          method: "DELETE",
          allowNotFound: true,
          notFoundValue: false,
          errorPrefix: "witness core preview session delete"
        });
        return payload;
      }
      case WITNESS_CORE_TRANSPORT_METHODS.generationPromote:
        return await requestJson({
          path: `/generations/${encodeURIComponent(String(args.id || ""))}/promote`,
          method: "POST",
          body: null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.generationRollback:
        return await requestJson({
          path: `/generations/${encodeURIComponent(String(args.id || ""))}/rollback`,
          method: "POST",
          body: null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.computeModuleShadowInvoke:
        return await requestJson({
          path: "/compute-modules/shadow-invoke",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.servingRead:
      case WITNESS_CORE_TRANSPORT_METHODS.statusReadServing:
        return await requestJson({
          path: "/serving",
          method: "GET",
          cache: "no-store",
          errorPrefix: "witness core serving read"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.servingRequestLive:
        return await requestJson({
          path: "/serving/live",
          method: "POST",
          body: null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.servingRequestStable:
        return await requestJson({
          path: "/serving/stable",
          method: "POST",
          body: null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.soakRead:
        return await requestJson({
          path: "/soak",
          method: "GET",
          cache: "no-store",
          errorPrefix: "witness core soak read"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.soakStart:
        return await requestJson({
          path: "/soak/start",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.soakMark:
        return await requestJson({
          path: "/soak/mark",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.soakSample:
        return await requestJson({
          path: "/soak/sample",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.soakComplete:
        return await requestJson({
          path: "/soak/complete",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.soakFail:
        return await requestJson({
          path: "/soak/fail",
          method: "POST",
          body: args.body ?? null,
          errorPrefix: "witness core request",
          conflictCode: "WITNESS_CORE_SOURCE_CONFLICT"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.statusReadGenerations:
        return await requestJson({
          path: "/generations",
          method: "GET",
          cache: "no-store",
          errorPrefix: "witness core generations read"
        });
      case WITNESS_CORE_TRANSPORT_METHODS.statusReadHealth:
        return await requestJson({
          path: "/health",
          method: "GET",
          cache: "no-store",
          errorPrefix: "witness core health read"
        });
      default:
        throw new Error(`unsupported witness-core HTTP transport method: ${request.method}`);
    }
  };

  const subscribe = async (message = {}) => {
    const request = createWitnessCoreTransportSubscribe(message);
    switch (request.channel) {
      case WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents:
        return await openEventStream({
          path: "/events",
          cache: "no-store",
          headers: { accept: "text/event-stream" },
          signal: request.signal ?? request.args?.signal ?? null,
          errorPrefix: "witness core event stream"
        });
      default:
        throw new Error(`unsupported witness-core HTTP transport subscription: ${request.channel}`);
    }
  };

  return {
    kind: "witness-core-http-transport/v1",
    protocol: WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
    coreUrl: normalizedCoreUrl,
    call,
    subscribe
  };
}
