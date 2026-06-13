import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createWorld } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire,
  validateAgainstSchema,
  createHostOperationRuntime
} from "../src/desire/index.js";

// ── Item 2: the RVM output-frame schemas faithfully model the real data ──
//
// Loads the REAL captured golden outputs (mill B01) and validates rows against
// the `*Frame` schema mirrors declared in PIPELINE.rvm — both directly and
// through the actual Rung-C runtime response-validation path. If a real golden
// row validates, the spec faithfully models the data the pipeline produces.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const OUT = path.join(process.cwd(), "example-ports", "engentus-pipeline", "analysis", "output", "B01", "outputs");

let schemas;
async function frameSchemas() {
  if (schemas) return schemas;
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
  schemas = {};
  for (const n of desire.nodes) if (n.kind === "message") schemas[n.name] = n.body.fields ?? [];
  return schemas;
}

// minimal RFC-4180-ish line splitter (handles quoted fields with embedded commas)
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file) {
  const lines = readFileSync(path.join(OUT, file), "utf8").split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

// a CSV is all strings; coerce each cell to the schema field's declared type
function coerce(value, type) {
  switch (type) {
    case "int":
    case "float64":
    case "number":
      return value === "" ? NaN : Number(value);
    case "bool":
      return /^true$/i.test(value);
    default:
      return value; // string / timestamptz
  }
}

function recordFromRow(fields, header, row) {
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rec = {};
  for (const f of fields) rec[f.name] = coerce(row[idx[f.name]] ?? "", f.type);
  return rec;
}

// frame → real golden file; picker selects a fully-populated representative row
const CSV_FRAMES = [
  { frame: "BurstRotationFrame", file: "burst_rotation.csv" },
  { frame: "PackageFitFrame", file: "package_phase.csv" },
  { frame: "ChannelHealthFrame", file: "channel_health_hourly.csv" },
  { frame: "BoltHealthFrame", file: "bolt_health_hourly.csv" },
  // float columns are null on a skipped burst — validate a successful (kalman_ok) row
  { frame: "BurstKalmanFrame", file: "burst_kalman.csv", pick: (header, rows) => {
      const k = header.indexOf("kalman_ok");
      return rows.find(r => r[k] === "True") ?? rows[0];
    } }
];

test("every output-frame schema is an exact column mirror of its real golden CSV", async () => {
  const sch = await frameSchemas();
  for (const { frame, file } of CSV_FRAMES) {
    const fields = sch[frame];
    assert.ok(fields, `${frame} declared`);
    const { header } = readCsv(file);
    // every schema field exists in the real header, and the counts match (exact mirror)
    for (const f of fields) assert.ok(header.includes(f.name), `${frame}: column '${f.name}' missing from ${file}`);
    assert.equal(fields.length, header.length, `${frame} should mirror all ${header.length} columns of ${file}`);
  }
});

test("a real golden row validates against each output-frame schema", async () => {
  const sch = await frameSchemas();
  for (const { frame, file, pick } of CSV_FRAMES) {
    const fields = sch[frame];
    const { header, rows } = readCsv(file);
    const row = pick ? pick(header, rows) : rows[0];
    const rec = recordFromRow(fields, header, row);
    const violations = validateAgainstSchema(rec, fields, frame);
    assert.deepEqual(violations, [], `${frame} vs ${file}: ${violations.join("; ")}`);
  }
});

test("the real latent_row_fit.json validates against LatentRowFit", async () => {
  const sch = await frameSchemas();
  const fields = sch.LatentRowFit;
  const obj = JSON.parse(readFileSync(path.join(OUT, "latent_row_fit.json"), "utf8"));
  const violations = validateAgainstSchema(obj, fields, "LatentRowFit");
  assert.deepEqual(violations, [], violations.join("; "));
});

test("real golden rows validate as Rung-C host-op responses (runtime response validation)", async () => {
  const sch = await frameSchemas();
  // Exercise the actual Rung-C path: a runtime whose result schema is the frame,
  // a handler that returns the real golden row, and the runtime validating it.
  for (const { frame, file, pick } of CSV_FRAMES) {
    const fields = sch[frame];
    const { header, rows } = readCsv(file);
    const row = pick ? pick(header, rows) : rows[0];
    const rec = recordFromRow(fields, header, row);
    const hostOp = `engentus.frame.${frame}`;
    const runtime = createHostOperationRuntime({
      handlers: { [hostOp]: () => ({ status: "success", payload: rec }) },
      contracts: { operations: { [hostOp]: { successResultSchema: frame } }, schemas: { [frame]: fields } }
    });
    const response = await runtime.invoke({ host_operation: hostOp, request: {} });
    assert.equal(response.status, "success");
    assert.deepEqual(response.payload, rec);
  }
});

test("the runtime rejects a frame response with a type-corrupted column", async () => {
  const sch = await frameSchemas();
  const fields = sch.BurstRotationFrame;
  const { header, rows } = readCsv("burst_rotation.csv");
  const rec = recordFromRow(fields, header, rows[0]);
  rec.rpm = "fast"; // corrupt a float column
  const hostOp = "engentus.frame.corrupt";
  const runtime = createHostOperationRuntime({
    handlers: { [hostOp]: () => ({ status: "success", payload: rec }) },
    contracts: { operations: { [hostOp]: { successResultSchema: "BurstRotationFrame" } }, schemas: { BurstRotationFrame: fields } }
  });
  await assert.rejects(
    () => runtime.invoke({ host_operation: hostOp, request: {} }),
    err => err.name === "HostOperationError" && err.violations.some(v => v.includes("field 'rpm' expected float64"))
  );
});
