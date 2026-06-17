import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes, createHandlers } from "./runtime.js";

test("sqlite plugin owns DB SQL bundle catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-sqlite");
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.query"), true);
  assert.equal(routes.some(route => route.handler === "db.sql.query"), true);
  assert.equal(typeof createHandlers, "function");
});

test("sqlite plugin registers DB SQL read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "db.main" });
  world.emit({
    process: "defineSqlDatasource",
    actor: "system",
    claims: [
      relation("db.main", "hasModuleKind", "sqlDatasource"),
      relation("db.main", "hasTitle", "Main Database")
    ],
    body: { id: "db.main" }
  });
  world.emit({
    process: "db.sql.datasource.configured",
    actor: "system",
    body: {
      id: "db.main",
      serverRunner: "runner.demo",
      provider: "sqlite",
      datasourceName: "main",
      path: "runtime/db.sqlite"
    }
  });
  world.emit({
    process: "db.sql.query",
    actor: "system",
    body: {
      id: "op.query.1",
      serverRunner: "runner.demo",
      datasourceId: "db.main",
      datasourceName: "main",
      provider: "sqlite",
      kind: "query",
      rowCount: 2
    }
  });

  assert.deepEqual(world.project(moduleProjectors.sqlOperations), [{
    id: "op.query.1",
    title: "op.query.1",
    owner: null,
    context: null,
    serverRunner: "runner.demo",
    datasourceId: "db.main",
    datasourceName: "main",
    provider: "sqlite",
    kind: "query",
    status: "succeeded",
    rowCount: 2,
    changes: 0,
    lastInsertRowid: 0,
    migrationCount: 0,
    skippedCount: 0,
    stepCount: 0,
    lastError: null
  }]);

  assert.deepEqual(world.project(moduleProjectors.sqlDatasources), [{
    id: "db.main",
    title: "Main Database",
    owner: "system",
    context: null,
    serverRunner: "runner.demo",
    provider: "sqlite",
    datasourceName: "main",
    host: null,
    port: null,
    database: null,
    user: null,
    passwordSecretId: null,
    ssl: false,
    migrationTable: null,
    path: "runtime/db.sqlite",
    adapterStatus: null,
    status: "configured",
    lastTestAt: null,
    lastTestResult: null,
    lastError: null,
    operationCount: 1
  }]);
}));
