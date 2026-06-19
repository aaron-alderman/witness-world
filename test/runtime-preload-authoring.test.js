import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { moduleProjectors } from "../src/modules.js";
import { parseWitnessToml } from "../src/dsl.js";
import {
  applyDesire,
  compileRvmToDesirePlus,
  compileWtomlDocsToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";

test("WTOML runtimePreload declarations normalize and apply into authored runtime preloads", () => {
  const docs = parseWitnessToml(`
[[runtimePreload]]
actor = "system"
id = "warm_goodman"
when = { kind = "idleAfterRoute", route = "home", delayMs = 750 }
targets = [{ kind = "route", route = "goodman", load = ["manifest", "capabilityAssets"] }]
  `).map(doc => ({ ...doc, file: "C:/demo/preload.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));
  const world = createWorld();

  applyDesire(world, desire);

  assert.deepEqual(world.project(moduleProjectors.runtimePreloads), [{
    id: "warm_goodman",
    when: { kind: "idleAfterRoute", route: "home", delayMs: 750 },
    targets: [{ kind: "route", route: "goodman", load: ["manifest", "capabilityAssets"] }],
    context: null,
    witness: world.project(moduleProjectors.runtimePreloads)[0].witness
  }]);
});

test("RVM preload blocks normalize into runtimePreload declarations with repeated targets", () => {
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
preload GoodmanWarm {
  actor "system"
  when { kind = "idleAfterRoute", route = "home", delayMs = 1000 }
  target { kind = "route", route = "goodman", load = ["manifest", "capabilityAssets"] }
  target { kind = "capability", capability = "chart.render", load = ["assets"] }
}
  `, { file: "C:/demo/preload.rvm" }));

  assert.equal(desire.runtimeResiduals.some(residual => residual.body.declarationKind === "runtimePreload"), true);
  const world = createWorld();
  applyDesire(world, desire);

  assert.deepEqual(world.project(moduleProjectors.runtimePreloads), [{
    id: "GoodmanWarm",
    when: { kind: "idleAfterRoute", route: "home", delayMs: 1000 },
    targets: [
      { kind: "route", route: "goodman", load: ["manifest", "capabilityAssets"] },
      { kind: "capability", capability: "chart.render", load: ["assets"] }
    ],
    context: null,
    witness: world.project(moduleProjectors.runtimePreloads)[0].witness
  }]);
});
