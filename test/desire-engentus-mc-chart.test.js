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
import { planChart } from "../plugins/chart-runtime/gog-runtime.js";

const appDir = path.join(process.cwd(), "examples", "engentus", "app");
const FNS = { ...goodmanFunctions, ...samplingFunctions };

async function loadBody(file, kind, name) {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
  const node = desire.nodes.find(n => n.kind === kind && n.name === name);
  assert.ok(node, `${kind} ${name} not found in ${file}`);
  return node.body;
}

async function setup() {
  const model = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigueMC");
  const evaluated = evaluateModel(model, { functions: FNS });
  const view = await loadBody("views/goodman.rvm", "surface", "GoodmanMCBands");
  return { evaluated, plan: planChart(view, evaluated, { width: 800, height: 520 }) };
}

test("GoodmanMCBands plans a band between p10 and p90 over sm", async () => {
  const { evaluated, plan } = await setup();
  assert.equal(plan.frame, "cartesian");
  const band = plan.layers.find(l => l.name === "band");
  assert.equal(band.mark, "band");
  const N = evaluated.axes.sm.values.length;
  assert.equal(band.primitives[0].points.length, N);
  for (const i of [0, 50, N - 1]) {
    const pt = band.primitives[0].points[i];
    assert.equal(pt.x, evaluated.axes.sm.values[i]);
    assert.equal(pt.y0, evaluated.fields.sa_p10.data[i]);
    assert.equal(pt.y1, evaluated.fields.sa_p90.data[i]);
  }
  // y-axis auto-fits above the band's upper edge
  const maxP90 = Math.max(...evaluated.fields.sa_p90.data);
  assert.ok(plan.scales.y.domain[1] >= maxP90);
});

test("the median line tracks p50", async () => {
  const { evaluated, plan } = await setup();
  const med = plan.layers.find(l => l.name === "med");
  assert.equal(med.mark, "line");
  for (const i of [0, 64, 200]) {
    assert.equal(med.primitives[0].points[i].y, evaluated.fields.sa_p50.data[i]);
  }
});

test("the cloud emits one polyline per sample, each tracing curve_s over sm", async () => {
  const { evaluated, plan } = await setup();
  const cloud = plan.layers.find(l => l.name === "cloud");
  assert.equal(cloud.mark, "cloud");
  const nSamples = evaluated.axes.sample.values.length;
  const N = evaluated.axes.sm.values.length;
  assert.equal(cloud.primitives.length, nSamples);
  assert.equal(cloud.primitives[0].points.length, N);
  // sample s, mean-stress i → curve_s[i][s]
  for (const s of [0, 10, nSamples - 1]) {
    for (const i of [0, 90]) {
      assert.equal(cloud.primitives[s].points[i].x, evaluated.axes.sm.values[i]);
      assert.equal(cloud.primitives[s].points[i].y, evaluated.fields.curve_s.data[i][s]);
    }
  }
});
