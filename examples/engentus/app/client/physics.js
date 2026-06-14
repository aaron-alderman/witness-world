/**
 * physics.js — Pure domain physics. No dependencies.
 *
 * R-aligned bolt fatigue physics (matching scripts/goodman plots.r):
 *   bolt_sigma_at(p, t_months)        — full time-varying evaluation
 *   bolt_static_point(p, sm, F_alt)   — static Goodman chart scan
 *   params_nominal(bsParams)          — extract .value from dist-spec
 *
 * Goodman background helpers (unchanged):
 *   goodman_sa, sn_hannover, months_to_cycles
 */

export const SN_ND = 2e6;

export const LIFETIME_MONTHS = [0.5, 2, 6];
export const BAND_FILL   = ['#bbf7d0','#d9f99d','#fef08a','#fde68a'];
export const BAND_STROKE = ['#86efac','#bef264','#fde047','#fbbf24'];

// ── Physical constants ─────────────────────────────────────────────────
// Copper shear insert (Jemtec) — cross-sectional area and shear modulus.
export const JEMTEC_AREA_M2          = 8846.725e-6;  // m²
export const COPPER_SHEAR_MODULUS_PA = 44e9;          // Pa

// Oval head lookup: [aligned, perpendicular].
// K_f_head / K_f_nut  : fatigue stress concentration factors
// lever_head / lever_nut : fraction of L_grip as bending lever at each end
export const HEAD_TYPE_TABLE = {
  oval: {
    K_f_head:   [3.0, 1.0],
    K_f_nut:    [2.5, 2.5],
    lever_head: [0.5, 0.0],
    lever_nut:  [0.5, 1.0],
  },
};

// ── Goodman diagram background ────────────────────────────────────────
export const sn_hannover = (N, sl, m) =>
  N < SN_ND ? sl * Math.pow(SN_ND / N, 1 / m) : sl;

export const months_to_cycles = (mo, rpm) => mo * 30 * 24 * 60 * rpm;

export function goodman_sa(sm, fl, uts, ys) {
  if (sm <= 0) return fl;
  if (sm >= ys) return 0;
  const denom = 1 - fl / uts;
  const xi = denom > 1e-9 ? (ys - fl) / denom : ys;
  return sm <= xi ? Math.max(0, fl * (1 - sm / uts)) : Math.max(0, ys - sm);
}

// ── Goodman equivalent + SN curve (R-aligned) ─────────────────────────
// sigma_e = sigma_a * uts / (uts - sigma_m)  [Goodman zero-mean equiv]
export const sigma_a_equiv = (sa, sm, uts) =>
  uts > sm + 1e-9 ? sa * uts / (uts - sm) : (sa > 0 ? Infinity : 0);

// Cycles to failure: power law above endurance limit, infinite life below.
export const sn_life_cycles = (sigma_e, sigma_lim, m, ND = SN_ND) =>
  sigma_e > sigma_lim ? ND / Math.pow(sigma_e / sigma_lim, m) : ND;

// Miner damage per cycle (used by chart hover tooltip).
export function miner_dpc(sa, sm, sl, m, uts) {
  const se = sigma_a_equiv(sa, sm, uts);
  if (!isFinite(se) || se <= sl) return 0;
  return Math.pow(se / sl, m) / SN_ND;
}

// ── Material / geometry helpers (R-aligned) ───────────────────────────
// Shore A hardness → rubber Young's modulus (Pa), Gent (1958) empirical fit.
export const shore_a_to_E_pa = shoreA =>
  1e6 * (0.0981 * (56 + 7.62336 * shoreA)) /
        (0.137505 * (254 - 2.54 * shoreA));

// Round cross-section: area (m²), second moment of area (m⁴), half-depth (m).
export const section_props_round = D => ({
  A: Math.PI * D * D / 4,
  I: Math.PI * Math.pow(D, 4) / 64,
  y: D / 2,
});

// Shear layer spring rate (N/m): G × A / thickness.
export const shear_layer_stiffness = (G, area, thickness) =>
  G * area / thickness;

// Lateral bolt bending stiffness (N/m):
//   12EI/L³ for aligned head (fixed-fixed), 3EI/L³ for perpendicular (cantilever).
export const bolt_bending_stiffness = (E, I, L, head_direction) =>
  (head_direction < 0.5 ? 12 : 3) * E * I / Math.pow(L, 3);

// Rubber dynamic modulus with optional power-law creep decay.
export const rubber_dyn_modulus = (E_pa, t_hours, relax_a, relax_b) =>
  relax_b === 0 ? E_pa : E_pa * Math.pow(1 + relax_a * t_hours, -relax_b);

// Preload relaxation multiplier (R: 1 / (tau_a + t_hours^tau_b) * tau_c).
export const preload_relaxation = (t_hours, tau_a, tau_b, tau_c) =>
  tau_c / (tau_a + Math.pow(Math.max(t_hours, 0), tau_b));

// ── Param-spec utility ────────────────────────────────────────────────
// Extract the nominal (.value) scalar from each entry of a bolt-set dist-spec.
export function params_nominal(bsParams) {
  const p = {};
  for (const [k, v] of Object.entries(bsParams)) {
    p[k] = (v !== null && typeof v === 'object' && 'value' in v) ? v.value : v;
  }
  return p;
}

// ── Core bolt stress evaluation ───────────────────────────────────────
// Internal: given pre-resolved sigma_m (MPa), compute sigma_a, F_shear_alt,
// gamma using time-dependent rubber modulus.
function _bolt_stress(p, sigma_m, t_hours) {
  // Section properties at critical locations
  const sec_sh = section_props_round(p.D_Shank);
  const sec_mn = section_props_round(p.D_minor);
  const Z_head = sec_sh.I / sec_sh.y;
  const Z_nut  = sec_mn.I / sec_mn.y;

  // Head geometry factors (oval only; hidx 0=aligned, 1=perpendicular)
  const ht   = HEAD_TYPE_TABLE.oval;
  const hidx = p.head_direction < 0.5 ? 0 : 1;
  const K_f_head   = ht.K_f_head[hidx];
  const K_f_nut    = ht.K_f_nut[hidx];
  const lever_head = ht.lever_head[hidx];
  const lever_nut  = ht.lever_nut[hidx];
  const head_dir_fac = lever_head > 0 ? 1 : 0;

  // Stiffness-based gamma (rubber shear path vs bolt bending path)
  const E_r0  = shore_a_to_E_pa(p.rubber_shoreA);
  const E_rt  = rubber_dyn_modulus(E_r0, t_hours, p.relax_a, p.relax_b);
  const G_r   = E_rt / (2 * (1 + p.rubber_nu));
  const k_rub = shear_layer_stiffness(G_r, p.rubber_area_m2, p.rubber_thickness_m);
  const k_blt = bolt_bending_stiffness(p.E_bolt_GPa * 1e9, sec_sh.I,
                                        p.L_grip, p.head_direction) * p.n_bolts;
  const k_jem = p.jemtec_enabled > 0.5
    ? shear_layer_stiffness(COPPER_SHEAR_MODULUS_PA, JEMTEC_AREA_M2, p.rubber_thickness_m)
    : 0;
  const gamma = k_blt / (k_blt + k_rub + k_jem);

  // Friction load-sharing → bolt shear force
  const F_preload  = sigma_m * 1e6 * p.A_s_nom;
  const F_per_bolt = p.F_alt_applied_N / p.n_bolts * p.angular_span_factor;
  const F_friction = p.mu_joint * F_preload * p.n_interfaces;
  const F_shear    = Math.max(gamma * F_per_bolt, F_per_bolt - F_friction);

  // Bending moments at head and nut → alternating bending stress
  const M_head = F_shear * lever_head * p.L_grip * head_dir_fac;
  const M_nut  = F_shear * lever_nut  * p.L_grip;
  const sb_h   = (M_head / Z_head) / 1e6 * K_f_head;
  const sb_n   = (M_nut  / Z_nut)  / 1e6 * K_f_nut;
  const sigma_a = Math.max(sb_h, sb_n) * p.length_factor;

  return { sigma_a, F_shear_alt: F_shear, gamma };
}

/**
 * Time-varying bolt state (used by MC simulation inner loop).
 * p must be a flat sampled-params object (scalar values).
 * t is in months; converted to hours internally.
 */
export function bolt_sigma_at(p, t_months) {
  const t_hours = t_months * 720;  // 24 × 30
  const tau     = preload_relaxation(t_hours, p.tau_a, p.tau_b, p.tau_c);
  const sigma_m = p.preload_stress_MPa * tau * p.preload_utilisation;
  return { sigma_m, ..._bolt_stress(p, sigma_m, t_hours) };
}

/**
 * Static scan for Goodman chart: given a target mean stress sigma_m (MPa)
 * and an applied force override F_alt_N, compute sigma_a at t = 0.
 * Used by chart.js to trace the bolt response curve and probe marker.
 */
export function bolt_static_point(p, sigma_m, F_alt_N) {
  return { sigma_m, ..._bolt_stress({ ...p, F_alt_applied_N: F_alt_N }, sigma_m, 0) };
}
