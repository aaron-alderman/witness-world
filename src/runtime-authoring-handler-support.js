import { runtimeBundleManifest } from "./runtime-bundles.js";
import { applyRuntimePluginLoadState, loadRuntimePluginModules } from "./runtime-plugin-loader.js";

function sortedStrings(values = []) {
  return [...new Set((values ?? []).map(value => String(value || "").trim()).filter(Boolean))].sort();
}

function cloneHandlerMetadataEntry(entry = {}) {
  return {
    ...(entry || {}),
    methods: Array.isArray(entry?.methods) ? [...entry.methods] : undefined,
    ownerChain: Array.isArray(entry?.ownerChain)
      ? entry.ownerChain.map(step => ({ ...(step || {}) }))
      : entry?.ownerChain
  };
}

function installableRuntimePluginPackages(pluginCatalog = null) {
  return (pluginCatalog?.packages ?? []).filter(pluginPackage =>
    pluginPackage?.validation?.ok === true
    && pluginPackage?.compatibility?.compatible === true
    && pluginPackage?.execution?.executable === true
  );
}

function authoringInspectionCatalog(pluginCatalog = null) {
  if (!pluginCatalog) return null;
  const installableIds = new Set(
    installableRuntimePluginPackages(pluginCatalog).map(pluginPackage => String(pluginPackage.id || ""))
  );
  return {
    ...pluginCatalog,
    packages: (pluginCatalog.packages ?? []).map(pluginPackage => {
      if (!installableIds.has(String(pluginPackage?.id || ""))) return pluginPackage;
      return {
        ...pluginPackage,
        activation: {
          ...(pluginPackage?.activation ?? {}),
          active: true
        }
      };
    })
  };
}

export function mergeAuthoringHandlerSupport({
  supportedHandlerSets = [],
  supportedHandlers = [],
  supportedPageHandlers = [],
  supportedHandlerMetadata = {},
  pluginCatalog = null
} = {}) {
  const mergedHandlerSets = new Set(sortedStrings(supportedHandlerSets));
  const mergedHandlers = new Set(sortedStrings(supportedHandlers));
  const mergedPageHandlers = new Set(sortedStrings(supportedPageHandlers));
  const mergedHandlerMetadata = Object.fromEntries(
    Object.entries(supportedHandlerMetadata ?? {}).map(([handlerId, entry]) => [
      String(handlerId),
      cloneHandlerMetadataEntry(entry)
    ])
  );

  for (const pluginPackage of installableRuntimePluginPackages(pluginCatalog)) {
    for (const bundle of pluginPackage?.resolvedBundles ?? []) {
      const manifest = runtimeBundleManifest(bundle?.id);
      const handlerCatalog = manifest?.handlerCatalog ?? null;
      for (const handlerId of handlerCatalog?.authorableHandlers ?? []) mergedHandlers.add(String(handlerId));
      for (const handlerId of handlerCatalog?.pageHandlers ?? []) mergedPageHandlers.add(String(handlerId));
      for (const [handlerId, entry] of Object.entries(handlerCatalog?.handlerMetadata ?? {})) {
        mergedHandlerMetadata[String(handlerId)] = cloneHandlerMetadataEntry(entry);
      }
    }
    for (const handlerSetId of pluginPackage?.resolvedRuntimeContributions?.handlerSets ?? []) {
      mergedHandlerSets.add(String(handlerSetId));
    }
    for (const [handlerId, entry] of Object.entries(pluginPackage?.resolvedRuntimeContributions?.handlerMetadata ?? {})) {
      mergedHandlers.add(String(handlerId));
      if (entry?.routeKind === "page" || entry?.responseKind === "page") {
        mergedPageHandlers.add(String(handlerId));
      }
      if (!mergedHandlerMetadata[String(handlerId)]) {
        mergedHandlerMetadata[String(handlerId)] = cloneHandlerMetadataEntry(entry);
      }
    }
  }

  return {
    supportedHandlerSets: [...mergedHandlerSets].sort(),
    supportedHandlers: [...mergedHandlers].sort(),
    supportedPageHandlers: [...mergedPageHandlers].sort(),
    supportedHandlerMetadata: Object.fromEntries(
      Object.entries(mergedHandlerMetadata).sort(([left], [right]) => left.localeCompare(right))
    )
  };
}

export async function resolveAuthoringHandlerSupport({
  supportedHandlerSets = [],
  supportedHandlers = [],
  supportedPageHandlers = [],
  supportedHandlerMetadata = {},
  pluginCatalog = null,
  loadRuntimePluginModulesImpl = loadRuntimePluginModules,
  applyRuntimePluginLoadStateImpl = applyRuntimePluginLoadState
} = {}) {
  if (!pluginCatalog) {
    return mergeAuthoringHandlerSupport({
      supportedHandlerSets,
      supportedHandlers,
      supportedPageHandlers,
      supportedHandlerMetadata,
      pluginCatalog: null
    });
  }
  const inspectionCatalog = authoringInspectionCatalog(pluginCatalog);
  const loadResult = await loadRuntimePluginModulesImpl({ pluginCatalog: inspectionCatalog });
  const enrichedCatalog = applyRuntimePluginLoadStateImpl(inspectionCatalog, loadResult);
  return mergeAuthoringHandlerSupport({
    supportedHandlerSets,
    supportedHandlers,
    supportedPageHandlers,
    supportedHandlerMetadata,
    pluginCatalog: enrichedCatalog
  });
}
