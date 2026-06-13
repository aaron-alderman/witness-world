import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire,
  createProcessRuntime,
  createHostOperationRuntime,
  extractHostOperationContracts,
  verifyAgainstOracle,
  compareNumeric,
  migrateHostOperation,
  HostOperationError
} from "../src/desire/index.js";
import { engentusHostOpHandlers } from "../examples_rvm/engentus/host-ops-stub.mjs";
import { fitBurstRpm, synthBurst, createBurstFitInIrHandler } from "../examples_rvm/engentus/burst-fit-kernel.mjs";

// ── Rung D: re-express an algorithm in DESIRE and swap it in behind the ABI ──
//
// Proves the generic "DESIRE eats the black box" migration capability end-to-end
// on the burst-fit stage's core (harmonic least-squares + RPM grid search). The
// kernel is real, verifiable math; the only external work left for the final
// stage is (C) the real Python oracle and (D) the real sample source — both slot
// in behind the same protocol exercised here.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const HOST_OP = "engentus.pipeline.fit.burst";
const BURST = "2026-01-01T00:00:00Z";

function burstRequest() {
  return { source_name: "engentus.mill.pipeline", mill_id: "MILL-7", burst_start: BURST, burst_end: "2026-01-01T00:00:12Z" };
}
// the oracle = independent ground truth (stands in for the real Python output)
function groundTruthOracle(rpm, nValid = 42) {
  return async request => ({ status: "success", payload: { burst_start: request.burst_start, rpm, n_valid_pkgs: nValid } });
}

async function appliedPipeline() {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
  const world = createWorld();
  applyDesire(world, desire);
  const contracts = extractHostOperationContracts(world);
  const runtime = createHostOperationRuntime({ handlers: engentusHostOpHandlers(), contracts });
  return { world, contracts, runtime };
}

// ── The kernel: real, self-contained, verifiable math ──

test("the burst-fit kernel recovers a known frequency to 1e-6 (clean signal)", () => {
  const b = synthBurst({ rpm: 11.7, amplitude: 2.5, phase: 0.8, seconds: 12, fs: 50 });
  const fit = fitBurstRpm({ g: b.g, dt: b.dt });
  assert.ok(Math.abs(fit.rpm - 11.7) < 1e-6, `rpm ${fit.rpm}`);
  assert.ok(Math.abs(fit.amplitude - 2.5) < 1e-6, `amplitude ${fit.amplitude}`);
  assert.ok(Math.abs(fit.phase - 0.8) < 1e-6, `phase ${fit.phase}`);
  assert.ok(Math.abs(fit.r_squared - 1) < 1e-9, `r² ${fit.r_squared}`);
});

test("the burst-fit kernel is robust under noise (documented statistical tolerance)", () => {
  // Stochastic input → not a 1e-6 claim. Tolerances are documented: rpm within
  // one coarse grid step, r² high. (The 1e-6 deterministic proof is the clean
  // case + the oracle-reproduction below.)
  const b = synthBurst({ rpm: 9.35, amplitude: 1.0, phase: -0.4, seconds: 16, fs: 50, noise: 0.05, seed: 7 });
  const fit = fitBurstRpm({ g: b.g, dt: b.dt });
  assert.ok(Math.abs(fit.rpm - 9.35) < 0.05, `rpm ${fit.rpm}`);
  assert.ok(fit.r_squared > 0.98, `r² ${fit.r_squared}`);
});

// ── The equivalence harness ──

test("compareNumeric tolerates float drift but holds ints/strings exact", () => {
  assert.equal(compareNumeric({ a: 1.0000001 }, { a: 1.0 }, 1e-6).ok, true);
  assert.equal(compareNumeric({ a: 1.1 }, { a: 1.0 }, 1e-6).ok, false);
  assert.equal(compareNumeric({ s: "x", n: 3 }, { s: "y", n: 3 }, 1e-6).ok, false);
});

test("verifyAgainstOracle confirms the in-IR kernel reproduces the oracle", async () => {
  const b = synthBurst({ rpm: 11.7, amplitude: 2.5, phase: 0.8 });
  const candidate = createBurstFitInIrHandler({ sampleSource: bs => (bs === BURST ? { g: b.g, dt: b.dt, n_valid_pkgs: 42 } : null) });
  const report = await verifyAgainstOracle({
    oracle: groundTruthOracle(11.7),
    candidate,
    fixtures: [{ host_operation: HOST_OP, request: burstRequest() }],
    tolerance: 1e-6
  });
  assert.equal(report.ok, true);
  assert.ok(report.maxAbsErr < 1e-6);
});

test("verifyAgainstOracle catches a candidate that disagrees with the oracle", async () => {
  const b = synthBurst({ rpm: 11.7 });
  const candidate = createBurstFitInIrHandler({ sampleSource: () => ({ g: b.g, dt: b.dt }) });
  const report = await verifyAgainstOracle({
    oracle: groundTruthOracle(13.2), // wrong truth → must disagree
    candidate,
    fixtures: [{ host_operation: HOST_OP, request: burstRequest() }],
    tolerance: 1e-6
  });
  assert.equal(report.ok, false);
  assert.ok(report.comparisons[0].mismatches.some(m => m.includes("rpm")));
});

// ── The flip: migrate the host-op from black box to in-IR ──

test("migrateHostOperation verifies, then swaps the runtime handler behind the ABI", async () => {
  const { runtime } = await appliedPipeline();
  const b = synthBurst({ rpm: 11.7, amplitude: 2.5, phase: 0.8 });
  const candidate = createBurstFitInIrHandler({ sampleSource: () => ({ g: b.g, dt: b.dt, n_valid_pkgs: 42 }) });

  const result = await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate,
    oracle: groundTruthOracle(11.7),
    fixtures: [{ request: burstRequest() }],
    tolerance: 1e-6
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.provenance.to, "in-ir");
  assert.ok(result.provenance.verified);

  // the runtime now computes rpm in-IR; other stages stay on the stub (incremental)
  const swapped = await runtime.invoke({ host_operation: HOST_OP, request: burstRequest() });
  assert.ok(Math.abs(swapped.payload.rpm - 11.7) < 1e-6);
  const health = await runtime.invoke({ host_operation: "engentus.pipeline.health.classify", request: { source_name: "s", mill_id: "M", hour_start: "h" } });
  assert.equal(health.payload.n_valid_channels, 5); // still the stub
});

test("migrateHostOperation refuses to flip when the candidate disagrees", async () => {
  const { runtime } = await appliedPipeline();
  const b = synthBurst({ rpm: 11.7 });
  const wrong = createBurstFitInIrHandler({ sampleSource: () => ({ g: b.g, dt: b.dt }), fitOptions: { rpmRange: [6, 7] } }); // forced off-band → wrong

  await assert.rejects(
    () => migrateHostOperation(runtime, { hostOperation: HOST_OP, candidate: wrong, oracle: groundTruthOracle(11.7), fixtures: [{ request: burstRequest() }] }),
    err => err instanceof HostOperationError && /disagrees with the oracle/.test(err.message)
  );
  // runtime untouched: still the original stub (constant 12.5)
  const still = await runtime.invoke({ host_operation: HOST_OP, request: burstRequest() });
  assert.equal(still.payload.rpm, 12.5);
});

// ── End-to-end: the swap is invisible to the state machine (B) and runtime (C) ──

test("after migration the engine runs burst-fit in-IR with identical transitions", async () => {
  const { world, runtime } = await appliedPipeline();
  const b = synthBurst({ rpm: 11.7, amplitude: 2.5, phase: 0.8 });
  await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate: createBurstFitInIrHandler({ sampleSource: bs => (bs === BURST ? { g: b.g, dt: b.dt, n_valid_pkgs: 42 } : null) }),
    oracle: groundTruthOracle(11.7),
    fixtures: [{ request: burstRequest() }]
  });

  const rt = createProcessRuntime(world);
  rt.set("BurstFitMillId", "MILL-7");
  rt.set("BurstFitBurstStart", BURST);
  rt.set("BurstFitBurstEnd", "2026-01-01T00:00:12Z");
  const obs = await rt.stepViaHostOp("RunBurstFit", runtime);

  assert.equal(obs.outcome, "success");
  assert.ok(Math.abs(rt.value("BurstFitResultRpm") - 11.7) < 1e-6); // computed by the in-IR kernel
  assert.equal(rt.value("BurstFitNValidPkgs"), 42);
  assert.deepEqual(rt.history("BurstFitRunState"), ["running", "complete"]);
  assert.equal(rt.policyOutcome("BurstQualityPolicy"), "ready");
});

test("the in-IR handler surfaces the data seam clearly when samples are missing", async () => {
  const handler = createBurstFitInIrHandler({ sampleSource: () => null });
  await assert.rejects(() => handler(burstRequest(), { host_operation: HOST_OP }), /no samples for burst_start/);
});
