#!/usr/bin/env python3
"""Export the aligned per-sample IMU arrays for ONE Kalman burst to JSON.

The joint Kalman rotation-angle estimator (R `mill_bolt_angle.R::joint_kalman`,
the 3-state model that produced burst_kalman.csv) consumes four time-aligned
3-axis streams — bolt accel, TX accel, bolt gyro, TX gyro — plus a seconds
vector. Those come from the DB + the alignment stage (assign-to-bursts, pivot,
merge_asof). This script replays that alignment for one burst USING THE REAL
pipeline functions against the cached DB data, and dumps the aligned arrays so
the in-IR Kalman kernel can be verified against the REAL signal + golden row
without Python/pandas at test time.

Run from analysis/ (so the `mill` package imports):
    cd example-ports/engentus-pipeline/analysis
    python ../../../examples_rvm/engentus/tools/export_kalman_burst.py

Source : output/B01/cache/{db_query_cache,plot_sensor_cache}.pkl.gz  (+ golden burst_kalman.csv)
Output : examples_rvm/engentus/fixtures/kalman-burst-B01.json
"""
import gzip
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from mill.model import assign_bursts_to_samples, normalize_accelerometer
from mill.kalman import (
    _align_arrays,
    _assign_gyro_to_bursts_local,
    _build_accel_index,
    _build_gyro_index,
    _GYRO_BOLT_PREFIX,
    _GYRO_TX_PREFIX,
)

HERE = Path(__file__).resolve()
REPO = HERE.parents[3]
CACHE = REPO / "example-ports/engentus-pipeline/analysis/output/B01/cache"
GOLDEN = REPO / "example-ports/engentus-pipeline/analysis/output/B01/outputs/burst_kalman.csv"
OUT = REPO / "examples_rvm/engentus/fixtures/kalman-burst-B01.json"

BOLT = 5
BURST_START = pd.Timestamp("2026-04-02 16:23:44+00:00")


def load(name):
    with gzip.open(CACHE / f"{name}.pkl.gz", "rb") as fh:
        return pickle.load(fh)


def main():
    db = load("db_query_cache")
    registry, bursts, samples = db["registry"], db["bursts"], db["samples"]
    plot = load("plot_sensor_cache")
    bolt_gyro = plot["bolt_gyro"]

    # ── accel: normalize → assign to bursts → pre-pivot index ────────────────
    accel = samples.copy()
    accel["value_g"] = normalize_accelerometer(accel["value"])
    accel_assigned = assign_bursts_to_samples(
        accel[["sensor_id", "timestamp", "value_g"]], registry, bursts, verbose=False
    )
    accel_index = _build_accel_index(accel_assigned)

    # ── gyro: assign to bursts → pre-pivot index ─────────────────────────────
    gyro_assigned = _assign_gyro_to_bursts_local(bolt_gyro, bursts)
    gyro_index = _build_gyro_index(gyro_assigned)

    ba = accel_index.get((BOLT, BURST_START, "bolt"))
    ta = accel_index.get((BOLT, BURST_START, "shell"))
    bg = gyro_index.get((BOLT, BURST_START, _GYRO_BOLT_PREFIX))
    tg = gyro_index.get((BOLT, BURST_START, _GYRO_TX_PREFIX))
    if any(v is None for v in (ba, ta, bg, tg)):
        raise SystemExit(f"missing IMU stream: ba={ba is not None} ta={ta is not None} "
                         f"bg={bg is not None} tg={tg is not None}")

    aligned = _align_arrays(ba, ta, bg, tg)
    if aligned is None:
        raise SystemExit("alignment failed")
    bolt_accel_g, tx_accel_g, bolt_gyro_dps, tx_gyro_dps, t_s, _ = aligned

    # sanity: mean-rate diagnostic should match the golden omega_bolt_dps
    import math
    g_mean = np.mean(bolt_gyro_dps.astype(float), axis=0) * (math.pi / 180.0)
    omega_bolt_dps = float(np.linalg.norm(g_mean)) * 180.0 / math.pi

    golden = pd.read_csv(GOLDEN)
    grow = golden[(golden["bolt_number"] == BOLT)
                  & (golden["burst_start_utc"].astype(str).str.startswith("2026-04-02 16:23:44"))].iloc[0]

    doc = {
        "_note": ("Real aligned per-sample IMU streams for mill B01, bolt %d, burst %s, "
                  "lifted by examples_rvm/engentus/tools/export_kalman_burst.py via the real "
                  "pipeline alignment (assign-to-bursts + pivot + merge_asof). Used to verify "
                  "the in-IR joint Kalman kernel (R 3-state model) against the golden "
                  "burst_kalman.csv row." % (BOLT, BURST_START)),
        "mill": "B01",
        "bolt_number": BOLT,
        "burst_start_utc": str(BURST_START),
        "n_samples": int(len(t_s)),
        "t_s": [float(x) for x in t_s],
        "bolt_accel_g": bolt_accel_g.astype(float).tolist(),
        "tx_accel_g": tx_accel_g.astype(float).tolist(),
        "bolt_gyro_dps": bolt_gyro_dps.astype(float).tolist(),
        "tx_gyro_dps": tx_gyro_dps.astype(float).tolist(),
        "reconstructed_omega_bolt_dps": omega_bolt_dps,
        "golden": {k: (None if (isinstance(grow[k], float) and pd.isna(grow[k])) else
                       (bool(grow[k]) if isinstance(grow[k], (bool, np.bool_)) else
                        (float(grow[k]) if k not in ("bolt_number", "burst_start_utc", "skip_reason", "kalman_ok")
                         else (str(grow[k]) if k in ("burst_start_utc", "skip_reason") else
                               (bool(grow[k]) if k == "kalman_ok" else int(grow[k]))))))
                   for k in golden.columns},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc), encoding="utf-8")
    print(f"wrote {OUT} — {doc['n_samples']} samples")
    print(f"  reconstructed omega_bolt_dps = {omega_bolt_dps:.10f}")
    print(f"  golden        omega_bolt_dps = {float(grow['omega_bolt_dps']):.10f}")
    print(f"  delta = {abs(omega_bolt_dps - float(grow['omega_bolt_dps'])):.3e}")


if __name__ == "__main__":
    main()
