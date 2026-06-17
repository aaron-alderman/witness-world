import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

function defaultDatasourceRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    provider: null,
    datasourceName: null,
    host: null,
    port: null,
    database: null,
    user: null,
    passwordSecretId: null,
    ssl: false,
    migrationTable: null,
    path: null,
    adapterStatus: null,
    status: "configured",
    lastTestAt: null,
    lastTestResult: null,
    lastError: null,
    operationCount: 0,
    deleted: false
  };
}

function defaultOperationRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    datasourceId: null,
    datasourceName: null,
    provider: null,
    kind: null,
    status: "pending",
    rowCount: 0,
    changes: 0,
    lastInsertRowid: 0,
    migrationCount: 0,
    skippedCount: 0,
    stepCount: 0,
    lastError: null
  };
}

export function sqlOperations(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "sqlOperation") continue;
    rows.set(id, defaultOperationRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("db.sql.") || !witness.body?.id || witness.process.startsWith("db.sql.datasource.")) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultOperationRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.datasourceId = typeof witness.body.datasourceId === "string" ? witness.body.datasourceId : row.datasourceId;
    row.datasourceName = typeof witness.body.datasourceName === "string" ? witness.body.datasourceName : row.datasourceName;
    row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
    row.kind = typeof witness.body.kind === "string" ? witness.body.kind : row.kind;
    row.rowCount = Number.isFinite(witness.body.rowCount) ? witness.body.rowCount : row.rowCount;
    row.changes = Number.isFinite(witness.body.changes) ? witness.body.changes : row.changes;
    row.lastInsertRowid = Number.isFinite(witness.body.lastInsertRowid) ? witness.body.lastInsertRowid : row.lastInsertRowid;
    row.migrationCount = Number.isFinite(witness.body.migrationCount) ? witness.body.migrationCount : row.migrationCount;
    row.skippedCount = Number.isFinite(witness.body.skippedCount) ? witness.body.skippedCount : row.skippedCount;
    row.stepCount = Number.isFinite(witness.body.stepCount) ? witness.body.stepCount : row.stepCount;
    if (witness.body.lastError === null) {
      row.lastError = null;
    } else if (typeof witness.body.reason === "string") {
      row.lastError = witness.body.reason;
    }
    row.status = witness.process.endsWith(".failed") ? "failed" : "succeeded";
    row.title = titles.get(id) ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function sqlOperationIndex(witnesses, options = {}) {
  const rows = sqlOperations(witnesses, options);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export function sqlDatasources(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);
  const operationRows = sqlOperations(witnesses, options);

  for (const [id, kind] of modules) {
    if (kind !== "sqlDatasource") continue;
    rows.set(id, defaultDatasourceRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("db.sql.datasource.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultDatasourceRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
    row.datasourceName = typeof witness.body.datasourceName === "string" ? witness.body.datasourceName : row.datasourceName;
    row.host = typeof witness.body.host === "string" ? witness.body.host : row.host;
    row.port = Number.isFinite(witness.body.port) ? witness.body.port : row.port;
    row.database = typeof witness.body.database === "string" ? witness.body.database : row.database;
    row.user = typeof witness.body.user === "string" ? witness.body.user : row.user;
    row.passwordSecretId = typeof witness.body.passwordSecretId === "string" ? witness.body.passwordSecretId : row.passwordSecretId;
    row.ssl = typeof witness.body.ssl === "boolean" ? witness.body.ssl : row.ssl;
    row.migrationTable = typeof witness.body.migrationTable === "string" ? witness.body.migrationTable : row.migrationTable;
    row.path = typeof witness.body.path === "string" ? witness.body.path : row.path;
    row.adapterStatus = typeof witness.body.adapterStatus === "string" ? witness.body.adapterStatus : row.adapterStatus;
    row.status = typeof witness.body.status === "string" ? witness.body.status : row.status;
    row.lastTestAt = typeof witness.body.lastTestAt === "string" ? witness.body.lastTestAt : row.lastTestAt;
    row.lastTestResult = typeof witness.body.lastTestResult === "string" ? witness.body.lastTestResult : row.lastTestResult;
    if (witness.body.lastError === null) {
      row.lastError = null;
    } else if (typeof witness.body.reason === "string") {
      row.lastError = witness.body.reason;
    } else if (typeof witness.body.lastError === "string") {
      row.lastError = witness.body.lastError;
    }
    if (witness.process === "db.sql.datasource.delete") row.deleted = true;
    row.title = titles.get(id) ?? row.datasourceName ?? row.title;
    rows.set(id, row);
  }

  const operationCounts = new Map();
  for (const operation of operationRows) {
    if (!operation.datasourceId) continue;
    operationCounts.set(operation.datasourceId, (operationCounts.get(operation.datasourceId) ?? 0) + 1);
  }

  return [...rows.values()]
    .filter(row => row.deleted !== true)
    .map(({ deleted, ...row }) => ({ ...row, operationCount: operationCounts.get(row.id) ?? 0 }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function sqlDatasourceIndex(witnesses, options = {}) {
  const rows = sqlDatasources(witnesses, options);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const sqlModuleProjectors = Object.freeze({
  sqlDatasources,
  sqlDatasourceIndex,
  sqlOperations,
  sqlOperationIndex
});
