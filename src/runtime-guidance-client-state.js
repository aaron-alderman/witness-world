export function renderTutorialClientStateFactory() {
  return String.raw`
    const createTutorialClientState = ${createTutorialClientState.toString()};
  `;
}

export function createTutorialClientState({
  tutorial = { steps: [] },
  stepIndex = new Map()
} = {}) {
  let progress = null;
  let lastRenderedStepId = null;
  let activeHighlightTarget = null;
  let activeFocusScope = null;
  let disabledScopesOpen = false;

  const getProgress = () => progress;
  const setProgress = value => {
    progress = value;
  };
  const getLastRenderedStepId = () => lastRenderedStepId;
  const setLastRenderedStepId = value => {
    lastRenderedStepId = value;
  };
  const getActiveHighlightTarget = () => activeHighlightTarget;
  const setActiveHighlightTarget = value => {
    activeHighlightTarget = value;
  };
  const getActiveFocusScope = () => activeFocusScope;
  const setActiveFocusScope = value => {
    activeFocusScope = value;
  };
  const getDisabledScopesOpen = () => disabledScopesOpen;
  const setDisabledScopesOpen = value => {
    disabledScopesOpen = value;
  };
  const currentStep = () => tutorial.steps.find(step => step.id === progress?.stepId) || null;
  const currentStepIndex = () => stepIndex.get(progress?.stepId || "") ?? -1;
  const previousStep = () => {
    const index = currentStepIndex();
    return index > 0 ? tutorial.steps[index - 1] : null;
  };
  const firstStepInChapter = chapterId => tutorial.steps.find(step => step.chapterId === chapterId) || null;

  return {
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
  };
}
