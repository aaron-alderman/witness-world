export function gate(name, check) {
  return { name, check };
}

export function runGates(world, { actor, process, gates, context = {} }) {
  for (const g of gates) {
    const result = g.check(context);
    if (result !== true) {
      const reason = result === false ? "predicate returned false" : result;
      world.emit({
        process: `${process}.blocked`,
        actor,
        claims: [],
        body: { gate: g.name, reason, context: scrubContext(context) }
      });
      return { ok: false, gate: g.name, reason };
    }
  }
  return { ok: true };
}

export const actorRequired = gate("actor.required", ({ actor }) => actor ? true : "actor required");
export const textRequired = field => gate(`${field}.required`, ctx => typeof ctx[field] === "string" && ctx[field].trim() ? true : `${field} required`);

function scrubContext(context) {
  return Object.fromEntries(Object.entries(context).filter(([k]) => !k.toLowerCase().includes("secret")));
}
