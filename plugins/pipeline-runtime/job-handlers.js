import { randomUUID } from "node:crypto";
import { relation, thing } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { createPipelineCatalogFromAppProject } from "./catalog-runtime.js";
import { evaluatePlannedSync } from "./planner-runtime.js";
import { pipelineModuleProjectors } from "./projections.js";

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function checkpointId(serverRunnerId, syncId) {
  return `pipeline_ckpt_${serverRunnerId}_${syncId}`;
}

function bindingId(serverRunnerId, syncId, bindingName) {
  return `pipeline_bind_${serverRunnerId}_${syncId}_${bindingName}`;
}

function scheduleId(serverRunnerId, syncId) {
  return `pipeline_sched_${serverRunnerId}_${syncId}`;
}

function runId(prefix = "pipeline_run") {
  return `${prefix}_${randomUUID()}`;
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

function scheduleClaims(id, actor, title) {
  return [
    thing(id),
    relation(id, "hasModuleKind", "pipelineSchedule"),
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

function pipelineRunFor(project, runIdValue) {
  return project(pipelineModuleProjectors.pipelineRunIndex).byId?.[runIdValue] ?? null;
}

function pipelineBindingFor(project, serverRunnerId, syncId, bindingName) {
  return project(pipelineModuleProjectors.pipelineSqlBindingIndex).byRunnerSync?.[`${serverRunnerId}:${syncId}`]?.[bindingName] ?? null;
}

function successfulChildRows(project, parentRunId) {
  return (project(pipelineModuleProjectors.pipelineRunIndex).byParentId?.[parentRunId] ?? [])
    .filter(row => row.runKind === "child" && row.status === "succeeded");
}

function previewRows(rows, limit = 2) {
  return (rows ?? []).slice(0, limit);
}

function fixtureForSourceRows(tableId, rows) {
  return { sourceRows: { [tableId]: rows } };
}

function sumCounts(rows, field) {
  const totals = {};
  for (const row of rows ?? []) {
    const counts = row?.[field] ?? {};
    for (const [key, value] of Object.entries(counts)) {
      totals[key] = Number(totals[key] || 0) + Number(value || 0);
    }
  }
  return totals;
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
  return { ok: true };
}

function aggregateParentProgress(project, parentRunId, currentChildSummary) {
  const previousChildren = successfulChildRows(project, parentRunId);
  const rowsRead = previousChildren.reduce((sum, row) => sum + Number(row.rowsRead || 0), 0) + Number(currentChildSummary.rowsRead || 0);
  const worldCounts = sumCounts(previousChildren, "worldCounts");
  const sqlCounts = sumCounts(previousChildren, "sqlCounts");
  for (const [key, value] of Object.entries(currentChildSummary.worldCounts ?? {})) {
    worldCounts[key] = Number(worldCounts[key] || 0) + Number(value || 0);
  }
  for (const [key, value] of Object.entries(currentChildSummary.sqlCounts ?? {})) {
    sqlCounts[key] = Number(sqlCounts[key] || 0) + Number(value || 0);
  }
  return {
    childCount: previousChildren.length + 1,
    rowsRead,
    worldCounts,
    sqlCounts,
    checkpointAfter: currentChildSummary.checkpointAfter ?? null,
    checkpointCommitted: currentChildSummary.checkpointCommitted === true,
    mayHaveMoreRows: currentChildSummary.mayHaveMoreRows === true
  };
}

function emitParentAdvanceFromChild({
  world,
  project,
  actor,
  parentRunId,
  currentChildSummary,
  isoAt
}) {
  const parent = pipelineRunFor(project, parentRunId);
  if (!parent) return;
  const aggregate = aggregateParentProgress(project, parentRunId, currentChildSummary);
  emitRunEvent(world, "pipeline.run.advance", actor, {
    runId: parentRunId,
    serverRunner: parent.serverRunner,
    syncId: parent.syncId,
    runKind: "parent",
    triggerKind: parent.triggerKind,
    mode: parent.mode,
    scheduleId: parent.scheduleId,
    rowLimit: parent.rowLimit,
    maxBatches: parent.maxBatches,
    sourceBinding: parent.sourceBinding,
    sourceDatasourceId: parent.sourceDatasourceId,
    targetBindings: parent.targetBindings,
    checkpointBefore: parent.checkpointBefore,
    checkpointAfter: aggregate.checkpointAfter,
    checkpointCommitted: aggregate.checkpointCommitted,
    childCount: aggregate.childCount,
    rowsRead: aggregate.rowsRead,
    worldCounts: aggregate.worldCounts,
    sqlCounts: aggregate.sqlCounts,
    mayHaveMoreRows: aggregate.mayHaveMoreRows,
    batchOrdinal: currentChildSummary.batchOrdinal,
    at: isoNow(isoAt),
    stage: "parent",
    status: "running",
    message: `Parent run now covers ${aggregate.childCount} batch(es), ${aggregate.rowsRead} source row(s), world [${summarizeCounts(aggregate.worldCounts)}], SQL [${summarizeCounts(aggregate.sqlCounts)}].`
  });
}

async function executePipelineChildRun({
  world,
  project,
  actor,
  appContext,
  runRow,
  plan,
  bindingsByName,
  isoAt
}) {
  const startedAt = isoNow(isoAt);
  const runBody = {
    runId: runRow.id,
    serverRunner: runRow.serverRunner,
    syncId: runRow.syncId,
    runKind: "child",
    triggerKind: runRow.triggerKind,
    mode: runRow.mode,
    scheduleId: runRow.scheduleId,
    parentRunId: runRow.parentRunId,
    batchOrdinal: runRow.batchOrdinal,
    jobId: runRow.jobId,
    rowLimit: runRow.rowLimit,
    maxBatches: runRow.maxBatches,
    sourceBinding: runRow.sourceBinding,
    sourceDatasourceId: runRow.sourceDatasourceId,
    targetBindings: runRow.targetBindings,
    checkpointBefore: runRow.checkpointBefore,
    startedAt,
    at: startedAt
  };
  emitRunEvent(world, "pipeline.run.start", actor, {
    ...runBody,
    status: "running",
    message: `Started child batch ${Number(runRow.batchOrdinal || 0)} for ${runRow.syncId}.`
  });

  const replayWindowMs = Number.isFinite(plan?.progress?.replayWindowMs) ? plan.progress.replayWindowMs : 0;
  const lowerBound = replayLowerBound(runRow.checkpointBefore ?? null, replayWindowMs);
  const readResult = await appContext.dbSql.readOrderedBatch({
    datasourceId: runRow.sourceDatasourceId,
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
  let checkpointAfter = runRow.checkpointBefore ?? null;
  if (checkpointCandidate != null) checkpointAfter = checkpointCandidate;

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
      checkpointAfter,
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
    checkpointAfter,
    checkpointCommitted,
    rowsRead: readResult.rowCount,
    worldCounts: evaluated.summary.worldCounts,
    sqlCounts: evaluated.summary.sqlCounts,
    mayHaveMoreRows,
    completionReason: readResult.rowCount === 0 ? "empty" : (mayHaveMoreRows ? "max_batches" : "drained"),
    message: `${runRow.mode === "dry_run" ? "Dry run child completed" : "Execute child completed"} for ${runRow.syncId}.`
  });
  if (runRow.parentRunId) {
    emitParentAdvanceFromChild({
      world,
      project,
      actor,
      parentRunId: runRow.parentRunId,
      currentChildSummary: {
        batchOrdinal: runRow.batchOrdinal,
        rowsRead: readResult.rowCount,
        worldCounts: evaluated.summary.worldCounts,
        sqlCounts: evaluated.summary.sqlCounts,
        checkpointAfter,
        checkpointCommitted,
        mayHaveMoreRows
      },
      isoAt
    });
  }
}

export function createBuiltinPipelineJobHandlers({
  world,
  project = projector => world.project(projector),
  isoAt
}) {
  return {
    "pipeline.run.child.execute": async ({ actor, appContext, payload, attempt, job }) => {
      const runIdValue = normalizeText(payload?.runId);
      if (!runIdValue) throw new Error("runId required");
      const runRow = pipelineRunFor(project, runIdValue);
      if (!runRow) throw new Error("pipeline child run not found");
      if (runRow.runKind !== "child") throw new Error("pipeline child run required");
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
        const reason = providerGate.reason;
        const maxAttempts = Number(job?.maxAttempts || 1);
        if (attempt >= maxAttempts) {
          emitRunEvent(world, "pipeline.run.failed", actor, {
            runId: runRow.id,
            serverRunner: runRow.serverRunner,
            syncId: runRow.syncId,
            runKind: "child",
            triggerKind: runRow.triggerKind,
            mode: runRow.mode,
            scheduleId: runRow.scheduleId,
            parentRunId: runRow.parentRunId,
            batchOrdinal: runRow.batchOrdinal,
            jobId: runRow.jobId,
            rowLimit: runRow.rowLimit,
            maxBatches: runRow.maxBatches,
            sourceBinding: runRow.sourceBinding,
            sourceDatasourceId: runRow.sourceDatasourceId,
            targetBindings: runRow.targetBindings,
            checkpointBefore: runRow.checkpointBefore,
            checkpointAfter: runRow.checkpointBefore,
            checkpointCommitted: false,
            rowsRead: 0,
            worldCounts: {},
            sqlCounts: {},
            completedAt: isoNow(isoAt),
            at: isoNow(isoAt),
            reason,
            message: reason,
            status: "failed",
            completionReason: "failed"
          });
        } else {
          emitRunEvent(world, "pipeline.run.retry", actor, {
            runId: runRow.id,
            serverRunner: runRow.serverRunner,
            syncId: runRow.syncId,
            runKind: "child",
            triggerKind: runRow.triggerKind,
            mode: runRow.mode,
            scheduleId: runRow.scheduleId,
            parentRunId: runRow.parentRunId,
            batchOrdinal: runRow.batchOrdinal,
            jobId: runRow.jobId,
            rowLimit: runRow.rowLimit,
            maxBatches: runRow.maxBatches,
            reason,
            status: "queued",
            at: isoNow(isoAt),
            message: `Retrying child batch ${Number(runRow.batchOrdinal || 0)} after: ${reason}`
          });
        }
        throw new Error(reason);
      }
      try {
        await executePipelineChildRun({
          world,
          project,
          actor,
          appContext,
          runRow,
          plan,
          bindingsByName,
          isoAt
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const maxAttempts = Number(job?.maxAttempts || 1);
        if (attempt >= maxAttempts) {
          emitRunEvent(world, "pipeline.run.failed", actor, {
            runId: runRow.id,
            serverRunner: runRow.serverRunner,
            syncId: runRow.syncId,
            runKind: "child",
            triggerKind: runRow.triggerKind,
            mode: runRow.mode,
            scheduleId: runRow.scheduleId,
            parentRunId: runRow.parentRunId,
            batchOrdinal: runRow.batchOrdinal,
            jobId: runRow.jobId,
            rowLimit: runRow.rowLimit,
            maxBatches: runRow.maxBatches,
            sourceBinding: runRow.sourceBinding,
            sourceDatasourceId: runRow.sourceDatasourceId,
            targetBindings: runRow.targetBindings,
            checkpointBefore: runRow.checkpointBefore,
            checkpointAfter: runRow.checkpointBefore,
            checkpointCommitted: false,
            rowsRead: 0,
            worldCounts: {},
            sqlCounts: {},
            completedAt: isoNow(isoAt),
            at: isoNow(isoAt),
            reason,
            message: reason,
            status: "failed",
            completionReason: "failed"
          });
        } else {
          emitRunEvent(world, "pipeline.run.retry", actor, {
            runId: runRow.id,
            serverRunner: runRow.serverRunner,
            syncId: runRow.syncId,
            runKind: "child",
            triggerKind: runRow.triggerKind,
            mode: runRow.mode,
            scheduleId: runRow.scheduleId,
            parentRunId: runRow.parentRunId,
            batchOrdinal: runRow.batchOrdinal,
            jobId: runRow.jobId,
            rowLimit: runRow.rowLimit,
            maxBatches: runRow.maxBatches,
            reason,
            status: "queued",
            at: isoNow(isoAt),
            message: `Retrying child batch ${Number(runRow.batchOrdinal || 0)} after: ${reason}`
          });
        }
        throw error;
      }
    }
  };
}

export function createPipelineParentRunRecord({
  world,
  actor,
  runId: explicitRunId = null,
  serverRunnerId,
  syncId,
  triggerKind,
  mode,
  rowLimit,
  maxBatches,
  sourceBinding,
  sourceDatasourceId,
  targetBindings,
  checkpointBefore,
  scheduleId: scheduleIdValue = null,
  isoAt
}) {
  const id = explicitRunId || runId("pipeline_parent");
  const now = isoNow(isoAt);
  const baseBody = {
    runId: id,
    serverRunner: serverRunnerId,
    syncId,
    runKind: "parent",
    triggerKind,
    mode,
    status: "queued",
    scheduleId: scheduleIdValue,
    parentRunId: null,
    batchOrdinal: null,
    jobId: null,
    rowLimit,
    maxBatches,
    childCount: 0,
    startedAt: null,
    completedAt: null,
    sourceBinding,
    sourceDatasourceId,
    targetBindings,
    checkpointBefore,
    checkpointAfter: checkpointBefore,
    checkpointCandidate: null,
    checkpointCommitted: false,
    completionReason: null,
    rowsRead: 0,
    worldCounts: {},
    sqlCounts: {},
    mayHaveMoreRows: false,
    lastError: null,
    at: now
  };
  world.emit({
    process: "pipeline.run.enqueue",
    actor,
    claims: runClaims(id, actor, syncId),
    body: {
      ...baseBody,
      message: `Queued ${triggerKind} ${mode} parent run for ${syncId}.`
    }
  });
  world.emit({
    process: "pipeline.run.start",
    actor,
    claims: [],
    body: {
      ...baseBody,
      status: "running",
      startedAt: now,
      message: `Started ${triggerKind} ${mode} parent run for ${syncId}.`
    }
  });
  return id;
}

export function createPipelineChildRunRecord({
  world,
  actor,
  runId: explicitRunId = null,
  parentRunId,
  serverRunnerId,
  syncId,
  triggerKind,
  mode,
  rowLimit,
  maxBatches,
  batchOrdinal,
  sourceBinding,
  sourceDatasourceId,
  targetBindings,
  checkpointBefore,
  scheduleId: scheduleIdValue = null,
  jobId,
  isoAt
}) {
  const id = explicitRunId || runId("pipeline_child");
  const now = isoNow(isoAt);
  world.emit({
    process: "pipeline.run.enqueue",
    actor,
    claims: runClaims(id, actor, `${syncId} batch ${batchOrdinal}`),
    body: {
      runId: id,
      serverRunner: serverRunnerId,
      syncId,
      runKind: "child",
      triggerKind,
      mode,
      status: "queued",
      scheduleId: scheduleIdValue,
      parentRunId,
      batchOrdinal,
      jobId,
      rowLimit,
      maxBatches,
      childCount: 0,
      startedAt: null,
      completedAt: null,
      sourceBinding,
      sourceDatasourceId,
      targetBindings,
      checkpointBefore,
      checkpointAfter: checkpointBefore,
      checkpointCandidate: null,
      checkpointCommitted: false,
      completionReason: null,
      rowsRead: 0,
      worldCounts: {},
      sqlCounts: {},
      mayHaveMoreRows: false,
      lastError: null,
      at: now,
      message: `Queued child batch ${batchOrdinal} for ${syncId}.`
    }
  });
  return id;
}

export function createFailedPipelineParentRun({
  world,
  actor,
  runId: explicitRunId = null,
  serverRunnerId,
  syncId,
  triggerKind,
  mode,
  rowLimit,
  maxBatches,
  sourceBinding = "",
  sourceDatasourceId = "",
  targetBindings = [],
  checkpointBefore = null,
  scheduleId: scheduleIdValue = null,
  reason,
  isoAt
}) {
  const id = createPipelineParentRunRecord({
    world,
    actor,
    runId: explicitRunId,
    serverRunnerId,
    syncId,
    triggerKind,
    mode,
    rowLimit,
    maxBatches,
    sourceBinding,
    sourceDatasourceId,
    targetBindings,
    checkpointBefore,
    scheduleId: scheduleIdValue,
    isoAt
  });
  const now = isoNow(isoAt);
  emitRunEvent(world, "pipeline.run.failed", actor, {
    runId: id,
    serverRunner: serverRunnerId,
    syncId,
    runKind: "parent",
    triggerKind,
    mode,
    scheduleId: scheduleIdValue,
    parentRunId: null,
    batchOrdinal: null,
    rowLimit,
    maxBatches,
    childCount: 0,
    sourceBinding,
    sourceDatasourceId,
    targetBindings,
    checkpointBefore,
    checkpointAfter: checkpointBefore,
    checkpointCommitted: false,
    completionReason: "failed",
    rowsRead: 0,
    worldCounts: {},
    sqlCounts: {},
    mayHaveMoreRows: false,
    lastError: reason,
    completedAt: now,
    at: now,
    reason,
    message: reason,
    status: "failed"
  });
  return id;
}

export function completePipelineParentRun({
  world,
  actor,
  parentRun,
  completionReason,
  message,
  lastError = null,
  mayHaveMoreRows = false,
  checkpointAfter = null,
  checkpointCommitted = false,
  isoAt
}) {
  const now = isoNow(isoAt);
  const process = completionReason === "failed" ? "pipeline.run.failed" : "pipeline.run.succeeded";
  emitRunEvent(world, process, actor, {
    runId: parentRun.id,
    serverRunner: parentRun.serverRunner,
    syncId: parentRun.syncId,
    runKind: "parent",
    triggerKind: parentRun.triggerKind,
    mode: parentRun.mode,
    scheduleId: parentRun.scheduleId,
    rowLimit: parentRun.rowLimit,
    maxBatches: parentRun.maxBatches,
    childCount: parentRun.childCount,
    sourceBinding: parentRun.sourceBinding,
    sourceDatasourceId: parentRun.sourceDatasourceId,
    targetBindings: parentRun.targetBindings,
    checkpointBefore: parentRun.checkpointBefore,
    checkpointAfter,
    checkpointCommitted,
    completionReason,
    rowsRead: parentRun.rowsRead,
    worldCounts: parentRun.worldCounts,
    sqlCounts: parentRun.sqlCounts,
    mayHaveMoreRows,
    lastError,
    completedAt: now,
    at: now,
    reason: lastError,
    message,
    status: completionReason === "failed" ? "failed" : "succeeded"
  });
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

export function upsertPipelineSchedule({
  world,
  actor,
  serverRunnerId,
  syncId,
  enabled,
  intervalMs,
  rowLimit,
  maxBatchesPerRun,
  existing,
  isoAt
}) {
  const id = existing?.id ?? scheduleId(serverRunnerId, syncId);
  const now = isoNow(isoAt);
  world.emit({
    process: "pipeline.schedule.upsert",
    actor,
    claims: scheduleClaims(id, actor, syncId),
    body: {
      id,
      serverRunner: serverRunnerId,
      syncId,
      enabled,
      intervalMs,
      rowLimit,
      maxBatchesPerRun,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastTriggeredAt: existing?.lastTriggeredAt ?? null,
      lastParentRunId: existing?.lastParentRunId ?? null
    }
  });
  return id;
}

export function targetBindingsForPlan(plan, bindingsByName, datasourceIndex) {
  return targetBindingRows(plan, bindingsByName, datasourceIndex);
}

export function validatePipelinePlanProviders(plan, bindingsByName, datasourceIndex) {
  return validatePlanProviders(plan, bindingsByName, datasourceIndex);
}
