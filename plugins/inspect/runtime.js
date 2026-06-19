import fs from "node:fs/promises";
import path from "node:path";
import { relation } from "../../src/kernel.js";
import {
  frontendProgramsProjection,
  widgetDefinitions
} from "../../src/widgets.js";
import { guidanceConfigForSession } from "../../src/runtime-guidance.js";
import { renderWidgetPage } from "./widget-page.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "./widget-versions.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { processRunProjection, processViewProjection, renderProcessPage } from "./process-view.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";

export const bundleId = "bundle-inspect";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "events.stream",
    "widgetVersions.activate",
    "widgetVersions.rollback",
    "witnesses.list",
    "worldGraph.read",
    "processView.read",
    "processRun.read",
    "processEvents.record",
    "source.read",
    "page.world",
    "page.process"
  ]),
  pageHandlers: Object.freeze([
    "page.world",
    "page.process"
  ]),
  dispatchHandlers: Object.freeze([
    "events.stream",
    "widgetVersions.activate",
    "widgetVersions.rollback",
    "witnesses.list",
    "worldGraph.read",
    "processView.read",
    "processRun.read",
    "processEvents.record",
    "source.read",
    "page.world",
    "page.process"
  ]),
  handlerMetadata: Object.freeze({
    "events.stream": Object.freeze({ routeKind: "stream", responseKind: "stream", methods: Object.freeze(["GET"]) }),
    "witnesses.list": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "worldGraph.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "processView.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "processRun.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "processEvents.record": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "source.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "page.world": Object.freeze({ routeKind: "page", responseKind: "page", methods: Object.freeze(["GET"]) }),
    "page.process": Object.freeze({ routeKind: "page", responseKind: "page", methods: Object.freeze(["GET"]) })
  })
});

export const routes = Object.freeze([
  Object.freeze({ kind: "exact", method: "GET", path: "/api/events", handler: "events.stream" })
]);

export const surfaces = Object.freeze([
  Object.freeze({
    id: "surface:world",
    title: "Open World",
    subtitle: "Operating surface / graph and inspectors",
    href: "/world",
    action: null,
    search: "world graph operating surface witnesses source process internal operator /world",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["app-command"])
  }),
  Object.freeze({
    id: "surface:world-mode:graph",
    title: "Show Graph",
    subtitle: "Operating surface / graph mode",
    href: null,
    action: Object.freeze({ kind: "mode", mode: "graph" }),
    search: "graph surface world map objects internal operator",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["world-command"])
  }),
  Object.freeze({
    id: "surface:world-mode:things",
    title: "Show Thing List",
    subtitle: "Operating surface / thing list",
    href: null,
    action: Object.freeze({ kind: "mode", mode: "things" }),
    search: "things list widgets routes capabilities internal operator",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["world-command"])
  }),
  Object.freeze({
    id: "surface:world-mode:primitive",
    title: "Show Primitive Browser",
    subtitle: "Hidden surface / literals and unresolved refs",
    href: null,
    action: Object.freeze({ kind: "mode", mode: "primitive" }),
    search: "primitive browser hidden literals refs values internal operator",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["world-command"])
  }),
  Object.freeze({
    id: "surface:world-mode:witness",
    title: "Show Witness Browser",
    subtitle: "Witnessed history for the selected object",
    href: null,
    action: Object.freeze({ kind: "mode", mode: "witness" }),
    search: "witness browser show witnesses selected object history internal operator",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["world-command"])
  }),
  Object.freeze({
    id: "surface:world-mode:source",
    title: "Show Source Browser",
    subtitle: "Hidden surface / witnessed source definitions",
    href: null,
    action: Object.freeze({ kind: "mode", mode: "source" }),
    search: "source browser hidden dsl file witnessed source internal operator",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["world-command"])
  }),
  Object.freeze({
    id: "surface:world-mode:process",
    title: "Show Process Explorer",
    subtitle: "Witnessed execution handoff surface",
    href: null,
    action: Object.freeze({ kind: "mode", mode: "process" }),
    search: "process explorer witnessed execution runs replay internal operator",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["world-command"])
  }),
  Object.freeze({
    id: "surface:process-view",
    title: "Open Process View",
    subtitle: "Witnessed execution page",
    href: "/process",
    action: null,
    search: "process view witnessed execution runs replay internal operator /process",
    type: "surface",
    tier: "internal",
    contexts: Object.freeze(["app-command", "world-command"])
  })
]);

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

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "inspect.projections",
    projectors: {
      "inspect.witnessesReadModel": inspectWitnessesReadModel,
      "inspect.worldGraphReadModel": inspectWorldGraphReadModel,
      "inspect.processViewReadModel": inspectProcessViewReadModel,
      "inspect.processRunReadModel": inspectProcessRunReadModel
    }
  },
  {
    kind: "backendProcessRequestHandlers",
    id: "inspect.processes",
    handlers: {
      "inspect.processEventRecord": async ({ world, frontendHost, body, requestActor }) =>
        recordInspectProcessEventRequest({ world, frontendHost, body, requestActor })
    }
  }
]);

function widgetPageTutorialSurface(world, {
  route = null,
  rootWidget = null,
  frontendProgramId = null,
  tutorialPage = null
} = {}) {
  const witnesses = world.allWitnesses();
  const routeRows = new Map(route?.id ? [[route.id, route]] : []);
  const widgetRows = new Map(widgetDefinitions(witnesses).map(row => [row.id, row]));
  const programRows = new Map(frontendProgramsProjection(witnesses).map(row => [row.id, row]));
  const routeRow = route?.id ? routeRows.get(route.id) ?? route : route;
  const programRow = frontendProgramId ? programRows.get(frontendProgramId) ?? null : null;
  const widgetRow = rootWidget ? widgetRows.get(rootWidget) ?? null : null;
  return {
    page: typeof tutorialPage === "string" && tutorialPage.trim() ? tutorialPage.trim() : null,
    context: programRow?.context ?? widgetRow?.context ?? routeRow?.context ?? null,
    routeId: routeRow?.id ?? route?.id ?? null,
    rootWidgetId: widgetRow?.id ?? rootWidget ?? null,
    frontendProgramId: programRow?.id ?? frontendProgramId ?? null
  };
}

export function createHandlers({
  world,
  backendHost,
  frontendHost,
  logger,
  send,
  sendJson,
  readJson,
  sendGateFailure,
  authorityServices,
  requestActors,
  requestVisibleWitnesses,
  processSelection,
  processViewInputs,
  frontendTraceProcesses,
  tutorialProgressFor,
  guidanceProgressFor,
  runtimeContributions = null
}) {
  const { ensureTargetAuthority } = authorityServices;
  const logInfo = typeof logger?.info === "function"
    ? (event, fields) => logger.info(event, fields)
    : () => {};
  const widgetVersionProposalId = (targetProcess, soul) => {
    const processPart = String(targetProcess || "widgetVersion.action").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const soulPart = String(soul || "widget").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.${processPart}.${soulPart}.${world.allWitnesses().length + 1}`;
  };
  const createWidgetVersionProposal = ({ actor, targetProcess, soul, version = null, reason = "" }) => {
    const body = targetProcess === "widgetVersion.activate"
      ? { soul, version }
      : { soul };
    const proposalReason = reason || (targetProcess === "widgetVersion.activate"
      ? `Request activation of ${version || "a shared widget version"} on ${soul || "the shared widget"}`
      : `Request rollback of ${soul || "the shared widget"} to its previous version`);
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: widgetVersionProposalId(targetProcess, soul),
        targetProcess,
        targetKind: "widget",
        targetId: soul || null,
        bodyJson: JSON.stringify(body),
        reason: proposalReason
      }
    });
  };
  const widgetVersionProposalStatusMessage = targetProcess => targetProcess === "widgetVersion.rollback"
    ? "Proposed widget version rollback for review."
    : "Proposed widget version activation for review.";
  const widgetVersionDirectStatusMessage = ({ targetProcess, version = null, rolledBackTo = null }) => targetProcess === "widgetVersion.rollback"
    ? `Rolled back to ${rolledBackTo || "the previous version"}.`
    : `Activated ${version || "the requested version"}.`;

  return {
    "widgetVersions.activate": async ({ req, res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "activateWidgetVersion.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const version = typeof body.version === "string" ? body.version : null;
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = createWidgetVersionProposal({
            actor: requestActor,
            targetProcess: "widgetVersion.activate",
            soul: params.soul || "",
            version,
            reason
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            soul: params.soul || "",
            version,
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: widgetVersionProposalStatusMessage("widgetVersion.activate")
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetVersionActivation(world, { actor: requestActor, soul: params.soul || "", version });
      if (result.status === "failed") {
        sendJson(res, 400, { error: result.witness.body?.reason || "unknown widget version", status: result.status, soul: result.soul, version, witness: result.witness });
        return;
      }
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "widget version transition blocked", status: result.status, soul: result.soul, version, witnesses: result.witnesses, witness: result.witness });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        soul: result.soul,
        version,
        witnesses: result.witnesses,
        witness: result.witness,
        statusMessage: widgetVersionDirectStatusMessage({ targetProcess: "widgetVersion.activate", version })
      });
    },

    "widgetVersions.rollback": async ({ req, res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "widgetVersion.rollback.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = createWidgetVersionProposal({
            actor: requestActor,
            targetProcess: "widgetVersion.rollback",
            soul: params.soul || "",
            reason
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            soul: params.soul || "",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: widgetVersionProposalStatusMessage("widgetVersion.rollback")
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = rollbackWidgetVersion(world, { actor: requestActor, soul: params.soul || "" });
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "rollback unavailable", status: result.status, soul: result.soul, witness: result.witness });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        soul: result.soul,
        version: result.version,
        witnesses: result.witnesses,
        witness: result.witness,
        statusMessage: widgetVersionDirectStatusMessage({ targetProcess: "widgetVersion.rollback", rolledBackTo: result.version })
      });
    },

    "page.world": async ({ res, route, requestSession, appContext }) => {
      const params = route.params ?? {};
      const rootWidget = params.rootWidget ?? null;
      if (!rootWidget) {
        sendJson(res, 404, { error: "world graph page not configured" });
        return;
      }
      world.observe({
        process: "frontend.renderWorldPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || rootWidget)],
        body: { route: route.path }
      });
      const tutorialSurface = widgetPageTutorialSurface(world, {
        route,
        rootWidget,
        frontendProgramId: params.frontendProgram ?? null,
        tutorialPage: "world"
      });
      const guidance = guidanceConfigForSession({
        requestSession,
        tutorialProgressFor,
        guidanceProgressFor,
        runtimeContributions,
        surface: tutorialSurface
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget,
        frontendProgram: params.frontendProgram ?? null,
        appConfig: {
          actors: requestActors(appContext),
          page: params.page ?? "world",
          liveProjection: params.liveProjection !== false,
          runtimeSurfaces: appContext.runtimeSurfaceEntries ?? [],
          surfaceContext: tutorialSurface.context,
          surfaceRouteId: tutorialSurface.routeId,
          surfaceRootWidgetId: tutorialSurface.rootWidgetId,
          surfaceProgramId: tutorialSurface.frontendProgramId,
          guidance,
          tutorial: guidance
        }
      }));
    },

    "page.process": async ({ res, route, requestUrl, requestActor, appContext }) => {
      world.emit({
        process: "frontend.renderProcessPage",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || "processView")],
        body: {
          route: route.path || "/process",
          ...processSelection(requestUrl)
        }
      });
      const model = processViewProjection(processViewInputs(requestActor, appContext), processSelection(requestUrl));
      send(res, 200, "text/html", renderProcessPage(model, { currentPath: route.path || "/process" }));
    },

    "witnesses.list": async ({ res, requestUrl, requestActor, appContext }) => {
      const rawOffset = requestUrl.searchParams.get("offset");
      const model = inspectWitnessesReadModel(world.allWitnesses(), {
        requestActor,
        appContext,
        query: rawOffset === null ? {} : { offset: rawOffset }
      });
      if (rawOffset === null) {
        world.observe({
          process: "backend.readWitnesses",
          actor: backendHost,
          claims: [relation(backendHost, "read", "witnessLog")],
          body: { count: world.allWitnesses().length }
        });
        sendJson(res, 200, model);
        return;
      }
      sendJson(res, 200, model);
    },

    "worldGraph.read": async ({ res, requestActor, requestId, appContext }) => {
      world.observe({
        process: "backend.readWorldGraph",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "worldGraph")],
        body: { count: world.allWitnesses().length }
      });
      const model = inspectWorldGraphReadModel(world.allWitnesses(), { requestActor, appContext });
      const visibleCount = visibleWitnessesForProjection(world.allWitnesses(), { requestActor, appContext }).length;
      logInfo("worldGraph.projected", { requestId, witnesses: visibleCount, nodes: model.graph.nodes.length, edges: model.graph.edges.length });
      sendJson(res, 200, model);
    },

    "processView.read": async ({ res, requestUrl, requestActor, appContext }) => {
      world.emit({
        process: "backend.readProcessView",
        actor: requestActor || backendHost,
        claims: [],
        body: processSelection(requestUrl)
      });
      const model = inspectProcessViewReadModel(world.allWitnesses(), {
        requestActor,
        appContext,
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        observations: world.allObservations()
      });
      sendJson(res, 200, model);
    },

    "processRun.read": async ({ res, requestUrl, requestActor, params, appContext }) => {
      const result = inspectProcessRunReadModel(world.allWitnesses(), {
        requestActor,
        appContext,
        runId: params.runId || "",
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        observations: world.allObservations()
      });
      if (!result.ok) {
        sendJson(res, result.status, result.body);
        return;
      }
      sendJson(res, result.status, result.body);
    },

    "events.stream": async ({ req, res, requestActor, appContext }) => {
      const stream = appContext?.eventsStream;
      if (!stream || typeof stream.open !== "function") {
        sendJson(res, 503, { error: "events stream unavailable" });
        return;
      }
      const opened = stream.open(res, req) ?? {};
      world.observe({
        process: "backend.eventsStream",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "streams", "witnessLog")],
        body: {
          clients: Number.isFinite(opened.clients) ? opened.clients : null,
          serverRunner: opened.serverRunner ?? appContext?.serverRunnerId ?? null
        }
      });
    },

    "processEvents.record": async ({ req, res, requestActor }) => {
      const result = await recordInspectProcessEventRequest({
        world,
        frontendHost,
        body: await readJson(req),
        requestActor
      }, {
        frontendTraceProcesses
      });
      if (!result.ok) {
        sendJson(res, result.status, result.payload);
        return;
      }
      sendJson(res, result.status, result.payload);
    },

    "source.read": async ({ res, requestUrl }) => {
      const requested = requestUrl.searchParams.get("file") || "";
      const allowed = new Set(world.allWitnesses()
        .filter(witness => isSourceAnnotationWitness(witness) && typeof witness.body?.file === "string")
        .map(witness => path.resolve(witness.body.file)));
      const resolvedFile = path.resolve(requested);
      if (!allowed.has(resolvedFile)) {
        world.observe({ process: "backend.readSource.failed", actor: backendHost, claims: [], body: { file: requested, reason: "source file not in witnessed imports" } });
        sendJson(res, 404, { error: "source file not available", file: requested });
        return;
      }
      const text = await fs.readFile(resolvedFile, "utf8");
      const ast = astNodesProjection(world.allWitnesses());
      const annotations = (ast.byFile.get(resolvedFile) ?? []).slice().sort((a, b) =>
        Number(a.startLine ?? a.line ?? 0) - Number(b.startLine ?? b.line ?? 0)
        || Number(a.startColumn ?? 1) - Number(b.startColumn ?? 1)
        || String(a.target ?? "").localeCompare(String(b.target ?? ""))
      );
      world.observe({ process: "backend.readSource", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
      sendJson(res, 200, {
        file: resolvedFile,
        text,
        annotations,
        targets: [...new Set(annotations.map(node => node.target).filter(Boolean))]
      });
    }
  };
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};

function isSourceAnnotationWitness(witness) {
  return typeof witness?.process === "string" && witness.process.endsWith(".source.annotate");
}
