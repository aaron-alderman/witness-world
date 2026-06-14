import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBootstrapGuidanceRuntimeView,
  renderBootstrapGuidanceRuntimeViewFactory,
  buildBootstrapTutorialRuntimeView,
  renderBootstrapTutorialRuntimeViewFactory
} from "./bootstrap-tutorial-runtime-view.js";

test("bootstrap guidance runtime view projects the published bootstrap guidance snapshot", () => {
  const view = buildBootstrapGuidanceRuntimeView({
    guidanceProgress: {
      stepId: "identity:create",
      chapterId: "identity",
      completedAt: null,
      hidden: false
    },
    guidanceState: {
      guidanceDisabledContextIds: () => ["frontend"]
    },
    currentSuggestions: [
      { id: "s1", title: "Create identity", action: { kind: "navigate" } }
    ],
    currentSurfacePage: "bootstrap",
    guidanceStep: () => ({ id: "identity:create", page: "bootstrap" }),
    guidanceStepScope: () => ({ key: "section:bootstrap:identity-form" }),
    guidanceStepConcepts: () => [{ id: "identity-principal" }],
    guidanceRevealedConcepts: () => [{ id: "identity-principal" }],
    guidanceReplayScopeKey: () => "section:bootstrap:identity-form",
    guidanceReplayStepId: () => "identity:create",
    guidanceDisabledScopeKeys: () => ["page:app"],
    guidanceDisabledPages: () => ["app"],
    guidanceSurfaceState: () => ({ kind: "disabled-context" })
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
  const factory = renderBootstrapGuidanceRuntimeViewFactory();
  assert.equal(factory.includes("const buildBootstrapGuidanceRuntimeView ="), true);
  assert.equal(factory.includes("const buildBootstrapTutorialRuntimeView = buildBootstrapGuidanceRuntimeView;"), true);
  assert.equal(renderBootstrapTutorialRuntimeViewFactory(), factory);
  assert.equal(buildBootstrapTutorialRuntimeView, buildBootstrapGuidanceRuntimeView);
});
