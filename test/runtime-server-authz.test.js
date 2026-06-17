import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { loadWitnessAppFile } from "../src/dsl.js";
import {
  applyDesire,
  compileWtomlDocsToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { startRuntimeServer } from "../src/runtime-server.js";
import { createCoreRuntimeBundleHandlers } from "../src/runtime-core-handlers.js";
import { createRuntimeSessionServices } from "../src/runtime-session-services.js";
import {
  clearSessionCookieHeader,
  readJson,
  send,
  sendJson,
  sessionCookieHeader
} from "../src/runtime-http-utils.js";
import { moduleProjectors } from "../src/modules.js";

const engentusAppFile = path.join(process.cwd(), "examples", "engentus", "app.wtoml");

function createResponse() {
  const listeners = new Map();
  return {
    statusCode: 0,
    headers: null,
    body: "",
    on(event, listener) {
      listeners.set(event, listener);
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    write(chunk) {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    },
    end(chunk = "") {
      if (chunk) this.write(chunk);
      listeners.get("finish")?.();
    }
  };
}

function extractManifest(html) {
  const match = String(html).match(/<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/);
  assert.ok(match, "expected surface runtime manifest");
  return JSON.parse(match[1]);
}

async function createEngentusWorld() {
  const loaded = await loadWitnessAppFile(engentusAppFile);
  const witnessDesire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(loaded.witnessDocs));
  const authoredNodes = loaded.authoredDesireDocs.flatMap(doc => doc.nodes ?? []);
  const world = createWorld();
  applyDesire(world, {
    ...witnessDesire,
    nodes: [...witnessDesire.nodes, ...authoredNodes]
  });
  return world;
}

async function startEngentusAuthzServer(world) {
  let requestHandler = null;
  let pipelineSnapshotCalls = 0;
  const runner = {
    id: "engentus_server",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: true,
    handlerSet: null
  };
  const runtimeContext = {
    handlers: {
      "pipeline.platform-config.snapshot": async ({ res }) => {
        pipelineSnapshotCalls += 1;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }
    },
    runtimeContributions: {
      capabilityDefinitions: [],
      surfaceCapabilityRenderers: [],
      surfaceRuntimeSupportAssets: []
    },
    appSnapshotManager: {
      async ensureFresh() {},
      getActiveSnapshot() {
        return { world };
      },
      injectDevClient(html) {
        return html;
      },
      diagnostics() {
        return null;
      }
    },
    close() {}
  };

  const server = await startRuntimeServer(world, {
    actor: "aaron",
    serverRunnerId: "engentus_server",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal"
  }, {
    createGenericRouteHandlers: ({ world, backendHost, frontendHost, sessionStore }) => {
      const sessionServices = createRuntimeSessionServices({ sessionStore });
      return createCoreRuntimeBundleHandlers({
        world,
        backendHost,
        frontendHost,
        send,
        sendJson,
        readJson,
        requestActors: () => [],
        requestVisibleWitnesses: () => world.allWitnesses(),
        currentIdentityIndex: () => world.project(moduleProjectors.identityIndex),
        sessionStore,
        ...sessionServices,
        sessionCookieHeader,
        clearSessionCookieHeader,
        tutorialProgressFor: sessionServices.tutorialProgressFor,
        setTutorialProgress: sessionServices.setTutorialProgress,
        guidanceProgressFor: sessionServices.guidanceProgressFor,
        setGuidanceProgress: sessionServices.setGuidanceProgress,
        runtimeProfile: "minimal",
        currentBackendCapabilities: () => new Set(["http.serve", "runtime.config"]),
        currentFrontendCapabilities: () => new Set(["dom.render", "http.fetch"]),
        handlerSetDefinitions: {},
        buildRuntimeDiagnosticsForProfile: () => ({}),
        getRuntimePluginCatalog: async () => ({
          summary: {},
          authoredPluginIds: [],
          operatorPluginIds: [],
          effectivePluginIds: [],
          configuredPluginIds: [],
          activePluginIds: [],
          rejectedPlugins: [],
          addedBundleIds: []
        }),
        getRuntimePluginReviews: async () => [],
        invokeRouteHandler: async () => ({ status: 500, body: { error: "unsupported" } }),
        supportedBackendOps: [],
        currentAppRenderWorld: () => world
      });
    },
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    readRuntimePluginCatalog: async input => ({
      pluginRoot: input.pluginRoot,
      activeProfile: input.runtimeProfile,
      packages: [],
      summary: {},
      authoredPluginIds: [],
      operatorPluginIds: [],
      effectivePluginIds: [],
      configuredPluginIds: [],
      activePluginIds: [],
      rejectedPlugins: [],
      addedBundleIds: [],
      selection: { hasBlockingErrors: false }
    }),
    loadRuntimePluginModules: async () => ({
      bundleOverrides: {},
      failures: [],
      hasBlockingErrors: false
    }),
    applyRuntimePluginLoadState: catalog => catalog,
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({
      profile,
      bundles: [],
      pageHandlers: ["page.surface"],
      authorableHandlers: ["page.surface", "pipeline.platform-config.snapshot"],
      handlerMetadata: {},
      dispatchHandlers: ["page.surface", "pipeline.platform-config.snapshot"]
    }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => ["page.surface", "pipeline.platform-config.snapshot"],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    runtimeCapabilityDefinitionsForProfile: () => [],
    runtimeBuiltinSeedContributionsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: () => [],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      runtimeContributions: runtimeContext.runtimeContributions,
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["engentus_server", runtimeContext]]),
      resolveActiveRuntime: async () => ({ runner, context: runtimeContext })
    }),
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4331 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  assert.equal(server.ok, true);
  assert.equal(typeof requestHandler, "function");
  return {
    server,
    world,
    request: async ({ method = "GET", url, actor = null } = {}) => {
      const req = {
        method,
        url,
        headers: actor ? { "x-witness-actor": actor } : {},
        on() {}
      };
      const res = createResponse();
      await requestHandler(req, res);
      return res;
    },
    lastFailureMessage: () => world.allWitnesses().filter(witness => witness.process === "server.request.failed").at(-1)?.body?.message ?? null,
    pipelineSnapshotCalls: () => pipelineSnapshotCalls
  };
}

test("unauthenticated Engentus deep links return only the login shell with pending target context", async () => {
  const world = await createEngentusWorld();
  const { server, request, lastFailureMessage } = await startEngentusAuthzServer(world);
  try {
    const res = await request({ url: "/engentus/platform-config/secrets" });
    assert.equal(res.statusCode, 200, `failure=${lastFailureMessage()} body=${res.body}`);
    assert.match(res.body, /view-login/);
    assert.doesNotMatch(res.body, /view-platform-config-secrets/);
    const manifest = extractManifest(res.body);
    assert.equal(manifest.activeSurfaceId, "EngentusLogin");
    assert.equal(manifest.initialStateOverrides.EngentusPendingRouteKey, "platform-config-secrets");
    assert.equal(manifest.initialStateOverrides.EngentusPendingFeatureId, "engentus.platform_config");
    assert.equal(manifest.initialStateOverrides.EngentusPendingRoutePath, "/engentus/platform-config/secrets");
    assert.equal(manifest.surfaces.some(surface => surface.id.startsWith("EngentusPlatformConfig")), false);
  } finally {
    await server.close();
  }
});

test("hidden Engentus routes return not-found shells without protected platform-config surfaces", async () => {
  const world = await createEngentusWorld();
  const { server, request, lastFailureMessage } = await startEngentusAuthzServer(world);
  try {
    const res = await request({ url: "/engentus/platform-config", actor: "callan" });
    assert.equal(res.statusCode, 404, `failure=${lastFailureMessage()} body=${res.body}`);
    assert.match(res.body, /view-not-found/);
    assert.doesNotMatch(res.body, /view-platform-config/);
    assert.doesNotMatch(res.body, /platform-config-sidebar/);
    const manifest = extractManifest(res.body);
    assert.equal(manifest.activeSurfaceId, "EngentusNotFound");
    assert.equal(manifest.surfaces.some(surface => surface.id.startsWith("EngentusPlatformConfig")), false);
  } finally {
    await server.close();
  }
});

test("locked Engentus routes return access-denied shells without protected mill-force surfaces", async () => {
  const world = await createEngentusWorld();
  const { server, request, lastFailureMessage } = await startEngentusAuthzServer(world);
  try {
    const res = await request({ url: "/engentus/mill-force", actor: "callan" });
    assert.equal(res.statusCode, 403, `failure=${lastFailureMessage()} body=${res.body}`);
    assert.match(res.body, /view-access-denied/);
    assert.doesNotMatch(res.body, /view-mill-force/);
    const manifest = extractManifest(res.body);
    assert.equal(manifest.activeSurfaceId, "EngentusAccessDenied");
    assert.equal(manifest.surfaces.some(surface => surface.id === "EngentusMillForceApp"), false);
  } finally {
    await server.close();
  }
});

test("hidden platform-config api routes return 404 before the handler runs", async () => {
  const world = await createEngentusWorld();
  const { server, request, pipelineSnapshotCalls } = await startEngentusAuthzServer(world);
  try {
    const res = await request({
      method: "POST",
      url: "/api/pipeline/platform-config/snapshot",
      actor: "callan"
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: "not found" });
    assert.equal(pipelineSnapshotCalls(), 0);
  } finally {
    await server.close();
  }
});
