import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { defineRoute, moduleProjectors } from "../src/modules.js";
import {
  applyLegacyFrontendMigration,
  frontendLegacyMigrationAuthorityTargets,
  previewLegacyFrontendMigration
} from "../src/frontend-legacy-migration.js";
import {
  LEGACY_FRONTEND_SURFACE_CAPABILITY_ID,
  legacyFrontendCompatibilityBridgeObservationsFromProject
} from "../src/legacy-frontend-bridge.js";

function legacySurfaceRows(world) {
  return world.allWitnesses()
    .filter(witness => witness.process === "desire.defineSurface" && witness.body?.id)
    .map(witness => witness.body);
}

test("legacy frontend migration preview exposes deterministic route and surface work for page.home routes", () => {
  const world = createWorld();
  defineRoute(world, {
    actor: "system",
    id: "home_route",
    path: "/",
    serves: "home_route",
    method: "GET",
    handler: "page.home",
    params: {
      rootWidget: "page_root",
      frontendProgram: "landing_program",
      page: "home",
      excludeWidgetRoles: ["world-graph-body", "debug-only"],
      liveProjection: false,
      routeState: { process: "ShellNavigation", state: "ActiveRoute" }
    },
    context: "ctx.shared"
  });

  const preview = previewLegacyFrontendMigration(world);

  assert.equal(preview.compatibilityMode, "bridge-active");
  assert.deepEqual(preview.summary, {
    pendingRoutes: 1,
    pendingSurfaces: 1
  });
  assert.equal(preview.pending[0].id, "legacyFrontendMigration:route:home_route");
  assert.equal(preview.pending[0].surfaceId, "legacySurface.home_route");
  assert.equal(preview.pending[1].id, "legacyFrontendMigration:surface:home_route");
  assert.equal(preview.pending[1].legacyRootWidget, "page_root");
  assert.equal(preview.pending[1].legacyFrontendProgram, "landing_program");
});

test("legacy frontend migration rewrites page.home routes onto page.surface compatibility surfaces and becomes idempotent", () => {
  const world = createWorld();
  defineRoute(world, {
    actor: "system",
    id: "home_route",
    path: "/",
    serves: "home_route",
    method: "GET",
    handler: "page.home",
    params: {
      rootWidget: "page_root",
      frontendProgram: "landing_program",
      page: "home",
      excludeWidgetRoles: ["world-graph-body", "debug-only"],
      liveProjection: false,
      routeState: { process: "ShellNavigation", state: "ActiveRoute" },
      responseStatus: 201
    },
    context: "ctx.shared"
  });

  const result = applyLegacyFrontendMigration(world, {
    actor: "callan"
  });

  assert.equal(result.ok, true);
  assert.equal(result.witness.process, "frontend.migrateLegacy");
  assert.equal(result.actions.some(row => row.action === "surface.define" && row.surfaceId === "legacySurface.home_route"), true);
  assert.equal(result.actions.some(row => row.action === "route.rewrite" && row.routeId === "home_route"), true);
  assert.deepEqual(result.previewAfter.pending, []);

  const route = world.project(moduleProjectors.routes).find(row => row.id === "home_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(route?.params?.rootSurface, "legacySurface.home_route");
  assert.deepEqual(route?.params?.routeState, { process: "ShellNavigation", state: "ActiveRoute" });
  assert.equal(route?.params?.responseStatus, 201);
  assert.equal(Object.prototype.hasOwnProperty.call(route?.params || {}, "rootWidget"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route?.params || {}, "frontendProgram"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route?.params || {}, "page"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route?.params || {}, "excludeWidgetRoles"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route?.params || {}, "liveProjection"), false);

  const surface = legacySurfaceRows(world).find(row => row.id === "legacySurface.home_route");
  assert.ok(surface);
  assert.deepEqual(surface.capabilityRefs, [LEGACY_FRONTEND_SURFACE_CAPABILITY_ID]);
  assert.equal(surface.surfaceKind, "legacy-widget-program-bridge");
  assert.equal(surface.props.legacyRootWidget, "page_root");
  assert.equal(surface.props.legacyFrontendProgram, "landing_program");
  assert.deepEqual(surface.props.legacyExcludeWidgetRoles, ["world-graph-body", "debug-only"]);
  assert.equal(surface.props.legacyLiveProjection, false);

  const second = applyLegacyFrontendMigration(world, {
    actor: "callan"
  });
  assert.equal(second.ok, true);
  assert.deepEqual(second.actions, []);
  assert.deepEqual(second.previewBefore.pending, []);
  assert.deepEqual(second.previewAfter.pending, []);
});

test("legacy frontend migration authority targets and compatibility bridge observations follow the visible compatibility lane", () => {
  const world = createWorld();
  defineRoute(world, {
    actor: "system",
    id: "home_route",
    path: "/",
    serves: "home_route",
    method: "GET",
    handler: "page.home",
    params: { rootWidget: "page_root" },
    context: "ctx.shared"
  });

  const authority = frontendLegacyMigrationAuthorityTargets(world);
  assert.deepEqual(authority.targets, [{ targetKind: "route", target: "home_route" }]);

  const before = legacyFrontendCompatibilityBridgeObservationsFromProject(projector => world.project(projector));
  assert.deepEqual(before.map(row => row.bridgeId), [
    "compatibilityBridge:legacyFrontend.pageHomeShim"
  ]);

  applyLegacyFrontendMigration(world, { actor: "callan" });

  const after = legacyFrontendCompatibilityBridgeObservationsFromProject(projector => world.project(projector));
  assert.deepEqual(after.map(row => row.bridgeId), [
    "compatibilityBridge:legacyFrontend.pageSurfaceCompatibility"
  ]);
});
