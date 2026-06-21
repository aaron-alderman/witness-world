import fs from "node:fs/promises";
import path from "node:path";
import { worldGraphProjection, astNodesProjection } from "../plugins/inspect/world-graph.js";
import { processRunProjection, processViewProjection } from "../plugins/inspect/process-view.js";
import { inspectWorldSystemReadModel } from "../plugins/inspect/world-system.js";

const DEFAULT_FRONTEND_TRACE_PROCESSES = new Set([
  "frontend.process.start",
  "frontend.process.done",
  "frontend.process.failed",
  "frontend.step.start",
  "frontend.step.done",
  "frontend.step.skipped",
  "frontend.step.failed"
]);

function visibleWitnessesForProjection(witnesses, { requestActor = null, appContext = null } = {}) {
  const projector = typeof appContext?.visibleWitnesses === "function"
    ? appContext.visibleWitnesses
    : () => witnesses;
  return projector(requestActor);
}

function processSelectionFromQuery(query = {}) {
  return {
    program: typeof query?.program === "string" ? query.program : null,
    event: typeof query?.event === "string" ? query.event : null,
    runId: typeof query?.runId === "string" ? query.runId : null,
    nodeId: typeof query?.node === "string" ? query.node : null,
    replay: typeof query?.replay === "string" ? query.replay : null
  };
}

function processViewInputsForProjection(witnesses, { requestActor = null, appContext = null, observations = [] } = {}) {
  const visibleWitnesses = visibleWitnessesForProjection(witnesses, { requestActor, appContext });
  const visibleIds = new Set(visibleWitnesses.map(witness => witness.id));
  const filteredObservations = observations
    .filter(observation =>
      observation.process === "backend.request.finish"
      || observation.process === "backend.process.start"
      || observation.process === "backend.process.done"
      || observation.process === "backend.process.failed"
      || observation.process === "backend.step.start"
      || observation.process === "backend.step.done"
      || observation.process === "backend.step.skipped"
      || observation.process === "backend.step.failed"
    )
    .map(observation => ({
      ...observation,
      body: {
        ...(observation.body ?? {}),
        emittedWitnessIds: (observation.body?.emittedWitnessIds ?? []).filter(id => visibleIds.has(id)),
        failureWitnessIds: (observation.body?.failureWitnessIds ?? []).filter(id => visibleIds.has(id))
      }
    }));
  return { witnesses: visibleWitnesses, observations: filteredObservations };
}

export async function recordInspectProcessEventRequest(
  {
    world,
    frontendHost,
    body,
    requestActor = null
  },
  {
    frontendTraceProcesses = DEFAULT_FRONTEND_TRACE_PROCESSES
  } = {}
) {
  const process = typeof body?.process === "string" ? body.process : "";
  if (!frontendTraceProcesses.has(process)) {
    return {
      ok: false,
      status: 400,
      error: "unknown process trace",
      payload: { error: "unknown process trace", process }
    };
  }
  const witness = world.emit({
    process,
    actor: requestActor || frontendHost,
    claims: [],
    body: {
      runId: typeof body.runId === "string" ? body.runId : "",
      program: typeof body.program === "string" ? body.program : "",
      event: typeof body.event === "string" ? body.event : "",
      nodeId: typeof body.nodeId === "string" ? body.nodeId : "",
      op: typeof body.op === "string" ? body.op : "",
      status: typeof body.status === "string" ? body.status : "",
      frontier: Array.isArray(body.frontier) ? body.frontier : [],
      repeat: body.repeat ?? null,
      repeatCount: Number.isFinite(body.repeatCount) ? body.repeatCount : null,
      message: typeof body.message === "string" ? body.message : "",
      eventData: body.eventData ?? null,
      timestamp: Number.isFinite(body.timestamp) ? body.timestamp : Date.now()
    }
  });
  return {
    ok: true,
    status: 200,
    payload: { ok: true, id: witness.id },
    error: null
  };
}

export function inspectWitnessesReadModel(witnesses, { requestActor = null, appContext = null, query = {} } = {}) {
  const rawOffset = typeof query?.offset === "string" ? query.offset : null;
  const visible = visibleWitnessesForProjection(witnesses, { requestActor, appContext }).map(witness => ({
    ...witness,
    bodyJson: JSON.stringify(witness.body ?? {})
  }));
  if (rawOffset === null) return { witnesses: visible, offset: 0, total: visible.length };
  const offset = Math.max(0, Math.min(visible.length, Number(rawOffset) || 0));
  return { witnesses: visible.slice(offset), offset, total: visible.length };
}

export function inspectWorldGraphReadModel(witnesses, { requestActor = null, appContext = null } = {}) {
  const visible = visibleWitnessesForProjection(witnesses, { requestActor, appContext });
  const graph = worldGraphProjection(visible);
  const ast = astNodesProjection(visible);
  return {
    graph,
    astNodes: {
      byFile: Object.fromEntries([...ast.byFile.entries()].map(([file, nodes]) => [file, nodes])),
      byTarget: Object.fromEntries([...ast.byTarget.entries()].map(([target, nodes]) => [target, nodes]))
    }
  };
}

export function inspectWorldSystemReadModelForRuntime(
  witnesses,
  { requestActor = null, appContext = null, observations = [] } = {}
) {
  return inspectWorldSystemReadModel(witnesses, { requestActor, appContext, observations });
}

export function inspectProcessViewReadModel(
  witnesses,
  { requestActor = null, appContext = null, query = {}, observations = [] } = {}
) {
  return processViewProjection(
    processViewInputsForProjection(witnesses, { requestActor, appContext, observations }),
    processSelectionFromQuery(query)
  );
}

export function inspectProcessRunReadModel(
  witnesses,
  { requestActor = null, appContext = null, runId = "", query = {}, observations = [] } = {}
) {
  const run = processRunProjection(
    processViewInputsForProjection(witnesses, { requestActor, appContext, observations }),
    {
      runId: typeof runId === "string" ? runId : "",
      replay: typeof query?.replay === "string" ? query.replay : null
    }
  );
  if (!run) {
    const resolvedRunId = typeof runId === "string" ? runId : "";
    return {
      ok: false,
      status: 404,
      error: "process run not found",
      body: { error: "process run not found", runId: resolvedRunId }
    };
  }
  return {
    ok: true,
    status: 200,
    error: null,
    body: run
  };
}

export async function inspectSourceReadModel(world, {
  backendHost,
  requestUrl
}) {
  const requested = requestUrl.searchParams.get("file") || "";
  const allowed = new Set(world.allWitnesses()
    .filter(witness => isSourceAnnotationWitness(witness) && typeof witness.body?.file === "string")
    .map(witness => path.resolve(witness.body.file)));
  const resolvedFile = path.resolve(requested);
  if (!allowed.has(resolvedFile)) {
    world.observe({
      process: "backend.readSource.failed",
      actor: backendHost,
      claims: [],
      body: { file: requested, reason: "source file not in witnessed imports" }
    });
    return {
      ok: false,
      status: 404,
      body: { error: "source file not available", file: requested }
    };
  }
  const text = await fs.readFile(resolvedFile, "utf8");
  const ast = astNodesProjection(world.allWitnesses());
  const annotations = (ast.byFile.get(resolvedFile) ?? []).slice().sort((a, b) =>
    Number(a.startLine ?? a.line ?? 0) - Number(b.startLine ?? b.line ?? 0)
    || Number(a.startColumn ?? 1) - Number(b.startColumn ?? 1)
    || String(a.target ?? "").localeCompare(String(b.target ?? ""))
  );
  world.observe({
    process: "backend.readSource",
    actor: backendHost,
    claims: [],
    body: { file: resolvedFile, bytes: text.length }
  });
  return {
    ok: true,
    status: 200,
    body: {
      file: resolvedFile,
      text,
      annotations,
      targets: [...new Set(annotations.map(node => node.target).filter(Boolean))]
    }
  };
}

function isSourceAnnotationWitness(witness) {
  return typeof witness?.process === "string" && witness.process.endsWith(".source.annotate");
}
