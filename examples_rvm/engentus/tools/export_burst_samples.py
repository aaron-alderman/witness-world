#!/usr/bin/env python3
"""Export real per-sample burst signals to a portable JSON fixture.

Reads the (gzipped-pickle) package_trace_cache the engentus Python pipeline
writes, and emits the per-package per-sample arrays for ONE burst as plain JSON
so the in-IR DESIRE kernels can be verified against the REAL signal (not a
reconstruction) without Python or the pickle at test time.

This is the bridge the fidelity work needed: the raw/processed samples live only
in the pickle caches / Postgres; this script lifts a small, committed slice into
the repo. Run from the repo root:

    python examples_rvm/engentus/tools/export_burst_samples.py

Source : example-ports/engentus-pipeline/analysis/output/B01/cache/package_trace_cache.pkl.gz
Output : examples_rvm/engentus/fixtures/burst-samples-B01.json
"""
import gzip
import json
import pickle
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
CACHE = REPO / "example-ports/engentus-pipeline/analysis/output/B01/cache/package_trace_cache.pkl.gz"
OUT = REPO / "examples_rvm/engentus/fixtures/burst-samples-B01.json"
BURST_PREFIX = "2026-04-02 16:23:44"  # the first burst (matches burst_rotation.csv row 0)

# per-package arrays to lift (the in-IR fit inputs)
ARRAY_COLS = ["time_seconds", "magnitude_g", "filtered_x_g", "filtered_y_g", "filtered_z_g", "good_sample_mask"]
SCALAR_COLS = ["bolt_number", "mount", "row_label", "sample_count", "good_sample_count", "good_fraction", "magnitude_span_g"]


def jsonable(v):
    arr = np.asarray(v)
    if arr.dtype == bool:
        return [bool(x) for x in arr]
    out = []
    for x in arr.tolist():
        out.append(None if isinstance(x, float) and (np.isnan(x)) else x)
    return out


def main():
    with gzip.open(CACHE, "rb") as fh:
        cache = pickle.load(fh)
    frame = cache["frame"].copy()
    frame["bs"] = frame["burst_start"].astype(str)
    sub = frame[frame["bs"].str.startswith(BURST_PREFIX)]
    if sub.empty:
        raise SystemExit(f"no packages for burst {BURST_PREFIX}")

    packages = []
    for _, r in sub.iterrows():
        pkg = {c: (int(r[c]) if c in ("bolt_number", "sample_count", "good_sample_count", "row_label")
                   else (float(r[c]) if c in ("good_fraction", "magnitude_span_g") else r[c]))
               for c in SCALAR_COLS}
        for c in ARRAY_COLS:
            pkg[c] = jsonable(r[c])
        packages.append(pkg)

    doc = {
        "_note": ("Real per-sample burst signals for mill B01, burst " + BURST_PREFIX +
                  ", lifted from package_trace_cache.pkl.gz by "
                  "examples_rvm/engentus/tools/export_burst_samples.py. Used to verify the in-IR "
                  "burst-fit kernel against the REAL signal (the expected fit is in package_phase.csv)."),
        "mill": "B01",
        "burst_start": str(sub.iloc[0]["burst_start"]),
        "dt": 0.05,
        "packages": packages,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc), encoding="utf-8")
    print(f"wrote {OUT} — {len(packages)} packages, {len(packages[0]['magnitude_g'])} samples each, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
