import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { createMaterializedView } from "../src/modules.js";
import { createMaterializedViewRegistry } from "../src/materialized-views.js";
import { createResourceProbeCollector } from "../src/resource-probes.js";

test("materialized views cache warm reads and emit probe observations", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.overview.summary",
    kind: "platformSlice",
    sliceKey: "overview",
    modelView: "summary",
    ttlMs: 1000
  });
  const probes = createResourceProbeCollector();
  const registry = createMaterializedViewRegistry({
    world,
    probeCollector: probes
  });
  let builds = 0;
  registry.registerBuilder("platformSlice", async () => {
    builds += 1;
    return {
      value: { ok: true, build: builds }
    };
  });

  const first = await registry.read("platform.view.overview.summary", {
    appContext: { serverRunnerId: "runner.demo" },
    request: { id: "req-1", path: "/api/platform-page", view: "summary", actor: "adam" },
    signature: "sig:same"
  });
  const second = await registry.read("platform.view.overview.summary", {
    appContext: { serverRunnerId: "runner.demo" },
    request: { id: "req-2", path: "/api/platform-page", view: "summary", actor: "adam" },
    signature: "sig:same"
  });

  assert.deepEqual(first, { ok: true, build: 1 });
  assert.deepEqual(second, { ok: true, build: 1 });
  assert.equal(builds, 1);
  const observations = world.allObservations();
  assert.equal(observations.some(row => row.process === "materializedView.read" && row.body?.cacheStatus === "miss"), true);
  assert.equal(observations.some(row => row.process === "materializedView.read" && row.body?.cacheStatus === "hit"), true);
  assert.equal(observations.some(row => row.process === "runtime.resourceProbe.operation" && row.body?.materializedViewId === "platform.view.overview.summary"), true);
});

test("materialized views ignore unrelated appends when the dependency signature is unchanged", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.summary",
    kind: "platformSlice",
    ttlMs: 1000
  });
  const registry = createMaterializedViewRegistry({ world });
  let builds = 0;
  registry.registerBuilder("platformSlice", async ({ signature }) => {
    builds += 1;
    return {
      value: { build: builds },
      signature
    };
  });

  await registry.read("platform.view.summary", { signature: "sig:a" });
  world.observe({
    process: "telemetry.sample",
    actor: "adam",
    claims: [],
    body: { id: "unrelated" }
  });
  const second = await registry.read("platform.view.summary", { signature: "sig:a" });
  const third = await registry.read("platform.view.summary", { signature: "sig:b" });

  assert.deepEqual(second, { build: 1 });
  assert.deepEqual(third, { build: 2 });
  assert.equal(builds, 2);
});

test("materialized views still use ttl fallback when no dependency signature is provided", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.summary",
    kind: "platformSlice",
    ttlMs: 10
  });
  let nowMs = 1000;
  const registry = createMaterializedViewRegistry({
    world,
    now: () => nowMs
  });
  let builds = 0;
  registry.registerBuilder("platformSlice", async () => ({
    value: { build: ++builds }
  }));

  const first = await registry.read("platform.view.summary");
  const second = await registry.read("platform.view.summary");
  nowMs += 20;
  const third = await registry.read("platform.view.summary");

  assert.deepEqual(first, { build: 1 });
  assert.deepEqual(second, { build: 1 });
  assert.deepEqual(third, { build: 2 });
  assert.equal(builds, 2);
});
