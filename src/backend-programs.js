import { thing, relation } from "./kernel.js";
import { stepGraphFromLinearSteps } from "./process-graph.js";

// Generic authored backend-program ABI: witnessed definitions, projections, and
// version-transition primitives that multiple plugins build on.
export const SUPPORTED_BACKEND_OPS = Object.freeze([
  "request.readJson",
  "state.assign",
  "handler.invoke",
  "response.json",
  "response.error",
  "run"
]);

export function defineBackendProgram(world, {
  actor,
  soul,
  label = soul,
  owner = actor,
  context = null
}) {
  return world.emit({
    process: "defineBackendProgram",
    actor,
    claims: [
      thing(soul),
      relation(owner, "owns", soul),
      relation(soul, "hasModuleKind", "backendProgram"),
      ...(context ? [relation(soul, "inContext", context)] : [])
    ],
    body: { soul, label: String(label ?? soul), context: context ? String(context) : null }
  });
}

export function defineBackendProgramVersion(world, {
  actor,
  soul,
  version,
  index = 0,
  owner = actor,
  context = null
}) {
  return world.emit({
    process: "defineBackendProgramVersion",
    actor,
    claims: [
      thing(soul),
      thing(version),
      relation(owner, "owns", soul),
      relation(soul, "hasModuleKind", "backendProgram"),
      ...(context ? [relation(soul, "inContext", context)] : []),
      relation(version, "hasModuleKind", "backendProgramVersion"),
      ...(context ? [relation(version, "inContext", context)] : []),
      relation(version, "versionOf", soul),
      relation(soul, "hasBackendProgramVersion", version, { index })
    ],
    body: { soul, version, index, context: context ? String(context) : null }
  });
}

export function defineBackendProgramVersionTransition(world, {
  actor,
  soul,
  from,
  to,
  strategy,
  id = `backendProgramVersionTransition:${soul}:${from}:${to}`,
  owner = actor
}) {
  return world.emit({
    process: "defineBackendProgramVersionTransition",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "backendProgramVersionTransition"),
      relation(id, "backendProgramVersionTransitionOf", soul),
      relation(id, "transitionFrom", from),
      relation(id, "transitionTo", to),
      relation(id, "transitionStrategy", strategy)
    ],
    body: { id, soul, from, to, strategy }
  });
}

export function activateBackendProgramVersion(world, { actor, soul, version }) {
  const versions = backendProgramVersions(world.allWitnesses());
  const allowed = versions.some(row => row.soul === soul && row.version === version);
  return world.emit({
    process: allowed ? "activateBackendProgramVersion" : "activateBackendProgramVersion.failed",
    actor,
    claims: allowed ? [relation(soul, "activeBackendProgramVersion", version)] : [],
    body: { soul, version, ok: allowed }
  });
}

export function defineBackendStep(world, {
  actor,
  version,
  event,
  op,
  order = 0,
  params = {},
  when = null,
  repeat = null,
  after = null
}) {
  return world.emit({
    process: "defineBackendStep",
    actor,
    claims: [
      relation(version, "hasBackendStep", `${version}:${event}:${order}:${op}`, { event, order, op })
    ],
    body: { version, event, op, order, params, when, repeat, after: Array.isArray(after) ? after : [] }
  });
}

export function backendProgramVersions(witnesses) {
  return witnesses
    .filter(witness => witness.process === "defineBackendProgramVersion" && witness.body?.soul && witness.body?.version)
    .map(witness => ({
      soul: witness.body.soul,
      version: witness.body.version,
      index: witness.body.index ?? 0,
      context: witness.body.context ? String(witness.body.context) : null
    }));
}

export function activeBackendProgramVersions(witnesses) {
  const active = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "activateBackendProgramVersion") continue;
    if (witness.body?.ok === false) continue;
    active.set(witness.body.soul, witness.body.version);
  }
  return active;
}

export function backendProgramVersionTransitions(witnesses) {
  return witnesses
    .filter(witness => witness.process === "defineBackendProgramVersionTransition" && witness.body?.id)
    .map(witness => ({
      id: witness.body.id,
      soul: witness.body.soul,
      from: witness.body.from,
      to: witness.body.to,
      strategy: witness.body.strategy
    }));
}

export function backendProgramVersionTransitionIndex(witnesses) {
  const index = new Map();
  for (const row of backendProgramVersionTransitions(witnesses)) {
    index.set(`${row.soul}\u0000${row.from}\u0000${row.to}`, row);
  }
  return index;
}

export function backendProgramActivationHistory(witnesses) {
  const history = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "activateBackendProgramVersion") continue;
    if (witness.body?.ok === false) continue;
    const soul = witness.body?.soul;
    const version = witness.body?.version;
    if (!soul || !version) continue;
    if (!history.has(soul)) history.set(soul, []);
    history.get(soul).push({
      witnessId: witness.id,
      actor: witness.actor,
      soul,
      version
    });
  }
  return history;
}

export function requestBackendProgramVersionActivation(world, { actor, soul, version }) {
  const witnesses = world.allWitnesses();
  const versions = backendProgramVersions(witnesses);
  const target = versions.find(row => row.soul === soul && row.version === version);
  if (!target) {
    const witness = world.emit({
      process: "activateBackendProgramVersion.failed",
      actor,
      claims: [],
      body: { soul, version, ok: false, reason: "unknown backend program version" }
    });
    return { ok: false, status: "failed", soul, version, witness, witnesses: [witness] };
  }

  const current = activeBackendProgramVersions(witnesses).get(soul) ?? null;
  if (!current || current === version) {
    const witness = activateBackendProgramVersion(world, { actor, soul, version });
    return { ok: true, status: "activated", soul, version, witness, witnesses: [witness] };
  }

  const transition = backendProgramVersionTransitionIndex(witnesses).get(`${soul}\u0000${current}\u0000${version}`) ?? null;
  const strategy = transition?.strategy ?? "block";
  if (strategy === "compatible") {
    const witness = activateBackendProgramVersion(world, { actor, soul, version });
    return { ok: true, status: "activated", soul, version, witness, witnesses: [witness] };
  }
  if (strategy === "migrate") {
    const migration = world.emit({
      process: "backendProgramVersion.migrate",
      actor,
      claims: [],
      body: { soul, from: current, to: version, strategy }
    });
    const activation = activateBackendProgramVersion(world, { actor, soul, version });
    return { ok: true, status: "migrated", soul, version, witness: activation, witnesses: [migration, activation] };
  }
  if (strategy === "fork") {
    const requested = world.emit({
      process: "backendProgramVersion.fork.requested",
      actor,
      claims: [],
      body: { soul, from: current, to: version, strategy }
    });
    const blocked = world.emit({
      process: "activateBackendProgramVersion.blocked",
      actor,
      claims: [],
      body: { soul, from: current, version, strategy, reason: "fork required" }
    });
    return { ok: false, status: "forkRequired", soul, version, witness: blocked, witnesses: [requested, blocked] };
  }
  const blocked = world.emit({
    process: "activateBackendProgramVersion.blocked",
    actor,
    claims: [],
    body: { soul, from: current, version, strategy, reason: transition ? "transition blocked" : "no authored transition" }
  });
  return { ok: false, status: "blocked", soul, version, witness: blocked, witnesses: [blocked] };
}

export function rollbackBackendProgramVersion(world, { actor, soul }) {
  const history = backendProgramActivationHistory(world.allWitnesses()).get(soul) ?? [];
  if (history.length < 2) {
    const witness = world.emit({
      process: "backendProgramVersion.rollback.failed",
      actor,
      claims: [],
      body: { soul, reason: "no previous active version" }
    });
    return { ok: false, status: "failed", soul, version: null, witness, witnesses: [witness] };
  }

  const current = history[history.length - 1]?.version ?? null;
  let target = null;
  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index].version !== current) {
      target = history[index].version;
      break;
    }
  }
  if (!target) {
    const witness = world.emit({
      process: "backendProgramVersion.rollback.failed",
      actor,
      claims: [],
      body: { soul, reason: "no previous distinct active version" }
    });
    return { ok: false, status: "failed", soul, version: null, witness, witnesses: [witness] };
  }

  const rollback = world.emit({
    process: "backendProgramVersion.rollback",
    actor,
    claims: [],
    body: { soul, from: current, to: target }
  });
  const activation = activateBackendProgramVersion(world, { actor, soul, version: target });
  return { ok: true, status: "rolledBack", soul, version: target, witness: activation, witnesses: [rollback, activation] };
}

export function backendProgramsProjection(witnesses) {
  const rows = new Map();
  const contexts = objectContexts(witnesses);
  const titles = titlesByThing(witnesses);
  const owners = ownersByThing(witnesses);
  for (const witness of witnesses) {
    if (witness.process !== "defineBackendProgram" || !witness.body?.soul) continue;
    rows.set(witness.body.soul, {
      soul: witness.body.soul,
      label: String(witness.body.label ?? witness.body.soul),
      context: contexts.get(witness.body.soul) ?? (witness.body.context ? String(witness.body.context) : null),
      owner: owners.get(witness.body.soul) ?? null,
      title: titles.get(witness.body.soul) ?? String(witness.body.label ?? witness.body.soul)
    });
  }
  return [...rows.values()].sort((left, right) => String(left.soul).localeCompare(String(right.soul)));
}

export function backendProgramVersionsProjection(witnesses) {
  const active = activeBackendProgramVersions(witnesses);
  const rows = backendProgramVersions(witnesses).map(row => ({
    ...row,
    active: active.get(row.soul) === row.version
  }));
  return rows.sort((left, right) =>
    String(left.soul).localeCompare(String(right.soul))
    || Number(left.index) - Number(right.index)
    || String(left.version).localeCompare(String(right.version))
  );
}

export function backendStepsProjection(witnesses) {
  return witnesses
    .filter(witness => witness.process === "defineBackendStep" && witness.body?.version)
    .map(witness => ({
      version: witness.body.version,
      event: witness.body.event,
      op: witness.body.op,
      order: witness.body.order ?? 0,
      params: witness.body.params ?? {},
      when: witness.body.when ?? null,
      repeat: witness.body.repeat ?? null,
      after: Array.isArray(witness.body.after) ? witness.body.after : []
    }))
    .sort((left, right) =>
      String(left.version).localeCompare(String(right.version))
      || String(left.event).localeCompare(String(right.event))
      || Number(left.order) - Number(right.order)
    );
}

export function backendProgramVersionDefinition(witnesses, versionId) {
  if (!versionId) return null;
  const versionRow = backendProgramVersions(witnesses).find(row => row.version === versionId) ?? null;
  if (!versionRow) return null;
  const stepMap = new Map();
  for (const witness of witnesses.filter(row => row.process === "defineBackendStep" && row.body?.version === versionId)) {
    const step = {
      event: witness.body.event,
      op: witness.body.op,
      order: witness.body.order ?? 0,
      params: witness.body.params ?? {},
      when: witness.body.when ?? null,
      repeat: witness.body.repeat ?? null,
      after: Array.isArray(witness.body.after) ? witness.body.after : []
    };
    const key = `${step.event}\u0000${step.order}\u0000${step.op}\u0000${stableJson(step.params)}\u0000${stableJson(step.when)}\u0000${stableJson(step.repeat)}\u0000${stableJson(step.after)}`;
    stepMap.set(key, step);
  }
  const steps = [...stepMap.values()].sort((left, right) => Number(left.order) - Number(right.order));
  return {
    id: versionId,
    soul: versionRow.soul,
    eventNames: [...new Set(steps.map(step => step.event).filter(Boolean))].sort(),
    steps,
    graph: stepGraphFromLinearSteps(steps, { programId: versionId })
  };
}

export function activeBackendProgramDefinition(witnesses, soul) {
  const version = activeBackendProgramVersions(witnesses).get(soul) ?? null;
  return version ? backendProgramVersionDefinition(witnesses, version) : null;
}

function objectContexts(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    for (const claim of witness.claims ?? []) {
      if (claim?.op === "relation" && claim.rel === "inContext") rows.set(claim.from, claim.to);
    }
  }
  return rows;
}

function titlesByThing(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    for (const claim of witness.claims ?? []) {
      if (claim?.op === "relation" && claim.rel === "hasTitle") rows.set(claim.from, claim.to);
    }
  }
  return rows;
}

function ownersByThing(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    for (const claim of witness.claims ?? []) {
      if (claim?.op === "relation" && claim.rel === "owns") rows.set(claim.to, claim.from);
    }
  }
  return rows;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
