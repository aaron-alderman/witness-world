import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

function cloneHandlerMetadataEntry(entry = {}) {
  return {
    ...(entry || {}),
    methods: Array.isArray(entry?.methods) ? [...entry.methods] : undefined
  };
}

function cloneHandlerCatalog(catalog = {}) {
  return {
    authorableHandlers: [...(catalog.authorableHandlers ?? [])].map(String),
    pageHandlers: [...(catalog.pageHandlers ?? [])].map(String),
    dispatchHandlers: [...(catalog.dispatchHandlers ?? [])].map(String),
    handlerMetadata: Object.fromEntries(
      Object.entries(catalog.handlerMetadata ?? {}).map(([handlerId, entry]) => [
        String(handlerId),
        cloneHandlerMetadataEntry(entry)
      ])
    )
  };
}

function cloneRoute(route = {}) {
  return {
    ...route,
    method: String(route.method || "GET").toUpperCase(),
    handler: String(route.handler || ""),
    paramNames: Array.isArray(route.paramNames) ? [...route.paramNames].map(String) : undefined,
    params: route.params && typeof route.params === "object" ? { ...route.params } : undefined
  };
}

function cloneSurface(surface = {}) {
  return {
    ...surface,
    id: String(surface.id || ""),
    title: String(surface.title || ""),
    href: surface.href ?? null,
    action: surface.action ? { ...surface.action } : null,
    contexts: Array.isArray(surface.contexts) ? [...surface.contexts] : undefined
  };
}

function cloneCapability(capability = "") {
  if (capability && typeof capability === "object" && !Array.isArray(capability)) {
    return { ...capability, id: String(capability.id || "").trim() };
  }
  return String(capability || "").trim();
}

function cloneAdditionalProvider(provider = {}) {
  return {
    ...(provider || {}),
    definition: provider?.definition && typeof provider.definition === "object"
      ? {
          ...provider.definition,
          handlers: Array.isArray(provider.definition.handlers) ? [...provider.definition.handlers] : provider.definition.handlers,
          jobHandlers: Array.isArray(provider.definition.jobHandlers) ? [...provider.definition.jobHandlers] : provider.definition.jobHandlers
        }
      : provider?.definition
  };
}

function validateRuntimeBundleDefinition(bundleId, definition, errors) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    errors.push(`runtime bundle ${bundleId} must be an object`);
    return null;
  }
  if (typeof definition.createHandlers !== "function") {
    errors.push(`runtime bundle ${bundleId} must export createHandlers(deps)`);
  }
  if (typeof definition.handlerCatalog !== "object" || Array.isArray(definition.handlerCatalog)) {
    errors.push(`runtime bundle ${bundleId} must export handlerCatalog`);
  }
  if (!Array.isArray(definition.routes)) errors.push(`runtime bundle ${bundleId} must export routes`);
  if (!Array.isArray(definition.surfaces)) errors.push(`runtime bundle ${bundleId} must export surfaces`);
  if (errors.length) return null;
  return {
    bundleId,
    capabilities: Array.isArray(definition.capabilities)
      ? definition.capabilities.map(cloneCapability).filter(capability =>
          typeof capability === "string" ? capability : capability?.id
        )
      : [],
    handlerCatalog: cloneHandlerCatalog(definition.handlerCatalog),
    routes: definition.routes.map(cloneRoute),
    surfaces: definition.surfaces.map(cloneSurface),
    createHandlers: definition.createHandlers,
    providers: Array.isArray(definition.providers) ? definition.providers.map(cloneAdditionalProvider) : []
  };
}

function normalizeLegacyRuntimeModule(loaded) {
  const bundleId = typeof loaded?.bundleId === "string" && loaded.bundleId.trim()
    ? loaded.bundleId.trim()
    : null;
  if (!bundleId) return null;
  return {
    [bundleId]: {
      capabilities: loaded.capabilities,
      handlerCatalog: loaded.handlerCatalog,
      routes: loaded.routes,
      surfaces: loaded.surfaces,
      createHandlers: loaded.createHandlers,
      providers: loaded.providers
    }
  };
}

function validatePluginRuntimeModule(pluginPackage, loaded) {
  const errors = [];
  const activatesBundles = pluginPackage.metadata?.activatesBundles ?? [];
  const rawBundles = loaded?.bundles && typeof loaded.bundles === "object" && !Array.isArray(loaded.bundles)
    ? loaded.bundles
    : normalizeLegacyRuntimeModule(loaded);
  if (!rawBundles || !Object.keys(rawBundles).length) {
    return {
      ok: false,
      errors: ["runtime module must export bundles or legacy bundleId/handlerCatalog/routes/surfaces/createHandlers"]
    };
  }
  const bundleDefinitions = [];
  for (const [rawBundleId, definition] of Object.entries(rawBundles)) {
    const bundleId = String(rawBundleId || "").trim();
    if (!bundleId) {
      errors.push("runtime module bundle ids must be non-empty strings");
      continue;
    }
    if (!activatesBundles.includes(bundleId)) {
      errors.push(`runtime module bundle must match activatesBundles: ${bundleId}`);
      continue;
    }
    const bundleErrors = [];
    const normalized = validateRuntimeBundleDefinition(bundleId, definition, bundleErrors);
    if (bundleErrors.length) {
      errors.push(...bundleErrors);
      continue;
    }
    bundleDefinitions.push(normalized);
  }
  if (errors.length) return { ok: false, errors };
  if (!bundleDefinitions.length) {
    return { ok: false, errors: ["runtime module did not provide any valid bundles"] };
  }
  return {
    ok: true,
    bundleDefinitions
  };
}

export async function loadRuntimePluginModules({
  pluginCatalog,
  importModule = specifier => import(specifier)
} = {}) {
  const bundleOverrides = Object.create(null);
  const pluginStates = Object.create(null);
  const failures = [];
  const claimedBundles = Object.create(null);

  for (const pluginPackage of pluginCatalog?.packages ?? []) {
    const baseState = {
      entry: pluginPackage.runtimeModule?.entry ?? pluginPackage.metadata?.runtime?.entry ?? null,
      resolvedPath: pluginPackage.runtimeModule?.resolvedPath ?? pluginPackage.metadata?.runtime?.resolvedEntryPath ?? null,
      loadStatus: pluginPackage.execution?.mode === "plugin-owned" ? "not-loaded" : "not-applicable",
      bundleIds: [],
      bundleId: null,
      errors: []
    };
    if (pluginPackage.execution?.mode !== "plugin-owned" || pluginPackage.activation?.active !== true) {
      pluginStates[pluginPackage.id] = baseState;
      continue;
    }
    try {
      const stat = await fs.stat(baseState.resolvedPath);
      const specifier = `${pathToFileURL(baseState.resolvedPath).href}?mtime=${encodeURIComponent(String(stat.mtimeMs))}`;
      const imported = await importModule(specifier);
      const loaded = imported?.default && typeof imported.default === "object"
        ? { ...imported.default, ...imported }
        : imported;
      const validated = validatePluginRuntimeModule(pluginPackage, loaded);
      if (!validated.ok) {
        pluginStates[pluginPackage.id] = {
          ...baseState,
          loadStatus: "failed",
          errors: [...validated.errors]
        };
        failures.push({
          id: pluginPackage.id,
          reasons: validated.errors.map(error => `runtime module invalid: ${error}`),
          requestedSources: [...(pluginPackage.activation?.requestedSources ?? [])]
        });
        continue;
      }
      const duplicateBundleClaims = [];
      for (const bundleDefinition of validated.bundleDefinitions) {
        const claimedBy = claimedBundles[bundleDefinition.bundleId];
        if (claimedBy && claimedBy !== pluginPackage.id) {
          duplicateBundleClaims.push(`runtime bundle already claimed by ${claimedBy}: ${bundleDefinition.bundleId}`);
        }
      }
      if (duplicateBundleClaims.length) {
        pluginStates[pluginPackage.id] = {
          ...baseState,
          loadStatus: "failed",
          errors: [...duplicateBundleClaims]
        };
        failures.push({
          id: pluginPackage.id,
          reasons: duplicateBundleClaims.map(error => `runtime module invalid: ${error}`),
          requestedSources: [...(pluginPackage.activation?.requestedSources ?? [])]
        });
        continue;
      }
      for (const bundleDefinition of validated.bundleDefinitions) {
        claimedBundles[bundleDefinition.bundleId] = pluginPackage.id;
        const manifestCapabilities = (pluginPackage.manifest?.contributes?.capabilities ?? [])
          .map(entry => typeof entry === "string" ? entry : entry?.id)
          .map(id => String(id || "").trim())
          .filter(Boolean);
        const capabilityIds = bundleDefinition.capabilities.length
          ? bundleDefinition.capabilities
          : manifestCapabilities;
        const capabilityProviders = capabilityIds.length
          ? [{
              kind: "defaultHostCapabilities",
              hostKind: "backend",
              capabilities: capabilityIds
            }]
          : [];
        bundleOverrides[bundleDefinition.bundleId] = {
          id: bundleDefinition.bundleId,
          contributes: {
            providers: [
              ...capabilityProviders,
              {
                kind: "handlerCatalog",
                ...bundleDefinition.handlerCatalog
              },
            {
              kind: "genericHandlerFactory",
              factory: bundleDefinition.createHandlers
            },
            ...bundleDefinition.providers
          ],
            capabilities: capabilityIds,
            routes: bundleDefinition.routes,
            surfaces: bundleDefinition.surfaces
          }
        };
      }
      const bundleIds = validated.bundleDefinitions.map(definition => definition.bundleId);
      pluginStates[pluginPackage.id] = {
        ...baseState,
        loadStatus: "loaded",
        bundleIds,
        bundleId: bundleIds.length === 1 ? bundleIds[0] : null,
        errors: []
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pluginStates[pluginPackage.id] = {
        ...baseState,
        loadStatus: "failed",
        errors: [message]
      };
      failures.push({
        id: pluginPackage.id,
        reasons: [`runtime module load failed: ${message}`],
        requestedSources: [...(pluginPackage.activation?.requestedSources ?? [])]
      });
    }
  }

  return {
    bundleOverrides,
    pluginStates,
    failures,
    hasBlockingErrors: failures.length > 0
  };
}

export function applyRuntimePluginLoadState(pluginCatalog, loadResult) {
  const packages = (pluginCatalog?.packages ?? []).map(pluginPackage => {
    const runtimeModule = loadResult?.pluginStates?.[pluginPackage.id] ?? pluginPackage.runtimeModule ?? {
      entry: pluginPackage.metadata?.runtime?.entry ?? null,
      resolvedPath: pluginPackage.metadata?.runtime?.resolvedEntryPath ?? null,
      loadStatus: pluginPackage.execution?.mode === "plugin-owned" ? "not-loaded" : "not-applicable",
      bundleId: null,
      errors: []
    };
    return {
      ...pluginPackage,
      runtimeModule: {
        ...runtimeModule,
        errors: [...(runtimeModule.errors ?? [])]
      }
    };
  });
  const loadedRuntimeCount = packages.filter(row => row.runtimeModule?.loadStatus === "loaded").length;
  const failedRuntimeCount = packages.filter(row => row.runtimeModule?.loadStatus === "failed").length;
  return {
    ...pluginCatalog,
    packages,
    addedBundleIds: Object.keys(loadResult?.bundleOverrides ?? {}),
    rejectedPlugins: [
      ...(pluginCatalog?.rejectedPlugins ?? []),
      ...(loadResult?.failures ?? [])
    ],
    summary: {
      ...(pluginCatalog?.summary ?? {}),
      loadedRuntimeCount,
      failedRuntimeCount
    }
  };
}
