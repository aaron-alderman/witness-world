import fs from "node:fs/promises";
import path from "node:path";
import { thing, relation } from "./kernel.js";
import { thingId } from "./ids.js";
import { todoState, privateNotesFor, publicWitnessesFor } from "./projections.js";
import { privateNotesPrivacyState } from "./private-notes-runtime.js";
import { actorRequired, runGates, textRequired } from "./gates.js";
import { requestWidgetDefine } from "./widget-define.js";
import { requestBootstrapProposalCreate } from "./bootstrap-authoring.js";
import {
  ensureTodoTargetAuthority,
  requestTodoCreate,
  requestTodoDelete,
  requestTodoUpdate,
  SHARED_TODO_CONTEXT_ID,
  todoAuthorityState
} from "./todo-runtime.js";

const DEMO_TODO_ROOT_WIDGET_ID = "todo_app_widget";

export const DEMO_HANDLER_SET_DEFINITION = Object.freeze({
  handlers: Object.freeze([
    "privateNotes.list",
    "privateNotes.create",
    "privateNotes.readModel",
    "privateNotes.createModel",
    "todos.readModel",
    "todos.createModel",
    "todos.updateModel",
    "todos.deleteModel",
    "todos.list",
    "todos.create",
    "todos.update",
    "todos.delete",
    "widgets.createModel",
    "widgets.create",
    "network.simulateModel",
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
  await ensureProjectionCache(todoProjectionPath);
  await ensureProjectionCache(privateNotesProjectionPath);

  const projectTodos = () => todoState(world.allWitnesses());
  const projectPrivateNotes = actor => privateNotesFor(world.allWitnesses(), actor);
  const writeTodoProjectionCache = () => writeProjectionCache(todoProjectionPath, projectTodos());
  const writePrivateNotesProjectionCache = () => writeProjectionCache(
    privateNotesProjectionPath,
    world.allWitnesses().filter(w => w.process === "privateNote.create").map(w => w.body.note).filter(Boolean)
  );
  const nextTodoProposalId = (action, target = "") => {
    const actionPart = String(action || "mutate").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const targetPart = String(target || "shared").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.todo.${actionPart}.${targetPart}.${world.allWitnesses().length}`;
  };
  const nextWidgetProposalId = (target = "") => {
    const targetPart = String(target || SHARED_TODO_CONTEXT_ID).replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.widget.define.${targetPart}.${world.allWitnesses().length}`;
  };
  const todoProposalReason = action => ({
    create: "Add a shared todo through witnessed proposal",
    update: "Update a shared todo through witnessed proposal",
    delete: "Delete a shared todo through witnessed proposal"
  }[action] || "Mutate a shared todo through witnessed proposal");
  const widgetProposalReason = () => "Add a shared widget through witnessed proposal";
  const todoStatusMessage = action => ({
    create: "Proposed add for review.",
    update: "Proposed update for review.",
    delete: "Proposed delete for review."
  }[action] || "Proposed change for review.");
  const widgetStatusMessage = () => "Proposed widget for review.";
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
    const privacy = privateNotesPrivacyState(requestActor);
    if (!requestActor) {
      world.emit({ process: "privateNote.create.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
      return {
        status: 401,
        body: {
          ok: false,
          status: 401,
          error: privacy.reason,
          payload: { error: privacy.reason, privacy }
        }
      };
    }
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      world.emit({ process: "privateNote.create.failed", actor: requestActor, claims: [], body: { reason: "text required" } });
      return {
        status: 400,
        body: {
          ok: false,
          status: 400,
          error: "text required",
          payload: { error: "text required", privacy }
        }
      };
    }
    const gate = runGates(world, {
      actor: requestActor,
      process: "privateNote.create",
      gates: [actorRequired, textRequired("text")],
      context: { actor: requestActor, text }
    });
    if (!gate.ok) {
      return {
        status: 400,
        body: {
          ok: false,
          status: 400,
          error: gate.reason,
          payload: { error: gate.reason, privacy }
        }
      };
    }
    const note = {
      id: thingId("private-note", { actor: requestActor, text, ordinal: world.allWitnesses().length }),
      actor: requestActor,
      text
    };
    world.emit({
      process: "privateNote.create",
      actor: requestActor,
      claims: [thing(note.id), relation(note.id, "privateTo", requestActor)],
      body: { id: note.id, actor: requestActor, note }
    });
    await writePrivateNotesProjectionCache();
    return {
      status: 201,
      body: {
        ok: true,
        status: 201,
        payload: { note, privacy }
      }
    };
  };
  const createTodoModel = async ({ requestActor, body }) => {
    if (!requestActor) {
      world.emit({ process: "todo.create.failed", actor: backendHost, claims: [], body: { reason: "sign in to change shared todos" } });
      return {
        status: 401,
        body: {
          ok: false,
          status: 401,
          error: "sign in to change shared todos",
          payload: { error: "sign in to change shared todos" }
        }
      };
    }
    const authority = todoAuthorityState(world, requestActor);
    if (!authority.canMutate) {
      const proposal = createTodoProposal({
        actor: requestActor,
        action: "create",
        body
      });
      return proposal.ok
        ? {
            status: 202,
            body: {
              ok: true,
              status: 202,
              payload: {
                proposal: proposal.proposal,
                witness: proposal.witness,
                statusMessage: todoStatusMessage("create"),
                authority
              }
            }
          }
        : {
            status: proposal.status || 400,
            body: {
              ok: false,
              status: proposal.status || 400,
              error: proposal.error,
              payload: {
                error: proposal.error,
                witness: proposal.witness,
                authority
              }
            }
          };
    }
    const result = requestTodoCreate(world, {
      actor: requestActor,
      backendHost,
      body,
      contextId: authority.context
    });
    if (!result.ok) {
      return {
        status: result.status,
        body: {
          ok: false,
          status: result.status,
          error: result.error,
          payload: { error: result.error, witness: result.witness, authority }
        }
      };
    }
    await writeTodoProjectionCache();
    return {
      status: result.status,
      body: {
        ok: true,
        status: result.status,
        payload: { todo: result.todo, witness: result.witness, authority }
      }
    };
  };
  const createTodoProposal = ({ actor, action, targetId = null, body = {} }) => requestBootstrapProposalCreate(world, {
    actor,
    backendHost,
    body: {
      id: nextTodoProposalId(action, targetId || SHARED_TODO_CONTEXT_ID),
      targetProcess: `todo.${action}`,
      targetKind: action === "create" ? "context" : "todo",
      targetId: action === "create" ? SHARED_TODO_CONTEXT_ID : (targetId || null),
      bodyJson: JSON.stringify(body),
      reason: todoProposalReason(action)
    }
  });
  const createWidgetProposal = ({ actor, body = {}, contextId = SHARED_TODO_CONTEXT_ID }) => requestBootstrapProposalCreate(world, {
    actor,
    backendHost,
    body: {
      id: nextWidgetProposalId(contextId),
      targetProcess: "widget.define",
      targetKind: "context",
      targetId: contextId,
      bodyJson: JSON.stringify(body),
      reason: widgetProposalReason()
    }
  });
  const updateTodoModel = async ({ requestActor, id, body }) => {
    const todoId = typeof id === "string" && id.trim()
      ? id.trim()
      : (typeof body?.id === "string" ? body.id.trim() : "");
    const nextBody = body && typeof body === "object"
      ? { ...body, id: todoId }
      : { id: todoId };
    if (!requestActor) {
      world.emit({ process: "todo.update.failed", actor: backendHost, claims: [], body: { id: todoId, reason: "sign in to change shared todos" } });
      return {
        status: 401,
        body: {
          ok: false,
          status: 401,
          error: "sign in to change shared todos",
          payload: { error: "sign in to change shared todos" }
        }
      };
    }
    const gate = ensureTodoTargetAuthority(world, requestActor, todoId);
    if (!gate.ok && gate.status !== 403) {
      world.emit({ process: "todo.update.failed", actor: requestActor, claims: [], body: { id: todoId, reason: gate.reason, status: gate.status } });
      return {
        status: gate.status || 400,
        body: {
          ok: false,
          status: gate.status || 400,
          error: gate.reason,
          payload: { error: gate.reason }
        }
      };
    }
    if (!gate.ok) {
      const proposal = createTodoProposal({
        actor: requestActor,
        action: "update",
        targetId: todoId,
        body: nextBody
      });
      return proposal.ok
        ? {
            status: 202,
            body: {
              ok: true,
              status: 202,
              payload: {
                proposal: proposal.proposal,
                witness: proposal.witness,
                statusMessage: todoStatusMessage("update")
              }
            }
          }
        : {
            status: proposal.status || 400,
            body: {
              ok: false,
              status: proposal.status || 400,
              error: proposal.error,
              payload: {
                error: proposal.error,
                witness: proposal.witness
              }
            }
          };
    }
    const result = requestTodoUpdate(world, {
      actor: requestActor,
      backendHost,
      body: nextBody
    });
    if (!result.ok) {
      return {
        status: result.status,
        body: {
          ok: false,
          status: result.status,
          error: result.error,
          payload: { error: result.error, witness: result.witness }
        }
      };
    }
    await writeTodoProjectionCache();
    return {
      status: result.status,
      body: {
        ok: true,
        status: result.status,
        payload: { todo: result.todo, witness: result.witness }
      }
    };
  };
  const deleteTodoModel = async ({ requestActor, id }) => {
    const todoId = typeof id === "string" ? id : "";
    if (!requestActor) {
      world.emit({ process: "todo.delete.failed", actor: backendHost, claims: [], body: { id: todoId, reason: "sign in to change shared todos" } });
      return {
        status: 401,
        body: {
          ok: false,
          status: 401,
          error: "sign in to change shared todos",
          payload: { error: "sign in to change shared todos" }
        }
      };
    }
    const gate = ensureTodoTargetAuthority(world, requestActor, todoId);
    if (!gate.ok && gate.status !== 403) {
      world.emit({ process: "todo.delete.failed", actor: requestActor, claims: [], body: { id: todoId, reason: gate.reason, status: gate.status } });
      return {
        status: gate.status || 400,
        body: {
          ok: false,
          status: gate.status || 400,
          error: gate.reason,
          payload: { error: gate.reason }
        }
      };
    }
    if (!gate.ok) {
      const proposal = createTodoProposal({
        actor: requestActor,
        action: "delete",
        targetId: todoId,
        body: { id: todoId }
      });
      return proposal.ok
        ? {
            status: 202,
            body: {
              ok: true,
              status: 202,
              payload: {
                proposal: proposal.proposal,
                witness: proposal.witness,
                statusMessage: todoStatusMessage("delete")
              }
            }
          }
        : {
            status: proposal.status || 400,
            body: {
              ok: false,
              status: proposal.status || 400,
              error: proposal.error,
              payload: {
                error: proposal.error,
                witness: proposal.witness
              }
            }
          };
    }
    const result = requestTodoDelete(world, {
      actor: requestActor,
      backendHost,
      body: { id: todoId }
    });
    if (!result.ok) {
      return {
        status: result.status,
        body: {
          ok: false,
          status: result.status,
          error: result.error,
          payload: { error: result.error, witness: result.witness }
        }
      };
    }
    await writeTodoProjectionCache();
    return {
      status: result.status,
      body: {
        ok: true,
        status: result.status,
        payload: { ok: true, id: result.id, witness: result.witness }
      }
    };
  };
  const createWidgetModel = async ({ requestActor, body, route = null, routeParams = {} }) => {
    if (!requestActor) {
      return {
        status: 401,
        body: {
          ok: false,
          status: 401,
          error: "choose a perspective first",
          payload: { error: "choose a perspective first" }
        }
      };
    }
    const defaultParent = typeof routeParams.rootWidget === "string" && routeParams.rootWidget.trim()
      ? routeParams.rootWidget.trim()
      : DEMO_TODO_ROOT_WIDGET_ID;
    const defaultContext = typeof routeParams.context === "string" && routeParams.context.trim()
      ? routeParams.context.trim()
      : null;
    const normalizedBody = body && typeof body === "object"
      ? { ...body }
      : {};
    if (!(typeof normalizedBody.parent === "string" && normalizedBody.parent.trim())) {
      normalizedBody.parent = defaultParent;
    }
    if (!(typeof normalizedBody.context === "string" && normalizedBody.context.trim()) && defaultContext) {
      normalizedBody.context = defaultContext;
    }
    if (normalizedBody.context === SHARED_TODO_CONTEXT_ID && !todoAuthorityState(world, requestActor).canMutate) {
      const proposal = createWidgetProposal({
        actor: requestActor,
        body: normalizedBody,
        contextId: SHARED_TODO_CONTEXT_ID
      });
      return proposal.ok
        ? {
            status: 202,
            body: {
              ok: true,
              status: 202,
              payload: {
                proposal: proposal.proposal,
                witness: proposal.witness,
                statusMessage: widgetStatusMessage()
              }
            }
          }
        : {
            status: proposal.status || 400,
            body: {
              ok: false,
              status: proposal.status || 400,
              error: proposal.error,
              payload: {
                error: proposal.error,
                witness: proposal.witness
              }
            }
          };
    }
    const result = requestWidgetDefine(world, {
      actor: requestActor,
      backendHost,
      body: normalizedBody,
      defaultParent
    });
    if (!result.ok) {
      return {
        status: result.status,
        body: {
          ok: false,
          status: result.status,
          error: result.error,
          payload: { error: result.error, witness: result.witness }
        }
      };
    }
    return {
      status: result.status,
      body: {
        ok: true,
        status: result.status,
        payload: { widget: result.widget, witness: result.witness }
      }
    };
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

      "privateNotes.readModel": async ({ requestActor }) => readPrivateNotesModel(requestActor),

      "privateNotes.createModel": async ({ req, requestActor }) => createPrivateNoteModel({
        requestActor,
        body: await readJson(req)
      }),

      "todos.readModel": async ({ requestActor }) => readTodoModel(requestActor),

      "todos.createModel": async ({ req, requestActor }) => createTodoModel({
        requestActor,
        body: await readJson(req)
      }),

      "todos.updateModel": async ({ req, params, requestActor }) => updateTodoModel({
        requestActor,
        id: params.id || "",
        body: await readJson(req)
      }),

      "todos.deleteModel": async ({ params, requestActor }) => deleteTodoModel({
        requestActor,
        id: params.id || ""
      }),

      "widgets.createModel": async ({ req, params, requestActor, route }) => createWidgetModel({
        requestActor,
        body: await readJson(req),
        route,
        routeParams: { ...(route?.params ?? {}), ...(params ?? {}) }
      }),

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

      "network.simulateModel": async ({ requestActor }) => simulateNetworkErrorModel({ requestActor }),

      "network.simulateError": async ({ res, requestActor }) => {
        const result = simulateNetworkErrorModel({ requestActor });
        sendJson(res, result.status, result.body.payload);
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
