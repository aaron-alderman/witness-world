import { formatTick, linearTicks, projectLinear } from "./scales.js";
import { normalizePresentation } from "../presentation/chart-chrome.js";

function lineNode(attrs) {
  return { kind: "line", attrs };
}

function textNode(attrs, text) {
  return { kind: "text", attrs, text };
}

export function buildCartesianGridNodes({ xScale, yScale, innerW, innerH, showGrid = true, presentation = {} }) {
  if (showGrid === false) return [];
  const resolved = normalizePresentation(presentation);
  const nodes = [];
  for (const tick of linearTicks(xScale.domain, 8)) {
    const px = projectLinear(xScale, tick);
    if (px <= 0 || px >= innerW) continue;
    nodes.push(lineNode({
      x1: px, x2: px, y1: 0, y2: innerH,
      stroke: resolved.chrome.gridStroke, "stroke-width": 1
    }));
  }
  for (const tick of linearTicks(yScale.domain, 7)) {
    const py = projectLinear(yScale, tick);
    if (py <= 0 || py >= innerH) continue;
    nodes.push(lineNode({
      x1: 0, x2: innerW, y1: py, y2: py,
      stroke: resolved.chrome.gridStroke, "stroke-width": 1
    }));
  }
  return nodes;
}

export function buildCartesianAxisNodes({ xScale, yScale, innerW, innerH, presentation = {} }) {
  const resolved = normalizePresentation(presentation);
  const nodes = [
    lineNode({ x1: 0, y1: innerH, x2: innerW, y2: innerH, stroke: resolved.chrome.axisStroke }),
    lineNode({ x1: 0, y1: 0, x2: 0, y2: innerH, stroke: resolved.chrome.axisStroke })
  ];
  for (const tick of linearTicks(xScale.domain, 8)) {
    const px = projectLinear(xScale, tick);
    nodes.push(lineNode({
      x1: px, x2: px, y1: innerH, y2: innerH + 6, stroke: resolved.chrome.tickStroke
    }));
    nodes.push(textNode({
      x: px, y: innerH + 18, "text-anchor": "middle",
      "font-size": "11px", "font-family": resolved.typography.bodyFontFamily, fill: resolved.chrome.tickLabelFill
    }, formatTick(tick)));
  }
  for (const tick of linearTicks(yScale.domain, 7)) {
    const py = projectLinear(yScale, tick);
    nodes.push(lineNode({
      x1: -6, x2: 0, y1: py, y2: py, stroke: resolved.chrome.tickStroke
    }));
    nodes.push(textNode({
      x: -8, y: py + 4, "text-anchor": "end",
      "font-size": "11px", "font-family": resolved.typography.bodyFontFamily, fill: resolved.chrome.tickLabelFill
    }, formatTick(tick)));
  }
  nodes.push(textNode({
    x: innerW / 2,
    y: innerH + 42,
    "text-anchor": "middle",
    "font-size": `${resolved.axisSize ?? 12}px`,
    "font-family": resolved.typography.bodyFontFamily,
    fill: resolved.chrome.axisLabelFill
  }, resolved.xLabel ?? ""));
  nodes.push(textNode({
    transform: "rotate(-90)",
    x: -innerH / 2,
    y: -52,
    "text-anchor": "middle",
    "font-size": `${resolved.axisSize ?? 12}px`,
    "font-family": resolved.typography.bodyFontFamily,
    fill: resolved.chrome.axisLabelFill
  }, resolved.yLabel ?? ""));
  nodes.push(textNode({
    x: innerW / 2,
    y: -10,
    "text-anchor": "middle",
    "font-size": `${resolved.titleSize ?? 13}px`,
    "font-family": resolved.typography.headingFontFamily,
    "font-weight": "600",
    fill: resolved.chrome.titleFill
  }, resolved.title ?? ""));
  return nodes;
}
