import { runtimeBundleHandlerCatalog } from "./runtime-bundle-handlers.js";
import {
  createCoreRuntimeBundleHandlers,
} from "./runtime-core-handlers.js";
import {
  CORE_RUNTIME_CAPABILITY_IDS
} from "./runtime-builtins.js";
import { renderWidgetPage } from "../plugins/inspect/widget-page.js";
import { buildRuntimeShellDiagnostics } from "./runtime-shell-contract.js";
import {
  buildRuntimeAuthoringCapabilityMatrix,
  cloneRuntimeAuthoringPolicy,
  createRuntimeAuthoringPolicy,
  defaultRuntimeAuthoringMode
} from "./runtime-authoring-policy.js";
import {
  cloneRuntimeOwnerChain,
  describeHandlerOwnership,
  describeHandlerSetOwnership,
  describeRuntimeRouteOwnership,
  describeShellOwnership,
  describeSurfaceOwnership,
  summarizeRuntimeBundleOwner
} from "./runtime-ownership.js";
import {
  buildGovernanceRouteInventory,
  proposalTargetGovernanceRows,
  runtimeGovernanceEntry
} from "./runtime-governance.js";
import {
  firstPartyBundleRows,
  runtimeProfilePresetsFromSeeds
} from "./runtime-store-seeds.js";

export const DEFAULT_RUNTIME_PROFILE = "full";
export const DEFAULT_BOOTSTRAP_RUNTIME_PROFILE = "minimal";
export const DEFAULT_BOOTSTRAP_STARTUP_PLUGIN_IDS = Object.freeze([
  "plugin.authoring",
  "plugin.starter",
  "plugin.tutorial"
]);

/**
 * @typedef {Object} BundleManifest
 * @property {string} id
 * @property {string} version
 * @property {"internal"|"plugin"} kind
 * @property {string} displayName
 * @property {string} description
 * @property {string[]} dependsOn
 * @property {{
 *   capabilities: any[],
 *   providers: any[],
 *   routes: any[],
 *   surfaces: any[]
 * }} contributes
 */

function deepFreezeBundle(bundle) {
  return Object.freeze({
    ...bundle,
    contributes: Object.freeze({
      capabilities: Object.freeze([...(bundle.contributes?.capabilities ?? [])]),
      providers: Object.freeze([...(bundle.contributes?.providers ?? [])]),
      routes: Object.freeze([...(bundle.contributes?.routes ?? [])]),
      surfaces: Object.freeze([...(bundle.contributes?.surfaces ?? [])])
    }),
    dependsOn: Object.freeze([...(bundle.dependsOn ?? [])])
  });
}

function exactRoute(method, path, handler, params = {}) {
  return { kind: "exact", method, path, handler, params };
}

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

function surfaceEntry({
  id,
  title,
  href,
  action = null,
  search,
  subtitle = "",
  type = "surface",
  tier = "internal",
  contexts = ["app-command", "world-command"]
}) {
  return { id, title, href, action, search, subtitle, type, tier, contexts };
}

function handlerCatalog({
  authorableHandlers = [],
  pageHandlers = [],
  dispatchHandlers = [],
  handlerMetadata = {}
}) {
  return {
    kind: "handlerCatalog",
    authorableHandlers,
    pageHandlers,
    dispatchHandlers,
    handlerMetadata
  };
}

function bundleHandlerCatalog(bundleId) {
  return handlerCatalog(runtimeBundleHandlerCatalog(bundleId));
}

function genericHandlerFactory(factory) {
  return {
    kind: "genericHandlerFactory",
    factory
  };
}

function internalBundle({
  id,
  version = "0",
  displayName,
  description,
  dependsOn = [],
  contributes
}) {
  return deepFreezeBundle({
    id,
    version,
    kind: "internal",
    displayName,
    description,
    dependsOn,
    contributes
  });
}

function seedBundle(row) {
  return internalBundle({
    id: row.id,
    displayName: row.displayName,
    description: row.description,
    contributes: {
      capabilities: [],
      providers: [],
      routes: [],
      surfaces: []
    }
  });
}

const RUNTIME_PROFILE_PRESETS = runtimeProfilePresetsFromSeeds();

const INTERNAL_BUNDLE_MANIFESTS = [
  internalBundle({
    id: "bundle-core-runtime",
    displayName: "Core Runtime",
    description: "Universal runtime substrate: session APIs, home-page rendering, host capability defaults, and runtime diagnostics.",
    contributes: {
      capabilities: CORE_RUNTIME_CAPABILITY_IDS,
      providers: [
        { kind: "defaultHostCapabilities", hostKind: "backend", capabilities: ["http.serve", "runtime.config"] },
        { kind: "defaultHostCapabilities", hostKind: "frontend", capabilities: ["dom.render", "http.fetch"] },
        { kind: "startupRequiredHostCapabilities", hostKind: "backend", capabilities: ["http.serve"] },
        { kind: "startupRequiredHostCapabilities", hostKind: "frontend", capabilities: ["dom.render", "http.fetch"] },
        { kind: "coreHook", id: "renderWidgetPage", hook: renderWidgetPage },
        bundleHandlerCatalog("bundle-core-runtime"),
        genericHandlerFactory(createCoreRuntimeBundleHandlers)
      ],
      routes: [
        exactRoute("GET", "/api/session", "session.read"),
        exactRoute("POST", "/api/session", "session.open"),
        exactRoute("DELETE", "/api/session", "session.logout"),
        exactRoute("GET", "/api/authority/grants", "authority.grants.read"),
        exactRoute("POST", "/api/authority/grants", "authority.grants.create"),
        patternRoute("DELETE", /^\/api\/authority\/grants\/([^/]+)$/, "authority.grants.revoke", ["grantId"]),
        patternRoute("GET", /^\/api\/guidance-progress\/([^/]+)$/, "guidance.progress.read", ["guidanceId"]),
        patternRoute("PUT", /^\/api\/guidance-progress\/([^/]+)$/, "guidance.progress.write", ["guidanceId"]),
        patternRoute("DELETE", /^\/api\/guidance-progress\/([^/]+)$/, "guidance.progress.delete", ["guidanceId"]),
        patternRoute("GET", /^\/api\/tutorial-progress\/([^/]+)$/, "guidance.progress.read", ["tutorialId"]),
        patternRoute("PUT", /^\/api\/tutorial-progress\/([^/]+)$/, "guidance.progress.write", ["tutorialId"]),
        patternRoute("DELETE", /^\/api\/tutorial-progress\/([^/]+)$/, "guidance.progress.delete", ["tutorialId"]),
        exactRoute("GET", "/api/runtime/app-revisions/events", "app.revision.events"),
        exactRoute("GET", "/api/runtime/backend-revisions/events", "backend.revision.events"),
        exactRoute("POST", "/api/runtime/app-snapshot/promote-current", "app.snapshot.promoteCurrent"),
        exactRoute("POST", "/api/runtime/app-snapshot/rollback-stable", "app.snapshot.rollbackStable"),
        exactRoute("POST", "/api/runtime/app-preview-sessions", "app.preview.session.create"),
        patternRoute("GET", /^\/api\/runtime\/app-preview-sessions\/([^/]+)$/, "app.preview.session.read", ["id"]),
        patternRoute("PATCH", /^\/api\/runtime\/app-preview-sessions\/([^/]+)\/sources$/, "app.preview.session.patchSources", ["id"]),
        patternRoute("PATCH", /^\/api\/runtime\/app-preview-sessions\/([^/]+)\/candidates$/, "app.preview.session.patchCandidates", ["id"]),
        patternRoute("DELETE", /^\/api\/runtime\/app-preview-sessions\/([^/]+)$/, "app.preview.session.delete", ["id"]),
        patternRoute("GET", /^\/api\/runtime\/app-preview-sessions\/([^/]+)\/events$/, "app.preview.session.events", ["id"]),
        patternRoute("GET", /^\/api\/runtime\/app-preview-sessions\/([^/]+)\/source$/, "app.preview.session.source.read", ["id"]),
        patternRoute("GET", /^\/api\/runtime\/app-preview-sessions\/([^/]+)\/targets$/, "app.preview.session.targets.read", ["id"]),
        patternRoute("GET", /^\/api\/runtime\/app-preview-sessions\/([^/]+)\/inspect$/, "app.preview.session.inspect.read", ["id"]),
        patternRoute("PATCH", /^\/api\/runtime\/app-preview-sessions\/([^/]+)\/properties$/, "app.preview.session.properties.patch", ["id"]),
        exactRoute("POST", "/api/runtime/app-sources", "app.source.write"),
        exactRoute("GET", "/api/runtime/diagnostics", "runtime.diagnostics.read"),
        exactRoute("GET", "/api/runtime/plugins", "runtime.plugins.read"),
        exactRoute("GET", "/api/runtime/plugin-reviews", "runtime.pluginReviews.read")
      ],
      surfaces: [
        surfaceEntry({
          id: "surface:home",
          title: "Open Home Page",
          subtitle: "/",
          href: "/",
          type: "page",
          tier: "app",
          search: "home page app surface / user-facing"
        })
      ]
    }
  }),
  internalBundle({
    id: "bundle-engentus-dev-diagnostics",
    displayName: "Engentus Dev Diagnostics",
    description: "Dev-only diagnostics support bundle for Engentus shell expectation providers.",
    contributes: {
      capabilities: [],
      providers: [],
      routes: [],
      surfaces: []
    }
  }),
  ...firstPartyBundleRows().map(seedBundle)
];

const BUNDLE_BY_ID = new Map(INTERNAL_BUNDLE_MANIFESTS.map(bundle => [bundle.id, bundle]));

function cloneSurface(surface) {
  return {
    ...surface,
    action: surface?.action ? { ...surface.action } : null,
    contexts: [...(surface.contexts ?? [])]
  };
}

function cloneHandlerMetadataEntry(entry = {}) {
  return {
    ...(entry || {}),
    methods: Array.isArray(entry?.methods) ? [...entry.methods] : undefined,
    ownerChain: cloneRuntimeOwnerChain(entry?.ownerChain),
    governance: entry?.governance ? { ...entry.governance } : undefined
  };
}

function cloneHandlerCatalogProvider(provider = null) {
  if (!provider || provider.kind !== "handlerCatalog") {
    return {
      authorableHandlers: [],
      pageHandlers: [],
      dispatchHandlers: [],
      handlerMetadata: {}
    };
  }
  return {
    authorableHandlers: [...(provider.authorableHandlers ?? [])].map(String),
    pageHandlers: [...(provider.pageHandlers ?? [])].map(String),
    dispatchHandlers: [...(provider.dispatchHandlers ?? [])].map(String),
    handlerMetadata: Object.fromEntries(
      Object.entries(provider.handlerMetadata ?? {}).map(([handlerId, entry]) => [
        String(handlerId),
        cloneHandlerMetadataEntry(entry)
      ])
    )
  };
}

function handlerCatalogProviderForBundle(bundle) {
  return (bundle?.contributes?.providers ?? []).find(provider => provider?.kind === "handlerCatalog") ?? null;
}

function pluginOwnedBundle(bundleId, override = {}) {
  return deepFreezeBundle({
    id: String(bundleId || ""),
    pluginId: override.pluginId ?? null,
    version: override.version ?? "0",
    kind: "plugin",
    displayName: override.displayName ?? String(bundleId || ""),
    description: override.description ?? "Plugin-owned runtime bundle.",
    dependsOn: override.dependsOn ?? [],
    contributes: {
      capabilities: override.contributes?.capabilities ?? [],
      providers: override.contributes?.providers ?? [],
      routes: override.contributes?.routes ?? [],
      surfaces: override.contributes?.surfaces ?? []
    }
  });
}

function materializeBundle(bundleId, bundleOverrides = {}) {
  const resolvedBundleId = String(bundleId || "");
  const base = BUNDLE_BY_ID.get(resolvedBundleId);
  const override = bundleOverrides?.[resolvedBundleId] ?? null;
  if (!base) return override ? pluginOwnedBundle(resolvedBundleId, override) : null;
  if (!override) return base;
  const baseProvidersToPreserve = base.contributes.providers.filter(provider =>
    provider?.kind !== "handlerCatalog"
    && provider?.kind !== "genericHandlerFactory"
  );
  const overrideProviders = override.contributes?.providers ?? base.contributes.providers;
  return deepFreezeBundle({
    ...base,
    kind: override.kind ?? base.kind,
    pluginId: override.pluginId ?? base.pluginId ?? null,
    displayName: override.displayName ?? base.displayName,
    description: override.description ?? base.description,
    dependsOn: override.dependsOn ?? base.dependsOn,
    contributes: {
      capabilities: override.contributes?.capabilities ?? base.contributes.capabilities,
      providers: override.contributes?.providers
        ? [...baseProvidersToPreserve, ...overrideProviders]
        : overrideProviders,
      routes: override.contributes?.routes ?? base.contributes.routes,
      surfaces: override.contributes?.surfaces ?? base.contributes.surfaces
    }
  });
}

function normalizeProfileName(profileName) {
  return Object.prototype.hasOwnProperty.call(RUNTIME_PROFILE_PRESETS, profileName)
    ? profileName
    : DEFAULT_RUNTIME_PROFILE;
}

export function availableRuntimeProfiles() {
  return Object.keys(RUNTIME_PROFILE_PRESETS);
}

export function runtimeProfilePluginIds(profileName = DEFAULT_RUNTIME_PROFILE) {
  const id = normalizeProfileName(profileName);
  return [...(RUNTIME_PROFILE_PRESETS[id]?.plugins ?? [])];
}

function resolveProfilePreset(profileName = DEFAULT_RUNTIME_PROFILE) {
  const id = normalizeProfileName(profileName);
  const preset = RUNTIME_PROFILE_PRESETS[id];
  return {
    id,
    coreBundleIds: [...preset.coreBundles],
    pluginIds: [...preset.plugins],
    resolvedPluginIds: [...preset.plugins],
    bundleIds: [...preset.coreBundles]
  };
}

export function availableRuntimeBundleIds() {
  return INTERNAL_BUNDLE_MANIFESTS.map(bundle => bundle.id);
}

export function runtimeBundleManifest(bundleId) {
  const bundle = BUNDLE_BY_ID.get(String(bundleId || ""));
  if (!bundle) return null;
  const handlerCatalogProvider = cloneHandlerCatalogProvider(handlerCatalogProviderForBundle(bundle));
  const handlerCatalogMetadata = Object.fromEntries(
    Object.entries(handlerCatalogProvider.handlerMetadata ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([handlerId, entry]) => [
        handlerId,
        {
          ...cloneHandlerMetadataEntry(entry),
          ...(runtimeGovernanceEntry(handlerId) ? { governance: runtimeGovernanceEntry(handlerId) } : {}),
          ...describeHandlerOwnership({
            handlerId,
            handlerMetadata: entry,
            bundle
          })
        }
      ])
  );
  return {
    ...bundle,
    handlerCatalog: {
      authorableHandlers: [...handlerCatalogProvider.authorableHandlers],
      pageHandlers: [...handlerCatalogProvider.pageHandlers],
      dispatchHandlers: [...handlerCatalogProvider.dispatchHandlers],
      handlerMetadata: handlerCatalogMetadata
    },
    contributes: {
      capabilities: [...bundle.contributes.capabilities],
      providers: [...bundle.contributes.providers],
      routes: bundle.contributes.routes.map(route => ({
        ...route,
        ...describeRuntimeRouteOwnership({
          route,
          handlerMetadata: handlerCatalogMetadata[String(route.handler)] ?? {},
          bundle
        }),
        handlerMetadata: handlerCatalogMetadata?.[String(route.handler)] ? {
          ...cloneHandlerMetadataEntry(handlerCatalogMetadata[String(route.handler)])
        } : undefined
      })),
      surfaces: bundle.contributes.surfaces.map(surface => ({
        ...cloneSurface(surface),
        ...describeSurfaceOwnership({ surface, bundle })
      }))
    },
    dependsOn: [...bundle.dependsOn]
  };
}

export function runtimeBundleManifests() {
  return INTERNAL_BUNDLE_MANIFESTS.map(bundle => runtimeBundleManifest(bundle.id));
}

export function resolveRuntimeComposition({
  profileName = DEFAULT_RUNTIME_PROFILE,
  additionalBundleIds = [],
  bundleOverrides = {}
} = {}) {
  const preset = resolveProfilePreset(profileName);
  const bundleIds = [];
  const seen = new Set();
  const availableBundleIds = new Set([
    ...BUNDLE_BY_ID.keys(),
    ...Object.keys(bundleOverrides ?? {}).map(String)
  ]);
  for (const bundleId of [...preset.bundleIds, ...additionalBundleIds.map(String)]) {
    if (!availableBundleIds.has(bundleId) || seen.has(bundleId)) continue;
    seen.add(bundleId);
    bundleIds.push(bundleId);
  }
  return {
    id: preset.id,
    profilePluginIds: [...preset.pluginIds],
    resolvedProfilePluginIds: [...preset.resolvedPluginIds],
    profileCoreBundleIds: [...preset.coreBundleIds],
    bundleIds,
    bundles: bundleIds.map(bundleId => materializeBundle(bundleId, bundleOverrides)).filter(Boolean)
  };
}

function compositionOptions(options = {}) {
  return {
    additionalBundleIds: [...(options.additionalBundleIds ?? [])].map(String),
    bundleOverrides: options.bundleOverrides ?? {}
  };
}

export function runtimeCompositionStory({
  startupRunner = null,
  startupMode = "serve",
  profilePluginIds = [],
  startupPluginIds = [],
  authoredPluginIds = [],
  operatorPluginIds = [],
  effectivePluginIds = []
} = {}) {
  const runnerId = startupRunner?.id ? String(startupRunner.id) : null;
  const bootstrapOnly = startupRunner?.bootstrapOnly === true;
  const startupOwned = startupRunner?.startupOwned === true;
  const normalizedProfilePluginIds = [...new Set((profilePluginIds ?? []).map(String).filter(Boolean))];
  const normalizedStartupPluginIds = [...new Set((startupPluginIds ?? []).map(String).filter(Boolean))];
  const normalizedAuthoredPluginIds = [...new Set((authoredPluginIds ?? []).map(String).filter(Boolean))];
  const normalizedOperatorPluginIds = [...new Set((operatorPluginIds ?? []).map(String).filter(Boolean))];
  const normalizedEffectivePluginIds = [...new Set((effectivePluginIds ?? []).map(String).filter(Boolean))];
  const usesAuthoredServerRunner = Boolean(runnerId) && !bootstrapOnly;
  const usesAuthoredRuntimePluginInstalls = normalizedAuthoredPluginIds.length > 0;

  let activePluginSource = "core-profile-only";
  if (usesAuthoredRuntimePluginInstalls && normalizedOperatorPluginIds.length > 0) {
    activePluginSource = "authored-installs-plus-operator-defaults";
  } else if (usesAuthoredRuntimePluginInstalls) {
    activePluginSource = "authored-runtime-plugin-installs";
  } else if (normalizedStartupPluginIds.length > 0) {
    activePluginSource = "startup-defaults";
  } else if (normalizedProfilePluginIds.length > 0 || normalizedOperatorPluginIds.length > 0) {
    activePluginSource = "profile-or-operator-defaults";
  }

  const storyId = usesAuthoredServerRunner
    ? "authored-runner-driven"
    : (startupOwned ? "startup-runner-driven" : "synthetic-runner-profile-driven");
  const notes = [];
  if (usesAuthoredServerRunner) {
    notes.push(`Active runtime is anchored by authored server runner ${runnerId}.`);
  } else if (runnerId && startupOwned) {
    notes.push(`Active runtime is anchored by startup default runner ${runnerId}; no authored serverRunner row owns the current runtime yet.`);
  } else if (runnerId) {
    notes.push(`Active runtime is anchored by synthetic startup runner ${runnerId}; no authored serverRunner row owns the current runtime.`);
  } else {
    notes.push("Active runtime has no resolved authored serverRunner anchor.");
  }
  if (usesAuthoredRuntimePluginInstalls) {
    notes.push("Authored runtimePluginInstall rows participate in the active runtime plugin composition.");
  } else if (normalizedStartupPluginIds.length > 0) {
    notes.push("Effective runtime plugins come from explicit startup defaults, not authored runtimePluginInstall rows.");
  } else if (normalizedEffectivePluginIds.length > 0) {
    notes.push("Effective runtime plugins come from the startup profile and operator-configured defaults, not authored runtimePluginInstall rows.");
  } else {
    notes.push("No runtime plugin packages are active beyond the selected core profile bundles.");
  }

  const explanation = usesAuthoredServerRunner
    ? `Runtime is running in ${startupMode} mode from authored runner ${runnerId}; plugin activation source is ${activePluginSource}.`
    : (startupOwned
        ? `Runtime is running in ${startupMode} mode from startup default runner ${runnerId ?? "<none>"}; plugin activation source is ${activePluginSource}.`
        : `Runtime is running in ${startupMode} mode from synthetic startup runner ${runnerId ?? "<none>"}; plugin activation source is ${activePluginSource}.`);

  return {
    storyId,
    startupMode: String(startupMode || "serve"),
    activeRunnerId: runnerId,
    activeRunnerSource: usesAuthoredServerRunner
      ? "authored-server-runner"
      : (startupOwned ? "startup-default-runner" : "synthetic-startup-runner"),
    activePluginSource,
    usesAuthoredServerRunner,
    usesAuthoredRuntimePluginInstalls,
    explanation,
    notes
  };
}

function selectedComposition(profileName, options = {}) {
  const resolved = resolveRuntimeComposition({
    profileName,
    additionalBundleIds: compositionOptions(options).additionalBundleIds,
    bundleOverrides: compositionOptions(options).bundleOverrides
  });
  return resolved;
}

export function resolveRuntimeProfile(profileName = DEFAULT_RUNTIME_PROFILE) {
  return resolveRuntimeComposition({ profileName });
}

export function resolveRuntimeProfileStrict(profileName = DEFAULT_RUNTIME_PROFILE) {
  const normalized = String(profileName || DEFAULT_RUNTIME_PROFILE);
  if (!Object.prototype.hasOwnProperty.call(RUNTIME_PROFILE_PRESETS, normalized)) {
    return {
      ok: false,
      requestedProfile: normalized,
      validProfileIds: availableRuntimeProfiles()
    };
  }
  return {
    ok: true,
    ...resolveRuntimeProfile(normalized)
  };
}

export function effectiveRuntimeProfileForRunner({
  serverRunner = null,
  startupOverrideProfile = null,
  startupMode = "serve",
  fallbackProfile = DEFAULT_RUNTIME_PROFILE
} = {}) {
  const overrideProfile = typeof startupOverrideProfile === "string" && startupOverrideProfile.trim()
    ? startupOverrideProfile.trim()
    : null;
  const authoredRuntimeProfile = typeof serverRunner?.runtimeProfile === "string" && serverRunner.runtimeProfile.trim()
    ? serverRunner.runtimeProfile.trim()
    : null;
  if (overrideProfile) {
    return {
      authoredRuntimeProfile,
      effectiveRuntimeProfile: overrideProfile,
      effectiveRuntimeProfileSource: "startup-override",
      overrideActive: true
    };
  }
  if (authoredRuntimeProfile) {
    return {
      authoredRuntimeProfile,
      effectiveRuntimeProfile: authoredRuntimeProfile,
      effectiveRuntimeProfileSource: "authored-server-runner",
      overrideActive: false
    };
  }
  const startupDefault = startupMode === "bootstrap"
    ? DEFAULT_BOOTSTRAP_RUNTIME_PROFILE
    : fallbackProfile;
  return {
    authoredRuntimeProfile: null,
    effectiveRuntimeProfile: startupDefault,
    effectiveRuntimeProfileSource: serverRunner?.startupOwned === true
      ? "startup-default-runner"
      : "legacy-startup-default",
    overrideActive: false
  };
}

export function providedCapabilityIdsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const ids = new Set();
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const capabilityId of bundle.contributes.capabilities) ids.add(String(capabilityId));
  }
  return [...ids];
}

export function runtimeBuiltinSeedContributionsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  return selectedComposition(profileName, options).bundles.flatMap(bundle =>
    bundle.contributes.providers
      .filter(provider => provider?.kind === "runtimeBuiltinSeeds")
      .map(provider => ({
        traits: [...(provider.traits ?? [])],
        valueTypes: [...(provider.valueTypes ?? [])],
        processSpecs: [...(provider.processSpecs ?? [])]
      }))
  );
}

export function runtimeCapabilityDefinitionsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  return selectedComposition(profileName, options).bundles.flatMap(bundle =>
    bundle.contributes.providers
      .filter(provider => provider?.kind === "capabilityDefinitions")
      .flatMap(provider => provider.capabilities ?? [])
      .map(capability => JSON.parse(JSON.stringify(capability)))
  );
}

export function defaultHostCapabilitiesForProfile(profileName = DEFAULT_RUNTIME_PROFILE, hostKind = "backend", options = {}) {
  const ids = new Set();
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "defaultHostCapabilities" || provider.hostKind !== hostKind) continue;
      for (const capabilityId of provider.capabilities ?? []) ids.add(String(capabilityId));
    }
  }
  return [...ids];
}

export function startupRequiredHostCapabilitiesForProfile(profileName = DEFAULT_RUNTIME_PROFILE, hostKind = "backend", options = {}) {
  const ids = new Set();
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "startupRequiredHostCapabilities" || provider.hostKind !== hostKind) continue;
      for (const capabilityId of provider.capabilities ?? []) ids.add(String(capabilityId));
    }
  }
  return [...ids];
}

export function runtimeSurfaceEntriesForProfile(profileName = DEFAULT_RUNTIME_PROFILE, context = null, options = {}) {
  const seen = new Map();
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const surface of bundle.contributes.surfaces) {
      if (context && Array.isArray(surface.contexts) && !surface.contexts.includes(context)) continue;
      seen.set(surface.id, cloneSurface(surface));
    }
  }
  return [...seen.values()];
}

export function runtimeRouteEntriesForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  // Tag each route with its originating bundle id so callers can gate generic-endpoint availability
  // per server runner (multi-host: a bundle endpoint is only reachable on hosts that activate it).
  return selectedComposition(profileName, options).bundles.flatMap(bundle =>
    bundle.contributes.routes.map(route => ({ ...route, bundleId: bundle.id }))
  );
}

export function matchRuntimeBundleRoute(profileName = DEFAULT_RUNTIME_PROFILE, method, pathname, options = {}) {
  const targetMethod = String(method || "GET").toUpperCase();
  const targetPath = String(pathname || "");
  for (const route of runtimeRouteEntriesForProfile(profileName, options)) {
    if (String(route.method || "GET").toUpperCase() !== targetMethod) continue;
    const routeKind = route.kind ?? (typeof route.path === "string" ? "exact" : (route.pattern ? "pattern" : null));
    if (routeKind === "exact") {
      if (route.path !== targetPath) continue;
      return { handler: route.handler, params: { ...(route.params ?? {}) }, bundleId: route.bundleId ?? null };
    }
    if (routeKind === "pattern") {
      const match = targetPath.match(route.pattern);
      if (!match) continue;
      const params = {};
      for (let index = 0; index < route.paramNames.length; index += 1) {
        params[route.paramNames[index]] = decodeURIComponent(match[index + 1] || "");
      }
      return { handler: route.handler, params, bundleId: route.bundleId ?? null };
    }
  }
  return null;
}

export function handlerSetFactoriesForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const factories = Object.create(null);
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "handlerSet" || !provider.id || typeof provider.factory !== "function") continue;
      factories[provider.id] = provider.factory;
    }
  }
  return factories;
}

export function handlerSetDefinitionsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const definitions = Object.create(null);
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "handlerSet" || !provider.id || !provider.definition) continue;
      definitions[provider.id] = provider.definition;
    }
  }
  return definitions;
}

export function bundleHandlerCatalogsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const catalogs = Object.create(null);
  for (const bundle of selectedComposition(profileName, options).bundles) {
    catalogs[bundle.id] = cloneHandlerCatalogProvider(handlerCatalogProviderForBundle(bundle));
  }
  return catalogs;
}

export function genericHandlerFactoriesForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const factories = [];
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "genericHandlerFactory" || typeof provider.factory !== "function") continue;
      factories.push({ bundleId: bundle.id, factory: provider.factory });
    }
  }
  return factories;
}

export function genericHandlerFactoriesForBundleIds(bundleIds = []) {
  const factories = [];
  for (const bundleId of bundleIds) {
    const bundle = BUNDLE_BY_ID.get(String(bundleId || ""));
    if (!bundle) continue;
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "genericHandlerFactory" || typeof provider.factory !== "function") continue;
      factories.push({ bundleId: bundle.id, factory: provider.factory });
    }
  }
  return factories;
}

function collectHandlerCatalogEntries(profileName, selector, options = {}) {
  const ids = new Set();
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "handlerCatalog") continue;
      for (const handlerId of selector(provider) ?? []) ids.add(String(handlerId || ""));
    }
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "handlerSet" || !provider.definition) continue;
      for (const handlerId of provider.definition.handlers ?? []) ids.add(String(handlerId || ""));
    }
  }
  return [...ids].filter(Boolean);
}

export function authorableHandlerIdsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  return collectHandlerCatalogEntries(profileName, provider => provider.authorableHandlers, options);
}

export function pageHandlerIdsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  return collectHandlerCatalogEntries(profileName, provider => provider.pageHandlers, options);
}

export function dispatchHandlerIdsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const ids = new Set();
  const resolved = selectedComposition(profileName, options);
  for (const bundle of resolved.bundles) {
    for (const route of bundle.contributes.routes) ids.add(String(route.handler || ""));
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind === "handlerCatalog") {
        for (const handlerId of provider.authorableHandlers ?? []) ids.add(String(handlerId || ""));
        for (const handlerId of provider.pageHandlers ?? []) ids.add(String(handlerId || ""));
        for (const handlerId of provider.dispatchHandlers ?? []) ids.add(String(handlerId || ""));
      }
      if (provider?.kind === "handlerSet" && provider.definition) {
        for (const handlerId of provider.definition.handlers ?? []) ids.add(String(handlerId || ""));
      }
    }
  }
  return [...ids].filter(Boolean);
}

export function handlerMetadataForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const metadata = Object.create(null);
  const resolved = selectedComposition(profileName, options);
  for (const bundle of resolved.bundles) {
    for (const provider of bundle.contributes.providers) {
      if (provider?.kind !== "handlerCatalog") continue;
      for (const [handlerId, entry] of Object.entries(provider.handlerMetadata ?? {})) {
        const governance = runtimeGovernanceEntry(handlerId);
        metadata[String(handlerId)] = {
          ...cloneHandlerMetadataEntry(entry),
          ...(governance ? { governance } : {}),
          ...describeHandlerOwnership({
            handlerId,
            handlerMetadata: entry,
            bundle
          })
        };
      }
    }
  }
  return metadata;
}

export function runtimeBundleSummaryForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const resolved = selectedComposition(profileName, options);
  const handlerMetadata = handlerMetadataForProfile(resolved.id, options);
  const routeSummaries = [];
  const surfaceSummaries = new Map();
  for (const bundle of resolved.bundles) {
    for (const route of bundle.contributes.routes ?? []) {
      routeSummaries.push({
        method: route.method,
        matcher: route.kind === "exact" ? route.path : String(route.pattern),
        handler: route.handler,
        ...describeRuntimeRouteOwnership({
          route,
          handlerMetadata: handlerMetadata[String(route.handler)] ?? {},
          bundle
        }),
        governance: handlerMetadata[String(route.handler)]?.governance
          ? { ...handlerMetadata[String(route.handler)].governance }
          : undefined,
        handlerMetadata: handlerMetadata[String(route.handler)] ? {
          ...(handlerMetadata[String(route.handler)] || {}),
          governance: handlerMetadata[String(route.handler)]?.governance
            ? { ...handlerMetadata[String(route.handler)].governance }
            : undefined,
          methods: Array.isArray(handlerMetadata[String(route.handler)]?.methods)
            ? [...handlerMetadata[String(route.handler)].methods]
            : undefined
        } : undefined
      });
    }
    for (const surface of bundle.contributes.surfaces ?? []) {
      surfaceSummaries.set(surface.id, {
        id: surface.id,
        href: surface.href,
        action: surface.action ? { ...surface.action } : null,
        tier: surface.tier,
        contexts: [...(surface.contexts ?? [])],
        ...describeSurfaceOwnership({ surface, bundle })
      });
    }
  }
  return {
    profile: resolved.id,
    profilePluginIds: [...resolved.profilePluginIds],
    resolvedProfilePluginIds: [...resolved.resolvedProfilePluginIds],
    profileCoreBundleIds: [...resolved.profileCoreBundleIds],
    bundleIds: [...resolved.bundleIds],
    bundles: resolved.bundles.map(bundle => ({
      id: bundle.id,
      pluginId: bundle.pluginId ?? null,
      kind: bundle.kind,
      displayName: bundle.displayName,
      description: bundle.description,
      ...summarizeRuntimeBundleOwner(bundle),
      dependsOn: [...bundle.dependsOn],
      capabilityCount: bundle.contributes.capabilities.length,
      providerCount: bundle.contributes.providers.length,
      routeCount: bundle.contributes.routes.length,
      surfaceCount: bundle.contributes.surfaces.length,
      contributes: {
        capabilities: [...bundle.contributes.capabilities],
        providers: [...bundle.contributes.providers],
        routes: bundle.contributes.routes.map(route => ({ ...route })),
        surfaces: bundle.contributes.surfaces.map(cloneSurface)
      },
      handlerCatalog: cloneHandlerCatalogProvider(handlerCatalogProviderForBundle(bundle))
    })),
    capabilities: providedCapabilityIdsForProfile(resolved.id, options).sort(),
    authorableHandlers: authorableHandlerIdsForProfile(resolved.id, options),
    pageHandlers: pageHandlerIdsForProfile(resolved.id, options),
    dispatchHandlers: dispatchHandlerIdsForProfile(resolved.id, options),
    handlerMetadata,
    governanceRoutes: buildGovernanceRouteInventory(routeSummaries),
    proposalTargetGovernance: proposalTargetGovernanceRows(),
    routes: routeSummaries,
    surfaces: [...surfaceSummaries.values()]
  };
}

export function buildRuntimeDiagnosticsForProfile({
  requestedProfile = null,
  profileName = DEFAULT_RUNTIME_PROFILE,
  authoredRuntimeProfile = null,
  effectiveRuntimeProfileSource = null,
  runtimeProfileOverrideActive = false,
  runtimeProfileOverrideProfile = null,
  additionalBundleIds = [],
  bundleOverrides = {},
  startupRunner = null,
  startupMode = "serve",
  installedHostCapabilities = {},
  handlerSetDefinitions = {},
  operatorContract = null,
  operatorState = null,
  pluginCatalogSummary = null,
  configuredPluginIds = [],
  startupPluginIds = [],
  authoredPluginIds = [],
  operatorPluginIds = [],
  effectivePluginIds = [],
  activePluginIds = [],
  rejectedPlugins = [],
  pluginAddedBundleIds = [],
  authoringPolicy = null,
  handlerSetProviders = {}
} = {}) {
  const summary = runtimeBundleSummaryForProfile(profileName, { additionalBundleIds, bundleOverrides });
  const shellDiagnostics = buildRuntimeShellDiagnostics({
    activeBundleIds: summary.bundleIds,
    startupMode
  });
  const effectiveAuthoringPolicy = cloneRuntimeAuthoringPolicy(
    authoringPolicy
    ?? createRuntimeAuthoringPolicy({
      mode: defaultRuntimeAuthoringMode({ runtimeStartupMode: startupMode })
    })
  );
  const composition = runtimeCompositionStory({
    startupRunner,
    startupMode,
    profilePluginIds: summary.profilePluginIds ?? [],
    startupPluginIds,
    authoredPluginIds,
    operatorPluginIds,
    effectivePluginIds
  });
  return {
    requestedProfile: requestedProfile ?? profileName,
    activeProfile: summary.profile,
    authoredRuntimeProfile: authoredRuntimeProfile ?? null,
    effectiveRuntimeProfile: summary.profile,
    effectiveRuntimeProfileSource: effectiveRuntimeProfileSource ?? null,
    runtimeProfileOverrideActive: runtimeProfileOverrideActive === true,
    runtimeProfileOverrideProfile: runtimeProfileOverrideProfile ?? null,
    availableProfiles: availableRuntimeProfiles(),
    startupRunner: startupRunner ? {
      id: startupRunner.id ?? null,
      backendHost: startupRunner.backendHost ?? null,
      frontendHost: startupRunner.frontendHost ?? null,
      handlerSet: startupRunner.handlerSet ?? null,
      bootstrapOnly: startupRunner.bootstrapOnly === true,
      startupOwned: startupRunner.startupOwned === true
    } : null,
    activeBundles: summary.bundles.map(bundle => ({
      id: bundle.id,
      pluginId: bundle.pluginId ?? null,
      kind: bundle.kind,
      displayName: bundle.displayName,
      description: bundle.description,
      ownerClass: bundle.ownerClass,
      ownerBundleId: bundle.ownerBundleId,
      ownerPluginId: bundle.ownerPluginId,
      ownerNote: bundle.ownerNote,
      dependsOn: [...bundle.dependsOn],
      capabilityCount: bundle.capabilityCount,
      providerCount: bundle.providerCount,
      routeCount: bundle.routeCount,
      surfaceCount: bundle.surfaceCount
    })),
    profilePluginIds: [...(summary.profilePluginIds ?? [])],
    resolvedProfilePluginIds: [...(summary.resolvedProfilePluginIds ?? [])],
    profileCoreBundleIds: [...(summary.profileCoreBundleIds ?? [])],
    providedCapabilities: [...summary.capabilities],
    defaultHostCapabilities: {
      backend: defaultHostCapabilitiesForProfile(summary.profile, "backend", { additionalBundleIds, bundleOverrides }).sort(),
      frontend: defaultHostCapabilitiesForProfile(summary.profile, "frontend", { additionalBundleIds, bundleOverrides }).sort()
    },
    startupRequiredHostCapabilities: {
      backend: startupRequiredHostCapabilitiesForProfile(summary.profile, "backend", { additionalBundleIds, bundleOverrides }).sort(),
      frontend: startupRequiredHostCapabilitiesForProfile(summary.profile, "frontend", { additionalBundleIds, bundleOverrides }).sort()
    },
    installedHostCapabilities: {
      backend: [...(installedHostCapabilities.backend ?? [])].map(String).sort(),
      frontend: [...(installedHostCapabilities.frontend ?? [])].map(String).sort()
    },
    routes: summary.routes.map(route => ({ ...route })),
    governanceRoutes: summary.governanceRoutes.map(route => ({ ...route })),
    proposalTargetGovernance: summary.proposalTargetGovernance.map(row => ({ ...row })),
    surfaces: summary.surfaces.map(surface => ({
      ...surface,
      action: surface.action ? { ...surface.action } : null,
      contexts: [...(surface.contexts ?? [])]
    })),
    authorableHandlers: [...summary.authorableHandlers].sort(),
    pageHandlers: [...summary.pageHandlers].sort(),
    dispatchHandlers: [...summary.dispatchHandlers].sort(),
    handlerMetadata: Object.fromEntries(
      Object.entries(summary.handlerMetadata ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([handlerId, metadata]) => [
          handlerId,
          {
            ...(metadata || {}),
            methods: Array.isArray(metadata?.methods) ? [...metadata.methods] : undefined,
            ownerChain: cloneRuntimeOwnerChain(metadata?.ownerChain)
          }
        ])
    ),
    handlerSets: Object.entries(handlerSetDefinitions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, definition]) => ({
        id,
        ...describeHandlerSetOwnership({
          handlerSetId: id,
          provider: handlerSetProviders?.[id] ?? null,
          handlers: definition?.handlers ?? []
        }),
        handlers: [...(definition?.handlers ?? [])].map(String).sort()
      })),
    shells: {
      ...shellDiagnostics,
      shells: shellDiagnostics.shells.map(shell => ({
        ...shell,
        ...describeShellOwnership(shell.id)
      }))
    },
    composition,
    authoringPolicy: effectiveAuthoringPolicy,
    authoringMatrix: buildRuntimeAuthoringCapabilityMatrix(effectiveAuthoringPolicy),
    operator: operatorContract
      ? {
          ...operatorContract,
          persistence: {
            ...(operatorContract.persistence ?? {}),
            notes: [...(operatorContract.persistence?.notes ?? [])]
          },
          canonicalTruth: { ...(operatorContract.canonicalTruth ?? {}) },
          directories: { ...(operatorContract.directories ?? {}) },
          lifecycle: {
            ...(operatorContract.lifecycle ?? {}),
            supportedFlows: [...(operatorContract.lifecycle?.supportedFlows ?? [])],
            canonicalTruthKinds: [...(operatorContract.lifecycle?.canonicalTruthKinds ?? [])],
            derivedKinds: [...(operatorContract.lifecycle?.derivedKinds ?? [])]
          },
          mutations: operatorState?.mutations
            ? { ...operatorState.mutations }
            : null,
          artifacts: operatorState?.inventory
            ? {
                backups: (operatorState.inventory.backups ?? []).length,
                exports: (operatorState.inventory.exports ?? []).length,
                imports: (operatorState.inventory.imports ?? []).length
              }
            : null,
          recentActivity: (operatorState?.recentActivity ?? []).map(entry => ({
            id: entry.id,
            process: entry.process,
            actor: entry.actor,
            body: { ...(entry.body ?? {}) }
          }))
        }
      : null,
    plugins: pluginCatalogSummary
        ? {
          pluginRoot: pluginCatalogSummary.pluginRoot,
          activeProfile: pluginCatalogSummary.activeProfile,
          profilePluginIds: [...(summary.profilePluginIds ?? [])],
          resolvedProfilePluginIds: [...(summary.resolvedProfilePluginIds ?? [])],
          startupPluginIds: [...startupPluginIds],
          authoredPluginIds: [...authoredPluginIds],
          operatorPluginIds: [...operatorPluginIds],
          effectivePluginIds: [...effectivePluginIds],
          configuredPluginIds: [...configuredPluginIds],
          activePluginIds: [...activePluginIds],
          rejectedPlugins: rejectedPlugins.map(entry => ({
            id: entry.id,
            reasons: [...(entry.reasons ?? [])],
            requestedSources: [...(entry.requestedSources ?? [])]
          })),
          addedBundleIds: [...pluginAddedBundleIds],
          discoveredCount: pluginCatalogSummary.discoveredCount,
          validCount: pluginCatalogSummary.validCount,
          invalidCount: pluginCatalogSummary.invalidCount,
          ignoredCount: pluginCatalogSummary.ignoredCount,
          compatibleCount: pluginCatalogSummary.compatibleCount,
          installableCount: pluginCatalogSummary.installableCount,
          executableCount: pluginCatalogSummary.executableCount,
          requestedCount: pluginCatalogSummary.requestedCount ?? 0,
          eligibleCount: pluginCatalogSummary.eligibleCount ?? 0,
          activeCount: pluginCatalogSummary.activeCount ?? 0,
          rejectedCount: pluginCatalogSummary.rejectedCount ?? 0,
          loadedRuntimeCount: pluginCatalogSummary.loadedRuntimeCount ?? 0,
          failedRuntimeCount: pluginCatalogSummary.failedRuntimeCount ?? 0,
          requestedSourceCounts: { ...(pluginCatalogSummary.requestedSourceCounts ?? {}) },
          trustStateCounts: { ...(pluginCatalogSummary.trustStateCounts ?? {}) }
        }
      : null
  };
}
