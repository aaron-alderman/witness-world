#!/usr/bin/env python3
"""Export aligned IMU arrays for ALL available Kalman bursts (bolts 5/6/7) to JSON.

Same alignment path as export_kalman_burst.py, but loops over every burst the
gyro cache covers, so the in-IR Kalman kernel can be characterised against the
golden across many bursts (stable vs numerically-divergent).

Run from analysis/ with PYTHONPATH=. :
    PYTHONPATH=. python ../../../examples_rvm/engentus/tools/export_kalman_bursts_multi.py
Output: examples_rvm/engentus/fixtures/kalman-bursts-B01.json
"""
import gzip
import json
import math
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from mill.model import assign_bursts_to_samples, normalize_accelerometer
from mill.kalman import (
    _align_arrays, _assign_gyro_to_bursts_local, _build_accel_index,
    _build_gyro_index, _GYRO_BOLT_PREFIX, _GYRO_TX_PREFIX,
)

REPO = Path(__file__).resolve().parents[3]
CACHE = REPO / "example-ports/engentus-pipeline/analysis/output/B01/cache"
GOLDEN = REPO / "example-ports/engentus-pipeline/analysis/output/B01/outputs/burst_kalman.csv"
OUT = REPO / "examples_rvm/engentus/fixtures/kalman-bursts-B01.json"
MAX_BURSTS = 8


def load(name):
    with gzip.open(CACHE / f"{name}.pkl.gz", "rb") as fh:
        return pickle.load(fh)


def main():
    db = load("db_query_cache")
    registry, bursts, samples = db["registry"], db["bursts"], db["samples"]
    bolt_gyro = load("plot_sensor_cache")["bolt_gyro"]

    accel = samples.copy()
    accel["value_g"] = normalize_accelerometer(accel["value"])
    accel_assigned = assign_bursts_to_samples(
        accel[["sensor_id", "timestamp", "value_g"]], registry, bursts, verbose=False)
    accel_index = _build_accel_index(accel_assigned)
    gyro_index = _build_gyro_index(_assign_gyro_to_bursts_local(bolt_gyro, bursts))

    golden = pd.read_csv(GOLDEN)
    golden["bs"] = golden["burst_start_utc"].astype(str)

    # bursts that have all four streams
    keys = sorted({(b, s) for (b, s, m) in accel_index.keys()})
    out_bursts = []
    for (bolt, bs) in keys:
        ba = accel_index.get((bolt, bs, "bolt"))
        ta = accel_index.get((bolt, bs, "shell"))
        bg = gyro_index.get((bolt, bs, _GYRO_BOLT_PREFIX))
        tg = gyro_index.get((bolt, bs, _GYRO_TX_PREFIX))
        if any(v is None for v in (ba, ta, bg, tg)):
            continue
        aligned = _align_arrays(ba, ta, bg, tg)
        if aligned is None:
            continue
        ba_g, ta_g, bg_d, tg_d, t_s, _ = aligned
        bs_str = str(pd.Timestamp(bs))
        grow = golden[(golden["bolt_number"] == bolt) & (golden["bs"] == bs_str)]
        if grow.empty or not bool(grow.iloc[0]["kalman_ok"]):
            continue
        grow = grow.iloc[0]
        out_bursts.append({
            "bolt_number": int(bolt),
            "burst_start_utc": bs_str,
            "n_samples": int(len(t_s)),
            "t_s": [float(x) for x in t_s],
            "bolt_accel_g": ba_g.astype(float).tolist(),
            "tx_accel_g": ta_g.astype(float).tolist(),
            "bolt_gyro_dps": bg_d.astype(float).tolist(),
            "tx_gyro_dps": tg_d.astype(float).tolist(),
            "golden": {k: (None if (isinstance(grow[k], float) and pd.isna(grow[k])) else
                           (float(grow[k]) if k in (
                               "omega_bolt_dps", "omega_tx_dps", "omega_burst_rpm",
                               "r_bolt_m", "r_tx_m", "delta_BT_deg", "bias_combined_dps",
                               "residual_bolt_sd_deg", "residual_tx_sd_deg",
                               "total_rotation_deg", "sigma_theta_b_used", "sigma_theta_t_used")
                            else None))
                       for k in golden.columns if k != "bs"},
        })
        if len(out_bursts) >= MAX_BURSTS:
            break

    doc = {"_note": "Real aligned IMU streams for multiple B01 bursts (bolts 5/6/7) + golden rows.",
           "mill": "B01", "bursts": out_bursts}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc), encoding="utf-8")
    print(f"wrote {OUT} — {len(out_bursts)} bursts")


if __name__ == "__main__":
    main()
