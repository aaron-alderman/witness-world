import assert from "node:assert/strict";
import test from "node:test";

import {
  createTutorialProgress,
  restartTutorialFromHere,
  todoTutorialDefinition,
  tutorialRevealedConcepts,
  tutorialStepConcepts
} from "../src/tutorials.js";

test("tutorial concepts are authored per step and reveal progressively with progress", () => {
  const tutorial = todoTutorialDefinition();

  assert.deepEqual(
    tutorialStepConcepts(tutorial, "identity:create").map(concept => concept.id),
    ["identity-principal"]
  );
  assert.deepEqual(
    tutorialStepConcepts(tutorial, "app:create-note").map(concept => concept.id),
    ["perspective-data"]
  );
  assert.deepEqual(
    tutorialStepConcepts(tutorial, "world:inspect").map(concept => concept.id),
    ["app-boundary", "witnessed-app-state", "perspective-data", "operating-surface"]
  );

  const runnerProgress = createTutorialProgress(tutorial, "runner:create");
  assert.deepEqual(
    tutorialRevealedConcepts(tutorial, runnerProgress).map(concept => concept.id),
    ["identity-principal", "session-auth", "runtime-wiring"]
  );

  const noteProgress = createTutorialProgress(tutorial, "app:create-note");
  assert.deepEqual(
    tutorialRevealedConcepts(tutorial, noteProgress).map(concept => concept.id),
    [
      "identity-principal",
      "session-auth",
      "runtime-wiring",
      "widget-tree",
      "frontend-program",
      "route-mounts",
      "app-boundary",
      "witnessed-app-state",
      "perspective-data"
    ]
  );

  const replayed = restartTutorialFromHere(tutorial, noteProgress, "app:create-note");
  assert.equal(replayed.stepId, "app:create-note");
  assert.equal(replayed.replayStepId, "app:create-note");
  assert.equal(replayed.completedAt, null);

  const worldProgress = createTutorialProgress(tutorial, "world:inspect");
  assert.equal(worldProgress.stepId, "world:inspect");
  assert.deepEqual(
    tutorialRevealedConcepts(tutorial, worldProgress).map(concept => concept.id),
    [
      "identity-principal",
      "session-auth",
      "runtime-wiring",
      "widget-tree",
      "frontend-program",
      "route-mounts",
      "app-boundary",
      "witnessed-app-state",
      "perspective-data",
      "operating-surface"
    ]
  );
});
