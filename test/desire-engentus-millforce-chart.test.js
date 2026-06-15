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

test("MillForceAngle plans cartesian lines over segment angle, sliced to active model", async () => {
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
    anglePlan.layers.find(l => l.name === "fres").primitives[0].points[8].y,
    evaluated.fields.F_resultant.data[8][f]
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
  assert.match(grounded.fields.phiText.data, /°$/);
  assert.match(grounded.fields.omegaText.data, / rad\/s$/);
  assert.match(grounded.fields.rhoChargeText.data, / SG$/);
  assert.match(grounded.fields.F_r_max_text.data, / kN$/);
  assert.match(grounded.fields.gammaDeltaText.data, /^[+-]?\d+\.\d(?:Â°|°)$/);
  assert.match(grounded.fields.gammaDeltaPercentText.data, /^[+-]?\d+\.\d\d%$/);
  assert.match(grounded.fields.F_resultant_max_delta_text.data, /^[+-]?\d+\.\d kN$/);
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
  assert.equal(grounded.primitives[0].points[8].y, evaluated.fields.F_resultant.data[8][g]);
  assert.equal(faithful.primitives[0].points[8].y, evaluated.fields.F_resultant.data[8][f]);
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
    plan.layers.find(l => l.name === "fres").primitives[0].points[8].y,
    evaluated.fields.F_resultant.data[8][g]
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
});

test("MillForceCross compare mode renders grounded and faithful annular bands", async () => {
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
  const faithful = plan.layers.find(l => l.name === "faithful_liners");
  assert.equal(grounded.mark, "annular-wedge");
  assert.equal(faithful.mark, "annular-wedge");
  assert.equal(grounded.primitives.length, N);
  assert.equal(faithful.primitives.length, N);
  assert.equal(grounded.primitives[10].r0, evaluated.fields.rCompareMid.data);
  assert.equal(grounded.primitives[10].r1, evaluated.params.radius);
  assert.equal(grounded.primitives[10].value, evaluated.fields.F_resultant.data[10][g]);
  assert.equal(faithful.primitives[10].r0, evaluated.fields.rInner.data);
  assert.equal(faithful.primitives[10].r1, evaluated.fields.rCompareMid.data);
  assert.equal(faithful.primitives[10].value, evaluated.fields.F_resultant.data[10][f]);
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
      "param.analysis_mode"
    ]) {
      assert.equal(boundProps.has(prop), true, `${chartName} missing ${prop}`);
    }
  }
});
