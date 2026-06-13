#!/usr/bin/env python3
"""Python oracle for the rotation / orientation alignment kernel.

Runs the REAL alignment.py primitives (rotation_matrix_z,
rotation_matrix_from_vectors, _derotate_body_frame_samples,
_estimate_sensor_orientation) on a mix of synthetic vectors + the real B01
burst (lifted in the Kalman fixture) and dumps results as JSON, so the in-IR JS
rotation kernel can be verified against the Python originals (this stage is
Python-only / not canonical R, but ported because it exists).

Run from analysis/ with PYTHONPATH=. :
    PYTHONPATH=. python ../../../examples_rvm/engentus/tools/run_py_rotation.py
Output: examples_rvm/engentus/fixtures/rotation-oracle.json
"""
import json
import math
from pathlib import Path

import numpy as np

from mill.alignment import (
    rotation_matrix_z, rotation_matrix_from_vectors,
    _derotate_body_frame_samples, _estimate_sensor_orientation, CANONICAL_AXIS,
)

REPO = Path(__file__).resolve().parents[3]
KFIX = REPO / "examples_rvm/engentus/fixtures/kalman-burst-B01.json"
OUT = REPO / "examples_rvm/engentus/fixtures/rotation-oracle.json"


def m2l(m):
    return [[float(x) for x in row] for row in np.asarray(m)]


def main():
    # ── synthetic rotation primitives ───────────────────────────────────────
    z_cases = [0.0, 0.5, math.pi / 3, -1.2345, math.pi]
    z_mats = [m2l(rotation_matrix_z(a)) for a in z_cases]

    vec_cases = [
        ([1.0, 0.0, 0.0], [0.0, 1.0, 0.0]),      # 90° general
        ([0.2, -0.7, 0.5], [0.0, 0.0, 1.0]),     # arbitrary → canonical Z
        ([0.0, 0.0, 1.0], [0.0, 0.0, 1.0]),      # parallel → identity
        ([0.0, 0.0, 1.0], [0.0, 0.0, -1.0]),     # antiparallel (degenerate)
        ([1.0, 0.0, 0.0], [-1.0, 0.0, 0.0]),     # antiparallel along X
    ]
    vec_mats = [m2l(rotation_matrix_from_vectors(np.array(s), np.array(t))) for s, t in vec_cases]

    # de-rotate a small body-frame signal
    body = np.array([[1.0, 2.0, 3.0, 4.0], [0.5, -0.5, 0.25, -0.25], [9.0, 9.0, 9.0, 9.0]])
    theta = np.array([0.0, 0.3, 0.6, 0.9])
    derot = m2l(_derotate_body_frame_samples(body, theta))

    # ── full orientation estimate on the REAL B01 burst ─────────────────────
    kfix = json.loads(KFIX.read_text())
    n = kfix["n_samples"]
    t_s = kfix["t_s"]
    bg = np.asarray(kfix["bolt_gyro_dps"], dtype=float)   # (N,3) dps
    ba = np.asarray(kfix["bolt_accel_g"], dtype=float)    # (N,3) g
    # omega for the harmonic fit: mean |gyro| (rad/s)
    omega = float(np.linalg.norm(np.mean(bg, axis=0) * math.pi / 180.0))
    gyro_bursts = [{"X": bg[:, 0], "Y": bg[:, 1], "Z": bg[:, 2]}]
    accel_bursts = [{
        "X": ba[:, 0], "Y": ba[:, 1], "Z": ba[:, 2],
        "time_seconds": np.asarray(t_s, dtype=float), "omega": omega,
    }]
    est = _estimate_sensor_orientation(
        bolt_number=5, mount="bolt", row_label_text="23",
        gyro_bursts=gyro_bursts, accel_bursts=accel_bursts)

    doc = {
        "_note": "Python oracle for the rotation/orientation kernel (real alignment.py).",
        "rotation_matrix_z": {"angles": z_cases, "matrices": z_mats},
        "rotation_matrix_from_vectors": {
            "cases": [{"source": s, "target": t} for s, t in vec_cases],
            "matrices": vec_mats,
        },
        "derotate": {"body": m2l(body), "theta": [float(x) for x in theta], "result": derot},
        "orientation": {
            "burst": {
                "bolt_gyro_dps": kfix["bolt_gyro_dps"], "bolt_accel_g": kfix["bolt_accel_g"],
                "time_seconds": t_s, "omega": omega, "n_samples": n,
            },
            "axis_sensor": [float(x) for x in est.axis_sensor],
            "axis_rotation": m2l(est.axis_rotation),
            "yaw_radians": float(est.yaw_radians),
            "phase0_vector_raw": [float(x) for x in est.phase0_vector_raw],
            "rotation_matrix": m2l(est.rotation_matrix),
        },
        "canonical_axis": [float(x) for x in CANONICAL_AXIS],
    }
    OUT.write_text(json.dumps(doc))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
