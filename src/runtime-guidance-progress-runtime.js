export function renderTutorialProgressRuntimeFactory() {
  return String.raw`
    const advanceTutorialProgress = ${advanceTutorialProgress.toString()};
    const maybeAdvanceTutorialProgress = ${maybeAdvanceTutorialProgress.toString()};
    const alignTutorialProgressToAppPage = ${alignTutorialProgressToAppPage.toString()};
    const clearTutorialReplayForInteraction = ${clearTutorialReplayForInteraction.toString()};
    const bootTutorialProgressRuntime = ${bootTutorialProgressRuntime.toString()};
    const bindTutorialProgressObservation = ${bindTutorialProgressObservation.toString()};
    const createTutorialProgressRuntime = ${createTutorialProgressRuntime.toString()};
  `;
}

export async function advanceTutorialProgress({
  tutorial = { steps: [] },
  currentStepIndex = () => -1,
  getProgress = () => null,
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  const progress = getProgress();
  if (!progress) return false;
  const index = currentStepIndex();
  const next = tutorial.steps[index + 1] || null;
  if (!next) {
    await saveProgress({ ...progress, chapterStatus: "completed", completedAt: new Date().toISOString(), hidden: false, replayScopeKey: null });
  } else {
    await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: "in_progress", completedAt: null, hidden: false, replayScopeKey: null });
  }
  render();
  return true;
}

export async function maybeAdvanceTutorialProgress({
  getProgress = () => null,
  currentStep = () => null,
  tutorialReplayStepIdFn = () => null,
  isComplete = async () => false,
  advanceTutorialProgressFn = async () => false
} = {}) {
  let progress = getProgress();
  let step = currentStep();
  while (progress && step && !progress.hidden && !progress.completedAt && step.page === "app" && tutorialReplayStepIdFn(progress) !== step.id && await isComplete(step)) {
    await advanceTutorialProgressFn();
    progress = getProgress();
    step = currentStep();
  }
}

export async function alignTutorialProgressToAppPage({
  tutorial = { steps: [] },
  getProgress = () => null,
  currentStep = () => null,
  currentStepIndex = () => -1,
  saveProgress = async current => current
} = {}) {
  let progress = getProgress();
  let step = currentStep();
  while (progress && step && !progress.completedAt && step.page !== "app") {
    const next = tutorial.steps[currentStepIndex() + 1] || null;
    if (!next || next.page !== "app") break;
    await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: "in_progress", completedAt: null, replayScopeKey: null });
    progress = getProgress();
    step = currentStep();
  }
}

export async function clearTutorialReplayForInteraction({
  eventTarget = null,
  getProgress = () => null,
  setProgress = () => {},
  currentStep = () => null,
  tutorialReplayStepIdFn = () => null,
  byTarget = () => null,
  normalizeProgressFn = value => value,
  api = async () => {}
} = {}) {
  const progress = getProgress();
  const step = currentStep();
  const replayStepId = tutorialReplayStepIdFn(progress);
  if (!step || replayStepId !== step.id) return false;
  const target = step.target ? byTarget(step.target) : null;
  const element = eventTarget?.nodeType === 1 ? eventTarget : eventTarget?.parentElement || null;
  if (!target || !element) return false;
  if (!(element === target
    || target.contains(element)
    || element.closest?.('[data-guidance-target="' + CSS.escape(step.target) + '"], [data-tutorial-target="' + CSS.escape(step.target) + '"]'))) return false;
  const next = normalizeProgressFn({ ...progress, replayScopeKey: null });
  setProgress(next);
  await api("PUT", next).catch(() => {});
  return true;
}

export async function bootTutorialProgressRuntime({
  api = async () => ({}),
  normalizeProgressFn = value => value,
  setProgress = () => {},
  alignProgressToAppPageFn = async () => {},
  render = () => {},
  requestMaybeAdvanceFn = async () => {},
  publishRuntimeState = () => {}
} = {}) {
  const data = await api("GET");
  setProgress(normalizeProgressFn(data.progress));
  await alignProgressToAppPageFn();
  render();
  await requestMaybeAdvanceFn();
  render();
  publishRuntimeState();
}

export function bindTutorialProgressObservation({
  documentTarget = null,
  windowTarget = null,
  clearReplayForInteractionFn = async () => false,
  requestMaybeAdvanceFn = async () => {},
  render = () => {},
  scheduleDelayed = (fn, ms) => setTimeout(fn, ms),
  scheduleRecurring = (fn, ms) => setInterval(fn, ms)
} = {}) {
  const clickHandler = event => {
    void clearReplayForInteractionFn(event?.target || null).catch(() => {});
    scheduleDelayed(() => requestMaybeAdvanceFn().catch(() => {}), 150);
  };
  const submitHandler = event => {
    void clearReplayForInteractionFn(event?.target || null).catch(() => {});
    scheduleDelayed(() => requestMaybeAdvanceFn().catch(() => {}), 150);
  };
  documentTarget?.addEventListener?.("click", clickHandler);
  documentTarget?.addEventListener?.("submit", submitHandler, true);
  windowTarget?.addEventListener?.("resize", render);
  windowTarget?.addEventListener?.("scroll", render, { passive: true });
  const intervalId = scheduleRecurring(() => { void requestMaybeAdvanceFn().catch(() => {}); }, 1200);
  return { clickHandler, submitHandler, intervalId };
}

export function createTutorialProgressRuntime({
  tutorial = { steps: [] },
  getProgress = () => null,
  setProgress = () => {},
  currentStep = () => null,
  currentStepIndex = () => -1,
  tutorialReplayStepIdFn = () => null,
  byTarget = () => null,
  normalizeProgressFn = value => value,
  api = async () => {},
  saveProgress = async current => current,
  render = () => {},
  isComplete = async () => false
} = {}) {
  let maybeAdvanceRunning = false;
  let maybeAdvanceQueued = false;

  const advance = () => advanceTutorialProgress({
    tutorial,
    currentStepIndex,
    getProgress,
    saveProgress,
    render
  });

  const maybeAdvance = () => maybeAdvanceTutorialProgress({
    getProgress,
    currentStep,
    tutorialReplayStepIdFn,
    isComplete,
    advanceTutorialProgressFn: advance
  });

  const requestMaybeAdvance = async () => {
    if (maybeAdvanceRunning) {
      maybeAdvanceQueued = true;
      return;
    }
    maybeAdvanceRunning = true;
    try {
      do {
        maybeAdvanceQueued = false;
        await maybeAdvance();
      } while (maybeAdvanceQueued);
    } finally {
      maybeAdvanceRunning = false;
    }
  };

  const alignProgressToAppPage = () => alignTutorialProgressToAppPage({
    tutorial,
    getProgress,
    currentStep,
    currentStepIndex,
    saveProgress
  });

  const clearReplayForInteraction = eventTarget => clearTutorialReplayForInteraction({
    eventTarget,
    getProgress,
    setProgress,
    currentStep,
    tutorialReplayStepIdFn,
    byTarget,
    normalizeProgressFn,
    api
  });

  const boot = ({ publishRuntimeState = () => {} } = {}) => bootTutorialProgressRuntime({
    api,
    normalizeProgressFn,
    setProgress,
    alignProgressToAppPageFn: alignProgressToAppPage,
    render,
    requestMaybeAdvanceFn: requestMaybeAdvance,
    publishRuntimeState
  });

  const bindProgressObservation = ({
    documentTarget = null,
    windowTarget = null,
    scheduleDelayed = (fn, ms) => setTimeout(fn, ms),
    scheduleRecurring = (fn, ms) => setInterval(fn, ms)
  } = {}) => bindTutorialProgressObservation({
    documentTarget,
    windowTarget,
    clearReplayForInteractionFn: clearReplayForInteraction,
    requestMaybeAdvanceFn: requestMaybeAdvance,
    render,
    scheduleDelayed,
    scheduleRecurring
  });

  return {
    advance,
    requestMaybeAdvance,
    alignProgressToAppPage,
    clearReplayForInteraction,
    boot,
    bindProgressObservation
  };
}
