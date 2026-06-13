import { relation, projectors } from "../../src/kernel.js";
import { fileURLToPath } from "node:url";
import { canvasProcessHandlers } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";

export const bundleId = "bundle-canvas";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "canvas.perspectives.list",
    "canvas.read",
    "canvas.process",
    "page.canvas"
  ]),
  pageHandlers: Object.freeze(["page.canvas"]),
  dispatchHandlers: Object.freeze([
    "canvas.perspectives.list",
    "canvas.read",
    "canvas.process",
    "page.canvas"
  ]),
  handlerMetadata: Object.freeze({
    "canvas.perspectives.list": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "canvas.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "canvas.process": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "page.canvas": Object.freeze({ routeKind: "page", responseKind: "page", methods: Object.freeze(["GET"]) })
  })
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);

function runtimeFile(name) {
  return fileURLToPath(new URL(`./${name}`, import.meta.url));
}

function sourceFile(name) {
  return fileURLToPath(new URL(`../../src/${name}`, import.meta.url));
}

export const providers = Object.freeze([
  {
    kind: "supportServiceFactory",
    id: "canvas.support",
    factory: () => ({
      canvasProcessHandlers
    })
  },
  {
    kind: "staticAssetProvider",
    id: "canvas.static",
    mount: "/canvas-lib/",
    files: Object.freeze({
      "canvas-core.js": runtimeFile("canvas-core.js"),
      "projectors-core.js": sourceFile("projectors-core.js"),
      "canvas-projection.js": runtimeFile("canvas-projection.js")
    })
  }
]);

function perspectiveContextId(world, perspectiveId) {
  return world
    .project(projectors.currentRelations)
    .find(row => row.from === perspectiveId && row.rel === "inContext")
    ?.to ?? null;
}

function canvasProposalId(process, targetId) {
  return `proposal.${process}.${targetId}`;
}

function canvasProposalConfig({ process, params = {} }) {
  switch (process) {
    case "canvas.move":
    case "canvas.moveMany":
    case "canvas.batch":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Change shared canvas layout through witnessed proposal",
            statusMessage: "Proposed canvas layout change for review."
          }
        : null;
    case "canvas.place":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Place an existing thing on a shared canvas through witnessed proposal",
            statusMessage: "Proposed canvas placement for review."
          }
        : null;
    case "canvas.style":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Change shared canvas styling through witnessed proposal",
            statusMessage: "Proposed canvas style change for review."
          }
        : null;
    case "canvas.remove":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Remove a shared canvas item through witnessed proposal",
            statusMessage: "Proposed canvas removal for review."
          }
        : null;
    case "canvas.removeMany":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Remove shared canvas items through witnessed proposal",
            statusMessage: "Proposed canvas removals for review."
          }
        : null;
    case "canvas.duplicate":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Duplicate a shared canvas item through witnessed proposal",
            statusMessage: "Proposed canvas duplicate for review."
          }
        : null;
    case "canvas.camera":
    case "canvas.grid":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Adjust shared canvas view settings through witnessed proposal",
            statusMessage: "Proposed canvas view change for review."
          }
        : null;
    case "canvas.createThing":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Create a shared canvas thing through witnessed proposal",
            statusMessage: "Proposed canvas thing for review."
          }
        : null;
    case "canvas.perspective.create":
      return params.context
        ? {
            targetProcess: process,
            targetKind: "context",
            targetId: params.context,
            reason: "Create a shared canvas perspective through witnessed proposal",
            statusMessage: "Proposed canvas perspective for review."
          }
        : null;
    case "canvas.thing.setTitle":
      return params.thing
        ? {
            targetProcess: process,
            targetKind: "thing",
            targetId: params.thing,
            reason: "Rename a shared canvas thing through witnessed proposal",
            statusMessage: "Proposed canvas title update for review."
          }
        : null;
    case "canvas.relate":
      return params.from
        ? {
            targetProcess: process,
            targetKind: "thing",
            targetId: params.from,
            reason: "Create a shared canvas relation through witnessed proposal",
            statusMessage: "Proposed canvas relation for review."
          }
        : null;
    case "canvas.unrelate":
      return params.from
        ? {
            targetProcess: process,
            targetKind: "thing",
            targetId: params.from,
            reason: "Remove a shared canvas relation through witnessed proposal",
            statusMessage: "Proposed canvas relation removal for review."
          }
        : null;
    default:
      return null;
  }
}

export function createHandlers({
  world,
  backendHost,
  frontendHost,
  send,
  sendJson,
  readJson,
  authorityServices,
  requestActors,
  requestVisibleWitnesses
}) {
  const { ensureTargetAuthority, ensureContextAuthority } = authorityServices;
  const createCanvasProposal = ({ actor, process, params = {} }) => {
    const config = canvasProposalConfig({ process, params });
    if (!config) return null;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: canvasProposalId(config.targetProcess, config.targetId),
        targetProcess: config.targetProcess,
        targetKind: config.targetKind,
        targetId: config.targetId,
        bodyJson: JSON.stringify(params),
        reason: config.reason
      }
    });
  };
  return {
    "page.canvas": async ({ res, route, appContext }) => {
      world.observe({
        process: "frontend.renderCanvasPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || "canvasView")],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderCanvasPage({ actors: requestActors(appContext) }));
    },

    "canvas.perspectives.list": async ({ res, requestActor, appContext }) => {
      const perspectives = perspectivesProjection(requestVisibleWitnesses(requestActor, appContext));
      world.observe({
        process: "backend.readPerspectives",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { count: perspectives.length }
      });
      sendJson(res, 200, { perspectives });
    },

    "canvas.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const perspective = requestUrl.searchParams.get("perspective") || "";
      const canvas = canvasProjection(requestVisibleWitnesses(requestActor, appContext), perspective);
      if (!canvas) {
        world.observe({ process: "backend.readCanvas.failed", actor: backendHost, claims: [], body: { perspective, reason: "unknown perspective" } });
        sendJson(res, 404, { error: "unknown perspective", perspective });
        return;
      }
      world.observe({
        process: "backend.readCanvas",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { perspective, instances: canvas.instances.length, connectors: canvas.connectors.length }
      });
      sendJson(res, 200, { canvas });
    },

    "canvas.process": async ({ req, res, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "canvas.process.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const handler = canvasProcessHandlers[body.process];
      if (!handler) {
        world.emit({ process: "canvas.process.failed", actor: requestActor, claims: [], body: { process: body.process, reason: "unknown canvas process" } });
        sendJson(res, 400, { error: "unknown canvas process", process: body.process });
        return;
      }
      if (body.process === "canvas.perspective.create") {
        const contextId = typeof body.params?.context === "string" && body.params.context.trim() ? body.params.context.trim() : null;
        const gate = contextId ? ensureContextAuthority(requestActor, contextId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: body.params ?? {} });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: body.params ?? {} })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      if (body.process === "canvas.createThing") {
        const perspectiveId = typeof body.params?.perspective === "string" && body.params.perspective.trim() ? body.params.perspective.trim() : "";
        const contextId = perspectiveId ? perspectiveContextId(world, perspectiveId) : null;
        const gate = contextId ? ensureContextAuthority(requestActor, contextId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposalParams = contextId ? { ...(body.params ?? {}), context: contextId } : (body.params ?? {});
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: proposalParams });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: proposalParams })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      if ([
        "canvas.place",
        "canvas.move",
        "canvas.moveMany",
        "canvas.style",
        "canvas.remove",
        "canvas.removeMany",
        "canvas.duplicate",
        "canvas.camera",
        "canvas.grid",
        "canvas.batch"
      ].includes(body.process)) {
        const perspectiveId = typeof body.params?.perspective === "string" && body.params.perspective.trim() ? body.params.perspective.trim() : "";
        const contextId = perspectiveId ? perspectiveContextId(world, perspectiveId) : null;
        const gate = contextId ? ensureContextAuthority(requestActor, contextId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposalParams = contextId ? { ...(body.params ?? {}), context: contextId } : (body.params ?? {});
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: proposalParams });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: proposalParams })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      if (body.process === "canvas.thing.setTitle" || body.process === "canvas.relate" || body.process === "canvas.unrelate") {
        const targetId = body.process === "canvas.thing.setTitle"
          ? String(body.params?.thing || "").trim()
          : String(body.params?.from || "").trim();
        const gate = targetId ? ensureTargetAuthority(requestActor, targetId) : { ok: true };
        if (!gate.ok && gate.status === 403) {
          const proposal = createCanvasProposal({ actor: requestActor, process: body.process, params: body.params ?? {} });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: canvasProposalConfig({ process: body.process, params: body.params ?? {} })?.statusMessage || "Proposed change for review."
          });
          return;
        }
      }
      const witness = handler(world, { actor: requestActor, ...(body.params ?? {}) });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, Number.isInteger(witness.body?.status) ? witness.body.status : 400, { error: witness.body.reason ?? "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness });
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
