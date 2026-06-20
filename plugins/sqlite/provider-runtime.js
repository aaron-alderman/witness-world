import path from "node:path";
import { runtimeConfigLookup } from "../../src/runtime-config-utils.js";
import { dbSqlDatasourceId, dbSqlDatasourceTitle } from "./glue.js";

function normalizeDbSqlIdentifier(value, fallback) {
  const identifier = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ? identifier : null;
}

function normalizeDbSqlConfig(runtimeConfig, runtimeRoot, serverRunnerId) {
  const migrationTable = normalizeDbSqlIdentifier(
    runtimeConfigLookup(runtimeConfig, "db.sql.migrationTable"),
    "witness_sql_migrations"
  );
  if (!migrationTable) {
    return { ok: false, status: 400, reason: "db.sql.migrationTable must be a SQL identifier" };
  }
  const datasourceNameRaw = runtimeConfigLookup(runtimeConfig, "db.sql.datasource");
  const datasourceName = typeof datasourceNameRaw === "string" && datasourceNameRaw.trim()
    ? datasourceNameRaw.trim()
    : "main";
  const rawPath = runtimeConfigLookup(runtimeConfig, "db.sql.sqlite.path");
  const sqlitePath = typeof rawPath === "string" && rawPath.trim()
    ? (path.isAbsolute(rawPath.trim()) ? rawPath.trim() : path.resolve(runtimeRoot, rawPath.trim()))
    : path.resolve(runtimeRoot, "db", `${datasourceName}.sqlite`);
  return {
    ok: true,
    datasource: {
      id: dbSqlDatasourceId(serverRunnerId, datasourceName),
      title: dbSqlDatasourceTitle({ provider: "sqlite", datasourceName }),
      serverRunner: serverRunnerId,
      provider: "sqlite",
      datasourceName,
      migrationTable,
      status: "configured",
      path: sqlitePath,
      adapterStatus: "witness-core-required",
      lastError: null
    }
  };
}

function normalizeDbSqlParams(params) {
  if (params == null) return { ok: true, kind: "none", value: [] };
  if (Array.isArray(params)) return { ok: true, kind: "array", value: [...params] };
  if (params && typeof params === "object") return { ok: true, kind: "object", value: { ...params } };
  return { ok: false, status: 400, reason: "params must be an array or object" };
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
  adapterStatus = bridgeActive ? "witness-core" : "witness-core-required",
  lastError = null
} = {}) {
  return {
    adapterStatus,
    lastError,
    boundaryOwner: "witness-core",
    boundaryAuthority: "rust-owned",
    boundaryTransport: "capability.db.sqlite",
    boundaryScope: "canonical-runtime",
    canonicalBoundary: true,
    boundaryFallbackAllowed: false,
    boundaryAvailability: String(adapterStatus || "").includes("unavailable")
      || String(adapterStatus || "").includes("required")
      ? "unavailable"
      : "available"
  };
}

function decorateSqliteDatasource(datasource, {
  bridgeActive = false,
  adapterStatus = datasource?.adapterStatus ?? (bridgeActive ? "witness-core" : "witness-core-required"),
  lastError = datasource?.lastError ?? null
} = {}) {
  if (!datasource || datasource.provider !== "sqlite") return datasource ? { ...datasource } : datasource;
  return {
    ...datasource,
    ...sqliteBoundaryMetadata({ bridgeActive, adapterStatus, lastError })
  };
}

export function createDbSqlRuntime({
  runtimeConfig,
  runtimeRoot,
  serverRunnerId,
  getAppContext = null
}) {
  const currentConfig = () => normalizeDbSqlConfig(runtimeConfig, runtimeRoot, serverRunnerId);
  const witnessCoreBridge = () => getAppContext?.()?.witnessCoreBridge ?? null;
  const sqliteBridgeActive = () => Boolean(witnessCoreBridge()?.coreUrl);

  const datasourceStatus = () => {
    const normalized = currentConfig();
    if (!normalized.ok && !normalized.datasource) {
      return {
        ok: false,
        status: normalized.status || 503,
        reason: normalized.reason || "db.sql datasource invalid",
        datasource: null
      };
    }
    const bridgeActive = sqliteBridgeActive();
    return {
      ok: true,
      datasource: decorateSqliteDatasource(normalized.datasource, {
        bridgeActive,
        adapterStatus: bridgeActive ? "witness-core" : "witness-core-required"
      })
    };
  };

  const ensureReady = async () => {
    const resolved = datasourceStatus();
    if (!resolved.ok) return resolved;
    const bridge = witnessCoreBridge();
    if (!bridge?.coreUrl) {
      return {
        ok: false,
        status: 503,
        reason: "witness-core sqlite capability required for SQL runtime execution",
        datasource: decorateSqliteDatasource(resolved.datasource, {
          bridgeActive: false,
          adapterStatus: "witness-core-required",
          lastError: "witness-core sqlite capability required for SQL runtime execution"
        })
      };
    }
    return {
      ok: true,
      datasource: decorateSqliteDatasource(resolved.datasource, {
        bridgeActive: true,
        adapterStatus: "witness-core"
      }),
      bridge
    };
  };

  const migrate = async ({ migrations }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    const normalizedMigrations = Array.isArray(migrations) ? migrations.map(entry => ({
      id: typeof entry?.id === "string" ? entry.id.trim() : "",
      sql: typeof entry?.sql === "string" ? entry.sql.trim() : ""
    })) : [];
    if (!normalizedMigrations.length) {
      return { ok: false, status: 400, reason: "migrations required", datasource: resolved.datasource };
    }
    if (normalizedMigrations.some(entry => !entry.id || !entry.sql)) {
      return { ok: false, status: 400, reason: "each migration requires id and sql", datasource: resolved.datasource };
    }
    try {
      const result = await resolved.bridge.sqliteMigrate({
        path: resolved.datasource.path,
        migrationTable: resolved.datasource.migrationTable,
        migrations: normalizedMigrations
      });
      return { ...result, datasource: result?.datasource ?? resolved.datasource };
    } catch (error) {
      return witnessCoreSqliteFailureResult(error, resolved.datasource, "witness-core sqlite migrate failed");
    }
  };

  const query = async ({ sql, params }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    if (typeof sql !== "string" || !sql.trim()) {
      return { ok: false, status: 400, reason: "sql required", datasource: resolved.datasource };
    }
    const normalizedParams = normalizeDbSqlParams(params);
    if (!normalizedParams.ok) return { ...normalizedParams, datasource: resolved.datasource };
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
  };

  const command = async ({ sql, params }) => {
    const resolved = await ensureReady();
    if (!resolved.ok) return resolved;
    if (typeof sql !== "string" || !sql.trim()) {
      return { ok: false, status: 400, reason: "sql required", datasource: resolved.datasource };
    }
    const normalizedParams = normalizeDbSqlParams(params);
    if (!normalizedParams.ok) return { ...normalizedParams, datasource: resolved.datasource };
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
    if (!normalizedSteps.length) {
      return { ok: false, status: 400, reason: "transaction steps required", datasource: resolved.datasource };
    }
    if (normalizedSteps.some(step => !["query", "command"].includes(step.kind) || !step.sql)) {
      return { ok: false, status: 400, reason: "transaction steps require kind=query|command and sql", datasource: resolved.datasource };
    }
    try {
      const result = await resolved.bridge.sqliteTransaction({
        path: resolved.datasource.path,
        steps: normalizedSteps
      });
      return { ...result, datasource: result?.datasource ?? resolved.datasource };
    } catch (error) {
      return witnessCoreSqliteFailureResult(error, resolved.datasource, "witness-core sqlite transaction failed");
    }
  };

  return {
    inspect: () => datasourceStatus(),
    migrate,
    query,
    command,
    transaction,
    close: () => {}
  };
}
