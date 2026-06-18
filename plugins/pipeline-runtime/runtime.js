import { handlerCatalog } from "./handler-catalog.js";
import {
  createPipelineRuntimeHandlers,
  pipelineSessionOpenResponsePayloadHook
} from "./handlers.js";
import { pipelineRvmForms } from "./desire-rvm.js";
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

export const bundleId = "bundle-pipeline-runtime";

export { handlerCatalog };

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const providers = Object.freeze([
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
  createPipelineProofProgramFromDesire,
  evaluateInputTransformSubject,
  evaluateOutputTransformSubject,
  evaluatePipelineProof,
  evaluateSyncSubject,
  hasPipelineDeriveOperator,
  listPipelineDeriveOperatorIds,
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
  createPipelineProofProgramFromDesire,
  evaluateInputTransformSubject,
  evaluateOutputTransformSubject,
  evaluatePipelineProof,
  evaluateSyncSubject,
  hasPipelineDeriveOperator,
  listPipelineDeriveOperatorIds,
  pipelineDeriveOperators
};
