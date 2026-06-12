import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  buildRuntimeOperatorContract,
  resolveRuntimeOperatorPaths
} from "../src/runtime-operator-contract.js";

test("operator paths resolve named WORLD_HOME into the canonical world-home layout", async () => {
  const contract = await resolveRuntimeOperatorPaths({
    startupMode: "serve",
    cwd: "C:/workspace/world",
    env: { WORLD_HOME: "state/demo-world" }
  });

  assert.equal(contract.layout, "world-home-v1");
  assert.equal(contract.persistence.mode, "warm");
  assert.equal(contract.worldHome, path.resolve("C:/workspace/world", "state/demo-world"));
  assert.equal(contract.directories.runtimeRoot, path.resolve("C:/workspace/world", "state/demo-world", "runtime"));
  assert.equal(contract.canonicalTruth.witnessLogPath, path.resolve("C:/workspace/world", "state/demo-world", "logs", "witness-world.witnesses.jsonl"));
  assert.equal(contract.directories.backupsRoot, path.resolve("C:/workspace/world", "state/demo-world", "backups"));
});

test("bootstrap cold starts create a fresh temp world-home contract when no explicit paths are provided", async () => {
  const contract = await resolveRuntimeOperatorPaths({
    startupMode: "bootstrap",
    cwd: "C:/workspace/world",
    env: {},
    mkdtemp: async prefix => `${prefix}abc123`,
    tmpdir: "C:/tmp"
  });

  assert.equal(contract.layout, "world-home-v1");
  assert.equal(contract.persistence.mode, "cold");
  assert.equal(contract.worldHome, path.resolve("C:/tmp", "witness-world-bootstrap-abc123"));
  assert.equal(contract.directories.runtimeRoot, path.resolve("C:/tmp", "witness-world-bootstrap-abc123", "runtime"));
  assert.equal(contract.canonicalTruth.observationLogPath, path.resolve("C:/tmp", "witness-world-bootstrap-abc123", "logs", "bootstrap.observations.jsonl"));
});

test("operator contract carries canonical truth and derived storage directories", () => {
  const contract = buildRuntimeOperatorContract({
    startupMode: "mcp",
    layout: "world-home-v1",
    persistenceMode: "warm",
    worldHome: "C:/state/demo",
    runtimeRoot: "C:/state/demo/runtime",
    witnessLogPath: "C:/state/demo/logs/witnesses.jsonl",
    observationLogPath: "C:/state/demo/logs/observations.jsonl",
    backupsRoot: "C:/state/demo/backups",
    exportsRoot: "C:/state/demo/exports",
    importsRoot: "C:/state/demo/imports",
    storage: {
      assetsRoot: "C:/state/demo/runtime/assets",
      blobsRoot: "C:/state/demo/runtime/blobs",
      searchRoot: "C:/state/demo/runtime/search",
      webhooksRoot: "C:/state/demo/runtime/webhooks"
    }
  });

  assert.equal(contract.startupMode, "mcp");
  assert.equal(contract.canonicalTruth.witnessLogPath, "C:/state/demo/logs/witnesses.jsonl");
  assert.equal(contract.directories.assetsRoot, "C:/state/demo/runtime/assets");
  assert.equal(contract.lifecycle.supportedFlows.includes("backup"), true);
  assert.equal(contract.lifecycle.derivedKinds.includes("search"), true);
});
