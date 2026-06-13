// prepare-angles-kernel.mjs — IN-IR per-burst angle stage (PIPELINE prepare / R Stage 5).
//
// Faithful port of the canonical R angle helpers in
// example-ports/engentus-pipeline-r/R/prepare.R:
//   cf_filter (complementary filter), fit_rotation_angle (TDC reference),
//   and the theta_acc / add_angles wiring.
// R is canonical for this pipeline; verified against R's own add_angles output
// to machine precision (test/desire-engentus-prepare-angles-real.test.js).
//
// Three per-burst, per-sample angle series (degrees), from bolt IMU only:
//   theta_acc_deg      = atan2(ay, az) · 180/π                 (accel-only)
//   theta_filt_deg     = complementary filter (α=0.98) of gyro + accel angle
//   rotation_angle_deg = TDC-referenced rotation (0° at az max), ±180°
//
// Constants from prepare.R: dt_s = 1/20 s, cf_alpha = 0.98.

const R2D = 180.0 / Math.PI;
const D2R = Math.PI / 180.0;
const DT_S = 1 / 20;
const CF_ALPHA = 0.98;

// R's %% (result takes the sign of the divisor — always non-negative here).
const rmod = (x, m) => ((x % m) + m) % m;
// normalise degrees to (-180, 180]  →  R's ((x + 180) %% 360) - 180.
const norm180 = x => rmod(x + 180, 360) - 180;

const mean = a => {
  let s = 0, n = 0;
  for (const x of a) { if (Number.isFinite(x)) { s += x; n++; } }
  return n ? s / n : NaN;
};

// theta_acc (deg): atan2(ay, az) · 180/π
export function thetaAcc(ay, az) {
  return ay.map((y, i) => Math.atan2(y, az[i]) * R2D);
}

// Complementary filter (R cf_filter): high-pass gyro integration + low-pass
// accel angle, shortest-arc wrap correction. Returns theta_filt in degrees
// (unwrapped — may exceed ±180 across rotations).
export function cfFilter(ay, az, gx, { dtS = DT_S, cfAlpha = CF_ALPHA } = {}) {
  const n = ay.length;
  const thetaAccDeg = ay.map((y, i) => Math.atan2(y, az[i]) * R2D);
  const thetaFilt = new Array(n);
  thetaFilt[0] = thetaAccDeg[0];
  for (let i = 1; i < n; i++) {
    const gyroPred = thetaFilt[i - 1] + gx[i] * dtS;
    const delta = norm180(thetaAccDeg[i] - gyroPred);
    thetaFilt[i] = gyroPred + (1 - cfAlpha) * delta;
  }
  return thetaFilt;
}

// Solve a 3-parameter OLS  X·β = y  (X = [1, cos, sin]) via normal equations,
// matching R lm.fit(cbind(1, cos, sin), y) for a well-conditioned design.
// Returns [c0, c1, c2] or null if singular.
function ols3(cosT, sinT, y, keep) {
  // accumulate XtX (symmetric 3x3) and Xty
  let s11 = 0, s12 = 0, s13 = 0, s22 = 0, s23 = 0, s33 = 0;
  let b1 = 0, b2 = 0, b3 = 0;
  for (let i = 0; i < y.length; i++) {
    if (!keep[i]) continue;
    const c = cosT[i], s = sinT[i], yi = y[i];
    s11 += 1;       s12 += c;        s13 += s;
    s22 += c * c;   s23 += c * s;    s33 += s * s;
    b1 += yi;       b2 += c * yi;    b3 += s * yi;
  }
  // 3x3 solve (Cramer's rule)
  const A = [[s11, s12, s13], [s12, s22, s23], [s13, s23, s33]];
  const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
            - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
            + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return null;
  const b = [b1, b2, b3];
  const col = (M, j, v) => M.map((r, i) => r.map((x, k) => (k === j ? v[i] : x)));
  const det3 = M =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  return [det3(col(A, 0, b)) / det, det3(col(A, 1, b)) / det, det3(col(A, 2, b)) / det];
}

// Rotation angle referenced to TDC (R fit_rotation_angle): fix omega from mean
// gyro rate, fit a·cos + b·sin + C via OLS, derive phase phi so the cosine
// peaks at rotation_angle = 0. Returns degrees in ±180°, or all-NaN when the
// burst is too slow / degenerate (matches R's NA returns).
export function fitRotationAngle(tS, az, gx) {
  const n = tS.length;
  const nan = () => new Array(n).fill(NaN);
  const omega = Math.abs(mean(gx)) * D2R; // rad/s
  if (!Number.isFinite(omega) || omega < 0.05) return nan();

  const cosT = tS.map(t => Math.cos(omega * t));
  const sinT = tS.map(t => Math.sin(omega * t));
  const keep = az.map((v, i) => Number.isFinite(v) && Number.isFinite(cosT[i]) && Number.isFinite(sinT[i]));
  if (keep.reduce((s, k) => s + (k ? 1 : 0), 0) < 3) return nan();

  const cf = ols3(cosT, sinT, az, keep);
  if (!cf) return nan();
  const a = cf[1], b = cf[2];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return nan();

  const phi = Math.atan2(-b, a); // phase where cosine peaks (= TDC)
  return tS.map(t => norm180((omega * t + phi) * R2D));
}

// add_angles (R): given a burst's bolt IMU series, return the three angle
// columns. sampleIdx is the per-sample index (R uses (idx - idx[0])·dt_s for t).
export function addAngles({ ayBoltG, azBoltG, gxBoltDps, sampleIdx }, opts = {}) {
  const dtS = opts.dtS ?? DT_S;
  const idx0 = sampleIdx[0];
  const tS = sampleIdx.map(i => (i - idx0) * dtS);
  return {
    theta_acc_deg: thetaAcc(ayBoltG, azBoltG),
    theta_filt_deg: cfFilter(ayBoltG, azBoltG, gxBoltDps, { dtS, cfAlpha: opts.cfAlpha ?? CF_ALPHA }),
    rotation_angle_deg: fitRotationAngle(tS, azBoltG, gxBoltDps)
  };
}
