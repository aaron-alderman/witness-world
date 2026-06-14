/**
 * App-owned copy of the seeded sampling helper used by Engentus Monte Carlo
 * charts. The reusable chart runtime loads it generically through authored URLs.
 */

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

function standardNormal(i) {
  const u1 = Math.max(1e-12, u01(i, 0x1000));
  const u2 = u01(i, 0x2000);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export const samplingFunctions = {
  uniform: (i, lo, hi) => lo + u01(i, 0x3000) * (hi - lo),
  normal: (i, mean, std) => mean + std * standardNormal(i),
  lognormal: (i, median, sigma) => median * Math.exp(sigma * standardNormal(i)),
  rand: i => u01(i, 0)
};
