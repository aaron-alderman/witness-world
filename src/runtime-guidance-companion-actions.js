export async function runGuidanceSuggestionAction(suggestion, handlers = {}) {
  const action = suggestion?.action;
  if (!action || typeof action !== "object") return false;
  if (action.kind === "startTutorial") {
    await handlers.startTutorial?.();
    return true;
  }
  if (action.kind === "resumeTutorial") {
    await handlers.resumeTutorial?.();
    return true;
  }
  if (action.kind === "enableCurrentPage") {
    await handlers.enableCurrentPage?.(action.scopeKey ?? null);
    return true;
  }
  if (action.kind === "enableContext") {
    await handlers.enableContext?.(action.contextId ?? null);
    return true;
  }
  if (action.kind === "enablePage") {
    await handlers.enablePage?.(action.scopeKey ?? null, action.page ?? null);
    return true;
  }
  if (action.kind === "continueSurface") {
    await handlers.continueSurface?.(action.page ?? null);
    return true;
  }
  if (action.kind === "openApp") {
    await handlers.openApp?.();
    return true;
  }
  if (action.kind === "focusDisabledScopes") {
    await handlers.focusDisabledScopes?.();
    return true;
  }
  if (action.kind === "focusTarget") {
    await handlers.focusTarget?.(action.target ?? null);
    return true;
  }
  if (action.kind === "openRuntimeIssues") {
    await handlers.openRuntimeIssues?.();
    return true;
  }
  if (action.kind === "focusRuntimeTarget") {
    await handlers.focusRuntimeTarget?.(action.targetId ?? null);
    return true;
  }
  if (action.kind === "rerunRuntimeProbe") {
    await handlers.rerunRuntimeProbe?.();
    return true;
  }
  if (action.kind === "copyRuntimeInspection") {
    await handlers.copyRuntimeInspection?.();
    return true;
  }
  return false;
}

export function renderGuidanceCompanionActionsFactory() {
  return String.raw`
    const runGuidanceSuggestionAction = ${runGuidanceSuggestionAction.toString()};
  `;
}