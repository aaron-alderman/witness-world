import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_FRONTEND_SURFACE_CAPABILITY_ID,
  LEGACY_FRONTEND_SURFACE_KIND,
  isLegacyFrontendBridgeSurface,
  legacyFrontendBridgeConfigFromSurface,
  legacyFrontendBridgeSurfaceForRoute
} from "./legacy-frontend-bridge.js";

test("legacy frontend bridge detection only accepts explicit legacy bridge surfaces", () => {
  const nativeSurface = {
    id: "EngentusRoot",
    surfaceKind: "app-root",
    capabilityRefs: [LEGACY_FRONTEND_SURFACE_CAPABILITY_ID],
    props: {
      legacyRootWidget: "page_root",
      legacyFrontendProgram: "program.demo",
      legacyPage: "home",
      legacyBridge: true
    }
  };

  assert.equal(isLegacyFrontendBridgeSurface(nativeSurface), false);
  assert.equal(legacyFrontendBridgeConfigFromSurface(nativeSurface), null);
});

test("legacy frontend migration surfaces still resolve through the explicit bridge contract", () => {
  const surface = legacyFrontendBridgeSurfaceForRoute({
    id: "home_route",
    context: "ctx.demo",
    params: {
      rootWidget: "page_root",
      frontendProgram: "program.demo",
      page: "home",
      excludeWidgetRoles: ["world-graph-body"],
      liveProjection: true
    }
  });

  assert.equal(surface.surfaceKind, LEGACY_FRONTEND_SURFACE_KIND);
  assert.deepEqual(surface.capabilityRefs, [LEGACY_FRONTEND_SURFACE_CAPABILITY_ID]);
  assert.equal(isLegacyFrontendBridgeSurface(surface), true);
  assert.deepEqual(legacyFrontendBridgeConfigFromSurface(surface), {
    rootWidget: "page_root",
    frontendProgram: "program.demo",
    page: "home",
    excludeWidgetRoles: ["world-graph-body"],
    liveProjection: true
  });
});
