/**
 * sampling.js — Seeded PRNG, distribution sampling, and statistics.
 * No dependencies.
 */

// ── Mulberry32 seeded PRNG ────────────────────────────────────────────
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Module-level PRNG — reseed before each simulation run via seedRng().
let _rng = mulberry32(42);

export const seedRng    = (seed)  => { _rng = mulberry32(seed ?? 42); };
export const saveRng    = ()      => _rng;
export const restoreRng = (saved) => { _rng = saved; };

// Swap in a local PRNG temporarily; returns a restore function.
export const withRng = (localRng) => {
  const prev = _rng;
  _rng = localRng;
  return () => { _rng = prev; };
};

// ── Normal sample (Box-Muller) ────────────────────────────────────────
export function randn() {
  const u1 = Math.max(1e-10, _rng()), u2 = _rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── Distribution sampling ─────────────────────────────────────────────
export function sampleParam(p) {
  if (!p.free) return p.value;
  switch (p.dist) {
    case 'bernoulli':  return _rng() < (p.prob ?? 0.5) ? 1 : 0;
    case 'normal':     return p.mean + p.std * randn();
    case 'uniform':    return p.umin + _rng() * (p.umax - p.umin);
    case 'lognormal':  { const z = p.lm + p.ls * randn(); return Math.exp(z); }
    case 'triangular': {
      const r = _rng(), fc = (p.tri_c - p.tri_a) / (p.tri_b - p.tri_a);
      return r < fc
        ? p.tri_a + Math.sqrt(r * (p.tri_b - p.tri_a) * (p.tri_c - p.tri_a))
        : p.tri_b - Math.sqrt((1 - r) * (p.tri_b - p.tri_a) * (p.tri_b - p.tri_c));
    }
    default: return p.value;
  }
}

export function sampleBoltParams(params) {
  const out = {};
  for (const k of Object.keys(params)) out[k] = sampleParam(params[k]);
  return out;
}

// ── Statistics ────────────────────────────────────────────────────────
/** p-th percentile of a pre-sorted array */
export const pct = (arr, p) => {
  const i = (arr.length - 1) * p, lo = Math.floor(i);
  return arr[lo] + (arr[lo + 1] ?? arr[lo]) * (i - lo);
};

/** One-way ANOVA on groups: [{name, values:[]}] */
export function anova(groups) {
  const allVals = groups.flatMap(g => g.values);
  const N = allVals.length, k = groups.length;
  if (N < k + 1 || k < 2) return null;
  const grand = allVals.reduce((a, b) => a + b, 0) / N;
  const ssBet = groups.reduce((s, g) =>
    s + g.values.length * Math.pow(g.values.reduce((a,b)=>a+b,0)/g.values.length - grand, 2), 0);
  const ssWit = groups.reduce((s, g) => {
    const m = g.values.reduce((a,b)=>a+b,0) / g.values.length;
    return s + g.values.reduce((a, v) => a + Math.pow(v - m, 2), 0);
  }, 0);
  const df1 = k - 1, df2 = N - k;
  const msBet = ssBet / df1, msWit = ssWit / df2;
  const F = msBet / msWit;
  return { F, df1, df2, p: 1 - _fCDF(F, df1, df2), ssBet, ssWit, msBet, msWit, grand, groups };
}

// ── Private: F-distribution CDF via regularised incomplete beta ────────
function _fCDF(F, d1, d2) {
  if (!isFinite(F) || F <= 0) return 0;
  return 1 - _ibeta(d2/2, d1/2, d2/(d2 + d1*F));
}
function _ibeta(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  if (x > (a+1)/(a+b+2)) return 1 - _ibeta(b, a, 1-x);
  const lbab = _lgamma(a)+_lgamma(b)-_lgamma(a+b);
  const front = Math.exp(Math.log(x)*a + Math.log(1-x)*b - lbab)/a;
  let f=1, C=1, D=1-(a+b)/(a+1)*x;
  if (Math.abs(D)<1e-30) D=1e-30; D=1/D; f=D;
  for (let m=1; m<=120; m++) {
    let n = m*(b-m)*x/((a+2*m-1)*(a+2*m));
    D=1+n*D; if(Math.abs(D)<1e-30)D=1e-30; C=1+n/C; if(Math.abs(C)<1e-30)C=1e-30;
    D=1/D; f*=D*C;
    n=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));
    D=1+n*D; if(Math.abs(D)<1e-30)D=1e-30; C=1+n/C; if(Math.abs(C)<1e-30)C=1e-30;
    D=1/D; const del=D*C; f*=del;
    if (Math.abs(del-1)<1e-10) break;
  }
  return front*f;
}
function _lgamma(z) {
  const p=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,
           -176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,
           1.5056327351493116e-7];
  if (z<0.5) return Math.log(Math.PI/Math.sin(Math.PI*z))-_lgamma(1-z);
  z-=1; let x=p[0]; for(let i=1;i<9;i++) x+=p[i]/(z+i);
  const t=z+7.5;
  return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
}
