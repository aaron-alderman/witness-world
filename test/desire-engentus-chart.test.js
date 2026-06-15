import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { goodmanFunctions } from "../examples/engentus/app/chart-functions/goodman-stdlib.js";
import { millForceKernels } from "../examples/engentus/app/chart-functions/mill-force-kernels.js";
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
  const evaluated = evaluateModel(modelBody, { functions: { ...goodmanFunctions, ...samplingFunctions } });
  const plan = planChart(viewBody, evaluated, { width: 800, height: 520 });
  assert.equal(evaluated.fields.probe_mean_stress_text.data, "300.0 MPa");
  assert.equal(evaluated.fields.probe_alt_stress_text.data, `${evaluated.fields.curve_probe.data.toFixed(1)} MPa`);
  assert.equal(evaluated.fields.probe_shear_text.data, `${Math.round(evaluated.fields.probe_F_shear.data).toLocaleString("en-US")} N`);
  assert.match(evaluated.fields.probe_damage_text.data, /\/ 1M cycles$/);
  assert.equal(evaluated.fields.slip_threshold_text.data, `${evaluated.fields.slip.data.toFixed(1)} MPa`);

  // frame + scales
  assert.equal(plan.frame, "cartesian");
  assert.deepEqual(plan.scales.x.domain, [0, 650]);
  assert.equal(plan.scales.x.label, "Mean stress σm (MPa)");
  assert.equal(plan.scales.y.domain[0], 0);
  assert.ok(plan.scales.y.domain[1] > 0);
  assert.deepEqual(viewBody.bindings.map(binding => binding.prop), [
    "visible",
    "presentation.title",
    "presentation.xLabel",
    "presentation.yLabel",
    "presentation.titleSize",
    "presentation.axisSize",
    "presentation.showGrid",
    "presentation.showAnnotations",
    "presentation.pointSize",
    "presentation.bandFills.0",
    "presentation.bandFills.1",
    "presentation.bandFills.2",
    "presentation.bandFills.3",
    "param.F_alt_applied_N",
    "param.rpm",
    "param.sigma_lim",
    "param.m_slope",
    "param.probe_sm",
    "param.uts",
    "param.ys"
  ]);
  assert.equal(plan.presentation.showGrid, true);
  assert.equal(plan.presentation.showAnnotations, true);
  assert.equal(plan.presentation.pointSize, 4);

  const layer = name => plan.layers.find(l => l.name === name);
  const sm = evaluated.axes.sm.values;
  assert.equal(evaluated.axes.cloud_sample.values.length, 120);

  // bands: four reference background zones between Goodman curves/yield boundary.
  const bands = layer("bands");
  assert.equal(bands.mark, "band");
  assert.equal(bands.primitives.length, evaluated.axes.band_zone.values.length);
  for (const prim of bands.primitives) assert.equal(prim.points.length, sm.length);
  assert.deepEqual(bands.primitives.map(primitive => primitive.category), [0, 1, 2, 3]);
  assert.deepEqual(bands.primitives.map(primitive => primitive.fill), ["#bbf7d0", "#d9f99d", "#fef08a", "#fde68a"]);
  assert.equal(bands.primitives[0].points[60].y0, evaluated.fields.band_zone_y0.data[60][0]);
  assert.equal(bands.primitives[0].points[60].y1, evaluated.fields.band_zone_y1.data[60][0]);
  assert.equal(bands.primitives[3].points[60].y1, evaluated.fields.yield_line.data[60]);
  const cloud = layer("cloud");
  assert.equal(cloud.mark, "point");
  assert.equal(cloud.primitives.length, 120);
  assert.equal(cloud.primitives[0].x, evaluated.fields.cloud_sigma_m.data[0]);
  assert.equal(cloud.primitives[0].y, evaluated.fields.cloud_sigma_a.data[0]);
  assert.equal(cloud.fill, "#dc2626");
  assert.equal(cloud.size, 2.4);
  const cloudJemtec = layer("cloud_jemtec");
  assert.equal(cloudJemtec.primitives.length, 120);
  assert.equal(cloudJemtec.primitives[0].y, evaluated.fields.cloud_sigma_a_jemtec.data[0]);
  assert.equal(cloudJemtec.fill, "#8CC4D4");

  // curves: the two reference bolt-set responses, No Jemtec and Jemtec.
  const curves = layer("curves");
  assert.equal(curves.mark, "line");
  assert.equal(curves.stroke, "#dc2626");
  assert.equal(curves.primitives[0].points.length, sm.length);
  assert.equal(curves.primitives[0].points[120].y, evaluated.fields.curve.data[120]);
  assert.equal(curves.primitives[0].points[120].tooltip.sigma_m_MPa, sm[120]);
  assert.equal(curves.primitives[0].points[120].tooltip.sigma_a_MPa, evaluated.fields.curve.data[120]);
  assert.equal(curves.primitives[0].points[120].tooltip.F_shear_N, evaluated.fields.F_shear.data[120]);
  assert.equal(
    curves.primitives[0].points[120].tooltip.damage_per_cycle_x10_6,
    evaluated.fields.damage_per_million.data[120]
  );
  const curveJemtec = layer("curve_jemtec");
  assert.equal(curveJemtec.mark, "line");
  assert.equal(curveJemtec.stroke, "#8CC4D4");
  assert.equal(curveJemtec.primitives[0].points.length, sm.length);
  assert.equal(curveJemtec.primitives[0].points[120].y, evaluated.fields.curve_jemtec.data[120]);
  assert.equal(
    curveJemtec.primitives[0].points[120].tooltip.F_shear_N,
    evaluated.fields.F_shear_jemtec.data[120]
  );
  assert.equal(
    curveJemtec.primitives[0].points[120].tooltip.damage_per_cycle_x10_6,
    evaluated.fields.damage_per_million_jemtec.data[120]
  );
  assert.ok(
    evaluated.fields.curve_jemtec.data[120] < evaluated.fields.curve.data[120],
    "Jemtec copper spring should reduce the loaded bolt response"
  );

  // dashed Goodman guide lines: one category-split guide per authored lifetime boundary
  const glines = layer("glines");
  assert.equal(glines.mark, "line");
  assert.equal(glines.dash, true);
  assert.equal(glines.width, 1.2);
  assert.equal(glines.opacity, 0.9);
  assert.equal(glines.primitives.length, evaluated.axes.lifetime.values.length);
  assert.deepEqual(glines.primitives.map(primitive => primitive.category), evaluated.axes.lifetime.values);
  assert.equal(glines.primitives[1].points[80].y, evaluated.fields.band.data[80][1]);

  // slip: a vertical rule at the scalar slip threshold
  const slip = layer("slip");
  assert.equal(slip.mark, "rule");
  assert.equal(slip.primitives[0].x, evaluated.fields.slip.data);
  assert.ok(evaluated.fields.slip.data > 0 && evaluated.fields.slip.data < 650);
  const slipLabel = layer("slip_label");
  assert.equal(slipLabel.mark, "text");
  assert.equal(slipLabel.fill, "#475569");
  assert.equal(slipLabel.size, 9);
  assert.equal(slipLabel.opacity, 0.7);
  assert.deepEqual(slipLabel.primitives, [{
    x: evaluated.fields.slip_label_x.data,
    y: evaluated.fields.slip_label_y.data,
    label: "▲slip"
  }]);

  // yield: a polyline (y = ys - sm) with the reference dashed purple style
  assert.equal(layer("yield").stroke, "#7c3aed");
  assert.equal(layer("yield").width, 1.5);
  assert.equal(layer("yield").dash, true);
  assert.equal(layer("yield").mark, "line");
  assert.equal(layer("yield").primitives[0].points[100].y, evaluated.fields.yield_line.data[100]);
  const yieldLabel = layer("yield_label");
  assert.equal(yieldLabel.mark, "text");
  assert.equal(yieldLabel.fill, "#7c3aed");
  assert.equal(yieldLabel.size, 9.5);
  assert.equal(yieldLabel.opacity, 0.7);
  assert.deepEqual(yieldLabel.primitives, [{
    x: evaluated.fields.yield_label_x.data,
    y: evaluated.fields.yield_label_y.data,
    label: "Yield boundary"
  }]);

  // probe: a vertical rule at the probe_sm param
  const probe = layer("probe");
  assert.equal(probe.mark, "rule");
  assert.equal(probe.stroke, "#475569");
  assert.equal(probe.opacity, 0.5);
  assert.equal(probe.primitives[0].x, evaluated.params.probe_sm);
  const probePoint = layer("probe_point");
  assert.equal(probePoint.mark, "point");
  assert.equal(probePoint.size, 5.5);
  assert.equal(probePoint.fill, "#dc2626");
  assert.equal(probePoint.stroke, "#ffffff");
  assert.deepEqual(probePoint.primitives, [{
    x: evaluated.params.probe_sm,
    y: evaluated.fields.curve_probe.data
  }]);
  const curveLabel = layer("curve_label");
  assert.equal(curveLabel.mark, "text");
  assert.equal(curveLabel.fill, "#dc2626");
  assert.deepEqual(curveLabel.primitives, [{
    x: evaluated.fields.curve_label_x.data,
    y: evaluated.fields.curve_label_y.data,
    label: "No Jemtec"
  }]);
  const curveJemtecLabel = layer("curve_label_jemtec");
  assert.equal(curveJemtecLabel.mark, "text");
  assert.equal(curveJemtecLabel.fill, "#8CC4D4");
  assert.deepEqual(curveJemtecLabel.primitives, [{
    x: evaluated.fields.curve_label_jemtec_x.data,
    y: evaluated.fields.curve_label_jemtec_y.data,
    label: "Jemtec"
  }]);
});

test("Goodman shell binds static readout rows to deterministic chart capability outputs", async () => {
  const shell = await loadBody("shell.rvm", "surface", "GoodmanScenarioProbeValue");
  assert.deepEqual(shell.bindings, [{
    prop: "text",
    source: { kind: "capability", surface: "GoodmanDiagram", output: "probe_shear_text" }
  }]);

  const mean = await loadBody("shell.rvm", "surface", "GoodmanScenarioMeanStressValue");
  assert.deepEqual(mean.bindings, [{
    prop: "text",
    source: { kind: "capability", surface: "GoodmanDiagram", output: "probe_mean_stress_text" }
  }]);

  const alt = await loadBody("shell.rvm", "surface", "GoodmanScenarioAltStressValue");
  assert.deepEqual(alt.bindings, [{
    prop: "text",
    source: { kind: "capability", surface: "GoodmanDiagram", output: "probe_alt_stress_text" }
  }]);

  const slip = await loadBody("shell.rvm", "surface", "GoodmanScenarioSlipValue");
  assert.deepEqual(slip.bindings, [{
    prop: "text",
    source: { kind: "capability", surface: "GoodmanDiagram", output: "slip_threshold_text" }
  }]);
});

test("Goodman Monte Carlo chart binds authored run config into the ensemble model", async () => {
  const view = await loadBody("views/goodman.rvm", "surface", "GoodmanMCBands");
  const model = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigueMC");
  const boundProps = new Set(view.bindings.map(binding => binding.prop));
  assert.equal(boundProps.has("param.n_samples"), true);
  assert.equal(view.bindings.find(binding => binding.prop === "param.n_samples")?.source?.state, "GoodmanRunBoltsPerSet");
  assert.equal(view.bindings.find(binding => binding.prop === "presentation.title")?.source?.state, "GoodmanChartTitle");
  assert.equal(view.bindings.find(binding => binding.prop === "presentation.bandFills.0")?.source?.state, "GoodmanChartBandFill1");
  assert.equal(view.bindings.find(binding => binding.prop === "param.uts")?.source?.state, "GoodmanBoltPrimaryUts");
  assert.equal(view.bindings.find(binding => binding.prop === "param.ys")?.source?.state, "GoodmanBoltPrimaryYieldStress");

  const evaluated = evaluateModel(model, {
    functions: { ...goodmanFunctions, ...samplingFunctions },
    params: { n_samples: 24 }
  });
  const plan = planChart(view, evaluated, { width: 800, height: 520 });
  const layer = name => plan.layers.find(candidate => candidate.name === name);
  assert.equal(evaluated.axes.sample.values.length, 24);
  assert.equal(evaluated.fields.sa_p50.axes.includes("sample"), false);
  assert.equal(evaluated.fields.sa_p50.axes.includes("sm"), true);
  assert.equal(layer("cloud"), undefined);
  assert.equal(layer("band").mark, "band");
  assert.equal(layer("band").primitives[0].points[25].y0, evaluated.fields.sa_p10.data[25]);
  assert.equal(layer("band").primitives[0].points[25].y1, evaluated.fields.sa_p90.data[25]);
  assert.equal(layer("med").mark, "line");
  assert.equal(layer("med").primitives[0].points[25].y, evaluated.fields.sa_p50.data[25]);
});

test("Mill Force chart plans preserve authored kN lines and reference chrome", async () => {
  const modelBody = await loadBody("models/mill-force.rvm", "dataflow", "MillForce");
  const angleBody = await loadBody("views/mill-force.rvm", "surface", "MillForceAngle");
  const roseBody = await loadBody("views/mill-force.rvm", "surface", "MillForceRose");
  const evaluated = evaluateModel(modelBody, { functions: millForceKernels });
  const anglePlan = planChart(angleBody, evaluated, { width: 800, height: 520 });
  const rosePlan = planChart(roseBody, evaluated, { width: 520, height: 520 });
  const angleLayer = name => anglePlan.layers.find(layer => layer.name === name);
  const roseLayer = name => rosePlan.layers.find(layer => layer.name === name);

  assert.deepEqual(anglePlan.scales.x.domain, [0, 360]);
  assert.equal(anglePlan.scales.x.label, "θ (°, standard - 0° = East)");
  assert.equal(anglePlan.scales.y.label, "Force (kN)");
  const radialPoints = angleLayer("fr").primitives[0].points;
  assert.deepEqual(
    radialPoints.map(point => point.x),
    radialPoints.map(point => point.x).slice().sort((a, b) => a - b)
  );
  assert.equal(radialPoints[0].x, Math.min(...evaluated.fields.display_angle_deg.data));
  assert.equal(radialPoints[0].y, evaluated.fields.F_r_kN.data[
    evaluated.fields.display_angle_deg.data.indexOf(radialPoints[0].x)
  ][1]);
  assert.equal(angleLayer("ft").stroke, "#475569");
  assert.equal(angleLayer("fres").stroke, "#f1f5f9");
  assert.equal(angleLayer("charge_zone").mark, "x-band");
  assert.deepEqual(angleLayer("charge_zone").primitives, [{
    x0: evaluated.fields.charge_zone_x0.data,
    x1: evaluated.fields.charge_zone_x1.data
  }]);
  assert.equal(angleLayer("zero_line").mark, "h-rule");
  assert.deepEqual(angleLayer("zero_line").primitives, [{ y: 0 }]);
  assert.deepEqual(angleLayer("legend_fr_label").primitives, [{ x: 704, y: 15, label: "Radial" }]);
  assert.deepEqual(angleLayer("legend_ft_label").primitives, [{ x: 704, y: 35, label: "Tangential" }]);
  assert.deepEqual(angleLayer("legend_resultant_label").primitives, [{ x: 704, y: 55, label: "Resultant" }]);
  assert.deepEqual(roseLayer("title").primitives, [{ x: 260, y: 22, label: "Resultant Force Rose (per liner)" }]);
  assert.equal(
    evaluated.fields.mc_p90_len.data[0],
    Math.abs(evaluated.fields.F_r_p90.data[0]) / Math.max(evaluated.fields.F_r_abs_max_all.data, 1)
      * evaluated.fields.mc_bar_max_len.data
  );
  assert.equal(
    evaluated.fields.mc_p10_len.data[0],
    Math.abs(evaluated.fields.F_r_p10.data[0]) / Math.max(evaluated.fields.F_r_abs_max_all.data, 1)
      * evaluated.fields.mc_bar_max_len.data
  );
});
