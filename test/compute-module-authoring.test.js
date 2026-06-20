import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { moduleProjectors } from "../src/modules.js";
import { parseWitnessToml } from "../src/dsl.js";
import {
  applyDesire,
  compileWtomlDocsToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";

test("WTOML computeModule declarations normalize and apply into authored compute modules", () => {
  const docs = parseWitnessToml(`
[[computeModule]]
actor = "system"
id = "engentus.health.classify"
source = "app/modules/health-classify/assembly/index.ts"
hostOperation = "engentus.health.classify"
language = "assemblyscript"
abi = "world.hostOperation.v1"
export = "invoke"
maxMemoryPages = 64
timeoutMs = 100
allowedBindings = ["host.log", "host.metric"]
  `).map(doc => ({ ...doc, file: "C:/demo/engentus/app.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  assert.equal(
    desire.runtimeResiduals.some(residual => residual.body.declarationKind === "computeModule"),
    true
  );

  const world = createWorld();
  applyDesire(world, desire);

  assert.deepEqual(world.project(moduleProjectors.computeModules), [{
    id: "engentus.health.classify",
    source: "app/modules/health-classify/assembly/index.ts",
    hostOperation: "engentus.health.classify",
    language: "assemblyscript",
    abi: "world.hostOperation.v1",
    export: "invoke",
    maxMemoryPages: 64,
    timeoutMs: 100,
    allowedBindings: ["host.log", "host.metric"],
    context: null,
    witness: world.project(moduleProjectors.computeModules)[0].witness,
    values: {
      actor: "system",
      id: "engentus.health.classify",
      source: "app/modules/health-classify/assembly/index.ts",
      hostOperation: "engentus.health.classify",
      language: "assemblyscript",
      abi: "world.hostOperation.v1",
      export: "invoke",
      maxMemoryPages: 64,
      timeoutMs: 100,
      allowedBindings: ["host.log", "host.metric"]
    }
  }]);

  assert.equal(
    world.project(moduleProjectors.modules).get("engentus.health.classify"),
    "computeModule"
  );
});
