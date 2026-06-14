/**
 * mill_force_model.js — Mill liner force calculator, two independent implementations.
 *
 *   millForcesFaithful(inputs)  — exact translation of the Excel model
 *   millForcesGrounded(inputs)  — first-principles derivation (Morrell convention)
 *   compareModels(inputs)       — structured diff of both
 *   millForcesMC(inputs, n, paramDists) — Monte Carlo over perturbed inputs
 *
 * No DOM dependencies. Requires sampling.js (sampleParam, pct) from the same folder.
 */

import { sampleParam, seedRng } from './sampling.js';

// ── Numerical constants ───────────────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;

// 64-point Gauss-Legendre nodes and weights on [-1, 1]
// Source: DLMF / Abramowitz & Stegun Table 25.4
// Nodes are listed as positive values; used symmetrically as ±node[i]
const _GL64_X = [
  0.0243502926634244325089,0.0729931217877990394495,0.1214628509941929108768,0.1696444204239928180374,
  0.2174236437400070841497,0.2646871622087674163881,0.3113228719902109561575,0.3572201583376681159504,
  0.4022701579639916036958,0.4463660172534640879849,0.4894031457070529574785,0.5312794640198945456881,
  0.5718956462026340342839,0.6111553551723932502488,0.6489654712546573398578,0.6852363130542332425635,
  0.7198818501716108268490,0.7528199072605318966118,0.7839723589433414076102,0.8132653151227975597419,
  0.8406292962525803627516,0.8659993981540928197608,0.8893154459951141058534,0.9105221370785028057563,
  0.9295691721319395758214,0.9464113748584028160625,0.9610087996520537189186,0.9733268277899109637418,
  0.9833362538846259569312,0.9910133714767443207393,0.9963401167719552793469,0.9993050417357721394569,
];
const _GL64_W = [
  0.0486909570091397203834,0.0485754674415034269347,0.0483447622348029571697,0.0479993885964583077282,
  0.0475401657148303086622,0.0469681828162100173253,0.0462847965813144172959,0.0454916279274181444797,
  0.0445905581637565630601,0.0435837245293234533768,0.0424735151236535890073,0.0412625632426235286101,
  0.0399537411327203413866,0.0385501531786156291289,0.0370551285402400460404,0.0354722132568823838106,
  0.0338051618371416093915,0.0320579283548515535854,0.0302346570724024788612,0.0283396726142594832275,
  0.0263774697150546586716,0.0243527025687108733382,0.0222701738083832541006,0.0201348231535302093723,
  0.0179517157756973430850,0.0157260304760247193219,0.0134630478967186425981,0.0111681394601311288185,
  0.0088467598263639477231,0.0065044579689783628561,0.0041470332605624676352,0.0017832807216964329472,
];

/**
 * Fixed-point 64-point Gauss-Legendre quadrature of f on [a, b].
 * Accurate to ~1e-10 for smooth integrands. Replaces scipy.integrate.quad.
 */
function gaussLegendreQuad(f, a, b) {
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  let s = 0;
  for (let i = 0; i < 32; i++) {
    const dx = half * _GL64_X[i];
    s += _GL64_W[i] * (f(mid + dx) + f(mid - dx));
  }
  return s * half;
}

/**
 * Brent's method root-finding on bracket [a, b].
 * Replaces scipy.optimize.brentq.
 * Throws if f(a) and f(b) have the same sign.
 */
function brentq(f, a, b, tol = 1e-10, maxIter = 100) {
  let fa = f(a), fb = f(b);
  if (fa * fb > 0) throw new Error(`brentq: f(a) and f(b) must have opposite signs (got ${fa}, ${fb})`);
  if (Math.abs(fa) < tol) return a;
  if (Math.abs(fb) < tol) return b;

  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = e = b - a; }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b; b = c; c = a;
      fa = fb; fb = fc; fc = fa;
    }
    const tol1 = 2 * 2.22e-16 * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || Math.abs(fb) < tol) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p, q, r, s2 = fb / fa;
      if (a === c) {
        p = 2 * xm * s2; q = 1 - s2;
      } else {
        q = fa / fc; r = fb / fc;
        p = s2 * (2 * xm * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s2 - 1);
      }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d; d = p / q;
      } else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}


// ── Defaults and metadata ─────────────────────────────────────────────────────

export const DEFAULT_INPUTS = Object.freeze({
  percent_crit:   0.9,
  mu:             0.3,
  radius:         6.0,
  beta_prime_deg: 50.0,
  N_segments:     39,
  J_total:        0.3,
  J_balls:        0.1,
  J_voids:        0.4,
  percent_solids: 0.75,
  rho_ball:       7.8,
  rho_ore:        3.1,
  g:              9.81,
  depth:          1.5,
  m_liner:        0.0,
  height:         0.5,
});

export const PARAM_META = {
  percent_crit:   { label: 'Speed N/Nc',          unit: '',    min: 0.5,  max: 1.0,   step: 0.01,  description: 'Mill speed as fraction of critical speed' },
  mu:             { label: 'Wall friction μ',     unit: '',    min: 0.1,  max: 0.6,   step: 0.01,  description: 'Charge-liner friction coefficient' },
  radius:         { label: 'Shell radius',       unit: 'm',   min: 1.0,  max: 10.0,  step: 0.1,   description: 'Shell inner radius' },
  beta_prime_deg: { label: 'Liner face angle',   unit: '°',   min: 20,   max: 80,    step: 1,     description: 'Liner face angle from radial' },
  N_segments:     { label: 'Liner count',        unit: '',    min: 12,   max: 72,    step: 1,     description: 'Number of liners / segments' },
  J_total:        { label: 'Fill fraction J',    unit: '',    min: 0.1,  max: 0.45,  step: 0.01,  description: 'Total volumetric fill fraction' },
  J_balls:        { label: 'Ball fraction',      unit: '',    min: 0.0,  max: 0.3,   step: 0.01,  description: 'Ball fraction of mill volume' },
  J_voids:        { label: 'Void fraction',      unit: '',    min: 0.1,  max: 0.6,   step: 0.01,  description: 'Void fraction within charge' },
  percent_solids: { label: 'Solids (mass)',      unit: '',    min: 0.3,  max: 0.9,   step: 0.01,  description: 'Slurry solids fraction by mass' },
  rho_ball:       { label: 'Ball density',       unit: 'SG',  min: 3.0,  max: 8.0,   step: 0.1,   description: 'Ball density (specific gravity)' },
  rho_ore:        { label: 'Ore density',        unit: 'SG',  min: 2.0,  max: 5.0,   step: 0.1,   description: 'Ore density (specific gravity)' },
  g:              { label: 'Gravity',            unit: 'm/s²',min: 9.0,  max: 10.0,  step: 0.01,  description: 'Gravitational acceleration' },
  depth:          { label: 'Mill depth',         unit: 'm',   min: 0.5,  max: 8.0,   step: 0.1,   description: 'Axial mill depth (effective)' },
  m_liner:        { label: 'Liner mass',         unit: 'kg',  min: 0,    max: 500,   step: 5,     description: 'Liner mass per segment' },
  height:         { label: 'Liner height',       unit: 'm',   min: 0.05, max: 1.0,   step: 0.01,  description: 'Liner radial protrusion' },
};


// ── Section 1: Geometry primitives ───────────────────────────────────────────

function polarToXY(r, theta) {
  return [r * Math.sin(theta), -r * Math.cos(theta)];
}

function shoelaceArea(xs, ys) {
  const n = xs.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += xs[i] * ys[j] - xs[j] * ys[i];
  }
  return Math.abs(s) / 2;
}

function shoelaceCentroid(xs, ys) {
  const n = xs.length;
  let area6 = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = xs[i] * ys[j] - xs[j] * ys[i];
    area6 += cross;
    cx += (xs[i] + xs[j]) * cross;
    cy += (ys[i] + ys[j]) * cross;
  }
  if (Math.abs(area6) < 1e-14) return [0, 0];
  return [cx / (3 * area6), cy / (3 * area6)];
}

function segmentArea(dTheta, r) {
  return (dTheta - Math.sin(dTheta)) / 2 * r * r;
}

function segmentCentroidR(dTheta, r) {
  const denom = 3 * (dTheta - Math.sin(dTheta));
  if (Math.abs(denom) < 1e-14) return r;
  return 4 * r * Math.pow(Math.sin(dTheta / 2), 3) / denom;
}

function chordRadialIntercept(theta, m, c) {
  const denom = Math.cos(theta) + m * Math.sin(theta);
  if (Math.abs(denom) < 1e-12) return Infinity;
  return -c / denom;
}

function fillChord(rInner, phi, phiPrime) {
  const [x1, y1] = polarToXY(rInner, phi);
  const [x2, y2] = polarToXY(rInner, phiPrime);
  const dx = x2 - x1;
  if (Math.abs(dx) < 1e-14) return { m: 0, c: y1 };
  const m = (y2 - y1) / dx;
  const c = y1 - m * x1;
  return { m, c };
}

function chargeDensity(inp) {
  const J_ore = inp.J_total - inp.J_balls;
  const rho_pulp = inp.rho_ore / ((1 - inp.percent_solids) * inp.rho_ore + inp.percent_solids);
  return (
    (inp.J_balls / inp.J_total * inp.rho_ball + J_ore / inp.J_total * inp.rho_ore)
    * (1 - inp.J_voids)
    + inp.J_voids * rho_pulp
  );
}

function shoulderAngle(inp, omega) {
  const beta = (90 - inp.beta_prime_deg) * Math.PI / 180;
  const alpha = Math.atan(inp.mu);
  const arg = Math.sin(beta + alpha) * omega * omega * inp.radius / inp.g;
  if (Math.abs(arg) > 1) throw new Error(`shoulderAngle: asin argument ${arg.toFixed(4)} outside [-1,1]`);
  return Math.asin(arg) + alpha + beta;
}


// ── Section 2: Faithful (Excel) model ────────────────────────────────────────

function areaCDProfile(gamma, r, h) {
  return 0.5 * (gamma * r * r - Math.sin(gamma) * (r - h) * (r - h));
}

function calcGammaFaithful(J, r, h) {
  const n = 500;
  const gammas = Array.from({ length: n }, (_, i) => i * TWO_PI / n);
  const ratios = gammas.map(g => areaCDProfile(g, r, h) / (Math.PI * r * r));
  // Binary search: largest idx where ratios[idx] <= J
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ratios[mid] <= J) lo = mid; else hi = mid - 1;
  }
  return gammas[Math.max(0, Math.min(lo, n - 1))];
}

function calcGammaGrounded(J) {
  return brentq(g => (g - Math.sin(g)) / TWO_PI - J, 1e-9, TWO_PI - 1e-9);
}

function generateRadialSlice(t1, t2, r, m, c) {
  let r1 = chordRadialIntercept(t1, m, c);
  let r2 = chordRadialIntercept(t2, m, c);
  r1 = Math.max(0, Math.min(r, r1));
  r2 = Math.max(0, Math.min(r, r2));
  const pts = [
    polarToXY(r,  t1),
    polarToXY(r1, t1),
    polarToXY(r2, t2),
    polarToXY(r,  t2),
  ];
  return { xs: pts.map(p => p[0]), ys: pts.map(p => p[1]) };
}

function generateVerticalSlice(t1, t2, rInner, m, c) {
  const [x1, y1] = polarToXY(rInner, t1);
  const [x2, y2] = polarToXY(rInner, t2);
  const y1c = y1 > 0 ? y1 : m * x1 + c;
  const y2c = y2 > 0 ? y2 : m * x2 + c;
  return {
    xs: [x1, x1, x2, x2],
    ys: [y1, y1c, y2c, y2],
  };
}

function segmentForcesFaithful(i, inp, d) {
  const { rInner, dTheta, omega, phi, phiPrime, mFill, cFill, rhoCharge } = d;
  const t1 = phi - dTheta * (i - 1);
  const t2 = Math.max(phiPrime, t1 - dTheta);
  const tBar = 0.5 * (t1 + t2);
  const arc = t1 - t2;

  if (arc < 1e-12) {
    const Fc_r = omega * omega * inp.radius * inp.m_liner;
    return { segment: i, t1, t2, tBar, Fw_r: 0, Fw_t: 0, Fc_r, Fc_t: 0,
             F_r: Fc_r, F_t: 0, F_resultant: Fc_r, m_charge: 0, m_total: inp.m_liner };
  }

  // Gravity area: three pieces
  const inCharge   = t1 >= phiPrime;
  const inVert     = t1 > phiPrime;
  const fullySub   = phiPrime + dTheta < t1 && t1 <= phi;

  const A_hollow = inCharge
    ? arc / TWO_PI * (inp.radius * inp.radius - rInner * rInner)
    : 0;

  let A_vert = 0;
  if (inVert) {
    const vs = generateVerticalSlice(t1, t2, rInner, mFill, cFill);
    A_vert = shoelaceArea(vs.xs, vs.ys);
  }

  const A_seg_v = fullySub ? segmentArea(dTheta, rInner) : 0;

  const A_gravity = A_hollow + A_vert + A_seg_v;
  const m_charge = A_gravity * inp.depth * rhoCharge * 1000;
  const m_total  = m_charge + inp.m_liner;

  const Fw_r = Math.cos(tBar) * m_total * inp.g;
  const Fw_t = Math.sin(tBar) * m_total * inp.g;  // Excel convention

  // Centrifugal: radial-slice polygon
  let m_rad = 0, Cr = 0;
  if (inCharge) {
    const rs = generateRadialSlice(t1, t2, inp.radius, mFill, cFill);
    const A_rad = shoelaceArea(rs.xs, rs.ys);
    m_rad = A_rad * inp.depth * rhoCharge * 1000;
    const [cx, cy] = shoelaceCentroid(rs.xs, rs.ys);
    Cr = Math.sqrt(cx * cx + cy * cy);
  }

  const A_seg_r = fullySub ? segmentArea(dTheta, inp.radius) : 0;
  const m_seg_r = A_seg_r * inp.depth * rhoCharge * 1000;
  const Csr     = fullySub ? segmentCentroidR(dTheta, inp.radius) : 0;

  const Fc_r = omega * omega * (Cr * m_rad + Csr * m_seg_r + inp.radius * inp.m_liner);
  const Fc_t = 0;

  const F_r = Fw_r + Fc_r;
  const F_t = Fw_t + Fc_t;
  return { segment: i, t1, t2, tBar, Fw_r, Fw_t, Fc_r, Fc_t,
           F_r, F_t, F_resultant: Math.sqrt(F_r * F_r + F_t * F_t),
           m_charge, m_total };
}


// ── Section 3: Grounded (first-principles) model ─────────────────────────────

function segmentForcesGrounded(i, inp, d) {
  const { rInner, dTheta, omega, phi, phiPrime, mFill, cFill, rhoCharge } = d;
  const t1 = phi - dTheta * (i - 1);
  const t2 = Math.max(phiPrime, t1 - dTheta);
  const tBar = 0.5 * (t1 + t2);
  const arc = t1 - t2;

  if (arc < 1e-12) {
    const Fc_r = omega * omega * inp.radius * inp.m_liner;
    return { segment: i, t1, t2, tBar, Fw_r: 0, Fw_t: 0, Fc_r, Fc_t: 0,
             F_r: Fc_r, F_t: 0, F_resultant: Fc_r, m_charge: 0, m_total: inp.m_liner };
  }

  const r = inp.radius;

  // Area: ∫ 0.5*(r² - r_ci(θ)²) dθ  where r_ci = max(rInner, r_fill(θ))
  function stripArea(theta) {
    const denom = Math.cos(theta) + mFill * Math.sin(theta);
    if (Math.abs(denom) < 1e-12) return 0;
    const rFill = -cFill / denom;
    if (rFill >= r) return 0;
    const rCi = Math.max(rInner, rFill);
    return 0.5 * (r * r - rCi * rCi);
  }

  // Centrifugal moment: ∫ (r³ - r_ci³)/3 dθ
  function stripMoment(theta) {
    const denom = Math.cos(theta) + mFill * Math.sin(theta);
    if (Math.abs(denom) < 1e-12) return 0;
    const rFill = -cFill / denom;
    if (rFill >= r) return 0;
    const rCi = Math.max(rInner, rFill);
    return (r * r * r - rCi * rCi * rCi) / 3;
  }

  const A_gravity = gaussLegendreQuad(stripArea, t2, t1);
  const Mr        = gaussLegendreQuad(stripMoment, t2, t1);
  const m_charge  = A_gravity * inp.depth * rhoCharge * 1000;
  const m_total   = m_charge + inp.m_liner;

  const Fw_r =  Math.cos(tBar) * m_total * inp.g;
  const Fw_t = -Math.sin(tBar) * m_total * inp.g;  // first-principles sign

  const Cr   = A_gravity > 1e-14 ? Mr / A_gravity : 0;
  const Fc_r = omega * omega * (Cr * m_charge + inp.radius * inp.m_liner);
  const Fc_t = 0;

  const F_r = Fw_r + Fc_r;
  const F_t = Fw_t + Fc_t;
  return { segment: i, t1, t2, tBar, Fw_r, Fw_t, Fc_r, Fc_t,
           F_r, F_t, F_resultant: Math.sqrt(F_r * F_r + F_t * F_t),
           m_charge, m_total };
}


// ── Section 4: Top-level model functions ─────────────────────────────────────

function _derived(inp, gamma, phi) {
  const rInner   = inp.radius - inp.height;
  const dTheta   = TWO_PI / inp.N_segments;
  const omega    = Math.sqrt(inp.g / inp.radius) * inp.percent_crit;
  const rhoCharge = chargeDensity(inp);
  const phiPrime = phi - gamma;
  const chord    = fillChord(rInner, phi, phiPrime);
  return { rInner, dTheta, omega, phi, phiPrime, mFill: chord.m, cFill: chord.c, rhoCharge };
}

function _buildResult(inp, gamma, segments) {
  const phi      = segments[0]?.t1 ?? 0;
  const phiPrime = phi - gamma;
  const omega    = Math.sqrt(inp.g / inp.radius) * inp.percent_crit;
  const chord    = fillChord(inp.radius - inp.height, phi, phiPrime);
  const F_rs = segments.map(s => s.F_r);
  const F_ts = segments.map(s => s.F_t);
  return {
    inputs: inp,
    gamma,
    phi: segments[0]?.t1 ?? 0,
    phi_prime: phiPrime,
    omega,
    rho_charge: chargeDensity(inp),
    fill_gradient: chord.m,
    fill_intercept: chord.c,
    segments,
    F_r_min: Math.min(...F_rs),
    F_r_max: Math.max(...F_rs),
    F_t_min: Math.min(...F_ts),
    F_t_max: Math.max(...F_ts),
  };
}

export function millForcesFaithful(inputs) {
  const inp   = inputs ? { ...DEFAULT_INPUTS, ...inputs } : { ...DEFAULT_INPUTS };
  const omega = Math.sqrt(inp.g / inp.radius) * inp.percent_crit;
  const gamma = calcGammaFaithful(inp.J_total, inp.radius, inp.height);
  const phi   = shoulderAngle(inp, omega);
  const d     = _derived(inp, gamma, phi);
  const segs  = Array.from({ length: inp.N_segments }, (_, i) =>
    segmentForcesFaithful(i + 1, inp, d));
  return _buildResult(inp, gamma, segs);
}

export function millForcesGrounded(inputs) {
  const inp   = inputs ? { ...DEFAULT_INPUTS, ...inputs } : { ...DEFAULT_INPUTS };
  const omega = Math.sqrt(inp.g / inp.radius) * inp.percent_crit;
  const gamma = calcGammaGrounded(inp.J_total);
  const phi   = shoulderAngle(inp, omega);
  const d     = _derived(inp, gamma, phi);
  const segs  = Array.from({ length: inp.N_segments }, (_, i) =>
    segmentForcesGrounded(i + 1, inp, d));
  return _buildResult(inp, gamma, segs);
}


// ── Section 5: Comparison ─────────────────────────────────────────────────────

function _diffVal(a, b) {
  const abs_diff = Math.abs(a - b);
  const rel_diff = Math.abs(a) > 1e-14 ? abs_diff / Math.abs(a) : Infinity;
  return { faithful: a, grounded: b, abs_diff, rel_diff };
}

export function compareModels(inputs) {
  const f = millForcesFaithful(inputs);
  const g = millForcesGrounded(inputs);

  const global_diffs = {
    gamma:          _diffVal(f.gamma,          g.gamma),
    phi:            _diffVal(f.phi,            g.phi),
    phi_prime:      _diffVal(f.phi_prime,      g.phi_prime),
    omega:          _diffVal(f.omega,          g.omega),
    rho_charge:     _diffVal(f.rho_charge,     g.rho_charge),
    fill_gradient:  _diffVal(f.fill_gradient,  g.fill_gradient),
    fill_intercept: _diffVal(f.fill_intercept, g.fill_intercept),
  };

  const segment_diffs = f.segments.map((sf, idx) => {
    const sg = g.segments[idx];
    const row = { segment: sf.segment };
    for (const key of ['m_charge', 'Fw_r', 'Fw_t', 'Fc_r', 'F_r', 'F_t', 'F_resultant']) {
      row[key] = _diffVal(sf[key], sg[key]);
    }
    return row;
  });

  const F_r_diffs = f.segments.map((sf, i) => Math.abs(sf.F_r - g.segments[i].F_r));
  const F_t_diffs = f.segments.map((sf, i) => Math.abs(sf.F_t - g.segments[i].F_t));
  const maxFr = Math.max(...f.segments.map(s => Math.abs(s.F_r))) || 1;
  const maxFt = Math.max(...f.segments.map(s => Math.abs(s.F_t))) || 1;

  return {
    inputs: f.inputs,
    faithful: f,
    grounded: g,
    global_diffs,
    segment_diffs,
    max_abs_F_r_diff: Math.max(...F_r_diffs),
    max_abs_F_t_diff: Math.max(...F_t_diffs),
    max_rel_F_r_diff: Math.max(...F_r_diffs) / maxFr,
    max_rel_F_t_diff: Math.max(...F_t_diffs) / maxFt,
    Fw_t_sign_note: 'Fw_t sign differs by design: faithful=+sin(t)*m*g (Excel convention), grounded=-sin(t)*m*g (dot-product). F_t differences include this sign flip.',
  };
}


// ── Section 6: Monte Carlo ────────────────────────────────────────────────────

/**
 * Run N samples of the grounded model with perturbed inputs.
 *
 * paramDists: { paramName: { free: bool, dist: 'normal'|'uniform'|..., mean, std, ... } }
 * Each param in paramDists with free=true is sampled; others use the base inputs value.
 *
 * Returns array of N MillResult objects. Synchronous (~<100ms for N=200).
 */
export function millForcesMC(inputs, nSamples, paramDists) {
  const base = { ...DEFAULT_INPUTS, ...(inputs || {}) };
  seedRng(Date.now() & 0xffffffff);
  const results = [];
  for (let n = 0; n < nSamples; n++) {
    const sample = { ...base };
    for (const [key, dist] of Object.entries(paramDists)) {
      if (dist.free) {
        const v = sampleParam({ ...dist, value: base[key] });
        // Clamp to valid range using PARAM_META
        const meta = PARAM_META[key];
        sample[key] = meta ? Math.max(meta.min, Math.min(meta.max, v)) : v;
      }
    }
    try {
      results.push(millForcesGrounded(sample));
    } catch {
      // Domain error (e.g., shoulder angle overflow at extreme inputs) — skip this sample
    }
  }
  return results;
}
