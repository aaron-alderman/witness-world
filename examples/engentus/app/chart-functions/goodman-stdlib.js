/**
 * App-owned Goodman helper functions for the Engentus frontend.
 *
 * These stay with the authored app rather than the reusable chart runtime.
 * Faithful to example-ports/engentus/js/physics.js.
 */

const SN_ND = 2e6;

const K_F_HEAD = [3.0, 1.0];
const K_F_NUT = [2.5, 2.5];
const LEVER_HEAD = [0.5, 0.0];
const LEVER_NUT = [0.5, 1.0];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tooltipRowHtml({ color, name, sigmaA, shear, damage }) {
  return [
    `<div class="goodman-hover-row">`,
    `<span class="goodman-hover-swatch" style="background:${escapeHtml(color)}"></span>`,
    `<span class="goodman-hover-name">${escapeHtml(name)}:</span>`,
    `<strong class="goodman-hover-value">${escapeHtml(sigmaA)}</strong>`,
    `<span class="goodman-hover-metric">F_shear=${escapeHtml(shear)}</span>`,
    `<span class="goodman-hover-metric">&Delta;/cyc=${damage}</span>`,
    `</div>`
  ].join("");
}

export const goodmanFunctions = {
  sn_hannover: (N, sl, m) => (N < SN_ND ? sl * Math.pow(SN_ND / N, 1 / m) : sl),

  months_to_cycles: (mo, rpm) => mo * 30 * 24 * 60 * rpm,

  goodman_sa: (sm, fl, uts, ys) => {
    if (sm <= 0) return fl;
    if (sm >= ys) return 0;
    const denom = 1 - fl / uts;
    const xi = denom > 1e-9 ? (ys - fl) / denom : ys;
    return sm <= xi ? Math.max(0, fl * (1 - sm / uts)) : Math.max(0, ys - sm);
  },

  goodman_band_y0: (zone, sm, flA, flB, flC, uts, ys) => {
    const limits = [flA, flB, flC].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(3, Math.round(Number(zone) || 0)));
    if (index === 0) return 0;
    return goodmanFunctions.goodman_sa(sm, limits[index - 1], uts, ys);
  },

  goodman_band_y1: (zone, sm, flA, flB, flC, uts, ys) => {
    const limits = [flA, flB, flC].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(3, Math.round(Number(zone) || 0)));
    if (index >= limits.length) return Math.max(0, ys - sm);
    return goodmanFunctions.goodman_sa(sm, limits[index], uts, ys);
  },

  sigma_a_equiv: (sigmaA, sigmaM, uts) =>
    uts > sigmaM + 1e-9 ? sigmaA * uts / (uts - sigmaM) : (sigmaA > 0 ? Infinity : 0),

  sn_life_cycles: (sigmaEquiv, sigmaLim, slope) =>
    sigmaEquiv > sigmaLim ? SN_ND / Math.pow(sigmaEquiv / sigmaLim, slope) : SN_ND,

  miner_dpc: (sigmaA, sigmaM, sigmaLim, slope, uts) => {
    const sigmaEquiv = goodmanFunctions.sigma_a_equiv(sigmaA, sigmaM, uts);
    if (!Number.isFinite(sigmaEquiv) || sigmaEquiv <= sigmaLim) return 0;
    return Math.pow(sigmaEquiv / sigmaLim, slope) / SN_ND;
  },

  integer_text: value => `${Math.round(Number(value) || 0)}`,

  mpa_text: value => `${Number(value).toFixed(1)} MPa`,

  newton_text: value => `${Math.round(Number(value) || 0).toLocaleString("en-US")} N`,

  damage_per_million_text: value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.001) return "≈0";
    return numeric.toFixed(3);
  },

  goodman_tooltip_markup: ({ readout = {}, plan = {} } = {}) => {
    const readings = Array.isArray(readout.readings) ? readout.readings : [];
    const primary = readings.find(reading => reading?.layer === "curves") ?? null;
    const maintenance = readings.find(reading => reading?.layer === "curve_jemtec") ?? null;
    const sigmaM = primary?.tooltip?.sigma_m_MPa
      ?? maintenance?.tooltip?.sigma_m_MPa
      ?? readout?.tooltip?.sigma_m_MPa;
    if (sigmaM == null) return "";
    const layerColor = layerName =>
      plan?.layers?.find?.(layer => layer?.name === layerName)?.stroke ?? "#ffffff";
    const formatSigmaA = reading => `${Number(reading?.tooltip?.sigma_a_MPa ?? 0).toFixed(1)} MPa`;
    const formatShear = reading => `${Math.round(Number(reading?.tooltip?.F_shear_N ?? 0)).toLocaleString("en-US")} N`;
    const formatDamage = reading => {
      const numeric = Number(reading?.tooltip?.damage_per_cycle_x10_6 ?? 0);
      if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.0005) return "&asymp;0&times;10<sup>-6</sup>";
      return `${numeric.toFixed(3)}&times;10<sup>-6</sup>`;
    };
    const rows = [];
    if (primary) {
      rows.push(tooltipRowHtml({
        color: layerColor("curves"),
        name: "No Jemtec",
        sigmaA: formatSigmaA(primary),
        shear: formatShear(primary),
        damage: formatDamage(primary)
      }));
    }
    if (maintenance) {
      rows.push(tooltipRowHtml({
        color: layerColor("curve_jemtec"),
        name: "Jemtec",
        sigmaA: formatSigmaA(maintenance),
        shear: formatShear(maintenance),
        damage: formatDamage(maintenance)
      }));
    }
    return [
      `<div class="goodman-hover-title">&sigma;<sub>m</sub> = ${escapeHtml(Number(sigmaM).toFixed(0))} MPa</div>`,
      ...rows
    ].join("");
  },

  slip_text: value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric >= 660) return "> 660";
    return `${numeric.toFixed(0)} MPa`;
  },

  shore_a_to_E_pa: shoreA =>
    1e6 * (0.0981 * (56 + 7.62336 * shoreA)) /
          (0.137505 * (254 - 2.54 * shoreA)),

  bolt_bending_stiffness: (E, I, L, head_direction) =>
    (head_direction < 0.5 ? 12 : 3) * E * I / Math.pow(L, 3),

  bolt_bending_sigma_a: (F_shear, L_grip, D_shank, D_minor, head_direction, length_factor) => {
    const hidx = head_direction < 0.5 ? 0 : 1;
    const Z_head = Math.PI * Math.pow(D_shank, 3) / 32;
    const Z_nut = Math.PI * Math.pow(D_minor, 3) / 32;
    const headDirFac = LEVER_HEAD[hidx] > 0 ? 1 : 0;
    const M_head = F_shear * LEVER_HEAD[hidx] * L_grip * headDirFac;
    const M_nut = F_shear * LEVER_NUT[hidx] * L_grip;
    const sb_h = (M_head / Z_head) / 1e6 * K_F_HEAD[hidx];
    const sb_n = (M_nut / Z_nut) / 1e6 * K_F_NUT[hidx];
    return Math.max(sb_h, sb_n) * length_factor;
  }
};
