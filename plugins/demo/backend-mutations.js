import fs from "node:fs/promises";
import path from "node:path";
import { thing, relation } from "../../src/kernel.js";
import { thingId } from "../../src/ids.js";
import { actorRequired, runGates, textRequired } from "../../src/gates.js";
import { requestWidgetDefine } from "../authoring-core/authoring-core-processes.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";
import { todoState } from "./projections.js";
import { privateNotesPrivacyState } from "./private-notes-runtime.js";
import {
  ensureTodoTargetAuthority,
  requestTodoCreate,
  requestTodoDelete,
  requestTodoUpdate,
  SHARED_TODO_CONTEXT_ID,
  todoAuthorityState
} from "./todo-runtime.js";

const DEMO_TODO_ROOT_WIDGET_ID = "todo_app_widget";

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

export async function ensureDemoProjectionCaches(storage = {}) {
  await ensureProjectionCache(storage.todoProjection ?? null);
  await ensureProjectionCache(storage.privateNotesProjection ?? null);
}

export async function writeDemoTodoProjectionCache(filePath, world) {
  await writeProjectionCache(filePath, todoState(world.allWitnesses()));
}

export async function writeDemoPrivateNotesProjectionCache(filePath, world) {
  await writeProjectionCache(
    filePath,
    world.allWitnesses().filter(witness => witness.process === "privateNote.create").map(witness => witness.body.note).filter(Boolean)
  );
}

function nextTodoProposalId(world, action, target = "") {
  const actionPart = String(action || "mutate").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const targetPart = String(target || "shared").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return `proposal.todo.${actionPart}.${targetPart}.${world.allWitnesses().length}`;
}

function nextWidgetProposalId(world, target = "") {
  const targetPart = String(target || SHARED_TODO_CONTEXT_ID).replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return `proposal.widget.define.${targetPart}.${world.allWitnesses().length}`;
}

function todoProposalReason(action) {
  return ({
    create: "Add a shared todo through witnessed proposal",
    update: "Update a shared todo through witnessed proposal",
    delete: "Delete a shared todo through witnessed proposal"
  }[action] || "Mutate a shared todo through witnessed proposal");
}

function widgetProposalReason() {
  return "Add a shared widget through witnessed proposal";
}

function todoStatusMessage(action) {
  return ({
    create: "Proposed add for review.",
    update: "Proposed update for review.",
    delete: "Proposed delete for review."
  }[action] || "Proposed change for review.");
}

function widgetStatusMessage() {
  return "Proposed widget for review.";
}

function createTodoProposal(world, { actor, backendHost, action, targetId = null, body = {} }) {
  return requestBootstrapProposalCreate(world, {
    actor,
    backendHost,
    body: {
      id: nextTodoProposalId(world, action, targetId || SHARED_TODO_CONTEXT_ID),
      targetProcess: `todo.${action}`,
      targetKind: action === "create" ? "context" : "todo",
      targetId: action === "create" ? SHARED_TODO_CONTEXT_ID : (targetId || null),
      bodyJson: JSON.stringify(body),
      reason: todoProposalReason(action)
    }
  });
}

function createWidgetProposal(world, { actor, backendHost, body = {}, contextId = SHARED_TODO_CONTEXT_ID }) {
  return requestBootstrapProposalCreate(world, {
    actor,
    backendHost,
    body: {
      id: nextWidgetProposalId(world, contextId),
      targetProcess: "widget.define",
      targetKind: "context",
      targetId: contextId,
      bodyJson: JSON.stringify(body),
      reason: widgetProposalReason()
    }
  });
}

async function executePrivateNoteCreate(world, {
  actor,
  backendHost,
  body,
  onPrivateNotesChanged = async () => {}
}) {
  const privacy = privateNotesPrivacyState(actor);
  if (!actor) {
    world.emit({ process: "privateNote.create.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
    return {
      ok: false,
      status: 401,
      error: privacy.reason,
      payload: { error: privacy.reason, privacy }
    };
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    world.emit({ process: "privateNote.create.failed", actor, claims: [], body: { reason: "text required" } });
    return {
      ok: false,
      status: 400,
      error: "text required",
      payload: { error: "text required", privacy }
    };
  }
  const gate = runGates(world, {
    actor,
    process: "privateNote.create",
    gates: [actorRequired, textRequired("text")],
    context: { actor, text }
  });
  if (!gate.ok) {
    return {
      ok: false,
      status: 400,
      error: gate.reason,
      payload: { error: gate.reason, privacy }
    };
  }
  const note = {
    id: thingId("private-note", { actor, text, ordinal: world.allWitnesses().length }),
    actor,
    text
  };
  world.emit({
    process: "privateNote.create",
    actor,
    claims: [thing(note.id), relation(note.id, "privateTo", actor)],
    body: { id: note.id, actor, note }
  });
  await onPrivateNotesChanged();
  return {
    ok: true,
    status: 201,
    payload: { note, privacy }
  };
}

async function executeTodoCreate(world, {
  actor,
  backendHost,
  body,
  onTodosChanged = async () => {}
}) {
  if (!actor) {
    world.emit({ process: "todo.create.failed", actor: backendHost, claims: [], body: { reason: "sign in to change shared todos" } });
    return {
      ok: false,
      status: 401,
      error: "sign in to change shared todos",
      payload: { error: "sign in to change shared todos" }
    };
  }
  const authority = todoAuthorityState(world, actor);
  if (!authority.canMutate) {
    const proposal = createTodoProposal(world, {
      actor,
      backendHost,
      action: "create",
      body
    });
    return proposal.ok
      ? {
          ok: true,
          status: 202,
          payload: {
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: todoStatusMessage("create"),
            authority
          }
        }
      : {
          ok: false,
          status: proposal.status || 400,
          error: proposal.error,
          payload: {
            error: proposal.error,
            witness: proposal.witness,
            authority
          }
        };
  }
  const result = requestTodoCreate(world, {
    actor,
    backendHost,
    body,
    contextId: authority.context
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
      payload: { error: result.error, witness: result.witness, authority }
    };
  }
  await onTodosChanged();
  return {
    ok: true,
    status: result.status,
    payload: { todo: result.todo, witness: result.witness, authority }
  };
}

async function executeTodoUpdate(world, {
  actor,
  backendHost,
  body,
  todoId,
  onTodosChanged = async () => {}
}) {
  const id = typeof todoId === "string" && todoId.trim()
    ? todoId.trim()
    : (typeof body?.id === "string" ? body.id.trim() : "");
  const nextBody = body && typeof body === "object"
    ? { ...body, id }
    : { id };
  if (!actor) {
    world.emit({ process: "todo.update.failed", actor: backendHost, claims: [], body: { id, reason: "sign in to change shared todos" } });
    return {
      ok: false,
      status: 401,
      error: "sign in to change shared todos",
      payload: { error: "sign in to change shared todos" }
    };
  }
  const gate = ensureTodoTargetAuthority(world, actor, id);
  if (!gate.ok && gate.status !== 403) {
    world.emit({ process: "todo.update.failed", actor, claims: [], body: { id, reason: gate.reason, status: gate.status } });
    return {
      ok: false,
      status: gate.status || 400,
      error: gate.reason,
      payload: { error: gate.reason }
    };
  }
  if (!gate.ok) {
    const proposal = createTodoProposal(world, {
      actor,
      backendHost,
      action: "update",
      targetId: id,
      body: nextBody
    });
    return proposal.ok
      ? {
          ok: true,
          status: 202,
          payload: {
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: todoStatusMessage("update")
          }
        }
      : {
          ok: false,
          status: proposal.status || 400,
          error: proposal.error,
          payload: {
            error: proposal.error,
            witness: proposal.witness
          }
        };
  }
  const result = requestTodoUpdate(world, {
    actor,
    backendHost,
    body: nextBody
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
      payload: { error: result.error, witness: result.witness }
    };
  }
  await onTodosChanged();
  return {
    ok: true,
    status: result.status,
    payload: { todo: result.todo, witness: result.witness }
  };
}

async function executeTodoDelete(world, {
  actor,
  backendHost,
  body,
  todoId,
  onTodosChanged = async () => {}
}) {
  const id = typeof todoId === "string" && todoId.trim()
    ? todoId.trim()
    : (typeof body?.id === "string" ? body.id.trim() : "");
  if (!actor) {
    world.emit({ process: "todo.delete.failed", actor: backendHost, claims: [], body: { id, reason: "sign in to change shared todos" } });
    return {
      ok: false,
      status: 401,
      error: "sign in to change shared todos",
      payload: { error: "sign in to change shared todos" }
    };
  }
  const gate = ensureTodoTargetAuthority(world, actor, id);
  if (!gate.ok && gate.status !== 403) {
    world.emit({ process: "todo.delete.failed", actor, claims: [], body: { id, reason: gate.reason, status: gate.status } });
    return {
      ok: false,
      status: gate.status || 400,
      error: gate.reason,
      payload: { error: gate.reason }
    };
  }
  if (!gate.ok) {
    const proposal = createTodoProposal(world, {
      actor,
      backendHost,
      action: "delete",
      targetId: id,
      body: { id }
    });
    return proposal.ok
      ? {
          ok: true,
          status: 202,
          payload: {
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: todoStatusMessage("delete")
          }
        }
      : {
          ok: false,
          status: proposal.status || 400,
          error: proposal.error,
          payload: {
            error: proposal.error,
            witness: proposal.witness
          }
        };
  }
  const result = requestTodoDelete(world, {
    actor,
    backendHost,
    body: { id }
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
      payload: { error: result.error, witness: result.witness }
    };
  }
  await onTodosChanged();
  return {
    ok: true,
    status: result.status,
    payload: { ok: true, id: result.id, witness: result.witness }
  };
}

async function executeWidgetDefine(world, {
  actor,
  backendHost,
  body,
  options = {}
}) {
  if (!actor) {
    return {
      ok: false,
      status: 401,
      error: "choose a perspective first",
      payload: { error: "choose a perspective first" }
    };
  }
  const defaultParent = typeof options.defaultParent === "string" && options.defaultParent.trim()
    ? options.defaultParent.trim()
    : (typeof options.rootWidget === "string" && options.rootWidget.trim()
        ? options.rootWidget.trim()
        : DEMO_TODO_ROOT_WIDGET_ID);
  const defaultContext = typeof options.defaultContext === "string" && options.defaultContext.trim()
    ? options.defaultContext.trim()
    : (typeof options.context === "string" && options.context.trim()
        ? options.context.trim()
        : null);
  const normalizedBody = body && typeof body === "object"
    ? { ...body }
    : {};
  if (!(typeof normalizedBody.parent === "string" && normalizedBody.parent.trim())) {
    normalizedBody.parent = defaultParent;
  }
  if (!(typeof normalizedBody.context === "string" && normalizedBody.context.trim()) && defaultContext) {
    normalizedBody.context = defaultContext;
  }
  if (normalizedBody.context === SHARED_TODO_CONTEXT_ID && !todoAuthorityState(world, actor).canMutate) {
    const proposal = createWidgetProposal(world, {
      actor,
      backendHost,
      body: normalizedBody,
      contextId: SHARED_TODO_CONTEXT_ID
    });
    return proposal.ok
      ? {
          ok: true,
          status: 202,
          payload: {
            proposal: proposal.proposal,
            witness: proposal.witness,
            statusMessage: widgetStatusMessage()
          }
        }
      : {
          ok: false,
          status: proposal.status || 400,
          error: proposal.error,
          payload: {
            error: proposal.error,
            witness: proposal.witness
          }
        };
  }
  const result = requestWidgetDefine(world, {
    actor,
    backendHost,
    body: normalizedBody,
    defaultParent
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
      payload: { error: result.error, witness: result.witness }
    };
  }
  return {
    ok: true,
    status: result.status,
    payload: { widget: result.widget, witness: result.witness }
  };
}

export async function executeDemoMutationRequest(world, {
  process,
  actor,
  backendHost,
  body,
  options = {},
  onTodosChanged = async () => {},
  onPrivateNotesChanged = async () => {}
}) {
  switch (process) {
    case "privateNote.create":
      return executePrivateNoteCreate(world, {
        actor,
        backendHost,
        body,
        onPrivateNotesChanged
      });
    case "todo.create":
      return executeTodoCreate(world, {
        actor,
        backendHost,
        body,
        onTodosChanged
      });
    case "todo.update":
      return executeTodoUpdate(world, {
        actor,
        backendHost,
        body,
        todoId: options.todoId ?? null,
        onTodosChanged
      });
    case "todo.delete":
      return executeTodoDelete(world, {
        actor,
        backendHost,
        body,
        todoId: options.todoId ?? null,
        onTodosChanged
      });
    case "widget.define":
      return executeWidgetDefine(world, {
        actor,
        backendHost,
        body,
        options
      });
    default:
      return {
        ok: false,
        status: 400,
        error: `unsupported demo mutation process ${process}`,
        payload: { error: `unsupported demo mutation process ${process}` }
      };
  }
}
