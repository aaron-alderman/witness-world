/**
 * mill_force_main.js — Mill Force Analysis module entry point.
 *
 * Loaded as an ES module when the router navigates to #mill-force.
 * Wires together: model, charts, sidebar, and event handlers.
 */

import {
  millForcesFaithful, millForcesGrounded, compareModels,
  millForcesMC, DEFAULT_INPUTS, PARAM_META,
} from './mill_force_model.js';

import {
  initCrossSection, drawCrossSection,
  initForceAngleChart, drawForceAngleChart,
  drawForceRose, drawMCOverlay,
} from './mill_force_charts.js';

import { seedRng } from './sampling.js';

// ── Module state ──────────────────────────────────────────────────────────────

const state = {
  inputs: { ...DEFAULT_INPUTS },
  mode: 'static',      // 'static' | 'compare' | 'mc'
  chartView: 'cross',  // 'cross'  | 'force'  | 'rose'
  showFaithful: false,
  showGrounded: true,
  mc: {
    nSamples: 200,
    running: false,
    results: null,
    paramDists: {
      J_total:        { free: false, dist: 'normal', mean: DEFAULT_INPUTS.J_total,        std: 0.03 },
      percent_crit:   { free: false, dist: 'normal', mean: DEFAULT_INPUTS.percent_crit,   std: 0.05 },
      percent_solids: { free: false, dist: 'normal', mean: DEFAULT_INPUTS.percent_solids, std: 0.05 },
      height:         { free: false, dist: 'normal', mean: DEFAULT_INPUTS.height,         std: 0.02 },
    },
  },
  comparison: null,
  _debounceTimer: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(state._debounceTimer);
    state._debounceTimer = setTimeout(() => fn(...args), ms);
  };
}

// Convert internal angle (θ_internal, 0=bottom CW) to display degrees (0=East CCW)
// Internal: 0 = bottom, positive = clockwise, range [0, 2π)
// Display:  0 = East, positive = counter-clockwise, range [0, 360)
// Mapping: θ_internal = π/2 corresponds to East (0°)
//          θ_internal = π corresponds to North (90°)
function toDisplayDeg(theta) {
  return ((theta - Math.PI / 2) * 180 / Math.PI % 360 + 360) % 360;
}

function fmt(v, dp = 3) { return isFinite(v) ? v.toFixed(dp) : '—'; }
function fmtPct(v) { return isFinite(v) ? (v * 100).toFixed(2) + '%' : '—'; }

// ── Model run ─────────────────────────────────────────────────────────────────

function runModels() {
  try {
    state.comparison = compareModels(state.inputs);
  } catch (e) {
    console.warn('Mill model error:', e.message);
    state.comparison = null;
  }
}

// ── Sidebar rendering ─────────────────────────────────────────────────────────

function renderSidebar() {
  const sb = $('mill-force-sb-scroll');
  if (!sb) return;
  sb.innerHTML = '';

  // ── Section: Mode ──────────────────────────────────────────────────
  const secMode = document.createElement('div');
  secMode.className = 'ssec';
  secMode.innerHTML = `
    <div class="ssec-title">Analysis Mode</div>
    <div class="mill-force-mode-pills">
      ${['static', 'compare', 'mc'].map(m => `
        <button class="mill-force-pill${state.mode === m ? ' active' : ''}" data-mode="${m}">
          ${m === 'static' ? 'Single' : m === 'compare' ? 'Compare' : 'Monte Carlo'}
        </button>`).join('')}
    </div>`;
  sb.appendChild(secMode);
  secMode.querySelectorAll('.mill-force-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      if (state.mode === 'compare') { state.showFaithful = true; state.showGrounded = true; }
      else if (state.mode === 'static') {
        // Preserve last radio choice; default to grounded if neither set
        if (!state.showGrounded && !state.showFaithful) state.showGrounded = true;
      }
      renderSidebar();
      redrawChart();
    });
  });

  // Model selector (single mode only)
  if (state.mode === 'static') {
    const secModel = document.createElement('div');
    secModel.className = 'ssec';
    secModel.innerHTML = `
      <div class="ssec-title">Model</div>
      <div style="display:flex;gap:12px;padding:4px 0">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px">
          <input type="radio" name="mill-force-model-sel" value="grounded" ${state.showGrounded && !state.showFaithful ? 'checked' : ''}>
          <span style="color:var(--blue)">Grounded</span>
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px">
          <input type="radio" name="mill-force-model-sel" value="faithful" ${state.showFaithful && !state.showGrounded ? 'checked' : ''}>
          <span style="color:var(--ylw)">Faithful</span>
        </label>
      </div>`;
    sb.appendChild(secModel);
    secModel.querySelectorAll('input[type=radio]').forEach(r => {
      r.addEventListener('change', e => {
        if (e.target.value === 'grounded') { state.showGrounded = true;  state.showFaithful = false; }
        else                               { state.showGrounded = false; state.showFaithful = true;  }
        renderResults();
        redrawChart();
      });
    });
  }

  // ── Section: Inputs ────────────────────────────────────────────────
  const secInputs = document.createElement('div');
  secInputs.className = 'ssec';
  const inputRows = Object.entries(PARAM_META).map(([key, meta]) => {
    const v = state.inputs[key];
    const isInt = Number.isInteger(DEFAULT_INPUTS[key]);
    return `
      <div class="prow">
        <div class="prow-top">
          <span class="plabel" title="${meta.description}">${meta.label}</span>
          <span class="pval" data-val="${key}">${isInt ? v : v.toFixed(2)}${meta.unit ? ' ' + meta.unit : ''}</span>
        </div>
        <input type="range" class="mill-force-slider" data-key="${key}"
          min="${meta.min}" max="${meta.max}" step="${meta.step}"
          value="${v}">
      </div>`;
  }).join('');
  secInputs.innerHTML = `<div class="ssec-title">Inputs</div>${inputRows}`;
  sb.appendChild(secInputs);

  const debouncedRun = debounce(() => { runModels(); renderResults(); redrawChart(); }, 150);
  secInputs.querySelectorAll('.mill-force-slider').forEach(sl => {
    sl.addEventListener('input', e => {
      const key = e.target.dataset.key;
      const isInt = Number.isInteger(DEFAULT_INPUTS[key]);
      state.inputs[key] = isInt ? parseInt(e.target.value) : parseFloat(e.target.value);
      const valSpan = secInputs.querySelector(`[data-val="${key}"]`);
      const meta = PARAM_META[key];
      if (valSpan) valSpan.textContent = (isInt ? state.inputs[key] : state.inputs[key].toFixed(2)) + (meta?.unit ? ' ' + meta.unit : '');
      // Update MC dist means too
      if (state.mc.paramDists[key]) state.mc.paramDists[key].mean = state.inputs[key];
      debouncedRun();
    });
  });

  // ── Section: Results ───────────────────────────────────────────────
  const secResults = document.createElement('div');
  secResults.id = 'mill-force-results-sec';
  secResults.className = 'ssec';
  sb.appendChild(secResults);
  renderResults();

  // ── Section: MC Config ─────────────────────────────────────────────
  const secMC = document.createElement('div');
  secMC.className = 'ssec';
  secMC.id = 'mill-force-mc-sec';

  const paramRows = Object.entries(state.mc.paramDists).map(([key, dist]) => `
    <div class="mc-row">
      <label>
        <input type="checkbox" class="mill-force-mc-param-cb" data-key="${key}" ${dist.free ? 'checked' : ''}>
        ${PARAM_META[key]?.label ?? key}
      </label>
      <span class="mill-unit">σ=${dist.std.toFixed(3)}</span>
    </div>`).join('');

  secMC.innerHTML = `
    <div class="ssec-title mill-force-mc-toggle" style="cursor:pointer">
      Monte Carlo Config <span id="mill-force-mc-chevron">${state.mode === 'mc' ? '▲' : '▼'}</span>
    </div>
    <div id="mill-force-mc-body" style="display:${state.mode === 'mc' ? 'block' : 'none'}">
      <div class="mc-row">
        <label>Samples</label>
        <input type="number" id="mill-force-mc-n" value="${state.mc.nSamples}" min="50" max="2000" step="50" style="width:70px">
      </div>
      <div class="ssec-title" style="font-size:10px;margin-top:8px">Vary parameters:</div>
      ${paramRows}
      <div class="run-row" style="margin-top:8px">
        <button class="rbtn go" id="mill-force-mc-run">▶ Run</button>
        <button class="rbtn stop" id="mill-force-mc-clear" ${state.mc.results ? '' : 'disabled'}>✕ Clear</button>
      </div>
      <div id="mill-force-mc-status" style="font-size:10px;color:var(--t2);margin-top:4px">
        ${state.mc.results ? `${state.mc.results.length} samples computed` : 'Ready'}
      </div>
    </div>`;
  sb.appendChild(secMC);

  secMC.querySelector('.mill-force-mc-toggle').addEventListener('click', () => {
    const body = $('mill-force-mc-body');
    const chevron = $('mill-force-mc-chevron');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    chevron.textContent = open ? '▲' : '▼';
  });

  $('mill-force-mc-n')?.addEventListener('change', e => {
    state.mc.nSamples = Math.max(50, parseInt(e.target.value) || 200);
  });

  secMC.querySelectorAll('.mill-force-mc-param-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      state.mc.paramDists[e.target.dataset.key].free = e.target.checked;
    });
  });

  $('mill-force-mc-run')?.addEventListener('click', runMC);
  $('mill-force-mc-clear')?.addEventListener('click', () => {
    state.mc.results = null;
    $('mill-force-mc-status').textContent = 'Cleared';
    redrawChart();
  });
}

function renderResults() {
  const sec = $('mill-force-results-sec');
  if (!sec || !state.comparison) return;

  const cmp = state.comparison;
  const f = cmp.faithful, g = cmp.grounded;

  const isCompare = state.mode === 'compare';

  const globalFields = [
    ['γ (fill)',    f.gamma,      g.gamma,      '°', 1, false],
    ['φ (shoulder)',f.phi,        g.phi,        '°', 1, true],
    ["φ' (toe)",   f.phi_prime,  g.phi_prime,  '°', 1, true],
    ['ω',          f.omega,      g.omega,      'rad/s', 3, false],
    ['ρ charge',   f.rho_charge, g.rho_charge, 'SG',  3, false],
  ];

  const rows = globalFields.map(([lbl, fv, gv, unit, dp, isAngle]) => {
    const fvDisplay = isAngle ? toDisplayDeg(fv) : fv;
    const gvDisplay = isAngle ? toDisplayDeg(gv) : gv;
    const diffPct = Math.abs(fv) > 1e-14 ? ((fv - gv) / Math.abs(fv) * 100).toFixed(2) : '—';
    const showDiff = isCompare && Math.abs(parseFloat(diffPct)) > 0.001;
    return `
      <div class="mill-force-result-row">
        <span class="mill-force-rl">${lbl}</span>
        <span class="mill-force-rv">${fmt(state.showFaithful && !state.showGrounded ? fvDisplay : gvDisplay, dp)} ${unit}</span>
        ${isCompare && showDiff ? `<span class="mill-force-rd">${diffPct}%</span>` : ''}
      </div>`;
  }).join('');

  const envelope = `
    <div class="mill-force-result-row" style="border-top:1px solid var(--brd);margin-top:4px;padding-top:4px">
      <span class="mill-force-rl">Max F_r</span>
      <span class="mill-force-rv">${fmt((state.showFaithful && !state.showGrounded ? f : g).F_r_max / 1000, 1)} kN</span>
    </div>
    <div class="mill-force-result-row">
      <span class="mill-force-rl">Max |F|</span>
      <span class="mill-force-rv">${fmt(Math.max(...(state.showFaithful && !state.showGrounded ? f : g).segments.map(s => s.F_resultant)) / 1000, 1)} kN</span>
    </div>`;

  sec.innerHTML = `
    <div class="ssec-title">Results</div>
    <div class="mill-force-results-body">${rows}${envelope}</div>`;
}

// ── MC run ────────────────────────────────────────────────────────────────────

function runMC() {
  if (!state.comparison) return;
  const status = $('mill-force-mc-status');
  if (status) status.textContent = 'Running…';

  // Use rAF to let the DOM update before blocking
  requestAnimationFrame(() => {
    try {
      seedRng(Date.now() & 0xffffffff);
      state.mc.results = millForcesMC(state.inputs, state.mc.nSamples, state.mc.paramDists);
      if (status) status.textContent = `${state.mc.results.length} samples computed`;
      const clearBtn = $('mill-force-mc-clear');
      if (clearBtn) clearBtn.disabled = false;
    } catch (e) {
      console.error('MC error:', e);
      if (status) status.textContent = 'Error: ' + e.message;
    }
    redrawChart();
  });
}

// ── Chart draw ────────────────────────────────────────────────────────────────

function redrawChart() {
  if (!state.comparison) return;

  const opts = {
    showFaithful: state.mode === 'compare' ? true : state.showFaithful,
    showGrounded: state.mode === 'compare' ? true : state.showGrounded,
    mode: state.mode,
    mcResults: state.mode === 'mc' ? state.mc.results : null,
    tipEl: $('mill-force-tip'),
  };

  switch (state.chartView) {
    case 'cross':
      drawCrossSection($('mill-force-svg-cross'), state.comparison, opts);
      break;
    case 'force':
      drawForceAngleChart($('mill-force-svg-force'), state.comparison, opts);
      break;
    case 'rose':
      drawForceRose($('mill-force-svg-rose'), state.comparison, opts);
      break;
  }
}

// ── Chart tab switching ───────────────────────────────────────────────────────

function switchChartView(view) {
  state.chartView = view;
  ['cross', 'force', 'rose'].forEach(v => {
    const el = $(`mill-force-svg-${v}`);
    if (el) el.style.display = v === view ? 'block' : 'none';
  });
  document.querySelectorAll('.mill-force-cht-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  redrawChart();
}

// ── Resize handling ───────────────────────────────────────────────────────────

const debouncedRedraw = debounce(redrawChart, 100);
let _resizeObs = null;

function attachResizeObserver() {
  const wrap = $('mill-force-chart-wrap');
  if (!wrap || !window.ResizeObserver) return;
  _resizeObs = new ResizeObserver(() => debouncedRedraw());
  _resizeObs.observe(wrap);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

const _TWO_PI = 2 * Math.PI;

function attachCrossTooltip() {
  const svgEl = $('mill-force-svg-cross');
  const tip   = $('mill-force-tip');
  if (!svgEl || !tip) return;

  svgEl.addEventListener('mousemove', e => {
    if (state.chartView !== 'cross' || !state.comparison) { tip.style.display = 'none'; return; }
    const rect = svgEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = svgEl.clientWidth, H = svgEl.clientHeight;
    const cx = W / 2, cy = H / 2;
    const scale = Math.min(W, H) / 2 * 0.78 / state.inputs.radius;

    const millX = (mx - cx) / scale;    // = r·sin(θ)
    const millY = (my - cy) / scale;   // = r·cos(θ)  — toSVG uses cy + r·cos·scale
    const r = Math.sqrt(millX * millX + millY * millY);

    if (r > state.inputs.radius * 1.05) { tip.style.display = 'none'; return; }

    // Mouse angle in mill convention, normalised to [0, 2π]
    const theta = Math.atan2(millX, millY);
    const thetaNorm = ((theta % _TWO_PI) + _TWO_PI) % _TWO_PI;

    const segs = state.comparison.grounded.segments;
    const phi  = state.comparison.grounded.phi;
    const dTheta = _TWO_PI / state.inputs.N_segments;

    // Use physical midpoint (not model's tBar which is wrong for non-charge segs)
    let best = null, bestDist = Infinity;
    segs.forEach(s => {
      const physRaw  = phi - dTheta * (s.segment - 0.5);
      const physNorm = ((physRaw % _TWO_PI) + _TWO_PI) % _TWO_PI;
      const diff = Math.abs(thetaNorm - physNorm);
      const d = Math.min(diff, _TWO_PI - diff);
      if (d < bestDist) { bestDist = d; best = s; }
    });

    if (best && bestDist < dTheta * 0.65) {
      tip.style.display = 'block';
      tip.style.left = `${e.clientX - rect.left + 10}px`;
      tip.style.top  = `${e.clientY - rect.top - 10}px`;
      const fg = state.comparison.faithful.segments[best.segment - 1];
      const stdAngle  = toDisplayDeg(phi - dTheta * (best.segment - 0.5));
      const showFaithful = state.mode === 'compare' || (state.mode === 'static' && state.showFaithful);
      tip.innerHTML = `
        <div style="font-weight:600;margin-bottom:3px">Liner #${best.segment} &nbsp;θ=${stdAngle.toFixed(1)}°</div>
        <div>m_charge = ${best.m_charge.toFixed(1)} kg</div>
        <div style="margin-top:3px;color:var(--blue)">Grounded</div>
        <div>F_r=${(best.F_r/1000).toFixed(2)} &nbsp;F_t=${(best.F_t/1000).toFixed(2)} &nbsp;|F|=${(best.F_resultant/1000).toFixed(2)} kN</div>
        ${showFaithful ? `
        <div style="margin-top:3px;color:var(--ylw)">Faithful</div>
        <div>F_r=${(fg.F_r/1000).toFixed(2)} &nbsp;F_t=${(fg.F_t/1000).toFixed(2)} &nbsp;|F|=${(fg.F_resultant/1000).toFixed(2)} kN</div>` : ''}`;
    } else {
      tip.style.display = 'none';
    }
  });

  svgEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// ── Initialisation ────────────────────────────────────────────────────────────

export function initMillForce() {
  // Chart tab buttons
  document.querySelectorAll('.mill-force-cht-tab').forEach(btn => {
    btn.addEventListener('click', () => switchChartView(btn.dataset.view));
  });

  // Init SVG groups for cross-section
  const crossSvg = $('mill-force-svg-cross');
  if (crossSvg) initCrossSection(crossSvg);
  const forceSvg = $('mill-force-svg-force');
  if (forceSvg) initForceAngleChart(forceSvg);

  // Sidebar
  renderSidebar();

  // Initial model run
  runModels();
  renderResults();
  redrawChart();

  // Resize observer
  attachResizeObserver();

  // Tooltip
  attachCrossTooltip();
}

// Auto-init when this module is loaded
initMillForce();
