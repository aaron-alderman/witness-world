import { relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { runtimeCompositionStory } from "../../src/runtime-bundles.js";
import {
  requestBootstrapContextDefine,
  requestSurfaceDefine,
  requestProcessDefine,
  requestTypeDefine,
  requestProjectionDefine,
  requestMessageDefine,
  requestBootstrapRouteDefine,
  requestBootstrapServeDefine
} from "../authoring-core/authoring-core-processes.js";
import {
  requestBootstrapServerRunnerDefine,
  requestBootstrapRuntimePluginInstall
} from "../server-runner-authoring/server-runner-processes.js";
import { buildBootstrapAuthoredRequestPlanRequests } from "./bootstrap-authored-request-plan.js";
import { resolveBootstrapStarterPlanDynamicValues } from "./bootstrap-starter-plan-hosts.js";

export const BOOTSTRAP_APP_BOUNDARY_IDS = Object.freeze({
  context: "bootstrap.app",
  serverRunner: "demo_server",
  route: "home_route",
  type: "bootstrap.app.surface.state",
  process: "bootstrap.app.surface.process",
  message: "bootstrap.app.surface.message",
  projection: "bootstrap.app.surface.projection",
  rootSurface: "bootstrap.app.surface.root",
  homeSurface: "bootstrap.app.surface.home",
  homeTextSurface: "bootstrap.app.surface.home.text"
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map(key => [key, stableValue(value[key])])
    );
  }
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function witnessRowsByProcess(world, process) {
  const rows = new Map();
  for (const witness of world.allWitnesses()) {
    if (witness?.process !== process || !witness.body?.id) continue;
    rows.set(String(witness.body.id), clone(witness.body));
  }
  return rows;
}

function authoredBoundaryProjection(world) {
  const runtimePluginInstalls = world.project(moduleProjectors.runtimePluginInstalls);
  return {
    contexts: world.project(moduleProjectors.contexts),
    serverRunners: world.project(moduleProjectors.serverRunners),
    routes: world.project(moduleProjectors.routes),
    servedRoutes: world.project(moduleProjectors.servedRoutes),
    runtimePluginInstalls,
    runtimePluginInstallPairs: runtimePluginInstalls.map(row => ({
      key: `${row.serverRunner}::${row.plugin}`,
      serverRunner: row.serverRunner,
      plugin: row.plugin
    })),
    serveMountPairs: world.project(moduleProjectors.servedRoutes).map(row => ({
      key: `${row.serverRunner}::${row.id}`,
      serverRunner: row.serverRunner,
      route: row.id
    })),
    types: [...witnessRowsByProcess(world, "desire.defineType").values()],
    processes: [...witnessRowsByProcess(world, "desire.defineProcess").values()],
    messages: [...witnessRowsByProcess(world, "desire.defineMessage").values()],
    projections: [...witnessRowsByProcess(world, "desire.defineProjection").values()],
    surfaces: [...witnessRowsByProcess(world, "desire.defineSurface").values()]
  };
}

function canonicalSurfaceDocs() {
  return [
    {
      id: BOOTSTRAP_APP_BOUNDARY_IDS.homeTextSurface,
      context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
      surfaceKind: "text",
      props: {
        domId: "bootstrap-app-boundary-live-status",
        text: "Pending authored boundary projection"
      },
      bindings: [
        { prop: "text", source: { kind: "projection", projection: BOOTSTRAP_APP_BOUNDARY_IDS.projection } }
      ]
    },
    {
      id: BOOTSTRAP_APP_BOUNDARY_IDS.homeSurface,
      context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
      surfaceKind: "content-panel",
      props: {
        routePath: "/",
        title: "Authored App Boundary",
        body: "This page is now mounted from an authored page.surface boundary through shared runtime rules."
      },
      children: [BOOTSTRAP_APP_BOUNDARY_IDS.homeTextSurface]
    },
    {
      id: BOOTSTRAP_APP_BOUNDARY_IDS.rootSurface,
      context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
      surfaceKind: "app-root",
      processRef: BOOTSTRAP_APP_BOUNDARY_IDS.process,
      children: [BOOTSTRAP_APP_BOUNDARY_IDS.homeSurface]
    }
  ];
}

export function buildBootstrapAppBoundaryPlan({
  bootstrapModel = null
} = {}) {
  const dynamicValues = resolveBootstrapStarterPlanDynamicValues({ bootstrapModel });
  return {
    contexts: [
      {
        id: BOOTSTRAP_APP_BOUNDARY_IDS.context,
        label: "Authored App Boundary"
      }
    ],
    serverRunners: [
      {
        id: BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner,
        context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
        backendHost: "backendHost",
        frontendHost: "frontendHost",
        runtimeProfile: "minimal"
      }
    ],
    runtimePluginInstalls: [
      {
        key: `${BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner}::plugin.authoring`,
        serverRunner: BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner,
        plugin: "plugin.authoring"
      },
      {
        key: `${BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner}::plugin.inspect`,
        serverRunner: BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner,
        plugin: "plugin.inspect"
      }
    ],
    types: [
      {
        id: BOOTSTRAP_APP_BOUNDARY_IDS.type,
        context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
        role: "state",
        valueType: "text",
        initial: "App boundary: authored page.surface active"
      }
    ],
    processes: [
      {
        id: BOOTSTRAP_APP_BOUNDARY_IDS.process,
        context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
        state: [BOOTSTRAP_APP_BOUNDARY_IDS.type],
        handles: [BOOTSTRAP_APP_BOUNDARY_IDS.message],
        emits: [],
        rules: []
      }
    ],
    messages: [
      {
        id: BOOTSTRAP_APP_BOUNDARY_IDS.message,
        context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
        role: "event",
        writes: {
          [BOOTSTRAP_APP_BOUNDARY_IDS.type]: "App boundary: authored page.surface active"
        }
      }
    ],
    projections: [
      {
        id: BOOTSTRAP_APP_BOUNDARY_IDS.projection,
        context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
        projectionKind: "format",
        source: BOOTSTRAP_APP_BOUNDARY_IDS.type,
        props: {
          prefix: ""
        }
      }
    ],
    surfaces: canonicalSurfaceDocs(),
    routes: [
      {
        id: BOOTSTRAP_APP_BOUNDARY_IDS.route,
        context: BOOTSTRAP_APP_BOUNDARY_IDS.context,
        path: "/",
        method: "GET",
        handler: "page.surface",
        serves: BOOTSTRAP_APP_BOUNDARY_IDS.rootSurface,
        rootSurface: BOOTSTRAP_APP_BOUNDARY_IDS.rootSurface,
        defaultScreen: BOOTSTRAP_APP_BOUNDARY_IDS.homeSurface
      }
    ],
    serveMounts: [
      {
        key: `${BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner}::${BOOTSTRAP_APP_BOUNDARY_IDS.route}`,
        serverRunner: BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner,
        route: BOOTSTRAP_APP_BOUNDARY_IDS.route
      }
    ],
    requestPlan: [
      { from: "contexts", url: "/api/contexts", skipIfPresentIn: "contexts" },
      { from: "serverRunners", url: "/api/server-runners", skipIfPresentIn: "serverRunners" },
      { from: "runtimePluginInstalls", url: "/api/runtime-plugin-installs", skipIfPresentIn: "runtimePluginInstallPairs", matchField: "key" },
      { from: "types", url: "/api/types", skipIfPresentIn: "types" },
      { from: "processes", url: "/api/processes", skipIfPresentIn: "processes" },
      { from: "messages", url: "/api/messages", skipIfPresentIn: "messages" },
      { from: "projections", url: "/api/projections", skipIfPresentIn: "projections" },
      { from: "surfaces", url: "/api/surfaces", skipIfPresentIn: "surfaces" },
      { from: "routes", url: "/api/routes", skipIfPresentIn: "routes" },
      { from: "serveMounts", url: "/api/serve-mounts", skipIfPresentIn: "serveMountPairs", matchField: "key" }
    ],
    dynamicValues
  };
}

function currentBootstrapBoundaryPieces(world) {
  const authored = authoredBoundaryProjection(world);
  return {
    authored,
    context: authored.contexts.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.context) ?? null,
    serverRunner: authored.serverRunners.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner) ?? null,
    rootRoute: authored.routes.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.route) ?? null,
    servedHomeRoute: authored.servedRoutes.find(row =>
      row.id === BOOTSTRAP_APP_BOUNDARY_IDS.route
      && String(row.method || "").toUpperCase() === "GET"
      && row.path === "/"
      && row.serverRunner === BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner
    ) ?? null,
    anyHomeRoute: authored.routes.find(row =>
      String(row.method || "").toUpperCase() === "GET"
      && row.path === "/"
    ) ?? null,
    anyServedHomeRoute: authored.servedRoutes.find(row =>
      String(row.method || "").toUpperCase() === "GET"
      && row.path === "/"
    ) ?? null,
    type: authored.types.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.type) ?? null,
    process: authored.processes.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.process) ?? null,
    message: authored.messages.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.message) ?? null,
    projection: authored.projections.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.projection) ?? null,
    rootSurface: authored.surfaces.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.rootSurface) ?? null,
    homeSurface: authored.surfaces.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.homeSurface) ?? null,
    homeTextSurface: authored.surfaces.find(row => row.id === BOOTSTRAP_APP_BOUNDARY_IDS.homeTextSurface) ?? null
  };
}

function normalizeRunnerDoc(doc = {}) {
  return {
    id: doc.id,
    context: doc.context ?? null,
    backendHost: doc.backendHost ?? null,
    frontendHost: doc.frontendHost ?? null
  };
}

function normalizeRouteDoc(doc = {}) {
  return {
    id: doc.id,
    context: doc.context ?? null,
    path: doc.path,
    method: doc.method,
    handler: doc.handler,
    serves: doc.serves ?? null,
    params: {
      rootSurface: doc.params?.rootSurface ?? doc.rootSurface ?? null,
      defaultScreen: doc.params?.defaultScreen ?? doc.defaultScreen ?? null
    }
  };
}

function normalizeContextDoc(doc = {}) {
  return {
    id: doc.id,
    label: doc.label ?? doc.id,
    parent: doc.parent ?? null
  };
}

function normalizeTypeDoc(doc = {}) {
  return {
    id: doc.id,
    role: doc.role ?? null,
    field: doc.field ?? null,
    versionKind: doc.versionKind ?? null,
    valueType: doc.valueType ?? null,
    initial: doc.initial ?? null
  };
}

function normalizeProcessDoc(doc = {}) {
  return {
    id: doc.id,
    state: [...(doc.state || [])],
    handles: [...(doc.handles || [])],
    emits: [...(doc.emits || [])],
    rules: [...(doc.rules || [])]
  };
}

function normalizeMessageDoc(doc = {}) {
  return {
    id: doc.id,
    role: doc.role ?? null,
    fields: [...(doc.fields || [])],
    writes: doc.writes ?? {}
  };
}

function normalizeProjectionDoc(doc = {}) {
  return {
    id: doc.id,
    projectionKind: doc.projectionKind ?? null,
    source: doc.source ?? null,
    props: doc.props ?? {}
  };
}

function normalizeSurfaceDoc(doc = {}) {
  return {
    id: doc.id,
    surfaceKind: doc.surfaceKind ?? null,
    className: doc.className ?? null,
    children: [...(doc.children || [])],
    props: doc.props ?? {},
    processRef: doc.processRef ?? null,
    projectionRefs: [...(doc.projectionRefs || [])],
    capabilityRefs: [...(doc.capabilityRefs || [])],
    bindings: [...(doc.bindings || [])],
    interactions: [...(doc.interactions || [])],
    repeat: doc.repeat ?? null,
    modelRef: doc.modelRef ?? null,
    frame: doc.frame ?? null,
    encoding: doc.encoding ?? {},
    editable: [...(doc.editable || [])],
    layers: [...(doc.layers || [])]
  };
}

function normalizedPlanSummary(plan, authoredState) {
  const requests = buildBootstrapAuthoredRequestPlanRequests({
    plan,
    authoredState,
    dynamicValues: plan.dynamicValues
  });
  const byUrl = new Map();
  for (const request of requests) {
    const bucket = byUrl.get(request.url) ?? [];
    bucket.push(clone(request.body));
    byUrl.set(request.url, bucket);
  }
  return {
    requests,
    summary: {
      contexts: byUrl.get("/api/contexts") ?? [],
      serverRunners: byUrl.get("/api/server-runners") ?? [],
      runtimePluginInstalls: byUrl.get("/api/runtime-plugin-installs") ?? [],
      types: byUrl.get("/api/types") ?? [],
      processes: byUrl.get("/api/processes") ?? [],
      messages: byUrl.get("/api/messages") ?? [],
      projections: byUrl.get("/api/projections") ?? [],
      surfaces: byUrl.get("/api/surfaces") ?? [],
      routes: byUrl.get("/api/routes") ?? [],
      serveMounts: byUrl.get("/api/serve-mounts") ?? []
    }
  };
}

function buildBlockedReasons(world, plan) {
  const reasons = [];
  const pieces = currentBootstrapBoundaryPieces(world);
  const canonicalContext = plan.contexts[0];
  const canonicalRunner = plan.serverRunners[0];
  const canonicalRoute = plan.routes[0];
  const canonicalType = plan.types[0];
  const canonicalProcess = plan.processes[0];
  const canonicalMessage = plan.messages[0];
  const canonicalProjection = plan.projections[0];
  const canonicalSurfaces = new Map(plan.surfaces.map(row => [row.id, row]));
  const existingHomeRoute = pieces.anyHomeRoute;
  const existingMountedHome = pieces.anyServedHomeRoute;
  if (existingHomeRoute && existingHomeRoute.id !== BOOTSTRAP_APP_BOUNDARY_IDS.route) {
    reasons.push(`path / already belongs to authored route ${existingHomeRoute.id}`);
  }
  if (
    existingMountedHome
    && (
      existingMountedHome.id !== BOOTSTRAP_APP_BOUNDARY_IDS.route
      || existingMountedHome.serverRunner !== BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner
    )
  ) {
    reasons.push(`path / is already mounted by ${existingMountedHome.id} on server runner ${existingMountedHome.serverRunner}`);
  }
  if (pieces.context && !sameValue(normalizeContextDoc(pieces.context), normalizeContextDoc(canonicalContext))) {
    reasons.push(`context ${BOOTSTRAP_APP_BOUNDARY_IDS.context} already exists with conflicting definition`);
  }
  if (pieces.serverRunner && !sameValue(normalizeRunnerDoc(pieces.serverRunner), normalizeRunnerDoc(canonicalRunner))) {
    reasons.push(`server runner ${BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner} already exists with conflicting wiring`);
  }
  if (pieces.rootRoute && !sameValue(normalizeRouteDoc(pieces.rootRoute), normalizeRouteDoc(canonicalRoute))) {
    reasons.push(`route ${BOOTSTRAP_APP_BOUNDARY_IDS.route} already exists with conflicting handler or params`);
  }
  if (pieces.type && !sameValue(normalizeTypeDoc(pieces.type), normalizeTypeDoc(canonicalType))) {
    reasons.push(`type ${BOOTSTRAP_APP_BOUNDARY_IDS.type} already exists with conflicting authored state`);
  }
  if (pieces.process && !sameValue(normalizeProcessDoc(pieces.process), normalizeProcessDoc(canonicalProcess))) {
    reasons.push(`process ${BOOTSTRAP_APP_BOUNDARY_IDS.process} already exists with conflicting authored state`);
  }
  if (pieces.message && !sameValue(normalizeMessageDoc(pieces.message), normalizeMessageDoc(canonicalMessage))) {
    reasons.push(`message ${BOOTSTRAP_APP_BOUNDARY_IDS.message} already exists with conflicting authored state`);
  }
  if (pieces.projection && !sameValue(normalizeProjectionDoc(pieces.projection), normalizeProjectionDoc(canonicalProjection))) {
    reasons.push(`projection ${BOOTSTRAP_APP_BOUNDARY_IDS.projection} already exists with conflicting authored state`);
  }
  for (const [id, canonicalSurface] of canonicalSurfaces.entries()) {
    const existingSurface = pieces.authored.surfaces.find(row => row.id === id) ?? null;
    if (existingSurface && !sameValue(normalizeSurfaceDoc(existingSurface), normalizeSurfaceDoc(canonicalSurface))) {
      reasons.push(`surface ${id} already exists with conflicting authored state`);
    }
  }
  return [...new Set(reasons)];
}

function buildMissingKinds(planSummary) {
  const missing = [];
  if ((planSummary.serverRunners || []).length) missing.push("serverRunner");
  if ((planSummary.runtimePluginInstalls || []).length) missing.push("runtimePluginInstall");
  if (
    (planSummary.types || []).length
    || (planSummary.processes || []).length
    || (planSummary.messages || []).length
    || (planSummary.projections || []).length
    || (planSummary.surfaces || []).length
  ) {
    missing.push("surface");
  }
  if ((planSummary.routes || []).length) missing.push("route");
  if ((planSummary.serveMounts || []).length) missing.push("serveMount");
  return missing;
}

async function runtimePluginInstallabilityIssues({
  planSummary,
  getRuntimePluginCatalog,
  runtimeProfile
}) {
  if (!(planSummary.runtimePluginInstalls || []).length) return [];
  const catalog = await getRuntimePluginCatalog({
    activeProfile: runtimeProfile,
    serverRunnerId: BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner
  });
  const available = new Map((catalog?.packages || []).map(row => [row.id, row]));
  const issues = [];
  for (const install of planSummary.runtimePluginInstalls || []) {
    const plugin = available.get(install.plugin) ?? null;
    if (!plugin) {
      issues.push(`runtime plugin package ${install.plugin} is not available for authored boundary installation`);
      continue;
    }
    if (plugin.validation?.ok === false) {
      issues.push(`runtime plugin package ${install.plugin} is invalid`);
      continue;
    }
    if (plugin.execution?.executable === false) {
      issues.push(`runtime plugin package ${install.plugin} is metadata-only`);
      continue;
    }
    if (plugin.compatibility?.compatible === false) {
      issues.push(`runtime plugin package ${install.plugin} is incompatible with the active runtime profile`);
    }
  }
  return [...new Set(issues)];
}

function boundaryRootComposition({
  world,
  runtimeBundleSummary,
  appContext,
  runtimePluginIds = []
} = {}) {
  const servedRoutes = world.project(moduleProjectors.servedRoutes);
  const serverRunners = world.project(moduleProjectors.serverRunners);
  const runtimePluginInstalls = world.project(moduleProjectors.runtimePluginInstalls);
  const mountedRoot = servedRoutes.find(row =>
    String(row.method || "").toUpperCase() === "GET"
    && row.path === "/"
  ) ?? null;
  const mountedRunner = mountedRoot?.serverRunner
    ? serverRunners.find(row => row.id === mountedRoot.serverRunner) ?? null
    : null;
  const routePluginIds = mountedRunner
    ? runtimePluginInstalls
      .filter(row => row.serverRunner === mountedRunner.id)
      .map(row => row.plugin)
    : runtimePluginIds;
  const composition = mountedRunner
    ? runtimeCompositionStory({
      startupRunner: {
        id: mountedRunner.id,
        backendHost: mountedRunner.backendHost ?? null,
        frontendHost: mountedRunner.frontendHost ?? null,
        bootstrapOnly: false
      },
      startupMode: appContext?.runtimeStartupMode ?? "serve",
      authoredPluginIds: routePluginIds,
      effectivePluginIds: routePluginIds
    })
    : runtimeCompositionStory({
      startupRunner: {
        id: appContext?.serverRunnerId ?? "__bootstrap__",
        backendHost: appContext?.backendHost ?? null,
        frontendHost: appContext?.frontendHost ?? null,
        bootstrapOnly: appContext?.bootstrapOnly !== false,
        startupOwned: appContext?.startupRunnerOwned === true
      },
      startupMode: appContext?.runtimeStartupMode ?? "serve",
      startupPluginIds: appContext?.startupRuntimePluginIds ?? [],
      operatorPluginIds: appContext?.operatorRuntimePluginIds ?? [],
      effectivePluginIds: appContext?.effectiveRuntimePluginIds ?? runtimePluginIds
    });
  if (!mountedRoot) {
    return {
      path: "/",
      routeId: null,
      handler: null,
      serverRunner: null,
      source: "bootstrap-fallback",
      note: "Bootstrap currently owns / until an authored page.surface route is mounted.",
      ...composition
    };
  }
  return {
    path: "/",
    routeId: mountedRoot.id ?? null,
    handler: mountedRoot.handler ?? null,
    serverRunner: mountedRoot.serverRunner ?? null,
    source: composition.usesAuthoredServerRunner ? "authored-route" : "synthetic-route",
    note: composition.usesAuthoredServerRunner
      ? `Authored route ${mountedRoot.id} currently owns / through server runner ${mountedRoot.serverRunner}.`
      : `Route ${mountedRoot.id} is mounted on / but runtime composition is still synthetic.`,
    ...composition
  };
}

function bootstrapRecoveryComposition(runtimeBundleSummary = null) {
  const bootstrapRoute = (runtimeBundleSummary?.routes || []).find(route =>
    String(route?.method || "").toUpperCase() === "GET"
    && route?.path === "/_bootstrap"
  ) ?? null;
  return {
    path: "/_bootstrap",
    routeId: bootstrapRoute ? "route:GET /_bootstrap" : null,
    handler: bootstrapRoute?.handler ?? "bootstrap.page",
    source: "recovery-surface",
    note: "/_bootstrap remains the operator and recovery surface; it is not the live app boundary."
  };
}

export async function readBootstrapAppBoundaryState({
  world,
  runtimeBundleSummary = null,
  bootstrapModel = null,
  runtimeProfile = "full",
  getRuntimePluginCatalog = async () => ({ packages: [] }),
  appContext = null
} = {}) {
  const plan = buildBootstrapAppBoundaryPlan({ bootstrapModel });
  const authoredState = authoredBoundaryProjection(world);
  const { summary: planSummary } = normalizedPlanSummary(plan, authoredState);
  const blockedReasons = buildBlockedReasons(world, plan);
  const pluginIssues = await runtimePluginInstallabilityIssues({
    planSummary,
    getRuntimePluginCatalog,
    runtimeProfile
  });
  const allBlockedReasons = [...blockedReasons, ...pluginIssues];
  const missingKinds = buildMissingKinds(planSummary);
  const composition = {
    root: boundaryRootComposition({
      world,
      runtimeBundleSummary,
      appContext,
      runtimePluginIds: world.project(moduleProjectors.runtimePluginInstalls)
        .filter(row => row.serverRunner === BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner)
        .map(row => row.plugin)
    }),
    bootstrap: bootstrapRecoveryComposition(runtimeBundleSummary)
  };
  const canonicalRootActive = composition.root.routeId === BOOTSTRAP_APP_BOUNDARY_IDS.route
    && composition.root.handler === "page.surface"
    && composition.root.serverRunner === BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner
    && composition.root.usesAuthoredServerRunner === true
    && composition.root.usesAuthoredRuntimePluginInstalls === true
    && missingKinds.length === 0;
  const emptyMissingKinds = emptyBoundaryStateLength();
  const status = allBlockedReasons.length
    ? "blocked"
    : (canonicalRootActive
      ? "authoredActive"
      : (missingKinds.length === emptyMissingKinds
        ? "missing"
        : (missingKinds.length ? "partial" : "authoredActive")));
  return {
    status,
    missingKinds,
    blockedReasons: allBlockedReasons,
    planSummary,
    composition
  };
}

function emptyBoundaryStateLength() {
  const plan = buildBootstrapAppBoundaryPlan({});
  return buildMissingKinds(normalizedPlanSummary(plan, {
    contexts: [],
    serverRunners: [],
    runtimePluginInstallPairs: [],
    types: [],
    processes: [],
    messages: [],
    projections: [],
    surfaces: [],
    routes: [],
    serveMountPairs: []
  }).summary).length;
}

function classifyBoundaryStatus(boundary) {
  if ((boundary?.blockedReasons || []).length) return "blocked";
  if (boundary?.status === "authoredActive") return "authoredActive";
  return (boundary?.missingKinds || []).length === emptyBoundaryStateLength() ? "missing" : "partial";
}

function canonicalPlanRows(plan) {
  return [
    ...plan.contexts.map(row => ({ kind: "context", id: row.id, body: row })),
    ...plan.serverRunners.map(row => ({ kind: "serverRunner", id: row.id, body: row })),
    ...plan.runtimePluginInstalls.map(row => ({ kind: "runtimePluginInstall", id: row.key, body: row })),
    ...plan.types.map(row => ({ kind: "type", id: row.id, body: row })),
    ...plan.processes.map(row => ({ kind: "process", id: row.id, body: row })),
    ...plan.messages.map(row => ({ kind: "message", id: row.id, body: row })),
    ...plan.projections.map(row => ({ kind: "projection", id: row.id, body: row })),
    ...plan.surfaces.map(row => ({ kind: "surface", id: row.id, body: row })),
    ...plan.routes.map(row => ({ kind: "route", id: row.id, body: row })),
    ...plan.serveMounts.map(row => ({ kind: "serveMount", id: row.key, body: row }))
  ];
}

function canonicalExistingRows(world, plan) {
  const authored = authoredBoundaryProjection(world);
  return canonicalPlanRows(plan).filter(row => {
    if (row.kind === "runtimePluginInstall") {
      return authored.runtimePluginInstallPairs.some(existing => existing.key === row.id);
    }
    if (row.kind === "serveMount") {
      return authored.serveMountPairs.some(existing => existing.key === row.id);
    }
    const collectionName = row.kind === "serverRunner"
      ? "serverRunners"
      : (row.kind === "context"
        ? "contexts"
        : (row.kind === "process" ? "processes" : `${row.kind}s`));
    return (authored[collectionName] || []).some(existing => existing.id === row.id);
  }).map(row => ({ kind: row.kind, id: row.id }));
}

function nextBoundaryComposition({
  world,
  runtimeBundleSummary,
  appContext
} = {}) {
  return {
    root: boundaryRootComposition({
      world,
      runtimeBundleSummary,
      appContext,
      runtimePluginIds: world.project(moduleProjectors.runtimePluginInstalls)
        .filter(row => row.serverRunner === BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner)
        .map(row => row.plugin)
    }),
    bootstrap: bootstrapRecoveryComposition(runtimeBundleSummary)
  };
}

export function resolveBootstrapAppBoundaryAuthorityScope(world) {
  const pieces = currentBootstrapBoundaryPieces(world);
  if (pieces.serverRunner) {
    return { targetKind: "serverRunner", targetId: BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner };
  }
  if (pieces.context) {
    return { targetKind: "context", targetId: BOOTSTRAP_APP_BOUNDARY_IDS.context };
  }
  return { targetKind: "bootstrapBoundary", targetId: null };
}

export async function requestBootstrapAppBoundaryEstablish(world, {
  actor,
  backendHost,
  supportedHandlerSets = [],
  supportedHandlers = [],
  supportedHandlerMetadata = {},
  bootstrapModel = null,
  runtimeBundleSummary = null,
  runtimeProfile = "full",
  getRuntimePluginCatalog = async () => ({ packages: [] }),
  appContext = null
} = {}) {
  const boundaryBefore = await readBootstrapAppBoundaryState({
    world,
    runtimeBundleSummary,
    bootstrapModel,
    runtimeProfile,
    getRuntimePluginCatalog,
    appContext
  });
  const statusBefore = classifyBoundaryStatus(boundaryBefore);
  if (statusBefore === "blocked") {
    return {
      ok: false,
      status: 409,
      error: "bootstrap app boundary is blocked",
      boundary: boundaryBefore,
      created: [],
      skipped: canonicalExistingRows(world, buildBootstrapAppBoundaryPlan({ bootstrapModel })),
      compositionBefore: boundaryBefore.composition,
      compositionAfter: boundaryBefore.composition
    };
  }
  if (statusBefore === "authoredActive") {
    return {
      ok: true,
      status: 200,
      boundary: boundaryBefore,
      created: [],
      skipped: canonicalExistingRows(world, buildBootstrapAppBoundaryPlan({ bootstrapModel })),
      compositionBefore: boundaryBefore.composition,
      compositionAfter: boundaryBefore.composition,
      resultStatus: "authoredActive"
    };
  }

  const plan = buildBootstrapAppBoundaryPlan({ bootstrapModel });
  const authoredBefore = authoredBoundaryProjection(world);
  const orderedRequests = buildBootstrapAuthoredRequestPlanRequests({
    plan,
    authoredState: authoredBefore,
    dynamicValues: plan.dynamicValues
  });
  const { summary: planSummary } = normalizedPlanSummary(plan, authoredBefore);
  const created = [];
  const skipped = canonicalExistingRows(world, plan);
  const executedWitnessIds = [];
  const stepResults = [
    ...(planSummary.contexts || []).map(row => ({
      kind: "context",
      id: row.id,
      run: () => requestBootstrapContextDefine(world, { actor, backendHost, body: row })
    })),
    ...(planSummary.serverRunners || []).map(row => ({
      kind: "serverRunner",
      id: row.id,
      run: () => requestBootstrapServerRunnerDefine(world, {
        actor,
        backendHost,
        body: row,
        allowedHandlerSets: supportedHandlerSets
      })
    })),
    ...(planSummary.runtimePluginInstalls || []).map(row => ({
      kind: "runtimePluginInstall",
      id: `${row.serverRunner}::${row.plugin}`,
      run: async () => requestBootstrapRuntimePluginInstall(world, {
        actor,
        backendHost,
        body: row,
        pluginCatalog: await getRuntimePluginCatalog({
          activeProfile: runtimeProfile,
          serverRunnerId: row.serverRunner
        })
      })
    })),
    ...(planSummary.types || []).map(row => ({
      kind: "type",
      id: row.id,
      run: () => requestTypeDefine(world, { actor, backendHost, body: row })
    })),
    ...(planSummary.processes || []).map(row => ({
      kind: "process",
      id: row.id,
      run: () => requestProcessDefine(world, { actor, backendHost, body: row })
    })),
    ...(planSummary.messages || []).map(row => ({
      kind: "message",
      id: row.id,
      run: () => requestMessageDefine(world, { actor, backendHost, body: row })
    })),
    ...(planSummary.projections || []).map(row => ({
      kind: "projection",
      id: row.id,
      run: () => requestProjectionDefine(world, { actor, backendHost, body: row })
    })),
    ...(planSummary.surfaces || []).map(row => ({
      kind: "surface",
      id: row.id,
      run: () => requestSurfaceDefine(world, { actor, backendHost, body: row })
    })),
    ...(planSummary.routes || []).map(row => ({
      kind: "route",
      id: row.id,
      run: () => requestBootstrapRouteDefine(world, {
        actor,
        backendHost,
        body: row,
        allowedHandlers: supportedHandlers,
        handlerMetadataById: supportedHandlerMetadata
      })
    })),
    ...(planSummary.serveMounts || []).map(row => ({
      kind: "serveMount",
      id: `${row.serverRunner}::${row.route}`,
      run: () => requestBootstrapServeDefine(world, { actor, backendHost, body: row })
    }))
  ];

  for (const step of stepResults) {
    const result = await step.run();
    if (!result?.ok) {
      const boundaryAfterFailure = await readBootstrapAppBoundaryState({
        world,
        runtimeBundleSummary,
        bootstrapModel,
        runtimeProfile,
        getRuntimePluginCatalog,
        appContext
      });
      return {
        ok: false,
        status: result.status || 400,
        error: result.error || "bootstrap app boundary establish failed",
        boundary: boundaryAfterFailure,
        created,
        skipped,
        compositionBefore: boundaryBefore.composition,
        compositionAfter: boundaryAfterFailure.composition
      };
    }
    created.push({ kind: step.kind, id: step.id });
    const witnessIds = [result.witness?.id, ...(result.witnesses || []).map(entry => entry?.id)].filter(Boolean);
    executedWitnessIds.push(...witnessIds);
  }

  const compositionAfter = nextBoundaryComposition({
    world,
    runtimeBundleSummary,
    appContext
  });
  const witness = world.emit({
    process: "bootstrap.appBoundary.establish",
    actor: actor || backendHost,
    claims: [
      relation(actor || backendHost, "editedProjection", BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner),
      relation(actor || backendHost, "editedProjection", BOOTSTRAP_APP_BOUNDARY_IDS.route)
    ],
    body: {
      orderedRequests,
      created,
      skipped,
      executedWitnessIds,
      compositionBefore: boundaryBefore.composition,
      compositionAfter
    }
  });
  const boundaryAfter = await readBootstrapAppBoundaryState({
    world,
    runtimeBundleSummary,
    bootstrapModel,
    runtimeProfile,
    getRuntimePluginCatalog,
    appContext: {
      ...appContext,
      serverRunnerId: BOOTSTRAP_APP_BOUNDARY_IDS.serverRunner,
      bootstrapOnly: false
    }
  });
  return {
    ok: true,
    status: 200,
    boundary: {
      ...boundaryAfter,
      status: "authoredActive"
    },
    created,
    skipped,
    compositionBefore: boundaryBefore.composition,
    compositionAfter,
    resultStatus: "authoredActive",
    witness
  };
}
