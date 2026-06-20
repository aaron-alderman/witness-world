import fs from "node:fs/promises";
import path from "node:path";
import { isoAt, runtimeConfigLookup } from "../../src/runtime-config-utils.js";
import { dbSqlDatasourceId, dbSqlDatasourceTitle } from "./glue.js";
async function loadDatabaseSync(loadSqliteModule = () => import("node:sqlite")) {
  const sqliteModule = await loadSqliteModule();
  if (typeof sqliteModule?.DatabaseSync !== "function") {
    throw new Error("node:sqlite did not export DatabaseSync");
  }
  return sqliteModule.DatabaseSync;
}
function normalizeDbSqlIdentifier(value, fallback) {
  const identifier = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ? identifier : null;
}

function quoteSqlIdentifier(identifier) {
  return `"${String(identifier).replaceAll("\"", "\"\"")}"`;
}

function normalizeDbSqlConfig(runtimeConfig, runtimeRoot, serverRunnerId) {
  const providerRaw = runtimeConfigLookup(runtimeConfig, "db.sql.provider");
  const provider = typeof providerRaw === "string" && providerRaw.trim()
    ? providerRaw.trim().toLowerCase()
    : "sqlite";
  if (!["sqlite", "postgres", "mysql"].includes(provider)) {
    return { ok: false, status: 400, reason: "db.sql.provider must be sqlite, postgres, or mysql" };
  }
  const datasourceNameRaw = runtimeConfigLookup(runtimeConfig, "db.sql.datasource");
  const datasourceName = typeof datasourceNameRaw === "string" && datasourceNameRaw.trim()
    ? datasourceNameRaw.trim()
    : "main";
  const migrationTable = normalizeDbSqlIdentifier(runtimeConfigLookup(runtimeConfig, "db.sql.migrationTable"), "witness_sql_migrations");
  if (!migrationTable) {
    return { ok: false, status: 400, reason: "db.sql.migrationTable must be a SQL identifier" };
  }
  const datasource = {
    id: dbSqlDatasourceId(serverRunnerId, datasourceName),
    title: dbSqlDatasourceTitle({ provider, datasourceName }),
    serverRunner: serverRunnerId,
    provider,
    datasourceName,
    migrationTable,
    status: "configured",
    path: null,
    connectionString: null,
    adapterStatus: provider === "sqlite" ? "ready" : "declared",
    lastError: null
  };
  if (provider === "sqlite") {
    const rawPath = runtimeConfigLookup(runtimeConfig, "db.sql.sqlite.path");
    const sqlitePath = typeof rawPath === "string" && rawPath.trim()
      ? (path.isAbsolute(rawPath.trim()) ? rawPath.trim() : path.resolve(runtimeRoot, rawPath.trim()))
      : path.resolve(runtimeRoot, "db", `${datasourceName}.sqlite`);
    datasource.path = sqlitePath;
    return { ok: true, datasource };
  }
  const providerKey = `db.sql.${provider}.connectionString`;
  const connectionRaw = runtimeConfigLookup(runtimeConfig, providerKey) ?? runtimeConfigLookup(runtimeConfig, "db.sql.connectionString");
  datasource.connectionString = typeof connectionRaw === "string" && connectionRaw.trim() ? connectionRaw.trim() : null;
  if (!datasource.connectionString) {
    datasource.status = "misconfigured";
    datasource.lastError = `${providerKey} required`;
    return { ok: false, status: 503, reason: `${providerKey} required`, datasource };
  }
  datasource.status = "unsupported";
  datasource.lastError = `${provider} adapter not wired in this runtime slice`;
  return { ok: true, datasource };
}

function normalizeDbSqlParams(params) {
  if (params == null) return { ok: true, kind: "none", value: [] };
  if (Array.isArray(params)) return { ok: true, kind: "array", value: [...params] };
  if (params && typeof params === "object") return { ok: true, kind: "object", value: { ...params } };
  return { ok: false, status: 400, reason: "params must be an array or object" };
}

function applyDbSqlParams(statement, method, normalizedParams) {
  if (normalizedParams.kind === "array") return statement[method](...normalizedParams.value);
  if (normalizedParams.kind === "object") return statement[method](normalizedParams.value);
  return statement[method]();
}

export function createDbSqlRuntime({
  runtimeConfig,
  runtimeRoot,
  serverRunnerId,
  loadSqliteModule = () => import("node:sqlite")
}) {
  const sqliteConnections = new Map();
  let sqliteSupportError = null;
  const currentConfig = () => normalizeDbSqlConfig(runtimeConfig, runtimeRoot, serverRunnerId);

  const datasourceStatus = () => {
    const normalized = currentConfig();
    if (!normalized.ok && !normalized.datasource) {
      return { ok: false, status: normalized.status || 503, reason: normalized.reason || "db.sql datasource invalid", datasource: null };
    }
    const datasource = normalized.datasource;
    if (datasource.provider === "sqlite") return { ok: true, datasource };
    if (!normalized.ok) return { ok: false, status: normalized.status || 503, reason: normalized.reason || "db.sql datasource invalid", datasource };
    return {
      ok: false,
      status: 501,
      reason: `${datasource.provider} adapter not wired in this runtime slice`,
      datasource: {
        ...datasource,
        status: "unsupported",
        lastError: `${datasource.provider} adapter not wired in this runtime slice`
      }
    };
  };

  const openSqlite = async datasource => {
    if (sqliteConnections.has(datasource.path)) return { ok: true, database: sqliteConnections.get(datasource.path) };
    await fs.mkdir(path.dirname(datasource.path), { recursive: true });
    let DatabaseSync = null;
    try {
      DatabaseSync = await loadDatabaseSync(loadSqliteModule);
    } catch (error) {
      sqliteSupportError = error;
      return { ok: false, reason: error instanceof Error ? error.message : "node:sqlite unavailable" };
    }
    const database = new DatabaseSync(datasource.path);
    sqliteConnections.set(datasource.path, database);
    return { ok: true, database };
  };

  const ensureReady = async () => {
    const resolved = datasourceStatus();
    if (!resolved.ok) return resolved;
    const opened = await openSqlite(resolved.datasource);
    if (!opened.ok) {
      return {
        ok: false,
        status: 503,
        reason: `sqlite runtime unavailable: ${opened.reason}`,
        datasource: {
          ...resolved.datasource,
          adapterStatus: "unavailable",
          lastError: sqliteSupportError instanceof Error ? sqliteSupportError.message : opened.reason
        }
      };
    }
    const { database } = opened;
    return { ok: true, datasource: resolved.datasource, database };
  };

  const ensureMigrationLedger = (database, datasource) => {
    const table = quoteSqlIdentifier(datasource.migrationTable);
    database.exec(`create table if not exists ${table} (id text primary key, applied_at text not null)`);
    return table;
  };

  const migrate = async ({ migrations }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    const normalizedMigrations = Array.isArray(migrations) ? migrations.map(entry => ({
      id: typeof entry?.id === "string" ? entry.id.trim() : "",
      sql: typeof entry?.sql === "string" ? entry.sql.trim() : ""
    })) : [];
    if (!normalizedMigrations.length) return { ok: false, status: 400, reason: "migrations required", datasource: resolved.datasource };
    if (normalizedMigrations.some(entry => !entry.id || !entry.sql)) {
      return { ok: false, status: 400, reason: "each migration requires id and sql", datasource: resolved.datasource };
    }
    const ledger = ensureMigrationLedger(resolved.database, resolved.datasource);
    const applied = [];
    const skipped = [];
    resolved.database.exec("begin");
    try {
      const lookup = resolved.database.prepare(`select id from ${ledger} where id = ?`);
      const insertLedger = resolved.database.prepare(`insert into ${ledger} (id, applied_at) values (?, ?)`);
      for (const migration of normalizedMigrations) {
        const existing = lookup.get(migration.id);
        if (existing) {
          skipped.push(migration.id);
          continue;
        }
        resolved.database.exec(migration.sql);
        insertLedger.run(migration.id, isoAt(Date.now()));
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

  const query = async ({ sql, params }) => {
    const resolved = await ensureReady();
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

  const command = async ({ sql, params }) => {
    const resolved = await ensureReady();
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

  const transaction = async ({ steps }) => {
    const resolved = await ensureReady();
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
    inspect: () => datasourceStatus(),
    migrate,
    query,
    command,
    transaction,
    close: () => {
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
