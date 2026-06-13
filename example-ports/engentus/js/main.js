/**
 * main.js — Application entry point.
 *
 * Responsibilities:
 *   1. Load persisted state
 *   2. Initialise chart, windows, scrubber controls
 *   3. Render initial UI
 *   4. Wire up all DOM event listeners
 *   5. Set up the unified state subscriber
 *   6. Listen on the event bus for simulation lifecycle events
 */
import { getState, setState, subscribe } from './store.js';
import { loadState }   from './storage.js';          // also registers auto-save
import { initChart, drawStaticChart } from './chart.js';
import { clearMCCanvas } from './canvas.js';
import { ensureWindows, setWindowVisible, repositionWindows, winPx } from './windows.js';
import { renderSidebar, updateRunUI, renderBoltSets } from './sidebar.js';
import { refreshMCView, updateScrubber, startPlay, stopPlay } from './scrubber.js';
import { runSimulation, getSimTMax, getSimCtrl, createSim } from './simulation.js';
import bus from './bus.js';

// ── 1. Load persisted state ───────────────────────────────────────────
loadState();

// ── 2. Bootstrap windows ──────────────────────────────────────────────
ensureWindows();
for (const [id, ws] of Object.entries(getState().ui.windows)) {
  const el = document.getElementById(`fw-${id}`); if (!el) continue;
  const px = winPx(ws);
  el.style.display  = ws.visible ? 'flex' : 'none';
  el.style.left     = px.x + 'px'; el.style.top    = px.y + 'px';
  el.style.width    = px.w + 'px'; el.style.height = px.h + 'px';
  el.style.zIndex   = ws.z;
  document.querySelectorAll(`.tbw[data-win="${id}"]`).forEach(b => b.classList.toggle('on', ws.visible));
}

// Ensure openBsSets has an entry for every bolt set
const openInit = {};
for (const id of Object.keys(getState().boltSets)) {
  openInit[id] = getState().ui.openBsSets[id] || false;
}
setState({ ui: { openBsSets: openInit } });

// ── 3. Restore scrubber controls (no layout reads here) ───────────────
document.body.classList.toggle('edit-mode', getState().ui.mode === 'edit');
{
  const scr = getState().ui.scrubber;
  const timeSl = document.getElementById('time-sl');
  if (timeSl) { timeSl.value = scr.t || 0; timeSl.max = scr.tMax || 24; }
  const tLbl = document.getElementById('t-lbl');
  if (tLbl) tLbl.textContent = `t = ${(scr.t||0).toFixed(2)} mo`;
  const spdSlEl  = document.getElementById('spd-sl');
  const spdLblEl = document.getElementById('spd-lbl');
  if (spdSlEl && scr.speed != null) {
    spdSlEl.value = scr.speed;
    const v = scr.speed;
    if (spdLblEl) spdLblEl.textContent = (v<1?v.toFixed(1):v.toFixed(v>=10?0:1))+'×';
  }
  const trailCb = document.getElementById('trail-cb');
  if (trailCb) trailCb.checked = scr.showTrail ?? false;
  const playBtn = document.getElementById('play-btn');
  if (playBtn && scr.t > 0 && scr.t >= (scr.tMax||24)) {
    playBtn.textContent = '↺'; playBtn.title = 'Restart';
  }
}

// ── 4. Initial render ─────────────────────────────────────────────────
renderSidebar();
// Defer chart init to after the browser has completed layout — clientHeight
// is unreliable before the first paint when the scrubber affects the height.
requestAnimationFrame(() => { initChart(); drawStaticChart(); });
// When bundled as a single file the IIFE runs before #goodman is shown, so
// initChart() above gets 0 dimensions and bails. ResizeObserver re-fires
// once the container gets real dimensions (e.g. user navigates to #goodman).
{
  let _chartSized = false;
  const _chartEl = document.getElementById('chart-wrap');
  if (_chartEl) {
    new ResizeObserver(entries => {
      if (_chartSized) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        _chartSized = true;
        initChart();
        drawStaticChart();
      }
    }).observe(_chartEl);
  }
}

// ── 5. DOM event binding ──────────────────────────────────────────────
bindEvents();

// ── 6. State subscriber ───────────────────────────────────────────────
subscribe(s => {
  // Sync mode-pill highlighting (instant, no DOM rebuild)
  document.querySelectorAll('.mode-btn')
    .forEach(b => b.classList.toggle('on', b.dataset.mode === s.ui.mode));

  // RAF loop owns visuals during playback — skip debounced redraws
  if (s.ui.scrubber?.playing || !getState()) return;

  clearTimeout(window._vizDebounce);
  window._vizDebounce = setTimeout(() => {
    const cur = getState();
    if (cur.ui.mode === 'mc') refreshMCView();
    else                      drawStaticChart();
  }, 40);
});

// ── 7. Bus listeners ──────────────────────────────────────────────────
bus.on('sim:progress', ({ simId }) => {
  const s = getState();
  if (s.ui.mode === 'mc' && s.ui.activeSimId === simId && !s.ui.scrubber.playing) {
    refreshMCView();
  }
});

bus.on('sim:done', ({ simId }) => {
  renderSidebar();
  updateRunUI();
  refreshMCView();
});

bus.on('sim:stopped', ({ simId }) => {
  renderSidebar();
  updateRunUI();
  refreshMCView();
});

// ── Event binding ─────────────────────────────────────────────────────
function bindEvents() {
  // Mode toggle
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode !== 'mc' && getState().ui.scrubber.playing) stopPlay();
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('on', b === btn));
      setState({ ui: { mode } });
      document.body.classList.toggle('edit-mode', mode === 'edit');
      renderSidebar();  // toggles #scr visibility, which changes chart-wrap height
      // Re-measure after layout settles so the chart fits the updated container.
      requestAnimationFrame(() => {
        initChart();
        if (mode === 'static' || mode === 'edit') { clearMCCanvas(); drawStaticChart(); }
        if (mode === 'mc') {
          const s = getState();
          if (s.ui.activeSimId) updateScrubber(s.ui.scrubber.t);
        }
      });
    });
  });

  // Floating window buttons
  document.querySelectorAll('.tbw').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.win;
      const cur = getState().ui.windows[id].visible;
      setWindowVisible(id, !cur);
    });
  });

  // New sim / bolt set
  document.getElementById('new-sim-btn').addEventListener('click', () => {
    createSim(); renderSidebar();
  });
  document.getElementById('new-bs-btn').addEventListener('click', () => {
    // cloneBoltSet not imported directly — import on demand or use simulation
    import('./simulation.js').then(({ cloneBoltSet }) => {
      cloneBoltSet(Object.keys(getState().boltSets)[0]);
      renderSidebar();
    });
  });

  // Run buttons
  document.getElementById('btn-run').addEventListener('click', () => {
    const s = getState(); if (!s.ui.activeSimId) return;
    const cfg = {
      nBolts: parseInt(document.getElementById('cfg-n').value)    || 500,
      tMax:   parseFloat(document.getElementById('cfg-tmax').value) || 24,
      dt:     parseFloat(document.getElementById('cfg-dt').value)  || 0.5,
      seed:   42,
    };
    setState({ simulations: { [s.ui.activeSimId]: { config: cfg, status: 'stale',
      boltSetIds: Object.keys(s.boltSets) } } });
    updateRunUI();
    runSimulation(s.ui.activeSimId);
  });
  document.getElementById('btn-pause').addEventListener('click', () => {
    const ctrl = getSimCtrl(); if (!ctrl) return;
    ctrl.paused = !ctrl.paused;
    document.getElementById('btn-pause').textContent = ctrl.paused ? '▶ Resume' : '⏸';
    document.getElementById('prog-fill').style.opacity = ctrl.paused ? '0.4' : '1';
    document.getElementById('prog-lbl').textContent   = ctrl.paused ? '⏸ Paused' : 'Running…';
  });
  document.getElementById('btn-stop').addEventListener('click', () => {
    const ctrl = getSimCtrl(); if (!ctrl) return;
    ctrl.running = false; ctrl.paused = false;
    document.getElementById('btn-run').disabled   = false;
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-stop').disabled  = true;
    document.getElementById('prog-lbl').textContent = '■ Stopping…';
  });

  // Time scrubber
  document.getElementById('time-sl').addEventListener('input', e => {
    if (getState().ui.scrubber.playing) stopPlay();
    const t = parseFloat(e.target.value);
    setState({ ui: { scrubber: { t } } });
    updateScrubber(t);
  });
  document.getElementById('play-btn').addEventListener('click', () => {
    if (getState().ui.scrubber.playing) {
      stopPlay();
    } else {
      if (getState().ui.scrubber.t >= getSimTMax()) {
        setState({ ui: { scrubber: { t: 0 } } });
        updateScrubber(0);
      }
      startPlay();
    }
  });

  // Trail checkbox
  document.getElementById('trail-cb')?.addEventListener('change', e => {
    setState({ ui: { scrubber: { showTrail: e.target.checked } } });
    if (!getState().ui.scrubber.playing) {
      import('./canvas.js').then(({ drawMCCanvas }) => drawMCCanvas(getState().ui.scrubber.t));
    }
  });

  // Speed slider
  const spdSl  = document.getElementById('spd-sl');
  const spdLbl = document.getElementById('spd-lbl');
  if (spdSl && spdLbl) {
    spdSl.addEventListener('input', () => {
      const v = parseFloat(spdSl.value);
      spdLbl.textContent = (v<1?v.toFixed(1):v.toFixed(v>=10?0:1))+'×';
      setState({ ui: { scrubber: { speed: v } } });
    });
  }

  // Close profile menu on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('up-menu');
    if (menu && !e.target.closest('#user-prof')) menu.classList.remove('open');
  });

  // Resize
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      initChart();
      drawStaticChart();
      repositionWindows();
    }, 120);
  });
}
