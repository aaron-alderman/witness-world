import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  rotationMatrixZ, rotationMatrixFromVectors, derotateBodyFrame, rerotateGravityFrame,
  estimateSensorOrientation, orientationRotationMatrix, matVec3, CANONICAL_AXIS
} from "../examples_rvm/engentus/rotation-kernel.mjs";

// ── rotation / orientation alignment (Python alignment.py) ──
//
// rotation-kernel.mjs ports the Python orientation primitives. This stage is
// Python-only (not canonical R) and currently unused, but ported because it
// exists and may be revived. The fixture is the REAL alignment.py output
// (tools/run_py_rotation.py) on synthetic vectors + the real B01 burst.

const FIX = path.join(process.cwd(), "examples_rvm", "engentus", "fixtures");
const o = JSON.parse(readFileSync(path.join(FIX, "rotation-oracle.json"), "utf8"));

const mmax = (A, B) => {
  let m = 0;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < A[i].length; j++) m = Math.max(m, Math.abs(A[i][j] - B[i][j]));
  return m;
};
const vmax = (a, b) => a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);

test("rotation_matrix_z matches Python exactly", () => {
  o.rotation_matrix_z.angles.forEach((a, i) => {
    assert.ok(mmax(rotationMatrixZ(a), o.rotation_matrix_z.matrices[i]) < 1e-15);
  });
});

test("rotation_matrix_from_vectors matches Python (incl. parallel + antiparallel)", () => {
  o.rotation_matrix_from_vectors.cases.forEach((c, i) => {
    const R = rotationMatrixFromVectors(c.source, c.target);
    assert.ok(mmax(R, o.rotation_matrix_from_vectors.matrices[i]) < 1e-14,
      `case ${JSON.stringify(c)}`);
  });
});

test("a vector-align rotation actually maps source → target (unit)", () => {
  const src = [0.2, -0.7, 0.5], tgt = [0, 0, 1];
  const R = rotationMatrixFromVectors(src, tgt);
  const sn = Math.hypot(...src);
  const mapped = matVec3(R, src.map(x => x / sn));
  assert.ok(vmax(mapped, tgt) < 1e-12, `mapped ${mapped}`);
});

test("derotate matches Python; rerotate is its exact inverse", () => {
  const dr = derotateBodyFrame(o.derotate.body, o.derotate.theta);
  assert.ok(mmax(dr, o.derotate.result) < 1e-15);
  const back = rerotateGravityFrame(dr, o.derotate.theta);
  assert.ok(mmax(back, o.derotate.body) < 1e-12, "rerotate(derotate(x)) == x");
});

test("the full orientation estimate matches Python on the REAL B01 burst", () => {
  const b = o.orientation.burst;
  const ba = b.bolt_accel_g, bg = b.bolt_gyro_dps;
  const est = estimateSensorOrientation({
    gyroBursts: [{ X: bg.map(r => r[0]), Y: bg.map(r => r[1]), Z: bg.map(r => r[2]) }],
    accelBursts: [{
      X: ba.map(r => r[0]), Y: ba.map(r => r[1]), Z: ba.map(r => r[2]),
      time_seconds: b.time_seconds, omega: b.omega
    }]
  });
  assert.ok(vmax(est.axis_sensor, o.orientation.axis_sensor) < 1e-14, "axis_sensor");
  assert.ok(mmax(est.axis_rotation, o.orientation.axis_rotation) < 1e-14, "axis_rotation");
  assert.ok(Math.abs(est.yaw_radians - o.orientation.yaw_radians) < 1e-12, "yaw");
  assert.ok(mmax(est.rotation_matrix, o.orientation.rotation_matrix) < 1e-12, "rotation_matrix");
});

test("axis_rotation sends the estimated spin axis onto the canonical +Z", () => {
  const est0 = o.orientation;
  const mapped = matVec3(est0.axis_rotation, est0.axis_sensor);
  assert.deepEqual(CANONICAL_AXIS, [0, 0, 1]);
  assert.ok(Math.hypot(mapped[0] - 0, mapped[1] - 0, mapped[2] - 1) < 1e-12,
    `axis maps to ${mapped}`);
});

test("orientationRotationMatrix composes R_z(-yaw)·axis_rotation", () => {
  const est0 = o.orientation;
  const R = orientationRotationMatrix(est0.yaw_radians, est0.axis_rotation);
  assert.ok(mmax(R, est0.rotation_matrix) < 1e-13);
});
