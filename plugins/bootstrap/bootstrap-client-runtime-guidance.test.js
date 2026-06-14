import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapClientRuntimeGuidance,
  createBootstrapNoopGuidanceRuntime,
  renderBootstrapClientRuntimeGuidanceFactory
} from "./bootstrap-client-runtime-guidance.js";

test("bootstrap client runtime guidance owns guidance boot sequencing and normalization", () => {
  const calls = [];
  const guidanceRuntime = createBootstrapClientRuntimeGuidance({
    tutorial: {
      id: "tutorial.todo",
      steps: [{ id: "step-1" }, { id: "step-2" }]
    },
    state: {},
    currentSurfacePage: "bootstrap",
    request: async () => ({}),
    byId: () => null,
    renderPage: () => {},
    getAppReady: () => false,
    refresh: async () => {},
    setBootstrapStatus: () => {},
    currentHref: () => "http://bootstrap.local/_bootstrap",
    currentPathname: () => "/_bootstrap",
    assign: () => {},
    reload: () => {},
    escapeHtml: value => String(value),
    byTarget: () => null,
    setStatus: () => {},
    formField: () => null,
    sleep: () => Promise.resolve(),
    createBootstrapGuidanceRuntimeFn: ({ guidance, stepIndex, localProgressKey, legacyLocalProgressKey, autoCompletableChapters, currentSurfacePage }) => {
      calls.push([
        "guidance-runtime",
        guidance.id,
        stepIndex.get("step-2"),
        localProgressKey,
        legacyLocalProgressKey,
        Array.from(autoCompletableChapters).join(","),
        currentSurfacePage
      ]);
      return {
        currentSuggestions: () => ["next-step"],
        guidanceState: { current: "guidance" },
        tutorialState: { current: "tutorial" },
        guidanceStep: () => "guidance-step",
        tutorialStep: () => "tutorial-step",
        guidanceDisabledPages: () => ["bootstrap"],
        tutorialDisabledPages: () => ["other"],
        guidanceDisabledScopeKeys: () => ["scope-a"],
        tutorialDisabledScopeKeys: () => ["scope-b"],
        guidanceDisabledContextIds: () => ["ctx-a"],
        guidanceReplayStepId: () => "replay-guidance",
        tutorialReplayStepId: () => "replay-tutorial",
        guidanceReplayScopeKey: () => "scope-guidance",
        tutorialReplayScopeKey: () => "scope-tutorial",
        guidanceStepScope: () => "guidance-scope",
        tutorialStepScope: () => "tutorial-scope",
        guidanceStepConcepts: () => ["concept-a"],
        tutorialStepConcepts: () => ["concept-b"],
        guidanceRevealedConcepts: () => ["revealed-a"],
        tutorialRevealedConcepts: () => ["revealed-b"],
        guidanceSurfaceState: () => ({ kind: "guidance" }),
        tutorialSurfaceState: () => ({ kind: "tutorial" }),
        loadGuidanceProgress: async () => ({ id: "guidance-progress" }),
        loadTutorialProgress: async () => ({ id: "tutorial-progress" }),
        openAppHome: async () => "open-app-home",
        continueGuidanceOnPage: async () => "continue-guidance",
        continueTutorialOnPage: async () => "continue-tutorial",
        renderGuidanceCard: () => "guidance-card",
        renderTutorialCard: () => "tutorial-card",
        renderGuidanceOverlay: () => "guidance-overlay",
        renderTutorialOverlay: () => "tutorial-overlay",
        requestMaybeAdvanceGuidance: async () => "advance-guidance",
        requestMaybeAdvanceTutorial: async () => "advance-tutorial",
        bindGuidanceInteractions: () => "bind-guidance",
        bindTutorialInteractions: () => "bind-tutorial"
      };
    }
  });

  assert.equal(guidanceRuntime.guidance.id, "tutorial.todo");
  assert.equal(guidanceRuntime.currentSuggestions()[0], "next-step");
  assert.deepEqual(guidanceRuntime.guidanceState, { current: "guidance" });
  assert.deepEqual(guidanceRuntime.tutorialState, { current: "tutorial" });
  assert.equal(guidanceRuntime.guidanceStep(), "guidance-step");
  assert.equal(guidanceRuntime.tutorialStep(), "tutorial-step");
  assert.deepEqual(guidanceRuntime.guidanceDisabledPages(), ["bootstrap"]);
  assert.deepEqual(guidanceRuntime.tutorialDisabledPages(), ["other"]);
  assert.deepEqual(guidanceRuntime.guidanceDisabledContextIds(), ["ctx-a"]);
  assert.equal(typeof guidanceRuntime.bindGuidanceInteractions, "function");
  assert.equal(typeof guidanceRuntime.bindTutorialInteractions, "function");
  assert.deepEqual(calls, [[
    "guidance-runtime",
    "tutorial.todo",
    1,
    "witness.guidance.tutorial.todo",
    "witness.tutorial.tutorial.todo",
    "widgets,program,routes",
    "bootstrap"
  ]]);
});

test("bootstrap client runtime guidance falls back to the noop guidance runtime when no guidance is active", () => {
  const guidanceRuntime = createBootstrapClientRuntimeGuidance();
  const noopRuntime = createBootstrapNoopGuidanceRuntime();

  assert.equal(guidanceRuntime.guidance, null);
  assert.equal(typeof guidanceRuntime.guidanceRuntime.bindGuidanceInteractions, "function");
  assert.equal(typeof guidanceRuntime.currentSuggestions, "function");
  assert.deepEqual(guidanceRuntime.guidanceSurfaceState(), noopRuntime.guidanceSurfaceState());
  assert.deepEqual(guidanceRuntime.tutorialSurfaceState(), noopRuntime.tutorialSurfaceState());
});

test("bootstrap client runtime guidance factory exposes the extracted guidance helper", () => {
  const factory = renderBootstrapClientRuntimeGuidanceFactory();
  assert.equal(factory.includes("const createBootstrapNoopGuidanceRuntime ="), true);
  assert.equal(factory.includes("const createBootstrapClientRuntimeGuidance ="), true);
});
