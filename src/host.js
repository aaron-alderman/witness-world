import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { thing, relation } from "./kernel.js";
import { witnessRelations, moduleProjectors } from "./modules.js";
import { renderWidgetPage, requestWidgetVersionActivation, rollbackWidgetVersion } from "./widgets.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { processRunProjection, processViewProjection, renderProcessPage } from "./process-view.js";
import { canvasProcessHandlers } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { createLogger } from "./logger.js";
import { createDemoHandlerSet } from "./demo-handler-set.js";

const HANDLER_SET_FACTORIES = {
  demo: createDemoHandlerSet
};

const FRONTEND_TRACE_PROCESSES = new Set([
  "frontend.process.start",
  "frontend.process.done",
  "frontend.process.failed",
  "frontend.step.start",
  "frontend.step.done",
  "frontend.step.skipped",
  "frontend.step.failed"
]);

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
      identityIndex: appContext.identityIndex,
      sessionStore: new Map(),
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
    const witness = world.allWitnesses()[count - 1] ?? null;
    const frame = sseFrame(count, witness);
    for (const client of sseClients) client.write(frame);
  }, 250);
  sseWatcher.unref();

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const requestContext = resolveRequestContext(req, routeHandlers.__sessionStore, { allowActorHeader: serverRunner.allowActorHeader === true });
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    let matchedRoute = null;
    const witnessCountBefore = world.allWitnesses().length;
    logger.info("http.request.start", { requestId, method: req.method, url: req.url, actor: requestContext.actor });
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
        res.write(sseFrame(world.allWitnesses().length, world.allWitnesses().at(-1) ?? null));
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

      const matched = matchDeclaredRoute(routeTable, req.method || "GET", requestUrl.pathname);
      if (!matched) {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      matchedRoute = matched.route;
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
        requestActor: requestContext.actor,
        requestIdentity: requestContext.identity,
        requestSession: requestContext.session
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("http.request.failed", { requestId, method: req.method, url: req.url, actor: requestContext.actor, durationMs: Date.now() - startedAt, error: err });
      world.observe({
        process: "server.request.failed",
        actor: backendHost,
        claims: [],
        body: { requestId, method: req.method, url: req.url, message, serverRunner: serverRunner.id }
      });
      sendJson(res, 500, { error: "internal error", requestId });
    } finally {
      const emittedWitnesses = world.allWitnesses().slice(witnessCountBefore);
      const failedWitnesses = emittedWitnesses.filter(witness => witness.process.endsWith(".failed") || witness.process.endsWith(".blocked"));
      world.observe({
        process: "backend.request.finish",
        actor: requestContext.actor || backendHost,
        claims: matchedRoute ? [relation(backendHost, "handled", matchedRoute.id)] : [],
        body: {
          requestId,
          method: req.method || "GET",
          url: req.url || "/",
          statusCode: res.statusCode || 0,
          durationMs: Date.now() - startedAt,
          route: matchedRoute?.id ?? null,
          handler: matchedRoute?.handler ?? null,
          runId: headerValue(req.headers["x-witness-process-run"]),
          stepId: headerValue(req.headers["x-witness-step-id"]),
          emittedWitnessIds: emittedWitnesses.map(witness => witness.id),
          failureWitnessIds: failedWitnesses.map(witness => witness.id)
        }
      });
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
  const identityIndex = world.project(moduleProjectors.identityIndex);
  const actors = Array.isArray(serverRunner.actors) && serverRunner.actors.length
    ? [...serverRunner.actors]
    : actorsFromIdentities(identityIndex.rows);
  if (!serverRunner.handlerSet) {
    return {
      ok: true,
      actors,
      identityIndex,
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
    identityIndex,
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
  identityIndex,
  sessionStore,
  logger,
  visibleWitnesses
}) {
  const processViewInputs = requestActor => {
    const witnesses = visibleWitnesses(requestActor);
    const visibleIds = new Set(witnesses.map(witness => witness.id));
    const observations = world.allObservations()
      .filter(observation => observation.process === "backend.request.finish")
      .map(observation => ({
        ...observation,
        body: {
          ...(observation.body ?? {}),
          emittedWitnessIds: (observation.body?.emittedWitnessIds ?? []).filter(id => visibleIds.has(id)),
          failureWitnessIds: (observation.body?.failureWitnessIds ?? []).filter(id => visibleIds.has(id))
        }
      }));
    return { witnesses, observations };
  };
  const processSelection = requestUrl => ({
    program: requestUrl.searchParams.get("program") || null,
    event: requestUrl.searchParams.get("event") || null,
    runId: requestUrl.searchParams.get("runId") || null,
    nodeId: requestUrl.searchParams.get("node") || null,
    replay: requestUrl.searchParams.get("replay")
  });
  const handlers = {
    __sessionStore: sessionStore,
    "session.read": async ({ res, requestActor, requestIdentity, requestSession }) => {
      world.observe({
        process: "session.read",
        actor: requestActor || backendHost,
        claims: [],
        body: { authenticated: Boolean(requestSession), identity: requestIdentity || null, actor: requestActor || null }
      });
      if (!requestSession) {
        sendJson(res, 200, { authenticated: false, identity: null, actor: null, label: null, perspective: null });
        return;
      }
      sendJson(res, 200, {
        authenticated: true,
        identity: requestSession.identity,
        actor: requestSession.actor,
        label: requestSession.label,
        perspective: requestSession.perspective
      });
    },

    "session.open": async ({ req, res }) => {
      const body = await readJson(req);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const identity = username ? identityIndex.byUsername[username] ?? null : null;
      if (!identity || identity.password !== password) {
        world.emit({
          process: "session.open.failed",
          actor: backendHost,
          claims: [],
          body: { username, reason: !identity ? "unknown username" : "invalid password" }
        });
        sendJson(res, 401, { error: "invalid credentials" });
        return;
      }
      const sessionId = randomUUID();
      const session = {
        id: sessionId,
        identity: identity.id,
        actor: identity.actor,
        label: identity.label,
        perspective: identity.homePerspective ?? null
      };
      sessionStore.set(sessionId, session);
      world.emit({
        process: "session.open",
        actor: identity.actor,
        claims: [
          relation(identity.id, "authenticatedAs", identity.actor),
          ...(identity.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
        ],
        body: {
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          perspective: identity.homePerspective ?? null
        }
      });
      sendJson(
        res,
        200,
        {
          authenticated: true,
          identity: identity.id,
          actor: identity.actor,
          label: identity.label,
          perspective: identity.homePerspective ?? null
        },
        { "set-cookie": sessionCookieHeader(sessionId) }
      );
    },

    "session.logout": async ({ res, requestSession, requestActor }) => {
      if (requestSession?.id) sessionStore.delete(requestSession.id);
      world.emit({
        process: "session.logout",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          identity: requestSession?.identity ?? null,
          actor: requestActor || null,
          perspective: requestSession?.perspective ?? null
        }
      });
      sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookieHeader() });
    },

    "widgetVersions.activate": async ({ req, res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "activateWidgetVersion.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const version = typeof body.version === "string" ? body.version : null;
      const result = requestWidgetVersionActivation(world, { actor: requestActor, soul: params.soul || "", version });
      if (result.status === "failed") {
        sendJson(res, 400, { error: result.witness.body?.reason || "unknown widget version", status: result.status, soul: result.soul, version, witness: result.witness });
        return;
      }
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "widget version transition blocked", status: result.status, soul: result.soul, version, witnesses: result.witnesses, witness: result.witness });
        return;
      }
      sendJson(res, 200, { ok: true, status: result.status, soul: result.soul, version, witnesses: result.witnesses, witness: result.witness });
    },

    "widgetVersions.rollback": async ({ res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "widgetVersion.rollback.failed", actor: backendHost, claims: [], body: { soul: params.soul || "", reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const result = rollbackWidgetVersion(world, { actor: requestActor, soul: params.soul || "" });
      if (!result.ok) {
        sendJson(res, 409, { error: result.witness.body?.reason || "rollback unavailable", status: result.status, soul: result.soul, witness: result.witness });
        return;
      }
      sendJson(res, 200, { ok: true, status: result.status, soul: result.soul, version: result.version, witnesses: result.witnesses, witness: result.witness });
    },

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
        appConfig: { actors, page, excludeWidgetRoles, liveProjection: params.liveProjection !== false }
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
        appConfig: { actors, page: params.page ?? "world", liveProjection: params.liveProjection !== false }
      }));
    },

    "page.process": async ({ res, route, requestUrl, requestActor }) => {
      const model = processViewProjection(processViewInputs(requestActor), processSelection(requestUrl));
      send(res, 200, "text/html", renderProcessPage(model, { currentPath: route.path || "/process" }));
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

    "processView.read": async ({ res, requestUrl, requestActor }) => {
      const model = processViewProjection(processViewInputs(requestActor), processSelection(requestUrl));
      sendJson(res, 200, model);
    },

    "processRun.read": async ({ res, requestUrl, requestActor, params }) => {
      const replay = requestUrl.searchParams.get("replay");
      const run = processRunProjection(processViewInputs(requestActor), { runId: params.runId || "", replay });
      if (!run) {
        sendJson(res, 404, { error: "process run not found", runId: params.runId || "" });
        return;
      }
      sendJson(res, 200, run);
    },

    "processEvents.record": async ({ req, res, requestActor }) => {
      const body = await readJson(req);
      const process = typeof body.process === "string" ? body.process : "";
      if (!FRONTEND_TRACE_PROCESSES.has(process)) {
        sendJson(res, 400, { error: "unknown process trace", process });
        return;
      }
      const witness = world.emit({
        process,
        actor: requestActor || frontendHost,
        claims: [],
        body: {
          runId: typeof body.runId === "string" ? body.runId : "",
          program: typeof body.program === "string" ? body.program : "",
          event: typeof body.event === "string" ? body.event : "",
          nodeId: typeof body.nodeId === "string" ? body.nodeId : "",
          op: typeof body.op === "string" ? body.op : "",
          status: typeof body.status === "string" ? body.status : "",
          frontier: Array.isArray(body.frontier) ? body.frontier : [],
          repeat: body.repeat ?? null,
          repeatCount: Number.isFinite(body.repeatCount) ? body.repeatCount : null,
          message: typeof body.message === "string" ? body.message : "",
          eventData: body.eventData ?? null,
          timestamp: Number.isFinite(body.timestamp) ? body.timestamp : Date.now()
        }
      });
      sendJson(res, 200, { ok: true, id: witness.id });
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
  return handlers;
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

function sseFrame(count, witness) {
  return `data: ${JSON.stringify({ count, id: witness?.id ?? null, process: witness?.process ?? null })}\n\n`;
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

function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
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

function actorsFromIdentities(identities) {
  const seen = new Set();
  const actors = [];
  for (const identity of identities ?? []) {
    const actor = typeof identity?.actor === "string" ? identity.actor.trim() : "";
    if (!actor || seen.has(actor)) continue;
    seen.add(actor);
    actors.push({ id: actor, label: identity.label || actor });
  }
  return actors;
}

function resolveRequestContext(req, sessionStore, { allowActorHeader = false } = {}) {
  const cookies = parseCookies(req);
  const sessionId = cookies.witness_session || "";
  const session = sessionId ? sessionStore?.get(sessionId) ?? null : null;
  if (session) {
    return {
      actor: session.actor,
      identity: session.identity,
      session
    };
  }
  if (!allowActorHeader) {
    return {
      actor: null,
      identity: null,
      session: null
    };
  }
  const raw = req.headers["x-witness-actor"];
  const headerActor = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return {
    actor: headerActor,
    identity: null,
    session: null
  };
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (typeof header !== "string" || !header.trim()) return {};
  const cookies = {};
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join("=") || "");
  }
  return cookies;
}

function sessionCookieHeader(sessionId) {
  return `witness_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearSessionCookieHeader() {
  return "witness_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "content-type": type, ...headers });
  res.end(body);
}

function sendJson(res, status, body, headers = {}) {
  send(res, status, "application/json", JSON.stringify(body), headers);
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
