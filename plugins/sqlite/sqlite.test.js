import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { createDbSqlRuntime } from "./provider-runtime.js";
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

test("sqlite plugin runtime requires witness-core sqlite capability and fails closed when unavailable", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-runtime-unavailable-"));
  const runtime = createDbSqlRuntime({
    runtimeConfig: {},
    runtimeRoot,
    serverRunnerId: "runner.demo"
  });
  try {
    const inspect = runtime.inspect();
    assert.equal(inspect.ok, true);
    assert.equal(inspect.datasource?.adapterStatus, "witness-core-required");
    assert.equal(inspect.datasource?.boundaryOwner, "witness-core");
    assert.equal(inspect.datasource?.boundaryAuthority, "rust-owned");
    assert.equal(inspect.datasource?.boundaryTransport, "capability.db.sqlite");
    assert.equal(inspect.datasource?.boundaryScope, "canonical-runtime");
    assert.equal(inspect.datasource?.canonicalBoundary, true);
    assert.equal(inspect.datasource?.boundaryFallbackAllowed, false);
    assert.equal(inspect.datasource?.boundaryAvailability, "unavailable");
    const result = await runtime.query({ sql: "select 1 as ok" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.match(result.reason, /witness-core sqlite capability required/i);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("sqlite plugin runtime uses witness-core sqlite capability when available", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-runtime-witness-core-"));
  const seen = [];
  const runtime = createDbSqlRuntime({
    runtimeConfig: {},
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async sqliteQuery(input) {
          seen.push({ op: "query", input });
          return { ok: true, rows: [{ ok: 1 }], rowCount: 1 };
        }
      }
    })
  });
  try {
    const inspect = runtime.inspect();
    assert.equal(inspect.ok, true);
    assert.equal(inspect.datasource?.adapterStatus, "witness-core");
    assert.equal(inspect.datasource?.boundaryOwner, "witness-core");
    assert.equal(inspect.datasource?.boundaryAuthority, "rust-owned");
    assert.equal(inspect.datasource?.boundaryTransport, "capability.db.sqlite");
    assert.equal(inspect.datasource?.boundaryScope, "canonical-runtime");
    assert.equal(inspect.datasource?.canonicalBoundary, true);
    const result = await runtime.query({ sql: "select 1 as ok" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [{ ok: 1 }]);
    assert.equal(seen.length, 1);
    assert.match(String(seen[0].input.path || ""), /db[\\/]main\.sqlite$/i);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("sqlite plugin runtime fails closed with structured errors when witness-core sqlite capability is unavailable", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-runtime-witness-core-down-"));
  const runtime = createDbSqlRuntime({
    runtimeConfig: {},
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async sqliteQuery() {
          const error = new Error("witness core unavailable");
          error.status = 503;
          throw error;
        }
      }
    })
  });
  try {
    const result = await runtime.query({ sql: "select 1 as ok" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.match(result.reason, /witness core unavailable/i);
    assert.equal(result.datasource?.adapterStatus, "witness-core-unavailable");
    assert.equal(result.datasource?.boundaryOwner, "witness-core");
    assert.equal(result.datasource?.boundaryAuthority, "rust-owned");
    assert.equal(result.datasource?.boundaryScope, "canonical-runtime");
    assert.equal(result.datasource?.canonicalBoundary, true);
    assert.equal(result.datasource?.boundaryAvailability, "unavailable");
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("sqlite plugin runtime keeps the same rust-owned boundary in canonical app-serving mode", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-runtime-canonical-required-"));
  const runtime = createDbSqlRuntime({
    runtimeConfig: {},
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({
      appRoot: "C:/tmp/app",
      runtimeSupervision: {
        watchersEnabled: false
      }
    })
  });
  try {
    const inspect = runtime.inspect();
    assert.equal(inspect.ok, true);
    assert.equal(inspect.datasource?.adapterStatus, "witness-core-required");
    assert.equal(inspect.datasource?.boundaryOwner, "witness-core");
    assert.equal(inspect.datasource?.boundaryAuthority, "rust-owned");
    assert.equal(inspect.datasource?.boundaryTransport, "capability.db.sqlite");
    assert.equal(inspect.datasource?.boundaryScope, "canonical-runtime");
    assert.equal(inspect.datasource?.canonicalBoundary, true);
    assert.equal(inspect.datasource?.boundaryFallbackAllowed, false);
    assert.equal(inspect.datasource?.boundaryAvailability, "unavailable");

    const result = await runtime.query({ sql: "select 1 as ok" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.match(result.reason, /witness-core sqlite capability required/i);
    assert.equal(result.datasource?.adapterStatus, "witness-core-required");
    assert.equal(result.datasource?.boundaryOwner, "witness-core");
    assert.equal(result.datasource?.boundaryAvailability, "unavailable");
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});
