import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

function defaultOutboundRequestRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    target: null,
    url: null,
    method: "GET",
    transport: null,
    status: "pending",
    authKind: null,
    authConfigKey: null,
    requestHeaderNames: [],
    requestBodyKind: "none",
    timeoutMs: null,
    maxAttempts: null,
    retryDelayMs: null,
    attempt: 0,
    correlationId: null,
    externalRefId: null,
    responseStatus: null,
    responseContentType: null,
    lastError: null
  };
}

export function outboundRequests(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "outboundRequest") continue;
    rows.set(id, defaultOutboundRequestRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("http.outbound.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultOutboundRequestRow(id, { titles, owners, contexts });
    row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.target = typeof witness.body.target === "string" ? witness.body.target : row.target;
    row.url = typeof witness.body.url === "string" ? witness.body.url : row.url;
    row.method = typeof witness.body.method === "string" ? witness.body.method : row.method;
    row.transport = typeof witness.body.transport === "string" ? witness.body.transport : row.transport;
    row.authKind = typeof witness.body.authKind === "string" ? witness.body.authKind : row.authKind;
    row.authConfigKey = typeof witness.body.authConfigKey === "string" ? witness.body.authConfigKey : row.authConfigKey;
    row.requestHeaderNames = Array.isArray(witness.body.requestHeaderNames)
      ? witness.body.requestHeaderNames.map(value => String(value))
      : row.requestHeaderNames;
    row.requestBodyKind = typeof witness.body.requestBodyKind === "string" ? witness.body.requestBodyKind : row.requestBodyKind;
    row.timeoutMs = Number.isFinite(witness.body.timeoutMs) ? witness.body.timeoutMs : row.timeoutMs;
    row.maxAttempts = Number.isFinite(witness.body.maxAttempts) ? witness.body.maxAttempts : row.maxAttempts;
    row.retryDelayMs = Number.isFinite(witness.body.retryDelayMs) ? witness.body.retryDelayMs : row.retryDelayMs;
    row.attempt = Number.isFinite(witness.body.attempt) ? witness.body.attempt : row.attempt;
    row.correlationId = typeof witness.body.correlationId === "string" ? witness.body.correlationId : row.correlationId;
    row.externalRefId = typeof witness.body.externalRefId === "string" ? witness.body.externalRefId : row.externalRefId;
    row.responseStatus = Number.isFinite(witness.body.responseStatus) ? witness.body.responseStatus : row.responseStatus;
    row.responseContentType = typeof witness.body.responseContentType === "string" ? witness.body.responseContentType : row.responseContentType;
    row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
    if (witness.process === "http.outbound.request") row.status = "pending";
    if (witness.process === "http.outbound.attempt") row.status = "running";
    if (witness.process === "http.outbound.retry") row.status = "retrying";
    if (witness.process === "http.outbound.succeeded") row.status = "succeeded";
    if (witness.process === "http.outbound.failed") row.status = "failed";
    row.title = titles.get(id) ?? row.target ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function outboundRequestIndex(witnesses, options = {}) {
  const rows = outboundRequests(witnesses, options);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const httpOutboundModuleProjectors = Object.freeze({
  outboundRequests,
  outboundRequestIndex
});
