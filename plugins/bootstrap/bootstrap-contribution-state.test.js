import test from "node:test";
import assert from "node:assert/strict";
import { buildBootstrapContributionState } from "./bootstrap-contribution-state.js";

test("bootstrap contribution state selects the preferred bootstrap guidance and starter blueprint", () => {
  const state = buildBootstrapContributionState({
    guidanceDefinitions: [
      { id: "guide-a", definition: { id: "guide-a" } },
      { id: "guide-b", definition: { id: "guide-b" }, defaultForBootstrap: true }
    ],
    starterBlueprints: [
      { id: "starter-a", blueprint: { id: "starter-a" } },
      { id: "starter-b", blueprint: { id: "starter-b" }, defaultForBootstrap: true }
    ]
  });

  assert.equal(state.guidanceDefinitions.length, 2);
  assert.equal(state.starterBlueprints.length, 2);
  assert.equal(state.activeBootstrapGuidance?.id, "guide-b");
  assert.equal(state.activeStarterBlueprint?.id, "starter-b");
});

test("bootstrap contribution state falls back cleanly when runtime contributions are absent", () => {
  const state = buildBootstrapContributionState();

  assert.deepEqual(state.guidanceDefinitions, []);
  assert.deepEqual(state.starterBlueprints, []);
  assert.equal(state.activeBootstrapGuidance, null);
  assert.equal(state.activeStarterBlueprint, null);
});
