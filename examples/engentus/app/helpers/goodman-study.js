const SN_ND = 2e6;
const REMOVE = Symbol("REMOVE");

const K_F_HEAD = [3.0, 1.0];
const K_F_NUT = [2.5, 2.5];
const LEVER_HEAD = [0.5, 0.0];
const LEVER_NUT = [0.5, 1.0];

export const PARAM_META = {
  preload_stress_MPa:  { label: "Initial preload", unit: "MPa", min: 100, max: 900, step: 10, cat: "preload", type: "range", format: value => value.toFixed(0) },
  preload_utilisation: { label: "Utilisation factor", unit: "", min: 0.1, max: 1.0, step: 0.01, cat: "preload", type: "range", format: value => value.toFixed(2) },
  tau_a:               { label: "Relaxation tau_a", unit: "", min: 1, max: 100, step: 0.5, cat: "preload", type: "range", format: value => value.toFixed(1) },
  tau_b:               { label: "Relaxation tau_b", unit: "", min: 0.05, max: 1.0, step: 0.005, cat: "preload", type: "range", format: value => value.toFixed(3) },
  tau_c:               { label: "Relaxation tau_c", unit: "", min: 1, max: 100, step: 0.5, cat: "preload", type: "range", format: value => value.toFixed(1) },
  F_alt_applied_N:     { label: "Applied shear F", unit: "N", min: 500, max: 100000, step: 500, cat: "load", type: "range", format: value => value.toFixed(0) },
  angular_span_factor: { label: "Angular span factor", unit: "", min: 0.1, max: 3.0, step: 0.05, cat: "load", type: "range", format: value => value.toFixed(2) },
  rpm:                 { label: "Mill speed", unit: "RPM", min: 5, max: 20, step: 0.5, cat: "load", type: "range", format: value => value.toFixed(1) },
  jemtec_enabled:      { label: "Jemtec insert", unit: "", min: 0, max: 1, step: 1, cat: "joint", type: "toggle", format: value => value > 0.5 ? "Yes" : "No" },
  mu_joint:            { label: "Friction coeff. mu", unit: "", min: 0.0, max: 0.60, step: 0.01, cat: "joint", type: "range", format: value => value.toFixed(2) },
  n_bolts:             { label: "Bolts in joint", unit: "", min: 1, max: 16, step: 1, cat: "joint", type: "range", format: value => value.toFixed(0) },
  n_interfaces:        { label: "Friction interfaces", unit: "", min: 1, max: 4, step: 1, cat: "joint", type: "range", format: value => value.toFixed(0) },
  rubber_shoreA:       { label: "Rubber Shore A", unit: "", min: 20, max: 95, step: 1, cat: "joint", type: "range", format: value => value.toFixed(0) },
  rubber_thickness_m:  { label: "Rubber thickness", unit: "mm", min: 0.003, max: 0.030, step: 0.0005, cat: "joint", type: "range", format: value => (value * 1000).toFixed(1) },
  rubber_area_m2:      { label: "Rubber area", unit: "cm²", min: 0.005, max: 0.200, step: 0.001, cat: "joint", type: "range", format: value => (value * 1e4).toFixed(0) },
  rubber_nu:           { label: "Rubber Poisson nu", unit: "", min: 0.40, max: 0.50, step: 0.005, cat: "joint", type: "range", format: value => value.toFixed(3) },
  relax_a:             { label: "Rubber relax alpha", unit: "", min: 0, max: 2.0, step: 0.01, cat: "joint", type: "range", format: value => value.toFixed(2) },
  relax_b:             { label: "Rubber relax beta", unit: "", min: 0, max: 1.0, step: 0.01, cat: "joint", type: "range", format: value => value.toFixed(2) },
  L_grip:              { label: "Grip length", unit: "mm", min: 0.040, max: 0.300, step: 0.001, cat: "geometry", type: "range", format: value => (value * 1000).toFixed(0) },
  head_direction:      { label: "Head aligned to load", unit: "", min: 0, max: 1, step: 1, cat: "geometry", type: "toggle", format: value => value < 0.5 ? "Aligned" : "Perp." },
  D_Shank:             { label: "Shank diameter", unit: "mm", min: 0.020, max: 0.100, step: 0.001, cat: "geometry", type: "range", format: value => (value * 1000).toFixed(0) },
  D_minor:             { label: "Minor diameter", unit: "mm", min: 0.015, max: 0.090, step: 0.001, cat: "geometry", type: "range", format: value => (value * 1000).toFixed(0) },
  A_s_nom:             { label: "Stress area A_s", unit: "mm²", min: 2e-4, max: 4e-3, step: 1e-5, cat: "geometry", type: "range", format: value => (value * 1e6).toFixed(0) },
  length_factor:       { label: "Length factor k_L", unit: "", min: 1.0, max: 2.0, step: 0.005, cat: "geometry", type: "range", format: value => value.toFixed(3) },
  uts_MPa:             { label: "UTS", unit: "MPa", min: 200, max: 1400, step: 10, cat: "fatigue", type: "range", format: value => value.toFixed(0) },
  sn_sigma_lim:        { label: "Endurance limit sigma_lim", unit: "MPa", min: 20, max: 120, step: 1, cat: "fatigue", type: "range", format: value => value.toFixed(0) },
  sn_m:                { label: "SN slope m", unit: "", min: 2.0, max: 8.0, step: 0.1, cat: "fatigue", type: "range", format: value => value.toFixed(1) },
  yield_stress_MPa:    { label: "Yield stress", unit: "MPa", min: 100, max: 1200, step: 10, cat: "fatigue", type: "range", format: value => value.toFixed(0) },
  E_bolt_GPa:          { label: "Young's modulus E", unit: "GPa", min: 100, max: 300, step: 1, cat: "fatigue", type: "range", format: value => value.toFixed(0) }
};

export const PARAM_CATS = {
  preload: "Preload & Relaxation",
  load: "Load",
  joint: "Joint Properties",
  geometry: "Bolt Geometry",
  fatigue: "Material & Fatigue"
};

const STATIC_FIELDS = [
  { key: "F_alt_applied_N", label: "Applied shear F", min: 500, max: 100000, step: 500, format: value => value.toFixed(0) },
  { key: "rpm", label: "Mill speed", min: 5, max: 20, step: 0.5, format: value => value.toFixed(1) },
  { key: "probe", label: "Probe mean stress", min: 0, max: 650, step: 5, format: value => value.toFixed(0) },
  { key: "sigma_lim", label: "Endurance limit", min: 20, max: 120, step: 1, format: value => value.toFixed(0) },
  { key: "m_slope", label: "SN slope", min: 2, max: 8, step: 0.1, format: value => value.toFixed(1) }
];

const _DP_RUBBER = {
  preload_stress_MPa:  { value: 600, free: true, dist: "normal", mean: 600, std: 30, umin: 450, umax: 800, lm: 6.40, ls: 0.050, tri_a: 450, tri_c: 600, tri_b: 800 },
  preload_utilisation: { value: 0.65, free: true, dist: "uniform", mean: 0.65, std: 0.05, umin: 0.50, umax: 0.85, lm: -0.43, ls: 0.080, tri_a: 0.5, tri_c: 0.65, tri_b: 0.85 },
  tau_a:               { value: 28.60, free: true, dist: "normal", mean: 28.60, std: 2.0, umin: 20, umax: 40, lm: 3.35, ls: 0.070, tri_a: 22, tri_c: 28.60, tri_b: 40 },
  tau_b:               { value: 0.587, free: true, dist: "normal", mean: 0.587, std: 0.05, umin: 0.40, umax: 0.80, lm: -0.53, ls: 0.090, tri_a: 0.40, tri_c: 0.587, tri_b: 0.80 },
  tau_c:               { value: 30.14, free: true, dist: "normal", mean: 30.14, std: 2.0, umin: 20, umax: 42, lm: 3.41, ls: 0.070, tri_a: 23, tri_c: 30.14, tri_b: 42 },
  F_alt_applied_N:     { value: 10000, free: true, dist: "normal", mean: 10000, std: 1000, umin: 4000, umax: 20000, lm: 9.21, ls: 0.100, tri_a: 5000, tri_c: 10000, tri_b: 18000 },
  angular_span_factor: { value: 1.0, free: true, dist: "normal", mean: 1.0, std: 0.025, umin: 0.70, umax: 1.30, lm: 0.00, ls: 0.025, tri_a: 0.80, tri_c: 1.0, tri_b: 1.20 },
  rpm:                 { value: 11, free: false, dist: "fixed", mean: 11, std: 0.5, umin: 9, umax: 13, lm: 2.40, ls: 0.050, tri_a: 9, tri_c: 11, tri_b: 13 },
  jemtec_enabled:      { value: 0, free: false, dist: "bernoulli", prob: 0 },
  mu_joint:            { value: 0.30, free: true, dist: "normal", mean: 0.30, std: 0.025, umin: 0.15, umax: 0.50, lm: -1.20, ls: 0.085, tri_a: 0.15, tri_c: 0.30, tri_b: 0.50 },
  n_bolts:             { value: 4, free: false, dist: "fixed", mean: 4, std: 0 },
  n_interfaces:        { value: 2, free: false, dist: "fixed", mean: 2, std: 0 },
  rubber_shoreA:       { value: 70, free: true, dist: "normal", mean: 70, std: 2.5, umin: 50, umax: 90, lm: 4.25, ls: 0.036, tri_a: 55, tri_c: 70, tri_b: 90 },
  rubber_thickness_m:  { value: 0.010, free: true, dist: "normal", mean: 0.010, std: 0.0005, umin: 0.007, umax: 0.015, lm: -4.61, ls: 0.050, tri_a: 0.007, tri_c: 0.010, tri_b: 0.015 },
  rubber_area_m2:      { value: 0.020, free: false, dist: "fixed", mean: 0.020, std: 0 },
  rubber_nu:           { value: 0.49, free: false, dist: "fixed", mean: 0.49, std: 0 },
  relax_a:             { value: 0, free: false, dist: "fixed", mean: 0, std: 0 },
  relax_b:             { value: 0, free: false, dist: "fixed", mean: 0, std: 0 },
  L_grip:              { value: 0.105, free: true, dist: "normal", mean: 0.105, std: 0.0025, umin: 0.090, umax: 0.125, lm: -2.25, ls: 0.024, tri_a: 0.090, tri_c: 0.105, tri_b: 0.125 },
  head_direction:      { value: 0, free: false, dist: "bernoulli", prob: 0.5 },
  D_Shank:             { value: 0.048, free: false, dist: "fixed", mean: 0.048, std: 0 },
  D_minor:             { value: 0.041, free: false, dist: "fixed", mean: 0.041, std: 0 },
  A_s_nom:             { value: 1.473e-3, free: false, dist: "fixed", mean: 1.473e-3, std: 0 },
  length_factor:       { value: 1.190, free: false, dist: "fixed", mean: 1.190, std: 0 },
  uts_MPa:             { value: 1040, free: true, dist: "normal", mean: 1040, std: 25, umin: 900, umax: 1200, lm: 6.95, ls: 0.024, tri_a: 900, tri_c: 1040, tri_b: 1200 },
  sn_sigma_lim:        { value: 50, free: true, dist: "normal", mean: 50, std: 4, umin: 35, umax: 70, lm: 3.91, ls: 0.080, tri_a: 35, tri_c: 50, tri_b: 70 },
  sn_m:                { value: 4.6, free: false, dist: "fixed", mean: 4.6, std: 0 },
  yield_stress_MPa:    { value: 600, free: false, dist: "fixed", mean: 600, std: 0 },
  E_bolt_GPa:          { value: 200, free: false, dist: "fixed", mean: 200, std: 0 }
};

const _DP_JEMTEC = JSON.parse(JSON.stringify(_DP_RUBBER));
_DP_JEMTEC.jemtec_enabled.value = 1;
_DP_JEMTEC.jemtec_enabled.prob = 1;

const DEFAULT_CHART_EDIT = {
  title: "Goodman Fatigue Diagram - M48 Mill Liner Bolt",
  xLabel: "Preload / Mean Stress (MPa)",
  yLabel: "Alternating Bending Stress (MPa)",
  titleSize: 13,
  axisSize: 12,
  bandFills: ["#bbf7d0", "#d9f99d", "#fef08a", "#fde68a"],
  bandStrokes: ["#86efac", "#bef264", "#fde047", "#fbbf24"],
  showGrid: true,
  annotations: []
};

export const DEFAULT_STATE = {
  version: 7,
  boltSets: {
    bs_rubber: { id: "bs_rubber", name: "No Jemtec", color: "#dc2626", visible: true, params: _DP_RUBBER },
    bs_jemtec: { id: "bs_jemtec", name: "Jemtec", color: "#8CC4D4", visible: true, params: _DP_JEMTEC }
  },
  simulations: {},
  staticView: {
    F_alt_applied_N: 10000,
    rpm: 11,
    probe: 300,
    sigma_lim: 50,
    m_slope: 4.6,
    show_rubber: true,
    show_jemtec: true
  },
  chartEdit: DEFAULT_CHART_EDIT,
  ui: {
    mode: "static",
    activeSimId: null,
    openBsSets: { bs_rubber: false, bs_jemtec: false },
    scrubber: { t: 0, tMax: 24, playing: false, speed: 1, showTrail: false },
    windows: {
      cdf: { xf: 0.56, yf: 0.07, wf: 0.39, hf: 0.46, visible: false, z: 10 },
      stats: { xf: 0.56, yf: 0.57, wf: 0.39, hf: 0.32, visible: false, z: 11 },
      anova: { xf: 0.20, yf: 0.46, wf: 0.36, hf: 0.42, visible: false, z: 12 }
    },
    maxZ: 12
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, patch) {
  if (patch === REMOVE) return undefined;
  if (patch == null || typeof patch !== "object" || Array.isArray(patch)) return clone(patch);
  const result = target && typeof target === "object" && !Array.isArray(target) ? clone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === REMOVE) delete result[key];
    else result[key] = deepMerge(result[key], value);
  }
  return result;
}

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function randn(rng) {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleParam(spec, rng) {
  if (!spec.free) return spec.value;
  switch (spec.dist) {
    case "bernoulli": return rng() < (spec.prob ?? 0.5) ? 1 : 0;
    case "normal": return spec.mean + spec.std * randn(rng);
    case "uniform": return spec.umin + rng() * (spec.umax - spec.umin);
    case "lognormal": return Math.exp(spec.lm + spec.ls * randn(rng));
    case "triangular": {
      const draw = rng();
      const frac = (spec.tri_c - spec.tri_a) / (spec.tri_b - spec.tri_a);
      return draw < frac
        ? spec.tri_a + Math.sqrt(draw * (spec.tri_b - spec.tri_a) * (spec.tri_c - spec.tri_a))
        : spec.tri_b - Math.sqrt((1 - draw) * (spec.tri_b - spec.tri_a) * (spec.tri_b - spec.tri_c));
    }
    default: return spec.value;
  }
}

function sampleBoltParams(params, rng) {
  const out = {};
  for (const [key, spec] of Object.entries(params)) out[key] = sampleParam(spec, rng);
  return out;
}

function pct(values, quantile) {
  const index = (values.length - 1) * quantile;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return values[lo] + ((values[hi] ?? values[lo]) - values[lo]) * (index - lo);
}

function shoreAToEPa(shoreA) {
  return 1e6 * (0.0981 * (56 + 7.62336 * shoreA)) / (0.137505 * (254 - 2.54 * shoreA));
}

function boltBendingStiffness(E, I, L, headDirection) {
  return (headDirection < 0.5 ? 12 : 3) * E * I / Math.pow(L, 3);
}

function goodmanEquivalent(sa, sm, uts) {
  return uts > sm + 1e-9 ? sa * uts / (uts - sm) : (sa > 0 ? Infinity : 0);
}

function lifeCycles(sigmaE, sigmaLim, slope) {
  return sigmaE > sigmaLim ? SN_ND / Math.pow(sigmaE / sigmaLim, slope) : SN_ND;
}

function preloadRelaxation(hours, tauA, tauB, tauC) {
  return tauC / (tauA + Math.pow(Math.max(hours, 0), tauB));
}

function rubberDynModulus(Epa, hours, relaxA, relaxB) {
  return relaxB === 0 ? Epa : Epa * Math.pow(1 + relaxA * hours, -relaxB);
}

function sectionPropsRound(D) {
  return {
    A: Math.PI * D * D / 4,
    I: Math.PI * Math.pow(D, 4) / 64,
    y: D / 2
  };
}

function boltSigmaAt(params, timeMonths) {
  const timeHours = timeMonths * 720;
  const sigmaM = params.preload_stress_MPa * preloadRelaxation(timeHours, params.tau_a, params.tau_b, params.tau_c) * params.preload_utilisation;
  const shank = sectionPropsRound(params.D_Shank);
  const minor = sectionPropsRound(params.D_minor);
  const Zhead = shank.I / shank.y;
  const Znut = minor.I / minor.y;
  const headIndex = params.head_direction < 0.5 ? 0 : 1;
  const Er0 = shoreAToEPa(params.rubber_shoreA);
  const Ert = rubberDynModulus(Er0, timeHours, params.relax_a, params.relax_b);
  const Gr = Ert / (2 * (1 + params.rubber_nu));
  const krub = Gr * params.rubber_area_m2 / params.rubber_thickness_m;
  const kblt = boltBendingStiffness(params.E_bolt_GPa * 1e9, shank.I, params.L_grip, params.head_direction) * params.n_bolts;
  const gamma = kblt / (kblt + krub);
  const preloadForce = sigmaM * 1e6 * params.A_s_nom;
  const perBolt = params.F_alt_applied_N / params.n_bolts * params.angular_span_factor;
  const friction = params.mu_joint * preloadForce * params.n_interfaces;
  const Fshear = Math.max(gamma * perBolt, perBolt - friction);
  const headDirectionFactor = LEVER_HEAD[headIndex] > 0 ? 1 : 0;
  const Mhead = Fshear * LEVER_HEAD[headIndex] * params.L_grip * headDirectionFactor;
  const Mnut = Fshear * LEVER_NUT[headIndex] * params.L_grip;
  const sigHead = (Mhead / Zhead) / 1e6 * K_F_HEAD[headIndex];
  const sigNut = (Mnut / Znut) / 1e6 * K_F_NUT[headIndex];
  const sigmaA = Math.max(sigHead, sigNut) * params.length_factor;
  return { sigma_m: sigmaM, sigma_a: sigmaA, F_shear_alt: Fshear };
}

function summarizeResults(results) {
  const summary = {};
  for (const [boltSetId, boltData] of Object.entries(results.byBoltSet)) {
    const failures = Array.from(boltData.failureT).filter(value => Number.isFinite(value)).sort((a, b) => a - b);
    const pFail = failures.length / boltData.n;
    const mean = failures.length ? failures.reduce((total, value) => total + value, 0) / failures.length : null;
    const std = failures.length > 1
      ? Math.sqrt(failures.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / (failures.length - 1))
      : 0;
    summary[boltSetId] = {
      n: boltData.n,
      nFailed: failures.length,
      pFail,
      meanT: mean,
      stdT: std,
      p10: failures.length ? pct(failures, 0.10) : null,
      p50: failures.length ? pct(failures, 0.50) : null,
      p90: failures.length ? pct(failures, 0.90) : null
    };
  }
  return summary;
}

function chartParamsFromBoltSet(state, boltSet) {
  const params = boltSet?.params ?? {};
  return {
    rpm: state.staticView.rpm,
    sigma_lim: state.staticView.sigma_lim,
    m_slope: state.staticView.m_slope,
    uts: params.uts_MPa?.value ?? 1000,
    ys: params.yield_stress_MPa?.value ?? 600,
    F_alt_applied_N: state.staticView.F_alt_applied_N,
    n_bolts: params.n_bolts?.value ?? 4,
    n_interfaces: params.n_interfaces?.value ?? 2,
    mu_joint: params.mu_joint?.value ?? 0.4,
    angular_span_factor: params.angular_span_factor?.value ?? 1.0,
    A_s_nom: params.A_s_nom?.value ?? 0.001473,
    preload_utilisation: params.preload_utilisation?.value ?? 0.75,
    L_grip: params.L_grip?.value ?? 0.18,
    D_Shank: params.D_Shank?.value ?? 0.044,
    D_minor: params.D_minor?.value ?? 0.041,
    E_bolt_GPa: params.E_bolt_GPa?.value ?? 200,
    head_direction: params.head_direction?.value ?? 0,
    length_factor: params.length_factor?.value ?? 1.0,
    rubber_shoreA: params.rubber_shoreA?.value ?? 60,
    rubber_nu: params.rubber_nu?.value ?? 0.49,
    rubber_area_m2: params.rubber_area_m2?.value ?? 0.045,
    rubber_thickness_m: params.rubber_thickness_m?.value ?? 0.05,
    probe_sm: state.staticView.probe
  };
}

function visibleBoltSets(state) {
  return Object.values(state.boltSets).filter(boltSet => boltSet.visible);
}

function nextId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function winFrac(frame) {
  const width = globalThis.innerWidth || 1280;
  const height = globalThis.innerHeight || 900;
  return {
    xf: parseFloat(frame.left) / width,
    yf: parseFloat(frame.top) / height,
    wf: parseFloat(frame.width) / width,
    hf: parseFloat(frame.height) / height
  };
}

function anova(groups) {
  const values = groups.flatMap(group => group.values);
  const total = values.length;
  const count = groups.length;
  if (total < count + 1 || count < 2) return null;
  const grandMean = values.reduce((sum, value) => sum + value, 0) / total;
  const between = groups.reduce((sum, group) => {
    const mean = group.values.reduce((groupSum, value) => groupSum + value, 0) / group.values.length;
    return sum + group.values.length * Math.pow(mean - grandMean, 2);
  }, 0);
  const within = groups.reduce((sum, group) => {
    const mean = group.values.reduce((groupSum, value) => groupSum + value, 0) / group.values.length;
    return sum + group.values.reduce((groupSum, value) => groupSum + Math.pow(value - mean, 2), 0);
  }, 0);
  const df1 = count - 1;
  const df2 = total - count;
  const msBetween = between / df1;
  const msWithin = within / df2;
  const F = msBetween / msWithin;
  return { F, df1, df2, p: 0, ssBet: between, ssWit: within, msBet: msBetween, msWit: msWithin, grand: grandMean };
}

export const goodmanStudyHelpers = {
  storageKey: "desire:engentus:goodman",
  persistentPaths: [
    "boltSets",
    "simulations",
    "chartEdit",
    "ui.windows",
    "ui.maxZ"
  ],
  sessionPaths: [
    "ui.mode",
    "ui.activeSimId",
    "ui.openBsSets",
    "ui.scrubber"
  ],
  defaults() {
    return clone(DEFAULT_STATE);
  },
  sanitizeState(candidate = {}) {
    return deepMerge(DEFAULT_STATE, candidate);
  },
  staticControls(state) {
    return STATIC_FIELDS.map(field => ({
      ...field,
      value: state.staticView[field.key]
    }));
  },
  chartEditControls(state) {
    return [
      { key: "bandFills.0", label: "Region 1", type: "color", value: state.chartEdit.bandFills[0] },
      { key: "bandFills.1", label: "Region 2", type: "color", value: state.chartEdit.bandFills[1] },
      { key: "bandFills.2", label: "Region 3", type: "color", value: state.chartEdit.bandFills[2] },
      { key: "bandFills.3", label: "Region 4", type: "color", value: state.chartEdit.bandFills[3] }
    ];
  },
  boltSetCards(state) {
    return Object.values(state.boltSets).map(boltSet => ({
      id: boltSet.id,
      name: boltSet.name,
      color: boltSet.color,
      visible: boltSet.visible,
      open: !!state.ui.openBsSets[boltSet.id],
      categories: Object.entries(PARAM_CATS).map(([key, label]) => ({
        key,
        label,
        params: Object.entries(PARAM_META)
          .filter(([, meta]) => meta.cat === key)
          .map(([paramKey, meta]) => ({
            key: paramKey,
            label: meta.label,
            type: meta.type,
            unit: meta.unit,
            min: meta.min,
            max: meta.max,
            step: meta.step,
            value: boltSet.params[paramKey]?.value,
            free: !!boltSet.params[paramKey]?.free,
            displayValue: meta.format ? meta.format(boltSet.params[paramKey]?.value ?? 0) : String(boltSet.params[paramKey]?.value ?? "")
          }))
      }))
    }));
  },
  simulationRows(state) {
    return Object.values(state.simulations).map(sim => ({
      id: sim.id,
      name: sim.name,
      status: sim.status,
      progress: sim.progress ?? 0,
      active: state.ui.activeSimId === sim.id
    }));
  },
  visibleSections(state) {
    return {
      static: state.ui.mode === "static",
      mc: state.ui.mode === "mc",
      run: state.ui.mode === "mc" && !!state.ui.activeSimId,
      edit: state.ui.mode === "edit"
    };
  },
  chartParams(state) {
    const preferred = visibleBoltSets(state)[0] ?? Object.values(state.boltSets)[0];
    return chartParamsFromBoltSet(state, preferred);
  },
  overlayScene(state, resultsBySimulation) {
    const simId = state.ui.activeSimId;
    const result = simId ? resultsBySimulation?.[simId] : null;
    if (!result?.byBoltSet) return { datasets: [], failureText: "" };
    const time = state.ui.scrubber.t ?? 0;
    const datasets = [];
    for (const [boltSetId, boltData] of Object.entries(result.byBoltSet)) {
      const boltSet = state.boltSets[boltSetId];
      if (!boltSet?.visible) continue;
      const points = [];
      const stride = boltData.nSteps;
      const drawEvery = Math.max(1, Math.floor(boltData.n / 80));
      const rawIndex = result.tVals.length > 1 ? Math.round(time / (result.tVals[1] - result.tVals[0])) : 0;
      const stepIndex = Math.max(0, Math.min(result.tVals.length - 1, rawIndex));
      for (let boltIndex = 0; boltIndex < boltData.n; boltIndex += drawEvery) {
        const offset = boltIndex * stride + stepIndex;
        points.push({
          x: boltData.sigma_p[offset],
          y: boltData.sigma_a[offset],
          failed: Number.isFinite(boltData.failureT[boltIndex]) && boltData.failureT[boltIndex] <= time
        });
      }
      datasets.push({
        id: boltSetId,
        color: boltSet.color,
        points
      });
    }
    const activeSummary = Object.values(result.summary ?? {}).reduce((sum, row) => sum + (row.nFailed ?? 0), 0);
    return {
      datasets,
      failureText: activeSummary ? `${activeSummary} failures` : ""
    };
  },
  buildCdfDatasets(state, resultsBySimulation) {
    const datasets = [];
    for (const [simId, result] of Object.entries(resultsBySimulation ?? {})) {
      const sim = state.simulations[simId];
      if (!sim) continue;
      for (const [boltSetId, boltData] of Object.entries(result.byBoltSet ?? {})) {
        const boltSet = state.boltSets[boltSetId];
        if (!boltSet) continue;
        datasets.push({
          name: `${sim.name} / ${boltSet.name}`,
          color: boltSet.color,
          cdf: Array.from(result.tVals).map(time => ({
            t: time,
            f: Array.from(boltData.failureT).filter(value => Number.isFinite(value) && value <= time).length / boltData.n
          }))
        });
      }
    }
    return datasets;
  },
  buildStatsRows(state, resultsBySimulation) {
    const rows = [];
    for (const [simId, result] of Object.entries(resultsBySimulation ?? {})) {
      const sim = state.simulations[simId];
      if (!sim?.summary) continue;
      for (const [boltSetId, stats] of Object.entries(sim.summary)) {
        const boltSet = state.boltSets[boltSetId];
        if (!boltSet) continue;
        rows.push({
          sim: sim.name,
          boltSet: boltSet.name,
          color: boltSet.color,
          ...stats
        });
      }
    }
    return rows;
  },
  buildAnovaData(state, resultsBySimulation) {
    const groups = [];
    for (const [simId, result] of Object.entries(resultsBySimulation ?? {})) {
      const sim = state.simulations[simId];
      if (!sim) continue;
      for (const [boltSetId, boltData] of Object.entries(result.byBoltSet ?? {})) {
        const boltSet = state.boltSets[boltSetId];
        if (!boltSet) continue;
        const failures = Array.from(boltData.failureT).filter(value => Number.isFinite(value));
        if (failures.length < 3) continue;
        groups.push({
          name: `${boltSet.name} (${sim.name})`,
          color: boltSet.color,
          values: failures
        });
      }
    }
    return {
      groups,
      result: groups.length >= 2 ? anova(groups) : null
    };
  },
  createSimulation(state) {
    const id = nextId("sim");
    const activeBoltSets = visibleBoltSets(state).map(boltSet => boltSet.id).slice(0, 2);
    const simulation = {
      id,
      name: `Simulation ${Object.keys(state.simulations).length + 1}`,
      boltSetIds: activeBoltSets.length ? activeBoltSets : Object.keys(state.boltSets).slice(0, 2),
      config: { nBolts: 500, tMax: 24, dt: 0.5, seed: 42 },
      status: "stale",
      progress: 0,
      summary: null
    };
    return {
      state: deepMerge(state, {
        simulations: { [id]: simulation },
        ui: { activeSimId: id, mode: "mc" }
      }),
      activeSimId: id
    };
  },
  cloneSimulation(state, simulationId) {
    const original = state.simulations[simulationId];
    if (!original) return { state, activeSimId: state.ui.activeSimId };
    const id = nextId("sim");
    return {
      state: deepMerge(state, {
        simulations: {
          [id]: {
            ...clone(original),
            id,
            name: `${original.name} (copy)`,
            status: "stale",
            progress: 0,
            summary: null
          }
        },
        ui: { activeSimId: id }
      }),
      activeSimId: id
    };
  },
  deleteSimulation(state, simulationId) {
    return {
      state: deepMerge(state, {
        simulations: { [simulationId]: REMOVE },
        ui: { activeSimId: state.ui.activeSimId === simulationId ? null : state.ui.activeSimId }
      }),
      activeSimId: state.ui.activeSimId === simulationId ? null : state.ui.activeSimId
    };
  },
  saveScenarioAsSimulation(state) {
    return this.createSimulation(state);
  },
  updateWindowFrame(state, windowId, frame) {
    return deepMerge(state, {
      ui: {
        windows: {
          [windowId]: winFrac(frame)
        }
      }
    });
  },
  async runSimulation({ state, simulationId, onProgress, shouldStop, shouldPause }) {
    const simulation = state.simulations[simulationId];
    if (!simulation) return null;
    const results = {
      tVals: [],
      byBoltSet: {},
      summary: {}
    };
    const { nBolts = 500, tMax = 24, dt = 0.5, seed = 42 } = simulation.config ?? {};
    const tVals = Float32Array.from({ length: Math.round(tMax / dt) + 1 }, (_, index) => index * dt);
    results.tVals = tVals;
    const activeBoltSetIds = simulation.boltSetIds.filter(id => state.boltSets[id]);
    const totalBolts = nBolts * Math.max(1, activeBoltSetIds.length);
    let completed = 0;
    for (const boltSetId of activeBoltSetIds) {
      const rng = mulberry32(seed);
      const boltSet = state.boltSets[boltSetId];
      const boltData = {
        n: nBolts,
        nSteps: tVals.length,
        sigma_p: new Float32Array(nBolts * tVals.length),
        sigma_a: new Float32Array(nBolts * tVals.length),
        failureT: new Float32Array(nBolts).fill(Infinity)
      };
      for (let boltIndex = 0; boltIndex < nBolts; boltIndex += 1) {
        while (shouldPause()) await new Promise(resolve => setTimeout(resolve, 60));
        if (shouldStop()) return null;
        const params = sampleBoltParams(boltSet.params, rng);
        let damage = 0;
        const cyclesPerStep = params.rpm * 60 * 24 * 30 * dt;
        for (let stepIndex = 0; stepIndex < tVals.length; stepIndex += 1) {
          const { sigma_m, sigma_a } = boltSigmaAt(params, tVals[stepIndex]);
          const equivalent = Math.max(goodmanEquivalent(sigma_a, Math.min(sigma_m, params.uts_MPa * 0.999), params.uts_MPa), 0);
          const Ni = lifeCycles(equivalent, params.sn_sigma_lim, params.sn_m);
          damage += Number.isFinite(Ni) && Ni > 0 ? cyclesPerStep / Ni : 0;
          const offset = boltIndex * tVals.length + stepIndex;
          boltData.sigma_p[offset] = sigma_m;
          boltData.sigma_a[offset] = sigma_a;
          if (!Number.isFinite(boltData.failureT[boltIndex])) continue;
          if (sigma_m + sigma_a >= params.yield_stress_MPa || damage >= 1) boltData.failureT[boltIndex] = tVals[stepIndex];
        }
        completed += 1;
        if (typeof onProgress === "function") onProgress(completed / totalBolts);
        if (boltIndex % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      results.byBoltSet[boltSetId] = boltData;
    }
    results.summary = summarizeResults(results);
    return results;
  }
};
