import { angularDistance, averageAngle, normalizeAngle } from "./geometry.js";

function interpAtX(points, x, key) {
  if (!points || points.length === 0) return null;
  if (x <= points[0].x) return points[0][key];
  const last = points[points.length - 1];
  if (x >= last.x) return last[key];
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].x >= x) {
      const previous = points[index - 1];
      const current = points[index];
      const t = (x - previous.x) / ((current.x - previous.x) || 1);
      return previous[key] + (current[key] - previous[key]) * t;
    }
  }
  return last[key];
}

function tooltipAtX(points, x) {
  if (!points || points.length === 0) return {};
  let best = null;
  let bestDistance = Infinity;
  for (const point of points) {
    if (!Number.isFinite(point?.x)) continue;
    const distance = Math.abs(point.x - x);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best?.tooltip && typeof best.tooltip === "object" ? best.tooltip : {};
}

export function cartesianProbeReadout(plan, x) {
  const readings = [];
  for (const layer of plan.layers ?? []) {
    if (layer.mark === "line" || layer.mark === "cloud") {
      for (const primitive of layer.primitives ?? []) {
        const y = interpAtX(primitive.points, x, "y");
        if (y != null) {
          readings.push({
            layer: layer.name,
            mark: layer.mark,
            y,
            sample: primitive.sample,
            tooltip: tooltipAtX(primitive.points, x)
          });
        }
      }
    } else if (layer.mark === "band") {
      const points = layer.primitives?.[0]?.points;
      const y0 = interpAtX(points, x, "y0");
      const y1 = interpAtX(points, x, "y1");
      if (y0 != null) readings.push({ layer: layer.name, mark: "band", y0, y1 });
    } else if (layer.mark === "area") {
      for (const primitive of layer.primitives ?? []) {
        const y = interpAtX(primitive.points, x, "y1");
        if (y != null) readings.push({ layer: layer.name, mark: "area", category: primitive.category, y });
      }
    }
  }
  return { x, readings };
}

export function polarPointToData(scene, x, y) {
  const dx = Number(x) - scene.center.x;
  const dy = scene.center.y - Number(y);
  const radiusPx = Math.hypot(dx, dy);
  const [domainMin, domainMax] = scene.scales.r.domain;
  const radius = domainMin + radiusPx / (scene.maxRadius || 1) * (domainMax - domainMin);
  return {
    theta: normalizeAngle(Math.atan2(dx, dy)),
    r: radius,
    radiusPx
  };
}

export function polarProbeReadout(scene, x, y) {
  const pointer = polarPointToData(scene, x, y);
  let best = null;
  let bestScore = Infinity;
  for (const layer of scene.sourceLayers ?? []) {
    for (const primitive of layer.primitives ?? []) {
      let score = Infinity;
      let tooltip = primitive.tooltip ?? {};
      if (Number.isFinite(primitive.theta0) && Number.isFinite(primitive.theta1)) {
        const r0 = Number(primitive.r0) || 0;
        const r1 = Number(primitive.r1) || 0;
        const rMin = Math.min(r0, r1);
        const rMax = Math.max(r0, r1);
        if (pointer.r < rMin || pointer.r > rMax) continue;
        const span = angularDistance(primitive.theta0, primitive.theta1);
        const mid = averageAngle(primitive.theta0, primitive.theta1);
        const angleDistance = angularDistance(pointer.theta, mid);
        if (angleDistance > span / 2 + 0.02) continue;
        score = angleDistance;
      } else if (Array.isArray(primitive.points)) {
        for (const point of primitive.points) {
          if (!Number.isFinite(point.theta) || !Number.isFinite(point.r)) continue;
          const rDistance = Math.abs(pointer.r - point.r) / ((scene.scales.r.domain[1] - scene.scales.r.domain[0]) || 1);
          const aDistance = angularDistance(pointer.theta, point.theta);
          const pointScore = aDistance + rDistance;
          if (pointScore < score) {
            score = pointScore;
            tooltip = point.tooltip ?? primitive.tooltip ?? {};
          }
        }
      } else if (Number.isFinite(primitive.theta) && Number.isFinite(primitive.r)) {
        const rDistance = Math.abs(pointer.r - primitive.r) / ((scene.scales.r.domain[1] - scene.scales.r.domain[0]) || 1);
        const aDistance = angularDistance(pointer.theta, primitive.theta);
        score = aDistance + rDistance;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { layer: layer.name, mark: layer.mark, tooltip, primitive };
      }
    }
  }
  return best ? { ...pointer, ...best } : null;
}
