import { canManageContext } from "../../src/kernel.js";

export function todoState(witnesses) {
  const todos = new Map();
  for (const w of witnesses) {
    if (w.process === "todo.create" && w.body?.todo) {
      todos.set(w.body.todo.id, { ...w.body.todo });
    }
    if (w.process === "todo.update" && w.body?.todo) {
      const prev = todos.get(w.body.todo.id) ?? {};
      todos.set(w.body.todo.id, { ...prev, ...w.body.todo });
    }
    if (w.process === "todo.delete" && w.body?.id) {
      todos.delete(w.body.id);
    }
  }
  return [...todos.values()];
}

export function privateNotesFor(witnesses, actor) {
  if (!actor) return [];
  return witnesses
    .filter(w => w.process === "privateNote.create" && w.actor === actor && w.body?.note)
    .map(w => ({ ...w.body.note }));
}

export function publicWitnessesFor(witnesses, actor) {
  return witnesses.filter(w => {
    if (w.process.startsWith("privateNote") || w.process.startsWith("privateNotes")) return actor && w.actor === actor;
    return true;
  });
}

function projectionWorld(witnesses, options = {}) {
  const projectionContext = options?.projectionContext ?? null;
  return {
    allWitnesses() {
      return witnesses;
    },
    project(projector, projectorOptions = {}) {
      return projector(witnesses, {
        ...(projectorOptions && typeof projectorOptions === "object" ? projectorOptions : {}),
        projectionContext: projectorOptions?.projectionContext ?? projectionContext
      });
    }
  };
}

function hasAuthoredContext(witnesses, contextId) {
  if (!contextId) return false;
  const rows = new Set();
  for (const witness of witnesses) {
    for (const claim of witness.claims ?? []) {
      if (claim?.op === "relation" && claim.rel === "hasModuleKind" && claim.to === "context") {
        rows.add(claim.from);
      }
    }
  }
  return rows.has(contextId);
}

export function todoAuthorityProjection(witnesses, actor, {
  contextId = "frontend",
  ...options
} = {}) {
  const hasContext = hasAuthoredContext(witnesses, contextId);
  if (!actor) {
    return {
      authenticated: false,
      canMutate: false,
      canPropose: false,
      mode: "signin",
      context: hasContext ? contextId : null,
      reason: "sign in to change shared todos"
    };
  }
  if (!hasContext) {
    return {
      authenticated: true,
      canMutate: true,
      canPropose: false,
      mode: "mutate",
      context: null,
      reason: "legacy shared todo surface has no authored frontend context"
    };
  }
  const gate = canManageContext(projectionWorld(witnesses, options), actor, contextId);
  if (gate.ok) {
    return {
      authenticated: true,
      canMutate: true,
      canPropose: false,
      mode: "mutate",
      context: contextId,
      reason: null
    };
  }
  return {
    authenticated: true,
    canMutate: false,
    canPropose: true,
    mode: "propose",
    context: contextId,
    reason: gate.reason || "shared todos are read-only here"
  };
}

export function demoTodosReadModel(witnesses, options = {}) {
  const requestActor = typeof options?.requestActor === "string" && options.requestActor.trim()
    ? options.requestActor.trim()
    : null;
  return {
    todos: todoState(witnesses),
    authority: todoAuthorityProjection(witnesses, requestActor, options)
  };
}

export function demoPrivateNotesReadModel(witnesses, options = {}) {
  const requestActor = typeof options?.requestActor === "string" && options.requestActor.trim()
    ? options.requestActor.trim()
    : null;
  const privacy = !requestActor
    ? {
        authenticated: false,
        mode: "signin",
        visibility: "actor-private",
        actor: null,
        reason: "sign in to see and save notes that belong only to you"
      }
    : {
        authenticated: true,
        mode: "private",
        visibility: "actor-private",
        actor: requestActor,
        reason: null
      };
  return {
    notes: privateNotesFor(witnesses, requestActor),
    privacy
  };
}

export const demoModuleProjectors = Object.freeze({
  "demo.todosReadModel": demoTodosReadModel,
  "demo.privateNotesReadModel": demoPrivateNotesReadModel
});
