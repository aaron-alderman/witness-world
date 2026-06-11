import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

const asAdam = { "x-witness-actor": "adam", "content-type": "application/json" };

async function startDbSqlServer({ runtimeConfig, runtimeRoot } = {}) {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "dbsql_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
runtimeConfig = { ${runtimeConfig || `"db.sql.provider" = "sqlite", "db.sql.sqlite.path" = "db/main.sqlite"`} }
`);
  const root = runtimeRoot || await fs.mkdtemp(path.join(os.tmpdir(), "witness-db-sql-"));
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "dbsql_server",
    runtimeRoot: root
  });
  return { world, server, runtimeRoot: root };
}

function inspectDbSql(server, headers = asAdam) {
  return fetch(`${server.url}/api/db/sql`, { headers });
}

function migrateDbSql(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/db/sql/migrate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function queryDbSql(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/db/sql/query`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function commandDbSql(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/db/sql/command`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function transactionDbSql(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/db/sql/transaction`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

test("db.sql supports SQLite datasource inspection, migration apply, query, command, transaction, and diagnostics", async () => {
  const { world, server, runtimeRoot } = await startDbSqlServer();
  try {
    const inspected = await inspectDbSql(server);
    assert.equal(inspected.status, 200);
    const inspectedBody = await inspected.json();
    assert.equal(inspectedBody.datasource.provider, "sqlite");
    assert.equal(inspectedBody.datasource.datasourceName, "main");
    assert.equal(inspectedBody.datasource.status, "configured");
    assert.equal(inspectedBody.operations.length, 0);
    assert.equal(inspectedBody.datasource.path, path.join(runtimeRoot, "db", "main.sqlite"));

    const migrate = await migrateDbSql(server, {
      migrations: [
        { id: "001_create_todos", sql: "create table todos (id integer primary key, title text not null)" }
      ]
    });
    assert.equal(migrate.status, 200);
    const migrateBody = await migrate.json();
    assert.deepEqual(migrateBody.applied, ["001_create_todos"]);
    assert.deepEqual(migrateBody.skipped, []);
    assert.equal(migrateBody.operation.kind, "migrate");
    assert.equal(migrateBody.operation.migrationCount, 1);

    const migrateAgain = await migrateDbSql(server, {
      migrations: [
        { id: "001_create_todos", sql: "create table todos (id integer primary key, title text not null)" }
      ]
    });
    assert.equal(migrateAgain.status, 200);
    const migrateAgainBody = await migrateAgain.json();
    assert.deepEqual(migrateAgainBody.applied, []);
    assert.deepEqual(migrateAgainBody.skipped, ["001_create_todos"]);

    const inserted = await commandDbSql(server, {
      sql: "insert into todos(title) values (?)",
      params: ["first"]
    });
    assert.equal(inserted.status, 200);
    const insertedBody = await inserted.json();
    assert.equal(insertedBody.operation.kind, "command");
    assert.equal(insertedBody.changes, 1);
    assert.equal(insertedBody.lastInsertRowid, 1);

    const transaction = await transactionDbSql(server, {
      steps: [
        { kind: "command", sql: "insert into todos(title) values (?)", params: ["second"] },
        { kind: "query", sql: "select count(*) as count from todos" }
      ]
    });
    assert.equal(transaction.status, 200);
    const transactionBody = await transaction.json();
    assert.equal(transactionBody.operation.kind, "transaction");
    assert.equal(transactionBody.operation.stepCount, 2);
    assert.equal(transactionBody.results[1].rows[0].count, 2);

    const queried = await queryDbSql(server, {
      sql: "select id, title from todos order by id"
    });
    assert.equal(queried.status, 200);
    const queriedBody = await queried.json();
    assert.equal(queriedBody.operation.kind, "query");
    assert.equal(queriedBody.rows.length, 2);
    assert.deepEqual(queriedBody.rows.map(row => row.title), ["first", "second"]);

    const inspectedAfter = await inspectDbSql(server);
    assert.equal(inspectedAfter.status, 200);
    const inspectedAfterBody = await inspectedAfter.json();
    assert.equal(inspectedAfterBody.datasource.operationCount, 5);
    assert.equal(inspectedAfterBody.operations.length, 5);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.dbSql.datasourceCount, 1);
    assert.equal(diagnosticsBody.dbSql.operationCount, 5);
    assert.equal(diagnosticsBody.dbSql.failedCount, 0);

    assert(world.allWitnesses().some(witness => witness.process === "db.sql.datasource.resolve" && witness.body?.provider === "sqlite"));
    assert(world.allWitnesses().some(witness => witness.process === "db.sql.migrate"));
    assert(world.allWitnesses().some(witness => witness.process === "db.sql.command"));
    assert(world.allWitnesses().some(witness => witness.process === "db.sql.query"));
    assert(world.allWitnesses().some(witness => witness.process === "db.sql.transaction"));
  } finally {
    await server.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("db.sql rolls back failed transactions and witnesses the failure", async () => {
  const { world, server, runtimeRoot } = await startDbSqlServer();
  try {
    await migrateDbSql(server, {
      migrations: [
        { id: "001_create_accounts", sql: "create table accounts (id integer primary key, name text not null)" }
      ]
    });
    await commandDbSql(server, {
      sql: "insert into accounts(name) values (?)",
      params: ["before"]
    });

    const failed = await transactionDbSql(server, {
      steps: [
        { kind: "command", sql: "insert into accounts(name) values (?)", params: ["rolled-back"] },
        { kind: "command", sql: "insert into missing_table(name) values (?)", params: ["boom"] }
      ]
    });
    assert.equal(failed.status, 500);
    const failedBody = await failed.json();
    assert.match(failedBody.error, /missing_table/i);

    const queried = await queryDbSql(server, {
      sql: "select name from accounts order by id"
    });
    assert.equal(queried.status, 200);
    const queriedBody = await queried.json();
    assert.deepEqual(queriedBody.rows.map(row => row.name), ["before"]);

    assert(world.allWitnesses().some(witness => witness.process === "db.sql.transaction.failed"));
  } finally {
    await server.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("db.sql keeps provider adapters explicit for postgres and mysql when they are not wired in this slice", async () => {
  for (const provider of ["postgres", "mysql"]) {
    const { world, server, runtimeRoot } = await startDbSqlServer({
      runtimeConfig: `"db.sql.provider" = "${provider}", "db.sql.${provider}.connectionString" = "${provider}://stub.example/app"`
    });
    try {
      const inspected = await inspectDbSql(server);
      assert.equal(inspected.status, 200);
      const inspectedBody = await inspected.json();
      assert.equal(inspectedBody.datasource.provider, provider);
      assert.equal(inspectedBody.datasource.status, "unsupported");
      assert.match(inspectedBody.warning || "", /not wired/i);

      const queried = await queryDbSql(server, { sql: "select 1 as value" });
      assert.equal(queried.status, 501);
      const queriedBody = await queried.json();
      assert.match(queriedBody.error, /not wired/i);

      assert(world.allWitnesses().some(witness => witness.process === "db.sql.datasource.resolve.failed" && witness.body?.provider === provider));
      assert(world.allWitnesses().some(witness => witness.process === "db.sql.query.failed" && witness.body?.provider === provider));
    } finally {
      await server.close();
      await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
});
