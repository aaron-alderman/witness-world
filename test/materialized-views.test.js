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
    cacheKey: "same"
  });
  const second = await registry.read("platform.view.overview.summary", {
    appContext: { serverRunnerId: "runner.demo" },
    request: { id: "req-2", path: "/api/platform-page", view: "summary", actor: "adam" },
    cacheKey: "same"
  });

  assert.deepEqual(first, { ok: true, build: 1 });
  assert.deepEqual(second, { ok: true, build: 1 });
  assert.equal(builds, 1);
  const observations = world.allObservations();
  assert.equal(observations.some(row => row.process === "materializedView.read" && row.body?.cacheStatus === "miss"), true);
  assert.equal(observations.some(row => row.process === "materializedView.read" && row.body?.cacheStatus === "hit"), true);
  assert.equal(observations.some(row => row.process === "runtime.resourceProbe.operation" && row.body?.materializedViewId === "platform.view.overview.summary"), true);
});
