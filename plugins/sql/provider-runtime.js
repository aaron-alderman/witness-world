import fs from "node:fs/promises";
import path from "node:path";
import { moduleProjectors } from "../../src/modules.js";

async function loadDatabaseSync(loadSqliteModule = () => import("node:sqlite")) {
  const sqliteModule = await loadSqliteModule();
  if (typeof sqliteModule?.DatabaseSync !== "function") {
    throw new Error("node:sqlite did not export DatabaseSync");
  }
  return sqliteModule.DatabaseSync;
}

function quoteSqlIdentifier(identifier) {
  return `"${String(identifier).replaceAll("\"", "\"\"")}"`;
}

function quoteMySqlIdentifier(identifier) {
  return `\`${String(identifier).replaceAll("`", "``")}\``;
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

function witnessCoreSqliteFailureResult(error, datasource, fallbackReason = "witness-core sqlite capability unavailable") {
  const status = Number(error?.status || 503);
  const reason = error instanceof Error
    ? (error.message || fallbackReason)
    : fallbackReason;
  return {
    ok: false,
    status,
    reason,
    datasource: decorateSqliteDatasource(datasource, {
      bridgeActive: true,
      adapterStatus: "witness-core-unavailable",
      lastError: reason
    })
  };
}

function sqliteBoundaryMetadata({
  bridgeActive = false,
  adapterStatus = bridgeActive ? "witness-core" : "ready",
  lastError = null
} = {}) {
  return {
    adapterStatus,
    lastError,
    boundaryOwner: bridgeActive ? "witness-core" : "node",
    boundaryAuthority: bridgeActive ? "rust-owned" : "transitional-node-fallback",
    boundaryTransport: bridgeActive ? "capability.db.sqlite" : "node:sqlite",
    boundaryFallbackAllowed: bridgeActive !== true,
    boundaryAvailability: String(adapterStatus || "").includes("unavailable") ? "unavailable" : "available"
  };
}

function decorateSqliteDatasource(datasource, {
  bridgeActive = false,
  adapterStatus = datasource?.adapterStatus ?? (bridgeActive ? "witness-core" : "ready"),
  lastError = datasource?.lastError ?? null
} = {}) {
  if (!datasource || datasource.provider !== "sqlite") return datasource ? { ...datasource } : datasource;
  return {
    ...datasource,
    ...sqliteBoundaryMetadata({ bridgeActive, adapterStatus, lastError })
  };
}

export function createDbSqlRuntime({
  project,
  runtimeRoot,
  serverRunnerId,
  getAppContext,
  postgresAdapter = null,
  mysqlAdapter = null,
  loadSqliteModule = () => import("node:sqlite")
}) {
  const sqliteConnections = new Map();
  let sqliteSupportError = null;
  const witnessCoreBridge = () => getAppContext?.()?.witnessCoreBridge ?? null;
  const sqliteBridgeActive = () => Boolean(witnessCoreBridge()?.coreUrl);
  const decorateRuntimeDatasource = datasource => {
    if (!datasource || datasource.provider !== "sqlite") return datasource ? { ...datasource } : datasource;
    return decorateSqliteDatasource({
      ...datasource,
      resolvedPath: sqlitePathFor(runtimeRoot, datasource)
    }, {
      bridgeActive: sqliteBridgeActive()
    });
  };
  const listDatasources = () => datasourcesForRunner(project, serverRunnerId).map(decorateRuntimeDatasource);
  const getDatasource = datasourceId => decorateRuntimeDatasource(datasourceForRunner(project, serverRunnerId, datasourceId));

  const openSqlite = async datasource => {
    const sqlitePath = sqlitePathFor(runtimeRoot, datasource);
    const bridge = witnessCoreBridge();
    if (bridge?.coreUrl) {
      return { ok: true, remote: true, bridge, sqlitePath };
    }
    if (sqliteConnections.has(sqlitePath)) return { ok: true, database: sqliteConnections.get(sqlitePath), sqlitePath };
    await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
    let DatabaseSync = null;
    try {
      DatabaseSync = await loadDatabaseSync(loadSqliteModule);
    } catch (error) {
      sqliteSupportError = error;
      return { ok: false, reason: error instanceof Error ? error.message : "node:sqlite unavailable" };
    }
    const database = new DatabaseSync(sqlitePath);
    sqliteConnections.set(sqlitePath, database);
    return { ok: true, database, sqlitePath };
  };

  const withPostgresClient = async (resolved, callback) => {
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
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  };

  const withMySqlConnection = async (resolved, callback) => {
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
    try {
      return await callback(connection);
    } finally {
      await connection.end();
    }
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
        datasource: decorateSqliteDatasource({
          ...datasource,
          path: sqlitePathFor(runtimeRoot, datasource)
        }, {
          bridgeActive: sqliteBridgeActive()
        })
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
        const opened = await openSqlite(resolved.datasource);
        if (!opened.ok) {
          return {
            ok: false,
            status: 503,
            reason: `sqlite runtime unavailable: ${opened.reason}`,
            datasource: decorateSqliteDatasource(resolved.datasource, {
              bridgeActive: false,
              adapterStatus: "unavailable",
              lastError: sqliteSupportError instanceof Error ? sqliteSupportError.message : opened.reason
            })
          };
        }
        if (opened.remote) {
          try {
            const result = await opened.bridge.sqliteTestConnection({
              path: opened.sqlitePath,
              migrationTable: resolved.datasource.migrationTable
            });
            return { ...result, datasource: result?.datasource ?? resolved.datasource };
          } catch (error) {
            return witnessCoreSqliteFailureResult(error, resolved.datasource, "witness-core sqlite testConnection failed");
          }
        }
        const { database } = opened;
        database.prepare("select 1 as ok").get();
        return { ok: true, datasource: resolved.datasource };
      }
      if (resolved.datasource.provider === "postgres") {
        await withPostgresClient(resolved, client => client.query("select 1 as ok"));
        return { ok: true, datasource: resolved.datasource };
      }
      if (resolved.datasource.provider === "mysql") {
        await withMySqlConnection(resolved, connection => connection.query("select 1 as ok"));
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
    const opened = await openSqlite(resolved.datasource);
    if (!opened.ok) {
      return {
        ok: false,
        status: 503,
        reason: `sqlite runtime unavailable: ${opened.reason}`,
        datasource: decorateSqliteDatasource(resolved.datasource, {
          bridgeActive: false,
          adapterStatus: "unavailable",
          lastError: sqliteSupportError instanceof Error ? sqliteSupportError.message : opened.reason
        })
      };
    }
    if (opened.remote) {
      return {
        ok: true,
        datasource: decorateSqliteDatasource({
          ...resolved.datasource,
          path: opened.sqlitePath
        }, {
          bridgeActive: true,
          adapterStatus: "witness-core"
        }),
        remote: true,
        bridge: opened.bridge
      };
    }
    const { database, sqlitePath } = opened;
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
    const migrationTable = normalizeDbSqlIdentifier(resolved.datasource.migrationTable, "witness_sql_migrations");
    if (!migrationTable) return { ok: false, status: 400, reason: "db.sql.migrationTable must be a SQL identifier", datasource: resolved.datasource };
    const normalizedMigrations = Array.isArray(migrations) ? migrations.map(entry => ({
      id: typeof entry?.id === "string" ? entry.id.trim() : "",
      sql: typeof entry?.sql === "string" ? entry.sql.trim() : ""
    })) : [];
    if (!normalizedMigrations.length) return { ok: false, status: 400, reason: "migrations required", datasource: resolved.datasource };
    if (normalizedMigrations.some(entry => !entry.id || !entry.sql)) {
      return { ok: false, status: 400, reason: "each migration requires id and sql", datasource: resolved.datasource };
    }
    if (resolved.remote) {
      try {
        const result = await resolved.bridge.sqliteMigrate({
          path: resolved.datasource.path,
          migrationTable,
          migrations: normalizedMigrations
        });
        return { ...result, datasource: result?.datasource ?? resolved.datasource };
      } catch (error) {
        return witnessCoreSqliteFailureResult(error, resolved.datasource, "witness-core sqlite migrate failed");
      }
    }
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
    if (resolved.remote) {
      try {
        const result = await resolved.bridge.sqliteQuery({
          path: resolved.datasource.path,
          sql,
          params: normalizedParams.kind === "none" ? null : normalizedParams.value
        });
        return { ...result, datasource: result?.datasource ?? resolved.datasource };
      } catch (error) {
        return witnessCoreSqliteFailureResult(error, resolved.datasource, "witness-core sqlite query failed");
      }
    }
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
    if (resolved.remote) {
      try {
        const result = await resolved.bridge.sqliteCommand({
          path: resolved.datasource.path,
          sql,
          params: normalizedParams.kind === "none" ? null : normalizedParams.value
        });
        return { ...result, datasource: result?.datasource ?? resolved.datasource };
      } catch (error) {
        return witnessCoreSqliteFailureResult(error, resolved.datasource, "witness-core sqlite command failed");
      }
    }
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
    if (resolved.remote) {
      try {
        const result = await resolved.bridge.sqliteTransaction({
          path: resolved.datasource.path,
          steps: normalizedSteps
        });
        return { ...result, datasource: result?.datasource ?? resolved.datasource };
      } catch (error) {
        return witnessCoreSqliteFailureResult(error, resolved.datasource, "witness-core sqlite transaction failed");
      }
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

  const readOrderedBatch = async ({
    datasourceId,
    table,
    schema = "",
    columns = [],
    progressField,
    lowerBound = null,
    rowLimit = 500
  }) => {
    const resolved = await resolveDatasource(datasourceId);
    if (!resolved.ok) return resolved;
    if (resolved.datasource.provider !== "mysql") {
      return { ok: false, status: 501, reason: `${resolved.datasource.provider} source reads are not supported for pipeline execution yet`, datasource: resolved.datasource };
    }
    const safeColumns = Array.isArray(columns) && columns.length
      ? columns.map(column => String(column))
      : ["*"];
    if (!progressField || typeof progressField !== "string") {
      return { ok: false, status: 400, reason: "progressField required", datasource: resolved.datasource };
    }
    const safeLimit = Math.max(1, Number.parseInt(String(rowLimit ?? 500), 10) || 500);
    const tableRef = schema
      ? `${quoteMySqlIdentifier(schema)}.${quoteMySqlIdentifier(table)}`
      : quoteMySqlIdentifier(table);
    const selectList = safeColumns[0] === "*"
      ? "*"
      : safeColumns.map(quoteMySqlIdentifier).join(", ");
    const params = [];
    let sql = `select ${selectList} from ${tableRef}`;
    if (lowerBound != null) {
      sql += ` where ${quoteMySqlIdentifier(progressField)} >= ?`;
      params.push(lowerBound);
    }
    sql += ` order by ${quoteMySqlIdentifier(progressField)} asc limit ?`;
    params.push(safeLimit);
    try {
      const rows = await withMySqlConnection(resolved, async connection => {
        const [resultRows] = await connection.query(sql, params);
        return Array.isArray(resultRows) ? resultRows : [];
      });
      return { ok: true, datasource: resolved.datasource, rows, rowCount: rows.length, sql, params };
    } catch (error) {
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "source read failed", datasource: resolved.datasource };
    }
  };

  const writeRows = async ({
    datasourceId,
    table,
    schema = "",
    rows = [],
    writeMode,
    keyFields = []
  }) => {
    const resolved = await resolveDatasource(datasourceId);
    if (!resolved.ok) return resolved;
    if (resolved.datasource.provider !== "postgres") {
      return { ok: false, status: 501, reason: `${resolved.datasource.provider} destination writes are not supported for pipeline execution yet`, datasource: resolved.datasource };
    }
    const normalizedRows = Array.isArray(rows) ? rows.filter(row => row && typeof row === "object") : [];
    if (!normalizedRows.length) {
      return { ok: true, datasource: resolved.datasource, rowCount: 0, changes: 0 };
    }
    const columns = Object.keys(normalizedRows[0]);
    if (!columns.length) {
      return { ok: false, status: 400, reason: "rows must contain at least one column", datasource: resolved.datasource };
    }
    const safeKeyFields = [...new Set((Array.isArray(keyFields) ? keyFields : []).map(field => String(field)).filter(Boolean))];
    const tableRef = schema
      ? `${quoteSqlIdentifier(schema)}.${quoteSqlIdentifier(table)}`
      : quoteSqlIdentifier(table);
    const values = [];
    const tuples = normalizedRows.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${(rowIndex * columns.length) + columnIndex + 1}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    let sql = `insert into ${tableRef} (${columns.map(quoteSqlIdentifier).join(", ")}) values ${tuples.join(", ")}`;
    if (writeMode === "upsert") {
      if (!safeKeyFields.length) {
        return { ok: false, status: 400, reason: "upsert requires key fields", datasource: resolved.datasource };
      }
      const nonKeyFields = columns.filter(column => !safeKeyFields.includes(column));
      if (!nonKeyFields.length) {
        sql += ` on conflict (${safeKeyFields.map(quoteSqlIdentifier).join(", ")}) do nothing`;
      } else {
        sql += ` on conflict (${safeKeyFields.map(quoteSqlIdentifier).join(", ")}) do update set ${nonKeyFields.map(column => `${quoteSqlIdentifier(column)} = excluded.${quoteSqlIdentifier(column)}`).join(", ")}`;
      }
    } else if (writeMode === "insert_ignore") {
      if (!safeKeyFields.length) {
        return { ok: false, status: 400, reason: "insert_ignore requires key fields", datasource: resolved.datasource };
      }
      sql += ` on conflict (${safeKeyFields.map(quoteSqlIdentifier).join(", ")}) do nothing`;
    } else if (writeMode !== "append") {
      return { ok: false, status: 400, reason: `unsupported write mode ${writeMode}`, datasource: resolved.datasource };
    }
    try {
      const result = await withPostgresClient(resolved, client => client.query(sql, values));
      return {
        ok: true,
        datasource: resolved.datasource,
        rowCount: normalizedRows.length,
        changes: Number(result?.rowCount ?? normalizedRows.length)
      };
    } catch (error) {
      return { ok: false, status: 500, reason: error instanceof Error ? error.message : "destination write failed", datasource: resolved.datasource };
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
    readOrderedBatch,
    writeRows,
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
