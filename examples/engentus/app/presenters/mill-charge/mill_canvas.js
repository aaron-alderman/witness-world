/**
 * mill_canvas.js — Animated 2D mill charge cross-section canvas renderer.
 *
 * Exports:
 *   initMillCanvas(canvasEl)   — attach to a <canvas> element
 *   startMillAnimation()       — begin RAF loop
 *   stopMillAnimation()        — cancel RAF loop
 *   renderMillFrame(params)    — single frame render (also called by RAF loop)
 */

import { computeMetrics, chargeGeometry, shoulderAngle, toeAngle,
         cataractingIndex, criticalSpeed } from '../../client/mill_physics.js';

const G = 9.81;

// ── Regime colours ──────────────────────────────────────────────────────────
const REGIME_COLOURS = {
  rolling:      { charge: '#4a7c59', surface: '#5da870', accent: '#4ade80' },
  cascading:    { charge: '#7c5e1a', surface: '#c9913a', accent: '#f59e0b' },
  cataracting:  { charge: '#7c2a1a', surface: '#c94020', accent: '#f87171' },
  centrifuging: { charge: '#4a1a7c', surface: '#8b3ac9', accent: '#a78bfa' },
  pooling:      { charge: '#1a4a7c', surface: '#2a6ec9', accent: '#60a5fa' },
  slipping:     { charge: '#5a5a2a', surface: '#9a9a40', accent: '#fde047' },
};

// ── Visual particle state ────────────────────────────────────────────────────
const N_CASCADE  = 28;  // surface-flow particles
const N_CATR     = 18;  // cataracting ballistic particles
const N_LIFTERS  = 10;  // lifter bars on the wall

let _canvas  = null;
let _raf     = null;
let _wallAngle = 0;     // cumulative wall rotation (rad)
let _lastT   = 0;

// Particle state — position, phase (0–1 along path)
const _cascParts = Array.from({ length: N_CASCADE }, () => ({ phase: Math.random() }));
const _catrParts = Array.from({ length: N_CATR    }, () => ({ t: Math.random() * 3, active: false }));

// ── Public API ────────────────────────────────────────────────────────────────
export function initMillCanvas(canvasEl) {
  _canvas = canvasEl;
}

export function startMillAnimation() {
  if (_raf) return;
  _lastT = performance.now();
  _raf = requestAnimationFrame(_loop);
}

export function stopMillAnimation() {
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
}

// ── RAF loop ───────────────────────────────────────────────────────────────
function _loop(now) {
  const dt = Math.min((now - _lastT) / 1000, 0.05);  // cap at 50ms
  _lastT = now;

  const canvas = _canvas;
  if (!canvas || !canvas._millParams) { _raf = requestAnimationFrame(_loop); return; }

  const params = canvas._millParams;
  const omega  = params.speedFrac * criticalSpeed(params.millRadius || 1);
  _wallAngle  -= omega * dt;  // negative = CCW on canvas (y-down)

  // Advance cascade particles
  const metrics = canvas._millMetrics;
  _advanceCascade(params, metrics, dt);
  _advanceCataracting(params, metrics, dt);

  renderMillFrame(params, metrics);
  _raf = requestAnimationFrame(_loop);
}

// ── Advance cascade surface particles ──────────────────────────────────────
function _advanceCascade(params, metrics, dt) {
  if (!metrics) return;
  const speed = Math.max(0.08, metrics.cataractingIndex * 0.3 + 0.12);
  for (const p of _cascParts) {
    p.phase = (p.phase + dt * speed) % 1;
  }
}

// ── Advance cataracting ballistic particles ─────────────────────────────────
function _advanceCataracting(params, metrics, dt) {
  if (!metrics) return;
  const catIdx = metrics.cataractingIndex || 0;
  const R = params.millRadius || 1;
  const omega = params.speedFrac * criticalSpeed(R);
  const { shoulder: phiS } = chargeGeometry(params);

  for (const p of _catrParts) {
    if (!p.active) {
      if (catIdx < 0.05 || Math.random() > catIdx) continue;
      // Launch from shoulder with small random spread
      const spread = (Math.random() - 0.5) * 0.2;
      p.phi0 = phiS + spread;
      p.x0 = R * Math.cos(p.phi0);
      p.y0 = R * Math.sin(p.phi0);
      p.vx = -omega * R * Math.sin(p.phi0) * (0.9 + Math.random() * 0.2);
      p.vy =  omega * R * Math.cos(p.phi0) * (0.9 + Math.random() * 0.2);
      p.t  = 0;
      p.active = true;
      p.tMax = 2.5 * Math.sqrt(2 * R / G);
    } else {
      p.t  += dt;
      p.x   = p.x0 + p.vx * p.t;
      p.y   = p.y0 + p.vy * p.t - 0.5 * G * p.t * p.t;
      const r = Math.sqrt(p.x * p.x + p.y * p.y);
      if (r >= R * 0.98 || p.t > p.tMax) { p.active = false; }
    }
  }
}

// ── Main frame renderer ────────────────────────────────────────────────────
export function renderMillFrame(params, metrics) {
  const canvas = _canvas;
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth;
  const H   = canvas.clientHeight;
  if (W === 0 || H === 0) return;

  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);

  const cx   = W / 2;
  const cy   = H / 2;
  const Rpx  = Math.min(W, H) * 0.42;  // radius in canvas pixels
  const R    = params.millRadius || 1;  // model radius (normalised)
  const scale = Rpx / R;               // px per model unit

  // ── Draw layers ──────────────────────────────────────────────────────────
  _drawBackground(ctx, cx, cy, Rpx);
  _drawCharge(ctx, cx, cy, Rpx, scale, params, metrics);
  _drawSlurryPool(ctx, cx, cy, Rpx, scale, params, metrics);
  _drawCascadeParticles(ctx, cx, cy, scale, params, metrics);
  _drawCataractingParticles(ctx, cx, cy, scale, params, metrics);
  _drawMillShell(ctx, cx, cy, Rpx);
  _drawMetricOverlays(ctx, cx, cy, Rpx, scale, params, metrics);

  ctx.restore();
}

// ── Background fill ──────────────────────────────────────────────────────
function _drawBackground(ctx, cx, cy, R) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1a2e';
  ctx.fill();
  ctx.restore();
}

// ── Charge polygon ────────────────────────────────────────────────────────
function _drawCharge(ctx, cx, cy, Rpx, scale, params, metrics) {
  if (!metrics) return;
  const { shoulder: phiS, toe: phiT } = chargeGeometry(params);
  const regime = metrics.regime || 'cascading';
  const col    = REGIME_COLOURS[regime] || REGIME_COLOURS.cascading;

  // Arc from toe CW to shoulder (through bottom), then chord shoulder→toe
  ctx.save();
  ctx.beginPath();

  // Wall arc from toe going CW (decreasing angle) to shoulder - 2π (same position)
  // In canvas coordinates: y is DOWN, so we flip the y-axis.
  // Canvas angle: 0 = right (3-o'clock), positive = CW (opposite to our math convention)
  // To convert: canvas_angle = -physics_angle (since y flips)
  const canvasPhiT = -phiT;
  const canvasPhiS = -phiS;

  // Arc CCW in canvas = CW in physics → going from canvasPhiT to canvasPhiS CCW
  // This goes through the bottom of the canvas (positive y)
  ctx.arc(cx, cy, Rpx, canvasPhiT, canvasPhiS, true);  // counterclockwise in canvas = through physical bottom

  // Chord back from shoulder to toe (free surface)
  const sX = cx + Rpx * Math.cos(canvasPhiS);
  const sY = cy + Rpx * Math.sin(canvasPhiS);
  const tX = cx + Rpx * Math.cos(canvasPhiT);
  const tY = cy + Rpx * Math.sin(canvasPhiT);
  ctx.lineTo(sX, sY);
  ctx.closePath();

  // Fill with regime colour gradient (darker at bottom = higher pressure)
  const grad = ctx.createLinearGradient(cx, cy - Rpx, cx, cy + Rpx);
  grad.addColorStop(0, col.charge + '88');
  grad.addColorStop(0.5, col.charge + 'cc');
  grad.addColorStop(1, col.charge + 'ff');
  ctx.fillStyle = grad;
  ctx.fill();

  // Free surface line
  ctx.beginPath();
  ctx.moveTo(tX, tY);
  ctx.lineTo(sX, sY);
  ctx.strokeStyle = col.surface;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.restore();
}

// ── Slurry pool ───────────────────────────────────────────────────────────
function _drawSlurryPool(ctx, cx, cy, Rpx, scale, params, metrics) {
  const sw = params.slurryContent || 0;
  if (sw < 0.25) return;

  const opacity = Math.min((sw - 0.25) / 0.4, 1) * 0.45;
  const poolH   = Rpx * (0.15 + sw * 0.2);
  const poolW   = Rpx * (0.55 + sw * 0.15);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + Rpx * 0.55, poolW, poolH, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(56, 120, 200, ${opacity})`;
  ctx.fill();
  ctx.restore();
}

// ── Cascade surface particles ─────────────────────────────────────────────
function _drawCascadeParticles(ctx, cx, cy, scale, params, metrics) {
  if (!metrics) return;
  const { shoulder: phiS, toe: phiT } = chargeGeometry(params);
  const Rpx = scale * (params.millRadius || 1);

  // Surface goes from shoulder (phiS) to toe (phiT) as a straight line (free surface)
  const sX = cx + Rpx * Math.cos(-phiS);
  const sY = cy + Rpx * Math.sin(-phiS);
  const tX = cx + Rpx * Math.cos(-phiT);
  const tY = cy + Rpx * Math.sin(-phiT);

  const regime = metrics.regime || 'cascading';
  const col    = REGIME_COLOURS[regime] || REGIME_COLOURS.cascading;

  ctx.save();
  for (const p of _cascParts) {
    const frac = p.phase;
    const x = sX + (tX - sX) * frac;
    const y = sY + (tY - sY) * frac;
    const r = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col.accent + 'cc';
    ctx.fill();
  }
  ctx.restore();
}

// ── Cataracting ballistic particles ───────────────────────────────────────
function _drawCataractingParticles(ctx, cx, cy, scale, params, metrics) {
  if (!metrics || (metrics.cataractingIndex || 0) < 0.05) return;

  const Rpx = scale * (params.millRadius || 1);
  const regime = metrics.regime || 'cascading';
  const col    = REGIME_COLOURS[regime] || REGIME_COLOURS.cascading;

  ctx.save();
  for (const p of _catrParts) {
    if (!p.active) continue;
    const px = cx + p.x * scale;
    const py = cy - p.y * scale;  // flip y
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = col.accent + 'dd';
    ctx.fill();
  }
  ctx.restore();
}

// ── Mill shell with rotating lifter bars ───────────────────────────────────
function _drawMillShell(ctx, cx, cy, R) {
  ctx.save();

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Lifter bars (rotate with wall)
  for (let i = 0; i < N_LIFTERS; i++) {
    const baseAngle = _wallAngle + (i / N_LIFTERS) * Math.PI * 2;
    const liftH = R * 0.055;
    const liftW = R * 0.028;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(baseAngle);
    ctx.translate(R - liftH / 2, 0);

    ctx.beginPath();
    ctx.rect(-liftH / 2, -liftW / 2, liftH, liftW);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.restore();
  }

  // Centre dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#475569';
  ctx.fill();

  ctx.restore();
}

// ── Metric overlays ────────────────────────────────────────────────────────
function _drawMetricOverlays(ctx, cx, cy, Rpx, scale, params, metrics) {
  if (!metrics) return;
  const { shoulder: phiS, toe: phiT, comX, comY } = chargeGeometry(params);

  ctx.save();

  // Shoulder indicator (yellow)
  _drawAngleLine(ctx, cx, cy, Rpx, -phiS, '#fbbf24', 'S');

  // Toe indicator (red)
  _drawAngleLine(ctx, cx, cy, Rpx, -phiT, '#f87171', 'T');

  // COM cross
  const comPx = cx + comX * scale;
  const comPy = cy - comY * scale;
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth   = 1.5;
  const cs = 7;
  ctx.beginPath();
  ctx.moveTo(comPx - cs, comPy); ctx.lineTo(comPx + cs, comPy);
  ctx.moveTo(comPx, comPy - cs); ctx.lineTo(comPx, comPy + cs);
  ctx.stroke();

  ctx.restore();
}

function _drawAngleLine(ctx, cx, cy, R, canvasAngle, color, label) {
  const ex = cx + R * Math.cos(canvasAngle);
  const ey = cy + R * Math.sin(canvasAngle);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.stroke();

  // Label dot on wall
  ctx.beginPath();
  ctx.arc(ex, ey, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Text
  const off = 14;
  ctx.setLineDash([]);
  ctx.font      = 'bold 10px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, ex + Math.cos(canvasAngle) * off, ey + Math.sin(canvasAngle) * off);
  ctx.restore();
}
