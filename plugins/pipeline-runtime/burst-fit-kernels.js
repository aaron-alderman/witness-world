// burst-fit-kernel.mjs — IN-IR burst-fit RPM recovery (Rung D, engentus vertical).
//
// A lowered compute kernel in the mill-force-kernels.js spirit: pure numeric,
// named, ported directly from the PIPELINE.dsl spec (§4.6 "Harmonic fit").
// This is the "DESIRE eats Python" artifact for the burst-fit stage's core —
// the harmonic least-squares + two-stage RPM grid search. The fit math is REAL
// and self-contained; it is verifiable against an independent oracle (a clean
// synthetic sinusoid's known frequency, or the real Python's captured output).
//
// SEAMS for the final stage (the only remaining external work):
//   • C side  — the real Python handler reads real burst ADC samples from the
//     DB and returns the real rpm. It plugs in as the `oracle` to
//     migrateHostOperation, and as a subprocess handler in the Rung-C runtime.
//   • D side  — `createBurstFitInIrHandler({ sampleSource })`: the kernel below
//     is already the real math; the only external piece is `sampleSource`, which
//     resolves a burst's samples from its `burst_start`. Today it is fixture-fed;
//     in production it becomes the same DB read the Python does. Preprocessing
//     the spec also lists (Butterworth low-pass §4.5, stale/good masking §4.2-4.4)
//     are additional kernels that slot in front of this one for full fidelity.

import path from "node:path";
import { createComputeHostOpHandler } from "../../src/desire/host-op-migration.js";
import { compileRvmFileToDesirePlus, normalizeDesirePlusToDesire } from "../../src/desire/index.js";
import { evaluateModel } from "../chart-runtime/plan/evaluate-model.js";
export { createBurstFitInIrHandler, burstFitFunctions };

const TWO_PI = 2 * Math.PI;
const rpmToOmega = rpm => TWO_PI * rpm / 60; // rev/min → rad/s

// Solve a 3×3 linear system (normal equations for the [1, cos, sin] design)
// via Cramer's rule. Returns null if singular.
function solve3(A, b) {
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-18) return null;
  const col = (m, c, v) => m.map((row, i) => row.map((x, j) => (j === c ? v[i] : x)));
  return [det(col(A, 0, b)) / D, det(col(A, 1, b)) / D, det(col(A, 2, b)) / D];
}

// Least-squares fit of g(t) ≈ c0 + cc·cos(ωt) + cs·sin(ωt); returns coefficients
// and the residual sum of squares (SSE). Closed-form via normal equations.
function harmonicFit(g, t, omega) {
  let S11 = 0, Sc = 0, Ss = 0, Scc = 0, Sss = 0, Scs = 0;
  let Sy = 0, Syc = 0, Sys = 0;
  for (let i = 0; i < g.length; i++) {
    const c = Math.cos(omega * t[i]);
    const s = Math.sin(omega * t[i]);
    const y = g[i];
    S11 += 1; Sc += c; Ss += s;
    Scc += c * c; Sss += s * s; Scs += c * s;
    Sy += y; Syc += y * c; Sys += y * s;
  }
  const A = [[S11, Sc, Ss], [Sc, Scc, Scs], [Ss, Scs, Sss]];
  const coeffs = solve3(A, [Sy, Syc, Sys]);
  if (!coeffs) return { coeffs: [0, 0, 0], sse: Infinity };
  const [c0, cc, cs] = coeffs;
  let sse = 0;
  for (let i = 0; i < g.length; i++) {
    const yhat = c0 + cc * Math.cos(omega * t[i]) + cs * Math.sin(omega * t[i]);
    const e = g[i] - yhat;
    sse += e * e;
  }
  return { coeffs, sse };
}

function argminOverGrid(g, t, lo, hi, step) {
  let best = { rpm: lo, sse: Infinity, coeffs: [0, 0, 0] };
  const n = Math.max(1, Math.round((hi - lo) / step));
  for (let i = 0; i <= n; i++) {
    const rpm = lo + i * step;
    if (rpm > hi + 1e-9) break;
    const { coeffs, sse } = harmonicFit(g, t, rpmToOmega(rpm));
    if (sse < best.sse) best = { rpm, sse, coeffs };
  }
  return best;
}

// fitBurstRpm — the kernel. g: magnitude samples; `times` = explicit sample times
// (preferred, e.g. real good-sample times after masking) or uniform `dt`.
// Returns { rpm, amplitude, phase, r_squared, sse } per the dsl extraction rules.
export function fitBurstRpm({ g, dt, times = null, rpmRange = [6.0, 18.0], coarseStep = 0.05, refineWindow = 0.25, refineStep = 0.005 } = {}) {
  if (!Array.isArray(g) || g.length === 0) throw new Error("fitBurstRpm: `g` must be a non-empty sample array");
  const t = Array.isArray(times) ? times : (dt > 0 ? g.map((_, i) => i * dt) : null);
  if (!t) throw new Error("fitBurstRpm: provide `times` (sample times) or a positive `dt`");

  // two-stage grid search over Σ SSE (single magnitude channel here)
  const coarse = argminOverGrid(g, t, rpmRange[0], rpmRange[1], coarseStep);
  const lo = Math.max(rpmRange[0], coarse.rpm - refineWindow);
  const hi = Math.min(rpmRange[1], coarse.rpm + refineWindow);
  const best = argminOverGrid(g, t, lo, hi, refineStep);

  const [, cc, cs] = best.coeffs;
  const amplitude = Math.hypot(cc, cs);
  const phase = Math.atan2(-cs, cc);          // φ = arctan2(−c_s, c_c)
  const mean = g.reduce((a, b) => a + b, 0) / g.length;
  const sst = g.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  const r_squared = sst > 0 ? 1 - best.sse / sst : 1;
  return { rpm: best.rpm, amplitude, phase, r_squared, sse: best.sse };
}

// synthBurst — generate a clean (or noisy) burst at a KNOWN rpm/amplitude/phase.
// Used as the independent ground-truth oracle for verification (it stands in for
// the real Python output). Deterministic noise via a seeded LCG.
export function synthBurst({ rpm, amplitude = 1, phase = 0, seconds = 12, fs = 50, noise = 0, seed = 1 } = {}) {
  const dt = 1 / fs;
  const n = Math.round(seconds * fs);
  const omega = rpmToOmega(rpm);
  let s = seed >>> 0;
  const rand = () => { s = (1103515245 * s + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
  const g = [];
  for (let i = 0; i < n; i++) {
    g.push(amplitude * Math.cos(omega * (i * dt) + phase) + (noise ? noise * rand() : 0));
  }
  return { g, dt, truth: { rpm, amplitude, phase, r_squared: 1 } };
}

// ── lowered kernel leaf (referenced by the BurstFit DESIRE model) ──────────
// The two-stage RPM grid search is an irreducible numerical leaf (cf. mill-force).
const burstFitFunctions = {
  burst_rpm: (g, dt, times, rpmLo, rpmHi) =>
    fitBurstRpm({
      g, dt: dt || undefined, times: Array.isArray(times) ? times : null,
      rpmRange: [rpmLo, rpmHi]
    }).rpm
};

let _modelBody = null;
async function burstFitModelBody() {
  if (_modelBody) return _modelBody;
  const file = path.join(process.cwd(), "examples_rvm", "engentus", "app", "models", "burst-fit.rvm");
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
  const node = desire.nodes.find(n => n.kind === "dataflow" && n.name === "BurstFit");
  if (!node) throw new Error("BurstFit dataflow model not found in burst-fit.rvm");
  _modelBody = node.body;
  return _modelBody;
}

// The in-IR host-op handler for engentus.pipeline.fit.burst, conforming to the
// declared BurstFitResultPayload { burst_start, rpm, n_valid_pkgs }. Runs THROUGH
// the model via evaluateModel: the burst samples become model params; the lowered
// grid-search leaf yields the rpm. `sampleSource(burst_start)` is the data seam.
function createBurstFitInIrHandler({ sampleSource, fitOptions = {} } = {}) {
  if (typeof sampleSource !== "function") throw new Error("createBurstFitInIrHandler: `sampleSource` (burst_start → { g, dt, n_valid_pkgs? }) is required");
  const [rpmLo, rpmHi] = fitOptions.rpmRange ?? [6.0, 18.0];
  return createComputeHostOpHandler({
    resolveInputs: request => {
      const data = sampleSource(request.burst_start);
      if (!data) throw new Error(`burst-fit in-IR: no samples for burst_start '${request.burst_start}'`);
      return data;
    },
    compute: async data => {
      const body = await burstFitModelBody();
      const ev = evaluateModel(body, {
        functions: burstFitFunctions,
        params: { g: data.g, dt: data.dt ?? 0, times: data.times ?? 0, rpm_lo: rpmLo, rpm_hi: rpmHi }
      });
      return { rpm: ev.fields.rpm.data, nValid: data.n_valid_pkgs ?? 1 };
    },
    mapResponse: (out, request) => ({
      burst_start: request.burst_start,
      rpm: out.rpm,
      n_valid_pkgs: out.nValid
    })
  });
}

// ── Extended harmonic model (verified against real package_phase.csv) ─────────
// The real pipeline fits, per package, a design matrix [1, cos(ωt), sin(ωt)]
// optionally augmented with the 2nd harmonic [cos(2ωt), sin(2ωt)] and a phase-
// drift pair [t̄·cos(ωt), t̄·sin(ωt)] (t̄ = centred time). These helpers add that
// richer model and the exact extraction formulas the real columns use:
//   amplitude = √(cos² + sin²),  phase = atan2(−sin, cos),  omega = rpm·2π/60.

export const omegaForRpm = rpm => rpmToOmega(rpm);

// extract {amplitude, phase} from a (cos, sin) coefficient pair — matches the
// real `amplitude` / `magnitude_phase` (and `harmonic2_amplitude`/`_phase`) columns.
export function extractHarmonic(cosCoeff, sinCoeff) {
  return { amplitude: Math.hypot(cosCoeff, sinCoeff), phase: Math.atan2(-sinCoeff, cosCoeff) };
}

// general dense linear solve (Gauss–Jordan with partial pivoting); null if singular
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-15) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

// design matrix columns: [1, (cos hω t, sin hω t for h=1..harmonics), (drift cos/sin)]
function buildDesign(t, omega, { harmonics = 1, drift = false } = {}) {
  const tbar = t.reduce((a, b) => a + b, 0) / t.length;
  return t.map(ti => {
    const cols = [1];
    for (let h = 1; h <= harmonics; h++) cols.push(Math.cos(h * omega * ti), Math.sin(h * omega * ti));
    if (drift) cols.push((ti - tbar) * Math.cos(omega * ti), (ti - tbar) * Math.sin(omega * ti));
    return cols;
  });
}

function lstsq(design, y) {
  const k = design[0].length;
  const n = design.length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = design[i];
    for (let a = 0; a < k; a++) {
      Xty[a] += row[a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += row[a] * row[b];
    }
  }
  const coeffs = solveLinear(XtX, Xty) ?? new Array(k).fill(0);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    let yh = 0;
    for (let a = 0; a < k; a++) yh += coeffs[a] * design[i][a];
    const e = y[i] - yh;
    sse += e * e;
  }
  return { coeffs, sse };
}

// Fit the harmonic model at a GIVEN rpm and extract the package_phase quantities.
// Returns offset, fundamental cos/sin + amplitude/phase, sse, r², and (when
// requested) the 2nd-harmonic and phase-drift outputs — matching the real columns.
export function fitBurstHarmonics({ g, dt, times = null, rpm, harmonics = 1, drift = false } = {}) {
  if (!Array.isArray(g) || g.length === 0) throw new Error("fitBurstHarmonics: `g` must be a non-empty sample array");
  const omega = rpmToOmega(rpm);
  const t = Array.isArray(times) ? times : g.map((_, i) => i * dt);
  const { coeffs, sse } = lstsq(buildDesign(t, omega, { harmonics, drift }), g);
  const mean = g.reduce((a, b) => a + b, 0) / g.length;
  const sst = g.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  const fund = extractHarmonic(coeffs[1], coeffs[2]);
  const out = {
    rpm, omega,
    offset: coeffs[0],
    cos_coeff: coeffs[1], sin_coeff: coeffs[2],
    amplitude: fund.amplitude, magnitude_phase: fund.phase,
    sse, r_squared: sst > 0 ? 1 - sse / sst : 1
  };
  if (harmonics >= 2) {
    const h2 = extractHarmonic(coeffs[3], coeffs[4]);
    out.harmonic2_cos_coeff = coeffs[3];
    out.harmonic2_sin_coeff = coeffs[4];
    out.harmonic2_amplitude = h2.amplitude;
    out.harmonic2_phase = h2.phase;
  }
  if (drift) {
    const i0 = 1 + 2 * harmonics;
    out.phase_drift_cos_coeff = coeffs[i0];
    out.phase_drift_sin_coeff = coeffs[i0 + 1];
    out.phase_drift_strength = Math.hypot(coeffs[i0], coeffs[i0 + 1]);
  }
  return out;
}

// Multi-axis objective (model.py fit_multiaxis_harmonic_series): the per-package
// SSE is the sum over axes {X,Y,Z} of the [1,cos,sin] fit residual at ω.
export function multiAxisSse({ axes, times, rpm }) {
  let sse = 0;
  for (const g of axes) sse += fitBurstHarmonics({ g, times, rpm, harmonics: 1 }).sse;
  return sse;
}

// Burst-level RPM selection (model.py evaluate_rpm): two-stage grid search over
// the joint objective Σ_packages Σ_axes SSE. packages: [{ axes:[x[],y[],z[]], times }].
export function fitBurstRpmJoint(packages, { rpmRange = [6.0, 18.0], coarseStep = 0.05, refineWindow = 0.25, refineStep = 0.005 } = {}) {
  const objective = rpm => packages.reduce((acc, p) => acc + multiAxisSse({ axes: p.axes, times: p.times, rpm }), 0);
  const scan = (lo, hi, step) => {
    let best = { rpm: lo, sse: Infinity };
    const n = Math.max(1, Math.round((hi - lo) / step));
    for (let i = 0; i <= n; i++) {
      const rpm = lo + i * step;
      if (rpm > hi + 1e-9) break;
      const sse = objective(rpm);
      if (sse < best.sse) best = { rpm, sse };
    }
    return best;
  };
  const coarse = scan(rpmRange[0], rpmRange[1], coarseStep);
  return scan(Math.max(rpmRange[0], coarse.rpm - refineWindow), Math.min(rpmRange[1], coarse.rpm + refineWindow), refineStep);
}

// ── Latent row model (PIPELINE.dsl §4.7) ──────────────────────────────────────
// Per-burst phase decomposition:  φ = α_burst + γ_bolt·1[mount=bolt] + κ·row.
// Fitted by iterative phase-unwrapping OLS (phase is circular, so each iteration
// snaps the observed phase to the nearest 2π-multiple of the model prediction,
// then refits). The per-burst intercepts α are eliminated by within-burst
// demeaning (Frisch–Waugh–Lovell), so γ and κ come from a 2×2 solve regardless of
// how many bursts there are. Verified against the real latent_row_fit.json.
//
// observations: [{ burst, bolt: 0|1 (1 ⇔ mount=bolt), row, phase }]
export function fitLatentRowModel(observations, { unwrapIters = 12 } = {}) {
  const n = observations.length;
  if (n === 0) throw new Error("fitLatentRowModel: no observations");
  const byBurst = new Map();
  for (let i = 0; i < n; i++) {
    const b = observations[i].burst;
    if (!byBurst.has(b)) byBurst.set(b, []);
    byBurst.get(b).push(i);
  }
  const obs = observations.map(o => o.phase);   // original observed phase
  const bolt = observations.map(o => o.bolt);
  const row = observations.map(o => o.row);
  const phi = obs.slice();                       // current unwrapped phase
  let gamma = 0;
  let kappa = 0;
  let alpha = new Map();
  let iterations = 0;

  for (let iter = 0; iter < unwrapIters; iter++) {
    iterations = iter + 1;
    // within-burst demean of phi, bolt, row
    const dphi = new Array(n);
    const db = new Array(n);
    const dr = new Array(n);
    for (const idxs of byBurst.values()) {
      let mp = 0, mb = 0, mr = 0;
      for (const i of idxs) { mp += phi[i]; mb += bolt[i]; mr += row[i]; }
      const k = idxs.length; mp /= k; mb /= k; mr /= k;
      for (const i of idxs) { dphi[i] = phi[i] - mp; db[i] = bolt[i] - mb; dr[i] = row[i] - mr; }
    }
    // 2×2 normal equations on the demeaned data (intercept absorbed by demeaning)
    let Sbb = 0, Sbr = 0, Srr = 0, Sbp = 0, Srp = 0;
    for (let i = 0; i < n; i++) {
      Sbb += db[i] * db[i]; Sbr += db[i] * dr[i]; Srr += dr[i] * dr[i];
      Sbp += db[i] * dphi[i]; Srp += dr[i] * dphi[i];
    }
    const det = Sbb * Srr - Sbr * Sbr;
    gamma = det !== 0 ? (Sbp * Srr - Srp * Sbr) / det : 0;
    kappa = det !== 0 ? (Sbb * Srp - Sbr * Sbp) / det : 0;
    // per-burst intercept = mean residual after removing γ·bolt + κ·row
    alpha = new Map();
    for (const [b, idxs] of byBurst) {
      let s = 0;
      for (const i of idxs) s += phi[i] - gamma * bolt[i] - kappa * row[i];
      alpha.set(b, s / idxs.length);
    }
    // re-unwrap: snap each observed phase to the nearest 2π-multiple of the prediction
    let changed = false;
    for (let i = 0; i < n; i++) {
      const pred = alpha.get(observations[i].burst) + gamma * bolt[i] + kappa * row[i];
      const m = Math.round((pred - obs[i]) / TWO_PI);
      const next = obs[i] + TWO_PI * m;
      if (next !== phi[i]) { phi[i] = next; changed = true; }
    }
    if (!changed) break;
  }

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = alpha.get(observations[i].burst) + gamma * bolt[i] + kappa * row[i];
    const e = phi[i] - pred;
    sse += e * e;
  }
  return { gamma_bolt: gamma, kappa, sse, rmse: Math.sqrt(sse / n), observation_count: n, burst_count: byBurst.size, iterations };
}
