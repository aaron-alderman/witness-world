import { relation } from "../../src/kernel.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "./projections.js";
import { privateNotesPrivacyState } from "./private-notes-runtime.js";
import { todoAuthorityState } from "./todo-runtime.js";
import {
  ensureDemoProjectionCaches,
  executeDemoMutationRequest,
  writeDemoPrivateNotesProjectionCache,
  writeDemoTodoProjectionCache
} from "./backend-mutations.js";

export const DEMO_HANDLER_SET_DEFINITION = Object.freeze({
  handlers: Object.freeze([
    "privateNotes.list",
    "privateNotes.create",
    "todos.list",
    "todos.create",
    "todos.update",
    "todos.delete",
    "widgets.create",
    "network.simulateError"
  ]),
  jobHandlers: Object.freeze([
    "demo.echo",
    "demo.failOnce",
    "demo.alwaysFail"
  ])
});

export const DEMO_HANDLER_SET_PROVIDER = Object.freeze({
  kind: "handlerSet",
  id: "demo",
  definition: DEMO_HANDLER_SET_DEFINITION,
  factory: createDemoHandlerSet
});

export async function createDemoHandlerSet({
  world,
  backendHost,
  frontendHost,
  actors,
  storage = {},
  runtimeConfig = {},
  sendJson,
  readJson
}) {
  const todoProjectionPath = storage.todoProjection ?? null;
  const privateNotesProjectionPath = storage.privateNotesProjection ?? null;
  const failOnceAttempts = new Map();
  await ensureDemoProjectionCaches({
    todoProjection: todoProjectionPath,
    privateNotesProjection: privateNotesProjectionPath
  });

  const projectTodos = () => todoState(world.allWitnesses());
  const projectPrivateNotes = actor => privateNotesFor(world.allWitnesses(), actor);
  const writeTodoProjectionCache = () => writeDemoTodoProjectionCache(todoProjectionPath, world);
  const writePrivateNotesProjectionCache = () => writeDemoPrivateNotesProjectionCache(privateNotesProjectionPath, world);
  const readTodoModel = requestActor => {
    const todos = projectTodos();
    const authority = todoAuthorityState(world, requestActor);
    world.observe({
      process: "backend.readTodos",
      actor: requestActor || backendHost,
      claims: [relation(backendHost, "read", "todoStore")],
      body: { count: todos.length, authorityMode: authority.mode }
    });
    return { todos, authority };
  };
  const readPrivateNotesModel = requestActor => {
    const privacy = privateNotesPrivacyState(requestActor);
    if (!requestActor) return { notes: [], privacy };
    const notes = projectPrivateNotes(requestActor);
    world.observe({
      process: "privateNotes.read",
      actor: requestActor,
      claims: [relation(requestActor, "read", `${requestActor}:privateNotes`)],
      body: { count: notes.length }
    });
    return { notes, privacy };
  };
  const createPrivateNoteModel = async ({ requestActor, body }) => {
    const result = await executeDemoMutationRequest(world, {
      process: "privateNote.create",
      actor: requestActor,
      backendHost,
      body,
      onPrivateNotesChanged: writePrivateNotesProjectionCache
    });
    return { status: result.status, body: { ...result, status: result.status } };
  };
  const createTodoModel = async ({ requestActor, body }) => {
    const result = await executeDemoMutationRequest(world, {
      process: "todo.create",
      actor: requestActor,
      backendHost,
      body,
      onTodosChanged: writeTodoProjectionCache
    });
    return { status: result.status, body: { ...result, status: result.status } };
  };
  const updateTodoModel = async ({ requestActor, id, body }) => {
    const result = await executeDemoMutationRequest(world, {
      process: "todo.update",
      actor: requestActor,
      backendHost,
      body,
      options: { todoId: id || "" },
      onTodosChanged: writeTodoProjectionCache
    });
    return { status: result.status, body: { ...result, status: result.status } };
  };
  const deleteTodoModel = async ({ requestActor, id }) => {
    const result = await executeDemoMutationRequest(world, {
      process: "todo.delete",
      actor: requestActor,
      backendHost,
      body: { id: id || "" },
      options: { todoId: id || "" },
      onTodosChanged: writeTodoProjectionCache
    });
    return { status: result.status, body: { ...result, status: result.status } };
  };
  const createWidgetModel = async ({ requestActor, body, routeParams = {} }) => {
    const result = await executeDemoMutationRequest(world, {
      process: "widget.define",
      actor: requestActor,
      backendHost,
      body,
      options: {
        defaultParent: routeParams.rootWidget,
        rootWidget: routeParams.rootWidget,
        defaultContext: routeParams.context,
        context: routeParams.context
      }
    });
    return { status: result.status, body: { ...result, status: result.status } };
  };
  const simulateNetworkErrorModel = ({ requestActor }) => {
    const actor = requestActor || frontendHost;
    world.emit({
      process: "network.simulated.failed",
      actor,
      claims: [relation(actor, "attempted", "simulatedNetworkRequest")],
      body: { reason: "simulated network error", status: 503 }
    });
    return {
      status: 503,
      body: {
        ok: false,
        status: 503,
        error: "simulated network error",
        payload: { error: "simulated network error" }
      }
    };
  };

  return {
    actors,
    visibleWitnesses: requestActor => publicWitnessesFor(world.allWitnesses(), requestActor),
    jobHandlers: {
      "demo.echo": async ({ actor, job, payload }) => {
        world.emit({
          process: "demo.job.echo",
          actor: actor || backendHost,
          claims: [relation(job.id, "processedBy", "demo.echo")],
          body: { job: job.id, payload: payload ?? null }
        });
        return { echoed: true };
      },

      "demo.failOnce": async ({ actor, job, payload, attempt }) => {
        const key = typeof payload?.key === "string" && payload.key.trim() ? payload.key.trim() : job.id;
        const seen = failOnceAttempts.get(key) ?? 0;
        failOnceAttempts.set(key, seen + 1);
        if (!seen) {
          world.emit({
            process: "demo.job.failOnce.attempt",
            actor: actor || backendHost,
            claims: [],
            body: { job: job.id, key, attempt, outcome: "fail" }
          });
          throw new Error("demo fail once");
        }
        world.emit({
          process: "demo.job.failOnce.attempt",
          actor: actor || backendHost,
          claims: [],
          body: { job: job.id, key, attempt, outcome: "succeed" }
        });
        return { recovered: true };
      },

      "demo.alwaysFail": async ({ actor, job, attempt }) => {
        world.emit({
          process: "demo.job.alwaysFail.attempt",
          actor: actor || backendHost,
          claims: [],
          body: { job: job.id, attempt }
        });
        throw new Error("demo always fails");
      }
    },
    handlers: {
      "privateNotes.list": async ({ res, requestActor }) => {
        sendJson(res, 200, readPrivateNotesModel(requestActor));
      },

      "privateNotes.create": async ({ req, res, requestActor }) => {
        const result = await createPrivateNoteModel({
          requestActor,
          body: await readJson(req)
        });
        sendJson(res, result.status, result.body.payload);
      },

      "todos.list": async ({ res, requestActor }) => {
        sendJson(res, 200, readTodoModel(requestActor));
      },

      "todos.create": async ({ req, res, requestActor }) => {
        const result = await createTodoModel({
          requestActor,
          body: await readJson(req)
        });
        sendJson(res, result.status, result.body.payload);
      },

      "todos.update": async ({ req, res, params, requestActor }) => {
        const result = await updateTodoModel({
          requestActor,
          id: params.id || "",
          body: await readJson(req)
        });
        sendJson(res, result.status, result.body.payload);
      },

      "todos.delete": async ({ res, params, requestActor }) => {
        const result = await deleteTodoModel({
          requestActor,
          id: params.id || ""
        });
        sendJson(res, result.status, result.body.payload);
      },

      "widgets.create": async ({ req, res, params, requestActor, route }) => {
        const result = await createWidgetModel({
          requestActor,
          body: await readJson(req),
          route,
          routeParams: { ...(route?.params ?? {}), ...(params ?? {}) }
        });
        if (!result.body.ok) {
          sendJson(res, result.status, result.body.payload);
          return;
        }
        sendJson(res, result.status, result.body.payload);
      },

      "network.simulateError": async ({ res, requestActor }) => {
        const result = simulateNetworkErrorModel({ requestActor });
        sendJson(res, result.status, result.body.payload);
      }
    }
  };
}

