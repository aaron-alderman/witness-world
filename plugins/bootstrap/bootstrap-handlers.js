import { renderBootstrapPage } from "./bootstrap-shell.js";
import { createBootstrapReadModels } from "./bootstrap-read-models.js";

export function createBootstrapBundleHandlers({
  world,
  runtimeProfile,
  runtimeBundleSummary,
  readJson,
  authoringServices,
  sendGateFailure,
  supportedPageHandlers,
  supportedHandlerSets,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedFrontendOps,
  supportedBackendOps,
  backendHosts,
  frontendHosts,
  send,
  sendJson,
  getRuntimePluginCatalog,
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const { requireBootstrapActor } = authoringServices;
  const { getBootstrapModel, getBootstrapState } = createBootstrapReadModels({
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

    "bootstrap.page": async ({ req, res, requestActor, appContext }) => {
      const bootstrapModel = await getBootstrapModel();
      send(res, 200, "text/html; charset=utf-8", renderBootstrapPage({
        requestUrl: req?.url || "/_bootstrap",
        bootstrapState: await getBootstrapState(requestActor, appContext),
        bootstrapModel
      }));
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
    }
  };
}
