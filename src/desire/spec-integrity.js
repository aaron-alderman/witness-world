// Spec-integrity checker (DESIRE Rung A — wiring / referential integrity).
//
// Generic over any applied world holding process / event / command / adapter /
// derive / policy declarations. It reads the witnesses that `applyDesire` wrote
// (each carries the full node body) and proves the spec is internally
// consistent and complete: every reference resolves, every adapter is fully
// bound, every event writes only states it owns with legal enum literals, every
// policy names a real subject/state, and every stage closes its command → event
// loop. A spec that passes can only fail at runtime for *behavioural* reasons,
// never *structural* ones.
//
// Not engentus-specific: it discovers everything from the witnesses. Callers
// assert vertical facts (e.g. "there are 7 stages") against the returned report.

const KIND_BY_PROCESS = {
  "desire.defineProcess": "process",
  "desire.defineMessage": "message",
  "desire.defineType": "type",
  "desire.defineBoundary": "boundary",
  "desire.defineProjection": "projection",
  "desire.definePolicy": "policy"
};

function witnessesOf(world) {
  if (world && typeof world.allWitnesses === "function") return world.allWitnesses();
  if (Array.isArray(world)) return world;
  if (Array.isArray(world?.witnesses)) return world.witnesses;
  throw new Error("checkSpecIntegrity expects a world (with allWitnesses()) or a witness array");
}

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectProjectionInputRefs(body = {}) {
  const refs = [];
  const inputs = body?.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
    for (const source of Object.values(inputs)) refs.push(source);
    return refs;
  }
  const source = trimString(body?.source);
  return source ? [{ kind: "state", state: source }] : [];
}

function validateSourceRef(source, {
  stateDef,
  def,
  err,
  subject,
  missingStateCode,
  missingProjectionCode
}) {
  const normalized = typeof source === "string"
    ? { kind: "state", state: source }
    : (source && typeof source === "object" ? source : null);
  if (!normalized) return;
  if (normalized.kind === "state" && !stateDef(normalized.state)) {
    err(missingStateCode, subject, `source state '${normalized.state}' is not a declared state`);
  }
  if (normalized.kind === "projection") {
    const projection = def(normalized.projection);
    if (!projection || projection.kind !== "projection") {
      err(missingProjectionCode, subject, `source projection '${normalized.projection}' is not a declared projection`);
    }
  }
}

function validateRuleSteps(steps = [], context) {
  for (const step of steps ?? []) {
    if (!step || typeof step !== "object") continue;
    if (Object.prototype.hasOwnProperty.call(step, "valueFrom")) {
      validateSourceRef(step.valueFrom, {
        ...context,
        missingStateCode: "rule.value_from.state.dangling",
        missingProjectionCode: "rule.value_from.projection.dangling"
      });
    }
    if (step.kind === "branch") {
      validateSourceRef(step.condition, {
        ...context,
        missingStateCode: "rule.branch.state.dangling",
        missingProjectionCode: "rule.branch.projection.dangling"
      });
      validateRuleSteps(step.then ?? [], context);
      validateRuleSteps(step.else ?? [], context);
    }
    if (step.kind === "option") {
      validateRuleSteps(step.real ?? [], context);
      validateRuleSteps(step.else ?? [], context);
    }
  }
}

export function checkSpecIntegrity(world) {
  const witnesses = witnessesOf(world);

  // Index every semantic definition by id → { kind, role, body }.
  const defs = new Map();
  for (const w of witnesses) {
    const kind = KIND_BY_PROCESS[w.process];
    const id = w.body?.id;
    if (!kind || !id) continue;
    defs.set(id, { id, kind, role: w.body?.role ?? null, body: w.body });
  }

  const errors = [];
  const err = (code, subject, detail) => errors.push({ code, subject, detail });

  const def = id => defs.get(id) ?? null;
  const isKind = (id, kind) => defs.get(id)?.kind === kind;
  const stateDef = id => {
    const d = defs.get(id);
    return d && d.kind === "type" && d.role === "state" ? d : null;
  };
  const enumDef = id => {
    const d = defs.get(id);
    return d && d.kind === "type" && d.role === "enum" ? d : null;
  };
  const messageDef = id => {
    const d = defs.get(id);
    return d && d.kind === "message" ? d : null;
  };
  // The enum cases a state ranges over, or null if the state is a primitive
  // (string / bool / number) and therefore carries no enum literal constraint.
  const enumCasesOfState = stateId => {
    const s = stateDef(stateId);
    if (!s) return null;
    const e = enumDef(s.body.valueType);
    return e ? (e.body.cases ?? []) : null;
  };

  const all = [...defs.values()];
  const processes = all.filter(d => d.kind === "process");

  // Reverse index: which process(es) handle a given event.
  const handlersOf = new Map();
  for (const p of processes) {
    for (const h of p.body.handles ?? []) {
      if (!handlersOf.has(h)) handlersOf.set(h, []);
      handlersOf.get(h).push(p.id);
    }
  }

  // ── 1. Process wiring: values → state, handles → event, emits → command ──
  for (const p of processes) {
    for (const s of p.body.state ?? []) {
      if (!stateDef(s)) err("process.values.dangling", p.id, `value '${s}' is not a declared state`);
    }
    for (const h of p.body.handles ?? []) {
      const m = messageDef(h);
      if (!m) err("process.handles.dangling", p.id, `handled message '${h}' is not declared`);
      else if (m.role && m.role !== "event") err("process.handles.role", p.id, `handled '${h}' has role '${m.role}', expected event`);
    }
    for (const e of p.body.emits ?? []) {
      const m = messageDef(e);
      if (!m) err("process.emits.dangling", p.id, `emitted message '${e}' is not declared`);
      else if (m.role && m.role !== "command") err("process.emits.role", p.id, `emitted '${e}' has role '${m.role}', expected command`);
    }
    validateRuleSteps(p.body.rules?.flatMap(rule => rule?.steps ?? []) ?? [], {
      stateDef,
      def,
      err,
      subject: p.id
    });
  }

  // ── 2. Adapters: command + success_event + failure_event + request_schema + host_operation ──
  const boundaries = all.filter(d => d.kind === "boundary");
  const adapters = [];
  for (const b of boundaries) {
    for (const op of b.body.operations ?? []) {
      if (op.kind !== "adapter") continue;
      adapters.push({ boundary: b.id, op });

      const cmd = messageDef(op.command);
      if (!op.command) err("adapter.command.missing", b.id, "adapter binds no command");
      else if (!cmd) err("adapter.command.dangling", b.id, `command '${op.command}' is not a declared message`);
      else if (cmd.role && cmd.role !== "command") err("adapter.command.role", b.id, `command '${op.command}' has role '${cmd.role}'`);

      for (const [field, label] of [["successEvent", "success_event"], ["failureEvent", "failure_event"]]) {
        const evId = op[field];
        if (!evId) { err(`adapter.${label}.missing`, b.id, `adapter declares no ${label}`); continue; }
        const m = messageDef(evId);
        if (!m) err(`adapter.${label}.dangling`, b.id, `${label} '${evId}' is not a declared message`);
        else if (m.role && m.role !== "event") err(`adapter.${label}.role`, b.id, `${label} '${evId}' has role '${m.role}', expected event`);
      }

      if (!op.requestSchema) err("adapter.request_schema.missing", b.id, "adapter declares no request_schema");
      else if (!messageDef(op.requestSchema)) err("adapter.request_schema.dangling", b.id, `request_schema '${op.requestSchema}' is not a declared message`);

      if (!op.hostOperation) err("adapter.host_operation.missing", b.id, "adapter carries no host_operation id");

      // loading_state, when present, names a real state (request_state is a
      // runtime-allocated handle, not a declared value, so it is not checked).
      if (op.loadingState && !stateDef(op.loadingState)) err("adapter.loading_state.dangling", b.id, `loading_state '${op.loadingState}' is not a declared state`);
    }
  }

  // ── 3. event.writes: owned state + legal enum literal ──
  const events = all.filter(d => d.kind === "message" && d.role === "event");
  for (const ev of events) {
    const owners = handlersOf.get(ev.id) ?? [];
    if (owners.length === 0) err("event.unhandled", ev.id, "event is handled by no process");
    const ownerStates = new Set(owners.flatMap(pid => def(pid)?.body.state ?? []));
    for (const [stateId, literal] of Object.entries(ev.body.writes ?? {})) {
      if (!stateDef(stateId)) { err("event.writes.dangling", ev.id, `writes target '${stateId}' is not a declared state`); continue; }
      if (owners.length && !ownerStates.has(stateId)) err("event.writes.foreign", ev.id, `writes '${stateId}' is not a state of handling process(es) ${owners.join(", ")}`);
      const cases = enumCasesOfState(stateId);
      if (cases && !cases.includes(String(literal))) err("event.writes.badLiteral", ev.id, `writes '${stateId}: ${literal}' is not a case of its enum (${cases.join(" | ")})`);
    }
  }

  // ── 4. Policies: subject + state_field + state literals ──
  const policies = all.filter(d => d.kind === "policy");
  for (const pol of policies) {
    const subj = pol.body.subject;
    if (!isKind(subj, "process")) err("policy.subject.dangling", pol.id, `subject '${subj}' is not a process`);

    const sf = pol.body.stateField;
    const sfd = stateDef(sf);
    if (!sfd) err("policy.state_field.dangling", pol.id, `state_field '${sf}' is not a declared state`);
    else if (isKind(subj, "process") && !(def(subj).body.state ?? []).includes(sf)) err("policy.state_field.foreign", pol.id, `state_field '${sf}' is not a state of subject '${subj}'`);

    const cases = sfd ? enumCasesOfState(sf) : null;
    if (cases) {
      for (const [label, val] of [["initial_state", pol.body.initialState], ["ready_state", pol.body.readyState], ["disagreement_state", pol.body.disagreementState]]) {
        if (val != null && !cases.includes(String(val))) err(`policy.${label}.badState`, pol.id, `${label} '${val}' is not a case of '${sf}' (${cases.join(" | ")})`);
      }
      for (const key of Object.keys(pol.body.policyOutcomes ?? {})) {
        if (!cases.includes(key)) err("policy.outcome.badState", pol.id, `policy_outcome on '${key}' is not a case of '${sf}' (${cases.join(" | ")})`);
      }
    }
  }

  // ── 5. Derives (projections): source resolves to a real state ──
  const derives = all.filter(d => d.kind === "projection");
  for (const d of derives) {
    const refs = collectProjectionInputRefs(d.body);
    if (!refs.length) err("derive.source.missing", d.id, "derive declares no source or inputs");
    for (const source of refs) {
      validateSourceRef(source, {
        stateDef,
        def,
        err,
        subject: d.id,
        missingStateCode: "derive.source.dangling",
        missingProjectionCode: "derive.projection.dangling"
      });
    }
  }

  // ── 6. Stage wiring: each emitted command has a bound adapter whose
  //       success/failure events the emitting process handles (loop closes). ──
  const adaptersByCommand = new Map();
  for (const a of adapters) {
    if (!a.op.command) continue;
    if (!adaptersByCommand.has(a.op.command)) adaptersByCommand.set(a.op.command, []);
    adaptersByCommand.get(a.op.command).push(a);
  }
  const stages = [];
  for (const p of processes) {
    const stage = { process: p.id, wired: true, issues: [] };
    const handles = new Set(p.body.handles ?? []);
    const note = (code, detail) => { stage.wired = false; stage.issues.push(detail); err(code, p.id, detail); };
    for (const cmd of p.body.emits ?? []) {
      const bound = adaptersByCommand.get(cmd) ?? [];
      if (bound.length === 0) { note("stage.command.unbound", `emitted command '${cmd}' has no bound adapter`); continue; }
      for (const a of bound) {
        if (a.op.successEvent && !handles.has(a.op.successEvent)) note("stage.success_event.unhandled", `adapter '${a.boundary}' success_event '${a.op.successEvent}' is not handled by '${p.id}'`);
        if (a.op.failureEvent && !handles.has(a.op.failureEvent)) note("stage.failure_event.unhandled", `adapter '${a.boundary}' failure_event '${a.op.failureEvent}' is not handled by '${p.id}'`);
      }
    }
    stages.push(stage);
  }

  return {
    ok: errors.length === 0,
    errors,
    stages,
    counts: {
      processes: processes.length,
      adapters: adapters.length,
      events: events.length,
      commands: all.filter(d => d.kind === "message" && d.role === "command").length,
      policies: policies.length,
      derives: derives.length,
      states: all.filter(d => d.kind === "type" && d.role === "state").length,
      enums: all.filter(d => d.kind === "type" && d.role === "enum").length,
      wiredStages: stages.filter(s => s.wired).length
    }
  };
}

// Convenience: throw a readable error if the spec has any integrity violation.
export function assertSpecIntegrity(world) {
  const report = checkSpecIntegrity(world);
  if (!report.ok) {
    const lines = report.errors.map(e => `  [${e.code}] ${e.subject}: ${e.detail}`);
    throw new Error(`spec integrity check failed with ${report.errors.length} violation(s):\n${lines.join("\n")}`);
  }
  return report;
}
