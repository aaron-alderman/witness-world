import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createWorld } from "../src/kernel.js";
import {
  applyDesire, compileRvmFileToDesirePlus, normalizeDesirePlusToDesire,
  createProcessRuntime, createHostOperationRuntime, extractHostOperationContracts,
  migrateHostOperation, HostOperationError
} from "../src/desire/index.js";
import { engentusHostOpHandlers } from "../examples_rvm/engentus/host-ops-stub.mjs";
import { createKalmanInIrHandler, processBurst } from "../plugins/pipeline-runtime/kalman-kernels.js";

// ── Rung D: wire the verified Kalman kernel INTO the IR (verify-then-flip) ──
//
// The kalman-kernel is verified against the R reference elsewhere; here it is
// re-expressed as the engentus.pipeline.kalman host-op handler and swapped in
// behind the ABI via migrateHostOperation, then driven through the Rung-B
// engine — the "DESIRE eats the black box" step the kernel was missing.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const FIX = path.join(process.cwd(), "examples_rvm", "engentus", "fixtures");
const fx = JSON.parse(readFileSync(path.join(FIX, "kalman-burst-B01.json"), "utf8"));
const HOST_OP = "engentus.pipeline.kalman";
const BURST = fx.burst_start_utc;

const alignedStreams = () => ({
  tS: fx.t_s, boltAccelG: fx.bolt_accel_g, txAccelG: fx.tx_accel_g,
  boltGyroDps: fx.bolt_gyro_dps, txGyroDps: fx.tx_gyro_dps
});
const sampleSource = bs => (bs === BURST ? alignedStreams() : null);
const kalmanRequest = () => ({
  source_name: "engentus.mill.pipeline", mill_id: "B01", burst_start: BURST,
  burst_end: "2026-04-02T16:23:54Z"
});

// oracle = the authoritative R reference (the kernel is the R port → they agree).
function rReferenceOracle() {
  const r = fx.r_reference;
  return async request => ({
    status: "success",
    payload: {
      burst_start: request.burst_start,
      omega_burst_rpm: r.omega_burst_rpm,
      delta_bt_deg: r.delta_BT_deg,
      bias_combined_dps: r.bias_combined_dps,
      omega_disagree_flag: Math.abs(r.omega_bolt_dps - r.omega_tx_dps) > 10
    }
  });
}

async function appliedPipeline() {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
  const world = createWorld();
  applyDesire(world, desire);
  const contracts = extractHostOperationContracts(world);
  const runtime = createHostOperationRuntime({ handlers: engentusHostOpHandlers(), contracts });
  return { world, runtime };
}

test("the in-IR Kalman handler reproduces the R-reference payload (the oracle)", async () => {
  const handler = createKalmanInIrHandler({ sampleSource });
  const res = await handler(kalmanRequest(), { host_operation: HOST_OP });
  const oracle = await rReferenceOracle()(kalmanRequest());
  assert.equal(res.status, "success");
  assert.ok(Math.abs(res.payload.omega_burst_rpm - oracle.payload.omega_burst_rpm) < 1e-9);
  assert.ok(Math.abs(res.payload.delta_bt_deg - oracle.payload.delta_bt_deg) < 1e-9);
  assert.ok(Math.abs(res.payload.bias_combined_dps - oracle.payload.bias_combined_dps) < 1e-9);
  assert.equal(res.payload.omega_disagree_flag, oracle.payload.omega_disagree_flag);
});

test("migrateHostOperation verifies the kernel == R oracle, then flips the runtime", async () => {
  const { runtime } = await appliedPipeline();
  const before = await runtime.invoke({ host_operation: HOST_OP, request: kalmanRequest() });
  const result = await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate: createKalmanInIrHandler({ sampleSource }),
    oracle: rReferenceOracle(),
    fixtures: [{ request: kalmanRequest() }],
    tolerance: 1e-6
  });
  assert.equal(result.ok, true);
  assert.equal(result.provenance.to, "in-ir");
  assert.ok(result.provenance.verified);

  const after = await runtime.invoke({ host_operation: HOST_OP, request: kalmanRequest() });
  assert.ok(Math.abs(after.payload.omega_burst_rpm - fx.r_reference.omega_burst_rpm) < 1e-9);
  // the stub's value differed; the in-IR kernel now drives it
  assert.notDeepEqual(after.payload, before.payload);
});

test("migrateHostOperation refuses the flip when the kernel disagrees with the oracle", async () => {
  const { runtime } = await appliedPipeline();
  // oracle claims a different rpm → candidate (real kernel) must disagree
  const wrongOracle = async request => ({
    status: "success",
    payload: {
      burst_start: request.burst_start, omega_burst_rpm: 99.9,
      delta_bt_deg: 0, bias_combined_dps: 0, omega_disagree_flag: false
    }
  });
  await assert.rejects(
    () => migrateHostOperation(runtime, {
      hostOperation: HOST_OP, candidate: createKalmanInIrHandler({ sampleSource }),
      oracle: wrongOracle, fixtures: [{ request: kalmanRequest() }], tolerance: 1e-6
    }),
    err => err instanceof HostOperationError && /disagrees with the oracle/.test(err.message)
  );
});

test("after migration the engine runs Kalman in-IR with the declared transitions", async () => {
  const { world, runtime } = await appliedPipeline();
  await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate: createKalmanInIrHandler({ sampleSource }),
    oracle: rReferenceOracle(),
    fixtures: [{ request: kalmanRequest() }]
  });

  const rt = createProcessRuntime(world);
  rt.set("KalmanMillId", "B01");
  rt.set("KalmanBurstStart", BURST);
  rt.set("KalmanBurstEnd", "2026-04-02T16:23:54Z");
  const obs = await rt.stepViaHostOp("RunKalmanAngle", runtime);

  assert.equal(obs.outcome, "success");
  assert.ok(Math.abs(rt.value("KalmanResultRpm") - fx.r_reference.omega_burst_rpm) < 1e-9);
  assert.ok(Math.abs(rt.value("KalmanDeltaBtDeg") - fx.r_reference.delta_BT_deg) < 1e-9);
  assert.deepEqual(rt.history("KalmanRunState"), ["running", "complete"]);
});

test("the in-IR handler surfaces the data seam when samples are missing", async () => {
  const handler = createKalmanInIrHandler({ sampleSource: () => null });
  await assert.rejects(() => handler(kalmanRequest(), { host_operation: HOST_OP }),
    /no samples for burst_start/);
});
