// ── Constants ─────────────────────────────────────────────────────────────────

// ADC hardware
ADC_N         = 24                          // bit depth; ADC_MAX = 2²⁴ − 1 = 16,777,215
ADC_GAIN      = 128                         // bridge amplifier gain

// Accelerometer
ACCEL_SCALE   = 1 / 2048.0                  // ADC counts → g

// Gyroscope  [AUDIT: R-ONLY in original DSL]
GYRO_SCALE_DPS = 16.4                        // raw gyro ADC ÷ 16.4 → deg/s

// Package quality gates (fit stage)
MIN_SPAN_G        = 0.1 g
MIN_GOOD_FRAC     = 0.8
MIN_SAMPLES       = 20
STALE_EPS_G       = 0.002 g                 // fixed Δ threshold  (fit stage only)
MIN_STALE_RUN_S   = 0.5 s
GOOD_WINDOW_S     = 1.0 s
LOCAL_SPAN_G      = 0.03 g                  // min rolling peak-to-peak to count as good

// Butterworth
LP_CUTOFF     = 2.0 Hz
LP_ORDER      = 4
LP_METHOD     = sosfiltfilt                 // bidirectional; zero phase shift

// RPM grid search
RPM_RANGE     = [6.0, 18.0]
COARSE_STEP   = 0.05 RPM
REFINE_WIN    = ±0.25 RPM                   // centred on coarse winner
REFINE_STEP   = 0.005 RPM

// Latent row model
UNWRAP_ITERS  = 12                          // max phase-unwrapping iterations

// Health thresholds
H_ZERO_EPS        = 1e-6
H_ZERO_FRAC       = 0.95
H_STALE_FRAC      = 0.80
H_DOM_VAL_FRAC    = 0.50
H_ADC_RAIL_RATIO  = 0.01                    // rail band = ADC_MAX × 0.01 ≈ 167,772 counts
H_RAIL_FRAC       = 0.80
H_SPAN_RAIL_RATIO = 0.02                    // span rail band = robust_span × 0.02
H_CHAN_SPAN_RATIO  = 0.02                   // context-collapse span ratio gate
H_EDGE_PROX       = 0.05                    // context-collapse edge proximity gate
H_MIN_EVAL_SAMP   = 3                       // min finite samples for a burst to be evaluable
H_USABLE_FRAC     = 0.50
H_GOOD_FRAC       = 0.50


// ── Types ─────────────────────────────────────────────────────────────────────

type ADC      = int32
type Gforce   = float64
type Burst    = (start: timestamptz, end: timestamptz)
type Package  = (bolt: int, mount: {bolt | shell}, burst: Burst)

type Channel_IMU    = b_AccelX | b_AccelY | b_AccelZ
                    | i_AccelX | i_AccelY | i_AccelZ
                    | b_GyroX  | b_GyroY  | b_GyroZ
                    | i_GyroX  | i_GyroY  | i_GyroZ

type Channel_Strain = ST1 | ST2 | ST3 | ST4 | ST5
  // canonical mapping: ST1→x1  ST2→y1  ST3→x3  ST4→y3  ST5→z2

type Channel_Cal  = x1 | y1 | x3 | y3 | z2

type SensorType = imu | strain | strain_calibrated

type State = valid | indeterminate | stuck_or_saturated | unexpected | no_data
  // severity order (worst → best): no_data, stuck_or_saturated, indeterminate, unexpected, valid

type HealthDiag
  // stuck_or_saturated diagnostics (priority 0 = most severe):
  = stuck_at_rail_low            // 0
  | stuck_at_rail_high           // 1
  | near_adc_rail_low            // 2
  | near_adc_rail_high           // 3
  | collapsed_near_context_low   // 4
  | collapsed_near_context_high  // 5
  | mostly_zero                  // 6
  | no_variation                 // 7
  | stale_signal                 // 8
  | dominant_repeated_value      // 9
  // indeterminate
  | no_evaluable_bursts
  // unexpected
  | low_usable_burst_fraction
  | low_median_good_fraction
  // terminal
  | valid | no_data


// ── Schemas ───────────────────────────────────────────────────────────────────

// Postgres tables  (engentus schema)

table mills:
  mill_id          : text          PK
  site_name        : text
  mill_type        : text
  mill_start_at    : timestamptz   // when this mill's deployment began

table locations:
  location_id      : int           PK
  name             : text

table bolts:
  bolt_number      : int           PK
  bridge_no        : int           UNIQUE
  mill_id          : text          FK→mills
  bolt_type        : text
  strain_relief    : int
  comment          : text

table bolt_positions:
  bolt_number      : int           PK FK→bolts
  row_label        : text          // physical row along the mill axis (e.g. "R01")
  col              : int           // column index around the circumference
  side             : text          // mill side identifier

table bridges:
  bridge_no                 : int   PK
  bridge_source_device_id   : text  FK→devices.source_device_id
  gateway_source_device_id  : text  FK→devices.source_device_id
  bolt_number               : int   UNIQUE FK→bolts

table devices:
  device_id        : bigint        PK  IDENTITY
  source_device_id : text          UNIQUE
  location_id      : bigint        FK→locations
  bolt_number      : int

table sensors:
  sensor_id        : bigint        PK  IDENTITY
  device_id        : bigint        FK→devices
  source_sensor_id : text          // raw channel name e.g. "b_AccelX", "ST1"
  sensor_type      : SensorType
  UNIQUE (device_id, source_sensor_id, sensor_type)

table sensor_data:
  sensor_id        : bigint        FK→sensors
  timestamp        : timestamptz
  value            : float64       // ADC counts (imu/strain); physical units (strain_calibrated)
  PK (sensor_id, timestamp)

table calibration_fits:
  bolt_number      : int
  position         : text          // "1" or "3"  (lateral measurement position)
  g_11, g_12       : float64       // 2×2 cross-coupling matrix row 1
  g_21, g_22       : float64       // 2×2 cross-coupling matrix row 2
  offset_1         : float64       // additive offset for x channel
  offset_2         : float64       // additive offset for y channel
  PK (bolt_number, position)

table z2_calibration:
  bolt_number      : int           PK
  gain             : float64       DEFAULT 1
  offset           : float64

table calibration_coefficients:
  channel          : text          // e.g. "x1", "z2"
  bolt_type        : text
  parameter        : text          // e.g. "GF", "BF", "E", "I", "A", "y"
  value            : float64
  PK (channel, bolt_type, parameter)

view bolt_bursts:
  // Groups consecutive sensor_data rows per bolt where inter-sample gap < 5 min.
  bolt_number             : int
  burst_id                : timestamptz   // = start_at (burst identity key)
  start_at                : timestamptz
  end_at                  : timestamptz
  sample_timestamp_count  : int
  duration_seconds        : float64

// Analysis output frames  (parquet / CSV cache under output/{mill}/)

frame burst_frame:
  burst_start      : datetime
  burst_end        : datetime
  rpm              : float64       // median best-fit RPM across all valid packages
  n_valid_pkgs     : int           // count of packages that passed all quality gates

frame package_fit_frame:
  burst_start      : datetime
  bolt_number      : int
  mount            : {bolt | shell}
  rpm              : float64
  phase            : float64       // φ ∈ (−π, π]  radians
  amplitude        : float64       // A  in g
  r_squared        : float64       // [0, 1]
  row_label        : text
  phase_residual   : float64       // φ_observed − φ̂  radians  (from latent row model)

frame trace_cache:
  burst_start      : datetime
  bolt_number      : int
  mount            : {bolt | shell}
  timestamp        : datetime
  magnitude_g      : float64       // ‖a(t)‖ raw (post-normalise, pre-filter)
  fitted_g         : float64       // A·cos(ω*t + φ) evaluated at best-fit params
  good_mask        : bool

frame latent_fit_frame:
  burst_start      : datetime
  bolt_number      : int
  mount            : {bolt | shell}
  row_position     : float64       // numeric row index used in regression
  phase_unwrapped  : float64       // φ after integer-2π unwrapping  radians
  phase_residual   : float64       // φ_unwrapped − φ̂  radians

frame channel_health:
  bolt_number      : int
  hour_start       : datetime      // UTC, floored to hour
  channel          : Channel_Cal
  state            : State
  primary_diag     : HealthDiag
  diag_flags       : HealthDiag[]  // all flags that triggered, "|"-joined

frame bolt_health:
  bolt_number      : int
  hour_start       : datetime
  bolt_state       : State         // worst state across all 5 channels
  health_score     : int           // count of channels in valid state  ∈ {0..5}


// ── Stage 1  Data source  ─────────────────────────────────────────────────────
// [AUDIT] Corrected topology: not "MySQL on client hardware". Actual flow:
//   Sensors → MQTT broker → { Vendor MySQL (no direct access), Our MySQL }
//   Python ingests from Our MySQL; original R reads the Vendor REST API
//   (Perth-local DD/MM/YYYY HH:MM, ≤1h windows, per-device watermarks).
// Early-deployment bursts may be absent from Our MySQL (vendor API is ground truth).

Transactions_IMU    : Tick[Channel_IMU]    // Tick = (device_id, timestamp, value: ADC)
Transactions_Strain : Tick[Channel_Strain]


// ── Stage 2  Ingest  (npm run ingest:all) ─────────────────────────────────────

ingest :: MySQL → PG

  sensor_data[sensor_type ∈ {imu, strain}]    ← burst ADC ticks
  sensors, devices, bolts, mills              ← seed-metadata.sql
  calibration_fits, z2_calibration            ← seed-metadata.sql

  // burst definition (view bolt_bursts):
  burst := maximal run of consecutive samples with inter-sample gap < 5 min


// ── Stage 3  Calibrate Strain  (npm run process:strain) ───────────────────────

calibrate :: sensor_data[strain, Channel_Strain] → sensor_data[strain_calibrated, Channel_Cal]

  // ADC → physical units  (coefficients from calibration_coefficients per bolt_type)
  ain_vref(adc)              = (adc / 2^(ADC_N−1) − 1) / ADC_GAIN
  bending(adc, GF, BF, E, I, y) = [ain_vref × 4 / (GF × BF)] × (E × I × 1e⁻¹²) / (y × 1e⁻³)  [N·m]
  axial(adc, GF, BF, E, A)      = [ain_vref × 4 / (GF × BF)] × (E × A × 1e⁻⁶)                 [N]

  // Lateral calibration — per bolt b, position p ∈ {1, 3}
  [x_p, y_p]ᵀ = G_p(b) · [bending(ST_{x_p}, …), bending(ST_{y_p}, …)]ᵀ + offset_p(b)
  G_p(b) ∈ ℝ²ˣ²    ← calibration_fits(b, p) → {g_11, g_12, g_21, g_22}
  offset_p(b) ∈ ℝ²  ← calibration_fits(b, p) → {offset_1, offset_2}

  // Axial calibration — per bolt b
  z2 = gain(b) · axial(ST5, …) + offset(b)
  ← z2_calibration(b) → {gain, offset}

  // [AUDIT / R-ONLY] Bolt-7 z2 fallback — bolt 7 has no fitted z2 calibration.
  //   R applies: offset(7) = 8556291.81094527 (zero-load baseline, raw ADC counts),
  //              gain(7)   = mean(gain(b) for b ≠ 7).
  //   The Python pipeline omits this; the workaround should be adopted.


// ── Stage 4  Burst Fit  (python -m mill fit) ──────────────────────────────────

fit :: sensor_data[imu, Accel] → burst_frame × package_fit_frame × trace_cache × latent_fit_frame

  // 4.1  Normalise and compute magnitude

  g(t, axis)  = adc(t, axis) / 2048.0                              // → Gforce, per axis
  ‖a(t)‖      = √(g(t,X)² + g(t,Y)² + g(t,Z)²)                    // per mount

  // 4.2  Stale sample detection  (fixed absolute threshold)

  stale_diff(t) = |‖a(t+1)‖ − ‖a(t)‖| ≤ STALE_EPS_G
  stale_run(t)  = consecutive stale_diff for ≥ MIN_STALE_RUN_S
  stale_mask(t) = t belongs to a stale_run

  // 4.3  Good-sample mask

  local_span(t) = rolling peak-to-peak of ‖a‖ over GOOD_WINDOW_S  (= 1.0 s)
  good_mask(t)  = isfinite(t) ∧ local_span(t) ≥ LOCAL_SPAN_G ∧ ¬stale_mask(t)

  // 4.4  Package gate  (ALL conditions must pass; reject on first failure)

  ✗  n_total < 20
  ✗  span(‖a‖) < 0.1 g                                  // global peak-to-peak
  ✗  n_good / n_total < 0.8
  ✗  |largest contiguous good run| < 20

  // 4.5  Butterworth low-pass

  filtered(t) = butter(order=4, f_c=2.0 Hz, method=sosfiltfilt) applied to ‖a(t)‖

  // 4.6  Harmonic fit  (all three axes independently, then select dominant)

  ∀ axis k ∈ {X, Y, Z}:
    design_k(ω) = [1,  cos(ω·t),  sin(ω·t)]   ← n×3 matrix
    [c₀, c_c, c_s]_k = lstsq(design_k(ω), g(t,k))
    A_k(ω) = √(c_c_k² + c_s_k²)
    SSE_k(ω) = ‖g(t,k) − design_k(ω)·[c₀, c_c, c_s]_k‖²

  // Two-stage grid search over ω (objective = Σ_k SSE_k):
  coarse : ω₀  = argmin_{ω ∈ [6, 18] RPM, step=0.05 RPM}     Σ_k SSE_k(ω)
  refine : ω*  = argmin_{ω ∈ [ω₀ ± 0.25 RPM], step=0.005 RPM} Σ_k SSE_k(ω)

  // Extract from dominant axis k* = argmax_k A_k(ω*):
  rpm  = ω* / 2π × 60
  φ    = arctan2(−c_s_{k*}, c_c_{k*})
  A    = A_{k*}(ω*)
  r²   = 1 − SSE_{k*} / SST_{k*}                        // SST = Σ(g_k − ḡ_k)²

  // 4.7  Latent row model  (per burst, across all bolts × mounts with valid fits)

  // Observation model:
  φ_{b,m} = α_burst + γ_bolt · 𝟙[mount=bolt] + κ · row_b + ε

  // Fitting — iterative phase-unwrapping OLS (max 12 iterations):
  initialise: φ_unwrapped ← φ_observed
  repeat:
    [α, γ_bolt, κ] = lstsq(design, φ_unwrapped)         // OLS
    φ̂ = design · [α, γ_bolt, κ]
    φ_unwrapped ← φ_observed + 2π · round((φ̂ − φ_observed) / 2π)
  until φ_unwrapped unchanged  (or 12 iterations)

  // Recovered:
  //   α_burst  — per-burst absolute phase intercept (one per burst)
  //   γ_bolt   — bolt-vs-shell mount phase offset
  //   κ        — axial phase gradient along mill axis (twist / deflection proxy)
  //   φ_resid  = φ_unwrapped − φ̂


// ── Stage 5a  Overview  (python -m mill overview) ─────────────────────────────

overview :: burst_frame × package_fit_frame × latent_fit_frame × trace_cache → img/

  chart rpm_over_time:
    type   : scatter
    x      : burst_start              // datetime, UTC
    y      : rpm                      // float64, RPM
    // Deployment-wide view of mill operating speed (one point per burst).
    // Reveals shutdowns, speed ramps, and long-term drift. Gaps indicate
    // periods with no valid burst fits — either the mill was off or all
    // packages were rejected.

  chart phase_vs_row:
    type   : scatter + regression line
    x      : row_position             // float64, dimensionless row index
    y      : phase_unwrapped          // float64, radians; y-scale symmetric about 0
    group  : burst_start              // one scatter series + fitted line per burst
    // Exposes torsional deflection of the mill shell. Within each burst,
    // bolt phases should scatter around a straight line; the slope κ is
    // the angular twist per unit length along the mill axis. Burst-over-burst
    // stability of κ reflects consistent structural behaviour; a sudden shift
    // in κ may indicate a mechanical event.

  chart bolt_residual_over_time:
    type   : scatter
    x      : burst_start              // datetime, UTC
    y      : phase_residual           // float64, radians; zero-centred
    color  : bolt_number              // categorical, one colour per bolt
    // Tracks how far each bolt's phase deviates from the fitted axial trend
    // over the deployment. A bolt whose residual drifts monotonically is
    // changing its mechanical coupling relative to its neighbours — a potential
    // early indicator of loosening or structural change at that position.

  chart bolt_location_offset_heatmap:
    type   : heatmap
    x      : row_position             // float64, dimensionless; ordered along mill axis
    y      : bolt_number              // int, ordered by circumferential position
    color  : Δφ                       // float64, radians; diverging scale centred at 0
    // Spatial fingerprint of per-bolt phase anomaly. Bolts that persistently
    // deviate from the axial trend stand out as high-contrast cells. Used to
    // identify structurally anomalous positions in the mill lining, or bolts
    // that may be in a locally stiff or loose zone.

  chart fit_quality_overview:
    type   : histogram (multi-panel)
    panels : r_squared [0, 1] | amplitude [g] | good_sample_count [int]
    y      : count (package)
    // Validates that the harmonic rotation model is genuinely explaining the
    // observed accelerometer signal. Low R² across many packages, small
    // amplitudes, or high package rejection rates all indicate systematic issues
    // — sensor coupling, excessive vibration noise, or incorrect RPM range.

  chart sample_burst_traces:
    type   : line (overlaid)
    x      : t − burst_start          // float64, seconds relative to burst start
    y      : g-force                  // float64, g
    series : magnitude_g (raw) | fitted_g (model)
    group  : burst_start              // selected bursts superimposed
    // Visual sanity check: does the fitted sinusoid actually resemble the raw
    // g-force signal? Used to catch cases where the grid search finds a local
    // minimum but the physical model is wrong (e.g. harmonics, signal dropout).

  chart burst_fit_overview:
    type   : scatter
    x      : burst_start              // datetime, UTC
    y      : n_valid_pkgs             // int; count of packages passing all gates
    // How many bolts contributed valid fits in each burst? Sparse bursts
    // reduce confidence in the latent row model. Systematic sparseness may
    // reflect a firmware issue, antenna coverage gap, or mill downtime.

  chart latent_fit_diagnostics:
    type   : line (dual-axis)
    x      : burst_start              // datetime, UTC
    y₁     : latent_rmse              // float64, radians; left axis
    y₂     : latent_r_squared         // float64, [0, 1]; right axis
    // Residual quality of the row-position regression over time. Growing RMSE
    // or degrading r² suggests the simple linear phase-vs-row assumption is
    // breaking down — possibly due to structural change or worsening fit coverage.

  chart bolt_best_delta_summary:
    type   : bar (ranked)
    x      : bolt_number              // categorical, ranked by |Δφ|
    y      : Δφ                       // float64, radians; diverging from zero
    // Best-estimate radial position offset per bolt, collapsed to a single number.
    // Quickly identifies the most anomalous bolts across the deployment.

  chart phase_residual_over_time:
    type   : scatter
    x      : burst_start              // datetime, UTC
    y      : phase_residual           // float64, radians; aggregate over all bolts
    // Aggregate phase residual of the latent row model over the whole deployment.
    // Growing residuals indicate the model is fitting the fleet less well over
    // time — potentially a sign of progressive structural change.

  chart amplitude_over_time:
    type   : scatter
    x      : burst_start              // datetime, UTC
    y      : amplitude                // float64, g
    color  : bolt_number              // categorical
    // Fitted harmonic amplitude (proportional to the centrifugal signal strength).
    // Sudden changes can indicate shifts in mill loading, charge distribution,
    // or degraded sensor coupling.

  chart relative_bolt_phase_offsets:
    type   : scatter (overlaid series)
    x      : bolt_number              // categorical
    y      : phase_offset             // float64, radians
    series : IMU-derived | strain-derived
    // Cross-validates IMU phase against strain-gauge signals. Agreement
    // confirms the rotation model is correctly anchored to the physical bolt
    // orientation; systematic disagreement points to axis misassignment or
    // calibration error.

  chart invalid_package_diagnostics:
    type   : bar
    x      : rejection_reason         // categorical: HealthDiag
    y      : count                    // int, packages
    scale  : y linear
    // Why were packages rejected? A rejection dominated by "low span" is
    // different from one dominated by "stale signal" — the first suggests the
    // mill was barely rotating; the second suggests sensor or firmware issues.


// ── Stage 5b  Bolt  (python -m mill bolt) ─────────────────────────────────────

bolt :: Package × channel_health × sensor_data[strain_calibrated] × sensor_data[strain]
      × sensor_data[imu, gyro] → img/bolt_{b}/

  chart mechanical_phase_overlay:
    type     : line (alpha-blended overlay)
    x        : θ ∈ [0, 2π]           // float64, radians; ticks at π/2 intervals
    y        : strain                 // float64, N·m (bending) | N (axial)
    group    : burst_start            // one trace per burst, alpha-blended
    facet    : Channel_Cal            // one panel per channel (x1, y1, x3, y3, z2)
    variants : raw | calibrated | calibrated+health_filtered
    // The bolt's repeating load signature plotted against rotation angle.
    // Tight overlay = consistent mill loading revolution after revolution.
    // Scatter or burst-to-burst shift suggests changing mill conditions or
    // sensor drift. The calibrated+filtered variant strips noise hours to
    // expose the clean underlying signature.

  chart mechanical_burst_summary:
    type     : ribbon (percentile bands)
    x        : burst_start            // datetime, UTC
    y_bands  : p10 / p25 / p50 / p75 / p90  // float64, N·m | N
    facet    : Channel_Cal
    variants : raw | calibrated | calibrated+health_filtered
    // Longitudinal view of bolt loading over the deployment. Stable ribbons =
    // steady mill state. A widening envelope suggests growing variability; a
    // step change in the median points to a sustained shift in loading or bolt
    // condition. Flat p10–p90 spread with a drifting median is characteristic
    // of a bolt losing preload gradually.

  chart mechanical_time_of_day:
    type     : line + error band
    x        : hour_of_day ∈ [0, 23] // int, local time; cyclic x-axis
    y        : strain                 // float64, N·m | N; mean ± spread
    facet    : Channel_Cal
    variants : raw | calibrated | calibrated+health_filtered
    // Diurnal pattern of bolt loading. Systematic variation by hour can reveal
    // shift-dependent mill charging rates, feed changes, or thermal effects on
    // bolt tension. Flat = no diurnal pattern; peaked = operationally driven.

  chart mechanical_phase_radar:
    type     : polar
    θ        : rotation_angle ∈ [0, 2π]  // radians; equally-spaced angular bins
    r        : strain amplitude           // float64, N·m | N; radial scale auto
    facet    : Channel_Cal
    variants : standard | rotated (peak at 0°) | calibrated+health_filtered
    // Angular distribution of mechanical load on the bolt. Symmetric = even
    // loading around the revolution. Asymmetric = the bolt sees peak load at
    // a specific angular position, consistent with uneven mill charge or
    // localised structural stiffness. The rotated variant normalises for bolt
    // orientation and makes cross-bolt comparison easier.

  chart gyro_phase_overlay:
    type     : line (alpha-blended overlay)
    x        : θ ∈ [0, 2π]           // float64, radians
    y        : angular_velocity       // float64, deg/s
    group    : burst_start            // one trace per burst
    channels : b_GyroX | b_GyroY | b_GyroZ  // faceted or colour-coded
    // Angular velocity vs rotation angle, confirming the phase reference derived
    // from the accelerometer. The gyro spin-rate profile should be consistent
    // with the fitted ω. Discrepancy reveals sensor misalignment or packaging
    // problems on this bolt.

  chart phase_aligned_burst_overlays:
    type     : line (alpha-blended overlay)
    x        : t − t_phase_ref        // float64, seconds relative to fitted phase
    y        : magnitude_g            // float64, g (raw) overlaid with fitted_g (model)
    group    : burst_start
    // IMU acceleration traces superimposed after aligning to each burst's fitted
    // phase. High repeatability = stable centrifugal signal. Large scatter after
    // alignment means the signal shape itself is changing — not just a timing
    // offset — which questions whether the rotation model holds for this bolt.


// ── Stage 5c  Health  (python -m mill health) ─────────────────────────────────

health :: sensor_data[strain, Channel_Strain] × burst_frame → channel_health × bolt_health

  // 5c.1  Channel context  (computed once over the full dataset, per bolt × channel)

  context(b, ch):
    p₀₁(b,ch), p₅₀(b,ch), p₉₉(b,ch)  ← all finite values across all time
    ctx_span(b,ch) = max(p₉₉ − p₀₁, 1e-6)

  // 5c.2  Per-burst sample filter  (used only for burst quality scoring)
  //       Note: stale epsilon here is RELATIVE, unlike the fixed STALE_EPS_G in Stage 4

  filter_burst(burst, ch):
    robust_span   = Q₀.₉₅ − Q₀.₀₅
    stale_eps     = max(robust_span × STALE_RATIO, 32ε_machine)   // relative to signal
    local_span_i  = rolling peak-to-peak(window = 0.75 s)
    good_i = isfinite ∧ local_span_i ≥ min_local_span ∧ ¬stale

  // 5c.3  Burst quality metrics  (per bolt × hour × channel)

  ∀ (b, h, ch):
    evaluable       = {bursts ∈ h : n_finite ≥ 3}
    usable          = {burst ∈ evaluable : filter_burst non-empty}
    usable_frac     = |usable| / |evaluable|                       // NaN if |evaluable| = 0
    med_good_frac   = median_{burst ∈ evaluable}(n_good / n_finite)

  // 5c.4  Hourly signal statistics  (per bolt × hour × channel)

  ∀ (b, h, ch):
    robust_span   = Q₀.₉₅ − Q₀.₀₅
    hour_median   = Q₀.₅₀
    span_ratio    = robust_span / ctx_span(b, ch)
    edge_prox     = min(|hour_median − p₀₁|, |p₉₉ − hour_median|) / ctx_span(b, ch)
    zero_frac     = |{v : |v| ≤ 1e-6}| / n_finite
    stale_frac    = |stale_mask| / n_total                         // same fn as Stage 4
    adc_rail_band = ADC_MAX × 0.01                                 // ≈ 167,772 counts
    adc_lo_frac   = |{v ≤ adc_rail_band}| / n_finite
    adc_hi_frac   = |{v ≥ ADC_MAX − adc_rail_band}| / n_finite
    span_rail_band = max(robust_span × 0.02, 1e-6)
    rail_lo_frac  = |{v ≤ Q₀.₀₁ + span_rail_band}| / n_finite
    rail_hi_frac  = |{v ≥ Q₀.₉₉ − span_rail_band}| / n_finite
    dom_val_frac  = mode_count(round(v, 6)) / n_finite

  // 5c.5  Classification  (first matching branch wins; multiple flags accumulate)

  classify(b, h, ch) → (State, primary: HealthDiag, flags: HealthDiag[]):

    1.  n_finite = 0
          → (no_data, no_data, [no_data])

    2.  Accumulate stuck_or_saturated flags:
          robust_span ≤ 1e-6                                            + no_variation
          zero_frac ≥ 0.95                                              + mostly_zero
          max(adc_lo_frac, adc_hi_frac) ≥ 0.80:
            adc_lo_frac ≥ adc_hi_frac:                                 + near_adc_rail_low
              ∧ is_flat:                                                + stuck_at_rail_low
            else:                                                       + near_adc_rail_high
              ∧ is_flat:                                                + stuck_at_rail_high
          span_ratio ≤ 0.02 ∧ edge_prox ≤ 0.05:
            |hour_median − p₀₁| ≤ |p₉₉ − hour_median|:                + collapsed_near_context_low
            else:                                                       + collapsed_near_context_high
          max(rail_lo_frac, rail_hi_frac) ≥ 0.80:
            rail_lo_frac ≥ rail_hi_frac:                               + stuck_at_rail_low
            else:                                                       + stuck_at_rail_high
          stale_frac ≥ 0.80                                            + stale_signal
          dom_val_frac ≥ 0.50                                          + dominant_repeated_value

          if |flags| > 0:
            primary = min(flags) by HealthDiag priority order
            → (stuck_or_saturated, primary, flags)

    3.  |evaluable| = 0
          → (indeterminate, no_evaluable_bursts, [no_evaluable_bursts])

    4.  usable_frac ≥ 0.50 ∧ med_good_frac ≥ 0.50
          → (valid, valid, [valid])

    5.  else:
          usable_frac < 0.50   + low_usable_burst_fraction
          med_good_frac < 0.50 + low_median_good_fraction
          → (unexpected, primary, flags)

  // 5c.6  Bolt rollup  (per bolt × hour)

  bolt_state(b, h)   = min_{ch} state(b, h, ch)  by severity order
  health_score(b, h) = |{ch : state(b, h, ch) = valid}|   ∈ {0..5}

  chart bolt_health_heatmap:
    type   : heatmap
    x      : hour_start               // datetime, UTC; 1-hour bins
    y      : bolt_number              // int, ordered by mill position (row then col)
    color  : bolt_state               // categorical: State; fixed palette by severity
    // Deployment-wide triage grid. At a glance: which bolts degraded, when
    // they went offline, and how long they stayed degraded. Persistent bad rows
    // indicate hardware or installation problems; transient patches point to
    // intermittent signal loss or firmware events.

  chart site_health_state_area:
    type   : area (stacked, normalised)
    x      : hour_start               // datetime, UTC
    y      : fraction ∈ [0, 1]       // proportion of all channels in each state
    stack  : State                    // stacked in severity order, bottom = worst
    scale  : y [0, 1]
    // Fleet-level signal coverage over time. Shows whether most sensors were
    // live simultaneously or large fractions were concurrently offline. Useful
    // for identifying firmware rollouts, site-wide connectivity events, or
    // gaps in the calibration window.

  chart bolt_health_drilldown:
    type   : heatmap (per bolt)
    x      : hour_start               // datetime, UTC; 1-hour bins
    y      : Channel_Cal              // ordered: x1, y1, z2, x3, y3
    color  : state                    // categorical: State; same palette as heatmap
    facet  : bolt_number              // one plot per bolt
    // Per-bolt forensics: which specific channel failed, and when?
    // Distinguishes hardware failure (e.g. a gauge pegged at the ADC rail →
    // stuck_at_rail_high) from signal-quality rejection (e.g. too many stale
    // samples in burst windows → unexpected). Essential for deciding whether
    // to re-calibrate, re-seat, or replace a sensor.


// ── Stage 5d  Alignment  (python -m mill alignment) ──────────────────────────

alignment :: sensor_data[imu] × package_fit_frame → investigations/alignment/

  body_frame
    →[remove centrifugal]    gravity_frame
    →[remove gravity vector] gravity_removed_frame
    →[remove rigid body]     rigid_body_removed_frame
    →                        residual_motion

  ∀ burst: orientation_quaternion, φ_resid = φ_imu − φ_fit

  chart imu_axis_stability:
    type   : scatter
    x      : burst_start              // datetime, UTC
    y      : orientation_spread       // float64, radians; quaternion variance across burst
    group  : axis × mount             // {X,Y,Z} × {bolt, shell} — 6 series
    // How stable is each sensor's estimated orientation burst-over-burst?
    // High stability means the IMU is rigidly mounted and axis assignments are
    // reliable. Drift or scatter suggests the sensor is moving relative to the
    // bolt, which would bias the phase estimates.

  chart residual_diagnostics:
    type   : scatter
    x      : burst_start              // datetime, UTC
    y      : φ_resid = φ_imu − φ_fit // float64, radians; zero-centred
    color  : bolt_number              // categorical
    // Quality of the orientation estimation fit per burst. Large or systematic
    // residuals between the IMU-predicted phase and the harmonic-fit phase
    // indicate the rigid-body model does not fully describe the sensor motion —
    // possible structural flexibility, sensor slip, or incorrect axis mapping.


// ══════════════════════════════════════════════════════════════════════════════
// Stages added per the fidelity audit (docs/PIPELINE-FIDELITY-AUDIT.md).
// ══════════════════════════════════════════════════════════════════════════════

// ── Stage 3b  Clip / Artifact Detection  (R stage 03_clip_detect) ─────────────
// [AUDIT] First-class in the R pipeline (burst_channel_stats); folded into the
// fit gates + health checks in Python. Surfaced here as its own stage. Feeds
// calibrate (clipped samples → NULL, never drops a burst) and health.

clip_detect :: sensor_data[*, raw ADC] → burst_channel_stats[burst × channel]

  // integer-ADC thresholds (load channels only; IMU → NA)
  hard_clip          := sample == 0 ∨ sample == ADC_MAX
  soft_clip          := |median − rail| < ADC_MAX×0.01 ∧ IQR < ADC_MAX×0.005
  spike_contaminated := max|Δ| > 50 × (median|Δ| + 1)        // connector dropout
  is_clipped         := hard_clip ∨ soft_clip ∨ spike_contaminated


// ── Stage 6  Kalman Rotation-Angle  (python -m mill kalman) ───────────────────
// [AUDIT] MISSING from the original DSL; spec'd in KALMAN_ANGLE.md. The PRIMARY
// rotation-angle estimate — present in BOTH Python (4-state) and R (3-state).

kalman :: sensor_data[imu, bolt+tx accel+gyro] × bolt_bursts → burst_kalman

  state x = [θ (drum angle), ω (rate), b (gyro bias), δ_BT (bolt–tx offset)]
  fuse  : bolt+tx gyro (process model) ⊕ bolt+tx accel angle (measurement)
  per burst:
    omega_burst_rpm    = ω / (2π) × 60
    delta_BT_deg                              // loosening diagnostic
    bias_combined_dps, residual_{bolt,tx}_sd_deg
    omega_disagree_flag                       // bolt-vs-tx rate mismatch flag


// ── Stage 7  Uncertainty  (python -m mill uncertainty) ────────────────────────
// [AUDIT] MISSING from the original DSL. Parameter covariance / CIs over the fit.

uncertainty :: package_fit_frame × burst_frame → {package,burst}_uncertainty

  per package : SE/CI on [rpm, phase, amplitude] from the harmonic design Jacobian
  per burst   : aggregate rpm_std, phase_std, n_packages
