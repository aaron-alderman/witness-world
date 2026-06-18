import { runGuidanceSuggestionAction, renderGuidanceCompanionActionsFactory } from "./runtime-guidance-companion-actions.js";
import { getOrCreateSourceryCompanionShell, renderSourceryCompanionShellFactory } from "./runtime-guidance-companion-shell.js";
import { bindSourceryCompanionSuggestionActions, renderSourceryCompanionSyncFactory, syncSourceryCompanionShell } from "./runtime-guidance-companion-sync.js";
import { buildLiveGuidanceSuggestions, renderLiveGuidanceSuggestionsFactory } from "./runtime-guidance-live-suggestions.js";

export function renderTutorialClientRuntimeFactory() {
  return String.raw`
    ${renderGuidanceCompanionActionsFactory()}
    ${renderSourceryCompanionShellFactory()}
    ${renderSourceryCompanionSyncFactory()}
    ${renderLiveGuidanceSuggestionsFactory()}
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
  getOrCreateSourceryCompanionShell({
    document: documentTarget,
    window: windowTarget,
    enabled: true,
    inspection: windowTarget?.world || windowTarget?.__surfaceRuntimeInspection || null,
    issueLedger: null
  });
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
    tutorialScopeInventoryRows,
    tutorialContextInfo,
    isTutorialScopeDisabled,
    isTutorialContextDisabled,
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
  const { renderDisabledScopes, render: renderTutorialView, publishRuntimeState } = createTutorialClientViewAdapter({
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
    tutorialScopeInventoryRowsFn: tutorialScopeInventoryRows,
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
  let render = renderTutorialView;
  const invokeRender = () => render();
  const tutorialRuntimeActions = createTutorialRuntimeActions({
    windowTarget,
    fetchFn,
    getProgress,
    currentStep,
    firstStepInChapter,
    tutorialStepScopeFn: tutorialStepScope,
    saveProgress,
    render: invokeRender,
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
  const syncLiveCompanionShell = () => {
    const progress = getProgress();
    const surface = tutorialSurfaceState();
    const disabledRows = tutorialScopeInventoryRows(progress).filter(row => row.status === "muted");
    syncSourceryCompanionShell({
      windowTarget,
      documentTarget,
      inspection: windowTarget?.world || windowTarget?.__surfaceRuntimeInspection || null,
      issueLedger: windowTarget?.__surfaceRuntimeIssueLedger || null,
      guidanceSuggestions: buildLiveGuidanceSuggestions({
        progress,
        currentStep: currentStep(),
        surface,
        disabledRows,
        tutorialPageLabel,
        tutorialStepScope,
        tutorialStepSurfaceContext,
        tutorialContextInfo,
        tutorialContextLabel: contextId => tutorialContextInfo(contextId)?.label || contextId,
        isTutorialContextDisabled,
        isTutorialScopeDisabled
      })
    });
  };
  const runLiveSuggestion = async suggestion => {
    await runGuidanceSuggestionAction(suggestion, {
      resumeTutorial: async () => {
        resumeButton?.click?.();
      },
      enableCurrentPage: async scopeKey => {
        await saveProgress(clearTutorialScopeDisabled(getProgress(), scopeKey || tutorialStepScope(currentStep())?.key || null));
        render();
      },
      enableContext: async contextId => {
        await saveProgress(clearTutorialContextDisabled(getProgress(), contextId || tutorialStepSurfaceContext(currentStep())?.id || null));
        render();
      },
      enablePage: async (scopeKey, page) => {
        await saveProgress(clearTutorialScopeDisabled(getProgress(), scopeKey || (page === "world" ? "world" : null)));
        render();
      },
      continueSurface: async page => {
        await continueTutorialOnPage(page);
      },
      focusDisabledScopes: async () => {
        setDisabledScopesOpen(true);
        renderDisabledScopes();
        disabledScopesPanel?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      },
      focusTarget: async target => {
        focusTutorialTarget(target);
      },
      openRuntimeIssues: async () => {
        const shell = windowTarget?.__sourceryCompanionShell;
        if (!shell?.panel) return;
        shell.panel.hidden = false;
        shell.issues?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      },
      focusRuntimeTarget: async targetId => {
        const node = documentTarget?.getElementById?.(targetId);
        node?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        node?.focus?.();
      },
      rerunRuntimeProbe: async () => {
        const inspection = windowTarget?.world || windowTarget?.__surfaceRuntimeInspection || null;
        await inspection?.rerunProbe?.();
      },
      copyRuntimeInspection: async () => {
        const inspection = windowTarget?.world || windowTarget?.__surfaceRuntimeInspection || null;
        const payload = typeof inspection?.inspect === "function" ? inspection.inspect() : null;
        const json = JSON.stringify(payload, null, 2);
        if (windowTarget?.navigator?.clipboard?.writeText) {
          try {
            await windowTarget.navigator.clipboard.writeText(json);
          } catch {}
        }
      }
    });
  };
  render = () => {
    renderTutorialView();
    syncLiveCompanionShell();
  };
  bindSourceryCompanionSuggestionActions({
    windowTarget,
    runSuggestion: runLiveSuggestion
  });
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
    render: invokeRender,
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
    render: invokeRender,
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
