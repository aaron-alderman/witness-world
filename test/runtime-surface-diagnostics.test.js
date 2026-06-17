import assert from "node:assert/strict";
import test from "node:test";
import {
  createSurfaceRuntimeIssueLedger,
  summarizeExecutionBlockers,
  surfaceDiagnosticsOverlayEnabled
} from "../src/runtime-surface-diagnostics.js";

test("createSurfaceRuntimeIssueLedger dedupes by id and preserves resolution state", () => {
  const ledger = createSurfaceRuntimeIssueLedger();

  ledger.upsert({
    id: "surface-runtime:test",
    severity: "warning",
    message: "first"
  });
  ledger.upsert({
    id: "surface-runtime:test",
    severity: "error",
    message: "second"
  });
  ledger.resolve("surface-runtime:test", { details: "done" });

  const issues = ledger.list();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "error");
  assert.equal(issues[0].status, "resolved");
  assert.equal(issues[0].details, "done");
});

test("summarizeExecutionBlockers groups pending tasks by runtime class", () => {
  const summary = summarizeExecutionBlockers({
    settled: false,
    activeTaskCount: 5,
    pendingByKind: {
      "process.delay": 1,
      "route-swap": 1,
      "capability-assets": 2,
      "runtime-bridge": 1,
      reconcile: 3
    }
  });

  assert.deepEqual(summary, {
    settled: false,
    activeTaskCount: 5,
    process: 1,
    route: 1,
    capability: 2,
    bridge: 1,
    reconcile: 3
  });
});

test("surfaceDiagnosticsOverlayEnabled respects explicit query override", () => {
  assert.equal(surfaceDiagnosticsOverlayEnabled({
    location: { href: "http://example.com/?surfaceDiagnostics=1", hostname: "example.com" }
  }), true);
  assert.equal(surfaceDiagnosticsOverlayEnabled({
    location: { href: "http://localhost/?surfaceDiagnostics=0", hostname: "localhost" }
  }), false);
});
