import test from "node:test";
import assert from "node:assert/strict";
import {
  renderTutorialClientRuntimeFactory,
  startTutorialClientRuntimeApp
} from "./tutorial-client-runtime.js";

test("tutorial client runtime assembles helper-owned seams and starts the shared runtime bootstrap", () => {
  const originalGlobals = {
    createTutorialOverlayDom: globalThis.createTutorialOverlayDom,
    createTutorialOverlayDragState: globalThis.createTutorialOverlayDragState,
    createTutorialClientState: globalThis.createTutorialClientState,
    createTutorialProgressState: globalThis.createTutorialProgressState,
    clearTutorialOverlayHighlight: globalThis.clearTutorialOverlayHighlight,
    pulseTutorialNode: globalThis.pulseTutorialNode,
    flashTutorialAutoClick: globalThis.flashTutorialAutoClick,
    fillTutorialForm: globalThis.fillTutorialForm,
    focusTutorialOverlayTarget: globalThis.focusTutorialOverlayTarget,
    focusTutorialOverlayScopeTarget: globalThis.focusTutorialOverlayScopeTarget,
    setTutorialOverlayPosition: globalThis.setTutorialOverlayPosition,
    positionTutorialOverlay: globalThis.positionTutorialOverlay,
    createTutorialClientInteractions: globalThis.createTutorialClientInteractions,
    createTutorialClientProgressAdapter: globalThis.createTutorialClientProgressAdapter,
    renderTutorialDisabledScopeRows: globalThis.renderTutorialDisabledScopeRows,
    createTutorialClientViewAdapter: globalThis.createTutorialClientViewAdapter,
    createTutorialRuntimeActions: globalThis.createTutorialRuntimeActions,
    createTutorialProgressRuntime: globalThis.createTutorialProgressRuntime,
    bindTutorialClientRuntimeAdapters: globalThis.bindTutorialClientRuntimeAdapters,
    startTutorialClientRuntime: globalThis.startTutorialClientRuntime
  };
  const calls = [];
  try {
    globalThis.createTutorialOverlayDom = ({ document }) => {
      calls.push(["overlay-dom", document.id]);
      return {
        dimmer: { id: "dimmer" },
        overlay: { id: "overlay" },
        resumeButton: { id: "resume" },
        disabledScopesToggle: { id: "toggle" },
        disabledScopesPanel: { id: "panel" }
      };
    };
    globalThis.createTutorialOverlayDragState = () => {
      calls.push(["overlay-drag-state"]);
      return { manual: false };
    };
    globalThis.createTutorialClientState = ({ tutorial, stepIndex }) => {
      calls.push(["client-state", tutorial.id, stepIndex.get("step-1")]);
      return {
        getProgress: () => null,
        setProgress() {},
        getLastRenderedStepId: () => null,
        setLastRenderedStepId() {},
        getActiveHighlightTarget: () => null,
        setActiveHighlightTarget() {},
        getActiveFocusScope: () => null,
        setActiveFocusScope() {},
        getDisabledScopesOpen: () => false,
        setDisabledScopesOpen() {},
        currentStep: () => null,
        currentStepIndex: () => -1,
        previousStep: () => null,
        firstStepInChapter: () => null
      };
    };
    globalThis.createTutorialProgressState = ({ currentSurfacePage, currentSurfaceContext }) => {
      calls.push(["progress-state", currentSurfacePage, currentSurfaceContext]);
      return {
        tutorialPageLabel: () => "Tutorial",
        tutorialStepScope: () => null,
        tutorialStepSurfaceContext: () => null,
        tutorialScopeTargetName: () => null,
        tutorialDisabledScopeKeys: () => [],
        tutorialDisabledPages: () => [],
        tutorialDisabledContextIds: () => [],
        tutorialReplayScopeKey: () => null,
        tutorialReplayStepId: () => null,
        normalizeProgress: value => value,
        tutorialStepConcepts: () => [],
        tutorialRevealedConcepts: () => [],
        tutorialSurfaceState: () => ({ kind: "idle" }),
        tutorialDisabledGuidanceRows: () => [],
        clearTutorialScopeDisabled: value => value,
        clearTutorialContextDisabled: value => value,
        disableTutorialOnCurrentScope: value => value,
        disableTutorialOnCurrentContext: value => value
      };
    };
    globalThis.clearTutorialOverlayHighlight = () => {};
    globalThis.pulseTutorialNode = () => {};
    globalThis.flashTutorialAutoClick = () => {};
    globalThis.fillTutorialForm = () => {};
    globalThis.focusTutorialOverlayTarget = () => {};
    globalThis.focusTutorialOverlayScopeTarget = () => {};
    globalThis.setTutorialOverlayPosition = () => {};
    globalThis.positionTutorialOverlay = () => {};
    globalThis.createTutorialClientInteractions = ({ documentTarget, windowTarget }) => {
      calls.push(["client-interactions", documentTarget.id, windowTarget.id]);
      return {
        byTarget: () => null,
        focusScopeFor: () => null,
        clearHighlight: () => {},
        pulseNode: () => {},
        flashAutoClick: () => {},
        fillForm: () => {},
        focusTutorialTarget: () => false,
        focusTutorialScopeTarget: () => false,
        setOverlayPosition: () => {},
        position: () => {}
      };
    };
    globalThis.createTutorialClientProgressAdapter = ({ tutorialId, fetchFn }) => {
      calls.push(["progress-adapter", tutorialId, typeof fetchFn]);
      return { api: async () => ({}), saveProgress: async () => {} };
    };
    globalThis.renderTutorialDisabledScopeRows = () => "";
    globalThis.createTutorialClientViewAdapter = ({ currentSurfacePage }) => {
      calls.push(["view-adapter", currentSurfacePage]);
      return {
        renderDisabledScopes: () => {},
        render: () => {},
        publishRuntimeState: () => {}
      };
    };
    globalThis.createTutorialRuntimeActions = ({ windowTarget, wait }) => {
      calls.push(["runtime-actions", windowTarget.id, typeof wait]);
      return {
        continueTutorialOnPage: async () => {},
        submitTutorialForm: async () => {},
        restartCurrentChapter: async () => {},
        restartFromHere: async () => {},
        isComplete: async () => false
      };
    };
    globalThis.createTutorialProgressRuntime = ({ tutorial }) => {
      calls.push(["progress-runtime", tutorial.id]);
      return {
        advance: async () => {},
        requestMaybeAdvance: async () => {},
        boot: async () => {},
        bindProgressObservation: () => {}
      };
    };
    globalThis.bindTutorialClientRuntimeAdapters = ({ documentTarget, windowTarget }) => {
      calls.push(["bind-runtime", documentTarget.id, windowTarget.id]);
    };
    globalThis.startTutorialClientRuntime = ({ documentTarget, windowTarget }) => {
      calls.push(["start-runtime", documentTarget.id, windowTarget.id]);
    };

    const result = startTutorialClientRuntimeApp({
      tutorial: {
        id: "tutorial-1",
        steps: [{ id: "step-1", chapterId: "chapter-1" }]
      },
      tutorialConfig: {
        surfacePage: "bootstrap",
        surfaceContext: "ctx.todo"
      },
      documentTarget: { id: "document" },
      windowTarget: { id: "window" },
      fetchFn: async () => ({}),
      wait: async () => {}
    });

    assert.equal(typeof result?.requestMaybeAdvance, "function");
    assert.deepEqual(calls, [
      ["overlay-dom", "document"],
      ["overlay-drag-state"],
      ["client-state", "tutorial-1", 0],
      ["progress-state", "bootstrap", "ctx.todo"],
      ["client-interactions", "document", "window"],
      ["progress-adapter", "tutorial-1", "function"],
      ["view-adapter", "bootstrap"],
      ["runtime-actions", "window", "function"],
      ["progress-runtime", "tutorial-1"],
      ["bind-runtime", "document", "window"],
      ["start-runtime", "document", "window"]
    ]);
  } finally {
    for (const [key, value] of Object.entries(originalGlobals)) {
      globalThis[key] = value;
    }
  }
});

test("tutorial client runtime factory exposes the shared browser helper", () => {
  const factory = renderTutorialClientRuntimeFactory();
  assert.equal(factory.includes("const startTutorialClientRuntimeApp ="), true);
});
