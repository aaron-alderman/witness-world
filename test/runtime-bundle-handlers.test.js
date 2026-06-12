import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRuntimeDiagnosticsForProfile,
  dispatchHandlerIdsForProfile,
  genericHandlerFactoriesForProfile,
  handlerSetDefinitionsForProfile,
  runtimeBundleManifests,
  runtimeRouteEntriesForProfile,
  runtimeSurfaceEntriesForProfile
} from "../src/runtime-bundles.js";
import {
  composeRuntimeBundleHandlers,
  runtimeBundleHandlerCatalog
} from "../src/runtime-bundle-handlers.js";

test("bundle handler catalogs preserve route-authoring subsets separately from dispatch ownership", () => {
  const eden = runtimeBundleHandlerCatalog("bundle-eden");

  assert.equal(eden.authorableHandlers.includes("edenPersonalBox.read"), false);
  assert.equal(eden.dispatchHandlers.includes("edenPersonalBox.read"), true);
  assert.equal(eden.pageHandlers.includes("page.edenCanvas"), true);
});

test("active bundle handler composition filters inactive implementations and reports drift", () => {
  const availableHandlers = {
    __sessionStore: new Map(),
    "page.home": () => {},
    "page.world": () => {},
    "bootstrap.page": () => {},
    "db.sql.query": () => {}
  };

  const minimal = composeRuntimeBundleHandlers({
    activeBundleIds: ["bundle-core-runtime"],
    availableHandlers,
    reservedHandlerIds: ["__sessionStore"]
  });

  assert.deepEqual(Object.keys(minimal.handlers).sort(), ["__sessionStore", "page.home"]);
  assert.deepEqual(minimal.diagnostics.missingHandlerIds, ["session.read", "session.open", "session.logout", "runtime.diagnostics.read"]);
  assert.deepEqual([...minimal.diagnostics.extraHandlerIds].sort(), [
    "bootstrap.page",
    "db.sql.query",
    "page.world"
  ]);

  const fullSubset = composeRuntimeBundleHandlers({
    activeBundleIds: ["bundle-core-runtime", "bundle-authoring", "bundle-inspect", "bundle-practical-backend"],
    availableHandlers,
    reservedHandlerIds: ["__sessionStore"]
  });

  assert.equal(Object.prototype.hasOwnProperty.call(fullSubset.handlers, "page.world"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(fullSubset.handlers, "bootstrap.page"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(fullSubset.handlers, "db.sql.query"), true);
  assert.deepEqual(fullSubset.diagnostics.extraHandlerIds, []);
});

test("generic handler factories are resolved from active runtime bundles", () => {
  const minimal = genericHandlerFactoriesForProfile("minimal");
  const authoring = genericHandlerFactoriesForProfile("authoring");
  const inspect = genericHandlerFactoriesForProfile("inspect");
  const practicalBackend = genericHandlerFactoriesForProfile("practical-backend");
  const full = genericHandlerFactoriesForProfile("full");

  assert.deepEqual(minimal.map(entry => entry.bundleId), ["bundle-core-runtime"]);
  assert.deepEqual(authoring.map(entry => entry.bundleId), ["bundle-core-runtime", "bundle-tutorial", "bundle-authoring"]);
  assert.deepEqual(inspect.map(entry => entry.bundleId), ["bundle-core-runtime", "bundle-inspect"]);
  assert.equal(practicalBackend.length >= 14, true);
  assert.deepEqual([...new Set(practicalBackend.map(entry => entry.bundleId))], ["bundle-core-runtime", "bundle-practical-backend"]);
  assert.equal(full.some(entry => entry.bundleId === "bundle-core-runtime"), true);
  assert.equal(full.some(entry => entry.bundleId === "bundle-tutorial"), true);
  assert.equal(full.some(entry => entry.bundleId === "bundle-authoring"), true);
  assert.equal(full.some(entry => entry.bundleId === "bundle-inspect"), true);
  assert.equal(full.some(entry => entry.bundleId === "bundle-canvas"), true);
  assert.equal(full.some(entry => entry.bundleId === "bundle-mcp"), true);
  assert.equal(full.some(entry => entry.bundleId === "bundle-practical-backend"), true);
  assert.equal(full.some(entry => entry.bundleId === "bundle-eden"), true);
});

test("handler set definitions are resolved from active runtime bundles", () => {
  const minimal = handlerSetDefinitionsForProfile("minimal");
  const full = handlerSetDefinitionsForProfile("full");

  assert.equal(Object.prototype.hasOwnProperty.call(minimal, "demo"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(full, "demo"), true);
  assert.equal(full.demo.handlers.includes("todos.list"), true);
  assert.equal(full.demo.jobHandlers.includes("demo.echo"), true);
});

test("runtime surfaces are resolved from active runtime bundles, including mode actions", () => {
  const minimal = runtimeSurfaceEntriesForProfile("minimal", "world-command");
  const full = runtimeSurfaceEntriesForProfile("full", "world-command");

  assert.equal(minimal.some(surface => surface.id === "surface:world-mode:graph"), false);
  const graphSurface = full.find(surface => surface.id === "surface:world-mode:graph");
  assert.equal(Boolean(graphSurface), true);
  assert.deepEqual(graphSurface.action, { kind: "mode", mode: "graph" });
  assert.equal(full.some(surface => surface.id === "surface:process-view"), true);
});

test("session routes stay core while tutorial routes vary with the tutorial bundle", () => {
  const minimalRoutes = runtimeRouteEntriesForProfile("minimal");
  const authoringRoutes = runtimeRouteEntriesForProfile("authoring");
  const fullRoutes = runtimeRouteEntriesForProfile("full");

  assert.equal(minimalRoutes.some(route => route.method === "GET" && route.path === "/api/session" && route.handler === "session.read"), true);
  assert.equal(minimalRoutes.some(route => route.method === "GET" && route.path === "/api/runtime/diagnostics" && route.handler === "runtime.diagnostics.read"), true);
  assert.equal(minimalRoutes.some(route => route.method === "POST" && route.path === "/api/session" && route.handler === "session.open"), true);
  assert.equal(minimalRoutes.some(route => route.method === "DELETE" && route.path === "/api/session" && route.handler === "session.logout"), true);
  assert.equal(minimalRoutes.some(route => route.handler === "tutorial.progress.read" && route.kind === "pattern"), false);
  assert.equal(authoringRoutes.some(route => route.handler === "tutorial.progress.read" && route.kind === "pattern"), true);
  assert.equal(fullRoutes.some(route => route.method === "GET" && route.path === "/api/session" && route.handler === "session.read"), true);
  assert.equal(fullRoutes.some(route => route.handler === "tutorial.progress.read" && route.kind === "pattern"), true);
});

test("dispatch handler ownership varies by active runtime profile", () => {
  const minimal = dispatchHandlerIdsForProfile("minimal");
  const full = dispatchHandlerIdsForProfile("full");

  assert.equal(minimal.includes("page.edenCanvas"), false);
  assert.equal(minimal.includes("mcp.http"), false);
  assert.equal(full.includes("page.edenCanvas"), true);
  assert.equal(full.includes("mcp.http"), true);
});

test("internal runtime bundle manifests expose bundle contract metadata", () => {
  const manifests = runtimeBundleManifests();

  assert.equal(manifests.length >= 8, true);
  for (const manifest of manifests) {
    assert.equal(manifest.kind, "internal");
    assert.equal(typeof manifest.displayName, "string");
    assert.equal(Boolean(manifest.displayName), true);
    assert.equal(typeof manifest.description, "string");
    assert.equal(Boolean(manifest.description), true);
  }
});

test("runtime diagnostics read model summarizes bundle composition and live installation state", () => {
  const diagnostics = buildRuntimeDiagnosticsForProfile({
    requestedProfile: "inspect",
    profileName: "inspect",
    startupRunner: {
      id: "runner-1",
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      handlerSet: "demo"
    },
    installedHostCapabilities: {
      backend: ["http.serve", "runtime.config"],
      frontend: ["dom.render", "http.fetch"]
    },
    handlerSetDefinitions: {
      demo: { handlers: ["todos.list", "todos.create"] }
    }
  });

  assert.equal(diagnostics.requestedProfile, "inspect");
  assert.equal(diagnostics.activeProfile, "inspect");
  assert.deepEqual(diagnostics.availableProfiles, ["minimal", "authoring", "inspect", "practical-backend", "full"]);
  assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-inspect"), true);
  assert.deepEqual(diagnostics.installedHostCapabilities.backend, ["http.serve", "runtime.config"]);
  assert.equal(diagnostics.surfaces.some(surface => surface.id === "surface:process-view"), true);
  assert.equal(diagnostics.handlerSets.some(entry => entry.id === "demo"), true);
});
