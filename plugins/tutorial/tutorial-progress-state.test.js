import test from "node:test";
import assert from "node:assert/strict";
import {
  createTutorialProgressState,
  renderTutorialProgressStateFactory,
  tutorialChapterScopeKey,
  tutorialContextLabel,
  tutorialPageLabel,
  tutorialPageScopeKey,
  tutorialStepScope,
  tutorialStepSurfaceContext
} from "./tutorial-progress-state.js";

test("tutorial progress state helpers expose stable page, scope, and context labels", () => {
  assert.equal(tutorialPageLabel("app"), "App");
  assert.equal(tutorialPageLabel("bootstrap"), "Bootstrap");
  assert.equal(tutorialContextLabel("frontend"), "Frontend context");
  assert.equal(tutorialPageScopeKey("world"), "page:world");
  assert.equal(tutorialChapterScopeKey("intro"), "chapter:intro");
  assert.deepEqual(
    tutorialStepScope({ page: "app", title: "Todo form", scopeKey: "section:app:todo-form", scopeKind: "section", scopePage: "app", target: "todo-form" }),
    {
      key: "section:app:todo-form",
      kind: "section",
      page: "app",
      label: "Todo form",
      chapterId: null,
      target: "todo-form"
    }
  );
  assert.deepEqual(
    tutorialStepSurfaceContext({ surfaceContextId: "ctx.todo", surfaceContextLabel: "Todo context" }),
    { id: "ctx.todo", label: "Todo context" }
  );
});

test("tutorial progress state model normalizes replay, disabled guidance, and current surface state through the shared seam", () => {
  const tutorial = {
    id: "todo-from-scratch",
    concepts: [{ id: "concept.todo", label: "Todo", summary: "Create and finish todos." }],
    scopes: [{
      page: "app",
      title: "Todo form",
      scopeKey: "section:app:todo-form",
      scopeKind: "section",
      scopePage: "app",
      target: "todo-form"
    }],
    steps: [{
      id: "step.bootstrap",
      chapterId: "bootstrap",
      page: "bootstrap",
      title: "Open app",
      body: "Go to the app.",
      target: "open-app-link",
      concepts: []
    }, {
      id: "step.todo",
      chapterId: "app",
      page: "app",
      title: "Create todo",
      body: "Fill the form.",
      target: "todo-form",
      concepts: ["concept.todo"],
      scopeKey: "section:app:todo-form",
      scopeKind: "section",
      scopePage: "app",
      scopeLabel: "Todo form",
      surfaceContextId: "ctx.todo",
      surfaceContextLabel: "Todo context"
    }]
  };

  let progress = { stepId: "step.todo", chapterId: "app", hidden: false };
  const state = createTutorialProgressState({
    tutorial,
    currentSurfacePage: "app",
    currentSurfaceContext: "ctx.todo",
    getProgress: () => progress,
    currentStep: () => tutorial.steps.find(step => step.id === progress?.stepId) || null,
    currentStepIndex: () => tutorial.steps.findIndex(step => step.id === progress?.stepId)
  });

  const normalized = state.normalizeProgress({
    stepId: "step.todo",
    disabledPages: ["app"],
    disabledContextIds: ["ctx.todo"],
    replayScopeKey: "section:app:todo-form"
  });
  assert.equal(normalized.tutorialId, "todo-from-scratch");
  assert.deepEqual(normalized.disabledScopeKeys, ["page:app"]);
  assert.deepEqual(normalized.disabledPages, ["app"]);
  assert.deepEqual(normalized.disabledContextIds, ["ctx.todo"]);
  assert.equal(normalized.replayScopeKey, "section:app:todo-form");
  assert.equal(normalized.replayStepId, "step.todo");

  progress = normalized;
  assert.deepEqual(state.tutorialSurfaceState(), {
    kind: "disabled-context",
    page: "app",
    contextId: "ctx.todo"
  });
  assert.deepEqual(
    state.tutorialDisabledGuidanceRows(progress),
    [{
      type: "scope",
      status: "muted",
      scopeKey: "page:app",
      kind: "page",
      page: "app",
      label: "App",
      pageLabel: "App",
      currentStepTitle: "Create todo",
      isCurrentSurface: true,
      target: null,
      focusScopeKey: "page:app"
    }, {
      type: "scope",
      status: "muted",
      scopeKey: "section:app:todo-form",
      kind: "section",
      page: "app",
      label: "Todo form",
      pageLabel: "App",
      currentStepTitle: "Create todo",
      isCurrentSurface: true,
      target: "todo-form",
      focusScopeKey: "section:app:todo-form"
    }, {
      type: "context",
      status: "muted",
      contextId: "ctx.todo",
      scopeKey: "section:app:todo-form",
      page: "app",
      label: "Todo context",
      pageLabel: "App",
      currentStepTitle: "Create todo",
      isCurrentSurface: true,
      target: "todo-form",
      focusScopeKey: "section:app:todo-form"
    }]
  );

  const clearedContext = state.clearTutorialContextDisabled(progress);
  assert.deepEqual(clearedContext.disabledContextIds, []);
  const clearedScope = state.clearTutorialScopeDisabled(progress, "page:app");
  assert.deepEqual(clearedScope.disabledScopeKeys, []);

  const disabledCurrentScope = state.disableTutorialOnCurrentScope({ stepId: "step.todo", chapterId: "app" });
  assert.deepEqual(disabledCurrentScope.disabledScopeKeys, ["section:app:todo-form"]);
  const disabledCurrentContext = state.disableTutorialOnCurrentContext({ stepId: "step.todo", chapterId: "app" });
  assert.deepEqual(disabledCurrentContext.disabledContextIds, ["ctx.todo"]);

  progress = { stepId: "step.todo", chapterId: "app", hidden: false, completedAt: null };
  assert.deepEqual(state.tutorialStepConcepts(tutorial.steps[1]).map(concept => concept.id), ["concept.todo"]);
  assert.deepEqual(state.tutorialRevealedConcepts(progress).map(concept => concept.id), ["concept.todo"]);
});

test("tutorial progress state model resolves offpage state and scope target names through the shared seam", () => {
  const tutorial = {
    id: "todo-from-scratch",
    steps: [{
      id: "step.world",
      chapterId: "world",
      page: "world",
      title: "Inspect world",
      body: "Open world.",
      target: "world-panel",
      scopeKey: "world",
      scopeKind: "world",
      scopePage: "world",
      scopeLabel: "World surface"
    }],
    concepts: [],
    scopes: []
  };
  let progress = { stepId: "step.world", chapterId: "world", hidden: false };
  const state = createTutorialProgressState({
    tutorial,
    currentSurfacePage: "app",
    currentSurfaceContext: null,
    getProgress: () => progress,
    currentStep: () => tutorial.steps[0],
    currentStepIndex: () => 0
  });

  assert.deepEqual(state.tutorialSurfaceState(), {
    kind: "offpage",
    page: "world"
  });
  assert.equal(state.tutorialScopeTargetName("world"), "world-panel");
});

test("tutorial progress state factory exposes the shared browser helpers", () => {
  const factory = renderTutorialProgressStateFactory();
  assert.equal(factory.includes("const createTutorialProgressState ="), true);
  assert.equal(factory.includes("const tutorialStepScope ="), true);
});
