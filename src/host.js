import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { thing, relation } from "./kernel.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "./projections.js";
import { actorRequired, runGates, textRequired } from "./gates.js";
import { thingId } from "./ids.js";
import { witnessRelations, moduleProjectors } from "./modules.js";
import { defineWidget, attachWidget, activateWidgetVersion, renderWidgetPage } from "./widgets.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { canvasProcessHandlers, declareCanvasRoutes } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { createLogger } from "./logger.js";
import { typeModelProjection, validateProcessInput, validateProcessOutput } from "./type-model.js";

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

export async function startTodoServer(world, { actor, backendHost, frontendHost, storePath, notesPath = `${storePath}.private-notes.json`, port = 0, rootWidget = "todo_app_widget", frontendProgram = null, worldRootWidget = null, worldFrontendProgram = null, actors = [{ id: "aaron", label: "Aaron" }, { id: "callan", label: "Callan" }], logger = createLogger() }) {
  const backendCaps = hostCapabilities(world, backendHost);
  const frontendCaps = hostCapabilities(world, frontendHost);

  const requiredBackend = ["http.serve", "fs.json.read", "fs.json.write"];
  const requiredFrontend = ["dom.render", "http.fetch"];
  const missingBackend = requiredBackend.filter(c => !backendCaps.has(c));
  const missingFrontend = requiredFrontend.filter(c => !frontendCaps.has(c));

  if (missingBackend.length || missingFrontend.length) {
    world.emit({
      process: "todoServer.start.failed",
      actor,
      claims: [],
      body: { backendHost, frontendHost, missingBackend, missingFrontend }
    });
    return { ok: false, reason: "missing host capabilities" };
  }

  await ensureProjectionCache(storePath);
  await ensureProjectionCache(notesPath);

  const projectTodos = () => todoState(world.allWitnesses());
  const writeTodoProjectionCache = () => writeProjectionCache(storePath, projectTodos());
  const projectPrivateNotes = actor => privateNotesFor(world.allWitnesses(), actor);
  const writePrivateNotesProjectionCache = () => writeProjectionCache(notesPath, world.allWitnesses().filter(w => w.process === "privateNote.create").map(w => w.body.note).filter(Boolean));

  const rootExists = world.project(w => w.some(x => x.process === "defineWidget" && x.body.id === rootWidget));
  if (!rootExists) {
    world.emit({
      process: "todoServer.start.failed",
      actor,
      claims: [],
      body: { rootWidget, reason: "root widget not defined" }
    });
    return { ok: false, reason: "root widget not defined" };
  }

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

  declareCanvasRoutes(world, { actor });
  const routeHandlers = createRouteHandlers({
    world,
    actor,
    backendHost,
    frontendHost,
    rootWidget,
    frontendProgram,
    worldRootWidget,
    worldFrontendProgram,
    actors,
    logger,
    projectTodos,
    writeTodoProjectionCache,
    projectPrivateNotes,
    writePrivateNotesProjectionCache
  });
  const routeTable = world.project(moduleProjectors.routes).map(route => ({
    ...route,
    matcher: compileRouteMatcher(route.path)
  }));

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
        const resolved = canvasLibFiles.get(name);
        if (!resolved) {
          world.observe({ process: "backend.readCanvasLib.failed", actor: backendHost, claims: [], body: { name, reason: "not in canvas-lib whitelist" } });
          sendJson(res, 404, { error: "unknown canvas-lib module", name });
          return;
        }
        const text = await fs.readFile(resolved, "utf8");
        world.observe({ process: "backend.readCanvasLib", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolved}`)], body: { file: resolved, bytes: text.length } });
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
          body: { clients: sseClients.size }
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
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("http.request.failed", { requestId, method: req.method, url: req.url, actor: actorFromRequest(req), durationMs: Date.now() - startedAt, error: err });
      world.observe({
        process: "todoServer.request.failed",
        actor: backendHost,
        claims: [],
        body: { requestId, method: req.method, url: req.url, message }
      });
      sendJson(res, 500, { error: "internal error", requestId });
    }
  });

  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  world.emit({
    process: "todoServer.start",
    actor,
    claims: [
      thing("todoApp"),
      thing("todoStore"),
      relation(backendHost, "serves", "todoApp"),
      relation(frontendHost, "renders", "todoAppView"),
      relation("todoApp", "usesStore", "todoStore"),
      relation("todoApp", "usesWidget", rootWidget),
      ...(frontendProgram ? [relation("todoApp", "usesFrontendProgram", frontendProgram)] : []),
      ...(worldRootWidget ? [relation("todoApp", "usesWorldWidget", worldRootWidget)] : []),
      ...(worldFrontendProgram ? [relation("todoApp", "usesWorldFrontendProgram", worldFrontendProgram)] : [])
    ],
    body: { url, storePath, notesPath, frontendProgram, worldRootWidget, worldFrontendProgram, actors }
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

function createRouteHandlers({
  world,
  backendHost,
  frontendHost,
  rootWidget,
  frontendProgram,
  worldRootWidget,
  worldFrontendProgram,
  actors,
  logger,
  projectTodos,
  writeTodoProjectionCache,
  projectPrivateNotes,
  writePrivateNotesProjectionCache
}) {
  const visibleWitnesses = requestActor => publicWitnessesFor(world.allWitnesses(), requestActor);

  return {
    "page.home": async ({ res, route }) => {
      const params = route.params ?? {};
      const selectedRootWidget = params.rootWidget ?? rootWidget;
      const selectedProgram = params.frontendProgram ?? frontendProgram;
      const page = params.page ?? "home";
      const excludeWidgetRoles = Array.isArray(params.excludeWidgetRoles) ? params.excludeWidgetRoles : ["world-graph-body"];
      world.observe({
        process: "frontend.render",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", "todoAppView")],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget: selectedRootWidget,
        frontendProgram: selectedProgram,
        appConfig: { actors, page, excludeWidgetRoles }
      }));
    },

    "page.world": async ({ res, route }) => {
      const params = route.params ?? {};
      const selectedRootWidget = params.rootWidget ?? worldRootWidget;
      const selectedProgram = params.frontendProgram ?? worldFrontendProgram;
      if (!selectedRootWidget) {
        sendJson(res, 404, { error: "world graph page not configured" });
        return;
      }
      world.observe({
        process: "frontend.renderWorldPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", "worldGraphView")],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderWidgetPage(world, {
        actor: frontendHost,
        rootWidget: selectedRootWidget,
        frontendProgram: selectedProgram,
        appConfig: { actors, page: params.page ?? "world" }
      }));
    },

    "page.canvas": async ({ res, route }) => {
      world.observe({
        process: "frontend.renderCanvasPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", "canvasView")],
        body: { route: route.path }
      });
      send(res, 200, "text/html", renderCanvasPage({ actors }));
    },

    "session.read": async ({ res }) => {
      sendJson(res, 200, { actors });
    },

    "session.open": async ({ req, res }) => {
      const body = await readJson(req);
      const selected = actors.find(a => a.id === body.actor);
      if (!selected) {
        world.emit({ process: "session.login.failed", actor: backendHost, claims: [], body: { actor: body.actor, reason: "unknown actor" } });
        sendJson(res, 400, { error: "unknown actor" });
        return;
      }
      world.emit({ process: "session.login", actor: selected.id, claims: [relation(selected.id, "openedPerspective", `${selected.id}:personal`)], body: { actor: selected.id } });
      sendJson(res, 200, { actor: selected });
    },

    "session.logout": async ({ res, requestActor }) => {
      world.observe({ process: "session.logout", actor: requestActor || backendHost, claims: [], body: { actor: requestActor } });
      sendJson(res, 200, { ok: true });
    },

    "privateNotes.list": async ({ res, requestActor }) => {
      if (!requestActor) {
        sendJson(res, 200, { notes: [] });
        return;
      }
      const notes = projectPrivateNotes(requestActor);
      world.observe({ process: "privateNotes.read", actor: requestActor, claims: [relation(requestActor, "read", `${requestActor}:privateNotes`)], body: { count: notes.length } });
      sendJson(res, 200, { notes });
    },

    "privateNotes.create": async ({ req, res, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "privateNote.create.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        world.emit({ process: "privateNote.create.failed", actor: requestActor, claims: [], body: { reason: "text required" } });
        sendJson(res, 400, { error: "text required" });
        return;
      }
      const gate = runGates(world, { actor: requestActor, process: "privateNote.create", gates: [actorRequired, textRequired("text")], context: { actor: requestActor, text } });
      if (!gate.ok) {
        sendJson(res, 400, { error: gate.reason });
        return;
      }
      const note = { id: thingId("private-note", { actor: requestActor, text, ordinal: world.allWitnesses().length }), actor: requestActor, text };
      world.emit({ process: "privateNote.create", actor: requestActor, claims: [thing(note.id), relation(note.id, "privateTo", requestActor)], body: { id: note.id, actor: requestActor, note } });
      await writePrivateNotesProjectionCache();
      sendJson(res, 201, { note });
    },

    "todos.list": async ({ res }) => {
      const todos = projectTodos();
      world.observe({
        process: "backend.readTodos",
        actor: backendHost,
        claims: [relation(backendHost, "read", "todoStore")],
        body: { count: todos.length }
      });
      sendJson(res, 200, { todos });
    },

    "todos.create": async ({ req, res, requestActor }) => {
      const body = await readJson(req);
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        world.emit({ process: "todo.create.failed", actor: backendHost, claims: [], body: { reason: "title required" } });
        sendJson(res, 400, { error: "title required" });
        return;
      }
      const gate = runGates(world, { actor: requestActor || backendHost, process: "todo.create", gates: [textRequired("title")], context: { title } });
      if (!gate.ok) {
        sendJson(res, 400, { error: gate.reason });
        return;
      }
      const todo = { id: thingId("todo", { title, ordinal: world.allWitnesses().length }), title, done: false };
      world.emit({
        process: "todo.create",
        actor: requestActor || backendHost,
        claims: [thing(todo.id), relation("todoStore", "contains", todo.id), relation(todo.id, "hasTitle", title)],
        body: { todo }
      });
      await writeTodoProjectionCache();
      sendJson(res, 201, { todo });
    },

    "todos.update": async ({ req, res, params, requestActor }) => {
      const id = params.id || "";
      const body = await readJson(req);
      const todos = projectTodos();
      const todo = todos.find(item => item.id === id);
      if (!todo) {
        world.emit({ process: "todo.update.failed", actor: backendHost, claims: [], body: { id, reason: "not found" } });
        sendJson(res, 404, { error: "not found" });
        return;
      }
      if ("done" in body) todo.done = body.done === true || body.done === "true";
      if (typeof body.title === "string") todo.title = body.title.trim();
      world.emit({
        process: "todo.update",
        actor: requestActor || backendHost,
        claims: [relation(todo.id, "hasDone", String(todo.done))],
        body: { todo }
      });
      await writeTodoProjectionCache();
      sendJson(res, 200, { todo });
    },

    "todos.delete": async ({ res, params, requestActor }) => {
      const id = params.id || "";
      const todos = projectTodos();
      const next = todos.filter(item => item.id !== id);
      if (next.length === todos.length) {
        world.emit({ process: "todo.delete.failed", actor: backendHost, claims: [], body: { id, reason: "not found" } });
        sendJson(res, 404, { error: "not found" });
        return;
      }
      world.emit({
        process: "todo.delete",
        actor: requestActor || backendHost,
        claims: [],
        body: { id }
      });
      await writeTodoProjectionCache();
      sendJson(res, 200, { ok: true, id });
    },

    "widgetVersions.activate": async ({ req, res, params, requestActor }) => {
      if (!requestActor) {
        world.emit({ process: "activateWidgetVersion.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const version = typeof body.version === "string" ? body.version : null;
      const witness = activateWidgetVersion(world, { actor: requestActor, soul: params.soul || "", version });
      if (witness.process.endsWith(".failed")) {
        sendJson(res, 400, { error: "unknown widget version", witness });
        return;
      }
      sendJson(res, 200, { ok: true, soul: params.soul || "", version, witness });
    },

    "widgets.create": async ({ req, res, requestActor, route }) => {
      if (!requestActor) {
        world.emit({ process: "widget.define.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "choose a perspective first" });
        return;
      }
      const body = await readJson(req);
      const typeModel = typeModelProjection(world.allWitnesses());
      const validatedInput = validateProcessInput(typeModel, "widget.define", body);
      if (!validatedInput.ok) {
        const witness = world.emit({
          process: "widget.define.blocked",
          actor: requestActor,
          claims: [],
          body: { gate: "type.compatibility", failures: validatedInput.failures }
        });
        sendJson(res, 400, { error: "typed validation failed", witness });
        return;
      }
      const kind = validatedInput.value.kind;
      const text = validatedInput.value.text.trim();
      const parent = typeof validatedInput.value.parent === "string" && validatedInput.value.parent.trim()
        ? validatedInput.value.parent.trim()
        : (route.params?.rootWidget ?? rootWidget);
      const order = Number.isFinite(Number(validatedInput.value.order)) ? Number(validatedInput.value.order) : 999;
      const widget = {
        id: thingId("widget", { actor: requestActor, parent, kind, text, ordinal: world.allWitnesses().length }),
        kind,
        parent,
        text,
        order
      };
      const validatedOutput = validateProcessOutput(typeModel, "widget.define", widget);
      if (!validatedOutput.ok) {
        const witness = world.emit({
          process: "widget.define.failed",
          actor: requestActor,
          claims: [],
          body: { gate: "type.compatibility", failures: validatedOutput.failures }
        });
        sendJson(res, 500, { error: "typed output validation failed", witness });
        return;
      }
      defineWidget(world, { actor: requestActor, id: widget.id, kind, props: { text, class: "user-widget" }, owner: requestActor });
      attachWidget(world, { actor: requestActor, parent, child: widget.id, order });
      const witness = world.emit({
        process: "widget.define",
        actor: requestActor,
        claims: [relation(requestActor, "editedProjection", parent)],
        body: { input: validatedInput.value, widget: validatedOutput.value }
      });
      sendJson(res, 201, { widget: validatedOutput.value, witness });
    },

    "network.simulateError": async ({ res, requestActor }) => {
      const actor = requestActor || frontendHost;
      world.emit({
        process: "network.simulated.failed",
        actor,
        claims: [relation(actor, "attempted", "simulatedNetworkRequest")],
        body: { reason: "simulated network error", status: 503 }
      });
      sendJson(res, 503, { error: "simulated network error" });
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
      const resolved = path.resolve(requested);
      if (!allowed.has(resolved)) {
        world.observe({ process: "backend.readSource.failed", actor: backendHost, claims: [], body: { file: requested, reason: "source file not in witnessed imports" } });
        sendJson(res, 404, { error: "source file not available", file: requested });
        return;
      }
      const text = await fs.readFile(resolved, "utf8");
      world.observe({ process: "backend.readSource", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolved}`)], body: { file: resolved, bytes: text.length } });
      sendJson(res, 200, { file: resolved, text });
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

async function ensureProjectionCache(storePath) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    await writeProjectionCache(storePath, []);
  }
}

async function writeProjectionCache(storePath, value) {
  await fs.writeFile(storePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}
