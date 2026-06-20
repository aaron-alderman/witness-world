// kalman-kernels.js — IN-IR joint Kalman rotation-angle estimator (PIPELINE Stage 5d / kalman).
//
// Lowered kernels + model wiring for the `engentus.pipeline.kalman` host-op. The
// stage runs as a DESIRE model (examples_rvm/engentus/app/models/kalman.rvm) over
// the lowered `kalmanFunctions` leaves, via the generic `evaluateModel` — the
// mill-force/goodman "lives in the IR" form. No loose example .mjs.
//
// Faithful port of the ORIGINAL 3-state joint Kalman that produced the golden
// burst_kalman.csv: example-ports/engentus-pipeline-r/R/mill_bolt_angle.R
//   `build_sensor_frame` / `project_signals` / `accel_theta` /
//   `estimate_sigma_theta` / `joint_kalman` / `process_burst`.
//
// NOTE on provenance: the repo's analysis/mill/kalman.py is a LATER 4-state
// refactor (state [theta, omega, b_bolt, delta_BT], emits omega_est_dps /
// bias_bolt_dps). The committed golden (burst_kalman.csv / burst_kalman_cache)
// carries `bias_combined_dps` and omega_burst_rpm == omega_bolt_dps/6 — the
// signature of the 3-state model. So the R 3-state filter is authoritative for
// the golden, and this kernel ports THAT. See docs/PIPELINE-FIDELITY-AUDIT.md.
//
// 3-state model:  x = (theta, b_omega, delta_BT)
//   theta    — drum angle, bolt frame, 0 = bolt at top, unwrapped (rad)
//   b_omega  — combined gyro bias on the averaged projected rate (rad/s)
//   delta_BT — per-burst constant offset, theta_tx = theta - delta_BT (rad)
// Predict:  theta_{k} = theta_{k-1} - dt*b_omega + 0.5*dt*(omega_b[k]+omega_t[k])
// Two sequential scalar accel updates per step: bolt H=(1,0,0), tx H=(1,0,-1).
// The gyros enter ONLY through the predict step (no gyro measurement update).

import path from "node:path";
import { createComputeHostOpHandler } from "../../src/desire/host-op-migration.js";
import { evaluateModel } from "../chart-runtime/plan/evaluate-model.js";
import { createRvmModelBodyLoader } from "./rvm-model-loader.js";

const PI = Math.PI;
const D2R = PI / 180.0;
const R2D = 180.0 / PI;

// dps disagreement threshold (config.py KALMAN_OMEGA_DISAGREE_THRESHOLD_DPS).
export const KALMAN_OMEGA_DISAGREE_THRESHOLD_DPS = 10.0;

// ── vector helpers (3-vectors as [x,y,z]) ──────────────────────────────────
const vnorm = v => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const vscale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const vunit = v => vscale(v, 1 / vnorm(v));
const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
// dot of an (N×3) matrix with a 3-vector → (N,)
const matVec = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const colMeans = M => {
  const n = M.length;
  let x = 0, y = 0, z = 0;
  for (const r of M) { x += r[0]; y += r[1]; z += r[2]; }
  return [x / n, y / n, z / n];
};

// Wrap angle (rad) into (-pi, pi]  — matches R ((a+pi) %% 2pi) - pi.
export function angWrap(a) {
  const m = ((a + PI) % (2 * PI) + 2 * PI) % (2 * PI); // non-negative mod
  return m - PI;
}

// sample sd (N-1 denominator), matching R sd().
function sd(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  let acc = 0;
  for (const x of arr) acc += (x - mean) * (x - mean);
  return Math.sqrt(acc / (n - 1));
}

// ── per-sensor frame (R build_sensor_frame) ────────────────────────────────
// accel: (N×3) m/s², gyro: (N×3) rad/s.
function buildSensorFrame(accel, gyro) {
  const gMean = colMeans(gyro);
  const omegaMean = vnorm(gMean);
  const eRot = vscale(gMean, 1 / omegaMean);

  const aAxial = matVec(accel, eRot);                 // (N,)
  const aPlane = accel.map((r, i) => [
    r[0] - aAxial[i] * eRot[0],
    r[1] - aAxial[i] * eRot[1],
    r[2] - aAxial[i] * eRot[2]
  ]);
  const aPlaneMean = colMeans(aPlane);
  const cCentripetal = vnorm(aPlaneMean);
  const eRad = vscale(aPlaneMean, 1 / cCentripetal);
  const eTan = vunit(vcross(eRot, eRad));

  return {
    eRot, eRad, eTan,
    omegaMean,
    cCentripetal,
    rImplied: cCentripetal / (omegaMean * omegaMean)
  };
}

// ── project body-frame series onto rad / tan / rot axes (R project_signals) ─
function projectSignals(accel, gyro, frame) {
  return {
    aRad: matVec(accel, frame.eRad),
    aTan: matVec(accel, frame.eTan),
    omega: matVec(gyro, frame.eRot)
  };
}

// ── accel-only angle reference (R accel_theta), rad, in (-pi,pi] via atan2 ──
function accelTheta(aRad, aTan, cCentripetal) {
  return aRad.map((ar, i) => Math.atan2(-aTan[i], ar - cCentripetal));
}

// ── adaptive per-burst noise estimate (R estimate_sigma_theta) ─────────────
// Unwrap step-deltas, remove a linear-in-time trend (OLS), return sd(residual).
export function estimateSigmaTheta(thetaWrapped, t) {
  const n = thetaWrapped.length;
  // unwrap
  const thUnw = new Array(n);
  thUnw[0] = thetaWrapped[0];
  for (let i = 1; i < n; i++) {
    let d = thetaWrapped[i] - thetaWrapped[i - 1];
    d = d - 2 * PI * Math.round(d / (2 * PI));
    thUnw[i] = thUnw[i - 1] + d;
  }
  // OLS of thUnw on [1, t]  (intercept a + slope b·t)
  let tBar = 0, yBar = 0;
  for (let i = 0; i < n; i++) { tBar += t[i]; yBar += thUnw[i]; }
  tBar /= n; yBar /= n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const dtv = t[i] - tBar;
    sxy += dtv * (thUnw[i] - yBar);
    sxx += dtv * dtv;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = yBar - b * tBar;
  const resid = new Array(n);
  for (let i = 0; i < n; i++) resid[i] = thUnw[i] - (a + b * t[i]);
  return sd(resid);
}

// ── 3-state joint Kalman (R joint_kalman) ──────────────────────────────────
// t (N,), omegaB/omegaT projected gyro (rad/s), thetaB/thetaT accel angles (rad).
export function jointKalman(t, omegaB, omegaT, thetaB, thetaT, opts = {}) {
  const {
    sigmaOmegaB = 0.005, sigmaOmegaT = 0.005,
    sigmaThetaB = 0.05, sigmaThetaT = 0.07,
    sigmaBias = 1e-4, sigmaDelta = 1e-6,
    x0 = [NaN, 0, 0],
    P0diag = [PI * PI, 1e-2, PI * PI]
  } = opts;

  const N = t.length;
  let x1 = Number.isNaN(x0[0]) ? thetaB[0] : x0[0]; // theta
  let x2 = x0[1];                                    // b_omega
  let x3 = x0[2];                                    // delta_BT
  let p11 = P0diag[0], p22 = P0diag[1], p33 = P0diag[2];
  let p12 = 0, p13 = 0, p23 = 0;

  const qOm = 0.25 * (sigmaOmegaB * sigmaOmegaB + sigmaOmegaT * sigmaOmegaT);
  const sThB2 = sigmaThetaB * sigmaThetaB;
  const sThT2 = sigmaThetaT * sigmaThetaT;
  const sBias2 = sigmaBias * sigmaBias;
  const sDelta2 = sigmaDelta * sigmaDelta;

  const thetaOut = new Array(N);
  const bomegaOut = new Array(N);
  const deltaOut = new Array(N);
  const resBOut = new Array(N);
  const resTOut = new Array(N);

  for (let k = 0; k < N; k++) {
    if (k > 0) {
      const dt = t[k] - t[k - 1];
      // predict (F = I except F[1,2] = -dt)
      x1 = x1 - dt * x2 + 0.5 * dt * (omegaB[k] + omegaT[k]);
      const np11 = p11 - 2 * dt * p12 + dt * dt * p22 + dt * dt * qOm;
      const np12 = p12 - dt * p22;
      const np13 = p13 - dt * p23;
      p11 = np11; p12 = np12; p13 = np13;
      p22 = p22 + sBias2 * dt;
      p33 = p33 + sDelta2 * dt;
    }

    // bolt update: H_b = (1,0,0)
    const yb = angWrap(thetaB[k] - x1);
    const Sb = p11 + sThB2;
    const Kb1 = p11 / Sb, Kb2 = p12 / Sb, Kb3 = p13 / Sb;
    x1 += Kb1 * yb; x2 += Kb2 * yb; x3 += Kb3 * yb;
    {
      const np11 = p11 - Kb1 * p11;
      const np12 = p12 - Kb1 * p12;
      const np13 = p13 - Kb1 * p13;
      const np22 = p22 - Kb2 * p12;
      const np23 = p23 - Kb2 * p13;
      const np33 = p33 - Kb3 * p13;
      p11 = np11; p12 = np12; p13 = np13;
      p22 = np22; p23 = np23; p33 = np33;
    }
    resBOut[k] = yb;

    // tx update: H_t = (1,0,-1)
    const yt = angWrap(thetaT[k] - (x1 - x3));
    const St = p11 - 2 * p13 + p33 + sThT2;
    const HPa = p11 - p13;
    const HPb = p12 - p23;
    const HPc = p13 - p33;
    const Kt1 = HPa / St, Kt2 = HPb / St, Kt3 = HPc / St;
    x1 += Kt1 * yt; x2 += Kt2 * yt; x3 += Kt3 * yt;
    {
      const np11 = p11 - Kt1 * HPa;
      const np12 = p12 - Kt1 * HPb;
      const np13 = p13 - Kt1 * HPc;
      const np22 = p22 - Kt2 * HPb;
      const np23 = p23 - Kt2 * HPc;
      const np33 = p33 - Kt3 * HPc;
      p11 = np11; p12 = np12; p13 = np13;
      p22 = np22; p23 = np23; p33 = np33;
    }
    resTOut[k] = yt;

    thetaOut[k] = x1;
    bomegaOut[k] = x2;
    deltaOut[k] = x3;
  }

  return { theta: thetaOut, bOmega: bomegaOut, deltaBT: deltaOut, residualsBolt: resBOut, residualsTx: resTOut };
}

// ── top-level per-burst processor (R process_burst) ────────────────────────
// arrays: { tS:(N,), boltAccelG/txAccelG/boltGyroDps/txGyroDps: (N×3) }.
// Returns the burst_kalman.csv row fields (the golden 3-state outputs).
export function processBurst(arrays, opts = {}) {
  const {
    accelG0 = 9.81,
    gyroInDps = true,
    trueNorthOffsetDeg = 90,
    rotationSign = 1,
    estimateNoise = true,
    sigma = {}
  } = opts;

  const { tS, boltAccelG, txAccelG, boltGyroDps, txGyroDps } = arrays;
  const tsec = tS.map(v => v - tS[0]);

  const gScale = gyroInDps ? D2R : 1;
  const aB = boltAccelG.map(r => vscale(r, accelG0));
  const aT = txAccelG.map(r => vscale(r, accelG0));
  const gB = boltGyroDps.map(r => vscale(r, gScale));
  const gT = txGyroDps.map(r => vscale(r, gScale));

  const fB = buildSensorFrame(aB, gB);
  const fT = buildSensorFrame(aT, gT);
  const pB = projectSignals(aB, gB, fB);
  const pT = projectSignals(aT, gT, fT);
  const thB = accelTheta(pB.aRad, pB.aTan, fB.cCentripetal);
  const thT = accelTheta(pT.aRad, pT.aTan, fT.cCentripetal);

  const sig = {
    sigmaOmegaB: 0.005, sigmaOmegaT: 0.005,
    sigmaThetaB: 0.05, sigmaThetaT: 0.07,
    sigmaBias: 1e-4, sigmaDelta: 1e-6,
    ...sigma
  };
  if (estimateNoise) {
    sig.sigmaThetaB = Math.max(estimateSigmaTheta(thB, tsec), 1e-3);
    sig.sigmaThetaT = Math.max(estimateSigmaTheta(thT, tsec), 1e-3);
  }

  const fit = jointKalman(tsec, pB.omega, pT.omega, thB, thT, sig);

  const thetaRad = fit.theta.map(v => rotationSign * v);
  const N = thetaRad.length;
  const omegaBoltDps = fB.omegaMean * R2D;

  return {
    kalman_ok: true,
    omega_bolt_dps: omegaBoltDps,
    omega_tx_dps: fT.omegaMean * R2D,
    omega_burst_rpm: omegaBoltDps / 6.0,
    r_bolt_m: fB.rImplied,
    r_tx_m: fT.rImplied,
    delta_BT_deg: fit.deltaBT[N - 1] * R2D,
    bias_combined_dps: fit.bOmega[N - 1] * R2D,
    residual_bolt_sd_deg: sd(fit.residualsBolt) * R2D,
    residual_tx_sd_deg: sd(fit.residualsTx) * R2D,
    total_rotation_deg: (thetaRad[N - 1] - thetaRad[0]) * R2D,
    sigma_theta_b_used: sig.sigmaThetaB,
    sigma_theta_t_used: sig.sigmaThetaT,
    // per-sample (not in the csv summary, but the R per_sample columns)
    theta_world_deg: thetaRad.map(v => angWrap(v + trueNorthOffsetDeg * D2R) * R2D),
    theta_unwrap_deg: thetaRad.map(v => v * R2D)
  };
}

// ── lowered kernel leaves (referenced by the Kalman DESIRE model) ──────────
// Each is a scalar-returning leaf the model's derives call; they share one EKF
// run per (tS, boltAccelG) input via a tiny memo so the 4 derives don't refilter.
let _memoKey = null, _memoResult = null;
function runBurst(tS, ba, ta, bg, tg) {
  if (_memoKey && _memoKey.tS === tS && _memoKey.ba === ba) return _memoResult;
  _memoResult = processBurst({ tS, boltAccelG: ba, txAccelG: ta, boltGyroDps: bg, txGyroDps: tg });
  _memoKey = { tS, ba };
  return _memoResult;
}

export const kalmanFunctions = {
  kalman_rpm: (tS, ba, ta, bg, tg) => runBurst(tS, ba, ta, bg, tg).omega_burst_rpm,
  kalman_delta_bt: (tS, ba, ta, bg, tg) => runBurst(tS, ba, ta, bg, tg).delta_BT_deg,
  kalman_bias: (tS, ba, ta, bg, tg) => runBurst(tS, ba, ta, bg, tg).bias_combined_dps,
  kalman_disagree: (tS, ba, ta, bg, tg) => {
    const r = runBurst(tS, ba, ta, bg, tg);
    return Math.abs(r.omega_bolt_dps - r.omega_tx_dps) > KALMAN_OMEGA_DISAGREE_THRESHOLD_DPS ? 1 : 0;
  }
};

// ── the DESIRE model (loaded once) ─────────────────────────────────────────
const loadKalmanModelBody = createRvmModelBodyLoader({
  resolveFile: () => path.join(process.cwd(), "examples", "engentus", "app", "models", "kalman.rvm"),
  nodeName: "Kalman"
});

export async function kalmanModelBody(options = {}) {
  return loadKalmanModelBody(options);
}

// ── in-IR host-op handler for engentus.pipeline.kalman ─────────────────────
// Conforms to KalmanResultPayload { burst_start, omega_burst_rpm, delta_bt_deg,
// bias_combined_dps, omega_disagree_flag }. The stage runs THROUGH the model:
// the aligned IMU streams become model params; `evaluateModel` drives the
// lowered kernels and yields the payload scalars.
export function createKalmanInIrHandler({
  sampleSource,
  readFile = null,
  requireReadCapability = true,
  loadModelBody = null
} = {}) {
  if (typeof sampleSource !== "function")
    throw new Error("createKalmanInIrHandler: `sampleSource` (burst_start → aligned IMU streams) is required");
  const resolveModelBody = typeof loadModelBody === "function"
    ? loadModelBody
    : () => kalmanModelBody({ readFile, requireReadCapability });
  return createComputeHostOpHandler({
    resolveInputs: request => {
      const data = sampleSource(request.burst_start);
      if (!data) throw new Error(`kalman in-IR: no samples for burst_start '${request.burst_start}'`);
      return data;
    },
    compute: async data => {
      const body = await resolveModelBody();
      return evaluateModel(body, {
        functions: kalmanFunctions,
        params: {
          tS: data.tS, boltAccelG: data.boltAccelG, txAccelG: data.txAccelG,
          boltGyroDps: data.boltGyroDps, txGyroDps: data.txGyroDps
        }
      });
    },
    mapResponse: (ev, request) => ({
      burst_start: request.burst_start,
      omega_burst_rpm: ev.fields.omega_burst_rpm.data,
      delta_bt_deg: ev.fields.delta_bt_deg.data,
      bias_combined_dps: ev.fields.bias_combined_dps.data,
      omega_disagree_flag: ev.fields.omega_disagree_flag.data > 0.5
    })
  });
}
