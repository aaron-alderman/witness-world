import test from "node:test";
import assert from "node:assert/strict";
import {
  bindTutorialOverlayActions,
  renderTutorialOverlayActionsFactory,
  runTutorialBackAction,
  runTutorialDisableContextAction,
  runTutorialDisablePageAction,
  runTutorialExitAction,
  runTutorialNextAction,
  runTutorialResetAction,
  runTutorialRestartChapterAction,
  runTutorialRestartStepAction,
  runTutorialResumeAction,
  runTutorialShowCurrentControlAction
} from "./tutorial-overlay-actions.js";

test("tutorial overlay action helpers preserve resume/next/back/disable/reset semantics", async () => {
  const calls = [];

  const resumed = await runTutorialResumeAction({
    progress: { hidden: true },
    tutorialSurfaceState: () => ({ kind: "disabled", scopeKey: "page:app" }),
    clearTutorialScopeDisabledFn: (progress, scopeKey) => ({ ...progress, clearedScope: scopeKey }),
    saveProgress: async next => {
      calls.push(["resume-save", next.clearedScope]);
    },
    render: () => calls.push("resume-render")
  });
  assert.equal(resumed, true);

  const nexted = await runTutorialNextAction({
    currentStep: () => ({ target: "todo-form", payload: { title: "Hello" } }),
    byTarget: () => ({ id: "todo-form" }),
    fillForm: (target, payload) => calls.push(["fill-form", target.id, payload.title]),
    progress: {},
    saveProgress: async next => calls.push(["next-save", next.draftInputs.title]),
    submitTutorialForm: async () => false,
    render: () => calls.push("next-render")
  });
  assert.equal(nexted, true);

  const backed = await runTutorialBackAction({
    previousStep: () => ({ id: "step.prev", chapterId: "chapter.prev" }),
    progress: {},
    isComplete: async () => true,
    tutorialStepScope: () => ({ key: "section:prev" }),
    saveProgress: async next => calls.push(["back-save", next.stepId, next.replayScopeKey]),
    render: () => calls.push("back-render")
  });
  assert.equal(backed, true);

  const shown = runTutorialShowCurrentControlAction({
    currentStep: () => ({ target: "todo-button" }),
    focusTutorialTargetFn: target => calls.push(["focus-target", target])
  });
  assert.equal(shown, true);

  const disabledPage = await runTutorialDisablePageAction({
    progress: { id: "progress" },
    currentStep: () => ({ page: "app" }),
    currentSurfacePage: "app",
    disableTutorialOnCurrentScopeFn: progress => ({ ...progress, disabled: true }),
    saveProgress: async next => calls.push(["disable-page-save", next.disabled]),
    render: () => calls.push("disable-page-render")
  });
  assert.equal(disabledPage, true);

  const disabledContext = await runTutorialDisableContextAction({
    progress: { id: "progress" },
    currentStep: () => ({ page: "app" }),
    currentSurfacePage: "app",
    currentSurfaceContext: "ctx.todo",
    disableTutorialOnCurrentContextFn: progress => ({ ...progress, disabledContext: true }),
    saveProgress: async next => calls.push(["disable-context-save", next.disabledContext]),
    render: () => calls.push("disable-context-render")
  });
  assert.equal(disabledContext, true);

  const exited = await runTutorialExitAction({
    progress: {},
    saveProgress: async next => calls.push(["exit-save", next.hidden]),
    render: () => calls.push("exit-render")
  });
  assert.equal(exited, true);

  const restartedChapter = await runTutorialRestartChapterAction({
    setOverlayManual: value => calls.push(["manual", value]),
    restartCurrentChapter: async () => calls.push("restart-chapter")
  });
  const restartedStep = await runTutorialRestartStepAction({
    setOverlayManual: value => calls.push(["manual", value]),
    restartFromHere: async () => calls.push("restart-step")
  });
  const reset = await runTutorialResetAction({
    setOverlayManual: value => calls.push(["manual", value]),
    setProgress: value => calls.push(["set-progress", value]),
    setDisabledScopesOpen: value => calls.push(["set-disabled-open", value]),
    api: async method => calls.push(["api", method]),
    render: () => calls.push("reset-render")
  });
  assert.equal(restartedChapter, true);
  assert.equal(restartedStep, true);
  assert.equal(reset, true);

  assert.deepEqual(calls, [
    ["resume-save", "page:app"],
    "resume-render",
    ["fill-form", "todo-form", "Hello"],
    ["next-save", "Hello"],
    "next-render",
    ["back-save", "step.prev", "section:prev"],
    "back-render",
    ["focus-target", "todo-button"],
    ["disable-page-save", true],
    "disable-page-render",
    ["disable-context-save", true],
    "disable-context-render",
    ["exit-save", true],
    "exit-render",
    ["manual", false],
    "restart-chapter",
    ["manual", false],
    "restart-step",
    ["manual", false],
    ["set-progress", null],
    ["set-disabled-open", false],
    ["api", "DELETE"],
    "reset-render"
  ]);
});

test("tutorial overlay action binder wires the documented overlay controls", async () => {
  const listeners = new Map();
  const byId = id => ({
    addEventListener(type, handler) {
      listeners.set(id + ":" + type, handler);
    }
  });
  const calls = [];
  bindTutorialOverlayActions({
    byId,
    getProgress: () => ({ hidden: false }),
    currentStep: () => ({ page: "app", target: "todo-form" }),
    previousStep: () => ({ id: "prev", chapterId: "chapter.prev" }),
    tutorialSurfaceState: () => ({ kind: "active" }),
    saveProgress: async next => calls.push(["save", next.hidden ?? next.stepId ?? next.draftInputs?.title ?? null]),
    render: () => calls.push("render"),
    focusTutorialTargetFn: target => calls.push(["focus", target]),
    disableTutorialOnCurrentScopeFn: progress => ({ ...progress, hidden: "page-disabled" }),
    disableTutorialOnCurrentContextFn: progress => ({ ...progress, hidden: "context-disabled" }),
    currentSurfaceContext: "ctx.todo",
    submitTutorialForm: async () => false,
    byTarget: () => ({ id: "todo-form" }),
    fillForm: () => calls.push("fill-form"),
    setOverlayManual: value => calls.push(["manual", value]),
    restartCurrentChapter: async () => calls.push("restart-chapter"),
    restartFromHere: async () => calls.push("restart-step"),
    setProgress: value => calls.push(["set-progress", value]),
    setDisabledScopesOpen: value => calls.push(["set-disabled-open", value]),
    api: async method => calls.push(["api", method])
  });

  await listeners.get("tutorial-show-current-control:click")();
  await listeners.get("tutorial-disable-page:click")();
  await listeners.get("tutorial-reset:click")();

  assert.deepEqual(calls, [
    ["focus", "todo-form"],
    ["save", "page-disabled"],
    "render",
    ["manual", false],
    ["set-progress", null],
    ["set-disabled-open", false],
    ["api", "DELETE"],
    "reset-render"
  ].map(item => item === "reset-render" ? "render" : item));
});

test("tutorial overlay actions factory exposes the shared browser helpers", () => {
  const factory = renderTutorialOverlayActionsFactory();
  assert.equal(factory.includes("const bindTutorialOverlayActions ="), true);
  assert.equal(factory.includes("const runTutorialResetAction ="), true);
});
