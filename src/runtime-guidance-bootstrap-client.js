import {
  renderBootstrapGuidanceConceptList,
  renderBootstrapGuidanceScopeInventoryRows,
  renderBootstrapGuidanceSuggestionList
} from "./runtime-guidance-bootstrap-view.js";
import { renderGuidanceScopeInventoryFactory } from "./runtime-guidance-scope-inventory-factory.js";

export function renderBootstrapGuidanceStateFactory() {
  return String.raw`
    ${renderGuidanceScopeInventoryFactory()}
    const renderBootstrapGuidanceConceptList = ${renderBootstrapGuidanceConceptList.toString()};
    const renderBootstrapGuidanceSuggestionList = ${renderBootstrapGuidanceSuggestionList.toString()};
    const renderBootstrapGuidanceScopeInventoryRows = ${renderBootstrapGuidanceScopeInventoryRows.toString()};
    const createBootstrapGuidanceStateRuntime = (env) => {
      const {
        tutorial,
        guidance,
        state,
        stepIndex,
        currentSurfacePage,
        localProgressKey,
        legacyLocalProgressKey,
        request,
        byId,
        renderPage
      } = env;
      const activeGuidance = guidance && typeof guidance === "object" ? guidance : tutorial;
      const currentSuggestions = [];
      const currentStepIndex = progress => stepIndex.get(progress?.stepId ?? "") ?? -1;
      const syncProgressAliases = progress => {
        state.tutorialProgress = progress;
        state.guidanceProgress = progress;
        return progress;
      };
      const tutorialStep = () => activeGuidance.steps.find(step => step.id === state.tutorialProgress?.stepId) || null;
      const previousTutorialStep = () => {
        const index = stepIndex.get(state.tutorialProgress?.stepId ?? "") ?? -1;
        return index > 0 ? activeGuidance.steps[index - 1] : null;
      };
      const firstTutorialStepInChapter = chapterId => activeGuidance.steps.find(step => step.chapterId === chapterId) || null;
      const conceptMap = new Map((activeGuidance.concepts || []).map(concept => [concept.id, concept]));
      const knownTutorialPages = [...new Set(activeGuidance.steps.map(step => typeof step.page === "string" ? step.page : "").filter(Boolean))];
      const tutorialPageLabel = page => page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
      const tutorialContextLabel = contextId => typeof contextId === "string" && contextId.trim()
        ? (contextId.trim().charAt(0).toUpperCase() + contextId.trim().slice(1) + " context")
        : null;
      const tutorialPageScopeKey = page => typeof page === "string" && page.trim() ? ("page:" + page.trim()) : null;
      const tutorialChapterScopeKey = chapterId => typeof chapterId === "string" && chapterId.trim() ? ("chapter:" + chapterId.trim()) : null;
      const tutorialStepScope = step => {
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
      };
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
        if (!info?.id || tutorialContextCatalog.has(info.id)) return;
        tutorialContextCatalog.set(info.id, { ...info });
      };
      const tutorialStepSurfaceContext = step => {
        if (!step) return null;
        const contextId = typeof step.surfaceContextId === "string" && step.surfaceContextId.trim() ? step.surfaceContextId.trim() : "";
        if (!contextId) return null;
        return {
          id: contextId,
          label: typeof step.surfaceContextLabel === "string" && step.surfaceContextLabel.trim() ? step.surfaceContextLabel.trim() : tutorialContextLabel(contextId)
        };
      };
      for (const scope of activeGuidance.scopes || []) addScopeInfo(tutorialStepScope(scope));
      for (const step of activeGuidance.steps) {
        addScopeInfo(tutorialStepScope(step));
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
        const preferred = activeGuidance.steps.find(step => tutorialStepScope(step)?.key === key && step.page === currentSurfacePage && typeof step.target === "string" && step.target.trim());
        if (preferred?.target) return preferred.target.trim();
        const fallback = activeGuidance.steps.find(step => tutorialStepScope(step)?.key === key && typeof step.target === "string" && step.target.trim());
        return fallback?.target?.trim() || null;
      };
      const tutorialDisabledScopeKeys = progress => {
        const keys = [];
        if (Array.isArray(progress?.disabledScopeKeys)) {
          for (const key of progress.disabledScopeKeys.map(String).map(value => value.trim()).filter(Boolean)) {
            if (tutorialScopeInfo(key)) keys.push(key);
          }
        }
        for (const page of (Array.isArray(progress?.disabledPages) ? progress.disabledPages : []).map(String).filter(page => knownTutorialPages.includes(page))) {
          const pageKey = tutorialPageScopeKey(page);
          if (pageKey && tutorialScopeInfo(pageKey)) keys.push(pageKey);
          if (page === "world" && tutorialScopeInfo("world")) keys.push("world");
        }
        return [...new Set(keys)];
      };
      const tutorialDisabledPages = progress => {
        const pages = [];
        for (const key of tutorialDisabledScopeKeys(progress)) {
          const scope = tutorialScopeInfo(key);
          if (!scope) continue;
          if (scope.kind === "page" && scope.page && !pages.includes(scope.page)) pages.push(scope.page);
          if (scope.kind === "world" && !pages.includes("world")) pages.push("world");
        }
        return pages;
      };
      const tutorialDisabledContextIds = progress => {
        const ids = Array.isArray(progress?.disabledContextIds)
          ? progress.disabledContextIds.map(String).map(value => value.trim()).filter(Boolean)
          : [];
        return [...new Set(ids.filter(id => tutorialContextInfo(id)))];
      };
      const tutorialReplayScopeKey = progress => {
        const step = activeGuidance.steps.find(candidate => candidate.id === progress?.stepId) || null;
        const stepScopeKey = tutorialStepScope(step)?.key || null;
        const chapterScopeKey = tutorialChapterScopeKey(step?.chapterId);
        const explicitKey = typeof progress?.replayScopeKey === "string" ? progress.replayScopeKey.trim() : "";
        if (explicitKey) {
          const explicitScope = tutorialScopeInfo(explicitKey);
          if (explicitScope && (explicitScope.key === stepScopeKey || explicitScope.key === chapterScopeKey)) return explicitScope.key;
        }
        const replayStepId = typeof progress?.replayStepId === "string" ? progress.replayStepId : "";
        if (replayStepId && replayStepId === step?.id) return stepScopeKey;
        return null;
      };
      const tutorialReplayStepId = progress => {
        const step = activeGuidance.steps.find(candidate => candidate.id === progress?.stepId) || null;
        return tutorialReplayScopeKey(progress) && step ? step.id : null;
      };
      const tutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => conceptMap.get(id)).filter(Boolean);
      const tutorialRevealedConcepts = progress => {
        const lastIndex = progress?.completedAt ? ((activeGuidance.steps?.length || 1) - 1) : currentStepIndex(progress);
        if (lastIndex < 0) return [];
        const conceptIds = [];
        for (const step of activeGuidance.steps.slice(0, lastIndex + 1)) {
          for (const concept of tutorialStepConcepts(step)) {
            if (!conceptIds.includes(concept.id)) conceptIds.push(concept.id);
          }
        }
        return conceptIds.map(id => conceptMap.get(id)).filter(Boolean);
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
          const pageKey = tutorialPageScopeKey("world");
          if (pageKey) keys.push(pageKey);
        }
        return [...new Set(keys.filter(Boolean))];
      };
      const isTutorialScopeDisabled = (progress, scopeKey) => {
        const disabled = new Set(tutorialDisabledScopeKeys(progress));
        return tutorialScopeAncestors(scopeKey).some(key => disabled.has(key));
      };
      const isTutorialContextDisabled = (progress, contextId) => {
        const normalizedContextId = typeof contextId === "string" ? contextId.trim() : "";
        return Boolean(normalizedContextId) && tutorialDisabledContextIds(progress).includes(normalizedContextId);
      };
      const normalizeProgress = progress => {
        if (!progress || typeof progress !== "object") return null;
        const step = activeGuidance.steps.find(candidate => candidate.id === progress.stepId) || activeGuidance.steps[0] || null;
        const disabledScopeKeys = tutorialDisabledScopeKeys(progress);
        const disabledContextIds = tutorialDisabledContextIds(progress);
        const normalized = {
          tutorialId: activeGuidance.id,
          guidanceId: activeGuidance.id,
          chapterId: step?.chapterId || null,
          stepId: step?.id || null,
          chapterStatus: typeof progress.chapterStatus === "string" ? progress.chapterStatus : (step ? "in_progress" : "idle"),
          draftInputs: progress.draftInputs && typeof progress.draftInputs === "object" ? progress.draftInputs : {},
          completedAt: typeof progress.completedAt === "string" ? progress.completedAt : null,
          hidden: progress.hidden === true,
          disabledScopeKeys,
          disabledContextIds,
          replayScopeKey: null
        };
        normalized.replayScopeKey = tutorialReplayScopeKey({ ...progress, stepId: normalized.stepId }) || null;
        normalized.disabledPages = tutorialDisabledPages(normalized);
        normalized.replayStepId = normalized.replayScopeKey && normalized.stepId ? normalized.stepId : null;
        return normalized;
      };
      const tutorialSurfaceState = () => {
        const progress = normalizeProgress(state.tutorialProgress);
        const current = tutorialStep();
        if (!progress || !current) return { kind: "idle", page: null };
        if (progress.completedAt) return { kind: "completed", page: current.page || null };
        if (progress.hidden) return { kind: "hidden", page: current.page || null };
        if ((current.page || null) !== currentSurfacePage) return { kind: "offpage", page: current.page || null };
        const contextId = tutorialStepSurfaceContext(current)?.id || null;
        if (contextId && isTutorialContextDisabled(progress, contextId)) return { kind: "disabled-context", page: current.page || null, contextId };
        const scopeKey = tutorialStepScope(current)?.key || tutorialPageScopeKey(currentSurfacePage);
        if (scopeKey && isTutorialScopeDisabled(progress, scopeKey)) return { kind: "disabled", page: current.page || null, scopeKey };
        return { kind: "active", page: current.page || null, scopeKey: scopeKey || null };
      };
      const clearTutorialScopeDisabled = (progress, scopeKey = tutorialPageScopeKey(currentSurfacePage)) => normalizeProgress({
        ...progress,
        disabledScopeKeys: tutorialDisabledScopeKeys(progress).filter(key => !tutorialScopeAncestors(scopeKey).includes(key)),
        disabledPages: []
      });
      const clearTutorialPageDisabled = (progress, page = currentSurfacePage) => {
        return clearTutorialScopeDisabled(progress, page === "world" ? "world" : tutorialPageScopeKey(page));
      };
      const clearTutorialContextDisabled = (progress, contextId) => {
        const normalizedContextId = typeof contextId === "string" ? contextId.trim() : "";
        if (!normalizedContextId) return normalizeProgress(progress);
        return normalizeProgress({
          ...progress,
          disabledContextIds: tutorialDisabledContextIds(progress).filter(id => id !== normalizedContextId)
        });
      };
      const disableTutorialOnCurrentScope = progress => normalizeProgress({
        ...progress,
        hidden: false,
        disabledScopeKeys: [...new Set([...tutorialDisabledScopeKeys(progress), (tutorialStepScope(tutorialStep())?.key || tutorialPageScopeKey(currentSurfacePage) || "world")])],
        disabledPages: []
      });
      const disableTutorialOnCurrentPage = progress => {
        const pageKey = currentSurfacePage === "world" ? "world" : tutorialPageScopeKey(currentSurfacePage);
        return normalizeProgress({
          ...progress,
          hidden: false,
          disabledScopeKeys: [...new Set([...tutorialDisabledScopeKeys(progress), pageKey])],
          disabledPages: []
        });
      };
      const mergeProgress = (localProgress, remoteProgress) => {
        if (!localProgress) return normalizeProgress(remoteProgress);
        if (!remoteProgress) return normalizeProgress(localProgress);
        localProgress = normalizeProgress(localProgress);
        remoteProgress = normalizeProgress(remoteProgress);
        if (localProgress.completedAt && !remoteProgress.completedAt) return localProgress;
        if (remoteProgress.completedAt && !localProgress.completedAt) return remoteProgress;
        const localIndex = currentStepIndex(localProgress);
        const remoteIndex = currentStepIndex(remoteProgress);
        if (localIndex > remoteIndex) return localProgress;
        if (remoteIndex > localIndex) return remoteProgress;
        const merged = localProgress.hidden === false && remoteProgress.hidden === true ? localProgress : remoteProgress;
        return normalizeProgress({
          ...merged,
          disabledScopeKeys: [...new Set([...tutorialDisabledScopeKeys(localProgress), ...tutorialDisabledScopeKeys(remoteProgress)])],
          disabledContextIds: [...new Set([...tutorialDisabledContextIds(localProgress), ...tutorialDisabledContextIds(remoteProgress)])],
          disabledPages: [],
          replayScopeKey: tutorialReplayScopeKey(localProgress) || tutorialReplayScopeKey(remoteProgress) || null
        });
      };
      const readLocalProgress = () => {
        try {
          for (const key of [localProgressKey, legacyLocalProgressKey].filter(Boolean)) {
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw);
          }
          return null;
        } catch {
          return null;
        }
      };
      const writeLocalProgress = progress => {
        for (const key of [localProgressKey, legacyLocalProgressKey].filter(Boolean)) {
          if (!progress) localStorage.removeItem(key);
          else if (key === localProgressKey) localStorage.setItem(key, JSON.stringify(progress));
          else localStorage.removeItem(key);
        }
      };
      const tutorialApi = async (method, body = null) => {
        const options = { method };
        if (body != null) {
          options.headers = { "content-type": "application/json" };
          options.body = JSON.stringify(body);
        }
        return request("/api/guidance-progress/" + encodeURIComponent(tutorial.id), options);
      };
      const persistTutorialProgress = async progress => {
        syncProgressAliases(normalizeProgress(progress));
        if (!progress) {
          writeLocalProgress(null);
          if (state.session?.authenticated) await tutorialApi("DELETE");
          return;
        }
        if (state.session?.authenticated) {
          await tutorialApi("PUT", progress);
          writeLocalProgress(null);
        } else {
          writeLocalProgress(progress);
        }
      };
      const loadTutorialProgress = async () => {
        const localProgress = readLocalProgress();
        const remote = state.session?.authenticated ? await tutorialApi("GET").catch(() => ({ progress: null })) : { progress: null };
        const merged = mergeProgress(localProgress, remote.progress);
        syncProgressAliases(merged);
        if (state.session?.authenticated && merged) {
          await tutorialApi("PUT", merged).catch(() => {});
          writeLocalProgress(null);
        }
      };
      const defaultProgress = () => ({
        tutorialId: activeGuidance.id,
        guidanceId: activeGuidance.id,
        chapterId: activeGuidance.steps[0]?.chapterId || null,
        stepId: activeGuidance.steps[0]?.id || null,
        chapterStatus: activeGuidance.steps.length ? "in_progress" : "idle",
        draftInputs: {},
        completedAt: null,
        hidden: false,
        disabledScopeKeys: [],
        disabledContextIds: [],
        disabledPages: [],
        replayScopeKey: null,
        replayStepId: null
      });
      const restartCurrentChapter = async () => {
        const chapterId = state.tutorialProgress?.chapterId || tutorialStep()?.chapterId || null;
        const first = firstTutorialStepInChapter(chapterId);
        if (!state.tutorialProgress || !first) return;
        await persistTutorialProgress({
          ...state.tutorialProgress,
          chapterId: first.chapterId,
          stepId: first.id,
          chapterStatus: "in_progress",
          draftInputs: {},
          completedAt: null,
          hidden: false,
          replayScopeKey: null
        });
        renderPage();
      };
      const restartFromHere = async () => {
        const current = tutorialStep();
        if (!state.tutorialProgress || !current) return;
        await persistTutorialProgress({
          ...state.tutorialProgress,
          chapterId: current.chapterId,
          stepId: current.id,
          chapterStatus: "in_progress",
          draftInputs: {},
          completedAt: null,
          hidden: false,
          replayScopeKey: tutorialStepScope(current)?.key || null
        });
        renderPage();
      };
      const renderConceptList = (id, concepts, emptyText) => {
        renderBootstrapGuidanceConceptList({
          root: byId(id),
          concepts,
          emptyText,
          document
        });
      };
      const setSuggestionRows = suggestions => {
        currentSuggestions.splice(0, currentSuggestions.length, ...suggestions);
        renderBootstrapGuidanceSuggestionList({
          root: byId("tutorial-suggestions"),
          suggestions,
          document
        });
      };
      const tutorialScopeInventoryRows = progress => buildGuidanceScopeInventoryRowsFromHelpers({
        scopes: tutorialScopeCatalog,
        steps: activeGuidance.steps,
        progress,
        currentStep: tutorialStep(),
        currentSurfacePage,
        stepScopeFn: tutorialStepScope,
        stepSurfaceContextFn: tutorialStepSurfaceContext,
        stepIndexFn: stepId => activeGuidance.steps.findIndex(step => step.id === stepId),
        scopeInfoFn: tutorialScopeInfo,
        contextInfoFn: tutorialContextInfo,
        scopeTargetNameFn: tutorialScopeTargetName,
        scopeAncestorsFn: tutorialScopeAncestors,
        disabledScopeKeysFn: tutorialDisabledScopeKeys,
        disabledContextIdsFn: tutorialDisabledContextIds,
        isScopeDisabledFn: isTutorialScopeDisabled,
        pageLabelFn: tutorialPageLabel
      });
      const tutorialDisabledPageRows = progress => tutorialScopeInventoryRows(progress).filter(row => row.status === "muted");
      const setDisabledPageRows = rows => {
        renderBootstrapGuidanceScopeInventoryRows({
          root: byId("tutorial-disabled-pages"),
          rows,
          document
        });
      };
      const tutorialSuggestions = () => {
        const suggestions = [];
        const current = tutorialStep();
        const progress = state.tutorialProgress;
        const surface = tutorialSurfaceState();
        const disabledRows = tutorialDisabledPageRows(progress);
        const appReady = state.model?.appReady === true;
        const identityCount = (state.bootstrapState?.identities || []).length;
        const add = (id, title, body, buttonLabel, action) => suggestions.push({ id, title, body, buttonLabel, action });
        if (!progress) {
          add("start-tutorial", "Start The Guided Build", "Follow the same real bootstrap and app surfaces step by step.", "Start Tutorial", { kind: "startTutorial" });
          if (!identityCount) {
            add("create-first-identity", "Create The First Identity", "A real actor is the first boundary. The identity form below is the next concrete move.", "Show Identity Form", { kind: "focusTarget", target: "identity-form" });
          } else if (!state.session?.authenticated) {
            add("sign-in", "Sign In To Keep Editing", "Identities already exist, so bootstrap writes now go through the normal session path.", "Show Session Form", { kind: "focusTarget", target: "session-form" });
          } else if (!appReady) {
            add("starter-shortcut", "Use The Fast Path Or Keep Building", "The starter shortcut uses the same authored structures as the guidance flow. You can inspect or trigger it directly.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
          } else {
            add("open-live-app", "Open The Live App", "A served home route exists now, so the next truthful move is to use the app boundary itself.", "Open App", { kind: "openApp" });
          }
          return suggestions;
        }
        if (progress.completedAt) {
          if (appReady) {
            add("open-live-app", "Open The Live App", "The tutorial is complete and the route is live. Use the app directly.", "Open App", { kind: "openApp" });
          }
          add("inspect-authored-state", "Inspect The Authored World", "The bootstrap state panel shows the exact authored structures the tutorial built.", "Show Authored State", { kind: "focusTarget", target: "authored-state" });
          return suggestions;
        }
        if (surface.kind === "hidden") {
          add("resume-tutorial", "Resume The Current Tutorial Step", "The tutorial is paused but the current step and its real controls remain available.", "Resume Tutorial", { kind: "resumeTutorial" });
          return suggestions;
        }
        if (surface.kind === "disabled") {
          add("enable-current-page", "Re-Enable Sourcery Here", "Sourcery is disabled here, but the current step is still recoverable without resetting progress.", "Enable Sourcery", { kind: "enableCurrentPage", scopeKey: surface.scopeKey || tutorialStepScope(tutorialStep())?.key || null });
          return suggestions;
        }
        if (surface.kind === "disabled-context") {
          add("enable-current-context", "Re-Enable Sourcery In This Context", "Sourcery is disabled for this active context, but the current step is still recoverable without resetting progress.", "Enable This Context", { kind: "enableContext", contextId: surface.contextId || tutorialStepSurfaceContext(tutorialStep())?.id || null });
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
        if (current?.id === "open-app") {
          add("open-live-app", "Cross The App Boundary", "This step becomes real by opening the live app you just wired.", "Open App", { kind: "openApp" });
          return suggestions;
        }
        if (current?.target) {
          add("show-current-control", "Use The Current Real Control", "The tutorial is pointing at a real authored control on this page. Work through that exact surface.", "Show Current Control", { kind: "focusTarget", target: current.target });
        }
        if (disabledRows.length) {
          add("show-disabled-scopes", "Show Disabled Sourcery Scopes", "Review the currently disabled guidance scopes and recover them from the real surface list below.", "Show Disabled Scopes", { kind: "focusDisabledScopes" });
        }
        if (!appReady && state.session?.authenticated) {
          add("starter-shortcut", "Inspect The Fast Path", "If you want a denser path, the starter shortcut remains available and uses the same underlying authored structures.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
        }
        return suggestions.slice(0, 2);
      };
      return {
        currentSuggestions,
        currentStepIndex,
        guidanceStep: tutorialStep,
        tutorialStep,
        previousGuidanceStep: previousTutorialStep,
        previousTutorialStep,
        firstGuidanceStepInChapter: firstTutorialStepInChapter,
        firstTutorialStepInChapter,
        guidanceDisabledPages: tutorialDisabledPages,
        tutorialDisabledPages,
        guidanceDisabledScopeKeys: tutorialDisabledScopeKeys,
        tutorialDisabledScopeKeys,
        guidanceDisabledContextIds: tutorialDisabledContextIds,
        tutorialDisabledContextIds,
        guidanceReplayStepId: tutorialReplayStepId,
        tutorialReplayStepId,
        guidanceReplayScopeKey: tutorialReplayScopeKey,
        tutorialReplayScopeKey,
        guidancePageLabel: tutorialPageLabel,
        tutorialPageLabel,
        guidanceStepScope: tutorialStepScope,
        tutorialStepScope,
        guidanceStepSurfaceContext: tutorialStepSurfaceContext,
        tutorialStepSurfaceContext,
        guidanceStepConcepts: tutorialStepConcepts,
        tutorialStepConcepts,
        guidanceRevealedConcepts: tutorialRevealedConcepts,
        tutorialRevealedConcepts,
        isGuidanceScopeDisabled: isTutorialScopeDisabled,
        isTutorialScopeDisabled,
        isGuidanceContextDisabled: isTutorialContextDisabled,
        isTutorialContextDisabled,
        guidanceSurfaceState: tutorialSurfaceState,
        tutorialSurfaceState,
        clearGuidanceScopeDisabled: clearTutorialScopeDisabled,
        clearTutorialScopeDisabled,
        clearGuidancePageDisabled: clearTutorialPageDisabled,
        clearTutorialPageDisabled,
        clearGuidanceContextDisabled: clearTutorialContextDisabled,
        clearTutorialContextDisabled,
        disableGuidanceOnCurrentScope: disableTutorialOnCurrentScope,
        disableTutorialOnCurrentScope,
        disableGuidanceOnCurrentPage: disableTutorialOnCurrentPage,
        disableTutorialOnCurrentPage,
        persistGuidanceProgress: persistTutorialProgress,
        persistTutorialProgress,
        loadGuidanceProgress: loadTutorialProgress,
        loadTutorialProgress,
        defaultGuidanceProgress: defaultProgress,
        defaultProgress,
        restartCurrentGuidanceChapter: restartCurrentChapter,
        restartCurrentChapter,
        restartGuidanceFromHere: restartFromHere,
        restartFromHere,
        renderGuidanceConceptList: renderConceptList,
        renderConceptList,
        setGuidanceSuggestionRows: setSuggestionRows,
        setSuggestionRows,
        guidanceDisabledPageRows: tutorialDisabledPageRows,
        tutorialDisabledPageRows,
        guidanceScopeInventoryRows: tutorialScopeInventoryRows,
        tutorialScopeInventoryRows,
        setGuidanceDisabledPageRows: setDisabledPageRows,
        setGuidanceScopeInventoryRows: setDisabledPageRows,
        setDisabledPageRows,
        guidanceSuggestions: tutorialSuggestions,
        tutorialSuggestions
      };
    };
    const createBootstrapTutorialStateRuntime = createBootstrapGuidanceStateRuntime;
  `;
}

export function renderBootstrapTutorialStateFactory() {
  return renderBootstrapGuidanceStateFactory();
}
