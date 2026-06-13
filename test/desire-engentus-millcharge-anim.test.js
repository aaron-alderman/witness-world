import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { millChargeKernels } from "../plugins/chart-runtime/mill-charge-kernels.js";
import { planChart, frameIndexForElapsed } from "../plugins/chart-runtime/gog-runtime.js";

// ── MC-anim: the disc-frame animation polish (cadence + wall-collision clipping) ──
// The browser-side rAF paint still waits on the parked live-browser render, but the
// pure logic it drives — frame cadence over the time axis and disc clipping — is
// node-verified here.

const appDir = path.join(process.cwd(), "examples_rvm", "engentus", "app");

async function loadBody(file, kind, name) {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
  const node = desire.nodes.find(n => n.kind === kind && n.name === name);
  assert.ok(node, `${kind} ${name} not found in ${file}`);
  return node.body;
}

// ── frame cadence ───────────────────────────────────────────────────────────────

test("frameIndexForElapsed maps wall-clock onto the time axis, looping over its span", () => {
  const t = [0, 0.5, 1.0]; // span 1.0
  assert.equal(frameIndexForElapsed(t, 0), 0);
  assert.equal(frameIndexForElapsed(t, 0.25), 0);   // last step at or before 0.25 is t=0
  assert.equal(frameIndexForElapsed(t, 0.5), 1);
  assert.equal(frameIndexForElapsed(t, 0.6), 1);
  assert.equal(frameIndexForElapsed(t, 1.0), 0);    // loops: 1.0 % 1.0 = 0
  assert.equal(frameIndexForElapsed(t, 1.5), 1);    // loops: 1.5 % 1.0 = 0.5
});

test("frameIndexForElapsed honours speed and no-loop clamp, and degenerate axes", () => {
  const t = [0, 0.5, 1.0];
  assert.equal(frameIndexForElapsed(t, 0.25, { speed: 2 }), 1);          // phase 0.5
  assert.equal(frameIndexForElapsed(t, 5, { loop: false }), 2);          // clamp to span end
  assert.equal(frameIndexForElapsed([0, 0.2, 0.9, 1.0], 0.95), 2);       // uneven spacing
  assert.equal(frameIndexForElapsed([7], 3), 0);                         // single frame
  assert.equal(frameIndexForElapsed([], 3), 0);                          // empty
});

// ── wall-collision clipping ───────────────────────────────────────────────────────

async function discPlan(opts) {
  const model = await loadBody("models/mill-charge.rvm", "dataflow", "MillCharge");
  const evaluated = evaluateModel(model, { functions: millChargeKernels });
  const view = await loadBody("views/mill-charge.rvm", "surface", "MillChargeCrossSection");
  return planChart(view, evaluated, { width: 600, height: 600, ...opts });
}

test("the plan exposes playback metadata and clips particles at the disc wall", async () => {
  const plan = await discPlan();
  assert.equal(plan.playback.wallClip, 1);          // default: clip exactly at the wall
  assert.equal(plan.playback.loop, true);

  const fall = plan.layers.find(l => l.name === "fall");
  const R = plan.discRadius;
  let clipped = 0, kept = 0;
  for (const frame of fall.frames) {
    for (const p of frame.points) {
      // every point's flag agrees with its radius vs the disc wall
      assert.equal(p.inDisc, Math.hypot(p.x, p.y) <= R + 1e-9, `inDisc at r=${Math.hypot(p.x, p.y)}`);
      if (p.inDisc) kept += 1; else clipped += 1;
    }
  }
  // ballistic arcs leave the disc, so clipping is non-trivial (some of each)
  assert.ok(clipped > 0, "expected some particles to be clipped past the wall");
  assert.ok(kept > 0, "expected some particles to remain in the disc");
});

test("a tighter wallClip fraction clips strictly more points", async () => {
  const countClipped = plan => plan.layers.find(l => l.name === "fall")
    .frames.reduce((n, f) => n + f.points.filter(p => p.inDisc === false).length, 0);
  const wide = countClipped(await discPlan({ wallClip: 1 }));
  const tight = countClipped(await discPlan({ wallClip: 0.6 }));
  assert.ok(tight > wide, `tighter clip should hide more (tight ${tight} > wide ${wide})`);
});
