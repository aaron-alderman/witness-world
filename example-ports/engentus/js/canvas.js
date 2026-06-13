/**
 * canvas.js — MC canvas overlay (bolt dot trajectories).
 *
 * Reads xSc/ySc/MAR from chart.js live bindings.
 * Reads MC_RESULTS and getBoltStateAtT from simulation.js.
 */
import { xSc, ySc, MAR } from './chart.js';
import { MC_RESULTS, getBoltStateAtT } from './simulation.js';
import { getState } from './store.js';

export function hexAlpha(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

export function clearMCCanvas() {
  const c = document.getElementById('mc-canvas');
  if (!c) return;
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

export function drawMCCanvas(t) {
  const canvas = document.getElementById('mc-canvas');
  const el     = document.getElementById('chart-wrap');
  canvas.width  = el.clientWidth;
  canvas.height = el.clientHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const s = getState();
  const simId = s.ui.activeSimId;
  if (!simId || !MC_RESULTS[simId]) return;
  const res = MC_RESULTS[simId];
  const tVals = res.tVals;
  const MAX_TRACES = 200;

  for (const bsId of Object.keys(s.boltSets)) {
    const bd = res[bsId]; if (!bd) continue;
    const bs = s.boltSets[bsId]; if (!bs?.visible) continue;
    const col = bs.color;
    const showTrail = s.ui.scrubber.showTrail ?? false;
    const dt = tVals[1] || 0.5;
    const traceN = Math.min(bd.n, MAX_TRACES);

    // Trajectory traces (subset)
    ctx.lineWidth = 0.7;
    for (let i = 0; i < traceN; i++) {
      const failed = bd.failureT[i];
      const tEnd   = isFinite(failed) && failed <= t ? failed : t;
      const steps  = Math.round(tEnd / dt);
      if (steps < 1) continue;
      ctx.strokeStyle = hexAlpha(col, 0.09);
      ctx.beginPath();
      const o = i * bd.nSteps;
      ctx.moveTo(xSc(bd.sigma_p[o]) + MAR.left, ySc(bd.sigma_a[o]) + MAR.top);
      for (let s2 = 1; s2 <= Math.min(steps, bd.nSteps-1); s2++) {
        ctx.lineTo(xSc(bd.sigma_p[o+s2]) + MAR.left, ySc(bd.sigma_a[o+s2]) + MAR.top);
      }
      ctx.stroke();
      // Monthly snail-trail dots
      if (showTrail) {
        ctx.fillStyle = hexAlpha(col, 0.35);
        for (let mo = 1; mo <= Math.floor(tEnd); mo++) {
          const si = Math.min(Math.round(mo / dt), bd.nSteps-1);
          ctx.beginPath();
          ctx.arc(xSc(bd.sigma_p[o+si]) + MAR.left, ySc(bd.sigma_a[o+si]) + MAR.top, 1.8, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }

    // Current position dots (all bolts)
    for (let i = 0; i < bd.n; i++) {
      const st     = getBoltStateAtT(bd, i, t, tVals);
      const cx     = xSc(st.sp) + MAR.left;
      const cy     = ySc(st.sa) + MAR.top;
      const failed = isFinite(bd.failureT[i]) && bd.failureT[i] <= t;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI*2);
      ctx.fillStyle = failed ? 'rgba(100,100,100,0.35)' : hexAlpha(col, 0.55);
      ctx.fill();
    }
  }
}
