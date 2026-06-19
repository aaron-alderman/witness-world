export function renderTutorialClientAdapterFactory() {
  return String.raw`
    const tutorialClientApiRequest = ${tutorialClientApiRequest.toString()};
    const saveTutorialClientProgress = ${saveTutorialClientProgress.toString()};
    const createTutorialClientProgressAdapter = ${createTutorialClientProgressAdapter.toString()};
    const renderTutorialClientDisabledScopes = ${renderTutorialClientDisabledScopes.toString()};
    const renderTutorialClientOverlay = ${renderTutorialClientOverlay.toString()};
    const publishTutorialClientRuntimeSnapshot = ${publishTutorialClientRuntimeSnapshot.toString()};
    const createTutorialClientViewAdapter = ${createTutorialClientViewAdapter.toString()};
  `;
}

export async function tutorialClientApiRequest({
  tutorialId = "",
  method = "GET",
  body = null,
  fetchFn = (...args) => fetch(...args)
} = {}) {
  const options = { method };
  if (body != null) {
    options.headers = { "content-type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await fetchFn("/api/guidance-progress/" + encodeURIComponent(tutorialId), options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "tutorial request failed");
  return data;
}

export async function saveTutorialClientProgress({
  next = null,
  normalizeProgressFn = value => value,
  setProgress = () => {},
  apiRequest = async () => ({})
} = {}) {
  const normalized = normalizeProgressFn(next);
  setProgress(normalized);
  if (!next) {
    await apiRequest({ method: "DELETE" });
    return normalized;
  }
  await apiRequest({ method: "PUT", body: normalized });
  return normalized;
}

export function createTutorialClientProgressAdapter({
  tutorialId = "",
  fetchFn = (...args) => fetch(...args),
  normalizeProgressFn = value => value,
  setProgress = () => {}
} = {}) {
  const api = (method, body = null) => tutorialClientApiRequest({
    tutorialId,
    method,
    body,
    fetchFn
  });
  const saveProgress = next => saveTutorialClientProgress({
    next,
    normalizeProgressFn,
    setProgress,
    apiRequest: ({ method, body = null }) => api(method, body)
  });
  return { api, saveProgress };
}

export function renderTutorialClientDisabledScopes({
  progress = null,
  disabledScopesToggle = null,
  disabledScopesPanel = null,
  disabledScopesOpen = false,
  tutorialDisabledGuidanceRowsFn = () => [],
  tutorialScopeInventoryRowsFn = null,
  currentSurfacePage = "",
  tutorialPageLabel = () => "",
  renderTutorialDisabledScopeRowsFn = () => "",
  documentTarget = globalThis?.document || null
} = {}) {
  return renderTutorialDisabledScopesPanel({
    progress,
    disabledScopesToggle,
    disabledScopesPanel,
    disabledScopesOpen,
    tutorialDisabledGuidanceRowsFn,
    tutorialScopeInventoryRowsFn,
    currentSurfacePage,
    tutorialPageLabel,
    renderTutorialDisabledScopeRowsFn,
    document: documentTarget
  });
}

export function renderTutorialClientOverlay({
  progress = null,
  currentStep = () => null,
  tutorialSurfaceState = () => ({ kind: "" }),
  tutorialReplayScopeKeyFn = () => null,
  tutorialPageLabel = () => "",
  tutorialStepConceptsFn = () => [],
  previousStep = () => null,
  firstStepInChapter = () => null,
  currentSurfaceContext = null,
  byTarget = () => null,
  focusScopeFor = () => null,
  clearHighlightFn = () => {},
  positionFn = () => {},
  lastRenderedStepId = null,
  overlay = null,
  dimmer = null,
  resumeButton = null,
  disabledScopesToggle = null,
  disabledScopesPanel = null,
  disabledScopesOpen = false,
  tutorialDisabledGuidanceRowsFn = () => [],
  tutorialScopeInventoryRowsFn = null,
  currentSurfacePage = "",
  renderTutorialDisabledScopeRowsFn = () => "",
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || globalThis
} = {}) {
  return renderTutorialOverlayView({
    progress,
    currentStep,
    tutorialSurfaceState,
    tutorialReplayScopeKeyFn,
    tutorialPageLabel,
    tutorialStepConceptsFn,
    previousStep,
    firstStepInChapter,
    currentSurfaceContext,
    byTarget,
    focusScopeFor,
    clearHighlightFn,
    positionFn,
    lastRenderedStepId,
    overlay,
    dimmer,
    resumeButton,
    disabledScopesToggle,
    disabledScopesPanel,
    disabledScopesOpen,
    tutorialDisabledGuidanceRowsFn,
    tutorialScopeInventoryRowsFn,
    currentSurfacePage,
    renderTutorialDisabledScopeRowsFn,
    document: documentTarget,
    windowTarget
  });
}

export function publishTutorialClientRuntimeSnapshot({
  windowTarget = globalThis?.window || null,
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
  currentSurfacePage = "",
  currentSurfaceContext = null,
  currentSurfaceRouteId = null,
  currentSurfaceRootWidgetId = null,
  currentSurfaceProgramId = null,
  tutorialSurfaceStateFn = () => ({ kind: "" }),
  tutorialScopeInventoryRowsFn = () => []
} = {}) {
  return publishTutorialRuntimeState({
    windowTarget,
    getProgress,
    currentStep,
    tutorialStepScopeFn,
    tutorialStepConceptsFn,
    tutorialRevealedConceptsFn,
    tutorialReplayScopeKeyFn,
    tutorialReplayStepIdFn,
    tutorialDisabledScopeKeysFn,
    tutorialDisabledContextIdsFn,
    tutorialDisabledPagesFn,
    getDisabledScopesOpen,
    currentSurfacePage,
    currentSurfaceContext,
    currentSurfaceRouteId,
    currentSurfaceRootWidgetId,
    currentSurfaceProgramId,
    tutorialSurfaceStateFn,
    tutorialScopeInventoryRowsFn
  });
}

export function createTutorialClientViewAdapter({
  getProgress = () => null,
  currentStep = () => null,
  tutorialSurfaceState = () => ({ kind: "" }),
  tutorialReplayScopeKeyFn = () => null,
  tutorialPageLabel = () => "",
  tutorialStepConceptsFn = () => [],
  previousStep = () => null,
  firstStepInChapter = () => null,
  currentSurfaceContext = null,
  byTarget = () => null,
  focusScopeFor = () => null,
  clearHighlightFn = () => {},
  positionFn = () => {},
  getLastRenderedStepId = () => null,
  setLastRenderedStepId = () => {},
  overlay = null,
  dimmer = null,
  resumeButton = null,
  disabledScopesToggle = null,
  disabledScopesPanel = null,
  getDisabledScopesOpen = () => false,
  setDisabledScopesOpen = () => {},
  tutorialDisabledGuidanceRowsFn = () => [],
  tutorialScopeInventoryRowsFn = null,
  currentSurfacePage = "",
  renderTutorialDisabledScopeRowsFn = () => "",
  documentTarget = globalThis?.document || null,
  setActiveHighlightTarget = () => {},
  setActiveFocusScope = () => {},
  windowTarget = globalThis?.window || null,
  tutorialStepScopeFn = () => null,
  tutorialRevealedConceptsFn = () => [],
  tutorialReplayStepIdFn = () => null,
  tutorialDisabledScopeKeysFn = () => [],
  tutorialDisabledContextIdsFn = () => [],
  tutorialDisabledPagesFn = () => [],
  currentSurfaceRouteId = null,
  currentSurfaceRootWidgetId = null,
  currentSurfaceProgramId = null
} = {}) {
  const renderDisabledScopes = () => {
    setDisabledScopesOpen(renderTutorialClientDisabledScopes({
      progress: getProgress(),
      disabledScopesToggle,
      disabledScopesPanel,
      disabledScopesOpen: getDisabledScopesOpen(),
      tutorialDisabledGuidanceRowsFn,
      tutorialScopeInventoryRowsFn,
      currentSurfacePage,
      tutorialPageLabel,
      renderTutorialDisabledScopeRowsFn,
      documentTarget
    }));
  };
  const render = () => {
    const nextViewState = renderTutorialClientOverlay({
      progress: getProgress(),
      currentStep,
      tutorialSurfaceState,
      tutorialReplayScopeKeyFn,
      tutorialPageLabel,
      tutorialStepConceptsFn,
      previousStep,
      firstStepInChapter,
      currentSurfaceContext,
      byTarget,
      focusScopeFor,
      clearHighlightFn,
      positionFn,
      lastRenderedStepId: getLastRenderedStepId(),
      overlay,
      dimmer,
      resumeButton,
      disabledScopesToggle,
      disabledScopesPanel,
      disabledScopesOpen: getDisabledScopesOpen(),
      tutorialDisabledGuidanceRowsFn,
      tutorialScopeInventoryRowsFn,
      currentSurfacePage,
      renderTutorialDisabledScopeRowsFn,
      documentTarget,
      windowTarget
    });
    setLastRenderedStepId(nextViewState.lastRenderedStepId);
    setActiveHighlightTarget(nextViewState.activeHighlightTarget);
    setActiveFocusScope(nextViewState.activeFocusScope);
    setDisabledScopesOpen(nextViewState.disabledScopesOpen);
  };
  const publishRuntimeState = () => publishTutorialClientRuntimeSnapshot({
    windowTarget,
    getProgress,
    currentStep,
    tutorialStepScopeFn,
    tutorialStepConceptsFn,
    tutorialRevealedConceptsFn,
    tutorialReplayScopeKeyFn,
    tutorialReplayStepIdFn,
    tutorialDisabledScopeKeysFn,
    tutorialDisabledContextIdsFn,
    tutorialDisabledPagesFn,
    getDisabledScopesOpen,
    currentSurfacePage,
    currentSurfaceContext,
    currentSurfaceRouteId,
    currentSurfaceRootWidgetId,
    currentSurfaceProgramId,
    tutorialSurfaceStateFn: tutorialSurfaceState,
    tutorialScopeInventoryRowsFn
  });
  return {
    renderDisabledScopes,
    render,
    publishRuntimeState
  };
}
