import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { detectClips, detectClipsGroup, LOAD_CHANNELS, ADC_MAX } from "../plugins/pipeline-runtime/clip-kernels.js";

// ── clip / artifact detection: verify the in-IR kernel against canonical R ──
//
// clip-kernel.mjs ports R/clip.R `detect_clips`. R is canonical. The fixture's
// `stats` are R's own detect_clips output on the `samples` input (R oracle via
// tools/run_r_clip.R, which parse()-evals the real detect_clips — no drift).
// Synthetic input: the caches only hold IMU accel; no raw load-channel signal
// was ever fetched, so synthetic data exercises every flag branch instead.

const FIX = path.join(process.cwd(), "examples_rvm", "engentus", "fixtures");
const fx = JSON.parse(readFileSync(path.join(FIX, "clip-samples.json"), "utf8"));

const NUM = ["median_raw", "iqr_raw", "min_raw", "max_raw", "n_samples",
  "n_hard_clip", "pct_at_rail", "max_abs_diff", "median_abs_diff"];
const FLAGS = ["hard_clip", "soft_clip", "spike_contaminated", "is_clipped"];
const rel = (a, b) => (Math.abs(b) > 1e-9 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b));

test("detect_clips reproduces every R stat row exactly (stats + flags)", () => {
  const out = detectClips(fx.samples);
  const rByKey = new Map(fx.stats.map(s => [`${s.burst_id} ${s.channel}`, s]));
  assert.equal(out.length, fx.stats.length);
  let worst = 0;
  for (const o of out) {
    const r = rByKey.get(`${o.burst_id} ${o.channel}`);
    assert.ok(r, `no R row for ${o.channel}`);
    for (const c of NUM) {
      if (o[c] === null || r[c] === null) { assert.equal(o[c], r[c], `${o.channel}.${c} null`); continue; }
      worst = Math.max(worst, rel(o[c], r[c]));
    }
    for (const f of FLAGS) assert.equal(o[f], r[f], `${o.channel}.${f}`);
  }
  assert.ok(worst < 1e-12, `worst numeric rel ${worst.toExponential(2)}`);
});

test("the three artifact branches fire on the right channels", () => {
  const out = detectClips(fx.samples);
  const by = Object.fromEntries(out.filter(o => o.burst_id === "B1").map(o => [o.channel, o]));
  assert.equal(by.x1.is_clipped, false, "clean channel not clipped");
  assert.equal(by.y1.hard_clip, true, "hard clip");
  assert.equal(by.x3.soft_clip, true, "soft clip");
  assert.equal(by.z2.spike_contaminated, true, "spike");
  for (const f of FLAGS) assert.equal(by.ax_bolt[f], null, "IMU flags are null");
});

test("IMU (non-load) channels get null flags but still compute raw stats", () => {
  const g = detectClipsGroup({
    burst_id: "B", channel: "gx_bolt",
    samples: [{ sample_idx: 1, raw: 10 }, { sample_idx: 2, raw: 12 }, { sample_idx: 3, raw: 11 }]
  });
  assert.equal(g.hard_clip, null);
  assert.equal(g.is_clipped, null);
  assert.equal(g.n_hard_clip, null);
  assert.equal(g.median_raw, 11); // stats still computed
  assert.equal(g.n_samples, 3);
});

test("hard clip detects pins at exactly 0 and ADC_MAX, sorted-independent", () => {
  const g = detectClipsGroup({
    burst_id: "B", channel: "x1",
    samples: [{ sample_idx: 3, raw: 5000 }, { sample_idx: 1, raw: 0 }, { sample_idx: 2, raw: ADC_MAX }]
  });
  assert.equal(g.n_hard_clip, 2);
  assert.equal(g.hard_clip, true);
  assert.equal(g.min_raw, 0);
  assert.equal(g.max_raw, ADC_MAX);
});

test("LOAD_CHANNELS is the canonical x1/y1/x3/y3/z2 set", () => {
  assert.deepEqual(LOAD_CHANNELS, ["x1", "y1", "x3", "y3", "z2"]);
});
