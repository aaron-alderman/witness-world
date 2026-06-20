import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createThing, createWorld, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { createDbSqlRuntime } from "./provider-runtime.js";
import { bundleId, desireExtensions, handlerCatalog, providers } from "./runtime.js";

test("sql plugin exposes datasource CRUD and explicit db.sql operations", () => {
  assert.equal(bundleId, "bundle-sql");
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.datasource.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.datasource.test"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.query"), true);
  assert.deepEqual(desireExtensions.rvmForms.map(entry => entry.kind), ["sql_table"]);
  assert.deepEqual(desireExtensions.runtimeDeclarations.map(entry => entry.kind), ["sql_table"]);
});

test("sql plugin projectors track datasource test state and clear stale errors on success", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "db.main" });
  world.emit({
    process: "db.sql.datasource.create",
    actor: "system",
    claims: [
      relation("db.main", "hasModuleKind", "sqlDatasource"),
      relation("db.main", "hasTitle", "Main Database")
    ],
    body: {
      id: "db.main",
      serverRunner: "runner.demo",
      provider: "postgres",
      datasourceName: "main",
      host: "127.0.0.1",
      port: 5432,
      database: "engentus",
      user: "pipeline_user",
      passwordSecretId: "secret.pg",
      ssl: false,
      migrationTable: "witness_sql_migrations",
      status: "configured",
      adapterStatus: "declared",
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z",
      lastError: "stale"
    }
  });
  world.emit({
    process: "db.sql.datasource.test.failed",
    actor: "system",
    body: {
      id: "db.main",
      serverRunner: "runner.demo",
      provider: "postgres",
      datasourceName: "main",
      status: "failed",
      lastTestAt: "2026-06-17T00:01:00.000Z",
      lastTestResult: "failed",
      reason: "connect ECONNREFUSED"
    }
  });
  world.emit({
    process: "db.sql.datasource.test",
    actor: "system",
    body: {
      id: "db.main",
      serverRunner: "runner.demo",
      provider: "postgres",
      datasourceName: "main",
      status: "ready",
      lastTestAt: "2026-06-17T00:02:00.000Z",
      lastTestResult: "succeeded",
      lastError: null
    }
  });
  world.emit({
    process: "db.sql.query",
    actor: "system",
    claims: [
      relation("op.query.1", "hasModuleKind", "sqlOperation"),
      relation("op.query.1", "usesDatasource", "db.main")
    ],
    body: {
      id: "op.query.1",
      serverRunner: "runner.demo",
      datasourceId: "db.main",
      datasourceName: "main",
      provider: "postgres",
      kind: "query",
      rowCount: 2
    }
  });

  assert.deepEqual(world.project(moduleProjectors.sqlDatasources), [{
    id: "db.main",
    title: "Main Database",
    owner: "system",
    context: null,
    serverRunner: "runner.demo",
    provider: "postgres",
    datasourceName: "main",
    host: "127.0.0.1",
    port: 5432,
    database: "engentus",
    user: "pipeline_user",
    passwordSecretId: "secret.pg",
    ssl: false,
    migrationTable: "witness_sql_migrations",
    path: null,
    adapterStatus: "declared",
    status: "ready",
    lastTestAt: "2026-06-17T00:02:00.000Z",
    lastTestResult: "succeeded",
    lastError: null,
    operationCount: 1
  }]);
}));

test("sql runtime resolves multiple datasources explicitly and uses secret-backed postgres adapters", async () => {
  const rows = [
    {
      id: "sqlite.main",
      serverRunner: "runner.demo",
      provider: "sqlite",
      datasourceName: "main",
      path: "db/main.sqlite",
      migrationTable: "witness_sql_migrations"
    },
    {
      id: "pg.main",
      serverRunner: "runner.demo",
      provider: "postgres",
      datasourceName: "main",
      host: "127.0.0.1",
      port: 5432,
      database: "engentus",
      user: "pipeline_user",
      passwordSecretId: "secret.pg",
      ssl: true
    },
    {
      id: "pg.reporting",
      serverRunner: "runner.demo",
      provider: "postgres",
      datasourceName: "reporting",
      host: "127.0.0.1",
      port: 5433,
      database: "engentus_reporting",
      user: "pipeline_user",
      passwordSecretId: "secret.pg",
      ssl: false
    }
  ];
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  const seenConfigs = [];
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sql-runtime-"));
  const runtime = createDbSqlRuntime({
    project(projector) {
      if (projector === moduleProjectors.sqlDatasources) return rows;
      if (projector === moduleProjectors.sqlDatasourceIndex) return { rows, byId };
      return [];
    },
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({
      secretStore: {
        resolveSecretValue(secretId) {
          return Promise.resolve(secretId === "secret.pg"
            ? { ok: true, value: "super-secret" }
            : { ok: false, status: 404, reason: "secret not found" });
        }
      }
    }),
    postgresAdapter: {
      Client: class {
        constructor(config) {
          seenConfigs.push(config);
        }
        async connect() {}
        async query(sql) {
          assert.equal(sql, "select 1 as ok");
        }
        async end() {}
      }
    }
  });

  try {
    const listed = runtime.listDatasources();
    assert.deepEqual(listed.map(row => row.id), ["sqlite.main", "pg.main", "pg.reporting"]);
    assert.equal(listed[0].boundaryOwner, "node");
    assert.equal(listed[0].boundaryAuthority, "transitional-node-fallback");
    assert.equal(listed[0].boundaryTransport, "node:sqlite");
    assert.equal(listed[0].boundaryFallbackAllowed, true);
    assert.equal((await runtime.testConnection({ datasourceId: "pg.main" })).ok, true);
    assert.equal(seenConfigs.length, 1);
    assert.equal(seenConfigs[0].password, "super-secret");
    assert.deepEqual(seenConfigs[0].ssl, { rejectUnauthorized: false });

    const missing = await runtime.testConnection({ datasourceId: "missing" });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("sql runtime reports sqlite unavailability without crashing when node:sqlite is missing", async () => {
  const rows = [{
    id: "sqlite.main",
    serverRunner: "runner.demo",
    provider: "sqlite",
    datasourceName: "main",
    path: "db/main.sqlite",
    migrationTable: "witness_sql_migrations"
  }];
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sql-runtime-unavailable-"));
  const runtime = createDbSqlRuntime({
    project(projector) {
      if (projector === moduleProjectors.sqlDatasources) return rows;
      if (projector === moduleProjectors.sqlDatasourceIndex) return { rows, byId };
      return [];
    },
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({}),
    loadSqliteModule: async () => {
      throw new Error("No such built-in module: node:sqlite");
    }
  });
  try {
    const result = await runtime.query({ datasourceId: "sqlite.main", sql: "select 1 as ok" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.match(result.reason, /sqlite runtime unavailable/i);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("sql runtime uses witness-core sqlite capability when configured", async () => {
  const rows = [{
    id: "sqlite.main",
    serverRunner: "runner.demo",
    provider: "sqlite",
    datasourceName: "main",
    path: "db/main.sqlite",
    migrationTable: "witness_sql_migrations"
  }];
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sql-runtime-witness-core-"));
  let sqliteLoads = 0;
  const seen = [];
  const runtime = createDbSqlRuntime({
    project(projector) {
      if (projector === moduleProjectors.sqlDatasources) return rows;
      if (projector === moduleProjectors.sqlDatasourceIndex) return { rows, byId };
      return [];
    },
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async sqliteTestConnection(input) {
          seen.push({ op: "testConnection", input });
          return { ok: true };
        },
        async sqliteQuery(input) {
          seen.push({ op: "query", input });
          return { ok: true, rows: [{ ok: 1 }], rowCount: 1 };
        }
      }
    }),
    loadSqliteModule: async () => {
      sqliteLoads += 1;
      throw new Error("node:sqlite should stay unloaded when witness-core handles sqlite");
    }
  });
  try {
    const listed = runtime.listDatasources();
    assert.equal(listed[0].adapterStatus, "witness-core");
    assert.equal(listed[0].boundaryOwner, "witness-core");
    assert.equal(listed[0].boundaryAuthority, "rust-owned");
    assert.equal(listed[0].boundaryTransport, "capability.db.sqlite");
    assert.equal(listed[0].boundaryFallbackAllowed, false);
    const tested = await runtime.testConnection({ datasourceId: "sqlite.main" });
    assert.equal(tested.ok, true);
    assert.equal(tested.datasource?.adapterStatus, "witness-core");
    const queried = await runtime.query({ datasourceId: "sqlite.main", sql: "select 1 as ok" });
    assert.equal(queried.ok, true);
    assert.deepEqual(queried.rows, [{ ok: 1 }]);
    assert.deepEqual(seen.map(entry => entry.op), ["testConnection", "query"]);
    assert.match(String(seen[0].input.path || ""), /db[\\/]main\.sqlite$/i);
    assert.equal(sqliteLoads, 0);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("sql runtime fails closed with structured errors when witness-core sqlite capability is unavailable", async () => {
  const rows = [{
    id: "sqlite.main",
    serverRunner: "runner.demo",
    provider: "sqlite",
    datasourceName: "main",
    path: "db/main.sqlite",
    migrationTable: "witness_sql_migrations"
  }];
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sql-runtime-witness-core-down-"));
  const runtime = createDbSqlRuntime({
    project(projector) {
      if (projector === moduleProjectors.sqlDatasources) return rows;
      if (projector === moduleProjectors.sqlDatasourceIndex) return { rows, byId };
      return [];
    },
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({
      witnessCoreBridge: {
        coreUrl: "http://127.0.0.1:8788",
        async sqliteTestConnection() {
          const error = new Error("witness core unavailable");
          error.status = 503;
          throw error;
        }
      }
    })
  });
  try {
    const result = await runtime.testConnection({ datasourceId: "sqlite.main" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.match(result.reason, /witness core unavailable/i);
    assert.equal(result.datasource?.adapterStatus, "witness-core-unavailable");
    assert.equal(result.datasource?.boundaryOwner, "witness-core");
    assert.equal(result.datasource?.boundaryAuthority, "rust-owned");
    assert.equal(result.datasource?.boundaryAvailability, "unavailable");
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("sql runtime supports pipeline mysql reads and postgres writes", async () => {
  const rows = [
    {
      id: "mysql.source",
      serverRunner: "runner.demo",
      provider: "mysql",
      datasourceName: "source",
      host: "127.0.0.1",
      port: 3306,
      database: "engentus",
      user: "reader",
      passwordSecretId: "secret.db",
      ssl: false
    },
    {
      id: "pg.target",
      serverRunner: "runner.demo",
      provider: "postgres",
      datasourceName: "target",
      host: "127.0.0.1",
      port: 5432,
      database: "engentus",
      user: "writer",
      passwordSecretId: "secret.db",
      ssl: false
    }
  ];
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sql-pipeline-runtime-"));
  const mysqlQueries = [];
  const postgresQueries = [];
  const runtime = createDbSqlRuntime({
    project(projector) {
      if (projector === moduleProjectors.sqlDatasources) return rows;
      if (projector === moduleProjectors.sqlDatasourceIndex) return { rows, byId };
      return [];
    },
    runtimeRoot,
    serverRunnerId: "runner.demo",
    getAppContext: () => ({
      secretStore: {
        resolveSecretValue() {
          return Promise.resolve({ ok: true, value: "super-secret" });
        }
      }
    }),
    mysqlAdapter: {
      createConnection: async () => ({
        async query(sql, params) {
          mysqlQueries.push({ sql, params });
          return [[{
            tx_timestamp_start: 1700000000000,
            tx_gateway_id: "4EF47C45"
          }]];
        },
        async end() {}
      })
    },
    postgresAdapter: {
      Client: class {
        async connect() {}
        async query(sql, params) {
          postgresQueries.push({ sql, params });
          return { rowCount: 1 };
        }
        async end() {}
      }
    }
  });

  try {
    const readResult = await runtime.readOrderedBatch({
      datasourceId: "mysql.source",
      schema: "engentus",
      table: "Transactions_IMU",
      columns: ["tx_timestamp_start", "tx_gateway_id"],
      progressField: "tx_timestamp_start",
      lowerBound: 1699999999000,
      rowLimit: 50
    });
    assert.equal(readResult.ok, true);
    assert.equal(readResult.rowCount, 1);
    assert.match(mysqlQueries[0].sql, /from `engentus`\.`Transactions_IMU`/);
    assert.match(mysqlQueries[0].sql, /order by `tx_timestamp_start` asc limit \?/);
    assert.deepEqual(mysqlQueries[0].params, [1699999999000, 50]);

    const writeResult = await runtime.writeRows({
      datasourceId: "pg.target",
      schema: "engentus",
      table: "sensor_data",
      rows: [{
        sensor_id: "sensor:1",
        timestamp: "2023-11-14T22:13:20.000Z",
        value: 12.5
      }],
      writeMode: "insert_ignore",
      keyFields: ["sensor_id", "timestamp"]
    });
    assert.equal(writeResult.ok, true);
    assert.match(postgresQueries[0].sql, /insert into "engentus"\."sensor_data"/);
    assert.match(postgresQueries[0].sql, /on conflict \("sensor_id", "timestamp"\) do nothing/);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});
