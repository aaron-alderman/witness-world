import net from "node:net";
import {
  createWitnessCoreRequestError
} from "./witness-core-http-transport.js";
import {
  WITNESS_CORE_TRANSPORT_METHODS,
  WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
  WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS,
  createWitnessCoreTransportCall,
  createWitnessCoreTransportSubscribe,
  parseWitnessCoreTransportMessage
} from "./witness-core-transport-contract.js";

function nextRequestId() {
  return `wcore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeWitnessCoreTransportPipe(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function createWitnessCoreUnavailableError(error) {
  return createWitnessCoreRequestError("witness core unavailable", {
    status: 503,
    code: "WITNESS_CORE_UNAVAILABLE",
    details: {
      cause: error instanceof Error ? error.message : String(error)
    }
  });
}

function connectWitnessCorePipe(pipePath, {
  connectTimeoutMs = 2000,
  connectRetryDelayMs = 25
} = {}) {
  const deadline = Date.now() + Math.max(0, Number(connectTimeoutMs) || 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastError = null;
    const attemptConnect = () => {
      if (settled) return;
      const socket = net.createConnection(pipePath);
      const fail = error => {
        lastError = error;
        socket.destroy();
        if (Date.now() < deadline) {
          setTimeout(attemptConnect, Math.max(1, Number(connectRetryDelayMs) || 1));
          return;
        }
        if (settled) return;
        settled = true;
        reject(createWitnessCoreUnavailableError(lastError));
      };
      socket.once("error", fail);
      socket.once("connect", () => {
        if (settled) {
          socket.destroy();
          return;
        }
        settled = true;
        socket.removeListener("error", fail);
        resolve(socket);
      });
    };
    attemptConnect();
  });
}

function resultErrorToRequestError(result, request) {
  const status = Number(result?.error?.status || result?.payload?.status || 500);
  const code = typeof result?.error?.code === "string" && result.error.code
    ? result.error.code
    : null;
  const details = result?.error?.details && typeof result.error.details === "object"
    ? result.error.details
    : (result?.payload && typeof result.payload === "object" ? result.payload : null);
  return createWitnessCoreRequestError(
    String(result?.error?.message || `witness core IPC request failed: ${request.method}`),
    { status, code, details }
  );
}

function sseFrameBytes(eventType, payload, encoder) {
  return encoder.encode(
    `event: ${String(eventType || "message")}\ndata: ${JSON.stringify(payload ?? null)}\n\n`
  );
}

export function createWitnessCoreIpcTransport({
  pipePath = null,
  logger = null,
  connectTimeoutMs = 2000,
  connectRetryDelayMs = 25
} = {}) {
  const normalizedPipePath = normalizeWitnessCoreTransportPipe(pipePath);
  if (!normalizedPipePath) return null;

  const call = async (message = {}) => {
    const request = createWitnessCoreTransportCall({
      ...message,
      requestId: message?.requestId ?? nextRequestId()
    });
    const socket = await connectWitnessCorePipe(normalizedPipePath, {
      connectTimeoutMs,
      connectRetryDelayMs
    });
    return await new Promise((resolve, reject) => {
      let settled = false;
      let buffer = "";
      const finish = (error, payload) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(payload);
      };
      socket.on("data", chunk => {
        buffer += chunk.toString("utf8");
        buffer = buffer.replaceAll("\r\n", "\n");
        while (true) {
          const boundary = buffer.indexOf("\n");
          if (boundary < 0) break;
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);
          if (!line) continue;
          let parsed = null;
          try {
            parsed = parseWitnessCoreTransportMessage(line);
          } catch (error) {
            finish(error);
            return;
          }
          if (!parsed || parsed.kind !== "result") continue;
          if (parsed.method !== request.method || parsed.requestId !== request.requestId) continue;
          if (parsed.ok !== true) {
            finish(resultErrorToRequestError(parsed, request));
            return;
          }
          finish(null, parsed.payload ?? null);
          return;
        }
      });
      socket.on("error", error => {
        logger?.warn?.("witnessCore.ipcTransport.callFailed", {
          method: request.method,
          error: error instanceof Error ? error.message : String(error)
        });
        finish(createWitnessCoreUnavailableError(error));
      });
      socket.on("close", () => {
        if (!settled) {
          finish(createWitnessCoreUnavailableError("worker IPC connection closed before result"));
        }
      });
      socket.write(`${JSON.stringify(request)}\n`);
    });
  };

  const subscribe = async (message = {}) => {
    const request = createWitnessCoreTransportSubscribe({
      ...message,
      requestId: message?.requestId ?? nextRequestId()
    });
    if (request.channel !== WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents) {
      throw new Error(`unsupported witness-core IPC transport subscription: ${request.channel}`);
    }
    const socket = await connectWitnessCorePipe(normalizedPipePath, {
      connectTimeoutMs,
      connectRetryDelayMs
    });
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        let buffer = "";
        socket.on("data", chunk => {
          buffer += chunk.toString("utf8");
          buffer = buffer.replaceAll("\r\n", "\n");
          while (true) {
            const boundary = buffer.indexOf("\n");
            if (boundary < 0) break;
            const line = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 1);
            if (!line) continue;
            let parsed = null;
            try {
              parsed = parseWitnessCoreTransportMessage(line);
            } catch (error) {
              controller.error(error);
              socket.destroy();
              return;
            }
            if (!parsed) continue;
            if (parsed.kind === "result" && parsed.ok !== true) {
              controller.error(resultErrorToRequestError(parsed, {
                method: WITNESS_CORE_TRANSPORT_METHODS.statusReadHealth
              }));
              socket.destroy();
              return;
            }
            if (parsed.kind !== "event") continue;
            controller.enqueue(sseFrameBytes(parsed.eventName || "message", parsed.payload ?? null, encoder));
          }
        });
        socket.on("error", error => {
          controller.error(createWitnessCoreUnavailableError(error));
        });
        socket.on("close", () => {
          try {
            controller.close();
          } catch {}
        });
        socket.write(`${JSON.stringify(request)}\n`);
      },
      cancel() {
        socket.destroy();
      }
    });
    return {
      ok: true,
      body
    };
  };

  return {
    kind: "witness-core-ipc-transport/v1",
    protocol: WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
    coreUrl: null,
    pipePath: normalizedPipePath,
    call,
    subscribe
  };
}
