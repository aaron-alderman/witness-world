import {
  requestBootstrapIdentityDefine,
  requestBootstrapIdentityUpdate,
  requestBootstrapContextDefine,
  requestBootstrapPerspectiveDefine,
  requestBootstrapContextBindingCreate,
  requestBootstrapContextBindingRemove,
  requestBootstrapContextExportCreate,
  requestBootstrapContextExportRemove,
  requestBootstrapContextImportCreate,
  requestBootstrapContextImportRemove,
  requestBootstrapStewardshipGrant,
  requestBootstrapStewardshipRevoke,
  requestSurfaceDefine,
  requestProcessDefine,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestWidgetDefine,
  requestWidgetUpdate
} from "./authoring-core-processes.js";

export function createAuthoringCoreBundleHandlers({
  world,
  backendHost,
  runtimeBundleSummary,
  readJson,
  authoringServices,
  sendGateFailure,
  syncSessionIdentity,
  sessionResponseShape,
  supportedPageHandlers,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedFrontendOps,
  supportedBackendOps,
  backendHosts,
  frontendHosts,
  send,
  sendJson,
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const {
    requireBootstrapActor,
    ensureIdentityAuthority,
    ensureTargetAuthority,
    ensureContextAuthority
  } = authoringServices;
  return {
    "identity.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { identity: result.identity, witness: result.witness });
    },

    "identity.update": async ({ req, res, requestActor, requestSession, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const identityId = typeof params?.id === "string" ? params.id : "";
      const auth = ensureIdentityAuthority(gate.actor, identityId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapIdentityUpdate(world, {
        actor: gate.actor,
        backendHost,
        body: { ...body, id: identityId }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      const nextSession = syncSessionIdentity(requestSession, result.identity);
      sendJson(res, result.status, {
        identity: result.identity,
        witness: result.witness,
        ...(nextSession ? { session: sessionResponseShape(nextSession) } : {})
      });
    },

    "context.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.parent ? ensureTargetAuthority(gate.actor, body.parent) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { context: result.context, witness: result.witness });
    },

    "perspective.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapPerspectiveDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { perspective: result.perspective, witness: result.witness });
    },

    "contextBinding.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextBinding.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextBindingRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextBinding: result.contextBinding, witness: result.witness });
    },

    "contextExport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextExport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextExportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextExport: result.contextExport, witness: result.witness });
    },

    "contextImport.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "contextImport.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapContextImportRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { contextImport: result.contextImport, witness: result.witness });
    },

    "stewardship.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipGrant(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "stewardship.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.target);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapStewardshipRevoke(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { stewardship: result.stewardship, witness: result.witness });
    },

    "surface.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const docs = Array.isArray(body) ? body : [body];
      for (const doc of docs) {
        const context = doc && typeof doc === "object" ? (doc.context ?? null) : null;
        const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
        if (!auth.ok) {
          sendGateFailure(res, auth);
          return;
        }
      }
      const result = requestSurfaceDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witnesses: result.witnesses ?? [], witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, {
        ...(result.single ? { surface: result.surfaces[0], witness: result.witnesses[0] ?? null } : { surfaces: result.surfaces, witnesses: result.witnesses })
      });
    },

    "process.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const context = body && typeof body === "object" && !Array.isArray(body)
        ? (body.context ?? null)
        : null;
      const auth = context ? ensureContextAuthority(gate.actor, context) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestProcessDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness ?? null });
        return;
      }
      sendJson(res, result.status, { process: result.process, witness: result.witness });
    },

    "route.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.context ? ensureContextAuthority(gate.actor, body.context) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapRouteDefine(world, { actor: gate.actor, backendHost, body, allowedHandlers: supportedHandlers, handlerMetadataById: supportedHandlerMetadata });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { route: result.route, witness: result.witness });
    },

    "serve.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = body.serverRunner
        ? ensureTargetAuthority(gate.actor, body.serverRunner)
        : ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapServeDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { servedRoute: result.servedRoute, witness: result.witness });
    },

    "widgets.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureContextAuthority(gate.actor, body.context ?? null);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    },

    "widgets.update": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, params.id || "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestWidgetUpdate(world, { actor: gate.actor, backendHost, body: { ...body, id: params.id || "" } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { widget: result.widget, witness: result.witness });
    }
  };
}
