import { relation, thing } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { isoAt } from "../../src/runtime-config-utils.js";

function normalizeDatasourceId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id) ? id : null;
}

export function normalizeProvider(value) {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["sqlite", "postgres", "mysql"].includes(provider) ? provider : null;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDatasourceTitle(value, fallback = null) {
  return normalizeOptionalString(value) ?? fallback;
}

async function createGeneratedDatasourceId(appContext, provider = "sql") {
  const prefix = `${provider || "sql"}_ds`;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const id = `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
    if (!appContext?.dbSql?.getDatasource?.(id)) return id;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

function hasOwn(body, key) {
  return Boolean(body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, key));
}

function readField(body, existing, key, { keepExisting = true } = {}) {
  if (hasOwn(body, key)) return body[key];
  return keepExisting ? existing?.[key] : undefined;
}

function normalizePort(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeDatasourcePayload(body, existing = null) {
  const provider = normalizeProvider(body?.provider ?? existing?.provider);
  if (!provider) return { ok: false, status: 400, reason: "provider must be sqlite, postgres, or mysql" };
  const id = normalizeDatasourceId(body?.id ?? existing?.id);
  if (!id) return { ok: false, status: 400, reason: "valid datasource id required" };
  const sameProvider = existing?.provider === provider;
  const title = normalizeDatasourceTitle(
    body?.title ?? body?.label ?? body?.name,
    existing?.title ?? normalizeOptionalString(body?.datasourceName) ?? id
  ) ?? id;
  const datasourceName = normalizeOptionalString(body?.datasourceName ?? existing?.datasourceName ?? id) ?? id;
  const migrationTable = normalizeOptionalString(body?.migrationTable ?? existing?.migrationTable) ?? "witness_sql_migrations";
  const payload = {
    id,
    title,
    provider,
    datasourceName,
    migrationTable,
    host: normalizeOptionalString(readField(body, existing, "host", { keepExisting: sameProvider && provider !== "sqlite" })),
    port: normalizePort(readField(body, existing, "port", { keepExisting: sameProvider && provider !== "sqlite" })),
    database: normalizeOptionalString(readField(body, existing, "database", { keepExisting: sameProvider && provider !== "sqlite" })),
    user: normalizeOptionalString(readField(body, existing, "user", { keepExisting: sameProvider && provider !== "sqlite" })),
    passwordSecretId: normalizeOptionalString(readField(body, existing, "passwordSecretId", { keepExisting: sameProvider && provider !== "sqlite" })),
    ssl: hasOwn(body, "ssl") ? body.ssl === true : (sameProvider && existing?.ssl === true),
    path: normalizeOptionalString(readField(body, existing, "path", { keepExisting: sameProvider && provider === "sqlite" }))
  };
  if (provider === "sqlite") return { ok: true, payload };
  if (!payload.host || !payload.database || !payload.user) {
    return { ok: false, status: 400, reason: "host, database, and user are required" };
  }
  return { ok: true, payload };
}

function datasourceClaims({ id, actor, title }) {
  return [
    thing(id),
    relation(id, "hasModuleKind", "sqlDatasource"),
    relation(actor, "owns", id),
    relation(id, "hasTitle", title)
  ];
}

function emitDatasourceMutation(world, {
  process,
  actor,
  serverRunnerId,
  payload,
  existing = null,
  test = null
}) {
  const now = isoAt(Date.now());
  world.emit({
    process,
    actor,
    claims: datasourceClaims({ id: payload.id, actor, title: payload.title || existing?.title || payload.datasourceName || payload.id }),
    body: {
      id: payload.id,
      serverRunner: serverRunnerId,
      provider: payload.provider,
      title: payload.title || existing?.title || payload.datasourceName || payload.id,
      datasourceName: payload.datasourceName,
      host: payload.host,
      port: payload.port,
      database: payload.database,
      user: payload.user,
      passwordSecretId: payload.passwordSecretId,
      ssl: payload.ssl,
      migrationTable: payload.migrationTable,
      path: payload.path,
      status: test?.status ?? payload.status ?? existing?.status ?? "configured",
      adapterStatus: payload.provider === "sqlite" ? "ready" : "declared",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastTestAt: test?.at ?? existing?.lastTestAt ?? null,
      lastTestResult: test?.result ?? existing?.lastTestResult ?? null,
      lastError: test ? (test.reason ?? null) : (payload.lastError ?? existing?.lastError ?? null),
      ...(process.endsWith(".delete") ? {} : {})
    }
  });
}

async function withSqlGate({
  world,
  backendHost,
  requestActor,
  appContext,
  requireBackendCapabilities,
  canMutateTarget,
  sendGateFailure,
  res,
  sendJson
}) {
  const capabilityGate = requireBackendCapabilities(["db.sql"]);
  if (!capabilityGate.ok) {
    world.observe({ process: "db.sql.request.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
    sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
    return { ok: false };
  }
  if (!requestActor) {
    world.observe({ process: "db.sql.request.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
    sendJson(res, 401, { error: "sign in first" });
    return { ok: false };
  }
  const serverRunnerId = appContext?.serverRunnerId || "";
  const gate = canMutateTarget(world, requestActor, serverRunnerId);
  if (!gate.ok) {
    world.observe({ process: "db.sql.request.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
    sendGateFailure(res, gate);
    return { ok: false };
  }
  return { ok: true, serverRunnerId };
}

export function createSqlDbHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  emitDbSqlOperation,
  currentSqlOperationForRunner,
  dbSqlOperationReadShape
}) {
  const operationShape = (serverRunnerId, operationId, fallback) => dbSqlOperationReadShape(
    currentSqlOperationForRunner(serverRunnerId, operationId) ?? fallback
  );

  return {
    "db.sql.inspect": async ({ res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const datasources = appContext?.dbSql?.listDatasources?.() ?? [];
      sendJson(res, 200, {
        serverRunner: gate.serverRunnerId,
        datasources,
        operations: world.project(moduleProjectors.sqlOperations).filter(row => row.serverRunner === gate.serverRunnerId)
      });
    },

    "db.sql.datasources.list": async ({ res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      sendJson(res, 200, {
        serverRunner: gate.serverRunnerId,
        datasources: appContext?.dbSql?.listDatasources?.() ?? []
      });
    },

    "db.sql.datasource.read": async ({ res, params, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const datasourceId = normalizeDatasourceId(params?.id);
      if (!datasourceId) {
        sendJson(res, 400, { error: "valid datasource id required" });
        return;
      }
      const datasource = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!datasource) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      sendJson(res, 200, { datasource });
    },

    "db.sql.datasource.create": async ({ req, res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const body = await readJson(req);
      const generatedId = normalizeDatasourceId(body?.id)
        ?? await createGeneratedDatasourceId(appContext, normalizeProvider(body?.provider) || "sql");
      const normalized = normalizeDatasourcePayload({ ...body, id: generatedId });
      if (!normalized.ok) {
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      if (appContext?.dbSql?.getDatasource?.(normalized.payload.id)) {
        sendJson(res, 409, { error: "datasource already exists" });
        return;
      }
      emitDatasourceMutation(world, {
        process: "db.sql.datasource.create",
        actor: requestActor,
        serverRunnerId: gate.serverRunnerId,
        payload: normalized.payload
      });
      sendJson(res, 201, { datasource: appContext?.dbSql?.getDatasource?.(normalized.payload.id) ?? normalized.payload });
    },

    "db.sql.datasource.update": async ({ req, res, params, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const datasourceId = normalizeDatasourceId(params?.id);
      if (!datasourceId) {
        sendJson(res, 400, { error: "valid datasource id required" });
        return;
      }
      const existing = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!existing) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      const body = await readJson(req);
      const normalized = normalizeDatasourcePayload({ ...body, id: datasourceId }, existing);
      if (!normalized.ok) {
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      emitDatasourceMutation(world, {
        process: "db.sql.datasource.update",
        actor: requestActor,
        serverRunnerId: gate.serverRunnerId,
        payload: normalized.payload,
        existing
      });
      sendJson(res, 200, { datasource: appContext?.dbSql?.getDatasource?.(datasourceId) ?? { ...existing, ...normalized.payload } });
    },

    "db.sql.datasource.delete": async ({ res, params, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const datasourceId = normalizeDatasourceId(params?.id);
      if (!datasourceId) {
        sendJson(res, 400, { error: "valid datasource id required" });
        return;
      }
      const existing = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!existing) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      world.emit({
        process: "db.sql.datasource.delete",
        actor: requestActor,
        claims: datasourceClaims({ id: datasourceId, actor: requestActor, title: existing.title || existing.datasourceName || datasourceId }),
        body: {
          id: datasourceId,
          serverRunner: gate.serverRunnerId,
          provider: existing.provider,
          title: existing.title || existing.datasourceName || datasourceId,
          datasourceName: existing.datasourceName,
          updatedAt: isoAt(Date.now()),
          status: "deleted"
        }
      });
      sendJson(res, 200, { ok: true, id: datasourceId });
    },

    "db.sql.datasource.test": async ({ res, params, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const datasourceId = normalizeDatasourceId(params?.id);
      if (!datasourceId) {
        sendJson(res, 400, { error: "valid datasource id required" });
        return;
      }
      const existing = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!existing) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      const operationId = `sqlop_${Math.random().toString(36).slice(2, 12)}`;
      const title = `test ${existing.datasourceName || existing.id}`;
      const result = await appContext.dbSql.testConnection({ datasourceId });
      emitDbSqlOperation({
        actor: requestActor,
        kind: "test",
        operationId,
        title,
        datasource: result.datasource || existing,
        ok: result.ok,
        body: result.ok ? {} : { reason: result.reason || "connection test failed" }
      });
      emitDatasourceMutation(world, {
        process: result.ok ? "db.sql.datasource.test" : "db.sql.datasource.test.failed",
        actor: requestActor,
        serverRunnerId: gate.serverRunnerId,
        payload: existing,
        existing,
        test: {
          at: isoAt(Date.now()),
          result: result.ok ? "succeeded" : "failed",
          status: result.ok ? "ready" : "failed",
          reason: result.reason || null
        }
      });
      if (!result.ok) {
        sendJson(res, result.status || 500, {
          error: result.reason || "connection test failed",
          operation: operationShape(gate.serverRunnerId, operationId, {
            id: operationId,
            title,
            serverRunner: gate.serverRunnerId,
            datasourceId,
            datasourceName: existing.datasourceName,
            provider: existing.provider,
            kind: "test",
            status: "failed",
            rowCount: 0,
            changes: 0,
            lastInsertRowid: 0,
            migrationCount: 0,
            skippedCount: 0,
            stepCount: 0,
            lastError: result.reason || "connection test failed"
          })
        });
        return;
      }
      sendJson(res, 200, {
        datasource: appContext?.dbSql?.getDatasource?.(datasourceId) ?? existing,
        operation: operationShape(gate.serverRunnerId, operationId, {
          id: operationId,
          title,
          serverRunner: gate.serverRunnerId,
          datasourceId,
          datasourceName: existing.datasourceName,
          provider: existing.provider,
          kind: "test",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        })
      });
    },

    "db.sql.datasource.testDraft": async ({ req, res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const body = await readJson(req);
      const datasourceId = normalizeDatasourceId(body?.id);
      const existing = datasourceId ? (appContext?.dbSql?.getDatasource?.(datasourceId) ?? null) : null;
      const normalized = normalizeDatasourcePayload({
        ...body,
        id: datasourceId ?? existing?.id ?? "draft_test_connection"
      }, existing);
      if (!normalized.ok) {
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const operationId = `sqlop_${Math.random().toString(36).slice(2, 12)}`;
      const title = `test ${normalized.payload.datasourceName || normalized.payload.id}`;
      const result = await appContext.dbSql.testConnection({ datasource: normalized.payload });
      emitDbSqlOperation({
        actor: requestActor,
        kind: "test",
        operationId,
        title,
        datasource: result.datasource || normalized.payload,
        ok: result.ok,
        body: result.ok ? { draft: true } : { reason: result.reason || "connection test failed", draft: true }
      });
      if (!result.ok) {
        sendJson(res, result.status || 500, {
          error: result.reason || "connection test failed",
          datasource: result.datasource || normalized.payload,
          operation: operationShape(gate.serverRunnerId, operationId, {
            id: operationId,
            title,
            serverRunner: gate.serverRunnerId,
            datasourceId: normalized.payload.id,
            datasourceName: normalized.payload.datasourceName,
            provider: normalized.payload.provider,
            kind: "test",
            status: "failed",
            rowCount: 0,
            changes: 0,
            lastInsertRowid: 0,
            migrationCount: 0,
            skippedCount: 0,
            stepCount: 0,
            lastError: result.reason || "connection test failed"
          })
        });
        return;
      }
      sendJson(res, 200, {
        datasource: result.datasource || normalized.payload,
        operation: operationShape(gate.serverRunnerId, operationId, {
          id: operationId,
          title,
          serverRunner: gate.serverRunnerId,
          datasourceId: normalized.payload.id,
          datasourceName: normalized.payload.datasourceName,
          provider: normalized.payload.provider,
          kind: "test",
          status: "succeeded",
          rowCount: 1,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 1,
          lastError: null
        })
      });
    },

    "db.sql.migrate": async ({ req, res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const body = await readJson(req);
      const datasourceId = normalizeDatasourceId(body?.datasourceId);
      if (!datasourceId) {
        sendJson(res, 400, { error: "datasourceId required" });
        return;
      }
      const datasource = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!datasource) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      const operationId = `sqlop_${Math.random().toString(36).slice(2, 12)}`;
      const title = `migrate ${datasource.datasourceName || datasource.id}`;
      const result = await appContext.dbSql.migrate({ datasourceId, migrations: body?.migrations });
      emitDbSqlOperation({ actor: requestActor, kind: "migrate", operationId, title, datasource: result.datasource || datasource, ok: result.ok, body: result.ok ? { migrationCount: result.applied.length, skippedCount: result.skipped.length } : { reason: result.reason || "migration failed" } });
      if (!result.ok) {
        sendJson(res, result.status || 500, { error: result.reason || "migration failed" });
        return;
      }
      sendJson(res, 200, { applied: result.applied, skipped: result.skipped });
    },

    "db.sql.query": async ({ req, res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const body = await readJson(req);
      const datasourceId = normalizeDatasourceId(body?.datasourceId);
      if (!datasourceId) {
        sendJson(res, 400, { error: "datasourceId required" });
        return;
      }
      const datasource = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!datasource) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      const operationId = `sqlop_${Math.random().toString(36).slice(2, 12)}`;
      const title = `query ${datasource.datasourceName || datasource.id}`;
      const result = await appContext.dbSql.query({ datasourceId, sql: body?.sql, params: body?.params });
      emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource: result.datasource || datasource, ok: result.ok, body: result.ok ? { rowCount: result.rowCount } : { reason: result.reason || "query failed" } });
      if (!result.ok) {
        sendJson(res, result.status || 500, { error: result.reason || "query failed" });
        return;
      }
      sendJson(res, 200, { rows: result.rows, rowCount: result.rowCount });
    },

    "db.sql.command": async ({ req, res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const body = await readJson(req);
      const datasourceId = normalizeDatasourceId(body?.datasourceId);
      if (!datasourceId) {
        sendJson(res, 400, { error: "datasourceId required" });
        return;
      }
      const datasource = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!datasource) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      const operationId = `sqlop_${Math.random().toString(36).slice(2, 12)}`;
      const title = `command ${datasource.datasourceName || datasource.id}`;
      const result = await appContext.dbSql.command({ datasourceId, sql: body?.sql, params: body?.params });
      emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource: result.datasource || datasource, ok: result.ok, body: result.ok ? { changes: result.changes, lastInsertRowid: result.lastInsertRowid } : { reason: result.reason || "command failed" } });
      if (!result.ok) {
        sendJson(res, result.status || 500, { error: result.reason || "command failed" });
        return;
      }
      sendJson(res, 200, { changes: result.changes, lastInsertRowid: result.lastInsertRowid });
    },

    "db.sql.transaction": async ({ req, res, requestActor, appContext }) => {
      const gate = await withSqlGate({ world, backendHost, requestActor, appContext, requireBackendCapabilities, canMutateTarget, sendGateFailure, res, sendJson });
      if (!gate.ok) return;
      const body = await readJson(req);
      const datasourceId = normalizeDatasourceId(body?.datasourceId);
      if (!datasourceId) {
        sendJson(res, 400, { error: "datasourceId required" });
        return;
      }
      const datasource = appContext?.dbSql?.getDatasource?.(datasourceId) ?? null;
      if (!datasource) {
        sendJson(res, 404, { error: "datasource not found" });
        return;
      }
      const operationId = `sqlop_${Math.random().toString(36).slice(2, 12)}`;
      const title = `transaction ${datasource.datasourceName || datasource.id}`;
      const result = await appContext.dbSql.transaction({ datasourceId, steps: body?.steps });
      emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource: result.datasource || datasource, ok: result.ok, body: result.ok ? { stepCount: result.results.length } : { reason: result.reason || "transaction failed" } });
      if (!result.ok) {
        sendJson(res, result.status || 500, { error: result.reason || "transaction failed" });
        return;
      }
      sendJson(res, 200, { results: result.results });
    }
  };
}
