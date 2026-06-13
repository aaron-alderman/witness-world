import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes, createHandlers } from "./runtime.js";

test("jobs plugin owns jobs.queue bundle catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-jobs");
  assert.equal(handlerCatalog.dispatchHandlers.includes("jobs.queue.enqueue"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("jobs.queue.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("jobs.queue.read"), true);
  assert.equal(routes.some(route => route.handler === "jobs.queue.enqueue"), true);
  assert.equal(typeof createHandlers, "function");
});

test("jobs plugin registers jobs queue read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "job.demo" });
  world.emit({
    process: "defineJob",
    actor: "system",
    claims: [
      relation("job.demo", "hasModuleKind", "job"),
      relation("job.demo", "hasTitle", "Demo Job")
    ],
    body: { id: "job.demo" }
  });
  world.emit({
    process: "jobs.queue.enqueue",
    actor: "system",
    body: {
      id: "job.demo",
      serverRunner: "runner.demo",
      handler: "notify.email.deliver",
      actor: "system",
      payload: { notification: "notification.demo" },
      idempotencyKey: "idem-1",
      maxAttempts: 3,
      retryDelayMs: 500,
      createdAt: "2026-06-13T00:00:00.000Z"
    }
  });
  world.emit({
    process: "jobs.queue.start",
    actor: "system",
    body: {
      id: "job.demo",
      attempt: 1
    }
  });

  assert.deepEqual(world.project(moduleProjectors.jobs), [{
    id: "job.demo",
    title: "Demo Job",
    owner: "system",
    serverRunner: "runner.demo",
    handler: "notify.email.deliver",
    actor: "system",
    payload: { notification: "notification.demo" },
    status: "running",
    availableAt: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    completedAt: null,
    idempotencyKey: "idem-1",
    maxAttempts: 3,
    retryDelayMs: 500,
    attempt: 1,
    lastError: null
  }]);
  assert.equal(world.project(moduleProjectors.jobIndex).byId["job.demo"].status, "running");
}));
