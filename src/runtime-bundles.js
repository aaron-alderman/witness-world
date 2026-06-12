import { DEMO_HANDLER_SET_PROVIDER } from "./demo-handler-set.js";
import { runtimeBundleHandlerCatalog } from "./runtime-bundle-handlers.js";
import {
  createAuthoringBundleHandlers,
  createCoreRuntimeBundleHandlers,
  createTutorialBundleHandlers,
  createEdenBundleHandlers,
  createPracticalBackendBackendSeamsHandlers,
  createPracticalBackendAssetSurfaceHandlers,
  createPracticalBackendAssetWorkflowHandlers,
  createCanvasBundleHandlers,
  createPracticalBackendDbSqlHandlers,
  createPracticalBackendFsBlobHandlers,
  createPracticalBackendFsStreamHandlers,
  createInspectBundleHandlers,
  createMcpBundleHandlers,
  createPracticalBackendHttpOutboundHandlers,
  createPracticalBackendJobsHandlers,
  createPracticalBackendNotificationsHandlers,
  createPracticalBackendOauthHandlers,
  createPracticalBackendRuntimeConfigHandlers,
  createPracticalBackendSearchIndexHandlers,
  createPracticalBackendWebhookHandlers
} from "./runtime-bundle-generic-handlers.js";
import {
  CORE_RUNTIME_CAPABILITY_IDS,
  PRACTICAL_BACKEND_CAPABILITY_IDS
} from "./runtime-builtins.js";
import { buildRuntimeShellDiagnostics } from "./runtime-shell-contract.js";

export const DEFAULT_RUNTIME_PROFILE = "full";

/**
 * @typedef {Object} BundleManifest
 * @property {string} id
 * @property {string} version
 * @property {"internal"} kind
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
        bundleHandlerCatalog("bundle-core-runtime"),
        genericHandlerFactory(createCoreRuntimeBundleHandlers)
      ],
      routes: [
        exactRoute("GET", "/api/session", "session.read"),
        exactRoute("POST", "/api/session", "session.open"),
        exactRoute("DELETE", "/api/session", "session.logout"),
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
    id: "bundle-tutorial",
    displayName: "Tutorial",
    description: "Tutorial progress APIs and runtime-owned tutorial continuity.",
    contributes: {
      capabilities: [],
      providers: [
        bundleHandlerCatalog("bundle-tutorial"),
        genericHandlerFactory(createTutorialBundleHandlers)
      ],
      routes: [
        patternRoute("GET", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.read", ["tutorialId"]),
        patternRoute("PUT", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.write", ["tutorialId"]),
        patternRoute("DELETE", /^\/api\/tutorial-progress\/([^/]+)$/, "tutorial.progress.delete", ["tutorialId"])
      ],
      surfaces: []
    }
  }),
  internalBundle({
    id: "bundle-authoring",
    displayName: "Authoring",
    description: "Bootstrap recovery, CRUD authoring flows, proposals, and capability/catalog mutation seams.",
    contributes: {
      capabilities: [],
      providers: [
        bundleHandlerCatalog("bundle-authoring"),
        genericHandlerFactory(createAuthoringBundleHandlers)
      ],
      routes: [
        exactRoute("GET", "/_bootstrap", "bootstrap.page"),
        exactRoute("GET", "/api/bootstrap-model", "bootstrap.model.read"),
        exactRoute("GET", "/api/bootstrap-state", "bootstrap.state.read"),
        exactRoute("GET", "/api/operator/state", "operator.state.read"),
        exactRoute("POST", "/api/operator/backups", "operator.backup"),
        exactRoute("POST", "/api/operator/exports", "operator.export"),
        exactRoute("POST", "/api/operator/restores", "operator.restore"),
        exactRoute("POST", "/api/operator/imports", "operator.import"),
        exactRoute("POST", "/api/contexts", "context.create"),
        exactRoute("POST", "/api/context-bindings", "contextBinding.create"),
        exactRoute("DELETE", "/api/context-bindings", "contextBinding.remove"),
        exactRoute("POST", "/api/context-exports", "contextExport.create"),
        exactRoute("DELETE", "/api/context-exports", "contextExport.remove"),
        exactRoute("POST", "/api/context-imports", "contextImport.create"),
        exactRoute("DELETE", "/api/context-imports", "contextImport.remove"),
        exactRoute("POST", "/api/perspectives", "perspective.create"),
        exactRoute("POST", "/api/stewardships", "stewardship.create"),
        exactRoute("DELETE", "/api/stewardships", "stewardship.remove"),
        exactRoute("POST", "/api/proposals", "proposal.create"),
        patternRoute("POST", /^\/api\/proposals\/([^/]+)\/approve$/, "proposal.approve", ["id"]),
        patternRoute("POST", /^\/api\/proposals\/([^/]+)\/reject$/, "proposal.reject", ["id"]),
        exactRoute("POST", "/api/widgets", "widgets.create"),
        patternRoute("PATCH", /^\/api\/widgets\/([^/]+)$/, "widgets.update", ["id"]),
        exactRoute("POST", "/api/identities", "identity.create"),
        patternRoute("PATCH", /^\/api\/identities\/([^/]+)$/, "identity.update", ["id"]),
        exactRoute("POST", "/api/mcp-servers", "mcpServer.create"),
        exactRoute("POST", "/api/mcp-tool-installs", "mcpTool.install"),
        exactRoute("DELETE", "/api/mcp-tool-installs", "mcpTool.remove"),
        exactRoute("POST", "/api/capabilities", "capability.create"),
        exactRoute("POST", "/api/capability-installs", "capability.install"),
        exactRoute("DELETE", "/api/capability-installs", "capability.remove"),
        exactRoute("POST", "/api/runtime-plugin-installs", "runtimePlugin.install"),
        exactRoute("DELETE", "/api/runtime-plugin-installs", "runtimePlugin.remove"),
        exactRoute("POST", "/api/frontend-programs", "frontendProgram.create"),
        exactRoute("POST", "/api/frontend-steps", "frontendStep.create"),
        exactRoute("POST", "/api/backend-programs", "backendProgram.create"),
        exactRoute("POST", "/api/backend-program-versions", "backendProgramVersion.create"),
        exactRoute("POST", "/api/backend-steps", "backendStep.create"),
        patternRoute("POST", /^\/api\/backend-program-versions\/([^/]+)\/activate$/, "backendProgramVersions.activate", ["soul"]),
        patternRoute("POST", /^\/api\/backend-program-versions\/([^/]+)\/rollback$/, "backendProgramVersions.rollback", ["soul"]),
        exactRoute("POST", "/api/routes", "route.create"),
        exactRoute("POST", "/api/serve-mounts", "serve.create"),
        exactRoute("POST", "/api/server-runners", "serverRunner.create")
      ],
      surfaces: [
        surfaceEntry({
          id: "surface:bootstrap",
          title: "Open Bootstrap",
          subtitle: "Recovery and authoring seam",
          href: "/_bootstrap",
          tier: "harness",
          search: "bootstrap hidden recovery authoring harness /_bootstrap"
        })
      ]
    }
  }),
  internalBundle({
    id: "bundle-inspect",
    displayName: "Inspect",
    description: "World graph, process view, source inspection, and operator-facing inspect surfaces.",
    contributes: {
      capabilities: [],
      providers: [
        bundleHandlerCatalog("bundle-inspect"),
        genericHandlerFactory(createInspectBundleHandlers)
      ],
      routes: [
        exactRoute("GET", "/api/events", "events.stream")
      ],
      surfaces: [
        surfaceEntry({
          id: "surface:world",
          title: "Open World",
          subtitle: "Operating surface / graph and inspectors",
          href: "/world",
          type: "surface",
          tier: "internal",
          contexts: ["app-command"],
          search: "world graph operating surface witnesses source process internal operator /world"
        }),
        surfaceEntry({
          id: "surface:world-mode:graph",
          title: "Show Graph",
          action: { kind: "mode", mode: "graph" },
          subtitle: "Operating surface / graph mode",
          contexts: ["world-command"],
          search: "graph surface world map objects internal operator"
        }),
        surfaceEntry({
          id: "surface:world-mode:things",
          title: "Show Thing List",
          action: { kind: "mode", mode: "things" },
          subtitle: "Operating surface / thing list",
          contexts: ["world-command"],
          search: "things list widgets routes capabilities internal operator"
        }),
        surfaceEntry({
          id: "surface:world-mode:primitive",
          title: "Show Primitive Browser",
          action: { kind: "mode", mode: "primitive" },
          subtitle: "Hidden surface / literals and unresolved refs",
          contexts: ["world-command"],
          search: "primitive browser hidden literals refs values internal operator"
        }),
        surfaceEntry({
          id: "surface:world-mode:witness",
          title: "Show Witness Browser",
          action: { kind: "mode", mode: "witness" },
          subtitle: "Witnessed history for the selected object",
          contexts: ["world-command"],
          search: "witness browser show witnesses selected object history internal operator"
        }),
        surfaceEntry({
          id: "surface:world-mode:source",
          title: "Show Source Browser",
          action: { kind: "mode", mode: "source" },
          subtitle: "Hidden surface / witnessed source definitions",
          contexts: ["world-command"],
          search: "source browser hidden dsl file witnessed source internal operator"
        }),
        surfaceEntry({
          id: "surface:world-mode:process",
          title: "Show Process Explorer",
          action: { kind: "mode", mode: "process" },
          subtitle: "Witnessed execution handoff surface",
          contexts: ["world-command"],
          search: "process explorer witnessed execution runs replay internal operator"
        }),
        surfaceEntry({
          id: "surface:process-view",
          title: "Open Process View",
          subtitle: "Witnessed execution page",
          href: "/process",
          type: "surface",
          tier: "internal",
          search: "process view witnessed execution runs replay internal operator /process"
        })
      ]
    }
  }),
  internalBundle({
    id: "bundle-canvas",
    displayName: "Canvas",
    description: "Canvas projection, canvas process execution, and canvas page rendering.",
    contributes: {
      capabilities: [],
      providers: [
        bundleHandlerCatalog("bundle-canvas"),
        genericHandlerFactory(createCanvasBundleHandlers)
      ],
      routes: [],
      surfaces: []
    }
  }),
  internalBundle({
    id: "bundle-mcp",
    displayName: "MCP",
    description: "MCP HTTP transport routes and runtime-owned MCP execution surface.",
    contributes: {
      capabilities: [],
      providers: [
        bundleHandlerCatalog("bundle-mcp"),
        genericHandlerFactory(createMcpBundleHandlers)
      ],
      routes: [
        patternRoute("POST", /^\/mcp\/([^/]+)$/, "mcp.http", ["id"]),
        patternRoute("GET", /^\/mcp\/([^/]+)$/, "mcp.http", ["id"])
      ],
      surfaces: []
    }
  }),
  internalBundle({
    id: "bundle-practical-backend",
    displayName: "Practical Backend",
    description: "Opt-in backend capabilities: runtime config, SQL, search, jobs, storage, outbound HTTP, OAuth, webhooks, notifications, and backend diagnostics.",
    contributes: {
      capabilities: PRACTICAL_BACKEND_CAPABILITY_IDS,
      providers: [
        {
          kind: "defaultHostCapabilities",
          hostKind: "backend",
          capabilities: [...PRACTICAL_BACKEND_CAPABILITY_IDS]
        },
        bundleHandlerCatalog("bundle-practical-backend"),
        genericHandlerFactory(createPracticalBackendAssetSurfaceHandlers),
        genericHandlerFactory(createPracticalBackendAssetWorkflowHandlers),
        genericHandlerFactory(createPracticalBackendBackendSeamsHandlers),
        genericHandlerFactory(createPracticalBackendOauthHandlers),
        genericHandlerFactory(createPracticalBackendRuntimeConfigHandlers),
        genericHandlerFactory(createPracticalBackendJobsHandlers),
        genericHandlerFactory(createPracticalBackendHttpOutboundHandlers),
        genericHandlerFactory(createPracticalBackendNotificationsHandlers),
        genericHandlerFactory(createPracticalBackendWebhookHandlers),
        genericHandlerFactory(createPracticalBackendDbSqlHandlers),
        genericHandlerFactory(createPracticalBackendFsBlobHandlers),
        genericHandlerFactory(createPracticalBackendFsStreamHandlers),
        genericHandlerFactory(createPracticalBackendSearchIndexHandlers)
      ],
      routes: [
        exactRoute("GET", "/backend-seams", "page.backendSeams"),
        exactRoute("GET", "/api/backend-seams", "backendSeams.read"),
        exactRoute("GET", "/api/runtime-config", "runtimeConfig.read"),
        exactRoute("GET", "/api/db/sql", "db.sql.inspect"),
        exactRoute("POST", "/api/db/sql/migrate", "db.sql.migrate"),
        exactRoute("POST", "/api/db/sql/query", "db.sql.query"),
        exactRoute("POST", "/api/db/sql/command", "db.sql.command"),
        exactRoute("POST", "/api/db/sql/transaction", "db.sql.transaction"),
        exactRoute("GET", "/api/search/index", "search.index.inspect"),
        exactRoute("POST", "/api/search/index/build", "search.index.build"),
        exactRoute("POST", "/api/search/index/reindex", "search.index.reindex"),
        exactRoute("POST", "/api/search/index/query", "search.index.query"),
        exactRoute("POST", "/api/oauth/start", "auth.oauth.start"),
        exactRoute("GET", "/api/oauth/links", "auth.oauth.links.list"),
        patternRoute("GET", /^\/api\/oauth\/links\/([^/]+)$/, "auth.oauth.links.read", ["id"]),
        patternRoute("GET", /^\/api\/oauth\/callback\/([^/]+)$/, "auth.oauth.callback", ["provider"]),
        exactRoute("GET", "/api/http/outbound", "http.outbound.list"),
        exactRoute("POST", "/api/http/outbound", "http.outbound.send"),
        patternRoute("GET", /^\/api\/http\/outbound\/([^/]+)$/, "http.outbound.read", ["id"]),
        exactRoute("GET", "/api/webhooks", "webhook.inbound.list"),
        patternRoute("GET", /^\/api\/webhooks\/([^/]+)$/, "webhook.inbound.read", ["id"]),
        patternRoute("POST", /^\/api\/webhooks\/inbound\/([^/]+)$/, "webhook.inbound.receive", ["target"]),
        exactRoute("GET", "/api/jobs", "jobs.queue.list"),
        exactRoute("POST", "/api/jobs", "jobs.queue.enqueue"),
        patternRoute("GET", /^\/api\/jobs\/([^/]+)$/, "jobs.queue.read", ["id"]),
        exactRoute("POST", "/api/notify/email", "notify.email.enqueue"),
        exactRoute("POST", "/api/notify/sms", "notify.sms.enqueue"),
        exactRoute("GET", "/api/notifications", "notifications.list"),
        patternRoute("GET", /^\/api\/notifications\/([^/]+)$/, "notifications.read", ["id"]),
        exactRoute("GET", "/api/fs/blobs", "fs.blob.list"),
        exactRoute("DELETE", "/api/fs/blobs", "fs.blob.delete"),
        exactRoute("GET", "/api/fs/blobs/meta", "fs.blob.meta"),
        exactRoute("GET", "/api/fs/blobs/content", "fs.blob.read"),
        exactRoute("PUT", "/api/fs/blobs/content", "fs.blob.write"),
        exactRoute("POST", "/api/fs/streams/copy", "fs.stream.copy"),
        exactRoute("GET", "/api/fs/streams/content", "fs.stream.read"),
        exactRoute("PUT", "/api/fs/streams/content", "fs.stream.write"),
        exactRoute("POST", "/api/assets", "asset.upload"),
        patternRoute("GET", /^\/api\/assets\/([^/]+)\/attachments$/, "asset.attachments.list", ["id"]),
        patternRoute("POST", /^\/api\/assets\/([^/]+)\/attachments$/, "asset.attach", ["id"]),
        patternRoute("DELETE", /^\/api\/assets\/([^/]+)\/attachments$/, "asset.detach", ["id"]),
        patternRoute("POST", /^\/api\/assets\/([^/]+)\/ingest\/retry$/, "asset.ingest.retry", ["id"]),
        patternRoute("POST", /^\/api\/assets\/([^/]+)\/search\/reindex$/, "asset.search.reindex", ["id"]),
        patternRoute("GET", /^\/api\/assets\/([^/]+)\/content$/, "asset.content.read", ["id"]),
        patternRoute("GET", /^\/api\/assets\/([^/]+)\/text$/, "asset.text.read", ["id"]),
        patternRoute("GET", /^\/api\/assets\/([^/]+)\/thumbnail$/, "asset.thumbnail.read", ["id"])
      ],
      surfaces: [
        surfaceEntry({
          id: "surface:backend-seams",
          title: "Open Backend Seams",
          subtitle: "Diagnostics surface",
          href: "/backend-seams",
          type: "surface",
          tier: "internal",
          contexts: ["world-command"],
          search: "backend seams diagnostics hidden internal operator /backend-seams"
        })
      ]
    }
  }),
  internalBundle({
    id: "bundle-demo",
    displayName: "Demo",
    description: "Demo handler-set registration and demo-specific startup requirements.",
    contributes: {
      capabilities: [],
      providers: [
        DEMO_HANDLER_SET_PROVIDER,
        {
          kind: "defaultHostCapabilities",
          hostKind: "backend",
          capabilities: ["fs.json.read", "fs.json.write"]
        },
        {
          kind: "startupRequiredHostCapabilities",
          hostKind: "backend",
          capabilities: ["fs.json.read", "fs.json.write"]
        }
      ],
      routes: [],
      surfaces: []
    }
  }),
  internalBundle({
    id: "bundle-eden",
    displayName: "Eden",
    description: "Eden neighborhood, academy, versions, capability-install, and commons flows.",
    contributes: {
      capabilities: [],
      providers: [
        bundleHandlerCatalog("bundle-eden"),
        genericHandlerFactory(createEdenBundleHandlers)
      ],
      routes: [],
      surfaces: []
    }
  })
];

const BUNDLE_BY_ID = new Map(INTERNAL_BUNDLE_MANIFESTS.map(bundle => [bundle.id, bundle]));

const RUNTIME_PROFILES = Object.freeze({
  minimal: Object.freeze(["bundle-core-runtime"]),
  authoring: Object.freeze(["bundle-core-runtime", "bundle-tutorial", "bundle-authoring"]),
  inspect: Object.freeze(["bundle-core-runtime", "bundle-inspect"]),
  "practical-backend": Object.freeze(["bundle-core-runtime", "bundle-practical-backend"]),
  full: Object.freeze(INTERNAL_BUNDLE_MANIFESTS.map(bundle => bundle.id))
});

function cloneSurface(surface) {
  return {
    ...surface,
    action: surface?.action ? { ...surface.action } : null,
    contexts: [...(surface.contexts ?? [])]
  };
}

function normalizeProfileName(profileName) {
  return Object.prototype.hasOwnProperty.call(RUNTIME_PROFILES, profileName)
    ? profileName
    : DEFAULT_RUNTIME_PROFILE;
}

export function availableRuntimeProfiles() {
  return Object.keys(RUNTIME_PROFILES);
}

export function availableRuntimeBundleIds() {
  return INTERNAL_BUNDLE_MANIFESTS.map(bundle => bundle.id);
}

export function runtimeBundleManifest(bundleId) {
  const bundle = BUNDLE_BY_ID.get(String(bundleId || ""));
  if (!bundle) return null;
  const handlerCatalog = runtimeBundleHandlerCatalog(bundle.id);
  return {
    ...bundle,
    handlerCatalog: {
      authorableHandlers: [...handlerCatalog.authorableHandlers],
      pageHandlers: [...handlerCatalog.pageHandlers],
      dispatchHandlers: [...handlerCatalog.dispatchHandlers],
      handlerMetadata: Object.fromEntries(
        Object.entries(handlerCatalog.handlerMetadata ?? {})
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([handlerId, entry]) => [
            handlerId,
            {
              ...(entry || {}),
              methods: Array.isArray(entry?.methods) ? [...entry.methods] : undefined
            }
          ])
      )
    },
    contributes: {
      capabilities: [...bundle.contributes.capabilities],
      providers: [...bundle.contributes.providers],
      routes: bundle.contributes.routes.map(route => ({
        ...route,
        handlerMetadata: handlerCatalog.handlerMetadata?.[String(route.handler)] ? {
          ...(handlerCatalog.handlerMetadata[String(route.handler)] || {}),
          methods: Array.isArray(handlerCatalog.handlerMetadata[String(route.handler)]?.methods)
            ? [...handlerCatalog.handlerMetadata[String(route.handler)].methods]
            : undefined
        } : undefined
      })),
      surfaces: bundle.contributes.surfaces.map(cloneSurface)
    },
    dependsOn: [...bundle.dependsOn]
  };
}

export function runtimeBundleManifests() {
  return INTERNAL_BUNDLE_MANIFESTS.map(bundle => runtimeBundleManifest(bundle.id));
}

export function resolveRuntimeComposition({
  profileName = DEFAULT_RUNTIME_PROFILE,
  additionalBundleIds = []
} = {}) {
  const id = normalizeProfileName(profileName);
  const bundleIds = [];
  const seen = new Set();
  for (const bundleId of [...RUNTIME_PROFILES[id], ...additionalBundleIds.map(String)]) {
    if (!BUNDLE_BY_ID.has(bundleId) || seen.has(bundleId)) continue;
    seen.add(bundleId);
    bundleIds.push(bundleId);
  }
  return {
    id,
    bundleIds,
    bundles: bundleIds.map(bundleId => BUNDLE_BY_ID.get(bundleId)).filter(Boolean)
  };
}

function compositionOptions(options = {}) {
  return {
    additionalBundleIds: [...(options.additionalBundleIds ?? [])].map(String)
  };
}

function selectedComposition(profileName, options = {}) {
  const resolved = resolveRuntimeComposition({
    profileName,
    additionalBundleIds: compositionOptions(options).additionalBundleIds
  });
  return resolved;
}

export function resolveRuntimeProfile(profileName = DEFAULT_RUNTIME_PROFILE) {
  return resolveRuntimeComposition({ profileName });
}

export function resolveRuntimeProfileStrict(profileName = DEFAULT_RUNTIME_PROFILE) {
  const normalized = String(profileName || DEFAULT_RUNTIME_PROFILE);
  if (!Object.prototype.hasOwnProperty.call(RUNTIME_PROFILES, normalized)) {
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

export function providedCapabilityIdsForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const ids = new Set();
  for (const bundle of selectedComposition(profileName, options).bundles) {
    for (const capabilityId of bundle.contributes.capabilities) ids.add(String(capabilityId));
  }
  return [...ids];
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
  return selectedComposition(profileName, options).bundles.flatMap(bundle => bundle.contributes.routes);
}

export function matchRuntimeBundleRoute(profileName = DEFAULT_RUNTIME_PROFILE, method, pathname, options = {}) {
  const targetMethod = String(method || "GET").toUpperCase();
  const targetPath = String(pathname || "");
  for (const route of runtimeRouteEntriesForProfile(profileName, options)) {
    if (String(route.method || "GET").toUpperCase() !== targetMethod) continue;
    if (route.kind === "exact") {
      if (route.path !== targetPath) continue;
      return { handler: route.handler, params: { ...(route.params ?? {}) } };
    }
    if (route.kind === "pattern") {
      const match = targetPath.match(route.pattern);
      if (!match) continue;
      const params = {};
      for (let index = 0; index < route.paramNames.length; index += 1) {
        params[route.paramNames[index]] = decodeURIComponent(match[index + 1] || "");
      }
      return { handler: route.handler, params };
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

export function bundleIdsForHandlerSet(handlerSetId = "") {
  const targetId = String(handlerSetId || "").trim();
  if (!targetId) return [];
  const bundleIds = [];
  for (const bundle of INTERNAL_BUNDLE_MANIFESTS) {
    if (bundle.contributes.providers.some(provider => provider?.kind === "handlerSet" && provider.id === targetId)) {
      bundleIds.push(bundle.id);
    }
  }
  return bundleIds;
}

export function genericHandlerFactoriesForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  return genericHandlerFactoriesForBundleIds(selectedComposition(profileName, options).bundleIds);
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
        metadata[String(handlerId)] = { ...(entry || {}) };
      }
    }
  }
  return metadata;
}

export function runtimeBundleSummaryForProfile(profileName = DEFAULT_RUNTIME_PROFILE, options = {}) {
  const resolved = selectedComposition(profileName, options);
  const handlerMetadata = handlerMetadataForProfile(resolved.id, options);
  return {
    profile: resolved.id,
    bundleIds: [...resolved.bundleIds],
    bundles: resolved.bundles.map(bundle => ({
      id: bundle.id,
      kind: bundle.kind,
      displayName: bundle.displayName,
      description: bundle.description,
      dependsOn: [...bundle.dependsOn],
      capabilityCount: bundle.contributes.capabilities.length,
      providerCount: bundle.contributes.providers.length,
      routeCount: bundle.contributes.routes.length,
      surfaceCount: bundle.contributes.surfaces.length
    })),
    capabilities: providedCapabilityIdsForProfile(resolved.id, options).sort(),
    authorableHandlers: authorableHandlerIdsForProfile(resolved.id, options),
    pageHandlers: pageHandlerIdsForProfile(resolved.id, options),
    dispatchHandlers: dispatchHandlerIdsForProfile(resolved.id, options),
    handlerMetadata,
    routes: runtimeRouteEntriesForProfile(resolved.id, options).map(route => ({
      method: route.method,
      matcher: route.kind === "exact" ? route.path : String(route.pattern),
      handler: route.handler,
      handlerMetadata: handlerMetadata[String(route.handler)] ? {
        ...(handlerMetadata[String(route.handler)] || {}),
        methods: Array.isArray(handlerMetadata[String(route.handler)]?.methods)
          ? [...handlerMetadata[String(route.handler)].methods]
          : undefined
      } : undefined
    })),
    surfaces: runtimeSurfaceEntriesForProfile(resolved.id, null, options).map(surface => ({
      id: surface.id,
      href: surface.href,
      action: surface.action ? { ...surface.action } : null,
      tier: surface.tier,
      contexts: [...(surface.contexts ?? [])]
    }))
  };
}

export function buildRuntimeDiagnosticsForProfile({
  requestedProfile = null,
  profileName = DEFAULT_RUNTIME_PROFILE,
  additionalBundleIds = [],
  startupRunner = null,
  startupMode = "serve",
  installedHostCapabilities = {},
  handlerSetDefinitions = {},
  operatorContract = null,
  operatorState = null,
  pluginCatalogSummary = null,
  configuredPluginIds = [],
  authoredPluginIds = [],
  operatorPluginIds = [],
  effectivePluginIds = [],
  activePluginIds = [],
  rejectedPlugins = [],
  pluginAddedBundleIds = []
} = {}) {
  const summary = runtimeBundleSummaryForProfile(profileName, { additionalBundleIds });
  return {
    requestedProfile: requestedProfile ?? profileName,
    activeProfile: summary.profile,
    availableProfiles: availableRuntimeProfiles(),
    startupRunner: startupRunner ? {
      id: startupRunner.id ?? null,
      backendHost: startupRunner.backendHost ?? null,
      frontendHost: startupRunner.frontendHost ?? null,
      handlerSet: startupRunner.handlerSet ?? null,
      bootstrapOnly: startupRunner.bootstrapOnly === true
    } : null,
    activeBundles: summary.bundles.map(bundle => ({
      id: bundle.id,
      kind: bundle.kind,
      displayName: bundle.displayName,
      description: bundle.description,
      dependsOn: [...bundle.dependsOn],
      capabilityCount: bundle.capabilityCount,
      providerCount: bundle.providerCount,
      routeCount: bundle.routeCount,
      surfaceCount: bundle.surfaceCount
    })),
    providedCapabilities: [...summary.capabilities],
    defaultHostCapabilities: {
      backend: defaultHostCapabilitiesForProfile(summary.profile, "backend", { additionalBundleIds }).sort(),
      frontend: defaultHostCapabilitiesForProfile(summary.profile, "frontend", { additionalBundleIds }).sort()
    },
    startupRequiredHostCapabilities: {
      backend: startupRequiredHostCapabilitiesForProfile(summary.profile, "backend", { additionalBundleIds }).sort(),
      frontend: startupRequiredHostCapabilitiesForProfile(summary.profile, "frontend", { additionalBundleIds }).sort()
    },
    installedHostCapabilities: {
      backend: [...(installedHostCapabilities.backend ?? [])].map(String).sort(),
      frontend: [...(installedHostCapabilities.frontend ?? [])].map(String).sort()
    },
    routes: summary.routes.map(route => ({ ...route })),
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
            methods: Array.isArray(metadata?.methods) ? [...metadata.methods] : undefined
          }
        ])
    ),
    handlerSets: Object.entries(handlerSetDefinitions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, definition]) => ({
        id,
        handlers: [...(definition?.handlers ?? [])].map(String).sort()
      })),
    shells: buildRuntimeShellDiagnostics({
      activeBundleIds: summary.bundleIds,
      startupMode
    }),
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
          trustStateCounts: { ...(pluginCatalogSummary.trustStateCounts ?? {}) }
        }
      : null
  };
}
