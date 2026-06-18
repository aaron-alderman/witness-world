import {
  createPipelineExecutionPlanProgramFromDesire,
  planPipelineSync
} from "./planner-runtime.js";

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function collectPipelineRuntimeResiduals(authoredDesireDocs = []) {
  return authoredDesireDocs.flatMap(doc => doc?.runtimeResiduals ?? []);
}

function desireForPipelineRuntime(appProject) {
  return {
    kind: "desire.document",
    nodes: [],
    meta: { sourceKind: "pipeline.catalog" },
    runtimeResiduals: collectPipelineRuntimeResiduals(appProject?.authoredDesireDocs ?? [])
  };
}

export function createPipelineCatalogFromAppProject(appProject) {
  const desire = desireForPipelineRuntime(appProject);
  const program = createPipelineExecutionPlanProgramFromDesire(desire);
  const syncPlans = new Map(
    [...program.syncs.keys()].map(syncId => [syncId, planPipelineSync(program, syncId)])
  );
  return {
    desire,
    program,
    syncPlans
  };
}

function uniqueBindingNamesForPlan(plan) {
  return [...new Set([
    normalizeText(plan?.source?.binding),
    ...(plan?.outputTransforms ?? []).map(transform => normalizeText(transform?.target?.binding))
  ].filter(Boolean))];
}

export function pipelineSyncCatalogRows(appProject) {
  const catalog = createPipelineCatalogFromAppProject(appProject);
  const rows = [...catalog.syncPlans.values()].map(plan => ({
    id: plan.syncId,
    title: plan.syncId,
    sourceBinding: normalizeText(plan?.source?.binding),
    targetBindings: (plan?.outputTransforms ?? []).map(transform => normalizeText(transform?.target?.binding)).filter(Boolean),
    bindingNames: uniqueBindingNamesForPlan(plan),
    triggerText: (plan?.triggers ?? []).join(", "),
    progressField: normalizeText(plan?.progress?.field),
    progressKind: normalizeText(plan?.progress?.kind),
    replayWindowMs: Number.isFinite(plan?.progress?.replayWindowMs) ? plan.progress.replayWindowMs : null,
    consistency: normalizeText(plan?.consistency),
    outputCount: Array.isArray(plan?.outputTransforms) ? plan.outputTransforms.length : 0
  }));
  return { catalog, rows };
}

export function pipelineBindingRowsForSync(plan, bindingIndex, datasourceIndex, serverRunnerId, syncId) {
  const runnerSyncKey = `${serverRunnerId}:${syncId}`;
  const savedBindings = bindingIndex?.byRunnerSync?.[runnerSyncKey] ?? {};
  return uniqueBindingNamesForPlan(plan).map(bindingName => {
    const binding = savedBindings[bindingName] ?? null;
    const datasource = binding?.datasourceId ? datasourceIndex?.byId?.[binding.datasourceId] ?? null : null;
    const isSource = normalizeText(plan?.source?.binding) === bindingName;
    const sourceTargetTables = (plan?.outputTransforms ?? []).filter(transform => normalizeText(transform?.target?.binding) === bindingName);
    const role = isSource ? "source" : "target";
    return {
      id: binding?.id ?? `${syncId}:${bindingName}`,
      title: bindingName,
      bindingName,
      syncId,
      role,
      datasourceId: binding?.datasourceId ?? "",
      datasourceTitle: datasource?.title ?? datasource?.datasourceName ?? "",
      providerHint: isSource
        ? normalizeText(plan?.source?.provider)
        : [...new Set(sourceTargetTables.map(transform => normalizeText(transform?.target?.provider)).filter(Boolean))].join(", "),
      targetText: isSource
        ? `${plan?.source?.schema ? `${plan.source.schema}.` : ""}${plan?.source?.table ?? ""}`
        : sourceTargetTables.map(transform => `${transform?.target?.schema ? `${transform.target.schema}.` : ""}${transform?.target?.table ?? ""}`).join(", ")
    };
  });
}
