import { relation, thing } from "./kernel.js";

export function createPracticalBackendDbSearchServices({ world, backendHost }) {
  const dbSqlDatasourceReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    provider: row.provider,
    datasourceName: row.datasourceName,
    migrationTable: row.migrationTable,
    status: row.status,
    path: row.path,
    adapterStatus: row.adapterStatus,
    lastError: row.lastError,
    operationCount: row.operationCount
  });
  const dbSqlOperationReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    datasourceId: row.datasourceId,
    datasourceName: row.datasourceName,
    provider: row.provider,
    kind: row.kind,
    status: row.status,
    rowCount: row.rowCount,
    changes: row.changes,
    lastInsertRowid: row.lastInsertRowid,
    migrationCount: row.migrationCount,
    skippedCount: row.skippedCount,
    stepCount: row.stepCount,
    lastError: row.lastError
  });
  const searchIndexReadShape = row => ({
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    provider: row.provider,
    name: row.name,
    status: row.status,
    sourceCount: row.sourceCount,
    documentCount: row.documentCount,
    assetCount: row.assetCount,
    queryCount: row.queryCount,
    lastBuiltAt: row.lastBuiltAt,
    lastQueryAt: row.lastQueryAt,
    path: row.path,
    lastError: row.lastError
  });
  const emitDbSqlDatasourceResolve = ({ actor, datasource, ok, reason = null }) => world.emit({
    process: ok ? "db.sql.datasource.resolve" : "db.sql.datasource.resolve.failed",
    actor,
    claims: [
      thing(datasource.id),
      relation(datasource.id, "hasModuleKind", "sqlDatasource"),
      relation(backendHost, "owns", datasource.id),
      relation(datasource.id, "hasTitle", datasource.title)
    ],
    body: {
      id: datasource.id,
      serverRunner: datasource.serverRunner,
      provider: datasource.provider,
      datasourceName: datasource.datasourceName,
      migrationTable: datasource.migrationTable,
      path: datasource.path,
      adapterStatus: datasource.adapterStatus,
      status: ok ? datasource.status : (datasource.status || "failed"),
      ...(reason ? { reason } : {}),
      ...(datasource.lastError ? { lastError: datasource.lastError } : {})
    }
  });
  const emitDbSqlOperation = ({ actor, kind, operationId, title, datasource, ok, body }) => world.emit({
    process: ok ? `db.sql.${kind}` : `db.sql.${kind}.failed`,
    actor,
    claims: [
      thing(operationId),
      relation(operationId, "hasModuleKind", "sqlOperation"),
      relation(actor, "owns", operationId),
      relation(operationId, "hasTitle", title),
      relation(operationId, "usesDatasource", datasource.id)
    ],
    body: {
      id: operationId,
      serverRunner: datasource.serverRunner,
      datasourceId: datasource.id,
      datasourceName: datasource.datasourceName,
      provider: datasource.provider,
      kind,
      ...body
    }
  });
  const emitSearchIndexEvent = ({ actor, process, index, body = {} }) => world.emit({
    process,
    actor,
    claims: [
      thing(index.id),
      relation(index.id, "hasModuleKind", "searchIndex"),
      relation(actor, "owns", index.id),
      relation(index.id, "hasTitle", index.title)
    ],
    body: {
      id: index.id,
      serverRunner: index.serverRunner,
      provider: index.provider,
      name: index.name,
      ...body
    }
  });

  return {
    dbSqlDatasourceReadShape,
    dbSqlOperationReadShape,
    searchIndexReadShape,
    emitDbSqlDatasourceResolve,
    emitDbSqlOperation,
    emitSearchIndexEvent
  };
}
