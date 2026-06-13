import fs from "node:fs/promises";
import path from "node:path";
import { relation } from "../../src/kernel.js";
import {
  frontendProgramsProjection,
  renderWidgetPage,
  requestWidgetVersionActivation,
  rollbackWidgetVersion,
  widgetDefinitions
} from "../../src/widgets.js";
import { worldGraphProjection, astNodesProjection } from "../../src/world-graph.js";
import { processRunProjection, processViewProjection, renderProcessPage } from "../../src/process-view.js";
import { requestBootstrapProposalCreate } from "../../src/bootstrap-authoring.js";

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
  frontendTraceProcesses
}) {
  const { ensureTargetAuthority } = authorityServices;
  const widgetVersionProposalId = (targetProcess, soul) => {
    const processPart = String(targetProcess || "widgetVersion.action").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const soulPart = String(soul || "widget").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.${processPart}.${soulPart}.${world.allWitnesses().length + 1}`;
  };
  const createWidgetVersionProposal = ({ actor, targetProcess, soul, version = null }) => {
    const body = targetProcess === "widgetVersion.activate"
      ? { soul, version }
      : { soul };
    const reason = targetProcess === "widgetVersion.activate"
      ? `Request activation of ${version || "a shared widget version"} on ${soul || "the shared widget"}`
      : `Request rollback of ${soul || "the shared widget"} to its previous version`;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: widgetVersionProposalId(targetProcess, soul),
        targetProcess,
        targetKind: "widget",
        targetId: soul || null,
        bodyJson: JSON.stringify(body),
        reason
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
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = createWidgetVersionProposal({
            actor: requestActor,
            targetProcess: "widgetVersion.activate",
            soul: params.soul || "",
            version
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

    "widgetVersions.rollback": async ({ res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "widgetVersion.rollback.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const auth = ensureTargetAuthority(requestActor, params.soul || "");
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = createWidgetVersionProposal({
            actor: requestActor,
            targetProcess: "widgetVersion.rollback",
            soul: params.soul || ""
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

    "page.world": async ({ res, route, appContext }) => {
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
          surfaceProgramId: tutorialSurface.frontendProgramId
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
      const visible = requestVisibleWitnesses(requestActor, appContext).map(witness => ({
        ...witness,
        bodyJson: JSON.stringify(witness.body ?? {})
      }));
      if (rawOffset === null) {
        world.observe({
          process: "backend.readWitnesses",
          actor: backendHost,
          claims: [relation(backendHost, "read", "witnessLog")],
          body: { count: world.allWitnesses().length }
        });
        sendJson(res, 200, { witnesses: visible, offset: 0, total: visible.length });
        return;
      }
      const offset = Math.max(0, Math.min(visible.length, Number(rawOffset) || 0));
      sendJson(res, 200, { witnesses: visible.slice(offset), offset, total: visible.length });
    },

    "worldGraph.read": async ({ res, requestActor, requestId, appContext }) => {
      world.observe({
        process: "backend.readWorldGraph",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "worldGraph")],
        body: { count: world.allWitnesses().length }
      });
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const graph = worldGraphProjection(visible);
      const ast = astNodesProjection(visible);
      const astNodes = {
        byFile: Object.fromEntries([...ast.byFile.entries()].map(([file, nodes]) => [file, nodes])),
        byTarget: Object.fromEntries([...ast.byTarget.entries()].map(([target, nodes]) => [target, nodes]))
      };
      logger.info("worldGraph.projected", { requestId, witnesses: visible.length, nodes: graph.nodes.length, edges: graph.edges.length });
      sendJson(res, 200, { graph, astNodes });
    },

    "processView.read": async ({ res, requestUrl, requestActor, appContext }) => {
      world.emit({
        process: "backend.readProcessView",
        actor: requestActor || backendHost,
        claims: [],
        body: processSelection(requestUrl)
      });
      const model = processViewProjection(processViewInputs(requestActor, appContext), processSelection(requestUrl));
      sendJson(res, 200, model);
    },

    "processRun.read": async ({ res, requestUrl, requestActor, params, appContext }) => {
      const replay = requestUrl.searchParams.get("replay");
      const run = processRunProjection(processViewInputs(requestActor, appContext), { runId: params.runId || "", replay });
      if (!run) {
        sendJson(res, 404, { error: "process run not found", runId: params.runId || "" });
        return;
      }
      sendJson(res, 200, run);
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
      const body = await readJson(req);
      const process = typeof body.process === "string" ? body.process : "";
      if (!frontendTraceProcesses.has(process)) {
        sendJson(res, 400, { error: "unknown process trace", process });
        return;
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
      sendJson(res, 200, { ok: true, id: witness.id });
    },

    "source.read": async ({ res, requestUrl }) => {
      const requested = requestUrl.searchParams.get("file") || "";
      const allowed = new Set(world.allWitnesses()
        .filter(witness => witness.process === "dsl.source.annotate" && typeof witness.body?.file === "string")
        .map(witness => path.resolve(witness.body.file)));
      const resolvedFile = path.resolve(requested);
      if (!allowed.has(resolvedFile)) {
        world.observe({ process: "backend.readSource.failed", actor: backendHost, claims: [], body: { file: requested, reason: "source file not in witnessed imports" } });
        sendJson(res, 404, { error: "source file not available", file: requested });
        return;
      }
      const text = await fs.readFile(resolvedFile, "utf8");
      world.observe({ process: "backend.readSource", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
      sendJson(res, 200, { file: resolvedFile, text });
    }
  };
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
