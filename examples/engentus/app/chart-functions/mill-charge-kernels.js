/**
 * App-owned mill-charge helper kernels for the Engentus frontend.
 *
 * These are the authored symmetry-break leaves used by the Engentus model, not
 * reusable chart-runtime infrastructure. Faithful to
 * example-ports/engentus/js/mill_physics.js.
 */

const TWO_PI = 2 * Math.PI;

function segmentHalfAngle(J) {
  const target = TWO_PI * Math.max(0.001, Math.min(0.999, J));
  let theta = 2 * Math.acos(1 - 2 * J);
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

function chargeCentroid(phiT, phiS, R) {
  const N_ARC = 80;
  let arcSpan = phiS - phiT;
  if (arcSpan <= 0) arcSpan += TWO_PI;

  const pts = [];
  for (let i = 0; i <= N_ARC; i++) {
    const phi = phiT + arcSpan * i / N_ARC;
    pts.push([R * Math.cos(phi), R * Math.sin(phi)]);
  }
  pts.push([R * Math.cos(phiT), R * Math.sin(phiT)]);

  let area = 0;
  let cx = 0;
  let cy = 0;
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

const SEED = 0x9e3779b9;
function rand01(index) {
  let a = (Math.floor(index) + SEED) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const millChargeKernels = {
  segment_half_angle: J => segmentHalfAngle(J),
  charge_com_x: (phiT, phiS, R) => chargeCentroid(phiT, phiS, R)[0],
  charge_com_y: (phiT, phiS, R) => chargeCentroid(phiT, phiS, R)[1],
  spread: (i, amp) => (rand01(i) - 0.5) * 2 * amp,
  vjit: i => 0.9 + rand01(i + 101) * 0.2,
  tphase: (i, tMax) => rand01(i + 211) * tMax
};
