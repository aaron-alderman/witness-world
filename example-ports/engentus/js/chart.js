/**
 * chart.js — D3 Goodman fatigue diagram.
 *
 * Exports live bindings for xSc, ySc, gMain, MAR so that canvas.js
 * and windows.js can read the current scale without circular imports.
 *
 * d3 is loaded as a CDN global; no explicit import needed.
 */
import { SN_ND, LIFETIME_MONTHS, BAND_FILL, BAND_STROKE,
         sn_hannover, months_to_cycles, goodman_sa,
         miner_dpc, sigma_a_equiv, sn_life_cycles,
         bolt_static_point, params_nominal } from './physics.js';
import { mulberry32, withRng, sampleBoltParams } from './sampling.js';
import { getState } from './store.js';
import bus from './bus.js';

export const MAR = { top:26, right:42, bottom:52, left:64 };
export const N_PTS = 400;

// Live bindings — mutated by initChart(), read by canvas.js via import.
export let W = 0, H = 0;
export let xSc = null, ySc = null, gMain = null;

// ── Chart initialisation ──────────────────────────────────────────────
export function initChart() {
  const el = document.getElementById('chart-wrap');
  W = el.clientWidth  - MAR.left - MAR.right;
  H = el.clientHeight - MAR.top  - MAR.bottom;
  if (W <= 0 || H <= 0) return;
  const svg = d3.select('#chart-svg')
    .attr('width',  el.clientWidth)
    .attr('height', el.clientHeight);
  svg.selectAll('*').remove();
  gMain = svg.append('g').attr('transform', `translate(${MAR.left},${MAR.top})`);
  xSc = d3.scaleLinear().domain([0, 650]).range([0, W]);
  ySc = d3.scaleLinear().domain([0, 120]).range([H, 0]);
  svg.append('defs').append('clipPath').attr('id','cp')
    .append('rect').attr('width', W).attr('height', H);
  ['grid','bands','cloud','glines','yield','slip','curves','probe','axes','user-annot','annot']
    .forEach(id => gMain.append('g').attr('id','g-'+id)
      .attr('clip-path', !['axes','user-annot','annot'].includes(id) ? 'url(#cp)' : null));
  // Axis labels (IDs allow dynamic text updates)
  const al = gMain.select('#g-annot');
  al.append('text').attr('id','lbl-x')
    .attr('x', W/2).attr('y', H+42).attr('text-anchor','middle')
    .attr('font-size','12px').attr('fill','#64748b');
  al.append('text').attr('id','lbl-y')
    .attr('transform','rotate(-90)').attr('x',-H/2).attr('y',-52)
    .attr('text-anchor','middle').attr('font-size','12px').attr('fill','#64748b');
  al.append('text').attr('id','lbl-title')
    .attr('x', W/2).attr('y',-10).attr('text-anchor','middle')
    .attr('font-size','13px').attr('font-weight','600').attr('fill','#0f172a')
    .attr('data-editable','title');
  // Hover rect
  gMain.append('rect').attr('width',W).attr('height',H).attr('fill','transparent')
    .on('mousemove', onChartHover)
    .on('mouseleave', () => d3.select('#chart-tip').style('opacity',0));
  bus.emit('chart:ready');
}

// ── Full chart redraw ─────────────────────────────────────────────────
export function drawStaticChart() {
  if (!xSc) return;
  const s  = getState();
  const sv = s.staticView;
  const bs = s.boltSets;
  const ce = s.chartEdit || {};
  const isMC = s.ui.mode === 'mc';
  const { F_alt_applied_N, rpm, sigma_lim, m_slope, probe } = sv;

  // Always update labels
  const titleEl = gMain.select('#lbl-title');
  if (!titleEl.empty()) {
    titleEl.text(ce.title || '').attr('font-size', (ce.titleSize||13)+'px');
    gMain.select('#lbl-x').text(ce.xLabel || '').attr('font-size', (ce.axisSize||12)+'px');
    gMain.select('#lbl-y').text(ce.yLabel || '').attr('font-size', (ce.axisSize||12)+'px');
  }

  // Lifetime fatigue limits
  const lifetime_data = LIFETIME_MONTHS
    .map(mo => ({ mo, fl: sn_hannover(months_to_cycles(mo, rpm), sigma_lim, m_slope) }))
    .sort((a, b) => a.fl - b.fl);
  const fl_arr = lifetime_data.map(d => d.fl);
  const mo_arr = lifetime_data.map(d => d.mo);

  // Y-scale domain (always set — MC dots need it)
  const bsArr = Object.values(bs).filter(b => b.visible);
  const curves = bsArr.map(b => genCurve(b.params, F_alt_applied_N));
  const allSa  = curves.flatMap(c => c.map(p => p.sigma_a)).filter(v => isFinite(v));
  const maxY   = Math.max(...allSa, fl_arr[fl_arr.length-1]*1.8, 80);
  ySc.domain([0, (isFinite(maxY) ? maxY : 80) * 1.12]);

  // Axes (always)
  const axG = gMain.select('#g-axes'); axG.selectAll('*').remove();
  axG.append('g').attr('class','axis').attr('transform',`translate(0,${H})`)
    .call(d3.axisBottom(xSc).ticks(8));
  axG.append('g').attr('class','axis').call(d3.axisLeft(ySc).ticks(7));
  axG.selectAll('.axis .domain').attr('stroke','#cbd5e1');
  axG.selectAll('.axis .tick line').attr('stroke','#e2e8f0');
  axG.selectAll('.axis text').attr('fill','#64748b').attr('font-size','11px');

  // Grid (respecting showGrid flag; always render in all modes)
  const grG = gMain.select('#g-grid'); grG.selectAll('*').remove();
  if (ce.showGrid !== false) {
    grG.append('g').attr('transform',`translate(0,${H})`)
      .call(d3.axisBottom(xSc).ticks(8).tickSize(-H).tickFormat(''))
      .call(g=>{g.select('.domain').remove();g.selectAll('line').attr('stroke','#f1f5f9').attr('stroke-width','1')});
    grG.append('g').call(d3.axisLeft(ySc).ticks(7).tickSize(-W).tickFormat(''))
      .call(g=>{g.select('.domain').remove();g.selectAll('line').attr('stroke','#f1f5f9').attr('stroke-width','1')});
  }

  // ── Goodman bands ─────────────────────────────────────────────────
  const UTS_BG = 1040, YS_BG = 600;   // nominal M48 bolt properties for background diagram
  const xs = d3.range(N_PTS+1).map(i => 650*i/N_PTS);
  const limitFns = fl_arr.map(fl => x => Math.max(0, goodman_sa(x, fl, UTS_BG, YS_BG)));
  const yieldFn  = x => Math.max(0, YS_BG - x);
  const bands = [
    xs.map(x => ({ x, y0: 0,                      y1: limitFns[0](x) })),
    ...fl_arr.slice(0,-1).map((_,i) =>
      xs.map(x => ({ x, y0: limitFns[i](x),      y1: limitFns[i+1](x) }))),
    xs.map(x => ({ x, y0: limitFns[fl_arr.length-1](x), y1: yieldFn(x) })),
  ];
  const areaFn = d3.area()
    .x(d => xSc(d.x)).y0(d => ySc(Math.min(d.y0, ySc.domain()[1])))
    .y1(d => ySc(Math.min(d.y1, ySc.domain()[1])))
    .defined(d => d.y1 >= d.y0).curve(d3.curveMonotoneX);
  const bFills   = ce.bandFills   || BAND_FILL;
  const bStrokes = ce.bandStrokes || BAND_STROKE;
  const bdG = gMain.select('#g-bands'); bdG.selectAll('*').remove();
  bands.forEach((bd, i) => {
    bdG.append('path').datum(bd).attr('d', areaFn)
      .attr('fill', bFills[i]||'#fca5a5').attr('opacity', .72)
      .attr('data-editable', `band-${i}`).style('cursor','default');
  });

  // ── Goodman lines ──────────────────────────────────────────────────
  const glG = gMain.select('#g-glines'); glG.selectAll('*').remove();
  fl_arr.forEach((fl, i) => {
    const pts = xs.map(x => ({ x, y: goodman_sa(x, fl, UTS_BG, YS_BG) }));
    glG.append('path').datum(pts)
      .attr('d', d3.line().x(d=>xSc(d.x)).y(d=>ySc(d.y)).defined(d=>d.y>=0))
      .attr('fill','none').attr('stroke', bStrokes[i+1]||'#fbbf24')
      .attr('stroke-width',1.2).attr('stroke-dasharray','5 3').attr('opacity',.9);
  });

  // ── Yield line (600 MPa nominal) ───────────────────────────────────
  const ylG = gMain.select('#g-yield'); ylG.selectAll('*').remove();
  const YS   = 600;  // nominal yield stress MPa for background line
  const ylPts = d3.range(201).map(i => ({ x: YS*i/200, y: YS-YS*i/200 }));
  ylG.append('path').datum(ylPts)
    .attr('d', d3.line().x(d=>xSc(d.x)).y(d=>ySc(d.y)).defined(d=>d.y>=0))
    .attr('fill','none').attr('stroke','#7c3aed').attr('stroke-width',1.5).attr('stroke-dasharray','7 4');
  ylG.append('text')
    .attr('transform',`translate(${xSc(YS*.38)},${ySc(YS*.62)}) rotate(-42)`)
    .attr('text-anchor','middle').attr('font-size','9.5px').attr('fill','#7c3aed').attr('opacity',.7)
    .text('Yield boundary');

  // ── Slip thresholds ────────────────────────────────────────────────
  // Preload level above which friction carries all shear (joint locks up).
  const slG = gMain.select('#g-slip'); slG.selectAll('*').remove();
  bsArr.filter(b => b.visible).forEach(b => {
    const p0 = params_nominal(b.params);
    const F_pb = F_alt_applied_N / p0.n_bolts * p0.angular_span_factor;
    const st   = p0.mu_joint > 0
      ? F_pb / (p0.mu_joint * 1e6 * p0.A_s_nom * p0.n_interfaces)
      : Infinity;
    if (isFinite(st) && st > 0 && st < 660) {
      const x = xSc(st);
      slG.append('line').attr('x1',x).attr('x2',x).attr('y1',0).attr('y2',H)
        .attr('stroke',b.color).attr('stroke-width',1).attr('stroke-dasharray','3 3').attr('opacity',.4);
      slG.append('text').attr('x',x+3).attr('y',H-5).attr('font-size','9px')
        .attr('fill',b.color).attr('opacity',.7).text('▲slip');
    }
  });

  // ── Response curves ────────────────────────────────────────────────
  const cvG = gMain.select('#g-curves'); cvG.selectAll('*').remove();
  const lineGen = d3.line()
    .defined(d => isFinite(d.sigma_a) && isFinite(d.sigma_m))
    .x(d => xSc(d.sigma_m)).y(d => ySc(d.sigma_a))
    .curve(d3.curveLinear);
  bsArr.filter(b => b.visible).forEach((b, i) => {
    const cd = curves[i].filter(d => isFinite(d.sigma_a));
    cvG.append('path').datum(cd).attr('d', lineGen).attr('fill','none')
      .attr('stroke', b.color).attr('stroke-width', 2.2);
    const ep = cd[Math.floor(cd.length * .82)];
    cvG.append('text').attr('x', xSc(ep.sigma_m)).attr('y', ySc(ep.sigma_a)-7)
      .attr('text-anchor','middle').attr('font-size','11px').attr('font-weight','600')
      .attr('fill', b.color).text(b.name);
  });

  // ── Probe marker ───────────────────────────────────────────────────
  const prG = gMain.select('#g-probe'); prG.selectAll('*').remove();
  prG.append('line').attr('x1',xSc(probe)).attr('x2',xSc(probe)).attr('y1',0).attr('y2',H)
    .attr('stroke','#475569').attr('stroke-width',1).attr('stroke-dasharray','4 3').attr('opacity',.5);
  bsArr.filter(b => b.visible).forEach(b => {
    const { sigma_a } = bolt_static_point(params_nominal(b.params), probe, F_alt_applied_N);
    prG.append('circle').attr('cx',xSc(probe)).attr('cy',ySc(sigma_a)).attr('r',5.5)
      .attr('fill',b.color).attr('stroke','#fff').attr('stroke-width',2);
  });

  // Legend + info + annotations (cloud only in static/edit — MC canvas provides dots)
  drawLegend(mo_arr, fl_arr);
  drawStaticInfo();
  if (!isMC) drawDistCloud();
  else gMain.select('#g-cloud').selectAll('*').remove();
  drawAnnotations();
}

// ── Curve generator ───────────────────────────────────────────────────
// bsParams: bolt-set distribution spec (values extracted via params_nominal).
// F_alt_N: applied force override (from staticView for the chart background).
export function genCurve(bsParams, F_alt_N) {
  const p0 = params_nominal(bsParams);
  return d3.range(N_PTS+1).map(i => {
    const sm = 650 * i / N_PTS;
    const { sigma_a, F_shear_alt } = bolt_static_point(p0, sm, F_alt_N);
    return { sigma_m: sm, sigma_a: isFinite(sigma_a) ? sigma_a : 0, F_shear_alt };
  });
}

// ── Chart hover tooltip ────────────────────────────────────────────────
export function onChartHover(event) {
  const s = getState(); const sv = s.staticView;
  const [mx] = d3.pointer(event);
  const sm = xSc.invert(mx);
  if (sm < 0 || sm > 660) { d3.select('#chart-tip').style('opacity',0); return; }
  const lines = Object.values(s.boltSets).filter(b => b.visible).map(b => {
    const p0 = params_nominal(b.params);
    const { sigma_a, F_shear_alt } = bolt_static_point(p0, sm, sv.F_alt_applied_N);
    const d = miner_dpc(sigma_a, sm, sv.sigma_lim, sv.m_slope, p0.uts_MPa) * 1e6;
    return `<span style="color:${b.color}">■</span> ${b.name}: <b>${sigma_a.toFixed(1)} MPa</b>` +
           `  F_shear=${F_shear_alt.toFixed(0)} N  Δ/cyc=${d<.001?'≈0':d.toFixed(3)}×10⁻⁶`;
  });
  const tip = document.getElementById('chart-tip');
  tip.innerHTML = `<b>σ_m = ${sm.toFixed(0)} MPa</b><br>${lines.join('<br>')}`;
  const cr = document.getElementById('chart-wrap').getBoundingClientRect();
  tip.style.left = Math.min(event.clientX - cr.left + 14, cr.width - 260) + 'px';
  tip.style.top  = Math.max(event.clientY - cr.top  - 40, 4) + 'px';
  tip.style.opacity = 1;
}

// ── Distribution cloud (static mode only) ────────────────────────────
// Samples 120 bolt instances at t=0 to show the spread of initial operating points.
export function drawDistCloud() {
  const cloudG = gMain ? gMain.select('#g-cloud') : null;
  if (!cloudG || cloudG.empty()) return;
  cloudG.selectAll('*').remove();
  const s = getState();
  const bsArr = Object.values(s.boltSets).filter(b => b.visible);
  for (const bs of bsArr) {
    const hasFree = Object.values(bs.params).some(p => p?.free);
    if (!hasFree) continue;
    const localRng = mulberry32(bs.id.split('').reduce((a,c) => a+c.charCodeAt(0), 0) ^ 0xDEAD);
    const restore  = withRng(localRng);
    for (let i = 0; i < 120; i++) {
      const p = sampleBoltParams(bs.params);
      let sigma_m, sigma_a;
      try {
        const r = bolt_static_point(p, p.preload_stress_MPa * p.preload_utilisation, p.F_alt_applied_N);
        sigma_m = r.sigma_m; sigma_a = r.sigma_a;
      } catch { continue; }
      if (!isFinite(sigma_m) || !isFinite(sigma_a)) continue;
      cloudG.append('circle')
        .attr('cx', xSc(sigma_m)).attr('cy', ySc(sigma_a)).attr('r', 2.4)
        .attr('fill',   hexAlpha(bs.color, 0.22))
        .attr('stroke', hexAlpha(bs.color, 0.35))
        .attr('stroke-width', 0.5);
    }
    restore();
  }
}

// ── User annotations ──────────────────────────────────────────────────
export function drawAnnotations() {
  const annotG = gMain ? gMain.select('#g-user-annot') : null;
  if (!annotG || annotG.empty()) return;
  annotG.selectAll('*').remove();
  const annots = getState().chartEdit?.annotations || [];
  for (const a of annots) {
    if (!isFinite(a.xMPa) || !isFinite(a.yMPa) || !a.text) continue;
    const cx = xSc(a.xMPa), cy = ySc(a.yMPa);
    if (!isFinite(cx) || !isFinite(cy)) continue;
    const g = annotG.append('g').attr('transform', `translate(${cx},${cy})`)
      .attr('data-annot-id', a.id);
    g.append('text')
      .attr('text-anchor','middle')
      .attr('font-size', (a.fontSize||11)+'px')
      .attr('font-weight', a.fontWeight||'normal')
      .attr('fill', a.color||'#1e293b')
      .attr('dy','0.35em')
      .text(a.text);
  }
}

// ── Legend ────────────────────────────────────────────────────────────
export function drawLegend(mo_arr, fl_arr) {
  const sorted = [...mo_arr].sort((a, b) => b - a);
  const labels = [
    `> ${sorted[0]} months  ✓ safe`,
    ...sorted.slice(0,-1).map((m,i) => `${sorted[i+1]}–${m} months`),
    `< ${sorted[sorted.length-1]} months  ⚠ imminent`,
  ];
  document.getElementById('legend-html').innerHTML = labels.map((l, i) =>
    `<div class="leg-row"><div class="leg-sw" style="background:${BAND_FILL[i]};border:1px solid ${BAND_STROKE[i]}"></div><span>${l}</span></div>`
  ).join('');
}

// ── Static probe info ─────────────────────────────────────────────────
export function drawStaticInfo() {
  const container = document.getElementById('static-params-html');
  if (!container?.innerHTML) return;
  const sv = getState().staticView;
  let html = `<div style="font-size:10.5px;color:var(--t2);margin-bottom:6px">Probe at ${sv.probe} MPa preload:</div>`;
  html += '<div class="info-box">';
  for (const bs of Object.values(getState().boltSets)) {
    if (!bs.visible) continue;
    const p0 = params_nominal(bs.params);
    const { sigma_a, F_shear_alt } = bolt_static_point(p0, sv.probe, sv.F_alt_applied_N);
    const d    = miner_dpc(sigma_a, sv.probe, sv.sigma_lim, sv.m_slope, p0.uts_MPa) * 1e6;
    const F_pb = sv.F_alt_applied_N / p0.n_bolts * p0.angular_span_factor;
    const slip = p0.mu_joint > 0
      ? F_pb / (p0.mu_joint * 1e6 * p0.A_s_nom * p0.n_interfaces)
      : Infinity;
    html += `<div class="info-row"><span style="color:${bs.color};font-weight:600">${bs.name}</span>
      <span class="info-val">${sigma_a.toFixed(1)} MPa</span></div>
      <div class="info-row"><span>  F_shear</span><span class="info-val">${F_shear_alt.toFixed(0)} N</span></div>
      <div class="info-row"><span>  damage/cyc ×10⁶</span><span class="info-val">${d<.001?'≈0':d.toFixed(3)}</span></div>
      <div class="info-row"><span>  slip threshold</span><span class="info-val">${isFinite(slip)&&slip<660?slip.toFixed(0)+' MPa':'> 660'}</span></div>`;
  }
  html += '</div>';
  const cont = document.getElementById('static-info');
  if (cont) cont.innerHTML = html;
}

// ── Utility ───────────────────────────────────────────────────────────
function hexAlpha(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
