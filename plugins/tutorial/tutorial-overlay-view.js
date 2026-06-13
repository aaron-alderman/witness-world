export function renderTutorialOverlayViewFactory() {
  return String.raw`
    const renderTutorialConceptList = ${renderTutorialConceptList.toString()};
    const renderTutorialDisabledScopesPanel = ${renderTutorialDisabledScopesPanel.toString()};
    const renderTutorialOverlayView = ${renderTutorialOverlayView.toString()};
    const publishTutorialRuntimeState = ${publishTutorialRuntimeState.toString()};
  `;
}

export function renderTutorialConceptList({
  root = null,
  concepts = [],
  emptyText = "",
  document = globalThis?.document || null
} = {}) {
  if (!root) return;
  root.innerHTML = "";
  if (!concepts.length) {
    const empty = document?.createElement?.("div");
    const copy = document?.createElement?.("span");
    if (!empty || !copy) return;
    empty.className = "tutorial-concept";
    copy.textContent = emptyText;
    empty.append(copy);
    root.append(empty);
    return;
  }
  for (const concept of concepts) {
    const item = document?.createElement?.("div");
    const title = document?.createElement?.("strong");
    const summary = document?.createElement?.("span");
    if (!item || !title || !summary) continue;
    item.className = "tutorial-concept";
    title.textContent = concept.label;
    summary.textContent = concept.summary;
    item.append(title, summary);
    root.append(item);
  }
}

export function renderTutorialDisabledScopesPanel({
  progress = null,
  disabledScopesToggle = null,
  disabledScopesPanel = null,
  disabledScopesOpen = false,
  tutorialDisabledGuidanceRowsFn = () => [],
  currentSurfacePage = "app",
  tutorialPageLabel = page => page,
  renderTutorialDisabledScopeRowsFn = () => {},
  document = globalThis?.document || null
} = {}) {
  const rows = tutorialDisabledGuidanceRowsFn(progress);
  const list = document?.getElementById?.("tutorial-disabled-scopes-list") || null;
  const visible = Boolean(progress && !progress.completedAt && rows.length);
  if (disabledScopesToggle) disabledScopesToggle.hidden = !visible;
  if (!visible) {
    if (disabledScopesPanel) disabledScopesPanel.hidden = true;
    if (list) {
      renderTutorialDisabledScopeRowsFn({
        list,
        rows: [],
        currentSurfacePage,
        tutorialPageLabel,
        document
      });
    }
    return false;
  }
  if (list) {
    renderTutorialDisabledScopeRowsFn({
      list,
      rows,
      currentSurfacePage,
      tutorialPageLabel,
      document
    });
  }
  if (disabledScopesPanel) {
    disabledScopesPanel.hidden = !disabledScopesOpen;
    if (disabledScopesOpen) {
      disabledScopesPanel.style.right = "16px";
      disabledScopesPanel.style.left = "auto";
      disabledScopesPanel.style.top = "72px";
    }
  }
  return disabledScopesOpen;
}

export function renderTutorialOverlayView({
  progress = null,
  currentStep = () => null,
  tutorialSurfaceState = () => ({ kind: "idle", page: null }),
  tutorialReplayScopeKeyFn = () => null,
  tutorialPageLabel = page => page,
  tutorialStepConceptsFn = () => [],
  previousStep = () => null,
  firstStepInChapter = () => null,
  currentSurfaceContext = null,
  byTarget = () => null,
  focusScopeFor = target => target,
  clearHighlightFn = () => {},
  positionFn = () => {},
  lastRenderedStepId = null,
  overlay = null,
  dimmer = null,
  resumeButton = null,
  disabledScopesToggle = null,
  disabledScopesPanel = null,
  disabledScopesOpen = false,
  renderTutorialConceptListFn = renderTutorialConceptList,
  renderTutorialDisabledScopesPanelFn = renderTutorialDisabledScopesPanel,
  tutorialDisabledGuidanceRowsFn = () => [],
  currentSurfacePage = "app",
  renderTutorialDisabledScopeRowsFn = () => {},
  document = globalThis?.document || null
} = {}) {
  clearHighlightFn();
  const step = currentStep();
  const surface = tutorialSurfaceState();
  if (!progress || progress.completedAt || !step) {
    if (overlay) overlay.hidden = true;
    if (dimmer) dimmer.hidden = true;
    if (resumeButton) resumeButton.hidden = true;
    if (disabledScopesToggle) disabledScopesToggle.hidden = true;
    if (disabledScopesPanel) disabledScopesPanel.hidden = true;
    return {
      lastRenderedStepId,
      activeHighlightTarget: null,
      activeFocusScope: null,
      disabledScopesOpen
    };
  }
  if (surface.kind === "hidden" || surface.kind === "disabled" || surface.kind === "disabled-context" || surface.kind === "offpage") {
    const disableContextButton = document?.getElementById?.("tutorial-disable-context") || null;
    if (disableContextButton) disableContextButton.hidden = true;
    if (overlay) overlay.hidden = true;
    if (dimmer) dimmer.hidden = true;
    if (resumeButton) {
      resumeButton.hidden = false;
      resumeButton.textContent = surface.kind === "offpage"
        ? ("Continue On " + tutorialPageLabel(surface.page))
        : (surface.kind === "disabled-context" ? "Enable Sourcery In This Context" : (surface.kind === "disabled" ? "Enable Sourcery Here" : "Resume Tutorial"));
    }
    return {
      lastRenderedStepId,
      activeHighlightTarget: null,
      activeFocusScope: null,
      disabledScopesOpen: renderTutorialDisabledScopesPanelFn({
        progress,
        disabledScopesToggle,
        disabledScopesPanel,
        disabledScopesOpen,
        tutorialDisabledGuidanceRowsFn,
        currentSurfacePage,
        tutorialPageLabel,
        renderTutorialDisabledScopeRowsFn,
        document
      })
    };
  }
  if (resumeButton) resumeButton.hidden = true;
  const target = step.target ? byTarget(step.target) : null;
  const scope = focusScopeFor(target);
  if (scope) scope.setAttribute?.("data-tutorial-focus-scope", "true");
  if (target) {
    target.setAttribute?.("data-tutorial-current", "true");
    if (lastRenderedStepId !== step.id) target.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }
  const meta = document?.getElementById?.("tutorial-overlay-meta") || null;
  const title = document?.getElementById?.("tutorial-overlay-title") || null;
  const body = document?.getElementById?.("tutorial-overlay-body") || null;
  const concepts = document?.getElementById?.("tutorial-overlay-concepts") || null;
  const nextButton = document?.getElementById?.("tutorial-next") || null;
  const backButton = document?.getElementById?.("tutorial-back") || null;
  const restartChapterButton = document?.getElementById?.("tutorial-restart-chapter") || null;
  const restartStepButton = document?.getElementById?.("tutorial-restart-step") || null;
  const showCurrentControlButton = document?.getElementById?.("tutorial-show-current-control") || null;
  const disableContextButton = document?.getElementById?.("tutorial-disable-context") || null;
  if (meta) meta.textContent = step.chapterId.toUpperCase();
  if (title) title.textContent = step.title;
  if (body) {
    body.textContent = tutorialReplayScopeKeyFn(progress)
      ? (step.body + " Replaying this scope does not roll back app state.")
      : step.body;
  }
  renderTutorialConceptListFn({
    root: concepts,
    concepts: tutorialStepConceptsFn(step),
    emptyText: "This step keeps working through the visible app without unlocking a new concept.",
    document
  });
  if (nextButton) nextButton.textContent = step.nextLabel || "Next";
  if (backButton) backButton.disabled = !previousStep();
  if (restartChapterButton) restartChapterButton.disabled = !firstStepInChapter(step.chapterId);
  if (restartStepButton) restartStepButton.disabled = false;
  if (showCurrentControlButton) showCurrentControlButton.disabled = !step.target;
  if (disableContextButton) {
    disableContextButton.hidden = !currentSurfaceContext;
    disableContextButton.disabled = !currentSurfaceContext;
  }
  if (dimmer) dimmer.hidden = false;
  if (overlay) overlay.hidden = false;
  positionFn(target);
  return {
    lastRenderedStepId: step.id,
    activeHighlightTarget: target || null,
    activeFocusScope: scope || null,
    disabledScopesOpen: renderTutorialDisabledScopesPanelFn({
      progress,
      disabledScopesToggle,
      disabledScopesPanel,
      disabledScopesOpen,
      tutorialDisabledGuidanceRowsFn,
      currentSurfacePage,
      tutorialPageLabel,
      renderTutorialDisabledScopeRowsFn,
      document
    })
  };
}

export function publishTutorialRuntimeState({
  windowTarget = globalThis?.window || globalThis,
  getProgress = () => null,
  currentStep = () => null,
  tutorialStepScopeFn = () => null,
  tutorialStepConceptsFn = () => [],
  tutorialRevealedConceptsFn = () => [],
  tutorialReplayScopeKeyFn = () => null,
  tutorialReplayStepIdFn = () => null,
  tutorialDisabledScopeKeysFn = () => [],
  tutorialDisabledContextIdsFn = () => [],
  tutorialDisabledPagesFn = () => [],
  getDisabledScopesOpen = () => false,
  currentSurfacePage = "app",
  currentSurfaceContext = null,
  currentSurfaceRouteId = null,
  currentSurfaceRootWidgetId = null,
  currentSurfaceProgramId = null,
  tutorialSurfaceStateFn = () => ({ kind: "idle" })
} = {}) {
  windowTarget.__witnessTutorialApp = {
    get currentStepId() { return getProgress()?.stepId || null; },
    get currentChapterId() { return getProgress()?.chapterId || null; },
    get currentPage() { return currentStep()?.page || null; },
    get currentScopeKey() { return tutorialStepScopeFn(currentStep())?.key || null; },
    get currentConceptIds() { return tutorialStepConceptsFn(currentStep()).map(concept => concept.id); },
    get revealedConceptIds() { return tutorialRevealedConceptsFn(getProgress()).map(concept => concept.id); },
    get replayScopeKey() { return tutorialReplayScopeKeyFn(getProgress()); },
    get replayStepId() { return tutorialReplayStepIdFn(getProgress()); },
    get completedAt() { return getProgress()?.completedAt || null; },
    get hidden() { return getProgress()?.hidden === true; },
    get disabledScopeKeys() { return tutorialDisabledScopeKeysFn(getProgress()); },
    get disabledContextIds() { return tutorialDisabledContextIdsFn(getProgress()); },
    get disabledPages() { return tutorialDisabledPagesFn(getProgress()); },
    get disabledScopesOpen() { return getDisabledScopesOpen(); },
    get surfacePage() { return currentSurfacePage; },
    get surfaceContext() { return currentSurfaceContext; },
    get surfaceRouteId() { return currentSurfaceRouteId; },
    get surfaceRootWidgetId() { return currentSurfaceRootWidgetId; },
    get surfaceProgramId() { return currentSurfaceProgramId; },
    get surfaceStatus() { return tutorialSurfaceStateFn().kind; }
  };
  return windowTarget.__witnessTutorialApp;
}
