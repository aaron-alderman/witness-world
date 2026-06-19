export function renderBootstrapTutorialStateFactory() {
  return String.raw`
    const createBootstrapTutorialStateRuntime = (env) => {
      const {
        tutorial,
        state,
        stepIndex,
        currentSurfacePage,
        localProgressKey,
        request,
        byId,
        renderPage
      } = env;
      const currentSuggestions = [];
      const currentStepIndex = progress => stepIndex.get(progress?.stepId ?? "") ?? -1;
      const tutorialStep = () => tutorial.steps.find(step => step.id === state.tutorialProgress?.stepId) || null;
      const previousTutorialStep = () => {
        const index = stepIndex.get(state.tutorialProgress?.stepId ?? "") ?? -1;
        return index > 0 ? tutorial.steps[index - 1] : null;
      };
      const firstTutorialStepInChapter = chapterId => tutorial.steps.find(step => step.chapterId === chapterId) || null;
      const conceptMap = new Map((tutorial.concepts || []).map(concept => [concept.id, concept]));
      const knownTutorialPages = [...new Set(tutorial.steps.map(step => typeof step.page === "string" ? step.page : "").filter(Boolean))];
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
      for (const scope of tutorial.scopes || []) addScopeInfo(tutorialStepScope(scope));
      for (const step of tutorial.steps) {
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
        const preferred = tutorial.steps.find(step => tutorialStepScope(step)?.key === key && step.page === currentSurfacePage && typeof step.target === "string" && step.target.trim());
        if (preferred?.target) return preferred.target.trim();
        const fallback = tutorial.steps.find(step => tutorialStepScope(step)?.key === key && typeof step.target === "string" && step.target.trim());
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
        const step = tutorial.steps.find(candidate => candidate.id === progress?.stepId) || null;
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
        const step = tutorial.steps.find(candidate => candidate.id === progress?.stepId) || null;
        return tutorialReplayScopeKey(progress) && step ? step.id : null;
      };
      const tutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => conceptMap.get(id)).filter(Boolean);
      const tutorialRevealedConcepts = progress => {
        const lastIndex = progress?.completedAt ? ((tutorial.steps?.length || 1) - 1) : currentStepIndex(progress);
        if (lastIndex < 0) return [];
        const conceptIds = [];
        for (const step of tutorial.steps.slice(0, lastIndex + 1)) {
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
        const step = tutorial.steps.find(candidate => candidate.id === progress.stepId) || tutorial.steps[0] || null;
        const disabledScopeKeys = tutorialDisabledScopeKeys(progress);
        const disabledContextIds = tutorialDisabledContextIds(progress);
        const normalized = {
          tutorialId: tutorial.id,
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
          const raw = localStorage.getItem(localProgressKey);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };
      const writeLocalProgress = progress => {
        if (!progress) localStorage.removeItem(localProgressKey);
        else localStorage.setItem(localProgressKey, JSON.stringify(progress));
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
        state.tutorialProgress = normalizeProgress(progress);
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
        state.tutorialProgress = merged;
        if (state.session?.authenticated && merged) {
          await tutorialApi("PUT", merged).catch(() => {});
          writeLocalProgress(null);
        }
      };
      const defaultProgress = () => ({
        tutorialId: tutorial.id,
        chapterId: tutorial.steps[0]?.chapterId || null,
        stepId: tutorial.steps[0]?.id || null,
        chapterStatus: tutorial.steps.length ? "in_progress" : "idle",
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
        const root = byId(id);
        if (!root) return;
        root.innerHTML = "";
        if (!concepts.length) {
          const empty = document.createElement("div");
          empty.className = "tutorial-concept";
          const label = document.createElement("span");
          label.textContent = emptyText;
          empty.append(label);
          root.append(empty);
          return;
        }
        for (const concept of concepts) {
          const item = document.createElement("div");
          item.className = "tutorial-concept";
          const title = document.createElement("strong");
          title.textContent = concept.label;
          const summary = document.createElement("span");
          summary.textContent = concept.summary;
          item.append(title, summary);
          root.append(item);
        }
      };
      const setSuggestionRows = suggestions => {
        currentSuggestions.splice(0, currentSuggestions.length, ...suggestions);
        const root = byId("tutorial-suggestions");
        if (!root) return;
        root.innerHTML = "";
        if (!suggestions.length) {
          const empty = document.createElement("div");
          empty.className = "tutorial-suggestion";
          const copy = document.createElement("p");
          copy.textContent = "No extra curation yet. The visible controls remain the source of truth.";
          empty.append(copy);
          root.append(empty);
          return;
        }
        for (const suggestion of suggestions) {
          const item = document.createElement("div");
          item.className = "tutorial-suggestion";
          const title = document.createElement("strong");
          title.textContent = suggestion.title;
          const body = document.createElement("p");
          body.textContent = suggestion.body;
          const actions = document.createElement("div");
          actions.className = "actions";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "secondary";
          button.dataset.suggestionId = suggestion.id;
          button.textContent = suggestion.buttonLabel;
          actions.append(button);
          item.append(title, body, actions);
          root.append(item);
        }
      };
      const tutorialDisabledPageRows = progress => {
        const current = tutorialStep();
        const currentScopeKey = tutorialStepScope(current)?.key || null;
        const currentContextId = tutorialStepSurfaceContext(current)?.id || null;
        const rows = tutorialDisabledContextIds(progress).map(contextId => {
          const context = tutorialContextInfo(contextId);
          const matchingStep = (currentContextId && currentContextId === contextId ? current : null)
            || tutorial.steps.find(step => tutorialStepSurfaceContext(step)?.id === contextId && step.page === currentSurfacePage)
            || tutorial.steps.find(step => tutorialStepSurfaceContext(step)?.id === contextId)
            || null;
          return {
            type: "context",
            contextId,
            page: matchingStep?.page || null,
            label: context?.label || tutorialContextLabel(contextId) || contextId,
            currentStepTitle: currentContextId === contextId ? current?.title || null : null,
            isCurrentSurface: matchingStep?.page === currentSurfacePage,
            target: null
          };
        });
        for (const scopeKey of tutorialDisabledScopeKeys(progress)) {
          const scope = tutorialScopeInfo(scopeKey);
          const currentScopeAncestors = tutorialScopeAncestors(currentScopeKey);
          rows.push({
            type: "scope",
            scopeKey,
            page: scope?.page || null,
            label: scope?.kind === "page" && scope?.page ? tutorialPageLabel(scope.page) : (scope?.label || scopeKey),
            currentStepTitle: currentScopeAncestors.includes(scopeKey) ? current?.title || null : null,
            isCurrentSurface: scope?.page === currentSurfacePage,
            target: scope?.page === currentSurfacePage ? tutorialScopeTargetName(scopeKey) : null
          });
        }
        return rows;
      };
      const setDisabledPageRows = rows => {
        const root = byId("tutorial-disabled-pages");
        if (!root) return;
        root.innerHTML = "";
        if (!rows.length) {
          const empty = document.createElement("div");
          empty.className = "tutorial-disabled-item";
          const body = document.createElement("p");
          body.textContent = "No disabled Sourcery scopes right now.";
          empty.append(body);
          root.append(empty);
          return;
        }
        for (const row of rows) {
          const item = document.createElement("div");
          item.className = "tutorial-disabled-item";
          const title = document.createElement("strong");
          title.textContent = row.label;
          const body = document.createElement("p");
          body.textContent = row.currentStepTitle
            ? ("Current step there: " + row.currentStepTitle + ".")
            : (row.type === "context"
                ? "Sourcery is disabled for this context, but you can re-enable it without losing progress."
                : "Sourcery is disabled for this scope, but you can re-enable it without losing progress.");
          const actions = document.createElement("div");
          actions.className = "actions";
          if (row.target) {
            const focusButton = document.createElement("button");
            focusButton.type = "button";
            focusButton.className = "secondary";
            focusButton.dataset.disabledFocus = row.target;
            focusButton.textContent = "Show This Control";
            actions.append(focusButton);
          }
          const enableButton = document.createElement("button");
          enableButton.type = "button";
          enableButton.className = "secondary";
          if (row.type === "context") enableButton.dataset.disabledContext = row.contextId;
          else enableButton.dataset.disabledScope = row.scopeKey;
          enableButton.dataset.disabledEnable = row.page;
          enableButton.textContent = row.type === "context"
            ? (row.isCurrentSurface ? "Enable This Context" : "Enable Sourcery")
            : (row.isCurrentSurface ? "Enable Sourcery Here" : "Enable Sourcery");
          actions.append(enableButton);
          if (!row.isCurrentSurface) {
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "secondary";
            openButton.dataset.disabledOpen = row.page;
            openButton.textContent = "Open " + row.label;
            actions.append(openButton);
          }
          item.append(title, body, actions);
          root.append(item);
        }
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
            add("starter-shortcut", "Use The Native Starter", "The maintained starter now authors the same canonical page.surface nouns that the tutorial is teaching. You can inspect or trigger that control directly.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
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
          add("starter-shortcut", "Inspect The Native Starter", "If you want the denser path, the starter control remains available and authors the same underlying native frontend nouns.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
        }
        return suggestions.slice(0, 2);
      };
      return {
        currentSuggestions,
        currentStepIndex,
        tutorialStep,
        previousTutorialStep,
        firstTutorialStepInChapter,
        tutorialDisabledPages,
        tutorialDisabledScopeKeys,
        tutorialDisabledContextIds,
        tutorialReplayStepId,
        tutorialReplayScopeKey,
        tutorialPageLabel,
        tutorialStepScope,
        tutorialStepSurfaceContext,
        tutorialStepConcepts,
        tutorialRevealedConcepts,
        isTutorialScopeDisabled,
        isTutorialContextDisabled,
        tutorialSurfaceState,
        clearTutorialScopeDisabled,
        clearTutorialPageDisabled,
        clearTutorialContextDisabled,
        disableTutorialOnCurrentScope,
        disableTutorialOnCurrentPage,
        persistTutorialProgress,
        loadTutorialProgress,
        defaultProgress,
        restartCurrentChapter,
        restartFromHere,
        renderConceptList,
        setSuggestionRows,
        tutorialDisabledPageRows,
        setDisabledPageRows,
        tutorialSuggestions
      };
    };
  `;
}
