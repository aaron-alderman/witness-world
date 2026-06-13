import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBootstrapTutorialRuntimeView,
  renderBootstrapTutorialRuntimeViewFactory
} from "./bootstrap-tutorial-runtime-view.js";

test("bootstrap tutorial runtime view projects the published bootstrap tutorial snapshot", () => {
  const view = buildBootstrapTutorialRuntimeView({
    tutorialProgress: {
      stepId: "identity:create",
      chapterId: "identity",
      completedAt: null,
      hidden: false
    },
    tutorialState: {
      tutorialDisabledContextIds: () => ["frontend"]
    },
    currentSuggestions: [
      { id: "s1", title: "Create identity", action: { kind: "navigate" } }
    ],
    currentSurfacePage: "bootstrap",
    tutorialStep: () => ({ id: "identity:create", page: "bootstrap" }),
    tutorialStepScope: () => ({ key: "section:bootstrap:identity-form" }),
    tutorialStepConcepts: () => [{ id: "identity-principal" }],
    tutorialRevealedConcepts: () => [{ id: "identity-principal" }],
    tutorialReplayScopeKey: () => "section:bootstrap:identity-form",
    tutorialReplayStepId: () => "identity:create",
    tutorialDisabledScopeKeys: () => ["page:app"],
    tutorialDisabledPages: () => ["app"],
    tutorialSurfaceState: () => ({ kind: "disabled-context" })
  });

  assert.deepEqual(view, {
    currentStepId: "identity:create",
    currentChapterId: "identity",
    currentPage: "bootstrap",
    currentScopeKey: "section:bootstrap:identity-form",
    currentConceptIds: ["identity-principal"],
    revealedConceptIds: ["identity-principal"],
    suggestions: [{ id: "s1", title: "Create identity", actionKind: "navigate" }],
    replayScopeKey: "section:bootstrap:identity-form",
    replayStepId: "identity:create",
    completedAt: null,
    hidden: false,
    disabledScopeKeys: ["page:app"],
    disabledContextIds: ["frontend"],
    disabledPages: ["app"],
    surfacePage: "bootstrap",
    surfaceStatus: "disabled-context"
  });
});

test("bootstrap tutorial runtime view factory exposes the shared browser helper", () => {
  const factory = renderBootstrapTutorialRuntimeViewFactory();
  assert.equal(factory.includes("const buildBootstrapTutorialRuntimeView ="), true);
});
