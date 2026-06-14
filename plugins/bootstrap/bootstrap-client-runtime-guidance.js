export function renderBootstrapClientRuntimeGuidanceFactory() {
  return String.raw`
    const createBootstrapNoopGuidanceRuntime = ${createBootstrapNoopGuidanceRuntime.toString()};
    const createBootstrapClientRuntimeGuidance = ${createBootstrapClientRuntimeGuidance.toString()};
  `;
}

export function createBootstrapNoopGuidanceRuntime() {
  return {
    guidanceState: null,
    tutorialState: null,
    currentSuggestions: () => [],
    guidanceStep: () => null,
    tutorialStep: () => null,
    guidanceDisabledPages: () => [],
    tutorialDisabledPages: () => [],
    guidanceDisabledScopeKeys: () => [],
    tutorialDisabledScopeKeys: () => [],
    guidanceDisabledContextIds: () => [],
    tutorialDisabledContextIds: () => [],
    guidanceReplayStepId: () => null,
    tutorialReplayStepId: () => null,
    guidanceReplayScopeKey: () => null,
    tutorialReplayScopeKey: () => null,
    guidanceStepScope: () => null,
    tutorialStepScope: () => null,
    guidanceStepConcepts: () => [],
    tutorialStepConcepts: () => [],
    guidanceRevealedConcepts: () => [],
    tutorialRevealedConcepts: () => [],
    guidanceSurfaceState: () => ({ kind: "idle" }),
    tutorialSurfaceState: () => ({ kind: "idle" }),
    loadGuidanceProgress: async () => null,
    loadTutorialProgress: async () => null,
    continueGuidanceOnPage: async () => {},
    openAppHome: async () => {},
    continueTutorialOnPage: async () => {},
    renderGuidanceCard: () => {},
    renderTutorialCard: () => {},
    renderGuidanceOverlay: () => {},
    renderTutorialOverlay: () => {},
    requestMaybeAdvanceGuidance: async () => {},
    requestMaybeAdvanceTutorial: async () => {},
    bindGuidanceInteractions() {},
    bindTutorialInteractions() {}
  };
}

export function createBootstrapClientRuntimeGuidance({
  guidance = null,
  tutorial = null,
  state = {},
  currentSurfacePage = "bootstrap",
  request = async () => ({}),
  byId = () => null,
  renderPage = () => {},
  getAppReady = () => false,
  refresh = async () => {},
  setBootstrapStatus = () => {},
  currentHref = () => "",
  currentPathname = () => "",
  assign = () => {},
  reload = () => {},
  escapeHtml = value => String(value),
  byTarget = () => null,
  setStatus = () => {},
  formField = () => null,
  sleep = () => Promise.resolve(),
  createBootstrapGuidanceRuntimeFn = typeof createBootstrapGuidanceRuntime === "function" ? createBootstrapGuidanceRuntime : null
} = {}) {
  const activeGuidance = guidance ?? tutorial ?? null;
  const localProgressKey = activeGuidance?.id
    ? "witness.guidance." + activeGuidance.id
    : "witness.guidance.bootstrap";
  const legacyLocalProgressKey = activeGuidance?.id
    ? "witness.tutorial." + activeGuidance.id
    : "witness.tutorial.bootstrap";
  const stepIndex = new Map((activeGuidance?.steps || []).map((step, index) => [step.id, index]));
  const autoCompletableChapters = new Set(["widgets", "program", "routes"]);
  const guidanceRuntime = activeGuidance && typeof createBootstrapGuidanceRuntimeFn === "function"
    ? createBootstrapGuidanceRuntimeFn({
        guidance: activeGuidance,
        tutorial: activeGuidance,
        state,
        stepIndex,
        currentSurfacePage,
        localProgressKey,
        legacyLocalProgressKey,
        request,
        byId,
        renderPage,
        getAppReady,
        refresh,
        setBootstrapStatus,
        currentHref,
        currentPathname,
        assign,
        reload,
        autoCompletableChapters,
        escapeHtml,
        byTarget,
        setStatus,
        formField,
        sleep
      })
    : createBootstrapNoopGuidanceRuntime();

  return {
    guidance: activeGuidance,
    guidanceRuntime,
    currentSuggestions: guidanceRuntime.currentSuggestions ?? (() => []),
    guidanceState: guidanceRuntime.guidanceState ?? guidanceRuntime.tutorialState ?? null,
    tutorialState: guidanceRuntime.tutorialState ?? guidanceRuntime.guidanceState ?? null,
    guidanceStep: guidanceRuntime.guidanceStep ?? guidanceRuntime.tutorialStep ?? (() => null),
    tutorialStep: guidanceRuntime.tutorialStep ?? guidanceRuntime.guidanceStep ?? (() => null),
    guidanceDisabledPages: guidanceRuntime.guidanceDisabledPages ?? guidanceRuntime.tutorialDisabledPages ?? (() => []),
    tutorialDisabledPages: guidanceRuntime.tutorialDisabledPages ?? guidanceRuntime.guidanceDisabledPages ?? (() => []),
    guidanceDisabledScopeKeys: guidanceRuntime.guidanceDisabledScopeKeys ?? guidanceRuntime.tutorialDisabledScopeKeys ?? (() => []),
    tutorialDisabledScopeKeys: guidanceRuntime.tutorialDisabledScopeKeys ?? guidanceRuntime.guidanceDisabledScopeKeys ?? (() => []),
    guidanceDisabledContextIds: guidanceRuntime.guidanceDisabledContextIds ?? guidanceRuntime.tutorialDisabledContextIds ?? (() => []),
    guidanceReplayStepId: guidanceRuntime.guidanceReplayStepId ?? guidanceRuntime.tutorialReplayStepId ?? (() => null),
    tutorialReplayStepId: guidanceRuntime.tutorialReplayStepId ?? guidanceRuntime.guidanceReplayStepId ?? (() => null),
    guidanceReplayScopeKey: guidanceRuntime.guidanceReplayScopeKey ?? guidanceRuntime.tutorialReplayScopeKey ?? (() => null),
    tutorialReplayScopeKey: guidanceRuntime.tutorialReplayScopeKey ?? guidanceRuntime.guidanceReplayScopeKey ?? (() => null),
    guidanceStepScope: guidanceRuntime.guidanceStepScope ?? guidanceRuntime.tutorialStepScope ?? (() => null),
    tutorialStepScope: guidanceRuntime.tutorialStepScope ?? guidanceRuntime.guidanceStepScope ?? (() => null),
    guidanceStepConcepts: guidanceRuntime.guidanceStepConcepts ?? guidanceRuntime.tutorialStepConcepts ?? (() => []),
    tutorialStepConcepts: guidanceRuntime.tutorialStepConcepts ?? guidanceRuntime.guidanceStepConcepts ?? (() => []),
    guidanceRevealedConcepts: guidanceRuntime.guidanceRevealedConcepts ?? guidanceRuntime.tutorialRevealedConcepts ?? (() => []),
    tutorialRevealedConcepts: guidanceRuntime.tutorialRevealedConcepts ?? guidanceRuntime.guidanceRevealedConcepts ?? (() => []),
    guidanceSurfaceState: guidanceRuntime.guidanceSurfaceState ?? guidanceRuntime.tutorialSurfaceState ?? (() => ({ kind: "idle" })),
    tutorialSurfaceState: guidanceRuntime.tutorialSurfaceState ?? guidanceRuntime.guidanceSurfaceState ?? (() => ({ kind: "idle" })),
    loadGuidanceProgress: guidanceRuntime.loadGuidanceProgress ?? guidanceRuntime.loadTutorialProgress ?? (async () => null),
    loadTutorialProgress: guidanceRuntime.loadTutorialProgress ?? guidanceRuntime.loadGuidanceProgress ?? (async () => null),
    openAppHome: guidanceRuntime.openAppHome ?? (async () => {}),
    continueGuidanceOnPage: guidanceRuntime.continueGuidanceOnPage ?? guidanceRuntime.continueTutorialOnPage ?? (async () => {}),
    continueTutorialOnPage: guidanceRuntime.continueTutorialOnPage ?? guidanceRuntime.continueGuidanceOnPage ?? (async () => {}),
    renderGuidanceCard: guidanceRuntime.renderGuidanceCard ?? guidanceRuntime.renderTutorialCard ?? (() => {}),
    renderTutorialCard: guidanceRuntime.renderTutorialCard ?? guidanceRuntime.renderGuidanceCard ?? (() => {}),
    renderGuidanceOverlay: guidanceRuntime.renderGuidanceOverlay ?? guidanceRuntime.renderTutorialOverlay ?? (() => {}),
    renderTutorialOverlay: guidanceRuntime.renderTutorialOverlay ?? guidanceRuntime.renderGuidanceOverlay ?? (() => {}),
    requestMaybeAdvanceGuidance: guidanceRuntime.requestMaybeAdvanceGuidance ?? guidanceRuntime.requestMaybeAdvanceTutorial ?? (async () => {}),
    requestMaybeAdvanceTutorial: guidanceRuntime.requestMaybeAdvanceTutorial ?? guidanceRuntime.requestMaybeAdvanceGuidance ?? (async () => {}),
    bindGuidanceInteractions: guidanceRuntime.bindGuidanceInteractions ?? guidanceRuntime.bindTutorialInteractions ?? (() => {}),
    bindTutorialInteractions: guidanceRuntime.bindTutorialInteractions ?? guidanceRuntime.bindGuidanceInteractions ?? (() => {})
  };
}
