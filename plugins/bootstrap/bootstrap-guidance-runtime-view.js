export function renderBootstrapGuidanceRuntimeViewFactory() {
  return String.raw`
    const buildBootstrapGuidanceRuntimeView = ${buildBootstrapGuidanceRuntimeView.toString()};
    const buildBootstrapTutorialRuntimeView = buildBootstrapGuidanceRuntimeView;
  `;
}

export function buildBootstrapGuidanceRuntimeView({
  guidanceProgress = null,
  tutorialProgress = null,
  guidanceState = null,
  tutorialState = null,
  currentSuggestions = [],
  currentSurfacePage = "bootstrap",
  guidanceStep = null,
  tutorialStep = () => null,
  guidanceStepScope = null,
  tutorialStepScope = () => null,
  guidanceStepConcepts = null,
  tutorialStepConcepts = () => [],
  guidanceRevealedConcepts = null,
  tutorialRevealedConcepts = () => [],
  guidanceReplayScopeKey = null,
  tutorialReplayScopeKey = () => null,
  guidanceReplayStepId = null,
  tutorialReplayStepId = () => null,
  guidanceDisabledScopeKeys = null,
  tutorialDisabledScopeKeys = () => [],
  guidanceDisabledPages = null,
  tutorialDisabledPages = () => [],
  guidanceDisabledContextIds = null,
  guidanceSurfaceState = null,
  tutorialSurfaceState = () => ({ kind: "unknown" })
} = {}) {
  const activeProgress = guidanceProgress ?? tutorialProgress;
  const activeState = guidanceState ?? tutorialState;
  const readStep = guidanceStep ?? tutorialStep;
  const readStepScope = guidanceStepScope ?? tutorialStepScope;
  const readStepConcepts = guidanceStepConcepts ?? tutorialStepConcepts;
  const readRevealedConcepts = guidanceRevealedConcepts ?? tutorialRevealedConcepts;
  const readReplayScopeKey = guidanceReplayScopeKey ?? tutorialReplayScopeKey;
  const readReplayStepId = guidanceReplayStepId ?? tutorialReplayStepId;
  const readDisabledScopeKeys = guidanceDisabledScopeKeys ?? tutorialDisabledScopeKeys;
  const readDisabledPages = guidanceDisabledPages ?? tutorialDisabledPages;
  const readDisabledContextIds = guidanceDisabledContextIds
    ?? activeState?.guidanceDisabledContextIds
    ?? activeState?.tutorialDisabledContextIds
    ?? (() => []);
  const readSurfaceState = guidanceSurfaceState ?? tutorialSurfaceState;
  const currentStep = readStep();
  return {
    currentStepId: activeProgress?.stepId || null,
    currentChapterId: activeProgress?.chapterId || null,
    currentPage: currentStep?.page || null,
    currentScopeKey: readStepScope(currentStep)?.key || null,
    currentConceptIds: readStepConcepts(currentStep).map(concept => concept.id),
    revealedConceptIds: readRevealedConcepts(activeProgress).map(concept => concept.id),
    suggestions: currentSuggestions.map(suggestion => ({ id: suggestion.id, title: suggestion.title, actionKind: suggestion.action?.kind || null })),
    replayScopeKey: readReplayScopeKey(activeProgress),
    replayStepId: readReplayStepId(activeProgress),
    completedAt: activeProgress?.completedAt || null,
    hidden: activeProgress?.hidden === true,
    disabledScopeKeys: readDisabledScopeKeys(activeProgress),
    disabledContextIds: readDisabledContextIds(activeProgress),
    disabledPages: readDisabledPages(activeProgress),
    surfacePage: currentSurfacePage,
    surfaceStatus: readSurfaceState().kind
  };
}

export const renderBootstrapTutorialRuntimeViewFactory = renderBootstrapGuidanceRuntimeViewFactory;
export const buildBootstrapTutorialRuntimeView = buildBootstrapGuidanceRuntimeView;
