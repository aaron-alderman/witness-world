import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyChannelHour, aggregateBoltHealth, stateRank } from "../plugins/pipeline-runtime/health-kernels.js";

// ── Rung D: verify the in-IR health classifier against the REAL oracle ──
//
// channel_health_hourly.csv carries both the precomputed feature columns (the
// classifier inputs) and the labeled outputs (state / primary_diagnostic /
// diagnostic_flags). We classify every real row from its features and compare to
// the real labels, then aggregate every bolt-hour and compare to bolt_health.

const OUT = path.join(process.cwd(), "example-ports", "engentus-pipeline", "analysis", "output", "B01", "outputs");

function readCsv(file) {
  const lines = readFileSync(path.join(OUT, file), "utf8").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  return lines.slice(1).map(l => {
    const v = l.split(",");
    return Object.fromEntries(header.map((h, i) => [h, v[i]]));
  });
}

test("the in-IR classifier reproduces every real channel_health_hourly row", () => {
  const rows = readCsv("channel_health_hourly.csv");
  assert.ok(rows.length > 1000, `expected many rows, got ${rows.length}`);

  let mismatches = 0;
  const sample = [];
  for (const r of rows) {
    const out = classifyChannelHour(r);
    const ok = out.state === r.state
      && out.primary_diagnostic === r.primary_diagnostic
      && out.diagnostic_flags === r.diagnostic_flags
      && String(stateRank(out.state)) === r.state_rank
      && String(out.state === "valid" ? 1 : 0) === r.is_valid;
    if (!ok) {
      mismatches++;
      if (sample.length < 5) sample.push({ got: out, want: { state: r.state, primary: r.primary_diagnostic, flags: r.diagnostic_flags } });
    }
  }
  assert.equal(mismatches, 0, `${mismatches} mismatch(es); e.g. ${JSON.stringify(sample)}`);
});

test("every real signal state is exercised (classifier covers the full taxonomy)", () => {
  const rows = readCsv("channel_health_hourly.csv");
  const states = new Set(rows.map(r => classifyChannelHour(r).state));
  // the deployment data exercises at least these (no_data + degraded + valid)
  for (const s of ["no_data", "stuck_or_saturated", "valid"]) assert.ok(states.has(s), `state ${s} not produced`);
});

test("the in-IR bolt aggregation reproduces every real bolt_health_hourly row", () => {
  const channel = readCsv("channel_health_hourly.csv");
  const bolt = readCsv("bolt_health_hourly.csv");

  // group channel states by (mill, bolt, hour)
  const byKey = new Map();
  for (const r of channel) {
    const key = `${r.mill_id}|${r.bolt_number}|${r.hour_start}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(classifyChannelHour(r).state);
  }

  let mismatches = 0;
  const sample = [];
  for (const b of bolt) {
    const key = `${b.mill_id}|${b.bolt_number}|${b.hour_start}`;
    const agg = aggregateBoltHealth(byKey.get(key) ?? []);
    const fields = [
      "no_data_channel_count", "stuck_or_saturated_channel_count", "indeterminate_channel_count",
      "unexpected_channel_count", "valid_channel_count", "expected_channel_count", "health_score"
    ];
    const ok = fields.every(f => String(agg[f]) === b[f]);
    if (!ok) { mismatches++; if (sample.length < 5) sample.push({ key, got: agg, wantValid: b.valid_channel_count, wantStuck: b.stuck_or_saturated_channel_count }); }
  }
  assert.equal(mismatches, 0, `${mismatches} bolt mismatch(es); e.g. ${JSON.stringify(sample)}`);
});
