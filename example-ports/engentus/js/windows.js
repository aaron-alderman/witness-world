/**
 * windows.js — Floating windows: drag/resize/z-order + CDF, Stats, ANOVA views.
 */
import { getState, setState } from './store.js';
import { MC_RESULTS } from './simulation.js';
import { anova, pct }  from './sampling.js';

// ── Fractional window helpers ─────────────────────────────────────────
export function winPx(ws) {
  const VW = window.innerWidth, VH = window.innerHeight;
  const w = Math.max(300, Math.round((ws.wf ?? 0.39) * VW));
  const h = Math.max(140, Math.round((ws.hf ?? 0.40) * VH));
  const x = Math.min(Math.round((ws.xf ?? 0.55) * VW), VW - w - 5);
  const y = Math.max(44,  Math.min(Math.round((ws.yf ?? 0.07) * VH), VH - 50));
  return { x, y, w, h };
}

export function winFrac(id) {
  const el = document.getElementById(`fw-${id}`); if (!el) return null;
  const VW = window.innerWidth, VH = window.innerHeight;
  return {
    xf: parseFloat(el.style.left) / VW,
    yf: parseFloat(el.style.top)  / VH,
    wf: parseFloat(el.style.width)  / VW,
    hf: parseFloat(el.style.height) / VH,
  };
}

export function repositionWindows() {
  for (const [id, ws] of Object.entries(getState().ui.windows)) {
    const el = document.getElementById(`fw-${id}`); if (!el) continue;
    const px = winPx(ws);
    el.style.left = px.x + 'px'; el.style.top = px.y + 'px';
    el.style.width  = Math.max(300, Math.min(parseFloat(el.style.width)||px.w, window.innerWidth-px.x-5)) + 'px';
    el.style.height = Math.max(140, parseFloat(el.style.height)||px.h) + 'px';
  }
}

// ── Window definitions ────────────────────────────────────────────────
export const WIN_DEFS = {
  cdf:   { title:'📈 Failure CDF — Bolt Survival Over Time' },
  stats: { title:'📊 Summary Statistics' },
  anova: { title:'🔬 ANOVA — Between-Group Comparison' },
};

// ── Window creation ───────────────────────────────────────────────────
export function ensureWindows() {
  const layer = document.getElementById('wl');
  for (const [id, def] of Object.entries(WIN_DEFS)) {
    if (document.getElementById(`fw-${id}`)) continue;
    const ws = getState().ui.windows[id];
    const px = winPx(ws);
    const el = document.createElement('div');
    el.className = 'fw'; el.id = `fw-${id}`;
    el.style.cssText = `left:${px.x}px;top:${px.y}px;width:${px.w}px;height:${px.h}px;z-index:${ws.z};display:${ws.visible?'flex':'none'}`;
    el.innerHTML = `
      <div class="fw-tb" id="fwt-${id}">
        <span class="fw-title">${def.title}</span>
        <button class="fw-btn" data-action="min"   data-wid="${id}">─</button>
        <button class="fw-btn" data-action="close" data-wid="${id}">✕</button>
      </div>
      <div class="fw-body" id="fwb-${id}"></div>
      <div class="fw-rz"  id="fwr-${id}"></div>`;
    layer.appendChild(el);
    makeDraggable(el.querySelector(`#fwt-${id}`), id);
    makeResizable(el.querySelector(`#fwr-${id}`), id);
    el.addEventListener('pointerdown', () => bringToFront(id));
    el.querySelectorAll('.fw-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { action, wid } = btn.dataset;
        if (action === 'close') setWindowVisible(wid, false);
        if (action === 'min') {
          const b = document.getElementById(`fwb-${wid}`);
          b.style.display = b.style.display === 'none' ? '' : 'none';
        }
      });
    });
  }
}

export function setWindowVisible(id, vis) {
  setState({ ui: { windows: { [id]: { visible: vis } } } });
  const el = document.getElementById(`fw-${id}`);
  if (el) { el.style.display = vis ? 'flex' : 'none'; if (vis) bringToFront(id); }
  document.querySelectorAll(`.tbw[data-win="${id}"]`).forEach(b => b.classList.toggle('on', vis));
  if (vis) refreshWindowContent(id);
}

export function bringToFront(id) {
  setState(s => ({ ui: { maxZ: s.ui.maxZ + 1, windows: { [id]: { z: s.ui.maxZ + 1 } } } }));
  const el = document.getElementById(`fw-${id}`);
  if (el) el.style.zIndex = getState().ui.windows[id].z;
}

// ── Drag & resize ─────────────────────────────────────────────────────
function makeDraggable(titleEl, id) {
  titleEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.fw-btn')) return;
    const el = document.getElementById(`fw-${id}`);
    const ox = e.clientX - parseFloat(el.style.left),
          oy = e.clientY - parseFloat(el.style.top);
    const mv = e => {
      el.style.left = Math.max(0, Math.min(e.clientX-ox, window.innerWidth-parseFloat(el.style.width)-5)) + 'px';
      el.style.top  = Math.max(44,Math.min(e.clientY-oy, window.innerHeight-50)) + 'px';
    };
    const up = () => {
      const f = winFrac(id); if (f) setState({ ui: { windows: { [id]: f } } });
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup',   up);
    };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup',   up);
    titleEl.setPointerCapture(e.pointerId);
    bringToFront(id);
  });
}

function makeResizable(handle, id) {
  handle.addEventListener('pointerdown', e => {
    e.stopPropagation();
    const el = document.getElementById(`fw-${id}`);
    const sw = parseFloat(el.style.width), sh = parseFloat(el.style.height),
          sx = e.clientX,                  sy = e.clientY;
    const mv = e => {
      el.style.width  = Math.max(300, sw + e.clientX - sx) + 'px';
      el.style.height = Math.max(140, sh + e.clientY - sy) + 'px';
      refreshWindowContent(id);
    };
    const up = () => {
      const f = winFrac(id); if (f) setState({ ui: { windows: { [id]: f } } });
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup',   up);
    };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup',   up);
    handle.setPointerCapture(e.pointerId);
  });
}

// ── Content routing ───────────────────────────────────────────────────
export function refreshWindowContent(id) {
  if (id === 'cdf')   renderCDF();
  if (id === 'stats') renderStats();
  if (id === 'anova') renderANOVA();
}

export function refreshWindows() {
  for (const id of Object.keys(WIN_DEFS)) {
    if (getState().ui.windows[id].visible) refreshWindowContent(id);
  }
}

// ── CDF view ──────────────────────────────────────────────────────────
export function renderCDF() {
  const body = document.getElementById('fwb-cdf'); if (!body) return;
  const el   = document.getElementById('fw-cdf');
  const W2   = parseInt(el.style.width)-2, H2 = parseInt(el.style.height)-42;
  const m    = { top:18, right:22, bottom:44, left:52 };
  const w    = W2-m.left-m.right, h = H2-m.top-m.bottom;
  const s    = getState(); const simId = s.ui.activeSimId;
  body.innerHTML = '';
  const svg = d3.select(body).append('svg').attr('width',W2).attr('height',H2);
  const g   = svg.append('g').attr('transform',`translate(${m.left},${m.top})`);

  const datasets = [];
  for (const [sid, sim] of Object.entries(s.simulations)) {
    if (sim.status !== 'done' && sim.status !== 'running') continue;
    const res = MC_RESULTS[sid]; if (!res?.tVals) continue;
    for (const [bsId, bd] of Object.entries(res)) {
      if (bsId === 'tVals') continue;
      const bs = s.boltSets[bsId]; if (!bs) continue;
      datasets.push({
        name: `${sim.name} / ${bs.name}`,
        color: bs.color,
        cdf: Array.from(res.tVals).map(t => ({
          t, f: Array.from(bd.failureT).filter(v=>isFinite(v)&&v<=t).length / bd.n,
        })),
      });
    }
  }

  if (!datasets.length) {
    g.append('text').attr('x',w/2).attr('y',h/2).attr('text-anchor','middle')
      .attr('font-size','12px').attr('fill','#94a3b8')
      .text('Run a Monte Carlo simulation to see results.');
    return;
  }

  const tMax = Math.max(...datasets.flatMap(d => d.cdf.map(p => p.t)));
  const xS = d3.scaleLinear().domain([0,tMax]).range([0,w]);
  const yS = d3.scaleLinear().domain([0,1]).range([h,0]);

  g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(xS).ticks(8))
    .call(gg=>{gg.select('.domain').attr('stroke','#e2e8f0');gg.selectAll('.tick line').attr('stroke','#e2e8f0');gg.selectAll('text').attr('fill','#64748b').attr('font-size','10px')});
  g.append('g').call(d3.axisLeft(yS).ticks(6).tickFormat(d3.format('.0%')))
    .call(gg=>{gg.select('.domain').attr('stroke','#e2e8f0');gg.selectAll('.tick line').attr('stroke','#e2e8f0');gg.selectAll('text').attr('fill','#64748b').attr('font-size','10px')});
  g.append('g').call(d3.axisLeft(yS).ticks(6).tickSize(-w).tickFormat(''))
    .call(gg=>{gg.select('.domain').remove();gg.selectAll('line').attr('stroke','#f1f5f9')});

  g.append('text').attr('x',w/2).attr('y',h+38).attr('text-anchor','middle')
    .attr('font-size','11px').attr('fill','#64748b').text('Time (months)');
  g.append('text').attr('transform','rotate(-90)').attr('x',-h/2).attr('y',-40)
    .attr('text-anchor','middle').attr('font-size','11px').attr('fill','#64748b')
    .text('Cumulative Failure Fraction');
  g.append('line').attr('x1',0).attr('x2',w).attr('y1',yS(.5)).attr('y2',yS(.5))
    .attr('stroke','#e2e8f0').attr('stroke-dasharray','4 3');

  const lineGen = d3.line().x(d=>xS(d.t)).y(d=>yS(d.f)).curve(d3.curveStepAfter);
  datasets.forEach(ds => {
    g.append('path').datum(ds.cdf).attr('d',lineGen).attr('fill','none')
      .attr('stroke',ds.color).attr('stroke-width',2.2);
  });

  const t = s.ui.scrubber.t;
  if (t > 0 && t <= tMax) {
    g.append('line').attr('x1',xS(t)).attr('x2',xS(t)).attr('y1',0).attr('y2',h)
      .attr('stroke','#475569').attr('stroke-width',1).attr('stroke-dasharray','3 3');
  }

  const leg = g.append('g').attr('transform',`translate(${w-6},4)`);
  datasets.forEach((ds, i) => {
    leg.append('rect').attr('x',-100).attr('y',i*16).attr('width',10).attr('height',3).attr('fill',ds.color).attr('rx',1);
    leg.append('text').attr('x',-86).attr('y',i*16+3).attr('font-size','9.5px').attr('fill','#475569').text(ds.name);
  });
}

// ── Stats view ────────────────────────────────────────────────────────
export function renderStats() {
  const body = document.getElementById('fwb-stats'); if (!body) return;
  const s = getState();
  const rows = [];
  for (const [sid, sim] of Object.entries(s.simulations)) {
    if (!sim.summary) continue;
    for (const [bsId, st] of Object.entries(sim.summary)) {
      const bs = s.boltSets[bsId]; if (!bs) continue;
      rows.push({ sim: sim.name, bs: bs.name, color: bs.color, ...st });
    }
  }
  if (!rows.length) {
    body.innerHTML = '<p style="padding:12px;font-size:11.5px;color:#94a3b8">No completed simulations.</p>';
    return;
  }
  const fmtT = v => v != null ? v.toFixed(1) : '—';
  const fmtP = v => (v*100).toFixed(1)+'%';
  body.innerHTML = `<table class="stbl">
    <thead><tr><th>Simulation</th><th>Bolt Set</th><th>n</th><th>% Failed</th>
      <th>Mean T<sub>f</sub></th><th>Std</th><th>P10</th><th>P50</th><th>P90</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td>${r.sim}</td>
      <td><span class="sc-dot" style="background:${r.color}"></span>${r.bs}</td>
      <td class="num">${r.n}</td>
      <td class="num" style="color:${r.pFail>0.5?'#dc2626':r.pFail>0.2?'#EC7424':'#16a34a'}">${fmtP(r.pFail)}</td>
      <td class="num">${fmtT(r.meanT)}</td>
      <td class="num">${fmtT(r.stdT)}</td>
      <td class="num">${fmtT(r.p10)}</td>
      <td class="num">${fmtT(r.p50)}</td>
      <td class="num">${fmtT(r.p90)}</td>
    </tr>`).join('')}</tbody></table>`;
}

// ── ANOVA view ────────────────────────────────────────────────────────
export function renderANOVA() {
  const body = document.getElementById('fwb-anova'); if (!body) return;
  const s = getState();
  const groups = [];
  for (const [sid, sim] of Object.entries(s.simulations)) {
    if (!MC_RESULTS[sid]) continue;
    for (const [bsId, bd] of Object.entries(MC_RESULTS[sid])) {
      if (bsId === 'tVals') continue;
      const bs = s.boltSets[bsId]; if (!bs) continue;
      const fts = Array.from(bd.failureT).filter(v => isFinite(v));
      if (fts.length < 3) continue;
      groups.push({ name:`${bs.name} (${sim.name})`, color:bs.color, values:fts });
    }
  }
  body.innerHTML = '';
  if (groups.length < 2) {
    body.innerHTML = '<p style="padding:12px;font-size:11.5px;color:#94a3b8">Need ≥2 groups with failed bolts for ANOVA.</p>';
    return;
  }
  const res = anova(groups);
  if (!res) { body.innerHTML = '<p style="padding:12px;font-size:11.5px;color:#94a3b8">Insufficient data.</p>'; return; }
  const sigClass = res.p < 0.05 ? 'yes' : 'no';
  const sigText  = res.p < 0.001 ? 'p < 0.001 ***' : res.p < 0.01 ? 'p < 0.01 **' : res.p < 0.05 ? 'p < 0.05 *' : `p = ${res.p.toFixed(3)}`;
  const el = document.getElementById('fw-anova');
  const bw = parseInt(el.style.width)-2, bh = parseInt(el.style.height)-82;
  body.innerHTML = `
    <div class="anova-stat">
      <div class="anova-kv"><span class="anova-k">F-statistic</span><span class="anova-v">${res.F.toFixed(2)}</span></div>
      <div class="anova-kv"><span class="anova-k">df (between)</span><span class="anova-v">${res.df1}</span></div>
      <div class="anova-kv"><span class="anova-k">df (within)</span><span class="anova-v">${res.df2}</span></div>
      <div class="anova-kv"><span class="anova-k">p-value</span><span class="anova-v">${sigText}</span></div>
      <span class="anova-sig ${sigClass}">${sigClass==='yes'?'Significant':'Not significant'}</span>
    </div>
    <p class="anova-note">One-way ANOVA on failure times (months) across groups. Grand mean: ${res.grand.toFixed(1)} mo.</p>
    <div id="anova-box-plot"></div>`;

  // Box plot
  const m = {top:10,right:20,bottom:30,left:55};
  const w = bw-m.left-m.right, h = bh-m.top-m.bottom;
  const allVals = groups.flatMap(g => g.values);
  const xS = d3.scaleBand().domain(groups.map((_,i)=>i)).range([0,w]).padding(.35);
  const yS = d3.scaleLinear().domain([0, d3.max(allVals)*1.05]).range([h,0]);
  const svg = d3.select('#anova-box-plot').append('svg').attr('width',bw).attr('height',bh);
  const g   = svg.append('g').attr('transform',`translate(${m.left},${m.top})`);
  g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(xS).tickFormat(i=>groups[i].name.split(' ')[0]))
    .call(gg=>{gg.select('.domain').attr('stroke','#e2e8f0');gg.selectAll('text').attr('fill','#64748b').attr('font-size','10px')});
  g.append('g').call(d3.axisLeft(yS).ticks(5))
    .call(gg=>{gg.select('.domain').attr('stroke','#e2e8f0');gg.selectAll('text').attr('fill','#64748b').attr('font-size','10px')});
  g.append('g').call(d3.axisLeft(yS).ticks(5).tickSize(-w).tickFormat(''))
    .call(gg=>{gg.select('.domain').remove();gg.selectAll('line').attr('stroke','#f1f5f9')});
  g.append('text').attr('transform','rotate(-90)').attr('x',-h/2).attr('y',-42)
    .attr('text-anchor','middle').attr('font-size','10.5px').attr('fill','#64748b')
    .text('Failure Time (months)');

  groups.forEach((grp, i) => {
    const sorted = [...grp.values].sort((a,b)=>a-b);
    const q1=pct(sorted,.25), med=pct(sorted,.5), q3=pct(sorted,.75);
    const iqr=q3-q1, wlo=Math.max(d3.min(sorted),q1-1.5*iqr), whi=Math.min(d3.max(sorted),q3+1.5*iqr);
    const bx=xS(i), bw2=xS.bandwidth(), mid=bx+bw2/2, col=grp.color;
    g.append('line').attr('x1',mid).attr('x2',mid).attr('y1',yS(whi)).attr('y2',yS(q3)).attr('stroke',col).attr('stroke-width',1.2);
    g.append('line').attr('x1',mid).attr('x2',mid).attr('y1',yS(q1)).attr('y2',yS(wlo)).attr('stroke',col).attr('stroke-width',1.2);
    g.append('line').attr('x1',bx+bw2*.25).attr('x2',bx+bw2*.75).attr('y1',yS(whi)).attr('y2',yS(whi)).attr('stroke',col).attr('stroke-width',1.2);
    g.append('line').attr('x1',bx+bw2*.25).attr('x2',bx+bw2*.75).attr('y1',yS(wlo)).attr('y2',yS(wlo)).attr('stroke',col).attr('stroke-width',1.2);
    g.append('rect').attr('x',bx).attr('y',yS(q3)).attr('width',bw2).attr('height',Math.abs(yS(q1)-yS(q3)))
      .attr('fill',`rgba(${_hex(col)},0.2)`).attr('stroke',col).attr('stroke-width',1.5).attr('rx',2);
    g.append('line').attr('x1',bx).attr('x2',bx+bw2).attr('y1',yS(med)).attr('y2',yS(med))
      .attr('stroke',col).attr('stroke-width',2);
    sorted.filter(v=>v<wlo||v>whi).forEach(v => {
      g.append('circle').attr('cx',mid).attr('cy',yS(v)).attr('r',2.2).attr('fill','none').attr('stroke',col).attr('stroke-width',1);
    });
  });
}

// ── Private ───────────────────────────────────────────────────────────
function _hex(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}
