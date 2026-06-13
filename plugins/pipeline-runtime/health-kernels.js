// health-kernel.mjs — IN-IR channel/bolt health classifier (PIPELINE.dsl §5c).
//
// Faithful port of analysis/mill/health.py `_classify_channel_hour_diagnostics`
// (+ `_primary_diagnostic`, `_context_edge_diagnostic`) and the bolt aggregation.
// Pure numeric: given the per-(bolt × channel × hour) feature columns the real
// pipeline precomputes (and which are present verbatim in channel_health_hourly.csv),
// it reproduces the `state` / `primary_diagnostic` / `diagnostic_flags` columns and
// the per-bolt per-state channel counts. Verified row-for-row against the real B01
// goldens. Thresholds match analysis/mill/config.py (and the RVM `Health*` values).

import path from "node:path";
import { createComputeHostOpHandler } from "../../src/desire/host-op-migration.js";
import { compileRvmFileToDesirePlus, normalizeDesirePlusToDesire } from "../../src/desire/index.js";
import { evaluateModel } from "../chart-runtime/dataflow-eval.js";

const T = {
  MIN_ROBUST_SPAN: 1e-6,
  CHANNEL_SPAN_RATIO: 0.02,
  CHANNEL_EDGE_PROXIMITY: 0.05,
  ZERO_FRACTION: 0.95,
  RAIL_FRACTION: 0.8,
  STALE_FRACTION: 0.8,
  DOMINANT_VALUE_FRACTION: 0.5,
  VALID_USABLE_BURST_FRACTION: 0.5,
  VALID_MEDIAN_GOOD_FRACTION: 0.5
};

// severity order (worst → best); matches the RVM SignalState enum + HEALTH_STATE_ORDER
export const HEALTH_STATE_ORDER = ["no_data", "stuck_or_saturated", "indeterminate", "unexpected", "valid"];
export const stateRank = state => HEALTH_STATE_ORDER.indexOf(state);

const DIAG_PRIORITY = {
  stuck_at_rail_low: 0, stuck_at_rail_high: 1,
  near_adc_rail_low: 2, near_adc_rail_high: 3,
  collapsed_near_context_low: 4, collapsed_near_context_high: 5,
  mostly_zero: 6, no_variation: 7, stale_signal: 8, dominant_repeated_value: 9,
  no_evaluable_bursts: 10, low_usable_burst_fraction: 11, low_median_good_fraction: 12,
  valid: 13, no_data: 14
};

const fin = x => Number.isFinite(x);

// min by (priority, first-index) — replicates Python min(key=(priority, flags.index(flag)))
function primaryDiagnostic(flags, fallback) {
  if (!flags.length) return fallback;
  let best = flags[0];
  let bestKey = [DIAG_PRIORITY[flags[0]] ?? 999, 0];
  for (let i = 1; i < flags.length; i++) {
    const key = [DIAG_PRIORITY[flags[i]] ?? 999, i];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { best = flags[i]; bestKey = key; }
  }
  return best;
}

function contextEdgeDiagnostic(hourMedian, p01, p99) {
  if (!(fin(hourMedian) && fin(p01) && fin(p99))) return "collapsed_near_context_low";
  const lowGap = Math.abs(hourMedian - p01);
  const highGap = Math.abs(p99 - hourMedian);
  return lowGap <= highGap ? "collapsed_near_context_low" : "collapsed_near_context_high";
}

// f: the per-channel-hour feature object (keys = the channel_health_hourly columns).
// Values may be strings (CSV) or numbers; numeric fields are coerced with Number().
// Returns { state, primary_diagnostic, diagnostic_flags } — the real output columns.
export function classifyChannelHour(f) {
  const n = k => Number(f[k]); // "" / undefined → NaN

  if (n("finite_sample_count") <= 0) return { state: "no_data", primary_diagnostic: "no_data", diagnostic_flags: "no_data" };

  const robustSpan = n("robust_span");
  const isFlat = fin(robustSpan) && robustSpan <= T.MIN_ROBUST_SPAN;
  const isChannelRail = fin(n("channel_span_ratio")) && fin(n("channel_edge_proximity"))
    && n("channel_span_ratio") <= T.CHANNEL_SPAN_RATIO
    && n("channel_edge_proximity") <= T.CHANNEL_EDGE_PROXIMITY;

  const sat = [];
  if (n("zero_fraction") >= T.ZERO_FRACTION) sat.push("mostly_zero");
  if (isFlat) sat.push("no_variation");
  if (Math.max(n("adc_rail_low_fraction"), n("adc_rail_high_fraction")) >= T.RAIL_FRACTION) {
    const adc = n("adc_rail_low_fraction") >= n("adc_rail_high_fraction") ? "near_adc_rail_low" : "near_adc_rail_high";
    sat.push(adc);
    if (isFlat) sat.push(adc.endsWith("_low") ? "stuck_at_rail_low" : "stuck_at_rail_high");
  }
  if (isChannelRail) sat.push(contextEdgeDiagnostic(n("hour_median"), n("channel_value_p01"), n("channel_value_p99")));
  if (Math.max(n("rail_low_fraction"), n("rail_high_fraction")) >= T.RAIL_FRACTION) {
    sat.push(n("rail_low_fraction") >= n("rail_high_fraction") ? "stuck_at_rail_low" : "stuck_at_rail_high");
  }
  if (n("stale_fraction") >= T.STALE_FRACTION) sat.push("stale_signal");
  if (n("dominant_value_fraction") >= T.DOMINANT_VALUE_FRACTION) sat.push("dominant_repeated_value");
  if (sat.length) {
    const uniq = [...new Set(sat)];
    return { state: "stuck_or_saturated", primary_diagnostic: primaryDiagnostic(uniq, "dominant_repeated_value"), diagnostic_flags: uniq.join("|") };
  }

  if (n("evaluable_burst_count") <= 0) return { state: "indeterminate", primary_diagnostic: "no_evaluable_bursts", diagnostic_flags: "no_evaluable_bursts" };

  const usable = n("usable_burst_fraction");
  const medianGood = n("median_good_fraction");
  if (fin(usable) && fin(medianGood) && usable >= T.VALID_USABLE_BURST_FRACTION && medianGood >= T.VALID_MEDIAN_GOOD_FRACTION) {
    return { state: "valid", primary_diagnostic: "valid", diagnostic_flags: "valid" };
  }

  const unexpected = [];
  if (fin(usable) && usable < T.VALID_USABLE_BURST_FRACTION) unexpected.push("low_usable_burst_fraction");
  if (fin(medianGood) && medianGood < T.VALID_MEDIAN_GOOD_FRACTION) unexpected.push("low_median_good_fraction");
  const uniq = [...new Set(unexpected)];
  const primary = primaryDiagnostic(uniq, "low_usable_burst_fraction");
  return { state: "unexpected", primary_diagnostic: primary, diagnostic_flags: (uniq.length ? uniq : [primary]).join("|") };
}

// Aggregate a bolt-hour's channel states → per-state counts + health_score
// (= valid channel count), matching bolt_health_hourly.csv.
export function aggregateBoltHealth(channelStates, expectedChannelCount = 5) {
  const counts = Object.fromEntries(HEALTH_STATE_ORDER.map(s => [s, 0]));
  for (const s of channelStates) counts[s] = (counts[s] ?? 0) + 1;
  return {
    no_data_channel_count: counts.no_data,
    stuck_or_saturated_channel_count: counts.stuck_or_saturated,
    indeterminate_channel_count: counts.indeterminate,
    unexpected_channel_count: counts.unexpected,
    valid_channel_count: counts.valid,
    expected_channel_count: expectedChannelCount,
    health_score: counts.valid
  };
}

// ── lowered kernel leaves (referenced by the HealthClassify DESIRE model) ──
export const healthFunctions = {
  health_n_valid: rows => rows.reduce((n, r) => n + (classifyChannelHour(r).state === "valid" ? 1 : 0), 0),
  health_n_bolts: rows => new Set(rows.map(r => String(r.bolt_number))).size
};

let _modelBody = null;
export async function healthModelBody() {
  if (_modelBody) return _modelBody;
  const file = path.join(process.cwd(), "examples_rvm", "engentus", "app", "models", "health.rvm");
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
  const node = desire.nodes.find(n => n.kind === "dataflow" && n.name === "HealthClassify");
  if (!node) throw new Error("HealthClassify dataflow model not found in health.rvm");
  _modelBody = node.body;
  return _modelBody;
}

// ── in-IR host-op handler for engentus.pipeline.health.classify ────────────
// Conforms to HealthResultPayload { hour_start, n_valid_channels,
// n_bolts_evaluated }. Runs THROUGH the model via evaluateModel: the hour's
// feature rows become a model param; the lowered kernels yield the counts.
export function createHealthClassifyInIrHandler({ sampleSource } = {}) {
  if (typeof sampleSource !== "function")
    throw new Error("createHealthClassifyInIrHandler: `sampleSource` (hour_start → feature rows) is required");
  return createComputeHostOpHandler({
    resolveInputs: request => {
      const rows = sampleSource(request.hour_start);
      if (!rows) throw new Error(`health-classify in-IR: no rows for hour_start '${request.hour_start}'`);
      return rows;
    },
    compute: async rows => {
      const body = await healthModelBody();
      return evaluateModel(body, { functions: healthFunctions, params: { rows } });
    },
    mapResponse: (ev, request) => ({
      hour_start: request.hour_start,
      n_valid_channels: ev.fields.n_valid_channels.data,
      n_bolts_evaluated: ev.fields.n_bolts_evaluated.data
    })
  });
}
