import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createThing, createWorld, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { createDbSqlRuntime } from "./provider-runtime.js";
import { bundleId, handlerCatalog, providers } from "./runtime.js";

test("sql plugin exposes datasource CRUD and explicit db.sql operations", () => {
  assert.equal(bundleId, "bundle-sql");
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.datasource.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.datasource.test"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("db.sql.query"), true);
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
    assert.deepEqual(runtime.listDatasources().map(row => row.id), ["sqlite.main", "pg.main", "pg.reporting"]);
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
