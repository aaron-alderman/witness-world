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

function connectWitnessCorePipe(pipePath) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.createConnection(pipePath);
    const fail = error => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(createWitnessCoreRequestError("witness core unavailable", {
        status: 503,
        code: "WITNESS_CORE_UNAVAILABLE",
        details: {
          cause: error instanceof Error ? error.message : String(error)
        }
      }));
    };
    socket.once("error", fail);
    socket.once("connect", () => {
      if (settled) return;
      settled = true;
      socket.removeListener("error", fail);
      resolve(socket);
    });
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
  logger = null
} = {}) {
  const normalizedPipePath = normalizeWitnessCoreTransportPipe(pipePath);
  if (!normalizedPipePath) return null;

  const call = async (message = {}) => {
    const request = createWitnessCoreTransportCall({
      ...message,
      requestId: message?.requestId ?? nextRequestId()
    });
    const socket = await connectWitnessCorePipe(normalizedPipePath);
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
        finish(createWitnessCoreRequestError("witness core unavailable", {
          status: 503,
          code: "WITNESS_CORE_UNAVAILABLE",
          details: {
            cause: error instanceof Error ? error.message : String(error)
          }
        }));
      });
      socket.on("close", () => {
        if (!settled) {
          finish(createWitnessCoreRequestError("witness core unavailable", {
            status: 503,
            code: "WITNESS_CORE_UNAVAILABLE",
            details: {
              cause: "worker IPC connection closed before result"
            }
          }));
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
    const socket = await connectWitnessCorePipe(normalizedPipePath);
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
          controller.error(createWitnessCoreRequestError("witness core unavailable", {
            status: 503,
            code: "WITNESS_CORE_UNAVAILABLE",
            details: {
              cause: error instanceof Error ? error.message : String(error)
            }
          }));
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
