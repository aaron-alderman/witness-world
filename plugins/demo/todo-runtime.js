import { canManageContext, canMutateTarget, projectors, relation, thing } from "../../src/kernel.js";
import { thingId } from "../../src/ids.js";
import { moduleProjectors } from "../../src/modules.js";
import { processSpecFor, typeModelProjection, validateProcessInput } from "../../src/type-model.js";
import { todoState } from "./projections.js";

export const SHARED_TODO_CONTEXT_ID = "frontend";

function fail(world, { process, actor, body }) {
  return world.emit({ process, actor, claims: [], body });
}

function validateInput(world, process, body) {
  const typeModel = typeModelProjection(world.allWitnesses());
  if (!processSpecFor(typeModel, process)) {
    return {
      ok: true,
      value: body && typeof body === "object" ? { ...body } : {},
      failures: [],
      spec: null
    };
  }
  const validated = validateProcessInput(typeModel, process, body, { coerceStrings: true });
  if (!validated.ok) return validated;
  return {
    ...validated,
    value: body && typeof body === "object"
      ? { ...body, ...validated.value }
      : validated.value
  };
}

function hasContext(world, contextId) {
  return world.project(moduleProjectors.contexts).some(row => row.id === contextId);
}

function findTodo(world, id) {
  return todoState(world.allWitnesses()).find(row => row.id === id) ?? null;
}

function normalizeDone(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

export function todoAuthorityState(world, actor, { contextId = SHARED_TODO_CONTEXT_ID } = {}) {
  const contextExists = contextId ? hasContext(world, contextId) : false;
  if (!actor) {
    return {
      authenticated: false,
      canMutate: false,
      canPropose: false,
      mode: "signin",
      context: contextExists ? contextId : null,
      reason: "sign in to change shared todos"
    };
  }
  if (!contextExists) {
    return {
      authenticated: true,
      canMutate: true,
      canPropose: false,
      mode: "mutate",
      context: null,
      reason: "legacy shared todo surface has no authored frontend context"
    };
  }
  const gate = canManageContext(world, actor, contextId);
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

export function ensureTodoTargetAuthority(world, actor, todoId, { contextId = SHARED_TODO_CONTEXT_ID } = {}) {
  if (!actor) return { ok: false, status: 401, reason: "sign in to change shared todos" };
  const todo = findTodo(world, todoId);
  if (!todo) return { ok: false, status: 404, reason: "not found" };
  if (world.project(projectors.things).has(todoId)) return canMutateTarget(world, actor, todoId);
  if (contextId && hasContext(world, contextId)) return canManageContext(world, actor, contextId);
  return { ok: true, status: 200, reason: null, legacyFallback: true };
}

export function requestTodoCreate(world, {
  actor,
  backendHost,
  body,
  contextId = SHARED_TODO_CONTEXT_ID
}) {
  const validated = validateInput(world, "todo.create", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "todo.create.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    const witness = fail(world, {
      process: "todo.create.failed",
      actor: actor || backendHost,
      body: { reason: "title required" }
    });
    return { ok: false, status: 400, error: "title required", witness };
  }
  const todo = {
    id: typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : thingId("todo", { title, ordinal: world.allWitnesses().length }),
    title,
    done: normalizeDone(input.done, false)
  };
  const witness = world.emit({
    process: "todo.create",
    actor: actor || backendHost,
    claims: [
      thing(todo.id),
      relation(todo.id, "hasModuleKind", "todo"),
      ...(contextId ? [relation(todo.id, "inContext", contextId)] : []),
      relation("todoStore", "contains", todo.id),
      relation(todo.id, "hasTitle", todo.title),
      relation(todo.id, "hasDone", String(todo.done))
    ],
    body: { todo, context: contextId || null }
  });
  return { ok: true, status: 201, todo, witness };
}

export function requestTodoUpdate(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "todo.update", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "todo.update.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const todo = findTodo(world, input.id || "");
  if (!todo) {
    const witness = fail(world, {
      process: "todo.update.failed",
      actor: actor || backendHost,
      body: { id: input.id || "", reason: "not found" }
    });
    return { ok: false, status: 404, error: "not found", witness };
  }
  const next = { ...todo };
  const claims = [];
  if (typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) {
      const witness = fail(world, {
        process: "todo.update.failed",
        actor: actor || backendHost,
        body: { id: input.id || "", reason: "title required" }
      });
      return { ok: false, status: 400, error: "title required", witness };
    }
    next.title = title;
    claims.push(relation(next.id, "hasTitle", title));
  }
  if ("done" in input) {
    next.done = normalizeDone(input.done, todo.done === true);
    claims.push(relation(next.id, "hasDone", String(next.done)));
  }
  if (!claims.length) {
    const witness = fail(world, {
      process: "todo.update.failed",
      actor: actor || backendHost,
      body: { id: input.id || "", reason: "todo patch required" }
    });
    return { ok: false, status: 400, error: "todo patch required", witness };
  }
  const witness = world.emit({
    process: "todo.update",
    actor: actor || backendHost,
    claims,
    body: { todo: next }
  });
  return { ok: true, status: 200, todo: next, witness };
}

export function requestTodoDelete(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "todo.delete", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "todo.delete.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const todo = findTodo(world, input.id || "");
  if (!todo) {
    const witness = fail(world, {
      process: "todo.delete.failed",
      actor: actor || backendHost,
      body: { id: input.id || "", reason: "not found" }
    });
    return { ok: false, status: 404, error: "not found", witness };
  }
  const witness = world.emit({
    process: "todo.delete",
    actor: actor || backendHost,
    claims: [],
    body: { id: todo.id }
  });
  return { ok: true, status: 200, id: todo.id, witness };
}
