import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { createCoreRuntimeBundleHandlers } from "../src/runtime-core-handlers.js";
import { LEGACY_FRONTEND_SURFACE_CAPABILITY_ID } from "../src/legacy-frontend-bridge.js";

function buildRequestUrl(pathname) {
  return new URL(`http://localhost${pathname}`);
}

function createHarness(world, captures) {
  return createCoreRuntimeBundleHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    send(res, status, contentType, body) {
      res.status = status;
      res.contentType = contentType;
      res.body = body;
    },
    sendJson(res, status, body) {
      res.status = status;
      res.contentType = "application/json";
      res.body = body;
    },
    readJson: async () => ({}),
    requestActors: () => [],
    requestVisibleWitnesses: () => [],
    currentIdentityIndex: () => ({ byId: {}, byActor: {} }),
    sessionStore: new Map(),
    createSessionForIdentity: () => null,
    sessionResponseShape: () => ({}),
    syncSessionAuthSummary: () => {},
    sessionCookieHeader: () => "",
    clearSessionCookieHeader: () => "",
    tutorialProgressFor: () => null,
    setTutorialProgress: () => {},
    guidanceProgressFor: () => null,
    setGuidanceProgress: () => {},
    runtimeProfile: "full",
    requestedRuntimeProfile: "full",
    currentBackendCapabilities: () => [],
    currentFrontendCapabilities: () => [],
    handlerSetDefinitions: {},
    buildRuntimeDiagnosticsForProfile: () => ({}),
    getRuntimePluginCatalog: async () => ({ packages: [] }),
    getRuntimePluginReviews: async () => [],
    authorityServices: {},
    invokeRouteHandler: async () => ({ status: 404, body: {} }),
    coreHooks: {
      renderWidgetPage(_world, args) {
        captures.push(args);
        return `<!doctype html><html><body>${args.rootWidget}|${args.frontendProgram || ""}|${args.appConfig.page}</body></html>`;
      },
      projectPagePresentationTheme: () => null,
      guidanceConfigForSession: () => null
    },
    runtimeContributions: {
      capabilityDefinitions: [{ id: LEGACY_FRONTEND_SURFACE_CAPABILITY_ID }]
    },
    currentAppRenderWorld: () => world
  });
}

test("page.home and migrated page.surface compatibility routes share the same legacy widget-program render path", async () => {
  const world = createWorld();
  const captures = [];
  world.emit({
    process: "desire.defineSurface",
    actor: "system",
    claims: [],
    body: {
      id: "legacySurface.home_route",
      surfaceKind: "legacy-widget-program-bridge",
      capabilityRefs: [LEGACY_FRONTEND_SURFACE_CAPABILITY_ID],
      props: {
        legacyRouteId: "home_route",
        legacyRootWidget: "page_root",
        legacyFrontendProgram: "landing_program",
        legacyPage: "home",
        legacyExcludeWidgetRoles: ["world-graph-body", "debug-only"],
        legacyLiveProjection: false
      }
    }
  });

  const handlers = createHarness(world, captures);

  const homeRes = {};
  await handlers["page.home"]({
    res: homeRes,
    route: {
      id: "home_route",
      path: "/",
      serves: "home_route",
      params: {
        rootWidget: "page_root",
        frontendProgram: "landing_program",
        page: "home",
        excludeWidgetRoles: ["world-graph-body", "debug-only"],
        liveProjection: false
      }
    },
    appContext: {
      runtimeContributions: { capabilityDefinitions: [{ id: LEGACY_FRONTEND_SURFACE_CAPABILITY_ID }] },
      runtimeSurfaceEntries: []
    },
    requestSession: { id: "session.home" }
  });

  const surfaceRes = {};
  await handlers["page.surface"]({
    res: surfaceRes,
    route: {
      id: "home_route",
      path: "/",
      serves: "home_route",
      params: {
        rootSurface: "legacySurface.home_route"
      }
    },
    requestUrl: buildRequestUrl("/"),
    requestSession: { id: "session.surface" },
    appContext: {
      runtimeContributions: { capabilityDefinitions: [{ id: LEGACY_FRONTEND_SURFACE_CAPABILITY_ID }] },
      runtimeSurfaceEntries: [],
      devMode: false
    }
  });

  assert.equal(homeRes.status, 200);
  assert.equal(surfaceRes.status, 200);
  assert.equal(captures.length, 2);
  assert.deepEqual(
    captures.map(entry => ({
      rootWidget: entry.rootWidget,
      frontendProgram: entry.frontendProgram,
      page: entry.appConfig.page,
      excludeWidgetRoles: entry.appConfig.excludeWidgetRoles,
      liveProjection: entry.appConfig.liveProjection
    })),
    [
      {
        rootWidget: "page_root",
        frontendProgram: "landing_program",
        page: "home",
        excludeWidgetRoles: ["world-graph-body", "debug-only"],
        liveProjection: false
      },
      {
        rootWidget: "page_root",
        frontendProgram: "landing_program",
        page: "home",
        excludeWidgetRoles: ["world-graph-body", "debug-only"],
        liveProjection: false
      }
    ]
  );
  assert.equal(String(homeRes.body).includes("page_root|landing_program|home"), true);
  assert.equal(String(surfaceRes.body).includes("page_root|landing_program|home"), true);
});

test("page handlers do not wait for app snapshot startup when no preview session was requested", async () => {
  const world = createWorld();
  const captures = [];
  world.emit({
    process: "desire.defineSurface",
    actor: "system",
    claims: [],
    body: {
      id: "legacySurface.home_route",
      surfaceKind: "legacy-widget-program-bridge",
      capabilityRefs: [LEGACY_FRONTEND_SURFACE_CAPABILITY_ID],
      props: {
        legacyRouteId: "home_route",
        legacyRootWidget: "page_root",
        legacyFrontendProgram: "landing_program",
        legacyPage: "home"
      }
    }
  });

  const handlers = createHarness(world, captures);
  const pendingSnapshotReady = new Promise(() => {});
  const appContext = {
    runtimeContributions: { capabilityDefinitions: [{ id: LEGACY_FRONTEND_SURFACE_CAPABILITY_ID }] },
    runtimeSurfaceEntries: [],
    devMode: true,
    appSnapshotManagerReady: pendingSnapshotReady
  };

  const runWithTimeout = async promise => Promise.race([
    promise.then(() => "done"),
    new Promise(resolve => setTimeout(() => resolve("timeout"), 25))
  ]);

  const homeResult = await runWithTimeout(handlers["page.home"]({
    res: {},
    route: {
      id: "home_route",
      path: "/",
      serves: "home_route",
      params: {
        rootWidget: "page_root",
        frontendProgram: "landing_program",
        page: "home"
      }
    },
    appContext,
    requestSession: { id: "session.home" }
  }));
  const surfaceResult = await runWithTimeout(handlers["page.surface"]({
    res: {},
    route: {
      id: "home_route",
      path: "/",
      serves: "home_route",
      params: {
        rootSurface: "legacySurface.home_route"
      }
    },
    requestUrl: buildRequestUrl("/"),
    requestSession: { id: "session.surface" },
    appContext
  }));

  assert.equal(homeResult, "done");
  assert.equal(surfaceResult, "done");
  assert.equal(captures.length, 2);
});
