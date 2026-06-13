import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildHealthTimeline, summariseHealth, collapseByPriority, representativeArtifact
} from "../examples_rvm/engentus/health-r-kernel.mjs";

// ── R health fallback: verify against canonical R (health.R) ──
//
// health-r-kernel.mjs ports R/health.R build_health_timeline + summarise_health
// (the simpler 3-state clip-rate model — the R fallback to the Python 5-state
// classifier in health-kernel.mjs). The fixture is R's own output via
// tools/run_r_health.R (parse()-evals the real defs). Plus the generic
// priority-collapse helper that makes the "co-occurring events → one
// representative dimension" design explicit.

const FIX = path.join(process.cwd(), "examples_rvm", "engentus", "fixtures");
const fx = JSON.parse(readFileSync(path.join(FIX, "health-r.json"), "utf8"));

const NUM = ["n_bursts", "n_hard_clip", "n_soft_clip", "n_spike", "n_clipped", "clip_rate", "median_raw_avg"];
const rel = (a, b) => (Math.abs(b) > 1e-9 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b));

test("summarise_health reproduces the R day-window summary exactly", () => {
  const tl = buildHealthTimeline(fx.stats, fx.bursts);
  const day = summariseHealth(tl, { period: "day" });
  assert.equal(day.length, fx.day_summary.length);
  let worst = 0;
  for (let i = 0; i < day.length; i++) {
    const a = day[i], b = fx.day_summary[i];
    assert.equal(a.bolt, b.bolt);
    assert.equal(a.channel, b.channel);
    assert.equal(a.window, b.window);
    assert.equal(a.status, b.status, `status ${a.bolt}/${a.channel}/${a.window}`);
    for (const c of NUM) worst = Math.max(worst, rel(a[c], b[c]));
  }
  assert.ok(worst < 1e-12, `worst numeric rel ${worst.toExponential(2)}`);
});

test("build_health_timeline keeps only load channels and joins bolt metadata", () => {
  const tl = buildHealthTimeline(fx.stats, fx.bursts);
  const channels = new Set(tl.map(r => r.channel));
  assert.ok(!channels.has("ax_bolt"), "IMU channel must be dropped");
  for (const r of tl) {
    assert.ok(["x1", "y1", "x3", "y3", "z2"].includes(r.channel));
    assert.ok(r.bolt !== null && r.trial_arm !== undefined);
    assert.equal(r.date_utc, String(r.burst_start_utc).slice(0, 10));
  }
});

test("status thresholds: 0 clips healthy, partial degraded, all-clipped failed", () => {
  const day = summariseHealth(buildHealthTimeline(fx.stats, fx.bursts), { period: "day" });
  const byKey = Object.fromEntries(day.map(r => [`${r.bolt}/${r.channel}/${r.window}`, r]));
  assert.equal(byKey["5/y1/2026-04-02"].status, "healthy"); // clip_rate 0
  assert.equal(byKey["5/x1/2026-04-02"].status, "degraded"); // clip_rate 0.5
  assert.equal(byKey["5/x1/2026-04-03"].status, "failed");   // clip_rate 1
});

test("priority collapse picks the highest-priority co-occurring event", () => {
  // hard > spike > soft
  assert.equal(representativeArtifact({ hard_clip: true, soft_clip: true, spike_contaminated: true }), "hard_clip");
  assert.equal(representativeArtifact({ hard_clip: false, soft_clip: true, spike_contaminated: true }), "spike_contaminated");
  assert.equal(representativeArtifact({ hard_clip: false, soft_clip: true, spike_contaminated: false }), "soft_clip");
  assert.equal(representativeArtifact({ hard_clip: false, soft_clip: false, spike_contaminated: false }), "clean");
});

test("collapseByPriority is generic: first active in priority order, else fallback", () => {
  const order = ["a", "b", "c"];
  assert.equal(collapseByPriority(["c", "b"], order), "b");
  assert.equal(collapseByPriority(["c"], order), "c");
  assert.equal(collapseByPriority([], order, "none"), "none");
  // order, not insertion, decides the winner
  assert.equal(collapseByPriority(["c", "a"], order), "a");
});

test("the timeline carries a representative artifact per burst (one dimension)", () => {
  const tl = buildHealthTimeline(fx.stats, fx.bursts);
  const b5x1 = tl.filter(r => r.bolt === 5 && r.channel === "x1");
  // b5d2a has hard+soft → hard wins; b5d2b has spike only → spike
  assert.deepEqual(b5x1.map(r => r.representative_artifact),
    ["clean", "hard_clip", "hard_clip", "spike_contaminated"]);
});
