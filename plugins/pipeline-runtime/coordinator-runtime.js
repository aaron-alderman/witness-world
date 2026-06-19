import { positiveInteger, runtimeConfigLookup } from "../../src/runtime-config-utils.js";
import { moduleProjectors } from "../../src/modules.js";
import { createPipelineCatalogFromAppProject } from "./catalog-runtime.js";
import {
  completePipelineParentRun,
  createFailedPipelineParentRun,
  createPipelineChildRunRecord,
  createPipelineParentRunRecord,
  targetBindingsForPlan,
  upsertPipelineSchedule,
  validatePipelinePlanProviders
} from "./job-handlers.js";
import { pipelineModuleProjectors } from "./projections.js";

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isoAt(value) {
  return new Date(value).toISOString();
}

function parseIso(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCoordinatorConfig(runtimeConfig) {
  return {
    pollMs: positiveInteger(runtimeConfigLookup(runtimeConfig, "pipeline.orchestrator.pollMs"), 1000)
  };
}

function bindingNamesForPlan(plan) {
  return [...new Set([
    normalizeText(plan?.source?.binding),
    ...(plan?.outputTransforms ?? []).map(transform => normalizeText(transform?.target?.binding))
  ].filter(Boolean))];
}

function activeParentRunFor(runIndex, serverRunnerId, syncId) {
  return (runIndex.byRunnerSyncParents?.[`${serverRunnerId}:${syncId}`] ?? [])
    .find(row => row.status === "queued" || row.status === "running") ?? null;
}

function childrenForParent(runIndex, parentRunId) {
  return [...(runIndex.byParentId?.[parentRunId] ?? [])]
    .sort((left, right) => {
      const leftOrdinal = Number(left.batchOrdinal || 0);
      const rightOrdinal = Number(right.batchOrdinal || 0);
      if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal;
      return String(left.id).localeCompare(String(right.id));
    });
}

function scheduleDue(schedule, nowMs) {
  if (schedule?.enabled !== true) return false;
  if (!Number.isFinite(schedule?.intervalMs) || schedule.intervalMs <= 0) return false;
  const lastTriggeredAt = parseIso(schedule.lastTriggeredAt);
  if (lastTriggeredAt == null) return true;
  return lastTriggeredAt + schedule.intervalMs <= nowMs;
}

function emitScheduleEvent(world, process, actor, body) {
  world.emit({
    process,
    actor,
    claims: [],
    body
  });
}

function resolvePipelineRunContext({
  world,
  project,
  appContext,
  serverRunnerId,
  syncId
}) {
  const catalog = createPipelineCatalogFromAppProject(appContext?.appProject);
  const plan = syncId ? (catalog.syncPlans.get(syncId) ?? null) : null;
  if (!plan) return { ok: false, status: 404, reason: "sync not found" };
  const bindingIndex = project(pipelineModuleProjectors.pipelineSqlBindingIndex);
  const datasourceRows = appContext?.dbSql?.listDatasources?.() ?? [];
  const datasourceIndex = world?.project?.(moduleProjectors.sqlDatasourceIndex) ?? {
    rows: datasourceRows,
    byId: Object.fromEntries(datasourceRows.map(row => [row.id, row]))
  };
  const bindingsByName = Object.fromEntries(
    bindingNamesForPlan(plan).map(name => [name, bindingIndex.byRunnerSync?.[`${serverRunnerId}:${syncId}`]?.[name] ?? null])
  );
  const missingBindings = Object.entries(bindingsByName)
    .filter(([, binding]) => !normalizeText(binding?.datasourceId, ""))
    .map(([bindingName]) => bindingName);
  if (missingBindings.length) {
    return { ok: false, status: 400, reason: `bindings not assigned: ${missingBindings.join(", ")}` };
  }
  const sourceBinding = normalizeText(plan?.source?.binding);
  const sourceDatasourceId = normalizeText(bindingsByName[sourceBinding]?.datasourceId, "");
  const targetBindings = targetBindingsForPlan(plan, bindingsByName, datasourceIndex);
  const providerGate = validatePipelinePlanProviders(plan, bindingsByName, datasourceIndex);
  if (!providerGate.ok) {
    return { ok: false, status: 400, reason: providerGate.reason };
  }
  const checkpointBefore = project(pipelineModuleProjectors.pipelineCheckpointIndex).byRunnerSync?.[`${serverRunnerId}:${syncId}`]?.cursorValue ?? null;
  return {
    ok: true,
    plan,
    bindingsByName,
    sourceBinding,
    sourceDatasourceId,
    targetBindings,
    checkpointBefore
  };
}

export function createPipelineParentRunForSync({
  world,
  project,
  actor,
  appContext,
  serverRunnerId,
  syncId,
  triggerKind,
  mode,
  rowLimit,
  maxBatches,
  scheduleId = null,
  failOnInvalid = false
}) {
  const resolved = resolvePipelineRunContext({
    world,
    project,
    appContext,
    serverRunnerId,
    syncId
  });
  if (!resolved.ok) {
    if (failOnInvalid) {
      const failedRunId = createFailedPipelineParentRun({
        world,
        actor,
        serverRunnerId,
        syncId,
        triggerKind,
        mode,
        rowLimit,
        maxBatches,
        scheduleId,
        reason: resolved.reason,
        isoAt
      });
      return { ok: false, created: true, runId: failedRunId, status: resolved.status, reason: resolved.reason };
    }
    return resolved;
  }
  const parentRunId = createPipelineParentRunRecord({
    world,
    actor,
    serverRunnerId,
    syncId,
    triggerKind,
    mode,
    rowLimit,
    maxBatches,
    sourceBinding: resolved.sourceBinding,
    sourceDatasourceId: resolved.sourceDatasourceId,
    targetBindings: resolved.targetBindings,
    checkpointBefore: resolved.checkpointBefore,
    scheduleId,
    isoAt
  });
  return {
    ok: true,
    runId: parentRunId,
    plan: resolved.plan,
    bindingsByName: resolved.bindingsByName,
    sourceBinding: resolved.sourceBinding,
    sourceDatasourceId: resolved.sourceDatasourceId,
    targetBindings: resolved.targetBindings,
    checkpointBefore: resolved.checkpointBefore
  };
}

function enqueueChildBatch({
  world,
  project,
  actor,
  appContext,
  parentRun,
  batchOrdinal,
  checkpointBefore
}) {
  if (!appContext?.jobs?.enqueue) {
    completePipelineParentRun({
      world,
      actor,
      parentRun,
      completionReason: "failed",
      message: "jobs runtime unavailable",
      lastError: "jobs runtime unavailable",
      mayHaveMoreRows: false,
      checkpointAfter: checkpointBefore,
      checkpointCommitted: false,
      isoAt
    });
    return { ok: false, reason: "jobs runtime unavailable" };
  }
  const childRunId = `pipeline_child_${parentRun.id}_${batchOrdinal}`;
  const queued = appContext.jobs.enqueue({
    actor,
    handler: "pipeline.run.child.execute",
    payload: { runId: childRunId },
    idempotencyKey: `pipeline-child:${parentRun.id}:${batchOrdinal}`
  });
  if (!queued.ok) {
    completePipelineParentRun({
      world,
      actor,
      parentRun,
      completionReason: "failed",
      message: queued.reason || "job enqueue failed",
      lastError: queued.reason || "job enqueue failed",
      mayHaveMoreRows: false,
      checkpointAfter: checkpointBefore,
      checkpointCommitted: false,
      isoAt
    });
    return { ok: false, reason: queued.reason || "job enqueue failed" };
  }
  createPipelineChildRunRecord({
    world,
    actor,
    runId: childRunId,
    parentRunId: parentRun.id,
    serverRunnerId: parentRun.serverRunner,
    syncId: parentRun.syncId,
    triggerKind: parentRun.triggerKind,
    mode: parentRun.mode,
    rowLimit: parentRun.rowLimit,
    maxBatches: parentRun.maxBatches,
    batchOrdinal,
    sourceBinding: parentRun.sourceBinding,
    sourceDatasourceId: parentRun.sourceDatasourceId,
    targetBindings: parentRun.targetBindings,
    checkpointBefore,
    scheduleId: parentRun.scheduleId,
    jobId: queued.job?.id ?? null,
    isoAt
  });
  emitScheduleEvent(world, "pipeline.run.child.enqueued", actor, {
    runId: parentRun.id,
    serverRunner: parentRun.serverRunner,
    syncId: parentRun.syncId,
    runKind: "parent",
    triggerKind: parentRun.triggerKind,
    mode: parentRun.mode,
    scheduleId: parentRun.scheduleId,
    batchOrdinal,
    childCount: Number(parentRun.childCount || 0) + 1,
    checkpointBefore,
    at: isoAt(Date.now()),
    stage: "parent",
    status: "running",
    message: `Enqueued child batch ${batchOrdinal} for ${parentRun.syncId}.`
  });
  return { ok: true, runId: childRunId };
}

function processDueSchedules({
  world,
  project,
  appContext,
  serverRunnerId,
  nowMs
}) {
  const scheduleIndex = project(pipelineModuleProjectors.pipelineScheduleIndex);
  const runIndex = project(pipelineModuleProjectors.pipelineRunIndex);
  const schedules = (scheduleIndex.byRunner?.[serverRunnerId] ?? [])
    .filter(row => scheduleDue(row, nowMs))
    .sort((left, right) => String(left.syncId).localeCompare(String(right.syncId)));
  for (const schedule of schedules) {
    const activeParent = activeParentRunFor(runIndex, serverRunnerId, schedule.syncId);
    if (activeParent) {
      emitScheduleEvent(world, "pipeline.schedule.trigger.skipped", serverRunnerId, {
        id: schedule.id,
        serverRunner: serverRunnerId,
        syncId: schedule.syncId,
        skippedAt: isoAt(nowMs),
        lastParentRunId: activeParent.id,
        reason: "active parent run already exists"
      });
      continue;
    }
    const created = createPipelineParentRunForSync({
      world,
      project,
      actor: serverRunnerId,
      appContext,
      serverRunnerId,
      syncId: schedule.syncId,
      triggerKind: "scheduled",
      mode: "execute",
      rowLimit: schedule.rowLimit,
      maxBatches: schedule.maxBatchesPerRun,
      scheduleId: schedule.id,
      failOnInvalid: true
    });
    emitScheduleEvent(world, "pipeline.schedule.triggered", serverRunnerId, {
      id: schedule.id,
      serverRunner: serverRunnerId,
      syncId: schedule.syncId,
      triggeredAt: isoAt(nowMs),
      lastParentRunId: created.runId ?? null
    });
  }
}

function processParentRuns({
  world,
  project,
  appContext,
  serverRunnerId
}) {
  const runIndex = project(pipelineModuleProjectors.pipelineRunIndex);
  const activeParents = (runIndex.byRunnerSyncParents ?? Object.create(null));
  for (const [runnerSyncKey, parentRows] of Object.entries(activeParents)) {
    if (!runnerSyncKey.startsWith(`${serverRunnerId}:`)) continue;
    for (const parentRun of parentRows.filter(row => row.status === "running")) {
      const childRows = childrenForParent(runIndex, parentRun.id);
      if (!childRows.length) {
        enqueueChildBatch({
          world,
          project,
          actor: serverRunnerId,
          appContext,
          parentRun,
          batchOrdinal: 1,
          checkpointBefore: parentRun.checkpointAfter ?? parentRun.checkpointBefore ?? null
        });
        continue;
      }
      const latestChild = childRows[childRows.length - 1];
      if (latestChild.status === "queued" || latestChild.status === "running") continue;
      if (latestChild.status === "failed") {
        completePipelineParentRun({
          world,
          actor: serverRunnerId,
          parentRun,
          completionReason: "failed",
          message: latestChild.lastError || `Child batch ${latestChild.batchOrdinal} failed.`,
          lastError: latestChild.lastError || `Child batch ${latestChild.batchOrdinal} failed.`,
          mayHaveMoreRows: false,
          checkpointAfter: latestChild.checkpointAfter ?? parentRun.checkpointAfter,
          checkpointCommitted: latestChild.checkpointCommitted === true,
          isoAt
        });
        continue;
      }
      if (latestChild.status !== "succeeded") continue;
      if (Number(latestChild.rowsRead || 0) === 0) {
        completePipelineParentRun({
          world,
          actor: serverRunnerId,
          parentRun,
          completionReason: "empty",
          message: `No rows were available for ${parentRun.syncId}.`,
          mayHaveMoreRows: false,
          checkpointAfter: latestChild.checkpointAfter ?? parentRun.checkpointAfter,
          checkpointCommitted: latestChild.checkpointCommitted === true,
          isoAt
        });
        continue;
      }
      if (latestChild.mayHaveMoreRows === true && Number(latestChild.batchOrdinal || 0) < Number(parentRun.maxBatches || 1)) {
        enqueueChildBatch({
          world,
          project,
          actor: serverRunnerId,
          appContext,
          parentRun,
          batchOrdinal: Number(latestChild.batchOrdinal || 0) + 1,
          checkpointBefore: latestChild.checkpointAfter ?? parentRun.checkpointAfter ?? parentRun.checkpointBefore ?? null
        });
        continue;
      }
      if (latestChild.mayHaveMoreRows === true) {
        completePipelineParentRun({
          world,
          actor: serverRunnerId,
          parentRun,
          completionReason: "max_batches",
          message: `Stopped ${parentRun.syncId} after reaching ${parentRun.maxBatches} batches; more rows may remain.`,
          mayHaveMoreRows: true,
          checkpointAfter: latestChild.checkpointAfter ?? parentRun.checkpointAfter,
          checkpointCommitted: latestChild.checkpointCommitted === true,
          isoAt
        });
        continue;
      }
      completePipelineParentRun({
        world,
        actor: serverRunnerId,
        parentRun,
        completionReason: "drained",
        message: `Drained available rows for ${parentRun.syncId}.`,
        mayHaveMoreRows: false,
        checkpointAfter: latestChild.checkpointAfter ?? parentRun.checkpointAfter,
        checkpointCommitted: latestChild.checkpointCommitted === true,
        isoAt
      });
    }
  }
}

export function coordinatePipelineRuntimeStep({
  world,
  project = projector => world.project(projector),
  serverRunnerId,
  appContext,
  nowMs = Date.now()
}) {
  processDueSchedules({
    world,
    project,
    appContext,
    serverRunnerId,
    nowMs
  });
  processParentRuns({
    world,
    project,
    appContext,
    serverRunnerId
  });
}

export function createPipelineCoordinatorRuntime({
  world,
  project = projector => world.project(projector),
  serverRunnerId,
  runtimeConfig = {},
  getAppContext
}) {
  const config = normalizeCoordinatorConfig(runtimeConfig);
  let closed = false;
  const tick = async () => {
    if (closed) return;
    coordinatePipelineRuntimeStep({
      world,
      project,
      serverRunnerId,
      appContext: getAppContext?.()
    });
  };
  const interval = setInterval(() => {
    void tick();
  }, config.pollMs);
  interval.unref?.();
  void tick();
  return {
    config,
    tick,
    close() {
      closed = true;
      clearInterval(interval);
    }
  };
}

export function createOrUpdatePipelineSchedule({
  world,
  actor,
  serverRunnerId,
  syncId,
  enabled,
  intervalMs,
  rowLimit,
  maxBatchesPerRun,
  existing
}) {
  return upsertPipelineSchedule({
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
  });
}
