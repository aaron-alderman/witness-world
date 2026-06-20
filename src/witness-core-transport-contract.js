export const WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION = "witness-core-transport/v1";

export const WITNESS_CORE_TRANSPORT_MESSAGE_KINDS = Object.freeze({
  call: "call",
  result: "result",
  subscribe: "subscribe",
  event: "event"
});

export const WITNESS_CORE_TRANSPORT_METHODS = Object.freeze({
  generationPublish: "generation.publish",
  sourceRead: "source.read",
  sourceStat: "source.stat",
  sourceList: "source.list",
  sourceWrite: "source.write",
  sourcePatch: "source.patch",
  verificationPersistenceRequest: "verification.persistence.request",
  httpOutboundExecute: "network.http_outbound.execute",
  sqliteTestConnection: "db.sqlite.test_connection",
  sqliteMigrate: "db.sqlite.migrate",
  sqliteQuery: "db.sqlite.query",
  sqliteCommand: "db.sqlite.command",
  sqliteTransaction: "db.sqlite.transaction",
  sqlTestConnection: "db.sql.test_connection",
  sqlReadOrderedBatch: "db.sql.read_ordered_batch",
  sqlWriteRows: "db.sql.write_rows",
  publishedAuthoringTransaction: "transaction.published_authoring",
  previewSessionCreate: "preview_session.create",
  previewSessionRead: "preview_session.read",
  previewSessionWrite: "preview_session.write",
  previewSessionDelete: "preview_session.delete",
  generationPromote: "generation.promote",
  generationRollback: "generation.rollback",
  computeModuleShadowInvoke: "compute_module.shadow_invoke",
  servingRead: "serving.read",
  servingRequestLive: "serving.request_live",
  servingRequestStable: "serving.request_stable",
  soakRead: "soak.read",
  soakStart: "soak.start",
  soakMark: "soak.mark",
  soakSample: "soak.sample",
  soakComplete: "soak.complete",
  soakFail: "soak.fail",
  statusReadGenerations: "status.read_generations",
  statusReadHealth: "status.read_health",
  statusReadServing: "status.read_serving"
});

export const WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS = Object.freeze({
  coreEvents: "core.events"
});

function cloneJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function normalizeRequestId(requestId) {
  const trimmed = String(requestId || "").trim();
  return trimmed || null;
}

function validMessageKind(value) {
  return Object.values(WITNESS_CORE_TRANSPORT_MESSAGE_KINDS).includes(value);
}

function validMethod(value) {
  return Object.values(WITNESS_CORE_TRANSPORT_METHODS).includes(value);
}

function validChannel(value) {
  return Object.values(WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS).includes(value);
}

export function createWitnessCoreTransportCall({
  method,
  requestId = null,
  args = null
} = {}) {
  const normalizedMethod = String(method || "").trim();
  if (!validMethod(normalizedMethod)) {
    throw new Error(`unknown witness-core transport method: ${normalizedMethod || "(empty)"}`);
  }
  return {
    protocol: WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
    kind: WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.call,
    method: normalizedMethod,
    requestId: normalizeRequestId(requestId),
    args: cloneJson(args)
  };
}

export function createWitnessCoreTransportResult({
  method,
  requestId = null,
  ok,
  payload = null,
  error = null
} = {}) {
  const normalizedMethod = String(method || "").trim();
  if (!validMethod(normalizedMethod)) {
    throw new Error(`unknown witness-core transport method: ${normalizedMethod || "(empty)"}`);
  }
  const normalizedError = error == null
    ? null
    : (typeof error === "string"
      ? { message: error }
      : {
          message: String(error.message || error.error || "transport call failed"),
          code: error.code ? String(error.code) : null
        });
  return {
    protocol: WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
    kind: WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.result,
    method: normalizedMethod,
    requestId: normalizeRequestId(requestId),
    ok: ok === true,
    payload: cloneJson(payload),
    error: normalizedError
  };
}

export function createWitnessCoreTransportSubscribe({
  channel,
  requestId = null,
  args = null
} = {}) {
  const normalizedChannel = String(channel || "").trim();
  if (!validChannel(normalizedChannel)) {
    throw new Error(`unknown witness-core transport subscription: ${normalizedChannel || "(empty)"}`);
  }
  return {
    protocol: WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
    kind: WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.subscribe,
    channel: normalizedChannel,
    requestId: normalizeRequestId(requestId),
    args: cloneJson(args)
  };
}

export function createWitnessCoreTransportEvent({
  channel,
  requestId = null,
  eventName = null,
  payload = null
} = {}) {
  const normalizedChannel = String(channel || "").trim();
  if (!validChannel(normalizedChannel)) {
    throw new Error(`unknown witness-core transport subscription: ${normalizedChannel || "(empty)"}`);
  }
  const normalizedEventName = String(eventName || "").trim() || "message";
  return {
    protocol: WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
    kind: WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.event,
    channel: normalizedChannel,
    requestId: normalizeRequestId(requestId),
    eventName: normalizedEventName,
    payload: cloneJson(payload)
  };
}

export function parseWitnessCoreTransportMessage(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.protocol !== WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION) return null;
  if (!validMessageKind(parsed.kind)) return null;
  if (parsed.kind === WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.call || parsed.kind === WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.result) {
    if (!validMethod(parsed.method)) return null;
  }
  if (parsed.kind === WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.subscribe || parsed.kind === WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.event) {
    if (!validChannel(parsed.channel)) return null;
  }
  if (parsed.kind === WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.event) {
    if (typeof parsed.eventName !== "string" || !parsed.eventName.trim()) return null;
  }
  return parsed;
}
