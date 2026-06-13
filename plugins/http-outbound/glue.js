import { nonNegativeInteger, positiveInteger } from "../../src/runtime-config-utils.js";
import { responseHeadersToObject } from "./io-services.js";

export function delayWithSignal(ms, signal) {
  const waitMs = nonNegativeInteger(ms, 0);
  if (!waitMs) {
    if (signal?.aborted) return Promise.reject(new Error("outbound timeout"));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("outbound timeout"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, waitMs);
    const onAbort = () => {
      cleanup();
      reject(new Error("outbound timeout"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function redactHeaderValues(headers) {
  const safe = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const key = String(name).toLowerCase();
    safe[key] = /(authorization|token|secret|cookie)/i.test(key) ? "[redacted]" : String(value);
  }
  return safe;
}

async function executeStubOutbound(request, { appContext, signal, attempt }) {
  const targetUrl = new URL(request.url);
  const mode = targetUrl.hostname || "echo";
  const delayMs = nonNegativeInteger(targetUrl.searchParams.get("delayMs"), 0);
  const externalRefId = `stub-outbound-${request.id}-${attempt}`;
  if (mode === "timeout") {
    const waitMs = nonNegativeInteger(targetUrl.pathname.split("/").filter(Boolean)[0], request.timeoutMs + 50);
    await delayWithSignal(waitMs, signal);
    return {
      transport: "stub",
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-external-id": externalRefId,
        "x-correlation-id": request.correlationId
      },
      bodyText: JSON.stringify({ ok: true, target: request.target, timeout: false })
    };
  }
  if (delayMs) await delayWithSignal(delayMs, signal);
  if (mode === "status") {
    const status = positiveInteger(targetUrl.pathname.split("/").filter(Boolean)[0], 500);
    return {
      transport: "stub",
      status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-external-id": externalRefId,
        "x-correlation-id": request.correlationId
      },
      bodyText: targetUrl.searchParams.get("text") || `stub status ${status}`
    };
  }
  if (mode === "flaky") {
    const failures = nonNegativeInteger(targetUrl.searchParams.get("failures"), 1);
    const failureStatus = positiveInteger(targetUrl.searchParams.get("status"), 503);
    const key = targetUrl.toString();
    const attempts = appContext.httpOutboundStubState.get(key) ?? 0;
    appContext.httpOutboundStubState.set(key, attempts + 1);
    if (attempts < failures) {
      return {
        transport: "stub",
        status: failureStatus,
        headers: {
          "content-type": "application/json",
          "x-external-id": externalRefId,
          "x-correlation-id": request.correlationId
        },
        bodyText: JSON.stringify({ ok: false, retryable: true, attempt, failuresRemaining: failures - (attempts + 1) })
      };
    }
    return {
      transport: "stub",
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-external-id": externalRefId,
        "x-correlation-id": request.correlationId
      },
      bodyText: JSON.stringify({ ok: true, attempt, target: request.target })
    };
  }
  return {
    transport: "stub",
    status: positiveInteger(targetUrl.searchParams.get("status"), 200),
    headers: {
      "content-type": "application/json",
      "x-external-id": externalRefId,
      "x-correlation-id": request.correlationId
    },
    bodyText: JSON.stringify({
      ok: true,
      target: request.target,
      method: request.method,
      url: request.url,
      requestBodyKind: request.requestBodyKind,
      receivedHeaders: redactHeaderValues(request.headers),
      body: request.requestBodyKind === "json"
        ? request.jsonBody
        : (request.requestBodyKind === "text" ? request.bodyText : null),
      auth: request.authKind ? { kind: request.authKind, configKey: request.authConfigKey } : null
    })
  };
}

export async function executeHttpOutbound(request, { appContext, signal, attempt }) {
  if (request.url.startsWith("stub://")) {
    return executeStubOutbound(request, { appContext, signal, attempt });
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.bodyText ?? undefined,
    signal
  });
  return {
    transport: "network",
    status: response.status,
    headers: responseHeadersToObject(response.headers),
    bodyText: request.method === "HEAD" ? "" : await response.text()
  };
}
