import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  cloneRuntimeOwnerChain,
  describeHandlerOwnership,
  describeRuntimeRouteOwnership,
  describeSurfaceOwnership
} from "./runtime-ownership.js";

function cloneHandlerMetadataEntry(entry = {}) {
  return {
    ...(entry || {}),
    methods: Array.isArray(entry?.methods) ? [...entry.methods] : undefined,
    ownerChain: cloneRuntimeOwnerChain(entry?.ownerChain)
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

function normalizeMatcherValue(value, label, errors) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const rows = value
      .map(entry => typeof entry === "string" ? entry.trim() : "")
      .filter(Boolean);
    if (rows.length !== value.length) {
      errors.push(`${label} entries must be non-empty strings`);
      return null;
    }
    return [...new Set(rows)];
  }
  errors.push(`${label} must be a string or array of strings`);
  return null;
}

function validateDesireExtensions(pluginPackage, loaded, errors) {
  const raw = loaded?.desireExtensions ?? null;
  if (raw === null || raw === undefined) {
    return {
      elaborators: [],
      runtimeDeclarations: [],
      rvmForms: []
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push("desireExtensions must be an object");
    return {
      elaborators: [],
      runtimeDeclarations: [],
      rvmForms: []
    };
  }
  const pluginId = pluginPackage.id;
  const elaborators = [];
  const runtimeDeclarations = [];
  const rvmForms = [];
  if (raw.elaborators !== undefined && !Array.isArray(raw.elaborators)) {
    errors.push("desireExtensions.elaborators must be an array");
  }
  if (raw.runtimeDeclarations !== undefined && !Array.isArray(raw.runtimeDeclarations)) {
    errors.push("desireExtensions.runtimeDeclarations must be an array");
  }
  if (raw.rvmForms !== undefined && !Array.isArray(raw.rvmForms)) {
    errors.push("desireExtensions.rvmForms must be an array");
  }
  for (const [index, entry] of (Array.isArray(raw.elaborators) ? raw.elaborators : []).entries()) {
    const path = `desireExtensions.elaborators[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    if (!id) errors.push(`${path}.id must be a non-empty string`);
    if (typeof entry.elaborate !== "function") errors.push(`${path}.elaborate must be a function`);
    const normalized = {
      pluginId,
      id,
      sourceLanguage: normalizeMatcherValue(entry.sourceLanguage, `${path}.sourceLanguage`, errors),
      sourceKind: normalizeMatcherValue(entry.sourceKind, `${path}.sourceKind`, errors),
      semanticKind: normalizeMatcherValue(entry.semanticKind, `${path}.semanticKind`, errors),
      nodeKind: normalizeMatcherValue(entry.nodeKind, `${path}.nodeKind`, errors),
      name: normalizeMatcherValue(entry.name, `${path}.name`, errors),
      elaborate: entry.elaborate
    };
    if (id && typeof entry.elaborate === "function") elaborators.push(normalized);
  }
  for (const [index, entry] of (Array.isArray(raw.runtimeDeclarations) ? raw.runtimeDeclarations : []).entries()) {
    const path = `desireExtensions.runtimeDeclarations[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const kind = typeof entry.kind === "string" && entry.kind.trim() ? entry.kind.trim() : null;
    if (!kind) errors.push(`${path}.kind must be a non-empty string`);
    if (typeof entry.apply !== "function") errors.push(`${path}.apply must be a function`);
    if (entry.metadata !== undefined && (!entry.metadata || typeof entry.metadata !== "object" || Array.isArray(entry.metadata))) {
      errors.push(`${path}.metadata must be an object when provided`);
    }
    if (kind && typeof entry.apply === "function") {
      runtimeDeclarations.push({
        pluginId,
        kind,
        apply: entry.apply,
        metadata: entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
          ? { ...entry.metadata }
          : {}
      });
    }
  }
  for (const [index, entry] of (Array.isArray(raw.rvmForms) ? raw.rvmForms : []).entries()) {
    const path = `desireExtensions.rvmForms[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const kind = typeof entry.kind === "string" && entry.kind.trim() ? entry.kind.trim() : null;
    if (!kind) errors.push(`${path}.kind must be a non-empty string`);
    if (typeof entry.parse !== "function") errors.push(`${path}.parse must be a function`);
    if (typeof entry.serialize !== "function") errors.push(`${path}.serialize must be a function`);
    if (typeof entry.validate !== "function") errors.push(`${path}.validate must be a function`);
    if (typeof entry.normalize !== "function") errors.push(`${path}.normalize must be a function`);
    if (kind && typeof entry.parse === "function" && typeof entry.serialize === "function" && typeof entry.validate === "function" && typeof entry.normalize === "function") {
      rvmForms.push({
        pluginId,
        kind,
        parse: entry.parse,
        serialize: entry.serialize,
        validate: entry.validate,
        normalize: entry.normalize
      });
    }
  }
  return {
    elaborators,
    runtimeDeclarations,
    rvmForms
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
  const bundleDefinitions = [];
  const desireExtensions = validateDesireExtensions(pluginPackage, loaded, errors);
  for (const [rawBundleId, definition] of Object.entries(rawBundles ?? {})) {
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
  if (!bundleDefinitions.length && !desireExtensions.elaborators.length && !desireExtensions.runtimeDeclarations.length && !desireExtensions.rvmForms.length && !errors.length) {
    errors.push("runtime module must export bundles, legacy bundleId/handlerCatalog/routes/surfaces/createHandlers, or desireExtensions");
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    bundleDefinitions,
    desireExtensions
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
  const claimedElaborators = Object.create(null);
  const claimedRuntimeDeclarations = Object.create(null);
  const claimedRvmForms = Object.create(null);
  const desireExtensions = {
    elaborators: [],
    runtimeDeclarations: [],
    rvmForms: []
  };

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
      const duplicateExtensionClaims = [];
      const localElaborators = new Set();
      for (const elaborator of validated.desireExtensions.elaborators) {
        if (localElaborators.has(elaborator.id)) {
          duplicateExtensionClaims.push(`duplicate DESIRE+ elaborator in plugin ${pluginPackage.id}: ${elaborator.id}`);
          continue;
        }
        localElaborators.add(elaborator.id);
        const claimedBy = claimedElaborators[elaborator.id];
        if (claimedBy && claimedBy !== pluginPackage.id) {
          duplicateExtensionClaims.push(`DESIRE+ elaborator already claimed by ${claimedBy}: ${elaborator.id}`);
        }
      }
      const localRuntimeDeclarations = new Set();
      for (const declaration of validated.desireExtensions.runtimeDeclarations) {
        if (localRuntimeDeclarations.has(declaration.kind)) {
          duplicateExtensionClaims.push(`duplicate DESIRE runtime declaration in plugin ${pluginPackage.id}: ${declaration.kind}`);
          continue;
        }
        localRuntimeDeclarations.add(declaration.kind);
        const claimedBy = claimedRuntimeDeclarations[declaration.kind];
        if (claimedBy && claimedBy !== pluginPackage.id) {
          duplicateExtensionClaims.push(`DESIRE runtime declaration already claimed by ${claimedBy}: ${declaration.kind}`);
        }
      }
      const localRvmForms = new Set();
      for (const rvmForm of validated.desireExtensions.rvmForms) {
        if (localRvmForms.has(rvmForm.kind)) {
          duplicateExtensionClaims.push(`duplicate RVM form in plugin ${pluginPackage.id}: ${rvmForm.kind}`);
          continue;
        }
        localRvmForms.add(rvmForm.kind);
        const claimedBy = claimedRvmForms[rvmForm.kind];
        if (claimedBy && claimedBy !== pluginPackage.id) {
          duplicateExtensionClaims.push(`RVM form already claimed by ${claimedBy}: ${rvmForm.kind}`);
        }
      }
      if (duplicateBundleClaims.length || duplicateExtensionClaims.length) {
        const errors = [...duplicateBundleClaims, ...duplicateExtensionClaims];
        pluginStates[pluginPackage.id] = {
          ...baseState,
          loadStatus: "failed",
          errors
        };
        failures.push({
          id: pluginPackage.id,
          reasons: errors.map(error => `runtime module invalid: ${error}`),
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
          pluginId: pluginPackage.id,
          version: pluginPackage.metadata?.version ?? "0",
          kind: "plugin",
          displayName: pluginPackage.metadata?.displayName ?? bundleDefinition.bundleId,
          description: pluginPackage.metadata?.description ?? "Plugin-owned runtime bundle.",
          dependsOn: [],
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
      for (const elaborator of validated.desireExtensions.elaborators) {
        claimedElaborators[elaborator.id] = pluginPackage.id;
        desireExtensions.elaborators.push(elaborator);
      }
      for (const declaration of validated.desireExtensions.runtimeDeclarations) {
        claimedRuntimeDeclarations[declaration.kind] = pluginPackage.id;
        desireExtensions.runtimeDeclarations.push(declaration);
      }
      for (const rvmForm of validated.desireExtensions.rvmForms) {
        claimedRvmForms[rvmForm.kind] = pluginPackage.id;
        desireExtensions.rvmForms.push(rvmForm);
      }
      pluginStates[pluginPackage.id] = {
        ...baseState,
        loadStatus: "loaded",
        bundleIds,
        bundleId: bundleIds.length === 1 ? bundleIds[0] : null,
        desireExtensions: {
          elaborators: validated.desireExtensions.elaborators.map(entry => entry.id),
          runtimeDeclarations: validated.desireExtensions.runtimeDeclarations.map(entry => entry.kind),
          rvmForms: validated.desireExtensions.rvmForms.map(entry => entry.kind)
        },
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
    desireExtensions,
    pluginStates,
    failures,
    hasBlockingErrors: failures.length > 0
  };
}

function handlerCatalogProvider(bundle = null) {
  return (bundle?.contributes?.providers ?? []).find(provider => provider?.kind === "handlerCatalog") ?? null;
}

function summarizeLoadedRoute(route = {}, handlerMetadata = {}, bundle = null) {
  const method = String(route.method || "GET").toUpperCase();
  const matcher = route.kind === "exact" ? route.path : String(route.pattern);
  const metadata = handlerMetadata[String(route.handler || "")] ?? undefined;
  return {
    method,
    matcher,
    handler: String(route.handler || ""),
    ...describeRuntimeRouteOwnership({
      route,
      handlerMetadata: metadata ?? {},
      bundle: bundle ?? {}
    }),
    handlerMetadata: metadata ? {
      ...metadata,
      methods: Array.isArray(metadata.methods) ? [...metadata.methods] : undefined,
      ownerChain: cloneRuntimeOwnerChain(metadata.ownerChain)
    } : undefined
  };
}

function summarizeLoadedBundleContributions(bundleIds = [], bundleOverrides = {}) {
  const capabilities = new Set();
  const routes = [];
  const surfaces = [];
  const handlerSets = new Set();
  const handlerMetadata = {};
  for (const bundleId of bundleIds) {
    const bundle = bundleOverrides?.[bundleId] ?? null;
    if (!bundle) continue;
    const catalog = handlerCatalogProvider(bundle);
    for (const [handlerId, entry] of Object.entries(catalog?.handlerMetadata ?? {})) {
      handlerMetadata[handlerId] = {
        ...cloneHandlerMetadataEntry(entry),
        ...describeHandlerOwnership({
          handlerId,
          handlerMetadata: entry,
          bundle
        })
      };
    }
    for (const capability of bundle.contributes?.capabilities ?? []) {
      capabilities.add(typeof capability === "string" ? capability : capability?.id);
    }
    for (const route of bundle.contributes?.routes ?? []) routes.push(summarizeLoadedRoute(route, handlerMetadata, bundle));
    for (const surface of bundle.contributes?.surfaces ?? []) {
      surfaces.push({
        id: surface.id,
        href: surface.href ?? null,
        action: surface.action ? { ...surface.action } : null,
        tier: surface.tier ?? "internal",
        contexts: [...(surface.contexts ?? [])],
        ...describeSurfaceOwnership({ surface, bundle })
      });
    }
    for (const provider of bundle.contributes?.providers ?? []) {
      if (provider?.kind === "handlerSet" && provider.id) handlerSets.add(String(provider.id));
    }
  }
  return {
    capabilities: [...capabilities].filter(Boolean).map(String).sort(),
    routes,
    surfaces,
    handlerSets: [...handlerSets].sort(),
    handlerMetadata
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
    const loadedBundleIds = [...(runtimeModule.bundleIds ?? [])];
    const loadedContributions = runtimeModule.loadStatus === "loaded"
      ? summarizeLoadedBundleContributions(loadedBundleIds, loadResult?.bundleOverrides ?? {})
      : null;
    return {
      ...pluginPackage,
      resolvedRuntimeContributions: loadedContributions ?? pluginPackage.resolvedRuntimeContributions,
      runtimeModule: {
        ...runtimeModule,
        bundleIds: loadedBundleIds,
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
