/**
 * dataflow-eval.js — GENERIC product-type dataflow evaluator. No domain logic.
 *
 * Evaluates a DESIRE `model` (dataflow) node body into a labeled product tensor:
 * a set of named "fields", each a value over a subset of the model's named axes
 * (the tensor's dense-float face — fields may also be int/bool/category).
 *
 * This module is the reusable capability the thesis predicts: it knows nothing
 * about Goodman, fatigue, or engentus. Domain functions (sn_hannover, …) are
 * passed in via `options.functions`; axis values that come `from` an external
 * source are passed via `options.axisValues`.
 *
 * Body shape (from src/desire normalization):
 *   { axes:[{name, kind, args?|values?|from?}],
 *     params:[{name, default}],
 *     derives:[{name, expr, over:[axisName,...]}],
 *     reduces:[{name, expr, over:[axisName,...]}] }
 *
 *   evaluateModel(body, options) -> { axes, fields }
 *     axes  : { name -> { kind, values:[...] } }
 *     fields: { name -> { axes:[axisName,...], data } }   data is scalar or nested arrays
 */

const CONSTANTS = { pi: Math.PI, e: Math.E, inf: Infinity, infinity: Infinity };

const BUILTINS = {
  max: Math.max, min: Math.min, sqrt: Math.sqrt, abs: Math.abs,
  exp: Math.exp, log: Math.log, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  pow: Math.pow, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, atan: Math.atan, atan2: Math.atan2, asin: Math.asin, acos: Math.acos,
  clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi)
};

export function evaluateModel(body, options = {}) {
  const functions = { ...BUILTINS, ...(options.functions ?? {}) };
  const paramOverrides = options.params ?? {};
  const externalAxisValues = options.axisValues ?? {};

  // 1. param scope (built first; axes may depend on params)
  const params = {};
  for (const param of body.params ?? []) {
    params[param.name] = param.name in paramOverrides ? paramOverrides[param.name] : param.default;
  }

  // 2. axis values (args may reference params, e.g. sweep(1, N_segments, 1))
  const axes = {};
  for (const axis of body.axes ?? []) {
    axes[axis.name] = { kind: axis.kind, values: axisValues(axis, externalAxisValues, params) };
  }

  // 3. parse derives/reduces to ASTs, indexed by name
  const flows = new Map();
  for (const flow of [...(body.derives ?? []), ...(body.reduces ?? [])]) {
    flows.set(flow.name, {
      name: flow.name,
      over: Array.isArray(flow.over) ? flow.over : [],
      reduce: (body.reduces ?? []).includes(flow),
      ast: parseExpr(flow.expr)
    });
  }

  // 4. resolve fields (memoized, cycle-guarded, dependency-driven)
  const fields = {};
  const inProgress = new Set();

  function resolveField(name) {
    if (name in fields) return fields[name];
    if (inProgress.has(name)) throw new Error(`dataflow: cyclic dependency at "${name}"`);
    const flow = flows.get(name);
    if (!flow) throw new Error(`dataflow: unknown field "${name}"`);
    inProgress.add(name);
    const field = flow.reduce ? evalReduce(flow) : evalDerive(flow);
    inProgress.delete(name);
    fields[name] = field;
    return field;
  }

  // build a per-cell lookup: axis vars bound by `coord`, then params/constants, then other fields
  function makeLookup(overAxes, coord) {
    return function lookup(ident) {
      const axisIndex = overAxes.indexOf(ident);
      if (axisIndex >= 0) return axes[ident].values[coord[axisIndex]];
      if (ident in params) return params[ident];
      if (ident in CONSTANTS) return CONSTANTS[ident];
      if (flows.has(ident)) return indexField(resolveField(ident), overAxes, coord, ident);
      throw new Error(`dataflow: unresolved identifier "${ident}"`);
    };
  }

  function evalDerive(flow) {
    const dims = flow.over.map(a => axes[a].values.length);
    const build = (depth, coord) => {
      if (depth === flow.over.length) {
        return evalAst(flow.ast, makeLookup(flow.over, coord), functions);
      }
      const out = [];
      for (let i = 0; i < dims[depth]; i += 1) out.push(build(depth + 1, [...coord, i]));
      return out;
    };
    return { axes: [...flow.over], data: build(0, []) };
  }

  // a reduce collapses ONE axis: expr is f(field, ...) where the referenced field
  // carries the axis being reduced. For Goodman we don't yet use reduces; supported
  // minimally so the form is complete (reduce over [axis] → drop that axis).
  function evalReduce(flow) {
    return evalDerive(flow); // same machinery; reduction fns operate on arrays in-expr
  }

  for (const name of flows.keys()) resolveField(name);

  return { axes, params, fields };
}

// index a field's value at the current cell, projecting onto the field's own axes
function indexField(field, overAxes, coord, name) {
  if (field.axes.length === 0) return field.data; // scalar
  let value = field.data;
  for (const axisName of field.axes) {
    const pos = overAxes.indexOf(axisName);
    if (pos < 0) {
      throw new Error(`dataflow: field "${name}" over [${field.axes}] referenced outside its axes [${overAxes}]`);
    }
    value = value[coord[pos]];
  }
  return value;
}

function axisValues(axis, externalAxisValues, params = {}) {
  const num = v => (typeof v === "number" ? v : (v in params ? params[v] : Number(v)));
  if (axis.kind === "sweep") {
    const start = num(axis.args?.[0]);
    const end = num(axis.args?.[1]);
    const step = num(axis.args?.[2]);
    const out = [];
    const n = Math.floor((end - start) / step + 1e-9);
    for (let i = 0; i <= n; i += 1) out.push(start + i * step);
    return out;
  }
  if (axis.kind === "category") {
    return Array.isArray(axis.values) ? axis.values : [];
  }
  if (axis.kind === "from" || axis.kind === "external") {
    return externalAxisValues[axis.from] ?? externalAxisValues[axis.name] ?? [0];
  }
  return externalAxisValues[axis.name] ?? [0];
}

// ── expression engine (arithmetic + calls + ^; honest one-liners, no kernels) ──

function parseExpr(src) {
  const tokens = tokenize(String(src ?? ""));
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = ch => {
    const t = next();
    if (!t || t.v !== ch) throw new Error(`dataflow expr: expected "${ch}" in "${src}"`);
  };

  function parseAdd() {
    let left = parseMul();
    while (peek() && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      left = { t: "bin", op, l: left, r: parseMul() };
    }
    return left;
  }
  function parseMul() {
    let left = parsePow();
    while (peek() && (peek().v === "*" || peek().v === "/")) {
      const op = next().v;
      left = { t: "bin", op, l: left, r: parsePow() };
    }
    return left;
  }
  function parsePow() {
    const base = parseUnary();
    if (peek() && peek().v === "^") {
      next();
      return { t: "bin", op: "^", l: base, r: parsePow() }; // right-assoc
    }
    return base;
  }
  function parseUnary() {
    if (peek() && peek().v === "-") { next(); return { t: "neg", x: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = next();
    if (!t) throw new Error(`dataflow expr: unexpected end of "${src}"`);
    if (t.k === "num") return { t: "num", v: t.v };
    if (t.v === "(") { const e = parseAdd(); expect(")"); return e; }
    if (t.k === "id") {
      if (peek() && peek().v === "(") {
        next();
        const args = [];
        if (peek() && peek().v !== ")") {
          args.push(parseAdd());
          while (peek() && peek().v === ",") { next(); args.push(parseAdd()); }
        }
        expect(")");
        return { t: "call", name: t.v, args };
      }
      return { t: "var", name: t.v };
    }
    throw new Error(`dataflow expr: unexpected token "${t.v}" in "${src}"`);
  }

  const ast = parseAdd();
  if (pos !== tokens.length) throw new Error(`dataflow expr: trailing tokens in "${src}"`);
  return ast;
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.eE+\-]/.test(src[j])) {
        // allow exponent sign only right after e/E
        if ((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1])) break;
        j += 1;
      }
      tokens.push({ k: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j += 1;
      tokens.push({ k: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(ch)) { tokens.push({ k: "op", v: ch }); i += 1; continue; }
    throw new Error(`dataflow expr: bad character "${ch}" in "${src}"`);
  }
  return tokens;
}

function evalAst(node, lookup, functions) {
  switch (node.t) {
    case "num": return node.v;
    case "var": return lookup(node.name);
    case "neg": return -evalAst(node.x, lookup, functions);
    case "call": {
      const fn = functions[node.name];
      if (typeof fn !== "function") throw new Error(`dataflow expr: unknown function "${node.name}"`);
      return fn(...node.args.map(a => evalAst(a, lookup, functions)));
    }
    case "bin": {
      const l = evalAst(node.l, lookup, functions);
      const r = evalAst(node.r, lookup, functions);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "^": return Math.pow(l, r);
        default: throw new Error(`dataflow expr: bad operator ${node.op}`);
      }
    }
    default: throw new Error(`dataflow expr: bad node ${node.t}`);
  }
}
