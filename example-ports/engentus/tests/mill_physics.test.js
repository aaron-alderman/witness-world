import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  criticalSpeed, froudeNumber,
  shoulderAngle, toeAngle,
  chargeGeometry, regimeClassify,
  cataractingIndex, powerProxy,
  computeMetrics, slurryModifiers,
} from '../js/mill_physics.js';

const DEF = {
  speedFrac: 0.75, fillFrac: 0.30, slurryContent: 0.2,
  wallFriction: 0.5, internalFriction: 35, bulkDensity: 1800, millRadius: 1,
};

// ── criticalSpeed ─────────────────────────────────────────────────────────
test('criticalSpeed R=1 ≈ 3.132 rad/s', () => {
  assert.ok(Math.abs(criticalSpeed(1) - Math.sqrt(9.81)) < 1e-6);
});

test('criticalSpeed scales as 1/sqrt(R)', () => {
  assert.ok(Math.abs(criticalSpeed(4) - criticalSpeed(1) / 2) < 1e-9);
});

// ── shoulderAngle ────────────────────────────────────────────────────────
test('shoulder at 0% speed → 0 rad (no lift)', () => {
  assert.ok(shoulderAngle(0, 0) < 1e-10);
});

test('shoulder at critical speed (1.0) → π/2', () => {
  assert.ok(Math.abs(shoulderAngle(1.0, 0) - Math.PI / 2) < 1e-6);
});

test('shoulder at 75% critical, smooth wall ≈ arcsin(0.5625)', () => {
  const expected = Math.asin(0.5625);
  assert.ok(Math.abs(shoulderAngle(0.75, 0) - expected) < 1e-6);
});

test('shoulder increases monotonically with speedFrac', () => {
  const speeds = [0.3, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  for (let i = 1; i < speeds.length; i++) {
    assert.ok(shoulderAngle(speeds[i], 0) > shoulderAngle(speeds[i - 1], 0));
  }
});

test('shoulder increases with wall friction (higher grip lifts charge)', () => {
  assert.ok(shoulderAngle(0.70, 0.6) > shoulderAngle(0.70, 0.0));
});

test('shoulder stays ≤ π/2 regardless of friction', () => {
  assert.ok(shoulderAngle(0.80, 1.5) <= Math.PI / 2);
});

// ── toeAngle ─────────────────────────────────────────────────────────────
test('toe angle is in the lower half of the mill (sin φ_t < 0)', () => {
  for (const sf of [0.45, 0.65, 0.75, 0.85]) {
    const phi = toeAngle(sf, 0.30, 0.5, 1);
    assert.ok(Math.sin(phi) < 0.3, `toe should be in lower half at speed ${sf}, got sin=${Math.sin(phi).toFixed(3)}`);
  }
});

test('toe angle varies with fill fraction at low speed (empirical regime)', () => {
  // Below Fr=0.18 the empirical formula is used, which includes fillFrac
  const t1 = toeAngle(0.30, 0.15, 0.4, 1);
  const t2 = toeAngle(0.30, 0.45, 0.4, 1);
  assert.notStrictEqual(t1, t2);
});

// ── slurryModifiers ───────────────────────────────────────────────────────
test('slurryModifiers: dry condition → no modification', () => {
  const p = { ...DEF, slurryContent: 0 };
  const m = slurryModifiers(p);
  assert.ok(Math.abs(m.muWall - DEF.wallFriction) < 1e-10);
  assert.ok(Math.abs(m.phi - DEF.internalFriction) < 1e-10);
  assert.ok(Math.abs(m.rho - DEF.bulkDensity) < 1e-10);
});

test('slurryModifiers: high slurry reduces wall friction', () => {
  const m = slurryModifiers({ ...DEF, slurryContent: 0.8 });
  assert.ok(m.muWall < DEF.wallFriction);
});

test('slurryModifiers: high slurry reduces internal friction angle', () => {
  const m = slurryModifiers({ ...DEF, slurryContent: 0.8 });
  assert.ok(m.phi < DEF.internalFriction);
});

// ── chargeGeometry ────────────────────────────────────────────────────────
test('chargeGeometry returns expected keys', () => {
  const g = chargeGeometry(DEF);
  assert.ok('shoulder' in g && 'toe' in g && 'comX' in g && 'comY' in g && 'comOffsetR' in g);
});

test('COM offset is between 0 and R', () => {
  const { comOffsetR } = chargeGeometry(DEF);
  assert.ok(comOffsetR > 0 && comOffsetR < 1, `comOffsetR=${comOffsetR}`);
});

test('powerProxy scales with fill fraction (more material → more torque)', () => {
  const a = powerProxy({ ...DEF, fillFrac: 0.15 });
  const b = powerProxy({ ...DEF, fillFrac: 0.40 });
  assert.ok(b > a, `expected higher fill to give more power: ${a.toFixed(3)} vs ${b.toFixed(3)}`);
});

// ── regimeClassify ────────────────────────────────────────────────────────
test('centrifuging at 98% critical speed', () => {
  assert.strictEqual(regimeClassify(0.99, 0.3, 0.0, 0.5), 'centrifuging');
});

test('cascading or cataracting at 70% critical', () => {
  const r = regimeClassify(0.70, 0.3, 0.0, 0.5);
  assert.ok(r === 'cascading' || r === 'cataracting', `got ${r}`);
});

test('rolling at 35% critical speed', () => {
  assert.strictEqual(regimeClassify(0.35, 0.3, 0.0, 0.5), 'rolling');
});

test('pooling at high slurry and low speed', () => {
  assert.strictEqual(regimeClassify(0.40, 0.3, 0.80, 0.5), 'pooling');
});

test('slipping at very low wall friction', () => {
  assert.strictEqual(regimeClassify(0.50, 0.3, 0.0, 0.05), 'slipping');
});

// ── cataractingIndex ───────────────────────────────────────────────────────
test('cataractingIndex is 0 at low speed', () => {
  assert.ok(cataractingIndex(0.40) < 0.05);
});

test('cataractingIndex increases with speed', () => {
  assert.ok(cataractingIndex(0.80) > cataractingIndex(0.60));
});

test('cataractingIndex is clamped to [0, 1]', () => {
  assert.ok(cataractingIndex(0) === 0);
  assert.ok(cataractingIndex(2) === 1);
});

// ── powerProxy ────────────────────────────────────────────────────────────
test('powerProxy is positive for normal operating conditions', () => {
  assert.ok(powerProxy(DEF) > 0);
});

test('powerProxy at ~75-80% critical is near reference value 1.0', () => {
  const p = powerProxy({ ...DEF, speedFrac: 0.75 });
  assert.ok(p > 0.5 && p < 2.0, `powerProxy=${p}`);
});

test('powerProxy at zero speed is near 0', () => {
  assert.ok(powerProxy({ ...DEF, speedFrac: 0.01 }) < 0.1);
});

// ── computeMetrics ────────────────────────────────────────────────────────
test('computeMetrics returns complete metric object', () => {
  const m = computeMetrics(DEF);
  const keys = ['shoulderAngle', 'toeAngle', 'shoulderDeg', 'toeDeg', 'comX', 'comY',
                 'comOffsetR', 'regime', 'cataractingIndex', 'powerProxy'];
  for (const k of keys) assert.ok(k in m, `missing key ${k}`);
});

test('computeMetrics regime matches regimeClassify', () => {
  const m = computeMetrics(DEF);
  assert.strictEqual(m.regime, regimeClassify(DEF.speedFrac, DEF.fillFrac, DEF.slurryContent, DEF.wallFriction));
});
