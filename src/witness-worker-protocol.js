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

function cloneJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function normalizeOperation(operation) {
  const trimmed = String(operation || "").trim();
  return trimmed || WITNESS_WORKER_OPERATIONS.build;
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings)
    ? warnings.map(entry => String(entry ?? "").trim()).filter(Boolean)
    : [];
}

export function createWorkerResultEnvelope({
  operation,
  ok,
  payload = null,
  error = null,
  warnings = [],
  metadata = null
} = {}) {
  const normalizedError = error == null
    ? null
    : (typeof error === "string"
      ? { message: error }
      : {
          message: String(error.message || error.error || "worker operation failed"),
          code: error.code ? String(error.code) : null
        });
  return {
    protocol: WITNESS_WORKER_PROTOCOL_VERSION,
    kind: WITNESS_WORKER_KINDS.result,
    operation: normalizeOperation(operation),
    ok: ok === true,
    payload: cloneJson(payload),
    error: normalizedError,
    warnings: normalizeWarnings(warnings),
    metadata: metadata && typeof metadata === "object" ? cloneJson(metadata) : null
  };
}

export function createBuildWorkerResultEnvelope(result, {
  warnings = []
} = {}) {
  const payload = result && typeof result === "object"
    ? { ...result }
    : { ok: false, error: "build worker result missing" };
  const envelope = createWorkerResultEnvelope({
    operation: WITNESS_WORKER_OPERATIONS.build,
    ok: payload.ok === true,
    payload,
    error: payload.ok === true ? null : payload.error || "build worker failed",
    warnings,
    metadata: {
      workerClass: "node-build-worker",
      canonicalStateAccess: "none",
      scratchState: "worker-local"
    }
  });
  return envelope;
}

export function parseWorkerEnvelope(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.protocol !== WITNESS_WORKER_PROTOCOL_VERSION) return null;
  if (!Object.values(WITNESS_WORKER_KINDS).includes(parsed.kind)) return null;
  return parsed;
}
