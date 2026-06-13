import { handlerCatalog } from "./handler-catalog.js";
import { createSqliteDbSqlHandlers } from "./handlers.js";
import { createDbSqlRuntime } from "./provider-runtime.js";
import {
  dbSqlDatasourceId,
  dbSqlDatasourceTitle,
  dbSqlOperationId,
  dbSqlOperationTitle
} from "./glue.js";
import { sqliteModuleProjectors } from "./projections.js";

export const bundleId = "bundle-sqlite";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/db/sql", "db.sql.inspect"),
  exactRoute("POST", "/api/db/sql/migrate", "db.sql.migrate"),
  exactRoute("POST", "/api/db/sql/query", "db.sql.query"),
  exactRoute("POST", "/api/db/sql/command", "db.sql.command"),
  exactRoute("POST", "/api/db/sql/transaction", "db.sql.transaction")
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "sqlite.projections",
    projectors: sqliteModuleProjectors
  },
  {
    kind: "providerRuntimeFactory",
    id: "db.sql",
    factory: createDbSqlRuntime
  },
  {
    kind: "supportServiceFactory",
    id: "sqlite.support",
    factory: () => ({
      dbSqlDatasourceId,
      dbSqlDatasourceTitle,
      dbSqlOperationId,
      dbSqlOperationTitle
    })
  }
]);

export function createHandlers(deps) {
  return createSqliteDbSqlHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
