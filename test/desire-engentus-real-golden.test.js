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
  extractHostOperationContracts
} from "../src/desire/index.js";
import { realGoldenB01, realGoldenHandlers } from "../examples_rvm/engentus/real-golden-replay.mjs";

// ── Item: wire the REAL golden CSVs as Rung-C fixtures (replace synthetic) ──
//
// Proves the captured real-output fixtures (a) are taken verbatim from the real
// B01 CSVs, (b) validate as Rung-C responses against the declared schemas, and
// (c) replay through the verified state machine producing the real values.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const OUT = path.join(process.cwd(), "example-ports", "engentus-pipeline", "analysis", "output", "B01", "outputs");

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
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
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = lines.slice(1).map(splitCsvLine);
  return { idx, rows };
}

async function applied() {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
  const world = createWorld();
  applyDesire(world, desire);
  return world;
}

test("the fixtures are taken verbatim from the real B01 output CSVs", () => {
  const golden = realGoldenB01();

  // fit.burst ← burst_rotation.csv row 1
  const br = readCsv("burst_rotation.csv");
  const row0 = br.rows[0];
  const fit = golden.operations["engentus.pipeline.fit.burst"].response.payload;
  assert.equal(fit.burst_start, row0[br.idx.burst_start]);
  assert.equal(fit.rpm, Number(row0[br.idx.rpm]));
  assert.equal(fit.n_valid_pkgs, Number(row0[br.idx.valid_package_count]));

  // kalman ← burst_kalman.csv first kalman_ok=True row
  const bk = readCsv("burst_kalman.csv");
  const okRow = bk.rows.find(r => r[bk.idx.kalman_ok] === "True");
  const kal = golden.operations["engentus.pipeline.kalman"].response.payload;
  assert.equal(kal.burst_start, okRow[bk.idx.burst_start_utc]);
  assert.equal(kal.omega_burst_rpm, Number(okRow[bk.idx.omega_burst_rpm]));
  assert.equal(kal.delta_bt_deg, Number(okRow[bk.idx.delta_BT_deg]));
  assert.equal(kal.bias_combined_dps, Number(okRow[bk.idx.bias_combined_dps]));
});

test("the real fixtures validate as Rung-C responses against the declared schemas", async () => {
  const world = await applied();
  const contracts = extractHostOperationContracts(world);
  const runtime = createHostOperationRuntime({ handlers: realGoldenHandlers(), contracts });
  const golden = realGoldenB01();
  for (const [hostOp, io] of Object.entries(golden.operations)) {
    const response = await runtime.invoke({ host_operation: hostOp, request: io.request });
    assert.equal(response.status, "success");
    assert.deepEqual(response.payload, io.response.payload);
  }
});

test("the real burst-fit golden replays through the engine (rpm 11.45, complete, ready)", async () => {
  const world = await applied();
  const contracts = extractHostOperationContracts(world);
  const runtime = createHostOperationRuntime({ handlers: realGoldenHandlers(), contracts });
  const req = realGoldenB01().operations["engentus.pipeline.fit.burst"].request;

  const rt = createProcessRuntime(world);
  rt.set("BurstFitMillId", req.mill_id);
  rt.set("BurstFitBurstStart", req.burst_start);
  rt.set("BurstFitBurstEnd", req.burst_end);
  const obs = await rt.stepViaHostOp("RunBurstFit", runtime);

  assert.equal(obs.outcome, "success");
  assert.equal(rt.value("BurstFitResultRpm"), 11.45000000000002); // the REAL rpm, not the synthetic 12.5
  assert.equal(rt.value("BurstFitNValidPkgs"), 6);
  assert.equal(rt.value("BurstFitRunState"), "complete");
  assert.equal(rt.policyOutcome("BurstQualityPolicy"), "ready");
});

test("the real kalman golden replays through the engine (real omega + δ_BT, complete, ready)", async () => {
  const world = await applied();
  const contracts = extractHostOperationContracts(world);
  const runtime = createHostOperationRuntime({ handlers: realGoldenHandlers(), contracts });
  const req = realGoldenB01().operations["engentus.pipeline.kalman"].request;

  const rt = createProcessRuntime(world);
  rt.set("KalmanMillId", req.mill_id);
  rt.set("KalmanBurstStart", req.burst_start);
  rt.set("KalmanBurstEnd", req.burst_end);
  const obs = await rt.stepViaHostOp("RunKalmanAngle", runtime);

  assert.equal(obs.outcome, "success");
  assert.equal(rt.value("KalmanResultRpm"), 11.34044012376737);
  assert.equal(rt.value("KalmanDeltaBtDeg"), 1035012.5141895331);
  assert.equal(rt.value("KalmanRunState"), "complete");
  assert.equal(rt.policyOutcome("KalmanQualityPolicy"), "ready");
});
