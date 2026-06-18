const DEFAULT_GUIDANCE_ID = "todo-from-scratch";

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).map(value => value.trim()).filter(Boolean))];
}

function guidancePageLabel(page) {
  return page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
}

export function guidancePageScopeKey(page) {
  const normalized = typeof page === "string" ? page.trim() : "";
  return normalized ? `page:${normalized}` : null;
}

export function guidanceChapterScopeKey(chapterId) {
  const normalized = typeof chapterId === "string" ? chapterId.trim() : "";
  return normalized ? `chapter:${normalized}` : null;
}

function normalizeScopeFields(scope = {}) {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => value != null && value !== ""));
}

function guidanceContextLabel(contextId) {
  const normalized = typeof contextId === "string" ? contextId.trim() : "";
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) + " context";
}

function recordScopeInfo(record) {
  if (!record || typeof record !== "object") return null;
  const scopeKey = typeof record.scopeKey === "string" && record.scopeKey.trim()
    ? record.scopeKey.trim()
    : (record.page === "world" ? "world" : guidancePageScopeKey(record.page));
  if (!scopeKey) return null;
  const scopeKind = typeof record.scopeKind === "string" && record.scopeKind.trim()
    ? record.scopeKind.trim()
    : (scopeKey === "world"
        ? "world"
        : (scopeKey.startsWith("section:")
            ? "section"
            : (scopeKey.startsWith("widget:")
                ? "widget"
                : (scopeKey.startsWith("chapter:")
                    ? "chapter"
                    : "page"))));
  const scopePage = typeof record.scopePage === "string" && record.scopePage.trim()
    ? record.scopePage.trim()
    : (scopeKind === "world" ? "world" : (typeof record.page === "string" && record.page.trim() ? record.page.trim() : null));
  return normalizeScopeFields({
    key: scopeKey,
    kind: scopeKind,
    page: scopePage,
    label: typeof record.scopeLabel === "string" && record.scopeLabel.trim() ? record.scopeLabel.trim() : (record.title || null),
    chapterId: record.chapterId || null,
    sectionId: typeof record.scopeSectionId === "string" && record.scopeSectionId.trim() ? record.scopeSectionId.trim() : null,
    widgetId: typeof record.scopeWidgetId === "string" && record.scopeWidgetId.trim() ? record.scopeWidgetId.trim() : null,
    target: typeof record.target === "string" && record.target.trim() ? record.target.trim() : null
  });
}

function stepScopeInfo(step) {
  return recordScopeInfo(step);
}

function stepSurfaceContextInfo(step) {
  if (!step || typeof step !== "object") return null;
  const contextId = typeof step.surfaceContextId === "string" && step.surfaceContextId.trim()
    ? step.surfaceContextId.trim()
    : null;
  if (!contextId) return null;
  return normalizeScopeFields({
    id: contextId,
    label: typeof step.surfaceContextLabel === "string" && step.surfaceContextLabel.trim()
      ? step.surfaceContextLabel.trim()
      : guidanceContextLabel(contextId)
  });
}

function addScopeInfo(map, info) {
  if (!info?.key) return;
  const existing = map.get(info.key);
  if (!existing) {
    map.set(info.key, { ...info });
    return;
  }
  map.set(info.key, {
    ...existing,
    ...Object.fromEntries(Object.entries(info).filter(([, value]) => value != null && value !== ""))
  });
}

export function guidancePages(guidance) {
  const pages = [];
  for (const step of guidance?.steps ?? []) {
    if (typeof step?.page !== "string" || !step.page.trim() || pages.includes(step.page)) continue;
    pages.push(step.page);
  }
  return pages;
}

export function normalizeGuidanceDisabledPages(guidance, disabledPages = []) {
  const knownPages = new Set(guidancePages(guidance));
  return uniqueStrings(disabledPages).filter(page => knownPages.has(page));
}

export function guidanceStep(guidance, stepId) {
  return guidance?.steps?.find(step => step.id === stepId) ?? null;
}

export function guidanceStepIndex(guidance, stepId) {
  return guidance?.steps?.findIndex(step => step.id === stepId) ?? -1;
}

export function nextGuidanceStep(guidance, stepId) {
  const index = guidanceStepIndex(guidance, stepId);
  if (index < 0) return guidance?.steps?.[0] ?? null;
  return guidance.steps[index + 1] ?? null;
}

export function previousGuidanceStep(guidance, stepId) {
  const index = guidanceStepIndex(guidance, stepId);
  if (index <= 0) return null;
  return guidance.steps[index - 1] ?? null;
}

export function firstGuidanceStepInChapter(guidance, chapterId) {
  if (!guidance?.steps?.length || !chapterId) return null;
  return guidance.steps.find(step => step.chapterId === chapterId) ?? null;
}

export function guidanceScopeCatalog(guidance) {
  const scopes = new Map();
  for (const page of guidancePages(guidance)) {
    addScopeInfo(scopes, {
      key: guidancePageScopeKey(page),
      kind: "page",
      page,
      label: guidancePageLabel(page)
    });
    if (page === "world") addScopeInfo(scopes, { key: "world", kind: "world", page: "world", label: "World surface" });
  }
  for (const scope of guidance?.scopes ?? []) addScopeInfo(scopes, recordScopeInfo(scope));
  for (const step of guidance?.steps ?? []) {
    addScopeInfo(scopes, stepScopeInfo(step));
    addScopeInfo(scopes, {
      key: guidanceChapterScopeKey(step.chapterId),
      kind: "chapter",
      chapterId: step.chapterId || null,
      label: step.chapterId || null
    });
  }
  return scopes;
}

export function guidanceContextCatalog(guidance) {
  const contexts = new Map();
  for (const step of guidance?.steps ?? []) {
    const surfaceContext = stepSurfaceContextInfo(step);
    if (!surfaceContext?.id || contexts.has(surfaceContext.id)) continue;
    contexts.set(surfaceContext.id, { ...surfaceContext });
  }
  return contexts;
}

export function guidanceContextInfo(guidance, contextId) {
  const id = typeof contextId === "string" ? contextId.trim() : "";
  if (!id) return null;
  return guidanceContextCatalog(guidance).get(id) ?? null;
}

export function guidanceScopeInfo(guidance, scopeKey) {
  const key = typeof scopeKey === "string" ? scopeKey.trim() : "";
  if (!key) return null;
  return guidanceScopeCatalog(guidance).get(key) ?? null;
}

export function guidanceStepScope(guidance, stepIdOrStep) {
  const step = typeof stepIdOrStep === "string" ? guidanceStep(guidance, stepIdOrStep) : stepIdOrStep;
  if (!step) return null;
  const scoped = stepScopeInfo(step);
  if (!scoped?.key) return null;
  return guidanceScopeInfo(guidance, scoped.key) || scoped;
}

export function guidanceStepSurfaceContext(guidance, stepIdOrStep) {
  const step = typeof stepIdOrStep === "string" ? guidanceStep(guidance, stepIdOrStep) : stepIdOrStep;
  if (!step) return null;
  const surfaceContext = stepSurfaceContextInfo(step);
  if (!surfaceContext?.id) return null;
  return guidanceContextInfo(guidance, surfaceContext.id) || surfaceContext;
}

export function guidanceDisabledPagesFromScopeKeys(guidance, disabledScopeKeys = []) {
  const pages = [];
  for (const key of uniqueStrings(disabledScopeKeys)) {
    const scope = guidanceScopeInfo(guidance, key);
    if (!scope) continue;
    if (scope.kind === "page" && scope.page) pages.push(scope.page);
    if (scope.kind === "world") pages.push("world");
  }
  return normalizeGuidanceDisabledPages(guidance, pages);
}

export function normalizeGuidanceDisabledScopeKeys(guidance, disabledScopeKeys = [], disabledPages = []) {
  const candidates = [];
  for (const key of uniqueStrings(disabledScopeKeys)) candidates.push(key);
  for (const page of normalizeGuidanceDisabledPages(guidance, disabledPages)) {
    const pageKey = guidancePageScopeKey(page);
    if (pageKey) candidates.push(pageKey);
    if (page === "world") candidates.push("world");
  }
  return uniqueStrings(candidates).filter(key => guidanceScopeInfo(guidance, key));
}

export function normalizeGuidanceDisabledContextIds(guidance, disabledContextIds = []) {
  return uniqueStrings(disabledContextIds).filter(contextId => guidanceContextInfo(guidance, contextId));
}

function replayScopeKeyCandidate(guidance, progress) {
  const step = guidanceStep(guidance, progress?.stepId);
  if (!step) return null;
  const currentScope = guidanceStepScope(guidance, step);
  const chapterScopeKey = guidanceChapterScopeKey(step.chapterId);
  const explicitKey = typeof progress?.replayScopeKey === "string" ? progress.replayScopeKey.trim() : "";
  if (explicitKey) {
    const explicitScope = guidanceScopeInfo(guidance, explicitKey);
    if (explicitScope && (explicitScope.key === currentScope?.key || explicitScope.key === chapterScopeKey)) return explicitScope.key;
  }
  const legacyReplayStepId = normalizeGuidanceReplayStep(guidance, progress?.replayStepId);
  if (legacyReplayStepId && legacyReplayStepId === step.id) return currentScope?.key || null;
  return null;
}

export function guidanceReplayScopeKey(guidance, progress) {
  return replayScopeKeyCandidate(guidance, progress);
}

export function normalizeGuidanceReplayStep(guidance, replayStepId) {
  const id = typeof replayStepId === "string" ? replayStepId : "";
  return guidanceStep(guidance, id)?.id ?? null;
}

export function guidanceScopeAncestors(guidance, scopeKey) {
  const scope = guidanceScopeInfo(guidance, scopeKey);
  if (!scope?.key) return [];
  const keys = [scope.key];
  if (scope.kind === "widget" || scope.kind === "section") {
    const pageKey = guidancePageScopeKey(scope.page);
    if (pageKey) keys.push(pageKey);
    if (scope.page === "world") keys.push("world");
  } else if (scope.kind === "page" && scope.page === "world") {
    keys.push("world");
  } else if (scope.kind === "world") {
    const pageKey = guidancePageScopeKey("world");
    if (pageKey) keys.push(pageKey);
  }
  return uniqueStrings(keys);
}

export function guidanceDisabledScopeKeys(guidance, progress) {
  return normalizeGuidanceDisabledScopeKeys(guidance, progress?.disabledScopeKeys, progress?.disabledPages);
}

export function guidanceDisabledContextIds(guidance, progress) {
  return normalizeGuidanceDisabledContextIds(guidance, progress?.disabledContextIds);
}

export function isGuidanceScopeDisabled(guidance, progress, scopeKey) {
  if (!progress) return false;
  const disabled = new Set(guidanceDisabledScopeKeys(guidance, progress));
  return guidanceScopeAncestors(guidance, scopeKey).some(key => disabled.has(key));
}

export function isGuidanceContextDisabled(guidance, progress, contextId) {
  if (!progress) return false;
  return guidanceDisabledContextIds(guidance, progress).includes(typeof contextId === "string" ? contextId.trim() : "");
}

export function normalizeGuidanceProgress(guidance, progress) {
  if (!progress || typeof progress !== "object") return null;
  const fallbackStep = guidance?.steps?.[0] ?? null;
  const step = guidanceStep(guidance, progress.stepId) ?? fallbackStep;
  const stepId = step?.id ?? null;
  const replayScopeKey = replayScopeKeyCandidate(guidance, { ...progress, stepId });
  const disabledScopeKeys = normalizeGuidanceDisabledScopeKeys(guidance, progress.disabledScopeKeys, progress.disabledPages);
  const disabledContextIds = normalizeGuidanceDisabledContextIds(guidance, progress.disabledContextIds);
  return {
    tutorialId: guidance?.id || DEFAULT_GUIDANCE_ID,
    guidanceId: guidance?.id || DEFAULT_GUIDANCE_ID,
    chapterId: step?.chapterId || null,
    stepId,
    chapterStatus: typeof progress.chapterStatus === "string" ? progress.chapterStatus : (step ? "in_progress" : "idle"),
    draftInputs: progress.draftInputs && typeof progress.draftInputs === "object" ? progress.draftInputs : {},
    completedAt: typeof progress.completedAt === "string" ? progress.completedAt : null,
    hidden: progress.hidden === true,
    disabledScopeKeys,
    disabledContextIds,
    replayScopeKey,
    disabledPages: guidanceDisabledPagesFromScopeKeys(guidance, disabledScopeKeys),
    replayStepId: replayScopeKey && stepId ? stepId : null
  };
}

export function createGuidanceProgress(guidance, stepId = guidance?.steps?.[0]?.id || null) {
  const step = guidanceStep(guidance, stepId) ?? guidance?.steps?.[0] ?? null;
  return normalizeGuidanceProgress(guidance, {
    tutorialId: guidance?.id || DEFAULT_GUIDANCE_ID,
    guidanceId: guidance?.id || DEFAULT_GUIDANCE_ID,
    chapterId: step?.chapterId || null,
    stepId: step?.id || null,
    chapterStatus: step ? "in_progress" : "idle",
    draftInputs: {},
    completedAt: null,
    hidden: false,
    disabledScopeKeys: [],
    disabledContextIds: [],
    replayScopeKey: null
  });
}

export function guidanceStepConcepts(guidance, stepId) {
  const concepts = new Map((guidance?.concepts ?? []).map(concept => [concept.id, concept]));
  return [...new Set((guidanceStep(guidance, stepId)?.concepts ?? []).map(String))]
    .map(id => concepts.get(id))
    .filter(Boolean);
}

export function guidanceRevealedConcepts(guidance, progressOrStepId) {
  const stepId = typeof progressOrStepId === "string" ? progressOrStepId : progressOrStepId?.stepId;
  const currentIndex = progressOrStepId?.completedAt
    ? ((guidance?.steps?.length ?? 1) - 1)
    : guidanceStepIndex(guidance, stepId);
  if (currentIndex < 0) return [];
  const concepts = new Map((guidance?.concepts ?? []).map(concept => [concept.id, concept]));
  const revealedIds = [];
  for (const step of guidance?.steps?.slice(0, currentIndex + 1) ?? []) {
    for (const conceptId of [...new Set((step?.concepts ?? []).map(String))]) {
      if (!revealedIds.includes(conceptId) && concepts.has(conceptId)) revealedIds.push(conceptId);
    }
  }
  return revealedIds.map(id => concepts.get(id)).filter(Boolean);
}

export function setGuidanceScopeDisabled(guidance, progress, scopeKey, disabled = true) {
  if (!progress) return null;
  const current = normalizeGuidanceProgress(guidance, progress);
  const targetScope = guidanceScopeInfo(guidance, scopeKey);
  if (!current || !targetScope?.key) return current;
  const disabledScopeKeys = new Set(guidanceDisabledScopeKeys(guidance, current));
  if (disabled) disabledScopeKeys.add(targetScope.key);
  else disabledScopeKeys.delete(targetScope.key);
  return normalizeGuidanceProgress(guidance, {
    ...current,
    disabledScopeKeys: [...disabledScopeKeys]
  });
}

export function setGuidancePageDisabled(guidance, progress, page, disabled = true) {
  return setGuidanceScopeDisabled(guidance, progress, guidancePageScopeKey(page), disabled);
}

export function setGuidanceContextDisabled(guidance, progress, contextId, disabled = true) {
  if (!progress) return null;
  const current = normalizeGuidanceProgress(guidance, progress);
  const targetContext = guidanceContextInfo(guidance, contextId);
  if (!current || !targetContext?.id) return current;
  const disabledContextIds = new Set(guidanceDisabledContextIds(guidance, current));
  if (disabled) disabledContextIds.add(targetContext.id);
  else disabledContextIds.delete(targetContext.id);
  return normalizeGuidanceProgress(guidance, {
    ...current,
    disabledContextIds: [...disabledContextIds]
  });
}

export function restartGuidanceFromScope(guidance, progress, scopeKey, stepId = progress?.stepId) {
  const current = guidanceStep(guidance, stepId);
  if (!current) return createGuidanceProgress(guidance);
  const replayScope = guidanceScopeInfo(guidance, scopeKey);
  return normalizeGuidanceProgress(guidance, {
    ...(progress ?? createGuidanceProgress(guidance, current.id)),
    chapterId: current.chapterId,
    stepId: current.id,
    chapterStatus: "in_progress",
    completedAt: null,
    hidden: false,
    draftInputs: {},
    replayScopeKey: replayScope?.key || guidanceStepScope(guidance, current)?.key || null
  });
}

export function restartGuidanceFromHere(guidance, progress, stepId = progress?.stepId) {
  const current = guidanceStep(guidance, stepId);
  return restartGuidanceFromScope(guidance, progress, guidanceStepScope(guidance, current)?.key, current?.id);
}

export function skipGuidanceChapter(guidance, progress) {
  const current = guidanceStep(guidance, progress?.stepId);
  if (!current) return createGuidanceProgress(guidance);
  const next = guidance.steps.find(step => step.chapterId !== current.chapterId && guidanceStepIndex(guidance, step.id) > guidanceStepIndex(guidance, current.id));
  if (!next) {
    return normalizeGuidanceProgress(guidance, { ...progress, chapterStatus: "completed", completedAt: progress.completedAt || new Date().toISOString(), replayScopeKey: null });
  }
  return normalizeGuidanceProgress(guidance, { ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: "in_progress", replayScopeKey: null });
}

export function advanceGuidanceProgress(guidance, progress) {
  const next = nextGuidanceStep(guidance, progress?.stepId);
  if (!next) {
    return normalizeGuidanceProgress(guidance, { ...progress, chapterStatus: "completed", completedAt: progress?.completedAt || new Date().toISOString(), replayScopeKey: null });
  }
  return normalizeGuidanceProgress(guidance, {
    ...progress,
    chapterId: next.chapterId,
    stepId: next.id,
    chapterStatus: "in_progress",
    completedAt: null,
    replayScopeKey: null
  });
}

export function retreatGuidanceProgress(guidance, progress) {
  const previous = previousGuidanceStep(guidance, progress?.stepId);
  if (!previous) return progress;
  return normalizeGuidanceProgress(guidance, {
    ...progress,
    chapterId: previous.chapterId,
    stepId: previous.id,
    chapterStatus: "in_progress",
    completedAt: null,
    replayScopeKey: null
  });
}

export function restartGuidanceChapter(guidance, progress, chapterId = progress?.chapterId) {
  const first = firstGuidanceStepInChapter(guidance, chapterId);
  if (!first) return createGuidanceProgress(guidance);
  return normalizeGuidanceProgress(guidance, {
    ...(progress ?? createGuidanceProgress(guidance, first.id)),
    chapterId: first.chapterId,
    stepId: first.id,
    chapterStatus: "in_progress",
    completedAt: null,
    hidden: false,
    draftInputs: {},
    replayScopeKey: null
  });
}

export function mergeGuidanceProgress(guidance, localProgress, remoteProgress) {
  if (localProgress?.completedAt && !remoteProgress?.completedAt) return normalizeGuidanceProgress(guidance, localProgress);
  if (remoteProgress?.completedAt && !localProgress?.completedAt) return normalizeGuidanceProgress(guidance, remoteProgress);
  const localIndex = guidanceStepIndex(guidance, localProgress?.stepId);
  const remoteIndex = guidanceStepIndex(guidance, remoteProgress?.stepId);
  if (remoteIndex > localIndex) return normalizeGuidanceProgress(guidance, remoteProgress);
  if (localIndex > remoteIndex) return normalizeGuidanceProgress(guidance, localProgress);
  if (!localProgress) return normalizeGuidanceProgress(guidance, remoteProgress) ?? null;
  if (!remoteProgress) return normalizeGuidanceProgress(guidance, localProgress) ?? null;
  const localNormalized = normalizeGuidanceProgress(guidance, localProgress);
  const remoteNormalized = normalizeGuidanceProgress(guidance, remoteProgress);
  if (localProgress.hidden === false && remoteProgress.hidden === true) {
    return localNormalized;
  }
  if (remoteProgress.hidden === false && localProgress.hidden === true) {
    return remoteNormalized;
  }
  return normalizeGuidanceProgress(guidance, {
    ...remoteNormalized,
    hidden: remoteNormalized.hidden,
    disabledScopeKeys: [...new Set([...guidanceDisabledScopeKeys(guidance, remoteNormalized), ...guidanceDisabledScopeKeys(guidance, localNormalized)])],
    disabledContextIds: [...new Set([...guidanceDisabledContextIds(guidance, remoteNormalized), ...guidanceDisabledContextIds(guidance, localNormalized)])],
    replayScopeKey: guidanceReplayScopeKey(guidance, localNormalized) || guidanceReplayScopeKey(guidance, remoteNormalized) || null
  });
}

export const tutorialPageScopeKey = guidancePageScopeKey;
export const tutorialChapterScopeKey = guidanceChapterScopeKey;
export const tutorialPages = guidancePages;
export const normalizeTutorialDisabledPages = normalizeGuidanceDisabledPages;
export const tutorialStep = guidanceStep;
export const tutorialStepIndex = guidanceStepIndex;
export const nextTutorialStep = nextGuidanceStep;
export const previousTutorialStep = previousGuidanceStep;
export const firstTutorialStepInChapter = firstGuidanceStepInChapter;
export const tutorialScopeCatalog = guidanceScopeCatalog;
export const tutorialContextCatalog = guidanceContextCatalog;
export const tutorialContextInfo = guidanceContextInfo;
export const tutorialScopeInfo = guidanceScopeInfo;
export const tutorialStepScope = guidanceStepScope;
export const tutorialStepSurfaceContext = guidanceStepSurfaceContext;
export const tutorialDisabledPagesFromScopeKeys = guidanceDisabledPagesFromScopeKeys;
export const normalizeTutorialDisabledScopeKeys = normalizeGuidanceDisabledScopeKeys;
export const normalizeTutorialDisabledContextIds = normalizeGuidanceDisabledContextIds;
export const tutorialReplayScopeKey = guidanceReplayScopeKey;
export const normalizeTutorialReplayStep = normalizeGuidanceReplayStep;
export const tutorialDisabledScopeKeys = guidanceDisabledScopeKeys;
export const tutorialDisabledContextIds = guidanceDisabledContextIds;
export const isTutorialScopeDisabled = isGuidanceScopeDisabled;
export const isTutorialContextDisabled = isGuidanceContextDisabled;
export const normalizeTutorialProgress = normalizeGuidanceProgress;
export const createTutorialProgress = createGuidanceProgress;
export const tutorialStepConcepts = guidanceStepConcepts;
export const tutorialRevealedConcepts = guidanceRevealedConcepts;
export const setTutorialScopeDisabled = setGuidanceScopeDisabled;
export const setTutorialPageDisabled = setGuidancePageDisabled;
export const setTutorialContextDisabled = setGuidanceContextDisabled;
export const restartTutorialFromScope = restartGuidanceFromScope;
export const restartTutorialFromHere = restartGuidanceFromHere;
export const skipTutorialChapter = skipGuidanceChapter;
export const advanceTutorialProgress = advanceGuidanceProgress;
export const retreatTutorialProgress = retreatGuidanceProgress;
export const restartTutorialChapter = restartGuidanceChapter;
export const mergeTutorialProgress = mergeGuidanceProgress;
