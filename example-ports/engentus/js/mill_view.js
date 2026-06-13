/**
 * mill_view.js — Sidebar controls and metrics panel for the Mill Charge view (#mill).
 *
 * Exports:
 *   renderMillSidebar()   — rebuild sidebar HTML and bind input events
 *   renderMillMetrics()   — update metrics readout panel (no full rebuild)
 */

import { getState, setState } from './store.js';
import { computeMetrics }     from './mill_physics.js';
import { renderMillFrame }    from './mill_canvas.js';

const REGIME_BADGE = {
  rolling:     { bg: '#14532d', fg: '#4ade80', label: 'ROLLING' },
  cascading:   { bg: '#78350f', fg: '#fbbf24', label: 'CASCADING' },
  cataracting: { bg: '#7f1d1d', fg: '#f87171', label: 'CATARACTING' },
  centrifuging:{ bg: '#3b0764', fg: '#c084fc', label: 'CENTRIFUGING' },
  pooling:     { bg: '#1e3a5f', fg: '#60a5fa', label: 'POOLING' },
  slipping:    { bg: '#3f3700', fg: '#fde047', label: 'SLIPPING' },
};

// Parameter definitions: key, label, min, max, step, unit, format
const MILL_PARAMS = [
  { key: 'speedFrac',        label: 'Speed N/N_c',         min: 0.40, max: 0.99, step: 0.01,  unit: '%',     fmt: v => (v * 100).toFixed(0) + '%' },
  { key: 'fillFrac',         label: 'Fill fraction J',     min: 0.10, max: 0.50, step: 0.01,  unit: '%',     fmt: v => (v * 100).toFixed(0) + '%' },
  { key: 'slurryContent',    label: 'Slurry content S_w',  min: 0.00, max: 1.00, step: 0.01,  unit: '',      fmt: v => v.toFixed(2) },
  { key: 'wallFriction',     label: 'Wall friction μ',     min: 0.05, max: 1.00, step: 0.01,  unit: '',      fmt: v => v.toFixed(2) },
  { key: 'internalFriction', label: 'Internal friction φ', min: 20,   max: 55,   step: 0.5,   unit: '°',     fmt: v => v.toFixed(0) + '°' },
  { key: 'bulkDensity',      label: 'Bulk density ρ',      min: 1200, max: 2800, step: 50,    unit: 'kg/m³', fmt: v => v.toFixed(0) },
  // millRadius is kept in state but not exposed as a slider — it's a universal
  // scaling parameter: all displayed metrics are dimensionless and R-independent.
];

// ── Render sidebar ─────────────────────────────────────────────────────────
export function renderMillSidebar() {
  const el = document.getElementById('mill-sb-scroll');
  if (!el) return;

  const params = getState().millSim?.params || {};

  el.innerHTML = `
    <div class="ssec">
      <div class="ssec-title">Mill Parameters</div>
      <div id="mill-params-html"></div>
    </div>
    <div class="ssec">
      <div class="ssec-title">Ore / Charge Type</div>
      <div id="mill-preset-html"></div>
    </div>
  `;

  _renderParams(document.getElementById('mill-params-html'), params);
  _renderPresets(document.getElementById('mill-preset-html'));
}

function _renderParams(container, params) {
  let html = '';
  for (const def of MILL_PARAMS) {
    const val = params[def.key] ?? 0;
    html += `
      <div class="prow">
        <div class="prow-top">
          <span class="plabel">${def.label}</span>
          <span class="pval" id="mill-pval-${def.key}">${def.fmt(val)}</span>
        </div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}"
               value="${val}" data-param="${def.key}" class="mill-slider">
      </div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('.mill-slider').forEach(sl => {
    sl.addEventListener('input', e => {
      const key = e.target.dataset.param;
      const rawVal = parseFloat(e.target.value);
      const def = MILL_PARAMS.find(d => d.key === key);
      document.getElementById(`mill-pval-${key}`).textContent = def ? def.fmt(rawVal) : rawVal;

      setState({ millSim: { params: { [key]: rawVal } } });
      _onParamsChange();
    });
  });
}

const PRESETS = [
  { label: 'Hard/Blocky ore',  params: { internalFriction: 42, bulkDensity: 2400, slurryContent: 0.05, wallFriction: 0.65 } },
  { label: 'Average ore',      params: { internalFriction: 35, bulkDensity: 1800, slurryContent: 0.20, wallFriction: 0.50 } },
  { label: 'Clayey/Fine ore',  params: { internalFriction: 26, bulkDensity: 1600, slurryContent: 0.50, wallFriction: 0.35 } },
  { label: 'Dense slurry',     params: { internalFriction: 30, bulkDensity: 2100, slurryContent: 0.72, wallFriction: 0.40 } },
];

function _renderPresets(container) {
  let html = '';
  for (const p of PRESETS) {
    html += `<button class="mill-preset-btn" data-preset='${JSON.stringify(p.params)}'>${p.label}</button>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.mill-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const patch = JSON.parse(btn.dataset.preset);
      setState({ millSim: { params: patch } });
      renderMillSidebar();
      _onParamsChange();
    });
  });
}

// ── Metrics panel (fast update, no full rebuild) ───────────────────────────
export function renderMillMetrics(metrics) {
  if (!metrics) return;
  const el = document.getElementById('mill-metrics-panel');
  if (!el) return;

  const badge = REGIME_BADGE[metrics.regime] || REGIME_BADGE.cascading;
  const catPct = Math.round(metrics.cataractingIndex * 100);

  el.innerHTML = `
    <div class="mill-metric-row"><span class="mill-metric-lbl">Shoulder</span><span class="mill-metric-val">${metrics.shoulderDeg.toFixed(1)}°</span></div>
    <div class="mill-metric-row"><span class="mill-metric-lbl">Toe</span><span class="mill-metric-val">${metrics.toeDeg.toFixed(1)}°</span></div>
    <div class="mill-metric-row"><span class="mill-metric-lbl">COM offset</span><span class="mill-metric-val">${metrics.comOffsetR.toFixed(3)} R</span></div>
    <div class="mill-metric-row"><span class="mill-metric-lbl">Power proxy</span><span class="mill-metric-val">${metrics.powerProxy.toFixed(2)} pu</span></div>
    <div class="mill-metric-row"><span class="mill-metric-lbl">Cataracting</span><span class="mill-metric-val">${catPct}%</span></div>
    <div class="mill-regime-badge" style="background:${badge.bg};color:${badge.fg}">${badge.label}</div>
  `;
}

// ── Internal: recompute + redraw when params change ────────────────────────
function _onParamsChange() {
  const params  = getState().millSim?.params;
  if (!params) return;
  const metrics = computeMetrics(params);

  // Persist metrics to state (for display; also gives canvas access to latest metrics)
  setState({ millSim: { metrics } });

  // Attach to canvas for animation loop
  const canvas = document.getElementById('mill-canvas');
  if (canvas) {
    canvas._millParams  = params;
    canvas._millMetrics = metrics;
  }

  renderMillMetrics(metrics);
  renderMillFrame(params, metrics);
}

// ── Called once when the #mill view becomes visible ────────────────────────
export function initMillView() {
  const params  = getState().millSim?.params;
  if (!params) return;
  const metrics = computeMetrics(params);
  setState({ millSim: { metrics } });

  const canvas = document.getElementById('mill-canvas');
  if (canvas) {
    canvas._millParams  = params;
    canvas._millMetrics = metrics;
  }

  renderMillSidebar();
  renderMillMetrics(metrics);
}
