import { randomUUID } from "node:crypto";
import { relation, thing } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { isoAt, nonNegativeInteger, positiveInteger, runtimeConfigLookup } from "../../src/runtime-config-utils.js";
function parseIsoAt(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJobQueueConfig(runtimeConfig) {
  return {
    pollMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.pollMs"), 25),
    maxAttempts: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.maxAttempts"), 3),
    retryDelayMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.retryDelayMs"), 50)
  };
}

export function createInProcessJobQueue({
  world,
  project = projector => world.project(projector),
  serverRunnerId,
  runtimeConfig = {},
  jobHandlers = {},
  getAppContext
}) {
  const config = normalizeJobQueueConfig(runtimeConfig);
  const activeJobs = new Set();
  let closed = false;

  const list = () => project(moduleProjectors.jobs)
    .filter(row => row.serverRunner === serverRunnerId)
    .sort((a, b) => {
      const left = parseIsoAt(a.availableAt) ?? 0;
      const right = parseIsoAt(b.availableAt) ?? 0;
      if (left !== right) return left - right;
      return String(a.id).localeCompare(String(b.id));
    });

  const get = id => list().find(row => row.id === id) ?? null;

  const enqueue = ({
    actor,
    handler,
    payload = {},
    delayMs = 0,
    idempotencyKey = null,
    maxAttempts = config.maxAttempts,
    retryDelayMs = config.retryDelayMs
  } = {}) => {
    const name = typeof handler === "string" ? handler.trim() : "";
    if (!name) return { ok: false, status: 400, reason: "handler required" };
    if (!jobHandlers[name]) return { ok: false, status: 400, reason: "unknown job handler", handler: name };
    const safePayload = payload === undefined ? null : payload;
    const safeDelayMs = nonNegativeInteger(delayMs, 0);
    const safeMaxAttempts = positiveInteger(maxAttempts, config.maxAttempts);
    const safeRetryDelayMs = positiveInteger(retryDelayMs, config.retryDelayMs);
    const safeKey = typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : null;

    if (safeKey) {
      const existing = list().find(row => row.idempotencyKey === safeKey && row.handler === name);
      if (existing) return { ok: true, status: 200, created: false, job: existing, witness: null };
    }

    const id = `job_${randomUUID()}`;
    const createdAt = isoAt(Date.now());
    const availableAt = isoAt(Date.now() + safeDelayMs);
    const witness = world.emit({
      process: "jobs.queue.enqueue",
      actor: actor || serverRunnerId,
      claims: [
        thing(id),
        relation(id, "hasModuleKind", "job"),
        relation(id, "hasTitle", name),
        relation(actor || serverRunnerId, "owns", id)
      ],
      body: {
        id,
        serverRunner: serverRunnerId,
        actor: actor || null,
        handler: name,
        payload: safePayload,
        createdAt,
        availableAt,
        delayMs: safeDelayMs,
        idempotencyKey: safeKey,
        maxAttempts: safeMaxAttempts,
        retryDelayMs: safeRetryDelayMs
      }
    });
    return { ok: true, status: 201, created: true, job: get(id), witness };
  };

  const execute = async job => {
    const current = get(job.id);
    if (!current || current.status !== "queued") return;
    const handler = jobHandlers[current.handler];
    const attempt = (current.attempt || 0) + 1;
    world.emit({
      process: "jobs.queue.start",
      actor: current.actor || serverRunnerId,
      claims: [relation(serverRunnerId, "runs", current.id)],
      body: {
        id: current.id,
        serverRunner: serverRunnerId,
        actor: current.actor || null,
        handler: current.handler,
        attempt,
        payload: current.payload ?? null,
        maxAttempts: current.maxAttempts,
        retryDelayMs: current.retryDelayMs
      }
    });
    if (!handler) {
      world.emit({
        process: "jobs.queue.deadLetter",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          completedAt: isoAt(Date.now()),
          reason: "unknown job handler"
        }
      });
      return;
    }
    try {
      await handler({
        world,
        actor: current.actor || serverRunnerId,
        appContext: getAppContext(),
        job: current,
        payload: current.payload ?? null,
        attempt
      });
      world.emit({
        process: "jobs.queue.succeeded",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          completedAt: isoAt(Date.now())
        }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt >= (current.maxAttempts || config.maxAttempts)) {
        world.emit({
          process: "jobs.queue.deadLetter",
          actor: current.actor || serverRunnerId,
          claims: [],
          body: {
            id: current.id,
            serverRunner: serverRunnerId,
            actor: current.actor || null,
            handler: current.handler,
            attempt,
            maxAttempts: current.maxAttempts,
            retryDelayMs: current.retryDelayMs,
            completedAt: isoAt(Date.now()),
            reason
          }
        });
        return;
      }
      const delayMs = (current.retryDelayMs || config.retryDelayMs) * (2 ** Math.max(0, attempt - 1));
      world.emit({
        process: "jobs.queue.retry",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          reason,
          delayMs,
          nextAvailableAt: isoAt(Date.now() + delayMs)
        }
      });
    }
  };

  const tick = async () => {
    if (closed) return;
    for (const job of list()) {
      if (job.status !== "queued") continue;
      const availableAt = parseIsoAt(job.availableAt);
      if (availableAt == null || availableAt > Date.now()) continue;
      if (activeJobs.has(job.id)) continue;
      activeJobs.add(job.id);
      try {
        await execute(job);
      } finally {
        activeJobs.delete(job.id);
      }
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, config.pollMs);
  interval.unref?.();
  void tick();

  return {
    config,
    enqueue,
    list,
    get,
    close: () => {
      closed = true;
      clearInterval(interval);
    }
  };
}
