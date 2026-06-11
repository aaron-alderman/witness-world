import fs from "node:fs/promises";
import path from "node:path";
import { thing, relation } from "./kernel.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "./projections.js";
import { actorRequired, runGates, textRequired } from "./gates.js";
import { thingId } from "./ids.js";
import { defineWidget, attachWidget } from "./widgets.js";
import { typeModelProjection, validateProcessInput, validateProcessOutput } from "./type-model.js";

export async function createDemoHandlerSet({
  world,
  backendHost,
  frontendHost,
  actors,
  storage = {},
  sendJson,
  readJson
}) {
  const todoProjectionPath = storage.todoProjection ?? null;
  const privateNotesProjectionPath = storage.privateNotesProjection ?? null;
  await ensureProjectionCache(todoProjectionPath);
  await ensureProjectionCache(privateNotesProjectionPath);

  const projectTodos = () => todoState(world.allWitnesses());
  const projectPrivateNotes = actor => privateNotesFor(world.allWitnesses(), actor);
  const writeTodoProjectionCache = () => writeProjectionCache(todoProjectionPath, projectTodos());
  const writePrivateNotesProjectionCache = () => writeProjectionCache(
    privateNotesProjectionPath,
    world.allWitnesses().filter(w => w.process === "privateNote.create").map(w => w.body.note).filter(Boolean)
  );

  return {
    actors,
    visibleWitnesses: requestActor => publicWitnessesFor(world.allWitnesses(), requestActor),
    handlers: {
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
          : route.params?.rootWidget;
        if (!parent) {
          world.emit({ process: "widget.define.failed", actor: requestActor, claims: [], body: { reason: "root widget not configured" } });
          sendJson(res, 400, { error: "root widget not configured" });
          return;
        }
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
      }
    }
  };
}

async function ensureProjectionCache(filePath) {
  if (!filePath) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await writeProjectionCache(filePath, []);
  }
}

async function writeProjectionCache(filePath, value) {
  if (!filePath) return;
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
