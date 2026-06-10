import crypto from "node:crypto";
import { WitnessLog } from "./witness-log.js";

const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};

const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const hash = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex");

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function createWorld({ genesis = { system: "witness-world", version: "0.1.0" }, witnessLog = null, witnessLogPath = null } = {}) {
  const log = witnessLog ?? new WitnessLog({ file: witnessLogPath });
  const existing = log.all();
  if (existing.length > 0) {
    return makeWorldFromLog({ genesis, log });
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

  return makeWorldFromLog({ genesis, log });
}

function makeWorldFromLog({ genesis, log }) {
  function emit({ process, actor, claims = [], body = {}, cause = undefined }) {
    const prior = log.all().at(-1)?.id ?? null;
    const actualCause = cause === undefined ? prior : cause;
    const w = makeWitness({ cause: actualCause, process, actor, claims, body });
    log.append(w);
    return w;
  }

  function fork() {
    const child = createWorld({ genesis });
    child._replaceWitnesses(log.all());
    return child;
  }

  function project(projector) {
    return projector(log.all());
  }

  function allWitnesses() {
    return log.all();
  }

  function _replaceWitnesses(next) {
    log.replace(next);
  }

  return { emit, project, allWitnesses, fork, _replaceWitnesses };
}

function makeWitness({ cause, process, actor, claims, body }) {
  const payload = { cause, process, actor, claims, body };
  const id = `w_${hash(payload).slice(0, 24)}`;
  return deepFreeze({ id, ...payload });
}

export const thing = id => ({ op: "thing", id });
export const relation = (from, rel, to, meta = {}) => ({ op: "relation", from, rel, to, meta });
export const retract = (from, rel, to, meta = {}) => ({ op: "retract", from, rel, to, meta });

export const projectors = {
  things(witnesses) {
    const out = new Set();
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op === "thing") out.add(c.id);
      }
    }
    return out;
  },

  relations(witnesses) {
    const rows = [];
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op === "relation") rows.push({ ...c, witness: w.id });
      }
    }
    return rows;
  },

  currentRelations(witnesses) {
    const map = new Map();
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op !== "relation" && c.op !== "retract") continue;
        const key = `${c.from}\u0000${c.rel}\u0000${c.to}`;
        if (c.op === "relation") map.set(key, { ...c, witness: w.id });
        if (c.op === "retract") map.delete(key);
      }
    }
    return [...map.values()];
  },

  owners(witnesses) {
    const owners = new Map();
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op === "relation" && c.rel === "owns") owners.set(c.to, c.from);
      }
    }
    return owners;
  },

  main(witnesses) {
    let main = null;
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op === "relation" && c.from === "main" && c.rel === "pointsTo") main = c.to;
      }
    }
    return main;
  },

  stewards(witnesses) {
    const map = new Map();
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op === "relation" && c.rel === "stewards") {
          if (!map.has(c.to)) map.set(c.to, new Set());
          map.get(c.to).add(c.from);
        }
      }
    }
    return map;
  },

  proxies(witnesses) {
    const map = new Map();
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op === "relation" && c.rel === "proxies") map.set(c.from, c.to);
      }
    }
    return map;
  }
};

export function canAcceptInto(world, actor, target) {
  const owners = world.project(projectors.owners);
  const stewards = world.project(projectors.stewards);
  return owners.get(target) === actor || stewards.get(target)?.has(actor) === true;
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
