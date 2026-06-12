import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { createPracticalBackendDbSearchServices } from "../src/runtime-practical-backend-db-search-services.js";

test("practical backend db/search services shape rows and emit bundle-owned witnesses", () => {
  const world = createWorld();
  const services = createPracticalBackendDbSearchServices({
    world,
    backendHost: "backendHost"
  });
  const datasource = {
    id: "sql.ds.runner-1.main",
    title: "sqlite:main",
    serverRunner: "runner-1",
    provider: "sqlite",
    datasourceName: "main",
    migrationTable: "witness_sql_migrations",
    status: "ready",
    path: "C:/runtime/db/main.sqlite",
    adapterStatus: "ready",
    lastError: null,
    operationCount: 2
  };
  const index = {
    id: "search.idx.runner-1.main",
    title: "Search Main",
    serverRunner: "runner-1",
    provider: "memory",
    name: "main",
    status: "ready",
    sourceCount: 1,
    documentCount: 2,
    assetCount: 3,
    queryCount: 4,
    lastBuiltAt: "2026-06-12T00:00:00.000Z",
    lastQueryAt: null,
    path: "C:/runtime/search/main",
    lastError: null
  };

  assert.deepEqual(services.dbSqlDatasourceReadShape(datasource), datasource);
  assert.deepEqual(
    services.dbSqlOperationReadShape({
      id: "sqlop_1",
      title: "query main",
      serverRunner: "runner-1",
      datasourceId: datasource.id,
      datasourceName: datasource.datasourceName,
      provider: datasource.provider,
      kind: "query",
      status: "succeeded",
      rowCount: 1,
      changes: 0,
      lastInsertRowid: null,
      migrationCount: 0,
      skippedCount: 0,
      stepCount: 1,
      lastError: null
    }),
    {
      id: "sqlop_1",
      title: "query main",
      serverRunner: "runner-1",
      datasourceId: datasource.id,
      datasourceName: datasource.datasourceName,
      provider: datasource.provider,
      kind: "query",
      status: "succeeded",
      rowCount: 1,
      changes: 0,
      lastInsertRowid: null,
      migrationCount: 0,
      skippedCount: 0,
      stepCount: 1,
      lastError: null
    }
  );
  assert.deepEqual(services.searchIndexReadShape(index), index);

  services.emitDbSqlDatasourceResolve({ actor: "adam", datasource, ok: true });
  services.emitDbSqlOperation({
    actor: "adam",
    kind: "query",
    operationId: "sqlop_1",
    title: "query main",
    datasource,
    ok: false,
    body: { reason: "query failed" }
  });
  services.emitSearchIndexEvent({
    actor: "adam",
    process: "search.index.build",
    index,
    body: { documentCount: 2 }
  });

  const witnesses = world.allWitnesses().filter(witness =>
    witness.process === "db.sql.datasource.resolve"
    || witness.process === "db.sql.query.failed"
    || witness.process === "search.index.build"
  );
  assert.equal(witnesses.length, 3);
  assert.equal(witnesses[0].body.datasourceName, "main");
  assert.equal(witnesses[1].body.reason, "query failed");
  assert.equal(witnesses[2].body.name, "main");
});
