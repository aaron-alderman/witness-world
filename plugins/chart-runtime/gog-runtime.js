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
  const layers = (viewBody.layers ?? []).map(layer => planLayer(layer, evaluated, fills, { width, height }));

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
    editable: viewBody.editable ?? [],
    presentation: {
      title: viewBody.title ?? "",
      xLabel: viewBody.xLabel ?? enc.x?.label ?? xField,
      yLabel: viewBody.yLabel ?? enc.y?.label ?? "",
      titleSize: Number(viewBody.titleSize) || 13,
      axisSize: Number(viewBody.axisSize) || 12,
      showGrid: viewBody.showGrid !== false,
      showAnnotations: viewBody.showAnnotations !== false,
      pointSize: Number(viewBody.pointSize) || 4,
      annotations: Array.isArray(viewBody.annotations) ? viewBody.annotations : []
    }
  };
}

function planLayer(layer, evaluated, fills, opts = {}) {
  const fields = evaluated.fields ?? {};
  const axes = evaluated.axes ?? {};
  const enc = layer.encode ?? {};
  const base = { name: layer.name, mark: layer.mark, encode: enc };
  if (!layerPredicateMatches(enc, evaluated)) return { ...base, primitives: [], hidden: true };
  if (layer.mark === "screen-rect" || layer.mark === "screen-text") {
    return planScreenLayer({ base, enc, evaluated, axes, width: opts.width ?? 800, height: opts.height ?? 520 });
  }

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
    const where = parseWhere(enc.where, axes, evaluated);
    const iterAxis = iterationAxis(layer, yField, axes);
    const xField = enc.x && fields[enc.x] ? fields[enc.x] : null;
    const iterVals = axes[iterAxis]?.values ?? [];
    const categoryAxis = (layer.over ?? []).find(axisName => axes[axisName]?.kind === "category" && yField.axes?.includes(axisName));
    const categoryValues = categoryAxis ? (axes[categoryAxis]?.values ?? []) : [null];
    const primitives = categoryValues.map((category, categoryIndex) => ({
      category,
      points: iterVals.map((axVal, i) => {
        const coord = { [iterAxis]: i, ...(categoryAxis ? { [categoryAxis]: categoryIndex } : {}), ...where };
        return {
          x: xField ? valueAt(xField, coord) : axVal,
          y: valueAt(yField, coord),
          tooltip: tooltipValuesForEncoding(enc, evaluated, coord, axes)
        };
      })
    }));
    return {
      ...base,
      stroke: colorToken(enc.stroke),
      width: Number(enc.width) || 2,
      dash: enc.dash === true,
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      primitives
    };
  }

  if (layer.mark === "band") {
    // a filled region between two y-fields (e.g. p10..p90) over the x axis
    const y0Field = fields[enc.y0];
    const y1Field = fields[enc.y1];
    if (!y0Field || !y1Field) return { ...base, primitives: [] };
    const iterAxis = iterationAxis(layer, y1Field, axes);
    const xField = enc.x && fields[enc.x] ? fields[enc.x] : null;
    const points = (axes[iterAxis]?.values ?? []).map((axVal, i) => {
      const coord = { [iterAxis]: i };
      return { x: xField ? valueAt(xField, coord) : axVal, y0: valueAt(y0Field, coord), y1: valueAt(y1Field, coord) };
    });
    return { ...base, fill: enc.fill ? colorToken(enc.fill) : "#5AAABF", opacity: Number(enc.opacity) || 0.25, primitives: [{ points }] };
  }

  if (layer.mark === "cloud") {
    // faint per-sample spaghetti: one polyline per ensemble sample over the x axis
    const yField = fields[enc.y];
    if (!yField) return { ...base, primitives: [] };
    const sampleAxis = (layer.over || []).find(a => axes[a]?.kind === "ensemble")
      ?? (yField.axes || []).find(a => axes[a]?.kind === "ensemble");
    const xAxis = (yField.axes || []).find(a => a !== sampleAxis);
    const xField = enc.x && fields[enc.x] ? fields[enc.x] : null;
    const xVals = axes[xAxis]?.values ?? [];
    const primitives = (axes[sampleAxis]?.values ?? []).map((_, s) => ({
      sample: s,
      points: xVals.map((xv, i) => {
        const coord = { [xAxis]: i, [sampleAxis]: s };
        return { x: xField ? valueAt(xField, coord) : xv, y: valueAt(yField, coord) };
      })
    }));
    return { ...base, stroke: colorToken(enc.stroke), opacity: Number(enc.opacity) || 0.12, primitives };
  }

  if (layer.mark === "rule") {
    // vertical rule at x = <scalar field or param>
    const xVal = scalarRef(enc.x, evaluated);
    return {
      ...base,
      stroke: colorToken(enc.stroke),
      width: Number(enc.width) || 1,
      dash: enc.dash === true,
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      primitives: xVal == null ? [] : [{ x: xVal }]
    };
  }

  if (layer.mark === "point") {
    const xVal = scalarRef(enc.x, evaluated);
    const yVal = scalarRef(enc.y, evaluated);
    return {
      ...base,
      fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : colorToken(enc.stroke ?? "blue"),
      stroke: enc.stroke ? colorRef(enc.stroke, evaluated, enc.strokeMap) : "none",
      width: Number(enc.width) || 1,
      size: Number(enc.size) || 4,
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      primitives: (xVal == null) ? [] : [{ x: xVal, y: yVal }]
    };
  }

  if (layer.mark === "text") {
    const where = parseWhere(enc.where, axes, evaluated);
    const xVal = channelValue(enc.x, evaluated, where);
    const yVal = channelValue(enc.y, evaluated, where);
    const label = textChannelValue(enc.label ?? enc.text, evaluated, where, axes);
    return {
      ...base,
      fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : "#475569",
      size: Number(enc.size) || 11,
      weight: enc.weight ?? "normal",
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      anchor: enc.anchor ?? "middle",
      baseline: enc.baseline ?? "middle",
      primitives: Number.isFinite(xVal) && Number.isFinite(yVal) && label != null
        ? [{ x: xVal, y: yVal, label: String(label) }]
        : []
    };
  }

  return { ...base, primitives: [] };
}

// ── polar frame (radial polygons, wedges, and linework) ─────────────────────────

function planPolarChart(viewBody, evaluated, opts = {}) {
  const width = opts.width ?? 600;
  const height = opts.height ?? 600;
  const margin = opts.margin ?? { top: 24, right: 24, bottom: 24, left: 24 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxRadius = Math.min(innerW, innerH) / 2;
  const enc = viewBody.encoding ?? {};
  const layers = (viewBody.layers ?? []).map(layer => planPolarLayer(layer, evaluated, { width, height }));

  const rDomainSpec = enc.r?.domain ?? [0, "auto"];
  const authoredRMax = scalarRef(rDomainSpec[1], evaluated) ?? Number(rDomainSpec[1]);
  const rMax = rDomainSpec[1] === "auto" || rDomainSpec[1] == null ? autoPolarRMax(layers) : authoredRMax;
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

function planPolarLayer(layer, evaluated, opts = {}) {
  const fields = evaluated.fields ?? {};
  const axes = evaluated.axes ?? {};
  const enc = layer.encode ?? {};
  const base = { name: layer.name, mark: layer.mark, encode: enc };
  if (!layerPredicateMatches(enc, evaluated)) return { ...base, primitives: [], hidden: true };
  if (layer.mark === "screen-rect" || layer.mark === "screen-text") {
    return planScreenLayer({ base, enc, evaluated, axes, width: opts.width ?? 600, height: opts.height ?? 600 });
  }
  const where = parseWhere(enc.where, axes, evaluated);

  if (layer.mark === "polygon" || layer.mark === "line") {
    const rField = fields[enc.r];
    const thetaField = fields[enc.theta];
    if (!rField || !thetaField) return { ...base, primitives: [] };
    const iterAxis = iterationAxis(layer, rField, axes);
    const points = (axes[iterAxis]?.values ?? []).map((_, i) => {
      const coord = { [iterAxis]: i, ...where };
      return {
        theta: valueAt(thetaField, coord),
        r: valueAt(rField, coord),
        tooltip: tooltipValuesForEncoding(enc, evaluated, coord, axes)
      };
    });
    return {
      ...base, stroke: colorToken(enc.stroke), fill: enc.fill ? colorToken(enc.fill) : null,
      width: Number(enc.width) || 2,
      dash: enc.dash === true,
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
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

  if (layer.mark === "annular-wedge" || layer.mark === "polar-quad") {
    const t0Field = fields[enc.theta0];
    const t1Field = fields[enc.theta1];
    const vField = fields[enc.value ?? enc.r] ?? null;
    if (!t0Field || !t1Field) return { ...base, primitives: [] };
    const iterAxis = iterationAxis(layer, vField ?? t1Field, axes);
    const primitives = (axes[iterAxis]?.values ?? []).map((_, i) => {
      const coord = { [iterAxis]: i, ...where };
      return {
        theta0: valueAt(t0Field, coord),
        theta1: valueAt(t1Field, coord),
        r0: channelValue(enc.r0, evaluated, coord) ?? 0,
        r1: channelValue(enc.r1 ?? enc.r, evaluated, coord) ?? channelValue(enc.r, evaluated, coord) ?? 0,
        value: vField ? valueAt(vField, coord) : channelValue(enc.value, evaluated, coord),
        tooltip: tooltipValuesForEncoding(enc, evaluated, coord, axes)
      };
    });
    return {
      ...base,
      fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : null,
      stroke: enc.stroke ? colorRef(enc.stroke, evaluated, enc.strokeMap) : null,
      opacity: enc.opacity == null ? 0.85 : Number(enc.opacity),
      primitives
    };
  }

  if (layer.mark === "polar-point") {
    const rField = fields[enc.r];
    const thetaField = fields[enc.theta];
    if (!rField || !thetaField) return { ...base, primitives: [] };
    const iterAxis = iterationAxis(layer, rField, axes);
    const primitives = (axes[iterAxis]?.values ?? []).map((_, i) => {
      const coord = { [iterAxis]: i, ...where };
      return {
        theta: valueAt(thetaField, coord),
        r: valueAt(rField, coord),
        value: channelValue(enc.value ?? enc.r, evaluated, coord),
        tooltip: tooltipValuesForEncoding(enc, evaluated, coord, axes)
      };
    });
    return {
      ...base,
      fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : "#5AAABF",
      stroke: enc.stroke ? colorRef(enc.stroke, evaluated, enc.strokeMap) : "none",
      size: Number(enc.size) || 2,
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      primitives
    };
  }

  if (layer.mark === "circle") {
    const radius = channelValue(enc.r, evaluated, where);
    return {
      ...base,
      fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : "none",
      stroke: enc.stroke ? colorRef(enc.stroke, evaluated, enc.strokeMap) : "#e2e8f0",
      width: Number(enc.width) || 1,
      dash: enc.dash === true,
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      primitives: Number.isFinite(radius) ? [{ r: radius }] : []
    };
  }

  if (layer.mark === "text") {
    const theta = channelValue(enc.theta, evaluated, where);
    const r = channelValue(enc.r, evaluated, where);
    const label = textChannelValue(enc.label ?? enc.text, evaluated, where, axes);
    return {
      ...base,
      fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : "#475569",
      size: Number(enc.size) || 10,
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      anchor: enc.anchor ?? "middle",
      baseline: enc.baseline ?? "middle",
      primitives: Number.isFinite(theta) && Number.isFinite(r) && label != null
        ? [{ theta, r, label: String(label) }]
        : []
    };
  }

  return { ...base, primitives: [] };
}

function resolveScreenCoordinate(value, anchor, extent) {
  const offset = Number(value) || 0;
  const normalized = String(anchor ?? "start").trim();
  if (normalized === "right" || normalized === "bottom" || normalized === "end") return extent - offset;
  if (normalized === "center" || normalized === "middle") return extent / 2 + offset;
  return offset;
}

function planScreenLayer({ base, enc, evaluated, axes, width, height }) {
  const where = parseWhere(enc.where, axes, evaluated);
  const x = resolveScreenCoordinate(channelValue(enc.x, evaluated, where) ?? enc.x, enc.xAnchor, width);
  const y = resolveScreenCoordinate(channelValue(enc.y, evaluated, where) ?? enc.y, enc.yAnchor, height);
  if (base.mark === "screen-rect") {
    return {
      ...base,
      fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : "#475569",
      stroke: enc.stroke ? colorRef(enc.stroke, evaluated, enc.strokeMap) : "none",
      opacity: enc.opacity == null ? 1 : Number(enc.opacity),
      primitives: Number.isFinite(x) && Number.isFinite(y)
        ? [{
            x,
            y,
            width: Number(channelValue(enc.width, evaluated, where) ?? enc.width) || 10,
            height: Number(channelValue(enc.height, evaluated, where) ?? enc.height) || 10,
            rx: Number(enc.rx) || 0
          }]
        : []
    };
  }
  const label = textChannelValue(enc.label ?? enc.text, evaluated, where, axes);
  return {
    ...base,
    fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : "#475569",
    size: Number(enc.size) || 10,
    weight: enc.weight ?? "normal",
    opacity: enc.opacity == null ? 1 : Number(enc.opacity),
    anchor: enc.anchor ?? "start",
    baseline: enc.baseline ?? "middle",
    primitives: Number.isFinite(x) && Number.isFinite(y) && label != null
      ? [{ x, y, label: String(label) }]
      : []
  };
}

function autoPolarRMax(layers) {
  let max = 0;
  for (const layer of layers) {
    if (String(layer.mark || "").startsWith("screen-")) continue;
    for (const prim of layer.primitives ?? []) {
      if (prim.points) {
        for (const p of prim.points) if (Number.isFinite(p.r) && p.r > max) max = p.r;
        continue;
      }
      if (Number.isFinite(prim.r1)) {
        if (prim.r1 > max) max = prim.r1;
        continue;
      }
      if (Number.isFinite(prim.r)) {
        if (prim.r > max) max = prim.r;
        continue;
      }
      if (Number.isFinite(prim.value) && prim.value > max) max = prim.value;
    }
  }
  return max > 0 ? max * 1.08 : 1;
}

// ── disc frame (equal-aspect, centred xy in a bounding disc) ──────────────────────

function planDiscChart(viewBody, evaluated, opts = {}) {
  const width = opts.width ?? 600;
  const height = opts.height ?? 600;
  const margin = opts.margin ?? { top: 24, right: 24, bottom: 24, left: 24 };
  const props = viewBody.props ?? {};
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxRadius = Math.min(innerW, innerH) / 2;
  const enc = viewBody.encoding ?? {};
  const layers = (viewBody.layers ?? []).map(layer => planDiscLayer(layer, evaluated));

  // disc radius: the shell radius (enc.r param/field) or auto-fit from drawn extent
  const discRadius = scalarRef(enc.r?.field, evaluated) ?? autoDiscRadius(layers) ?? 1;
  const scale = maxRadius / (discRadius || 1);

  // wall-collision clip: flag particle points that have passed beyond the disc wall.
  // wallClip is a fraction of discRadius (1 = clip at the wall; lower → "landed near wall").
  const wallClip = opts.wallClip ?? 1;
  clipParticlesToDisc(layers, discRadius, wallClip);

  // playback: full time span (loops over its physical duration × `speed`)
  const playback = { speed: opts.speed ?? 1, loop: opts.loop ?? true, wallClip };

  return {
    frame: "disc", width, height, margin, maxRadius, discRadius, scale, playback,
    presentation: {
      discBackground: props.discBackground ?? "#0d1a2e",
      shellStroke: props.shellStroke ?? "#64748b"
    },
    center: { x: margin.left + innerW / 2, y: margin.top + innerH / 2 },
    scales: {
      x: { field: enc.x?.field ?? "x", label: enc.x?.label ?? "" },
      y: { field: enc.y?.field ?? "y", label: enc.y?.label ?? "" }
    },
    layers,
    editable: viewBody.editable ?? []
  };
}

// annotate each particle point with inDisc (false once it has flown past the wall)
function clipParticlesToDisc(layers, discRadius, wallClip) {
  const limit = discRadius * wallClip + 1e-9;
  for (const layer of layers) {
    if (layer.mark !== "particles" || !layer.frames) continue;
    for (const frame of layer.frames) {
      for (const p of frame.points ?? []) {
        p.inDisc = Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(p.x, p.y) <= limit;
      }
    }
  }
}

// map elapsed wall-clock seconds → a frame index along an evenly-or-unevenly-spaced
// time axis. Loops over the axis's physical span × speed; pure, so it is node-testable
// (the rAF loop in drawChart is a thin shell over this).
export function frameIndexForElapsed(tValues, elapsedSec, opts = {}) {
  if (!Array.isArray(tValues) || tValues.length <= 1) return 0;
  const speed = opts.speed ?? 1;
  const loop = opts.loop ?? true;
  const t0 = tValues[0];
  const span = tValues[tValues.length - 1] - t0;
  if (!(span > 0)) return 0;
  let phase = elapsedSec * speed;
  if (loop) { phase %= span; if (phase < 0) phase += span; }
  else phase = Math.max(0, Math.min(span, phase));
  const target = t0 + phase;
  let idx = 0;
  for (let i = 0; i < tValues.length; i += 1) {
    if (tValues[i] <= target + 1e-12) idx = i; else break;
  }
  return idx;
}

function planDiscLayer(layer, evaluated) {
  const fields = evaluated.fields ?? {};
  const axes = evaluated.axes ?? {};
  const enc = layer.encode ?? {};
  const base = { name: layer.name, mark: layer.mark, encode: enc };
  if (!layerPredicateMatches(enc, evaluated)) return { ...base, primitives: [], frames: [], hidden: true };
  const where = parseWhere(enc.where, axes, evaluated);

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
      ...base, stroke: colorRef(enc.stroke, evaluated, enc.strokeMap), fill: enc.fill ? colorRef(enc.fill, evaluated, enc.fillMap) : null,
      closed: layer.mark === "polygon", primitives: [{ points }]
    };
  }

  if (layer.mark === "point") {
    const xVal = scalarRef(enc.x, evaluated);
    const yVal = scalarRef(enc.y, evaluated);
    return { ...base, stroke: colorRef(enc.stroke, evaluated, enc.strokeMap), primitives: xVal == null ? [] : [{ x: xVal, y: yVal }] };
  }

  if (layer.mark === "radial-line") {
    const theta = scalarRef(enc.theta, evaluated);
    return {
      ...base,
      stroke: colorRef(enc.stroke, evaluated, enc.strokeMap),
      dash: enc.dash === true,
      label: enc.label == null ? null : String(enc.label),
      primitives: Number.isFinite(theta) ? [{ theta }] : []
    };
  }

  if (layer.mark === "lifters") {
    return {
      ...base,
      count: Number(enc.count) || 10,
      fill: colorRef(enc.fill ?? "#94a3b8", evaluated, enc.fillMap),
      height: Number(enc.height) || 0.055,
      width: Number(enc.width) || 0.028,
      primitives: [{}]
    };
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
      return { ...base, stroke: colorRef(enc.stroke, evaluated, enc.strokeMap), animAxis: null, frames: [{ t: null, points: frameFor({}) }] };
    }
    const frames = (axes[animAxis]?.values ?? []).map((tv, k) => ({ t: tv, points: frameFor({ [animAxis]: k }) }));
    return { ...base, stroke: colorRef(enc.stroke, evaluated, enc.strokeMap), animAxis, frames };
  }

  return { ...base, primitives: [] };
}

function autoDiscRadius(layers) {
  let max = 0;
  const consider = pts => { for (const p of pts) { const r = Math.hypot(p.x, p.y); if (Number.isFinite(r) && r > max) max = r; } };
  for (const layer of layers) {
    if (String(layer.mark || "").startsWith("screen-")) continue;
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

// "method=grounded" -> { method: <index> }; "method=param.active_method"
// resolves through evaluated model params so authored chart surfaces can bind
// a slice to process-owned state without shell-local chart branching.
function parseWhere(token, axes, evaluated = {}) {
  if (!token || typeof token !== "string" || !token.includes("=")) return {};
  const [ax, raw] = token.split("=");
  const vals = axes[ax]?.values ?? [];
  const trimmed = String(raw ?? "").trim();
  const paramName = trimmed.startsWith("param.") ? trimmed.slice("param.".length) : null;
  const rawNeedle = paramName ? evaluated.params?.[paramName] : trimmed;
  const asNum = Number(rawNeedle);
  const needle = rawNeedle !== "" && !Number.isNaN(asNum) ? asNum : rawNeedle;
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

function channelValue(token, evaluated, coord = {}) {
  if (token == null) return null;
  if (typeof token === "number") return token;
  const field = evaluated.fields?.[token];
  if (field) return field.axes.length === 0 ? field.data : valueAt(field, coord);
  return scalarRef(token, evaluated);
}

function tooltipValuesForEncoding(enc, evaluated, coord = {}, axes = {}) {
  const out = {};
  for (const [key, token] of Object.entries(enc ?? {})) {
    if (!key.startsWith("tooltip.")) continue;
    const name = key.slice("tooltip.".length);
    if (!name) continue;
    out[name] = tooltipChannelValue(token, evaluated, coord, axes);
  }
  return out;
}

function tooltipChannelValue(token, evaluated, coord = {}, axes = {}) {
  if (token == null) return null;
  if (typeof token === "number" || typeof token === "boolean") return token;
  const key = String(token);
  if (key.startsWith("param.")) return evaluated.params?.[key.slice("param.".length)];
  if (axes[key] && Object.prototype.hasOwnProperty.call(coord, key)) {
    return axes[key]?.values?.[coord[key]];
  }
  const resolved = channelValue(token, evaluated, coord);
  return resolved == null ? key : resolved;
}

function textChannelValue(token, evaluated, coord = {}, axes = {}) {
  if (token == null) return null;
  if (typeof token === "number" || typeof token === "boolean") return token;
  const key = String(token);
  if (key.startsWith("param.")) return evaluated.params?.[key.slice("param.".length)];
  if (axes[key] && Object.prototype.hasOwnProperty.call(coord, key)) {
    return axes[key]?.values?.[coord[key]];
  }
  const resolved = channelValue(token, evaluated, coord);
  return resolved == null ? key : resolved;
}

function predicateValue(token, evaluated) {
  const key = String(token ?? "").trim();
  if (!key) return undefined;
  if (key.startsWith("param.")) return evaluated.params?.[key.slice("param.".length)];
  return scalarRef(key, evaluated);
}

function coercePredicateLiteral(raw) {
  const value = String(raw ?? "").trim();
  if (value === "true") return true;
  if (value === "false") return false;
  const number = Number(value);
  return value !== "" && !Number.isNaN(number) ? number : value;
}

function predicateMatches(token, evaluated) {
  const text = String(token ?? "").trim();
  if (!text) return true;
  const equals = text.indexOf("=");
  if (equals < 0) return Boolean(predicateValue(text, evaluated));
  const left = text.slice(0, equals).trim();
  const right = coercePredicateLiteral(text.slice(equals + 1));
  return predicateValue(left, evaluated) === right;
}

function layerPredicateMatches(enc, evaluated) {
  if (enc.when != null && !predicateMatches(enc.when, evaluated)) return false;
  if (enc.unless != null && predicateMatches(enc.unless, evaluated)) return false;
  return true;
}

function parseColorMap(map) {
  if (!map || typeof map !== "string") return null;
  return Object.fromEntries(String(map)
    .split(",")
    .map(entry => entry.split("="))
    .filter(parts => parts.length === 2 && parts[0].trim())
    .map(([key, value]) => [key.trim(), value.trim()]));
}

function colorRef(token, evaluated, map = null) {
  const value = scalarRef(token, evaluated);
  const mapped = parseColorMap(map)?.[String(value)];
  if (mapped) return colorToken(mapped);
  return colorToken(value ?? token);
}

function autoYMax(layers) {
  let max = 0;
  for (const layer of layers) {
    if (String(layer.mark || "").startsWith("screen-")) continue;
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

// ── interactivity: probe (read values at an x) + scrubber (axis value → frame) ────

// linear-interpolate a points array's `key` (y / y0 / y1) at an arbitrary x; clamps at ends
function interpAtX(points, x, key) {
  if (!points || points.length === 0) return null;
  if (x <= points[0].x) return points[0][key];
  const last = points[points.length - 1];
  if (x >= last.x) return last[key];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].x >= x) {
      const a = points[i - 1], b = points[i];
      const t = (x - a.x) / ((b.x - a.x) || 1);
      return a[key] + (b[key] - a[key]) * t;
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

// Probe: read each cartesian layer's value(s) at a given x along the x-axis. Pure — the
// host (a drag handler in drawChart) calls this on pointer-move to rebind the probe overlay
// locally, without re-evaluating the model. Returns { x, readings:[{layer,mark,…}] }.
export function probeReadout(plan, x) {
  const readings = [];
  for (const layer of plan.layers ?? []) {
    if (layer.mark === "line" || layer.mark === "cloud") {
      for (const prim of layer.primitives ?? []) {
        const y = interpAtX(prim.points, x, "y");
        if (y != null) readings.push({ layer: layer.name, mark: layer.mark, y, sample: prim.sample, tooltip: tooltipAtX(prim.points, x) });
      }
    } else if (layer.mark === "band") {
      const pts = layer.primitives?.[0]?.points;
      const y0 = interpAtX(pts, x, "y0"), y1 = interpAtX(pts, x, "y1");
      if (y0 != null) readings.push({ layer: layer.name, mark: "band", y0, y1 });
    } else if (layer.mark === "area") {
      for (const prim of layer.primitives ?? []) {
        const y = interpAtX(prim.points, x, "y1");
        if (y != null) readings.push({ layer: layer.name, mark: "area", category: prim.category, y });
      }
    }
  }
  return { x, readings };
}

// Scrubber: map an axis VALUE to the nearest frame index (value-driven companion to
// frameIndexForElapsed's time-driven playback). Used to bind a slider/drag to a time axis.
export function frameIndexForValue(tValues, tValue) {
  if (!Array.isArray(tValues) || tValues.length === 0) return 0;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < tValues.length; i += 1) {
    const d = Math.abs(tValues[i] - tValue);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
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
  if (plan.frame === "disc") return drawDiscChart(container, plan, d3);
  const { width, height, margin, scales } = plan;
  const svg = selectChartSvg(container, d3, width, height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const presentation = plan.presentation ?? {};

  const x = v => (v - scales.x.domain[0]) / ((scales.x.domain[1] - scales.x.domain[0]) || 1) * plan.innerW;
  const y = v => plan.innerH - (v - scales.y.domain[0]) / ((scales.y.domain[1] - scales.y.domain[0]) || 1) * plan.innerH;

  for (const layer of plan.layers) {
    if (layer.mark === "screen-rect" || layer.mark === "screen-text") {
      drawScreenLayer(svg, layer);
    } else if (layer.mark === "area") {
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
          .attr("stroke-dasharray", layer.dash ? "5,4" : null)
          .attr("opacity", layer.opacity ?? 1);
      }
    } else if (layer.mark === "band") {
      for (const prim of layer.primitives) {
        const top = prim.points.filter(p => Number.isFinite(p.y1)).map(p => `${x(p.x)},${y(p.y1)}`);
        const bottom = prim.points.filter(p => Number.isFinite(p.y0)).slice().reverse().map(p => `${x(p.x)},${y(p.y0)}`);
        g.append("polygon").attr("points", [...top, ...bottom].join(" "))
          .attr("fill", layer.fill).attr("opacity", layer.opacity);
      }
    } else if (layer.mark === "cloud") {
      for (const prim of layer.primitives) {
        g.append("polyline")
          .attr("points", prim.points.filter(p => Number.isFinite(p.y)).map(p => `${x(p.x)},${y(p.y)}`).join(" "))
          .attr("fill", "none").attr("stroke", layer.stroke).attr("stroke-width", 0.6).attr("opacity", layer.opacity);
      }
    } else if (layer.mark === "rule") {
      for (const prim of layer.primitives) {
        g.append("line")
          .attr("x1", x(prim.x)).attr("x2", x(prim.x)).attr("y1", 0).attr("y2", plan.innerH)
          .attr("stroke", layer.stroke)
          .attr("stroke-width", layer.width ?? 1)
          .attr("stroke-dasharray", layer.dash ? "4,4" : null)
          .attr("opacity", layer.opacity ?? 1);
      }
    } else if (layer.mark === "point") {
      for (const prim of layer.primitives) {
        if (!Number.isFinite(prim.y)) continue;
        g.append("circle")
          .attr("cx", x(prim.x))
          .attr("cy", y(prim.y))
          .attr("r", layer.size ?? presentation.pointSize ?? 4)
          .attr("fill", layer.fill ?? "#5AAABF")
          .attr("stroke", layer.stroke ?? "none")
          .attr("stroke-width", layer.width ?? 1)
          .attr("opacity", layer.opacity ?? 1);
      }
    } else if (layer.mark === "text") {
      for (const prim of layer.primitives) {
        if (!Number.isFinite(prim.x) || !Number.isFinite(prim.y)) continue;
        g.append("text")
          .attr("x", x(prim.x))
          .attr("y", y(prim.y))
          .attr("text-anchor", layer.anchor ?? "middle")
          .attr("dominant-baseline", layer.baseline ?? "middle")
          .attr("font-size", `${layer.size ?? 11}px`)
          .attr("font-weight", layer.weight ?? "normal")
          .attr("fill", layer.fill ?? "#475569")
          .attr("opacity", layer.opacity ?? 1)
          .text(prim.label ?? "");
      }
    }
  }

  if (presentation.showGrid !== false) {
    const gridStroke = "#e2e8f0";
    const xTicks = 8;
    const yTicks = 7;
    for (let tick = 1; tick < xTicks; tick += 1) {
      const px = plan.innerW * tick / xTicks;
      g.append("line").attr("x1", px).attr("x2", px).attr("y1", 0).attr("y2", plan.innerH).attr("stroke", gridStroke);
    }
    for (let tick = 1; tick < yTicks; tick += 1) {
      const py = plan.innerH * tick / yTicks;
      g.append("line").attr("x1", 0).attr("x2", plan.innerW).attr("y1", py).attr("y2", py).attr("stroke", gridStroke);
    }
  }

  // axes
  g.append("line").attr("x1", 0).attr("y1", plan.innerH).attr("x2", plan.innerW).attr("y2", plan.innerH).attr("stroke", "#94a3b8");
  g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", plan.innerH).attr("stroke", "#94a3b8");
  g.append("text")
    .attr("x", plan.innerW / 2)
    .attr("y", plan.innerH + 42)
    .attr("text-anchor", "middle")
    .attr("font-size", `${presentation.axisSize ?? 12}px`)
    .attr("fill", "#64748b")
    .text(presentation.xLabel ?? "");
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -plan.innerH / 2)
    .attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("font-size", `${presentation.axisSize ?? 12}px`)
    .attr("fill", "#64748b")
    .text(presentation.yLabel ?? "");
  g.append("text")
    .attr("x", plan.innerW / 2)
    .attr("y", -10)
    .attr("text-anchor", "middle")
    .attr("font-size", `${presentation.titleSize ?? 13}px`)
    .attr("font-weight", "600")
    .attr("fill", "#0f172a")
    .text(presentation.title ?? "");

  if (presentation.showAnnotations !== false) for (const annotation of presentation.annotations ?? []) {
    if (!annotation?.text || !Number.isFinite(annotation.xMPa) || !Number.isFinite(annotation.yMPa)) continue;
    g.append("text")
      .attr("x", x(annotation.xMPa))
      .attr("y", y(annotation.yMPa))
      .attr("text-anchor", "middle")
      .attr("font-size", `${annotation.fontSize ?? 11}px`)
      .attr("font-weight", annotation.fontWeight ?? "600")
      .attr("fill", annotation.color ?? "#1e293b")
      .text(annotation.text);
  }

  // probe: a readout bound to the x-axis. Hover/drag re-renders ONLY this overlay via
  // probeReadout(plan, x) — a local rebind, no model re-evaluation.
  const probeG = g.append("g").attr("class", "gog-probe").style("pointer-events", "none");
  const renderProbe = xVal => {
    probeG.selectAll("*").remove();
    if (!Number.isFinite(xVal)) return null;
    const readout = probeReadout(plan, xVal);
    const px = x(xVal);
    probeG.append("line").attr("x1", px).attr("x2", px).attr("y1", 0).attr("y2", plan.innerH)
      .attr("stroke", "#EC7424").attr("stroke-width", 1);
    for (const reading of readout.readings) {
      const ys = reading.mark === "band" ? [reading.y0, reading.y1] : [reading.y];
      for (const yv of ys) {
        if (Number.isFinite(yv)) probeG.append("circle").attr("cx", px).attr("cy", y(yv)).attr("r", 3).attr("fill", "#EC7424");
      }
    }
    return readout;
  };
  const invertX = px => scales.x.domain[0] + (px / (plan.innerW || 1)) * (scales.x.domain[1] - scales.x.domain[0]);
  const onMove = event => renderProbe(invertX(d3.pointer ? d3.pointer(event)[0] : 0));
  g.append("rect").attr("width", plan.innerW).attr("height", plan.innerH)
    .attr("fill", "transparent").style("cursor", "ew-resize")
    .on("mousemove", onMove).on("touchmove", onMove);
  const probeLayer = plan.layers.find(l => l.mark === "rule" && l.name === "probe");
  if (probeLayer && Number.isFinite(probeLayer.primitives?.[0]?.x)) renderProbe(probeLayer.primitives[0].x);

  const node = svg.node();
  node.probeAt = renderProbe; // host hook: programmatic local rebind -> returns the readout
  node.probeAtPoint = (xPx, yPx) => {
    const plotX = Number(xPx) - margin.left;
    const plotY = Number(yPx) - margin.top;
    if (!Number.isFinite(plotX) || !Number.isFinite(plotY)) return null;
    if (plotX < 0 || plotX > plan.innerW || plotY < 0 || plotY > plan.innerH) return null;
    return renderProbe(invertX(plotX));
  };
  node.projectPoint = (xVal, yVal) => ({
    x: x(xVal) + margin.left,
    y: y(yVal) + margin.top
  });
  node.destroy = () => {
    svg.selectAll("*").remove();
  };
  return node;
}

function drawPolarChart(container, plan, d3) {
  const { width, height, center, maxRadius, scales } = plan;
  const rScale = v => (v - scales.r.domain[0]) / ((scales.r.domain[1] - scales.r.domain[0]) || 1) * maxRadius;
  const toXY = (theta, r) => [center.x + rScale(r) * Math.sin(theta), center.y - rScale(r) * Math.cos(theta)];
  const svg = selectChartSvg(container, d3, width, height);
  // grid rings
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    svg.append("circle").attr("cx", center.x).attr("cy", center.y).attr("r", maxRadius * frac)
      .attr("fill", "none").attr("stroke", "#e2e8f0");
  }
  for (const layer of plan.layers) {
    if (layer.mark === "screen-rect" || layer.mark === "screen-text") {
      drawScreenLayer(svg, layer);
    } else if (layer.mark === "polygon" || layer.mark === "line") {
      for (const prim of layer.primitives) {
        const pts = prim.points.filter(p => Number.isFinite(p.r)).map(p => toXY(p.theta, p.r).join(","));
        const el = layer.closed ? svg.append("polygon") : svg.append("polyline");
        el.attr("points", pts.join(" ")).attr("fill", layer.fill ?? "none")
          .attr("fill-opacity", layer.fill ? 0.25 : 0)
          .attr("stroke", layer.stroke)
          .attr("stroke-width", layer.width ?? 2)
          .attr("stroke-dasharray", layer.dash ? "4,3" : null)
          .attr("opacity", layer.opacity ?? 1);
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
    } else if (layer.mark === "annular-wedge" || layer.mark === "polar-quad") {
      const values = layer.primitives.map(p => p.value).filter(Number.isFinite);
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      for (const prim of layer.primitives) {
        const path = layer.mark === "polar-quad"
          ? polarQuadPath(prim, { center, rScale })
          : annularWedgePath(prim, { center, rScale });
        if (!path) continue;
        svg.append("path")
          .attr("d", path)
          .attr("fill", layer.fill ?? forceColour(prim.value, min, max))
          .attr("stroke", layer.stroke ?? "#2C3C63")
          .attr("stroke-width", 0.5)
          .attr("opacity", layer.opacity ?? 0.85);
      }
    } else if (layer.mark === "polar-point") {
      for (const prim of layer.primitives) {
        const [x, y] = toXY(prim.theta, prim.r);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        svg.append("circle")
          .attr("cx", x)
          .attr("cy", y)
          .attr("r", layer.size ?? 2)
          .attr("fill", layer.fill ?? "#5AAABF")
          .attr("stroke", layer.stroke ?? "none")
          .attr("opacity", layer.opacity ?? 1);
      }
    } else if (layer.mark === "circle") {
      for (const prim of layer.primitives) {
        svg.append("circle")
          .attr("cx", center.x)
          .attr("cy", center.y)
          .attr("r", rScale(prim.r))
          .attr("fill", layer.fill ?? "none")
          .attr("stroke", layer.stroke ?? "#e2e8f0")
          .attr("stroke-width", layer.width ?? 1)
          .attr("stroke-dasharray", layer.dash ? "4,3" : null)
          .attr("opacity", layer.opacity ?? 1);
      }
    } else if (layer.mark === "text") {
      for (const prim of layer.primitives) {
        const [x, y] = toXY(prim.theta, prim.r);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        svg.append("text")
          .attr("x", x)
          .attr("y", y)
          .attr("fill", layer.fill)
          .attr("font-size", `${layer.size ?? 10}px`)
          .attr("text-anchor", layer.anchor ?? "middle")
          .attr("dominant-baseline", layer.baseline ?? "middle")
          .attr("opacity", layer.opacity ?? 1)
          .text(prim.label ?? "");
      }
    }
  }
  const node = svg.node();
  node.probeAtPoint = (x, y) => polarProbeReadout(plan, x, y);
  node.destroy = () => {
    svg.selectAll("*").remove();
  };
  return node;
}

function drawScreenLayer(svg, layer) {
  if (layer.mark === "screen-rect") {
    for (const prim of layer.primitives ?? []) {
      svg.append("rect")
        .attr("x", prim.x)
        .attr("y", prim.y)
        .attr("width", prim.width)
        .attr("height", prim.height)
        .attr("rx", prim.rx ?? 0)
        .attr("fill", layer.fill)
        .attr("stroke", layer.stroke ?? "none")
        .attr("opacity", layer.opacity ?? 1);
    }
    return;
  }
  if (layer.mark === "screen-text") {
    for (const prim of layer.primitives ?? []) {
      svg.append("text")
        .attr("x", prim.x)
        .attr("y", prim.y)
        .attr("fill", layer.fill)
        .attr("font-size", `${layer.size ?? 10}px`)
        .attr("font-weight", layer.weight ?? "normal")
        .attr("text-anchor", layer.anchor ?? "start")
        .attr("dominant-baseline", layer.baseline ?? "middle")
        .attr("opacity", layer.opacity ?? 1)
        .text(prim.label ?? "");
    }
  }
}

function normalizeAngle(theta) {
  const twoPi = 2 * Math.PI;
  return ((theta % twoPi) + twoPi) % twoPi;
}

function angularDistance(a, b) {
  const twoPi = 2 * Math.PI;
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, twoPi - diff);
}

function averageAngle(theta0, theta1) {
  const x = Math.sin(theta0) + Math.sin(theta1);
  const y = Math.cos(theta0) + Math.cos(theta1);
  return normalizeAngle(Math.atan2(x, y));
}

function polarPointToData(plan, x, y) {
  const dx = Number(x) - plan.center.x;
  const dy = plan.center.y - Number(y);
  const radiusPx = Math.hypot(dx, dy);
  const [domainMin, domainMax] = plan.scales.r.domain;
  const radius = domainMin + radiusPx / (plan.maxRadius || 1) * (domainMax - domainMin);
  return {
    theta: normalizeAngle(Math.atan2(dx, dy)),
    r: radius,
    radiusPx
  };
}

function polarProbeReadout(plan, x, y) {
  const pointer = polarPointToData(plan, x, y);
  let best = null;
  let bestScore = Infinity;
  for (const layer of plan.layers ?? []) {
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
          const rDistance = Math.abs(pointer.r - point.r) / ((plan.scales.r.domain[1] - plan.scales.r.domain[0]) || 1);
          const aDistance = angularDistance(pointer.theta, point.theta);
          const pointScore = aDistance + rDistance;
          if (pointScore < score) {
            score = pointScore;
            tooltip = point.tooltip ?? primitive.tooltip ?? {};
          }
        }
      } else if (Number.isFinite(primitive.theta) && Number.isFinite(primitive.r)) {
        const rDistance = Math.abs(pointer.r - primitive.r) / ((plan.scales.r.domain[1] - plan.scales.r.domain[0]) || 1);
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

function annularWedgePath(prim, { center, rScale }) {
  const r0 = Math.max(0, Number(prim.r0) || 0);
  const r1 = Math.max(r0, Number(prim.r1) || 0);
  const theta0 = Number(prim.theta0);
  const theta1 = Number(prim.theta1);
  if (!Number.isFinite(theta0) || !Number.isFinite(theta1) || !(r1 > 0)) return null;
  const outerR = rScale(r1);
  const innerR = rScale(r0);
  const large = Math.abs(theta1 - theta0) > Math.PI ? 1 : 0;
  const outer0 = [
    center.x + outerR * Math.sin(theta0),
    center.y - outerR * Math.cos(theta0)
  ];
  const outer1 = [
    center.x + outerR * Math.sin(theta1),
    center.y - outerR * Math.cos(theta1)
  ];
  const inner1 = [
    center.x + innerR * Math.sin(theta1),
    center.y - innerR * Math.cos(theta1)
  ];
  const inner0 = [
    center.x + innerR * Math.sin(theta0),
    center.y - innerR * Math.cos(theta0)
  ];
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

function polarQuadPath(prim, { center, rScale }) {
  const r0 = Math.max(0, Number(prim.r0) || 0);
  const r1 = Math.max(r0, Number(prim.r1) || 0);
  const theta0 = Number(prim.theta0);
  const theta1 = Number(prim.theta1);
  if (!Number.isFinite(theta0) || !Number.isFinite(theta1) || !(r1 > 0)) return null;
  const point = (theta, radius) => [
    center.x + rScale(radius) * Math.sin(theta),
    center.y - rScale(radius) * Math.cos(theta)
  ];
  const outer0 = point(theta0, r1);
  const outer1 = point(theta1, r1);
  const inner1 = point(theta1, r0);
  const inner0 = point(theta0, r0);
  return [
    `M ${outer0.join(" ")}`,
    `L ${outer1.join(" ")}`,
    `L ${inner1.join(" ")}`,
    `L ${inner0.join(" ")}`,
    "Z"
  ].join(" ");
}

function drawDiscChart(container, plan, d3) {
  const tag = String(container?.tagName ?? "").toLowerCase();
  if (tag === "canvas") return drawDiscChartCanvas(container, plan);
  const { width, height, center, scale, discRadius } = plan;
  const toPx = (x, y) => [center.x + x * scale, center.y - y * scale]; // data y-up → screen y-down
  const svg = selectChartSvg(container, d3, width, height);

  // bounding disc
  svg.append("circle").attr("cx", center.x).attr("cy", center.y).attr("r", discRadius * scale)
    .attr("fill", "#0d1a2e").attr("stroke", "#475569").attr("stroke-width", 2);

  let particleLayer = null;
  for (const layer of plan.layers) {
    if (layer.mark === "polygon" || layer.mark === "line") {
      for (const prim of layer.primitives) {
        const pts = prim.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => toPx(p.x, p.y).join(","));
        const el = layer.closed ? svg.append("polygon") : svg.append("polyline");
        el.attr("points", pts.join(" ")).attr("fill", layer.fill ?? "none")
          .attr("fill-opacity", layer.fill ? 0.35 : 0).attr("stroke", layer.stroke).attr("stroke-width", 2);
      }
    } else if (layer.mark === "point") {
      for (const prim of layer.primitives) {
        if (!Number.isFinite(prim.x) || !Number.isFinite(prim.y)) continue;
        const [cx, cy] = toPx(prim.x, prim.y);
        const c = layer.stroke ?? "#dc2626";
        svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 5).attr("fill", "none").attr("stroke", c).attr("stroke-width", 2);
        svg.append("line").attr("x1", cx - 8).attr("y1", cy).attr("x2", cx + 8).attr("y2", cy).attr("stroke", c);
        svg.append("line").attr("x1", cx).attr("y1", cy - 8).attr("x2", cx).attr("y2", cy + 8).attr("stroke", c);
      }
    } else if (layer.mark === "particles") {
      particleLayer = layer;
    }
  }

  // animate the particle stream over its time frames. Cadence tracks wall-clock
  // (frameIndexForElapsed) so playback speed follows the axis's physical duration,
  // not the display refresh rate; only in-disc points (pre-clip) are painted.
  const node = svg.node();
  if (particleLayer && particleLayer.frames?.length) {
    const dots = svg.append("g");
    const colour = particleLayer.stroke ?? "#EC7424";
    const playback = plan.playback ?? {};
    const frames = particleLayer.frames;
    const tValues = frames.map(f => f.t);
    const draw = frame => {
      const sel = dots.selectAll("circle").data(frame.points.filter(p => p.inDisc !== false && Number.isFinite(p.x) && Number.isFinite(p.y)));
      sel.enter().append("circle").attr("r", 3).attr("fill", colour)
        .merge(sel).attr("cx", p => toPx(p.x, p.y)[0]).attr("cy", p => toPx(p.x, p.y)[1]);
      sel.exit().remove();
    };
    let playing = true;
    let destroyed = false;
    // scrubber hooks: bind a slider/drag to the time axis. Scrubbing pauses playback and
    // re-renders ONLY the dots for that frame (local rebind), by index or by axis value.
    node.scrubTo = i => { playing = false; draw(frames[Math.max(0, Math.min(frames.length - 1, i | 0))]); };
    node.scrubToValue = v => { playing = false; draw(frames[frameIndexForValue(tValues, v)]); };
    node.play = () => { playing = true; };
    node.pause = () => { playing = false; };
    node.destroy = () => {
      destroyed = true;
      svg.selectAll("*").remove();
    };
    if (frames.length === 1 || tValues[0] == null || typeof requestAnimationFrame !== "function") {
      draw(frames[0]);
    } else {
      let startTs = null;
      const step = ts => {
        if (destroyed) return;
        if (startTs == null) startTs = ts;
        if (playing) draw(frames[frameIndexForElapsed(tValues, (ts - startTs) / 1000, playback)]);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }
  if (typeof node.destroy !== "function") {
    node.destroy = () => {
      svg.selectAll("*").remove();
    };
  }
  return node;
}

function drawDiscChartCanvas(canvas, plan) {
  const { width, height, center, scale, discRadius } = plan;
  const toPx = (x, y) => [center.x + x * scale, center.y - y * scale];
  const ctx = prepareCanvas2d(canvas, width, height);

  const particleLayer = plan.layers.find(layer => layer.mark === "particles") ?? null;
  const lifterLayers = plan.layers.filter(layer => layer.mark === "lifters");
  const radialLayers = plan.layers.filter(layer => layer.mark === "radial-line");
  const staticLayers = plan.layers.filter(layer =>
    !["particles", "lifters", "radial-line"].includes(layer.mark)
  );
  const presentation = plan.presentation ?? {};
  const previousState = canvas.__discChartRuntimeState && typeof canvas.__discChartRuntimeState === "object"
    ? canvas.__discChartRuntimeState
    : {};
  let wallAngle = Number(previousState.wallAngle) || 0;
  let elapsed = Number(previousState.elapsed) || 0;

  const drawStatic = () => {
    clearCanvas(ctx, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, discRadius * scale, 0, Math.PI * 2);
    if (presentation.discBackground !== "transparent") {
      ctx.fillStyle = presentation.discBackground ?? "#0d1a2e";
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = presentation.shellStroke ?? "#64748b";
    ctx.stroke();

    for (const layer of staticLayers) {
      if (layer.mark === "polygon" || layer.mark === "line") {
        for (const prim of layer.primitives ?? []) {
          const pts = prim.points?.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => toPx(p.x, p.y)) ?? [];
          if (!pts.length) continue;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let index = 1; index < pts.length; index += 1) ctx.lineTo(pts[index][0], pts[index][1]);
          if (layer.closed) ctx.closePath();
          if (layer.fill) {
            ctx.fillStyle = layer.fill;
            ctx.globalAlpha = layer.fill ? 0.35 : 1;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.lineWidth = 2;
          ctx.strokeStyle = layer.stroke ?? "#5AAABF";
          ctx.stroke();
        }
      } else if (layer.mark === "point") {
        for (const prim of layer.primitives ?? []) {
          if (!Number.isFinite(prim.x) || !Number.isFinite(prim.y)) continue;
          const [cx, cy] = toPx(prim.x, prim.y);
          const colour = layer.stroke ?? "#dc2626";
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx + 8, cy);
          ctx.moveTo(cx, cy - 8);
          ctx.lineTo(cx, cy + 8);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  };

  const drawLifters = () => {
    for (const layer of lifterLayers) {
      const count = Math.max(0, layer.count | 0);
      const liftH = discRadius * scale * layer.height;
      const liftW = discRadius * scale * layer.width;
      for (let index = 0; index < count; index += 1) {
        const baseAngle = wallAngle + (index / count) * Math.PI * 2;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(baseAngle);
        ctx.translate(discRadius * scale - liftH / 2, 0);
        ctx.beginPath();
        ctx.rect(-liftH / 2, -liftW / 2, liftH, liftW);
        ctx.fillStyle = layer.fill ?? "#94a3b8";
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#475569";
    ctx.fill();
    ctx.restore();
  };

  const drawRadials = () => {
    for (const layer of radialLayers) {
      for (const prim of layer.primitives ?? []) {
        if (!Number.isFinite(prim.theta)) continue;
        const canvasAngle = -prim.theta;
        const ex = center.x + discRadius * scale * Math.cos(canvasAngle);
        const ey = center.y + discRadius * scale * Math.sin(canvasAngle);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = layer.stroke ?? "#fbbf24";
        ctx.lineWidth = 1.2;
        if (layer.dash) ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fillStyle = layer.stroke ?? "#fbbf24";
        ctx.fill();
        if (layer.label) {
          const off = 14;
          ctx.font = "bold 10px sans-serif";
          ctx.fillStyle = layer.stroke ?? "#fbbf24";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(layer.label, ex + Math.cos(canvasAngle) * off, ey + Math.sin(canvasAngle) * off);
        }
        ctx.restore();
      }
    }
  };

  const drawParticles = frame => {
    if (!particleLayer) return;
    ctx.save();
    ctx.fillStyle = particleLayer.stroke ?? "#EC7424";
    for (const point of frame.points?.filter(p => p.inDisc !== false && Number.isFinite(p.x) && Number.isFinite(p.y)) ?? []) {
      const [cx, cy] = toPx(point.x, point.y);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const renderFrame = frame => {
    drawStatic();
    if (frame) drawParticles(frame);
    drawLifters();
    drawRadials();
  };

  const node = canvas;
  const persistState = () => {
    canvas.__discChartRuntimeState = { wallAngle, elapsed };
  };
  if (particleLayer && particleLayer.frames?.length) {
    const playback = plan.playback ?? {};
    const frames = particleLayer.frames;
    const tValues = frames.map(f => f.t);
    renderFrame(frames[frameIndexForElapsed(tValues, elapsed, playback)] ?? frames[0] ?? null);
    persistState();
    let playing = true;
    let destroyed = false;
    let lastTs = null;
    node.scrubTo = index => {
      playing = false;
      const frameIndex = Math.max(0, Math.min(frames.length - 1, index | 0));
      elapsed = tValues[frameIndex] ?? elapsed;
      renderFrame(frames[frameIndex] ?? null);
      persistState();
    };
    node.scrubToValue = value => {
      playing = false;
      elapsed = Number(value) || 0;
      renderFrame(frames[frameIndexForValue(tValues, value)] ?? null);
      persistState();
    };
    node.play = () => { playing = true; };
    node.pause = () => { playing = false; };
    node.destroy = () => {
      destroyed = true;
      persistState();
      clearCanvas(ctx, width, height);
    };
    if (frames.length > 1 && tValues[0] != null && typeof requestAnimationFrame === "function") {
      let startTs = null;
      const step = ts => {
        if (destroyed) return;
        if (startTs == null) startTs = ts;
        const dt = lastTs == null ? 0 : Math.min((ts - lastTs) / 1000, 0.05);
        lastTs = ts;
        if (playing) {
          wallAngle -= dt * (playback.wallSpeed ?? 2.35);
          elapsed += dt;
          persistState();
          renderFrame(frames[frameIndexForElapsed(tValues, elapsed, playback)] ?? null);
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  } else {
    renderFrame(null);
    persistState();
  }
  if (typeof node.destroy !== "function") {
    node.destroy = () => clearCanvas(ctx, width, height);
  }
  return node;
}

// cool→warm ramp for force magnitude wedges
function forceColour(v, min, max) {
  const t = Math.max(0, Math.min(1, (v - min) / ((max - min) || 1)));
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(52, 236)},${lerp(76, 116)},${lerp(108, 36)})`; // #344C6C → #EC7424
}

function selectChartSvg(container, d3, width, height) {
  const tag = String(container?.tagName ?? "").toLowerCase();
  if (tag === "svg") {
    const svg = d3.select(container);
    svg.selectAll("*").remove();
    return svg
      .attr("class", "gog")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`);
  }
  d3.select(container).selectAll("svg.gog").remove();
  return d3.select(container).append("svg")
    .attr("class", "gog")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);
}

function prepareCanvas2d(canvas, width, height) {
  const dpr = globalThis.devicePixelRatio && Number.isFinite(globalThis.devicePixelRatio)
    ? globalThis.devicePixelRatio
    : 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}
