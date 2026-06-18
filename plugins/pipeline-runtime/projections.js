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

function defaultRunRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    syncId: null,
    mode: null,
    status: "queued",
    jobId: null,
    rowLimit: 0,
    startedAt: null,
    completedAt: null,
    sourceBinding: null,
    sourceDatasourceId: null,
    targetBindings: [],
    checkpointBefore: null,
    checkpointCandidate: null,
    checkpointCommitted: false,
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

function assignRunBody(row, body = {}) {
  row.serverRunner = typeof body.serverRunner === "string" ? body.serverRunner : row.serverRunner;
  row.syncId = typeof body.syncId === "string" ? body.syncId : row.syncId;
  row.mode = typeof body.mode === "string" ? body.mode : row.mode;
  row.jobId = typeof body.jobId === "string" ? body.jobId : row.jobId;
  row.rowLimit = Number.isFinite(body.rowLimit) ? body.rowLimit : row.rowLimit;
  row.sourceBinding = typeof body.sourceBinding === "string" ? body.sourceBinding : row.sourceBinding;
  row.sourceDatasourceId = typeof body.sourceDatasourceId === "string" ? body.sourceDatasourceId : row.sourceDatasourceId;
  row.targetBindings = Array.isArray(body.targetBindings) ? body.targetBindings.map(entry => ({ ...entry })) : row.targetBindings;
  row.checkpointBefore = body.checkpointBefore ?? row.checkpointBefore;
  row.checkpointCandidate = body.checkpointCandidate ?? row.checkpointCandidate;
  row.checkpointCommitted = typeof body.checkpointCommitted === "boolean" ? body.checkpointCommitted : row.checkpointCommitted;
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
  for (const row of rows) {
    byId[row.id] = row;
    if (row.serverRunner) byRunner[row.serverRunner] = [...(byRunner[row.serverRunner] ?? []), row];
  }
  return { rows, byId, byRunner };
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
  pipelineRuns,
  pipelineRunIndex,
  pipelineRunLogs,
  pipelineRunLogIndex
});
