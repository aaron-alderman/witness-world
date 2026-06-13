/**
 * mill_main.js — Entry point for the Mill Charge view (#mill).
 * Loaded lazily by the router on first navigation to #mill.
 */
import { loadState }  from './storage.js';
import { getState, setState, subscribe } from './store.js';
import { initMillCanvas, startMillAnimation, stopMillAnimation, renderMillFrame } from './mill_canvas.js';
import { initMillView, renderMillSidebar, renderMillMetrics } from './mill_view.js';
import { computeMetrics } from './mill_physics.js';

// Ensure state is loaded (may already be loaded if Goodman ran first)
loadState();

// Bootstrap the canvas
const canvas = document.getElementById('mill-canvas');
initMillCanvas(canvas);

// First render
initMillView();
startMillAnimation();

// State subscriber: recompute metrics when millSim.params changes
subscribe(s => {
  const params  = s.millSim?.params;
  if (!params) return;

  // Recompute only when params changed (metrics null = stale)
  if (s.millSim.metrics === null) {
    const metrics = computeMetrics(params);
    setState({ millSim: { metrics } });
    return;
  }

  // Sync canvas pointers
  if (canvas) {
    canvas._millParams  = params;
    canvas._millMetrics = s.millSim.metrics;
  }
  renderMillMetrics(s.millSim.metrics);
});

// Re-init when navigating back to the view without a full page reload
window.addEventListener('mill:show', () => {
  initMillView();
  startMillAnimation();
});

// Stop animation when leaving the view
window.addEventListener('hashchange', () => {
  if (location.hash !== '#mill') {
    stopMillAnimation();
  } else {
    startMillAnimation();
  }
});
