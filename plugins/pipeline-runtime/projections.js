import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

function defaultBindingRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    syncId: null,
    bindingName: null,
    datasourceId: null,
    createdAt: null,
    updatedAt: null,
    deleted: false
  };
}

function defaultCheckpointRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    syncId: null,
    progressKind: null,
    progressField: null,
    cursorValue: null,
    updatedAt: null
  };
}

function defaultScheduleRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    syncId: null,
    enabled: false,
    intervalMs: 0,
    rowLimit: 0,
    maxBatchesPerRun: 0,
    createdAt: null,
    updatedAt: null,
    lastTriggeredAt: null,
    lastParentRunId: null,
    deleted: false
  };
}

function defaultRunRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    syncId: null,
    runKind: "parent",
    triggerKind: "manual",
    mode: null,
    status: "queued",
    scheduleId: null,
    parentRunId: null,
    batchOrdinal: null,
    jobId: null,
    rowLimit: 0,
    maxBatches: 0,
    childCount: 0,
    startedAt: null,
    completedAt: null,
    sourceBinding: null,
    sourceDatasourceId: null,
    targetBindings: [],
    checkpointBefore: null,
    checkpointAfter: null,
    checkpointCandidate: null,
    checkpointCommitted: false,
    completionReason: null,
    rowsRead: 0,
    worldCounts: {},
    sqlCounts: {},
    mayHaveMoreRows: false,
    lastError: null
  };
}

export function pipelineSqlBindings(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "pipelineSqlBinding") continue;
    rows.set(id, defaultBindingRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("pipeline.binding.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultBindingRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.syncId = typeof witness.body.syncId === "string" ? witness.body.syncId : row.syncId;
    row.bindingName = typeof witness.body.bindingName === "string" ? witness.body.bindingName : row.bindingName;
    row.datasourceId = typeof witness.body.datasourceId === "string" ? witness.body.datasourceId : row.datasourceId;
    row.createdAt = typeof witness.body.createdAt === "string" ? witness.body.createdAt : row.createdAt;
    row.updatedAt = typeof witness.body.updatedAt === "string" ? witness.body.updatedAt : row.updatedAt;
    row.title = titles.get(id) ?? row.bindingName ?? row.title;
    if (witness.process === "pipeline.binding.delete") row.deleted = true;
    rows.set(id, row);
  }

  return [...rows.values()]
    .filter(row => row.deleted !== true)
    .map(({ deleted, ...row }) => row)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export function pipelineSqlBindingIndex(witnesses, options = {}) {
  const rows = pipelineSqlBindings(witnesses, options);
  const byId = Object.create(null);
  const byRunner = Object.create(null);
  const byRunnerSync = Object.create(null);
  for (const row of rows) {
    byId[row.id] = row;
    if (row.serverRunner) {
      byRunner[row.serverRunner] = [...(byRunner[row.serverRunner] ?? []), row];
      const runnerSyncKey = `${row.serverRunner}:${row.syncId ?? ""}`;
      const bindingMap = byRunnerSync[runnerSyncKey] ?? Object.create(null);
      if (row.bindingName) bindingMap[row.bindingName] = row;
      byRunnerSync[runnerSyncKey] = bindingMap;
    }
  }
  return { rows, byId, byRunner, byRunnerSync };
}

export function pipelineCheckpoints(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "pipelineCheckpoint") continue;
    rows.set(id, defaultCheckpointRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (witness.process !== "pipeline.checkpoint.commit" || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultCheckpointRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.syncId = typeof witness.body.syncId === "string" ? witness.body.syncId : row.syncId;
    row.progressKind = typeof witness.body.progressKind === "string" ? witness.body.progressKind : row.progressKind;
    row.progressField = typeof witness.body.progressField === "string" ? witness.body.progressField : row.progressField;
    row.cursorValue = witness.body.cursorValue ?? row.cursorValue;
    row.updatedAt = typeof witness.body.updatedAt === "string" ? witness.body.updatedAt : row.updatedAt;
    row.title = titles.get(id) ?? row.syncId ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export function pipelineCheckpointIndex(witnesses, options = {}) {
  const rows = pipelineCheckpoints(witnesses, options);
  const byId = Object.create(null);
  const byRunnerSync = Object.create(null);
  for (const row of rows) {
    byId[row.id] = row;
    if (row.serverRunner && row.syncId) byRunnerSync[`${row.serverRunner}:${row.syncId}`] = row;
  }
  return { rows, byId, byRunnerSync };
}

export function pipelineSchedules(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "pipelineSchedule") continue;
    rows.set(id, defaultScheduleRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("pipeline.schedule.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultScheduleRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.syncId = typeof witness.body.syncId === "string" ? witness.body.syncId : row.syncId;
    row.enabled = typeof witness.body.enabled === "boolean" ? witness.body.enabled : row.enabled;
    row.intervalMs = Number.isFinite(witness.body.intervalMs) ? witness.body.intervalMs : row.intervalMs;
    row.rowLimit = Number.isFinite(witness.body.rowLimit) ? witness.body.rowLimit : row.rowLimit;
    row.maxBatchesPerRun = Number.isFinite(witness.body.maxBatchesPerRun) ? witness.body.maxBatchesPerRun : row.maxBatchesPerRun;
    row.createdAt = typeof witness.body.createdAt === "string" ? witness.body.createdAt : row.createdAt;
    row.updatedAt = typeof witness.body.updatedAt === "string" ? witness.body.updatedAt : row.updatedAt;
    row.lastTriggeredAt = typeof witness.body.lastTriggeredAt === "string"
      ? witness.body.lastTriggeredAt
      : (typeof witness.body.triggeredAt === "string"
          ? witness.body.triggeredAt
          : (typeof witness.body.skippedAt === "string" ? witness.body.skippedAt : row.lastTriggeredAt));
    row.lastParentRunId = typeof witness.body.lastParentRunId === "string" ? witness.body.lastParentRunId : row.lastParentRunId;
    row.title = titles.get(id) ?? row.syncId ?? row.title;
    if (witness.process === "pipeline.schedule.delete") row.deleted = true;
    rows.set(id, row);
  }

  return [...rows.values()]
    .filter(row => row.deleted !== true)
    .map(({ deleted, ...row }) => row)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export function pipelineScheduleIndex(witnesses, options = {}) {
  const rows = pipelineSchedules(witnesses, options);
  const byId = Object.create(null);
  const byRunner = Object.create(null);
  const byRunnerSync = Object.create(null);
  for (const row of rows) {
    byId[row.id] = row;
    if (row.serverRunner) {
      byRunner[row.serverRunner] = [...(byRunner[row.serverRunner] ?? []), row];
      if (row.syncId) byRunnerSync[`${row.serverRunner}:${row.syncId}`] = row;
    }
  }
  return { rows, byId, byRunner, byRunnerSync };
}

function assignRunBody(row, body = {}) {
  row.serverRunner = typeof body.serverRunner === "string" ? body.serverRunner : row.serverRunner;
  row.syncId = typeof body.syncId === "string" ? body.syncId : row.syncId;
  row.runKind = typeof body.runKind === "string" ? body.runKind : row.runKind;
  row.triggerKind = typeof body.triggerKind === "string" ? body.triggerKind : row.triggerKind;
  row.mode = typeof body.mode === "string" ? body.mode : row.mode;
  row.scheduleId = typeof body.scheduleId === "string" ? body.scheduleId : row.scheduleId;
  row.parentRunId = typeof body.parentRunId === "string" ? body.parentRunId : row.parentRunId;
  row.batchOrdinal = Number.isFinite(body.batchOrdinal) ? body.batchOrdinal : row.batchOrdinal;
  row.jobId = typeof body.jobId === "string" ? body.jobId : row.jobId;
  row.rowLimit = Number.isFinite(body.rowLimit) ? body.rowLimit : row.rowLimit;
  row.maxBatches = Number.isFinite(body.maxBatches) ? body.maxBatches : row.maxBatches;
  row.childCount = Number.isFinite(body.childCount) ? body.childCount : row.childCount;
  row.sourceBinding = typeof body.sourceBinding === "string" ? body.sourceBinding : row.sourceBinding;
  row.sourceDatasourceId = typeof body.sourceDatasourceId === "string" ? body.sourceDatasourceId : row.sourceDatasourceId;
  row.targetBindings = Array.isArray(body.targetBindings) ? body.targetBindings.map(entry => ({ ...entry })) : row.targetBindings;
  row.checkpointBefore = body.checkpointBefore ?? row.checkpointBefore;
  row.checkpointAfter = body.checkpointAfter ?? row.checkpointAfter;
  row.checkpointCandidate = body.checkpointCandidate ?? row.checkpointCandidate;
  row.checkpointCommitted = typeof body.checkpointCommitted === "boolean" ? body.checkpointCommitted : row.checkpointCommitted;
  row.completionReason = typeof body.completionReason === "string" ? body.completionReason : row.completionReason;
  row.rowsRead = Number.isFinite(body.rowsRead) ? body.rowsRead : row.rowsRead;
  row.worldCounts = body.worldCounts && typeof body.worldCounts === "object" ? { ...body.worldCounts } : row.worldCounts;
  row.sqlCounts = body.sqlCounts && typeof body.sqlCounts === "object" ? { ...body.sqlCounts } : row.sqlCounts;
  row.mayHaveMoreRows = typeof body.mayHaveMoreRows === "boolean" ? body.mayHaveMoreRows : row.mayHaveMoreRows;
  if (body.lastError === null) {
    row.lastError = null;
  } else if (typeof body.reason === "string") {
    row.lastError = body.reason;
  } else if (typeof body.lastError === "string") {
    row.lastError = body.lastError;
  }
}

export function pipelineRuns(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "pipelineRun") continue;
    rows.set(id, defaultRunRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("pipeline.run.") || !witness.body?.runId) continue;
    const id = String(witness.body.runId);
    const row = rows.get(id) ?? defaultRunRow(id, { titles, owners, contexts });
    assignRunBody(row, witness.body);
    if (witness.process === "pipeline.run.enqueue") {
      row.status = "queued";
    } else if (witness.process === "pipeline.run.start") {
      row.status = "running";
      row.startedAt = typeof witness.body.startedAt === "string" ? witness.body.startedAt : row.startedAt;
    } else if (witness.process === "pipeline.run.succeeded") {
      row.status = "succeeded";
      row.startedAt = typeof witness.body.startedAt === "string" ? witness.body.startedAt : row.startedAt;
      row.completedAt = typeof witness.body.completedAt === "string" ? witness.body.completedAt : row.completedAt;
    } else if (witness.process === "pipeline.run.failed") {
      row.status = "failed";
      row.startedAt = typeof witness.body.startedAt === "string" ? witness.body.startedAt : row.startedAt;
      row.completedAt = typeof witness.body.completedAt === "string" ? witness.body.completedAt : row.completedAt;
    }
    row.title = titles.get(id) ?? row.syncId ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()].sort((left, right) => {
    const leftTime = Date.parse(left.startedAt ?? left.completedAt ?? "") || 0;
    const rightTime = Date.parse(right.startedAt ?? right.completedAt ?? "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(left.id).localeCompare(String(right.id));
  });
}

export function pipelineRunIndex(witnesses, options = {}) {
  const rows = pipelineRuns(witnesses, options);
  const byId = Object.create(null);
  const byRunner = Object.create(null);
  const byParentId = Object.create(null);
  const byRunnerSyncParents = Object.create(null);
  const byRunnerSyncChildren = Object.create(null);
  for (const row of rows) {
    byId[row.id] = row;
    if (row.serverRunner) {
      byRunner[row.serverRunner] = [...(byRunner[row.serverRunner] ?? []), row];
      const runnerSyncKey = `${row.serverRunner}:${row.syncId ?? ""}`;
      if (row.runKind === "parent") {
        byRunnerSyncParents[runnerSyncKey] = [...(byRunnerSyncParents[runnerSyncKey] ?? []), row];
      } else if (row.runKind === "child") {
        byRunnerSyncChildren[runnerSyncKey] = [...(byRunnerSyncChildren[runnerSyncKey] ?? []), row];
      }
    }
    if (row.parentRunId) byParentId[row.parentRunId] = [...(byParentId[row.parentRunId] ?? []), row];
  }
  return { rows, byId, byRunner, byParentId, byRunnerSyncParents, byRunnerSyncChildren };
}

export function pipelineRunLogs(witnesses) {
  const rows = [];
  let ordinal = 0;
  for (const witness of witnesses) {
    if (!witness.process.startsWith("pipeline.run.") || !witness.body?.runId) continue;
    ordinal += 1;
    const at = typeof witness.body.at === "string"
      ? witness.body.at
      : (typeof witness.body.completedAt === "string"
          ? witness.body.completedAt
          : (typeof witness.body.startedAt === "string" ? witness.body.startedAt : null));
    rows.push({
      id: `${witness.body.runId}:${ordinal}`,
      runId: String(witness.body.runId),
      process: witness.process,
      stage: typeof witness.body.stage === "string" ? witness.body.stage : witness.process.replace(/^pipeline\.run\./, ""),
      status: typeof witness.body.status === "string"
        ? witness.body.status
        : (witness.process.endsWith(".failed") ? "failed" : "info"),
      message: typeof witness.body.message === "string"
        ? witness.body.message
        : (typeof witness.body.reason === "string" ? witness.body.reason : witness.process),
      at
    });
  }
  return rows;
}

export function pipelineRunLogIndex(witnesses) {
  const rows = pipelineRunLogs(witnesses);
  const byRunId = Object.create(null);
  for (const row of rows) byRunId[row.runId] = [...(byRunId[row.runId] ?? []), row];
  return { rows, byRunId };
}

export const pipelineModuleProjectors = Object.freeze({
  pipelineSqlBindings,
  pipelineSqlBindingIndex,
  pipelineCheckpoints,
  pipelineCheckpointIndex,
  pipelineSchedules,
  pipelineScheduleIndex,
  pipelineRuns,
  pipelineRunIndex,
  pipelineRunLogs,
  pipelineRunLogIndex
});
