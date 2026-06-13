import test from "node:test";
import assert from "node:assert/strict";
import {
  createTutorialClientState,
  renderTutorialClientStateFactory
} from "./tutorial-client-state.js";

test("tutorial client state adapter owns local mutable state and step selectors", () => {
  const tutorial = {
    steps: [
      { id: "a", chapterId: "one" },
      { id: "b", chapterId: "one" },
      { id: "c", chapterId: "two" }
    ]
  };
  const state = createTutorialClientState({
    tutorial,
    stepIndex: new Map(tutorial.steps.map((step, index) => [step.id, index]))
  });

  state.setProgress({ stepId: "b" });
  state.setLastRenderedStepId("b");
  state.setActiveHighlightTarget("todo_form");
  state.setActiveFocusScope("scope.b");
  state.setDisabledScopesOpen(true);

  assert.deepEqual(state.getProgress(), { stepId: "b" });
  assert.equal(state.currentStep()?.id, "b");
  assert.equal(state.currentStepIndex(), 1);
  assert.equal(state.previousStep()?.id, "a");
  assert.equal(state.firstStepInChapter("two")?.id, "c");
  assert.equal(state.getLastRenderedStepId(), "b");
  assert.equal(state.getActiveHighlightTarget(), "todo_form");
  assert.equal(state.getActiveFocusScope(), "scope.b");
  assert.equal(state.getDisabledScopesOpen(), true);
});

test("tutorial client state factory exposes the shared browser helpers", () => {
  const factory = renderTutorialClientStateFactory();
  assert.equal(factory.includes("const createTutorialClientState ="), true);
});
