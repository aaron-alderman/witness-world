import crypto from "node:crypto";
import { WitnessLog } from "./witness-log.js";
import { thing, relation, retract, projectors, stableStringify } from "./projectors-core.js";

export { thing, relation, retract, projectors };

const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};

const hash = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex");

export function createWorld({ genesis = { system: "witness-world", version: "0.1.0" }, witnessLog = null, witnessLogPath = null, observationLog = null, observationLogPath = null } = {}) {
  const log = witnessLog ?? new WitnessLog({ file: witnessLogPath });
  const obsLog = observationLog ?? new WitnessLog({ file: observationLogPath });
  const existing = log.all();
  if (existing.length > 0) {
    return makeWorldFromLog({ genesis, log, obsLog });
  }
  const genesisWitness = makeWitness({
    cause: null,
    process: "genesis",
    actor: "genesis",
    claims: [
      thing("genesis"),
      thing("adam"),
      relation("genesis", "authorizes", "adam"),
      relation("adam", "owns", "adam"),
      relation("main", "pointsTo", "adam")
    ],
    body: genesis
  });
  log.append(genesisWitness);

  return makeWorldFromLog({ genesis, log, obsLog });
}

function makeWorldFromLog({ genesis, log, obsLog }) {
  function emit({ process, actor, claims = [], body = {}, cause = undefined }) {
    const prior = log.all().at(-1)?.id ?? null;
    const actualCause = cause === undefined ? prior : cause;
    const w = makeWitness({ cause: actualCause, process, actor, claims, body });
    log.append(w);
    return w;
  }

  function observe({ process, actor, claims = [], body = {}, cause = undefined }) {
    const prior = obsLog.all().at(-1)?.id ?? null;
    const actualCause = cause === undefined ? prior : cause;
    const w = makeWitness({ cause: actualCause, process, actor, claims, body });
    obsLog.append(w);
    return w;
  }

  function fork() {
    const childObsLog = new WitnessLog();
    childObsLog.replace(obsLog.all());
    const child = createWorld({ genesis, observationLog: childObsLog });
    child._replaceWitnesses(log.all());
    return child;
  }

  function project(projector) {
    return projector(log.all());
  }

  function allWitnesses() {
    return log.all();
  }

  function allObservations() {
    return obsLog.all();
  }

  function _replaceWitnesses(next) {
    log.replace(next);
  }

  return { emit, observe, project, allWitnesses, allObservations, fork, _replaceWitnesses };
}

function makeWitness({ cause, process, actor, claims, body }) {
  const payload = { cause, process, actor, claims, body };
  const id = `w_${hash(payload).slice(0, 24)}`;
  return deepFreeze({ id, ...payload });
}

export function canAcceptInto(world, actor, target) {
  const owners = world.project(projectors.owners);
  const stewards = world.project(projectors.stewards);
  return owners.get(target) === actor || stewards.get(target)?.has(actor) === true;
}

function currentRelations(world) {
  return world.project(projectors.currentRelations);
}

function moduleKinds(world) {
  const kinds = new Map();
  for (const row of currentRelations(world)) {
    if (row.rel === "hasModuleKind") kinds.set(row.from, row.to);
  }
  return kinds;
}

function objectContexts(world) {
  const map = new Map();
  for (const row of currentRelations(world)) {
    if (row.rel === "inContext") map.set(row.from, row.to);
  }
  return map;
}

function contextRows(world) {
  const rows = new Map();
  const owners = world.project(projectors.owners);
  const stewards = world.project(projectors.stewards);
  for (const row of currentRelations(world)) {
    if (row.rel === "hasModuleKind" && row.to === "context") {
      rows.set(row.from, {
        id: row.from,
        label: row.from,
        actor: null,
        parent: null,
        owner: owners.get(row.from) ?? null,
        stewards: [...(stewards.get(row.from) ?? [])].sort()
      });
    }
  }
  for (const witness of world.allWitnesses()) {
    if (witness.process !== "defineContext" || !witness.body?.id || !rows.has(witness.body.id)) continue;
    const row = rows.get(witness.body.id);
    row.label = typeof witness.body.label === "string" && witness.body.label.trim() ? witness.body.label.trim() : row.label;
    row.actor = typeof witness.body.actor === "string" && witness.body.actor.trim() ? witness.body.actor.trim() : row.actor;
  }
  for (const row of currentRelations(world)) {
    if (!rows.has(row.from)) continue;
    if (row.rel === "parentContext") rows.get(row.from).parent = row.to;
    if (row.rel === "contextActor") rows.get(row.from).actor = row.to;
  }
  return rows;
}

function directContextAuthority(world, actor) {
  const out = new Set();
  if (!actor) return out;
  for (const row of contextRows(world).values()) {
    if (row.owner === actor || row.stewards.includes(actor)) out.add(row.id);
  }
  return out;
}

function inheritedContextAuthority(world, actor) {
  const contexts = contextRows(world);
  const allowed = directContextAuthority(world, actor);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of contexts.values()) {
      if (allowed.has(row.id)) continue;
      if (row.parent && allowed.has(row.parent)) {
        allowed.add(row.id);
        changed = true;
      }
    }
  }
  return allowed;
}

function governingContextFor(world, target) {
  const kinds = moduleKinds(world);
  if (kinds.get(target) === "context") return target;
  return objectContexts(world).get(target) ?? null;
}

export function authorityForActor(world, actor) {
  const contexts = contextRows(world);
  const ownedContexts = [];
  const stewardedContexts = [];
  for (const row of contexts.values()) {
    if (row.owner === actor) ownedContexts.push(row.id);
    else if (row.stewards.includes(actor)) stewardedContexts.push(row.id);
  }
  const mutationContexts = [...inheritedContextAuthority(world, actor)].sort();
  return {
    actor: actor || null,
    authenticated: Boolean(actor),
    ownedContexts: ownedContexts.sort(),
    stewardedContexts: stewardedContexts.sort(),
    mutationContexts
  };
}

export function canManageContext(world, actor, contextId) {
  if (!actor) return { ok: false, status: 401, reason: "sign in to edit bootstrap state" };
  if (!contextRows(world).has(contextId)) return { ok: false, status: 404, reason: "context not found" };
  if (inheritedContextAuthority(world, actor).has(contextId)) return { ok: true, status: 200, reason: null };
  return { ok: false, status: 403, reason: "actor lacks authority for context" };
}

export function canCreateInContext(world, actor, contextId) {
  if (!contextId) return { ok: true, status: 200, reason: null };
  return canManageContext(world, actor, contextId);
}

export function canMutateTarget(world, actor, target) {
  if (!actor) return { ok: false, status: 401, reason: "sign in to edit bootstrap state" };
  const things = world.project(projectors.things);
  if (!things.has(target)) return { ok: false, status: 404, reason: "target not found" };
  const owners = world.project(projectors.owners);
  const stewards = world.project(projectors.stewards);
  const kinds = moduleKinds(world);
  const kind = kinds.get(target) ?? null;

  if (kind === "perspective") {
    if (owners.get(target) === actor || stewards.get(target)?.has(actor) === true) {
      return { ok: true, status: 200, reason: null };
    }
    return { ok: false, status: 403, reason: "actor does not own or steward perspective" };
  }

  const contextId = governingContextFor(world, target);
  if (contextId) return canManageContext(world, actor, contextId);
  if (owners.get(target) === actor) return { ok: true, status: 200, reason: null };
  return { ok: false, status: 403, reason: "actor does not own target" };
}

export function transferOwnership(world, { actor, thingId, from, to }) {
  const owners = world.project(projectors.owners);
  if (owners.get(thingId) !== from) {
    return world.emit({
      process: "transferOwnership.failed",
      actor,
      claims: [],
      body: { thingId, from, to, reason: "from is not current owner" }
    });
  }
  if (actor !== from) {
    return world.emit({
      process: "transferOwnership.failed",
      actor,
      claims: [],
      body: { thingId, from, to, reason: "actor is not current owner" }
    });
  }
  return world.emit({
    process: "transferOwnership",
    actor,
    claims: [relation(to, "owns", thingId)],
    body: { thingId, from, to }
  });
}

export function cloneThing(world, { actor, source, clone }) {
  return world.emit({
    process: "cloneThing",
    actor,
    claims: [thing(clone), relation(actor, "owns", clone), relation(clone, "proxies", source), relation(clone, "cloneOf", source)],
    body: { source, clone }
  });
}

export function createThing(world, { actor, id, owner = actor }) {
  return world.emit({
    process: "createThing",
    actor,
    claims: [thing(id), relation(owner, "owns", id), relation(actor, "created", id)],
    body: { id, owner }
  });
}
