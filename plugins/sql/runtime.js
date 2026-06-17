import { handlerCatalog } from "./handler-catalog.js";
import { createSqlDbHandlers } from "./handlers.js";
import { createDbSqlRuntime } from "./provider-runtime.js";
import {
  dbSqlDatasourceId,
  dbSqlDatasourceTitle,
  dbSqlOperationId,
  dbSqlOperationTitle
} from "./glue.js";
import { sqlModuleProjectors } from "./projections.js";

export const bundleId = "bundle-sql";

export { handlerCatalog };

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  exactRoute("GET", "/api/db/sql", "db.sql.inspect"),
  exactRoute("GET", "/api/db/sql/datasources", "db.sql.datasources.list"),
  patternRoute("GET", /^\/api\/db\/sql\/datasources\/([^/]+)$/, "db.sql.datasource.read", ["id"]),
  exactRoute("POST", "/api/db/sql/datasources", "db.sql.datasource.create"),
  patternRoute("PATCH", /^\/api\/db\/sql\/datasources\/([^/]+)$/, "db.sql.datasource.update", ["id"]),
  patternRoute("DELETE", /^\/api\/db\/sql\/datasources\/([^/]+)$/, "db.sql.datasource.delete", ["id"]),
  patternRoute("POST", /^\/api\/db\/sql\/datasources\/([^/]+)\/test$/, "db.sql.datasource.test", ["id"]),
  exactRoute("POST", "/api/db/sql/datasources/test", "db.sql.datasource.testDraft"),
  exactRoute("POST", "/api/db/sql/migrate", "db.sql.migrate"),
  exactRoute("POST", "/api/db/sql/query", "db.sql.query"),
  exactRoute("POST", "/api/db/sql/command", "db.sql.command"),
  exactRoute("POST", "/api/db/sql/transaction", "db.sql.transaction")
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "sql.projections",
    projectors: sqlModuleProjectors
  },
  {
    kind: "providerRuntimeFactory",
    id: "db.sql",
    factory: createDbSqlRuntime
  },
  {
    kind: "supportServiceFactory",
    id: "sql.support",
    factory: () => ({
      dbSqlDatasourceId,
      dbSqlDatasourceTitle,
      dbSqlOperationId,
      dbSqlOperationTitle
    })
  }
]);

export function createHandlers(deps) {
  return createSqlDbHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
