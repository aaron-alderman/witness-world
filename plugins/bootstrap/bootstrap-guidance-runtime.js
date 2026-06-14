export function renderBootstrapGuidanceRuntimeFactory() {
  return String.raw`
    const createBootstrapGuidanceRuntime = ${createBootstrapGuidanceRuntime.toString()};
    const createBootstrapTutorialRuntime = createBootstrapGuidanceRuntime;
  `;
}

export function createBootstrapGuidanceRuntime({
  guidance = { steps: [] },
  tutorial,
  state = {},
  stepIndex = new Map(),
  currentSurfacePage = "bootstrap",
  localProgressKey = "witness.guidance.bootstrap",
  legacyLocalProgressKey = "witness.tutorial.bootstrap",
  request = async () => ({}),
  byId = () => null,
  renderPage = () => {},
  getAppReady = () => false,
  refresh = async () => {},
  setBootstrapStatus = () => {},
  currentHref = () => "http://bootstrap.local/_bootstrap",
  currentPathname = () => "/_bootstrap",
  assign = () => {},
  reload = () => {},
  autoCompletableChapters = new Set(),
  escapeHtml = value => String(value),
  byTarget = () => null,
  setStatus = () => {},
  formField = () => null,
  sleep = () => Promise.resolve(),
  createGuidanceStateRuntimeFn = null,
  createTutorialStateRuntimeFn = null,
  createGuidanceControllerFn = null,
  createTutorialControllerFn = null,
  openBootstrapAppHomeFn = openBootstrapAppHome,
  continueBootstrapGuidanceOnPageFn = continueBootstrapGuidanceOnPage,
  continueBootstrapTutorialOnPageFn = continueBootstrapGuidanceOnPageFn
} = {}) {
  const activeGuidance = guidance && typeof guidance === "object"
    ? guidance
    : (tutorial && typeof tutorial === "object" ? tutorial : { steps: [] });
  const revealTarget = target => {
    let current = target?.parentElement || null;
    while (current) {
      if (current.tagName === "DETAILS") current.open = true;
      current = current.parentElement;
    }
  };

  const buildGuidanceStateRuntime = createGuidanceStateRuntimeFn
    ?? createTutorialStateRuntimeFn
    ?? (typeof createBootstrapGuidanceStateRuntime === "function" ? createBootstrapGuidanceStateRuntime : null)
    ?? (typeof createBootstrapTutorialStateRuntime === "function" ? createBootstrapTutorialStateRuntime : null);
  if (typeof buildGuidanceStateRuntime !== "function") {
    throw new Error("bootstrap guidance state runtime is unavailable");
  }
  const guidanceState = buildGuidanceStateRuntime({
    tutorial: activeGuidance,
    guidance: activeGuidance,
    state,
    stepIndex,
    currentSurfacePage,
    localProgressKey,
    legacyLocalProgressKey,
    request,
    byId,
    renderPage
  });

  let advanceTutorialRef = async () => {};
  const openAppHome = ({ href = byId("open-app-link")?.href || "/", advance = false } = {}) => openBootstrapAppHomeFn({
    href,
    advance,
    currentSurfacePage,
    getAppReady,
    refresh,
    setBootstrapStatus,
    advanceTutorial: (...args) => advanceTutorialRef(...args),
    currentHref: currentHref(),
    assign,
    reload
  });
  const continueTutorialOnPage = page => continueBootstrapTutorialOnPageFn({
    page,
    openAppHome,
    currentHref: currentHref(),
    currentPathname: currentPathname(),
    assign,
    reload
  });

  const buildGuidanceController = createGuidanceControllerFn
    ?? createTutorialControllerFn
    ?? (typeof createBootstrapGuidanceController === "function" ? createBootstrapGuidanceController : null)
    ?? (typeof createBootstrapTutorialController === "function" ? createBootstrapTutorialController : null);
  if (typeof buildGuidanceController !== "function") {
    throw new Error("bootstrap guidance controller runtime is unavailable");
  }
  const guidanceController = buildGuidanceController({
    tutorial: activeGuidance,
    guidance: activeGuidance,
    state,
    currentSurfacePage,
    autoCompletableChapters,
    escapeHtml,
    byId,
    byTarget,
    setStatus,
    formField,
    sleep,
    revealTarget,
    renderPage,
    openAppHome,
    continueTutorialOnPage,
    tutorialState: guidanceState,
    guidanceState
  });
  advanceTutorialRef = guidanceController.advanceTutorial;

  return {
    ...guidanceState,
    ...guidanceController,
    guidanceState,
    tutorialState: guidanceState,
    guidanceController,
    tutorialController: guidanceController,
    guidanceStep: guidanceState.guidanceStep ?? guidanceState.tutorialStep,
    guidanceDisabledPages: guidanceState.guidanceDisabledPages ?? guidanceState.tutorialDisabledPages,
    guidanceDisabledScopeKeys: guidanceState.guidanceDisabledScopeKeys ?? guidanceState.tutorialDisabledScopeKeys,
    guidanceDisabledContextIds: guidanceState.guidanceDisabledContextIds ?? guidanceState.tutorialDisabledContextIds,
    guidanceReplayStepId: guidanceState.guidanceReplayStepId ?? guidanceState.tutorialReplayStepId,
    guidanceReplayScopeKey: guidanceState.guidanceReplayScopeKey ?? guidanceState.tutorialReplayScopeKey,
    guidanceStepScope: guidanceState.guidanceStepScope ?? guidanceState.tutorialStepScope,
    guidanceStepConcepts: guidanceState.guidanceStepConcepts ?? guidanceState.tutorialStepConcepts,
    guidanceRevealedConcepts: guidanceState.guidanceRevealedConcepts ?? guidanceState.tutorialRevealedConcepts,
    guidanceSurfaceState: guidanceState.guidanceSurfaceState ?? guidanceState.tutorialSurfaceState,
    loadGuidanceProgress: guidanceState.loadGuidanceProgress ?? guidanceState.loadTutorialProgress,
    continueGuidanceOnPage: continueTutorialOnPage,
    renderGuidanceCard: guidanceController.renderGuidanceCard ?? guidanceController.renderTutorialCard,
    renderGuidanceOverlay: guidanceController.renderGuidanceOverlay ?? guidanceController.renderTutorialOverlay,
    requestMaybeAdvanceGuidance: guidanceController.requestMaybeAdvanceGuidance ?? guidanceController.requestMaybeAdvanceTutorial,
    bindGuidanceInteractions: guidanceController.bindGuidanceInteractions ?? guidanceController.bindTutorialInteractions,
    revealTarget,
    openAppHome,
    continueTutorialOnPage
  };
}

export const renderBootstrapTutorialRuntimeFactory = renderBootstrapGuidanceRuntimeFactory;
export const createBootstrapTutorialRuntime = createBootstrapGuidanceRuntime;
