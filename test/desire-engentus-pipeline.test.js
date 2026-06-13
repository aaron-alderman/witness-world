import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import {
  applyDesire,
  checkSpecIntegrity,
  assertSpecIntegrity,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";

// ── Rung A: PIPELINE.rvm is provably wired — no dangling structural refs ──
//
// Drives the generic spec-integrity checker over the applied engentus pipeline.
// This exceeds every other workflow spec in the repo (which assert only a
// handful of sample relations): here we assert the *whole graph* is sound.

const PIPELINE_FILE = path.join(process.cwd(), "examples_rvm", "engentus", "PIPELINE.rvm");

// The 10 declared stages (ingest → calibrate → clip → burst-fit → overview / bolt /
// health / alignment / kalman / uncertainty). Kalman + uncertainty + clip-detection
// were added per the fidelity audit (docs/PIPELINE-FIDELITY-AUDIT.md).
const STAGE_PROCESSES = [
  "IngestProcess",
  "StrainCalibrationProcess",
  "ClipDetectionProcess",
  "BurstFitProcess",
  "OverviewProcess",
  "BoltAnalysisProcess",
  "HealthProcess",
  "AlignmentProcess",
  "KalmanProcess",
  "UncertaintyProcess"
];

async function pipelineDesire() {
  return normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(PIPELINE_FILE));
}

async function appliedPipeline() {
  const world = createWorld();
  applyDesire(world, await pipelineDesire());
  return world;
}

test("PIPELINE.rvm applies with zero spec-integrity violations", async () => {
  const world = await appliedPipeline();
  const report = checkSpecIntegrity(world);
  assert.equal(report.ok, true, report.errors.map(e => `[${e.code}] ${e.subject}: ${e.detail}`).join("\n"));
  assert.equal(report.errors.length, 0);
});

test("the checker reports the full declared shape (10 stages, 11 adapters, 3 policies)", async () => {
  const world = await appliedPipeline();
  const { counts } = checkSpecIntegrity(world);
  assert.equal(counts.processes, 10, "10 pipeline stages");
  assert.equal(counts.adapters, 11, "11 SBTP adapters");
  assert.equal(counts.policies, 3, "burst-quality + channel-health + kalman-quality policies");
  assert.equal(counts.derives, 10, "10 idle derives");
  assert.equal(counts.enums, 9, "9 enum types (incl. ClipArtifact)");
  // every stage closes its command → adapter → event loop
  assert.equal(counts.wiredStages, 10);
});

test("all 10 stages are fully wired (command → adapter → success/failure event handled)", async () => {
  const world = await appliedPipeline();
  const { stages } = checkSpecIntegrity(world);
  assert.deepEqual(
    [...stages].map(s => s.process).sort(),
    [...STAGE_PROCESSES].sort()
  );
  for (const stage of stages) {
    assert.equal(stage.wired, true, `${stage.process} not fully wired: ${stage.issues.join("; ")}`);
    assert.deepEqual(stage.issues, []);
  }
});

test("every adapter binds a real command, success+failure events, request schema, and host_operation", async () => {
  const world = await appliedPipeline();
  // The host_operation id is witnessed as a relation now (plumbed end-to-end).
  const rels = world.project(projectors.currentRelations);
  const hostOps = rels.filter(r => r.rel === "invokesHostOperation" && r.from.indexOf(".operation.") === -1);
  assert.equal(hostOps.length, 11, "all 11 adapters carry a host_operation id");
  assert.ok(hostOps.every(r => r.to.startsWith("engentus.pipeline.")));
  // and the checker raises nothing on adapter bindings
  const adapterErrors = checkSpecIntegrity(world).errors.filter(e => e.code.startsWith("adapter."));
  assert.deepEqual(adapterErrors, []);
});

// ── Negative coverage: the checker actually catches structural breakage ──

test("the checker flags a dangling event.writes target", async () => {
  const desire = await pipelineDesire();
  const event = desire.nodes.find(n => n.kind === "message" && n.name === "ImuIngestCompleted");
  event.body.writes = { ...event.body.writes, NoSuchState: "complete" };
  const world = createWorld();
  applyDesire(world, desire);
  const report = checkSpecIntegrity(world);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some(e => e.code === "event.writes.dangling" && e.subject === "ImuIngestCompleted"));
});

test("the checker flags an illegal enum literal in event.writes", async () => {
  const desire = await pipelineDesire();
  const event = desire.nodes.find(n => n.kind === "message" && n.name === "ImuIngestCompleted");
  event.body.writes = { ...event.body.writes, IngestRunState: "exploded" };
  const world = createWorld();
  applyDesire(world, desire);
  const report = checkSpecIntegrity(world);
  assert.ok(report.errors.some(e => e.code === "event.writes.badLiteral" && e.subject === "ImuIngestCompleted"));
});

test("the checker flags an adapter missing its host_operation", async () => {
  const desire = await pipelineDesire();
  const boundary = desire.nodes.find(n => n.kind === "boundary" && n.name === "BurstFitSbtp");
  delete boundary.body.operations[0].hostOperation;
  const world = createWorld();
  applyDesire(world, desire);
  const report = checkSpecIntegrity(world);
  assert.ok(report.errors.some(e => e.code === "adapter.host_operation.missing" && e.subject === "BurstFitSbtp"));
});

test("the checker flags a policy whose outcome key is not a state of the subject", async () => {
  const desire = await pipelineDesire();
  const policy = desire.nodes.find(n => n.kind === "policy" && n.name === "BurstQualityPolicy");
  policy.body.policyOutcomes = { ...policy.body.policyOutcomes, notastate: "ready" };
  const world = createWorld();
  applyDesire(world, desire);
  const report = checkSpecIntegrity(world);
  assert.ok(report.errors.some(e => e.code === "policy.outcome.badState" && e.subject === "BurstQualityPolicy"));
});

test("assertSpecIntegrity throws on a broken spec and returns the report on a sound one", async () => {
  const world = await appliedPipeline();
  const report = assertSpecIntegrity(world);
  assert.equal(report.ok, true);

  const desire = await pipelineDesire();
  const derive = desire.nodes.find(n => n.kind === "projection" && n.name === "IngestIdle");
  derive.body.source = "GhostState";
  const broken = createWorld();
  applyDesire(broken, desire);
  assert.throws(() => assertSpecIntegrity(broken), /spec integrity check failed/);
});
