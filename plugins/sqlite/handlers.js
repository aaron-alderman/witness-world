import { relation } from "../../src/kernel.js";

export function createSqliteDbSqlHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  emitDbSqlDatasourceResolve,
  currentSqlDatasourceForRunner,
  sqlOperationsForRunner,
  dbSqlDatasourceReadShape,
  dbSqlOperationReadShape,
  dbSqlDatasourceId,
  dbSqlDatasourceTitle,
  dbSqlOperationId,
  dbSqlOperationTitle,
  emitDbSqlOperation,
  currentSqlOperationForRunner
}) {
  return {
    "db.sql.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "db.sql.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({
        actor: requestActor,
        datasource: inspection.datasource,
        ok: inspection.ok,
        reason: inspection.ok ? null : inspection.reason
      });
      if (!inspection.ok && !inspection.datasource) {
        world.observe({ process: "db.sql.inspect.failed", actor: requestActor, claims: [], body: { reason: inspection.reason || "db.sql runtime unavailable", serverRunner: serverRunnerId } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const projectedDatasource = inspection.datasource
        ? (currentSqlDatasourceForRunner(serverRunnerId, inspection.datasource.id, appContext) ?? inspection.datasource)
        : null;
      const operations = sqlOperationsForRunner(serverRunnerId, appContext).map(dbSqlOperationReadShape);
      world.observe({
        process: "db.sql.inspect",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:db.sql`)],
        body: { serverRunner: serverRunnerId, operationCount: operations.length, datasourceId: projectedDatasource?.id ?? null }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        datasource: projectedDatasource ? dbSqlDatasourceReadShape({
          ...projectedDatasource,
          operationCount: operations.length
        }) : null,
        operations,
        warning: inspection.ok ? null : inspection.reason
      });
    },

    "db.sql.migrate": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.migrate.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.migrate.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      if (!inspection.ok) {
        const datasource = inspection.datasource ?? {
          id: dbSqlDatasourceId(serverRunnerId),
          title: dbSqlDatasourceTitle({}),
          serverRunner: serverRunnerId,
          provider: "sqlite",
          datasourceName: "main"
        };
        const failedId = dbSqlOperationId();
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId: failedId,
          title: dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null }),
          datasource,
          ok: false,
          body: { reason: inspection.reason || "db.sql runtime unavailable" }
        });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "migrate", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: inspection.datasource.datasourceName });
      const result = await appContext.dbSql.migrate({ migrations: body?.migrations });
      if (!result.ok) {
        emitDbSqlOperation({
          actor: requestActor,
          kind: "migrate",
          operationId,
          title,
          datasource: result.datasource || inspection.datasource,
          ok: false,
          body: { reason: result.reason || "migration failed" }
        });
        sendJson(res, result.status || 500, { error: result.reason || "migration failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "migrate",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId, appContext) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "migrate",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: result.applied.length,
          skippedCount: result.skipped.length,
          stepCount: 0,
          lastError: null
        }),
        applied: result.applied,
        skipped: result.skipped
      });
    },

    "db.sql.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "query", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.query({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "query", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "query failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "query failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "query",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { rowCount: result.rowCount }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId, appContext) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "query",
          status: "succeeded",
          rowCount: result.rowCount,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        rows: result.rows
      });
    },

    "db.sql.command": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.command.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.command.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "command", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.command({ sql: body?.sql, params: body?.params });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "command", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "command failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "command failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "command",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId, appContext) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "command",
          status: "succeeded",
          rowCount: 0,
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: 0,
          lastError: null
        }),
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      });
    },

    "db.sql.transaction": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["db.sql"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "db.sql.transaction.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "db.sql.transaction.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const inspection = appContext?.dbSql?.inspect?.() ?? { ok: false, status: 503, reason: "db.sql runtime unavailable", datasource: null };
      if (inspection.datasource) emitDbSqlDatasourceResolve({ actor: requestActor, datasource: inspection.datasource, ok: inspection.ok, reason: inspection.ok ? null : inspection.reason });
      const datasource = inspection.datasource ?? {
        id: dbSqlDatasourceId(serverRunnerId),
        title: dbSqlDatasourceTitle({}),
        serverRunner: serverRunnerId,
        provider: "sqlite",
        datasourceName: "main"
      };
      const operationId = dbSqlOperationId();
      const title = dbSqlOperationTitle({ kind: "transaction", name: typeof body?.name === "string" ? body.name.trim() : null, datasourceName: datasource.datasourceName });
      if (!inspection.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource, ok: false, body: { reason: inspection.reason || "db.sql runtime unavailable" } });
        sendJson(res, inspection.status || 503, { error: inspection.reason || "db.sql runtime unavailable" });
        return;
      }
      const result = await appContext.dbSql.transaction({ steps: body?.steps });
      if (!result.ok) {
        emitDbSqlOperation({ actor: requestActor, kind: "transaction", operationId, title, datasource: result.datasource || datasource, ok: false, body: { reason: result.reason || "transaction failed" } });
        sendJson(res, result.status || 500, { error: result.reason || "transaction failed" });
        return;
      }
      emitDbSqlOperation({
        actor: requestActor,
        kind: "transaction",
        operationId,
        title,
        datasource: result.datasource,
        ok: true,
        body: { stepCount: result.results.length }
      });
      sendJson(res, 200, {
        operation: dbSqlOperationReadShape(currentSqlOperationForRunner(serverRunnerId, operationId, appContext) ?? {
          id: operationId,
          title,
          serverRunner: serverRunnerId,
          datasourceId: result.datasource.id,
          datasourceName: result.datasource.datasourceName,
          provider: result.datasource.provider,
          kind: "transaction",
          status: "succeeded",
          rowCount: 0,
          changes: 0,
          lastInsertRowid: 0,
          migrationCount: 0,
          skippedCount: 0,
          stepCount: result.results.length,
          lastError: null
        }),
        results: result.results
      });
    }
  };
}
