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
  const f = evaluated.axes.method.values.indexOf("faithful");
  const N = evaluated.axes.segment.values.length;
  return { model, evaluated, g, f, N };
}

function pointAtX(points, x) {
  const point = points.find(candidate => candidate.x === x);
  assert.ok(point, `point for x=${x} not found`);
  return point;
}

test("MillForceAngle plans cartesian lines over segment angle, sliced to active model", async () => {
  const { evaluated, g, N } = await setup();
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceAngle");
  const plan = planChart(view, evaluated, { width: 800, height: 520 });

  assert.equal(plan.frame, "cartesian");
  assert.equal(plan.scales.x.label, "θ (°, standard - 0° = East)");
  assert.deepEqual(plan.scales.x.domain, [0, 360]);
  const fr = plan.layers.find(l => l.name === "fr");
  const chargeZone = plan.layers.find(l => l.name === "charge_zone");
  const zeroLine = plan.layers.find(l => l.name === "zero_line");
  assert.equal(chargeZone.mark, "x-band");
  assert.equal(chargeZone.fill, "#DCF0F5");
  assert.equal(chargeZone.opacity, 0.12);
  assert.deepEqual(chargeZone.primitives, [{
    x0: evaluated.fields.charge_zone_x0.data,
    x1: evaluated.fields.charge_zone_x1.data
  }]);
  assert.equal(zeroLine.mark, "h-rule");
  assert.equal(zeroLine.stroke, "#475569");
  assert.equal(zeroLine.width, 0.5);
  assert.equal(zeroLine.dash, true);
  assert.deepEqual(zeroLine.primitives, [{ y: 0 }]);
  assert.equal(fr.mark, "line");
  assert.equal(fr.primitives[0].points.length, N);
  // x = reference display degrees, y = force in kN.
  for (const s of [0, 5, 12, 20]) {
    const pt = pointAtX(fr.primitives[0].points, evaluated.fields.display_angle_deg.data[s]);
    assert.equal(pt.y, evaluated.fields.F_r_kN.data[s][g]);
  }
  assert.equal(
    pointAtX(
      plan.layers.find(l => l.name === "fres").primitives[0].points,
      evaluated.fields.display_angle_deg.data[8]
    ).y,
    evaluated.fields.F_resultant_kN.data[8][g]
  );
});

test("MillForce charts can slice faithful data through an authored chart param", async () => {
  const { model, f } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: { active_method: "faithful" }
  });
  const angle = await loadBody("views/mill-force.rvm", "surface", "MillForceAngle");
  const rose = await loadBody("views/mill-force.rvm", "surface", "MillForceRose");
  const cross = await loadBody("views/mill-force.rvm", "surface", "MillForceCross");

  assert.equal(evaluated.params.active_method, "faithful");

  const anglePlan = planChart(angle, evaluated, { width: 800, height: 520 });
  assert.equal(
    pointAtX(
      anglePlan.layers.find(l => l.name === "fres").primitives[0].points,
      evaluated.fields.display_angle_deg.data[8]
    ).y,
    evaluated.fields.F_resultant_kN.data[8][f]
  );

  const rosePlan = planChart(rose, evaluated, { width: 600, height: 600 });
  assert.equal(
    rosePlan.layers.find(l => l.name === "rose").primitives[0].points[7].r,
    evaluated.fields.F_resultant.data[7][f]
  );

  const crossPlan = planChart(cross, evaluated, { width: 600, height: 600 });
  assert.equal(
    crossPlan.layers.find(l => l.name === "liners").primitives[10].theta1,
    evaluated.fields.t2.data[10][f]
  );
});

test("MillForce model authors sidebar result readouts as active-method scalar outputs", async () => {
  const { model, g, f } = await setup();
  const grounded = evaluateModel(model, {
    functions: millForceKernels,
    params: { active_method: "grounded" }
  });
  const faithful = evaluateModel(model, {
    functions: millForceKernels,
    params: { active_method: "faithful" }
  });

  assert.equal(grounded.fields.gammaText.axes.length, 0);
  assert.equal(grounded.fields.phiPrimeText.axes.length, 0);
  assert.equal(grounded.fields.F_r_max_text.axes.length, 0);
  assert.equal(grounded.fields.F_resultant_max_text.axes.length, 0);
  assert.equal(grounded.fields.gammaDeltaText.axes.length, 0);
  assert.equal(grounded.fields.phiPrimeDeltaText.axes.length, 0);
  assert.equal(grounded.fields.gammaDeltaPercentText.axes.length, 0);
  assert.equal(grounded.fields.phiPrimeDeltaPercentText.axes.length, 0);
  assert.equal(grounded.fields.F_r_max_delta_text.axes.length, 0);
  assert.equal(grounded.fields.F_resultant_max_delta_text.axes.length, 0);
  assert.equal(grounded.fields.F_resultant_scale_max_text.axes.length, 0);
  assert.equal(grounded.fields.F_resultant_scale_min_text.axes.length, 0);
  assert.equal(grounded.fields.F_resultant_scale_title.axes.length, 0);
  assert.equal(
    grounded.fields.gammaActive.data,
    grounded.fields.gamma.data[g]
  );
  assert.equal(
    faithful.fields.gammaActive.data,
    faithful.fields.gamma.data[f]
  );
  assert.equal(
    grounded.fields.F_resultant_max_active.data,
    Math.max(...grounded.fields.F_resultant.data.map(row => row[g]))
  );
  assert.equal(grounded.fields.phiText.data, "9.3°");
  assert.equal(grounded.fields.phiPrimeText.data, "226.6°");
  assert.match(grounded.fields.phiText.data, /°$/);
  assert.equal(grounded.fields.gammaText.data, `${grounded.fields.gammaActive.data.toFixed(1)}°`);
  assert.match(grounded.fields.omegaText.data, / rad\/s$/);
  assert.match(grounded.fields.rhoChargeText.data, / SG$/);
  assert.match(grounded.fields.F_r_max_text.data, / kN$/);
  assert.match(grounded.fields.F_resultant_scale_max_text.data, /^\d+ kN$/);
  assert.match(grounded.fields.F_resultant_scale_min_text.data, /^\d+ kN$/);
  assert.equal(grounded.fields.F_resultant_scale_title.data, "|F|");
  assert.match(grounded.fields.gammaDeltaText.data, /^[+-]?\d+\.\d(?:Â°|°)$/);
  assert.match(grounded.fields.gammaDeltaPercentText.data, /^[+-]?\d+\.\d\d%$/);
  assert.match(grounded.fields.F_resultant_max_delta_text.data, /^[+-]?\d+\.\d kN$/);
});

test("MillForceCross compare mode keeps the oracle grounded shell and overlays dual model force bars", async () => {
  const { model } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: {
      active_method: "grounded",
      analysis_mode: "compare"
    }
  });
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceCross");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.layers.find(l => l.name === "liners").hidden, true);
  assert.equal(plan.layers.find(l => l.name === "grounded_liners").hidden, undefined);
  assert.equal(plan.layers.find(l => l.name === "faithful_force_bars").hidden, undefined);
  assert.equal(plan.layers.find(l => l.name === "grounded_force_bars").hidden, undefined);
  assert.equal(plan.layers.find(l => l.name === "grounded_liners").primitives[0].r0, evaluated.fields.rInner.data);
  assert.equal(plan.layers.find(l => l.name === "grounded_liners").primitives[0].r1, evaluated.params.radius);
});

test("MillForceAngle compare mode renders grounded and faithful layer pairs", async () => {
  const { model, g, f, N } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: {
      active_method: "grounded",
      analysis_mode: "compare"
    }
  });
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceAngle");
  const plan = planChart(view, evaluated, { width: 800, height: 520 });

  assert.equal(plan.layers.find(l => l.name === "fres").hidden, true);
  const grounded = plan.layers.find(l => l.name === "grounded_fres");
  const faithful = plan.layers.find(l => l.name === "faithful_fres");
  assert.equal(grounded.hidden, undefined);
  assert.equal(faithful.hidden, undefined);
  assert.equal(grounded.primitives[0].points.length, N);
  assert.equal(faithful.primitives[0].points.length, N);
  assert.equal(
    pointAtX(grounded.primitives[0].points, evaluated.fields.display_angle_deg.data[8]).y,
    evaluated.fields.F_resultant_kN.data[8][g]
  );
  assert.equal(
    pointAtX(faithful.primitives[0].points, evaluated.fields.display_angle_deg.data[8]).y,
    evaluated.fields.F_resultant_kN.data[8][f]
  );
});

test("MillForceRose compare mode renders both model traces", async () => {
  const { model, g, f, N } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: {
      active_method: "grounded",
      analysis_mode: "compare"
    }
  });
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceRose");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.layers.find(l => l.name === "rose").hidden, true);
  const grounded = plan.layers.find(l => l.name === "grounded_rose");
  const faithful = plan.layers.find(l => l.name === "faithful_rose");
  assert.equal(grounded.primitives[0].points.length, N);
  assert.equal(faithful.primitives[0].points.length, N);
  assert.equal(grounded.primitives[0].points[7].r, evaluated.fields.F_resultant.data[7][g]);
  assert.equal(faithful.primitives[0].points[7].r, evaluated.fields.F_resultant.data[7][f]);
});

test("MillForce compare layers stay hidden outside compare mode", async () => {
  const { model, g } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: {
      active_method: "grounded",
      analysis_mode: "static"
    }
  });
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceAngle");
  const plan = planChart(view, evaluated, { width: 800, height: 520 });

  assert.equal(plan.layers.find(l => l.name === "grounded_fres").hidden, true);
  assert.equal(plan.layers.find(l => l.name === "faithful_fres").hidden, true);
  assert.equal(
    pointAtX(
      plan.layers.find(l => l.name === "fres").primitives[0].points,
      evaluated.fields.display_angle_deg.data[8]
    ).y,
    evaluated.fields.F_resultant_kN.data[8][g]
  );
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

test("MillForceCross plans per-segment annular liner bands with angular bounds + force value", async () => {
  const { evaluated, g, N } = await setup();
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceCross");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.frame, "polar");
  assert.equal(plan.scales.r.field, "radius");
  assert.equal(plan.scales.r.domain[1], evaluated.params.radius);
  assert.equal(plan.layers.find(l => l.name === "shell").mark, "circle");
  assert.equal(plan.layers.find(l => l.name === "shell").primitives[0].r, evaluated.params.radius);
  assert.equal(plan.layers.find(l => l.name === "inner").primitives[0].r, evaluated.fields.rInner.data);
  const chargeRegion = plan.layers.find(l => l.name === "charge_region");
  assert.equal(chargeRegion.mark, "annular-wedge");
  assert.equal(chargeRegion.fill, "#DCF0F5");
  assert.equal(chargeRegion.stroke, "#5AAABF");
  assert.equal(chargeRegion.opacity, 0.35);
  assert.ok(chargeRegion.primitives.length >= 1);
  for (const primitive of chargeRegion.primitives) {
    assert.equal(primitive.theta0, evaluated.fields.phiPrime.data[g]);
    assert.equal(primitive.theta1, evaluated.fields.phi.data);
    assert.equal(primitive.r0, evaluated.fields.rInner.data);
    assert.equal(primitive.r1, evaluated.params.radius);
  }
  const fillChord = plan.layers.find(l => l.name === "fill_chord");
  const shoulderGuide = plan.layers.find(l => l.name === "shoulder_guide");
  const toeGuide = plan.layers.find(l => l.name === "toe_guide");
  assert.equal(fillChord.mark, "line");
  assert.equal(fillChord.stroke, "#5AAABF");
  assert.equal(fillChord.width, 1);
  assert.equal(fillChord.dash, true);
  assert.equal(fillChord.opacity, 0.8);
  assert.deepEqual(fillChord.primitives[0].points.map(point => point.theta), [
    evaluated.fields.phi.data,
    evaluated.fields.phiPrime.data[g]
  ]);
  assert.deepEqual(fillChord.primitives[0].points.map(point => point.r), [
    evaluated.fields.rInner.data,
    evaluated.fields.rInner.data
  ]);
  assert.equal(shoulderGuide.stroke, "#f1f5f9");
  assert.equal(shoulderGuide.width, 0.8);
  assert.equal(shoulderGuide.dash, true);
  assert.equal(shoulderGuide.opacity, 0.6);
  assert.deepEqual(shoulderGuide.primitives[0].points.map(point => point.theta), [
    evaluated.fields.phi.data,
    evaluated.fields.phi.data
  ]);
  assert.deepEqual(shoulderGuide.primitives[0].points.map(point => point.r), [
    0,
    evaluated.params.radius
  ]);
  assert.equal(toeGuide.stroke, "#475569");
  assert.equal(toeGuide.width, 0.8);
  assert.equal(toeGuide.dash, true);
  assert.equal(toeGuide.opacity, 0.6);
  assert.deepEqual(toeGuide.primitives[0].points.map(point => point.theta), [
    evaluated.fields.phiPrime.data[g],
    evaluated.fields.phiPrime.data[g]
  ]);
  assert.deepEqual(toeGuide.primitives[0].points.map(point => point.r), [
    0,
    evaluated.params.radius
  ]);
  const shoulderLabel = plan.layers.find(l => l.name === "shoulder_label");
  const toeLabel = plan.layers.find(l => l.name === "toe_label");
  assert.equal(shoulderLabel.mark, "text");
  assert.equal(shoulderLabel.fill, "#f1f5f9");
  assert.deepEqual(shoulderLabel.primitives, [{
    theta: evaluated.fields.phi.data,
    r: evaluated.fields.angle_label_r.data,
    label: "φ"
  }]);
  assert.equal(toeLabel.mark, "text");
  assert.equal(toeLabel.fill, "#475569");
  assert.deepEqual(toeLabel.primitives, [{
    theta: evaluated.fields.phiPrime.data[g],
    r: evaluated.fields.angle_label_r.data,
    label: "φ'"
  }]);
  assert.deepEqual(plan.layers.find(l => l.name === "cardinal_270").primitives, [{
    theta: 0,
    r: evaluated.fields.cardinal_label_r.data,
    label: "270°"
  }]);
  assert.deepEqual(plan.layers.find(l => l.name === "cardinal_0").primitives, [{
    theta: Math.PI / 2,
    r: evaluated.fields.cardinal_label_r.data,
    label: "0°"
  }]);
  assert.deepEqual(plan.layers.find(l => l.name === "cardinal_90").primitives, [{
    theta: Math.PI,
    r: evaluated.fields.cardinal_label_r.data,
    label: "90°"
  }]);
  assert.deepEqual(plan.layers.find(l => l.name === "cardinal_180").primitives, [{
    theta: 3 * Math.PI / 2,
    r: evaluated.fields.cardinal_label_r.data,
    label: "180°"
  }]);
  const forceScaleHot = plan.layers.find(l => l.name === "force_scale_hot");
  const forceScaleTitle = plan.layers.find(l => l.name === "force_scale_title");
  const forceScaleMaxLabel = plan.layers.find(l => l.name === "force_scale_max_label");
  const forceScaleMinLabel = plan.layers.find(l => l.name === "force_scale_min_label");
  assert.equal(forceScaleHot.mark, "screen-rect");
  assert.equal(forceScaleHot.fill, "#EC7424");
  assert.deepEqual(forceScaleHot.primitives, [{ x: 16, y: 440, width: 10, height: 12, rx: 0 }]);
  assert.deepEqual(forceScaleTitle.primitives, [{
    x: 16,
    y: 436,
    label: "|F|"
  }]);
  assert.equal(forceScaleMaxLabel.mark, "screen-text");
  assert.deepEqual(forceScaleMaxLabel.primitives, [{
    x: 29,
    y: 446,
    label: evaluated.fields.F_resultant_scale_max_text.data
  }]);
  assert.deepEqual(forceScaleMinLabel.primitives, [{
    x: 29,
    y: 500,
    label: evaluated.fields.F_resultant_scale_min_text.data
  }]);
  const liners = plan.layers.find(l => l.name === "liners");
  assert.equal(liners.mark, "annular-wedge");
  assert.equal(liners.primitives.length, N);
  for (const s of [0, 10, 19]) {
    const w = liners.primitives[s];
    assert.equal(w.theta0, evaluated.fields.t1.data[s]);       // t1 is over `segment` only (method-independent)
    assert.equal(w.theta1, evaluated.fields.t2.data[s][g]);    // t2 depends on gamma → method-dependent
    assert.equal(w.r0, evaluated.fields.rInner.data);
    assert.equal(w.r1, evaluated.params.radius);
    assert.equal(w.value, evaluated.fields.F_resultant.data[s][g]);
  }
  const forceBars = plan.layers.find(l => l.name === "force_bars");
  assert.equal(forceBars.mark, "polar-quad");
  assert.equal(forceBars.primitives.length, N);
  for (const s of [0, 10, 19]) {
    const bar = forceBars.primitives[s];
    assert.equal(bar.theta0, evaluated.fields.force_bar_theta0.data[s][g]);
    assert.equal(bar.theta1, evaluated.fields.force_bar_theta1.data[s][g]);
    assert.equal(bar.r0, evaluated.fields.force_bar_inner.data[s][g]);
    assert.equal(bar.r1, evaluated.fields.rInner.data);
    assert.equal(bar.value, evaluated.fields.F_r.data[s][g]);
  }
});

test("MillForceCross compare mode keeps grounded shell geometry and overlays both model bar series", async () => {
  const { model, g, f, N } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: {
      active_method: "grounded",
      analysis_mode: "compare"
    }
  });
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceCross");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.layers.find(l => l.name === "liners").hidden, true);
  const grounded = plan.layers.find(l => l.name === "grounded_liners");
  const chargeRegion = plan.layers.find(l => l.name === "charge_region");
  const compareChargeRegion = plan.layers.find(l => l.name === "charge_region_compare");
  assert.equal(chargeRegion.hidden, true);
  assert.equal(compareChargeRegion.mark, "annular-wedge");
  assert.equal(compareChargeRegion.fill, "#DCF0F5");
  assert.ok(compareChargeRegion.primitives.length >= 1);
  for (const primitive of compareChargeRegion.primitives) {
    assert.equal(primitive.theta0, evaluated.fields.phiPrime.data[g]);
    assert.equal(primitive.theta1, evaluated.fields.phi.data);
    assert.equal(primitive.r0, evaluated.fields.rInner.data);
    assert.equal(primitive.r1, evaluated.params.radius);
  }
  assert.equal(plan.layers.find(l => l.name === "fill_chord").hidden, true);
  assert.equal(plan.layers.find(l => l.name === "toe_guide").hidden, true);
  const compareFillChord = plan.layers.find(l => l.name === "fill_chord_compare");
  const compareToeGuide = plan.layers.find(l => l.name === "toe_guide_compare");
  assert.equal(compareFillChord.dash, true);
  assert.equal(compareFillChord.opacity, 0.8);
  assert.equal(compareToeGuide.dash, true);
  assert.equal(compareToeGuide.opacity, 0.6);
  assert.equal(plan.layers.find(l => l.name === "toe_label").hidden, true);
  const compareToeLabel = plan.layers.find(l => l.name === "toe_label_compare");
  assert.deepEqual(compareToeLabel.primitives, [{
    theta: evaluated.fields.phiPrime.data[g],
    r: evaluated.fields.angle_label_r.data,
    label: "φ'"
  }]);
  assert.deepEqual(compareFillChord.primitives[0].points.map(point => point.theta), [
    evaluated.fields.phi.data,
    evaluated.fields.phiPrime.data[g]
  ]);
  assert.deepEqual(compareToeGuide.primitives[0].points.map(point => point.theta), [
    evaluated.fields.phiPrime.data[g],
    evaluated.fields.phiPrime.data[g]
  ]);
  const groundedSwatch = plan.layers.find(l => l.name === "compare_grounded_swatch");
  const groundedLabel = plan.layers.find(l => l.name === "compare_grounded_label");
  const faithfulSwatch = plan.layers.find(l => l.name === "compare_faithful_swatch");
  const faithfulLabel = plan.layers.find(l => l.name === "compare_faithful_label");
  assert.equal(groundedSwatch.hidden, undefined);
  assert.equal(groundedSwatch.fill, "#5AAABF");
  assert.deepEqual(groundedSwatch.primitives, [{ x: 490, y: 520, width: 12, height: 8, rx: 0 }]);
  assert.deepEqual(groundedLabel.primitives, [{ x: 506, y: 527, label: "Grounded" }]);
  assert.equal(faithfulSwatch.fill, "#EC7424");
  assert.deepEqual(faithfulSwatch.primitives, [{ x: 490, y: 538, width: 12, height: 8, rx: 0 }]);
  assert.deepEqual(faithfulLabel.primitives, [{ x: 506, y: 545, label: "Faithful" }]);
  assert.equal(grounded.mark, "annular-wedge");
  assert.equal(grounded.primitives.length, N);
  assert.equal(grounded.primitives[10].r0, evaluated.fields.rInner.data);
  assert.equal(grounded.primitives[10].r1, evaluated.params.radius);
  assert.equal(grounded.primitives[10].value, evaluated.fields.F_resultant.data[10][g]);
  const groundedBars = plan.layers.find(l => l.name === "grounded_force_bars");
  const faithfulBars = plan.layers.find(l => l.name === "faithful_force_bars");
  assert.equal(groundedBars.mark, "polar-quad");
  assert.equal(faithfulBars.mark, "polar-quad");
  assert.equal(groundedBars.primitives[10].r0, evaluated.fields.force_bar_inner.data[10][g]);
  assert.equal(faithfulBars.primitives[10].r0, evaluated.fields.force_bar_inner.data[10][f]);
});

test("MillForceCross Monte Carlo mode renders authored p10/p90 radial force bands", async () => {
  const { model, N } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: {
      analysis_mode: "mc",
      n_samples: 80,
      mc_J_total_free: true,
      mc_percent_crit_free: true,
      mc_percent_solids_free: true,
      mc_height_free: true
    }
  });
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceCross");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  const p90 = plan.layers.find(l => l.name === "mc_p90");
  const p10 = plan.layers.find(l => l.name === "mc_p10");
  assert.equal(p90.mark, "polar-quad");
  assert.equal(p10.mark, "polar-point");
  assert.deepEqual(evaluated.fields.mc_sample_count.axes, []);
  assert.equal(evaluated.fields.mc_sample_count.data, 80);
  assert.equal(evaluated.fields.mc_sample_count_text.data, "80 samples computed");
  assert.deepEqual(evaluated.fields.F_r_p10_abs_max.axes, []);
  assert.deepEqual(evaluated.fields.F_r_p90_abs_max.axes, []);
  assert.match(evaluated.fields.F_r_p10_abs_max_text.data, /^\d+\.\d kN$/);
  assert.match(evaluated.fields.F_r_p90_abs_max_text.data, /^\d+\.\d kN$/);
  assert.ok(evaluated.fields.F_r_p90_abs_max.data >= evaluated.fields.F_r_p10_abs_max.data);
  assert.equal(p90.hidden, undefined);
  assert.equal(p10.hidden, undefined);
  assert.equal(p90.primitives.length, N);
  assert.equal(p10.primitives.length, N);
  for (const s of [0, 10, 19]) {
    assert.equal(p90.primitives[s].theta0, evaluated.fields.mc_theta0.data[s]);
    assert.equal(p90.primitives[s].theta1, evaluated.fields.mc_theta1.data[s]);
    assert.equal(p90.primitives[s].r0, evaluated.fields.mc_p90_inner.data[s]);
    assert.equal(p90.primitives[s].r1, evaluated.fields.rInner_mc.data);
    assert.equal(p90.primitives[s].value, evaluated.fields.F_r_p90.data[s]);
    assert.equal(typeof p90.primitives[s].tooltip.F_r_p90_N, "number");
    assert.equal(p10.primitives[s].theta, evaluated.fields.tBar_mc.data[s]);
    assert.equal(p10.primitives[s].r, evaluated.fields.mc_p10_r.data[s]);
    assert.equal(p10.primitives[s].value, evaluated.fields.F_r_p10.data[s]);
    assert.equal(typeof p10.primitives[s].tooltip.F_r_p10_N, "number");
  }
  assert.equal(plan.layers.find(l => l.name === "grounded_liners").hidden, true);
  assert.equal(plan.layers.find(l => l.name === "faithful_force_bars").hidden, true);
});

test("MillForceCross hides Monte Carlo overlay outside Monte Carlo mode", async () => {
  const { model } = await setup();
  const evaluated = evaluateModel(model, {
    functions: millForceKernels,
    params: { analysis_mode: "static", n_samples: 40, mc_J_total_free: true }
  });
  const view = await loadBody("views/mill-force.rvm", "surface", "MillForceCross");
  const plan = planChart(view, evaluated, { width: 600, height: 600 });

  assert.equal(plan.layers.find(l => l.name === "mc_p90").hidden, true);
  assert.equal(plan.layers.find(l => l.name === "mc_p10").hidden, true);
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
      "param.height",
      "param.active_method",
      "param.analysis_mode",
      "param.n_samples",
      "param.mc_J_total_free",
      "param.mc_percent_crit_free",
      "param.mc_percent_solids_free",
      "param.mc_height_free"
    ]) {
      assert.equal(boundProps.has(prop), true, `${chartName} missing ${prop}`);
    }
    const analysisModeBinding = view.bindings.find(binding => binding.prop === "param.analysis_mode");
    assert.equal(
      analysisModeBinding?.source?.state,
      "MillForceChartAnalysisMode",
      `${chartName} must bind chart mode to computed overlay state`
    );
  }
});
