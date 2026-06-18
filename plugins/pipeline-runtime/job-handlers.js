import { randomUUID } from "node:crypto";
import { relation, thing } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { createPipelineCatalogFromAppProject } from "./catalog-runtime.js";
import { evaluatePlannedSync } from "./planner-runtime.js";
import { pipelineModuleProjectors } from "./projections.js";

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function checkpointId(serverRunnerId, syncId) {
  return `pipeline_ckpt_${serverRunnerId}_${syncId}`;
}

function bindingId(serverRunnerId, syncId, bindingName) {
  return `pipeline_bind_${serverRunnerId}_${syncId}_${bindingName}`;
}

function runId() {
  return `pipeline_run_${randomUUID()}`;
}

function runClaims(id, actor, title) {
  return [
    thing(id),
    relation(id, "hasModuleKind", "pipelineRun"),
    relation(actor, "owns", id),
    relation(id, "hasTitle", title)
  ];
}

function bindingClaims(id, actor, title) {
  return [
    thing(id),
    relation(id, "hasModuleKind", "pipelineSqlBinding"),
    relation(actor, "owns", id),
    relation(id, "hasTitle", title)
  ];
}

function checkpointClaims(id, actor, title) {
  return [
    thing(id),
    relation(id, "hasModuleKind", "pipelineCheckpoint"),
    relation(actor, "owns", id),
    relation(id, "hasTitle", title)
  ];
}

function uniqueBindingNames(plan) {
  return [...new Set([
    normalizeText(plan?.source?.binding),
    ...(plan?.outputTransforms ?? []).map(transform => normalizeText(transform?.target?.binding))
  ].filter(Boolean))];
}

function maximumProgressValue(rows, progressField) {
  let current = null;
  for (const row of rows ?? []) {
    const value = row?.[progressField];
    if (value == null) continue;
    if (current == null || value > current) current = value;
  }
  return current;
}

function replayLowerBound(checkpoint, replayWindowMs) {
  if (checkpoint == null) return null;
  if (typeof checkpoint === "number") return checkpoint - replayWindowMs;
  const parsed = Date.parse(String(checkpoint));
  if (Number.isFinite(parsed)) return parsed - replayWindowMs;
  return checkpoint;
}

function summarizeCounts(counts = {}) {
  const entries = Object.entries(counts ?? {});
  if (!entries.length) return "none";
  return entries.map(([key, value]) => `${key}:${value}`).join(", ");
}

function isoNow(isoAt) {
  return isoAt(Date.now());
}

function emitRunEvent(world, process, actor, body) {
  world.emit({
    process,
    actor,
    claims: [],
    body
  });
}

function pipelineBindingFor(project, serverRunnerId, syncId, bindingName) {
  return project(pipelineModuleProjectors.pipelineSqlBindingIndex).byRunnerSync?.[`${serverRunnerId}:${syncId}`]?.[bindingName] ?? null;
}

function pipelineCheckpointFor(project, serverRunnerId, syncId) {
  return project(pipelineModuleProjectors.pipelineCheckpointIndex).byRunnerSync?.[`${serverRunnerId}:${syncId}`] ?? null;
}

function pipelineRunFor(project, runIdValue) {
  return project(pipelineModuleProjectors.pipelineRunIndex).byId?.[runIdValue] ?? null;
}

function targetBindingRows(plan, bindingsByName, datasourceIndex) {
  return (plan?.outputTransforms ?? []).map(transform => {
    const bindingName = normalizeText(transform?.target?.binding);
    const binding = bindingsByName[bindingName] ?? null;
    const datasource = binding?.datasourceId ? datasourceIndex?.byId?.[binding.datasourceId] ?? null : null;
    return {
      bindingName,
      datasourceId: binding?.datasourceId ?? "",
      datasourceTitle: datasource?.title ?? datasource?.datasourceName ?? "",
      tableId: transform?.target?.tableId ?? "",
      table: transform?.target?.table ?? "",
      schema: transform?.target?.schema ?? "",
      provider: transform?.target?.provider ?? "",
      writeMode: transform?.writeMode ?? ""
    };
  });
}

function fixtureForSourceRows(tableId, rows) {
  return { sourceRows: { [tableId]: rows } };
}

function previewRows(rows, limit = 2) {
  return (rows ?? []).slice(0, limit);
}

async function executePipelineRun({
  world,
  actor,
  appContext,
  runRow,
  plan,
  bindingsByName,
  checkpoint,
  isoAt
}) {
  const startedAt = isoNow(isoAt);
  const runBody = {
    runId: runRow.id,
    serverRunner: runRow.serverRunner,
    syncId: runRow.syncId,
    mode: runRow.mode,
    jobId: runRow.jobId,
    rowLimit: runRow.rowLimit,
    sourceBinding: runRow.sourceBinding,
    sourceDatasourceId: runRow.sourceDatasourceId,
    targetBindings: runRow.targetBindings,
    checkpointBefore: checkpoint?.cursorValue ?? null,
    startedAt,
    at: startedAt
  };
  emitRunEvent(world, "pipeline.run.start", actor, {
    ...runBody,
    status: "running",
    message: `Started ${runRow.mode} run for ${runRow.syncId}.`
  });

  const replayWindowMs = Number.isFinite(plan?.progress?.replayWindowMs) ? plan.progress.replayWindowMs : 0;
  const lowerBound = replayLowerBound(checkpoint?.cursorValue ?? null, replayWindowMs);
  const sourceDatasourceId = bindingsByName[runRow.sourceBinding]?.datasourceId ?? "";
  const readResult = await appContext.dbSql.readOrderedBatch({
    datasourceId: sourceDatasourceId,
    table: plan.source.table,
    schema: plan.source.schema,
    columns: (plan.source.columns ?? []).map(column => column.name),
    progressField: plan.progress.field,
    lowerBound,
    rowLimit: runRow.rowLimit
  });
  if (!readResult.ok) throw new Error(readResult.reason || "source read failed");

  emitRunEvent(world, "pipeline.run.read", actor, {
    ...runBody,
    stage: "read",
    status: "succeeded",
    at: isoNow(isoAt),
    rowsRead: readResult.rowCount,
    lowerBound,
    message: `Read ${readResult.rowCount} row(s) from ${plan.source.binding}.`
  });

  const evaluated = evaluatePlannedSync(plan, fixtureForSourceRows(plan.source.tableId, readResult.rows));
  emitRunEvent(world, "pipeline.run.transform", actor, {
    ...runBody,
    stage: "transform",
    status: "succeeded",
    at: isoNow(isoAt),
    worldCounts: evaluated.summary.worldCounts,
    sqlCounts: evaluated.summary.sqlCounts,
    message: `Transformed rows into world counts [${summarizeCounts(evaluated.summary.worldCounts)}] and SQL counts [${summarizeCounts(evaluated.summary.sqlCounts)}].`
  });

  const checkpointCandidate = maximumProgressValue(readResult.rows, plan.progress.field);
  const mayHaveMoreRows = readResult.rowCount >= runRow.rowLimit;
  for (const stage of plan.stages ?? []) {
    if (stage.kind !== "write_sql_rows") continue;
    const targetRows = evaluated.sqlEmissions[stage.target.tableId] ?? [];
    const targetBinding = bindingsByName[stage.target.binding] ?? null;
    if (runRow.mode === "dry_run") {
      emitRunEvent(world, "pipeline.run.write.simulated", actor, {
        ...runBody,
        stage: "write",
        status: "simulated",
        at: isoNow(isoAt),
        targetBinding: stage.target.binding,
        targetDatasourceId: targetBinding?.datasourceId ?? "",
        targetTableId: stage.target.tableId,
        targetTable: stage.target.table,
        targetSchema: stage.target.schema,
        writeMode: stage.writeMode,
        rowCount: targetRows.length,
        preview: previewRows(targetRows),
        checkpointCandidate,
        message: `Simulated ${targetRows.length} ${stage.writeMode} row(s) into ${stage.target.tableId}.`
      });
      continue;
    }
    const writeResult = await appContext.dbSql.writeRows({
      datasourceId: targetBinding?.datasourceId ?? "",
      table: stage.target.table,
      schema: stage.target.schema,
      rows: targetRows,
      writeMode: stage.writeMode,
      keyFields: (stage.keys ?? []).map(mapping => mapping.targetField)
    });
    if (!writeResult.ok) {
      emitRunEvent(world, "pipeline.run.write.failed", actor, {
        ...runBody,
        stage: "write",
        status: "failed",
        at: isoNow(isoAt),
        targetBinding: stage.target.binding,
        targetDatasourceId: targetBinding?.datasourceId ?? "",
        targetTableId: stage.target.tableId,
        targetTable: stage.target.table,
        targetSchema: stage.target.schema,
        writeMode: stage.writeMode,
        rowCount: targetRows.length,
        reason: writeResult.reason || "write failed",
        message: `Write failed for ${stage.target.tableId}: ${writeResult.reason || "write failed"}.`
      });
      throw new Error(writeResult.reason || "write failed");
    }
    emitRunEvent(world, "pipeline.run.write.succeeded", actor, {
      ...runBody,
      stage: "write",
      status: "succeeded",
      at: isoNow(isoAt),
      targetBinding: stage.target.binding,
      targetDatasourceId: targetBinding?.datasourceId ?? "",
      targetTableId: stage.target.tableId,
      targetTable: stage.target.table,
      targetSchema: stage.target.schema,
      writeMode: stage.writeMode,
      rowCount: targetRows.length,
      message: `Wrote ${targetRows.length} ${stage.writeMode} row(s) into ${stage.target.tableId}.`
    });
  }

  let checkpointCommitted = false;
  if (runRow.mode === "execute" && checkpointCandidate != null) {
    const checkpointEventAt = isoNow(isoAt);
    world.emit({
      process: "pipeline.checkpoint.commit",
      actor,
      claims: checkpointClaims(checkpointId(runRow.serverRunner, runRow.syncId), actor, runRow.syncId),
      body: {
        id: checkpointId(runRow.serverRunner, runRow.syncId),
        serverRunner: runRow.serverRunner,
        syncId: runRow.syncId,
        progressKind: plan.progress.kind,
        progressField: plan.progress.field,
        cursorValue: checkpointCandidate,
        updatedAt: checkpointEventAt
      }
    });
    checkpointCommitted = true;
    emitRunEvent(world, "pipeline.run.checkpoint.committed", actor, {
      ...runBody,
      stage: "checkpoint",
      status: "succeeded",
      at: checkpointEventAt,
      checkpointCandidate,
      message: `Committed checkpoint ${String(checkpointCandidate)}.`
    });
  }

  const completedAt = isoNow(isoAt);
  emitRunEvent(world, "pipeline.run.succeeded", actor, {
    ...runBody,
    status: "succeeded",
    completedAt,
    at: completedAt,
    checkpointCandidate,
    checkpointCommitted,
    rowsRead: readResult.rowCount,
    worldCounts: evaluated.summary.worldCounts,
    sqlCounts: evaluated.summary.sqlCounts,
    mayHaveMoreRows,
    message: `${runRow.mode === "dry_run" ? "Dry run completed" : "Run completed"} for ${runRow.syncId}.`
  });
}

function validatePlanProviders(plan, bindingsByName, datasourceIndex) {
  const sourceBinding = normalizeText(plan?.source?.binding);
  const sourceDatasourceId = bindingsByName[sourceBinding]?.datasourceId ?? "";
  const sourceDatasource = datasourceIndex?.byId?.[sourceDatasourceId] ?? null;
  if (!sourceDatasourceId || !sourceDatasource) {
    return { ok: false, reason: `binding ${sourceBinding} is not assigned to a datasource` };
  }
  if (normalizeText(sourceDatasource.provider) !== "mysql") {
    return { ok: false, reason: `unsupported source provider ${sourceDatasource.provider || "unknown"} for ${sourceBinding}` };
  }
  for (const outputTransform of plan?.outputTransforms ?? []) {
    const bindingName = normalizeText(outputTransform?.target?.binding);
    const targetDatasourceId = bindingsByName[bindingName]?.datasourceId ?? "";
    const targetDatasource = datasourceIndex?.byId?.[targetDatasourceId] ?? null;
    if (!targetDatasourceId || !targetDatasource) {
      return { ok: false, reason: `binding ${bindingName} is not assigned to a datasource` };
    }
    if (normalizeText(targetDatasource.provider) !== "postgres") {
      return { ok: false, reason: `unsupported target provider ${targetDatasource.provider || "unknown"} for ${bindingName}` };
    }
  }
  return { ok: true, sourceDatasourceId };
}

export function createBuiltinPipelineJobHandlers({
  world,
  project = projector => world.project(projector),
  isoAt
}) {
  return {
    "pipeline.run.execute": async ({ actor, appContext, payload }) => {
      const runIdValue = normalizeText(payload?.runId);
      if (!runIdValue) throw new Error("runId required");
      const runRow = pipelineRunFor(project, runIdValue);
      if (!runRow) throw new Error("pipeline run not found");
      const catalog = createPipelineCatalogFromAppProject(appContext?.appProject);
      const plan = catalog.syncPlans.get(runRow.syncId) ?? null;
      if (!plan) throw new Error(`sync ${runRow.syncId} not found`);
      const bindingNames = uniqueBindingNames(plan);
      const bindingsByName = Object.fromEntries(
        bindingNames.map(bindingName => [bindingName, pipelineBindingFor(project, runRow.serverRunner, runRow.syncId, bindingName)])
      );
      const datasourceIndex = project(moduleProjectors.sqlDatasourceIndex);
      const providerGate = validatePlanProviders(plan, bindingsByName, datasourceIndex);
      if (!providerGate.ok) {
        const completedAt = isoNow(isoAt);
        emitRunEvent(world, "pipeline.run.failed", actor, {
          runId: runRow.id,
          serverRunner: runRow.serverRunner,
          syncId: runRow.syncId,
          mode: runRow.mode,
          jobId: runRow.jobId,
          rowLimit: runRow.rowLimit,
          sourceBinding: runRow.sourceBinding,
          sourceDatasourceId: runRow.sourceDatasourceId,
          targetBindings: runRow.targetBindings,
          checkpointBefore: runRow.checkpointBefore,
          rowsRead: 0,
          worldCounts: {},
          sqlCounts: {},
          checkpointCommitted: false,
          completedAt,
          at: completedAt,
          reason: providerGate.reason,
          message: providerGate.reason,
          status: "failed"
        });
        throw new Error(providerGate.reason);
      }
      const checkpoint = pipelineCheckpointFor(project, runRow.serverRunner, runRow.syncId);
      try {
        await executePipelineRun({
          world,
          actor,
          appContext,
          runRow,
          plan,
          bindingsByName,
          checkpoint,
          isoAt
        });
      } catch (error) {
        const completedAt = isoNow(isoAt);
        emitRunEvent(world, "pipeline.run.failed", actor, {
          runId: runRow.id,
          serverRunner: runRow.serverRunner,
          syncId: runRow.syncId,
          mode: runRow.mode,
          jobId: runRow.jobId,
          rowLimit: runRow.rowLimit,
          sourceBinding: runRow.sourceBinding,
          sourceDatasourceId: runRow.sourceDatasourceId,
          targetBindings: runRow.targetBindings,
          checkpointBefore: checkpoint?.cursorValue ?? null,
          checkpointCommitted: false,
          rowsRead: 0,
          worldCounts: {},
          sqlCounts: {},
          completedAt,
          at: completedAt,
          reason: error instanceof Error ? error.message : String(error),
          message: error instanceof Error ? error.message : String(error),
          status: "failed"
        });
        throw error;
      }
    }
  };
}

export function createPipelineRunRecord({
  world,
  actor,
  runId: explicitRunId = null,
  serverRunnerId,
  syncId,
  mode,
  rowLimit,
  sourceBinding,
  sourceDatasourceId,
  targetBindings,
  checkpointBefore,
  jobId,
  isoAt
}) {
  const id = explicitRunId || runId();
  const now = isoNow(isoAt);
  world.emit({
    process: "pipeline.run.enqueue",
    actor,
    claims: runClaims(id, actor, syncId),
    body: {
      runId: id,
      serverRunner: serverRunnerId,
      syncId,
      mode,
      status: "queued",
      jobId,
      rowLimit,
      startedAt: null,
      completedAt: null,
      sourceBinding,
      sourceDatasourceId,
      targetBindings,
      checkpointBefore,
      checkpointCandidate: null,
      checkpointCommitted: false,
      rowsRead: 0,
      worldCounts: {},
      sqlCounts: {},
      mayHaveMoreRows: false,
      lastError: null,
      at: now,
      message: `Queued ${mode} run for ${syncId}.`
    }
  });
  return id;
}

export function upsertPipelineBinding({
  world,
  actor,
  serverRunnerId,
  syncId,
  bindingName,
  datasourceId,
  existing,
  isoAt
}) {
  const id = existing?.id ?? bindingId(serverRunnerId, syncId, bindingName);
  const now = isoNow(isoAt);
  if (!datasourceId) {
    world.emit({
      process: "pipeline.binding.delete",
      actor,
      claims: bindingClaims(id, actor, bindingName),
      body: {
        id,
        serverRunner: serverRunnerId,
        syncId,
        bindingName,
        updatedAt: now
      }
    });
    return { id, deleted: true };
  }
  world.emit({
    process: "pipeline.binding.upsert",
    actor,
    claims: bindingClaims(id, actor, bindingName),
    body: {
      id,
      serverRunner: serverRunnerId,
      syncId,
      bindingName,
      datasourceId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
  });
  return { id, deleted: false };
}
