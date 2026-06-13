/**
 * mill_physics.js — Pure analytical mill charge motion physics. No dependencies.
 *
 * Convention:
 *   - Origin at mill centre, y-axis up, x-axis right
 *   - Angle φ measured CCW from 3-o'clock (positive x-axis)
 *   - Mill rotates CCW (ω > 0)
 *   - Shoulder is in upper-right quadrant (φ ∈ [0, π/2])
 *   - Toe is in lower-left quadrant (φ ∈ [π, 3π/2] or equivalently negative)
 */

const G = 9.81;  // m/s²

// ── Critical speed ─────────────────────────────────────────────────────────
export const criticalSpeed = (R) => Math.sqrt(G / R);  // rad/s

export const criticalSpeedRpm = (R) => (60 / (2 * Math.PI)) * criticalSpeed(R);

export const froudeNumber = (speedFrac) => speedFrac * speedFrac;

// ── Slurry effective property modifiers ────────────────────────────────────
// Returns modified {muWall, phi, rho} given slurry content S_w ∈ [0,1]
export function slurryModifiers(params) {
  const { slurryContent: sw, wallFriction, internalFriction, bulkDensity } = params;
  const RHO_SLURRY = 1450;  // kg/m³ dense slurry
  return {
    muWall: wallFriction * (1 - 0.4 * sw),
    phi:    internalFriction * (1 - 0.3 * sw),
    rho:    bulkDensity * (1 - sw) + RHO_SLURRY * sw,
  };
}

// ── Shoulder angle ──────────────────────────────────────────────────────────
// Returns φ_s in radians (CCW from 3-o'clock).
// Wall friction: allows material to be dragged higher (drag correction).
// Internal friction: higher φ_i → bulk shear resistance → charge lifted further
//   on ascending wall (effect proportional to Fr — no inertia, no effect).
export function shoulderAngle(speedFrac, muWall = 0, phiInternal = 0) {
  const Fr = froudeNumber(speedFrac);
  if (Fr >= 1) return Math.PI / 2;
  const base        = Math.asin(Math.min(Fr, 1));
  const wallCorr    = Math.atan(muWall * (1 - Fr) * 0.5);
  const phi_rad     = phiInternal * Math.PI / 180;
  const internalCorr = Math.atan(Math.tan(phi_rad) * Fr * 0.3);
  return Math.min(base + wallCorr + internalCorr, Math.PI / 2);
}

// ── Segment half-angle (geometry helper) ────────────────────────────────────
// Solves θ - sin(θ) = 2πJ for the central angle θ of a circular segment
// of fill fraction J. Returns half-angle α = θ/2.
// Used to place shoulder/toe correctly at low speed where fill dominates.
function _segmentHalfAngle(J) {
  const target = 2 * Math.PI * Math.max(0.001, Math.min(0.999, J));
  let theta = 2 * Math.acos(1 - 2 * J);  // good initial guess
  for (let i = 0; i < 15; i++) {
    const f  = theta - Math.sin(theta) - target;
    const fp = 1 - Math.cos(theta);
    if (Math.abs(fp) < 1e-12) break;
    const dt = f / fp;
    theta -= dt;
    if (Math.abs(dt) < 1e-10) break;
  }
  return theta / 2;
}

// ── Toe angle ────────────────────────────────────────────────────────────────
// φ_t = φ_s − 2α  where α = _segmentHalfAngle(fillFrac).
//
// This keeps the arc span exactly 2α at every speed, so the charge polygon
// always encloses the correct fill-fraction area (rotating a circular segment
// around the centre preserves its area). At low speed the chord stays near
// horizontal at the bottom; at high speed it tilts toward the ascending wall.
export function toeAngle(speedFrac, fillFrac, muWall = 0, R = 1) {
  return shoulderAngle(speedFrac, muWall) - 2 * _segmentHalfAngle(fillFrac);
}

// ── Charge geometry (polygon centroid = COM) ────────────────────────────────
// The charge occupies the arc from toe to shoulder (going CCW through the bottom),
// closed by the chord from shoulder back to toe (free surface).
// Returns { shoulder, toe, comX, comY, comOffsetR }.
export function chargeGeometry(params) {
  const { speedFrac, fillFrac, millRadius: R = 1 } = params;
  const { muWall, phi } = slurryModifiers(params);

  const phiS = shoulderAngle(speedFrac, muWall, phi);
  const phiT = phiS - 2 * _segmentHalfAngle(fillFrac);


  // CCW arc from toe to shoulder through the BOTTOM of the mill (the charge bulk).
  // phiT ≈ -2 rad (lower-left), phiS ≈ +0.7 rad (upper-right).
  // Going CCW (increasing phi) passes through -π/2 = 6-o'clock (bottom). ✓
  const N_ARC  = 80;
  // Ensure the arc always goes CCW through the bottom (6-o'clock = -π/2).
  // At high speed phiT may exceed phiS; add 2π so the arc always covers the lower portion.
  let arcSpan = phiS - phiT;
  if (arcSpan <= 0) arcSpan += 2 * Math.PI;

  const pts = [];
  for (let i = 0; i <= N_ARC; i++) {
    const phi = phiT + arcSpan * i / N_ARC;
    pts.push([R * Math.cos(phi), R * Math.sin(phi)]);
  }
  // Chord from shoulder back to toe (free surface)
  pts.push([R * Math.cos(phiT), R * Math.sin(phiT)]);

  // Polygon area and centroid via shoelace
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx   += (x0 + x1) * cross;
    cy   += (y0 + y1) * cross;
  }
  area /= 2;
  const sign = area < 0 ? -1 : 1;  // winding direction
  area = Math.abs(area);
  cx /= (6 * area * sign);
  cy /= (6 * area * sign);

  const comOffsetR = Math.sqrt(cx * cx + cy * cy) / R;

  return { shoulder: phiS, toe: phiT, comX: cx, comY: cy, comOffsetR };
}

// ── Power proxy ─────────────────────────────────────────────────────────────
// P ∝ ω × torque, torque ∝ (charge weight) × (COM horizontal offset from centre)
// Normalised to a max value of 1 at the reference operating point.
export function powerProxy(params) {
  const { speedFrac, fillFrac, millRadius: R = 1 } = params;
  const { rho, muWall } = slurryModifiers(params);
  const omega = speedFrac * criticalSpeed(R);
  const { comX } = chargeGeometry(params);
  // Mass ∝ rho × J × πR²; torque arm = |comX|
  const torque = rho * fillFrac * Math.PI * R * R * G * Math.abs(comX);
  const power  = omega * torque;
  // Normalise by the reference operating point (J=0.3, speed=0.75, rho=1800, smooth wall)
  const refParams = { speedFrac:0.75, fillFrac:0.30, slurryContent:0, wallFriction:0.5,
                      internalFriction:35, bulkDensity:1800, millRadius: R };
  const { comX: refComX } = chargeGeometry(refParams);
  const omegaRef  = 0.75 * criticalSpeed(R);
  const torqueRef = 1800 * 0.30 * Math.PI * R * R * G * Math.abs(refComX);
  const ref = omegaRef * torqueRef;
  return ref > 0 ? power / ref : 0;
}

// ── Cataracting index ───────────────────────────────────────────────────────
// Fraction of charge area with kinetic energy to follow ballistic trajectories.
// 0 = all cascading/rolling, 1 = fully cataracting.
export function cataractingIndex(speedFrac) {
  const Fr = froudeNumber(speedFrac);
  return Math.max(0, Math.min(1, (Fr - 0.4) / 0.5));
}

// ── Regime classification ───────────────────────────────────────────────────
// Returns one of: 'slipping'|'rolling'|'cascading'|'cataracting'|'centrifuging'|'pooling'
// internalFriction (°): high φ_i (rocky ore) lowers cataracting onset — material
// breaks off in chunks rather than flowing smoothly.
export function regimeClassify(speedFrac, fillFrac, slurryContent, wallFriction, internalFriction = 35) {
  const Fr      = froudeNumber(speedFrac);
  const muEff   = wallFriction * (1 - 0.4 * slurryContent);
  const catIdx  = cataractingIndex(speedFrac);
  // Rocky ore (high φ_i) cataracts at lower speed; slurry-like (low φ_i) stays cascading longer
  const phi_rad  = internalFriction * Math.PI / 180;
  const catThresh = Math.max(0.08, 0.35 - Math.tan(phi_rad) * 0.18);

  if (Fr >= 0.97)                              return 'centrifuging';
  if (muEff < 0.12 && Fr < 0.7)               return 'slipping';
  if (slurryContent > 0.62 && Fr < 0.60)      return 'pooling';
  if (catIdx > catThresh)                      return 'cataracting';
  if (Fr >= 0.22)                              return 'cascading';
  return 'rolling';
}

// ── Top-level metric computation ────────────────────────────────────────────
// Single entry point: params → all display metrics.
export function computeMetrics(params) {
  const { speedFrac, fillFrac, slurryContent, wallFriction, internalFriction = 35 } = params;
  const { shoulder, toe, comX, comY, comOffsetR } = chargeGeometry(params);
  const toDeg = r => (r * 180 / Math.PI + 360) % 360;

  // Express angles as degrees CCW from East (0° = East, 90° = North)
  const shoulderDeg = (shoulder * 180 / Math.PI) % 360;
  const toeDeg      = (toe * 180 / Math.PI % 360 + 360) % 360;

  return {
    shoulderAngle:    shoulder,
    toeAngle:         toe,
    shoulderDeg:      Math.round(shoulderDeg * 10) / 10,
    toeDeg:           Math.round(toeDeg * 10) / 10,
    comX,
    comY,
    comOffsetR:       Math.round(comOffsetR * 1000) / 1000,
    regime:           regimeClassify(speedFrac, fillFrac, slurryContent, wallFriction, internalFriction),
    cataractingIndex: Math.round(cataractingIndex(speedFrac) * 100) / 100,
    powerProxy:       Math.round(powerProxy(params) * 100) / 100,
  };
}
