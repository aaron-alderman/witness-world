import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { loadWitnessAppFile, applyWitnessDocs } from "../src/dsl.js";
import { applyDesire } from "../src/desire/index.js";
import { createCoreRuntimeBundleHandlers } from "../src/runtime-core-handlers.js";
import { buildMountedChartRuntime } from "../plugins/chart-runtime/runtime.js";

async function loadEngentusWorld() {
  const world = createWorld();
  const loaded = await loadWitnessAppFile(path.join(process.cwd(), "examples", "engentus/app.wtoml"));
  applyWitnessDocs(world, loaded.witnessDocs);
  for (const desire of loaded.authoredDesireDocs) applyDesire(world, desire);
  return world;
}

function createSurfacePageHarness(world) {
  const calls = [];
  const handlers = createCoreRuntimeBundleHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    send: (_res, status, contentType, body) => {
      calls.push({ kind: "send", status, contentType, body });
    },
    sendJson: (_res, status, body) => {
      calls.push({ kind: "json", status, body });
    },
    readJson: async () => ({}),
    requestActors: () => [],
    requestVisibleWitnesses: () => world.allWitnesses(),
    currentIdentityIndex: () => ({ byUsername: {} }),
    sessionStore: new Map(),
    createSessionForIdentity: identity => identity,
    sessionResponseShape: session => session,
    sessionCookieHeader: () => "",
    clearSessionCookieHeader: () => "",
    tutorialProgressFor: () => null,
    runtimeProfile: "minimal",
    requestedRuntimeProfile: "minimal",
    currentBackendCapabilities: () => [],
    currentFrontendCapabilities: () => [],
    buildRuntimeDiagnosticsForProfile: () => ({}),
    getRuntimePluginCatalog: async () => ({ summary: {}, addedBundleIds: [] }),
    getRuntimePluginReviews: async () => ({}),
    invokeRouteHandler: async () => ({ status: 200, body: {} }),
    coreHooks: {
      buildMountedChartRuntime
    }
  });
  return {
    handlers,
    takeLast() {
      return calls.at(-1) ?? null;
    }
  };
}

test("page.surface renders authored login and home shell states by path", async () => {
  const world = await loadEngentusWorld();
  const harness = createSurfacePageHarness(world);

  await harness.handlers["page.surface"]({
    res: {},
    route: { id: "engentus_root", path: "/", params: { rootSurface: "EngentusRoot", defaultScreen: "login" } },
    requestUrl: new URL("http://engentus.test/")
  });
  const login = harness.takeLast();
  assert.equal(login.status, 200);
  assert.match(login.body, /Welcome back/);
  assert.match(login.body, /Sign in to your Engentus account/);

  await harness.handlers["page.surface"]({
    res: {},
    route: { id: "engentus_home", path: "/engentus/:screen", params: { rootSurface: "EngentusRoot", defaultScreen: "login", screen: "home" } },
    requestUrl: new URL("http://engentus.test/engentus/home")
  });
  const home = harness.takeLast();
  assert.equal(home.status, 200);
  assert.match(home.body, /Analysis Modules/);
  assert.match(home.body, /Mill Charge Motion/);
  assert.match(home.body, /Goodman Fatigue Diagram/);
});

test("page.surface respects authored mounted-panel shell props", async () => {
  const world = await loadEngentusWorld();
  const harness = createSurfacePageHarness(world);

  await harness.handlers["page.surface"]({
    res: {},
    route: { id: "engentus_goodman", path: "/engentus/:screen", params: { rootSurface: "EngentusRoot", defaultScreen: "login", screen: "goodman" } },
    requestUrl: new URL("http://engentus.test/engentus/goodman")
  });
  const goodman = harness.takeLast();
  assert.match(goodman.body, /<svg id="chart-svg" class="chart-page__mount chart-page__mount--goodman" data-chart-spec=/);
  assert.match(goodman.body, /data-mount-mode="mounted-panel"/);
  assert.doesNotMatch(goodman.body, /<iframe[^>]+src="\/chart\?chart=GoodmanDiagram"/);

  await harness.handlers["page.surface"]({
    res: {},
    route: { id: "engentus_mill_force", path: "/engentus/:screen", params: { rootSurface: "EngentusRoot", defaultScreen: "login", screen: "mill-force" } },
    requestUrl: new URL("http://engentus.test/engentus/mill-force")
  });
  const millForce = harness.takeLast();
  assert.match(millForce.body, /id="mill-force-svg-cross"/);
  assert.match(millForce.body, /id="mill-force-svg-force"[^>]*style="display:none"/);
  assert.match(millForce.body, /id="mill-force-svg-rose"[^>]*style="display:none"/);
  assert.match(millForce.body, /id="mill-force-mc-canvas"/);
  assert.match(millForce.body, /id="mill-force-tip"/);
  assert.doesNotMatch(millForce.body, /<iframe[^>]+src="\/chart\?chart=MillForceCross"/);
});

test("page.home falls back to the shared inactive widget page when no widget renderer hook is installed", async () => {
  const world = createWorld();
  const harness = createSurfacePageHarness(world);

  await harness.handlers["page.home"]({
    res: {},
    route: { id: "home", path: "/", params: { rootWidget: "DemoWidget" } },
    appContext: {},
    requestSession: null
  });

  const page = harness.takeLast();
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>DemoWidget<\/title>/);
  assert.match(page.body, /<h1>DemoWidget<\/h1>/);
  assert.match(page.body, /Widget rendering is not active in this runtime composition\./);
});
