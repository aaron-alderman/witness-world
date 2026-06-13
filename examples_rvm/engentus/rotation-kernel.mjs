// rotation-kernel.mjs — IN-IR sensor-orientation / rigid-body rotation math
// (the "quaternion"-equivalent alignment primitives).
//
// Faithful port of example-ports/engentus-pipeline/analysis/mill/alignment.py:
//   rotation_matrix_z, rotation_matrix_from_vectors (Rodrigues vector-align),
//   _derotate_body_frame_samples / _rerotate_gravity_frame_samples,
//   OrientationEstimate.rotation_matrix, and _estimate_sensor_orientation.
//
// This is the Python alignment stage. It is NOT in the canonical R pipeline and
// is currently unused, but is ported here because it exists and may be revived
// (per user direction). Verified against the Python originals to machine
// precision (test/desire-engentus-rotation-real.test.js). Uses the verified
// single-harmonic fit from burst-fit-kernel for the gravity-phase step.

import { fitBurstHarmonics } from "./burst-fit-kernel.mjs";

// CANONICAL_AXIS (alignment.py line 40): the drum spin axis maps to +Z.
export const CANONICAL_AXIS = [0, 0, 1];

const norm3 = v => Math.hypot(v[0], v[1], v[2]);
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clip = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const eye3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// 3×3 matrix product A·B
const matMul3 = (A, B) => A.map(row =>
  [0, 1, 2].map(j => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
// 3×3 · 3-vector
export const matVec3 = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
];
const skew = a => [
  [0, -a[2], a[1]],
  [a[2], 0, -a[0]],
  [-a[1], a[0], 0]
];
const matAdd3 = (A, B) => A.map((r, i) => r.map((x, j) => x + B[i][j]));
const matScale3 = (A, s) => A.map(r => r.map(x => x * s));

// rotation_matrix_z(angle): right-handed rotation about +Z.
export function rotationMatrixZ(angleRadians) {
  const c = Math.cos(angleRadians), s = Math.sin(angleRadians);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

// rotation_matrix_from_vectors(source, target): smallest rotation mapping the
// source unit vector onto the target unit vector (Rodrigues). Handles the
// parallel (identity) and antiparallel (180°) degenerate cases exactly as
// alignment.py.
export function rotationMatrixFromVectors(source, target) {
  const sn = norm3(source), tn = norm3(target);
  if (!Number.isFinite(sn) || sn <= 0) throw new Error("Source vector for rotation recovery is invalid.");
  if (!Number.isFinite(tn) || tn <= 0) throw new Error("Target vector for rotation recovery is invalid.");
  const su = source.map(x => x / sn);
  const tu = target.map(x => x / tn);
  const cr = cross3(su, tu);
  const crNorm = norm3(cr);
  const d = clip(dot3(su, tu), -1, 1);

  if (crNorm <= 1e-12) {
    if (d >= 0) return eye3();
    // antiparallel: 180° about any axis orthogonal to source.
    let orthogonal = [1, 0, 0];
    if (Math.abs(dot3(orthogonal, su)) > 0.9) orthogonal = [0, 1, 0];
    let axis = cross3(su, orthogonal);
    const an = norm3(axis);
    axis = axis.map(x => x / an);
    const sk = skew(axis);
    return matAdd3(eye3(), matScale3(matMul3(sk, sk), 2));
  }

  const axis = cr.map(x => x / crNorm);
  const sk = skew(axis);
  const angle = Math.acos(d);
  return matAdd3(
    matAdd3(eye3(), matScale3(sk, Math.sin(angle))),
    matScale3(matMul3(sk, sk), 1 - Math.cos(angle))
  );
}

// _derotate_body_frame_samples: rotate the in-plane (X,Y) components by −theta(t)
// per sample; Z passes through. bodyVectors = [X[], Y[], Z[]].
export function derotateBodyFrame(bodyVectors, thetaRadians) {
  const [X, Y, Z] = bodyVectors;
  const n = X.length;
  const rx = new Array(n), ry = new Array(n), rz = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.cos(thetaRadians[i]), s = Math.sin(thetaRadians[i]);
    rx[i] = c * X[i] + s * Y[i];
    ry[i] = -s * X[i] + c * Y[i];
    rz[i] = Z[i];
  }
  return [rx, ry, rz];
}

// _rerotate_gravity_frame_samples: inverse of the de-rotation (rotate by +theta).
export const rerotateGravityFrame = (gravityVectors, thetaRadians) =>
  derotateBodyFrame(gravityVectors, thetaRadians.map(t => -t));

// OrientationEstimate.rotation_matrix = R_z(−yaw) · axis_rotation.
export const orientationRotationMatrix = (yawRadians, axisRotation) =>
  matMul3(rotationMatrixZ(-yawRadians), axisRotation);

const nanmean = a => {
  let s = 0, n = 0;
  for (const x of a) if (Number.isFinite(x)) { s += x; n++; }
  return n ? s / n : NaN;
};

// _estimate_sensor_orientation: from gyro bursts derive the spin axis (→ axis
// rotation onto +Z); from accel bursts derive the gravity phase (→ yaw).
// gyroBursts: [{X,Y,Z}], accelBursts: [{X,Y,Z,time_seconds,omega}].
// Returns { axis_sensor, axis_rotation, yaw_radians, phase0_vector_raw, rotation_matrix }.
export function estimateSensorOrientation({ gyroBursts, accelBursts }) {
  if (!gyroBursts?.length) throw new Error("No gyro bursts were available.");
  if (!accelBursts?.length) throw new Error("No accelerometer bursts were available.");

  // axis: sum of per-burst mean gyro vectors (each weighted by its own
  // magnitude, i.e. the raw mean vectors summed), then normalised.
  let axisAcc = [0, 0, 0];
  for (const b of gyroBursts) {
    const mv = [nanmean(b.X), nanmean(b.Y), nanmean(b.Z)];
    const mag = norm3(mv);
    if (!Number.isFinite(mag) || mag <= 0) continue;
    // (mv/mag)*mag == mv
    axisAcc = [axisAcc[0] + mv[0], axisAcc[1] + mv[1], axisAcc[2] + mv[2]];
  }
  const axisNorm = norm3(axisAcc);
  if (!Number.isFinite(axisNorm) || axisNorm <= 0) throw new Error("Gyro axis estimation failed.");
  const axisSensor = axisAcc.map(x => x / axisNorm);
  const axisRotation = rotationMatrixFromVectors(axisSensor, CANONICAL_AXIS);

  // gravity phase: rotate accel by axis_rotation, harmonic-fit the X and Y
  // components, accumulate the cos-coefficient vectors weighted by magnitude.
  let phase0 = [0, 0];
  for (const b of accelBursts) {
    const rot = matRotateColumns(axisRotation, [b.X, b.Y, b.Z]);
    const f1 = fitBurstHarmonics({ g: rot[0], times: b.time_seconds, rpm: omegaToRpm(b.omega), harmonics: 1, drift: false });
    const f2 = fitBurstHarmonics({ g: rot[1], times: b.time_seconds, rpm: omegaToRpm(b.omega), harmonics: 1, drift: false });
    const v = [f1.cos_coeff, f2.cos_coeff];
    const w = Math.hypot(v[0], v[1]);
    if (!Number.isFinite(w) || w <= 0) continue;
    phase0 = [phase0[0] + v[0] * w, phase0[1] + v[1] * w];
  }
  const phase0Norm = Math.hypot(phase0[0], phase0[1]);
  if (!Number.isFinite(phase0Norm) || phase0Norm <= 0) throw new Error("Gravity reference estimation failed.");
  const yaw = Math.atan2(phase0[1], phase0[0]);

  return {
    axis_sensor: axisSensor,
    axis_rotation: axisRotation,
    yaw_radians: yaw,
    phase0_vector_raw: phase0,
    rotation_matrix: orientationRotationMatrix(yaw, axisRotation)
  };
}

// apply a 3×3 rotation to three column signals [X[],Y[],Z[]] → [X'[],Y'[],Z'[]]
function matRotateColumns(R, cols) {
  const [X, Y, Z] = cols;
  const n = X.length;
  const out = [new Array(n), new Array(n), new Array(n)];
  for (let i = 0; i < n; i++) {
    const v = matVec3(R, [X[i], Y[i], Z[i]]);
    out[0][i] = v[0]; out[1][i] = v[1]; out[2][i] = v[2];
  }
  return out;
}

const omegaToRpm = omega => omega * 60 / (2 * Math.PI);
