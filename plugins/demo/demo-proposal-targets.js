import {
  ensureTodoTargetAuthority,
  requestTodoCreate,
  requestTodoDelete,
  requestTodoUpdate
} from "./todo-runtime.js";

export function executeDemoProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  ensureContextAuthority
}) {
  switch (proposal.targetProcess) {
    case "todo.create": {
      const gate = ensureContextAuthority(actor, proposal.targetId || body.context || "frontend");
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestTodoCreate(world, {
        actor,
        backendHost,
        body
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "todo.update": {
      const gate = ensureTodoTargetAuthority(world, actor, body.id || proposal.targetId || "");
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestTodoUpdate(world, {
        actor,
        backendHost,
        body: { ...body, id: body.id || proposal.targetId || "" }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "todo.delete": {
      const gate = ensureTodoTargetAuthority(world, actor, body.id || proposal.targetId || "");
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestTodoDelete(world, {
        actor,
        backendHost,
        body: { ...body, id: body.id || proposal.targetId || "" }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    default:
      return { ok: false, status: 400, error: "demo proposal target process not supported" };
  }
}
