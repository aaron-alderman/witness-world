import { handlerCatalog } from "./handler-catalog.js";
import {
  createPipelineRuntimeHandlers,
  pipelineSessionOpenResponsePayloadHook
} from "./handlers.js";
import { pipelineRvmForms } from "./desire-rvm.js";
import { createPipelineCatalogFromAppProject } from "./catalog-runtime.js";
import {
  createPipelineProofProgramFromDesire,
  evaluateInputTransformSubject,
  evaluateOutputTransformSubject,
  evaluatePipelineProof,
  evaluateSyncSubject,
  hasPipelineDeriveOperator,
  listPipelineDeriveOperatorIds,
  pipelineDeriveOperators
} from "./proof-runtime.js";
import {
  createPipelineExecutionPlanProgramFromDesire,
  evaluatePlannedInputTransform,
  evaluatePlannedOutputTransform,
  evaluatePlannedSync,
  planInputTransform,
  planOutputTransform,
  planPipelineSync
} from "./planner-runtime.js";
import { createBuiltinPipelineJobHandlers } from "./job-handlers.js";
import { pipelineModuleProjectors } from "./projections.js";

export const bundleId = "bundle-pipeline-runtime";

export { handlerCatalog };

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const providers = Object.freeze([
  Object.freeze({
    id: "pipeline.projections",
    kind: "moduleProjectors",
    projectors: pipelineModuleProjectors
  }),
  Object.freeze({
    id: "pipeline.jobs",
    kind: "jobHandlerFactory",
    factory: deps => createBuiltinPipelineJobHandlers(deps)
  }),
  Object.freeze({
    id: "sessionOpenResponsePayload",
    kind: "coreHook",
    hook: pipelineSessionOpenResponsePayloadHook
  })
]);
export const desireExtensions = Object.freeze({
  rvmForms: pipelineRvmForms
});

export {
  createPipelineCatalogFromAppProject,
  createPipelineExecutionPlanProgramFromDesire,
  createPipelineProofProgramFromDesire,
  evaluatePlannedInputTransform,
  evaluatePlannedOutputTransform,
  evaluatePlannedSync,
  evaluateInputTransformSubject,
  evaluateOutputTransformSubject,
  evaluatePipelineProof,
  evaluateSyncSubject,
  hasPipelineDeriveOperator,
  listPipelineDeriveOperatorIds,
  planInputTransform,
  planOutputTransform,
  planPipelineSync,
  pipelineDeriveOperators
};

export function createHandlers(deps) {
  return createPipelineRuntimeHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  desireExtensions,
  createHandlers,
  createPipelineCatalogFromAppProject,
  createPipelineExecutionPlanProgramFromDesire,
  createPipelineProofProgramFromDesire,
  evaluatePlannedInputTransform,
  evaluatePlannedOutputTransform,
  evaluatePlannedSync,
  evaluateInputTransformSubject,
  evaluateOutputTransformSubject,
  evaluatePipelineProof,
  evaluateSyncSubject,
  hasPipelineDeriveOperator,
  listPipelineDeriveOperatorIds,
  planInputTransform,
  planOutputTransform,
  planPipelineSync,
  pipelineDeriveOperators
};
