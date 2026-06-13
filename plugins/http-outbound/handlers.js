import { relation, thing } from "../../src/kernel.js";

export function createHttpOutboundHandlers({
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
