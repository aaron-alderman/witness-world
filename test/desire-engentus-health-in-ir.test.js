import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createWorld } from "../src/kernel.js";
import {
  applyDesire, compileRvmFileToDesirePlus, normalizeDesirePlusToDesire,
  createProcessRuntime, createHostOperationRuntime, extractHostOperationContracts,
  migrateHostOperation, HostOperationError
} from "../src/desire/index.js";
import { engentusHostOpHandlers } from "../examples_rvm/engentus/host-ops-stub.mjs";
import { createHealthClassifyInIrHandler } from "../plugins/pipeline-runtime/health-kernels.js";

// ── Rung D: wire the verified health classifier INTO the IR ──
// Re-expresses health-kernel as engentus.pipeline.health.classify, swaps it in
// via migrateHostOperation, and drives it through the Rung-B engine. The data
// seam reads the REAL channel_health_hourly.csv; the oracle is the CSV's own
// `state` labels (which the kernel reproduces exactly).

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const OUT = path.join(process.cwd(), "example-ports", "engentus-pipeline", "analysis", "output", "B01", "outputs");
const HOST_OP = "engentus.pipeline.health.classify";

function readCsv(file) {
  const lines = readFileSync(path.join(OUT, file), "utf8").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  return lines.slice(1).map(l => {
    const v = l.split(",");
    return Object.fromEntries(header.map((h, i) => [h, v[i]]));
  });
}

const allRows = readCsv("channel_health_hourly.csv");
const HOUR = allRows[0].hour_start;                       // first hour in the golden
const hourRows = allRows.filter(r => r.hour_start === HOUR);
const sampleSource = hs => (hs === HOUR ? allRows.filter(r => r.hour_start === hs) : null);
const healthRequest = () => ({ source_name: "engentus.mill.pipeline", mill_id: "B01", hour_start: HOUR });

// oracle from the golden's own labels (kernel reproduces these exactly).
function healthOracle() {
  const nValid = hourRows.filter(r => r.state === "valid").length;
  const nBolts = new Set(hourRows.map(r => r.bolt_number)).size;
  return async request => ({
    status: "success",
    payload: { hour_start: request.hour_start, n_valid_channels: nValid, n_bolts_evaluated: nBolts }
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

test("the in-IR health handler reproduces the golden valid-channel / bolt counts", async () => {
  assert.ok(hourRows.length > 0, "expected rows for the chosen hour");
  const handler = createHealthClassifyInIrHandler({ sampleSource, readFile: fs.readFile });
  const res = await handler(healthRequest(), { host_operation: HOST_OP });
  const oracle = await healthOracle()(healthRequest());
  assert.equal(res.status, "success");
  assert.deepEqual(res.payload, oracle.payload);
});

test("migrateHostOperation verifies health == golden, then flips the runtime", async () => {
  const { runtime } = await appliedPipeline();
  const result = await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate: createHealthClassifyInIrHandler({ sampleSource, readFile: fs.readFile }),
    oracle: healthOracle(),
    fixtures: [{ request: healthRequest() }],
    tolerance: 1e-6
  });
  assert.equal(result.ok, true);
  assert.equal(result.provenance.to, "in-ir");
  const after = await runtime.invoke({ host_operation: HOST_OP, request: healthRequest() });
  assert.equal(after.payload.n_valid_channels, hourRows.filter(r => r.state === "valid").length);
});

test("migrateHostOperation refuses the flip when the health counts disagree", async () => {
  const { runtime } = await appliedPipeline();
  const wrongOracle = async request => ({
    status: "success",
    payload: { hour_start: request.hour_start, n_valid_channels: 999, n_bolts_evaluated: 1 }
  });
  await assert.rejects(
    () => migrateHostOperation(runtime, {
      hostOperation: HOST_OP, candidate: createHealthClassifyInIrHandler({ sampleSource, readFile: fs.readFile }),
      oracle: wrongOracle, fixtures: [{ request: healthRequest() }], tolerance: 1e-6
    }),
    err => err instanceof HostOperationError && /disagrees with the oracle/.test(err.message)
  );
});

test("after migration the engine runs health-classify in-IR with the declared transitions", async () => {
  const { world, runtime } = await appliedPipeline();
  await migrateHostOperation(runtime, {
    hostOperation: HOST_OP,
    candidate: createHealthClassifyInIrHandler({ sampleSource, readFile: fs.readFile }),
    oracle: healthOracle(),
    fixtures: [{ request: healthRequest() }]
  });

  const rt = createProcessRuntime(world);
  rt.set("HealthMillId", "B01");
  rt.set("HealthHourStart", HOUR);
  const obs = await rt.stepViaHostOp("RunHealthAnalysis", runtime);

  assert.equal(obs.outcome, "success");
  assert.equal(rt.value("HealthNValidChannels"), hourRows.filter(r => r.state === "valid").length);
  assert.equal(rt.value("HealthNBoltsEvaluated"), new Set(hourRows.map(r => r.bolt_number)).size);
  assert.deepEqual(rt.history("HealthRunState"), ["running", "complete"]);
});
