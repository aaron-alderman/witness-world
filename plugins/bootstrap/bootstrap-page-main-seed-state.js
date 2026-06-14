import { buildBootstrapIdentityView } from "./bootstrap-identity-view-state.js";
import { buildBootstrapStarterPlan } from "./bootstrap-starter-plan.js";

export function buildBootstrapPageMainSeedState({
  bootstrapState = null,
  bootstrapModel = null,
  requestUrl = "/_bootstrap"
} = {}) {
  return {
    bootstrapIdentityView: buildBootstrapIdentityView({ bootstrapState, requestUrl }),
    bootstrapStarterPlan: buildBootstrapStarterPlan({
      bootstrapModel,
      bootstrapState,
      blueprint: bootstrapState?.activeStarterBlueprint?.blueprint ?? null
    })
  };
}
