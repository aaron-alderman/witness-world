/**
 * gog-runtime.js — GENERIC grammar-of-graphics runtime. No domain logic.
 *
 * Two halves, deliberately split so the smarts are testable without a browser:
 *
 *   planChart(viewBody, evaluated, opts) -> renderPlan      [pure, node-testable]
 *       turns a DESIRE `chart` (surface) body + an evaluated product tensor
 *       (from dataflow-eval) into a concrete render plan: scales + per-layer
 *       mark primitives with resolved geometry.
 *
 *   drawChart(container, renderPlan, d3) -> SVGElement       [browser/D3]
 *       paints a render plan into an SVG. d3 is injected (global in the page).
 *
 * The plan is the contract between "what to draw" (honest, witnessed, from the
 * IR) and "how to rasterize" (the lowered D3 leaf). This module is reusable
 * verbatim by any scientific app — it knows nothing about Goodman or fatigue.
 */

export const DEFAULT_BAND_FILLS = ["#bbf7d0", "#d9f99d", "#fef08a", "#fde68a"];

const COLOR_TOKENS = {
  blue: "#5AAABF", blu2: "#2C3C63", red: "#dc2626", grn: "#16a34a",
  ylw: "#EC7424", slate: "#475569", pur: "#7c3aed", dk: "#2C3C63"
};

const DEFAULT_MARGIN = { top: 26, right: 42, bottom: 52, left: 64 };

// ── planning (pure) ─────────────────────────────────────────────────────────────

export function planChart(viewBody, evaluated, opts = {}) {
  const frame = viewBody.frame ?? "cartesian";
  if (frame === "polar") return planPolarChart(viewBody, evaluated, opts);
  if (frame === "disc") return planDiscChart(viewBody, evaluated, opts);
  const width = opts.width ?? 800;
  const height = opts.height ?? 520;
  const margin = opts.margin ?? DEFAULT_MARGIN;
  const fills = opts.bandFills ?? viewBody.bandFills ?? DEFAULT_BAND_FILLS;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const enc = viewBody.encoding ?? {};
  const xField = enc.x?.field ?? "x";

  // build layer primitives first (so we can auto-fit x/y from what is actually drawn)
  const layers = (viewBody.layers ?? []).map(layer => planLayer(layer, evaluated, fills));

  const xDomainSpec = enc.x?.domain ?? [0, "auto"];
  const xExtent = autoXExtent(layers);
  const xMin = xDomainSpec[0] === "auto" || xDomainSpec[0] == null ? xExtent[0] : Number(xDomainSpec[0]);
  const xMax = xDomainSpec[1] === "auto" || xDomainSpec[1] == null ? xExtent[1] : Number(xDomainSpec[1]);
  const xDomain = [xMin, xMax];

  const yDomainSpec = enc.y?.domain ?? [0, "auto"];
  const yMax = yDomainSpec[1] === "auto" || yDomainSpec[1] == null
    ? autoYMax(layers)
    : Number(yDomainSpec[1]);
  const yMin = yDomainSpec[0] === "auto" || yDomainSpec[0] == null ? 0 : Number(yDomainSpec[0]);

  const xScale = linearScale(xDomain, [0, innerW]);
  const yScale = linearScale([yMin, yMax], [innerH, 0]);

  return {
    frame: viewBody.frame ?? "cartesian",
    width, height, margin, innerW, innerH,
    scales: {
      x: { domain: [xScale.domain[0], xScale.domain[1]], range: [0, innerW], field: xField, label: enc.x?.label ?? xField },
      y: { domain: [yMin, yMax], range: [innerH, 0], field: enc.y?.field ?? "y", label: enc.y?.label ?? "" }
    },
    layers,
    editable: viewBody.editable ?? []
  };
}

function planLayer(layer, evaluated, fills) {
  const fields = evaluated.fields ?? {};
  const axes = evaluated.axes ?? {};
  const enc = layer.encode ?? {};
  const base = { name: layer.name, mark: layer.mark, encode: enc };

  if (layer.mark === "area") {
    // one area per category in `over` (e.g. lifetime); generic "from baseline".
    const overAxis = layer.over?.[0];
    const yField = fields[enc.y];
    const smValues = sweepValuesFor(yField, axes);
    if (!overAxis || !yField) return { ...base, primitives: [] };
    const cats = axes[overAxis]?.values ?? [];
    const primitives = cats.map((cat, j) => ({
      category: cat,
      fill: fills[j % fills.length],
      points: smValues.map((x, i) => ({ x, y0: 0, y1: at2(yField.data, i, j) }))
    }));
    // tallest (longest-life) at back
    primitives.reverse();
    return { ...base, primitives };
  }

  if (layer.mark === "line") {
    const yField = fields[enc.y];
    if (!yField) return { ...base, primitives: [] };
    const where = parseWhere(enc.where, axes);
    const iterAxis = iterationAxis(layer, yField, axes);
    const xField = enc.x && fields[enc.x] ? fields[enc.x] : null;
    const iterVals = axes[iterAxis]?.values ?? [];
    const points = iterVals.map((axVal, i) => {
      const coord = { [iterAxis]: i, ...where };
      return { x: xField ? valueAt(xField, coord) : axVal, y: valueAt(yField, coord) };
    });
    return { ...base, stroke: colorToken(enc.stroke), width: Number(enc.width) || 2, dash: enc.dash === true, primitives: [{ points }] };
  }

  if (layer.mark === "rule") {
    // vertical rule at x = <scalar field or param>
    const xVal = scalarRef(enc.x, evaluated);
    return { ...base, stroke: colorToken(enc.stroke), dash: enc.dash === true, primitives: xVal == null ? [] : [{ x: xVal }] };
  }

  if (layer.mark === "point") {
    const xVal = scalarRef(enc.x, evaluated);
    const yVal = scalarRef(enc.y, evaluated);
    return { ...base, primitives: (xVal == null) ? [] : [{ x: xVal, y: yVal }] };
  }

  return { ...base, primitives: [] };
}

// ── polar frame (cross-section, rose) ────────────────────────────────────────────

function planPolarChart(viewBody, evaluated, opts = {}) {
  const width = opts.width ?? 600;
  const height = opts.height ?? 600;
  const margin = opts.margin ?? { top: 24, right: 24, bottom: 24, left: 24 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxRadius = Math.min(innerW, innerH) / 2;
  const enc = viewBody.encoding ?? {};
  const layers = (viewBody.layers ?? []).map(layer => planPolarLayer(layer, evaluated));

  const rDomainSpec = enc.r?.domain ?? [0, "auto"];
  const rMax = rDomainSpec[1] === "auto" || rDomainSpec[1] == null ? autoPolarRMax(layers) : Number(rDomainSpec[1]);
  const thetaDomain = enc.theta?.domain && enc.theta.domain[0] !== "auto"
    ? enc.theta.domain.map(Number) : [0, 2 * Math.PI];

  return {
    frame: "polar", width, height, margin, maxRadius,
    center: { x: margin.left + innerW / 2, y: margin.top + innerH / 2 },
    scales: {
      r: { domain: [0, rMax], range: [0, maxRadius], field: enc.r?.field ?? "r", label: enc.r?.label ?? "" },
      theta: { domain: thetaDomain, field: enc.theta?.field ?? "theta", label: enc.theta?.label ?? "" }
    },
    layers,
    editable: viewBody.editable ?? []
  };
}

function planPolarLayer(layer, evaluated) {
  const fields = evaluated.fields ?? {};
  const axes = evaluated.axes ?? {};
  const enc = layer.encode ?? {};
  const base = { name: layer.name, mark: layer.mark, encode: enc };
  const where = parseWhere(enc.where, axes);

  if (layer.mark === "polygon" || layer.mark === "line") {
    const rField = fields[enc.r];
    const thetaField = fields[enc.theta];
    if (!rField || !thetaField) return { ...base, primitives: [] };
    const iterAxis = iterationAxis(layer, rField, axes);
    const points = (axes[iterAxis]?.values ?? []).map((_, i) => {
      const coord = { [iterAxis]: i, ...where };
      return { theta: valueAt(thetaField, coord), r: valueAt(rField, coord) };
    });
    return {
      ...base, stroke: colorToken(enc.stroke), fill: enc.fill ? colorToken(enc.fill) : null,
      closed: layer.mark === "polygon", primitives: [{ points }]
    };
  }

  if (layer.mark === "wedge") {
    const t0Field = fields[enc.theta0];
    const t1Field = fields[enc.theta1];
    const vField = fields[enc.value ?? enc.r];
    if (!t0Field || !t1Field || !vField) return { ...base, primitives: [] };
    const iterAxis = iterationAxis(layer, vField, axes);
    const primitives = (axes[iterAxis]?.values ?? []).map((_, i) => {
      const coord = { [iterAxis]: i, ...where };
      return { theta0: valueAt(t0Field, coord), theta1: valueAt(t1Field, coord), value: valueAt(vField, coord) };
    });
    return { ...base, primitives };
  }

  return { ...base, primitives: [] };
}

function autoPolarRMax(layers) {
  let max = 0;
  for (const layer of layers) {
    for (const prim of layer.primitives ?? []) {
      if (prim.points) for (const p of prim.points) { if (Number.isFinite(p.r) && p.r > max) max = p.r; }
      else if (Number.isFinite(prim.value) && prim.value > max) max = prim.value;
    }
  }
  return max > 0 ? max * 1.08 : 1;
}

// ── disc frame (mill cross-section: equal-aspect, centred xy) ─────────────────────

function planDiscChart(viewBody, evaluated, opts = {}) {
  const width = opts.width ?? 600;
  const height = opts.height ?? 600;
  const margin = opts.margin ?? { top: 24, right: 24, bottom: 24, left: 24 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxRadius = Math.min(innerW, innerH) / 2;
  const enc = viewBody.encoding ?? {};
  const layers = (viewBody.layers ?? []).map(layer => planDiscLayer(layer, evaluated));

  // disc radius: the shell radius (enc.r param/field) or auto-fit from drawn extent
  const discRadius = scalarRef(enc.r?.field, evaluated) ?? autoDiscRadius(layers) ?? 1;
  const scale = maxRadius / (discRadius || 1);

  return {
    frame: "disc", width, height, margin, maxRadius, discRadius, scale,
    center: { x: margin.left + innerW / 2, y: margin.top + innerH / 2 },
    scales: {
      x: { field: enc.x?.field ?? "x", label: enc.x?.label ?? "" },
      y: { field: enc.y?.field ?? "y", label: enc.y?.label ?? "" }
    },
    layers,
    editable: viewBody.editable ?? []
  };
}

function planDiscLayer(layer, evaluated) {
  const fields = evaluated.fields ?? {};
  const axes = evaluated.axes ?? {};
  const enc = layer.encode ?? {};
  const base = { name: layer.name, mark: layer.mark, encode: enc };
  const where = parseWhere(enc.where, axes);

  if (layer.mark === "polygon" || layer.mark === "line") {
    const xField = fields[enc.x];
    const yField = fields[enc.y];
    if (!xField || !yField) return { ...base, primitives: [] };
    const iterAxis = iterationAxis(layer, xField, axes);
    const points = (axes[iterAxis]?.values ?? []).map((_, i) => {
      const coord = { [iterAxis]: i, ...where };
      return { x: valueAt(xField, coord), y: valueAt(yField, coord) };
    });
    return {
      ...base, stroke: colorToken(enc.stroke), fill: enc.fill ? colorToken(enc.fill) : null,
      closed: layer.mark === "polygon", primitives: [{ points }]
    };
  }

  if (layer.mark === "point") {
    const xVal = scalarRef(enc.x, evaluated);
    const yVal = scalarRef(enc.y, evaluated);
    return { ...base, stroke: colorToken(enc.stroke), primitives: xVal == null ? [] : [{ x: xVal, y: yVal }] };
  }

  if (layer.mark === "particles") {
    // a scatter that walks the particle axis; if the x/y fields carry a second
    // sweep axis (the time/phase axis), emit one frame per step for animation.
    const xField = fields[enc.x];
    const yField = fields[enc.y];
    if (!xField || !yField) return { ...base, frames: [] };
    const partAxis = iterationAxis(layer, xField, axes);
    const animAxis = (xField.axes || []).find(a => a !== partAxis && axes[a]?.kind === "sweep") ?? null;
    const partVals = axes[partAxis]?.values ?? [];
    const frameFor = animCoord => partVals.map((_, i) => {
      const coord = { [partAxis]: i, ...where, ...animCoord };
      return { x: valueAt(xField, coord), y: valueAt(yField, coord) };
    });
    if (!animAxis) {
      return { ...base, stroke: colorToken(enc.stroke), animAxis: null, frames: [{ t: null, points: frameFor({}) }] };
    }
    const frames = (axes[animAxis]?.values ?? []).map((tv, k) => ({ t: tv, points: frameFor({ [animAxis]: k }) }));
    return { ...base, stroke: colorToken(enc.stroke), animAxis, frames };
  }

  return { ...base, primitives: [] };
}

function autoDiscRadius(layers) {
  let max = 0;
  const consider = pts => { for (const p of pts) { const r = Math.hypot(p.x, p.y); if (Number.isFinite(r) && r > max) max = r; } };
  for (const layer of layers) {
    for (const prim of layer.primitives ?? []) {
      if (prim.points) consider(prim.points);
      else if (Number.isFinite(prim.x)) consider([prim]);
    }
    for (const frame of layer.frames ?? []) consider(frame.points ?? []);
  }
  return max > 0 ? max * 1.05 : null;
}

// ── plan helpers ────────────────────────────────────────────────────────────────

// index a field at a coord map {axisName: index}; missing axes default to 0
function valueAt(field, coord) {
  if (!field) return undefined;
  if (!field.axes || field.axes.length === 0) return field.data;
  let v = field.data;
  for (const ax of field.axes) v = v?.[coord[ax] ?? 0];
  return v;
}

// "method=grounded" -> { method: <index> }; numeric values coerced
function parseWhere(token, axes) {
  if (!token || typeof token !== "string" || !token.includes("=")) return {};
  const [ax, raw] = token.split("=");
  const vals = axes[ax]?.values ?? [];
  const asNum = Number(raw);
  const needle = raw !== "" && !Number.isNaN(asNum) ? asNum : raw;
  const idx = vals.indexOf(needle);
  return idx >= 0 ? { [ax]: idx } : {};
}

// the axis a layer walks to make points: a sweep axis from `over`, else from the field
function iterationAxis(layer, field, axes) {
  const over = layer.over || [];
  const sweepInOver = over.find(a => axes[a]?.kind === "sweep");
  if (sweepInOver) return sweepInOver;
  const sweepInField = (field.axes || []).find(a => axes[a]?.kind === "sweep");
  if (sweepInField) return sweepInField;
  return (field.axes || [])[0] ?? over[0];
}

function sweepValuesFor(field, axes) {
  const smAxis = (field?.axes ?? []).find(a => axes[a]?.kind === "sweep");
  if (smAxis) return axes[smAxis].values;
  // fall back to the first axis with values
  const first = (field?.axes ?? [])[0];
  return first ? (axes[first]?.values ?? []) : [];
}

function at1(data, i) { return Array.isArray(data) ? data[i] : data; }
function at2(data, i, j) {
  const row = Array.isArray(data) ? data[i] : data;
  return Array.isArray(row) ? row[j] : row;
}

function scalarRef(token, evaluated) {
  if (token == null) return null;
  if (typeof token === "number") return token;
  const field = evaluated.fields?.[token];
  if (field) return field.axes.length === 0 ? field.data : null;
  // a param value materialized as an axis-less constant
  const param = evaluated.params?.[token];
  return param ?? null;
}

function autoYMax(layers) {
  let max = 0;
  for (const layer of layers) {
    for (const prim of layer.primitives ?? []) {
      if (prim.points) {
        for (const p of prim.points) {
          const v = p.y1 ?? p.y;
          if (Number.isFinite(v) && v > max) max = v;
        }
      } else if (Number.isFinite(prim.y) && prim.y > max) {
        max = prim.y;
      }
    }
  }
  return max > 0 ? max * 1.08 : 1;
}

function autoXExtent(layers) {
  let min = Infinity, max = -Infinity;
  for (const layer of layers) {
    for (const prim of layer.primitives ?? []) {
      if (prim.points) {
        for (const p of prim.points) { if (Number.isFinite(p.x)) { if (p.x < min) min = p.x; if (p.x > max) max = p.x; } }
      } else if (Number.isFinite(prim.x)) {
        if (prim.x < min) min = prim.x; if (prim.x > max) max = prim.x;
      }
    }
  }
  if (!Number.isFinite(min)) return [0, 1];
  return [Math.min(0, min), max > min ? max : min + 1];
}

function numericDomain(domain, fallback) {
  if (!Array.isArray(domain) || domain.length < 2) return fallback;
  return [Number(domain[0]), Number(domain[1])];
}

function colorToken(token) {
  if (token == null) return "#5AAABF";
  return COLOR_TOKENS[token] ?? String(token);
}

function linearScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = (d1 - d0) || 1;
  const scale = v => r0 + (v - d0) / span * (r1 - r0);
  scale.domain = domain;
  scale.range = range;
  scale.invert = px => d0 + (px - r0) / ((r1 - r0) || 1) * span;
  return scale;
}

// ── drawing (browser/D3) ─────────────────────────────────────────────────────────

export function drawChart(container, plan, d3) {
  if (!d3) throw new Error("drawChart requires d3");
  if (plan.frame === "polar") return drawPolarChart(container, plan, d3);
  const { width, height, margin, scales } = plan;
  d3.select(container).selectAll("svg.gog").remove();
  const svg = d3.select(container).append("svg")
    .attr("class", "gog").attr("width", "100%").attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = v => (v - scales.x.domain[0]) / ((scales.x.domain[1] - scales.x.domain[0]) || 1) * plan.innerW;
  const y = v => plan.innerH - (v - scales.y.domain[0]) / ((scales.y.domain[1] - scales.y.domain[0]) || 1) * plan.innerH;

  for (const layer of plan.layers) {
    if (layer.mark === "area") {
      for (const prim of layer.primitives) {
        const top = prim.points.map(p => `${x(p.x)},${y(p.y1)}`);
        const bottom = prim.points.slice().reverse().map(p => `${x(p.x)},${y(p.y0)}`);
        g.append("polygon")
          .attr("points", [...top, ...bottom].join(" "))
          .attr("fill", prim.fill).attr("opacity", layer.encode?.opacity ?? 0.9);
      }
    } else if (layer.mark === "line") {
      for (const prim of layer.primitives) {
        g.append("polyline")
          .attr("points", prim.points.filter(p => Number.isFinite(p.y)).map(p => `${x(p.x)},${y(p.y)}`).join(" "))
          .attr("fill", "none").attr("stroke", layer.stroke).attr("stroke-width", layer.width)
          .attr("stroke-dasharray", layer.dash ? "5,4" : null);
      }
    } else if (layer.mark === "rule") {
      for (const prim of layer.primitives) {
        g.append("line")
          .attr("x1", x(prim.x)).attr("x2", x(prim.x)).attr("y1", 0).attr("y2", plan.innerH)
          .attr("stroke", layer.stroke).attr("stroke-dasharray", layer.dash ? "4,4" : null);
      }
    } else if (layer.mark === "point") {
      for (const prim of layer.primitives) {
        if (!Number.isFinite(prim.y)) continue;
        g.append("circle").attr("cx", x(prim.x)).attr("cy", y(prim.y)).attr("r", 4);
      }
    }
  }

  // axes
  g.append("line").attr("x1", 0).attr("y1", plan.innerH).attr("x2", plan.innerW).attr("y2", plan.innerH).attr("stroke", "#94a3b8");
  g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", plan.innerH).attr("stroke", "#94a3b8");
  return svg.node();
}

function drawPolarChart(container, plan, d3) {
  const { width, height, center, maxRadius, scales } = plan;
  const rScale = v => (v - scales.r.domain[0]) / ((scales.r.domain[1] - scales.r.domain[0]) || 1) * maxRadius;
  const toXY = (theta, r) => [center.x + rScale(r) * Math.sin(theta), center.y - rScale(r) * Math.cos(theta)];
  d3.select(container).selectAll("svg.gog").remove();
  const svg = d3.select(container).append("svg")
    .attr("class", "gog").attr("width", "100%").attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);
  // grid rings
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    svg.append("circle").attr("cx", center.x).attr("cy", center.y).attr("r", maxRadius * frac)
      .attr("fill", "none").attr("stroke", "#e2e8f0");
  }
  for (const layer of plan.layers) {
    if (layer.mark === "polygon" || layer.mark === "line") {
      for (const prim of layer.primitives) {
        const pts = prim.points.filter(p => Number.isFinite(p.r)).map(p => toXY(p.theta, p.r).join(","));
        const el = layer.closed ? svg.append("polygon") : svg.append("polyline");
        el.attr("points", pts.join(" ")).attr("fill", layer.fill ?? "none")
          .attr("fill-opacity", layer.fill ? 0.25 : 0).attr("stroke", layer.stroke).attr("stroke-width", 2);
      }
    } else if (layer.mark === "wedge") {
      const vmax = Math.max(...layer.primitives.map(p => p.value || 0), 1);
      for (const prim of layer.primitives) {
        const r0 = toXY(prim.theta0, prim.value);
        const r1 = toXY(prim.theta1, prim.value);
        svg.append("path")
          .attr("d", `M ${center.x} ${center.y} L ${r0.join(" ")} L ${r1.join(" ")} Z`)
          .attr("fill", forceColour(prim.value, 0, vmax)).attr("opacity", 0.85);
      }
    }
  }
  return svg.node();
}

// cool→warm ramp for force magnitude wedges
function forceColour(v, min, max) {
  const t = Math.max(0, Math.min(1, (v - min) / ((max - min) || 1)));
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(52, 236)},${lerp(76, 116)},${lerp(108, 36)})`; // #344C6C → #EC7424
}
