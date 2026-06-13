export function renderTutorialClientBootstrapFactory() {
  return String.raw`
    const bindTutorialClientRuntimeAdapters = ${bindTutorialClientRuntimeAdapters.toString()};
    const startTutorialClientRuntime = ${startTutorialClientRuntime.toString()};
  `;
}

export function bindTutorialClientRuntimeAdapters({
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null,
  disabledScopesToggle = null,
  disabledScopesPanel = null,
  getDisabledScopesOpen = () => false,
  setDisabledScopesOpen = () => {},
  renderDisabledScopes = () => {},
  getProgress = () => null,
  tutorialDisabledGuidanceRowsFn = () => [],
  focusTutorialScopeTargetFn = () => false,
  focusTutorialTargetFn = () => false,
  clearTutorialContextDisabledFn = progress => progress,
  clearTutorialScopeDisabledFn = progress => progress,
  saveProgress = async () => {},
  render = () => {},
  continueTutorialOnPage = async () => {},
  overlay = null,
  overlayDrag = {},
  setOverlayPosition = () => {},
  currentStep = () => null,
  previousStep = () => null,
  tutorialSurfaceState = () => ({ kind: "" }),
  tutorialStepScope = () => null,
  tutorialStepSurfaceContext = () => null,
  currentSurfaceContext = null,
  currentSurfacePage = "",
  advance = async () => {},
  byTarget = () => null,
  fillForm = () => {},
  submitTutorialForm = async () => {},
  isComplete = async () => false,
  restartCurrentChapter = async () => {},
  restartFromHere = async () => {},
  focusTutorialTarget = () => false,
  disableTutorialOnCurrentScopeFn = progress => progress,
  disableTutorialOnCurrentContextFn = progress => progress,
  setProgress = () => {},
  api = async () => ({})
} = {}) {
  bindTutorialDisabledScopesActions({
    disabledScopesToggle,
    disabledScopesClose: documentTarget?.getElementById?.("tutorial-disabled-scopes-close") || null,
    disabledScopesPanel,
    getDisabledScopesOpen,
    setDisabledScopesOpen,
    renderDisabledScopes,
    getProgress,
    tutorialDisabledGuidanceRowsFn,
    focusTutorialScopeTargetFn,
    focusTutorialTargetFn,
    clearTutorialContextDisabledFn,
    clearTutorialScopeDisabledFn,
    saveProgress,
    render,
    continueTutorialOnPage
  });
  bindTutorialOverlayDrag({
    handle: documentTarget?.getElementById?.("tutorial-overlay-handle") || null,
    overlay,
    overlayDrag,
    body: documentTarget?.body || null,
    addWindowListener: (type, handler, options) => windowTarget?.addEventListener?.(type, handler, options),
    setTutorialOverlayPositionFn: payload => setOverlayPosition(payload.left, payload.top, payload.manual)
  });
  bindTutorialOverlayActions({
    byId: id => documentTarget?.getElementById?.(id) || null,
    getProgress,
    currentStep,
    previousStep,
    tutorialSurfaceState,
    tutorialStepScope,
    tutorialStepSurfaceContext,
    currentSurfaceContext,
    currentSurfacePage,
    continueTutorialOnPage,
    clearTutorialScopeDisabledFn,
    clearTutorialContextDisabledFn,
    saveProgress,
    render,
    advance,
    byTarget,
    fillForm,
    submitTutorialForm,
    isComplete,
    setOverlayManual: value => {
      overlayDrag.manual = value;
    },
    restartCurrentChapter,
    restartFromHere,
    focusTutorialTargetFn: focusTutorialTarget,
    disableTutorialOnCurrentScopeFn,
    disableTutorialOnCurrentContextFn,
    setProgress,
    setDisabledScopesOpen,
    api
  });
}

export function startTutorialClientRuntime({
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null,
  bindProgressObservation = () => {},
  boot = async () => {},
  publishRuntimeState = () => {}
} = {}) {
  bindProgressObservation({
    documentTarget,
    windowTarget,
    scheduleDelayed: (fn, ms) => setTimeout(fn, ms),
    scheduleRecurring: (fn, ms) => setInterval(fn, ms)
  });
  void boot({ publishRuntimeState });
}
