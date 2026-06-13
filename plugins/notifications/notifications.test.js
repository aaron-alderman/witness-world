import test from "node:test";
import assert from "node:assert/strict";
import { bundleId, handlerCatalog, routes, createHandlers } from "./runtime.js";

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
