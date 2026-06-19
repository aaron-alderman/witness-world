import {
  normalizeGuidanceDefinitionEntry,
  normalizeStarterBlueprintEntry
} from "./runtime-guidance.js";

function providerIdentity(provider = {}, fallbackIndex = 0) {
  return String(provider.id || provider.key || provider.name || `${provider.kind || "provider"}:${fallbackIndex}`);
}

function mergeNamed(target, additions, providerId) {
  for (const [key, value] of Object.entries(additions ?? {})) {
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(target, key) && target[key] !== value) {
      throw new Error(`duplicate runtime contribution ${key} from ${providerId}`);
    }
    target[key] = value;
  }
}

function collectProviders(bundles = []) {
  return bundles.flatMap(bundle =>
    (bundle?.contributes?.providers ?? []).map((provider, index) => ({
      bundleId: bundle.id,
      bundleKind: bundle.kind,
      pluginId: bundle.pluginId ?? null,
      provider,
      providerId: `${bundle.id}:${providerIdentity(provider, index)}`
    }))
  );
}

export function collectActiveRuntimeContributions({
  bundles = [],
  supportServiceDeps = {}
} = {}) {
  const supportServices = {};
  const coreHooks = {};
  const providerRuntimeFactories = {};
  const jobHandlerFactories = {};
  const handlerSetProviders = {};
  const backendProcessRequestHandlers = {};
  const runtimeBuiltinSeeds = [];
  const capabilityDefinitions = [];
  const staticAssetProviders = [];
  const staticAssetFiles = new Map();
  const surfaceCapabilityRenderers = [];
  const capabilityPreloadProviders = [];
  const surfaceRuntimeSupportAssets = [];
  const moduleProjectors = {};
  const guidanceDefinitions = [];
  const guidanceDefinitionIndex = new Map();
  const starterBlueprints = [];
  const starterBlueprintIndex = new Map();

  for (const { provider, providerId, bundleId, bundleKind, pluginId } of collectProviders(bundles)) {
    if (!provider || typeof provider !== "object") continue;
    if (provider.kind === "supportServiceFactory") {
      if (typeof provider.factory !== "function") {
        throw new Error(`runtime support service provider ${providerId} must expose factory`);
      }
      mergeNamed(supportServices, provider.factory(supportServiceDeps) ?? {}, providerId);
      continue;
    }
    if (provider.kind === "coreHook") {
      const hookId = String(provider.id || "");
      if (!hookId || typeof provider.hook !== "function") {
        throw new Error(`runtime core hook provider ${providerId} must expose id and hook`);
      }
      mergeNamed(coreHooks, { [hookId]: provider.hook }, providerId);
      continue;
    }
    if (provider.kind === "providerRuntimeFactory") {
      const factoryId = String(provider.id || "");
      if (!factoryId || typeof provider.factory !== "function") {
        throw new Error(`provider runtime factory ${providerId} must expose id and factory`);
      }
      mergeNamed(providerRuntimeFactories, { [factoryId]: provider.factory }, providerId);
      continue;
    }
    if (provider.kind === "jobHandlerFactory") {
      const factoryId = String(provider.id || "");
      if (!factoryId || typeof provider.factory !== "function") {
        throw new Error(`job handler factory ${providerId} must expose id and factory`);
      }
      mergeNamed(jobHandlerFactories, { [factoryId]: provider.factory }, providerId);
      continue;
    }
    if (provider.kind === "handlerSet") {
      if (provider.id) {
        handlerSetProviders[String(provider.id)] = {
          ...provider,
          bundleId,
          bundleKind,
          pluginId
        };
      }
      continue;
    }
    if (provider.kind === "backendProcessRequestHandlers") {
      const handlers = provider.handlers && typeof provider.handlers === "object" && !Array.isArray(provider.handlers)
        ? provider.handlers
        : {};
      for (const [name, handler] of Object.entries(handlers)) {
        if (typeof handler !== "function") {
          throw new Error(`backend process requester provider ${providerId} must expose function handler ${name}`);
        }
      }
      mergeNamed(backendProcessRequestHandlers, handlers, providerId);
      continue;
    }
    if (provider.kind === "runtimeBuiltinSeeds") {
      runtimeBuiltinSeeds.push(provider);
      continue;
    }
    if (provider.kind === "capabilityDefinitions") {
      capabilityDefinitions.push(...(provider.capabilities ?? []));
      continue;
    }
    if (provider.kind === "moduleProjectors") {
      const projectors = provider.projectors && typeof provider.projectors === "object" && !Array.isArray(provider.projectors)
        ? provider.projectors
        : {};
      for (const [name, projector] of Object.entries(projectors)) {
        if (typeof projector !== "function") {
          throw new Error(`module projector provider ${providerId} must expose function projector ${name}`);
        }
      }
      mergeNamed(moduleProjectors, projectors, providerId);
      continue;
    }
    if (provider.kind === "staticAssetProvider") {
      const files = provider.files && typeof provider.files === "object" ? provider.files : {};
      const normalized = { id: provider.id ?? null, mount: provider.mount ?? null, files };
      staticAssetProviders.push(normalized);
      for (const [name, filePath] of Object.entries(files)) {
        if (!name || !filePath) continue;
        if (staticAssetFiles.has(name) && staticAssetFiles.get(name) !== filePath) {
          throw new Error(`duplicate static plugin asset ${name} from ${providerId}`);
        }
        staticAssetFiles.set(name, filePath);
      }
      continue;
    }
    if (provider.kind === "surfaceCapabilityRenderer") {
      const rendererId = String(provider.id || "");
      const capability = String(provider.capability || "");
      if (!rendererId || !capability || typeof provider.factory !== "function") {
        throw new Error(`surface capability renderer provider ${providerId} must expose id, capability, and factory`);
      }
      surfaceCapabilityRenderers.push(Object.freeze({
        id: rendererId,
        capability,
        factory: provider.factory
      }));
      continue;
    }
    if (provider.kind === "capabilityPreloadProvider") {
      const preloadId = String(provider.id || "");
      const capability = String(provider.capability || "");
      if (!preloadId || !capability || typeof provider.factory !== "function") {
        throw new Error(`capability preload provider ${providerId} must expose id, capability, and factory`);
      }
      capabilityPreloadProviders.push(Object.freeze({
        id: preloadId,
        capability,
        factory: provider.factory
      }));
      continue;
    }
    if (provider.kind === "surfaceRuntimeSupportAssets") {
      const supportId = String(provider.id || "");
      if (!supportId || typeof provider.factory !== "function") {
        throw new Error(`surface runtime support assets provider ${providerId} must expose id and factory`);
      }
      surfaceRuntimeSupportAssets.push(Object.freeze({
        id: supportId,
        factory: provider.factory
      }));
      continue;
    }
    if (provider.kind === "guidanceDefinitions") {
      for (const rawEntry of provider.definitions ?? []) {
        const entry = normalizeGuidanceDefinitionEntry(rawEntry, providerId);
        const id = entry.id;
        if (guidanceDefinitionIndex.has(id) && guidanceDefinitionIndex.get(id) !== entry) {
          throw new Error(`duplicate runtime contribution ${id} from ${providerId}`);
        }
        guidanceDefinitions.push(entry);
        guidanceDefinitionIndex.set(id, entry);
      }
      continue;
    }
    if (provider.kind === "starterBlueprints") {
      for (const rawEntry of provider.blueprints ?? []) {
        const entry = normalizeStarterBlueprintEntry(rawEntry, providerId);
        const id = entry.id;
        if (starterBlueprintIndex.has(id) && starterBlueprintIndex.get(id) !== entry) {
          throw new Error(`duplicate runtime contribution ${id} from ${providerId}`);
        }
        starterBlueprints.push(entry);
        starterBlueprintIndex.set(id, entry);
      }
    }
  }

  return Object.freeze({
    supportServices: Object.freeze(supportServices),
    coreHooks: Object.freeze(coreHooks),
    providerRuntimeFactories: Object.freeze(providerRuntimeFactories),
    jobHandlerFactories: Object.freeze(jobHandlerFactories),
    handlerSetProviders: Object.freeze(handlerSetProviders),
    backendProcessRequestHandlers: Object.freeze(backendProcessRequestHandlers),
    runtimeBuiltinSeeds: Object.freeze(runtimeBuiltinSeeds),
    capabilityDefinitions: Object.freeze(capabilityDefinitions),
    moduleProjectors: Object.freeze(moduleProjectors),
    staticAssetProviders: Object.freeze(staticAssetProviders),
    staticAssetFiles,
    surfaceCapabilityRenderers: Object.freeze(surfaceCapabilityRenderers),
    capabilityPreloadProviders: Object.freeze(capabilityPreloadProviders),
    surfaceRuntimeSupportAssets: Object.freeze(surfaceRuntimeSupportAssets),
    guidanceDefinitions: Object.freeze(guidanceDefinitions),
    guidanceDefinitionIndex,
    starterBlueprints: Object.freeze(starterBlueprints),
    starterBlueprintIndex
  });
}
