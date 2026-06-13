/**
 * goodman-stdlib.js — domain function library for the BoltFatigue model.
 *
 * These are the honest one-liner leaves the Goodman `model` composes. They are
 * NOT kernels — Goodman has no symmetry break — they are plain math, here as a
 * function map handed to the generic evaluator. Faithful to
 * example-ports/engentus/js/physics.js (so the IR model reproduces the SPA).
 */

const SN_ND = 2e6;

// oval head, aligned (head_direction < 0.5): hidx 0
const K_F_HEAD = [3.0, 1.0];
const K_F_NUT = [2.5, 2.5];
const LEVER_HEAD = [0.5, 0.0];
const LEVER_NUT = [0.5, 1.0];

export const goodmanFunctions = {
  // S–N (Hannover): power law above endurance limit, flat below
  sn_hannover: (N, sl, m) => (N < SN_ND ? sl * Math.pow(SN_ND / N, 1 / m) : sl),

  months_to_cycles: (mo, rpm) => mo * 30 * 24 * 60 * rpm,

  // Goodman alternating-stress envelope at mean stress sm
  goodman_sa: (sm, fl, uts, ys) => {
    if (sm <= 0) return fl;
    if (sm >= ys) return 0;
    const denom = 1 - fl / uts;
    const xi = denom > 1e-9 ? (ys - fl) / denom : ys;
    return sm <= xi ? Math.max(0, fl * (1 - sm / uts)) : Math.max(0, ys - sm);
  },

  // Shore A hardness → rubber Young's modulus (Pa), Gent (1958) fit
  shore_a_to_E_pa: shoreA =>
    1e6 * (0.0981 * (56 + 7.62336 * shoreA)) /
          (0.137505 * (254 - 2.54 * shoreA)),

  // lateral bolt bending stiffness (N/m): 12EI/L³ aligned, 3EI/L³ perpendicular
  bolt_bending_stiffness: (E, I, L, head_direction) =>
    (head_direction < 0.5 ? 12 : 3) * E * I / Math.pow(L, 3),

  // alternating bending stress (MPa) from shear force through head/nut moments
  bolt_bending_sigma_a: (F_shear, L_grip, D_shank, D_minor, head_direction, length_factor) => {
    const hidx = head_direction < 0.5 ? 0 : 1;
    const Z_head = Math.PI * Math.pow(D_shank, 3) / 32;   // I/y for round section
    const Z_nut = Math.PI * Math.pow(D_minor, 3) / 32;
    const head_dir_fac = LEVER_HEAD[hidx] > 0 ? 1 : 0;
    const M_head = F_shear * LEVER_HEAD[hidx] * L_grip * head_dir_fac;
    const M_nut = F_shear * LEVER_NUT[hidx] * L_grip;
    const sb_h = (M_head / Z_head) / 1e6 * K_F_HEAD[hidx];
    const sb_n = (M_nut / Z_nut) / 1e6 * K_F_NUT[hidx];
    return Math.max(sb_h, sb_n) * length_factor;
  }
};
