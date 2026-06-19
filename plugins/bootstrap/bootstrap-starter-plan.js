import { buildBootstrapAuthoredRequestPlanRequests } from "./bootstrap-authored-request-plan.js";
import { resolveBootstrapStarterPlanDynamicValues } from "./bootstrap-starter-plan-hosts.js";

function normalizeStarterRequestForRuntimeModel(request = {}, bootstrapModel = null) {
  const body = request?.body && typeof request.body === "object" ? request.body : null;
  if (!body || request.url !== "/api/server-runners" || !Object.hasOwn(body, "handlerSet")) return request;
  const supportedHandlerSets = Array.isArray(bootstrapModel?.supportedHandlerSets)
    ? bootstrapModel.supportedHandlerSets.map(value => String(value || "")).filter(Boolean)
    : null;
  if (!supportedHandlerSets || supportedHandlerSets.includes(String(body.handlerSet || ""))) return request;
  const { handlerSet, ...nextBody } = body;
  return {
    ...request,
    body: nextBody
  };
}

export function buildBootstrapStarterPlan({
  bootstrapModel = null,
  bootstrapState = null,
  blueprint = null
} = {}) {
  const model = bootstrapModel || {};
  const authored = bootstrapState || {};
  const plan = blueprint && typeof blueprint === "object" ? blueprint : null;
  if (!plan) return { requests: [] };
  const requests = buildBootstrapAuthoredRequestPlanRequests({
    plan,
    authoredState: authored,
    dynamicValues: resolveBootstrapStarterPlanDynamicValues({ bootstrapModel: model })
  }).map(request => normalizeStarterRequestForRuntimeModel(request, model));
  return { requests };
}
