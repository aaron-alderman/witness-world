import { renderBootstrapPage } from "./bootstrap-shell.js";
import { createBootstrapReadModels } from "./bootstrap-read-models.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";
import {
  requestBootstrapAppBoundaryEstablish,
  resolveBootstrapAppBoundaryAuthorityScope
} from "./bootstrap-app-boundary.js";

function proposalPart(value, fallback) {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return normalized || fallback;
}

export function createBootstrapBundleHandlers({
  world,
  backendHost,
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
  backendHosts = [],
  frontendHosts = [],
  send,
  sendJson,
  getRuntimePluginCatalog,
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const {
    requireBootstrapActor,
    ensureTargetAuthority,
    ensureContextAuthority
  } = authoringServices;
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
  const bootstrapBackendHost = backendHost || backendHosts?.[0] || "backendHost";
  const nextBootstrapBoundaryProposalId = actor => [
    "proposal",
    "bootstrap.appBoundary.establish",
    proposalPart(actor, "actor"),
    "root"
  ].join(".");
  return {
    "bootstrap.model.read": async ({ res, appContext }) => {
      sendJson(res, 200, await getBootstrapModel(appContext));
    },

    "bootstrap.state.read": async ({ res, requestActor, appContext }) => {
      sendJson(res, 200, await getBootstrapState(requestActor, appContext));
    },

    "bootstrap.appBoundary.establish": async ({ req, res, requestActor, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        await readJson(req);
      } catch {
        // This action does not currently require a request body.
      }
      const bootstrapModel = await getBootstrapModel(appContext);
      const boundaryBefore = (await getBootstrapState(gate.actor, appContext)).appBoundary;
      if (boundaryBefore?.status === "blocked") {
        sendJson(res, 409, {
          error: "bootstrap app boundary is blocked",
          boundary: boundaryBefore,
          created: [],
          skipped: [],
          status: "blocked",
          compositionBefore: boundaryBefore.composition,
          compositionAfter: boundaryBefore.composition
        });
        return;
      }
      const authorityScope = resolveBootstrapAppBoundaryAuthorityScope(world);
      const auth = authorityScope.targetKind === "serverRunner" && authorityScope.targetId
        ? ensureTargetAuthority(gate.actor, authorityScope.targetId)
        : (authorityScope.targetKind === "context" && authorityScope.targetId
          ? ensureContextAuthority(gate.actor, authorityScope.targetId)
          : { ok: true });
      if (!auth.ok) {
        if (auth.status === 403) {
          const proposal = requestBootstrapProposalCreate(world, {
            actor: gate.actor,
            backendHost: bootstrapBackendHost,
            body: {
              id: nextBootstrapBoundaryProposalId(gate.actor),
              targetProcess: "bootstrap.appBoundary.establish",
              targetKind: authorityScope.targetKind,
              targetId: authorityScope.targetId,
              bodyJson: JSON.stringify({}),
              reason: "Establish the canonical authored app boundary through witnessed proposal"
            }
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            boundary: boundaryBefore,
            statusMessage: "Proposed authored app-boundary establishment for review."
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = await requestBootstrapAppBoundaryEstablish(world, {
        actor: gate.actor,
        backendHost: bootstrapBackendHost,
        supportedHandlerSets,
        supportedHandlers,
        supportedHandlerMetadata,
        bootstrapModel,
        runtimeBundleSummary,
        runtimeProfile: appContext?.runtimeProfile ?? runtimeProfile,
        getRuntimePluginCatalog,
        appContext
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, {
          error: result.error,
          boundary: result.boundary,
          created: result.created,
          skipped: result.skipped,
          status: result.boundary?.status ?? "blocked",
          compositionBefore: result.compositionBefore,
          compositionAfter: result.compositionAfter
        });
        return;
      }
      sendJson(res, 200, {
        boundary: result.boundary,
        created: result.created,
        skipped: result.skipped,
        status: result.resultStatus,
        compositionBefore: result.compositionBefore,
        compositionAfter: result.compositionAfter,
        statusMessage: "Authored app boundary established. / now serves the canonical page.surface boundary."
      });
    },

    "bootstrap.page": async ({ req, res, requestActor, appContext }) => {
      const bootstrapModel = await getBootstrapModel(appContext);
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
