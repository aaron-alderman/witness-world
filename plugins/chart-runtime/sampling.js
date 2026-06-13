/**
 * sampling.js — GENERIC seeded sampling for Monte-Carlo ensembles. No domain logic.
 *
 * Draws are pure functions of an integer sample index (the `ensemble` axis coordinate),
 * so an MC model is fully reproducible: the same index always yields the same draw, and
 * the percentile reductions are deterministic and verifiable. This is the injected
 * capability the thesis predicts for stochasticity — the evaluator stays pure and treats
 * the sample dimension as "just another axis" (it carries the reducers; we carry the draws).
 *
 * Injected like a std-lib via evaluateModel({ functions }); promotable to a registered
 * sampling capability. Distinct draw streams per call site come from a fixed per-stream
 * salt mixed into the index, so e.g. normal(i,…) and uniform(i,…) don't correlate.
 */

// mulberry32 single draw in [0,1) from a 32-bit state
function draw(state) {
  let a = state >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const SEED = 0x9e3779b9;
const u01 = (i, salt) => draw((Math.floor(i) + SEED + salt) >>> 0);

// standard normal via Box-Muller from two decorrelated draws on the same index
function standardNormal(i) {
  const u1 = Math.max(1e-12, u01(i, 0x1000));
  const u2 = u01(i, 0x2000);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export const samplingFunctions = {
  // uniform draw in [lo, hi)
  uniform: (i, lo, hi) => lo + u01(i, 0x3000) * (hi - lo),
  // normal(mean, std)
  normal: (i, mean, std) => mean + std * standardNormal(i),
  // lognormal with the given median and log-space sigma (median * e^{σz})
  lognormal: (i, median, sigma) => median * Math.exp(sigma * standardNormal(i)),
  // raw uniform draw in [0,1) for the sample index
  rand: i => u01(i, 0)
};
