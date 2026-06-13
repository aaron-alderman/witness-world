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
  createMaterializedHostOperationRoute,
  createSubprocessHandler,
  extractHostOperationContracts,
  HostOperationError
} from "../src/desire/index.js";
import { engentusHostOpHandlers } from "../examples_rvm/engentus/host-ops-stub.mjs";

// ── Rung C: the pipeline runs end-to-end against a (stubbed) black box ──
//
// command → host-op runtime → response → success/failure event → state → policy,
// over a frozen request/response ABI. The algorithms stay opaque; what is proven
// here is the *system* (wiring + execution + integration + I/O protocol).

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");
const ECHO = path.join(process.cwd(), "test", "fixtures", "host-op-echo.mjs");
const GOLDEN = JSON.parse(readFileSync(path.join(process.cwd(), "examples_rvm", "engentus", "fixtures", "host-op-golden.json"), "utf8"));

let desireDoc;
async function pipeline() {
  if (!desireDoc) desireDoc = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
  const world = createWorld();
  applyDesire(world, desireDoc);
  const contracts = extractHostOperationContracts(world);
  const runtime = createHostOperationRuntime({ handlers: engentusHostOpHandlers(), contracts });
  return { world, contracts, runtime, desire: desireDoc };
}

function eventWrites(desire, eventId) {
  return desire.nodes.find(n => n.kind === "message" && n.name === eventId)?.body.writes ?? {};
}

// ── Protocol / contract extraction ──

test("contracts are extracted for all 11 host operations with their schemas", async () => {
  const { contracts } = await pipeline();
  assert.equal(Object.keys(contracts.operations).length, 11);
  const burst = contracts.operations["engentus.pipeline.fit.burst"];
  assert.deepEqual(burst, {
    adapter: "BurstFitSbtp",
    command: "RunBurstFit",
    requestSchema: "BurstFitRequest",
    successEvent: "BurstFitCompleted",
    failureEvent: "BurstFitFailed",
    successResultSchema: "BurstFitResultPayload",
    failureResultSchema: "BurstFitFailedPayload"
  });
});

test("the runtime validates the request against its schema", async () => {
  const { runtime } = await pipeline();
  await assert.rejects(
    () => runtime.invoke({ host_operation: "engentus.pipeline.fit.burst", request: { mill_id: "M" } }),
    err => err instanceof HostOperationError && err.violations.some(v => v.includes("missing field 'source_name'"))
  );
});

test("the runtime validates the response payload against the result schema", async () => {
  const { contracts } = await pipeline();
  const runtime = createHostOperationRuntime({
    contracts,
    handlers: { "engentus.pipeline.fit.burst": () => ({ status: "success", payload: { burst_start: "t", rpm: "fast", n_valid_pkgs: 3 } }) }
  });
  await assert.rejects(
    () => runtime.invoke({ host_operation: "engentus.pipeline.fit.burst", request: GOLDEN.operations["engentus.pipeline.fit.burst"].request }),
    err => err instanceof HostOperationError && err.violations.some(v => v.includes("field 'rpm' expected float64"))
  );
});

test("an unregistered host operation is rejected", async () => {
  const { runtime } = await pipeline();
  await assert.rejects(() => runtime.invoke({ host_operation: "engentus.pipeline.nope", request: {} }), /no handler registered/);
});

test("the stub reproduces the captured golden outputs", async () => {
  const handlers = engentusHostOpHandlers();
  for (const [hostOp, io] of Object.entries(GOLDEN.operations)) {
    const response = await handlers[hostOp](io.request, { host_operation: hostOp });
    assert.deepEqual(response, io.response, hostOp);
  }
});

// ── End-to-end engine integration ──

test("burst-fit runs end-to-end: command → host-op → result payload → state → policy", async () => {
  const { world, runtime } = await pipeline();
  const rt = createProcessRuntime(world);
  rt.set("BurstFitMillId", "MILL-7");
  rt.set("BurstFitBurstStart", "2026-01-01T00:00:00Z");
  rt.set("BurstFitBurstEnd", "2026-01-01T00:00:01Z");

  const obs = await rt.stepViaHostOp("RunBurstFit", runtime);

  // request was assembled from command field bindings (literals + state)
  assert.deepEqual(obs.request, GOLDEN.operations["engentus.pipeline.fit.burst"].request);
  assert.equal(obs.outcome, "success");
  // result payload flowed into state via the success event's payload bindings
  assert.equal(rt.value("BurstFitResultRpm"), 12.5);
  assert.equal(rt.value("BurstFitNValidPkgs"), 42);
  // the declared writes fired
  assert.equal(rt.value("BurstFitRunState"), "complete");
  assert.equal(rt.value("BurstFitLoading"), false);
  // full lifecycle + policy
  assert.deepEqual(rt.history("BurstFitRunState"), ["running", "complete"]);
  assert.equal(rt.policyOutcome("BurstQualityPolicy"), "ready");
});

test("every stage runs end-to-end to its declared success state", async () => {
  const { world, contracts, runtime, desire } = await pipeline();
  for (const [, c] of Object.entries(contracts.operations)) {
    const rt = createProcessRuntime(world);
    const obs = await rt.stepViaHostOp(c.command, runtime);
    assert.equal(obs.outcome, "success", c.command);
    // the success event's declared writes were all applied
    for (const [field, expected] of Object.entries(eventWrites(desire, c.successEvent))) {
      assert.equal(rt.value(field), expected, `${c.command} → ${field}`);
    }
  }
});

test("a failing host-op drives the failure event, failed state, and repair_required", async () => {
  const { world, contracts } = await pipeline();
  const runtime = createHostOperationRuntime({
    contracts,
    handlers: { ...engentusHostOpHandlers(), "engentus.pipeline.fit.burst": () => ({ status: "failure", payload: { message: "boom" } }) }
  });
  const rt = createProcessRuntime(world);
  const obs = await rt.stepViaHostOp("RunBurstFit", runtime);
  assert.equal(obs.outcome, "failure");
  assert.equal(rt.value("BurstFitRunState"), "failed");
  assert.equal(rt.value("BurstFitErrorMessage"), "boom"); // failure payload bound into state
  assert.deepEqual(rt.history("BurstFitRunState"), ["running", "failed"]);
  assert.equal(rt.policyOutcome("BurstQualityPolicy"), "repair_required");
});

test("the materialized-host-operation route delegates to the runtime", async () => {
  const { runtime } = await pipeline();
  const route = createMaterializedHostOperationRoute(runtime);
  const response = await route({ host_operation: "engentus.pipeline.fit.burst", request: GOLDEN.operations["engentus.pipeline.fit.burst"].request });
  assert.deepEqual(response, GOLDEN.operations["engentus.pipeline.fit.burst"].response);
});

// ── Subprocess transport: pathway-agnostic (env/stdin/file in, stdout/file out) ──

const PATHWAYS = [
  ["env", "stdout"],
  ["stdin", "stdout"],
  ["file", "stdout"],
  ["stdin", "file"],
  ["file", "file"],
  ["env", "file"]
];

for (const [input, output] of PATHWAYS) {
  test(`subprocess transport round-trips a request via ${input} → ${output}`, async () => {
    const handler = createSubprocessHandler({
      command: process.execPath,
      args: [ECHO],
      input: { via: input },
      output: { via: output }
    });
    const response = await handler({ marker: `${input}->${output}`, n: 7 }, { host_operation: "toy.echo" });
    assert.equal(response.status, "success");
    assert.equal(response.payload.host_operation, "toy.echo");
    assert.deepEqual(response.payload.echo, { marker: `${input}->${output}`, n: 7 });
  });
}

test("subprocess transport surfaces a failure response", async () => {
  const handler = createSubprocessHandler({ command: process.execPath, args: [ECHO], input: { via: "stdin" }, output: { via: "stdout" } });
  const response = await handler({ simulate: "failure" }, { host_operation: "toy.echo" });
  assert.equal(response.status, "failure");
  assert.equal(response.payload.message, "simulated failure");
});

test("subprocess transport treats stderr + non-zero exit as the error channel", async () => {
  const handler = createSubprocessHandler({ command: process.execPath, args: [ECHO], input: { via: "stdin" }, output: { via: "stdout" } });
  await assert.rejects(
    () => handler({ simulate: "crash" }, { host_operation: "toy.echo" }),
    err => err instanceof HostOperationError && /exited 3/.test(err.message) && /simulated crash/.test(err.message)
  );
});

test("a runtime can drive a host operation through a real subprocess handler", async () => {
  // Proves the in-proc stub and the subprocess transport are interchangeable
  // behind the same ABI: here the echo black box backs a host operation.
  const runtime = createHostOperationRuntime({
    handlers: { "toy.echo": createSubprocessHandler({ command: process.execPath, args: [ECHO], input: { via: "file" }, output: { via: "file" } }) }
  });
  const response = await runtime.invoke({ host_operation: "toy.echo", request: { hello: "world" } });
  assert.equal(response.status, "success");
  assert.deepEqual(response.payload.echo, { hello: "world" });
});
