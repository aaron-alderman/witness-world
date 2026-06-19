import { buildCartesianAxisNodes, buildCartesianGridNodes } from "../graphics/axes.js";
import { annularWedgePath, areaPolygonPoints, bandPolygonPoints, forceColour, linePoints, polarQuadPath, projectPolar } from "../graphics/geometry.js";
import { bandScale, invertLinear, linearScale, linearTicks, projectLinear } from "../graphics/scales.js";
import { normalizePresentation } from "../presentation/chart-chrome.js";

function groupNode(attrs = {}, children = [], extras = {}) {
  return { kind: "group", attrs, children, ...extras };
}

function elementNode(kind, attrs = {}, extras = {}) {
  return { kind, attrs, ...extras };
}

export function buildScene(plan, { mountTag = "" } = {}) {
  if (plan.frame === "polar") return buildPolarScene(plan, { mountTag });
  if (plan.frame === "disc") return buildDiscScene(plan, { mountTag });
  return buildCartesianScene(plan, { mountTag });
}

function buildCartesianScene(plan, { mountTag = "" } = {}) {
  const presentation = normalizePresentation(plan.presentation);
  const xScale = linearScale(plan.scales.x.domain, [0, plan.innerW]);
  const yScale = linearScale(plan.scales.y.domain, [plan.innerH, 0]);
  const clipId = `${plan.containerId || "chart"}-plot-clip`;
  const plotChildren = buildCartesianGridNodes({
    xScale,
    yScale,
    innerW: plan.innerW,
    innerH: plan.innerH,
    showGrid: presentation.showGrid,
    presentation
  });

  for (const layer of plan.layers) {
    if (layer.mark === "screen-rect" || layer.mark === "screen-text") continue;
    if (layer.mark === "area") {
      for (const prim of layer.primitives) {
        plotChildren.push(elementNode("polygon", {
          points: areaPolygonPoints(prim.points, xScale, yScale),
          fill: prim.fill,
          opacity: layer.encode?.opacity ?? 0.9
        }));
      }
    } else if (layer.mark === "line" || layer.mark === "cloud") {
      for (const prim of layer.primitives) {
        plotChildren.push(elementNode("polyline", {
          points: linePoints(prim.points, xScale, yScale),
          fill: "none",
          stroke: layer.stroke,
          "stroke-width": layer.mark === "cloud" ? 0.6 : layer.width,
          "stroke-dasharray": layer.dash ? "5 3" : null,
          opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "band") {
      for (const prim of layer.primitives) {
        plotChildren.push(elementNode("polygon", {
          points: bandPolygonPoints(prim.points, xScale, yScale),
          fill: prim.fill ?? layer.fill,
          opacity: layer.opacity
        }));
      }
    } else if (layer.mark === "x-band") {
      for (const prim of layer.primitives) {
        const x0 = projectLinear(xScale, prim.x0);
        const x1 = projectLinear(xScale, prim.x1);
        plotChildren.push(elementNode("rect", {
          x: Math.min(x0, x1),
          y: 0,
          width: Math.abs(x1 - x0),
          height: plan.innerH,
          fill: layer.fill,
          stroke: layer.stroke ?? "none",
          "stroke-width": layer.width ?? 0,
          opacity: layer.opacity ?? 0.25
        }));
      }
    } else if (layer.mark === "rule") {
      for (const prim of layer.primitives) {
        const x = projectLinear(xScale, prim.x);
        plotChildren.push(elementNode("line", {
          x1: x, x2: x, y1: 0, y2: plan.innerH,
          stroke: layer.stroke,
          "stroke-width": layer.width ?? 1,
          "stroke-dasharray": layer.dash ? "4 3" : null,
          opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "h-rule") {
      for (const prim of layer.primitives) {
        const y = projectLinear(yScale, prim.y);
        plotChildren.push(elementNode("line", {
          x1: 0, x2: plan.innerW, y1: y, y2: y,
          stroke: layer.stroke,
          "stroke-width": layer.width ?? 1,
          "stroke-dasharray": layer.dash ? "4 3" : null,
          opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "point") {
      for (const prim of layer.primitives) {
        if (!Number.isFinite(prim.y)) continue;
        plotChildren.push(elementNode("circle", {
          cx: projectLinear(xScale, prim.x),
          cy: projectLinear(yScale, prim.y),
          r: layer.size ?? presentation.pointSize ?? 4,
          fill: layer.fill ?? "#5AAABF",
          stroke: layer.stroke ?? "none",
          "stroke-width": layer.width ?? 1,
          opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "text") {
      for (const prim of layer.primitives) {
        if (!Number.isFinite(prim.x) || !Number.isFinite(prim.y)) continue;
        plotChildren.push(elementNode("text", {
          x: projectLinear(xScale, prim.x),
          y: projectLinear(yScale, prim.y),
          "text-anchor": layer.anchor ?? "middle",
          "dominant-baseline": layer.baseline ?? "middle",
          "font-size": `${layer.size ?? 11}px`,
          "font-weight": layer.weight ?? "normal",
          fill: layer.fill ?? "#475569",
          opacity: layer.opacity ?? 1
        }, { text: prim.label ?? "" }));
      }
    }
  }

  const defs = groupNode({}, [
    {
      kind: "defs",
      children: [{
        kind: "clipPath",
        attrs: { id: clipId },
        children: [elementNode("rect", { x: 0, y: 0, width: plan.innerW, height: plan.innerH })]
      }]
    }
  ]);
  const screenChildren = [];
  for (const layer of plan.layers) {
    if (layer.mark === "screen-rect") {
      for (const prim of layer.primitives ?? []) {
        screenChildren.push(elementNode("rect", {
          x: prim.x, y: prim.y, width: prim.width, height: prim.height,
          rx: prim.rx ?? 0, fill: layer.fill, stroke: layer.stroke ?? "none", opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "screen-text") {
      for (const prim of layer.primitives ?? []) {
        screenChildren.push(elementNode("text", {
          x: prim.x, y: prim.y, fill: layer.fill, "font-size": `${layer.size ?? 10}px`,
          "font-family": presentation.typography.bodyFontFamily,
          "font-weight": layer.weight ?? "normal", "text-anchor": layer.anchor ?? "start",
          "dominant-baseline": layer.baseline ?? "middle", opacity: layer.opacity ?? 1
        }, { text: prim.label ?? "" }));
      }
    }
  }
  const annotationChildren = [];
  if (presentation.showAnnotations !== false) {
    for (const annotation of presentation.annotations ?? []) {
      if (!annotation?.text || !Number.isFinite(annotation.xMPa) || !Number.isFinite(annotation.yMPa)) continue;
      annotationChildren.push(elementNode("text", {
        x: projectLinear(xScale, annotation.xMPa),
        y: projectLinear(yScale, annotation.yMPa),
        "text-anchor": "middle",
        "font-size": `${annotation.fontSize ?? 11}px`,
        "font-family": presentation.typography.bodyFontFamily,
        "font-weight": annotation.fontWeight ?? "600",
        fill: annotation.color ?? presentation.chrome.annotationFill
      }, { text: annotation.text }));
    }
  }

  return {
    kind: "chart-scene",
    frame: "cartesian",
    renderer: "svg",
    width: plan.width,
    height: plan.height,
    mountTag,
    margin: plan.margin,
    innerW: plan.innerW,
    innerH: plan.innerH,
    scales: { x: xScale, y: yScale },
    presentation,
    sourcePlan: plan,
    nodes: [
      defs,
      groupNode({ transform: `translate(${plan.margin.left},${plan.margin.top})` }, [
        groupNode({ "clip-path": `url(#${clipId})` }, plotChildren),
        groupNode({}, buildCartesianAxisNodes({
          xScale,
          yScale,
          innerW: plan.innerW,
          innerH: plan.innerH,
          presentation
        }).concat(annotationChildren)),
        ...screenChildren
      ])
    ]
  };
}

function buildPolarScene(plan, { mountTag = "" } = {}) {
  const presentation = normalizePresentation(plan.presentation);
  const radiusProjector = value => projectLinear(linearScale(plan.scales.r.domain, [0, plan.maxRadius]), value);
  const nodes = [];
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    nodes.push(elementNode("circle", {
      cx: plan.center.x, cy: plan.center.y, r: plan.maxRadius * frac,
      fill: "none", stroke: presentation.chrome.polarGridStroke
    }));
  }
  for (const layer of plan.layers) {
    if (layer.mark === "screen-rect" || layer.mark === "screen-text") continue;
    if (layer.mark === "polygon" || layer.mark === "line") {
      for (const prim of layer.primitives) {
        const points = prim.points.filter(point => Number.isFinite(point.r)).map(point => projectPolar(plan.center, radiusProjector, point.theta, point.r).join(",")).join(" ");
        nodes.push(elementNode(layer.closed ? "polygon" : "polyline", {
          points,
          fill: layer.fill ?? "none",
          "fill-opacity": layer.fill ? 0.25 : 0,
          stroke: layer.stroke,
          "stroke-width": layer.width ?? 2,
          "stroke-dasharray": layer.dash ? "4,3" : null,
          opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "wedge") {
      const vmax = Math.max(...layer.primitives.map(primitive => primitive.value || 0), 1);
      for (const prim of layer.primitives) {
        const r0 = projectPolar(plan.center, radiusProjector, prim.theta0, prim.value);
        const r1 = projectPolar(plan.center, radiusProjector, prim.theta1, prim.value);
        nodes.push(elementNode("path", {
          d: `M ${plan.center.x} ${plan.center.y} L ${r0.join(" ")} L ${r1.join(" ")} Z`,
          fill: forceColour(prim.value, 0, vmax),
          opacity: 0.85
        }));
      }
    } else if (layer.mark === "annular-wedge" || layer.mark === "polar-quad") {
      const values = layer.primitives.map(primitive => primitive.value).filter(Number.isFinite);
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      for (const prim of layer.primitives) {
        const d = layer.mark === "polar-quad"
          ? polarQuadPath(prim, { center: plan.center, radiusProjector })
          : annularWedgePath(prim, { center: plan.center, radiusProjector });
        if (!d) continue;
        nodes.push(elementNode("path", {
          d,
          fill: layer.fill ?? forceColour(prim.value, min, max),
          stroke: layer.stroke ?? "#2C3C63",
          "stroke-width": 0.5,
          opacity: layer.opacity ?? 0.85
        }));
      }
    } else if (layer.mark === "polar-point") {
      for (const prim of layer.primitives) {
        const [cx, cy] = projectPolar(plan.center, radiusProjector, prim.theta, prim.r);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        nodes.push(elementNode("circle", {
          cx, cy, r: layer.size ?? 2, fill: layer.fill ?? "#5AAABF", stroke: layer.stroke ?? "none", opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "circle") {
      for (const prim of layer.primitives) {
        nodes.push(elementNode("circle", {
          cx: plan.center.x,
          cy: plan.center.y,
          r: radiusProjector(prim.r),
          fill: layer.fill ?? "none",
          stroke: layer.stroke ?? "#e2e8f0",
          "stroke-width": layer.width ?? 1,
          "stroke-dasharray": layer.dash ? "4,3" : null,
          opacity: layer.opacity ?? 1
        }));
      }
    } else if (layer.mark === "text") {
      for (const prim of layer.primitives) {
        const [x, y] = projectPolar(plan.center, radiusProjector, prim.theta, prim.r);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        nodes.push(elementNode("text", {
          x, y, fill: layer.fill, "font-size": `${layer.size ?? 10}px`,
          "font-family": presentation.typography.bodyFontFamily,
          "text-anchor": layer.anchor ?? "middle", "dominant-baseline": layer.baseline ?? "middle",
          opacity: layer.opacity ?? 1
        }, { text: prim.label ?? "" }));
      }
    }
  }
  return {
    kind: "chart-scene",
    frame: "polar",
    renderer: "svg",
    width: plan.width,
    height: plan.height,
    mountTag,
    center: plan.center,
    maxRadius: plan.maxRadius,
    scales: { r: linearScale(plan.scales.r.domain, [0, plan.maxRadius]) },
    presentation,
    sourcePlan: plan,
    sourceLayers: plan.layers,
    nodes
  };
}

function buildDiscScene(plan, { mountTag = "" } = {}) {
  const presentation = normalizePresentation(plan.presentation);
  const hasAnimation = plan.layers.some(layer => layer.mark === "particles" && Array.isArray(layer.frames) && layer.frames.length > 0);
  const renderer = mountTag === "canvas" || hasAnimation ? "canvas" : "svg";
  return {
    kind: "chart-scene",
    frame: "disc",
    renderer,
    mountTag,
    width: plan.width,
    height: plan.height,
    center: plan.center,
    scale: plan.scale,
    discRadius: plan.discRadius,
    presentation,
    playback: plan.playback ?? {},
    sourcePlan: plan,
    sourceLayers: plan.layers,
    hasAnimation
  };
}
