// health-r-kernel.mjs — IN-IR channel-health timeline (canonical R Stage 5, the
// R *fallback* to the richer Python 5-state classifier in health-kernel.mjs).
//
// Faithful port of example-ports/engentus-pipeline-r/R/health.R
// `build_health_timeline` + `summarise_health`. R is canonical. Verified against
// R's own output (test/desire-engentus-health-r-real.test.js).
//
// Design note — "multiple events → one representative dimension":
//   The per-burst artifact flags (hard_clip / soft_clip / spike_contaminated)
//   are INDEPENDENT and may CO-OCCUR. The ideal collapse is to keep them all but
//   pick a single REPRESENTATIVE via a priority ordering (`collapseByPriority`).
//   The Python classifier (health-kernel.mjs `classifyChannelHour`) is the
//   canonical instance of this pattern (15 flags → primary_diagnostic → 1 of 5
//   states). Here we apply the same collapse to the R flags so the simpler R
//   fallback also yields one representative artifact per burst, while the window
//   `status` (healthy/degraded/failed) is R's clip-rate collapse.

// ── generic priority collapse ──────────────────────────────────────────────
// activeEvents: array of event names that are currently TRUE (co-occurring).
// priorityOrder: array from highest- to lowest-priority event.
// Returns the highest-priority active event, or `fallback` if none are active.
export function collapseByPriority(activeEvents, priorityOrder, fallback = "none") {
  const active = new Set(activeEvents);
  for (const e of priorityOrder) if (active.has(e)) return e;
  return fallback;
}

// Representative artifact for one burst×channel from the three co-occurring R
// flags. Priority: a pinned rail (hard) dominates a dropout (spike) dominates a
// compressed/soft clip.
export const ARTIFACT_PRIORITY = ["hard_clip", "spike_contaminated", "soft_clip"];
export const representativeArtifact = row =>
  collapseByPriority(
    ARTIFACT_PRIORITY.filter(f => row[f] === true),
    ARTIFACT_PRIORITY,
    "clean"
  );

const coalesce = (v, d) => (v === null || v === undefined ? d : v);

// ── build_health_timeline ──────────────────────────────────────────────────
// stats:  rows from detect_clips (one per burst_id × channel).
// bursts: burst metadata rows { burst_id, device_id, bolt, mill_id, trial_arm,
//         burst_start_utc, burst_start_perth }.
// Returns one row per burst × LOAD channel with time, bolt, coalesced flags,
// plus a `representative_artifact` (the priority collapse of the three flags).
export function buildHealthTimeline(stats, bursts, { loadChannels = ["x1", "y1", "x3", "y3", "z2"] } = {}) {
  const meta = new Map(bursts.map(b => [b.burst_id, b]));
  const dateUtc = ts => String(ts).slice(0, 10); // as_date on an ISO-ish utc string

  const rows = stats
    .filter(s => loadChannels.includes(String(s.channel)))
    .map(s => ({ s, b: meta.get(s.burst_id) }))
    .filter(({ b }) => b && b.bolt !== null && b.bolt !== undefined)
    .map(({ s, b }) => {
      const hard_clip = coalesce(s.hard_clip, false);
      const soft_clip = coalesce(s.soft_clip, false);
      const spike_contaminated = coalesce(s.spike_contaminated, false);
      const is_clipped = coalesce(s.is_clipped, false);
      const out = {
        burst_id: s.burst_id, device_id: b.device_id, bolt: b.bolt,
        mill_id: b.mill_id, trial_arm: b.trial_arm,
        burst_start_utc: b.burst_start_utc, date_utc: dateUtc(b.burst_start_utc),
        channel: String(s.channel),
        hard_clip, soft_clip, spike_contaminated, is_clipped,
        median_raw: s.median_raw, iqr_raw: s.iqr_raw
      };
      out.representative_artifact = representativeArtifact(out);
      return out;
    });

  // R: arrange(bolt, channel, burst_start_utc)
  rows.sort((a, b) =>
    a.bolt - b.bolt ||
    (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0) ||
    (a.burst_start_utc < b.burst_start_utc ? -1 : a.burst_start_utc > b.burst_start_utc ? 1 : 0));
  return rows;
}

// ── summarise_health ───────────────────────────────────────────────────────
// Aggregate the timeline into windows; status from the clip rate.
//   clip_rate >= 1 → failed; > 0 → degraded; else healthy.   (R thresholds)
// period: "day" | "all" (week omitted — needs lubridate floor_date semantics).
const DEGRADED_THRESHOLD = 0.0;
const FAILED_THRESHOLD = 1.0;

const meanFinite = a => {
  const v = a.filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
};

export function summariseHealth(timeline, { period = "day" } = {}) {
  let windowOf;
  if (period === "day") windowOf = r => r.date_utc;
  else if (period === "all") {
    const min = timeline.reduce((m, r) => (r.burst_start_utc < m ? r.burst_start_utc : m), timeline[0]?.burst_start_utc);
    windowOf = () => String(min).slice(0, 10);
  } else throw new Error("period must be 'day' or 'all'");

  const groups = new Map();
  for (const r of timeline) {
    const key = [r.bolt, r.mill_id, r.trial_arm, r.channel, windowOf(r)].join("");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const out = [];
  for (const rows of groups.values()) {
    const r0 = rows[0];
    const n_bursts = rows.length;
    const n_clipped = rows.reduce((s, r) => s + (r.is_clipped ? 1 : 0), 0);
    const clip_rate = n_clipped / n_bursts;
    const status = clip_rate >= FAILED_THRESHOLD ? "failed"
      : clip_rate > DEGRADED_THRESHOLD ? "degraded" : "healthy";
    out.push({
      bolt: r0.bolt, mill_id: r0.mill_id, trial_arm: r0.trial_arm, channel: r0.channel,
      window: windowOf(r0), n_bursts,
      n_hard_clip: rows.reduce((s, r) => s + (r.hard_clip ? 1 : 0), 0),
      n_soft_clip: rows.reduce((s, r) => s + (r.soft_clip ? 1 : 0), 0),
      n_spike: rows.reduce((s, r) => s + (r.spike_contaminated ? 1 : 0), 0),
      n_clipped, clip_rate,
      median_raw_avg: meanFinite(rows.map(r => r.median_raw)),
      status
    });
  }
  out.sort((a, b) =>
    a.bolt - b.bolt ||
    (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0) ||
    (a.window < b.window ? -1 : a.window > b.window ? 1 : 0));
  return out;
}
