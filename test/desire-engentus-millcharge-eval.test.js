import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { millChargeKernels } from "../plugins/chart-runtime/mill-charge-kernels.js";
import { chargeGeometry, cataractingIndex } from "../example-ports/engentus/js/mill_physics.js";

// ── MC1: the 3rd-science vertical ───────────────────────────────────────────────
// One IR model reproduces the hand-coded charge geometry; the entire cataracting
// trajectory FIELD over the (particle, t) product is honest dataflow (no kernel);
// only segment_half_angle + charge_com_* are lowered. The "stochastic" launch
// jitter is a seeded sampler, so the field is reproducible.

async function loadModelBody() {
  const file = path.join(process.cwd(), "examples_rvm", "engentus", "app", "models", "mill-charge.rvm");
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
  const model = desire.nodes.find(n => n.kind === "dataflow" && n.name === "MillCharge");
  assert.ok(model, "MillCharge dataflow node not found");
  return model.body;
}

const close = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

// param sets: the default + two mill_view presets (full physics inputs)
const PARAM_SETS = {
  default: { speedFrac: 0.75, fillFrac: 0.30, slurryContent: 0.20, wallFriction: 0.50, internalFriction: 35, bulkDensity: 1800, millRadius: 1 },
  hardOre: { speedFrac: 0.85, fillFrac: 0.25, slurryContent: 0.05, wallFriction: 0.65, internalFriction: 42, bulkDensity: 2400, millRadius: 1 },
  clayey:  { speedFrac: 0.62, fillFrac: 0.40, slurryContent: 0.50, wallFriction: 0.35, internalFriction: 26, bulkDensity: 1600, millRadius: 1 }
};

test("MillCharge reproduces hand-coded charge geometry to 1e-6 (shoulder/toe/COM/catIdx)", async () => {
  const body = await loadModelBody();
  for (const [name, params] of Object.entries(PARAM_SETS)) {
    const ev = evaluateModel(body, { functions: millChargeKernels, params });
    const geo = chargeGeometry(params);
    assert.ok(close(ev.fields.phiS.data, geo.shoulder), `${name} shoulder: ${ev.fields.phiS.data} vs ${geo.shoulder}`);
    assert.ok(close(ev.fields.phiT.data, geo.toe), `${name} toe: ${ev.fields.phiT.data} vs ${geo.toe}`);
    assert.ok(close(ev.fields.comX.data, geo.comX), `${name} comX: ${ev.fields.comX.data} vs ${geo.comX}`);
    assert.ok(close(ev.fields.comY.data, geo.comY), `${name} comY: ${ev.fields.comY.data} vs ${geo.comY}`);
    assert.ok(close(ev.fields.comOffsetR.data, geo.comOffsetR), `${name} comOffsetR`);
    assert.ok(close(ev.fields.catIdx.data, cataractingIndex(params.speedFrac)), `${name} catIdx`);
  }
});

test("the fill solver satisfies θ−sinθ=2πJ and fixes the toe at φ_s−2α", async () => {
  const body = await loadModelBody();
  for (const [, params] of Object.entries(PARAM_SETS)) {
    const ev = evaluateModel(body, { functions: millChargeKernels, params });
    const alpha = ev.fields.alpha.data;
    const theta = 2 * alpha;
    assert.ok(Math.abs(theta - Math.sin(theta) - 2 * Math.PI * params.fillFrac) < 1e-9, "segment residual");
    assert.ok(close(ev.fields.phiT.data, ev.fields.phiS.data - 2 * alpha), "toe = shoulder − 2α");
  }
});

test("the cataracting trajectory field is honest dataflow over (particle, t)", async () => {
  const body = await loadModelBody();
  const params = PARAM_SETS.default;
  const ev = evaluateModel(body, { functions: millChargeKernels, params });

  // axes are present and shaped as a (particle, t) product
  const particleVals = ev.axes.particle.values;
  const tVals = ev.axes.t.values;
  assert.equal(particleVals[0], 1);
  assert.ok(tVals.length > 1 && tVals[0] === 0);
  assert.deepEqual(ev.fields.px.axes, ["particle", "t"]);

  const R = params.millRadius;
  const g = 9.81;
  const tMax = ev.params.t_max;
  const omega = params.speedFrac * Math.sqrt(g / R);
  const phiS = ev.fields.phiS.data;

  // independently recompute px/py with the SAME seeded sampler → must match exactly
  for (const i of [0, 4, 9, particleVals.length - 1]) {
    const p = particleVals[i];
    const phi0 = phiS + millChargeKernels.spread(p, 0.1);
    const vscale = millChargeKernels.vjit(p);
    const x0 = R * Math.cos(phi0), y0 = R * Math.sin(phi0);
    const vx0 = -omega * R * Math.sin(phi0) * vscale;
    const vy0 = omega * R * Math.cos(phi0) * vscale;
    const t0 = millChargeKernels.tphase(p, tMax);
    for (const k of [0, 5, tVals.length - 1]) {
      const tau = Math.max(0, tVals[k] - t0);
      const expPx = x0 + vx0 * tau;
      const expPy = y0 + vy0 * tau - 0.5 * g * tau * tau;
      assert.ok(close(ev.fields.px.data[i][k], expPx, 1e-9), `px[${i}][${k}]`);
      assert.ok(close(ev.fields.py.data[i][k], expPy, 1e-9), `py[${i}][${k}]`);
    }
  }
});
