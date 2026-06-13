import { renderBootstrapPage } from "../../src/bootstrap-shell.js";
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
  requestBootstrapProposalCreate,
  requestBootstrapProposalApprove,
  requestBootstrapProposalReject,
  requestBootstrapServerRunnerDefine,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  requestBootstrapCapabilityRemove,
  requestBootstrapRuntimePluginInstall,
  requestBootstrapRuntimePluginRemove,
  requestBootstrapMcpServerDefine,
  requestBootstrapMcpToolInstall,
  requestBootstrapMcpToolRemove,
  requestBootstrapFrontendProgramDefine,
  requestBootstrapFrontendStepDefine,
  requestBootstrapBackendProgramDefine,
  requestBootstrapBackendProgramVersionDefine,
  requestBootstrapBackendStepDefine,
  requestBootstrapBackendProgramVersionActivate,
  requestBootstrapBackendProgramVersionRollback,
  requestWidgetDefine,
  requestWidgetUpdate
} from "../../src/bootstrap-authoring.js";
import { createAuthoringBootstrapReadModels } from "./bootstrap-read-models.js";

export function createAuthoringBundleHandlers({
  world,
  backendHost,
  runtimeProfile,
  runtimeBundleSummary,
  readJson,
  authoringServices,
  sendGateFailure,
  syncSessionIdentity,
  sessionResponseShape,
  supportedPageHandlers,
  supportedHandlerSets,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedFrontendOps,
  supportedBackendOps,
  backendHosts,
  frontendHosts,
  mcpToolNames,
  send,
  sendJson,
  getRuntimePluginCatalog,
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const {
    requireBootstrapActor,
    ensureIdentityAuthority,
    ensureTargetAuthority,
    ensureContextAuthority,
    executeBootstrapProposal
  } = authoringServices;
  const { getBootstrapModel, getBootstrapState } = createAuthoringBootstrapReadModels({
    world,
    runtimeProfile,
    runtimeBundleSummary,
    supportedHandlers,
    supportedHandlerMetadata,
    supportedPageHandlers,
    supportedHandlerSets,
    supportedFrontendOps,
    supportedBackendOps,
    backendHosts,
    frontendHosts,
    getRuntimePluginCatalog,
    buildPluginCapabilitySourceIndex,
    getRuntimeOperatorState
  });
  const sendOperatorError = (res, error) => {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    sendJson(res, status, {
      error: error instanceof Error ? error.message : String(error),
      ...(error?.details ? { details: error.details } : {}),
      ...(error?.summary ? { artifact: error.summary } : {})
    });
  };
  return {
    "bootstrap.model.read": async ({ res }) => {
      sendJson(res, 200, await getBootstrapModel());
    },

    "bootstrap.state.read": async ({ res, requestActor, appContext }) => {
      sendJson(res, 200, await getBootstrapState(requestActor, appContext));
    },

    "bootstrap.page": async ({ res }) => {
      send(res, 200, "text/html; charset=utf-8", renderBootstrapPage());
    },

    "operator.state.read": async ({ res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      sendJson(res, 200, await getRuntimeOperatorState(appContext));
    },

    "operator.backup": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const artifact = await appContext?.runtimeOperatorService?.backup?.({
          label: body?.label ?? "",
          includeDerived: body?.includeDerived === true,
          actor: gate.actor
        });
        sendJson(res, 201, { artifact, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

    "operator.export": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const artifact = await appContext?.runtimeOperatorService?.exportWorld?.({
          label: body?.label ?? "",
          actor: gate.actor
        });
        sendJson(res, 201, { artifact, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

    "operator.restore": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const result = await appContext?.runtimeOperatorService?.restore?.({
          artifactId: body?.artifactId ?? "",
          preserveCurrent: body?.preserveCurrent === true,
          actor: gate.actor
        });
        sendJson(res, 200, { ...result, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

    "operator.import": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const body = await readJson(req);
        const result = await appContext?.runtimeOperatorService?.importWorld?.({
          artifactId: body?.artifactId ?? "",
          preserveCurrent: body?.preserveCurrent === true,
          actor: gate.actor
        });
        sendJson(res, 200, { ...result, operator: await getRuntimeOperatorState(appContext) });
      } catch (error) {
        sendOperatorError(res, error);
      }
    },

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

    "proposal.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapProposalCreate(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.approve": async ({ res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        executeTarget: executeBootstrapProposal(gate.actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "proposal.reject": async ({ req, res, params, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapProposalReject(world, {
        actor: gate.actor,
        backendHost,
        proposalId: params.id || "",
        reason: typeof body.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "capability.create": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapCapabilityDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capability: result.capability, witness: result.witness });
    },

    "capability.install": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapCapabilityInstall(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    },

    "capability.remove": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapCapabilityRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { capabilityInstall: result.capabilityInstall, witness: result.witness });
    },

    "runtimePlugin.install": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.serverRunner);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const pluginCatalog = await getRuntimePluginCatalog({
        activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        serverRunnerId: body.serverRunner ?? null
      });
      const result = requestBootstrapRuntimePluginInstall(world, {
        actor: gate.actor,
        backendHost,
        body,
        pluginCatalog
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { runtimePluginInstall: result.runtimePluginInstall, witness: result.witness });
    },

    "runtimePlugin.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.serverRunner);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapRuntimePluginRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { runtimePluginInstall: result.runtimePluginInstall, witness: result.witness });
    },

    "serverRunner.create": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapServerRunnerDefine(world, { actor: gate.actor, backendHost, body, allowedHandlerSets: supportedHandlerSets });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { serverRunner: result.serverRunner, witness: result.witness });
    },

    "mcpServer.create": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapMcpServerDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpServer: result.mcpServer, witness: result.witness });
    },

    "mcpTool.install": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.server);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolInstall(world, { actor: gate.actor, backendHost, body, allowedTools: mcpToolNames() });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
    },

    "mcpTool.remove": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.server);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapMcpToolRemove(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { mcpToolInstall: result.mcpToolInstall, witness: result.witness });
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
    },

    "frontendProgram.create": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapFrontendProgramDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { frontendProgram: result.frontendProgram, witness: result.witness });
    },

    "frontendStep.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.program ?? "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapFrontendStepDefine(world, { actor: gate.actor, backendHost, body, allowedOps: supportedFrontendOps });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { frontendStep: result.frontendStep, witness: result.witness });
    },

    "backendProgram.create": async ({ req, res, requestActor }) => {
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
      const result = requestBootstrapBackendProgramDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgram: result.backendProgram, witness: result.witness });
    },

    "backendProgramVersion.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.program ?? "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendProgramVersionDefine(world, { actor: gate.actor, backendHost, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
    },

    "backendStep.create": async ({ req, res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const auth = ensureTargetAuthority(gate.actor, body.version ?? "");
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const result = requestBootstrapBackendStepDefine(world, { actor: gate.actor, backendHost, body, allowedOps: supportedBackendOps });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendStep: result.backendStep, witness: result.witness });
    },

    "backendProgramVersions.activate": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const soul = typeof params?.soul === "string" ? params.soul : "";
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestBootstrapBackendProgramVersionActivate(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
    },

    "backendProgramVersions.rollback": async ({ req, res, requestActor, params }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const soul = typeof params?.soul === "string" ? params.soul : "";
      const auth = ensureTargetAuthority(gate.actor, soul);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapBackendProgramVersionRollback(world, { actor: gate.actor, backendHost, body: { ...body, soul } });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { backendProgramVersion: result.backendProgramVersion, witness: result.witness });
    }
  };
}
