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

// ── M3: the GoG runtime turns the IR chart + evaluated model into a render plan ──
// Pure geometry, node-testable — no browser. Proves forms → IR → eval → chart
// plan end to end. The browser step (drawChart) is a thin D3 paint of this plan.

async function loadBody(file, kind, name) {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(
    path.join(process.cwd(), "examples", "engentus", "app", file)
  ));
  const node = desire.nodes.find(n => n.kind === kind && n.name === name);
  assert.ok(node, `${kind} ${name} not found in ${file}`);
  return node.body;
}

test("planChart turns the Goodman chart + model into a faithful render plan", async () => {
  const modelBody = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigue");
  const viewBody = await loadBody("views/goodman.rvm", "surface", "GoodmanDiagram");
  const evaluated = evaluateModel(modelBody, { functions: goodmanFunctions });
  const plan = planChart(viewBody, evaluated, { width: 800, height: 520 });

  // frame + scales
  assert.equal(plan.frame, "cartesian");
  assert.deepEqual(plan.scales.x.domain, [0, 650]);
  assert.equal(plan.scales.x.label, "Mean stress σm (MPa)");
  assert.equal(plan.scales.y.domain[0], 0);
  assert.ok(plan.scales.y.domain[1] > 0);
  assert.deepEqual(viewBody.bindings.map(binding => binding.prop), [
    "visible",
    "presentation.showGrid",
    "presentation.showAnnotations",
    "presentation.pointSize",
    "param.F_alt_applied_N",
    "param.rpm",
    "param.sigma_lim",
    "param.m_slope",
    "param.probe_sm"
  ]);
  assert.equal(plan.presentation.showGrid, true);
  assert.equal(plan.presentation.showAnnotations, true);
  assert.equal(plan.presentation.pointSize, 4);

  const layer = name => plan.layers.find(l => l.name === name);
  const sm = evaluated.axes.sm.values;

  // bands: one area per lifetime (3), each spanning the full sm sweep, y1 = band data
  const bands = layer("bands");
  assert.equal(bands.mark, "area");
  assert.equal(bands.primitives.length, evaluated.axes.lifetime.values.length);
  for (const prim of bands.primitives) assert.equal(prim.points.length, sm.length);
  // a band primitive's y1 matches the evaluated band tensor (primitives are reversed,
  // so the longest-life category is at index 0)
  const lastCat = bands.primitives[bands.primitives.length - 1]; // lifetime index 0
  assert.equal(lastCat.points[60].y1, evaluated.fields.band.data[60][0]);

  // curves: a single polyline over sm tracking the bolt response
  const curves = layer("curves");
  assert.equal(curves.mark, "line");
  assert.equal(curves.primitives[0].points.length, sm.length);
  assert.equal(curves.primitives[0].points[120].y, evaluated.fields.curve.data[120]);

  // slip: a vertical rule at the scalar slip threshold
  const slip = layer("slip");
  assert.equal(slip.mark, "rule");
  assert.equal(slip.primitives[0].x, evaluated.fields.slip.data);

  // yield: a polyline (y = ys - sm)
  assert.equal(layer("yield").mark, "line");
  assert.equal(layer("yield").primitives[0].points[100].y, evaluated.fields.yield_line.data[100]);

  // probe: a vertical rule at the probe_sm param
  const probe = layer("probe");
  assert.equal(probe.mark, "rule");
  assert.equal(probe.primitives[0].x, evaluated.params.probe_sm);
});

test("Goodman Monte Carlo chart binds authored run config into the ensemble model", async () => {
  const view = await loadBody("views/goodman.rvm", "surface", "GoodmanMCBands");
  const model = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigueMC");
  const boundProps = new Set(view.bindings.map(binding => binding.prop));
  assert.equal(boundProps.has("param.n_samples"), true);
  assert.equal(view.bindings.find(binding => binding.prop === "param.n_samples")?.source?.state, "GoodmanRunBoltsPerSet");

  const evaluated = evaluateModel(model, {
    functions: { ...goodmanFunctions, ...samplingFunctions },
    params: { n_samples: 24 }
  });
  assert.equal(evaluated.axes.sample.values.length, 24);
  assert.equal(evaluated.fields.sa_p50.axes.includes("sample"), false);
  assert.equal(evaluated.fields.sa_p50.axes.includes("sm"), true);
});
