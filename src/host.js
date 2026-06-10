import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { thing, relation } from "./kernel.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "./projections.js";
import { actorRequired, runGates, textRequired } from "./gates.js";
import { thingId } from "./ids.js";
import { witnessRelations } from "./modules.js";
import { defineWidget, attachWidget, activateWidgetVersion, renderWidgetPage } from "./widgets.js";
import { worldGraphProjection } from "./world-graph.js";
import { canvasProcessHandlers, declareCanvasRoutes } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { createLogger } from "./logger.js";

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

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info("http.request.start", { requestId, method: req.method, url: req.url, actor: actorFromRequest(req) });
    res.on("finish", () => {
      logger.info("http.request.finish", { requestId, method: req.method, url: req.url, statusCode: res.statusCode, durationMs: Date.now() - startedAt });
    });
    try {
      if (req.method === "GET" && req.url === "/") {
        world.emit({
          process: "frontend.render",
          actor: frontendHost,
          claims: [relation(frontendHost, "rendered", "todoAppView")],
          body: { route: "/" }
        });
        send(res, 200, "text/html", renderWidgetPage(world, { actor: frontendHost, rootWidget, frontendProgram, appConfig: { actors, page: "home", excludeWidgetRoles: ["world-graph-body"] } }));
        return;
      }

      if (req.method === "GET" && req.url === "/world") {
        if (!worldRootWidget) {
          sendJson(res, 404, { error: "world graph page not configured" });
          return;
        }
        world.emit({
          process: "frontend.renderWorldPage",
          actor: frontendHost,
          claims: [relation(frontendHost, "rendered", "worldGraphView")],
          body: { route: "/world" }
        });
        send(res, 200, "text/html", renderWidgetPage(world, { actor: frontendHost, rootWidget: worldRootWidget, frontendProgram: worldFrontendProgram, appConfig: { actors, page: "world" } }));
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/canvas-lib/")) {
        const name = decodeURIComponent(req.url.slice("/canvas-lib/".length));
        const resolved = canvasLibFiles.get(name);
        if (!resolved) {
          world.emit({ process: "backend.readCanvasLib.failed", actor: backendHost, claims: [], body: { name, reason: "not in canvas-lib whitelist" } });
          sendJson(res, 404, { error: "unknown canvas-lib module", name });
          return;
        }
        const text = await fs.readFile(resolved, "utf8");
        world.emit({ process: "backend.readCanvasLib", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolved}`)], body: { file: resolved, bytes: text.length } });
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" });
        res.end(text);
        return;
      }

      if (req.method === "GET" && req.url === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(`data: {"count":${world.allWitnesses().length}}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        world.emit({
          process: "backend.eventsStream",
          actor: backendHost,
          claims: [relation(backendHost, "streams", "witnessLog")],
          body: { clients: sseClients.size }
        });
        return;
      }

      if (req.method === "GET" && req.url === "/canvas") {
        world.emit({
          process: "frontend.renderCanvasPage",
          actor: frontendHost,
          claims: [relation(frontendHost, "rendered", "canvasView")],
          body: { route: "/canvas" }
        });
        send(res, 200, "text/html", renderCanvasPage({ actors }));
        return;
      }

      if (req.method === "GET" && req.url === "/api/canvas/perspectives") {
        const perspectives = perspectivesProjection(publicWitnessesFor(world.allWitnesses(), actorFromRequest(req)));
        world.emit({
          process: "backend.readPerspectives",
          actor: backendHost,
          claims: [relation(backendHost, "projected", "canvasView")],
          body: { count: perspectives.length }
        });
        sendJson(res, 200, { perspectives });
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/api/canvas?")) {
        const url = new URL(req.url, "http://127.0.0.1");
        const perspective = url.searchParams.get("perspective") || "";
        const canvas = canvasProjection(publicWitnessesFor(world.allWitnesses(), actorFromRequest(req)), perspective);
        if (!canvas) {
          world.emit({ process: "backend.readCanvas.failed", actor: backendHost, claims: [], body: { perspective, reason: "unknown perspective" } });
          sendJson(res, 404, { error: "unknown perspective", perspective });
          return;
        }
        world.emit({
          process: "backend.readCanvas",
          actor: backendHost,
          claims: [relation(backendHost, "projected", "canvasView")],
          body: { perspective, instances: canvas.instances.length, connectors: canvas.connectors.length }
        });
        sendJson(res, 200, { canvas });
        return;
      }

      if (req.method === "POST" && req.url === "/api/canvas/process") {
        const requestActor = actorFromRequest(req);
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
        return;
      }

      if (req.method === "GET" && req.url === "/api/session") {
        sendJson(res, 200, { actors });
        return;
      }

      if (req.method === "POST" && req.url === "/api/session") {
        const body = await readJson(req);
        const selected = actors.find(a => a.id === body.actor);
        if (!selected) {
          world.emit({ process: "session.login.failed", actor: backendHost, claims: [], body: { actor: body.actor, reason: "unknown actor" } });
          sendJson(res, 400, { error: "unknown actor" });
          return;
        }
        world.emit({ process: "session.login", actor: selected.id, claims: [relation(selected.id, "openedPerspective", `${selected.id}:personal`)], body: { actor: selected.id } });
        sendJson(res, 200, { actor: selected });
        return;
      }

      if (req.method === "DELETE" && req.url === "/api/session") {
        const requestActor = actorFromRequest(req);
        world.emit({ process: "session.logout", actor: requestActor || backendHost, claims: [], body: { actor: requestActor } });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && req.url === "/api/private-notes") {
        const requestActor = actorFromRequest(req);
        if (!requestActor) {
          sendJson(res, 200, { notes: [] });
          return;
        }
        const notes = projectPrivateNotes(requestActor);
        world.emit({ process: "privateNotes.read", actor: requestActor, claims: [relation(requestActor, "read", `${requestActor}:privateNotes`)], body: { count: notes.length } });
        sendJson(res, 200, { notes });
        return;
      }

      if (req.method === "POST" && req.url === "/api/private-notes") {
        const requestActor = actorFromRequest(req);
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
        return;
      }

      if (req.method === "GET" && req.url === "/api/todos") {
        const todos = projectTodos();
        world.emit({
          process: "backend.readTodos",
          actor: backendHost,
          claims: [relation(backendHost, "read", "todoStore")],
          body: { count: todos.length }
        });
        sendJson(res, 200, { todos });
        return;
      }

      if (req.method === "POST" && req.url === "/api/todos") {
        const body = await readJson(req);
        const title = typeof body.title === "string" ? body.title.trim() : "";

        if (!title) {
          world.emit({
            process: "todo.create.failed",
            actor: backendHost,
            claims: [],
            body: { reason: "title required" }
          });
          sendJson(res, 400, { error: "title required" });
          return;
        }

        const gate = runGates(world, { actor: actorFromRequest(req) || backendHost, process: "todo.create", gates: [textRequired("title")], context: { title } });
        if (!gate.ok) {
          sendJson(res, 400, { error: gate.reason });
          return;
        }

        const todo = { id: thingId("todo", { title, ordinal: world.allWitnesses().length }), title, done: false };

        world.emit({
          process: "todo.create",
          actor: actorFromRequest(req) || backendHost,
          claims: [
            thing(todo.id),
            relation("todoStore", "contains", todo.id),
            relation(todo.id, "hasTitle", title)
          ],
          body: { todo }
        });

        await writeTodoProjectionCache();
        sendJson(res, 201, { todo });
        return;
      }


      if (req.method === "PATCH" && req.url?.startsWith("/api/todos/")) {
        const id = decodeURIComponent(req.url.slice("/api/todos/".length));
        const body = await readJson(req);
        const todos = projectTodos();
        const todo = todos.find(t => t.id === id);

        if (!todo) {
          world.emit({ process: "todo.update.failed", actor: backendHost, claims: [], body: { id, reason: "not found" } });
          sendJson(res, 404, { error: "not found" });
          return;
        }

        if ("done" in body) todo.done = body.done === true || body.done === "true";
        if (typeof body.title === "string") todo.title = body.title.trim();
        world.emit({
          process: "todo.update",
          actor: actorFromRequest(req) || backendHost,
          claims: [relation(todo.id, "hasDone", String(todo.done))],
          body: { todo }
        });

        await writeTodoProjectionCache();
        sendJson(res, 200, { todo });
        return;
      }

      if (req.method === "DELETE" && req.url?.startsWith("/api/todos/")) {
        const id = decodeURIComponent(req.url.slice("/api/todos/".length));
        const todos = projectTodos();
        const next = todos.filter(t => t.id !== id);

        if (next.length === todos.length) {
          world.emit({ process: "todo.delete.failed", actor: backendHost, claims: [], body: { id, reason: "not found" } });
          sendJson(res, 404, { error: "not found" });
          return;
        }

        world.emit({
          process: "todo.delete",
          actor: actorFromRequest(req) || backendHost,
          claims: [],
          body: { id }
        });

        await writeTodoProjectionCache();
        sendJson(res, 200, { ok: true, id });
        return;
      }

      const activationMatch = req.url?.match(/^\/api\/widget-versions\/([^/]+)\/activate$/);
      if (req.method === "POST" && activationMatch) {
        const requestActor = actorFromRequest(req);
        if (!requestActor) {
          world.emit({ process: "activateWidgetVersion.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
          sendJson(res, 401, { error: "choose a perspective first" });
          return;
        }
        const soul = decodeURIComponent(activationMatch[1]);
        const body = await readJson(req);
        const version = typeof body.version === "string" ? body.version : null;
        const w = activateWidgetVersion(world, { actor: requestActor, soul, version });
        if (w.process.endsWith(".failed")) {
          sendJson(res, 400, { error: "unknown widget version", witness: w });
          return;
        }
        sendJson(res, 200, { ok: true, soul, version, witness: w });
        return;
      }

      if (req.method === "POST" && req.url === "/api/widgets") {
        const requestActor = actorFromRequest(req);
        if (!requestActor) {
          world.emit({ process: "widget.define.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
          sendJson(res, 401, { error: "choose a perspective first" });
          return;
        }
        const body = await readJson(req);
        const kind = typeof body.kind === "string" && body.kind.trim() ? body.kind.trim() : "Text";
        const text = typeof body.text === "string" ? body.text.trim() : "New widget";
        const parent = typeof body.parent === "string" && body.parent.trim() ? body.parent.trim() : rootWidget;
        const id = thingId("widget", { actor: requestActor, parent, kind, text, ordinal: world.allWitnesses().length });
        const order = Number.isFinite(Number(body.order)) ? Number(body.order) : 999;
        defineWidget(world, { actor: requestActor, id, kind, props: { text, class: "user-widget" }, owner: requestActor });
        attachWidget(world, { actor: requestActor, parent, child: id, order });
        world.emit({ process: "widgetEditor.addWidget", actor: requestActor, claims: [relation(requestActor, "editedProjection", parent)], body: { id, kind, parent, text } });
        sendJson(res, 201, { widget: { id, kind, parent, text } });
        return;
      }

      if (req.method === "GET" && req.url === "/api/simulate-network-error") {
        const requestActor = actorFromRequest(req) || frontendHost;
        world.emit({
          process: "network.simulated.failed",
          actor: requestActor,
          claims: [relation(requestActor, "attempted", "simulatedNetworkRequest")],
          body: { reason: "simulated network error", status: 503 }
        });
        sendJson(res, 503, { error: "simulated network error" });
        return;
      }

      if (req.method === "GET" && (req.url === "/api/witnesses" || req.url?.startsWith("/api/witnesses?"))) {
        const url = new URL(req.url, "http://127.0.0.1");
        const rawOffset = url.searchParams.get("offset");
        const visible = publicWitnessesFor(world.allWitnesses(), actorFromRequest(req));
        if (rawOffset === null) {
          world.emit({
            process: "backend.readWitnesses",
            actor: backendHost,
            claims: [relation(backendHost, "read", "witnessLog")],
            body: { count: world.allWitnesses().length }
          });
          sendJson(res, 200, { witnesses: visible, offset: 0, total: visible.length });
          return;
        }
        // Incremental polls are NOT witnessed: the SSE-driven refetch loop would otherwise
        // grow the log on every read, which re-triggers the SSE signal forever.
        const offset = Math.max(0, Math.min(visible.length, Number(rawOffset) || 0));
        sendJson(res, 200, { witnesses: visible.slice(offset), offset, total: visible.length });
        return;
      }

      if (req.method === "GET" && req.url === "/api/world-graph") {
        world.emit({
          process: "backend.readWorldGraph",
          actor: backendHost,
          claims: [relation(backendHost, "projected", "worldGraph")],
          body: { count: world.allWitnesses().length }
        });
        const visible = publicWitnessesFor(world.allWitnesses(), actorFromRequest(req));
        const graph = worldGraphProjection(visible);
        logger.info("worldGraph.projected", { requestId, witnesses: visible.length, nodes: graph.nodes.length, edges: graph.edges.length });
        sendJson(res, 200, { graph });
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/api/source?")) {
        const url = new URL(req.url, "http://127.0.0.1");
        const requested = url.searchParams.get("file") || "";
        const allowed = new Set(world.allWitnesses()
          .filter(w => w.process === "dsl.source.annotate" && typeof w.body?.file === "string")
          .map(w => path.resolve(w.body.file)));
        const resolved = path.resolve(requested);
        if (!allowed.has(resolved)) {
          world.emit({ process: "backend.readSource.failed", actor: backendHost, claims: [], body: { file: requested, reason: "source file not in witnessed imports" } });
          sendJson(res, 404, { error: "source file not available", file: requested });
          return;
        }
        const text = await fs.readFile(resolved, "utf8");
        world.emit({ process: "backend.readSource", actor: backendHost, claims: [relation(backendHost, "read", `source:${resolved}`)], body: { file: resolved, bytes: text.length } });
        sendJson(res, 200, { file: resolved, text });
        return;
      }

      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("http.request.failed", { requestId, method: req.method, url: req.url, actor: actorFromRequest(req), durationMs: Date.now() - startedAt, error: err });
      world.emit({
        process: "todoServer.request.failed",
        actor: backendHost,
        claims: [],
        body: { requestId, method: req.method, url: req.url, message }
      });
      sendJson(res, 500, { error: "internal error", requestId });
    }
  });

  declareCanvasRoutes(world, { actor });

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
