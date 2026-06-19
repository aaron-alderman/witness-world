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
import { sqlRvmForms } from "./desire-rvm.js";

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

function applySqlRuntimeDeclaration() {
  return [];
}

export const providers = Object.freeze([
  {
    kind: "capabilityDefinitions",
    id: "sql.capabilities",
    capabilities: Object.freeze([
      Object.freeze({
        id: "db.sql",
        label: "SQL Database",
        providerAdapters: Object.freeze([
          Object.freeze({ id: "sqlite", label: "SQLite", status: "shipped", default: true }),
          // pg / mysql2 are wired for connection tests but query/command/migrate stay SQLite-only.
          Object.freeze({ id: "postgres", label: "PostgreSQL", status: "preview" }),
          Object.freeze({ id: "mysql", label: "MySQL", status: "preview" })
        ]),
        witnessContract: Object.freeze({
          externalRefs: Object.freeze(["datasourceId", "operationId"]),
          failure: Object.freeze(["db.sql.query.failed", "db.sql.command.failed", "db.sql.migrate.failed", "db.sql.transaction.failed"])
        }),
        authority: Object.freeze([]),
        config: Object.freeze([
          Object.freeze({ name: "db.sql.provider", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "db.sql.datasource", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "db.sql.migrationTable", accepts: "runtimeConfig.key" }),
          Object.freeze({ name: "db.sql.sqlite.path", accepts: "runtimeConfig.key" })
        ])
      })
    ])
  },
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

export const desireExtensions = Object.freeze({
  rvmForms: sqlRvmForms,
  runtimeDeclarations: Object.freeze([
    Object.freeze({
      kind: "sql_table",
      apply: applySqlRuntimeDeclaration
    })
  ])
});

export function createHandlers(deps) {
  return createSqlDbHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  desireExtensions,
  createHandlers
};
