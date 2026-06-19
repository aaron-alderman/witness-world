// Hearth world — the chore domain on the real witness kernel.
//
// A chore is not a row you mutate. It is a witnessed claim. Adding a chore
// appends a `chore.add` witness; completing one appends a SEPARATE `chore.done`
// witness — the original is never touched. "The open list" is a projection over
// the append-only log, derived at read time. New evidence changes the present
// without mutating the past.

import { createWorld, thing, relation } from "../../src/kernel.js";

export function openWorld({ witnessLogPath = null } = {}) {
  return createWorld({
    genesis: { system: "loam", app: "hearth", version: "0.0.1" },
    witnessLogPath
  });
}

// ids are provisional labels (a soul is not an id) — fine for this slice.
function nextChoreId(world) {
  return `chore-${world.witnessCount()}`;
}

export function addChore(world, { actor, text }) {
  const id = nextChoreId(world);
  world.emit({
    process: "chore.add",
    actor,
    claims: [
      thing(id),
      relation("hearth", "contains", id),
      relation(id, "text", text),
      relation(id, "addedBy", actor)
    ],
    body: { id, text }
  });
  return id;
}

export function completeChore(world, { actor, id }) {
  // append-only: a claim that `actor` marked `id` done. Nothing is retracted.
  world.emit({
    process: "chore.done",
    actor,
    claims: [relation(id, "doneBy", actor)],
    body: { id }
  });
  return id;
}

// ── projection: open chores, derived from the log ────────────────────────────
export function choreList(witnesses) {
  const order = [];
  const text = new Map();
  const done = new Set();
  for (const w of witnesses) {
    if (w.process === "chore.add" && w.body?.id) {
      order.push(w.body.id);
      text.set(w.body.id, w.body.text ?? "");
    }
    if (w.process === "chore.done" && w.body?.id) {
      done.add(w.body.id);
    }
  }
  return order.filter(id => !done.has(id)).map(id => ({ id, text: text.get(id) ?? "" }));
}

// the bound data the shell renders into the surface
export function hearthData(world) {
  return { chores: world.project(choreList), draft: "" };
}

// ── intent → witness (the inbound half of the seam) ──────────────────────────
export function applyIntent(world, intent = {}) {
  const actor = intent.actor || "anon";
  if (intent.intent === "add") {
    const text = String(intent.value ?? "").trim();
    if (!text) return { ok: false, reason: "empty chore" };
    return { ok: true, id: addChore(world, { actor, text }) };
  }
  if (intent.intent === "complete") {
    if (!intent.arg) return { ok: false, reason: "no chore id" };
    return { ok: true, id: completeChore(world, { actor, id: intent.arg }) };
  }
  return { ok: false, reason: `unknown intent: ${intent.intent}` };
}
