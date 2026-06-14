export function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(42);

export function seedRng(seed) {
  rng = mulberry32(seed ?? 42);
}

export function randn() {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sampleParam(spec = {}) {
  if (!spec.free) return spec.value ?? spec.mean ?? 0;
  switch (spec.dist) {
    case "bernoulli":
      return rng() < (spec.prob ?? 0.5) ? 1 : 0;
    case "normal":
      return (spec.mean ?? spec.value ?? 0) + (spec.std ?? 0) * randn();
    case "uniform":
      return (spec.umin ?? 0) + rng() * ((spec.umax ?? 0) - (spec.umin ?? 0));
    case "lognormal": {
      const z = (spec.lm ?? 0) + (spec.ls ?? 0) * randn();
      return Math.exp(z);
    }
    case "triangular": {
      const lo = spec.tri_a ?? 0;
      const mid = spec.tri_c ?? lo;
      const hi = spec.tri_b ?? mid;
      const p = rng();
      const split = hi === lo ? 0 : (mid - lo) / (hi - lo);
      return p < split
        ? lo + Math.sqrt(p * (hi - lo) * (mid - lo))
        : hi - Math.sqrt((1 - p) * (hi - lo) * (hi - mid));
    }
    default:
      return spec.value ?? spec.mean ?? 0;
  }
}

export function pct(values, percentile) {
  if (!values.length) return null;
  const index = (values.length - 1) * percentile;
  const lo = Math.floor(index);
  const hi = Math.min(values.length - 1, lo + 1);
  const mix = index - lo;
  return values[lo] + (values[hi] - values[lo]) * mix;
}
