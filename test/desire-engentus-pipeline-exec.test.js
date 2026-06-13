import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  compileRvmToDesirePlus,
  normalizeDesirePlusToDesire,
  createProcessRuntime
} from "../src/desire/index.js";

// ── Rung B: the declared pipeline state machine actually runs ──
//
// Golden event-sequence traces over the applied engentus pipeline, asserting the
// FULL trace (not just endpoints), plus a generic synthetic process proving the
// engine is independent of engentus.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");

async function appliedPipeline() {
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
  const world = createWorld();
  applyDesire(world, desire);
  return world;
}

test("IngestProcess: idle →(dispatch)→ running →(ImuIngestCompleted)→ complete", async () => {
  const rt = createProcessRuntime(await appliedPipeline());

  // seeded from value initials
  assert.equal(rt.value("IngestRunState"), "idle");
  assert.equal(rt.value("IngestLoading"), false);
  assert.equal(rt.derive("IngestIdle"), true);

  const dispatched = rt.dispatch("IngestImuBatch");
  assert.equal(dispatched.kind, "dispatch");
  assert.equal(dispatched.process, "IngestProcess");
  assert.equal(rt.value("IngestRunState"), "running");
  assert.equal(rt.value("IngestLoading"), true);
  assert.equal(dispatched.derives.IngestIdle, false);

  const completed = rt.resolve("IngestImuBatch", "success");
  assert.equal(completed.kind, "deliver");
  assert.equal(completed.label, "ImuIngestCompleted");
  assert.equal(rt.value("IngestRunState"), "complete");
  assert.equal(rt.value("IngestLoading"), false);
  assert.equal(completed.derives.IngestIdle, true);

  // assert the FULL trace, not just endpoints
  assert.deepEqual(rt.history("IngestRunState"), ["running", "complete"]);
  assert.deepEqual(rt.history("IngestLoading"), [true, false]);
  assert.deepEqual(rt.trace.map(o => [o.kind, o.label]), [
    ["dispatch", "IngestImuBatch"],
    ["deliver", "ImuIngestCompleted"]
  ]);
});

test("IngestProcess failure: idle →(dispatch)→ running →(IngestFailed)→ failed", async () => {
  const rt = createProcessRuntime(await appliedPipeline());
  rt.step("IngestImuBatch", "failure");
  assert.equal(rt.value("IngestRunState"), "failed");
  assert.equal(rt.value("IngestLoading"), false);
  assert.deepEqual(rt.history("IngestRunState"), ["running", "failed"]);
  assert.deepEqual(rt.trace.map(o => o.label), ["IngestImuBatch", "IngestFailed"]);
});

test("BurstQualityPolicy: repair_required on failed, ready on complete", async () => {
  const failing = createProcessRuntime(await appliedPipeline());
  failing.step("RunBurstFit", "failure");
  assert.equal(failing.value("BurstFitRunState"), "failed");
  assert.equal(failing.policyOutcome("BurstQualityPolicy"), "repair_required");

  const passing = createProcessRuntime(await appliedPipeline());
  passing.step("RunBurstFit", "success");
  assert.equal(passing.value("BurstFitRunState"), "complete");
  assert.equal(passing.policyOutcome("BurstQualityPolicy"), "ready");
});

test("ChannelHealthPolicy tracks the HealthProcess lifecycle", async () => {
  const rt = createProcessRuntime(await appliedPipeline());
  assert.equal(rt.policyOutcome("ChannelHealthPolicy"), null, "no outcome at idle");
  rt.dispatch("RunHealthAnalysis");
  assert.equal(rt.value("HealthRunState"), "running");
  rt.resolve("RunHealthAnalysis", "success");
  assert.equal(rt.policyOutcome("ChannelHealthPolicy"), "ready");
});

test("the engine refuses commands/events that are not declared", async () => {
  const rt = createProcessRuntime(await appliedPipeline());
  assert.throws(() => rt.dispatch("NotACommand"), /no process emits command/);
  assert.throws(() => rt.deliver("NotAnEvent"), /handled by no process/);
});

test("the runtime reports the discovered spec shape", async () => {
  const rt = createProcessRuntime(await appliedPipeline());
  assert.deepEqual(rt.counts, { processes: 10, policies: 3, derives: 10, adapters: 11 });
});

// ── Generic: a tiny synthetic process, no engentus anywhere ──

const TOY_SPEC = `import desire/v3-alpha

module ToyModule {
  in toy_ws
}

enum LightState {
  cases {
    off
    running
    lit
    broken
  }
}

value BulbState: LightState {
  initial off
}

value BulbLoading: bool {
  initial false
}

process BulbProcess {
  values {
    BulbState
    BulbLoading
  }
  handles {
    BulbLit
    BulbBroke
  }
  emits {
    FlipSwitch
  }
}

message FlipRequest {
  fields {
    who: string
  }
}

event BulbLit {
  writes {
    BulbState: lit
    BulbLoading: false
  }
}

event BulbBroke {
  writes {
    BulbState: broken
    BulbLoading: false
  }
}

command FlipSwitch {
  request_schema FlipRequest
  fields {
    who: "tester"
  }
}

adapter FlipSwitchSbtp using SBTP {
  command FlipSwitch
  kind command
  route "/toy"
  host_operation toy.flip
  request_schema FlipRequest
  loading_state BulbLoading
  success_event BulbLit
  failure_event BulbBroke
}

derive BulbIdle {
  kind bool_not
  source BulbLoading
}

policy BulbPolicy {
  subject BulbProcess
  initial_state off
  state_field BulbState
  ready_state lit
  disagreement_state broken
  policy_outcomes {
    lit: ready
    broken: repair_required
  }
}
`;

function toyWorld() {
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(TOY_SPEC, { file: "toy.rvm" }));
  const world = createWorld();
  applyDesire(world, desire);
  return world;
}

test("generic engine runs a synthetic process with no engentus terms", () => {
  const rt = createProcessRuntime(toyWorld());
  assert.equal(rt.value("BulbState"), "off");
  assert.equal(rt.derive("BulbIdle"), true);

  rt.dispatch("FlipSwitch");
  assert.equal(rt.value("BulbState"), "running");
  assert.equal(rt.value("BulbLoading"), true);
  assert.equal(rt.derive("BulbIdle"), false);

  rt.resolve("FlipSwitch", "success");
  assert.equal(rt.value("BulbState"), "lit");
  assert.equal(rt.policyOutcome("BulbPolicy"), "ready");
  assert.deepEqual(rt.history("BulbState"), ["running", "lit"]);
});

test("generic engine: failure path and policy disagreement", () => {
  const rt = createProcessRuntime(toyWorld());
  rt.step("FlipSwitch", "failure");
  assert.equal(rt.value("BulbState"), "broken");
  assert.equal(rt.policyOutcome("BulbPolicy"), "repair_required");
});

test("generic engine: illegal enum literal in an event is rejected", () => {
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(TOY_SPEC, { file: "toy.rvm" }));
  const bulbLit = desire.nodes.find(n => n.kind === "message" && n.name === "BulbLit");
  bulbLit.body.writes = { ...bulbLit.body.writes, BulbState: "teal" };
  const world = createWorld();
  applyDesire(world, desire);
  const rt = createProcessRuntime(world);
  assert.throws(() => rt.deliver("BulbLit"), /is not a case of its enum/);
});
