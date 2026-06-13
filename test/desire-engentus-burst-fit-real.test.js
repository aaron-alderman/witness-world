import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createWorld } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire,
  createProcessRuntime,
  createHostOperationRuntime,
  extractHostOperationContracts,
  migrateHostOperation
} from "../src/desire/index.js";
import {
  fitBurstRpm,
  fitBurstHarmonics,
  fitBurstRpmJoint,
  fitLatentRowModel,
  extractHarmonic,
  omegaForRpm,
  createBurstFitInIrHandler
} from "../examples_rvm/engentus/burst-fit-kernel.mjs";

// ── Rung D: verify the in-IR burst-fit kernel against the REAL oracle ──
//
// The real raw samples aren't portable (gzipped pickles), but package_phase.csv
// carries the real fit coefficients + extracted columns, and burst_rotation.csv
// the per-burst result. We verify three ways against real captured numbers:
//   1. extraction formulas reproduce the real amplitude / magnitude_phase / omega
//      / harmonic2 columns exactly (non-circular: real coeffs in, real cols out);
//   2. reconstructing the real harmonic and re-fitting recovers the real rpm;
//   3. migrateHostOperation verifies the in-IR fit against the real burst_rotation
//      golden and flips the host-op.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const OUT = path.join(process.cwd(), "example-ports", "engentus-pipeline", "analysis", "output", "B01", "outputs");

function splitCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function readCsv(file) {
  const lines = readFileSync(path.join(OUT, file), "utf8").split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine).map(v => Object.fromEntries(header.map((h, i) => [h, v[i]])));
  return rows;
}
// the highest-r² real package (cleanest harmonic) anchors the numeric checks
function bestPackage() {
  const rows = readCsv("package_phase.csv");
  return rows.reduce((a, b) => (Number(b.r_squared) > Number(a.r_squared) ? b : a));
}

test("kernel extraction formulas reproduce the real package_phase columns exactly", () => {
  const p = bestPackage();
  const fund = extractHarmonic(Number(p.cos_coeff), Number(p.sin_coeff));
  assert.ok(Math.abs(fund.amplitude - Number(p.amplitude)) < 1e-9, `amplitude ${fund.amplitude} vs ${p.amplitude}`);
  assert.ok(Math.abs(fund.phase - Number(p.magnitude_phase)) < 1e-9, `magnitude_phase ${fund.phase} vs ${p.magnitude_phase}`);
  assert.ok(Math.abs(omegaForRpm(Number(p.rpm)) - Number(p.omega)) < 1e-9, "omega");

  const h2 = extractHarmonic(Number(p.harmonic2_cos_coeff), Number(p.harmonic2_sin_coeff));
  assert.ok(Math.abs(h2.amplitude - Number(p.harmonic2_amplitude)) < 1e-9, "harmonic2_amplitude");
  assert.ok(Math.abs(h2.phase - Number(p.harmonic2_phase)) < 1e-9, "harmonic2_phase");
});

// reconstruct the real package's harmonic signal over its real sample window
function reconstruct(p, { withHarmonic2 = false } = {}) {
  const n = Number(p.sample_count);
  const dt = (Number(p.fit_end_seconds) - Number(p.fit_start_seconds)) / (n - 1);
  const omega = Number(p.omega);
  const off = Number(p.offset), cc = Number(p.cos_coeff), cs = Number(p.sin_coeff);
  const h2c = Number(p.harmonic2_cos_coeff), h2s = Number(p.harmonic2_sin_coeff);
  const g = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    let v = off + cc * Math.cos(omega * t) + cs * Math.sin(omega * t);
    if (withHarmonic2) v += h2c * Math.cos(2 * omega * t) + h2s * Math.sin(2 * omega * t);
    g.push(v);
  }
  return { g, dt };
}

test("re-fitting the reconstructed real harmonic recovers the real rpm/amplitude/phase", () => {
  const p = bestPackage();
  const { g, dt } = reconstruct(p);
  const fit = fitBurstRpm({ g, dt });
  assert.ok(Math.abs(fit.rpm - Number(p.rpm)) < 1e-6, `rpm ${fit.rpm} vs ${p.rpm}`);
  assert.ok(Math.abs(fit.amplitude - Number(p.amplitude)) < 1e-6, `amplitude ${fit.amplitude}`);
  assert.ok(Math.abs(fit.phase - Number(p.magnitude_phase)) < 1e-6, `phase ${fit.phase}`);
  assert.ok(fit.r_squared > 0.9999, `r² ${fit.r_squared}`);
});

test("fitBurstHarmonics at the real rpm reproduces the real coefficients (incl. 2nd harmonic)", () => {
  const p = bestPackage();
  const { g, dt } = reconstruct(p, { withHarmonic2: true });
  const out = fitBurstHarmonics({ g, dt, rpm: Number(p.rpm), harmonics: 2 });
  assert.ok(Math.abs(out.offset - Number(p.offset)) < 1e-6, "offset");
  assert.ok(Math.abs(out.cos_coeff - Number(p.cos_coeff)) < 1e-6, "cos_coeff");
  assert.ok(Math.abs(out.sin_coeff - Number(p.sin_coeff)) < 1e-6, "sin_coeff");
  assert.ok(Math.abs(out.amplitude - Number(p.amplitude)) < 1e-6, "amplitude");
  assert.ok(Math.abs(out.harmonic2_amplitude - Number(p.harmonic2_amplitude)) < 1e-6, "harmonic2_amplitude");
  assert.ok(Math.abs(out.harmonic2_phase - Number(p.harmonic2_phase)) < 1e-6, "harmonic2_phase");
});

test("the phase-drift design augments the model without disturbing the fundamental", () => {
  const p = bestPackage();
  const { g, dt } = reconstruct(p);
  const out = fitBurstHarmonics({ g, dt, rpm: Number(p.rpm), harmonics: 1, drift: true });
  // pure (drift-free) reconstruction → drift strength ≈ 0, fundamental intact
  assert.ok(Math.abs(out.amplitude - Number(p.amplitude)) < 1e-6, "amplitude");
  assert.ok(out.phase_drift_strength < 1e-6, `drift strength ${out.phase_drift_strength}`);
});

// ── verification on the REAL per-sample signal (exported from the pickle cache) ──

function burstSamples() {
  return JSON.parse(readFileSync(path.join(process.cwd(), "examples_rvm", "engentus", "fixtures", "burst-samples-B01.json"), "utf8"));
}
function packageRow(packages, burstStart, bolt, mount) {
  return packages.find(r => r.burst_start === burstStart && Number(r.bolt_number) === bolt && r.mount === mount);
}

test("the kernel reproduces the real package fit from the REAL magnitude_g signal", () => {
  const fix = burstSamples();
  const rows = readCsv("package_phase.csv");
  for (const p of fix.packages) {
    const want = packageRow(rows, fix.burst_start, p.bolt_number, p.mount);
    const fit = fitBurstHarmonics({ g: p.magnitude_g, times: p.time_seconds, rpm: Number(want.rpm), harmonics: 1 });
    // same data, same model as the Python fit → machine-precision agreement
    assert.ok(Math.abs(fit.offset - Number(want.offset)) < 1e-9, `offset ${p.bolt_number}/${p.mount}`);
    assert.ok(Math.abs(fit.cos_coeff - Number(want.cos_coeff)) < 1e-9, `cos_coeff ${p.bolt_number}/${p.mount}`);
    assert.ok(Math.abs(fit.sin_coeff - Number(want.sin_coeff)) < 1e-9, `sin_coeff ${p.bolt_number}/${p.mount}`);
    assert.ok(Math.abs(fit.amplitude - Number(want.amplitude)) < 1e-9, `amplitude ${p.bolt_number}/${p.mount}`);
    assert.ok(Math.abs(fit.magnitude_phase - Number(want.magnitude_phase)) < 1e-9, `magnitude_phase ${p.bolt_number}/${p.mount}`);
    assert.ok(Math.abs(fit.sse - Number(want.sse)) < 1e-9, `sse ${p.bolt_number}/${p.mount}`);
    assert.ok(Math.abs(fit.r_squared - Number(want.r_squared)) < 1e-9, `r² ${p.bolt_number}/${p.mount}`);
  }
});

test("the kernel reproduces the real 2nd harmonic from the REAL magnitude_g signal", () => {
  const fix = burstSamples();
  const rows = readCsv("package_phase.csv");
  for (const p of fix.packages) {
    const want = packageRow(rows, fix.burst_start, p.bolt_number, p.mount);
    const fit = fitBurstHarmonics({ g: p.magnitude_g, times: p.time_seconds, rpm: Number(want.rpm), harmonics: 2 });
    assert.ok(Math.abs(fit.harmonic2_amplitude - Number(want.harmonic2_amplitude)) < 1e-9, `h2_amp ${p.bolt_number}/${p.mount}`);
    assert.ok(Math.abs(fit.harmonic2_phase - Number(want.harmonic2_phase)) < 1e-9, `h2_phase ${p.bolt_number}/${p.mount}`);
  }
});

test("the burst-level multi-axis grid search recovers the real burst rpm from the REAL signals", () => {
  const fix = burstSamples();
  const burst = readCsv("burst_rotation.csv").find(r => r.burst_start === fix.burst_start);
  const packages = fix.packages.map(p => ({ axes: [p.filtered_x_g, p.filtered_y_g, p.filtered_z_g], times: p.time_seconds }));
  const result = fitBurstRpmJoint(packages);
  // model.py's objective: Σ_packages Σ_axes [1,cos,sin] SSE on the filtered axes
  assert.ok(Math.abs(result.rpm - Number(burst.rpm)) < 1e-6, `joint rpm ${result.rpm} vs real ${burst.rpm}`);
});

test("the in-IR latent row model reproduces the real latent_row_fit.json (γ_bolt, κ)", () => {
  const packages = readCsv("package_phase.csv");
  const golden = JSON.parse(readFileSync(path.join(OUT, "latent_row_fit.json"), "utf8"));

  // real per-package phases feed the model: φ = α_burst + γ·1[mount=bolt] + κ·row
  const observations = packages.map(r => ({
    burst: r.burst_start,
    bolt: r.mount === "bolt" ? 1 : 0,
    row: Number(r.row_label),
    phase: Number(r.magnitude_phase)
  }));
  const fit = fitLatentRowModel(observations);

  assert.equal(fit.observation_count, golden.observation_count); // 3771
  assert.equal(fit.burst_count, golden.burst_count);             // 1158
  assert.ok(Math.abs(fit.gamma_bolt - golden.gamma_bolt) < 1e-9, `γ_bolt ${fit.gamma_bolt} vs ${golden.gamma_bolt}`);
  assert.ok(Math.abs(fit.kappa - golden.kappa) < 1e-9, `κ ${fit.kappa} vs ${golden.kappa}`);
  assert.ok(Math.abs(fit.sse - golden.sse) < 1e-6, `sse ${fit.sse} vs ${golden.sse}`);
  assert.ok(Math.abs(fit.rmse - golden.rmse) < 1e-9, `rmse ${fit.rmse} vs ${golden.rmse}`);
});

test("migrateHostOperation verifies the in-IR kernel against the REAL burst_rotation golden", async () => {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
  const world = createWorld();
  applyDesire(world, desire);
  const runtime = createHostOperationRuntime({ handlers: {}, contracts: extractHostOperationContracts(world) });

  const burst = readCsv("burst_rotation.csv")[0]; // real per-burst result
  const p = bestPackage();
  const { g, dt } = reconstruct(p);

  // in-IR handler: kernel fits the reconstructed real signal for this burst
  const inIr = createBurstFitInIrHandler({
    sampleSource: bs => (bs === burst.burst_start ? { g, dt, n_valid_pkgs: Number(burst.valid_package_count) } : null)
  });
  // oracle: the real burst_rotation row (projected onto the result schema)
  const oracle = async req => ({ status: "success", payload: { burst_start: req.burst_start, rpm: Number(burst.rpm), n_valid_pkgs: Number(burst.valid_package_count) } });
  const request = { source_name: "engentus.mill.pipeline", mill_id: "B01", burst_start: burst.burst_start, burst_end: burst.burst_end };

  const result = await migrateHostOperation(runtime, {
    hostOperation: "engentus.pipeline.fit.burst",
    candidate: inIr,
    oracle,
    fixtures: [{ request }],
    tolerance: 1e-6
  });
  assert.equal(result.ok, true);
  assert.ok(result.provenance.maxAbsErr < 1e-6);

  // and it now drives the engine to the REAL rpm
  const rt = createProcessRuntime(world);
  rt.set("BurstFitMillId", "B01");
  rt.set("BurstFitBurstStart", burst.burst_start);
  rt.set("BurstFitBurstEnd", burst.burst_end);
  await rt.stepViaHostOp("RunBurstFit", runtime);
  assert.ok(Math.abs(rt.value("BurstFitResultRpm") - Number(burst.rpm)) < 1e-6);
  assert.equal(rt.value("BurstFitRunState"), "complete");
});
