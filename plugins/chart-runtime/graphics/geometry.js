import { clampToDomain, projectLinear } from "./scales.js";

export function linePoints(points = [], xScale, yScale) {
  return points
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => `${projectLinear(xScale, point.x)},${projectLinear(yScale, point.y)}`)
    .join(" ");
}

export function areaPolygonPoints(points = [], xScale, yScale) {
  const top = points.map(point => `${projectLinear(xScale, point.x)},${projectLinear(yScale, point.y1)}`);
  const bottom = points.slice().reverse().map(point => `${projectLinear(xScale, point.x)},${projectLinear(yScale, point.y0)}`);
  return [...top, ...bottom].join(" ");
}

export function bandPolygonPoints(points = [], xScale, yScale) {
  const top = points.filter(point => Number.isFinite(point.y1)).map(point => `${projectLinear(xScale, point.x)},${projectLinear(yScale, clampToDomain(yScale, point.y1))}`);
  const bottom = points.filter(point => Number.isFinite(point.y0)).slice().reverse().map(point => `${projectLinear(xScale, point.x)},${projectLinear(yScale, clampToDomain(yScale, point.y0))}`);
  return [...top, ...bottom].join(" ");
}

export function stepAfterLinePath(points = [], xScale, yScale) {
  const finite = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!finite.length) return "";
  const commands = [`M ${projectLinear(xScale, finite[0].x)} ${projectLinear(yScale, finite[0].y)}`];
  for (let index = 1; index < finite.length; index += 1) {
    const previous = finite[index - 1];
    const current = finite[index];
    commands.push(`L ${projectLinear(xScale, current.x)} ${projectLinear(yScale, previous.y)}`);
    commands.push(`L ${projectLinear(xScale, current.x)} ${projectLinear(yScale, current.y)}`);
  }
  return commands.join(" ");
}

export function normalizeAngle(theta) {
  const twoPi = 2 * Math.PI;
  return ((theta % twoPi) + twoPi) % twoPi;
}

export function angularDistance(a, b) {
  const twoPi = 2 * Math.PI;
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, twoPi - diff);
}

export function averageAngle(theta0, theta1) {
  const x = Math.sin(theta0) + Math.sin(theta1);
  const y = Math.cos(theta0) + Math.cos(theta1);
  return normalizeAngle(Math.atan2(x, y));
}

export function projectPolar(center, radiusProjector, theta, radius) {
  const r = radiusProjector(radius);
  return [center.x + r * Math.sin(theta), center.y - r * Math.cos(theta)];
}

export function forceColour(v, min, max) {
  const t = Math.max(0, Math.min(1, (v - min) / ((max - min) || 1)));
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(52, 236)},${lerp(76, 116)},${lerp(108, 36)})`;
}

export function annularWedgePath(prim, { center, radiusProjector }) {
  const r0 = Math.max(0, Number(prim.r0) || 0);
  const r1 = Math.max(r0, Number(prim.r1) || 0);
  const theta0 = Number(prim.theta0);
  const theta1 = Number(prim.theta1);
  if (!Number.isFinite(theta0) || !Number.isFinite(theta1) || !(r1 > 0)) return null;
  const outerR = radiusProjector(r1);
  const innerR = radiusProjector(r0);
  const large = Math.abs(theta1 - theta0) > Math.PI ? 1 : 0;
  const outer0 = projectPolar(center, radiusProjector, theta0, r1);
  const outer1 = projectPolar(center, radiusProjector, theta1, r1);
  const inner1 = projectPolar(center, radiusProjector, theta1, r0);
  const inner0 = projectPolar(center, radiusProjector, theta0, r0);
  if (innerR <= 0) {
    return `M ${center.x} ${center.y} L ${outer0.join(" ")} A ${outerR} ${outerR} 0 ${large} 1 ${outer1.join(" ")} Z`;
  }
  return [
    `M ${outer0.join(" ")}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${outer1.join(" ")}`,
    `L ${inner1.join(" ")}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${inner0.join(" ")}`,
    "Z"
  ].join(" ");
}

export function polarQuadPath(prim, { center, radiusProjector }) {
  const r0 = Math.max(0, Number(prim.r0) || 0);
  const r1 = Math.max(r0, Number(prim.r1) || 0);
  const theta0 = Number(prim.theta0);
  const theta1 = Number(prim.theta1);
  if (!Number.isFinite(theta0) || !Number.isFinite(theta1) || !(r1 > 0)) return null;
  const outer0 = projectPolar(center, radiusProjector, theta0, r1);
  const outer1 = projectPolar(center, radiusProjector, theta1, r1);
  const inner1 = projectPolar(center, radiusProjector, theta1, r0);
  const inner0 = projectPolar(center, radiusProjector, theta0, r0);
  return [
    `M ${outer0.join(" ")}`,
    `L ${outer1.join(" ")}`,
    `L ${inner1.join(" ")}`,
    `L ${inner0.join(" ")}`,
    "Z"
  ].join(" ");
}
