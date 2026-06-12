import assert from "node:assert/strict";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import { startRuntimeServer } from "../src/runtime-server.js";

function createWitnessWorld({ routes = [] } = {}) {
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
    project(projector) {
      if (projector === moduleProjectors.servedRoutes) return routes;
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
    sendJson: (res, status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
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
