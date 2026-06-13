import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frontendProgram } from "../../src/widgets.js";
import { backendProgramVersionDefinition, backendProgramVersionsProjection } from "../../src/backend-programs.js";
import { pathLabel, pathBreadcrumb } from "../../src/process-graph.js";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { renderWidgetPage } from "./widget-page.js";

const ASYNC_OPS = new Set(["fetchJson", "postJson", "patchJson", "deleteJson", "initSession", "setSession", "logout", "refreshProjection", "request.readJson", "handler.invoke", "run"]);
const TERMINAL_STEP_PROCESSES = new Set(["frontend.step.done", "frontend.step.skipped", "frontend.step.failed", "backend.step.done", "backend.step.skipped", "backend.step.failed"]);
const PROCESS_EVENT_PROCESSES = new Set([
  "frontend.process.start",
  "frontend.process.done",
  "frontend.process.failed",
  "frontend.step.start",
  "frontend.step.done",
  "frontend.step.skipped",
  "frontend.step.failed",
  "backend.process.start",
  "backend.process.done",
  "backend.process.failed",
  "backend.step.start",
  "backend.step.done",
  "backend.step.skipped",
  "backend.step.failed"
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const processViewWtoml = fs.readFileSync(path.join(__dirname, "process-view-page.wtoml"), "utf8");

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
        label: `${program.id} - ${event}`,
        nodeCount: graph.nodes.length,
        branchCount: graph.nodes.filter(node => node.semantics.branch).length,
        loopCount: graph.nodes.filter(node => node.semantics.loopKind).length,
        asyncCount: graph.nodes.filter(node => node.semantics.async).length,
        parallelLayerCount: graph.layers.filter(layer => layer.nodeIds.length > 1).length
      });
    }
  }
  for (const versionRow of backendProgramVersionsProjection(witnesses)) {
    const program = backendProgramVersionDefinition(witnesses, versionRow.version);
    if (!program) continue;
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
        label: `${program.soul} - ${event} - ${program.id}`,
        kind: "backend",
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
  const runs = processRunIndex(witnesses, observations);
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
  const runs = processRunIndex(witnesses, observations);
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
  const world = createWorld();
  applyWitnessToml(world, processViewWtoml);
  const html = renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "process_page_root",
    frontendProgram: "process_page_program",
    appConfig: {
      initialStateScriptId: "process-page-initial-state",
      initialStateInto: "processPage"
    }
  });
  const initialState = `<script type="application/json" id="process-page-initial-state">${serializeJsonScript(buildProcessPageState(model, currentPath))}</script>`;
  return injectBeforeFrontendProgram(html, initialState);
}

function buildProcessPageState(model, currentPath) {
  const selection = model.selection ?? {};
  const replay = model.replay ?? null;
  const graphNodes = model.graph?.nodes ?? [];
  const graphNodeById = new Map(graphNodes.map(node => [node.id, node]));
  const selectedNode = selection.nodeId ? graphNodeById.get(selection.nodeId) ?? null : null;
  const selectedNodeHistory = selectedNode ? (model.run?.nodeHistory?.[selectedNode.id] ?? []) : [];
  const selectedNodeTimeline = selectedNodeHistory.filter(item => item.type === "timeline");
  const selectedNodeRequests = selectedNodeHistory.filter(item => item.type === "request");
  const selectedNodeState = selectedNode ? (replay?.nodeStates?.[selectedNode.id] ?? null) : null;
  const replayCursor = replay?.cursor ?? 0;
  const replayMax = replay?.max ?? 0;
  return {
    summaryItems: [
      summaryItem("program", "Program", selection.program || "none"),
      summaryItem("event", "Event", selection.event || "none"),
      summaryItem("nodes", "Nodes", graphNodes.length),
      summaryItem("runs", "Runs", model.runs?.length ?? 0)
    ],
    catalogItems: (model.catalog ?? []).map((item, index) => {
      const base = processWidgetId("catalog", index, item.program, item.event);
      return {
        widgetId: base,
        linkWidgetId: `${base}.link`,
        metaWidgetId: `${base}.meta`,
        label: item.label,
        meta: `${item.nodeCount} nodes - ${item.asyncCount} async`,
        href: processHref(currentPath, { program: item.program, event: item.event }),
        selected: item.program === selection.program && item.event === selection.event
      };
    }),
    runItems: (model.runs ?? []).map((item, index) => {
      const base = processWidgetId("run", index, item.runId);
      return {
        widgetId: base,
        linkWidgetId: `${base}.link`,
        metaWidgetId: `${base}.meta`,
        label: item.status,
        meta: `${item.runId} - ${item.actor || "frontendHost"}`,
        href: processHref(currentPath, { program: selection.program, event: selection.event, runId: item.runId }),
        selected: item.runId === selection.runId
      };
    }),
    graphLayers: (model.graph?.layers ?? []).map(layer => {
      const base = processWidgetId("layer", layer.index);
      return {
        widgetId: base,
        titleWidgetId: `${base}.title`,
        nodeContainerWidgetId: `${base}.nodes`,
        title: `Layer ${layer.index}`,
        nodes: layer.nodeIds.map((nodeId, index) => {
          const node = graphNodeById.get(nodeId);
          if (!node) return null;
          const itemBase = processWidgetId("node", layer.index, index, node.id);
          const status = replay?.nodeStates?.[node.id]?.status ?? "pending";
          const badges = [];
          if (node.semantics.branch) badges.push("branch");
          if (node.semantics.loopKind) badges.push(node.semantics.loopKind);
          if (node.semantics.parallel) badges.push("parallel");
          if (node.semantics.async) badges.push("async");
          if (node.semantics.fanIn) badges.push("fan-in");
          return {
            widgetId: itemBase,
            linkWidgetId: `${itemBase}.link`,
            opWidgetId: `${itemBase}.op`,
            metaWidgetId: `${itemBase}.meta`,
            badgesWidgetId: `${itemBase}.badges`,
            whenWidgetId: `${itemBase}.when`,
            repeatWidgetId: `${itemBase}.repeat`,
            afterWidgetId: `${itemBase}.after`,
            label: node.label,
            op: node.op,
            meta: node.breadcrumb || "",
            badgesText: badges.join(" | "),
            whenText: node.whenLabel ? `when ${node.whenLabel}` : "",
            repeatText: node.repeatLabel || "",
            afterText: node.after?.length ? `after ${node.after.join(", ")}` : "",
            href: processHref(currentPath, {
              program: selection.program,
              event: selection.event,
              runId: selection.runId,
              nodeId: node.id,
              replay: replay?.cursor ?? null
            }),
            selected: node.id === selection.nodeId,
            status,
            branch: node.semantics.branch,
            loopKind: node.semantics.loopKind || "",
            parallel: node.semantics.parallel,
            async: node.semantics.async
          };
        }).filter(Boolean)
      };
    }),
    runCards: model.run ? [{
      widgetId: processWidgetId("run-card"),
      titleWidgetId: processWidgetId("run-card", "title"),
      runIdWidgetId: processWidgetId("run-card", "id"),
      statusWidgetId: processWidgetId("run-card", "status"),
      actorWidgetId: processWidgetId("run-card", "actor"),
      runId: model.run.runId,
      status: model.run.status,
      actor: model.run.actor || "frontendHost"
    }] : [],
    replayCards: model.run ? [{
      widgetId: processWidgetId("replay-card"),
      titleWidgetId: processWidgetId("replay-card", "title"),
      cursorWidgetId: processWidgetId("replay-card", "cursor"),
      controlsWidgetId: processWidgetId("replay-card", "controls"),
      prevWidgetId: processWidgetId("replay-card", "prev"),
      nextWidgetId: processWidgetId("replay-card", "next"),
      failureWidgetId: processWidgetId("replay-card", "failure"),
      cursorLabel: `Cursor ${replayCursor} / ${replayMax}`,
      prevHref: processHref(currentPath, { program: selection.program, event: selection.event, runId: selection.runId, nodeId: selection.nodeId, replay: Math.max(0, replayCursor - 1) }),
      nextHref: processHref(currentPath, { program: selection.program, event: selection.event, runId: selection.runId, nodeId: selection.nodeId, replay: Math.min(replayMax, replayCursor + 1) }),
      failureHref: replay?.firstFailureCursor != null
        ? processHref(currentPath, { program: selection.program, event: selection.event, runId: selection.runId, nodeId: selection.nodeId, replay: replay.firstFailureCursor })
        : "",
      cursor: replayCursor,
      max: replayMax,
      rangeUrlPrefix: replayRangeUrlPrefix(currentPath, selection)
    }] : [],
    selectedNodeCards: selectedNode ? [{
      widgetId: processWidgetId("selected-node-card"),
      titleWidgetId: processWidgetId("selected-node-card", "title"),
      labelWidgetId: processWidgetId("selected-node-card", "label"),
      opWidgetId: processWidgetId("selected-node-card", "op"),
      metaWidgetId: processWidgetId("selected-node-card", "meta"),
      statusWidgetId: processWidgetId("selected-node-card", "status"),
      label: selectedNode.label,
      op: selectedNode.op,
      meta: selectedNode.breadcrumb || "",
      status: selectedNodeState ? `Status: ${selectedNodeState.status}` : ""
    }] : [],
    selectedNodeTimeline: selectedNodeTimeline.map((item, index) => {
      const base = processWidgetId("timeline", index, item.nodeId, item.cursor);
      return {
        widgetId: base,
        labelWidgetId: `${base}.label`,
        statusWidgetId: `${base}.status`,
        messageWidgetId: `${base}.message`,
        label: item.process || item.nodeId || "timeline",
        status: item.status || "",
        message: item.message || "",
        failed: item.status === "failed"
      };
    }),
    selectedNodeRequests: selectedNodeRequests.map((item, index) => {
      const base = processWidgetId("request", index, item.requestId, item.stepId);
      return {
        widgetId: base,
        labelWidgetId: `${base}.label`,
        statusWidgetId: `${base}.status`,
        messageWidgetId: `${base}.message`,
        label: `${item.method} ${item.url}`,
        status: `Status ${item.statusCode}`,
        message: (item.failureWitnesses || [])
          .map(failure => `${failure.process} ${failure.body?.reason || failure.body?.message || ""}`.trim())
          .filter(Boolean)
          .join("\n"),
        failed: Number(item.statusCode) >= 400
      };
    })
  };
}

function summaryItem(id, label, value) {
  const base = processWidgetId("summary", id);
  return {
    widgetId: base,
    labelWidgetId: `${base}.label`,
    valueWidgetId: `${base}.value`,
    label,
    value: String(value)
  };
}

function processWidgetId(...parts) {
  return parts
    .map(part => String(part ?? "").trim())
    .filter(Boolean)
    .map(part => part.replace(/[^A-Za-z0-9_.:-]+/g, "-"))
    .join(".");
}

function replayRangeUrlPrefix(basePath, selection) {
  return processHref(basePath, {
    program: selection.program,
    event: selection.event,
    runId: selection.runId,
    nodeId: selection.nodeId,
    replay: ""
  });
}

function serializeJsonScript(value) {
  return JSON.stringify(value).replace(/[<>&]/g, char => {
    if (char === "<") return "\\u003c";
    if (char === ">") return "\\u003e";
    return "\\u0026";
  });
}

function injectBeforeFrontendProgram(html, addition) {
  const anchor = '<script type="application/json" id="witness-frontend-program">';
  if (html.includes(anchor)) return html.replace(anchor, `${addition}\n${anchor}`);
  return html.includes("</body>")
    ? html.replace("</body>", `${addition}\n</body>`)
    : `${html}\n${addition}`;
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
  if (program?.graph) {
    const nodes = program.graph.filter(node => node.event === event);
    return buildAuthoredGraph(programId, event, nodes);
  }
  const backendProgram = backendProgramVersionDefinition(witnesses, programId);
  if (!backendProgram?.graph) return emptyGraph();
  const nodes = backendProgram.graph.filter(node => node.event === event);
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

function processRunIndex(witnesses, observations = []) {
  const runs = new Map();
  const traceEntries = [
    ...witnesses.map((entry, index) => ({ entry, index, source: "witness" })),
    ...observations.map((entry, index) => ({ entry, index: witnesses.length + index, source: "observation" }))
  ];
  for (const trace of traceEntries) {
    const witness = trace.entry;
    const index = trace.index;
    const runId = witness.body?.runId;
    if (!runId || !PROCESS_EVENT_PROCESSES.has(String(witness.process || ""))) continue;
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
    if (witness.process === "frontend.process.start" || witness.process === "backend.process.start") {
      entry.program = witness.body.program ?? entry.program;
      entry.event = witness.body.event ?? entry.event;
      entry.actor = witness.actor ?? entry.actor;
      entry.status = "running";
      entry.startedAt = witness.body.timestamp ?? index;
      entry.startedSeq = index;
      entry.eventData = witness.body.eventData ?? {};
    } else if (witness.process === "frontend.process.done" || witness.process === "backend.process.done") {
      entry.status = "done";
      entry.endedAt = witness.body.timestamp ?? index;
      entry.endedSeq = index;
    } else if (witness.process === "frontend.process.failed" || witness.process === "backend.process.failed") {
      entry.status = "failed";
      entry.endedAt = witness.body.timestamp ?? index;
      entry.endedSeq = index;
    } else if (witness.process.startsWith("frontend.step.") || witness.process.startsWith("backend.step.")) {
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
  if (process === "frontend.step.start" || process === "backend.step.start") return "start";
  if (process === "frontend.step.done" || process === "backend.step.done") return "done";
  if (process === "frontend.step.skipped" || process === "backend.step.skipped") return "skipped";
  if (process === "frontend.step.failed" || process === "backend.step.failed") return "failed";
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
