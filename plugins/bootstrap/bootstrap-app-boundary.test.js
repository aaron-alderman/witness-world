import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { declareBackendHost, declareFrontendHost } from "../../src/host.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  BOOTSTRAP_APP_BOUNDARY_IDS,
  buildBootstrapAppBoundaryPlan,
  readBootstrapAppBoundaryState,
  requestBootstrapAppBoundaryEstablish
} from "./bootstrap-app-boundary.js";
import { executeBootstrapProposalTarget } from "./bootstrap-proposal-targets.js";

function runtimeBundleSummary() {
  return {
    routes: [
      { method: "GET", path: "/_bootstrap", handler: "bootstrap.page" }
    ]
  };
}

function compatiblePluginCatalog() {
  return async () => ({
    packages: [
      {
        id: "plugin.authoring",
        validation: { ok: true, errors: [] },
        execution: { executable: true },
        compatibility: { compatible: true }
      },
      {
        id: "plugin.inspect",
        validation: { ok: true, errors: [] },
        execution: { executable: true },
        compatibility: { compatible: true }
      }
    ]
  });
}

function bootstrapModel() {
  return {
    backendHosts: [{ id: "backendHost" }],
    frontendHosts: [{ id: "frontendHost" }]
  };
}

function bootstrapAppContext(overrides = {}) {
  return {
    runtimeStartupMode: "bootstrap",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    bootstrapOnly: true,
    ...overrides
  };
}

function declareHosts(world) {
  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile: "authoring" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile: "authoring" });
}

const pageSurfaceHandlerMetadata = {
  "page.surface": {
    routeKind: "page",
    methods: ["GET"]
  }
};

test("bootstrap app-boundary plan targets the canonical authored page.surface cluster", () => {
  const plan = buildBootstrapAppBoundaryPlan({ bootstrapModel: bootstrapModel() });

  assert.equal(plan.serverRunners[0].id, "demo_server");
  assert.equal(plan.routes[0].id, "home_route");
  assert.equal(plan.routes[0].handler, "page.surface");
  assert.equal(plan.routes[0].rootSurface, BOOTSTRAP_APP_BOUNDARY_IDS.rootSurface);
  assert.deepEqual(
    plan.requestPlan.map(row => row.from),
    ["contexts", "serverRunners", "runtimePluginInstalls", "types", "processes", "messages", "projections", "surfaces", "routes", "serveMounts"]
  );
});

test("bootstrap app-boundary state reports missing canonical pieces in a blank bootstrap world", async () => {
  const world = createWorld();
  declareHosts(world);

  const boundary = await readBootstrapAppBoundaryState({
    world,
    runtimeBundleSummary: runtimeBundleSummary(),
    bootstrapModel: bootstrapModel(),
    runtimeProfile: "minimal",
    getRuntimePluginCatalog: compatiblePluginCatalog(),
    appContext: bootstrapAppContext()
  });

  assert.equal(boundary.status, "missing");
  assert.deepEqual(boundary.missingKinds, [
    "serverRunner",
    "runtimePluginInstall",
    "surface",
    "route",
    "serveMount"
  ]);
  assert.equal(boundary.planSummary.serverRunners[0].id, "demo_server");
  assert.equal(boundary.planSummary.routes[0].handler, "page.surface");
  assert.equal(boundary.composition.root.source, "bootstrap-fallback");
  assert.equal(boundary.composition.bootstrap.path, "/_bootstrap");
});

test("bootstrap app-boundary state skips existing canonical pieces and stays conflict-honest", async () => {
  const world = createWorld();
  declareHosts(world);
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "bootstrap.app"
label = "Authored App Boundary"

[[serverRunner]]
actor = "system"
id = "demo_server"
context = "bootstrap.app"
backendHost = "backendHost"
frontendHost = "frontendHost"
`);

  const partial = await readBootstrapAppBoundaryState({
    world,
    runtimeBundleSummary: runtimeBundleSummary(),
    bootstrapModel: bootstrapModel(),
    runtimeProfile: "minimal",
    getRuntimePluginCatalog: compatiblePluginCatalog(),
    appContext: bootstrapAppContext()
  });
  assert.equal(partial.status, "partial");
  assert.equal(partial.missingKinds.includes("serverRunner"), false);
  assert.equal(partial.missingKinds.includes("route"), true);

  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "conflicting_home"
path = "/"
serves = "conflicting_home"
method = "GET"
handler = "page.home"
params = { rootWidget = "legacy_root" }
`);
  const blocked = await readBootstrapAppBoundaryState({
    world,
    runtimeBundleSummary: runtimeBundleSummary(),
    bootstrapModel: bootstrapModel(),
    runtimeProfile: "minimal",
    getRuntimePluginCatalog: compatiblePluginCatalog(),
    appContext: bootstrapAppContext()
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockedReasons.some(reason => reason.includes("path / already belongs to authored route conflicting_home")), true);
});

test("requestBootstrapAppBoundaryEstablish creates the canonical authored boundary and becomes idempotent", async () => {
  const world = createWorld();
  declareHosts(world);

  const result = await requestBootstrapAppBoundaryEstablish(world, {
    actor: "aaron",
    backendHost: "backendHost",
    supportedHandlerSets: [],
    supportedHandlers: ["page.surface"],
    supportedHandlerMetadata: pageSurfaceHandlerMetadata,
    bootstrapModel: bootstrapModel(),
    runtimeBundleSummary: runtimeBundleSummary(),
    runtimeProfile: "minimal",
    getRuntimePluginCatalog: compatiblePluginCatalog(),
    appContext: bootstrapAppContext()
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.boundary.status, "authoredActive");
  assert.equal(result.created.some(row => row.kind === "serverRunner" && row.id === "demo_server"), true);
  assert.equal(result.created.some(row => row.kind === "route" && row.id === "home_route"), true);
  assert.equal(world.project(moduleProjectors.routes).some(row =>
    row.id === "home_route" && row.handler === "page.surface"
  ), true);
  assert.equal(world.project(moduleProjectors.servedRoutes).some(row =>
    row.id === "home_route" && row.serverRunner === "demo_server" && row.path === "/"
  ), true);
  assert.equal(world.allWitnesses().some(row =>
    row.process === "bootstrap.appBoundary.establish"
      && row.body?.orderedRequests?.some(request => request.url === "/api/routes")
  ), true);

  const second = await requestBootstrapAppBoundaryEstablish(world, {
    actor: "aaron",
    backendHost: "backendHost",
    supportedHandlerSets: [],
    supportedHandlers: ["page.surface"],
    supportedHandlerMetadata: pageSurfaceHandlerMetadata,
    bootstrapModel: bootstrapModel(),
    runtimeBundleSummary: runtimeBundleSummary(),
    runtimeProfile: "minimal",
    getRuntimePluginCatalog: compatiblePluginCatalog(),
    appContext: bootstrapAppContext({
      serverRunnerId: "demo_server",
      bootstrapOnly: false
    })
  });
  assert.equal(second.ok, true);
  assert.equal(second.resultStatus, "authoredActive");
  assert.deepEqual(second.created, []);
});

test("bootstrap app-boundary proposal target replays the governed action through approval-time authority", async () => {
  const world = createWorld();
  declareHosts(world);

  const result = await executeBootstrapProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "bootstrap.appBoundary.establish" },
    body: { bootstrapModel: bootstrapModel() },
    supportedHandlerSets: [],
    supportedHandlers: ["page.surface"],
    supportedHandlerMetadata: pageSurfaceHandlerMetadata,
    runtimeBundleSummary: runtimeBundleSummary(),
    runtimeProfile: "minimal",
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true }),
    getRuntimePluginCatalog: compatiblePluginCatalog()
  });

  assert.deepEqual(result, {
    ok: true,
    witnessIds: [world.allWitnesses().find(row => row.process === "bootstrap.appBoundary.establish")?.id].filter(Boolean)
  });
  assert.equal(world.project(moduleProjectors.routes).some(row => row.id === "home_route"), true);
});
