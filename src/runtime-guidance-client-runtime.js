export function renderTutorialClientRuntimeFactory() {
  return String.raw`
    const startTutorialClientRuntimeApp = ${startTutorialClientRuntimeApp.toString()};
  `;
}

export function startTutorialClientRuntimeApp({
  tutorial = null,
  tutorialConfig = {},
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null,
  fetchFn = (...args) => fetch(...args),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  if (!tutorial || !Array.isArray(tutorial.steps)) return null;
  const currentSurfacePage = typeof tutorialConfig.surfacePage === "string" && tutorialConfig.surfacePage.trim() ? tutorialConfig.surfacePage.trim() : "app";
  const currentSurfaceContext = typeof tutorialConfig.surfaceContext === "string" && tutorialConfig.surfaceContext.trim() ? tutorialConfig.surfaceContext.trim() : null;
  const currentSurfaceRouteId = typeof tutorialConfig.surfaceRouteId === "string" && tutorialConfig.surfaceRouteId.trim() ? tutorialConfig.surfaceRouteId.trim() : null;
  const currentSurfaceRootWidgetId = typeof tutorialConfig.surfaceRootWidgetId === "string" && tutorialConfig.surfaceRootWidgetId.trim() ? tutorialConfig.surfaceRootWidgetId.trim() : null;
  const currentSurfaceProgramId = typeof tutorialConfig.surfaceProgramId === "string" && tutorialConfig.surfaceProgramId.trim() ? tutorialConfig.surfaceProgramId.trim() : null;
  const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
  const { dimmer, overlay, resumeButton, disabledScopesToggle, disabledScopesPanel } = createTutorialOverlayDom({ document: documentTarget });
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
    documentTarget,
    windowTarget,
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
    fetchFn,
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
    documentTarget,
    setActiveHighlightTarget,
    setActiveFocusScope,
    windowTarget,
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
    windowTarget,
    fetchFn,
    getProgress,
    currentStep,
    firstStepInChapter,
    tutorialStepScopeFn: tutorialStepScope,
    saveProgress,
    render,
    flashAutoClickFn: flashAutoClick,
    wait
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
    documentTarget,
    windowTarget,
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
    documentTarget,
    windowTarget,
    bindProgressObservation,
    boot,
    publishRuntimeState
  });
  return {
    tutorialClientState,
    tutorialProgressState,
    tutorialRuntimeActions,
    tutorialProgressRuntime,
    requestMaybeAdvance
  };
}
