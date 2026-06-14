import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { goodmanFunctions } from "../examples/engentus/app/chart-functions/goodman-stdlib.js";
import { samplingFunctions } from "../examples/engentus/app/chart-functions/sampling.js";

// ── MC: the Monte-Carlo machinery (ensemble axis + percentile reductions) ─────────
// BoltFatigueMC adds a `sample = ensemble(N)` axis, draws the applied force per sample
// (seeded lognormal), propagates it, and collapses to p10/p50/p90 σa bands with
// `reduce … over sample`. Verifies the generic machinery, not a specific hand sim.

const FNS = { ...goodmanFunctions, ...samplingFunctions };

async function loadModelBody() {
  const file = path.join(process.cwd(), "examples_rvm", "engentus", "app", "models", "goodman.rvm");
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
  const model = desire.nodes.find(n => n.kind === "dataflow" && n.name === "BoltFatigueMC");
  assert.ok(model, "BoltFatigueMC dataflow node not found");
  return model.body;
}

// independent reference: type-7 quantile of a vector (matches REDUCERS.quantileSorted)
function refPercentile(values, p) {
  const a = [...values].sort((x, y) => x - y);
  const idx = (a.length - 1) * (p / 100);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

test("the ensemble axis materialises N sample indices", async () => {
  const ev = evaluateModel(await loadModelBody(), { functions: FNS });
  assert.equal(ev.axes.sample.kind, "ensemble");
  assert.equal(ev.axes.sample.values.length, ev.params.n_samples);
  assert.deepEqual(ev.axes.sample.values.slice(0, 3), [0, 1, 2]);
});

test("the sampled response actually varies across samples (it's a real ensemble)", async () => {
  const ev = evaluateModel(await loadModelBody(), { functions: FNS });
  const row = ev.fields.curve_s.data[40]; // curve_s is over [sm, sample]
  const spread = Math.max(...row) - Math.min(...row);
  assert.ok(spread > 1e-6, `expected per-sample spread, got ${spread}`);
});

test("reduce percentile over sample matches an independent type-7 percentile (1e-12)", async () => {
  const ev = evaluateModel(await loadModelBody(), { functions: FNS });
  const N = ev.axes.sm.values.length;
  assert.deepEqual(ev.fields.sa_p50.axes, ["sm"]); // sample axis collapsed away
  for (const i of [0, 37, 120, N - 1]) {
    const vec = ev.fields.curve_s.data[i]; // all samples at this sm
    for (const [field, p] of [["sa_p10", 10], ["sa_p50", 50], ["sa_p90", 90]]) {
      const got = ev.fields[field].data[i];
      const exp = refPercentile(vec, p);
      assert.ok(Math.abs(got - exp) <= 1e-12 * Math.max(1, Math.abs(exp)),
        `${field}[${i}]: got ${got} expected ${exp}`);
    }
  }
});

test("the bands are ordered p10 ≤ p50 ≤ p90 everywhere", async () => {
  const ev = evaluateModel(await loadModelBody(), { functions: FNS });
  const { sa_p10, sa_p50, sa_p90 } = ev.fields;
  for (let i = 0; i < ev.axes.sm.values.length; i += 1) {
    assert.ok(sa_p10.data[i] <= sa_p50.data[i] + 1e-12, `p10≤p50 at ${i}`);
    assert.ok(sa_p50.data[i] <= sa_p90.data[i] + 1e-12, `p50≤p90 at ${i}`);
  }
});

test("the reducer convention is type-7 percentile (median of a known set)", async () => {
  // a tiny model: one ensemble axis, a per-sample field = the sample index, reduced
  const body = {
    axes: [{ name: "s", kind: "ensemble", args: [5] }],
    params: [],
    derives: [{ name: "v", expr: "s", over: ["s"] }],
    reduces: [
      { name: "med", expr: "percentile(v, 50)", over: ["s"] },
      { name: "q25", expr: "percentile(v, 25)", over: ["s"] }
    ]
  };
  const ev = evaluateModel(body, {});
  assert.equal(ev.fields.med.data, 2);   // median of [0,1,2,3,4]
  assert.equal(ev.fields.q25.data, 1);   // type-7: idx (5-1)*0.25 = 1 → value 1
  assert.deepEqual(ev.fields.med.axes, []); // fully reduced → scalar
});
