import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { addAngles, thetaAcc, cfFilter, fitRotationAngle } from "../examples_rvm/engentus/prepare-angles-kernel.mjs";

// ── prepare angle stage: verify the in-IR kernel against the CANONICAL R ──
//
// prepare-angles-kernel.mjs ports the canonical R angle helpers from
// example-ports/engentus-pipeline-r/R/prepare.R (cf_filter, fit_rotation_angle,
// theta_acc/add_angles). R is canonical for this pipeline. The fixture's
// r_reference is R's own output on this real burst (via tools/run_r_prepare_angles.R,
// which evaluates the actual prepare.R definitions — no drift).

const FIX = path.join(process.cwd(), "examples_rvm", "engentus", "fixtures");
const fx = JSON.parse(readFileSync(path.join(FIX, "prepare-angles-B01.json"), "utf8"));
const multi = JSON.parse(readFileSync(path.join(FIX, "kalman-bursts-B01.json"), "utf8"));

const burstArgs = {
  ayBoltG: fx.ay_bolt_g,
  azBoltG: fx.az_bolt_g,
  gxBoltDps: fx.gx_bolt_dps,
  sampleIdx: fx.sample_idx
};
const rel = (a, b) => (Math.abs(b) > 1e-9 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b));

test("all three angle series match the canonical R output to machine precision", () => {
  const out = addAngles(burstArgs);
  for (const k of ["theta_acc_deg", "theta_filt_deg", "rotation_angle_deg"]) {
    const got = out[k], want = fx.r_reference[k];
    assert.equal(got.length, want.length);
    let maxAbs = 0, maxRel = 0;
    for (let i = 0; i < got.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(got[i] - want[i]));
      maxRel = Math.max(maxRel, rel(got[i], want[i]));
    }
    assert.ok(maxAbs < 1e-10, `${k}: maxAbs ${maxAbs.toExponential(2)}`);
    assert.ok(maxRel < 1e-10, `${k}: maxRel ${maxRel.toExponential(2)}`);
  }
});

test("theta_acc is exactly atan2(ay, az)·180/π", () => {
  const out = thetaAcc(fx.ay_bolt_g, fx.az_bolt_g);
  for (let i = 0; i < out.length; i++) {
    const want = Math.atan2(fx.ay_bolt_g[i], fx.az_bolt_g[i]) * 180 / Math.PI;
    assert.ok(Math.abs(out[i] - want) < 1e-12);
  }
});

test("rotation_angle stays within (-180, 180] on every real burst; theta_acc matches formula", () => {
  for (const b of multi.bursts) {
    const ay = b.bolt_accel_g.map(r => r[1]);
    const az = b.bolt_accel_g.map(r => r[2]);
    const gx = b.bolt_gyro_dps.map(r => r[0]);
    const out = addAngles({ ayBoltG: ay, azBoltG: az, gxBoltDps: gx, sampleIdx: ay.map((_, i) => i) });
    for (const r of out.rotation_angle_deg) {
      assert.ok(Number.isFinite(r), "fast real burst should yield finite rotation angle");
      assert.ok(r > -180 - 1e-9 && r <= 180 + 1e-9, `rotation ${r} out of range`);
    }
    for (let i = 0; i < ay.length; i++) {
      assert.ok(Math.abs(out.theta_acc_deg[i] - Math.atan2(ay[i], az[i]) * 180 / Math.PI) < 1e-12);
    }
  }
});

test("complementary filter tracks accel angle for a stationary (zero-gyro) burst", () => {
  // gx = 0 → gyro_pred = previous; theta_filt relaxes toward theta_acc by (1-α).
  const n = 20;
  const ay = new Array(n).fill(0.3);
  const az = new Array(n).fill(0.95);
  const gx = new Array(n).fill(0);
  const filt = cfFilter(ay, az, gx);
  const acc = Math.atan2(0.3, 0.95) * 180 / Math.PI;
  // constant accel angle → filter converges to it; first sample equals it exactly.
  assert.ok(Math.abs(filt[0] - acc) < 1e-12);
  assert.ok(Math.abs(filt[n - 1] - acc) < 1e-9, `converged ${filt[n - 1]} vs ${acc}`);
});

test("fit_rotation_angle returns all-NaN for a too-slow burst (omega < 0.05 rad/s)", () => {
  // R: omega = |mean(gx)|·π/180; below 0.05 rad/s (~2.86 dps) → NA.
  const t = Array.from({ length: 30 }, (_, i) => i * 0.05);
  const az = t.map(() => 1.0);
  const gx = t.map(() => 1.0); // 1 dps → omega ≈ 0.0175 rad/s < 0.05
  const out = fitRotationAngle(t, az, gx);
  assert.ok(out.every(v => Number.isNaN(v)), "expected all-NaN for slow burst");
});

test("fit_rotation_angle recovers TDC phase for a synthetic cosine in az", () => {
  // az(t) = cos(ω t − φ0); rotation_angle should read 0 at the cosine peak.
  const omega = 7.0; // rad/s (~67 dps), well above threshold
  const phi0 = 0.6;
  const t = Array.from({ length: 200 }, (_, i) => i * 0.05);
  const az = t.map(x => Math.cos(omega * x - phi0));
  const gxDps = t.map(() => omega * 180 / Math.PI); // constant rate → mean ω exact
  const out = fitRotationAngle(t, az, gxDps);
  // peak of az is where ω t − φ0 = 0 → rotation_angle there ≈ 0
  let peakI = 0;
  for (let i = 1; i < t.length; i++) if (az[i] > az[peakI]) peakI = i;
  assert.ok(Math.abs(out[peakI]) < 5, `rotation at az-peak ${out[peakI]}° should be near 0`);
});
