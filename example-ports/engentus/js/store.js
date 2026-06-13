/**
 * store.js — Centralised state management.
 *
 * Exports:
 *   REMOVE          — sentinel: pass as a patch value to delete a key
 *   deepMerge       — recursive object merge with REMOVE support
 *   DEFAULT_STATE   — canonical default state shape
 *   PARAM_META      — bolt parameter metadata (labels, units, ranges)
 *   PARAM_CATS      — category display names
 *   getState()      — returns the current immutable state snapshot
 *   setState(patch) — merges patch, schedules persistence, notifies subscribers
 *   subscribe(fn)   — registers a subscriber; returns unsubscribe fn
 *   _initState(s)   — direct state init (bypasses subscribers/save — init only)
 *   onSave(fn)      — registers the persistence callback (called by storage.js)
 */

// ── Sentinel ──────────────────────────────────────────────────────────
export const REMOVE = Symbol('REMOVE');

// ── Deep merge with REMOVE support ───────────────────────────────────
export function deepMerge(t, s) {
  if (s === REMOVE) return undefined;
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return s;
  const r = { ...t };
  for (const k of Object.keys(s)) {
    if (s[k] === REMOVE) { delete r[k]; }
    else { r[k] = deepMerge(t?.[k], s[k]); }
  }
  return r;
}

// ── Parameter metadata ────────────────────────────────────────────────
// type:'range'  — rendered as slider + distribution editor
// type:'toggle' — rendered as checkbox (value is 0 or 1)
export const PARAM_META = {
  // Preload & Relaxation
  preload_stress_MPa:  { label:'Initial preload',         unit:'MPa',  min:100,    max:900,    step:10,      cat:'preload',  type:'range',  fmt:v=>v.toFixed(0)          },
  preload_utilisation: { label:'Utilisation factor',      unit:'',     min:0.1,    max:1.0,    step:0.01,    cat:'preload',  type:'range',  fmt:v=>v.toFixed(2)          },
  tau_a:               { label:'Relaxation τ_a',          unit:'',     min:1,      max:100,    step:0.5,     cat:'preload',  type:'range',  fmt:v=>v.toFixed(1)          },
  tau_b:               { label:'Relaxation τ_b',          unit:'',     min:0.05,   max:1.0,    step:0.005,   cat:'preload',  type:'range',  fmt:v=>v.toFixed(3)          },
  tau_c:               { label:'Relaxation τ_c',          unit:'',     min:1,      max:100,    step:0.5,     cat:'preload',  type:'range',  fmt:v=>v.toFixed(1)          },
  // Load
  F_alt_applied_N:     { label:'Applied shear F',         unit:'N',    min:500,    max:100000, step:500,     cat:'load',     type:'range',  fmt:v=>v.toFixed(0)          },
  angular_span_factor: { label:'Angular span factor',     unit:'',     min:0.1,    max:3.0,    step:0.05,    cat:'load',     type:'range',  fmt:v=>v.toFixed(2)          },
  rpm:                 { label:'Mill speed',               unit:'RPM',  min:5,      max:20,     step:0.5,     cat:'load',     type:'range',  fmt:v=>v.toFixed(1)          },
  // Joint
  jemtec_enabled:      { label:'Jemtec insert',           unit:'',     min:0,      max:1,      step:1,       cat:'joint',    type:'toggle', fmt:v=>v>0.5?'Yes':'No'      },
  mu_joint:            { label:'Friction coeff. μ',       unit:'',     min:0.0,    max:0.60,   step:0.01,    cat:'joint',    type:'range',  fmt:v=>v.toFixed(2)          },
  n_bolts:             { label:'Bolts in joint',           unit:'',     min:1,      max:16,     step:1,       cat:'joint',    type:'range',  fmt:v=>v.toFixed(0)          },
  n_interfaces:        { label:'Friction interfaces',      unit:'',     min:1,      max:4,      step:1,       cat:'joint',    type:'range',  fmt:v=>v.toFixed(0)          },
  rubber_shoreA:       { label:'Rubber Shore A',           unit:'',     min:20,     max:95,     step:1,       cat:'joint',    type:'range',  fmt:v=>v.toFixed(0)          },
  rubber_thickness_m:  { label:'Rubber thickness',         unit:'mm',   min:0.003,  max:0.030,  step:0.0005,  cat:'joint',    type:'range',  fmt:v=>(v*1000).toFixed(1)   },
  rubber_area_m2:      { label:'Rubber area',              unit:'cm²',  min:0.005,  max:0.200,  step:0.001,   cat:'joint',    type:'range',  fmt:v=>(v*1e4).toFixed(0)    },
  rubber_nu:           { label:'Rubber Poisson ν',         unit:'',     min:0.40,   max:0.50,   step:0.005,   cat:'joint',    type:'range',  fmt:v=>v.toFixed(3)          },
  relax_a:             { label:'Rubber relax α',           unit:'',     min:0,      max:2.0,    step:0.01,    cat:'joint',    type:'range',  fmt:v=>v.toFixed(2)          },
  relax_b:             { label:'Rubber relax β',           unit:'',     min:0,      max:1.0,    step:0.01,    cat:'joint',    type:'range',  fmt:v=>v.toFixed(2)          },
  // Bolt Geometry
  L_grip:              { label:'Grip length',              unit:'mm',   min:0.040,  max:0.300,  step:0.001,   cat:'geometry', type:'range',  fmt:v=>(v*1000).toFixed(0)   },
  head_direction:      { label:'Head aligned to load',     unit:'',     min:0,      max:1,      step:1,       cat:'geometry', type:'toggle', fmt:v=>v<0.5?'Aligned':'Perp.'},
  D_Shank:             { label:'Shank diameter',           unit:'mm',   min:0.020,  max:0.100,  step:0.001,   cat:'geometry', type:'range',  fmt:v=>(v*1000).toFixed(0)   },
  D_minor:             { label:'Minor (root) diameter',    unit:'mm',   min:0.015,  max:0.090,  step:0.001,   cat:'geometry', type:'range',  fmt:v=>(v*1000).toFixed(0)   },
  A_s_nom:             { label:'Stress area A_s',          unit:'mm²',  min:2e-4,   max:4e-3,   step:1e-5,    cat:'geometry', type:'range',  fmt:v=>(v*1e6).toFixed(0)    },
  length_factor:       { label:'Length factor k_L',        unit:'',     min:1.0,    max:2.0,    step:0.005,   cat:'geometry', type:'range',  fmt:v=>v.toFixed(3)          },
  // Material & Fatigue
  uts_MPa:             { label:'UTS',                      unit:'MPa',  min:200,    max:1400,   step:10,      cat:'fatigue',  type:'range',  fmt:v=>v.toFixed(0)          },
  sn_sigma_lim:        { label:'Endurance limit σ_lim',    unit:'MPa',  min:20,     max:120,    step:1,       cat:'fatigue',  type:'range',  fmt:v=>v.toFixed(0)          },
  sn_m:                { label:'SN slope m',                unit:'',     min:2.0,    max:8.0,    step:0.1,     cat:'fatigue',  type:'range',  fmt:v=>v.toFixed(1)          },
  yield_stress_MPa:    { label:'Yield stress',             unit:'MPa',  min:100,    max:1200,   step:10,      cat:'fatigue',  type:'range',  fmt:v=>v.toFixed(0)          },
  E_bolt_GPa:          { label:'Young\'s modulus E',       unit:'GPa',  min:100,    max:300,    step:1,       cat:'fatigue',  type:'range',  fmt:v=>v.toFixed(0)          },
};

export const PARAM_CATS = {
  preload:  'Preload & Relaxation',
  load:     'Load',
  joint:    'Joint Properties',
  geometry: 'Bolt Geometry',
  fatigue:  'Material & Fatigue',
};

// ── Default bolt parameters ───────────────────────────────────────────
// Distribution spec per param: value (nominal), free (sample in MC?),
// dist (distribution type), then dist-specific params.
// Values match R mc_spec_default in scripts/goodman plots.r (std = two_sd/2).
const _DP_RUBBER = {
  // Preload & Relaxation
  preload_stress_MPa:  { value:600,      free:true,  dist:'normal',  mean:600,      std:30,      umin:450,   umax:800,    lm:6.40,  ls:0.050, tri_a:450,    tri_c:600,    tri_b:800    },
  preload_utilisation: { value:0.65,     free:true,  dist:'uniform', mean:0.65,     std:0.05,    umin:0.50,  umax:0.85,   lm:-0.43, ls:0.080, tri_a:0.5,    tri_c:0.65,   tri_b:0.85   },
  tau_a:               { value:28.60,    free:true,  dist:'normal',  mean:28.60,    std:2.0,     umin:20,    umax:40,     lm:3.35,  ls:0.070, tri_a:22,     tri_c:28.60,  tri_b:40     },
  tau_b:               { value:0.587,    free:true,  dist:'normal',  mean:0.587,    std:0.05,    umin:0.40,  umax:0.80,   lm:-0.53, ls:0.090, tri_a:0.40,   tri_c:0.587,  tri_b:0.80   },
  tau_c:               { value:30.14,    free:true,  dist:'normal',  mean:30.14,    std:2.0,     umin:20,    umax:42,     lm:3.41,  ls:0.070, tri_a:23,     tri_c:30.14,  tri_b:42     },
  // Load
  F_alt_applied_N:     { value:10000,    free:true,  dist:'normal',  mean:10000,    std:1000,    umin:4000,  umax:20000,  lm:9.21,  ls:0.100, tri_a:5000,   tri_c:10000,  tri_b:18000  },
  angular_span_factor: { value:1.0,      free:true,  dist:'normal',  mean:1.0,      std:0.025,   umin:0.70,  umax:1.30,   lm:0.00,  ls:0.025, tri_a:0.80,   tri_c:1.0,    tri_b:1.20   },
  rpm:                 { value:11,       free:false, dist:'fixed',   mean:11,       std:0.5,     umin:9,     umax:13,     lm:2.40,  ls:0.050, tri_a:9,      tri_c:11,     tri_b:13     },
  // Joint
  jemtec_enabled:      { value:0,        free:false, dist:'bernoulli', prob:0 },
  mu_joint:            { value:0.30,     free:true,  dist:'normal',  mean:0.30,     std:0.025,   umin:0.15,  umax:0.50,   lm:-1.20, ls:0.085, tri_a:0.15,   tri_c:0.30,   tri_b:0.50   },
  n_bolts:             { value:4,        free:false, dist:'fixed',   mean:4,        std:0        },
  n_interfaces:        { value:2,        free:false, dist:'fixed',   mean:2,        std:0        },
  rubber_shoreA:       { value:70,       free:true,  dist:'normal',  mean:70,       std:2.5,     umin:50,    umax:90,     lm:4.25,  ls:0.036, tri_a:55,     tri_c:70,     tri_b:90     },
  rubber_thickness_m:  { value:0.010,    free:true,  dist:'normal',  mean:0.010,    std:0.0005,  umin:0.007, umax:0.015,  lm:-4.61, ls:0.050, tri_a:0.007,  tri_c:0.010,  tri_b:0.015  },
  rubber_area_m2:      { value:0.020,    free:false, dist:'fixed',   mean:0.020,    std:0        },
  rubber_nu:           { value:0.49,     free:false, dist:'fixed',   mean:0.49,     std:0        },
  relax_a:             { value:0,        free:false, dist:'fixed',   mean:0,        std:0        },
  relax_b:             { value:0,        free:false, dist:'fixed',   mean:0,        std:0        },
  // Geometry (M48 nominal)
  L_grip:              { value:0.105,    free:true,  dist:'normal',  mean:0.105,    std:0.0025,  umin:0.090, umax:0.125,  lm:-2.25, ls:0.024, tri_a:0.090,  tri_c:0.105,  tri_b:0.125  },
  head_direction:      { value:0,        free:false, dist:'bernoulli', prob:0.5 },
  D_Shank:             { value:0.048,    free:false, dist:'fixed',   mean:0.048,    std:0        },
  D_minor:             { value:0.041,    free:false, dist:'fixed',   mean:0.041,    std:0        },
  A_s_nom:             { value:1.473e-3, free:false, dist:'fixed',   mean:1.473e-3, std:0        },
  length_factor:       { value:1.190,    free:false, dist:'fixed',   mean:1.190,    std:0        },
  // Material & Fatigue
  uts_MPa:             { value:1040,     free:true,  dist:'normal',  mean:1040,     std:25,      umin:900,   umax:1200,   lm:6.95,  ls:0.024, tri_a:900,    tri_c:1040,   tri_b:1200   },
  sn_sigma_lim:        { value:50,       free:true,  dist:'normal',  mean:50,       std:4,       umin:35,    umax:70,     lm:3.91,  ls:0.080, tri_a:35,     tri_c:50,     tri_b:70     },
  sn_m:                { value:4.6,      free:false, dist:'fixed',   mean:4.6,      std:0        },
  yield_stress_MPa:    { value:600,      free:false, dist:'fixed',   mean:600,      std:0        },
  E_bolt_GPa:          { value:200,      free:false, dist:'fixed',   mean:200,      std:0        },
};

// Jemtec insert: same as Rubber but with jemtec_enabled = 1.
const _DP_JEMTEC = JSON.parse(JSON.stringify(_DP_RUBBER));
_DP_JEMTEC.jemtec_enabled.value = 1;
_DP_JEMTEC.jemtec_enabled.prob  = 1;

const _DEFAULT_CHART_EDIT = {
  title:       'Goodman Fatigue Diagram — M48 Mill Liner Bolt',
  xLabel:      'Preload / Mean Stress  (MPa)',
  yLabel:      'Alternating Bending Stress  (MPa)',
  titleSize:   13,
  axisSize:    12,
  bandFills:   ['#bbf7d0','#d9f99d','#fef08a','#fde68a'],
  bandStrokes: ['#86efac','#bef264','#fde047','#fbbf24'],
  showGrid:    true,
  annotations: [],
};

export const DEFAULT_STATE = {
  version: 7,
  boltSets: {
    bs_rubber: { id:'bs_rubber', name:'No Jemtec',  color:'#dc2626', visible:true, params:_DP_RUBBER },
    bs_jemtec: { id:'bs_jemtec', name:'Jemtec', color:'#8CC4D4', visible:true, params:_DP_JEMTEC },
  },
  simulations: {},
  staticView: {
    F_alt_applied_N: 10000,
    rpm:             11,
    probe:           300,
    sigma_lim:       50,
    m_slope:         4.6,
    show_rubber:     true,
    show_jemtec:     true,
  },
  chartEdit: _DEFAULT_CHART_EDIT,
  millSim: {
    params: {
      speedFrac:         0.75,
      fillFrac:          0.30,
      slurryContent:     0.20,
      wallFriction:      0.50,
      internalFriction:  35,
      bulkDensity:       1800,
      millRadius:        3.5,
    },
    metrics: null,
  },
  ui: {
    mode: 'static',
    activeSimId: null,
    openBsSets: { bs_rubber:false, bs_jemtec:false },
    scrubber: { t:0, tMax:24, playing:false, speed:1, showTrail:false },
    windows: {
      cdf:  { xf:0.56, yf:0.07, wf:0.39, hf:0.46, visible:false, z:10 },
      stats:{ xf:0.56, yf:0.57, wf:0.39, hf:0.32, visible:false, z:11 },
      anova:{ xf:0.20, yf:0.46, wf:0.36, hf:0.42, visible:false, z:12 },
    },
    maxZ: 12,
  },
};

// ── State core ────────────────────────────────────────────────────────
let STATE = DEFAULT_STATE;
const SUBS = new Set();
let _saveTimer = null;
let _saveFn = null;

export const _initState = (s) => { STATE = s; };
export const onSave = (fn) => { _saveFn = fn; };
export const getState  = () => STATE;
export const subscribe = (fn) => { SUBS.add(fn); return () => SUBS.delete(fn); };

export function setState(patchOrFn) {
  const patch = typeof patchOrFn === 'function' ? patchOrFn(STATE) : patchOrFn;
  STATE = deepMerge(STATE, patch);
  if (_saveFn) { clearTimeout(_saveTimer); _saveTimer = setTimeout(_saveFn, 400); }
  SUBS.forEach(fn => fn(STATE));
}
