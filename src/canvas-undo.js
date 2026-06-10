import { relation, retract, stableStringify } from "./projectors-core.js";

const SEP = String.fromCharCode(0);
const tripleKey = c => c.from + SEP + c.rel + SEP + c.to;

function stateBefore(witnesses, targetId) {
  const map = new Map();
  for (const w of witnesses) {
    if (w.id === targetId) return map;
    for (const c of w.claims) {
      if (c.op === "relation") map.set(tripleKey(c), c);
      if (c.op === "retract") map.delete(tripleKey(c));
    }
  }
  return null;
}

export function compensationClaims(witnesses, target) {
  const pre = stateBefore(witnesses, target.id);
  if (!pre) return [];
  const claims = [];
  const seen = new Set();
  for (let i = target.claims.length - 1; i >= 0; i--) {
    const c = target.claims[i];
    if (c.op === "thing") continue;
    const key = tripleKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    const prior = pre.get(key);
    if (c.op === "relation") {
      if (!prior) claims.push(retract(c.from, c.rel, c.to));
      else if (stableStringify(prior.meta ?? {}) !== stableStringify(c.meta ?? {})) claims.push(relation(c.from, c.rel, c.to, prior.meta ?? {}));
    } else if (c.op === "retract") {
      if (prior) claims.push(relation(c.from, c.rel, c.to, prior.meta ?? {}));
    }
  }
  return claims;
}

function relevant(w, actor, perspective) {
  if (w.actor !== actor) return false;
  if (!w.process.startsWith("canvas.")) return false;
  if (w.process.endsWith(".failed") || w.process.endsWith(".blocked")) return false;
  if (w.process === "canvas.perspective.create") return false;
  if (w.body?.perspective !== perspective) return false;
  return true;
}

export function undoState(witnesses, actor, perspective) {
  const undoStack = [];
  let redoStack = [];
  for (const w of witnesses) {
    if (!relevant(w, actor, perspective)) continue;
    if (w.process === "canvas.undo") {
      undoStack.pop();
      redoStack.push(w);
    } else if (w.process === "canvas.redo") {
      redoStack.pop();
      undoStack.push(w);
    } else {
      undoStack.push(w);
      redoStack = [];
    }
  }
  return { undoTarget: undoStack.at(-1) ?? null, redoTarget: redoStack.at(-1) ?? null };
}
