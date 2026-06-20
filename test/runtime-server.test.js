import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { moduleProjectors } from "../src/modules.js";
import {
  declareBackendHost,
  declareFrontendHost,
  hostCapabilities,
  resolveServerRunner,
  resolveStartupRunner,
  resolveStorageConfig
} from "../src/runtime-host-utils.js";
import { startRuntimeServer } from "../src/runtime-server.js";
import {
  RUNTIME_WORKER_CONTROL_PATH,
  RUNTIME_WORKER_CONTROL_PROTOCOL_VERSION
} from "../src/runtime-worker-control-contract.js";

function createWitnessWorld({ routes = [], runtimePluginInstalls = [] } = {}) {
  const witnesses = [];
  return {
    emit(entry) {
      const witness = { id: `w${witnesses.length + 1}`, ...entry };
      witnesses.push(witness);
      return witness;
    },
    observe(entry) {
      const witness = { id: `w${witnesses.length + 1}`, ...entry };
      witnesses.push(witness);
      return witness;
    },
    allWitnesses() {
      return witnesses;
    },
    async commitBufferedPersistence() {},
    async flushPersistence() {},
    project(projector) {
      if (projector === moduleProjectors.servedRoutes) return routes;
      if (projector === moduleProjectors.runtimePluginInstallIndex) {
        return {
          rows: runtimePluginInstalls,
          byServerRunner: runtimePluginInstalls.reduce((acc, row) => {
            if (!acc[row.serverRunner]) acc[row.serverRunner] = [];
            acc[row.serverRunner].push(row);
            return acc;
          }, {})
        };
      }
      return [];
    }
  };
}

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

function createModuleProjectorRuntimeDeps({ runner, projectors, port = 4322 }) {
  return {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: (_world, hostId) => hostId === runner.backendHost
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: () => {},
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    readRuntimePluginCatalog: async input => ({
      pluginRoot: input.pluginRoot,
      activeProfile: input.runtimeProfile,
      packages: [],
      summary: {},
      authoredPluginIds: [],
      operatorPluginIds: [],
      effectivePluginIds: ["plugin.assets"],
      configuredPluginIds: [],
      activePluginIds: ["plugin.assets"],
      rejectedPlugins: [],
      addedBundleIds: ["bundle-assets"],
      selection: { hasBlockingErrors: false }
    }),
    loadRuntimePluginModules: async () => ({
      bundleOverrides: {},
      failures: [],
      hasBlockingErrors: false
    }),
    applyRuntimePluginLoadState: catalog => catalog,
    runtimeBundleSummaryForProfile: profile => ({
      profile,
      dispatchHandlers: [],
      bundles: [{
        id: "bundle-assets",
        contributes: {
          providers: [{
            kind: "moduleProjectors",
            id: "assets.projections",
            projectors
          }]
        }
      }]
    }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => []
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  };
}

test("runtime server emits a startup failure when runner resolution fails", async () => {
  const world = createWitnessWorld();
  const result = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "missing",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} }
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: false, reason: "missing" }),
    resolveStartupRunner: () => ({ ok: false, reason: "missing runner", body: { reason: "missing runner", serverRunner: "missing" } }),
    resolveStorageConfig: () => ({}),
    sendJson: () => {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing runner");
  assert.equal(world.allWitnesses().at(-1)?.process, "server.start.failed");
  assert.equal(world.allWitnesses().at(-1)?.body?.serverRunner, "missing");
});

test("runtime server composes authored runtime plugin installs with operator plugin ids for the active runner", async () => {
  const world = createWitnessWorld({
    runtimePluginInstalls: [{ serverRunner: "runner-1", plugin: "plugin.inspect" }]
  });
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let catalogRequest = null;

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.canvas"]
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: () => {},
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    readRuntimePluginCatalog: async input => {
      catalogRequest = input;
      return {
        pluginRoot: input.pluginRoot,
        activeProfile: input.runtimeProfile,
        packages: [],
        summary: { discoveredCount: 0, validCount: 0, invalidCount: 0, ignoredCount: 0, compatibleCount: 0, installableCount: 0, executableCount: 0, requestedCount: 0, eligibleCount: 0, activeCount: 0, rejectedCount: 0, trustStateCounts: {} },
        authoredPluginIds: ["plugin.inspect"],
        operatorPluginIds: ["plugin.canvas"],
        effectivePluginIds: ["plugin.inspect", "plugin.canvas"],
        configuredPluginIds: ["plugin.canvas"],
        activePluginIds: [],
        rejectedPlugins: [],
        addedBundleIds: [],
        selection: { hasBlockingErrors: false }
      };
    },
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
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
  assert.deepEqual(catalogRequest?.authoredPluginIds, ["plugin.inspect"]);
  assert.deepEqual(catalogRequest?.configuredPluginIds, ["plugin.canvas"]);
  assert.deepEqual(server.runtimePluginCatalog.effectivePluginIds, ["plugin.inspect", "plugin.canvas"]);
  await server.close();
});

test("runtime server exposes startup telemetry and defers app snapshot boot behind listen", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let resolveSnapshotManager = null;
  let testMonitorInitialized = false;
  const createdSnapshotManager = {
    appRevision: 7,
    diagnostics() {
      return { sourceCount: 3 };
    },
    close() {}
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    appProject: {
      appRoot: "C:/app",
      manifestPath: "C:/app/app.wtoml"
    },
    backgroundStartupPolicy: {
      verificationPersistence: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
      testMonitor: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
      appSnapshotInitialBuild: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 }
    },
    logger: { info() {}, error() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: () => {},
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
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
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      appRoot: "C:/app",
      manifestPath: "C:/app/app.wtoml",
      storage: {},
      runtimeConfig: {},
      providerRuntimes: {
        "platform.testMonitor": {
          async initialize() {
            testMonitorInitialized = true;
          },
          close() {}
        }
      },
      close() {},
      visibleWitnesses: () => []
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    createRuntimeVerificationPersistence: async () => ({
      inspect: () => ({ diagnostics: [{ code: "verification-ready" }] }),
      close() {}
    }),
    AppSnapshotManagerClass: {
      create: () => new Promise(resolve => {
        resolveSnapshotManager = resolve;
      })
    },
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
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
  assert.equal(server.runtimeContext.appSnapshotManager, null);
  assert.equal(testMonitorInitialized, false);
  assert.equal(server.getStartupTelemetry().listenReadyAtMs != null, true);
  assert.equal(server.getStartupTelemetry().backgroundPendingCount > 0, true);

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(typeof resolveSnapshotManager, "function");
  resolveSnapshotManager(createdSnapshotManager);
  const startup = await server.startupReady;
  assert.equal(testMonitorInitialized, true);
  assert.equal(server.runtimeContext.appSnapshotManager, createdSnapshotManager);
  assert.equal(startup.phases.find(phase => phase.id === "runtime.appSnapshot.initialBuild")?.status, "completed");
  assert.equal(startup.phases.find(phase => phase.id === "runtime.verificationPersistence")?.status, "completed");

  await server.close();
});

test("runtime server requires witness-core preview access whenever witness-core is configured", async () => {
  async function startServerForPreviewImports(sharedLibImports = []) {
    const world = createWitnessWorld();
    const runner = {
      id: "runner-1",
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      allowActorHeader: false,
      handlerSet: null
    };
    const createdSnapshotManager = {
      getActiveSnapshot() {
        return {
          appRevision: 1,
          world: { allWitnesses() { return []; } },
          appProject: {
            diagnostics: {
              imports: {
                "shared-lib": sharedLibImports
              }
            }
          }
        };
      },
      diagnostics() {
        return { sourceCount: 0 };
      },
      close() {}
    };

    return await startRuntimeServer(world, {
      actor: "adam",
      serverRunnerId: "runner-1",
      runtimeRoot: "C:/runtime",
      appProject: {
        appRoot: "C:/app",
        manifestPath: "C:/app/app.wtoml",
        diagnostics: {
          imports: {
            "shared-lib": sharedLibImports
          }
        }
      },
      env: {
        ...process.env,
        WITNESS_CORE_URL: "http://127.0.0.1:8788"
      },
      backgroundStartupPolicy: {
        verificationPersistence: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
        testMonitor: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
        appSnapshotInitialBuild: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 }
      },
      logger: { info() {}, error() {}, warn() {} },
      runtimeProfile: "full"
    }, {
      createGenericRouteHandlers: () => ({}),
      hostCapabilities: (_world, hostId) => hostId === "backendHost"
        ? new Set(["http.serve", "runtime.config"])
        : new Set(["dom.render", "http.fetch"]),
      resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
      resolveServerRunner: () => ({ ok: true, runner }),
      resolveStartupRunner: () => ({ ok: true, runner }),
      resolveStorageConfig: () => ({}),
      sendJson: () => {},
      defaultHostCapabilitiesForProfile: () => [],
      ensureRuntimeBuiltins: () => {},
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
      runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
      runtimeSurfaceEntriesForProfile: () => [],
      dispatchHandlerIdsForProfile: () => [],
      handlerSetFactoriesForProfile: () => ({}),
      handlerSetDefinitionsForProfile: () => ({}),
      providedCapabilityIdsForProfile: () => [],
      startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
      createRuntimeAppContextForRunner: async () => ({
        ok: true,
        actors: [],
        storage: {},
        runtimeConfig: {},
        providerRuntimes: {
          "platform.testMonitor": {
            async initialize() {},
            close() {}
          }
        },
        close() {},
        visibleWitnesses: () => []
      }),
      createRuntimeResolverForServer: () => ({
        runtimeContexts: new Map(),
        resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
      }),
      createRuntimeVerificationPersistence: async () => ({
        inspect: () => ({ diagnostics: [] }),
        close() {}
      }),
      AppSnapshotManagerClass: {
        async create() {
          return createdSnapshotManager;
        }
      },
      httpModule: {
        createServer() {
          return {
            listen(_port, _host, callback) {
              callback();
            },
            address() {
              return { port: 4321 };
            },
            closeAllConnections() {},
            close(callback) {
              callback();
            }
          };
        }
      }
    });
  }

  const appOnlyServer = await startServerForPreviewImports([]);
  await appOnlyServer.startupReady;
  assert.equal(appOnlyServer.runtimeContext.appPreviewSessionManager.requireGenerationBridgeForPreviewAccess, true);
  await appOnlyServer.close();

  const sharedLibServer = await startServerForPreviewImports(["C:/tmp/examples/_lib/common.wtoml"]);
  await sharedLibServer.startupReady;
  assert.equal(sharedLibServer.runtimeContext.appPreviewSessionManager.requireGenerationBridgeForPreviewAccess, true);
  await sharedLibServer.close();
});

test("runtime server requires canonical verification persistence for supervised app-serving runtimes", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  const createdSnapshotManager = {
    diagnostics() {
      return { sourceCount: 0 };
    },
    close() {}
  };
  const calls = [];
  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    appProject: {
      appRoot: "C:/app",
      manifestPath: "C:/app/app.wtoml",
      diagnostics: { imports: {} }
    },
    env: {
      ...process.env,
      WITNESS_RUNTIME_WATCHERS_ENABLED: "false"
    },
    backgroundStartupPolicy: {
      verificationPersistence: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
      testMonitor: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
      appSnapshotInitialBuild: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 }
    },
    logger: { info() {}, error() {}, warn() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: () => {},
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
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
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      appRoot: "C:/app",
      manifestPath: "C:/app/app.wtoml",
      storage: {},
      runtimeConfig: {},
      providerRuntimes: {
        "platform.testMonitor": {
          async initialize() {},
          close() {}
        }
      },
      close() {},
      visibleWitnesses: () => []
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    createRuntimeVerificationPersistence: async input => {
      calls.push(input);
      return {
        inspect: () => ({ diagnostics: [] }),
        close() {}
      };
    },
    AppSnapshotManagerClass: {
      async create() {
        return createdSnapshotManager;
      }
    },
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });
  await server.startupReady;
  assert.equal(calls.length > 0, true);
  assert.equal(calls[0].requireCanonicalBoundary, true);
  await server.close();
});

test("runtime server waits for pre-ready startup persistence flush before returning", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let resolveFlush = null;
  let flushCalled = false;
  let flushed = false;
  world.flushPersistence = () => {
    flushCalled = true;
    if (flushed) return Promise.resolve();
    return new Promise(resolve => {
      resolveFlush = () => {
        flushed = true;
        resolve();
      };
    });
  };
  let resolved = false;
  const started = startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    runtimeProfile: "full",
    startupPersistenceCommitMode: "pre-ready",
    backgroundStartupPolicy: {
      verificationPersistence: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
      testMonitor: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 }
    },
    logger: { info() {}, error() {} }
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
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
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      runtimeConfig: {},
      providerRuntimes: {
        "platform.testMonitor": {
          async initialize() {},
          close() {}
        }
      },
      close() {},
      visibleWitnesses: () => []
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    createRuntimeVerificationPersistence: async () => ({
      inspect: () => ({ diagnostics: [] }),
      close() {}
    }),
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });
  started.then(() => {
    resolved = true;
  });

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(flushCalled, true);
  assert.equal(resolved, false);

  resolveFlush();
  const server = await started;
  assert.equal(server.ok, true);
  await server.close();
});

test("runtime server defers post-ready startup persistence commit into background startup", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let resolveCommit = null;
  let commitCalled = false;
  world.commitBufferedPersistence = () => {
    commitCalled = true;
    return new Promise(resolve => {
      resolveCommit = resolve;
    });
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    runtimeProfile: "full",
    startupPersistenceCommitMode: "post-ready",
    backgroundStartupPolicy: {
      verificationPersistence: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 },
      testMonitor: { minDelayMs: 0, quietWindowMs: 0, maxDelayMs: 0 }
    },
    logger: { info() {}, error() {} }
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
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
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      runtimeConfig: {},
      providerRuntimes: {
        "platform.testMonitor": {
          async initialize() {},
          close() {}
        }
      },
      close() {},
      visibleWitnesses: () => []
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    createRuntimeVerificationPersistence: async () => ({
      inspect: () => ({ diagnostics: [] }),
      close() {}
    }),
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
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
  assert.equal(server.getStartupTelemetry().meaningfulReadyAtMs != null, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(commitCalled, true);

  let startupReadyResolved = false;
  const startupReady = server.startupReady.then(snapshot => {
    startupReadyResolved = true;
    return snapshot;
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(startupReadyResolved, false);

  resolveCommit();
  const snapshot = await startupReady;
  assert.equal(snapshot.phases.find(phase => phase.id === "runtime.persistence.commit")?.status, "completed");
  await server.close();
});

test("runtime server attaches active plugin module projectors to the runtime world", async () => {
  const world = createWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal",
    env: {
      ...process.env,
      WITNESS_RUNTIME_INSTANCE_ID: "runtime-1",
      WITNESS_RUNTIME_ROLE: "active",
      WITNESS_RUNTIME_MUTATIONS_ENABLED: "true",
      WITNESS_RUNTIME_WATCHERS_ENABLED: "false"
    }
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: () => {},
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    readRuntimePluginCatalog: async input => ({
      pluginRoot: input.pluginRoot,
      activeProfile: input.runtimeProfile,
      packages: [],
      summary: {},
      authoredPluginIds: [],
      operatorPluginIds: [],
      effectivePluginIds: ["plugin.assets"],
      configuredPluginIds: [],
      activePluginIds: ["plugin.assets"],
      rejectedPlugins: [],
      addedBundleIds: ["bundle-assets"],
      selection: { hasBlockingErrors: false }
    }),
    loadRuntimePluginModules: async () => ({
      bundleOverrides: {},
      failures: [],
      hasBlockingErrors: false
    }),
    applyRuntimePluginLoadState: catalog => catalog,
    runtimeBundleSummaryForProfile: profile => ({
      profile,
      dispatchHandlers: [],
      bundles: [{
        id: "bundle-assets",
        contributes: {
          providers: [{
            kind: "moduleProjectors",
            id: "assets.projections",
            projectors: {
              assets: () => [{ id: "asset.plugin", title: "Plugin Asset" }],
              assetIndex: () => ({ rows: [{ id: "asset.plugin" }], byId: { "asset.plugin": { id: "asset.plugin" } } })
            }
          }]
        }
      }]
    }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4322 };
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
  assert.deepEqual(world.project(moduleProjectors.assets), [{ id: "asset.plugin", title: "Plugin Asset" }]);
  await server.close();
  assert.deepEqual(world.project(moduleProjectors.assets), []);
});

test("runtime server keeps identical active module projectors isolated until each server closes", async () => {
  const projectors = {
    assets: () => [{ id: "asset.plugin", title: "Plugin Asset" }],
    assetIndex: () => ({ rows: [{ id: "asset.plugin" }], byId: { "asset.plugin": { id: "asset.plugin" } } })
  };
  const runnerOne = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  const runnerTwo = {
    id: "runner-2",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let first = null;
  let second = null;
  const worldOne = createWorld();
  const worldTwo = createWorld();
  try {
    first = await startRuntimeServer(worldOne, {
      actor: "adam",
      serverRunnerId: "runner-1",
      runtimeRoot: "C:/runtime",
      logger: { info() {}, error() {} },
      runtimeProfile: "minimal"
    }, createModuleProjectorRuntimeDeps({ runner: runnerOne, projectors, port: 4323 }));
    second = await startRuntimeServer(worldTwo, {
      actor: "adam",
      serverRunnerId: "runner-2",
      runtimeRoot: "C:/runtime",
      logger: { info() {}, error() {} },
      runtimeProfile: "minimal"
    }, createModuleProjectorRuntimeDeps({ runner: runnerTwo, projectors, port: 4324 }));

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.deepEqual(worldOne.project(moduleProjectors.assets), [{ id: "asset.plugin", title: "Plugin Asset" }]);
    assert.deepEqual(worldTwo.project(moduleProjectors.assets), [{ id: "asset.plugin", title: "Plugin Asset" }]);
    await first.close();
    first = null;
    assert.deepEqual(worldOne.project(moduleProjectors.assets), []);
    assert.deepEqual(worldTwo.project(moduleProjectors.assets), [{ id: "asset.plugin", title: "Plugin Asset" }]);
    await second.close();
    second = null;
    assert.deepEqual(worldTwo.project(moduleProjectors.assets), []);
  } finally {
    if (first?.ok) await first.close();
    if (second?.ok) await second.close();
  }
});

test("runtime servers can use different active module projector implementations concurrently", async () => {
  const runnerOne = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  const runnerTwo = {
    id: "runner-2",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  const firstProjectors = {
    assets: () => [{ id: "asset.first" }]
  };
  const secondProjectors = {
    assets: () => [{ id: "asset.second" }]
  };
  let first = null;
  let second = null;
  const worldOne = createWorld();
  const worldTwo = createWorld();
  try {
    first = await startRuntimeServer(worldOne, {
      actor: "adam",
      serverRunnerId: "runner-1",
      runtimeRoot: "C:/runtime",
      logger: { info() {}, error() {} },
      runtimeProfile: "minimal"
    }, createModuleProjectorRuntimeDeps({ runner: runnerOne, projectors: firstProjectors, port: 4325 }));
    assert.equal(first.ok, true);

    second = await startRuntimeServer(worldTwo, {
      actor: "adam",
      serverRunnerId: "runner-2",
      runtimeRoot: "C:/runtime",
      logger: { info() {}, error() {} },
      runtimeProfile: "minimal"
    }, createModuleProjectorRuntimeDeps({ runner: runnerTwo, projectors: secondProjectors, port: 4326 }));

    assert.equal(second.ok, true);
    assert.deepEqual(worldOne.project(moduleProjectors.assets), [{ id: "asset.first" }]);
    assert.deepEqual(worldTwo.project(moduleProjectors.assets), [{ id: "asset.second" }]);
    await first.close();
    first = null;
    assert.deepEqual(worldOne.project(moduleProjectors.assets), []);
    assert.deepEqual(worldTwo.project(moduleProjectors.assets), [{ id: "asset.second" }]);
  } finally {
    if (first?.ok) await first.close();
    if (second?.ok) await second.close();
  }
  assert.deepEqual(worldOne.project(moduleProjectors.assets), []);
  assert.deepEqual(worldTwo.project(moduleProjectors.assets), []);
});

test("runtime server rejects duplicate active module projector providers before registration", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  const result = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal"
  }, {
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
      effectivePluginIds: ["plugin.alpha", "plugin.beta"],
      configuredPluginIds: [],
      activePluginIds: ["plugin.alpha", "plugin.beta"],
      rejectedPlugins: [],
      addedBundleIds: ["bundle-alpha", "bundle-beta"],
      selection: { hasBlockingErrors: false }
    }),
    loadRuntimePluginModules: async () => ({
      bundleOverrides: {},
      failures: [],
      hasBlockingErrors: false
    }),
    applyRuntimePluginLoadState: catalog => catalog,
    runtimeBundleSummaryForProfile: profile => ({
      profile,
      dispatchHandlers: [],
      bundles: [
        {
          id: "bundle-alpha",
          contributes: {
            providers: [{
              kind: "moduleProjectors",
              id: "alpha.projections",
              projectors: { assets: () => [{ id: "alpha" }] }
            }]
          }
        },
        {
          id: "bundle-beta",
          contributes: {
            providers: [{
              kind: "moduleProjectors",
              id: "beta.projections",
              projectors: { assets: () => [{ id: "beta" }] }
            }]
          }
        }
      ]
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "runtime plugin contributions unresolved");
  assert.match(String(result.error?.message ?? ""), /duplicate runtime contribution assets/);
  assert.deepEqual(moduleProjectors.assets([]), []);
});

test("runtime server defines and installs plugin-selected default host capabilities before startup validation", async () => {
  const world = createWorld({ genesis: { system: "runtime-server-test" } });
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "runner-1"
backendHost = "backendHost"
frontendHost = "frontendHost"
`);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities,
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner,
    resolveStartupRunner,
    resolveStorageConfig,
    sendJson: () => {},
    readRuntimePluginCatalog: async () => ({
      pluginRoot: "plugins",
      activeProfile: "minimal",
      packages: [],
      summary: {},
      authoredPluginIds: [],
      operatorPluginIds: [],
      effectivePluginIds: ["plugin.demo"],
      configuredPluginIds: [],
      activePluginIds: ["plugin.demo"],
      rejectedPlugins: [],
      addedBundleIds: ["bundle-demo"],
      selection: { hasBlockingErrors: false }
    }),
    loadRuntimePluginModules: async () => ({
      bundleOverrides: {},
      failures: [],
      hasBlockingErrors: false
    }),
    defaultHostCapabilitiesForProfile: (_profile, hostKind, options) => {
      assert.equal(options.additionalBundleIds.includes("bundle-demo"), true);
      return hostKind === "backend" ? ["fs.json.read", "fs.json.write"] : [];
    },
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    runtimeCapabilityDefinitionsForProfile: () => [],
    runtimeBuiltinSeedContributionsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["fs.json.read", "fs.json.write"] : [],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map(),
      resolveActiveRuntime: async () => ({
        runner: resolveServerRunner(world, "runner-1").runner,
        context: { handlers: {}, close() {} }
      })
    }),
    httpModule: {
      createServer() {
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
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
  assert.equal(hostCapabilities(world, "backendHost").has("fs.json.read"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("fs.json.write"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "installCapability.failed"), false);
  await server.close();
});

test("runtime server dispatches mounted routes and owns lifecycle outside host.js", async () => {
  const routes = [{
    id: "hello_route",
    serverRunner: "runner-1",
    method: "GET",
    path: "/hello",
    handler: "demo.hello"
  }];
  const world = createWitnessWorld({ routes });
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: true,
    handlerSet: "demo"
  };
  let requestHandler = null;
  let closedServer = false;
  let closedConnections = false;
  let closedBootstrap = false;
  const runtimeContext = {
    handlers: {
      "demo.hello": async ({ res, requestActor, route }) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`hello:${requestActor}:${route.id}`);
      }
    },
    close() {
      closedBootstrap = true;
    }
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
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
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: ["demo.hello"] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => ["demo.hello"],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [{ id: "adam", label: "Adam" }],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", runtimeContext]]),
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
            return { port: 4321 };
          },
          closeAllConnections() {
            closedConnections = true;
          },
          close(callback) {
            closedServer = true;
            callback();
          }
        };
      }
    }
  });

  assert.equal(server.ok, true);
  assert.equal(server.url, "http://127.0.0.1:4321");
  assert.equal(typeof requestHandler, "function");
  assert.equal(world.allWitnesses().some(witness => witness.process === "server.start" && witness.body?.routeCount === 1), true);

  const req = {
    method: "GET",
    url: "/hello",
    headers: { "x-witness-actor": "casey" },
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "hello:casey:hello_route");
  assert.equal(world.allWitnesses().some(witness => witness.process === "backend.request.finish" && witness.body?.route === "hello_route"), true);

  await server.close();
  assert.equal(closedBootstrap, true);
  assert.equal(closedConnections, true);
  assert.equal(closedServer, true);
});

test("runtime server returns 410 for retired page.home routes", async () => {
  const routes = [{
    id: "legacy_home",
    serverRunner: "runner-1",
    method: "GET",
    path: "/",
    handler: "page.home",
    params: { rootWidget: "home.page" }
  }];
  const world = createWitnessWorld({ routes });
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", { handlers: {}, close() {} }]]),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  const req = {
    method: "GET",
    url: "/",
    headers: { accept: "application/json" },
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body, /legacy frontend route retired/i);
  assert.match(res.body, /frontend\.upliftLegacy/);

  await server.close();
});

test("runtime server returns 410 for retired compatibility page.surface routes", async () => {
  const routes = [{
    id: "legacy_surface",
    serverRunner: "runner-1",
    method: "GET",
    path: "/legacy",
    handler: "page.surface",
    params: { rootSurface: "legacySurface.legacy_surface" }
  }];
  const world = createWitnessWorld({ routes });
  world.emit({
    process: "desire.defineSurface",
    actor: "system",
    claims: [],
    body: {
      id: "legacySurface.legacy_surface",
      surfaceKind: "legacy-widget-program-bridge",
      props: { legacyRootWidget: "legacy_root" }
    }
  });
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: ["page.surface"] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => ["page.surface"],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", { handlers: {}, close() {} }]]),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  const req = {
    method: "GET",
    url: "/legacy",
    headers: { accept: "application/json" },
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body, /legacy frontend route retired/i);
  assert.match(res.body, /frontend\.upliftLegacy/);

  await server.close();
});

test("runtime server returns 410 for retired frontend program authoring endpoints", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", { handlers: {}, close() {} }]]),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  const req = {
    method: "POST",
    url: "/api/frontend-programs",
    headers: { accept: "application/json" },
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body, /legacy frontend authoring retired/i);
  assert.match(res.body, /page\.surface/);
  assert.match(res.body, /frontend\.upliftLegacy/);

  await server.close();
});

test("runtime server serves app-static and canvas-lib content through witness-core when configured", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;
  const bridgeCalls = [];
  const appRoot = `${process.cwd()}\\examples\\bridge-static-app`;
  const canvasProjectionPath = `${process.cwd()}\\plugins\\canvas\\canvas-projection.js`;
  const pngBytes = Buffer.from("PNGDATA", "utf8");
  const bridge = {
    async readSource({ path, encoding = null }) {
      bridgeCalls.push({ path, encoding });
      if (path === "examples/bridge-static-app/img/main.png") {
        return {
          path,
          content: encoding === "base64" ? pngBytes.toString("base64") : pngBytes.toString("utf8"),
          encoding: encoding === "base64" ? "base64" : "utf8",
          hash: "sha256:png",
          size: pngBytes.length
        };
      }
      if (path === "plugins/canvas/canvas-projection.js") {
        return {
          path,
          content: "export const projection = './projectors-core.js';",
          encoding: "utf8",
          hash: "sha256:js",
          size: 46
        };
      }
      throw Object.assign(new Error(`unexpected bridge path ${path}`), { status: 404 });
    }
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {}, warn() {} },
    runtimeProfile: "full",
    env: {
      ...process.env,
      WITNESS_CORE_URL: "http://127.0.0.1:8788"
    }
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    collectActiveRuntimeContributions: () => ({
      staticAssetFiles: new Map([
        ["canvas-projection.js", canvasProjectionPath]
      ])
    }),
    createRuntimeVerificationPersistence: async () => ({
      inspect: () => ({ diagnostics: [] }),
      close() {}
    }),
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      appRoot,
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", { handlers: {}, close() {}, appRoot }]]),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {}, appRoot } })
    }),
    createWitnessCoreBridge: () => bridge,
    createWitnessCoreStatusStore: () => null,
    fsModule: {
      async readFile(target) {
        throw new Error(`local fs read should not be used: ${target}`);
      },
      async stat(target) {
        throw new Error(`local fs stat should not be used: ${target}`);
      }
    },
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  const staticReq = {
    method: "GET",
    url: "/app-static/img/main.png",
    headers: {},
    on() {}
  };
  const staticRes = createResponse();
  await requestHandler(staticReq, staticRes);
  assert.equal(staticRes.statusCode, 200);
  assert.equal(staticRes.headers["content-type"], "image/png");
  assert.equal(staticRes.body, "PNGDATA");

  const canvasReq = {
    method: "GET",
    url: "/canvas-lib/canvas-projection.js",
    headers: {},
    on() {}
  };
  const canvasRes = createResponse();
  await requestHandler(canvasReq, canvasRes);
  assert.equal(canvasRes.statusCode, 200);
  assert.match(canvasRes.body, /projectors-core/);
  assert.equal(world.allWitnesses().some(w => w.process === "backend.readCanvasLib"), true);
  assert.deepEqual(bridgeCalls, [
    { path: "examples/bridge-static-app/img/main.png", encoding: "base64" },
    { path: "plugins/canvas/canvas-projection.js", encoding: null }
  ]);

  await server.close();
});

test("runtime server fails closed for core-connected static reads outside witness-core scope", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;
  const bridgeCalls = [];

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {}, warn() {} },
    runtimeProfile: "full",
    env: {
      ...process.env,
      WITNESS_CORE_URL: "http://127.0.0.1:8788"
    }
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
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
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    collectActiveRuntimeContributions: () => ({
      staticAssetFiles: new Map([
        ["canvas-projection.js", "D:\\outside-workspace\\canvas-projection.js"]
      ])
    }),
    createRuntimeVerificationPersistence: async () => ({
      inspect: () => ({ diagnostics: [] }),
      close() {}
    }),
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      appRoot: "D:\\outside-workspace\\app",
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", { handlers: {}, close() {}, appRoot: "D:\\outside-workspace\\app" }]]),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {}, appRoot: "D:\\outside-workspace\\app" } })
    }),
    createWitnessCoreBridge: () => ({
      async readSource(input) {
        bridgeCalls.push(input);
        throw new Error("should not read out-of-scope source");
      }
    }),
    createWitnessCoreStatusStore: () => null,
    fsModule: {
      async readFile(target) {
        throw new Error(`local fs read should not be used: ${target}`);
      },
      async stat(target) {
        throw new Error(`local fs stat should not be used: ${target}`);
      }
    },
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  const staticReq = {
    method: "GET",
    url: "/app-static/img/main.png",
    headers: {},
    on() {}
  };
  const staticRes = createResponse();
  await requestHandler(staticReq, staticRes);
  assert.equal(staticRes.statusCode, 503);
  assert.match(staticRes.body, /witness core unavailable/i);

  const canvasReq = {
    method: "GET",
    url: "/canvas-lib/canvas-projection.js",
    headers: {},
    on() {}
  };
  const canvasRes = createResponse();
  await requestHandler(canvasReq, canvasRes);
  assert.equal(canvasRes.statusCode, 503);
  assert.match(canvasRes.body, /witness core unavailable/i);
  assert.deepEqual(bridgeCalls, []);

  await server.close();
});

test("runtime server fails closed for core-connected static reads when witness-core authority is declared but the bridge is unavailable", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {}, warn() {} },
    runtimeProfile: "full",
    env: {
      ...process.env,
      WITNESS_CORE_URL: "http://127.0.0.1:8788"
    }
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
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
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    collectActiveRuntimeContributions: () => ({
      staticAssetFiles: new Map([
        ["canvas-projection.js", `${process.cwd()}\\plugins\\canvas\\canvas-projection.js`]
      ])
    }),
    createRuntimeVerificationPersistence: async () => ({
      inspect: () => ({ diagnostics: [] }),
      close() {}
    }),
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      appRoot: `${process.cwd()}\\examples\\bridge-static-app`,
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", { handlers: {}, close() {}, appRoot: `${process.cwd()}\\examples\\bridge-static-app` }]]),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {}, appRoot: `${process.cwd()}\\examples\\bridge-static-app` } })
    }),
    createWitnessCoreBridge: () => null,
    createWitnessCoreStatusStore: () => null,
    fsModule: {
      async readFile(target) {
        throw new Error(`local fs read should not be used without witness-core bridge: ${target}`);
      },
      async stat(target) {
        throw new Error(`local fs stat should not be used without witness-core bridge: ${target}`);
      }
    },
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  const staticReq = {
    method: "GET",
    url: "/app-static/img/main.png",
    headers: {},
    on() {}
  };
  const staticRes = createResponse();
  await requestHandler(staticReq, staticRes);
  assert.equal(staticRes.statusCode, 503);
  assert.match(staticRes.body, /witness core unavailable/i);

  const canvasReq = {
    method: "GET",
    url: "/canvas-lib/canvas-projection.js",
    headers: {},
    on() {}
  };
  const canvasRes = createResponse();
  await requestHandler(canvasReq, canvasRes);
  assert.equal(canvasRes.statusCode, 503);
  assert.match(canvasRes.body, /witness core unavailable/i);

  await server.close();
});

test("runtime server returns 410 for retired frontend step authoring endpoints", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: [] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => [],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", { handlers: {}, close() {} }]]),
      resolveActiveRuntime: async () => ({ runner, context: { handlers: {}, close() {} } })
    }),
    httpModule: {
      createServer(handler) {
        requestHandler = handler;
        return {
          listen(_port, _host, callback) {
            callback();
          },
          address() {
            return { port: 4321 };
          },
          closeAllConnections() {},
          close(callback) {
            callback();
          }
        };
      }
    }
  });

  const req = {
    method: "POST",
    url: "/api/frontend-steps",
    headers: { accept: "application/json" },
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body, /legacy frontend authoring retired/i);
  assert.match(res.body, /page\.surface/);
  assert.match(res.body, /frontend\.upliftLegacy/);

  await server.close();
});

test("runtime server pins an in-flight request to its starting app snapshot revision", async () => {
  const routes = [{
    id: "pin_route",
    serverRunner: "runner-1",
    method: "GET",
    path: "/pin",
    handler: "demo.pin"
  }];
  const world = createWitnessWorld({ routes });
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: "demo"
  };
  let requestHandler = null;
  let activeSnapshot = { appRevision: 1, world };
  let releaseRequest = () => {};
  let markStarted = () => {};
  const requestStarted = new Promise(resolve => {
    markStarted = resolve;
  });
  const requestGate = new Promise(resolve => {
    releaseRequest = resolve;
  });
  const runtimeContext = {
    handlers: {
      "demo.pin": async ({ res, appContext }) => {
        const beforeRevision = Number(appContext?.appSnapshotManager?.getActiveSnapshot?.()?.appRevision || 0);
        markStarted();
        await requestGate;
        const afterRevision = Number(appContext?.appSnapshotManager?.getActiveSnapshot?.()?.appRevision || 0);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          beforeRevision,
          afterRevision,
          requestAppRevision: Number(appContext?.requestAppRevision || 0)
        }));
      }
    },
    appSnapshotManager: {
      async ensureFresh() {},
      getActiveSnapshot() {
        return activeSnapshot;
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
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: ["demo.pin"] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => ["demo.pin"],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [{ id: "adam", label: "Adam" }],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", runtimeContext]]),
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
            return { port: 4321 };
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

  const req = {
    method: "GET",
    url: "/pin",
    headers: {},
    on() {}
  };
  const res = createResponse();
  const requestPromise = requestHandler(req, res);
  await requestStarted;
  activeSnapshot = { appRevision: 2, world };
  releaseRequest();
  await requestPromise;

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    beforeRevision: 1,
    afterRevision: 1,
    requestAppRevision: 1
  });

  await server.close();
});

test("runtime server tolerates null logger during request handling", async () => {
  const routes = [{
    id: "hello_route",
    serverRunner: "runner-1",
    method: "GET",
    path: "/hello",
    handler: "demo.hello"
  }];
  const world = createWitnessWorld({ routes });
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: true,
    handlerSet: "demo"
  };
  let requestHandler = null;
  let closedBootstrap = false;
  const runtimeContext = {
    handlers: {
      "demo.hello": async ({ res }) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("hello");
      }
    },
    close() {
      closedBootstrap = true;
    }
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: null,
    runtimeProfile: "full"
  }, {
    createGenericRouteHandlers: () => ({}),
    hostCapabilities: () => new Set(["http.serve", "dom.render"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: ["demo.hello"] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => ["demo.hello"],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [{ id: "adam", label: "Adam" }],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", runtimeContext]]),
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
            return { port: 4321 };
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

  const req = {
    method: "GET",
    url: "/hello",
    headers: {},
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "hello");

  await server.close();
  assert.equal(closedBootstrap, true);
});

test("runtime server exposes core runtime diagnostics through the generic route table", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;
  const runtimeContext = {
    handlers: {},
    close() {}
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal"
  }, {
    createGenericRouteHandlers: () => ({
      "runtime.diagnostics.read": async ({ res }) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ activeProfile: "minimal", route: "/api/runtime/diagnostics" }));
      }
    }),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: ["runtime.diagnostics.read"] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => ["runtime.diagnostics.read"],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [{ id: "adam", label: "Adam" }],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", runtimeContext]]),
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
            return { port: 4321 };
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

  const req = {
    method: "GET",
    url: "/api/runtime/diagnostics",
    headers: {},
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { activeProfile: "minimal", route: "/api/runtime/diagnostics" });
});

test("runtime server exposes a versioned worker-control descriptor for supervised runtimes", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;
  const runtimeContext = {
    runtimeSupervision: {
      instanceId: "runtime-1",
      role: "active",
      mutationsEnabled: true,
      watchersEnabled: false
    },
    handlers: {},
    close() {}
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal"
  }, {
    ...createModuleProjectorRuntimeDeps({ runner, projectors: {}, port: 4321 }),
    readJson: async () => ({}),
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [{ id: "adam", label: "Adam" }],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", runtimeContext]]),
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
            return { port: 4321 };
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

  const req = {
    method: "GET",
    url: RUNTIME_WORKER_CONTROL_PATH,
    headers: { host: "127.0.0.1:4321" },
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.protocol, RUNTIME_WORKER_CONTROL_PROTOCOL_VERSION);
  assert.equal(body.role, "active");
  assert.equal(body.mutationsEnabled, true);
  assert.equal(body.watchersEnabled, false);
  assert.equal(body.healthUrl, "http://127.0.0.1:4321/api/runtime/process-health");
  assert.equal(body.activationUrl, "http://127.0.0.1:4321/api/runtime/supervision/activate");
  assert.equal(body.quiesceUrl, "http://127.0.0.1:4321/api/runtime/supervision/quiesce");
  assert.equal(body.reloadUrl, "http://127.0.0.1:4321/api/runtime/app-snapshot/reload");
  assert.equal(body.actions.reload?.href, "http://127.0.0.1:4321/api/runtime/app-snapshot/reload");
});

test("runtime server exposes the local plugin catalog through the generic route table", async () => {
  const world = createWitnessWorld();
  const runner = {
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: false,
    handlerSet: null
  };
  let requestHandler = null;
  const runtimeContext = {
    handlers: {},
    close() {}
  };

  const server = await startRuntimeServer(world, {
    actor: "adam",
    serverRunnerId: "runner-1",
    runtimeRoot: "C:/runtime",
    logger: { info() {}, error() {} },
    runtimeProfile: "minimal"
  }, {
    createGenericRouteHandlers: () => ({
      "runtime.plugins.read": async ({ res }) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          activeProfile: "minimal",
          summary: { discoveredCount: 1 },
          packages: [{ id: "plugin.notes-sidebar", execution: { executable: false } }]
        }));
      }
    }),
    hostCapabilities: (_world, hostId) => hostId === "backendHost"
      ? new Set(["http.serve", "runtime.config"])
      : new Set(["dom.render", "http.fetch"]),
    readJson: async () => ({}),
    resolveRuntimeConfig: () => ({ ok: true, values: {}, fields: [], failures: [] }),
    resolveServerRunner: () => ({ ok: true, runner }),
    resolveStartupRunner: () => ({ ok: true, runner }),
    resolveStorageConfig: () => ({}),
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    defaultHostCapabilitiesForProfile: () => [],
    ensureRuntimeBuiltins: () => {},
    runtimeBundleSummaryForProfile: profile => ({ profile, bundles: [], dispatchHandlers: ["runtime.plugins.read"] }),
    runtimeSurfaceEntriesForProfile: () => [],
    dispatchHandlerIdsForProfile: () => ["runtime.plugins.read"],
    handlerSetFactoriesForProfile: () => ({}),
    handlerSetDefinitionsForProfile: () => ({}),
    providedCapabilityIdsForProfile: () => [],
    startupRequiredHostCapabilitiesForProfile: (_profile, hostKind) => hostKind === "backend" ? ["http.serve"] : ["dom.render", "http.fetch"],
    createRuntimeAppContextForRunner: async () => ({
      ok: true,
      actors: [{ id: "adam", label: "Adam" }],
      storage: {},
      visibleWitnesses: () => world.allWitnesses()
    }),
    createRuntimeResolverForServer: () => ({
      runtimeContexts: new Map([["runner-1", runtimeContext]]),
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
            return { port: 4321 };
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

  const req = {
    method: "GET",
    url: "/api/runtime/plugins",
    headers: {},
    on() {}
  };
  const res = createResponse();
  await requestHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    activeProfile: "minimal",
    summary: { discoveredCount: 1 },
    packages: [{ id: "plugin.notes-sidebar", execution: { executable: false } }]
  });
});
