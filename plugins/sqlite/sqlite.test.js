import test from "node:test";
import assert from "node:assert/strict";
import { bundleId, handlerCatalog, routes, createHandlers } from "./runtime.js";

test("sqlite plugin owns DB SQL bundle catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-sqlite");
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.query"), true);
  assert.equal(routes.some(route => route.handler === "db.sql.query"), true);
  assert.equal(typeof createHandlers, "function");
});
