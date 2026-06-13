export function renderBootstrapTutorialRuntimeViewFactory() {
  return String.raw`
    const buildBootstrapTutorialRuntimeView = ${buildBootstrapTutorialRuntimeView.toString()};
  `;
}

export function buildBootstrapTutorialRuntimeView({
  tutorialProgress = null,
  tutorialState = null,
  currentSuggestions = [],
  currentSurfacePage = "bootstrap",
  tutorialStep = () => null,
  tutorialStepScope = () => null,
  tutorialStepConcepts = () => [],
  tutorialRevealedConcepts = () => [],
  tutorialReplayScopeKey = () => null,
  tutorialReplayStepId = () => null,
  tutorialDisabledScopeKeys = () => [],
  tutorialDisabledPages = () => [],
  tutorialSurfaceState = () => ({ kind: "unknown" })
} = {}) {
  const currentStep = tutorialStep();
  return {
    currentStepId: tutorialProgress?.stepId || null,
    currentChapterId: tutorialProgress?.chapterId || null,
    currentPage: currentStep?.page || null,
    currentScopeKey: tutorialStepScope(currentStep)?.key || null,
    currentConceptIds: tutorialStepConcepts(currentStep).map(concept => concept.id),
    revealedConceptIds: tutorialRevealedConcepts(tutorialProgress).map(concept => concept.id),
    suggestions: currentSuggestions.map(suggestion => ({ id: suggestion.id, title: suggestion.title, actionKind: suggestion.action?.kind || null })),
    replayScopeKey: tutorialReplayScopeKey(tutorialProgress),
    replayStepId: tutorialReplayStepId(tutorialProgress),
    completedAt: tutorialProgress?.completedAt || null,
    hidden: tutorialProgress?.hidden === true,
    disabledScopeKeys: tutorialDisabledScopeKeys(tutorialProgress),
    disabledContextIds: tutorialState?.tutorialDisabledContextIds?.(tutorialProgress) || [],
    disabledPages: tutorialDisabledPages(tutorialProgress),
    surfacePage: currentSurfacePage,
    surfaceStatus: tutorialSurfaceState().kind
  };
}
