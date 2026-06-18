import {
  guidanceContextInfo,
  guidanceDisabledContextIds,
  guidanceDisabledScopeKeys,
  guidanceScopeAncestors,
  guidanceScopeCatalog,
  guidanceScopeInfo,
  guidanceStep,
  guidanceStepIndex,
  guidanceStepScope,
  guidanceStepSurfaceContext,
  isGuidanceScopeDisabled
} from "./runtime-guidance-model.js";

const SCOPE_KIND_ORDER = Object.freeze({
  world: 0,
  page: 1,
  chapter: 2,
  section: 3,
  widget: 4
});

export function guidanceScopeInventoryStatus({
  progress = null,
  scopeKey = "",
  currentScopeKey = null,
  progressIndex = -1,
  maxStepIndexByScope = new Map(),
  isScopeDisabled = () => false
} = {}) {
  const key = typeof scopeKey === "string" ? scopeKey.trim() : "";
  if (!key) return "available";
  if (!progress) return "available";
  if (isScopeDisabled(progress, key)) return "muted";
  if (key === currentScopeKey) return "active";
  const maxIndex = maxStepIndexByScope.get(key);
  if (typeof maxIndex === "number" && maxIndex >= 0 && maxIndex < progressIndex) return "completed";
  if (progress.completedAt) return "completed";
  return "available";
}

export function buildGuidanceScopeInventoryRowsFromHelpers({
  scopes = new Map(),
  steps = [],
  contexts = new Map(),
  progress = null,
  currentStep = null,
  currentSurfacePage = null,
  stepScopeFn = () => null,
  stepSurfaceContextFn = () => null,
  stepIndexFn = () => -1,
  scopeInfoFn = () => null,
  contextInfoFn = () => null,
  scopeTargetNameFn = () => null,
  scopeAncestorsFn = () => [],
  disabledScopeKeysFn = () => [],
  disabledContextIdsFn = () => [],
  isScopeDisabledFn = () => false,
  pageLabelFn = page => String(page || "")
} = {}) {
  const currentScopeKey = stepScopeFn(currentStep)?.key || null;
  const currentContextId = stepSurfaceContextFn(currentStep)?.id || null;
  const currentScopeAncestors = scopeAncestorsFn(currentScopeKey);
  const progressIndex = progress?.completedAt ? Math.max(0, steps.length - 1) : stepIndexFn(progress?.stepId);

  const maxStepIndexByScope = new Map();
  for (let index = 0; index < steps.length; index += 1) {
    const scopeKey = stepScopeFn(steps[index])?.key;
    if (!scopeKey) continue;
    maxStepIndexByScope.set(scopeKey, Math.max(maxStepIndexByScope.get(scopeKey) ?? -1, index));
  }

  const rows = [];
  for (const contextId of disabledContextIdsFn(progress)) {
    const context = contextInfoFn(contextId);
    const matchingStep = (currentContextId && currentContextId === contextId ? currentStep : null)
      || steps.find(step => stepSurfaceContextFn(step)?.id === contextId && step.page === currentSurfacePage)
      || steps.find(step => stepSurfaceContextFn(step)?.id === contextId)
      || null;
    const focusScopeKey = stepScopeFn(matchingStep)?.key || null;
    rows.push({
      type: "context",
      status: "muted",
      contextId,
      scopeKey: focusScopeKey,
      page: matchingStep?.page || null,
      label: context?.label || contextId,
      pageLabel: matchingStep?.page ? pageLabelFn(matchingStep.page) : "",
      currentStepTitle: currentContextId === contextId ? currentStep?.title || null : null,
      isCurrentSurface: matchingStep?.page === currentSurfacePage,
      target: matchingStep?.page === currentSurfacePage && focusScopeKey ? scopeTargetNameFn(focusScopeKey) : null
    });
  }

  for (const scope of scopes.values()) {
    const scopeKey = scope.key;
    const status = guidanceScopeInventoryStatus({
      progress,
      scopeKey,
      currentScopeKey,
      progressIndex,
      maxStepIndexByScope,
      isScopeDisabled: isScopeDisabledFn
    });
    const alwaysVisible = scope.kind === "page" || scope.kind === "world" || scope.kind === "chapter";
    const authoredAnchor = Boolean(scope.target);
    if (status === "available" && !alwaysVisible && !authoredAnchor) continue;

    rows.push({
      type: "scope",
      status,
      scopeKey,
      kind: scope.kind,
      page: scope.page || null,
      label: scope.kind === "page" && scope.page ? pageLabelFn(scope.page) : (scope.label || scopeKey),
      pageLabel: scope.page ? pageLabelFn(scope.page) : "",
      currentStepTitle: currentScopeAncestors.includes(scopeKey) ? currentStep?.title || null : null,
      isCurrentSurface: scope.page === currentSurfacePage,
      target: scope.page === currentSurfacePage ? (scope.target || scopeTargetNameFn(scopeKey)) : null
    });
  }

  return rows.sort((left, right) => {
    const leftKind = left.kind || (left.type === "context" ? "context" : "scope");
    const rightKind = right.kind || (right.type === "context" ? "context" : "scope");
    const leftOrder = left.type === "context" ? 5 : (SCOPE_KIND_ORDER[leftKind] ?? 99);
    const rightOrder = right.type === "context" ? 5 : (SCOPE_KIND_ORDER[rightKind] ?? 99);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.label || "").localeCompare(String(right.label || ""));
  });
}

export function buildGuidanceScopeInventoryRows(guidance, progress, {
  currentSurfacePage = null,
  scopeTargetResolver = null,
  pageLabel = null
} = {}) {

  const labelForPage = pageLabel ?? (page => page === "app" ? "App" : page === "bootstrap" ? "Bootstrap" : page === "world" ? "World" : String(page || ""));
  const currentStep = guidanceStep(guidance, progress?.stepId);
  const scopes = guidanceScopeCatalog(guidance);
  const resolveTarget = scopeTargetResolver ?? (scopeKey => {
    const scope = guidanceScopeInfo(guidance, scopeKey);
    return scope?.target || null;
  });

  return buildGuidanceScopeInventoryRowsFromHelpers({
    scopes,
    steps: guidance?.steps ?? [],
    progress,
    currentStep,
    currentSurfacePage,
    stepScopeFn: step => guidanceStepScope(guidance, step),
    stepSurfaceContextFn: step => guidanceStepSurfaceContext(guidance, step),
    stepIndexFn: stepId => guidanceStepIndex(guidance, stepId),
    scopeInfoFn: scopeKey => guidanceScopeInfo(guidance, scopeKey),
    contextInfoFn: contextId => guidanceContextInfo(guidance, contextId),
    scopeTargetNameFn: resolveTarget,
    scopeAncestorsFn: scopeKey => guidanceScopeAncestors(guidance, scopeKey),
    disabledScopeKeysFn: current => guidanceDisabledScopeKeys(guidance, current),
    disabledContextIdsFn: current => guidanceDisabledContextIds(guidance, current),
    isScopeDisabledFn: (current, scopeKey) => isGuidanceScopeDisabled(guidance, current, scopeKey),
    pageLabelFn: labelForPage
  });
}