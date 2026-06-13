// host-op-migration.js — GENERIC "DESIRE eats the black box" migration capability.
//
// Rung D of the pipeline-fidelity ladder. Rung C made a host operation run
// against an opaque black box behind a frozen ABI ({host_operation, request} →
// {status, payload}). This module lets you re-express that operation's algorithm
// *inside* DESIRE (a compute kernel and/or a dataflow `model`) and then SWAP it
// in behind the identical protocol — but only after proving it reproduces the
// black box's outputs to a numeric tolerance. The state machine (B) and runtime
// (C) never change; the black box is replaced from underneath, invisibly.
//
// Three reusable pieces:
//   • createComputeHostOpHandler — wrap ANY compute (a lowered kernel, an
//     `evaluateModel` call, plain JS) as an ABI-conforming host-op handler.
//   • verifyAgainstOracle        — run an oracle (the black box / captured
//     golden) and a candidate (the in-IR impl) over fixtures and assert numeric
//     equivalence to a tolerance (1e-6 deterministic; a documented statistical
//     tolerance otherwise).
//   • migrateHostOperation       — verify, then (only if equivalent) flip the
//     runtime's handler for that host_operation, recording provenance.
//
// None of this is engentus-specific; the algorithms (the burst-fit kernel, etc.)
// are the vertical and live under examples_rvm/engentus/.

import { HostOperationError } from "./host-operation.js";

// ── In-IR handler factory ──
// resolveInputs(request, meta) -> inputs   (the seam: in production this fetches
//                                           real sample data; in tests it reads a
//                                           fixture sample source)
// compute(inputs, request, meta) -> outputs  (the lowered kernel / dataflow model)
// mapResponse(outputs, request, meta) -> payload | { status, payload }
export function createComputeHostOpHandler({ resolveInputs = r => r, compute, mapResponse = o => o } = {}) {
  if (typeof compute !== "function") throw new Error("createComputeHostOpHandler: `compute` must be a function");
  return async (request, meta) => {
    const inputs = await resolveInputs(request ?? {}, meta);
    const outputs = await compute(inputs, request ?? {}, meta);
    const mapped = mapResponse(outputs, request ?? {}, meta);
    return mapped && typeof mapped === "object" && "status" in mapped ? mapped : { status: "success", payload: mapped };
  };
}

// ── Numeric structural comparison ──
// Walks two response values in lockstep: numbers must agree within `tolerance`
// (relative for large magnitudes, absolute otherwise); strings / bools / null
// must be strictly equal; objects/arrays must share shape. Returns the worst
// absolute error seen and a list of mismatching paths.
export function compareNumeric(oracle, candidate, tolerance = 1e-6, path = "") {
  const mismatches = [];
  let maxAbsErr = 0;

  const walk = (a, b, p) => {
    if (typeof a === "number" && typeof b === "number") {
      if (Number.isNaN(a) && Number.isNaN(b)) return;
      const absErr = Math.abs(a - b);
      const scaled = absErr / Math.max(1, Math.abs(a), Math.abs(b));
      maxAbsErr = Math.max(maxAbsErr, absErr);
      if (scaled > tolerance) mismatches.push(`${p || "<root>"}: ${a} vs ${b} (|Δ|=${absErr.toExponential(3)})`);
      return;
    }
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
      if (a !== b) mismatches.push(`${p || "<root>"}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) walk(a[k], b[k], p ? `${p}.${k}` : k);
  };

  walk(oracle, candidate, path);
  return { ok: mismatches.length === 0, maxAbsErr, mismatches };
}

// ── Equivalence harness ──
// oracle / candidate are ABI handlers: (request, meta) -> { status, payload }.
// fixtures is an array of { host_operation, request }.
export async function verifyAgainstOracle({ oracle, candidate, fixtures, tolerance = 1e-6 } = {}) {
  if (typeof oracle !== "function" || typeof candidate !== "function") throw new Error("verifyAgainstOracle: oracle and candidate must be handler functions");
  if (!Array.isArray(fixtures) || fixtures.length === 0) throw new Error("verifyAgainstOracle: fixtures must be a non-empty array of { host_operation, request }");

  const comparisons = [];
  let maxAbsErr = 0;
  let ok = true;
  for (const fx of fixtures) {
    const meta = { host_operation: fx.host_operation ?? null };
    const oResp = await oracle(fx.request ?? {}, meta);
    const cResp = await candidate(fx.request ?? {}, meta);
    const statusMatch = oResp?.status === cResp?.status;
    const cmp = compareNumeric(oResp?.payload ?? {}, cResp?.payload ?? {}, tolerance);
    const fixtureOk = statusMatch && cmp.ok;
    if (!fixtureOk) ok = false;
    maxAbsErr = Math.max(maxAbsErr, cmp.maxAbsErr);
    comparisons.push({
      request: fx.request,
      ok: fixtureOk,
      statusMatch,
      maxAbsErr: cmp.maxAbsErr,
      mismatches: [...(statusMatch ? [] : [`status: ${oResp?.status} vs ${cResp?.status}`]), ...cmp.mismatches]
    });
  }
  return { ok, tolerance, maxAbsErr, comparisons };
}

// ── The flip: verify, then swap the runtime's handler behind the stable ABI ──
export async function migrateHostOperation(runtime, { hostOperation, candidate, oracle, fixtures, tolerance = 1e-6, from = "black-box", to = "in-ir" } = {}) {
  if (!runtime || typeof runtime.register !== "function") throw new Error("migrateHostOperation: a runtime with register() is required");
  if (!hostOperation) throw new Error("migrateHostOperation: `hostOperation` is required");

  const envelopes = (fixtures ?? []).map(fx => ("request" in (fx ?? {}) ? { host_operation: hostOperation, request: fx.request } : { host_operation: hostOperation, request: fx }));
  const report = await verifyAgainstOracle({ oracle, candidate, fixtures: envelopes, tolerance });
  if (!report.ok) {
    const detail = report.comparisons.filter(c => !c.ok).map(c => `  request=${JSON.stringify(c.request)} → ${c.mismatches.join("; ")}`).join("\n");
    throw new HostOperationError(`migration of '${hostOperation}' rejected: in-IR candidate disagrees with the oracle beyond tolerance ${tolerance}\n${detail}`, report.comparisons.flatMap(c => c.mismatches));
  }
  runtime.register(hostOperation, candidate);
  return { ok: true, hostOperation, provenance: { from, to, verified: true, tolerance, maxAbsErr: report.maxAbsErr }, report };
}
