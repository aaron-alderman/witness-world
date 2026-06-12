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
      const tutorialDisabledPages = progress => [...new Set((Array.isArray(progress?.disabledPages) ? progress.disabledPages : []).map(String).filter(page => knownTutorialPages.includes(page)))];
      const tutorialReplayStepId = progress => {
        const id = typeof progress?.replayStepId === "string" ? progress.replayStepId : "";
        return tutorial.steps.some(step => step.id === id) ? id : null;
      };
      const tutorialPageLabel = page => page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
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
      const tutorialSurfaceState = () => {
        const progress = state.tutorialProgress;
        const current = tutorialStep();
        if (!progress || !current) return { kind: "idle", page: null };
        if (progress.completedAt) return { kind: "completed", page: current.page || null };
        if (progress.hidden) return { kind: "hidden", page: current.page || null };
        if ((current.page || null) !== currentSurfacePage) return { kind: "offpage", page: current.page || null };
        if (tutorialDisabledPages(progress).includes(currentSurfacePage)) return { kind: "disabled", page: current.page || null };
        return { kind: "active", page: current.page || null };
      };
      const clearTutorialPageDisabled = (progress, page = currentSurfacePage) => ({
        ...progress,
        disabledPages: tutorialDisabledPages(progress).filter(candidate => candidate !== page)
      });
      const disableTutorialOnCurrentPage = progress => ({
        ...progress,
        hidden: false,
        disabledPages: [...new Set([...tutorialDisabledPages(progress), currentSurfacePage])]
      });
      const mergeProgress = (localProgress, remoteProgress) => {
        if (!localProgress) return remoteProgress || null;
        if (!remoteProgress) return localProgress || null;
        if (localProgress.completedAt && !remoteProgress.completedAt) return localProgress;
        if (remoteProgress.completedAt && !localProgress.completedAt) return remoteProgress;
        const localIndex = currentStepIndex(localProgress);
        const remoteIndex = currentStepIndex(remoteProgress);
        if (localIndex > remoteIndex) return localProgress;
        if (remoteIndex > localIndex) return remoteProgress;
        const merged = localProgress.hidden === false && remoteProgress.hidden === true ? localProgress : remoteProgress;
        return {
          ...merged,
          disabledPages: [...new Set([...tutorialDisabledPages(localProgress), ...tutorialDisabledPages(remoteProgress)])],
          replayStepId: tutorialReplayStepId(localProgress) || tutorialReplayStepId(remoteProgress) || null
        };
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
        return request("/api/tutorial-progress/" + encodeURIComponent(tutorial.id), options);
      };
      const persistTutorialProgress = async progress => {
        state.tutorialProgress = progress;
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
        disabledPages: [],
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
          replayStepId: null
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
          replayStepId: current.id
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
        return tutorialDisabledPages(progress).map(page => ({
          page,
          label: tutorialPageLabel(page),
          currentStepTitle: current?.page === page ? current.title : null,
          isCurrentSurface: page === currentSurfacePage
        }));
      };
      const setDisabledPageRows = rows => {
        const root = byId("tutorial-disabled-pages");
        if (!root) return;
        root.innerHTML = "";
        if (!rows.length) {
          const empty = document.createElement("div");
          empty.className = "tutorial-disabled-item";
          const body = document.createElement("p");
          body.textContent = "No guidance surfaces are currently disabled.";
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
            : "Guidance is disabled on this surface, but you can re-enable it without losing progress.";
          const actions = document.createElement("div");
          actions.className = "actions";
          const enableButton = document.createElement("button");
          enableButton.type = "button";
          enableButton.className = "secondary";
          enableButton.dataset.disabledEnable = row.page;
          enableButton.textContent = row.isCurrentSurface ? "Enable Here" : "Enable Guidance";
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
            add("starter-shortcut", "Use The Fast Path Or Keep Building", "The starter shortcut uses the same authored structures as the tutorial. You can inspect or trigger it directly.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
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
          add("enable-current-page", "Re-Enable Guidance On This Page", "Guidance is disabled here, but the current step is still recoverable without resetting progress.", "Enable Guidance", { kind: "enableCurrentPage" });
          return suggestions;
        }
        if (surface.kind === "offpage") {
          if (surface.page && tutorialDisabledPages(progress).includes(surface.page)) {
            add("enable-offpage-surface", "Re-Enable Guidance On " + tutorialPageLabel(surface.page), "The current step belongs on the " + tutorialPageLabel(surface.page) + " surface, but guidance is disabled there until you turn it back on.", "Enable Guidance", { kind: "enablePage", page: surface.page });
          }
          add("continue-surface", "Continue On The Relevant Surface", "The current step belongs on the " + tutorialPageLabel(surface.page) + " surface, not this page.", "Continue On " + tutorialPageLabel(surface.page), { kind: "continueSurface", page: surface.page });
          return suggestions.slice(0, 2);
        }
        if (current?.id === "open-app") {
          add("open-live-app", "Cross The App Boundary", "This step becomes real by opening the live app you just wired.", "Open App", { kind: "openApp" });
          return suggestions;
        }
        if (current?.target) {
          add("show-current-control", "Use The Current Real Control", "The tutorial is pointing at a real authored control on this page. Work through that exact surface.", "Show Current Control", { kind: "focusTarget", target: current.target });
        }
        if (!appReady && state.session?.authenticated) {
          add("starter-shortcut", "Inspect The Fast Path", "If you want a denser path, the starter shortcut remains available and uses the same underlying structures.", "Show Starter Control", { kind: "focusTarget", target: "create-todo-starter" });
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
        tutorialReplayStepId,
        tutorialPageLabel,
        tutorialStepConcepts,
        tutorialRevealedConcepts,
        tutorialSurfaceState,
        clearTutorialPageDisabled,
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
