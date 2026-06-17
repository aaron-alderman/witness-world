import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { moduleProjectors } from "../../src/modules.js";

function quoteSqlIdentifier(identifier) {
  return `"${String(identifier).replaceAll("\"", "\"\"")}"`;
}

function normalizeDbSqlIdentifier(value, fallback) {
  const identifier = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ? identifier : null;
}

function datasourceForRunner(project, serverRunnerId, datasourceId) {
  const row = project(moduleProjectors.sqlDatasourceIndex).byId[datasourceId] ?? null;
  return row && row.serverRunner === serverRunnerId ? row : null;
}

function datasourcesForRunner(project, serverRunnerId) {
  return project(moduleProjectors.sqlDatasources).filter(row => row.serverRunner === serverRunnerId);
}

function sqlitePathFor(runtimeRoot, datasource) {
  if (typeof datasource.path === "string" && datasource.path.trim()) {
    return path.isAbsolute(datasource.path) ? datasource.path : path.resolve(runtimeRoot, datasource.path);
  }
  return path.resolve(runtimeRoot, "db", `${datasource.datasourceName || datasource.id}.sqlite`);
}

async function loadSecretValue(getAppContext, secretId) {
  if (!secretId) return { ok: true, value: null };
  const secretStore = getAppContext()?.secretStore ?? null;
  if (!secretStore?.resolveSecretValue) return { ok: false, status: 503, reason: "secret.store runtime unavailable" };
  return secretStore.resolveSecretValue(secretId);
}

export function createDbSqlRuntime({
  project,
  runtimeRoot,
  serverRunnerId,
  getAppContext,
  postgresAdapter = null,
  mysqlAdapter = null
}) {
  const sqliteConnections = new Map();
  const listDatasources = () => datasourcesForRunner(project, serverRunnerId);
  const getDatasource = datasourceId => datasourceForRunner(project, serverRunnerId, datasourceId);

  const openSqlite = async datasource => {
    const sqlitePath = sqlitePathFor(runtimeRoot, datasource);
    if (sqliteConnections.has(sqlitePath)) return { database: sqliteConnections.get(sqlitePath), sqlitePath };
    await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
    const database = new DatabaseSync(sqlitePath);
    sqliteConnections.set(sqlitePath, database);
    return { database, sqlitePath };
  };

  const resolveDatasource = async (datasourceOrId) => {
    const datasource = typeof datasourceOrId === "string"
      ? getDatasource(datasourceOrId)
      : (datasourceOrId && typeof datasourceOrId === "object" ? { ...datasourceOrId } : null);
    if (!datasource) return { ok: false, status: 404, reason: "datasource not found", datasource: null };
    if (!datasource.provider) return { ok: false, status: 400, reason: "datasource provider required", datasource };
    if (datasource.provider === "sqlite") {
      return {
        ok: true,
        datasource: {
          ...datasource,
          path: sqlitePathFor(runtimeRoot, datasource),
          adapterStatus: "ready"
        }
      };
    }
    if (!["postgres", "mysql"].includes(datasource.provider)) {
      return { ok: false, status: 400, reason: "unsupported datasource provider", datasource };
    }
    const passwordResolved = await loadSecretValue(getAppContext, datasource.passwordSecretId);
    if (!passwordResolved.ok) {
      return { ok: false, status: passwordResolved.status || 503, reason: passwordResolved.reason || "secret unresolved", datasource };
    }
    if (!datasource.host || !datasource.database || !datasource.user) {
      return { ok: false, status: 400, reason: "host, database, and user are required", datasource };
    }
    return {
      ok: true,
      datasource,
      connection: {
        host: datasource.host,
        port: datasource.port || (datasource.provider === "postgres" ? 5432 : 3306),
        database: datasource.database,
        user: datasource.user,
        password: passwordResolved.value || "",
        ssl: datasource.ssl === true
      }
    };
  };

  const testConnection = async ({ datasourceId = null, datasource = null } = {}) => {
    const resolved = await resolveDatasource(datasource ?? datasourceId);
    if (!resolved.ok) return resolved;
    try {
      if (resolved.datasource.provider === "sqlite") {
        const { database } = await openSqlite(resolved.datasource);
        database.prepare("select 1 as ok").get();
        return { ok: true, datasource: resolved.datasource };
      }
      if (resolved.datasource.provider === "postgres") {
        const { Client } = postgresAdapter ?? await import("pg");
        const client = new Client({
          host: resolved.connection.host,
          port: resolved.connection.port,
          database: resolved.connection.database,
          user: resolved.connection.user,
          password: resolved.connection.password,
          ssl: resolved.connection.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 3000
        });
        await client.connect();
        await client.query("select 1 as ok");
        await client.end();
        return { ok: true, datasource: resolved.datasource };
      }
      if (resolved.datasource.provider === "mysql") {
        const mysql = mysqlAdapter ?? await import("mysql2/promise");
        const connection = await mysql.createConnection({
          host: resolved.connection.host,
          port: resolved.connection.port,
          database: resolved.connection.database,
          user: resolved.connection.user,
          password: resolved.connection.password,
          ssl: resolved.connection.ssl ? {} : undefined,
          connectTimeout: 3000
        });
        await connection.query("select 1 as ok");
        await connection.end();
        return { ok: true, datasource: resolved.datasource };
      }
      return { ok: false, status: 400, reason: "unsupported datasource provider", datasource: resolved.datasource };
    } catch (error) {
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "connection test failed", datasource: resolved.datasource };
    }
  };

  const ensureSqliteReady = async datasourceId => {
    const resolved = await resolveDatasource(datasourceId);
    if (!resolved.ok) return resolved;
    if (resolved.datasource.provider !== "sqlite") {
      return { ok: false, status: 501, reason: `${resolved.datasource.provider} adapter not wired for this operation`, datasource: resolved.datasource };
    }
    const { database, sqlitePath } = await openSqlite(resolved.datasource);
    return {
      ok: true,
      datasource: {
        ...resolved.datasource,
        path: sqlitePath
      },
      database
    };
  };

  const normalizeDbSqlParams = params => {
    if (params == null) return { ok: true, kind: "none", value: [] };
    if (Array.isArray(params)) return { ok: true, kind: "array", value: [...params] };
    if (params && typeof params === "object") return { ok: true, kind: "object", value: { ...params } };
    return { ok: false, status: 400, reason: "params must be an array or object" };
  };

  const applyDbSqlParams = (statement, method, normalizedParams) => {
    if (normalizedParams.kind === "array") return statement[method](...normalizedParams.value);
    if (normalizedParams.kind === "object") return statement[method](normalizedParams.value);
    return statement[method]();
  };

  const migrate = async ({ datasourceId, migrations }) => {
    const resolved = await ensureSqliteReady(datasourceId);
    if (!resolved.ok) return resolved;
    const normalizedMigrations = Array.isArray(migrations) ? migrations.map(entry => ({
      id: typeof entry?.id === "string" ? entry.id.trim() : "",
      sql: typeof entry?.sql === "string" ? entry.sql.trim() : ""
    })) : [];
    if (!normalizedMigrations.length) return { ok: false, status: 400, reason: "migrations required", datasource: resolved.datasource };
    if (normalizedMigrations.some(entry => !entry.id || !entry.sql)) {
      return { ok: false, status: 400, reason: "each migration requires id and sql", datasource: resolved.datasource };
    }
    const migrationTable = normalizeDbSqlIdentifier(resolved.datasource.migrationTable, "witness_sql_migrations");
    if (!migrationTable) return { ok: false, status: 400, reason: "db.sql.migrationTable must be a SQL identifier", datasource: resolved.datasource };
    const table = quoteSqlIdentifier(migrationTable);
    resolved.database.exec(`create table if not exists ${table} (id text primary key, applied_at text not null)`);
    const applied = [];
    const skipped = [];
    resolved.database.exec("begin");
    try {
      const lookup = resolved.database.prepare(`select id from ${table} where id = ?`);
      const insertLedger = resolved.database.prepare(`insert into ${table} (id, applied_at) values (?, ?)`);
      for (const migration of normalizedMigrations) {
        const existing = lookup.get(migration.id);
        if (existing) {
          skipped.push(migration.id);
          continue;
        }
        resolved.database.exec(migration.sql);
        insertLedger.run(migration.id, new Date().toISOString());
        applied.push(migration.id);
      }
      resolved.database.exec("commit");
      return { ok: true, datasource: resolved.datasource, applied, skipped };
    } catch (error) {
      try {
        resolved.database.exec("rollback");
      } catch {
        // ignore rollback failure
      }
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "migration failed", datasource: resolved.datasource };
    }
  };

  const query = async ({ datasourceId, sql, params }) => {
    const resolved = await ensureSqliteReady(datasourceId);
    if (!resolved.ok) return resolved;
    if (typeof sql !== "string" || !sql.trim()) return { ok: false, status: 400, reason: "sql required", datasource: resolved.datasource };
    const normalizedParams = normalizeDbSqlParams(params);
    if (!normalizedParams.ok) return { ...normalizedParams, datasource: resolved.datasource };
    try {
      const statement = resolved.database.prepare(sql);
      const rows = applyDbSqlParams(statement, "all", normalizedParams);
      return { ok: true, datasource: resolved.datasource, rows, rowCount: rows.length };
    } catch (error) {
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "query failed", datasource: resolved.datasource };
    }
  };

  const command = async ({ datasourceId, sql, params }) => {
    const resolved = await ensureSqliteReady(datasourceId);
    if (!resolved.ok) return resolved;
    if (typeof sql !== "string" || !sql.trim()) return { ok: false, status: 400, reason: "sql required", datasource: resolved.datasource };
    const normalizedParams = normalizeDbSqlParams(params);
    if (!normalizedParams.ok) return { ...normalizedParams, datasource: resolved.datasource };
    try {
      const statement = resolved.database.prepare(sql);
      const result = applyDbSqlParams(statement, "run", normalizedParams);
      return {
        ok: true,
        datasource: resolved.datasource,
        changes: Number(result?.changes ?? 0),
        lastInsertRowid: Number(result?.lastInsertRowid ?? 0)
      };
    } catch (error) {
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "command failed", datasource: resolved.datasource };
    }
  };

  const transaction = async ({ datasourceId, steps }) => {
    const resolved = await ensureSqliteReady(datasourceId);
    if (!resolved.ok) return resolved;
    const normalizedSteps = Array.isArray(steps) ? steps.map(step => ({
      kind: typeof step?.kind === "string" ? step.kind.trim().toLowerCase() : "",
      sql: typeof step?.sql === "string" ? step.sql.trim() : "",
      params: step?.params,
      name: typeof step?.name === "string" ? step.name.trim() : null
    })) : [];
    if (!normalizedSteps.length) return { ok: false, status: 400, reason: "transaction steps required", datasource: resolved.datasource };
    if (normalizedSteps.some(step => !["query", "command"].includes(step.kind) || !step.sql)) {
      return { ok: false, status: 400, reason: "transaction steps require kind=query|command and sql", datasource: resolved.datasource };
    }
    const results = [];
    resolved.database.exec("begin");
    try {
      for (const step of normalizedSteps) {
        const normalizedParams = normalizeDbSqlParams(step.params);
        if (!normalizedParams.ok) throw new Error(normalizedParams.reason);
        const statement = resolved.database.prepare(step.sql);
        if (step.kind === "query") {
          const rows = applyDbSqlParams(statement, "all", normalizedParams);
          results.push({ kind: step.kind, name: step.name, rowCount: rows.length, rows });
        } else {
          const outcome = applyDbSqlParams(statement, "run", normalizedParams);
          results.push({
            kind: step.kind,
            name: step.name,
            changes: Number(outcome?.changes ?? 0),
            lastInsertRowid: Number(outcome?.lastInsertRowid ?? 0)
          });
        }
      }
      resolved.database.exec("commit");
      return { ok: true, datasource: resolved.datasource, results };
    } catch (error) {
      try {
        resolved.database.exec("rollback");
      } catch {
        // ignore rollback failure
      }
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "transaction failed", datasource: resolved.datasource };
    }
  };

  return {
    listDatasources,
    getDatasource,
    resolveDatasource,
    testConnection,
    migrate,
    query,
    command,
    transaction,
    close() {
      for (const database of sqliteConnections.values()) {
        try {
          database.close();
        } catch {
          // ignore close failure
        }
      }
      sqliteConnections.clear();
    }
  };
}
