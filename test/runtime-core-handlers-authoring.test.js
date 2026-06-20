import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { AppSnapshotManager, APP_SOURCE_WRITE_PATH } from "../src/app-snapshot-manager.js";
import { createCoreRuntimeBundleHandlers } from "../src/runtime-core-handlers.js";

function createHandlerHarness() {
  const responses = [];
  const world = createWorld();
  const handlers = createCoreRuntimeBundleHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    send() {},
    sendJson(_res, status, body) {
      responses.push({ status, body });
    },
    readJson: async req => req.body ?? {},
    requestActors: () => [],
    requestVisibleWitnesses: () => world.allWitnesses(),
    currentIdentityIndex: () => ({ byId: {}, byActor: {} }),
    sessionStore: new Map(),
    createSessionForIdentity: async () => null,
    sessionResponseShape: () => null,
    syncSessionAuthSummary: () => null,
    sessionCookieHeader: () => "",
    clearSessionCookieHeader: () => "",
    tutorialProgressFor: () => null,
    setTutorialProgress: () => {},
    guidanceProgressFor: () => null,
    setGuidanceProgress: () => {},
    runtimeProfile: "full",
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
  return {
    handlers,
    takeResponse() {
      assert.ok(responses.length > 0, "expected handler to send a response");
      return responses.pop();
    }
  };
}

test("app.source.write is blocked even when witness-core ownership is configured", async () => {
  let publishedTransactionCalls = 0;
  const bridge = {
    async statSource() {
      return { path: "app/shell.rvm", exists: true, hash: "sha256:baseline", size: 20 };
    },
    async writeSource() {
      const error = new Error("witness core unavailable");
      error.status = 503;
      error.code = "WITNESS_CORE_UNAVAILABLE";
      throw error;
    },
    async publishedAuthoringTransaction() {
      publishedTransactionCalls += 1;
      return { ok: true };
    }
  };
  const snapshotManager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    logger: { warn() {} },
    generationBridge: bridge,
    requireGenerationBridgeForPublishedWrites: true,
    fsModule: {
      async mkdir() {
        throw new Error("local fs fallback should not run");
      },
      async writeFile() {
        throw new Error("local fs fallback should not run");
      }
    }
  });
  snapshotManager.consumeDirtyAndRebuild = async () => ({
    appRevision: 2
  });

  const { handlers, takeResponse } = createHandlerHarness();

  await handlers["app.source.write"]({
    req: {
      body: {
        edits: [{
          path: "app/shell.rvm",
          content: "(surface ShouldFailClosed)"
        }]
      }
    },
    res: {},
    appContext: {
      runtimeProfile: "full",
      serverRunnerId: "engentus_server",
      witnessCoreBridge: bridge,
      runtimeSupervision: {
        watchersEnabled: true
      },
      appSnapshotManager: snapshotManager
    },
    requestActor: "tester",
    requestSession: { id: "session-1" }
  });

  const response = takeResponse();
  assert.equal(response.status, 403);
  assert.equal(response.body?.error, "blocked by MCP-authoring-only policy");
  assert.equal(response.body?.blockedHandoff?.attemptedAuthoringPath, APP_SOURCE_WRITE_PATH);
  assert.equal(response.body?.blockedHandoff?.minimumHumanAction, "use MCP compute-module package authoring");
  assert.match(response.body?.blockedHandoff?.proof?.join("\n") ?? "", /package materialized files/);
  assert.equal(publishedTransactionCalls, 0);
  assert.equal(snapshotManager.pendingDirtySources.size, 0);
  assert.equal(APP_SOURCE_WRITE_PATH, "/api/runtime/app-sources");
});

test("app.source.write is blocked before local fallback when witness-core is not configured", async () => {
  const snapshotManager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    fsModule: {
      async mkdir() {
        throw new Error("local fs fallback should not run");
      },
      async writeFile() {
        throw new Error("local fs fallback should not run");
      }
    }
  });
  snapshotManager.consumeDirtyAndRebuild = async () => ({
    appRevision: 2
  });

  const { handlers, takeResponse } = createHandlerHarness();

  await handlers["app.source.write"]({
    req: {
      body: {
        edits: [{
          path: "app/shell.rvm",
          content: "(surface NeedsCore)"
        }]
      }
    },
    res: {},
    appContext: {
      runtimeProfile: "full",
      serverRunnerId: "engentus_server",
      witnessCoreBridge: null,
      runtimeSupervision: {
        watchersEnabled: true
      },
      appSnapshotManager: snapshotManager
    },
    requestActor: "tester",
    requestSession: { id: "session-1" }
  });

  const response = takeResponse();
  assert.equal(response.status, 403);
  assert.equal(response.body?.error, "blocked by MCP-authoring-only policy");
  assert.equal(response.body?.blockedHandoff?.attemptedAuthoringPath, APP_SOURCE_WRITE_PATH);
  assert.equal(response.body?.blockedHandoff?.minimumHumanAction, "use MCP compute-module package authoring");
  assert.equal(snapshotManager.pendingDirtySources.size, 0);
});
