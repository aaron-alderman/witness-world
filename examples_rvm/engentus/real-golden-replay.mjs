// real-golden-replay.mjs — REAL captured-output replay handlers (engentus vertical).
//
// The faithful counterpart to host-ops-stub.mjs: instead of returning made-up
// constants, these handlers replay the REAL Python pipeline outputs captured for
// mill B01 (fixtures/real-golden-B01.json, sourced verbatim from the analysis
// output CSVs). This is the deterministic CI stand-in that reproduces real
// algorithm outputs — the drop-in target the real Python (or, eventually, an
// in-IR DESIRE implementation) must match. Conforms to the host-op ABI.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function realGoldenB01() {
  return JSON.parse(readFileSync(path.join(here, "fixtures", "real-golden-B01.json"), "utf8"));
}

// Build { host_operation -> handler } that replays the captured real responses.
export function realGoldenHandlers(golden = realGoldenB01()) {
  const handlers = {};
  for (const [hostOp, io] of Object.entries(golden.operations)) {
    handlers[hostOp] = async () => io.response;
  }
  return handlers;
}
