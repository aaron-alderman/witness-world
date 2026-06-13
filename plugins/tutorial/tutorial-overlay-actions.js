export function renderTutorialOverlayActionsFactory() {
  return String.raw`
    const runTutorialResumeAction = ${runTutorialResumeAction.toString()};
    const runTutorialNextAction = ${runTutorialNextAction.toString()};
    const runTutorialBackAction = ${runTutorialBackAction.toString()};
    const runTutorialRestartChapterAction = ${runTutorialRestartChapterAction.toString()};
    const runTutorialRestartStepAction = ${runTutorialRestartStepAction.toString()};
    const runTutorialShowCurrentControlAction = ${runTutorialShowCurrentControlAction.toString()};
    const runTutorialDisablePageAction = ${runTutorialDisablePageAction.toString()};
    const runTutorialDisableContextAction = ${runTutorialDisableContextAction.toString()};
    const runTutorialExitAction = ${runTutorialExitAction.toString()};
    const runTutorialResetAction = ${runTutorialResetAction.toString()};
    const bindTutorialOverlayActions = ${bindTutorialOverlayActions.toString()};
  `;
}

export async function runTutorialResumeAction({
  progress = null,
  tutorialSurfaceState = () => ({ kind: "active" }),
  tutorialStepScope = () => null,
  currentStep = () => null,
  tutorialStepSurfaceContext = () => null,
  currentSurfaceContext = null,
  continueTutorialOnPage = async () => {},
  clearTutorialScopeDisabledFn = (current, scopeKey) => ({ ...current, scopeKey }),
  clearTutorialContextDisabledFn = (current, contextId) => ({ ...current, contextId }),
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  if (!progress) return false;
  const surface = tutorialSurfaceState();
  if (surface.kind === "offpage") {
    await continueTutorialOnPage(surface.page);
    return true;
  }
  if (surface.kind === "disabled") {
    await saveProgress(clearTutorialScopeDisabledFn(progress, surface.scopeKey || tutorialStepScope(currentStep())?.key));
  } else if (surface.kind === "disabled-context") {
    await saveProgress(clearTutorialContextDisabledFn(progress, surface.contextId || tutorialStepSurfaceContext(currentStep())?.id || currentSurfaceContext));
  } else {
    await saveProgress({ ...progress, hidden: false, replayScopeKey: null });
  }
  render();
  return true;
}

export async function runTutorialNextAction({
  currentStep = () => null,
  advance = async () => {},
  byTarget = () => null,
  fillForm = () => {},
  progress = null,
  saveProgress = async current => current,
  submitTutorialForm = async () => false,
  render = () => {}
} = {}) {
  const step = currentStep();
  if (!step) return false;
  if (step.completeWhen?.kind === "manualAdvance") {
    await advance();
    return true;
  }
  const target = step.target ? byTarget(step.target) : null;
  if (step.payload && target) {
    fillForm(target, step.payload);
    await saveProgress({ ...progress, draftInputs: step.payload, hidden: false, replayScopeKey: null });
    const submitted = await submitTutorialForm(target);
    if (!submitted) render();
    return true;
  }
  return false;
}

export async function runTutorialBackAction({
  previousStep = () => null,
  progress = null,
  isComplete = async () => false,
  tutorialStepScope = () => null,
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  const step = previousStep();
  if (!step || !progress) return false;
  await saveProgress({
    ...progress,
    chapterId: step.chapterId,
    stepId: step.id,
    completedAt: null,
    hidden: false,
    replayScopeKey: await isComplete(step) ? (tutorialStepScope(step)?.key || null) : null
  });
  render();
  return true;
}

export async function runTutorialRestartChapterAction({
  setOverlayManual = () => {},
  restartCurrentChapter = async () => {}
} = {}) {
  setOverlayManual(false);
  await restartCurrentChapter();
  return true;
}

export async function runTutorialRestartStepAction({
  setOverlayManual = () => {},
  restartFromHere = async () => {}
} = {}) {
  setOverlayManual(false);
  await restartFromHere();
  return true;
}

export function runTutorialShowCurrentControlAction({
  currentStep = () => null,
  focusTutorialTargetFn = () => {}
} = {}) {
  const step = currentStep();
  if (!step?.target) return false;
  focusTutorialTargetFn(step.target);
  return true;
}

export async function runTutorialDisablePageAction({
  progress = null,
  currentStep = () => null,
  currentSurfacePage = "app",
  disableTutorialOnCurrentScopeFn = current => current,
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  const step = currentStep();
  if (!progress || !step || step.page !== currentSurfacePage) return false;
  await saveProgress(disableTutorialOnCurrentScopeFn(progress));
  render();
  return true;
}

export async function runTutorialDisableContextAction({
  progress = null,
  currentStep = () => null,
  currentSurfacePage = "app",
  currentSurfaceContext = null,
  disableTutorialOnCurrentContextFn = current => current,
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  const step = currentStep();
  if (!progress || !step || step.page !== currentSurfacePage || !currentSurfaceContext) return false;
  await saveProgress(disableTutorialOnCurrentContextFn(progress));
  render();
  return true;
}

export async function runTutorialExitAction({
  progress = null,
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  if (!progress) return false;
  await saveProgress({ ...progress, hidden: true, replayScopeKey: null });
  render();
  return true;
}

export async function runTutorialResetAction({
  setOverlayManual = () => {},
  setProgress = () => {},
  setDisabledScopesOpen = () => {},
  api = async () => {},
  render = () => {}
} = {}) {
  setOverlayManual(false);
  setProgress(null);
  setDisabledScopesOpen(false);
  await api("DELETE");
  render();
  return true;
}

export function bindTutorialOverlayActions({
  byId = () => null,
  getProgress = () => null,
  currentStep = () => null,
  previousStep = () => null,
  tutorialSurfaceState = () => ({ kind: "active" }),
  tutorialStepScope = () => null,
  tutorialStepSurfaceContext = () => null,
  currentSurfaceContext = null,
  currentSurfacePage = "app",
  continueTutorialOnPage = async () => {},
  clearTutorialScopeDisabledFn = (current, scopeKey) => ({ ...current, scopeKey }),
  clearTutorialContextDisabledFn = (current, contextId) => ({ ...current, contextId }),
  saveProgress = async current => current,
  render = () => {},
  advance = async () => {},
  byTarget = () => null,
  fillForm = () => {},
  submitTutorialForm = async () => false,
  isComplete = async () => false,
  setOverlayManual = () => {},
  restartCurrentChapter = async () => {},
  restartFromHere = async () => {},
  focusTutorialTargetFn = () => {},
  disableTutorialOnCurrentScopeFn = current => current,
  disableTutorialOnCurrentContextFn = current => current,
  setProgress = () => {},
  setDisabledScopesOpen = () => {},
  api = async () => {}
} = {}) {
  byId("tutorial-resume-page")?.addEventListener?.("click", () => {
    void runTutorialResumeAction({
      progress: getProgress(),
      tutorialSurfaceState,
      tutorialStepScope,
      currentStep,
      tutorialStepSurfaceContext,
      currentSurfaceContext,
      continueTutorialOnPage,
      clearTutorialScopeDisabledFn,
      clearTutorialContextDisabledFn,
      saveProgress,
      render
    });
  });
  byId("tutorial-next")?.addEventListener?.("click", () => {
    void runTutorialNextAction({
      currentStep,
      advance,
      byTarget,
      fillForm,
      progress: getProgress(),
      saveProgress,
      submitTutorialForm,
      render
    });
  });
  byId("tutorial-back")?.addEventListener?.("click", () => {
    void runTutorialBackAction({
      previousStep,
      progress: getProgress(),
      isComplete,
      tutorialStepScope,
      saveProgress,
      render
    });
  });
  byId("tutorial-restart-chapter")?.addEventListener?.("click", () => {
    void runTutorialRestartChapterAction({
      setOverlayManual,
      restartCurrentChapter
    });
  });
  byId("tutorial-restart-step")?.addEventListener?.("click", () => {
    void runTutorialRestartStepAction({
      setOverlayManual,
      restartFromHere
    });
  });
  byId("tutorial-show-current-control")?.addEventListener?.("click", () => {
    runTutorialShowCurrentControlAction({
      currentStep,
      focusTutorialTargetFn
    });
  });
  byId("tutorial-disable-page")?.addEventListener?.("click", () => {
    void runTutorialDisablePageAction({
      progress: getProgress(),
      currentStep,
      currentSurfacePage,
      disableTutorialOnCurrentScopeFn,
      saveProgress,
      render
    });
  });
  byId("tutorial-disable-context")?.addEventListener?.("click", () => {
    void runTutorialDisableContextAction({
      progress: getProgress(),
      currentStep,
      currentSurfacePage,
      currentSurfaceContext,
      disableTutorialOnCurrentContextFn,
      saveProgress,
      render
    });
  });
  byId("tutorial-exit")?.addEventListener?.("click", () => {
    void runTutorialExitAction({
      progress: getProgress(),
      saveProgress,
      render
    });
  });
  byId("tutorial-reset")?.addEventListener?.("click", () => {
    void runTutorialResetAction({
      setOverlayManual,
      setProgress,
      setDisabledScopesOpen,
      api,
      render
    });
  });
}
