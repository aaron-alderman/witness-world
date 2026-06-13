/**
 * mill-charts.js â€” D3 chart renderers for the Mill Force Analysis module.
 *
 * All functions are pure render functions â€” no state, no DOM querying.
 * SVG coordinate system: x_svg = cx + rÂ·sin(Î¸)Â·scale,  y_svg = cy + rÂ·cos(Î¸)Â·scale
 * (note: +cos because SVG y increases downward, mill y increases upward)
 *
 * Requires D3 v7 as a global (window.d3).
 */

const TWO_PI = 2 * Math.PI;

// â”€â”€ Colour helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CSS = {
  grounded: '#5AAABF',   // --blu2
  faithful: '#EC7424',   // --ylw
  charge:   '#DCF0F5',   // --bluf
  shell:    '#f1f5f9',   // --t1
  inner:    '#94a3b8',   // --t2
  dim:      '#475569',   // --t3
  bg:       '#2C3C63',   // --dk
};

function lerp(a, b, t) { return a + (b - a) * t; }

/** Map force magnitude to a warm colour for the liner heat-map. */
function forceColour(val, min, max) {
  const t = max > min ? (val - min) / (max - min) : 0;
  // Cool (#344C6C) â†’ warm (#EC7424)
  const r = Math.round(lerp(0x34, 0xEC, t));
  const g = Math.round(lerp(0x4C, 0x74, t));
  const b = Math.round(lerp(0x6C, 0x24, t));
  return `rgb(${r},${g},${b})`;
}


// â”€â”€ Mill cross-section polar chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * initCrossSection(svgEl)
 * Call once to set up persistent D3 groups inside the SVG.
 */
export function initCrossSection(svgEl) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.append('g').attr('class', 'g-mill-geom');
  svg.append('g').attr('class', 'g-mill-liners');
  svg.append('g').attr('class', 'g-mill-forces');
  svg.append('g').attr('class', 'g-mill-annot');
  svg.append('g').attr('class', 'g-mill-legend');
  svg.append('g').attr('class', 'g-mill-mc');
}

/**
 * drawCrossSection(svgEl, comparison, opts)
 *
 * opts: {
 *   showFaithful: bool,  showGrounded: bool,
 *   mode: 'static'|'compare'|'mc',
 *   mcResults: MillResult[]|null,   // for MC overlay
 *   highlightSegment: int|null,
 * }
 */
export function drawCrossSection(svgEl, comparison, opts = {}) {
  const { showFaithful = true, showGrounded = true, mode = 'static' } = opts;

  const svg  = d3.select(svgEl);
  const W    = svgEl.clientWidth  || 600;
  const H    = svgEl.clientHeight || 600;
  const cx   = W / 2;
  const cy   = H / 2;

  const result = showGrounded ? comparison.grounded : comparison.faithful;
  const inp    = result.inputs;
  const scale  = Math.min(W, H) / 2 * 0.78 / inp.radius;

  // Coordinate helpers
  function toSVG(r, theta) {
    return [cx + r * Math.sin(theta) * scale, cy + r * Math.cos(theta) * scale];
  }
  function toSVGxy(x, y) {
    return [cx + x * scale, cy - y * scale];
  }

  const rInner  = inp.radius - inp.height;
  const phi     = result.phi;
  const phiP    = result.phi_prime;
  const gamma   = result.gamma;
  const dTheta  = TWO_PI / inp.N_segments;

  // â”€â”€ Geometry layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const gGeom = svg.select('.g-mill-geom');
  gGeom.selectAll('*').remove();

  // Shell circle
  gGeom.append('circle')
    .attr('cx', cx).attr('cy', cy)
    .attr('r', inp.radius * scale)
    .attr('fill', 'none')
    .attr('stroke', CSS.shell)
    .attr('stroke-width', 1.5);

  // Inner radius (dashed)
  gGeom.append('circle')
    .attr('cx', cx).attr('cy', cy)
    .attr('r', rInner * scale)
    .attr('fill', 'none')
    .attr('stroke', CSS.inner)
    .attr('stroke-width', 0.8)
    .attr('stroke-dasharray', '4,3');

  // Charge region (arc from phiP to phi at outer radius, shaded)
  const arcCharge = d3.arc()
    .innerRadius(rInner * scale)
    .outerRadius(inp.radius * scale)
    .startAngle(-(phi - Math.PI))       // D3 arc uses clock angle: 0=up, CW
    .endAngle(-(phiP - Math.PI));       // Adjust for our CCW convention
  gGeom.append('path')
    .attr('d', arcCharge())
    .attr('transform', `translate(${cx},${cy})`)
    .attr('fill', CSS.charge)
    .attr('fill-opacity', 0.35)
    .attr('stroke', CSS.grounded)
    .attr('stroke-width', 0.6)
    .attr('stroke-opacity', 0.5);

  // Fill chord line
  const [fcx1, fcy1] = toSVG(rInner, phi);
  const [fcx2, fcy2] = toSVG(rInner, phiP);
  gGeom.append('line')
    .attr('x1', fcx1).attr('y1', fcy1)
    .attr('x2', fcx2).attr('y2', fcy2)
    .attr('stroke', CSS.grounded)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '5,3')
    .attr('stroke-opacity', 0.8);

  // Shoulder angle marker
  const [sx, sy] = toSVG(inp.radius * 1.06, phi);
  gGeom.append('line')
    .attr('x1', cx).attr('y1', cy)
    .attr('x2', toSVG(inp.radius, phi)[0])
    .attr('y2', toSVG(inp.radius, phi)[1])
    .attr('stroke', CSS.shell).attr('stroke-width', 0.8)
    .attr('stroke-dasharray', '3,3').attr('stroke-opacity', 0.6);
  gGeom.append('text')
    .attr('x', sx).attr('y', sy)
    .attr('fill', CSS.shell).attr('font-size', 10)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .text('Ï†');

  // Toe angle marker
  const [tx2, ty2] = toSVG(inp.radius * 1.06, phiP);
  gGeom.append('line')
    .attr('x1', cx).attr('y1', cy)
    .attr('x2', toSVG(inp.radius, phiP)[0])
    .attr('y2', toSVG(inp.radius, phiP)[1])
    .attr('stroke', CSS.inner).attr('stroke-width', 0.8)
    .attr('stroke-dasharray', '3,3').attr('stroke-opacity', 0.6);
  gGeom.append('text')
    .attr('x', tx2).attr('y', ty2)
    .attr('fill', CSS.inner).attr('font-size', 10)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .text("Ï†'");

  // Cardinal labels â€” standard convention: 0Â°=East, 90Â°=top, 180Â°=West, 270Â°=bottom
  const cardinals = [[0, '270Â°'], [Math.PI / 2, '0Â°'], [Math.PI, '90Â°'], [3 * Math.PI / 2, '180Â°']];
  cardinals.forEach(([a, lbl]) => {
    const [lx, ly] = toSVG(inp.radius * 1.13, a);
    gGeom.append('text')
      .attr('x', lx).attr('y', ly)
      .attr('fill', CSS.dim).attr('font-size', 9)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .text(lbl);
  });

  // Rotation arrow (CCW) â€” small arc in top-right quadrant
  const arrowR = inp.radius * 0.45 * scale;
  const arrowArc = d3.arc()
    .innerRadius(arrowR - 3).outerRadius(arrowR + 3)
    .startAngle(-0.8).endAngle(0.8);
  gGeom.append('path')
    .attr('d', arrowArc())
    .attr('transform', `translate(${cx},${cy})`)
    .attr('fill', CSS.dim).attr('fill-opacity', 0.5);
  // Arrow head
  const [ahx, ahy] = [cx + arrowR * Math.sin(-0.8), cy + arrowR * Math.cos(-0.8)];
  gGeom.append('polygon')
    .attr('points', `${ahx},${ahy - 5} ${ahx + 4},${ahy + 3} ${ahx - 4},${ahy + 3}`)
    .attr('fill', CSS.dim).attr('fill-opacity', 0.5)
    .attr('transform', `rotate(-46,${ahx},${ahy})`);

  // â”€â”€ Liner heat-map layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const gLiners = svg.select('.g-mill-liners');
  gLiners.selectAll('*').remove();

  const allF = result.segments.map(s => s.F_resultant);
  const minF = Math.min(...allF), maxF = Math.max(...allF);

  result.segments.forEach(seg => {
    const t1 = seg.t1, t2 = seg.t2;
    if (Math.abs(t1 - t2) < 1e-12) return;
    const col = forceColour(seg.F_resultant, minF, maxF);
    // Liner arc at shell
    const arcLiner = d3.arc()
      .innerRadius((inp.radius - inp.height) * scale)
      .outerRadius(inp.radius * scale)
      .startAngle(-(t1 - Math.PI))
      .endAngle(-(t2 - Math.PI));
    gLiners.append('path')
      .attr('d', arcLiner())
      .attr('transform', `translate(${cx},${cy})`)
      .attr('fill', col)
      .attr('stroke', CSS.bg)
      .attr('stroke-width', 0.5)
      .attr('data-seg', seg.segment);
  });

  // â”€â”€ Force bar layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const gForces = svg.select('.g-mill-forces');
  gForces.selectAll('*').remove();

  const maxFrAll = Math.max(
    ...comparison.faithful.segments.map(s => Math.abs(s.F_r)),
    ...comparison.grounded.segments.map(s => Math.abs(s.F_r)),
    1,
  );
  const barMaxLen = inp.radius * 0.55;  // max bar length in mill-coords

  function drawBars(segs, colour, offset) {
    segs.forEach(seg => {
      if (seg.m_charge < 1e-6) return;
      const barLen = Math.abs(seg.F_r) / maxFrAll * barMaxLen;
      if (barLen < 0.01) return;
      const tMid   = 0.5 * (seg.t1 + seg.t2);
      const rOuter = rInner - offset * 0.08;
      const rInBar = rOuter - barLen;
      const hw = dTheta * 0.25;  // half angular width of bar
      // Build a simple radial rectangle as a path
      const corners = [
        toSVG(rOuter, tMid - hw),
        toSVG(rOuter, tMid + hw),
        toSVG(Math.max(0, rInBar), tMid + hw),
        toSVG(Math.max(0, rInBar), tMid - hw),
      ];
      const d = corners.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
      gForces.append('path')
        .attr('d', d)
        .attr('fill', colour)
        .attr('fill-opacity', 0.82)
        .attr('stroke', 'none');
    });
  }

  if (showGrounded) drawBars(comparison.grounded.segments, CSS.grounded, 0);
  if (showFaithful) drawBars(comparison.faithful.segments, CSS.faithful, 1);

  // â”€â”€ MC overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (mode === 'mc' && opts.mcResults && opts.mcResults.length > 1) {
    _drawMCBands(svg.select('.g-mill-mc'), opts.mcResults, inp, scale, cx, cy, toSVG, rInner, dTheta, maxFrAll, barMaxLen);
  } else {
    svg.select('.g-mill-mc').selectAll('*').remove();
  }

  // â”€â”€ Legend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const gLeg = svg.select('.g-mill-legend');
  gLeg.selectAll('*').remove();

  const lx = W - 110, ly = H - 80;

  if (showGrounded && showFaithful) {
    [[CSS.grounded, 'Grounded'], [CSS.faithful, 'Faithful']].forEach(([col, lbl], i) => {
      gLeg.append('rect').attr('x', lx).attr('y', ly + i * 18).attr('width', 12).attr('height', 8)
        .attr('fill', col).attr('fill-opacity', 0.82);
      gLeg.append('text').attr('x', lx + 16).attr('y', ly + i * 18 + 7)
        .attr('fill', CSS.inner).attr('font-size', 10).text(lbl);
    });
  }

  // Force colour scale (5 swatches)
  const scaleX = 16, scaleY = ly - 80, scaleH = 60, swH = scaleH / 5;
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    gLeg.append('rect').attr('x', scaleX).attr('y', scaleY + i * swH).attr('width', 10).attr('height', swH)
      .attr('fill', forceColour(lerp(minF, maxF, 1 - t), minF, maxF));
  }
  gLeg.append('text').attr('x', scaleX + 13).attr('y', scaleY + 6)
    .attr('fill', CSS.inner).attr('font-size', 9).text(`${(maxF / 1000).toFixed(0)} kN`);
  gLeg.append('text').attr('x', scaleX + 13).attr('y', scaleY + scaleH)
    .attr('fill', CSS.inner).attr('font-size', 9).text(`${(minF / 1000).toFixed(0)} kN`);
  gLeg.append('text').attr('x', scaleX).attr('y', scaleY - 4)
    .attr('fill', CSS.dim).attr('font-size', 9).text('|F|');
}

function _drawMCBands(gMC, mcResults, inp, scale, cx, cy, toSVG, rInner, dTheta, maxFrAll, barMaxLen) {
  gMC.selectAll('*').remove();
  const N = inp.N_segments;

  for (let idx = 0; idx < N; idx++) {
    const F_rs = mcResults.map(r => r.segments[idx]?.F_r ?? 0).sort((a, b) => a - b);
    if (F_rs.every(v => v === 0)) continue;

    const p10 = _pct(F_rs, 0.1), p90 = _pct(F_rs, 0.9);
    const seg  = mcResults[0].segments[idx];
    const tMid = 0.5 * (seg.t1 + seg.t2);
    const hw   = dTheta * 0.35;

    const barL10 = Math.abs(p10) / maxFrAll * barMaxLen;
    const barL90 = Math.abs(p90) / maxFrAll * barMaxLen;

    // P90 band (outer, wider, semi-transparent)
    if (barL90 > 0.01) {
      const r90 = rInner - barL90;
      const c90 = [
        toSVG(rInner, tMid - hw), toSVG(rInner, tMid + hw),
        toSVG(Math.max(0, r90), tMid + hw), toSVG(Math.max(0, r90), tMid - hw),
      ];
      gMC.append('path')
        .attr('d', c90.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z')
        .attr('fill', CSS.grounded).attr('fill-opacity', 0.15)
        .attr('stroke', CSS.grounded).attr('stroke-opacity', 0.4).attr('stroke-width', 0.5);
    }

    // P10 band (inner, solid line)
    if (barL10 > 0.01) {
      const r10 = rInner - barL10;
      const [ax, ay] = toSVG(r10, tMid);
      gMC.append('circle').attr('cx', ax).attr('cy', ay).attr('r', 2)
        .attr('fill', CSS.grounded).attr('fill-opacity', 0.5);
    }
  }
}

function _pct(sorted, p) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i);
  return sorted[lo] + (sorted[lo + 1] ?? sorted[lo]) * (i - lo);
}


// â”€â”€ Force vs Angle (Cartesian) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function initForceAngleChart(svgEl) {
  d3.select(svgEl).selectAll('*').remove();
}

/**
 * Physical display angle for a segment: Î¸=0 (6-o'clock) maps to x=180Â°,
 * so 0Â° is the centre of the chart. Returns value in [0, 360].
 */
function _physDispDeg(segNum, phi, dTheta) {
  const raw = phi - dTheta * (segNum - 0.5);
  const deg = (((raw * 180 / Math.PI) % 360) + 360) % 360;
  return (deg + 180) % 360;
}

export function drawForceAngleChart(svgEl, comparison, opts = {}) {
  const { showFaithful = true, showGrounded = true, tipEl = null } = opts;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const W = svgEl.clientWidth  || 600;
  const H = svgEl.clientHeight || 400;
  const margin = { top: 20, right: 130, bottom: 48, left: 65 };
  const w = W - margin.left - margin.right;
  const h = H - margin.top  - margin.bottom;

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Physical display angles â€” same for both models (same phi and N_segments)
  const phi    = comparison.grounded.phi;
  const dTheta = TWO_PI / comparison.grounded.inputs.N_segments;
  const pdisp  = seg => _physDispDeg(seg.segment, phi, dTheta);

  // Sort segments by display angle to avoid wrap-around in the line path
  const gSegs = [...comparison.grounded.segments].sort((a, b) => pdisp(a) - pdisp(b));
  const fSegs = [...comparison.faithful.segments].sort((a, b) => pdisp(a) - pdisp(b));

  const allSegs = [
    ...(showGrounded ? gSegs : []),
    ...(showFaithful ? fSegs : []),
  ];
  const allF = allSegs.flatMap(s => [s.F_r, s.F_t, s.F_resultant]).filter(isFinite);
  const yMin = Math.min(0, ...allF) / 1000;
  const yMax = Math.max(...allF) / 1000;

  const xSc = d3.scaleLinear().domain([0, 360]).range([0, w]);
  const ySc = d3.scaleLinear().domain([yMin * 1.1, yMax * 1.1]).range([h, 0]);

  // Charge zone: phiPrime â†’ phi in display coords (both shifted by +180Â°)
  const toDeg = r => (((r * 180 / Math.PI) % 360) + 360) % 360;
  const zd1 = (toDeg(comparison.grounded.phi_prime) + 180) % 360;
  const zd2 = (toDeg(phi) + 180) % 360;
  g.append('rect')
    .attr('x', xSc(Math.min(zd1, zd2))).attr('y', 0)
    .attr('width', Math.max(0, Math.abs(xSc(zd2) - xSc(zd1)))).attr('height', h)
    .attr('fill', CSS.charge).attr('fill-opacity', 0.12);

  // Zero line
  g.append('line').attr('x1', 0).attr('x2', w)
    .attr('y1', ySc(0)).attr('y2', ySc(0))
    .attr('stroke', CSS.dim).attr('stroke-width', 0.5).attr('stroke-dasharray', '4,4');

  const lineGen = key => d3.line()
    .x(s => xSc(pdisp(s)))
    .y(s => ySc(s[key] / 1000))
    .defined(s => isFinite(s[key]));

  const seriesDefs = [
    { key: 'F_r',         label: 'F_r',  colour: '#5AAABF' },
    { key: 'F_t',         label: 'F_t',  colour: '#94a3b8' },
    { key: 'F_resultant', label: '|F|',  colour: '#f1f5f9' },
  ];

  if (showGrounded) {
    seriesDefs.forEach(({ key, colour }) => {
      g.append('path').datum(gSegs).attr('d', lineGen(key))
        .attr('fill', 'none')
        .attr('stroke', colour).attr('stroke-width', 1.8).attr('stroke-opacity', 0.85);
    });
  }
  if (showFaithful) {
    seriesDefs.forEach(({ key, colour }) => {
      g.append('path').datum(fSegs).attr('d', lineGen(key))
        .attr('fill', 'none')
        .attr('stroke', colour).attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '5,3').attr('stroke-opacity', 0.65);
    });
  }

  // Crosshair (hidden initially)
  const crosshair = g.append('line')
    .attr('y1', 0).attr('y2', h)
    .attr('stroke', '#fff').attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3').attr('stroke-opacity', 0.35)
    .style('display', 'none').style('pointer-events', 'none');

  // Axes â€” tick labels in standard convention (0Â°=East): display offset is 270Â° from standard 0Â°
  const xAxis = d3.axisBottom(xSc)
    .tickValues([0, 45, 90, 135, 180, 225, 270, 315, 360])
    .tickFormat(d => `${((d - 270 + 360) % 360).toFixed(0)}Â°`);
  const yAxis = d3.axisLeft(ySc).ticks(6).tickFormat(d => `${d.toFixed(0)}`);

  const xAxisG = g.append('g').attr('transform', `translate(0,${h})`).call(xAxis);
  xAxisG.selectAll('text').attr('fill', CSS.inner).attr('font-size', 10);
  xAxisG.selectAll('line,path').attr('stroke', CSS.dim);

  const yAxisG = g.append('g').call(yAxis);
  yAxisG.selectAll('text').attr('fill', CSS.inner).attr('font-size', 10);
  yAxisG.selectAll('line,path').attr('stroke', CSS.dim);

  g.append('text').attr('x', w / 2).attr('y', h + 38)
    .attr('fill', CSS.inner).attr('font-size', 11).attr('text-anchor', 'middle')
    .text('Î¸ (Â°, standard â€” 0Â° = East)');
  g.append('text').attr('transform', 'rotate(-90)')
    .attr('y', -52).attr('x', -h / 2)
    .attr('fill', CSS.inner).attr('font-size', 11).attr('text-anchor', 'middle').text('Force (kN)');

  // Legend â€” right margin, series names + model style key
  const legX = w + 12, legY = 16;
  seriesDefs.forEach(({ label, colour }, i) => {
    g.append('line').attr('x1', legX).attr('x2', legX + 18)
      .attr('y1', legY + i * 20 + 5).attr('y2', legY + i * 20 + 5)
      .attr('stroke', colour).attr('stroke-width', 2.5);
    g.append('text').attr('x', legX + 22).attr('y', legY + i * 20 + 9)
      .attr('fill', CSS.shell).attr('font-size', 11).text(label);
  });
  if (showGrounded && showFaithful) {
    const ny = legY + seriesDefs.length * 20 + 12;
    g.append('line').attr('x1', legX).attr('x2', legX + 14)
      .attr('y1', ny + 4).attr('y2', ny + 4)
      .attr('stroke', CSS.shell).attr('stroke-width', 2);
    g.append('text').attr('x', legX + 18).attr('y', ny + 8)
      .attr('fill', CSS.shell).attr('font-size', 10).text('grounded');
    g.append('line').attr('x1', legX).attr('x2', legX + 14)
      .attr('y1', ny + 18).attr('y2', ny + 18)
      .attr('stroke', CSS.shell).attr('stroke-width', 1.5).attr('stroke-dasharray', '4,2');
    g.append('text').attr('x', legX + 18).attr('y', ny + 22)
      .attr('fill', CSS.shell).attr('font-size', 10).text('faithful');
  }

  // Mouse interaction
  if (tipEl) {
    const refSegs = showGrounded ? gSegs : fSegs;
    g.append('rect')
      .attr('x', 0).attr('y', 0).attr('width', w).attr('height', h)
      .attr('fill', 'transparent')
      .on('mousemove', function(event) {
        const [mx] = d3.pointer(event);
        const xDeg = xSc.invert(mx);
        let best = null, bestDist = Infinity;
        refSegs.forEach(s => {
          const d = Math.abs(pdisp(s) - xDeg);
          const dw = Math.min(d, 360 - d);
          if (dw < bestDist) { bestDist = dw; best = s; }
        });
        if (!best) return;
        const sx = xSc(pdisp(best));
        crosshair.attr('x1', sx).attr('x2', sx).style('display', null);
        const gSeg = comparison.grounded.segments[best.segment - 1];
        const fSeg = comparison.faithful.segments[best.segment - 1];
        const stdDeg = ((pdisp(best) - 270 + 360) % 360).toFixed(1);
        tipEl.style.display = 'block';
        tipEl.style.left = `${margin.left + sx + 8}px`;
        tipEl.style.top  = `${event.offsetY - 10}px`;
        tipEl.innerHTML = `
          <div style="font-weight:600;margin-bottom:3px">Liner #${best.segment} &nbsp;Î¸=${stdDeg}Â°</div>
          ${showGrounded ? `<div style="color:var(--blue)">Grounded</div>
            <div>F_r=${(gSeg.F_r/1000).toFixed(2)} &nbsp;F_t=${(gSeg.F_t/1000).toFixed(2)} &nbsp;|F|=${(gSeg.F_resultant/1000).toFixed(2)} kN</div>` : ''}
          ${showFaithful ? `<div style="color:var(--ylw)">Faithful</div>
            <div>F_r=${(fSeg.F_r/1000).toFixed(2)} &nbsp;F_t=${(fSeg.F_t/1000).toFixed(2)} &nbsp;|F|=${(fSeg.F_resultant/1000).toFixed(2)} kN</div>` : ''}`;
      })
      .on('mouseleave', () => {
        crosshair.style('display', 'none');
        tipEl.style.display = 'none';
      });
  }
}


// â”€â”€ Polar Force Rose â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function drawForceRose(svgEl, comparison, opts = {}) {
  const { showFaithful = true, showGrounded = true, tipEl = null } = opts;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const W = svgEl.clientWidth || 500, H = svgEl.clientHeight || 500;
  const cx = W / 2, cy = H / 2;

  const allF = [
    ...(showGrounded ? comparison.grounded.segments.map(s => s.F_resultant) : []),
    ...(showFaithful ? comparison.faithful.segments.map(s => s.F_resultant) : []),
  ];
  const maxF = Math.max(...allF, 1);
  const rMax = Math.min(W, H) / 2 * 0.78;

  // Grid rings
  for (const t of [0.25, 0.5, 0.75, 1.0]) {
    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', rMax * t)
      .attr('fill', 'none').attr('stroke', CSS.dim).attr('stroke-width', 0.5).attr('stroke-opacity', 0.5);
    svg.append('text').attr('x', cx + rMax * t + 3).attr('y', cy)
      .attr('fill', CSS.dim).attr('font-size', 8).attr('dominant-baseline', 'middle')
      .text(`${(maxF * t / 1000).toFixed(0)}k`);
  }

  // Cardinal labels â€” standard convention: 0Â°=East, 90Â°=top, 180Â°=West, 270Â°=bottom
  const cardDeg = [[0,'270Â°'],[90,'0Â°'],[180,'90Â°'],[270,'180Â°']];
  cardDeg.forEach(([deg, lbl]) => {
    const th = deg * Math.PI / 180;
    svg.append('text')
      .attr('x', cx + (rMax + 12) * Math.sin(th))
      .attr('y', cy + (rMax + 12) * Math.cos(th))
      .attr('fill', CSS.dim).attr('font-size', 9)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .text(lbl);
  });

  function rosePolygon(segs, phi, dTheta, colour, opacity) {
    // Sort by physical angle so the polygon traces the circle correctly
    const sorted = [...segs].sort((a, b) => {
      const pa = phi - dTheta * (a.segment - 0.5);
      const pb = phi - dTheta * (b.segment - 0.5);
      return pa - pb;
    });
    const points = sorted.map(s => {
      const physAngle = phi - dTheta * (s.segment - 0.5);
      const r = s.F_resultant / maxF * rMax;
      return `${(cx + r * Math.sin(physAngle)).toFixed(1)},${(cy + r * Math.cos(physAngle)).toFixed(1)}`;
    });
    points.push(points[0]);
    svg.append('polygon')
      .attr('points', points.join(' '))
      .attr('fill', colour).attr('fill-opacity', opacity * 0.25)
      .attr('stroke', colour).attr('stroke-width', 1.5).attr('stroke-opacity', opacity);
  }

  const gRes = comparison.grounded, fRes = comparison.faithful;
  const gDT = TWO_PI / gRes.inputs.N_segments, fDT = TWO_PI / fRes.inputs.N_segments;

  if (showGrounded) rosePolygon(gRes.segments, gRes.phi, gDT, CSS.grounded, 0.9);
  if (showFaithful) rosePolygon(fRes.segments, fRes.phi, fDT, CSS.faithful, 0.7);

  // Centre dot + label
  svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 3).attr('fill', CSS.dim);
  svg.append('text').attr('x', cx).attr('y', cy - rMax - 8)
    .attr('fill', CSS.inner).attr('font-size', 11).attr('text-anchor', 'middle')
    .text('|F| Force Rose (per liner)');

  // Mouse tooltip
  if (tipEl) {
    const refRes = showGrounded ? gRes : fRes;
    const refDT  = showGrounded ? gDT : fDT;
    svg.append('rect')
      .attr('x', 0).attr('y', 0).attr('width', W).attr('height', H)
      .attr('fill', 'transparent')
      .on('mousemove', function(event) {
        const [ex, ey] = d3.pointer(event);
        const dx = ex - cx, dy = ey - cy;
        const mouseAngle = Math.atan2(dx, dy);  // Î¸=0 at bottom, SVG convention
        const mouseNorm = ((mouseAngle % TWO_PI) + TWO_PI) % TWO_PI;

        let best = null, bestDist = Infinity;
        refRes.segments.forEach(s => {
          const physAngle = refRes.phi - refDT * (s.segment - 0.5);
          const norm = ((physAngle % TWO_PI) + TWO_PI) % TWO_PI;
          const diff = Math.abs(mouseNorm - norm);
          const d = Math.min(diff, TWO_PI - diff);
          if (d < bestDist) { bestDist = d; best = s; }
        });
        if (!best || bestDist > refDT * 0.7) { tipEl.style.display = 'none'; return; }

        const gSeg = comparison.grounded.segments[best.segment - 1];
        const fSeg = comparison.faithful.segments[best.segment - 1];
        const physAngle = refRes.phi - refDT * (best.segment - 0.5);
        const millDeg = (((physAngle * 180 / Math.PI) % 360) + 360) % 360;
        const stdDeg  = ((millDeg - 90) + 360) % 360;
        tipEl.style.display = 'block';
        tipEl.style.left = `${ex + 10}px`;
        tipEl.style.top  = `${ey - 10}px`;
        tipEl.innerHTML = `
          <div style="font-weight:600;margin-bottom:3px">Liner #${best.segment} &nbsp;Î¸=${stdDeg.toFixed(1)}Â°</div>
          ${showGrounded ? `<div style="color:var(--blue)">Grounded  |F|=${(gSeg.F_resultant/1000).toFixed(2)} kN</div>` : ''}
          ${showFaithful ? `<div style="color:var(--ylw)">Faithful  |F|=${(fSeg.F_resultant/1000).toFixed(2)} kN</div>` : ''}`;
      })
      .on('mouseleave', () => { tipEl.style.display = 'none'; });
  }
}


// â”€â”€ MC P10/P90 overlay on cross-section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function drawMCOverlay(svgEl, comparison, mcResults, opts = {}) {
  // Fully re-draw with MC results baked in
  drawCrossSection(svgEl, comparison, { ...opts, mode: 'mc', mcResults });
}


