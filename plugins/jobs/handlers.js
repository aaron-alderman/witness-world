import { relation } from "../../src/kernel.js";

export function createJobsQueueHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget
}) {
  return {
    "jobs.queue.enqueue": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "jobs.queue.enqueue.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const queued = appContext?.jobs?.enqueue({
        actor: requestActor,
        handler: body.handler,
        payload: body.payload,
        delayMs: body.delayMs,
        idempotencyKey: body.idempotencyKey,
        maxAttempts: body.maxAttempts,
        retryDelayMs: body.retryDelayMs
      });
      if (!queued?.ok) {
        world.emit({
          process: "jobs.queue.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: queued?.reason || "queue unavailable",
            handler: typeof body.handler === "string" ? body.handler : null,
            idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null
          }
        });
        sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
        return;
      }
      sendJson(res, queued.status || 201, { created: queued.created === true, job: queued.job, witness: queued.witness });
    },

    "jobs.queue.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const jobs = appContext?.jobs?.list?.() ?? [];
      world.observe({
        process: "jobs.queue.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:jobs`)],
        body: { serverRunner: serverRunnerId, count: jobs.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, jobs });
    },

    "jobs.queue.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["jobs.queue"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "jobs.queue.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const job = appContext?.jobs?.get?.(params.id || "") ?? null;
      if (!job) {
        world.observe({ process: "jobs.queue.read.failed", actor: requestActor, claims: [], body: { reason: "job not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "job not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "jobs.queue.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", job.id)],
        body: { serverRunner: serverRunnerId, id: job.id, status: job.status }
      });
      sendJson(res, 200, { job });
    }
  };
}
