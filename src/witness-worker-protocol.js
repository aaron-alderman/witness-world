export const WITNESS_WORKER_PROTOCOL_VERSION = "witness-worker/v1";

export const WITNESS_WORKER_KINDS = Object.freeze({
  request: "request",
  result: "result",
  event: "event"
});

export const WITNESS_WORKER_OPERATIONS = Object.freeze({
  build: "build",
  evaluate: "evaluate",
  render: "render",
  inspect: "inspect",
  boundedCompute: "bounded_compute"
});

export const WITNESS_WORKER_CANONICAL_STATE_ACCESS = Object.freeze({
  none: "none",
  delegatedReadOnly: "delegated_read_only",
  delegatedReadWrite: "delegated_read_write"
});

export const WITNESS_WORKER_SCRATCH_STATE = Object.freeze({
  none: "none",
  workerLocal: "worker-local",
  rustStaged: "rust-staged"
});

export const WITNESS_WORKER_OPERATION_PROFILES = Object.freeze({
  [WITNESS_WORKER_OPERATIONS.build]: Object.freeze({
    operation: WITNESS_WORKER_OPERATIONS.build,
    workerClass: "node-build-worker",
    canonicalStateAccess: WITNESS_WORKER_CANONICAL_STATE_ACCESS.none,
    scratchState: WITNESS_WORKER_SCRATCH_STATE.workerLocal
  }),
  [WITNESS_WORKER_OPERATIONS.evaluate]: Object.freeze({
    operation: WITNESS_WORKER_OPERATIONS.evaluate,
    workerClass: "node-evaluate-worker",
    canonicalStateAccess: WITNESS_WORKER_CANONICAL_STATE_ACCESS.delegatedReadOnly,
    scratchState: WITNESS_WORKER_SCRATCH_STATE.workerLocal
  }),
  [WITNESS_WORKER_OPERATIONS.render]: Object.freeze({
    operation: WITNESS_WORKER_OPERATIONS.render,
    workerClass: "node-render-worker",
    canonicalStateAccess: WITNESS_WORKER_CANONICAL_STATE_ACCESS.delegatedReadOnly,
    scratchState: WITNESS_WORKER_SCRATCH_STATE.workerLocal
  }),
  [WITNESS_WORKER_OPERATIONS.inspect]: Object.freeze({
    operation: WITNESS_WORKER_OPERATIONS.inspect,
    workerClass: "node-inspect-worker",
    canonicalStateAccess: WITNESS_WORKER_CANONICAL_STATE_ACCESS.delegatedReadOnly,
    scratchState: WITNESS_WORKER_SCRATCH_STATE.workerLocal
  }),
  [WITNESS_WORKER_OPERATIONS.boundedCompute]: Object.freeze({
    operation: WITNESS_WORKER_OPERATIONS.boundedCompute,
    workerClass: "node-bounded-compute-worker",
    canonicalStateAccess: WITNESS_WORKER_CANONICAL_STATE_ACCESS.none,
    scratchState: WITNESS_WORKER_SCRATCH_STATE.workerLocal
  })
});

function cloneJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function normalizeOperation(operation) {
  const trimmed = String(operation || "").trim();
  if (!trimmed) return WITNESS_WORKER_OPERATIONS.build;
  return Object.values(WITNESS_WORKER_OPERATIONS).includes(trimmed)
    ? trimmed
    : WITNESS_WORKER_OPERATIONS.build;
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings)
    ? warnings.map(entry => String(entry ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeRequestId(requestId) {
  const trimmed = String(requestId || "").trim();
  return trimmed || null;
}

function validCanonicalStateAccess(value) {
  return Object.values(WITNESS_WORKER_CANONICAL_STATE_ACCESS).includes(value);
}

function validScratchState(value) {
  return Object.values(WITNESS_WORKER_SCRATCH_STATE).includes(value);
}

export function getWorkerOperationProfile(operation) {
  return WITNESS_WORKER_OPERATION_PROFILES[normalizeOperation(operation)] ?? WITNESS_WORKER_OPERATION_PROFILES[WITNESS_WORKER_OPERATIONS.build];
}

function normalizeMetadata(operation, metadata) {
  const profile = getWorkerOperationProfile(operation);
  const merged = {
    workerClass: profile.workerClass,
    canonicalStateAccess: profile.canonicalStateAccess,
    scratchState: profile.scratchState,
    ...(metadata && typeof metadata === "object" ? cloneJson(metadata) : {})
  };
  if (!validCanonicalStateAccess(merged.canonicalStateAccess)) {
    merged.canonicalStateAccess = profile.canonicalStateAccess;
  }
  if (!validScratchState(merged.scratchState)) {
    merged.scratchState = profile.scratchState;
  }
  if (typeof merged.workerClass !== "string" || !merged.workerClass.trim()) {
    merged.workerClass = profile.workerClass;
  }
  return merged;
}

function createWorkerEnvelope({
  kind,
  operation,
  requestId = null,
  payload = null,
  error = null,
  warnings = [],
  metadata = null,
  ok = null,
  eventName = null
} = {}) {
  const normalizedOperation = normalizeOperation(operation);
  const envelope = {
    protocol: WITNESS_WORKER_PROTOCOL_VERSION,
    kind,
    operation: normalizedOperation,
    requestId: normalizeRequestId(requestId),
    payload: cloneJson(payload),
    metadata: normalizeMetadata(normalizedOperation, metadata)
  };
  if (kind === WITNESS_WORKER_KINDS.result) {
    const normalizedError = error == null
      ? null
      : (typeof error === "string"
        ? { message: error }
        : {
            message: String(error.message || error.error || "worker operation failed"),
            code: error.code ? String(error.code) : null
          });
    envelope.ok = ok === true;
    envelope.error = normalizedError;
    envelope.warnings = normalizeWarnings(warnings);
  }
  if (kind === WITNESS_WORKER_KINDS.event) {
    const trimmedEventName = String(eventName || "").trim();
    envelope.eventName = trimmedEventName || "progress";
  }
  return envelope;
}

export function createWorkerRequestEnvelope({
  operation,
  requestId = null,
  payload = null,
  metadata = null
} = {}) {
  return createWorkerEnvelope({
    kind: WITNESS_WORKER_KINDS.request,
    operation,
    requestId,
    payload,
    metadata
  });
}

export function createWorkerResultEnvelope({
  operation,
  requestId = null,
  ok,
  payload = null,
  error = null,
  warnings = [],
  metadata = null
} = {}) {
  return createWorkerEnvelope({
    kind: WITNESS_WORKER_KINDS.result,
    operation,
    requestId,
    ok,
    payload,
    error,
    warnings,
    metadata
  });
}

export function createWorkerEventEnvelope({
  operation,
  requestId = null,
  eventName = null,
  payload = null,
  metadata = null
} = {}) {
  return createWorkerEnvelope({
    kind: WITNESS_WORKER_KINDS.event,
    operation,
    requestId,
    eventName,
    payload,
    metadata
  });
}

export function createBuildWorkerResultEnvelope(result, {
  requestId = null,
  warnings = []
} = {}) {
  const payload = result && typeof result === "object"
    ? { ...result }
    : { ok: false, error: "build worker result missing" };
  const envelope = createWorkerResultEnvelope({
    operation: WITNESS_WORKER_OPERATIONS.build,
    requestId,
    ok: payload.ok === true,
    payload,
    error: payload.ok === true ? null : payload.error || "build worker failed",
    warnings
  });
  return envelope;
}

export function parseWorkerEnvelope(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.protocol !== WITNESS_WORKER_PROTOCOL_VERSION) return null;
  if (!Object.values(WITNESS_WORKER_KINDS).includes(parsed.kind)) return null;
  if (!Object.values(WITNESS_WORKER_OPERATIONS).includes(parsed.operation)) return null;
  if (!parsed.metadata || typeof parsed.metadata !== "object") return null;
  if (!validCanonicalStateAccess(parsed.metadata.canonicalStateAccess)) return null;
  if (!validScratchState(parsed.metadata.scratchState)) return null;
  if (typeof parsed.metadata.workerClass !== "string" || !parsed.metadata.workerClass.trim()) return null;
  if (parsed.kind === WITNESS_WORKER_KINDS.event) {
    if (typeof parsed.eventName !== "string" || !parsed.eventName.trim()) return null;
  }
  return parsed;
}
