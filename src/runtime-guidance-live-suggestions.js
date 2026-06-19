export function renderLiveGuidanceSuggestionsFactory() {
  return String.raw`
    const buildLiveGuidanceSuggestions = ${buildLiveGuidanceSuggestions.toString()};
  `;
}

export function buildLiveGuidanceSuggestions({
  progress = null,
  currentStep = null,
  surface = { kind: "" },
  disabledRows = [],
  appReady = false,
  tutorialPageLabel = page => page,
  tutorialStepScope = () => null,
  tutorialStepSurfaceContext = () => null,
  tutorialContextInfo = () => null,
  tutorialContextLabel = () => "",
  isTutorialContextDisabled = () => false,
  isTutorialScopeDisabled = () => false
} = {}) {
  const suggestions = [];
  const add = (id, title, body, buttonLabel, action) => suggestions.push({ id, title, body, buttonLabel, action });
  const current = currentStep;
  if (!progress || progress.completedAt || !current) return suggestions;
  if (surface.kind === "hidden") {
    add("resume-tutorial", "Resume The Current Tutorial Step", "The tutorial is paused but the current step and its real controls remain available.", "Resume Tutorial", { kind: "resumeTutorial" });
    return suggestions;
  }
  if (surface.kind === "disabled") {
    add("enable-current-page", "Re-Enable Sourcery Here", "Sourcery is disabled here, but the current step is still recoverable without resetting progress.", "Enable Sourcery", { kind: "enableCurrentPage", scopeKey: surface.scopeKey || tutorialStepScope(current)?.key || null });
    return suggestions;
  }
  if (surface.kind === "disabled-context") {
    add("enable-current-context", "Re-Enable Sourcery In This Context", "Sourcery is disabled for this active context, but the current step is still recoverable without resetting progress.", "Enable This Context", { kind: "enableContext", contextId: surface.contextId || tutorialStepSurfaceContext(current)?.id || null });
    return suggestions;
  }
  if (surface.kind === "offpage") {
    const currentScopeKey = tutorialStepScope(current)?.key || null;
    const currentContextId = tutorialStepSurfaceContext(current)?.id || null;
    if (surface.page && currentContextId && isTutorialContextDisabled(progress, currentContextId)) {
      add("enable-offpage-context", "Re-Enable Sourcery In " + (tutorialContextInfo(currentContextId)?.label || tutorialContextLabel(currentContextId) || currentContextId), "The current step belongs on the " + tutorialPageLabel(surface.page) + " surface, but Sourcery is disabled in that context until you turn it back on.", "Enable This Context", { kind: "enableContext", contextId: currentContextId });
    }
    if (surface.page && currentScopeKey && isTutorialScopeDisabled(progress, currentScopeKey)) {
      add("enable-offpage-surface", "Re-Enable Sourcery On " + tutorialPageLabel(surface.page), "The current step belongs on the " + tutorialPageLabel(surface.page) + " surface, but Sourcery is disabled there until you turn it back on.", "Enable Sourcery", { kind: "enablePage", page: surface.page, scopeKey: currentScopeKey });
    }
    add("continue-surface", "Continue On The Relevant Surface", "The current step belongs on the " + tutorialPageLabel(surface.page) + " surface, not this page.", "Continue On " + tutorialPageLabel(surface.page), { kind: "continueSurface", page: surface.page });
    if (disabledRows.length) {
      add("show-disabled-scopes", "Show Disabled Sourcery Scopes", "Review the currently disabled guidance scopes and recover them from the real surface list below.", "Show Disabled Scopes", { kind: "focusDisabledScopes" });
    }
    return suggestions.slice(0, 3);
  }
  if (current?.target) {
    add("show-current-control", "Use The Current Real Control", "The tutorial is pointing at a real authored control on this page. Work through that exact surface.", "Show Current Control", { kind: "focusTarget", target: current.target });
  }
  if (disabledRows.length) {
    add("show-disabled-scopes", "Show Disabled Sourcery Scopes", "Review the currently disabled guidance scopes and recover them from the real surface list below.", "Show Disabled Scopes", { kind: "focusDisabledScopes" });
  }
  return suggestions.slice(0, 2);
}