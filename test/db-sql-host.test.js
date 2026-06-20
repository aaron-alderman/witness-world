import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";

const asAdam = { "x-witness-actor": "adam", "content-type": "application/json" };

async function startDbSqlServer() {
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
`);
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-db-sql-"));
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "dbsql_server",
    runtimeRoot
  });
  return { world, server, runtimeRoot };
}

function fetchJson(url, { method = "GET", headers = {}, body } = {}) {
  return fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function inspectDbSql(server, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql`, { headers });
}

function listDatasources(server, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/datasources`, { headers });
}

function readDatasource(server, datasourceId, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/datasources/${encodeURIComponent(datasourceId)}`, { headers });
}

function createDatasource(server, body, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/datasources`, {
    method: "POST",
    headers,
    body
  });
}

function testDatasource(server, datasourceId, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/datasources/${encodeURIComponent(datasourceId)}/test`, {
    method: "POST",
    headers,
    body: {}
  });
}

function migrateDbSql(server, body, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/migrate`, {
    method: "POST",
    headers,
    body
  });
}

function queryDbSql(server, body, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/query`, {
    method: "POST",
    headers,
    body
  });
}

function commandDbSql(server, body, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/command`, {
    method: "POST",
    headers,
    body
  });
}

function transactionDbSql(server, body, headers = asAdam) {
  return fetchJson(`${server.url}/api/db/sql/transaction`, {
    method: "POST",
    headers,
    body
  });
}

function listSecrets(server, headers = asAdam) {
  return fetchJson(`${server.url}/api/secrets`, { headers });
}

function readSecret(server, secretId, headers = asAdam) {
  return fetchJson(`${server.url}/api/secrets/${encodeURIComponent(secretId)}`, { headers });
}

function createSecret(server, body, headers = asAdam) {
  return fetchJson(`${server.url}/api/secrets`, {
    method: "POST",
    headers,
    body
  });
}

function deleteSecret(server, secretId, headers = asAdam) {
  return fetchJson(`${server.url}/api/secrets/${encodeURIComponent(secretId)}`, {
    method: "DELETE",
    headers
  });
}

test("db.sql uses explicit sqlite datasource resources for migration, query, command, transaction, and diagnostics", async () => {
  const { world, server, runtimeRoot } = await startDbSqlServer();
  try {
    const created = await createDatasource(server, {
      id: "sqlite_main",
      provider: "sqlite",
      datasourceName: "main",
      path: "db/main.sqlite"
    });
    assert.equal(created.status, 201);

    const inspected = await inspectDbSql(server);
    assert.equal(inspected.status, 200);
    const inspectedBody = await inspected.json();
    assert.equal(inspectedBody.serverRunner, "dbsql_server");
    assert.equal(inspectedBody.datasources.length, 1);
    assert.equal(inspectedBody.datasources[0].id, "sqlite_main");
    assert.equal(inspectedBody.datasources[0].provider, "sqlite");
    assert.equal(inspectedBody.datasources[0].path, "db/main.sqlite");
    assert.match(String(inspectedBody.datasources[0].resolvedPath || ""), /db[\\/]main\.sqlite$/i);
    assert.equal(inspectedBody.datasources[0].boundaryOwner, "node");
    assert.equal(inspectedBody.datasources[0].boundaryAuthority, "transitional-node-fallback");
    assert.equal(inspectedBody.datasources[0].boundaryTransport, "node:sqlite");
    assert.equal(inspectedBody.operations.length, 0);

    const migrated = await migrateDbSql(server, {
      datasourceId: "sqlite_main",
      migrations: [
        { id: "001_create_todos", sql: "create table todos (id integer primary key, title text not null)" }
      ]
    });
    assert.equal(migrated.status, 200);
    assert.deepEqual(await migrated.json(), {
      applied: ["001_create_todos"],
      skipped: []
    });

    const inserted = await commandDbSql(server, {
      datasourceId: "sqlite_main",
      sql: "insert into todos(title) values (?)",
      params: ["first"]
    });
    assert.equal(inserted.status, 200);
    assert.deepEqual(await inserted.json(), {
      changes: 1,
      lastInsertRowid: 1
    });

    const transaction = await transactionDbSql(server, {
      datasourceId: "sqlite_main",
      steps: [
        { kind: "command", sql: "insert into todos(title) values (?)", params: ["second"] },
        { kind: "query", sql: "select count(*) as count from todos" }
      ]
    });
    assert.equal(transaction.status, 200);
    const transactionBody = await transaction.json();
    assert.equal(transactionBody.results.length, 2);
    assert.equal(transactionBody.results[1].rows[0].count, 2);

    const queried = await queryDbSql(server, {
      datasourceId: "sqlite_main",
      sql: "select id, title from todos order by id"
    });
    assert.equal(queried.status, 200);
    const queriedBody = await queried.json();
    assert.equal(queriedBody.rowCount, 2);
    assert.deepEqual(queriedBody.rows.map(row => row.title), ["first", "second"]);

    const inspectedAfter = await inspectDbSql(server);
    assert.equal(inspectedAfter.status, 200);
    const inspectedAfterBody = await inspectedAfter.json();
    assert.equal(inspectedAfterBody.datasources[0].operationCount, 4);
    assert.equal(inspectedAfterBody.operations.length, 4);

    const readBack = await readDatasource(server, "sqlite_main");
    assert.equal(readBack.status, 200);
    const readBackBody = await readBack.json();
    assert.equal(readBackBody.datasource.id, "sqlite_main");
    assert.equal(readBackBody.datasource.path, "db/main.sqlite");

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.dbSql.datasourceCount, 1);
    assert.equal(diagnosticsBody.dbSql.operationCount, 4);
    assert.equal(diagnosticsBody.dbSql.failedCount, 0);

    assert.equal(world.allWitnesses().some(witness => witness.process === "db.sql.datasource.create" && witness.body?.id === "sqlite_main"), true);
    assert.equal(world.allWitnesses().some(witness => witness.process === "db.sql.migrate" && witness.body?.datasourceId === "sqlite_main"), true);
    assert.equal(world.allWitnesses().some(witness => witness.process === "db.sql.command" && witness.body?.datasourceId === "sqlite_main"), true);
    assert.equal(world.allWitnesses().some(witness => witness.process === "db.sql.query" && witness.body?.datasourceId === "sqlite_main"), true);
    assert.equal(world.allWitnesses().some(witness => witness.process === "db.sql.transaction" && witness.body?.datasourceId === "sqlite_main"), true);
    assert.equal(path.resolve(runtimeRoot, "db", "main.sqlite").endsWith(path.join("db", "main.sqlite")), true);
  } finally {
    await server.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("db.sql supports multiple named datasources per runner, secret-backed connection tests, and explicit datasource selection", async () => {
  const { world, server, runtimeRoot } = await startDbSqlServer();
  try {
    const secretValue = "super-secret-password";
    const createdSecret = await createSecret(server, {
      id: "pg_main_password",
      value: secretValue
    });
    assert.equal(createdSecret.status, 201);

    const listedSecrets = await listSecrets(server);
    assert.equal(listedSecrets.status, 200);
    const listedSecretsBody = await listedSecrets.json();
    assert.deepEqual(listedSecretsBody.secrets.map(secret => secret.id), ["pg_main_password"]);
    assert.equal(listedSecretsBody.secrets[0].hasValue, true);
    assert.equal(JSON.stringify(listedSecretsBody).includes(secretValue), false);

    const readBackSecret = await readSecret(server, "pg_main_password");
    assert.equal(readBackSecret.status, 200);
    const readBackSecretBody = await readBackSecret.json();
    assert.equal(readBackSecretBody.secret.id, "pg_main_password");
    assert.equal(readBackSecretBody.secret.hasValue, true);
    assert.equal(Object.prototype.hasOwnProperty.call(readBackSecretBody.secret, "value"), false);

    const postgresCreate = await createDatasource(server, {
      id: "pg_main",
      provider: "postgres",
      datasourceName: "main",
      host: "127.0.0.1",
      port: 1,
      database: "engentus",
      user: "pipeline_user",
      passwordSecretId: "pg_main_password",
      ssl: false
    });
    assert.equal(postgresCreate.status, 201);

    const postgresReportingCreate = await createDatasource(server, {
      id: "pg_reporting",
      provider: "postgres",
      datasourceName: "reporting",
      host: "127.0.0.1",
      port: 1,
      database: "engentus_reporting",
      user: "pipeline_user",
      passwordSecretId: "pg_main_password",
      ssl: false
    });
    assert.equal(postgresReportingCreate.status, 201);

    const datasources = await listDatasources(server);
    assert.equal(datasources.status, 200);
    const datasourcesBody = await datasources.json();
    assert.equal(datasourcesBody.datasources.length, 2);
    assert.deepEqual(datasourcesBody.datasources.map(row => row.id), ["pg_main", "pg_reporting"]);
    assert.deepEqual(datasourcesBody.datasources.map(row => row.provider), ["postgres", "postgres"]);

    const missingDatasource = await queryDbSql(server, { sql: "select 1 as value" });
    assert.equal(missingDatasource.status, 400);
    assert.match((await missingDatasource.json()).error, /datasourceId required/i);

    const unknownDatasource = await queryDbSql(server, {
      datasourceId: "does_not_exist",
      sql: "select 1 as value"
    });
    assert.equal(unknownDatasource.status, 404);
    assert.match((await unknownDatasource.json()).error, /datasource not found/i);

    const tested = await testDatasource(server, "pg_main");
    assert.equal(tested.status, 500);
    const testedBody = await tested.json();
    assert.match(testedBody.error, /connect|connection|refused|package|secret/i);
    assert.equal(testedBody.operation.datasourceId, "pg_main");
    assert.equal(testedBody.operation.kind, "test");
    assert.equal(testedBody.operation.status, "failed");

    const inspected = await inspectDbSql(server);
    assert.equal(inspected.status, 200);
    const inspectedBody = await inspected.json();
    const pgMain = inspectedBody.datasources.find(row => row.id === "pg_main");
    assert.equal(pgMain.lastTestResult, "failed");
    assert.equal(typeof pgMain.lastError, "string");

    assert.equal(world.allWitnesses().some(witness => witness.process === "secret.store.create" && witness.body?.id === "pg_main_password"), true);
    assert.equal(world.allWitnesses().every(witness => !JSON.stringify(witness.body ?? {}).includes(secretValue)), true);
    assert.equal(world.allWitnesses().some(witness => witness.process === "db.sql.datasource.test.failed" && witness.body?.id === "pg_main"), true);

    const deletedSecret = await deleteSecret(server, "pg_main_password");
    assert.equal(deletedSecret.status, 200);
    const listedSecretsAfterDelete = await listSecrets(server);
    assert.equal(listedSecretsAfterDelete.status, 200);
    assert.deepEqual((await listedSecretsAfterDelete.json()).secrets, []);
  } finally {
    await server.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("db.sql rolls back failed sqlite transactions and witnesses the failure", async () => {
  const { world, server, runtimeRoot } = await startDbSqlServer();
  try {
    await createDatasource(server, {
      id: "sqlite_main",
      provider: "sqlite",
      datasourceName: "main",
      path: "db/main.sqlite"
    });
    await migrateDbSql(server, {
      datasourceId: "sqlite_main",
      migrations: [
        { id: "001_create_accounts", sql: "create table accounts (id integer primary key, name text not null)" }
      ]
    });
    await commandDbSql(server, {
      datasourceId: "sqlite_main",
      sql: "insert into accounts(name) values (?)",
      params: ["before"]
    });

    const failed = await transactionDbSql(server, {
      datasourceId: "sqlite_main",
      steps: [
        { kind: "command", sql: "insert into accounts(name) values (?)", params: ["rolled-back"] },
        { kind: "command", sql: "insert into missing_table(name) values (?)", params: ["boom"] }
      ]
    });
    assert.equal(failed.status, 500);
    assert.match((await failed.json()).error, /missing_table/i);

    const queried = await queryDbSql(server, {
      datasourceId: "sqlite_main",
      sql: "select name from accounts order by id"
    });
    assert.equal(queried.status, 200);
    assert.deepEqual((await queried.json()).rows.map(row => row.name), ["before"]);

    assert.equal(world.allWitnesses().some(witness => witness.process === "db.sql.transaction.failed" && witness.body?.datasourceId === "sqlite_main"), true);
  } finally {
    await server.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});
