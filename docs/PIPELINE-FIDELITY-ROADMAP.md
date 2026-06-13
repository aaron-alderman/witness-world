# PIPELINE.rvm — fidelity roadmap (compiles → full fidelity)

The concrete execution roadmap for taking `examples_rvm/engentus/PIPELINE.rvm` from
*"compiles & applies"* to *full fidelity*. Companion to `docs/DESIRE-SPA.md` (the chart-app
tranche); this doc covers the **backend data pipeline** (sensor ingest → strain calibration →
burst-fit → overview / bolt / health / alignment).

Legend: ✅ done · 🟡 partial · ⛔ blocked on a prerequisite · ⬜ not started.

**Progress:** Rung **A** ✅ (wiring provably sound), Rung **B** ✅ (declared state machine runs
under a generic executor), Rung **C** 🟡 (host-op protocol + runtime + transport; runs end-to-end
against a deterministic CI stub), and Rung **D** 🟡 (verify-then-swap migration capability + a real
burst-fit kernel proving the in-IR flip) are landed. The three original baseline gaps are now
closed *generically*: gap #1 (execution semantics) by B, gap #2 (host-op runtime) by C, and the
gap #3 machinery (in-IR re-expression + 1e-6 proof) by D. **The single remaining dependency is the
real external `engentus.pipeline.*` Python** — it makes C *live* and is the oracle D verifies
against; it slots into the final stage on both sides behind one frozen protocol.

**Update (real pipeline + R original now in-repo).** The real Python implementation + portable
golden outputs (B01/B02/B03) landed under `example-ports/engentus-pipeline/`, and the **original R
implementation** under `example-ports/engentus-pipeline-r/`, unblocking C/D's external oracle. A
full **four-way** fidelity audit (RVM ↔ DSL ↔ Python ↔ R) is in
**[docs/PIPELINE-FIDELITY-AUDIT.md](PIPELINE-FIDELITY-AUDIT.md)**. Verdict: wiring/type fidelity is
high and the rung machinery holds, but reality has **stages the spec omits entirely (Kalman,
uncertainty, clip-detection)**, alignment hides ~9 sub-computations behind one opaque op, and every
host-op payload is collapsed (~3 fields vs. 10–38 real output columns). The R implementation
independently corroborates the algorithms — confirming the **Kalman** angle-fusion (with `δ_BT`
loosening) is the canonical method in *both* languages, surfacing a **bolt-7 z2 workaround Python
lacks**, and staging **S-N fatigue curves** that point to a Goodman terminal stage neither computes
(the bridge to the chart tranche). The remediation backlog below is the bridge from "generic
machinery against a thin spec" to "faithful model against real oracles".

## Fidelity remediation backlog (from the audit)

- [X] **Add the missing stages** to `PIPELINE.dsl` + `PIPELINE.rvm`: **Kalman** rotation-angle
  (dual-sensor 4-state filter; primary angle estimate + `δ_BT` loosening; confirmed in Python *and*
  R), **uncertainty** (parameter covariance over the fit), and a first-class **clip/artifact-detection**
  stage (R stage 03: hard/soft/spike per burst×channel, feeding calibration + health). Corrected the
  §1 data-source topology (vendor-API *and* our-MySQL fronts) and recorded gyro scaling (`GyroScaleDps`/
  `GYRO_SCALE_DPS`) + the `ClipArtifact` enum. **Done:** PIPELINE.rvm now has 10 stages / 11 adapters /
  3 policies (205 DESIRE+ → 203 kernel nodes, 0 unclassified residuals); Rung A re-verified green
  (`test/desire-engentus-pipeline.test.js`), Rung B/C/D suites updated to the new counts and green
  (45/45 across the four rung files). The KalmanQualityPolicy surfaces the loosening (`δ_BT`) gate.
- [X] **Enrich the RVM result-message schemas to the real output frames.** PIPELINE.rvm now
  declares six exact per-row schema mirrors — `BurstRotationFrame` (10), `PackageFitFrame` (38),
  `LatentRowFit` (9), `ChannelHealthFrame` (32), `BoltHealthFrame` (11), `BurstKalmanFrame` (16) —
  column names + types matching the real B01/B02/B03 goldens. `test/desire-engentus-frames.test.js`
  loads the **real** golden CSV/JSON rows and proves they validate against these schemas *and* pass
  the actual Rung-C runtime response-validation path (50/50 across the rung suites). Fidelity catch:
  the real `burst_kalman.csv` columns differ from the item-1 convenience payload (`delta_BT_deg`, no
  `omega_disagree_flag`); `BurstKalmanFrame` is the authoritative mirror. (Alignment's ~7 frames
  remain for when that stage is decomposed.)
- [X] **Adopt the bolt-7 z2 calibration workaround** (present in R, missing in Python) into the
  calibration stage's contract. PIPELINE.rvm now declares `Bolt7Z2FallbackOffset` (8556291.81094527,
  zero-load baseline ADC) with the mean-gain rule documented; the DSL §3 calibrate section carries the
  `[AUDIT / R-ONLY]` fallback note. (Recorded in the contract; the host-op algorithm stays opaque.)
- [X] **Wire the real golden CSVs (B01) as Rung-C fixtures**, replacing the synthetic goldens.
  `examples_rvm/engentus/fixtures/real-golden-B01.json` captures real (request → response) pairs taken
  verbatim from the B01 output CSVs (fit-burst rpm **11.45**, not the synthetic 12.5; real Kalman
  omega/δ_BT); `real-golden-replay.mjs` replays them as ABI handlers. `test/desire-engentus-real-golden.test.js`
  (4/4) asserts the fixtures match the source CSVs, validate as Rung-C responses against the declared
  schemas, and **replay through the verified state machine** to the real values (complete → ready).
  (B02/B03 are available to add the same way; full per-row frames are validated separately by the frames test.)
- [~] **Rung D per algorithm, in dependency order:** fit → health → kalman → alignment.
  - [X] **fit — verified against the REAL oracle.** Extended the in-IR kernel
    (`burst-fit-kernel.mjs`): general N-harmonic + phase-drift least-squares (`fitBurstHarmonics`,
    `extractHarmonic`, `omegaForRpm`) matching the real design matrix. `test/desire-engentus-burst-fit-real.test.js`
    (5/5) proves, against real `package_phase.csv`/`burst_rotation.csv` (B01): the extraction
    formulas reproduce the real `amplitude`/`magnitude_phase`/`omega`/`harmonic2_*` columns to 1e-9;
    re-fitting the reconstructed real harmonic recovers the real rpm/amplitude/phase; and
    `migrateHostOperation` verifies the in-IR kernel against the **real** burst_rotation golden (not
    the synthetic sinusoid) and flips the host-op, driving the engine to the real rpm (11.45).
    **Now also verified on the REAL per-sample signal** (lifted from the pickle cache — see the
    export bridge below): fed the real `magnitude_g`, the kernel reproduces the package
    `offset`/`cos_coeff`/`sin_coeff`/`amplitude`/`magnitude_phase`/`sse`/`r²` to **~1e-16** (same
    data, same model), the real 2nd harmonic likewise, and the **burst-level multi-axis joint grid
    search** (`fitBurstRpmJoint`, model.py's Σ_packages Σ_axes objective on the filtered x/y/z axes)
    recovers the real burst rpm **11.45** exactly — closing the multi-axis dominant-axis SSE gap.
  - [X] **Python-export bridge (the data unblock).** `examples_rvm/engentus/tools/export_burst_samples.py`
    lifts a burst's real per-sample arrays (`time_seconds`, `magnitude_g`, filtered x/y/z,
    `good_sample_mask`) out of `package_trace_cache.pkl.gz` into a committed JSON fixture
    (`fixtures/burst-samples-B01.json`), so the in-IR kernels verify against the **real signal** with
    no Python/pickle at test time. This same bridge extends to Kalman/alignment inputs.
  - [X] **latent row model — verified against the REAL oracle.** `fitLatentRowModel` (φ = α_burst +
    γ_bolt·1[mount=bolt] + κ·row, iterative phase-unwrapping OLS; per-burst intercepts eliminated by
    within-burst demeaning / Frisch–Waugh–Lovell so γ,κ come from a 2×2 solve). Fed the real
    `package_phase.csv` `magnitude_phase` values (3771 obs / 1158 bursts), it reproduces
    `latent_row_fit.json` `gamma_bolt` (−0.0871) and `kappa` (−0.1784) to **~1e-13**, sse/rmse to ~1e-9
    (converges in 4 iters). Confirmed the model uses `magnitude_phase`, not the `phase` column.
  - [X] **health — verified against the REAL oracle (every row).** `health-kernel.mjs`
    (`classifyChannelHour`, `aggregateBoltHealth`) is a faithful port of `health.py`
    `_classify_channel_hour_diagnostics` (+ primary-diagnostic priority, context-edge logic, the
    full 5-state / 15-flag taxonomy onto the RVM `SignalState`/`HealthDiag` enums; thresholds match
    config.py / the `Health*` values). `test/desire-engentus-health-real.test.js` (3/3) classifies
    **every** real `channel_health_hourly.csv` row from its feature columns and reproduces `state` /
    `primary_diagnostic` / `diagnostic_flags` / `state_rank` / `is_valid` exactly (0 mismatches over
    ~16.7k rows), and reproduces every `bolt_health_hourly.csv` per-state count + `health_score`.
  - [X] **kalman — verified against TWO real oracles (+ a major fidelity catch).** `kalman-kernel.mjs`
    ports the **3-state** joint Kalman (`x = (θ, b_omega, δ_BT)`; gyros enter only via the predict
    step, two sequential scalar accel updates per sample) from
    `example-ports/engentus-pipeline-r/R/mill_bolt_angle.R` — `build_sensor_frame` / `project_signals`
    / `accel_theta` / `estimate_sigma_theta` / `joint_kalman` / `process_burst`. Inputs are the **real
    aligned per-sample IMU streams** lifted by `tools/export_kalman_burst{,s_multi}.py`, which replay
    the *real pipeline alignment* (assign-to-bursts + pivot + `merge_asof`) over the cached DB/gyro
    data — the reconstructed `omega_bolt_dps` matches the golden to **0.0e+00**, proving the aligned
    fixture is exact. `test/desire-engentus-kalman-real.test.js` (7/7):
    - **Frame physics vs golden `burst_kalman.csv`:** `omega_bolt/tx_dps`, `omega_burst_rpm`,
      `r_bolt/tx_m` reproduced to **≤2.7e-15** across every real burst.
    - **Full filter math vs the R reference:** ran R's `process_burst` on the fixture
      (`tools/run_r_kalman.R`, R 4.5.2, embedded as `r_reference` in the fixture) — the kernel matches
      `δ_BT`, `bias_combined`, residual SDs, `total_rotation`, and the adaptive `sigma_*_used` to
      **4.3e-14**.
    - **FIDELITY CATCH — the committed golden's filtered states are numerically divergent and are NOT a
      usable oracle.** The golden carries `bias_combined_dps` and `omega_burst_rpm == omega_bolt_dps/6`
      (the 3-state R signature) — but its `total_rotation_deg` ranges over **±2.6e7°** and
      `bias_combined_dps` over **±6.8e6 dps** (physically impossible; ~34/40 sampled bursts diverge,
      including burst 0). It was produced by an **older Python 3-state** build (sigma uses `np.std` (N),
      not R's `sd` (N−1) — confirmed to the digit) that the repo's `analysis/mill/kalman.py` later
      replaced with a **diverged 4-state refactor** (`omega_est_dps` / `bias_bolt_dps`, gyro updates) —
      so *neither* committed implementation reproduces the golden. The kernel ports the clean R model,
      which stays physically stable (rotation ≈ ω·duration to <5%, bias <5 dps) where the golden blew
      up. Recorded in `docs/PIPELINE-FIDELITY-AUDIT.md`.
  - [X] **prepare angle stage — verified against the canonical R (machine precision).**
    `prepare-angles-kernel.mjs` ports the canonical R per-burst angle helpers from
    `example-ports/engentus-pipeline-r/R/prepare.R`: `theta_acc_deg = atan2(ay,az)·180/π`,
    `theta_filt_deg` (complementary filter, α=0.98, shortest-arc wrap), and `rotation_angle_deg` (TDC
    reference — fix ω from mean gyro, OLS `[1,cos,sin]` on `az`, phase `φ = atan2(−b,a)`, normalised
    ±180°). Constants (`accel_sens=2048`, `gyro_sens=16.4`, `dt=0.05`, `cf_alpha=0.98`) match the real
    signal scale exactly, so the fixture's real ay/az/gx are byte-faithful inputs.
    `test/desire-engentus-prepare-angles-real.test.js` (6/6) verifies all three series against R's own
    output to **≤9.5e-13** (R oracle via `tools/run_r_prepare_angles.R`, which `parse()`s prepare.R and
    evaluates *only* the real `cf_filter`/`fit_rotation_angle` definitions — no deps, no drift), plus
    the ±180° invariant across every real burst and the slow-burst/TDC-recovery edge cases.
  - [ ] **alignment (Python-only)** — the quaternion/4-frame `alignment.py` machinery (~9
    sub-computations) is **Python-specific and not in the canonical R** pipeline, so it is *deprioritised*
    (R's angle work is the prepare stage above). Revisit only if the Python alignment proves to carry a
    capability R lacks; the export bridge + harness are ready if so.
  - [ ] **fit preprocessing (deprioritised — not canonical R)** — the masking is *implicitly* verified
    (the kernel reproduces the fit on the already-masked `magnitude_g`). The Butterworth low-pass
    appears only in an R **scratchpad** (`scripts/tsp_3.r`, `signal::butter(3, 0.25)`), not in the
    canonical stage pipeline (01–08), so reimplementing it in-IR is low-value under the R-canonical
    rule. Left open in case a canonical masking step surfaces.
- [X] **Host-op integration pass — wired the verified kernels INTO the IR (corrected a drift).**
  The Rung-D kernels above had been *verified against oracles* but several were left sitting *beside*
  the IR rather than wired *into* it — i.e. missing the defining Rung-D step (re-express as a host-op
  handler, `migrateHostOperation` verify-then-flip, drive through the Rung-B engine; cf. burst-fit in
  `desire-engentus-in-ir.test.js`). Closed for every host-op-backed stage that has a kernel:
  - [X] **kalman** → `engentus.pipeline.kalman` (`createKalmanInIrHandler`): verifies the kernel ==
    the R reference, flips the runtime, and the engine runs it in-IR with `running → complete` writing
    `KalmanResultRpm`/`KalmanDeltaBtDeg`. `test/desire-engentus-kalman-in-ir.test.js` (5/5).
  - [X] **clip** → `engentus.pipeline.clip.detect` (`createClipDetectInIrHandler`): reproduces the R
    clip counts (`n_channels_evaluated`/`n_clipped_channels`), flips, engine-runs.
    `test/desire-engentus-clip-in-ir.test.js` (4/4).
  - [X] **health** → `engentus.pipeline.health.classify` (`createHealthClassifyInIrHandler`):
    reproduces the golden `n_valid_channels`/`n_bolts_evaluated` (data seam reads the real
    `channel_health_hourly.csv`; oracle = its own labels), flips, engine-runs.
    `test/desire-engentus-health-in-ir.test.js` (4/4).
  - Each refuses the flip when the candidate disagrees with the oracle (negative coverage), exactly
    like burst-fit. **Not host-op-backed (so verified kernels, not migration targets):**
    `prepare-angles` (an internal prepare-stage per-sample transform — no host-op), `fatigue` (the
    cross-tranche Goodman terminal — no pipeline host-op), `rotation`/alignment (the
    `engentus.pipeline.alignment` success event declares **no result payload**, so there is nothing
    numeric to verify/flip), and `health-r` (the R 3-state *fallback* to the wired Python classifier).
  - *Note on `.mjs`:* the engentus runtime kernels are `.mjs` by **established convention**
    (`burst-fit-kernel.mjs`, `host-ops-stub.mjs`, … since the first Rung-D kernel; the repo is
    `type:module` so they are ESM regardless). Not a drift — the drift was the missing integration above.
- [X] **(Cross-tranche) fatigue/Goodman terminal stage — already integrated in the IR (`BoltFatigue`
  model); loose duplicate removed.** The Goodman fatigue physics is *already* a DESIRE model:
  `examples_rvm/engentus/app/models/goodman.rvm` (`BoltFatigue`) composes `goodman_sa`, `sn_hannover`,
  `shore_a_to_E_pa`, `bolt_bending_stiffness`, the γ stiffness-share, `F_shear`, and
  `bolt_bending_sigma_a` as honest derives over `plugins/chart-runtime/goodman-stdlib.js` — "stays
  fully in the IR, zero kernels," run by `evaluateModel` and covered by the chart-tranche eval tests.
  A standalone `fatigue-kernel.mjs` (added earlier in this push) re-ported the same R math plus a
  time-trajectory; on the **full-model-ization** decision it was a **duplicate of already-integrated
  IR**, so it (+ its test, fixture, R harness) was **deleted**. The integrated `BoltFatigue` model is
  the fatigue stage; the time-trajectory view, if wanted, extends that model rather than living as a
  loose `.mjs`. **This was step 1 of retiring the loose `examples_rvm/engentus/*-kernel.mjs` into the
  model + plugin-kernel form** (see the model-ization pass below).
- [~] **Full model-ization pass (retire loose `*-kernel.mjs` into models + plugin kernels).** Target
  form = a DESIRE `model` in `app/models/*.rvm` + lowered kernels in a `plugins/` kernel map, run by
  `evaluateModel` (the mill-force / goodman standard), host-ops referencing the plugin — then the loose
  `.mjs` is deleted. Status: **fatigue done** (was an already-integrated duplicate → removed). Remaining
  loose kernels to model-ize: `burst-fit` (optimizer → lowered grid-search kernel + thin model),
  `clip` (per-channel stats → genuine dataflow model over a `channel` axis with sample-reductions),
  `kalman` (iterative EKF → lowered kernel), `health` / `health-r` (branching/aggregation → lowered
  kernel + model), `prepare-angles` (sequential complementary filter → lowered kernel), `rotation`
  (orientation matrix math → model + lowered harmonic leaf). Each: author model+kernel, repoint the
  host-op handler + tests to `evaluateModel`, delete the loose `.mjs`.

---

## Where we are (the honest baseline)

`PIPELINE.rvm` is **real and complete as a declaration**: it compiles to 205 DESIRE+ nodes
(was 148 before the audit added the Kalman / uncertainty / clip-detection stages), normalizes to
203 DESIRE kernel nodes with **0 unclassified residuals**, and `applyDesire` witnesses it into a
world without error (`module` / `enum`→type / `message` / `value`→state / `process` / `event` /
`command` / `adapter`(SBTP) / `derive`→projection / `policy`).

But three things that "verified behaviour" would require do **not** exist yet — and crucially,
**none of them are unique to engentus**:

1. **No execution semantics** for `process` / `event` / `command` / `adapter` / `policy`.
   `src/desire/apply.js` records *declarations + relations only*; an `event.writes`, an adapter's
   `success_event`, a `policy.policy_outcomes` are stored in node bodies and never executed.
   `src/process-graph.js` is a different model (HTTP backend step-DAGs), not the process state
   machine. The entire `worldwright-mvp` workflow corpus sits at this same ceiling.
2. **No host-operation runtime.** The SBTP adapters route to `/api/runtime/materialized-host-operation`
   with `host_operation engentus.pipeline.*`, but **nothing in-repo implements or backs** those
   operations. The algorithms live in an external Python/DB system.
3. **No behavioural oracle.** `PIPELINE.dsl` carries detailed algorithmic *pseudocode*
   (burst-fit grid search, health thresholds, calibration matrices) but no runnable code, no
   fixtures, no golden outputs. `example-ports/engentus/js/*` is the chart SPA, not the pipeline.

So "verified behaviour" is not one gap — it is a sequence of capabilities, most of them generic.

---

## Definition of "full fidelity"

The pipeline is **fully faithful** when:

- its declared wiring is provably consistent and complete (**A**),
- its declared state machine actually transitions as written, under a generic executor (**B**),
- its host operations execute against the real algorithms through a well-defined protocol, and
  the end-to-end loop (command → algorithm → event → state → policy) reproduces real outputs
  (**C** — the algorithms remain opaque Python "black boxes"),
- and finally each algorithm is re-expressed in DESIRE and proven equal to the black box to a
  numeric tolerance, after which the black box can be retired per-algorithm (**D** —
  *DESIRE eats the world*).

---

## The dependency chain (sequential, by construction)

```
A  wiring integrity        ──►  B  state-machine executor  ──►  C  python black-box runtime  ──►  D  DESIRE internalisation
(static, no runtime)            (generic, new core)             (generic host-op bridge)          (per-algorithm, in-IR)
   proves the graph             runs the declared              makes it actually work +           replaces the black box,
   is sound                     transitions                    PRODUCES THE ORACLE                verified == oracle (1e-6)
```

The key property: **C is what generates the behavioural oracle that D verifies against.** You
cannot do the 1e-6 in-IR proof (D) until something authoritative produces reference outputs (C).
So the order is forced — there is no shortcut straight to D.

Rungs **B** and **C** are *generic platform capabilities* (they serve every worldwright workflow,
not just engentus); **A** and **D** are mostly per-vertical work that rides on them.

---

## Rung A — Wiring / referential integrity  ✅  (small, no new runtime)

**Goal.** Prove the spec is internally consistent and complete: it could only fail at runtime
for *behavioural* reasons, never *structural* ones.

**Prerequisites.** None — achievable today with `createWorld` + `applyDesire` + projectors.

**Work.**
- [X] A reusable **spec-integrity checker** (`src/desire/spec-integrity.js`,
  `checkSpecIntegrity` / `assertSpecIntegrity`) over the applied world's witnesses
  (`world.allWitnesses()`, which carry the full node bodies) + relations, asserting:
  - [X] every `process.handles` resolves to a real `event` message and `emits` to a real
    `command` message; every `process.values` resolves to a real `value`/state;
  - [X] every `adapter` binds a real `command`, a real `success_event` **and** `failure_event`
    (both events), a `request_schema` message, a real `loading_state`, and carries a
    `host_operation` id;
  - [X] every `event.writes` targets a `value` that belongs to a handling `process`, and every
    written enum literal is a real case of that value's enum type;
  - [X] every `policy.subject` is a real process, `state_field` a real state of that subject,
    and each `policy_outcomes` key (plus `initial`/`ready`/`disagreement` states) is a real case
    of the state's enum;
  - [X] every `derive.source` resolves to a real state; no dangling references anywhere; all 7
    stages fully wired (each emitted command → bound adapter → success/failure event handled by
    the same process).
- [X] One test file `test/desire-engentus-pipeline.test.js` (mirror
  `test/desire-engentus-shell.test.js`) driving the checker over `PIPELINE.rvm`, with negative
  coverage (mutated specs the checker must reject).
- [X] **Fidelity fix uncovered en route:** `host_operation` was declared on every adapter in
  `PIPELINE.rvm` but silently dropped during compile/normalize/apply — it was never witnessed,
  so it could not be checked. Plumbed it through end-to-end (`rvm.js` parse → `normalize` →
  `apply.js` witnesses it as the `invokesHostOperation` relation → `serialize.js` round-trip).

**Verification gate.** ✅ `node --test test/desire-engentus-pipeline.test.js` green (9/9); the
checker reports **zero** violations across all 7 stages, 8 adapters, 2 policies, 7 derives. This
already **exceeds** every other workflow spec in the repo (which assert only a handful of sample
relations). *(Pre-existing unrelated failure in `test/desire.test.js` — `loweredRuntime` residual
audit — is independent of this work; confirmed it fails identically with these changes stashed.)*

**Generic?** The checker is generic (any process/event/command/policy spec); the test is the
engentus vertical.

---

## Rung B — State-machine executor  ✅  (medium, new generic core)

**Goal.** Actually run the declared semantics so transitions are observable and assertable.

**Prerequisites.** A (a sound graph to execute). ✅

**Work.** Built a **generic DESIRE process-execution engine** (`src/desire/process-eval.js`,
`createProcessRuntime(world)`) — the process/event analog of `dataflow-eval.js`. Given the applied
world, it:
- [X] seeds each process's state from its `value` initials (type-coerced bool/number/enum);
- [X] `deliver(event)`: validates the owning process `handles` it, applies `event.writes` to
  state (enum literals re-validated), recomputes `derive`s (`bool_not`, …), records a
  state-change observation;
- [X] `dispatch(command)`: routes through the bound `adapter` — sets its `loading_state := true`
  and the lifecycle state(s) the `success_event` writes (whose enum has a `running` case)
  `:= running` — the in-flight transition the spec implies but no event writes;
- [X] `resolve(command, outcome)`: the adapter is *stubbed* — it just delivers the declared
  `success_event` / `failure_event` (real I/O arrives in C). `step()` = dispatch + resolve;
- [X] `policyOutcome(policy)`: maps the subject's `state_field` value through `policy_outcomes`
  (`complete → ready`, `failed → repair_required`);
- [X] records a **state trace** (`rt.trace`, `rt.history(stateId)`) — the behavioural artifact.

**Build-time decision recorded:** lives in `src/desire/` as a generic core module (alongside the
Rung-A `spec-integrity.js`), not a plugin — the process/event state machine is core DESIRE
semantics, and keeping it next to `apply`/`normalize` lets tests drive it exactly as they drive
the checker. It mirrors the `chart-runtime` split *conceptually* (generic engine vs vertical
data): the engine is domain-free; the engentus golden traces are the vertical.

**Verification gate.** ✅ `node --test test/desire-engentus-pipeline-exec.test.js` green (9/9).
Golden event-sequence traces asserted in full (not just endpoints): `IngestProcess`
`idle →(dispatch)→ running →(ImuIngestCompleted)→ complete` (and `→ failed` on the failure path,
with the `IngestIdle` derive flipping `true → false → true`); `BurstQualityPolicy` reports
`repair_required` on `failed` and `ready` on `complete`; `ChannelHealthPolicy` tracks
`HealthProcess`. Plus a generic executor test on a tiny synthetic `BulbProcess` spec (no engentus
terms anywhere) proving the engine is domain-independent, including illegal-enum-literal
rejection.

**Generic?** Engine = generic platform capability (serves all worldwright workflows). The
engentus golden traces are the vertical.

---

## Rung C — Python black-box runtime (well-defined I/O protocol)  🟡  (large)

*Generic platform half landed; the engentus vertical's **real** Python handler stays blocked on
external access. The whole loop runs today against a deterministic CI stub behind the frozen ABI.*

**Goal.** Make the pipeline *actually work* end-to-end against the real algorithms, **without**
implementing them in DESIRE. The algorithms stay opaque Python; DESIRE owns the wiring, state
machine, scheduling, and verification of the *system*. This is "DESIRE orchestrates the world"
(the precursor to "DESIRE eats the world").

**Prerequisites.** B (an executor that can dispatch a command and consume the result as an
event). ✅ External Python reference + its run environment remain open (see *Open prerequisites*).

**Work.**
1. [X] **Define the black-box protocol** (frozen as the host-operation ABI in
   `src/desire/host-operation.js`): a host operation is invoked with an envelope
   `{ host_operation, request }` (`request` conforms to the adapter's `request_schema`) and
   returns `{ status: "success" | "failure", payload }` (`payload` conforms to the success
   event's `payload_schema`, or the failure event's). `extractHostOperationContracts(world)`
   derives the per-operation request/result schemas straight from the applied world.
2. [X] **A host-operation runtime** (`createHostOperationRuntime`) keyed by `host_operation`,
   validating request + response against the schemas (`validateAgainstSchema`), with a thin
   `/api/runtime/materialized-host-operation` route adapter (`createMaterializedHostOperationRoute`)
   the SBTP adapters delegate to. Transport is **pathway-agnostic** (`createSubprocessHandler`):
   request in via **env var / stdin / input file (JSON)**, response out via **stdout / output file
   (JSON)**, **stderr + non-zero exit = the error channel** — so the same black box works under any
   pathway, and an in-process handler and a subprocess handler are interchangeable behind the ABI.
3. [X] **Wired B's adapter dispatch to the runtime** (`processRuntime.stepViaHostOp(command,
   runtime)`): command → request assembled from field bindings → host-op runtime → response →
   mapped to `success_event` / `failure_event` → `writes` applied **and result payload ingested
   into state** via the event's payload bindings → state transition → policy.
4. [X] **A reference black box (deterministic CI stub)**: `examples_rvm/engentus/host-ops-stub.mjs`
   registers schema-valid handlers for all 8 `engentus.pipeline.*` operations. The real Python
   drops in behind the identical protocol when available.
   - [ ] ⛔ Register the **real** external Python implementations (blocked — not in this repo).
5. [X] **Fixtures**: `examples_rvm/engentus/fixtures/host-op-golden.json` (captured input +
   golden outputs for the payload-bearing stages); the stub is asserted to reproduce them.

**Verification gate.** ✅ `node --test test/desire-engentus-host-op.test.js` green (18/18).
- *Contract tests*: request + response validate against their schemas; bad request / bad payload /
  unknown op are rejected.
- *Integration test*: command → stub → success_event → asserted state transition (incl. result
  payload → state) → policy outcome, end-to-end, for **every** stage; plus the failure path
  (failure_event → `failed` → `repair_required`).
- *Transport*: all input×output pathway combinations round-trip; stderr/non-zero-exit surfaces as
  an error; a runtime drives a host op through a real subprocess handler.
- *(With the real Python available)* — pending: the black box reproduces the captured goldens.

This is the first rung where **"verified behaviour" is literally true** (against the stub today,
the real algorithms when they land): outputs flow through the verified state machine and produce
the declared transitions. Fidelity here is of the *system* (wiring + execution + integration), not
of the algorithms — those are still opaque.

**Open prerequisites (to make C *live* on real algorithms — the generic half above is done):**
- ⛔ Location/access to the external Python pipeline implementations (the `engentus.pipeline.*`
  handlers). *Not in this repo.* (The deterministic stub stands in for CI today.)
- ✅ Transport decision: a pathway-agnostic subprocess transport (env/stdin/file → stdout/file),
  with an in-process stub for CI. Local HTTP/socket can be added as another handler kind if needed.
- ⛔ A captured **real** input/output fixture set (the current goldens are stub-captured).

**Generic?** Protocol + host-op runtime = generic platform capability. The engentus handlers,
fixtures, and integration tests are the vertical.

---

## Rung D — DESIRE eats Python (in-IR algorithms, 1e-6)  🟡  (large, per-algorithm, incremental)

*Generic migration capability landed + a real, verifiable burst-fit kernel proves the full
swap-and-verify loop. Only the per-stage **real** Python oracle + **real** sample source remain —
both slot in behind the protocol exercised here.*

**Goal.** Re-express each pipeline algorithm *inside* DESIRE and prove it equals the Python black
box to a numeric tolerance — then retire that black box. This is the literal analog of the
Goodman/mill 1e-6 proof, now applied to ingest/calibration/burst-fit/health.

**Prerequisites.** C — **because C's black box is the oracle D verifies against.** The generic
half of C is done; the *real* oracle is the remaining external dependency (below).

**Work (incremental, one algorithm at a time — started with the most self-contained: burst-fit's
sinusoid least-squares + RPM grid search).**
- [X] **Generic migration capability** (`src/desire/host-op-migration.js`): `createComputeHostOpHandler`
  wraps any compute (a lowered kernel, an `evaluateModel` call, plain JS) as an ABI handler;
  `compareNumeric` + `verifyAgainstOracle` assert numeric equivalence to a tolerance;
  `migrateHostOperation(runtime, …)` verifies **then** flips the runtime's handler behind the
  stable protocol — refusing the flip if the candidate disagrees, recording provenance. This "swap
  a host-op from black box to in-IR" pattern is itself the reusable capability.
- [X] **A real in-IR kernel for the burst-fit stage** (`examples_rvm/engentus/burst-fit-kernel.mjs`):
  `fitBurstRpm` — harmonic least-squares (`[1,cos,sin]` normal equations) + two-stage RPM grid
  search, lowered directly from `PIPELINE.dsl` §4.6 in the `mill-force-kernels.js` spirit. Pure,
  self-contained, verifiable: recovers a known frequency/amplitude/phase to ~1e-15 on a clean
  signal, with a documented statistical tolerance under noise.
- [X] **Verified + flipped end-to-end**: the in-IR handler reproduces the (ground-truth) oracle to
  1e-6; `migrateHostOperation` swaps `engentus.pipeline.fit.burst` from stub to in-IR; the Rung-B
  engine then runs burst-fit through the kernel with *identical* transitions (`running → complete`,
  policy `ready`) — invisible to B and C. Other stages stay on the stub (incremental).
- [ ] ⛔ **The final stage's real work** (the only remaining gap; both sides slot in here):
  - *C side* — the real Python handler (reads real burst ADC samples, returns real rpm) becomes
    the `oracle` to `migrateHostOperation` and a subprocess handler in the runtime.
  - *D side* — replace the kernel's `sampleSource` seam (today fixture-fed) with the same real
    sample read; the kernel math is already authentic. Front it with the spec's preprocessing
    kernels (Butterworth §4.5, stale/good masking §4.2–4.4) for full fidelity.
  - Then retire that stage's Python handler. Repeat per algorithm (calibration, health, …).

**Verification gate.** ✅ `node --test test/desire-engentus-in-ir.test.js` green (9/9): kernel
recovers known params to 1e-6 (clean) + documented tolerance (noisy); `verifyAgainstOracle`
confirms equivalence and catches a wrong candidate; `migrateHostOperation` flips on pass and
refuses on disagreement (runtime left untouched); the end-to-end integration (from C) stays green
with the in-IR handler substituted. *Pending real Python:* in-IR output == real black-box golden
to tolerance, then retire the Python handler.

**Generic?** The compute/migration machinery is generic (any compute backend — kernel, dataflow
`model`, JS — behind the verify-then-swap harness); the algorithms are the engentus vertical.

---

## Summary

| Rung | Milestone | New generic capability | Blocked on | Effort |
|---|---|---|---|---|
| **A** ✅ | Wiring is provably sound | spec-integrity checker (`checkSpecIntegrity`) | — | **done** |
| **B** ✅ | Declared state machine runs | process-execution engine (`createProcessRuntime`) | A | **done** |
| **C** 🟡 | Real algorithms run end-to-end (Python black box) | host-op protocol + runtime (`createHostOperationRuntime`) ✅ | real Python/fixtures (stub done) | generic half **done** |
| **D** 🟡 | Algorithms internalised, verified 1e-6, black box retired | migrate (`verifyAgainstOracle` + `migrateHostOperation`) ✅ | real oracle per stage (machinery + burst-fit kernel done) | machinery **done**; per-stage incremental |

**Recommended sequencing.** **A** and **B** are landed: the graph is provably sound and the
declared state machine runs under a generic executor (a deliberate platform investment — it
unlocks every worldwright workflow, not just engentus). **C** and **D**'s *generic halves* are now
landed too — protocol, runtime, pathway-agnostic transport, an end-to-end loop against a
deterministic stub (C), and the verify-then-swap migration capability proven on a real burst-fit
kernel (D). What remains is a single external dependency that closes both at once: **the real
`engentus.pipeline.*` Python**. It plugs into C as the live handler *and* serves as the oracle D
verifies each in-IR algorithm against — so the final stage's work slots in on both sides behind the
one frozen protocol, then proceeds algorithm-by-algorithm until the Python is fully eaten.

The strategic point: **A → B → C → D are now mostly generic platform rungs**; doing them for
engentus pays off across the whole DESIRE workflow surface. The remaining engentus-specific science
(the real algorithms + their captured I/O) is the only piece left — and it is *verifiable* the
moment it lands because the oracle harness and the swap mechanism already exist.
