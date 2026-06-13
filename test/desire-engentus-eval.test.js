import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { goodmanFunctions } from "../plugins/chart-runtime/goodman-stdlib.js";
import {
  bolt_static_point,
  goodman_sa,
  sn_hannover,
  months_to_cycles
} from "../example-ports/engentus/js/physics.js";

// ── M2: the generic evaluator reproduces the SPA physics from the IR model ──────
// Parse the real models/goodman.rvm, evaluate it, and cross-check `band` and
// `curve` against example-ports/engentus/js/physics.js. If these match, the
// dataflow IR is a faithful re-expression of the hand-coded science.

async function loadModelBody() {
  const file = path.join(process.cwd(), "examples_rvm", "engentus", "app", "models", "goodman.rvm");
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
  const model = desire.nodes.find(n => n.kind === "dataflow" && n.name === "BoltFatigue");
  assert.ok(model, "BoltFatigue dataflow node not found in models/goodman.rvm");
  return model.body;
}

// nominal params mirroring models/goodman.rvm (jemtec off, t=0 static)
const P = {
  D_Shank: 0.044, D_minor: 0.041, head_direction: 0,
  rubber_shoreA: 60, rubber_nu: 0.49, rubber_area_m2: 0.045, rubber_thickness_m: 0.05,
  relax_a: 0, relax_b: 0, E_bolt_GPa: 200, L_grip: 0.18, n_bolts: 4,
  jemtec_enabled: 0, F_alt_applied_N: 30000, angular_span_factor: 1,
  mu_joint: 0.4, A_s_nom: 0.001473, n_interfaces: 2, length_factor: 1
};
const RPM = 9.0, SIGMA_LIM = 60, M_SLOPE = 5, UTS = 1000, YS = 600;
const LIFETIME = [0.5, 2, 6];

const close = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

test("evaluateModel reproduces Goodman bands from the IR (matches physics.js)", async () => {
  const { axes, fields } = evaluateModel(await loadModelBody(), { functions: goodmanFunctions });

  assert.deepEqual(axes.lifetime.values, LIFETIME);
  assert.equal(axes.sm.values.length, fields.band.data.length);
  assert.deepEqual(fields.band.axes, ["sm", "lifetime"]);

  const sm = axes.sm.values;
  for (const i of [0, 50, 125, 200, 300, sm.length - 1]) {
    for (let j = 0; j < LIFETIME.length; j += 1) {
      const fl = sn_hannover(months_to_cycles(LIFETIME[j], RPM), SIGMA_LIM, M_SLOPE);
      const ref = goodman_sa(sm[i], fl, UTS, YS);
      const got = fields.band.data[i][j];
      assert.ok(close(got, ref), `band[${i}][${j}] sm=${sm[i]} got ${got} expected ${ref}`);
    }
  }
});

test("evaluateModel reproduces the bolt response curve from the IR (matches physics.js)", async () => {
  const { axes, fields } = evaluateModel(await loadModelBody(), { functions: goodmanFunctions });
  assert.deepEqual(fields.curve.axes, ["sm"]);

  const sm = axes.sm.values;
  for (const i of [0, 50, 125, 200, 300, 400, sm.length - 1]) {
    const ref = bolt_static_point(P, sm[i], P.F_alt_applied_N).sigma_a;
    const got = fields.curve.data[i];
    assert.ok(close(got, ref, 1e-6), `curve[${i}] sm=${sm[i]} got ${got} expected ${ref}`);
  }
});

test("evaluateModel computes the scalar slip threshold and yield line", async () => {
  const { axes, fields } = evaluateModel(await loadModelBody(), { functions: goodmanFunctions });
  // slip is a scalar (no `over`)
  assert.deepEqual(fields.slip.axes, []);
  const F_per_bolt = 30000 / 4 * 1;
  assert.ok(close(fields.slip.data, F_per_bolt / (0.4 * 0.001473 * 2)));
  // yield line y = ys - sm
  assert.deepEqual(fields.yield_line.axes, ["sm"]);
  assert.ok(close(fields.yield_line.data[100], YS - axes.sm.values[100]));
});
