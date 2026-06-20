import {
  requestBoundaryDefine,
  requestBootstrapContextDefine,
  requestBootstrapContextBindingCreate,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine,
  requestCollectionDefine,
  requestMessageDefine,
  requestPolicyDefine,
  requestProcessDefine,
  requestProjectionDefine,
  requestSurfaceDefine,
  requestTypeDefine,
  requestWidgetDefine
} from "../authoring-core/authoring-core-processes.js";
import {
  requestBootstrapFrontendProgramDefine,
  requestBootstrapFrontendStepDefine,
  requestBootstrapBackendProgramDefine,
  requestBootstrapBackendProgramVersionDefine,
  requestBootstrapBackendStepDefine,
  requestBootstrapBackendProgramVersionActivate
} from "../program-authoring/program-processes.js";
import {
  requestBootstrapRuntimePluginInstall,
  requestBootstrapServerRunnerDefine
} from "../server-runner-authoring/server-runner-processes.js";
import { todoStarterBlueprint } from "./starter-blueprints.js";
import { projectors } from "../../src/kernel.js";

function requiredOk(result, label) {
  if (result?.ok) return result;
  throw new Error(result?.error || `${label} failed`);
}

function thingExists(world, id) {
  return Boolean(id) && world.project(projectors.things).has(id);
}

export function applyTodoStarter(world, {
  actor,
  backendHost,
  blueprint = todoStarterBlueprint(),
  allowedHandlerSets = [],
  pluginCatalog = null
} = {}) {
  const rows = blueprint && typeof blueprint === "object" ? blueprint : todoStarterBlueprint();
  const supportedHandlerSets = new Set((allowedHandlerSets || []).map(String).filter(Boolean));
  const runnerBody = rows.runner && typeof rows.runner === "object"
    ? { ...rows.runner }
    : null;
  if (runnerBody?.handlerSet && supportedHandlerSets.size && !supportedHandlerSets.has(String(runnerBody.handlerSet))) {
    delete runnerBody.handlerSet;
  } else if (runnerBody?.handlerSet && supportedHandlerSets.size === 0) {
    delete runnerBody.handlerSet;
  }

  for (const context of rows.contexts || []) {
    requiredOk(requestBootstrapContextDefine(world, {
      actor,
      backendHost,
      body: context
    }), `context ${context?.id || "unknown"}`);
  }

  if (runnerBody) {
    if (!thingExists(world, runnerBody.id)) {
      requiredOk(requestBootstrapServerRunnerDefine(world, {
        actor,
        backendHost,
        body: runnerBody,
        allowedHandlerSets
      }), `server runner ${runnerBody.id || "unknown"}`);
    }
  }

  for (const install of rows.runtimePluginInstalls || []) {
    requiredOk(requestBootstrapRuntimePluginInstall(world, {
      actor,
      backendHost,
      body: install,
      pluginCatalog
    }), `runtime plugin install ${install?.plugin || "unknown"}`);
  }

  for (const widget of rows.operatingWidgets || []) {
    requiredOk(requestWidgetDefine(world, {
      actor,
      backendHost,
      body: widget
    }), `widget ${widget?.id || "unknown"}`);
  }

  for (const program of rows.operatingPrograms || []) {
    requiredOk(requestBootstrapFrontendProgramDefine(world, {
      actor,
      backendHost,
      body: program
    }), `frontend program ${program?.id || "unknown"}`);
  }

  for (const backendProgram of rows.backendPrograms || []) {
    requiredOk(requestBootstrapBackendProgramDefine(world, {
      actor,
      backendHost,
      body: backendProgram
    }), `backend program ${backendProgram?.soul || "unknown"}`);
  }

  for (const version of rows.backendProgramVersions || []) {
    requiredOk(requestBootstrapBackendProgramVersionDefine(world, {
      actor,
      backendHost,
      body: version
    }), `backend program version ${version?.version || "unknown"}`);
  }

  for (const step of rows.backendSteps || []) {
    requiredOk(requestBootstrapBackendStepDefine(world, {
      actor,
      backendHost,
      body: step
    }), `backend step ${step?.version || "unknown"}`);
  }

  for (const activation of rows.backendActivations || []) {
    requiredOk(requestBootstrapBackendProgramVersionActivate(world, {
      actor,
      backendHost,
      body: activation
    }), `backend activation ${activation?.version || "unknown"}`);
  }

  for (const type of rows.types || []) {
    requiredOk(requestTypeDefine(world, {
      actor,
      backendHost,
      body: type
    }), `type ${type?.id || "unknown"}`);
  }

  for (const collection of rows.collections || []) {
    requiredOk(requestCollectionDefine(world, {
      actor,
      backendHost,
      body: collection
    }), `collection ${collection?.id || "unknown"}`);
  }

  for (const message of rows.messages || []) {
    requiredOk(requestMessageDefine(world, {
      actor,
      backendHost,
      body: message
    }), `message ${message?.id || "unknown"}`);
  }

  for (const projection of rows.projections || []) {
    requiredOk(requestProjectionDefine(world, {
      actor,
      backendHost,
      body: projection
    }), `projection ${projection?.id || "unknown"}`);
  }

  for (const process of rows.processes || []) {
    requiredOk(requestProcessDefine(world, {
      actor,
      backendHost,
      body: process
    }), `process ${process?.id || "unknown"}`);
  }

  for (const boundary of rows.boundaries || []) {
    requiredOk(requestBoundaryDefine(world, {
      actor,
      backendHost,
      body: boundary
    }), `boundary ${boundary?.id || "unknown"}`);
  }

  for (const policy of rows.policies || []) {
    requiredOk(requestPolicyDefine(world, {
      actor,
      backendHost,
      body: policy
    }), `policy ${policy?.id || "unknown"}`);
  }

  if ((rows.surfaces || []).length) {
    requiredOk(requestSurfaceDefine(world, {
      actor,
      backendHost,
      body: rows.surfaces
    }), "starter native surfaces");
  }

  for (const binding of rows.contextBindings || []) {
    requiredOk(requestBootstrapContextBindingCreate(world, {
      actor,
      backendHost,
      body: binding
    }), `context binding ${binding?.context || "unknown"}:${binding?.name || "unknown"}`);
  }

  for (const step of rows.operatingSteps || []) {
    requiredOk(requestBootstrapFrontendStepDefine(world, {
      actor,
      backendHost,
      body: step,
      allowedOps: []
    }), `frontend step ${step?.program || "unknown"}`);
  }

  for (const route of rows.routes || []) {
    requiredOk(requestBootstrapRouteDefine(world, {
      actor,
      backendHost,
      body: route
    }), `route ${route?.id || "unknown"}`);
  }

  for (const route of rows.operatingRoutes || []) {
    requiredOk(requestBootstrapRouteDefine(world, {
      actor,
      backendHost,
      body: route
    }), `operating route ${route?.id || "unknown"}`);
  }

  for (const serve of rows.serves || []) {
    requiredOk(requestBootstrapServeDefine(world, {
      actor,
      backendHost,
      body: serve
    }), `serve ${serve?.route || "unknown"}`);
  }

  return { ok: true, status: "created" };
}

export function createStarterBundleHandlers({
  world,
  backendHost,
  authoringServices,
  supportedHandlerSets = [],
  getRuntimePluginCatalog = async () => ({ packages: [] }),
  sendGateFailure,
  sendJson
}) {
  const { requireBootstrapActor } = authoringServices;
  return {
    "starter.todo.apply": async ({ res, requestActor }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      try {
        const pluginCatalog = await getRuntimePluginCatalog({ includeMetadataOnly: false });
        applyTodoStarter(world, {
          actor: gate.actor,
          backendHost,
          allowedHandlerSets: supportedHandlerSets,
          pluginCatalog
        });
        sendJson(res, 200, {
          ok: true,
          status: "created"
        });
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  };
}
