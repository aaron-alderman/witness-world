export function resolveBootstrapStarterPlanDynamicValues({
  bootstrapModel = null
} = {}) {
  const model = bootstrapModel || {};
  return {
    backendHost: model.backendHosts?.[0]?.id || "backendHost",
    frontendHost: model.frontendHosts?.[0]?.id || "frontendHost"
  };
}
