import test from "node:test";
import assert from "node:assert/strict";
import {
  bindTutorialClientRuntimeAdapters,
  renderTutorialClientBootstrapFactory,
  startTutorialClientRuntime
} from "./tutorial-client-bootstrap.js";

globalThis.bindTutorialDisabledScopesActions ??= payload => payload;
globalThis.bindTutorialOverlayDrag ??= payload => payload;
globalThis.bindTutorialOverlayActions ??= payload => payload;

test("tutorial client bootstrap adapter binds disabled-scope, drag, and overlay actions through the shared seam", () => {
  const calls = [];
  globalThis.bindTutorialDisabledScopesActions = payload => calls.push(["disabled", payload.disabledScopesToggle.id]);
  globalThis.bindTutorialOverlayDrag = payload => {
    calls.push(["drag", payload.handle.id]);
    payload.setTutorialOverlayPositionFn({ left: 10, top: 20, manual: true });
  };
  globalThis.bindTutorialOverlayActions = payload => calls.push(["overlay", payload.currentSurfacePage, typeof payload.api]);
  bindTutorialClientRuntimeAdapters({
    documentTarget: {
      body: { id: "body" },
      getElementById(id) {
        return { id };
      }
    },
    windowTarget: {
      addEventListener(type) {
        calls.push(["window-listener", type]);
      }
    },
    disabledScopesToggle: { id: "toggle" },
    disabledScopesPanel: { id: "panel" },
    getDisabledScopesOpen: () => false,
    setDisabledScopesOpen: value => calls.push(["set-disabled-open", value]),
    renderDisabledScopes: () => calls.push("render-disabled"),
    getProgress: () => ({ stepId: "a" }),
    tutorialDisabledGuidanceRowsFn: () => [],
    focusTutorialScopeTargetFn: () => true,
    focusTutorialTargetFn: () => true,
    clearTutorialContextDisabledFn: progress => progress,
    clearTutorialScopeDisabledFn: progress => progress,
    saveProgress: async () => {},
    render: () => calls.push("render"),
    continueTutorialOnPage: async () => {},
    overlay: { id: "overlay" },
    overlayDrag: { manual: false },
    setOverlayPosition: (left, top, manual) => calls.push(["set-position", left, top, manual]),
    currentStep: () => ({ id: "a" }),
    previousStep: () => null,
    tutorialSurfaceState: () => ({ kind: "active" }),
    tutorialStepScope: () => "scope.a",
    tutorialStepSurfaceContext: () => null,
    currentSurfaceContext: "ctx.todo",
    currentSurfacePage: "app",
    advance: async () => {},
    byTarget: () => null,
    fillForm: () => {},
    submitTutorialForm: async () => {},
    isComplete: async () => false,
    restartCurrentChapter: async () => {},
    restartFromHere: async () => {},
    focusTutorialTarget: () => true,
    disableTutorialOnCurrentScopeFn: progress => progress,
    disableTutorialOnCurrentContextFn: progress => progress,
    setProgress: value => calls.push(["set-progress", value]),
    api: async () => ({})
  });

  assert.deepEqual(calls, [
    ["disabled", "toggle"],
    ["drag", "tutorial-overlay-handle"],
    ["set-position", 10, 20, true],
    ["overlay", "app", "function"]
  ]);
});

test("tutorial client bootstrap runner binds progress observation and boots through the shared seam", async () => {
  const calls = [];
  startTutorialClientRuntime({
    documentTarget: { id: "document" },
    windowTarget: { id: "window" },
    bindProgressObservation: payload => calls.push(["observe", payload.documentTarget.id, payload.windowTarget.id]),
    boot: async payload => calls.push(["boot", typeof payload.publishRuntimeState]),
    publishRuntimeState: () => {}
  });

  await Promise.resolve();
  assert.deepEqual(calls, [
    ["observe", "document", "window"],
    ["boot", "function"]
  ]);
});

test("tutorial client bootstrap factory exposes the shared browser helpers", () => {
  const factory = renderTutorialClientBootstrapFactory();
  assert.equal(factory.includes("const bindTutorialClientRuntimeAdapters ="), true);
  assert.equal(factory.includes("const startTutorialClientRuntime ="), true);
});
