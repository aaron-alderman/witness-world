import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { millForceKernels } from "../examples/engentus/app/chart-functions/mill-force-kernels.js";
import { planChart } from "../plugins/chart-runtime/gog-runtime.js";

const appDir = path.join(process.cwd(), "examples", "engentus", "app");

async function loadBody(file, kind, name) {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
  const node = desire.nodes.find(n => n.kind === kind && n.name === name);
  assert.ok(node, `${kind} ${name} not found in ${file}`);
  return node.body;
}

async function setup() {
  const model = await loadBody("models/mill-force.rvm", "dataflow", "MillForce");
  const evaluated = evaluateModel(model, { functions: millForceKernels });
  const g = evaluated.axes.method.values.indexOf("grounded");
  const N = evaluated.axes.segment.values.length;
  return { evaluated, g, N };
}

test("MillForceAngle plans cartesian lines over segment angle, sliced to grounded", async () => {
  const { evaluated, g, N } = await setup();
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceAngle");
  const plan = planChart(view, evaluated, { width: 800, height: 520 });

  assert.equal(plan.frame, "cartesian");
  assert.equal(plan.scales.x.label, "Segment angle θ (rad)");
  assert.ok(plan.scales.x.domain[1] > 0);            // auto-fit to tBar range
  const fr = plan.layers.find(l => l.name === "fr");
  assert.equal(fr.mark, "line");
  assert.equal(fr.primitives[0].points.length, N);
  // x = tBar[seg][grounded], y = F_r[seg][grounded]
  for (const s of [0, 5, 12, 20]) {
    const pt = fr.primitives[0].points[s];
    assert.equal(pt.x, evaluated.fields.tBar.data[s][g]);
    assert.equal(pt.y, evaluated.fields.F_r.data[s][g]);
  }
  assert.equal(plan.layers.find(l => l.name === "fres").primitives[0].points[8].y,
    evaluated.fields.F_resultant.data[8][g]);
});

test("MillForceRose plans a polar polygon of resultant magnitude", async () => {
  const { evaluated, g, N } = await setup();
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceRose");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.frame, "polar");
  assert.ok(plan.maxRadius > 0);
  assert.ok(plan.scales.r.domain[1] > 0);
  const rose = plan.layers.find(l => l.name === "rose");
  assert.equal(rose.mark, "polygon");
  assert.equal(rose.closed, true);
  assert.equal(rose.primitives[0].points.length, N);
  for (const s of [0, 7, 15]) {
    const pt = rose.primitives[0].points[s];
    assert.equal(pt.theta, evaluated.fields.tBar.data[s][g]);
    assert.equal(pt.r, evaluated.fields.F_resultant.data[s][g]);
  }
});

test("MillForceCross plans per-segment polar wedges with angular bounds + force value", async () => {
  const { evaluated, g, N } = await setup();
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceCross");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.frame, "polar");
  const liners = plan.layers.find(l => l.name === "liners");
  assert.equal(liners.mark, "wedge");
  assert.equal(liners.primitives.length, N);
  for (const s of [0, 10, 19]) {
    const w = liners.primitives[s];
    assert.equal(w.theta0, evaluated.fields.t1.data[s]);       // t1 is over `segment` only (method-independent)
    assert.equal(w.theta1, evaluated.fields.t2.data[s][g]);    // t2 depends on gamma → method-dependent
    assert.equal(w.value, evaluated.fields.F_resultant.data[s][g]);
  }
});

test("MillForce charts bind authored shell inputs into chart params", async () => {
  for (const chartName of ["MillForceCross", "MillForceAngle", "MillForceRose"]) {
    const view = await loadBody("views/mill-force.rvm", "surface", chartName);
    const boundProps = new Set(view.bindings.map(binding => binding.prop));
    for (const prop of [
      "param.percent_crit",
      "param.mu",
      "param.radius",
      "param.beta_prime_deg",
      "param.N_segments",
      "param.J_total",
      "param.J_balls",
      "param.J_voids",
      "param.percent_solids",
      "param.rho_ball",
      "param.rho_ore",
      "param.depth",
      "param.m_liner",
      "param.height"
    ]) {
      assert.equal(boundProps.has(prop), true, `${chartName} missing ${prop}`);
    }
  }
});
