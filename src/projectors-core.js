// Browser-safe core: claim ops + projectors, no node dependencies.
// Served to the canvas client via /canvas-lib/ so the same projection code
// runs server-side and in the browser.

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
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
    const NUL = String.fromCharCode(0);
    const map = new Map();
    for (const w of witnesses) {
      for (const c of w.claims) {
        if (c.op !== "relation" && c.op !== "retract") continue;
        const key = c.from + NUL + c.rel + NUL + c.to;
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
    for (const row of projectors.currentRelations(witnesses)) {
      if (row.rel !== "stewards") continue;
      if (!map.has(row.to)) map.set(row.to, new Set());
      map.get(row.to).add(row.from);
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
