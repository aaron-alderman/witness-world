// process-eval.js — GENERIC DESIRE process/event execution engine. No domain logic.
//
// The process/event analog of chart-runtime's `dataflow-eval.js` (which runs a
// `model`). Where Rung A (`spec-integrity.js`) proves the declared wiring is
// *sound*, this runs the declared semantics so transitions are *observable*: it
// seeds each process's state from its value initials, then steps the state
// machine on command dispatches and event deliveries, recording a state trace.
//
// It knows nothing about engentus: it discovers processes / events / commands /
// adapters / derives / policies from the applied world's witnesses (the same
// source `checkSpecIntegrity` reads) and executes exactly what the spec
// declares. Engentus golden traces live in the vertical test.
//
// Semantics (faithful to the DESIRE declaration):
//   • seed        — every state value := its declared `initial` (type-coerced).
//   • dispatch(C) — C is routed through its bound `adapter`: the adapter's
//                   `loading_state` := true, and the lifecycle state(s) the
//                   adapter's `success_event` writes whose enum has a `running`
//                   case := running (the in-flight transition the spec implies
//                   but no event writes). In Rung B the adapter is *stubbed* —
//                   no real I/O; real host-ops arrive in Rung C.
//   • resolve(C, outcome) — the stubbed adapter resolves: its declared
//                   `success_event` (outcome="success") or `failure_event`
//                   (outcome="failure") is delivered.
//   • deliver(E)  — the owning process must `handle` E; E's `writes` are applied
//                   to state (enum literals validated), derives recomputed, a
//                   state-change observation recorded.
//   • policyOutcome(P) — maps the subject's `state_field` value through the
//                   policy's `policy_outcomes` (e.g. complete→ready, failed→
//                   repair_required).

import { createExecutionRunner } from "../runtime-execution-runner.js";
import {
  deriveProjectionSnapshot,
  deriveProjectionValue,
  formatProjectionValue,
  projectionTruthiness
} from "./projection-eval.js";

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
  throw new Error("createProcessRuntime expects a world (with allWitnesses()) or a witness array");
}

function coerce(raw, valueType) {
  if (typeof valueType === "string" && valueType.endsWith("[]")) {
    const itemType = valueType.slice(0, -2);
    const list = Array.isArray(raw)
      ? raw
      : (raw == null || raw === "" ? [] : [raw]);
    return list.map(item => coerce(item, itemType));
  }
  if (valueType === "bool") return raw === true || raw === "true";
  if (valueType === "number") return raw === "" || raw == null ? 0 : Number(raw);
  return raw == null ? "" : String(raw);
}

export function createProcessRuntime(world, options = {}) {
  const runningState = options.runningState ?? "running";
  const runtimeConfig = options.config ?? {};
  const delayScheduler = options.delayScheduler
    ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const commandHandlers = options.commandHandlers ?? {};
  const routeInvoker = typeof options.routeInvoker === "function"
    ? options.routeInvoker
    : null;
  const executionRunner = options.executionRunner ?? createExecutionRunner();
  const witnesses = witnessesOf(world);

  // ── Index the spec from witnesses ──
  const defs = new Map();
  for (const w of witnesses) {
    const kind = KIND_BY_PROCESS[w.process];
    const id = w.body?.id;
    if (!kind || !id) continue;
    defs.set(id, { id, kind, role: w.body?.role ?? null, body: w.body });
  }
  const all = [...defs.values()];
  const byKind = kind => all.filter(d => d.kind === kind);
  const processes = byKind("process");
  const policies = byKind("policy");
  const derives = byKind("projection");

  const stateDef = id => { const d = defs.get(id); return d && d.kind === "type" && d.role === "state" ? d : null; };
  const enumCasesOf = stateId => {
    const s = stateDef(stateId);
    if (!s) return null;
    const e = defs.get(s.body.valueType);
    return e && e.kind === "type" && e.role === "enum" ? (e.body.cases ?? []) : null;
  };

  // command -> { boundary, op } adapter binding; command/event -> owning process
  const adapterByCommand = new Map();
  for (const b of byKind("boundary")) {
    for (const op of b.body.operations ?? []) {
      if (op.kind === "adapter" && op.command) adapterByCommand.set(op.command, { boundary: b.id, op });
    }
  }
  const emitterOf = new Map();
  const handlerOf = new Map();
  for (const p of processes) {
    for (const e of p.body.emits ?? []) if (!emitterOf.has(e)) emitterOf.set(e, p.id);
    for (const h of p.body.handles ?? []) if (!handlerOf.has(h)) handlerOf.set(h, p.id);
  }

  // ── Mutable state (global value-id -> value; value names are spec-unique) ──
  const state = new Map();
  const trace = [];
  const observers = new Set();
  let stepNo = 0;
  const trackAsync = (kind, work, meta = {}) => executionRunner.track(kind, work, meta);
  const whenIdle = () => executionRunner.whenSettled(task => String(task?.kind || "").startsWith("process."));

  function seed() {
    for (const d of all) {
      if (d.kind === "type" && d.role === "state") state.set(d.id, coerce(d.body.initial, d.body.valueType));
    }
  }

  function deriveSnapshot() {
    return deriveProjectionSnapshot(
      derives.map(d => ({ body: d.body })),
      state
    );
  }

  function snapshot(processId) {
    const p = defs.get(processId);
    const fields = p && p.kind === "process" ? (p.body.state ?? []) : [...state.keys()];
    const out = {};
    for (const f of fields) out[f] = state.get(f);
    return out;
  }

  function applyWrites(writes, source) {
    const changes = [];
    for (const [field, rawLiteral] of Object.entries(writes ?? {})) {
      const sd = stateDef(field);
      if (!sd) throw new Error(`${source}: writes unknown state '${field}'`);
      const cases = enumCasesOf(field);
      const literal = coerce(rawLiteral, sd.body.valueType);
      if (cases && !cases.includes(String(literal))) {
        throw new Error(`${source}: '${field} := ${literal}' is not a case of its enum (${cases.join(" | ")})`);
      }
      const from = state.get(field);
      if (from !== literal) {
        state.set(field, literal);
        changes.push({ field, from, to: literal });
      }
    }
    return changes;
  }

  function record(kind, label, process, changes) {
    const obs = {
      step: stepNo++,
      kind,
      label,
      process: process ?? null,
      changes,
      state: snapshot(process),
      derives: deriveSnapshot()
    };
    trace.push(obs);
    for (const observer of observers) observer(obs);
    return obs;
  }

  function dispatch(commandId) {
    const proc = emitterOf.get(commandId);
    if (!proc) throw new Error(`dispatch: no process emits command '${commandId}'`);
    const binding = adapterByCommand.get(commandId);
    if (!binding) throw new Error(`dispatch: command '${commandId}' has no bound adapter`);
    const { op } = binding;

    const changes = [];
    // lifecycle transition implied by the success_event's enum-typed writes
    const successWrites = defs.get(op.successEvent)?.body?.writes ?? {};
    for (const field of Object.keys(successWrites)) {
      const cases = enumCasesOf(field);
      if (cases && cases.includes(runningState)) {
        const from = state.get(field);
        if (from !== runningState) { state.set(field, runningState); changes.push({ field, from, to: runningState }); }
      }
    }
    // adapter marks itself in-flight
    if (op.loadingState && stateDef(op.loadingState)) {
      const from = state.get(op.loadingState);
      if (from !== true) { state.set(op.loadingState, true); changes.push({ field: op.loadingState, from, to: true }); }
    }
    return record("dispatch", commandId, proc, changes);
  }

  // Ingest a host-op response payload into state via the event's payload
  // bindings: each payload field `{name, type}` whose `type` names a real state
  // writes `payload[name]` into that state (literal-typed bindings, e.g.
  // `stage: "ingest"`, are skipped — they are constants, not state sinks).
  function ingestPayload(eventDef, payload, changes) {
    if (!payload || typeof payload !== "object") return;
    for (const field of eventDef.body.fields ?? []) {
      const sd = stateDef(field.type);
      if (!sd || !(field.name in payload)) continue;
      const next = coerce(payload[field.name], sd.body.valueType);
      const from = state.get(field.type);
      if (from !== next) { state.set(field.type, next); changes.push({ field: field.type, from, to: next }); }
    }
  }

  function deliver(eventId, payload = null) {
    const proc = handlerOf.get(eventId);
    if (!proc) throw new Error(`deliver: event '${eventId}' is handled by no process`);
    const ev = defs.get(eventId);
    if (!ev || ev.kind !== "message" || ev.role !== "event") throw new Error(`deliver: '${eventId}' is not an event`);
    const changes = applyWrites(ev.body.writes, eventId);
    ingestPayload(ev, payload, changes);
    return record("deliver", eventId, proc, changes);
  }

  function ruleFor(eventId) {
    const proc = handlerOf.get(eventId);
    const processDef = proc ? defs.get(proc) : null;
    return (processDef?.body?.rules ?? []).find(rule => rule?.trigger === eventId) ?? null;
  }

  function configValue(path) {
    const parts = String(path ?? "").replace(/^config\./, "").split(".").filter(Boolean);
    let current = runtimeConfig;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in current)) return undefined;
      current = current[part];
    }
    return current;
  }

  async function runRuleSteps(steps, eventId, proc) {
    let lastObservation = null;
    for (const step of steps ?? []) {
      if (step?.kind === "setState") {
        const changes = applyWrites({ [step.state]: step.value }, `${eventId}:${step.state}`);
        lastObservation = record("rule.setState", `${eventId}:${step.state}`, proc, changes);
        continue;
      }
      if (step?.kind === "delay") {
        const ms = Number(step.ms ?? 0);
        await trackAsync("process.delay", () => delayScheduler(ms, { eventId, process: proc, step }), {
          label: `${eventId}:${ms}ms`,
          processRef: proc,
          correlationId: eventId,
          phase: "process-rule",
          details: { ms, stepKind: "delay" }
        });
        lastObservation = record("rule.delay", `${eventId}:${ms}ms`, proc, []);
        continue;
      }
      if (step?.kind === "command") {
        const handler = commandHandlers[step.command];
        if (typeof handler === "function") {
          await trackAsync("process.command", () => handler({
            command: step.command,
            eventId,
            process: proc,
            state: snapshot(proc)
          }), {
            label: step.command,
            processRef: proc,
            correlationId: eventId,
            phase: "process-rule",
            details: { command: step.command, stepKind: "command" }
          });
          lastObservation = record("rule.command", step.command, proc, []);
          continue;
        }
        if (routeInvoker && adapterByCommand.has(step.command)) {
          lastObservation = await stepViaRoute(step.command);
          continue;
        }
        throw new Error(`rule command '${step.command}' has no runtime handler`);
      }
      if (step?.kind === "option") {
        const branch = projectionTruthiness(configValue(step.config)) ? (step.real ?? []) : (step.else ?? []);
        lastObservation = await runRuleSteps(branch, eventId, proc) ?? lastObservation;
        continue;
      }
      throw new Error(`unknown process rule step kind '${step?.kind}'`);
    }
    return lastObservation;
  }

  async function deliverAuthored(eventId, payload = null) {
    const proc = handlerOf.get(eventId);
    if (!proc) throw new Error(`deliverAuthored: event '${eventId}' is handled by no process`);
    const rule = ruleFor(eventId);
    const delivered = deliver(eventId, payload);
    if (!rule) return delivered;
    const outcome = await trackAsync("process.rule", () => runRuleSteps(rule.steps ?? [], eventId, proc), {
      label: eventId,
      processRef: proc,
      correlationId: eventId,
      phase: "process-rule"
    });
    return outcome ?? delivered;
  }

  function resolve(commandId, outcome = "success", payload = null) {
    const binding = adapterByCommand.get(commandId);
    if (!binding) throw new Error(`resolve: command '${commandId}' has no bound adapter`);
    const eventId = outcome === "failure" ? binding.op.failureEvent : binding.op.successEvent;
    if (!eventId) throw new Error(`resolve: adapter for '${commandId}' declares no ${outcome}_event`);
    return deliver(eventId, payload);
  }

  // dispatch + stubbed resolution in one call (the common case, Rung B)
  function step(commandId, outcome = "success") {
    dispatch(commandId);
    return resolve(commandId, outcome);
  }

  // Build the host-op request object from a command's field bindings: each field
  // `{name, type}` whose `type` names a real state takes the current state value;
  // otherwise `type` is a literal constant (e.g. source_name, sensor_type).
  function requestFor(commandId) {
    const cmd = defs.get(commandId);
    if (!cmd || cmd.kind !== "message" || cmd.role !== "command") throw new Error(`requestFor: '${commandId}' is not a command`);
    const request = {};
    for (const field of cmd.body.fields ?? []) {
      request[field.name] = stateDef(field.type) ? state.get(field.type) : field.type;
    }
    return request;
  }

  // Rung C: dispatch a command through its bound adapter to a REAL host-op
  // runtime (the black box), then map the response to the success / failure
  // event and apply it. command → runtime → response → event → state → policy.
  async function stepViaHostOp(commandId, runtime) {
    const binding = adapterByCommand.get(commandId);
    if (!binding) throw new Error(`stepViaHostOp: command '${commandId}' has no bound adapter`);
    const hostOp = binding.op.hostOperation;
    if (!hostOp) throw new Error(`stepViaHostOp: adapter for '${commandId}' carries no host_operation`);
    dispatch(commandId);
    const request = requestFor(commandId);
    return trackAsync("process.host-operation", async () => {
      const response = await runtime.invoke({ host_operation: hostOp, request });
      const outcome = response?.status === "failure" ? "failure" : "success";
      const eventId = outcome === "failure" ? binding.op.failureEvent : binding.op.successEvent;
      const obs = eventId
        ? await deliverAuthored(eventId, response?.payload ?? null)
        : resolve(commandId, outcome, response?.payload ?? null);
      obs.hostOperation = hostOp;
      obs.outcome = outcome;
      obs.request = request;
      obs.response = response;
      return obs;
    }, {
      label: commandId,
      correlationId: commandId,
      phase: "boundary",
      details: { hostOperation: hostOp }
    });
  }

  async function stepViaRoute(commandId) {
    const binding = adapterByCommand.get(commandId);
    if (!binding) throw new Error(`stepViaRoute: command '${commandId}' has no bound adapter`);
    if (typeof routeInvoker !== "function") throw new Error(`stepViaRoute: command '${commandId}' has no route invoker`);
    const route = typeof binding.op.route === "string" ? binding.op.route : "";
    if (!route) throw new Error(`stepViaRoute: adapter for '${commandId}' carries no route`);
    dispatch(commandId);
    const request = requestFor(commandId);
    return trackAsync("process.route-operation", async () => {
      const response = await routeInvoker({
        command: commandId,
        route,
        method: binding.op.method ?? "POST",
        actorState: binding.op.actorState ?? null,
        request,
        binding,
        runtime: {
          value: id => state.get(id),
          snapshot
        }
      });
      const outcome = response?.status === "failure" ? "failure" : "success";
      const eventId = outcome === "failure" ? binding.op.failureEvent : binding.op.successEvent;
      const obs = eventId
        ? await deliverAuthored(eventId, response?.payload ?? null)
        : resolve(commandId, outcome, response?.payload ?? null);
      obs.route = route;
      obs.method = binding.op.method ?? "POST";
      obs.outcome = outcome;
      obs.request = request;
      obs.response = response;
      return obs;
    }, {
      label: commandId,
      correlationId: commandId,
      phase: "boundary",
      details: { route, method: binding.op.method ?? "POST" }
    });
  }

  function policyOutcome(policyId) {
    const pol = defs.get(policyId);
    if (!pol || pol.kind !== "policy") throw new Error(`policyOutcome: '${policyId}' is not a policy`);
    const value = state.get(pol.body.stateField);
    const outcomes = pol.body.policyOutcomes ?? {};
    return Object.prototype.hasOwnProperty.call(outcomes, value) ? outcomes[value] : null;
  }

  // Set a state value directly (test setup / external inputs), type-coerced.
  function set(stateId, value) {
    const sd = stateDef(stateId);
    if (!sd) throw new Error(`set: '${stateId}' is not a declared state`);
    state.set(stateId, coerce(value, sd.body.valueType));
    return value;
  }

  seed();

  return {
    dispatch,
    deliver,
    deliverAuthored,
    resolve,
    step,
    requestFor,
    stepViaHostOp,
    stepViaRoute,
    set,
    policyOutcome,
    value: id => state.get(id),
    snapshot,
    derive: id => deriveSnapshot()[id],
    derives: deriveSnapshot,
    get trace() { return trace; },
    subscribe(observer) {
      if (typeof observer !== "function") return () => {};
      observers.add(observer);
      return () => observers.delete(observer);
    },
    executionRunner,
    whenIdle,
    get inFlightCount() { return executionRunner.inFlightCount; },
    // the lifecycle history of one state value across the recorded trace
    history(stateId) {
      const seq = [];
      for (const obs of trace) {
        const change = obs.changes.find(c => c.field === stateId);
        if (change) seq.push(change.to);
      }
      return seq;
    },
    counts: { processes: processes.length, policies: policies.length, derives: derives.length, adapters: adapterByCommand.size }
  };
}

export function renderProcessRuntimeModuleSource() {
  const createProcessRuntimeSource = createProcessRuntime
    .toString()
    .replace(/^export\s+/, "");
  return String.raw`
const KIND_BY_PROCESS = {
  "desire.defineProcess": "process",
  "desire.defineMessage": "message",
  "desire.defineType": "type",
  "desire.defineBoundary": "boundary",
  "desire.defineProjection": "projection",
  "desire.definePolicy": "policy"
};

const DERIVE_OPS = {
  bool_not: value => !projectionTruthiness(value),
  format: (value, body) => formatProjectionValue(value, body?.props ?? {}),
  identity: value => value
};

${projectionTruthiness.toString()}

${formatProjectionValue.toString()}

${deriveProjectionValue.toString()}

${deriveProjectionSnapshot.toString()}

${witnessesOf.toString()}

${coerce.toString()}

${createExecutionRunner.toString()}

${createProcessRuntimeSource}
`;
}
