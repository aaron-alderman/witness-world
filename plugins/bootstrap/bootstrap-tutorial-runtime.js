export function renderBootstrapTutorialRuntimeFactory() {
  return String.raw`
    const createBootstrapTutorialRuntime = ${createBootstrapTutorialRuntime.toString()};
  `;
}

export function createBootstrapTutorialRuntime({
  tutorial = { steps: [] },
  state = {},
  stepIndex = new Map(),
  currentSurfacePage = "bootstrap",
  localProgressKey = "witness.tutorial.bootstrap",
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
  createTutorialStateRuntimeFn = createBootstrapTutorialStateRuntime,
  createTutorialControllerFn = createBootstrapTutorialController,
  openBootstrapAppHomeFn = openBootstrapAppHome,
  continueBootstrapTutorialOnPageFn = continueBootstrapTutorialOnPage
} = {}) {
  const revealTarget = target => {
    let current = target?.parentElement || null;
    while (current) {
      if (current.tagName === "DETAILS") current.open = true;
      current = current.parentElement;
    }
  };

  const tutorialState = createTutorialStateRuntimeFn({
    tutorial,
    state,
    stepIndex,
    currentSurfacePage,
    localProgressKey,
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

  const tutorialController = createTutorialControllerFn({
    tutorial,
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
    tutorialState
  });
  advanceTutorialRef = tutorialController.advanceTutorial;

  return {
    ...tutorialState,
    ...tutorialController,
    revealTarget,
    openAppHome,
    continueTutorialOnPage
  };
}
