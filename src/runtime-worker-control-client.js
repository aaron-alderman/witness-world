import net from "node:net";
import { executeRuntimeWorkerTransportCall } from "./runtime-worker-transport.js";
import {
  createRuntimeWorkerTransportResult,
  parseRuntimeWorkerTransportMessage
} from "./runtime-worker-transport-contract.js";

function normalizeControlAddress(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const separator = trimmed.lastIndexOf(":");
  if (separator <= 0 || separator === trimmed.length - 1) return null;
  const host = trimmed.slice(0, separator).trim();
  const port = Number.parseInt(trimmed.slice(separator + 1).trim(), 10);
  if (!host || !Number.isFinite(port) || port <= 0) return null;
  return { host, port };
}

export function createRuntimeWorkerControlClient({
  controlAddress = "",
  resolveActiveRuntime = async () => ({ context: null }),
  appContext = null,
  runtimeProcessHealthMonitor,
  syncLocalSnapshotPoller = null,
  logger = null,
  netModule = net,
  connectRetryMs = 100
} = {}) {
  const target = normalizeControlAddress(controlAddress);
  if (!target || typeof netModule?.createConnection !== "function") return null;

  let closed = false;
  let socket = null;
  let reconnectTimer = null;
  let buffer = "";

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, Math.max(10, Number(connectRetryMs) || 100));
  };

  const sendResult = result => {
    if (!socket || socket.destroyed) return;
    try {
      socket.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      logger?.warn?.("runtime.workerControlClient.writeFailed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const processLine = line => {
    void (async () => {
      let parsed = null;
      try {
        parsed = parseRuntimeWorkerTransportMessage(line);
      } catch (error) {
        logger?.warn?.("runtime.workerControlClient.parseFailed", {
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
      if (!parsed || parsed.kind !== "call") return;
      try {
        const runtime = await resolveActiveRuntime(null);
        const result = await executeRuntimeWorkerTransportCall({
          method: parsed.method,
          args: parsed.args ?? null,
          runtimeContext: runtime?.context ?? null,
          appContext,
          runtimeProcessHealthMonitor,
          syncLocalSnapshotPoller
        });
        const transportCallSucceeded = parsed.method === "runtime.app_http.request"
          ? result != null && typeof result === "object"
          : result?.status >= 200 && result?.status < 400;
        sendResult(createRuntimeWorkerTransportResult({
          method: parsed.method,
          requestId: parsed.requestId,
          ok: transportCallSucceeded,
          payload: result?.body ?? null,
          error: transportCallSucceeded
            ? null
            : {
                message: String(result?.body?.error || "runtime worker transport failed"),
                code: result?.body?.code ?? null,
                status: Number.isFinite(Number(result?.status)) ? Number(result.status) : null
              }
        }));
      } catch (error) {
        sendResult(createRuntimeWorkerTransportResult({
          method: parsed.method,
          requestId: parsed.requestId,
          ok: false,
          payload: null,
          error: {
            message: error instanceof Error ? error.message : String(error),
            code: error?.code ?? null
          }
        }));
      }
    })().catch(error => {
      logger?.warn?.("runtime.workerControlClient.dispatchFailed", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  };

  const handleData = chunk => {
    buffer += chunk.toString("utf8").replaceAll("\r\n", "\n");
    while (true) {
      const boundary = buffer.indexOf("\n");
      if (boundary < 0) break;
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (!line) continue;
      processLine(line);
    }
  };

  const connect = () => {
    if (closed || socket) return;
    const nextSocket = netModule.createConnection(target);
    socket = nextSocket;
    nextSocket.on("connect", () => {
      logger?.info?.("runtime.workerControlClient.connected", {
        address: controlAddress
      });
    });
    nextSocket.on("data", handleData);
    nextSocket.on("error", error => {
      logger?.warn?.("runtime.workerControlClient.error", {
        address: controlAddress,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    nextSocket.on("close", () => {
      socket = null;
      if (closed) return;
      scheduleReconnect();
    });
  };

  connect();

  return {
    address: controlAddress,
    close() {
      closed = true;
      clearReconnectTimer();
      if (socket) {
        try {
          socket.destroy();
        } catch {}
      }
      socket = null;
    }
  };
}
