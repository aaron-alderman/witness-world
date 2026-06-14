/**
 * simulation.js — Monte Carlo engine and simulation CRUD.
 *
 * Does NOT call any UI functions directly.
 * Communicates results via the event bus:
 *   bus.emit('sim:progress', { simId })
 *   bus.emit('sim:done',     { simId })
 *   bus.emit('sim:stopped',  { simId })
 */
import { bolt_sigma_at, sigma_a_equiv, sn_life_cycles } from './physics.js';
import { mulberry32, seedRng, sampleBoltParams, pct } from './sampling.js';
import { getState, setState, REMOVE } from './store.js';
import bus from './bus.js';

// ── In-memory results (too large for localStorage) ────────────────────
// MC_RESULTS[simId][bsId] = { n, nSteps, tVals (shared), sigma_p, sigma_a, D, failureT, failureMode, params }
export const MC_RESULTS = {};

// Active simulation controller (pause / stop)
let _ctrl = null;
export const getSimCtrl = () => _ctrl;

// ── Typed array helpers ───────────────────────────────────────────────
function initBoltData(n, nSteps) {
  return {
    n, nSteps,
    sigma_p:     new Float32Array(n * nSteps),  // sigma_m — mean (preload) stress MPa
    sigma_a:     new Float32Array(n * nSteps),  // alternating bending stress MPa
    F_shear:     new Float32Array(n * nSteps),  // bolt shear force N
    D:           new Float32Array(n * nSteps),  // cumulative Miner damage
    failureT:    new Float32Array(n).fill(Infinity),
    failureMode: new Uint8Array(n),  // 0=alive 1=fatigue 2=static
    params:      new Array(n),
  };
}

function setBoltPt(bd, bi, si, sm, sa, Fs, d) {
  const o = bi * bd.nSteps + si;
  bd.sigma_p[o] = sm; bd.sigma_a[o] = sa; bd.F_shear[o] = Fs; bd.D[o] = d;
}

function runBoltChunk(bd, bsParams, tVals, start, end) {
  const nSteps    = bd.nSteps;
  const dt_months = tVals.length > 1 ? tVals[1] - tVals[0] : 0.5;
  for (let i = start; i < end; i++) {
    const p   = sampleBoltParams(bsParams);
    bd.params[i] = p;
    let D = 0;
    const cps = p.rpm * 60 * 24 * 30 * dt_months;  // cycles per time step
    for (let s = 0; s < nSteps; s++) {
      const { sigma_m, sigma_a, F_shear_alt } = bolt_sigma_at(p, tVals[s]);
      // Clamp sigma_m before Goodman to avoid division by zero near UTS
      const sm_safe = Math.min(sigma_m, p.uts_MPa * 0.999);
      const sigma_e = Math.max(sigma_a_equiv(sigma_a, sm_safe, p.uts_MPa), 0);
      const N_i     = sn_life_cycles(sigma_e, p.sn_sigma_lim, p.sn_m);
      D += (isFinite(N_i) && N_i > 0) ? cps / N_i : 0;
      setBoltPt(bd, i, s, sigma_m, sigma_a, F_shear_alt, D);
      if (bd.failureT[i] === Infinity) {
        if (sigma_m + sigma_a >= p.yield_stress_MPa) { bd.failureT[i] = tVals[s]; bd.failureMode[i] = 2; }
        else if (D >= 1)                              { bd.failureT[i] = tVals[s]; bd.failureMode[i] = 1; }
      }
    }
  }
}

// ── Main simulation runner ────────────────────────────────────────────
export async function runSimulation(simId) {
  const ctrl = { running: true, paused: false };
  _ctrl = ctrl;

  const s = getState();
  const sim = s.simulations[simId];
  const { nBolts = 500, tMax = 24, dt = 0.5 } = sim.config;
  const bsIds = sim.boltSetIds.filter(id => s.boltSets[id]);
  const nSteps = Math.round(tMax / dt) + 1;
  const tVals = Float32Array.from({ length: nSteps }, (_, i) => i * dt);
  const chunkSize = 50;
  const totalBolts = nBolts * bsIds.length;
  let done = 0;

  MC_RESULTS[simId] = { tVals };
  for (const bsId of bsIds) MC_RESULTS[simId][bsId] = initBoltData(nBolts, nSteps);

  setState({ simulations: { [simId]: { status: 'running', progress: 0 } } });

  for (const bsId of bsIds) {
    if (!ctrl.running) break;
    const bd = MC_RESULTS[simId][bsId];
    const bsParams = s.boltSets[bsId].params;
    seedRng(sim.config.seed ?? 42);

    for (let b = 0; b < nBolts; b += chunkSize) {
      if (!ctrl.running) break;
      while (ctrl.paused) await new Promise(r => setTimeout(r, 60));
      runBoltChunk(bd, bsParams, tVals, b, Math.min(b + chunkSize, nBolts));
      done += Math.min(chunkSize, nBolts - b);
      const prog = done / totalBolts;
      setState({ simulations: { [simId]: { progress: prog } } });

      // Notify UI every ~5 chunks for real-time streaming
      if (Math.round(done / chunkSize) % 5 === 0) {
        bus.emit('sim:progress', { simId });
      }
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (ctrl.running) {
    const summary = buildSummary(simId);
    setState({ simulations: { [simId]: { status: 'done', progress: 1, summary } } });
    bus.emit('sim:done', { simId });
  } else {
    setState({ simulations: { [simId]: { status: 'stopped', progress: 0 } } });
    bus.emit('sim:stopped', { simId });
  }
  _ctrl = null;
}

// ── Summary statistics ────────────────────────────────────────────────
export function buildSummary(simId) {
  const res = MC_RESULTS[simId]; if (!res) return {};
  const out = {};
  for (const bsId of Object.keys(res)) {
    if (bsId === 'tVals') continue;
    const bd = res[bsId];
    const fts = Array.from(bd.failureT).filter(v => isFinite(v));
    fts.sort((a, b) => a - b);
    const pFail = fts.length / bd.n;
    out[bsId] = {
      n: bd.n,
      nFailed: fts.length,
      pFail,
      meanT: fts.length ? fts.reduce((a,b)=>a+b,0)/fts.length : null,
      stdT:  fts.length > 1
        ? Math.sqrt(fts.reduce((s,v)=>s+Math.pow(v-(fts.reduce((a,b)=>a+b,0)/fts.length),2),0)/(fts.length-1))
        : 0,
      p10: fts.length ? pct(fts, 0.10) : null,
      p50: fts.length ? pct(fts, 0.50) : null,
      p90: fts.length ? pct(fts, 0.90) : null,
    };
  }
  return out;
}

/** Return the (sigma_p, sigma_a, F_shear, D) for bolt boltIdx at time t. */
export function getBoltStateAtT(bd, boltIdx, t, tVals) {
  const nSteps = bd.nSteps, o = boltIdx * nSteps;
  if (!tVals) return { sp: bd.sigma_p[o], sa: bd.sigma_a[o], Fs: bd.F_shear[o], D: bd.D[o] };
  const failed  = bd.failureT[boltIdx];
  const tCapped = isFinite(failed) && failed <= t ? failed : t;
  let idx = Math.round(tCapped / (tVals[1] || 0.5));
  idx = Math.max(0, Math.min(idx, nSteps - 1));
  const oo = o + idx;
  return { sp: bd.sigma_p[oo], sa: bd.sigma_a[oo], Fs: bd.F_shear[oo], D: bd.D[oo] };
}

/** Canonical tMax for the active simulation (reads data, never setState). */
export function getSimTMax() {
  const s = getState();
  const sim = s.simulations[s.ui.activeSimId];
  const res = MC_RESULTS[sim?.id];
  if (res?.tVals?.length) return res.tVals[res.tVals.length - 1];
  return sim?.config?.tMax ?? s.ui.scrubber.tMax ?? 24;
}

// ── Simulation CRUD ───────────────────────────────────────────────────
export function createSim() {
  const id = 'sim_' + Date.now();
  const bsIds = Object.keys(getState().boltSets).slice(0, 2);
  setState({ simulations: { [id]: {
    id, name: `Simulation ${Object.keys(getState().simulations).length + 1}`,
    boltSetIds: bsIds, config: { nBolts:500, tMax:24, dt:0.5, seed:42 },
    status: 'stale', progress: 0, summary: null,
  }}});
  setState({ ui: { activeSimId: id } });
}

export function deleteSim(id) {
  const newActive = getState().ui.activeSimId === id ? null : getState().ui.activeSimId;
  delete MC_RESULTS[id];
  setState({ simulations: { [id]: REMOVE }, ui: { activeSimId: newActive } });
}

export function cloneSim(id) {
  const orig = getState().simulations[id]; if (!orig) return;
  const nid = 'sim_' + Date.now();
  setState({ simulations: { [nid]: {
    ...JSON.parse(JSON.stringify(orig)),
    id: nid, name: orig.name + ' (copy)', status: 'stale', progress: 0, summary: null,
  }}});
  setState({ ui: { activeSimId: nid } });
}

export function deleteBoltSet(id) {
  setState({ boltSets: { [id]: REMOVE }, ui: { openBsSets: { [id]: REMOVE } } });
}

export function cloneBoltSet(id) {
  const orig = getState().boltSets[id]; if (!orig) return;
  const nid = 'bs_' + Date.now();
  const colors = ['#EC7424','#8CC4D4','#7c3aed','#be185d','#0891b2'];
  setState({ boltSets: { [nid]: {
    ...JSON.parse(JSON.stringify(orig)),
    id: nid, name: orig.name + ' (copy)',
    color: colors[Math.floor(Math.random() * colors.length)],
  }}});
  setState({ ui: { openBsSets: { [nid]: false } } });
}
