import { buildBootstrapAuthoredRequestPlanRequests } from "./bootstrap-authored-request-plan.js";
import { resolveBootstrapStarterPlanDynamicValues } from "./bootstrap-starter-plan-hosts.js";

export function buildBootstrapStarterPlan({
  bootstrapModel = null,
  bootstrapState = null,
  blueprint = null
} = {}) {
  const model = bootstrapModel || {};
  const authored = bootstrapState || {};
  const plan = blueprint && typeof blueprint === "object" ? blueprint : null;
  if (!plan) return { requests: [] };
  return {
    requests: buildBootstrapAuthoredRequestPlanRequests({
      plan,
      authoredState: authored,
      dynamicValues: resolveBootstrapStarterPlanDynamicValues({ bootstrapModel: model })
    })
  };
}
