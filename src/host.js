import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { thing, relation } from "./kernel.js";
import { witnessRelations, moduleProjectors } from "./modules.js";
import { renderWidgetPage } from "./widgets.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { canvasProcessHandlers } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { createLogger } from "./logger.js";
import { createDemoHandlerSet } from "./demo-handler-set.js";

const DEFAULT_ACTORS = [{ id: "aaron", label: "Aaron" }, { id: "callan", label: "Callan" }];
const HANDLER_SET_FACTORIES = {
  demo: createDemoHandlerSet
};

export function declareBackendHost(world, { actor, id, owner = actor }) {
  world.emit({
    process: "declareBackendHost",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hostCapability", "http.serve"),
      relation(id, "hostCapability", "fs.json.read"),
      relation(id, "hostCapability", "fs.json.write")
    ],
    body: { id }
  });
}

export function declareFrontendHost(world, { actor, id, owner = actor }) {
  world.emit({
    process: "declareFrontendHost",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hostCapability", "dom.render"),
      relation(id, "hostCapability", "http.fetch")
    ],
    body: { id }
  });
}

export function hostCapabilities(world, hostId) {
  const rels = world.project(witnessRelations);
  return new Set(rels.filter(r => r.from === hostId && (r.rel === "hostCapability" || r.rel === "contextCapability")).map(r => r.to));
}

export function resolveServerRunner(world, serverRunnerId = null) {
  const runners = world.project(moduleProjectors.serverRunners);
  if (serverRunnerId) {
    const runner = runners.find(candidate => candidate.id === serverRunnerId);
    if (!runner) return { ok: false, reason: "server runner not found", body: { serverRunnerId } };
    return { ok: true, runner };
  }
  if (runners.length === 1) return { ok: true, runner: runners[0] };
  if (runners.length === 0) return { ok: false, reason: "no server runners defined", body: {} };
  return { ok: false, reason: "multiple server runners defined", body: { serverRunners: runners.map(runner => runner.id) } };
}

export async function startServer(world, {
  actor,
  serverRunnerId = null,
  port = 0,
  runtimeRoot = os.tmpdir(),
  logger = createLogger()
}) {
  const resolved = resolveServerRunner(world, serverRunnerId);
  if (!resolved.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: resolved.body ?? { reason: resolved.reason }
    });
    return { ok: false, reason: resolved.reason };
  }

  const serverRunner = resolved.runner;
  const backendHost = serverRunner.backendHost;
  const frontendHost = serverRunner.frontendHost;
  if (!backendHost || !frontendHost) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, backendHost, frontendHost, reason: "server runner host bindings incomplete" }
    });
    return { ok: false, reason: "server runner host bindings incomplete" };
  }

  const backendCaps = hostCapabilities(world, backendHost);
  const frontendCaps = hostCapabilities(world, frontendHost);
  const requiredBackend = ["http.serve", "fs.json.read", "fs.json.write"];
  const requiredFrontend = ["dom.render", "http.fetch"];
  const missingBackend = requiredBackend.filter(capability => !backendCaps.has(capability));
  const missingFrontend = requiredFrontend.filter(capability => !frontendCaps.has(capability));
  if (missingBackend.length || missingFrontend.length) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, backendHost, frontendHost, missingBackend, missingFrontend }
    });
    return { ok: false, reason: "missing host capabilities" };
  }

  const storage = resolveStorageConfig(serverRunner.storage, runtimeRoot);
  const appContext = await createAppContext({
    world,
    serverRunner,
    backendHost,
    frontendHost,
    runtimeRoot,
    storage,
    sendJson,
    readJson
  });
  if (!appContext.ok) {
    world.emit({
      process: "server.start.failed",
      actor,
      claims: [],
      body: { serverRunner: serverRunner.id, reason: appContext.reason, handlerSet: serverRunner.handlerSet ?? null }
    });
    return { ok: false, reason: appContext.reason };
  }

  const visibleWitnesses = appContext.visibleWitnesses ?? (() => world.allWitnesses());
  const routeHandlers = {
    ...createGenericRouteHandlers({
      world,
      backendHost,
      frontendHost,
      actors: appContext.actors,
      logger,
      visibleWitnesses
    }),
    ...(appContext.handlers ?? {})
  };
  const routeTable = world.project(moduleProjectors.servedRoutes)
    .filter(route => route.serverRunner === serverRunner.id)
    .map(route => ({ ...route, matcher: compileRouteMatcher(route.path) }));

  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const canvasLibFiles = new Map([
    ["projectors-core.js", path.join(srcDir, "projectors-core.js")],
    ["canvas-projection.js", path.join(srcDir, "canvas-projection.js")]
  ]);
  const sseClients = new Set();
  let sseLastCount = world.allWitnesses().length;
  const sseWatcher = setInterval(() => {
    const count = world.allWitnesses().length;
    if (count <= sseLastCount) return;
    sseLastCount = count;
    const frame = `data: {"count":${count}}\n\n`;
    for (const client of sseClients) client.write(frame);
  }, 250);
  sseWatcher.unref();

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info("http.request.start", { requestId, method: req.method, url: req.url, actor: actorFromRequest(req) });
    res.on("finish", () => {
      logger.info("http.request.finish", { requestId, method: req.method, url: req.url, statusCode: res.statusCode, durationMs: Date.now() - startedAt });
    });

    try {
      if (req.method === "GET" && req.url?.startsWith("/canvas-lib/")) {
        const name = decodeURIComponent(req.url.slice("/canvas-lib/".length));
        const resolvedFile = canvasLibFiles.get(name);
        if (!resolvedFile) {
          world.observe({ process: "backend.readCanvasLib.failed", actor: backendHost, claims: [], body: { name, reason: "not in canvas-lib whitelist" } });
          sendJson(res, 404, { error: "unknown canvas-lib module", name });
          return;
        }
        const text = await fs.readFile(resolvedFile, "utf8");
        world.observe({ process: "backend.readCanvasLib", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" });
        res.end(text);
        return;
      }

      if (req.method === "GET" && req.url === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(`data: {"count":${world.allWitnesses().length}}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        world.observe({
          process: "backend.eventsStream",
          actor: backendHost,
          claims: [relation(backendHost, "streams", "witnessLog")],
          body: { clients: sseClients.size, serverRunner: serverRunner.id }
        });
        return;
      }

      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const matched = matchDeclaredRoute(routeTable, req.method || "GET", requestUrl.pathname);
      if (!matched) {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      const handler = matched.route.handler ? routeHandlers[matched.route.handler] : null;
      if (!handler) {
        world.observe({
          process: "backend.route.failed",
          actor: backendHost,
          claims: [],
          body: { route: matched.route.id, method: matched.route.method, path: matched.route.path, reason: "no handler" }
        });
        sendJson(res, 500, { error: "route handler not configured", route: matched.route.id });
        return;
      }

      await handler({
        req,
        res,
        requestId,
        requestUrl,
        route: matched.route,
        params: matched.params,
        requestActor: actorFromRequest(req)
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("http.request.failed", { requestId, method: req.method, url: req.url, actor: actorFromRequest(req), durationMs: Date.now() - startedAt, error: err });
      world.observe({
        process: "server.request.failed",
        actor: backendHost,
        claims: [],
        body: { requestId, method: req.method, url: req.url, message, serverRunner: serverRunner.id }
      });
      sendJson(res, 500, { error: "internal error", requestId });
    }
  });

  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  world.emit({
    process: "server.start",
    actor,
    claims: [
      relation(backendHost, "serves", serverRunner.id),
      relation(frontendHost, "renders", serverRunner.id),
      ...routeTable.map(route => relation(serverRunner.id, "serves", route.id))
    ],
    body: {
      url,
      serverRunner: serverRunner.id,
      backendHost,
      frontendHost,
      handlerSet: serverRunner.handlerSet ?? null,
      actors: appContext.actors,
      storage,
      routeCount: routeTable.length
    }
  });

  return {
    ok: true,
    url,
    close: () => {
      clearInterval(sseWatcher);
      for (const client of sseClients) client.end();
      sseClients.clear();
      server.closeAllConnections?.();
      return new Promise(resolve => server.close(resolve));
    }
  };
}

async function createAppContext({
  world,
  serverRunner,
  backendHost,
  frontendHost,
  runtimeRoot,
  storage,
  sendJson,
  readJson
}) {
  const actors = Array.isArray(serverRunner.actors) && serverRunner.actors.length ? [...serverRunner.actors] : [...DEFAULT_ACTORS];
  if (!serverRunner.handlerSet) {
    return {
      ok: true,
      actors,
      storage,
      handlers: {},
      visibleWitnesses: () => world.allWitnesses()
    };
  }

  const factory = HANDLER_SET_FACTORIES[serverRunner.handlerSet];
  if (!factory) return { ok: false, reason: "unknown handler set" };
  const appContext = await factory({
    world,
    backendHost,
    frontendHost,
    runtimeRoot,
    actors,
    storage,
    sendJson,
    readJson
  });
  return {
    ok: true,
    actors: appContext.actors ?? actors,
    storage,
    handlers: appContext.handlers ?? {},
    visibleWitnesses: appContext.visibleWitnesses ?? (() => world.allWitnesses())
  };
}

function createGenericRouteHandlers({
  world,
  backendHost,
  frontendHost,
  actors,
  logger,
  visibleWitnesses
}) {
  return {
    "page.home": async ({ res, route }) => {
      const params = route.params ?? {};
      const rootWidget = params.rootWidget ?? null;
      if (!rootWidget) {
        sendJson(res, 404, { error: "page not configured", route: route.id });
        return;
      }
      const page = params.page ?? "home";
      const excludeWidgetRoles = Array.isArray(params.excludeWidgetRoles) ? params.excludeWidgetRoles : ["world-graph-body"];
      world.observe({
        process: "frontend.render",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || rootWidget)],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget,
        frontendProgram: params.frontendProgram ?? null,
        appConfig: { actors, page, excludeWidgetRoles }
      }));
    },

    "page.world": async ({ res, route }) => {
      const params = route.params ?? {};
      const rootWidget = params.rootWidget ?? null;
      if (!rootWidget) {
        sendJson(res, 404, { error: "world graph page not configured" });
        return;
      }
      world.observe({
        process: "frontend.renderWorldPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || rootWidget)],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget,
        frontendProgram: params.frontendProgram ?? null,
        appConfig: { actors, page: params.page ?? "world" }
      }));
    },

    "page.canvas": async ({ res, route }) => {
      world.observe({
        process: "frontend.renderCanvasPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || "canvasView")],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderCanvasPage({ actors }));
    },

    "witnesses.list": async ({ res, requestUrl, requestActor }) => {
      const rawOffset = requestUrl.searchParams.get("offset");
      const visible = visibleWitnesses(requestActor).map(witness => ({
        ...witness,
        bodyJson: JSON.stringify(witness.body ?? {})
      }));
      if (rawOffset === null) {
        world.observe({
          process: "backend.readWitnesses",
          actor: backendHost,
          claims: [relation(backendHost, "read", "witnessLog")],
          body: { count: world.allWitnesses().length }
        });
        sendJson(res, 200, { witnesses: visible, offset: 0, total: visible.length });
        return;
      }
      const offset = Math.max(0, Math.min(visible.length, Number(rawOffset) || 0));
      sendJson(res, 200, { witnesses: visible.slice(offset), offset, total: visible.length });
    },

    "worldGraph.read": async ({ res, requestActor, requestId }) => {
      world.observe({
        process: "backend.readWorldGraph",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "worldGraph")],
        body: { count: world.allWitnesses().length }
      });
      const visible = visibleWitnesses(requestActor);
      const graph = worldGraphProjection(visible);
      const ast = astNodesProjection(visible);
      const astNodes = {
        byFile: Object.fromEntries([...ast.byFile.entries()].map(([file, nodes]) => [file, nodes])),
        byTarget: Object.fromEntries([...ast.byTarget.entries()].map(([target, nodes]) => [target, nodes]))
      };
      logger.info("worldGraph.projected", { requestId, witnesses: visible.length, nodes: graph.nodes.length, edges: graph.edges.length });
      sendJson(res, 200, { graph, astNodes });
    },

    "source.read": async ({ res, requestUrl }) => {
      const requested = requestUrl.searchParams.get("file") || "";
      const allowed = new Set(world.allWitnesses()
        .filter(w => w.process === "dsl.source.annotate" && typeof w.body?.file === "string")
        .map(w => path.resolve(w.body.file)));
      const resolvedFile = path.resolve(requested);
      if (!allowed.has(resolvedFile)) {
        world.observe({ process: "backend.readSource.failed", actor: backendHost, claims: [], body: { file: requested, reason: "source file not in witnessed imports" } });
        sendJson(res, 404, { error: "source file not available", file: requested });
        return;
      }
      const text = await fs.readFile(resolvedFile, "utf8");
      world.observe({ process: "backend.readSource", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolvedFile}`)], body: { file: resolvedFile, bytes: text.length } });
      sendJson(res, 200, { file: resolvedFile, text });
    },

    "canvas.perspectives.list": async ({ res, requestActor }) => {
      const perspectives = perspectivesProjection(visibleWitnesses(requestActor));
      world.observe({
        process: "backend.readPerspectives",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { count: perspectives.length }
      });
      sendJson(res, 200, { perspectives });
    },

    "canvas.read": async ({ res, requestUrl, requestActor }) => {
      const perspective = requestUrl.searchParams.get("perspective") || "";
      const canvas = canvasProjection(visibleWitnesses(requestActor), perspective);
      if (!canvas) {
        world.observe({ process: "backend.readCanvas.failed", actor: backendHost, claims: [], body: { perspective, reason: "unknown perspective" } });
        sendJson(res, 404, { error: "unknown perspective", perspective });
        return;
      }
      world.observe({
        process: "backend.readCanvas",
        actor: backendHost,
        claims: [relation(backendHost, "projected", "canvasView")],
        body: { perspective, instances: canvas.instances.length, connectors: canvas.connectors.length }
      });
      sendJson(res, 200, { canvas });
    },

    "canvas.process": async ({ req, res, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "canvas.process.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const handler = canvasProcessHandlers[body.process];
      if (!handler) {
        world.emit({ process: "canvas.process.failed", actor: requestActor, claims: [], body: { process: body.process, reason: "unknown canvas process" } });
        sendJson(res, 400, { error: "unknown canvas process", process: body.process });
        return;
      }
      const witness = handler(world, { actor: requestActor, ...(body.params ?? {}) });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body.reason ?? "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness });
    }
  };
}

function resolveStorageConfig(storage, runtimeRoot) {
  const resolved = {};
  if (!storage || typeof storage !== "object") return resolved;
  for (const [key, value] of Object.entries(storage)) {
    if (typeof value !== "string" || !value.trim()) continue;
    resolved[key] = path.resolve(runtimeRoot, value);
  }
  return resolved;
}

function compileRouteMatcher(routePath) {
  const parts = String(routePath || "/").split("/").filter(Boolean);
  return pathname => {
    const targetParts = String(pathname || "/").split("/").filter(Boolean);
    if (parts.length !== targetParts.length) return null;
    const params = Object.create(null);
    for (let i = 0; i < parts.length; i++) {
      const expected = parts[i];
      const actual = targetParts[i];
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodeURIComponent(actual);
        continue;
      }
      if (expected !== actual) return null;
    }
    return params;
  };
}

function matchDeclaredRoute(routeTable, method, pathname) {
  const targetMethod = String(method || "GET").toUpperCase();
  for (const route of routeTable) {
    if (route.method !== targetMethod) continue;
    const params = route.matcher(pathname);
    if (params) return { route, params };
  }
  return null;
}

function actorFromRequest(req) {
  const raw = req.headers["x-witness-actor"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, "application/json", JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
