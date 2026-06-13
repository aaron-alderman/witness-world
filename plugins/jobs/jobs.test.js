import test from "node:test";
import assert from "node:assert/strict";
import { bundleId, handlerCatalog, routes, createHandlers } from "./runtime.js";

test("jobs plugin owns jobs.queue bundle catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-jobs");
  assert.equal(handlerCatalog.dispatchHandlers.includes("jobs.queue.enqueue"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("jobs.queue.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("jobs.queue.read"), true);
  assert.equal(routes.some(route => route.handler === "jobs.queue.enqueue"), true);
  assert.equal(typeof createHandlers, "function");
});
