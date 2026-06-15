import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { millChargeKernels } from "../examples/engentus/app/chart-functions/mill-charge-kernels.js";
import { planChart } from "../plugins/chart-runtime/gog-runtime.js";

const appDir = path.join(process.cwd(), "examples", "engentus", "app");

async function loadBody(file, kind, name) {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
  const node = desire.nodes.find(n => n.kind === kind && n.name === name);
  assert.ok(node, `${kind} ${name} not found in ${file}`);
  return node.body;
}

async function setup() {
  const model = await loadBody("models/mill-charge.rvm", "dataflow", "MillCharge");
  const evaluated = evaluateModel(model, { functions: millChargeKernels });
  return { evaluated };
}

test("MillChargeCrossSection plans a disc frame with charge polygon + COM + particle frames", async () => {
  const { evaluated } = await setup();
  const view = await loadBody("views/mill-charge.rvm", "surface", "MillChargeCrossSection");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.frame, "disc");
  assert.ok(plan.scale > 0);
  assert.equal(plan.discRadius, evaluated.params.millRadius); // shell radius from enc.r

  // charge region: a closed polygon over the arc axis, matching bx/by
  const charge = plan.layers.find(l => l.name === "charge");
  assert.equal(charge.mark, "polygon");
  assert.equal(charge.closed, true);
  assert.equal(charge.fill, "#7c2a1a");
  assert.equal(charge.stroke, "#c94020");
  const nArc = evaluated.axes.arc.values.length; // N_arc + 1
  assert.equal(charge.primitives[0].points.length, nArc);
  for (const a of [0, 20, nArc - 1]) {
    const pt = charge.primitives[0].points[a];
    assert.equal(pt.x, evaluated.fields.bx.data[a]);
    assert.equal(pt.y, evaluated.fields.by.data[a]);
  }

  // centre of mass: a scalar point
  const com = plan.layers.find(l => l.name === "com");
  assert.equal(com.mark, "point");
  assert.equal(com.primitives[0].x, evaluated.fields.comX.data);
  assert.equal(com.primitives[0].y, evaluated.fields.comY.data);

  const lifters = plan.layers.find(l => l.name === "lifters");
  assert.equal(lifters.mark, "lifters");
  assert.equal(lifters.count, 10);

  const shoulder = plan.layers.find(l => l.name === "shoulder");
  assert.equal(shoulder.mark, "radial-line");
  assert.equal(shoulder.dash, true);
  assert.equal(shoulder.label, "S");
  assert.equal(shoulder.primitives[0].theta, evaluated.fields.phiS.data);

  const toe = plan.layers.find(l => l.name === "toe");
  assert.equal(toe.mark, "radial-line");
  assert.equal(toe.dash, true);
  assert.equal(toe.label, "T");
  assert.equal(toe.primitives[0].theta, evaluated.fields.phiT.data);
});

test("the particles layer emits one frame per time step over the (particle, t) product", async () => {
  const { evaluated } = await setup();
  const view = await loadBody("views/mill-charge.rvm", "surface", "MillChargeCrossSection");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  const fall = plan.layers.find(l => l.name === "fall");
  assert.equal(fall.mark, "particles");
  assert.equal(fall.animAxis, "t");
  assert.equal(fall.stroke, "#f87171");

  const tVals = evaluated.axes.t.values;
  const nPart = evaluated.axes.particle.values.length;
  assert.equal(fall.frames.length, tVals.length);     // one frame per time step
  assert.equal(fall.frames[0].points.length, nPart);  // one point per particle

  // a sampled frame's points equal px/py at that time slice
  for (const k of [0, 5, tVals.length - 1]) {
    assert.equal(fall.frames[k].t, tVals[k]);
    for (const i of [0, 7, nPart - 1]) {
      assert.equal(fall.frames[k].points[i].x, evaluated.fields.px.data[i][k]);
      assert.equal(fall.frames[k].points[i].y, evaluated.fields.py.data[i][k]);
    }
  }
});
