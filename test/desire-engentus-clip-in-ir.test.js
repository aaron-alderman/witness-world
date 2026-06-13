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
import { createClipDetectInIrHandler } from "../plugins/pipeline-runtime/clip-kernels.js";

// ── Rung D: wire the verified clip-detection kernel INTO the IR ──
// Re-expresses clip-kernel as the engentus.pipeline.clip.detect host-op, swaps
// it in via migrateHostOperation, and drives it through the Rung-B engine.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const FIX = path.join(process.cwd(), "examples_rvm", "engentus", "fixtures");
const fx = JSON.parse(readFileSync(path.join(FIX, "clip-samples.json"), "utf8"));
const HOST_OP = "engentus.pipeline.clip.detect";
const BURST = "B1";

const sampleSource = bs => fx.samples.filter(s => s.burst_id === bs);
const clipRequest = () => ({
  source_name: "engentus.mill.pipeline", mill_id: "B01", burst_start: BURST,
  burst_end: "B1-end"
});

// oracle from the R stats: B1 has 4 load channels, 3 of them clipped (y1/x3/z2).
function clipOracle() {
  const rows = fx.stats.filter(s => s.burst_id === BURST);
  const evaluated = rows.filter(r => r.is_clipped !== null).length;
  const clipped = rows.filter(r => r.is_clipped === true).length;
  return async request => ({
    status: "success",
    payload: { burst_start: request.burst_start, n_channels_evaluated: evaluated, n_clipped_channels: clipped }
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

test("the in-IR clip handler reproduces the R clip counts (4 evaluated, 3 clipped)", async () => {
  const handler = createClipDetectInIrHandler({ sampleSource });
  const res = await handler(clipRequest(), { host_operation: HOST_OP });
  const oracle = await clipOracle()(clipRequest());
  assert.equal(res.status, "success");
  assert.equal(res.payload.n_channels_evaluated, 4);
  assert.equal(res.payload.n_clipped_channels, 3);
  assert.deepEqual(res.payload, oracle.payload);
});

test("migrateHostOperation verifies clip == R oracle, then flips the runtime", async () => {
  const { runtime } = await appliedPipeline();
  const result = await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate: createClipDetectInIrHandler({ sampleSource }),
    oracle: clipOracle(),
    fixtures: [{ request: clipRequest() }],
    tolerance: 1e-6
  });
  assert.equal(result.ok, true);
  assert.equal(result.provenance.to, "in-ir");

  const after = await runtime.invoke({ host_operation: HOST_OP, request: clipRequest() });
  assert.equal(after.payload.n_clipped_channels, 3);
});

test("migrateHostOperation refuses the flip when clip counts disagree", async () => {
  const { runtime } = await appliedPipeline();
  const wrongOracle = async request => ({
    status: "success",
    payload: { burst_start: request.burst_start, n_channels_evaluated: 4, n_clipped_channels: 0 }
  });
  await assert.rejects(
    () => migrateHostOperation(runtime, {
      hostOperation: HOST_OP, candidate: createClipDetectInIrHandler({ sampleSource }),
      oracle: wrongOracle, fixtures: [{ request: clipRequest() }], tolerance: 1e-6
    }),
    err => err instanceof HostOperationError && /disagrees with the oracle/.test(err.message)
  );
});

test("after migration the engine runs clip-detection in-IR with the declared transitions", async () => {
  const { world, runtime } = await appliedPipeline();
  await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate: createClipDetectInIrHandler({ sampleSource }),
    oracle: clipOracle(),
    fixtures: [{ request: clipRequest() }]
  });

  const rt = createProcessRuntime(world);
  rt.set("ClipDetectionMillId", "B01");
  rt.set("ClipDetectionBurstStart", BURST);
  rt.set("ClipDetectionBurstEnd", "B1-end");
  const obs = await rt.stepViaHostOp("RunClipDetection", runtime);

  assert.equal(obs.outcome, "success");
  assert.equal(rt.value("ClipDetectionChannelsEvaluated"), 4);
  assert.equal(rt.value("ClipDetectionClippedChannels"), 3);
  assert.deepEqual(rt.history("ClipDetectionRunState"), ["running", "complete"]);
});
