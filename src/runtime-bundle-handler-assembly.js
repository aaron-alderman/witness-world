import { composeRuntimeBundleHandlers } from "./runtime-bundle-handlers.js";
import { genericHandlerFactoriesForBundleIds } from "./runtime-bundles.js";

export function createRuntimeBundleHandlers({
  runtimeProfile,
  activeBundleIds = [],
  sessionStore,
  factoryDeps,
  reservedHandlerIds = ["__sessionStore"],
  handlerFactories = genericHandlerFactoriesForBundleIds(activeBundleIds),
  composeHandlers = composeRuntimeBundleHandlers
}) {
  let diagnostics = null;
  const bundleGenericHandlers = Object.assign(
    {},
    ...handlerFactories.map(({ factory }) => factory({
      ...factoryDeps,
      getRuntimeBundleHandlerDiagnostics: () => diagnostics
    }))
  );
  const availableHandlers = {
    __sessionStore: sessionStore,
    ...bundleGenericHandlers
  };
  const composedHandlers = composeHandlers({
    activeBundleIds,
    availableHandlers,
    reservedHandlerIds
  });
  diagnostics = composedHandlers.diagnostics;
  composedHandlers.handlers.__runtimeBundleHandlerDiagnostics = diagnostics;
  return composedHandlers.handlers;
}
