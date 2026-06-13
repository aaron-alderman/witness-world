import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { providers as jobProviders } from "../jobs/runtime.js";
import { bundleId, handlerCatalog, providers, routes, createHandlers } from "./runtime.js";

test("notifications plugin owns notify and notification catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-notifications");
  assert.equal(handlerCatalog.dispatchHandlers.includes("notify.email.enqueue"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("notify.sms.enqueue"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("notifications.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("notifications.read"), true);
  assert.equal(routes.some(route => route.handler === "notify.email.enqueue"), true);
  assert.equal(routes.some(route => route.handler === "notifications.read"), true);
  assert.equal(typeof createHandlers, "function");
});

test("notifications plugin registers notification read-model projectors", () => withRegisteredPluginProjectors([jobProviders, providers], () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "notification.demo" });
  world.emit({
    process: "defineNotification",
    actor: "system",
    claims: [
      relation("notification.demo", "hasModuleKind", "notification"),
      relation("notification.demo", "hasTitle", "Demo Notification")
    ],
    body: { id: "notification.demo" }
  });
  world.emit({
    process: "jobs.queue.succeeded",
    actor: "system",
    body: {
      id: "job.notification.demo",
      attempt: 2,
      maxAttempts: 3,
      retryDelayMs: 500
    }
  });
  world.emit({
    process: "notify.email.enqueue",
    actor: "system",
    body: {
      id: "notification.demo",
      context: "ctx.demo",
      to: "user@example.com",
      subject: "Hello",
      sender: "noreply@example.com",
      template: "welcome",
      vars: { name: "Ada" },
      text: "Hello Ada",
      transport: "stub",
      jobId: "job.notification.demo"
    }
  });

  assert.deepEqual(world.project(moduleProjectors.notifications), [{
    id: "notification.demo",
    title: "Demo Notification",
    owner: "system",
    context: "ctx.demo",
    channel: "email",
    recipient: "user@example.com",
    subject: "Hello",
    sender: "noreply@example.com",
    template: "welcome",
    vars: { name: "Ada" },
    text: "Hello Ada",
    preview: null,
    transport: "stub",
    jobId: "job.notification.demo",
    status: "sent",
    providerMessageId: null,
    lastError: null,
    attempt: 2,
    maxAttempts: 3,
    retryDelayMs: 500
  }]);
  assert.equal(world.project(moduleProjectors.notificationIndex).byId["notification.demo"].status, "sent");
}));
