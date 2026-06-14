export function renderTutorialProgressStateFactory() {
  return String.raw`
    const tutorialPageLabel = ${tutorialPageLabel.toString()};
    const tutorialContextLabel = ${tutorialContextLabel.toString()};
    const tutorialPageScopeKey = ${tutorialPageScopeKey.toString()};
    const tutorialChapterScopeKey = ${tutorialChapterScopeKey.toString()};
    const tutorialStepScope = ${tutorialStepScope.toString()};
    const tutorialStepSurfaceContext = ${tutorialStepSurfaceContext.toString()};
    const createTutorialProgressState = ${createTutorialProgressState.toString()};
  `;
}

export function tutorialPageLabel(page) {
  return page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
}

export function tutorialContextLabel(contextId) {
  return typeof contextId === "string" && contextId.trim()
    ? (contextId.trim().charAt(0).toUpperCase() + contextId.trim().slice(1) + " context")
    : null;
}

export function tutorialPageScopeKey(page) {
  return typeof page === "string" && page.trim() ? ("page:" + page.trim()) : null;
}

export function tutorialChapterScopeKey(chapterId) {
  return typeof chapterId === "string" && chapterId.trim() ? ("chapter:" + chapterId.trim()) : null;
}

export function tutorialStepScope(step) {
  if (!step) return null;
  const key = typeof step.scopeKey === "string" && step.scopeKey.trim()
    ? step.scopeKey.trim()
    : (step.page === "world" ? "world" : tutorialPageScopeKey(step.page));
  if (!key) return null;
  const kind = typeof step.scopeKind === "string" && step.scopeKind.trim()
    ? step.scopeKind.trim()
    : (key === "world"
        ? "world"
        : (key.startsWith("section:")
            ? "section"
            : (key.startsWith("widget:")
                ? "widget"
                : (key.startsWith("chapter:")
                    ? "chapter"
                    : "page"))));
  return {
    key,
    kind,
    page: typeof step.scopePage === "string" && step.scopePage.trim() ? step.scopePage.trim() : (kind === "world" ? "world" : (step.page || null)),
    label: typeof step.scopeLabel === "string" && step.scopeLabel.trim() ? step.scopeLabel.trim() : (step.title || ""),
    chapterId: step.chapterId || null,
    target: typeof step.target === "string" && step.target.trim() ? step.target.trim() : null
  };
}

export function tutorialStepSurfaceContext(step) {
  if (!step) return null;
  const contextId = typeof step.surfaceContextId === "string" && step.surfaceContextId.trim() ? step.surfaceContextId.trim() : "";
  if (!contextId) return null;
  return {
    id: contextId,
    label: typeof step.surfaceContextLabel === "string" && step.surfaceContextLabel.trim() ? step.surfaceContextLabel.trim() : tutorialContextLabel(contextId)
  };
}

export function createTutorialProgressState({
  tutorial = { id: "", steps: [], concepts: [], scopes: [] },
  currentSurfacePage = "app",
  currentSurfaceContext = null,
  getProgress = () => null,
  currentStep = () => null,
  currentStepIndex = () => -1
} = {}) {
  const conceptMap = new Map((tutorial.concepts || []).map(concept => [concept.id, concept]));
  const tutorialScopeCatalog = new Map();
  const tutorialContextCatalog = new Map();
  const addScopeInfo = info => {
    if (!info?.key) return;
    if (!tutorialScopeCatalog.has(info.key)) {
      tutorialScopeCatalog.set(info.key, { ...info });
      return;
    }
    tutorialScopeCatalog.set(info.key, {
      ...tutorialScopeCatalog.get(info.key),
      ...Object.fromEntries(Object.entries(info).filter(([, value]) => value != null && value !== ""))
    });
  };
  const addContextInfo = info => {
    if (!info?.id) return;
    if (!tutorialContextCatalog.has(info.id)) tutorialContextCatalog.set(info.id, { ...info });
  };

  for (const scope of tutorial.scopes || []) addScopeInfo(tutorialStepScope(scope));
  for (const step of tutorial.steps || []) {
    const stepScope = tutorialStepScope(step);
    addScopeInfo(stepScope);
    addContextInfo(tutorialStepSurfaceContext(step));
    if (step.page) addScopeInfo({ key: tutorialPageScopeKey(step.page), kind: "page", page: step.page, label: tutorialPageLabel(step.page) });
    if (step.page === "world") addScopeInfo({ key: "world", kind: "world", page: "world", label: "World surface" });
    if (step.chapterId) addScopeInfo({ key: tutorialChapterScopeKey(step.chapterId), kind: "chapter", chapterId: step.chapterId, label: step.chapterId });
  }

  const tutorialScopeInfo = scopeKey => tutorialScopeCatalog.get(typeof scopeKey === "string" ? scopeKey.trim() : "") || null;
  const tutorialContextInfo = contextId => tutorialContextCatalog.get(typeof contextId === "string" ? contextId.trim() : "") || null;

  const tutorialScopeTargetName = scopeKey => {
    const key = typeof scopeKey === "string" ? scopeKey.trim() : "";
    if (!key) return null;
    const authored = tutorialScopeInfo(key);
    if (authored?.target && (!authored.page || authored.page === currentSurfacePage)) return authored.target;
    const preferred = tutorial.steps.find(step => tutorialStepScope(step)?.key === key && step.page === currentSurfacePage && typeof step.target === "string" && step.target.trim());
    if (preferred?.target) return preferred.target.trim();
    const fallback = tutorial.steps.find(step => tutorialStepScope(step)?.key === key && typeof step.target === "string" && step.target.trim());
    return fallback?.target?.trim() || null;
  };

  const tutorialDisabledScopeKeys = current => {
    const keys = [];
    if (Array.isArray(current?.disabledScopeKeys)) {
      for (const key of current.disabledScopeKeys.map(String).map(value => value.trim()).filter(Boolean)) keys.push(key);
    }
    const disabledPages = Array.isArray(current?.disabledPages) ? current.disabledPages : [];
    for (const page of disabledPages.map(String).map(value => value.trim()).filter(Boolean)) {
      const pageKey = tutorialPageScopeKey(page);
      if (pageKey) keys.push(pageKey);
      if (page === "world") keys.push("world");
    }
    return [...new Set(keys.filter(key => tutorialScopeInfo(key)))];
  };

  const tutorialDisabledPages = current => {
    const pages = [];
    for (const key of tutorialDisabledScopeKeys(current)) {
      const scope = tutorialScopeInfo(key);
      if (!scope) continue;
      if (scope.kind === "page" && scope.page) pages.push(scope.page);
      if (scope.kind === "world") pages.push("world");
    }
    return [...new Set(pages)];
  };

  const tutorialDisabledContextIds = current => {
    const ids = Array.isArray(current?.disabledContextIds)
      ? current.disabledContextIds.map(String).map(value => value.trim()).filter(Boolean)
      : [];
    return [...new Set(ids.filter(id => tutorialContextInfo(id)))];
  };

  const tutorialReplayScopeKey = current => {
    const step = tutorial.steps.find(candidate => candidate.id === current?.stepId) || null;
    const stepScopeKey = tutorialStepScope(step)?.key || null;
    const chapterScopeKey = tutorialChapterScopeKey(step?.chapterId);
    const explicitKey = typeof current?.replayScopeKey === "string" ? current.replayScopeKey.trim() : "";
    if (explicitKey) {
      const explicitScope = tutorialScopeInfo(explicitKey);
      if (explicitScope && (explicitScope.key === stepScopeKey || explicitScope.key === chapterScopeKey)) return explicitScope.key;
    }
    const legacyReplayStepId = typeof current?.replayStepId === "string" ? current.replayStepId : "";
    if (legacyReplayStepId && legacyReplayStepId === step?.id) return stepScopeKey;
    return null;
  };

  const tutorialReplayStepId = current => {
    const step = tutorial.steps.find(candidate => candidate.id === current?.stepId) || null;
    return tutorialReplayScopeKey(current) && step ? step.id : null;
  };

  const tutorialScopeAncestors = scopeKey => {
    const scope = tutorialScopeInfo(scopeKey);
    if (!scope?.key) return [];
    const keys = [scope.key];
    if (scope.kind === "widget" || scope.kind === "section") {
      const pageKey = tutorialPageScopeKey(scope.page);
      if (pageKey) keys.push(pageKey);
      if (scope.page === "world") keys.push("world");
    } else if (scope.kind === "page" && scope.page === "world") {
      keys.push("world");
    } else if (scope.kind === "world") {
      keys.push(tutorialPageScopeKey("world"));
    }
    return [...new Set(keys.filter(Boolean))];
  };

  const isTutorialScopeDisabled = (current, scopeKey) => {
    const disabled = new Set(tutorialDisabledScopeKeys(current));
    return tutorialScopeAncestors(scopeKey).some(key => disabled.has(key));
  };

  const isTutorialContextDisabled = (current, contextId) => {
    const normalizedContextId = typeof contextId === "string" ? contextId.trim() : "";
    return Boolean(normalizedContextId) && tutorialDisabledContextIds(current).includes(normalizedContextId);
  };

  const normalizeProgress = current => {
    if (!current || typeof current !== "object") return null;
    const step = tutorial.steps.find(candidate => candidate.id === current.stepId) || tutorial.steps[0] || null;
    const disabledScopeKeys = tutorialDisabledScopeKeys(current);
    const disabledContextIds = tutorialDisabledContextIds(current);
    const normalized = {
      tutorialId: tutorial.id,
      chapterId: step?.chapterId || null,
      stepId: step?.id || null,
      chapterStatus: typeof current.chapterStatus === "string" ? current.chapterStatus : (step ? "in_progress" : "idle"),
      draftInputs: current.draftInputs && typeof current.draftInputs === "object" ? current.draftInputs : {},
      completedAt: typeof current.completedAt === "string" ? current.completedAt : null,
      hidden: current.hidden === true,
      disabledScopeKeys,
      disabledContextIds,
      replayScopeKey: null
    };
    normalized.replayScopeKey = tutorialReplayScopeKey({ ...current, stepId: normalized.stepId }) || null;
    normalized.disabledPages = tutorialDisabledPages(normalized);
    normalized.replayStepId = normalized.replayScopeKey && normalized.stepId ? normalized.stepId : null;
    return normalized;
  };

  const tutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => conceptMap.get(id)).filter(Boolean);

  const tutorialRevealedConcepts = current => {
    const lastIndex = current?.completedAt ? ((tutorial.steps?.length || 1) - 1) : currentStepIndex();
    if (lastIndex < 0) return [];
    const conceptIds = [];
    for (const step of tutorial.steps.slice(0, lastIndex + 1)) {
      for (const concept of tutorialStepConcepts(step)) {
        if (!conceptIds.includes(concept.id)) conceptIds.push(concept.id);
      }
    }
    return conceptIds.map(id => conceptMap.get(id)).filter(Boolean);
  };

  const tutorialSurfaceState = () => {
    const progress = getProgress();
    const step = currentStep();
    if (!progress || !step) return { kind: "idle", page: null };
    if (progress.completedAt) return { kind: "completed", page: step.page || null };
    if (progress.hidden) return { kind: "hidden", page: step.page || null };
    if ((step.page || null) !== currentSurfacePage) return { kind: "offpage", page: step.page || null };
    const currentContext = tutorialStepSurfaceContext(step);
    if (currentContext?.id && isTutorialContextDisabled(progress, currentContext.id)) return { kind: "disabled-context", page: step.page || null, contextId: currentContext.id };
    const currentScope = tutorialStepScope(step);
    if (currentScope?.key && isTutorialScopeDisabled(progress, currentScope.key)) return { kind: "disabled", page: step.page || null, scopeKey: currentScope.key };
    return { kind: "active", page: step.page || null, scopeKey: currentScope?.key || null };
  };

  const tutorialDisabledGuidanceRows = current => {
    const currentScopeKey = tutorialStepScope(currentStep())?.key || null;
    const currentScopeKeys = tutorialScopeAncestors(currentScopeKey);
    const currentContextId = tutorialStepSurfaceContext(currentStep())?.id || null;
    const rows = tutorialDisabledContextIds(current).map(contextId => {
      const context = tutorialContextInfo(contextId);
      const matchingStep = (currentContextId && currentContextId === contextId ? currentStep() : null)
        || tutorial.steps.find(step => tutorialStepSurfaceContext(step)?.id === contextId && step.page === currentSurfacePage)
        || tutorial.steps.find(step => tutorialStepSurfaceContext(step)?.id === contextId)
        || null;
      const scopeKey = tutorialStepScope(matchingStep)?.key || null;
      return {
        type: "context",
        contextId,
        page: matchingStep?.page || null,
        label: context?.label || tutorialContextLabel(contextId) || contextId,
        currentStepTitle: currentContextId === contextId ? currentStep()?.title || null : null,
        focusScopeKey: scopeKey,
        target: matchingStep?.page === currentSurfacePage && scopeKey ? tutorialScopeTargetName(scopeKey) : null
      };
    });
    for (const scopeKey of tutorialDisabledScopeKeys(current)) {
      const scope = tutorialScopeInfo(scopeKey);
      rows.push({
        type: "scope",
        scopeKey,
        page: scope?.page || null,
        label: scope?.kind === "page" && scope?.page ? tutorialPageLabel(scope.page) : (scope?.label || scopeKey),
        currentStepTitle: currentScopeKeys.includes(scopeKey) ? currentStep()?.title || null : null,
        target: scope?.page === currentSurfacePage ? tutorialScopeTargetName(scopeKey) : null
      });
    }
    return rows;
  };

  const clearTutorialScopeDisabled = (current, scopeKey) => {
    const keysToRemove = new Set(tutorialScopeAncestors(scopeKey));
    const disabledScopeKeys = tutorialDisabledScopeKeys(current).filter(key => !keysToRemove.has(key));
    return normalizeProgress({ ...current, disabledScopeKeys, disabledPages: [] });
  };

  const clearTutorialContextDisabled = (current, contextId = currentSurfaceContext) => {
    const normalizedContextId = typeof contextId === "string" ? contextId.trim() : "";
    if (!normalizedContextId) return normalizeProgress(current);
    return normalizeProgress({
      ...current,
      disabledContextIds: tutorialDisabledContextIds(current).filter(id => id !== normalizedContextId)
    });
  };

  const disableTutorialOnCurrentScope = current => {
    const scopeKey = tutorialStepScope(currentStep())?.key || tutorialPageScopeKey(currentSurfacePage);
    const disabledScopeKeys = [...new Set([...tutorialDisabledScopeKeys(current), scopeKey])];
    return normalizeProgress({ ...current, hidden: false, disabledScopeKeys, disabledPages: [] });
  };

  const disableTutorialOnCurrentContext = current => {
    const contextId = typeof currentSurfaceContext === "string" ? currentSurfaceContext.trim() : "";
    if (!contextId) return normalizeProgress(current);
    const disabledContextIds = [...new Set([...tutorialDisabledContextIds(current), contextId])];
    return normalizeProgress({ ...current, hidden: false, disabledContextIds });
  };

  return {
    tutorialPageLabel,
    tutorialContextLabel,
    tutorialPageScopeKey,
    tutorialChapterScopeKey,
    tutorialStepScope,
    tutorialStepSurfaceContext,
    tutorialScopeInfo,
    tutorialContextInfo,
    tutorialScopeTargetName,
    tutorialDisabledScopeKeys,
    tutorialDisabledPages,
    tutorialDisabledContextIds,
    tutorialReplayScopeKey,
    tutorialReplayStepId,
    tutorialScopeAncestors,
    isTutorialScopeDisabled,
    isTutorialContextDisabled,
    normalizeProgress,
    tutorialStepConcepts,
    tutorialRevealedConcepts,
    tutorialSurfaceState,
    tutorialDisabledGuidanceRows,
    clearTutorialScopeDisabled,
    clearTutorialContextDisabled,
    disableTutorialOnCurrentScope,
    disableTutorialOnCurrentContext
  };
}
