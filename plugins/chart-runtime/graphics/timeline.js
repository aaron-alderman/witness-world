export function frameIndexForElapsed(tValues, elapsedSec, opts = {}) {
  if (!Array.isArray(tValues) || tValues.length === 0) return 0;
  const lastT = tValues[tValues.length - 1];
  const speed = Number(opts.speed ?? 1) || 1;
  const loop = opts.loop !== false;
  const t = loop
    ? ((elapsedSec * speed) % (lastT || 1) + (lastT || 1)) % (lastT || 1)
    : Math.max(0, Math.min(lastT, elapsedSec * speed));
  return frameIndexForValue(tValues, t);
}

export function frameIndexForValue(tValues, tValue) {
  if (!Array.isArray(tValues) || tValues.length === 0) return 0;
  const target = Number(tValue);
  if (!Number.isFinite(target)) return 0;
  if (target <= tValues[0]) return 0;
  if (target >= tValues[tValues.length - 1]) return tValues.length - 1;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < tValues.length; i += 1) {
    const dist = Math.abs(tValues[i] - target);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  return best;
}
