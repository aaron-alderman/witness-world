import { randomUUID } from "node:crypto";

export function dbSqlDatasourceId(serverRunnerId, datasourceName = "main") {
  return `dbsql:${serverRunnerId}:${datasourceName}`;
}

export function dbSqlOperationId() {
  return `sqlop_${randomUUID()}`;
}

export function dbSqlDatasourceTitle({ provider = "sqlite", datasourceName = "main" } = {}) {
  return `${datasourceName} (${provider})`;
}

export function dbSqlOperationTitle({ kind = "query", name = null, datasourceName = "main" } = {}) {
  return name ? `${kind}:${name}` : `${kind} ${datasourceName}`;
}
