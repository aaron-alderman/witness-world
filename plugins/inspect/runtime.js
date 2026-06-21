import path from "node:path";
import { relation } from "../../src/kernel.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "./widget-versions.js";
import {
  inspectProcessRunReadModel,
  inspectProcessViewReadModel,
  inspectSourceReadModel,
  inspectWitnessesReadModel,
  inspectWorldGraphReadModel,
  inspectWorldSystemReadModelForRuntime,
  recordInspectProcessEventRequest
} from "../../src/inspect-runtime-shared.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";
import {
  previewAwareAppContext,
  resolvePreviewSessionRequest
} from "../../src/runtime-preview.js";

export const bundleId = "bundle-inspect";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "events.stream",
    "widgetVersions.activate",
    "widgetVersions.rollback",
    "witnesses.list",
    "worldSystem.read",
    "worldGraph.read",
    "processView.read",
    "processRun.read",
    "processEvents.record",
    "source.read"
  ]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "events.stream",
    "widgetVersions.activate",
    "widgetVersions.rollback",
    "witnesses.list",
    "worldSystem.read",
    "worldGraph.read",
    "processView.read",
    "processRun.read",
    "processEvents.record",
    "source.read"
  ]),
  handlerMetadata: Object.freeze({
    "events.stream": Object.freeze({ routeKind: "stream", responseKind: "stream", methods: Object.freeze(["GET"]) }),
    "witnesses.list": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "worldSystem.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "worldGraph.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "processView.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "processRun.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "processEvents.record": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "source.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) })
  })
});

export const routes = Object.freeze([
  Object.freeze({ kind: "exact", method: "GET", path: "/api/events", handler: "events.stream" })
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "inspect.projections",
    projectors: {
      "inspect.witnessesReadModel": inspectWitnessesReadModel,
      "inspect.worldSystemReadModel": inspectWorldSystemReadModelForRuntime,
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

export {
  inspectProcessRunReadModel,
  inspectProcessViewReadModel,
  inspectSourceReadModel,
  inspectWitnessesReadModel,
  inspectWorldGraphReadModel,
  inspectWorldSystemReadModelForRuntime,
  recordInspectProcessEventRequest
};

export function createHandlers({
  world,
  backendHost,
  frontendHost,
  logger,
  sendJson,
  readJson,
  sendGateFailure,
  authorityServices,
  processSelection,
  frontendTraceProcesses,
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

    "worldSystem.read": async ({ res, requestActor, requestId, requestUrl, appContext }) => {
      const previewRequest = resolvePreviewSessionRequest({ appContext, requestUrl });
      if (!previewRequest.ok && previewRequest.reason === "stale") {
        sendJson(res, 409, {
          error: previewRequest.session?.invalidReason || "preview no longer matches the active snapshot",
          previewSession: previewRequest.session ?? null
        });
        return;
      }
      const requestWorld = previewRequest.ok ? previewRequest.world : world;
      const requestAppContext = previewRequest.ok
        ? previewAwareAppContext(appContext, requestWorld)
        : appContext;
      requestWorld.observe({
        process: "backend.readWorldSystem",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "worldSystem")],
        body: { count: requestWorld.allWitnesses().length }
      });
      const model = inspectWorldSystemReadModelForRuntime(requestWorld.allWitnesses(), {
        requestActor,
        appContext: requestAppContext,
        observations: requestWorld.allObservations()
      });
      logInfo("worldSystem.projected", {
        requestId,
        witnesses: model.summary?.witnesses ?? 0,
        boundaries: model.summary?.boundaries ?? 0,
        runtimeStatus: model.summary?.runtimeStatus ?? "unknown"
      });
      sendJson(res, 200, model);
    },

    "worldGraph.read": async ({ res, requestActor, requestId, requestUrl, appContext }) => {
      const previewRequest = resolvePreviewSessionRequest({ appContext, requestUrl });
      if (!previewRequest.ok && previewRequest.reason === "stale") {
        sendJson(res, 409, {
          error: previewRequest.session?.invalidReason || "preview no longer matches the active snapshot",
          previewSession: previewRequest.session ?? null
        });
        return;
      }
      const requestWorld = previewRequest.ok ? previewRequest.world : world;
      const requestAppContext = previewRequest.ok
        ? previewAwareAppContext(appContext, requestWorld)
        : appContext;
      requestWorld.observe({
        process: "backend.readWorldGraph",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "worldGraph")],
        body: { count: requestWorld.allWitnesses().length }
      });
      const model = inspectWorldGraphReadModel(requestWorld.allWitnesses(), { requestActor, appContext: requestAppContext });
      logInfo("worldGraph.projected", {
        requestId,
        witnesses: requestWorld.allWitnesses().length,
        nodes: model.graph.nodes.length,
        edges: model.graph.edges.length
      });
      sendJson(res, 200, model);
    },

    "processView.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const previewRequest = resolvePreviewSessionRequest({ appContext, requestUrl });
      if (!previewRequest.ok && previewRequest.reason === "stale") {
        sendJson(res, 409, {
          error: previewRequest.session?.invalidReason || "preview no longer matches the active snapshot",
          previewSession: previewRequest.session ?? null
        });
        return;
      }
      const requestWorld = previewRequest.ok ? previewRequest.world : world;
      const requestAppContext = previewRequest.ok
        ? previewAwareAppContext(appContext, requestWorld)
        : appContext;
      requestWorld.emit({
        process: "backend.readProcessView",
        actor: requestActor || backendHost,
        claims: [],
        body: processSelection(requestUrl)
      });
      const model = inspectProcessViewReadModel(requestWorld.allWitnesses(), {
        requestActor,
        appContext: requestAppContext,
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        observations: requestWorld.allObservations()
      });
      sendJson(res, 200, model);
    },

    "processRun.read": async ({ res, requestUrl, requestActor, params, appContext }) => {
      const previewRequest = resolvePreviewSessionRequest({ appContext, requestUrl });
      if (!previewRequest.ok && previewRequest.reason === "stale") {
        sendJson(res, 409, {
          error: previewRequest.session?.invalidReason || "preview no longer matches the active snapshot",
          previewSession: previewRequest.session ?? null
        });
        return;
      }
      const requestWorld = previewRequest.ok ? previewRequest.world : world;
      const requestAppContext = previewRequest.ok
        ? previewAwareAppContext(appContext, requestWorld)
        : appContext;
      const result = inspectProcessRunReadModel(requestWorld.allWitnesses(), {
        requestActor,
        appContext: requestAppContext,
        runId: params.runId || "",
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        observations: requestWorld.allObservations()
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
      const result = await inspectSourceReadModel(world, { backendHost, requestUrl });
      sendJson(res, result.status, result.body);
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
