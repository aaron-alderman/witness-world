import { frontendProgram } from "./widgets.js";
import { pathLabel, pathBreadcrumb } from "./process-graph.js";

const ASYNC_OPS = new Set(["fetchJson", "postJson", "patchJson", "deleteJson", "initSession", "setSession", "logout", "refreshProjection"]);
const TERMINAL_STEP_PROCESSES = new Set(["frontend.step.done", "frontend.step.skipped", "frontend.step.failed"]);
const PROCESS_EVENT_PROCESSES = new Set([
  "frontend.process.start",
  "frontend.process.done",
  "frontend.process.failed",
  "frontend.step.start",
  "frontend.step.done",
  "frontend.step.skipped",
  "frontend.step.failed"
]);

export function processCatalogProjection(witnesses) {
  const catalog = [];
  const programs = frontendPrograms(witnesses);
  for (const program of programs) {
    const byEvent = new Map();
    for (const node of program.graph ?? []) {
      if (!node.event) continue;
      if (!byEvent.has(node.event)) byEvent.set(node.event, []);
      byEvent.get(node.event).push(node);
    }
    for (const [event, nodes] of byEvent.entries()) {
      const graph = buildAuthoredGraph(program.id, event, nodes);
      catalog.push({
        id: `${program.id}:${event}`,
        program: program.id,
        event,
        label: `${program.id} · ${event}`,
        nodeCount: graph.nodes.length,
        branchCount: graph.nodes.filter(node => node.semantics.branch).length,
        loopCount: graph.nodes.filter(node => node.semantics.loopKind).length,
        asyncCount: graph.nodes.filter(node => node.semantics.async).length,
        parallelLayerCount: graph.layers.filter(layer => layer.nodeIds.length > 1).length
      });
    }
  }
  return catalog.sort((a, b) => a.label.localeCompare(b.label));
}

export function processViewProjection({ witnesses, observations = [] }, {
  program = null,
  event = null,
  runId = null,
  nodeId = null,
  replay = null
} = {}) {
  const catalog = processCatalogProjection(witnesses);
  const runs = processRunIndex(witnesses);
  const selectedFromRun = runId && runs.has(runId) ? runs.get(runId) : null;
  const selectedProcess = resolveSelectedProcess(catalog, {
    program: program ?? selectedFromRun?.program ?? null,
    event: event ?? selectedFromRun?.event ?? null
  });
  const graph = selectedProcess
    ? buildGraphForSelection(witnesses, selectedProcess.program, selectedProcess.event)
    : emptyGraph();
  const processRuns = [...runs.values()]
    .filter(run => !selectedProcess || (run.program === selectedProcess.program && run.event === selectedProcess.event))
    .sort((a, b) => (b.startedSeq ?? 0) - (a.startedSeq ?? 0))
    .map(run => summarizeRun(run));

  const selectedRunId = runId ?? processRuns[0]?.runId ?? null;
  const runDetail = selectedRunId ? processRunProjection({ witnesses, observations }, { runId: selectedRunId, replay }) : null;
  const selectedNodeId = nodeId
    ?? runDetail?.replay?.currentNodeId
    ?? runDetail?.run?.lastNodeId
    ?? graph.nodes[0]?.id
    ?? null;

  return {
    catalog,
    selection: {
      program: selectedProcess?.program ?? null,
      event: selectedProcess?.event ?? null,
      runId: selectedRunId,
      nodeId: selectedNodeId,
      replayCursor: runDetail?.replay?.cursor ?? null
    },
    graph: graphWithSelection(graph, selectedNodeId),
    runs: processRuns,
    run: runDetail?.run ?? null,
    replay: runDetail?.replay ?? null
  };
}

export function processRunProjection({ witnesses, observations = [] }, { runId, replay = null } = {}) {
  const runs = processRunIndex(witnesses);
  const run = runId ? runs.get(runId) ?? null : null;
  if (!run) return null;
  const timeline = decorateRunTimeline(run.timeline);
  const requests = correlateRequests(runId, observations, witnesses);
  const nodeHistory = buildNodeHistory(timeline, requests);
  const replayModel = buildReplayModel(timeline, requests, replay);
  return {
    run: {
      runId: run.runId,
      program: run.program,
      event: run.event,
      actor: run.actor,
      status: run.status,
      startedAt: run.startedAt ?? null,
      endedAt: run.endedAt ?? null,
      startedSeq: run.startedSeq ?? null,
      endedSeq: run.endedSeq ?? null,
      eventData: run.eventData ?? {},
      stepCount: uniqueNodeCount(timeline),
      failureCount: replayModel.failureCount,
      lastNodeId: timeline.at(-1)?.nodeId ?? null,
      timeline,
      nodeHistory,
      requests
    },
    replay: replayModel
  };
}

export function renderProcessPage(model, { currentPath = "/process" } = {}) {
  const selection = model.selection ?? {};
  const replay = model.replay ?? null;
  const selectedNode = model.graph?.nodes?.find(node => node.id === selection.nodeId) ?? null;
  const selectedNodeHistory = selectedNode ? (model.run?.nodeHistory?.[selectedNode.id] ?? []) : [];
  const selectedNodeState = selectedNode ? (replay?.nodeStates?.[selectedNode.id] ?? null) : null;
  const processLinks = model.catalog.map(item => {
    const href = processHref(currentPath, { program: item.program, event: item.event });
    const selected = item.program === selection.program && item.event === selection.event;
    return `<a class="process-list-item${selected ? " selected" : ""}" data-process-catalog-item href="${escapeAttr(href)}"><strong>${escapeHtml(item.label)}</strong><span>${item.nodeCount} nodes · ${item.asyncCount} async</span></a>`;
  }).join("");
  const runLinks = model.runs.map(item => {
    const href = processHref(currentPath, { program: selection.program, event: selection.event, runId: item.runId });
    const selected = item.runId === selection.runId;
    return `<a class="process-list-item${selected ? " selected" : ""}" data-process-run-item href="${escapeAttr(href)}"><strong>${escapeHtml(item.status)}</strong><span>${escapeHtml(item.runId)} · ${escapeHtml(item.actor || "frontendHost")}</span></a>`;
  }).join("");
  const layers = (model.graph?.layers ?? []).map(layer => {
    const nodes = layer.nodeIds.map(nodeId => {
      const node = model.graph.nodes.find(candidate => candidate.id === nodeId);
      if (!node) return "";
      const href = processHref(currentPath, {
        program: selection.program,
        event: selection.event,
        runId: selection.runId,
        nodeId: node.id,
        replay: replay?.cursor ?? null
      });
      const status = replay?.nodeStates?.[node.id]?.status ?? "pending";
      const badges = [
        node.semantics.branch ? `<span class="process-badge">branch</span>` : "",
        node.semantics.loopKind ? `<span class="process-badge">${escapeHtml(node.semantics.loopKind)}</span>` : "",
        node.semantics.parallel ? `<span class="process-badge">parallel</span>` : "",
        node.semantics.async ? `<span class="process-badge">async</span>` : "",
        node.semantics.fanIn ? `<span class="process-badge">fan-in</span>` : ""
      ].join("");
      return `<a class="process-node status-${escapeAttr(status)}${node.id === selection.nodeId ? " selected" : ""}" data-process-node data-process-status="${escapeAttr(status)}" data-process-branch="${node.semantics.branch}" data-process-loop="${escapeAttr(node.semantics.loopKind || "")}" data-process-parallel="${node.semantics.parallel}" data-process-async="${node.semantics.async}" href="${escapeAttr(href)}"><div class="process-node-title">${escapeHtml(node.label)}</div><div class="process-node-op">${escapeHtml(node.op)}</div><div class="process-node-meta">${escapeHtml(node.breadcrumb || "")}</div><div class="process-badges">${badges}</div>${node.whenLabel ? `<div class="process-node-rule">when ${escapeHtml(node.whenLabel)}</div>` : ""}${node.repeatLabel ? `<div class="process-node-rule">${escapeHtml(node.repeatLabel)}</div>` : ""}${node.after.length ? `<div class="process-node-rule">after ${escapeHtml(node.after.join(", "))}</div>` : ""}</a>`;
    }).join("");
    return `<section class="process-layer${layer.nodeIds.length > 1 ? " parallel" : ""}" data-process-layer data-process-layer-size="${layer.nodeIds.length}"><header>Layer ${layer.index}</header><div class="process-layer-nodes">${nodes}</div></section>`;
  }).join("");

  const replayCursor = replay?.cursor ?? 0;
  const replayMax = replay?.max ?? 0;
  const replayPrev = processHref(currentPath, { program: selection.program, event: selection.event, runId: selection.runId, nodeId: selection.nodeId, replay: Math.max(0, replayCursor - 1) });
  const replayNext = processHref(currentPath, { program: selection.program, event: selection.event, runId: selection.runId, nodeId: selection.nodeId, replay: Math.min(replayMax, replayCursor + 1) });
  const replayFailure = replay?.firstFailureCursor != null
    ? processHref(currentPath, { program: selection.program, event: selection.event, runId: selection.runId, nodeId: selection.nodeId, replay: replay.firstFailureCursor })
    : null;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Process View</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; color: #1f2937; background: #f7f7f5; }
    a { color: inherit; text-decoration: none; }
    .process-header { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #ddd; background: #fff; }
    .process-header a { color: #375a7f; text-decoration: underline; }
    .process-shell { display: grid; grid-template-columns: 280px minmax(0, 1fr) 340px; min-height: calc(100vh - 58px); }
    .process-pane { border-right: 1px solid #ddd; background: #fff; overflow: auto; }
    .process-pane:last-child { border-right: 0; border-left: 1px solid #ddd; }
    .process-pane h2 { margin: 0; padding: 12px 14px 8px; font-size: 1rem; }
    .process-pane h3 { margin: 0; padding: 8px 14px; font-size: .95rem; color: #555; }
    .process-list { display: grid; gap: 6px; padding: 0 12px 12px; }
    .process-list-item { display: grid; gap: 3px; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fafafa; font-size: 13px; }
    .process-list-item.selected { border-color: #375a7f; box-shadow: 0 0 0 2px rgba(55,90,127,.12); background: #f4f8fc; }
    .process-list-item span { color: #666; font-size: 12px; }
    .process-main { overflow: auto; padding: 16px; }
    .process-graph { display: grid; gap: 12px; }
    .process-graph-summary { display: flex; gap: 10px; flex-wrap: wrap; color: #555; font-size: 13px; }
    .process-layer { border: 1px solid #ddd; border-radius: 10px; background: #fff; padding: 10px; }
    .process-layer.parallel { border-color: #8aa3bf; background: #f7fbff; }
    .process-layer header { font-size: 12px; font-weight: 700; color: #555; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
    .process-layer-nodes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .process-node { display: grid; gap: 6px; border: 1px solid #ddd; border-radius: 10px; padding: 10px; background: #fff; }
    .process-node.selected { border-color: #375a7f; box-shadow: 0 0 0 2px rgba(55,90,127,.12); }
    .process-node.status-done { border-left: 6px solid #3f7d3a; }
    .process-node.status-running { border-left: 6px solid #9a7c22; }
    .process-node.status-skipped { border-left: 6px solid #7b7b7b; }
    .process-node.status-failed { border-left: 6px solid #b53a30; background: #fff5f5; }
    .process-node.status-pending { border-left: 6px solid #d2d2d2; }
    .process-node-title { font-weight: 700; }
    .process-node-op { color: #375a7f; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .process-node-meta, .process-node-rule { color: #666; font-size: 12px; }
    .process-badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .process-badge { padding: 2px 6px; border-radius: 999px; background: #eef2f7; font-size: 11px; }
    .process-inspector { padding: 12px 14px 20px; display: grid; gap: 12px; }
    .process-card { border: 1px solid #ddd; border-radius: 10px; background: #fafafa; padding: 10px; display: grid; gap: 8px; }
    .process-card pre { margin: 0; white-space: pre-wrap; overflow: auto; font-size: 12px; }
    .process-card code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .process-replay-controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .process-replay-controls a { color: #375a7f; text-decoration: underline; font-size: 13px; }
    .process-request, .process-timeline-item { border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; padding: 8px; display: grid; gap: 4px; font-size: 12px; }
    .process-request.failed, .process-timeline-item.failed { border-color: #e3b0ac; background: #fff5f5; }
    .process-empty { color: #666; font-size: 13px; padding: 0 14px 14px; }
  </style>
</head>
<body>
  <header class="process-header">
    <strong>Process View</strong>
    <a href="/">Back to Todo</a>
    <a href="/world">World Graph</a>
  </header>
  <div class="process-shell">
    <aside class="process-pane">
      <h2>Processes</h2>
      <div class="process-list">${processLinks || `<div class="process-empty">No authored frontend processes.</div>`}</div>
      <h3>Recent Runs</h3>
      <div class="process-list">${runLinks || `<div class="process-empty">No recorded runs yet.</div>`}</div>
    </aside>
    <main class="process-main">
      <section class="process-graph" data-process-view>
        <div class="process-graph-summary">
          <span><strong>Program:</strong> ${escapeHtml(selection.program || "none")}</span>
          <span><strong>Event:</strong> ${escapeHtml(selection.event || "none")}</span>
          <span><strong>Nodes:</strong> ${model.graph?.nodes?.length ?? 0}</span>
          <span><strong>Runs:</strong> ${model.runs?.length ?? 0}</span>
        </div>
        ${layers || `<div class="process-empty">Select an authored frontend process.</div>`}
      </section>
    </main>
    <aside class="process-pane">
      <div class="process-inspector">
        <section class="process-card">
          <strong>Run</strong>
          ${model.run ? `<div><code>${escapeHtml(model.run.runId)}</code></div><div>${escapeHtml(model.run.status)}</div><div>${escapeHtml(model.run.actor || "frontendHost")}</div>` : `<div class="process-empty">No run selected.</div>`}
        </section>
        ${model.run ? `<section class="process-card" data-process-replay>
          <strong>Replay</strong>
          <div>Cursor ${replayCursor} / ${replayMax}</div>
          <div class="process-replay-controls">
            <a data-process-replay-prev href="${escapeAttr(replayPrev)}">Step back</a>
            <a data-process-replay-next href="${escapeAttr(replayNext)}">Step forward</a>
            ${replayFailure ? `<a data-process-replay-failure href="${escapeAttr(replayFailure)}">Jump to failure</a>` : ""}
          </div>
          <input data-process-replay-range type="range" min="0" max="${escapeAttr(replayMax)}" value="${escapeAttr(replayCursor)}" />
        </section>` : ""}
        <section class="process-card">
          <strong>Selected Node</strong>
          ${selectedNode ? `<div>${escapeHtml(selectedNode.label)}</div><div><code>${escapeHtml(selectedNode.op)}</code></div><div>${escapeHtml(selectedNode.breadcrumb || "")}</div>${selectedNodeState ? `<div>Status: ${escapeHtml(selectedNodeState.status)}</div>` : ""}` : `<div class="process-empty">Select a node.</div>`}
        </section>
        <section class="process-card">
          <strong>Timeline</strong>
          ${selectedNodeHistory.length ? selectedNodeHistory.map(item => `<div class="process-timeline-item${item.status === "failed" ? " failed" : ""}"><div>${escapeHtml(item.process)}</div><div>${escapeHtml(item.status)}</div>${item.message ? `<div>${escapeHtml(item.message)}</div>` : ""}</div>`).join("") : `<div class="process-empty">No node events yet.</div>`}
        </section>
        <section class="process-card">
          <strong>Correlated Requests</strong>
          ${selectedNodeHistory.filter(item => item.type === "request").length ? selectedNodeHistory.filter(item => item.type === "request").map(item => `<div class="process-request${item.statusCode >= 400 ? " failed" : ""}"><div>${escapeHtml(item.method)} ${escapeHtml(item.url)}</div><div>Status ${item.statusCode}</div>${(item.failureWitnesses || []).map(failure => `<div><code>${escapeHtml(failure.process)}</code> ${escapeHtml(failure.body?.reason || failure.body?.message || "")}</div>`).join("")}</div>`).join("") : `<div class="process-empty">No correlated requests for this node.</div>`}
        </section>
      </div>
    </aside>
  </div>
  <script>
    document.querySelector('[data-process-replay-range]')?.addEventListener('change', event => {
      const url = new URL(window.location.href);
      url.searchParams.set('replay', event.target.value);
      window.location.assign(url.toString());
    });
  </script>
</body>
</html>`;
}

export function isFrontendProcessEventProcess(value) {
  return PROCESS_EVENT_PROCESSES.has(String(value || ""));
}

function frontendPrograms(witnesses) {
  const programs = [];
  const seen = new Set();
  for (const witness of witnesses) {
    if (witness.process !== "defineFrontendProgram" || !witness.body?.id) continue;
    if (seen.has(witness.body.id)) continue;
    seen.add(witness.body.id);
    const program = frontendProgram(witnesses, witness.body.id);
    if (program) programs.push(program);
  }
  return programs.sort((a, b) => a.id.localeCompare(b.id));
}

function resolveSelectedProcess(catalog, { program, event }) {
  if (program && event) return catalog.find(item => item.program === program && item.event === event) ?? null;
  return catalog[0] ?? null;
}

function buildGraphForSelection(witnesses, programId, event) {
  const program = frontendProgram(witnesses, programId);
  if (!program?.graph) return emptyGraph();
  const nodes = program.graph.filter(node => node.event === event);
  return buildAuthoredGraph(programId, event, nodes);
}

function buildAuthoredGraph(programId, event, nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const layerById = new Map();
  const visiting = new Set();
  const layerOf = nodeId => {
    if (layerById.has(nodeId)) return layerById.get(nodeId);
    if (visiting.has(nodeId)) return 0;
    visiting.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) return 0;
    const deps = (node.after ?? []).map(dep => layerOf(dep));
    const layer = deps.length ? Math.max(...deps) + 1 : 0;
    visiting.delete(nodeId);
    layerById.set(nodeId, layer);
    return layer;
  };
  nodes.forEach(node => layerOf(node.id));

  const layers = new Map();
  for (const node of nodes) {
    const layer = layerById.get(node.id) ?? 0;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer).push(node.id);
  }

  const graphNodes = nodes.map(node => {
    const layer = layerById.get(node.id) ?? 0;
    const layerSize = layers.get(layer)?.length ?? 1;
    const loopKind = node.repeat?.while ? "while" : node.repeat?.forEach ? "forEach" : null;
    return {
      id: node.id,
      program: programId,
      event,
      op: node.op,
      label: pathLabel(node.path ?? []),
      breadcrumb: pathBreadcrumb(node.path ?? []),
      params: node.params ?? {},
      order: node.order ?? 0,
      after: [...(node.after ?? [])],
      when: node.when ?? null,
      whenLabel: predicateLabel(node.when),
      repeat: node.repeat ?? null,
      repeatLabel: repeatLabel(node.repeat),
      semantics: {
        branch: Boolean(node.when),
        loopKind,
        async: ASYNC_OPS.has(node.op),
        parallel: layerSize > 1,
        fanIn: (node.after ?? []).length > 1
      },
      layer
    };
  }).sort((a, b) => (a.layer - b.layer) || (a.order - b.order) || a.id.localeCompare(b.id));

  const graphLayers = [...layers.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, nodeIds]) => ({ index, nodeIds: [...nodeIds].sort((a, b) => {
      const left = byId.get(a);
      const right = byId.get(b);
      return ((left?.order ?? 0) - (right?.order ?? 0)) || a.localeCompare(b);
    }) }));

  const edges = graphNodes.flatMap(node => node.after.map(dep => ({ from: dep, to: node.id })));
  return { program: programId, event, nodes: graphNodes, edges, layers: graphLayers };
}

function emptyGraph() {
  return { program: null, event: null, nodes: [], edges: [], layers: [] };
}

function graphWithSelection(graph, nodeId) {
  return {
    ...graph,
    nodes: graph.nodes.map(node => ({ ...node, selected: node.id === nodeId }))
  };
}

function processRunIndex(witnesses) {
  const runs = new Map();
  for (let index = 0; index < witnesses.length; index += 1) {
    const witness = witnesses[index];
    const runId = witness.body?.runId;
    if (!runId || !String(witness.process || "").startsWith("frontend.")) continue;
    const entry = runs.get(runId) ?? {
      runId,
      program: witness.body.program ?? null,
      event: witness.body.event ?? null,
      actor: witness.actor,
      status: "running",
      startedAt: null,
      endedAt: null,
      startedSeq: null,
      endedSeq: null,
      eventData: {},
      timeline: []
    };
    if (witness.process === "frontend.process.start") {
      entry.program = witness.body.program ?? entry.program;
      entry.event = witness.body.event ?? entry.event;
      entry.actor = witness.actor ?? entry.actor;
      entry.status = "running";
      entry.startedAt = witness.body.timestamp ?? index;
      entry.startedSeq = index;
      entry.eventData = witness.body.eventData ?? {};
    } else if (witness.process === "frontend.process.done") {
      entry.status = "done";
      entry.endedAt = witness.body.timestamp ?? index;
      entry.endedSeq = index;
    } else if (witness.process === "frontend.process.failed") {
      entry.status = "failed";
      entry.endedAt = witness.body.timestamp ?? index;
      entry.endedSeq = index;
    } else if (witness.process.startsWith("frontend.step.")) {
      entry.timeline.push({
        witnessId: witness.id,
        process: witness.process,
        index,
        runId,
        program: witness.body.program ?? entry.program,
        event: witness.body.event ?? entry.event,
        nodeId: witness.body.nodeId ?? "",
        op: witness.body.op ?? "",
        status: stepStatusFromProcess(witness.process),
        message: witness.body.message ?? null,
        timestamp: witness.body.timestamp ?? index,
        repeatCount: witness.body.repeatCount ?? null,
        repeatMode: witness.body.repeatMode ?? null
      });
    }
    runs.set(runId, entry);
  }
  return runs;
}

function summarizeRun(run) {
  const timeline = decorateRunTimeline(run.timeline);
  const failureCount = timeline.filter(item => item.status === "failed").length;
  return {
    runId: run.runId,
    program: run.program,
    event: run.event,
    actor: run.actor,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    stepCount: uniqueNodeCount(timeline),
    failureCount,
    lastNodeId: timeline.at(-1)?.nodeId ?? null
  };
}

function correlateRequests(runId, observations, witnesses) {
  const byId = new Map(witnesses.map(witness => [witness.id, witness]));
  return observations
    .filter(observation => observation.process === "backend.request.finish" && observation.body?.runId === runId)
    .map(observation => {
      const failureWitnesses = (observation.body.failureWitnessIds ?? [])
        .map(id => byId.get(id))
        .filter(Boolean);
      const emittedWitnesses = (observation.body.emittedWitnessIds ?? [])
        .map(id => byId.get(id))
        .filter(Boolean);
      return {
        requestId: observation.body.requestId,
        stepId: observation.body.stepId ?? null,
        method: observation.body.method ?? "GET",
        url: observation.body.url ?? "",
        statusCode: Number(observation.body.statusCode ?? 0),
        durationMs: observation.body.durationMs ?? 0,
        route: observation.body.route ?? null,
        handler: observation.body.handler ?? null,
        failureWitnesses,
        emittedWitnesses
      };
    })
    .sort((a, b) => String(a.requestId).localeCompare(String(b.requestId)));
}

function decorateRunTimeline(timeline) {
  return [...timeline].sort((a, b) => a.index - b.index).map((item, index) => ({ ...item, cursor: index + 1 }));
}

function buildNodeHistory(timeline, requests) {
  const history = Object.create(null);
  for (const item of timeline) {
    if (!item.nodeId) continue;
    if (!history[item.nodeId]) history[item.nodeId] = [];
    history[item.nodeId].push({ ...item, type: "timeline" });
  }
  for (const request of requests) {
    if (!request.stepId) continue;
    if (!history[request.stepId]) history[request.stepId] = [];
    history[request.stepId].push({ ...request, type: "request", status: request.statusCode >= 400 ? "failed" : "done" });
  }
  return history;
}

function buildReplayModel(timeline, requests, replay) {
  const max = timeline.length;
  const cursor = clamp(Number(replay ?? max), 0, max);
  const current = timeline[cursor - 1] ?? null;
  const nodeStates = Object.create(null);
  for (const item of timeline.slice(0, cursor)) {
    if (!item.nodeId) continue;
    nodeStates[item.nodeId] = {
      status: item.status === "start" ? "running" : item.status,
      message: item.message ?? null,
      witnessId: item.witnessId
    };
  }
  for (const request of requests) {
    if (!request.stepId) continue;
    const state = nodeStates[request.stepId] ?? { status: "pending", message: null, witnessId: null };
    if (request.statusCode >= 400 && state.status !== "failed") {
      nodeStates[request.stepId] = {
        ...state,
        status: "failed",
        message: request.failureWitnesses[0]?.body?.reason ?? state.message
      };
    }
  }
  const firstFailureCursor = timeline.find(item => item.status === "failed")?.cursor ?? null;
  return {
    cursor,
    max,
    currentEvent: current,
    currentNodeId: current?.nodeId ?? null,
    nodeStates,
    firstFailureCursor,
    failureCount: timeline.filter(item => item.status === "failed").length
  };
}

function uniqueNodeCount(timeline) {
  return new Set(timeline.map(item => item.nodeId).filter(Boolean)).size;
}

function predicateLabel(predicate) {
  if (!predicate) return "";
  if ("equals" in predicate) return `${predicate.path} == ${JSON.stringify(predicate.equals)}`;
  if ("notEquals" in predicate) return `${predicate.path} != ${JSON.stringify(predicate.notEquals)}`;
  if (predicate.truthy) return `${predicate.path} truthy`;
  if (predicate.falsy) return `${predicate.path} falsy`;
  return JSON.stringify(predicate);
}

function repeatLabel(repeat) {
  if (!repeat) return "";
  if (repeat.while) return `while ${predicateLabel(repeat.while)} (max ${repeat.max ?? 100})`;
  if (repeat.forEach) return `forEach ${repeat.forEach.from}`;
  return JSON.stringify(repeat);
}

function stepStatusFromProcess(process) {
  if (process === "frontend.step.start") return "start";
  if (process === "frontend.step.done") return "done";
  if (process === "frontend.step.skipped") return "skipped";
  if (process === "frontend.step.failed") return "failed";
  return "done";
}

function processHref(basePath, { program = null, event = null, runId = null, nodeId = null, replay = null } = {}) {
  const url = new URL(basePath, "http://127.0.0.1");
  if (program) url.searchParams.set("program", program);
  if (event) url.searchParams.set("event", event);
  if (runId) url.searchParams.set("runId", runId);
  if (nodeId) url.searchParams.set("node", nodeId);
  if (replay != null) url.searchParams.set("replay", String(replay));
  return `${url.pathname}${url.search}`;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
