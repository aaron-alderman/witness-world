import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { runReplayProbe } from "../scripts/mcp-authoring-replay-probe.mjs";

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-engentus-authoring-pathway-"));
}

async function startAuthoringProbeServer() {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile: "authoring" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile: "authoring" });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeStartupMode: "bootstrap",
    runtimePluginIds: ["plugin.mcp"]
  });
  assert.equal(server.ok, true);
  return server;
}

test("canonical docs encode the staged Engentus authoring pathway and the next honest blocker", async () => {
  const [desireSpa, policy] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "docs", "DESIRE-SPA.md"), "utf8"),
    fs.readFile(path.join(process.cwd(), "docs", "LLM-AUTHORING-POLICY.md"), "utf8")
  ]);

  assert.match(desireSpa, /## Authoring pathway/);
  assert.match(desireSpa, /1\. Constitutional gate/);
  assert.match(desireSpa, /2\. Boundary gate/);
  assert.match(desireSpa, /3\. Generic projection gate/);
  assert.match(desireSpa, /4\. Surface authoring gate/);
  assert.match(desireSpa, /Current next honest blocker .* `surface\.create`/s);
  assert.match(desireSpa, /no app-local browser runtime seam/i);
  assert.match(policy, /plugin\.authoring/i);
  assert.match(policy, /Blocked means stop, not improvise/i);
  assert.match(policy, /next honest blocked handoff .* `surface\.create`/s);
});

test("MCP replay now passes generic widget projection and stops next at surface.create", { timeout: 10000 }, async () => {
  const server = await startAuthoringProbeServer();
  try {
    const result = await runReplayProbe(server.url);
    assert.equal(result.ok, true);
    assert.equal(result.replay.httpStatus, 200);
    assert.equal(result.replay.fallbackActive, false);
    assert.equal(result.replay.authoredContentVisible, true);
    assert.equal(result.blockers.widgetProjection, null);
    assert.equal(result.blockers.surfaceAuthoring.missingPrimitive, "surface.create is not exposed by the current MCP authoring surface");
  } finally {
    await server.close();
  }
});
