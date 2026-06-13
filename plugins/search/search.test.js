import test from "node:test";
import assert from "node:assert/strict";
import { bundleId, handlerCatalog, routes, createHandlers } from "./runtime.js";

test("search plugin owns search.index bundle catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-search");
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.inspect"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.build"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.reindex"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.query"), true);
  assert.equal(routes.some(route => route.handler === "search.index.query"), true);
  assert.equal(typeof createHandlers, "function");
});
