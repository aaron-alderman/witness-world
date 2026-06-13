import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

export function jobs(witnesses) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const modules = moduleProjectors.modules(witnesses);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "job") continue;
    rows.set(id, {
      id,
      title: titles.get(id) ?? id,
      owner: owners.get(id) ?? null,
      serverRunner: null,
      handler: null,
      actor: null,
      payload: null,
      status: "queued",
      availableAt: null,
      createdAt: null,
      completedAt: null,
      idempotencyKey: null,
      maxAttempts: null,
      retryDelayMs: null,
      attempt: 0,
      lastError: null
    });
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("jobs.queue.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? {
      id,
      title: titles.get(id) ?? id,
      owner: owners.get(id) ?? null,
      serverRunner: null,
      handler: null,
      actor: null,
      payload: null,
      status: "queued",
      availableAt: null,
      createdAt: null,
      completedAt: null,
      idempotencyKey: null,
      maxAttempts: null,
      retryDelayMs: null,
      attempt: 0,
      lastError: null
    };
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.handler = typeof witness.body.handler === "string" ? witness.body.handler : row.handler;
    row.actor = typeof witness.body.actor === "string" ? witness.body.actor : row.actor;
    row.title = titles.get(id) ?? row.handler ?? row.title;
    if (Object.prototype.hasOwnProperty.call(witness.body, "payload")) row.payload = witness.body.payload;
    row.idempotencyKey = typeof witness.body.idempotencyKey === "string" ? witness.body.idempotencyKey : row.idempotencyKey;
    row.maxAttempts = Number.isFinite(witness.body.maxAttempts) ? witness.body.maxAttempts : row.maxAttempts;
    row.retryDelayMs = Number.isFinite(witness.body.retryDelayMs) ? witness.body.retryDelayMs : row.retryDelayMs;
    if (Number.isFinite(witness.body.attempt)) row.attempt = witness.body.attempt;
    if (typeof witness.body.availableAt === "string") row.availableAt = witness.body.availableAt;
    if (typeof witness.body.nextAvailableAt === "string") row.availableAt = witness.body.nextAvailableAt;
    if (typeof witness.body.createdAt === "string") row.createdAt = witness.body.createdAt;
    if (typeof witness.body.completedAt === "string") row.completedAt = witness.body.completedAt;
    if (typeof witness.body.reason === "string") row.lastError = witness.body.reason;

    if (witness.process === "jobs.queue.enqueue") row.status = "queued";
    if (witness.process === "jobs.queue.start") row.status = "running";
    if (witness.process === "jobs.queue.retry") row.status = "queued";
    if (witness.process === "jobs.queue.succeeded") row.status = "succeeded";
    if (witness.process === "jobs.queue.deadLetter") row.status = "dead-letter";
    rows.set(id, row);
  }

  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function jobIndex(witnesses) {
  const rows = jobs(witnesses);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const jobsModuleProjectors = Object.freeze({
  jobs,
  jobIndex
});
