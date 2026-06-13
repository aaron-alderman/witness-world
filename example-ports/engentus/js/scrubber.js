/**
 * scrubber.js — RAF animation scrubber + MC view refresh.
 *
 * refreshMCView() is the single function that brings the full MC view
 * (Goodman background + canvas + floating windows) into sync with the
 * current state. It never calls setState.
 */
import { getState, setState } from './store.js';
import { drawStaticChart } from './chart.js';
import { drawMCCanvas }    from './canvas.js';
import { renderCDF, renderStats, renderANOVA } from './windows.js';
import { MC_RESULTS, getSimTMax } from './simulation.js';

let rafId      = null;
let rafLastTs  = 0;

// ── Full MC view refresh (no setState) ───────────────────────────────
export function refreshMCView() {
  if (!getState()) return;
  const s    = getState();
  const t    = s.ui.scrubber.t;
  const tMax = getSimTMax();

  // Sync slider max
  const timeSl = document.getElementById('time-sl');
  if (timeSl) timeSl.max = tMax;

  // Failure badge
  const simId = s.ui.activeSimId;
  const res   = MC_RESULTS[simId];
  if (res) {
    let f = 0, n = 0;
    for (const [k, bd] of Object.entries(res)) {
      if (k === 'tVals') continue;
      n += bd.n;
      f += Array.from(bd.failureT).filter(v => isFinite(v) && v <= t).length;
    }
    const fbEl = document.getElementById('fail-badge');
    if (fbEl) fbEl.textContent = n ? `${f}/${n} failed (${(f/n*100).toFixed(1)}%)` : '';
  }

  drawStaticChart();
  drawMCCanvas(t);
  if (s.ui.windows.cdf.visible)   renderCDF();
  if (s.ui.windows.stats.visible) renderStats();
  if (s.ui.windows.anova.visible) renderANOVA();
}

// ── Per-frame scrubber update (called by RAF and time slider) ─────────
export function updateScrubber(t) {
  const slEl = document.getElementById('time-sl');
  if (slEl) { slEl.value = t; slEl.max = getSimTMax(); }
  const tLbl = document.getElementById('t-lbl');
  if (tLbl) tLbl.textContent = `t = ${t.toFixed(2)} mo`;

  const s      = getState();
  const simId  = s.ui.activeSimId;
  const playing = s.ui.scrubber.playing;

  // Failure badge
  if (simId && MC_RESULTS[simId]) {
    let failed = 0, total = 0;
    for (const [bsId, bd] of Object.entries(MC_RESULTS[simId])) {
      if (bsId === 'tVals') continue;
      total  += bd.n;
      failed += Array.from(bd.failureT).filter(v => isFinite(v) && v <= t).length;
    }
    const fbEl = document.getElementById('fail-badge');
    if (fbEl) fbEl.textContent = total ? `${failed}/${total} failed (${(failed/total*100).toFixed(1)}%)` : '';
  }

  // Skip full chart redraw during playback — background never changes per frame
  if (!playing) drawStaticChart();
  drawMCCanvas(t);
  if (!playing && s.ui.windows.cdf.visible) renderCDF();
}

// ── Play / stop ───────────────────────────────────────────────────────
export function startPlay() {
  if (getState().ui.scrubber.playing) return;
  clearTimeout(window._vizDebounce);   // cancel any pending subscriber redraw
  setState({ ui: { scrubber: { playing: true } } });
  const btn = document.getElementById('play-btn');
  if (btn) { btn.textContent = '⏸'; btn.title = 'Pause'; }
  rafLastTs = 0;

  function frame(ts) {
    if (!getState().ui.scrubber.playing) return;
    if (!rafLastTs) { rafLastTs = ts; rafId = requestAnimationFrame(frame); return; }
    const dtMs  = Math.min(ts - rafLastTs, 100);
    rafLastTs   = ts;
    const speed = getState().ui.scrubber.speed || 1;
    const dtMo  = (dtMs / 1000) * speed;
    const tMax  = getSimTMax();
    const cur   = getState().ui.scrubber.t;
    const next  = cur + dtMo;
    if (next >= tMax) {
      setState({ ui: { scrubber: { t: tMax, playing: false } } });
      updateScrubber(tMax);
      if (btn) { btn.textContent = '↺'; btn.title = 'Restart'; }
      rafId = null;
      return;
    }
    setState({ ui: { scrubber: { t: next } } });
    updateScrubber(next);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

export function stopPlay(reset = false) {
  setState({ ui: { scrubber: { playing: false } } });
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (reset) { setState({ ui: { scrubber: { t: 0 } } }); updateScrubber(0); }
  const btn = document.getElementById('play-btn');
  if (btn) {
    const atEnd = getState().ui.scrubber.t >= getSimTMax();
    btn.textContent = atEnd ? '↺' : '▶';
    btn.title       = atEnd ? 'Restart' : 'Play';
  }
}
