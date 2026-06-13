# PIPELINE fidelity audit — spec vs. the real implementation

Triggered by the arrival of the real pipeline under `example-ports/engentus-pipeline/`
(the actual Python algorithms + portable golden outputs for mills B01/B02/B03). This
audit answers one question before any more code is written: **how faithful are
`PIPELINE.rvm` and `PIPELINE.dsl` to what the system actually computes?**

Companion to `docs/PIPELINE-FIDELITY-ROADMAP.md` (the A→D rung ladder). The roadmap
built generic platform capability against the spec *as written*; this audit measures the
spec against *reality*, so we know what "faithful" actually requires.

Legend: ✅ faithful · 🟫 wiring-faithful (boundary correct, algorithm/payload collapsed) ·
⚠️ divergent · ⛔ missing entirely.

---

## Method — a four-way comparison

For each stage we compare four artifacts:

1. **RVM** — `examples_rvm/engentus/PIPELINE.rvm` (the DESIRE spec the rungs operate on).
2. **DSL** — `examples_rvm/engentus/PIPELINE.dsl`. **Finding: byte-identical to the real
   `example-ports/engentus-pipeline/analysis/docs/PIPELINE.dsl`** — so our DSL *is* the
   canonical "as-is Python pipeline" spec, copied verbatim. It is not an approximation.
3. **Python** — the Python (`analysis/mill/*.py`), the Node ingest (`src/ingest/**`), and
   the captured outputs under `analysis/output/<mill>/outputs/` (the oracle). Plus
   `analysis/docs/R-PIPELINE.dsl`, a reference doc that annotates gaps in the canonical
   spec with `[DIFF]`/`[MISSING]`/`[R-ONLY]`/`[MATCH]`, and `analysis/docs/KALMAN_ANGLE.md`.
4. **R** — `example-ports/engentus-pipeline-r/` (the original R implementation: 8 stage
   scripts `01_ingest`…`08_burst_summary` + `R/` function libraries). Incorporated for
   completeness as a fourth, independent witness of the algorithms (§ "The R implementation"
   below). It is the source `R-PIPELINE.dsl` distils.

## Headline verdict

- **The DSL is largely faithful** as a stage-by-stage spec of the Python — its formulas
  for calibration (§3) and burst-fit (§4.1–4.7) match the code, and its `HealthDiag`/
  signal-state taxonomies match `health.py` exactly. Its real gaps are **two omitted
  stages** (Kalman, uncertainty), a **wrong data-source topology** (§1), and a couple of
  **[R-ONLY] details** (gyro scaling). 
- **The RVM faithfully encodes the DSL's wiring, types, and constants** — every enum,
  threshold (`Health*`, RPM grid steps), process/event/command/adapter/policy, and the
  8 host-op boundaries are a correct transcription. This is exactly what Rungs A–C need
  and it holds up.
- **But the RVM deliberately collapses each stage's rich output into a 3-field host-op
  payload.** That is *fine for Rungs A–C* (where the algorithm is an opaque black box),
  but it means the RVM is **not yet a faithful model of the data** the pipeline produces —
  which is what **Rung D** must verify against. The real oracle frames carry 10–38 columns
  per stage; the RVM result schemas carry 0–3.

So fidelity is **high at the wiring/type layer, partial at the I/O-schema layer, and has
two genuine structural holes** (Kalman + uncertainty stages). None of this invalidates the
A–D machinery; it tells us precisely what to enrich.

---

## Per-stage findings

### Stage 1 — Data source ⚠️ divergent (DSL), out of RVM scope

| | |
|---|---|
| RVM | Not modelled (spec begins at ingest). |
| DSL | "MySQL on client hardware" (§1). |
| Real | `Sensors → MQTT broker → { Vendor MySQL (no direct access), Our MySQL }`. Python reads Our MySQL; an **early-deployment data gap** exists in Our DB (vendor API is ground truth for the first 2–4 weeks). (`R-PIPELINE.dsl` Data-Source Architecture, `[PYTHON:]`.) |
| Verdict | DSL §1 topology is wrong; not represented in the RVM. Low code impact but a real provenance caveat for any oracle comparison on early bursts. |

### Stage 2 — Ingest (imu / strain) 🟫 wiring-faithful

| | |
|---|---|
| RVM | `IngestProcess`; host-ops `ingest.imu` + `ingest.strain`; `IngestBatchRequest`. |
| DSL | `ingest :: MySQL → PG` (§2). |
| Real | **Node**, not `mill`: `scripts/ingest-sensor-data.js` → `src/ingest/raw/`. Timestamp reconstruction `tx_timestamp_start + (tx_sample_counter−1)/20`; resume-from-max + back-up-one-burst; `ON CONFLICT DO NOTHING`. |
| Oracle | `engentus.sensor_data` rows (sensor_type `imu`/`strain`). |
| Verdict | Host-op boundary is correct; algorithm is opaque & external (appropriate for C). Note the implementer is Node tooling, not a `mill` Python command — the two SBTP host-ops are a reasonable split. |

### Stage 3 — Calibrate strain 🟫 wiring-faithful (DSL formula ✅)

| | |
|---|---|
| RVM | `StrainCalibrationProcess`; host-op `calibrate.strain`; `ChannelCal` enum `{x1,y1,x3,y3,z2}`. |
| DSL | Full ADC→strain→nominal→calibrated formulas; 2×2 lateral matrix per position; z2 axial gain/offset (§3). |
| Real | `src/ingest/calibrated-strain/`: `ain_vref=(adc/2^23−1)/128`; `strain=4·ain_vref/(GF·BF)`; bending `×E·I·1e-12/(y·1e-3)`, axial `×E·A·1e-6`; then `gain·nominal+offset` from `calibration_fits`/`z2_calibration`. `[MATCH]` to DSL per R-PIPELINE. Mapping ST1→x1, ST2→y1, ST3→x3, ST4→y3, ST5→z2. **Limitations: bolt-7 fallback & o240→c240 not implemented; 6 skip categories** (`unsupported_channel`, `missing_bolt_number/_type/_coefficients/_fit`, `invalid_raw_value`). |
| Oracle | `sensor_data` strain_calibrated rows. |
| Verdict | DSL formula faithful; RVM models it as an opaque host-op (fine for C). Type-level (`ChannelCal`) faithful. |

### Stage 4 — Burst fit 🟫 wiring-faithful, **payload severely collapsed**

| | |
|---|---|
| RVM | `BurstFitProcess`; host-op `fit.burst`; **`BurstFitResultPayload { burst_start, rpm, n_valid_pkgs }`** — 3 fields. RPM grid constants (`6–18`, coarse `0.05`, refine window `0.25` step `0.005`) match. |
| DSL | §4.1–4.7: normalize → package gates → harmonic fit + grid search → **latent row model**. |
| Real | `model.py`: `normalize=adc/2048`; `build_package_frame` gates (Butterworth order-4 @2Hz, stale `ε=0.002g`/`0.5s`, span `0.1g`, local span `0.03g`/`1.0s` window, good-fraction `0.8`, min `20` samples, contiguous-run); `fit_burst_rotation` design `[1, cos(ωt), sin(ωt)]` (optional **2nd harmonic** + **phase-drift** `t·cos`/`t·sin` columns), multi-axis dominant-axis SSE; two-stage grid; **`fit_latent_row_model`: φ = α_burst + γ_bolt·1[mount=bolt] + κ·row**, iterative unwrap (12 iters). |
| Oracle | `burst_rotation.csv` (10 cols), `package_phase.csv` (**~38 cols** incl amplitude, phase, r², harmonic2_*, phase_drift_*, approx_freq_error), `latent_row_fit.json` (`gamma_bolt`, `kappa`, sse, rmse, …). |
| Verdict | Boundary correct; the RVM payload captures **3 of ~50** real outputs. The **latent row model is a whole sub-stage absent from the RVM**. The Rung-D kernel (`burst-fit-kernel.mjs`) reproduces the *core* harmonic-fit + grid search but **not** the preprocessing gates, multi-axis/harmonic-2/drift terms, or the latent row model. |

### Stage 5a / 5b — Overview / Bolt charts 🟫 wiring-faithful (visualization)

| | |
|---|---|
| RVM | `OverviewProcess`/`BoltAnalysisProcess`; host-ops `overview`/`bolt`, no payload. |
| DSL | `overview :: … → img/`; `bolt :: … → img/` (§5a/5b). |
| Real | `cli.py:run_overview`/`run_bolt` render ~13 + many per-bolt PNG/SVG charts from fit artifacts + calibrated/raw strain + gyro. |
| Verdict | These are **visualization** stages (side-effecting, no data payload) — correctly modelled as result-less host-ops. Low fidelity concern; not Rung-D targets (no numeric oracle beyond the upstream frames). |

### Stage 5c — Health 🟫 wiring-faithful, **types & constants ✅, payload collapsed**

| | |
|---|---|
| RVM | `HealthProcess`; host-op `health.classify`; **`HealthResultPayload { hour_start, n_valid_channels, n_bolts_evaluated }`**; `SignalState` enum (5) + `HealthDiag` enum (15) + `Health*` thresholds. |
| DSL | §5c classification spec. |
| Real | `health.py`: signal states `{valid, indeterminate, stuck_or_saturated, unexpected, no_data}` and **15 diagnostic flags** — **exactly the RVM's `SignalState` + `HealthDiag` enums**. Thresholds (ADC-rail ratio `0.01`/frac `0.8`, zero ε `1e-6`/frac `0.95`, stale frac `0.8`, dominant `0.5`, span ratio `0.02`, edge prox `0.05`, min eval `3`, usable/good frac `0.5`) **match the RVM `Health*` values**. Bolt health = per-state channel counts + `health_score = valid_channel_count` (0–5). |
| Oracle | `channel_health_hourly.csv` (**31 cols**), `bolt_health_hourly.csv` (10 cols), `health_summary.json`. |
| Verdict | **The most type-faithful stage** — the enums and thresholds are a 1:1 transcription. Only the host-op *payload* collapses 31+10 columns into 3. Rung-D internalisation here is tractable (the classifier maps onto existing enums). |

### Stage 5d — Alignment ⚠️ severely under-modelled

| | |
|---|---|
| RVM | `AlignmentProcess`; host-op `alignment`, **no payload**. |
| DSL | `alignment :: … → investigations/alignment/` (§5d) — one line. |
| Real | `alignment.py` (2238 lines): **7 computational stages across 4 reference frames** — body → gravity → gravity-removed → rigid-body-removed; gyro-axis PCA, accel gravity-vector harmonic fit, rotation-matrix synthesis, phase-dependent gravity removal, 1× rigid-body subtraction, per-burst residual diagnostics, package-level before/after phase harmonics. |
| Oracle | ~7 CSVs (`imu_orientation_summary.csv`, `imu_orientation_burst_residuals.csv`, 4× `package_phase_*_frame.csv`, residual diagnostics) — **100+ columns total**. |
| Verdict | A single opaque op hides **~9 distinct sub-computations**. The biggest structural gap; a faithful spec needs alignment decomposed into multiple models/kernels. |

### Stage 6 — Kalman rotation-angle ⛔ MISSING from both DSL and RVM

| | |
|---|---|
| RVM | **Absent.** No process, host-op, or payload. |
| DSL | **Absent.** No §; spec'd separately in `KALMAN_ANGLE.md`. |
| Real | `cli.py kalman` → `kalman.py` (911 lines): a **dual-sensor (bolt + TX) 4-state Kalman filter** `x=[θ, ω, bias, δ_BT]` fusing both IMUs; the **primary/superior rotation-angle estimate** plus `δ_BT` **loosening diagnostic**. Config has a full `KALMAN_*` noise-parameter block. |
| Oracle | `burst_kalman.csv` (16 cols: `omega_*_dps`, `omega_burst_rpm`, `delta_BT_deg`, `bias_combined_dps`, residual SDs, …); optional per-sample parquet. |
| Verdict | **Entirely missing and high-importance** — `KALMAN_ANGLE.md` positions it as superior to the harmonic burst-fit for angle. Both DSL and RVM should gain a Kalman stage. |

> **⚠ FIDELITY CATCH (added after the in-IR Kalman port).** The committed golden
> `burst_kalman.csv` was **not** produced by the `analysis/mill/kalman.py` in the repo. Three
> distinct implementations exist and **no two agree**:
>
> 1. **R `mill_bolt_angle.R`** — a clean **3-state** filter `x=(θ, b_omega, δ_BT)`, gyros entering
>    only the predict step, two sequential scalar accel updates. Emits `bias_combined_dps`.
> 2. **`analysis/mill/kalman.py`** — a later **4-state** refactor `x=[θ, ω, b_bolt, δ_BT]` with gyro
>    measurement updates. Emits `omega_est_dps` / `bias_bolt_dps` / `omega_disagree_flag`.
> 3. **The golden CSV / `burst_kalman_cache`** — carries `bias_combined_dps` and
>    `omega_burst_rpm == omega_bolt_dps/6` (the **3-state** signature), with the adaptive sigma computed
>    via `np.std` (N), not R's `sd` (N−1) — i.e. an **older Python 3-state build** that no longer exists
>    in the tree.
>
> The golden's *physical* outputs are sound (`omega_*`, `rpm`, `r_*` reproduced from the aligned signal
> to ~1e-15), but its **filtered states are numerically divergent**: `total_rotation_deg` spans
> **±2.6e7°** and `bias_combined_dps` **±6.8e6 dps** (physically impossible; ~34 of 40 sampled bursts
> diverge). So the committed `burst_kalman.csv` is **not a usable oracle for the filter math.**
>
> The in-IR kernel (`examples_rvm/engentus/kalman-kernel.mjs`) ports the **clean R 3-state model** and
> is verified two ways (`test/desire-engentus-kalman-real.test.js`): frame physics vs the golden to
> **≤2.7e-15** across every real burst, and the **full filter** (δ_BT, bias, residuals, total_rotation,
> sigma) vs R's own `process_burst` (R 4.5.2, via `tools/run_r_kalman.R`) to **4.3e-14** — staying
> physically stable where the golden blew up. **Takeaway:** when porting Kalman into the spec, the
> R 3-state model is authoritative; do not chase the divergent golden values.

### Stage 7 — Uncertainty ⛔ MISSING from both DSL and RVM

| | |
|---|---|
| Real | `cli.py uncertainty`: parameter covariance / CIs on RPM & package phase from fit artifacts → `package_uncertainty.csv`, `burst_uncertainty.csv`, etc. |
| Verdict | Missing; medium importance (quality/confidence layer over Stage 4). |

*(Infrastructural `cache rebuild/purge/build` commands are not pipeline stages — noted, not tracked.)*

---

## Cross-cutting gaps

- **Two missing stages** (Kalman, uncertainty) — the only *structural* holes.
- **Data-source topology** (§1) wrong; early-deployment Our-DB gap is a real oracle caveat.
- **Gyro scaling** `÷16.4 → deg/s` is `[R-ONLY]` (not in DSL); RVM enumerates gyro channels
  (`ChannelImu`) but encodes no scaling. Kalman uses `rpm = dps/6`.
- **Output-name drift:** code frame names (`burst_fit`/`package_fit`) vs. the artifacts
  actually written (`burst_rotation.csv`/`package_phase.csv`). Use the on-disk names as
  authoritative for fixtures.
- **`[R-ONLY]` trial-arm (A/B per bolt)** — present in the R pipeline only; not in the
  Python pipeline. Out of scope.

## The R implementation — a third independent witness

`example-ports/engentus-pipeline-r/` is the original R pipeline: 8 stage scripts
(`01_ingest` → `02_tidy` → `03_clip_detect` → `04_calibrate` → `05_channel_health` →
`06_prepare` → `07_build_working_dataset` → `08_burst_summary`) over `R/` function
libraries, with Hive-partitioned Parquet stores between stages. `R-PIPELINE.dsl` is its
distilled bridge to the canonical spec; the code confirms and extends those annotations.
Reading it as a second implementation of the same algorithms sharpens the audit:

| Dimension | R | vs Python (verified) | Consequence for the spec |
|---|---|---|---|
| Data source | Vendor REST API (httr2; Perth `DD/MM/YYYY HH:MM`; per-device watermarks; ≤1h windows) | Python reads **Our MySQL** | Two ingest fronts behind one logical stage; both differ from DSL §1 |
| Calibration | Two-stage ADC→nominal→calibrated, **identical formula**; retains raw+nominal+calibrated; clipped→`NA` (never drops bursts) | **MATCH** | Confirms DSL §3 is faithful; safe to keep as one host-op |
| **Clip/artifact detection** | **Distinct stage (03)**: per burst×channel hard/soft/spike (adc_max=2²⁴−1, 1% rail margin, 0.5% IQR, spike ratio 50), integer-ADC | Python folds this into fit gates + health saturation checks | A **candidate first-class stage** the DSL/RVM never name |
| **Bolt-7 z2 calibration** | **Workaround implemented** (fallback offset `8556291.81` ADC + mean gain from other bolts) | **Python: NOT implemented** (Node README confirms) | Concrete, citable correctness gap Python should adopt |
| Health | **Simplified 3-state** (healthy/degraded/failed by clip-rate over day/week/all) | Python **5-state + 15 diagnostic flags** (richer) | Python health is authoritative; R is a coarser cross-check |
| Angle / rotation | **4 estimates**: accel-only, complementary-filter (α=0.98), TDC harmonic fit, **3-state joint Kalman (θ, bias, δ_BT)** | Python: harmonic fit (`model.py`) + **4-state dual-sensor Kalman (θ, ω, bias, δ_BT)** | **Kalman confirmed in BOTH** — the canonical angle method, implemented twice |
| **S-N fatigue curves** | `M48_liner_bolt_SN_curves` (VDI 2230; Hannover bending m=3.3; Hannover combined m=4.6; EN 1993-1-9) — **reference data only, no analysis stage** | Python: **also no fatigue/Goodman stage** | Staged-but-unused in both → the real terminal stage neither computes yet |
| Trial arm (insert/control) | R-ONLY, from `Jemtec` flag; all 7 bolts `bolt_type=o310` | absent | Low spec priority (metadata dimension) |
| Storage / execution | Hive-partitioned Parquet, watermark-incremental, parallel + optional Rcpp Kalman | N/A | Architectural; out of fidelity scope |

**What R changes about the conclusions** (correcting two "Python likely…" guesses — I verified
Python's Kalman is *more* sophisticated, and Python has *no* Goodman stage either):

1. **Kalman is doubly-confirmed.** Both pipelines implement a δ_BT-bearing angle-fusion filter,
   so the "missing Kalman stage" is the single most-supported addition — it is the *primary*
   rotation-angle method in both languages, not a Python afterthought. R additionally exposes
   accel-only and complementary-filter intermediates; the harmonic fit (R's TDC fit ≈ Python's
   `fit_burst_rotation`) is shared.
2. **Clip/artifact detection deserves first-class status.** R makes it an explicit stage feeding
   both calibration (NA clipped samples) and health; the DSL/RVM scatter it across fit gates and
   health checks.
3. **Bolt-7 z2 has a known R workaround the Python lacks** — a concrete correctness item, not a
   modelling nuance.
4. **Fatigue / Goodman is the real terminal stage neither pipeline computes yet.** The S-N curves
   are staged reference data; a faithful end-to-end model would consume calibrated load + these
   curves to produce damage/Goodman output. This is the **bridge to the existing Goodman chart
   tranche** (`docs/DESIRE-SPA.md`) — the two halves (backend pipeline, frontend Goodman charts)
   meet here.

## What each gap means for the rungs

- **Rung A (integrity).** Still valid for what the RVM *declares* — but the green check
  should be read as "the declared graph is sound," not "the pipeline is fully modelled."
  Adding Kalman/uncertainty stages will extend, not break, the checker.
- **Rung B (state machine).** Faithful to declared wiring; gains a `KalmanProcess` (and
  `UncertaintyProcess`) once those stages are added — no engine change needed.
- **Rung C (host-op runtime).** The collapsed payloads mean the stub/real-Python only has
  to return 3 fields today. To carry the **real** outputs, the RVM **result-message
  schemas should be enriched to the real frame columns** (so the golden CSVs validate
  against them). The ABI and runtime are unchanged.
- **Rung D (in-IR).** The verification oracle is the real CSVs. Burst-fit needs the kernel
  extended (gates + multi-axis + latent row model); health is tractable (types exist);
  Kalman and alignment are large new in-IR efforts and should be specced before coded.

---

## Recommended remediation order

1. **Fix the spec's stage inventory (cheap, high structural fidelity).** Add **Kalman**
   (primary angle estimate + `δ_BT` loosening — *confirmed in both Python and R*) and
   **uncertainty** stages, and a first-class **clip/artifact-detection** stage (R's stage 03,
   feeding calibration + health) to `PIPELINE.dsl` and `PIPELINE.rvm`; correct the §1
   data-source topology (Our-MySQL *and* vendor-API fronts); record gyro scaling. Re-run
   Rung A — the checker should stay green over the larger graph.
2. **Enrich the RVM result-message schemas to the real output frames** (`burst_rotation`,
   `package_phase`, `latent_row_fit`, `channel_health`, `bolt_health`, `burst_kalman`,
   alignment frames). This is what turns the RVM into a faithful model *of the data*, and
   lets the real golden CSVs validate as Rung-C responses.
3. **Adopt the bolt-7 z2 calibration workaround** (R has it, Python doesn't) into the
   calibration stage's contract/notes — a concrete correctness fix, not just modelling.
4. **Wire the real golden CSVs as Rung-C fixtures, per stage**, and verify the C
   stub/real-Python against them (replacing the synthetic goldens).
5. **Rung D per algorithm, in dependency order:** fit (extend the kernel: preprocessing
   gates → multi-axis/harmonic-2/drift → latent row model) → health (threshold classifier
   onto the existing enums) → kalman (both pipelines give a reference impl) → alignment
   (decompose the 9 sub-computations last).
6. **(Cross-tranche) the fatigue/Goodman terminal stage** — neither pipeline computes it,
   but the S-N curves are staged and the Goodman chart work already exists
   (`docs/DESIRE-SPA.md`). A faithful *end-to-end* model (calibrated load + S-N → damage)
   is where the backend pipeline and the frontend Goodman charts converge.

The strategic read: the **wiring spec is sound and the rung machinery is correct** (and the
R implementation independently corroborates the algorithms); the work now is **filling in the
missing stages — Kalman, uncertainty, clip-detection — and widening the I/O schemas to the
real frames**, after which Rung D has authentic, in-repo oracles for every stage, and the
fatigue/Goodman stage closes the loop with the chart tranche.
