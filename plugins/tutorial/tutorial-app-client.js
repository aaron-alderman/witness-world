import { tutorialDefinition } from "./tutorials.js";
import { renderTutorialDisabledScopesActionsFactory } from "./tutorial-disabled-scopes-actions.js";
import { renderTutorialDisabledScopesViewFactory } from "./tutorial-disabled-scopes-view.js";
import { renderTutorialClientAdapterFactory } from "./tutorial-client-adapter.js";
import { renderTutorialClientBootstrapFactory } from "./tutorial-client-bootstrap.js";
import { renderTutorialClientInteractionsFactory } from "./tutorial-client-interactions.js";
import { renderTutorialClientStateFactory } from "./tutorial-client-state.js";
import { renderTutorialOverlayActionsFactory } from "./tutorial-overlay-actions.js";
import { renderTutorialOverlayDragFactory } from "./tutorial-overlay-drag.js";
import { renderTutorialOverlayDomFactory } from "./tutorial-overlay-dom.js";
import { renderTutorialOverlayInteractionsFactory } from "./tutorial-overlay-interactions.js";
import { renderTutorialOverlayViewFactory } from "./tutorial-overlay-view.js";
import { renderTutorialProgressRuntimeFactory } from "./tutorial-progress-runtime.js";
import { renderTutorialProgressStateFactory } from "./tutorial-progress-state.js";
import { renderTutorialRuntimeActionsFactory } from "./tutorial-runtime-actions.js";

export function renderTutorialClient(tutorialConfig) {
  const tutorial = tutorialDefinition(tutorialConfig?.id);
  if (!tutorial) return "";
  const json = JSON.stringify(tutorial).replace(/</g, "\\u003c");
  const configJson = JSON.stringify(tutorialConfig || {}).replace(/</g, "\\u003c");
  const engine = String.raw`(() => {
  ${renderTutorialOverlayDomFactory()}
  ${renderTutorialDisabledScopesActionsFactory()}
  ${renderTutorialDisabledScopesViewFactory()}
  ${renderTutorialClientAdapterFactory()}
  ${renderTutorialClientBootstrapFactory()}
  ${renderTutorialClientInteractionsFactory()}
  ${renderTutorialClientStateFactory()}
  ${renderTutorialOverlayActionsFactory()}
  ${renderTutorialOverlayDragFactory()}
  ${renderTutorialOverlayInteractionsFactory()}
  ${renderTutorialOverlayViewFactory()}
  ${renderTutorialProgressRuntimeFactory()}
  ${renderTutorialProgressStateFactory()}
  ${renderTutorialRuntimeActionsFactory()}
  const tutorial = ${json};
  const tutorialConfig = ${configJson};
  const currentSurfacePage = typeof tutorialConfig.surfacePage === "string" && tutorialConfig.surfacePage.trim() ? tutorialConfig.surfacePage.trim() : "app";
  const currentSurfaceContext = typeof tutorialConfig.surfaceContext === "string" && tutorialConfig.surfaceContext.trim() ? tutorialConfig.surfaceContext.trim() : null;
  const currentSurfaceRouteId = typeof tutorialConfig.surfaceRouteId === "string" && tutorialConfig.surfaceRouteId.trim() ? tutorialConfig.surfaceRouteId.trim() : null;
  const currentSurfaceRootWidgetId = typeof tutorialConfig.surfaceRootWidgetId === "string" && tutorialConfig.surfaceRootWidgetId.trim() ? tutorialConfig.surfaceRootWidgetId.trim() : null;
  const currentSurfaceProgramId = typeof tutorialConfig.surfaceProgramId === "string" && tutorialConfig.surfaceProgramId.trim() ? tutorialConfig.surfaceProgramId.trim() : null;
  const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
  const { dimmer, overlay, resumeButton, disabledScopesToggle, disabledScopesPanel } = createTutorialOverlayDom({ document });
  const overlayDrag = createTutorialOverlayDragState();
  const tutorialClientState = createTutorialClientState({
    tutorial,
    stepIndex
  });
  const {
    getProgress,
    setProgress,
    getLastRenderedStepId,
    setLastRenderedStepId,
    getActiveHighlightTarget,
    setActiveHighlightTarget,
    getActiveFocusScope,
    setActiveFocusScope,
    getDisabledScopesOpen,
    setDisabledScopesOpen,
    currentStep,
    currentStepIndex,
    previousStep,
    firstStepInChapter
  } = tutorialClientState;
  const tutorialProgressState = createTutorialProgressState({
    tutorial,
    currentSurfacePage,
    currentSurfaceContext,
    getProgress,
    currentStep,
    currentStepIndex
  });
  const {
    tutorialPageLabel,
    tutorialStepScope,
    tutorialStepSurfaceContext,
    tutorialScopeTargetName,
    tutorialDisabledScopeKeys,
    tutorialDisabledPages,
    tutorialDisabledContextIds,
    tutorialReplayScopeKey,
    tutorialReplayStepId,
    normalizeProgress,
    tutorialStepConcepts,
    tutorialRevealedConcepts,
    tutorialSurfaceState,
    tutorialDisabledGuidanceRows,
    clearTutorialScopeDisabled,
    clearTutorialContextDisabled,
    disableTutorialOnCurrentScope,
    disableTutorialOnCurrentContext
  } = tutorialProgressState;
  const {
    byTarget,
    focusScopeFor,
    clearHighlight,
    pulseNode,
    flashAutoClick,
    fillForm,
    focusTutorialTarget,
    focusTutorialScopeTarget,
    setOverlayPosition,
    position
  } = createTutorialClientInteractions({
    documentTarget: document,
    windowTarget: window,
    overlay,
    overlayDrag,
    tutorialScopeTargetNameFn: tutorialScopeTargetName,
    getActiveHighlightTarget,
    setActiveHighlightTarget,
    getActiveFocusScope,
    setActiveFocusScope,
    clearTutorialOverlayHighlightFn: clearTutorialOverlayHighlight,
    pulseTutorialNodeFn: pulseTutorialNode,
    flashTutorialAutoClickFn: flashTutorialAutoClick,
    fillTutorialFormFn: fillTutorialForm,
    focusTutorialOverlayTargetFn: focusTutorialOverlayTarget,
    focusTutorialOverlayScopeTargetFn: focusTutorialOverlayScopeTarget,
    setTutorialOverlayPositionFn: setTutorialOverlayPosition,
    positionTutorialOverlayFn: positionTutorialOverlay
  });
  const { api, saveProgress } = createTutorialClientProgressAdapter({
    tutorialId: tutorial.id,
    fetchFn: (...args) => fetch(...args),
    normalizeProgressFn: normalizeProgress,
    setProgress
  });
  const { renderDisabledScopes, render, publishRuntimeState } = createTutorialClientViewAdapter({
    getProgress,
    currentStep,
    tutorialSurfaceState,
    tutorialReplayScopeKeyFn: tutorialReplayScopeKey,
    tutorialPageLabel,
    tutorialStepConceptsFn: tutorialStepConcepts,
    previousStep,
    firstStepInChapter,
    currentSurfaceContext,
    byTarget,
    focusScopeFor,
    clearHighlightFn: clearHighlight,
    positionFn: position,
    getLastRenderedStepId,
    setLastRenderedStepId,
    overlay,
    dimmer,
    resumeButton,
    disabledScopesToggle,
    disabledScopesPanel,
    getDisabledScopesOpen,
    setDisabledScopesOpen,
    tutorialDisabledGuidanceRowsFn: tutorialDisabledGuidanceRows,
    currentSurfacePage,
    renderTutorialDisabledScopeRowsFn: renderTutorialDisabledScopeRows,
    documentTarget: document,
    setActiveHighlightTarget,
    setActiveFocusScope,
    windowTarget: window,
    tutorialStepScopeFn: tutorialStepScope,
    tutorialRevealedConceptsFn: tutorialRevealedConcepts,
    tutorialReplayStepIdFn: tutorialReplayStepId,
    tutorialDisabledScopeKeysFn: tutorialDisabledScopeKeys,
    tutorialDisabledContextIdsFn: tutorialDisabledContextIds,
    tutorialDisabledPagesFn: tutorialDisabledPages,
    currentSurfaceRouteId,
    currentSurfaceRootWidgetId,
    currentSurfaceProgramId
  });
  const tutorialRuntimeActions = createTutorialRuntimeActions({
    windowTarget: window,
    fetchFn: (...args) => fetch(...args),
    getProgress,
    currentStep,
    firstStepInChapter,
    tutorialStepScopeFn: tutorialStepScope,
    saveProgress,
    render,
    flashAutoClickFn: flashAutoClick,
    wait: ms => new Promise(resolve => setTimeout(resolve, ms))
  });
  const {
    continueTutorialOnPage,
    submitTutorialForm,
    restartCurrentChapter,
    restartFromHere,
    isComplete
  } = tutorialRuntimeActions;
  const tutorialProgressRuntime = createTutorialProgressRuntime({
    tutorial,
    getProgress,
    setProgress,
    currentStep,
    currentStepIndex,
    tutorialReplayStepIdFn: tutorialReplayStepId,
    byTarget,
    normalizeProgressFn: normalizeProgress,
    api,
    saveProgress,
    render,
    isComplete
  });
  const {
    advance,
    requestMaybeAdvance,
    boot,
    bindProgressObservation
  } = tutorialProgressRuntime;
  bindTutorialClientRuntimeAdapters({
    documentTarget: document,
    windowTarget: window,
    disabledScopesToggle,
    disabledScopesPanel,
    getDisabledScopesOpen,
    setDisabledScopesOpen,
    renderDisabledScopes,
    getProgress,
    tutorialDisabledGuidanceRowsFn: tutorialDisabledGuidanceRows,
    focusTutorialScopeTargetFn: focusTutorialScopeTarget,
    focusTutorialTargetFn: focusTutorialTarget,
    clearTutorialContextDisabledFn: clearTutorialContextDisabled,
    clearTutorialScopeDisabledFn: clearTutorialScopeDisabled,
    saveProgress,
    render,
    continueTutorialOnPage,
    overlay,
    overlayDrag,
    setOverlayPosition,
    currentStep,
    previousStep,
    tutorialSurfaceState,
    tutorialStepScope,
    tutorialStepSurfaceContext,
    currentSurfaceContext,
    currentSurfacePage,
    advance,
    byTarget,
    fillForm,
    submitTutorialForm,
    isComplete,
    restartCurrentChapter,
    restartFromHere,
    focusTutorialTarget,
    disableTutorialOnCurrentScopeFn: disableTutorialOnCurrentScope,
    disableTutorialOnCurrentContextFn: disableTutorialOnCurrentContext,
    setProgress,
    api
  });
  startTutorialClientRuntime({
    documentTarget: document,
    windowTarget: window,
    bindProgressObservation,
    boot,
    publishRuntimeState
  });
})();`;
  return `\n<script>\n${engine}\n</script>`;
}
