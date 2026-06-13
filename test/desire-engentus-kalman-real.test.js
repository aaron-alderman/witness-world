import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { processBurst, jointKalman, angWrap, estimateSigmaTheta } from "../plugins/pipeline-runtime/kalman-kernels.js";

// ── Kalman stage: verify the in-IR joint Kalman kernel against REAL oracles ──
//
// The kernel ports the ORIGINAL 3-state joint Kalman (example-ports/
// engentus-pipeline-r/R/mill_bolt_angle.R) that produced the golden
// burst_kalman.csv (`bias_combined_dps`, omega_burst_rpm == omega_bolt_dps/6).
// The repo's analysis/mill/kalman.py is a LATER 4-state refactor, NOT the
// golden's model — see docs/PIPELINE-FIDELITY-AUDIT.md.
//
// Two oracles, two roles:
//   1. golden burst_kalman.csv — authoritative for the PHYSICAL frame outputs
//      (omega_bolt/tx_dps, omega_burst_rpm, r_bolt/tx_m). These come straight
//      from build_sensor_frame on the aligned signal; the kernel reproduces
//      them to machine precision across many real bursts.
//   2. R process_burst() reference — authoritative for the FILTER math
//      (delta_BT, bias_combined, residuals, total_rotation, sigma_used). The
//      golden's filtered states DIVERGED (physically impossible values:
//      total_rotation up to ±2.6e7°, bias up to ±6.8e6 dps) on most bursts, so
//      they are not a usable oracle. The kernel matches the clean R model to
//      machine precision and stays physically stable where the golden blew up.
//
// Inputs are the REAL aligned per-sample IMU streams lifted by
// tools/export_kalman_burst{,s_multi}.py via the real pipeline alignment.

const FIX = path.join(process.cwd(), "examples_rvm", "engentus", "fixtures");
const single = JSON.parse(readFileSync(path.join(FIX, "kalman-burst-B01.json"), "utf8"));
const multi = JSON.parse(readFileSync(path.join(FIX, "kalman-bursts-B01.json"), "utf8"));

const arrays = b => ({
  tS: b.t_s,
  boltAccelG: b.bolt_accel_g,
  txAccelG: b.tx_accel_g,
  boltGyroDps: b.bolt_gyro_dps,
  txGyroDps: b.tx_gyro_dps
});
const rel = (a, b) => (Math.abs(b) > 1e-12 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b));

const FRAME_KEYS = ["omega_bolt_dps", "omega_tx_dps", "omega_burst_rpm", "r_bolt_m", "r_tx_m"];
const FILTER_KEYS = ["delta_BT_deg", "bias_combined_dps", "residual_bolt_sd_deg",
  "residual_tx_sd_deg", "total_rotation_deg", "sigma_theta_b_used", "sigma_theta_t_used"];

test("frame physics matches the golden burst_kalman.csv to machine precision (single burst)", () => {
  const out = processBurst(arrays(single));
  for (const k of FRAME_KEYS) {
    const r = rel(out[k], single.golden[k]);
    assert.ok(r < 1e-12, `${k}: rel ${r.toExponential(2)} (got ${out[k]}, golden ${single.golden[k]})`);
  }
});

test("frame physics matches the golden across every real burst (machine precision)", () => {
  assert.ok(multi.bursts.length >= 6, `expected several bursts, got ${multi.bursts.length}`);
  let maxRel = 0;
  for (const b of multi.bursts) {
    const out = processBurst(arrays(b));
    for (const k of FRAME_KEYS) maxRel = Math.max(maxRel, rel(out[k], b.golden[k]));
  }
  assert.ok(maxRel < 1e-12, `max frame-quantity rel error ${maxRel.toExponential(2)}`);
});

test("the FULL filter (delta_BT, bias, residuals, rotation, sigma) matches the R reference to machine precision", () => {
  const out = processBurst(arrays(single));
  const R = single.r_reference;
  for (const k of [...FRAME_KEYS, ...FILTER_KEYS]) {
    const r = rel(out[k], R[k]);
    assert.ok(r < 1e-11, `${k}: rel ${r.toExponential(2)} (port ${out[k]}, R ${R[k]})`);
  }
});

test("the kernel stays physically stable where the golden filter DIVERGED", () => {
  // The golden's filtered states are numerically divergent on most bursts; the
  // faithful kernel instead yields physically-sane estimates:
  //   total rotation ≈ omega_bolt_dps × duration, bias small, |delta_BT| small.
  let goldenDivergent = 0;
  for (const b of multi.bursts) {
    const out = processBurst(arrays(b));
    const duration = b.t_s[b.t_s.length - 1] - b.t_s[0];
    const expectedRot = out.omega_bolt_dps * duration; // deg
    // kernel: total rotation within 5% of rigid-body expectation
    assert.ok(Math.abs(out.total_rotation_deg - expectedRot) < 0.05 * Math.abs(expectedRot),
      `bolt ${b.bolt_number} ${b.burst_start_utc}: rotation ${out.total_rotation_deg.toFixed(1)}° vs expected ${expectedRot.toFixed(1)}°`);
    // kernel: combined bias stays bounded (≪ the golden's runaway values)
    assert.ok(Math.abs(out.bias_combined_dps) < 5, `bias ${out.bias_combined_dps} dps not bounded`);
    if (Math.abs(b.golden.total_rotation_deg) > 5 * Math.abs(expectedRot) + 1000) goldenDivergent++;
  }
  // document the divergence: the majority of golden bursts are non-physical
  assert.ok(goldenDivergent >= Math.ceil(multi.bursts.length / 2),
    `expected the golden to diverge on most bursts, saw ${goldenDivergent}/${multi.bursts.length}`);
});

test("omega_burst_rpm is exactly omega_bolt_dps / 6 (3-state model invariant)", () => {
  for (const b of multi.bursts) {
    const out = processBurst(arrays(b));
    assert.ok(rel(out.omega_burst_rpm, out.omega_bolt_dps / 6) < 1e-15);
  }
});

test("angWrap maps to [-pi, pi) and jointKalman is deterministic", () => {
  // R's ((a+pi) %% 2pi) - pi is left-closed: angWrap(pi) == angWrap(3pi) == -pi.
  assert.equal(angWrap(0), 0);
  assert.ok(Math.abs(angWrap(Math.PI) + Math.PI) < 1e-12);
  assert.ok(angWrap(3 * Math.PI) >= -Math.PI && angWrap(3 * Math.PI) < Math.PI);
  assert.ok(Math.abs(angWrap(0.5 * Math.PI) - 0.5 * Math.PI) < 1e-12);
  const a = processBurst(arrays(single));
  const b = processBurst(arrays(single));
  assert.deepEqual(a.delta_BT_deg, b.delta_BT_deg);
});

test("estimateSigmaTheta recovers a near-zero residual for a clean linear ramp", () => {
  // constant angular velocity → unwrapped angle is linear in t → residual ≈ 0
  const t = Array.from({ length: 50 }, (_, i) => i * 0.05);
  const theta = t.map(x => angWrap(2.0 * x)); // 2 rad/s, wrapped
  const sigma = estimateSigmaTheta(theta, t);
  assert.ok(sigma < 1e-9, `expected ~0 residual sd, got ${sigma}`);
});
