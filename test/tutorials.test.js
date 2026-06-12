import assert from "node:assert/strict";
import test from "node:test";

import {
  createTutorialProgress,
  isTutorialContextDisabled,
  isTutorialScopeDisabled,
  normalizeTutorialProgress,
  restartTutorialFromHere,
  setTutorialContextDisabled,
  setTutorialScopeDisabled,
  todoStarterBlueprint,
  todoTutorialDefinition,
  tutorialDisabledContextIds,
  tutorialDisabledScopeKeys,
  tutorialRevealedConcepts,
  tutorialReplayScopeKey,
  tutorialScopeInfo,
  tutorialStepSurfaceContext,
  tutorialStepScope,
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

test("tutorial progress normalizes legacy fields into scope-aware progress and preserves compatibility fields", () => {
  const tutorial = todoTutorialDefinition();
  const progress = normalizeTutorialProgress(tutorial, {
    tutorialId: tutorial.id,
    chapterId: "use-app",
    stepId: "app:intro",
    chapterStatus: "in_progress",
    draftInputs: {},
    completedAt: null,
    hidden: false,
    disabledPages: ["app", "unknown"],
    replayStepId: "app:intro"
  });

  assert.deepEqual(tutorialDisabledScopeKeys(tutorial, progress), ["page:app"]);
  assert.deepEqual(tutorialDisabledContextIds(tutorial, progress), []);
  assert.equal(tutorialReplayScopeKey(tutorial, progress), "widget:todo_title");
  assert.deepEqual(progress.disabledPages, ["app"]);
  assert.equal(progress.replayStepId, "app:intro");
});

test("disabling a section scope does not disable the whole app page", () => {
  const tutorial = todoTutorialDefinition();
  const progress = createTutorialProgress(tutorial, "app:create-todo");
  const updated = setTutorialScopeDisabled(tutorial, progress, tutorialStepScope(tutorial, "app:create-todo")?.key, true);

  assert.deepEqual(tutorialDisabledScopeKeys(tutorial, updated), ["section:app:todo_form"]);
  assert.deepEqual(updated.disabledPages, []);
});

test("disabling one bootstrap scope does not disable later bootstrap steps on the same page", () => {
  const tutorial = todoTutorialDefinition();
  const progress = createTutorialProgress(tutorial, "identity:create");
  const updated = setTutorialScopeDisabled(tutorial, progress, tutorialStepScope(tutorial, "identity:create")?.key, true);
  const next = normalizeTutorialProgress(tutorial, { ...updated, chapterId: "session", stepId: "session:signin" });

  assert.deepEqual(tutorialDisabledScopeKeys(tutorial, updated), ["section:bootstrap:identity-form"]);
  assert.equal(isTutorialScopeDisabled(tutorial, next, tutorialStepScope(tutorial, "session:signin")?.key), false);
});

test("disabling the app intro widget does not disable later app scopes on the same page", () => {
  const tutorial = todoTutorialDefinition();
  const progress = createTutorialProgress(tutorial, "app:intro");
  const updated = setTutorialScopeDisabled(tutorial, progress, tutorialStepScope(tutorial, "app:intro")?.key, true);
  const next = normalizeTutorialProgress(tutorial, { ...updated, stepId: "app:create-todo" });

  assert.deepEqual(tutorialDisabledScopeKeys(tutorial, updated), ["widget:todo_title"]);
  assert.equal(isTutorialScopeDisabled(tutorial, next, tutorialStepScope(tutorial, "app:create-todo")?.key), false);
});

test("disabling the frontend context disables both app and world tutorial surfaces without affecting bootstrap", () => {
  const tutorial = todoTutorialDefinition();
  const progress = createTutorialProgress(tutorial, "app:intro");
  const updated = setTutorialContextDisabled(tutorial, progress, tutorialStepSurfaceContext(tutorial, "app:intro")?.id, true);
  const world = normalizeTutorialProgress(tutorial, { ...updated, stepId: "world:inspect" });
  const bootstrap = normalizeTutorialProgress(tutorial, { ...updated, stepId: "runner:create" });

  assert.deepEqual(tutorialDisabledContextIds(tutorial, updated), ["frontend"]);
  assert.equal(isTutorialContextDisabled(tutorial, world, tutorialStepSurfaceContext(tutorial, "world:inspect")?.id), true);
  assert.equal(isTutorialContextDisabled(tutorial, bootstrap, tutorialStepSurfaceContext(tutorial, "runner:create")?.id), false);
});

test("tutorial scope catalog includes authored non-step anchors for shipped app and world surfaces", () => {
  const tutorial = todoTutorialDefinition();

  assert.deepEqual(
    tutorialScopeInfo(tutorial, "widget:todo_widget_editor_button"),
    {
      key: "widget:todo_widget_editor_button",
      kind: "widget",
      page: "app",
      label: "Add Widget",
      widgetId: "todo_widget_editor_button",
      target: "widget-editor-submit"
    }
  );
  assert.deepEqual(
    tutorialScopeInfo(tutorial, "widget:world_graph_process_link"),
    {
      key: "widget:world_graph_process_link",
      kind: "widget",
      page: "world",
      label: "Open Process View",
      widgetId: "world_graph_process_link",
      target: "world-process-link"
    }
  );
});

test("todo starter blueprint authors live app and world frontend surfaces into the frontend context", () => {
  const blueprint = todoStarterBlueprint();

  assert.equal(blueprint.program.context, "frontend");
  assert.equal(blueprint.operatingPrograms.every(row => row.context === "frontend"), true);
  assert.equal(blueprint.widgets.every(row => row.context === "frontend"), true);
  assert.equal(blueprint.operatingWidgets.every(row => row.context === "frontend"), true);

  const homeRoute = blueprint.routes.find(row => row.id === "home_page_route");
  const worldRoute = blueprint.operatingRoutes.find(row => row.id === "world_page_route");
  assert.equal(homeRoute?.context, "frontend");
  assert.equal(worldRoute?.context, "frontend");
});
