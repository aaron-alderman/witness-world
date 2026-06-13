/**
 * mill-charge-kernels.js — THE 3rd-SCIENCE SYMMETRY-BREAK KERNELS (+ seeded sampling).
 *
 * Mill-charge (the rotating grinding charge + cataracting media) is faithfully
 * expressible in the IR *except* two quantities with no honest-dataflow face:
 *
 *   segment_half_angle(J)            Newton-Raphson on  θ − sinθ = 2πJ   (transcendental)
 *   charge_com_x / charge_com_y(…)   80-pt arc+chord shoelace centroid   (neighbour-coupled)
 *
 * Both are "go deeper" leaves: lowered, named, referenced by the model, injected into the
 * generic evaluator the same way as a std-lib. The fill solver is exactly the symmetry break
 * the tranche predicted; the centroid is the second (a polygon centroid has no closed form
 * faithful to the hand-coded discretization, and the per-cell evaluator can't express a
 * shoelace sum that couples neighbouring arc samples). Direct ports of
 * example-ports/engentus/js/mill_physics.js (chargeGeometry).
 *
 * Everything else about mill-charge — shoulder/toe geometry, the charge boundary, and the
 * ENTIRE cataracting ballistic trajectory field over the (particle, t) product — stays
 * HONEST in the IR (examples_rvm/engentus/app/models/mill-charge.rvm).
 *
 * The "keep stochastic" cataracting jitter enters here too, as a *seeded* sampler keyed by
 * particle index: a pure function of the index, so the IR's output is reproducible (and the
 * particle axis is the natural Monte-Carlo ensemble axis later). This block is generic enough
 * to be promoted to a standalone sampling capability when MC lands.
 */

const TWO_PI = 2 * Math.PI;

// ── the fill solver: central angle θ of a circular segment of fill fraction J ───
// Solves θ − sinθ = 2πJ; returns the half-angle α = θ/2. Port of _segmentHalfAngle.
function segmentHalfAngle(J) {
  const target = TWO_PI * Math.max(0.001, Math.min(0.999, J));
  let theta = 2 * Math.acos(1 - 2 * J); // good initial guess
  for (let i = 0; i < 15; i++) {
    const f = theta - Math.sin(theta) - target;
    const fp = 1 - Math.cos(theta);
    if (Math.abs(fp) < 1e-12) break;
    const dt = f / fp;
    theta -= dt;
    if (Math.abs(dt) < 1e-10) break;
  }
  return theta / 2;
}

// ── the charge-polygon centroid: arc (toe→shoulder, through the bottom) + chord ──
// Port of chargeGeometry's 80-pt shoelace. Returns [cx, cy] in mill units.
function chargeCentroid(phiT, phiS, R) {
  const N_ARC = 80;
  let arcSpan = phiS - phiT;
  if (arcSpan <= 0) arcSpan += TWO_PI; // CCW through 6-o'clock (matches the JS guard)

  const pts = [];
  for (let i = 0; i <= N_ARC; i++) {
    const phi = phiT + arcSpan * i / N_ARC;
    pts.push([R * Math.cos(phi), R * Math.sin(phi)]);
  }
  pts.push([R * Math.cos(phiT), R * Math.sin(phiT)]); // chord back to toe (free surface)

  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  const sign = area < 0 ? -1 : 1;
  area = Math.abs(area);
  if (area < 1e-14) return [0, 0];
  return [cx / (6 * area * sign), cy / (6 * area * sign)];
}

// ── seeded sampler (mulberry32) — pure function of an integer index ─────────────
const SEED = 0x9e3779b9; // fixed seed → reproducible draws across runs
function rand01(index) {
  // hash the index into a mulberry32 state, take one draw in [0,1)
  let a = (Math.floor(index) + SEED) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── the kernels referenced from the model ───────────────────────────────────────

export const millChargeKernels = {
  // fill solver (the symmetry break): half-angle of the fill-fraction segment
  segment_half_angle: J => segmentHalfAngle(J),

  // charge centre-of-mass (the second break): discretized polygon centroid
  charge_com_x: (phiT, phiS, R) => chargeCentroid(phiT, phiS, R)[0],
  charge_com_y: (phiT, phiS, R) => chargeCentroid(phiT, phiS, R)[1],

  // seeded cataracting jitter (reproducible "stochastic" face), keyed by particle index
  spread: (i, amp) => (rand01(i) - 0.5) * 2 * amp,        // launch fan in [-amp, +amp]
  vjit: i => 0.9 + rand01(i + 101) * 0.2,                 // velocity scale in [0.9, 1.1]
  tphase: (i, tMax) => rand01(i + 211) * tMax             // staggered launch time in [0, tMax)
};
