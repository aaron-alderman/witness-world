import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { relation, thing } from "./kernel.js";
import { moduleProjectors } from "./modules.js";
import { isoAt, nonNegativeInteger, positiveInteger, runtimeConfigLookup } from "./runtime-config-utils.js";
import { dbSqlDatasourceId, dbSqlDatasourceTitle } from "./runtime-practical-backend-glue.js";

function parseIsoAt(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJobQueueConfig(runtimeConfig) {
  return {
    pollMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.pollMs"), 25),
    maxAttempts: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.maxAttempts"), 3),
    retryDelayMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "jobs.queue.retryDelayMs"), 50)
  };
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

function normalizeSearchIndexConfig(runtimeConfig, runtimeRoot, storage, serverRunnerId) {
  const providerRaw = runtimeConfigLookup(runtimeConfig, "search.index.provider");
  const provider = typeof providerRaw === "string" && providerRaw.trim() ? providerRaw.trim() : "local-text";
  const searchRoot = storage?.searchRoot || path.resolve(runtimeRoot || process.cwd(), "search");
  const maxTextBytes = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.maxTextBytes"), 262144);
  const defaultLimit = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.defaultLimit"), 10);
  const assetRefreshPolicyRaw = typeof runtimeConfigLookup(runtimeConfig, "search.index.assetRefreshPolicy") === "string"
    ? runtimeConfigLookup(runtimeConfig, "search.index.assetRefreshPolicy").trim().toLowerCase()
    : "";
  const assetRefreshPolicy = assetRefreshPolicyRaw || "on-ingest";
  const indexId = `searchIndex:${serverRunnerId}:main`;
  const title = `${serverRunnerId} Search Index`;
  if (!["on-ingest", "manual"].includes(assetRefreshPolicy)) {
    return {
      ok: false,
      status: 400,
      reason: "search.index.assetRefreshPolicy must be on-ingest or manual",
      index: {
        id: indexId,
        title,
        serverRunner: serverRunnerId,
        provider,
        name: "main",
        path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
        status: "failed",
        lastError: "search.index.assetRefreshPolicy must be on-ingest or manual"
      }
    };
  }
  if (provider !== "local-text") {
    return {
      ok: false,
      status: 501,
      reason: `${provider} search adapter not wired in this runtime slice`,
      index: {
        id: indexId,
        title,
        serverRunner: serverRunnerId,
        provider,
        name: "main",
        path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
        status: "unsupported",
        lastError: `${provider} search adapter not wired in this runtime slice`
      }
    };
  }
  return {
    ok: true,
    provider,
    searchRoot,
    maxTextBytes,
    defaultLimit,
    assetRefreshPolicy,
    index: {
      id: indexId,
      title,
      serverRunner: serverRunnerId,
      provider,
      name: "main",
      path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
      status: "ready",
      lastError: null
    }
  };
}

function tokenizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g) ?? [];
}

function searchTermCounts(text) {
  const counts = Object.create(null);
  for (const term of tokenizeSearchText(text)) counts[term] = (counts[term] ?? 0) + 1;
  return counts;
}

function looksTextSearchMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value.startsWith("text/")
    || value === "application/json"
    || value === "application/ld+json"
    || value === "application/xml"
    || value === "image/svg+xml"
    || value.includes("javascript")
    || value.includes("xml");
}

function searchSnippet(text, terms) {
  const source = String(text || "");
  if (!source) return "";
  const lowered = source.toLowerCase();
  let index = -1;
  for (const term of terms) {
    const found = lowered.indexOf(term.toLowerCase());
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) return source.slice(0, 140);
  const start = Math.max(0, index - 40);
  const end = Math.min(source.length, index + 100);
  return source.slice(start, end);
}

export function createDbSqlRuntime({ runtimeConfig, runtimeRoot, serverRunnerId }) {
  const sqliteConnections = new Map();
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
    if (sqliteConnections.has(datasource.path)) return sqliteConnections.get(datasource.path);
    await fs.mkdir(path.dirname(datasource.path), { recursive: true });
    const database = new DatabaseSync(datasource.path);
    sqliteConnections.set(datasource.path, database);
    return database;
  };

  const ensureReady = async () => {
    const resolved = datasourceStatus();
    if (!resolved.ok) return resolved;
    const database = await openSqlite(resolved.datasource);
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

export function createSearchIndexRuntime({ world, runtimeConfig, runtimeRoot, serverRunnerId, storage }) {
  let stateLoaded = false;
  let stateCache = null;
  let buildSequence = 0;

  const currentConfig = () => normalizeSearchIndexConfig(runtimeConfig, runtimeRoot, storage, serverRunnerId);
  const assetsRootForRuntime = () => storage?.assetsRoot || path.resolve(runtimeRoot || process.cwd(), "assets");
  const assetPathForRuntime = assetId => path.join(assetsRootForRuntime(), encodeURIComponent(assetId), "blob");
  const assetDerivedTextPathForRuntime = assetId => path.join(assetsRootForRuntime(), encodeURIComponent(assetId), "derived", "text.txt");

  const sanitizeDocument = (document, ordinal) => {
    const id = typeof document?.id === "string" && document.id.trim() ? document.id.trim() : `document:${ordinal + 1}`;
    const title = typeof document?.title === "string" && document.title.trim() ? document.title.trim() : id;
    const text = typeof document?.text === "string" ? document.text : "";
    const context = typeof document?.context === "string" && document.context.trim() ? document.context.trim() : null;
    if (!text.trim()) return { ok: false, status: 400, reason: `document ${id} requires text` };
    return {
      ok: true,
      descriptor: {
        type: "document",
        id,
        title,
        text,
        context
      }
    };
  };

  const normalizeSourceDescriptors = ({ documents, assetIds }) => {
    const sourceDescriptors = [];
    const seenAssets = new Set();
    const seenDocs = new Set();
    for (const [index, document] of (Array.isArray(documents) ? documents : []).entries()) {
      const normalized = sanitizeDocument(document, index);
      if (!normalized.ok) return normalized;
      if (seenDocs.has(normalized.descriptor.id)) return { ok: false, status: 409, reason: `duplicate document id ${normalized.descriptor.id}` };
      seenDocs.add(normalized.descriptor.id);
      sourceDescriptors.push(normalized.descriptor);
    }
    for (const rawId of Array.isArray(assetIds) ? assetIds : []) {
      const assetId = typeof rawId === "string" ? rawId.trim() : "";
      if (!assetId) return { ok: false, status: 400, reason: "assetIds require non-empty strings" };
      if (seenAssets.has(assetId)) continue;
      seenAssets.add(assetId);
      sourceDescriptors.push({ type: "asset", assetId });
    }
    if (!sourceDescriptors.length) return { ok: false, status: 400, reason: "documents or assetIds required" };
    return { ok: true, sourceDescriptors };
  };

  const resolveDocumentSource = descriptor => ({
    ok: true,
    document: {
      id: descriptor.id,
      title: descriptor.title,
      context: descriptor.context ?? null,
      sourceKind: "document",
      assetId: null,
      mimeType: "text/plain",
      text: descriptor.text
    }
  });

  const resolveAssetSource = async (descriptor, config) => {
    const asset = world.project(moduleProjectors.assetIndex).byId[descriptor.assetId] ?? null;
    if (!asset) return { ok: false, status: 404, reason: `asset ${descriptor.assetId} not found` };
    const metadataText = [asset.title, asset.mimeType, asset.context].filter(Boolean).join(" ");
    let text = metadataText;
    if (typeof asset.textRef === "string" && asset.textRef) {
      try {
        const extractedText = await fs.readFile(assetDerivedTextPathForRuntime(asset.id), "utf8");
        text = `${metadataText}\n${extractedText}`.trim();
      } catch (error) {
        return { ok: false, status: 500, reason: error instanceof Error ? error.message : `asset ${asset.id} extracted text unreadable` };
      }
    } else if (looksTextSearchMime(asset.mimeType)) {
      try {
        const bytes = await fs.readFile(assetPathForRuntime(asset.id));
        text = `${metadataText}\n${bytes.subarray(0, config.maxTextBytes).toString("utf8")}`.trim();
      } catch (error) {
        return { ok: false, status: 500, reason: error instanceof Error ? error.message : `asset ${asset.id} content unreadable` };
      }
    }
    return {
      ok: true,
      document: {
        id: asset.id,
        title: asset.title,
        context: asset.context ?? null,
        sourceKind: "asset",
        assetId: asset.id,
        mimeType: asset.mimeType,
        text
      }
    };
  };

  const resolveSourceDocuments = async (sourceDescriptors, config) => {
    const documents = [];
    for (const descriptor of sourceDescriptors) {
      const resolved = descriptor.type === "asset"
        ? await resolveAssetSource(descriptor, config)
        : resolveDocumentSource(descriptor);
      if (!resolved.ok) return resolved;
      const terms = searchTermCounts(resolved.document.text);
      documents.push({
        ...resolved.document,
        termCounts: terms,
        termCount: Object.values(terms).reduce((sum, count) => sum + count, 0)
      });
    }
    return { ok: true, documents };
  };

  const summarizeState = state => ({
    id: state.id,
    title: state.title,
    serverRunner: state.serverRunner,
    provider: state.provider,
    name: state.name,
    status: state.status ?? "ready",
    sourceCount: Array.isArray(state.sourceDescriptors) ? state.sourceDescriptors.length : 0,
    documentCount: Array.isArray(state.documents) ? state.documents.length : 0,
    assetCount: (state.documents ?? []).filter(document => document.sourceKind === "asset").length,
    queryCount: Number(state.queryCount ?? 0),
    lastBuiltAt: state.lastBuiltAt ?? null,
    lastQueryAt: state.lastQueryAt ?? null,
    path: state.path,
    lastError: state.lastError ?? null
  });

  const loadState = async config => {
    if (stateLoaded) return stateCache;
    try {
      const raw = await fs.readFile(config.index.path, "utf8");
      const parsed = JSON.parse(raw);
      stateCache = {
        ...parsed,
        id: parsed?.id || config.index.id,
        title: parsed?.title || config.index.title,
        serverRunner: parsed?.serverRunner || serverRunnerId,
        provider: parsed?.provider || config.provider,
        name: parsed?.name || "main",
        path: config.index.path,
        documents: Array.isArray(parsed?.documents) ? parsed.documents : [],
        sourceDescriptors: Array.isArray(parsed?.sourceDescriptors) ? parsed.sourceDescriptors : [],
        queryCount: Number(parsed?.queryCount ?? 0),
        lastBuiltAt: parsed?.lastBuiltAt ?? null,
        lastQueryAt: parsed?.lastQueryAt ?? null,
        status: parsed?.status || "ready",
        lastError: parsed?.lastError ?? null
      };
    } catch {
      stateCache = null;
    }
    stateLoaded = true;
    return stateCache;
  };

  const persistState = async state => {
    await fs.mkdir(path.dirname(state.path), { recursive: true });
    await fs.writeFile(state.path, JSON.stringify(state, null, 2), "utf8");
    stateCache = state;
    stateLoaded = true;
    return state;
  };

  const build = async ({ documents, assetIds }) => {
    const config = currentConfig();
    if (!config.ok) return config;
    const normalized = normalizeSourceDescriptors({ documents, assetIds });
    if (!normalized.ok) return normalized;
    const resolved = await resolveSourceDocuments(normalized.sourceDescriptors, config);
    if (!resolved.ok) return resolved;
    const existing = await loadState(config);
    buildSequence += 1;
    const state = {
      version: 1,
      id: config.index.id,
      title: config.index.title,
      serverRunner: serverRunnerId,
      provider: config.provider,
      name: "main",
      path: config.index.path,
      sourceDescriptors: normalized.sourceDescriptors,
      documents: resolved.documents,
      queryCount: Number(existing?.queryCount ?? 0),
      lastQueryAt: existing?.lastQueryAt ?? null,
      lastBuiltAt: isoAt(Date.now()),
      status: "ready",
      lastError: null,
      buildSequence
    };
    await persistState(state);
    return { ok: true, index: summarizeState(state), sourceDescriptors: normalized.sourceDescriptors };
  };

  const reindex = async () => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: false, status: 404, reason: "search index not built", index: null };
    const resolved = await resolveSourceDocuments(state.sourceDescriptors, config);
    if (!resolved.ok) return resolved;
    buildSequence += 1;
    const nextState = {
      ...state,
      provider: config.provider,
      path: config.index.path,
      documents: resolved.documents,
      lastBuiltAt: isoAt(Date.now()),
      status: "ready",
      lastError: null,
      buildSequence
    };
    await persistState(nextState);
    return { ok: true, index: summarizeState(nextState), sourceDescriptors: nextState.sourceDescriptors };
  };

  const refreshAsset = async assetId => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: true, changed: false, disposition: "not-built", index: null };
    if (config.assetRefreshPolicy !== "on-ingest") {
      return { ok: true, changed: false, disposition: config.assetRefreshPolicy, policy: config.assetRefreshPolicy, index: summarizeState(state) };
    }
    const includesAsset = (state.sourceDescriptors ?? []).some(descriptor => descriptor?.type === "asset" && descriptor.assetId === assetId);
    if (!includesAsset) {
      return { ok: true, changed: false, disposition: "not-indexed", policy: config.assetRefreshPolicy, index: summarizeState(state) };
    }
    const rebuilt = await reindex();
    if (!rebuilt.ok) return rebuilt;
    return { ok: true, changed: true, disposition: "reindexed", policy: config.assetRefreshPolicy, index: rebuilt.index, sourceDescriptors: rebuilt.sourceDescriptors };
  };

  const inspectAsset = async assetId => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) {
      return {
        ok: true,
        built: false,
        indexed: false,
        stale: false,
        policy: config.assetRefreshPolicy,
        disposition: "not-built",
        index: null,
        lastBuiltAt: null,
        assetUpdatedAt: null
      };
    }
    const includesAsset = (state.sourceDescriptors ?? []).some(descriptor => descriptor?.type === "asset" && descriptor.assetId === assetId);
    const asset = world.project(moduleProjectors.assetIndex).byId[assetId] ?? null;
    const lastBuiltAt = typeof state.lastBuiltAt === "string" ? state.lastBuiltAt : null;
    const assetUpdatedAt = typeof asset?.processingUpdatedAt === "string" ? asset.processingUpdatedAt : null;
    const lastBuiltAtMs = parseIsoAt(lastBuiltAt);
    const assetUpdatedAtMs = parseIsoAt(assetUpdatedAt);
    const stale = Boolean(includesAsset && assetUpdatedAtMs != null && (lastBuiltAtMs == null || assetUpdatedAtMs > lastBuiltAtMs));
    return {
      ok: true,
      built: true,
      indexed: includesAsset,
      stale,
      policy: config.assetRefreshPolicy,
      disposition: !includesAsset ? "not-indexed" : (stale ? "stale" : "ready"),
      index: summarizeState(state),
      lastBuiltAt,
      assetUpdatedAt
    };
  };

  const reindexAsset = async assetId => {
    const inspected = await inspectAsset(assetId);
    if (!inspected.ok) return inspected;
    if (!inspected.built) return { ok: false, status: 404, reason: "search index not built", repair: inspected };
    if (!inspected.indexed) return { ok: false, status: 409, reason: "asset not indexed in current search index", repair: inspected };
    const rebuilt = await reindex();
    if (!rebuilt.ok) return rebuilt;
    return {
      ok: true,
      changed: true,
      index: rebuilt.index,
      repair: {
        ...inspected,
        stale: false,
        disposition: "reindexed",
        lastBuiltAt: rebuilt.index.lastBuiltAt,
        index: rebuilt.index
      }
    };
  };

  const inspect = async () => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: true, index: null };
    return { ok: true, index: summarizeState(state) };
  };

  const query = async ({ q, limit }) => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: false, status: 404, reason: "search index not built", index: null };
    const queryText = typeof q === "string" ? q.trim() : "";
    const terms = tokenizeSearchText(queryText);
    if (!terms.length) return { ok: false, status: 400, reason: "query text required", index: summarizeState(state) };
    const cappedLimit = Math.max(1, Math.min(50, positiveInteger(limit, config.defaultLimit)));
    const hits = state.documents
      .map(document => {
        let score = 0;
        for (const term of terms) score += Number(document.termCounts?.[term] ?? 0);
        return {
          ...document,
          score,
          matchedTerms: terms.filter(term => Number(document.termCounts?.[term] ?? 0) > 0)
        };
      })
      .filter(document => document.score > 0)
      .sort((left, right) => right.score - left.score || String(left.title).localeCompare(String(right.title)))
      .slice(0, cappedLimit)
      .map(document => ({
        id: document.id,
        title: document.title,
        context: document.context,
        sourceKind: document.sourceKind,
        assetId: document.assetId,
        mimeType: document.mimeType,
        score: document.score,
        matchedTerms: document.matchedTerms,
        snippet: searchSnippet(document.text, terms)
      }));
    const nextState = {
      ...state,
      queryCount: Number(state.queryCount ?? 0) + 1,
      lastQueryAt: isoAt(Date.now()),
      status: "ready",
      lastError: null
    };
    await persistState(nextState);
    return { ok: true, index: summarizeState(nextState), hits, q: queryText, limit: cappedLimit };
  };

  return {
    inspect,
    build,
    reindex,
    refreshAsset,
    inspectAsset,
    reindexAsset,
    query,
    close: () => {}
  };
}

export function createInProcessJobQueue({
  world,
  serverRunnerId,
  runtimeConfig = {},
  jobHandlers = {},
  getAppContext
}) {
  const config = normalizeJobQueueConfig(runtimeConfig);
  const activeJobs = new Set();
  let closed = false;

  const list = () => moduleProjectors.jobs(world.allWitnesses())
    .filter(row => row.serverRunner === serverRunnerId)
    .sort((a, b) => {
      const left = parseIsoAt(a.availableAt) ?? 0;
      const right = parseIsoAt(b.availableAt) ?? 0;
      if (left !== right) return left - right;
      return String(a.id).localeCompare(String(b.id));
    });

  const get = id => list().find(row => row.id === id) ?? null;

  const enqueue = ({
    actor,
    handler,
    payload = {},
    delayMs = 0,
    idempotencyKey = null,
    maxAttempts = config.maxAttempts,
    retryDelayMs = config.retryDelayMs
  } = {}) => {
    const name = typeof handler === "string" ? handler.trim() : "";
    if (!name) return { ok: false, status: 400, reason: "handler required" };
    if (!jobHandlers[name]) return { ok: false, status: 400, reason: "unknown job handler", handler: name };
    const safePayload = payload === undefined ? null : payload;
    const safeDelayMs = nonNegativeInteger(delayMs, 0);
    const safeMaxAttempts = positiveInteger(maxAttempts, config.maxAttempts);
    const safeRetryDelayMs = positiveInteger(retryDelayMs, config.retryDelayMs);
    const safeKey = typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : null;

    if (safeKey) {
      const existing = list().find(row => row.idempotencyKey === safeKey && row.handler === name);
      if (existing) return { ok: true, status: 200, created: false, job: existing, witness: null };
    }

    const id = `job_${randomUUID()}`;
    const createdAt = isoAt(Date.now());
    const availableAt = isoAt(Date.now() + safeDelayMs);
    const witness = world.emit({
      process: "jobs.queue.enqueue",
      actor: actor || serverRunnerId,
      claims: [
        thing(id),
        relation(id, "hasModuleKind", "job"),
        relation(id, "hasTitle", name),
        relation(actor || serverRunnerId, "owns", id)
      ],
      body: {
        id,
        serverRunner: serverRunnerId,
        actor: actor || null,
        handler: name,
        payload: safePayload,
        createdAt,
        availableAt,
        delayMs: safeDelayMs,
        idempotencyKey: safeKey,
        maxAttempts: safeMaxAttempts,
        retryDelayMs: safeRetryDelayMs
      }
    });
    return { ok: true, status: 201, created: true, job: get(id), witness };
  };

  const execute = async job => {
    const current = get(job.id);
    if (!current || current.status !== "queued") return;
    const handler = jobHandlers[current.handler];
    const attempt = (current.attempt || 0) + 1;
    world.emit({
      process: "jobs.queue.start",
      actor: current.actor || serverRunnerId,
      claims: [relation(serverRunnerId, "runs", current.id)],
      body: {
        id: current.id,
        serverRunner: serverRunnerId,
        actor: current.actor || null,
        handler: current.handler,
        attempt,
        payload: current.payload ?? null,
        maxAttempts: current.maxAttempts,
        retryDelayMs: current.retryDelayMs
      }
    });
    if (!handler) {
      world.emit({
        process: "jobs.queue.deadLetter",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          completedAt: isoAt(Date.now()),
          reason: "unknown job handler"
        }
      });
      return;
    }
    try {
      await handler({
        world,
        actor: current.actor || serverRunnerId,
        appContext: getAppContext(),
        job: current,
        payload: current.payload ?? null,
        attempt
      });
      world.emit({
        process: "jobs.queue.succeeded",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          completedAt: isoAt(Date.now())
        }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt >= (current.maxAttempts || config.maxAttempts)) {
        world.emit({
          process: "jobs.queue.deadLetter",
          actor: current.actor || serverRunnerId,
          claims: [],
          body: {
            id: current.id,
            serverRunner: serverRunnerId,
            actor: current.actor || null,
            handler: current.handler,
            attempt,
            maxAttempts: current.maxAttempts,
            retryDelayMs: current.retryDelayMs,
            completedAt: isoAt(Date.now()),
            reason
          }
        });
        return;
      }
      const delayMs = (current.retryDelayMs || config.retryDelayMs) * (2 ** Math.max(0, attempt - 1));
      world.emit({
        process: "jobs.queue.retry",
        actor: current.actor || serverRunnerId,
        claims: [],
        body: {
          id: current.id,
          serverRunner: serverRunnerId,
          actor: current.actor || null,
          handler: current.handler,
          attempt,
          maxAttempts: current.maxAttempts,
          retryDelayMs: current.retryDelayMs,
          reason,
          delayMs,
          nextAvailableAt: isoAt(Date.now() + delayMs)
        }
      });
    }
  };

  const tick = async () => {
    if (closed) return;
    for (const job of list()) {
      if (job.status !== "queued") continue;
      const availableAt = parseIsoAt(job.availableAt);
      if (availableAt == null || availableAt > Date.now()) continue;
      if (activeJobs.has(job.id)) continue;
      activeJobs.add(job.id);
      try {
        await execute(job);
      } finally {
        activeJobs.delete(job.id);
      }
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, config.pollMs);
  interval.unref?.();
  void tick();

  return {
    config,
    enqueue,
    list,
    get,
    close: () => {
      closed = true;
      clearInterval(interval);
    }
  };
}
