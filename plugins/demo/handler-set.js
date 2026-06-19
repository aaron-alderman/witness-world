import { relation } from "../../src/kernel.js";
import { publicWitnessesFor } from "./projections.js";

export const DEMO_HANDLER_SET_DEFINITION = Object.freeze({
  handlers: Object.freeze([]),
  jobHandlers: Object.freeze([
    "demo.echo",
    "demo.failOnce",
    "demo.alwaysFail"
  ])
});

export const DEMO_HANDLER_SET_PROVIDER = Object.freeze({
  kind: "handlerSet",
  id: "demo",
  definition: DEMO_HANDLER_SET_DEFINITION,
  factory: createDemoHandlerSet
});

export async function createDemoHandlerSet({
  world,
  backendHost,
  actors
}) {
  const failOnceAttempts = new Map();

  return {
    actors,
    visibleWitnesses: requestActor => publicWitnessesFor(world.allWitnesses(), requestActor),
    jobHandlers: {
      "demo.echo": async ({ actor, job, payload }) => {
        world.emit({
          process: "demo.job.echo",
          actor: actor || backendHost,
          claims: [relation(job.id, "processedBy", "demo.echo")],
          body: { job: job.id, payload: payload ?? null }
        });
        return { echoed: true };
      },

      "demo.failOnce": async ({ actor, job, payload, attempt }) => {
        const key = typeof payload?.key === "string" && payload.key.trim() ? payload.key.trim() : job.id;
        const seen = failOnceAttempts.get(key) ?? 0;
        failOnceAttempts.set(key, seen + 1);
        if (!seen) {
          world.emit({
            process: "demo.job.failOnce.attempt",
            actor: actor || backendHost,
            claims: [],
            body: { job: job.id, key, attempt, outcome: "fail" }
          });
          throw new Error("demo fail once");
        }
        world.emit({
          process: "demo.job.failOnce.attempt",
          actor: actor || backendHost,
          claims: [],
          body: { job: job.id, key, attempt, outcome: "succeed" }
        });
        return { recovered: true };
      },

      "demo.alwaysFail": async ({ actor, job, attempt }) => {
        world.emit({
          process: "demo.job.alwaysFail.attempt",
          actor: actor || backendHost,
          claims: [],
          body: { job: job.id, attempt }
        });
        throw new Error("demo always fails");
      }
    },
    handlers: {}
  };
}

