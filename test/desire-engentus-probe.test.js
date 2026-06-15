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

// ── Probe / scrubber: the axis-binding logic behind drawChart's interactivity ─────
// The DOM drag/hover wiring is browser-only (waits on the live render), but the pure
// binding — read model values at an arbitrary x (probe), map an axis value to a frame
// (scrubber) — is node-verified here.

const appDir = path.join(process.cwd(), "examples", "engentus", "app");

async function loadBody(file, kind, name) {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
  const node = desire.nodes.find(n => n.kind === kind && n.name === name);
  assert.ok(node, `${kind} ${name} not found in ${file}`);
  return node.body;
}

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const GOODMAN_FNS = { ...goodmanFunctions, ...samplingFunctions };

// ── probe over the deterministic Goodman chart ──
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
  // rules (slip/probe) are not data readings
  assert.ok(!out.readings.some(r => r.mark === "rule"));
  // Static distribution cloud points are visual marks; point probing is not a
  // supported chart-runtime contract yet.
  assert.ok(!out.readings.some(r => r.mark === "point"));
});

test("probeReadout linearly interpolates between grid points", async () => {
  const model = await loadBody("models/goodman.rvm", "dataflow", "BoltFatigue");
  const ev = evaluateModel(model, { functions: GOODMAN_FNS });
  const plan = planChart(await loadBody("views/goodman.rvm", "surface", "GoodmanDiagram"), ev, {});

  const sm = ev.axes.sm.values;
  const x = (sm[100] + sm[101]) / 2; // midpoint between two grid points
  const out = probeReadout(plan, x);
  const got = out.readings.find(r => r.layer === "curves").y;
  const exp = (ev.fields.curve.data[100] + ev.fields.curve.data[101]) / 2;
  assert.ok(close(got, exp), `interp ${got} vs ${exp}`);
});

// ── probe over the MC band chart: reads the uncertainty range at x ──
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
  // The reference clears the static distribution cloud in MC mode; do not
  // reintroduce the previous invented per-sample MC cloud readout.
  assert.equal(out.readings.filter(r => r.mark === "cloud").length, 0);
});

// ── scrubber: bind an axis value to the nearest frame ──
test("frameIndexForValue maps an axis value to the nearest frame index (with clamp)", async () => {
  const model = await loadBody("models/mill-charge.rvm", "dataflow", "MillCharge");
  const ev = evaluateModel(model, { functions: millChargeKernels });
  const t = ev.axes.t.values; // 0, 0.05, … 1.10

  assert.equal(frameIndexForValue(t, 0), 0);
  assert.equal(frameIndexForValue(t, 0.07), 1);              // nearest 0.05
  assert.equal(frameIndexForValue(t, t[t.length - 1]), t.length - 1);
  assert.equal(frameIndexForValue(t, -5), 0);                // clamp low
  assert.equal(frameIndexForValue(t, 99), t.length - 1);     // clamp high
  assert.equal(frameIndexForValue([], 3), 0);                // degenerate
});
