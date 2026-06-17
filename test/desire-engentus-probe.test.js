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
import { millChargeKernels } from "../examples/engentus/app/chart-functions/mill-charge-kernels.js";
import { planChart, probeReadout, frameIndexForValue } from "../plugins/chart-runtime/gog-runtime.js";

// Probe / scrubber: the axis-binding logic behind drawChart interactivity.
// The DOM drag/hover wiring is browser-only, but the pure binding contracts are
// node-verified here.

const appDir = path.join(process.cwd(), "examples", "engentus", "app");

async function loadBody(file, kind, name) {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
  const node = desire.nodes.find(n => n.kind === kind && n.name === name);
  assert.ok(node, `${kind} ${name} not found in ${file}`);
  return node.body;
}

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const GOODMAN_FNS = { ...goodmanFunctions, ...samplingFunctions };

test("probeReadout reads the bolt-response curve at an exact x (no interpolation error)", async () => {
  const model = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigue");
  const ev = evaluateModel(model, { functions: GOODMAN_FNS });
  const view = await loadBody("views/goodman.rvm", "surface", "GoodmanDiagram");
  const plan = planChart(view, ev, { width: 800, height: 520 });

  const i = 100;
  const xExact = ev.axes.sm.values[i];
  const out = probeReadout(plan, xExact);
  const curve = out.readings.find(r => r.layer === "curves");
  assert.ok(curve, "expected a reading for the curve layer");
  assert.ok(close(curve.y, ev.fields.curve.data[i]), `curve@x: ${curve.y} vs ${ev.fields.curve.data[i]}`);
  const band = out.readings.find(r => r.layer === "bands");
  assert.ok(band, "expected a reading for the authored background band");
  assert.ok(Number.isFinite(band.y0));
  assert.ok(Number.isFinite(band.y1));
  assert.ok(!out.readings.some(r => r.mark === "rule"));
  assert.ok(!out.readings.some(r => r.mark === "point"));
});

test("probeReadout linearly interpolates between grid points", async () => {
  const model = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigue");
  const ev = evaluateModel(model, { functions: GOODMAN_FNS });
  const plan = planChart(await loadBody("views/goodman.rvm", "surface", "GoodmanDiagram"), ev, {});

  const sm = ev.axes.sm.values;
  const x = (sm[100] + sm[101]) / 2;
  const out = probeReadout(plan, x);
  const got = out.readings.find(r => r.layer === "curves").y;
  const exp = (ev.fields.curve.data[100] + ev.fields.curve.data[101]) / 2;
  assert.ok(close(got, exp), `interp ${got} vs ${exp}`);
});

test("Goodman tooltip helper emits oracle-shaped rows with layer-derived colours", () => {
  const markup = goodmanFunctions.goodman_tooltip_markup({
    readout: {
      readings: [
        {
          layer: "curves",
          tooltip: {
            sigma_m_MPa: 201,
            sigma_a_MPa: 57.6,
            F_shear_N: 2496,
            damage_per_cycle_x10_6: 2.574
          }
        },
        {
          layer: "curve_jemtec",
          tooltip: {
            sigma_m_MPa: 201,
            sigma_a_MPa: 3.0,
            F_shear_N: 131,
            damage_per_cycle_x10_6: 0
          }
        }
      ]
    },
    plan: {
      layers: [
        { name: "curves", stroke: "#dc2626" },
        { name: "curve_jemtec", stroke: "#8CC4D4" }
      ]
    }
  });

  assert.match(markup, /goodman-hover-title/);
  assert.match(markup, /&sigma;<sub>m<\/sub> = 201 MPa/);
  assert.match(markup, /goodman-hover-swatch" style="background:#dc2626"/);
  assert.match(markup, /goodman-hover-swatch" style="background:#8CC4D4"/);
  assert.match(markup, /No Jemtec:/);
  assert.match(markup, /Jemtec:/);
  assert.match(markup, /57\.6 MPa/);
  assert.match(markup, /2,496 N/);
  assert.match(markup, /2\.574&times;10<sup>-6<\/sup>/);
  assert.match(markup, /&asymp;0&times;10<sup>-6<\/sup>/);
});

test("probeReadout reads the p10/p90 band and per-sample cloud at x", async () => {
  const model = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigueMC");
  const ev = evaluateModel(model, { functions: { ...goodmanFunctions, ...samplingFunctions } });
  const plan = planChart(await loadBody("views/goodman.rvm", "surface", "GoodmanMCBands"), ev, {});

  const i = 120;
  const out = probeReadout(plan, ev.axes.sm.values[i]);
  const band = out.readings.find(r => r.mark === "band");
  assert.ok(band, "expected a band reading");
  assert.ok(close(band.y0, ev.fields.sa_p10.data[i]), "band.y0 = p10@x");
  assert.ok(close(band.y1, ev.fields.sa_p90.data[i]), "band.y1 = p90@x");
  const med = out.readings.find(r => r.layer === "med");
  assert.ok(close(med.y, ev.fields.sa_p50.data[i]), "median reading = p50@x");
  assert.equal(out.readings.filter(r => r.mark === "cloud").length, 0);
});

test("frameIndexForValue maps an axis value to the nearest frame index (with clamp)", async () => {
  const model = await loadBody("models/mill-charge.rvm", "dataflow", "MillCharge");
  const ev = evaluateModel(model, { functions: millChargeKernels });
  const t = ev.axes.t.values;

  assert.equal(frameIndexForValue(t, 0), 0);
  assert.equal(frameIndexForValue(t, 0.07), 1);
  assert.equal(frameIndexForValue(t, t[t.length - 1]), t.length - 1);
  assert.equal(frameIndexForValue(t, -5), 0);
  assert.equal(frameIndexForValue(t, 99), t.length - 1);
  assert.equal(frameIndexForValue([], 3), 0);
});
