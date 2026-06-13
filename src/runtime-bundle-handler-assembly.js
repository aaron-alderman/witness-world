import { composeRuntimeBundleHandlers } from "./runtime-bundle-handlers.js";
import { genericHandlerFactoriesForBundleIds } from "./runtime-bundles.js";

function handlerCatalogForBundle(bundle = null) {
  const provider = (bundle?.contributes?.providers ?? []).find(entry => entry?.kind === "handlerCatalog") ?? null;
  return {
    authorableHandlers: [...(provider?.authorableHandlers ?? [])].map(String),
    pageHandlers: [...(provider?.pageHandlers ?? [])].map(String),
    dispatchHandlers: [...(provider?.dispatchHandlers ?? [])].map(String),
    handlerMetadata: Object.fromEntries(
      Object.entries(provider?.handlerMetadata ?? {}).map(([handlerId, entry]) => [
        String(handlerId),
        {
          ...(entry || {}),
          methods: Array.isArray(entry?.methods) ? [...entry.methods] : undefined
        }
      ])
    )
  };
}

export function createRuntimeBundleHandlers({
  runtimeProfile,
  activeBundleIds = [],
  sessionStore,
  factoryDeps,
  reservedHandlerIds = ["__sessionStore"],
  bundleManifests = [],
  handlerFactories = null,
  composeHandlers = composeRuntimeBundleHandlers
}) {
  const effectiveHandlerFactories = handlerFactories ?? (
    bundleManifests.length
      ? bundleManifests.flatMap(bundle =>
          (bundle?.contributes?.providers ?? [])
            .filter(provider => provider?.kind === "genericHandlerFactory" && typeof provider.factory === "function")
            .map(provider => ({ bundleId: bundle.id, factory: provider.factory }))
        )
      : genericHandlerFactoriesForBundleIds(activeBundleIds)
  );
  let diagnostics = null;
  const bundleGenericHandlers = Object.assign(
    {},
    ...effectiveHandlerFactories.map(({ factory }) => factory({
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
    reservedHandlerIds,
    handlerCatalogsByBundleId: Object.fromEntries(
      bundleManifests
        .filter(bundle => bundle?.id)
        .map(bundle => [bundle.id, handlerCatalogForBundle(bundle)])
    )
  });
  diagnostics = composedHandlers.diagnostics;
  composedHandlers.handlers.__runtimeBundleHandlerDiagnostics = diagnostics;
  return composedHandlers.handlers;
}
