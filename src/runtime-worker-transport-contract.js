export const RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION = "witness-runtime-worker-transport/v1";

export const RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS = Object.freeze({
  call: "call",
  result: "result"
});

export const RUNTIME_WORKER_TRANSPORT_METHODS = Object.freeze({
  controlDescribe: "runtime.control.describe",
  processHealthRead: "runtime.process_health.read",
  supervisionActivate: "runtime.supervision.activate",
  supervisionQuiesce: "runtime.supervision.quiesce",
  appSnapshotReload: "runtime.app_snapshot.reload"
});

function cloneJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function normalizeRequestId(requestId) {
  const trimmed = String(requestId || "").trim();
  return trimmed || null;
}

function validMethod(value) {
  return Object.values(RUNTIME_WORKER_TRANSPORT_METHODS).includes(value);
}

export function createRuntimeWorkerTransportCall({
  method,
  requestId = null,
  args = null
} = {}) {
  const normalizedMethod = String(method || "").trim();
  if (!validMethod(normalizedMethod)) {
    throw new Error(`unknown runtime worker transport method: ${normalizedMethod || "(empty)"}`);
  }
  return {
    protocol: RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION,
    kind: RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS.call,
    method: normalizedMethod,
    requestId: normalizeRequestId(requestId),
    args: cloneJson(args)
  };
}

export function createRuntimeWorkerTransportResult({
  method,
  requestId = null,
  ok,
  payload = null,
  error = null
} = {}) {
  const normalizedMethod = String(method || "").trim();
  if (!validMethod(normalizedMethod)) {
    throw new Error(`unknown runtime worker transport method: ${normalizedMethod || "(empty)"}`);
  }
  const normalizedError = error == null
    ? null
    : (typeof error === "string"
      ? { message: error }
      : {
          message: String(error.message || error.error || "runtime worker transport failed"),
          code: error.code ? String(error.code) : null
        });
  return {
    protocol: RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION,
    kind: RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS.result,
    method: normalizedMethod,
    requestId: normalizeRequestId(requestId),
    ok: ok === true,
    payload: cloneJson(payload),
    error: normalizedError
  };
}

export function parseRuntimeWorkerTransportMessage(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.protocol !== RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION) return null;
  if (parsed.kind !== RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS.call && parsed.kind !== RUNTIME_WORKER_TRANSPORT_MESSAGE_KINDS.result) return null;
  if (!validMethod(parsed.method)) return null;
  return parsed;
}

export function createRuntimeWorkerTransportDescriptor({
  mutationsEnabled = true
} = {}) {
  return {
    protocol: RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION,
    methods: {
      describe: RUNTIME_WORKER_TRANSPORT_METHODS.controlDescribe,
      readHealth: RUNTIME_WORKER_TRANSPORT_METHODS.processHealthRead,
      activate: RUNTIME_WORKER_TRANSPORT_METHODS.supervisionActivate,
      quiesce: RUNTIME_WORKER_TRANSPORT_METHODS.supervisionQuiesce,
      reload: mutationsEnabled === true ? RUNTIME_WORKER_TRANSPORT_METHODS.appSnapshotReload : null
    }
  };
}
