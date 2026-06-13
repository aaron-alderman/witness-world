export function renderBootstrapTutorialControllerFactory() {
  return String.raw`
    const createBootstrapTutorialController = (env) => {
      const {
        tutorial,
        state,
        currentSurfacePage,
        autoCompletableChapters,
        escapeHtml,
        byId,
        byTarget,
        setStatus,
        formField,
        sleep,
        revealTarget,
        renderPage,
        openAppHome,
        continueTutorialOnPage,
        tutorialState
      } = env;
      const {
        currentSuggestions,
        currentStepIndex,
        tutorialStep,
        previousTutorialStep,
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
        tutorialSurfaceState,
        clearTutorialScopeDisabled,
        clearTutorialPageDisabled,
        clearTutorialContextDisabled,
        disableTutorialOnCurrentScope,
        disableTutorialOnCurrentPage,
        persistTutorialProgress,
        defaultProgress,
        restartCurrentChapter,
        restartFromHere,
        renderConceptList,
        setSuggestionRows,
        tutorialDisabledPageRows,
        setDisabledPageRows,
        tutorialSuggestions
      } = tutorialState;
      const pulseTimers = new WeakMap();
      const overlayDrag = { active: false, manual: false, left: 24, top: 24, offsetX: 0, offsetY: 0 };
      let lastRenderedStepId = null;
      let tutorialAutoRunning = false;
      let activeFocusScope = null;
      let activeHighlightTarget = null;
      let tutorialAdvanceRunning = false;
      let tutorialAdvanceQueued = false;
      let tutorialHandlersBound = false;
      const tutorialChapters = () => {
        const ids = [];
        for (const step of tutorial.steps) {
          if (!ids.includes(step.chapterId)) ids.push(step.chapterId);
        }
        return ids;
      };
      const chapterState = chapterId => {
        const currentIndex = currentStepIndex(state.tutorialProgress);
        const chapterSteps = tutorial.steps.filter(step => step.chapterId === chapterId);
        const firstIndex = chapterSteps.length ? currentStepIndex({ stepId: chapterSteps[0].id }) : -1;
        const lastIndex = chapterSteps.length ? currentStepIndex({ stepId: chapterSteps[chapterSteps.length - 1].id }) : -1;
        if (state.tutorialProgress?.completedAt || currentIndex > lastIndex) return "done";
        if (currentIndex >= firstIndex && currentIndex <= lastIndex) return "active";
        return "todo";
      };
      const canAutoFinishChapter = current => Boolean(current && current.page === "bootstrap" && autoCompletableChapters.has(current.chapterId) && !state.tutorialProgress?.completedAt);
      const clearTutorialScope = () => {
        if (activeHighlightTarget?.isConnected) activeHighlightTarget.removeAttribute("data-tutorial-current");
        if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute("data-tutorial-focus-scope");
        activeHighlightTarget = null;
        activeFocusScope = null;
      };
      const clearTutorialHighlight = () => {
        clearTutorialScope();
        document.querySelectorAll("[data-tutorial-current]").forEach(node => node.removeAttribute("data-tutorial-current"));
        document.querySelectorAll("[data-tutorial-focus-scope]").forEach(node => node.removeAttribute("data-tutorial-focus-scope"));
      };
      const pulseNode = (node, duration = 1400) => {
        if (!node) return;
        node.setAttribute("data-tutorial-changed", "true");
        const pending = pulseTimers.get(node);
        if (pending) clearTimeout(pending);
        pulseTimers.set(node, setTimeout(() => {
          if (node.isConnected) node.removeAttribute("data-tutorial-changed");
        }, duration));
      };
      const flashAutoClick = node => {
        if (!node) return;
        pulseNode(node, 720);
        node.classList.add("tutorial-auto-click");
        setTimeout(() => node.classList.remove("tutorial-auto-click"), 520);
        const rect = node.getBoundingClientRect();
        const pulse = document.createElement("div");
        pulse.className = "tutorial-click-pulse";
        pulse.style.left = (rect.left + (rect.width / 2)) + "px";
        pulse.style.top = (rect.top + (rect.height / 2)) + "px";
        document.body.append(pulse);
        setTimeout(() => pulse.remove(), 620);
      };
      const focusScopeFor = target => target?.matches?.("form,details,.card") ? target : target?.closest?.("form,details,.card") || target || null;
      const setOverlayPosition = (left, top, { manual = false } = {}) => {
        const overlay = byId("tutorial-overlay");
        if (!overlay) return;
        const maxLeft = Math.max(12, window.innerWidth - overlay.offsetWidth - 12);
        const maxTop = Math.max(12, window.innerHeight - overlay.offsetHeight - 12);
        const nextLeft = Math.max(12, Math.min(maxLeft, left));
        const nextTop = Math.max(12, Math.min(maxTop, top));
        overlay.style.left = nextLeft + "px";
        overlay.style.top = nextTop + "px";
        overlay.style.right = "auto";
        overlayDrag.left = nextLeft;
        overlayDrag.top = nextTop;
        if (manual) overlayDrag.manual = true;
      };
      const positionOverlay = target => {
        const overlay = byId("tutorial-overlay");
        if (overlayDrag.manual) {
          setOverlayPosition(overlayDrag.left, overlayDrag.top);
          return;
        }
        if (!target) {
          setOverlayPosition(window.innerWidth - overlay.offsetWidth - 24, 24);
          return;
        }
        const rect = target.getBoundingClientRect();
        const top = Math.max(18, Math.min(window.innerHeight - overlay.offsetHeight - 18, rect.bottom + 12));
        const left = rect.left + overlay.offsetWidth + 18 > window.innerWidth ? Math.max(12, rect.right - overlay.offsetWidth) : Math.max(12, rect.left);
        setOverlayPosition(left, top);
      };
      const setFieldValue = (field, value) => {
        if (!field) return;
        if (field.type === "checkbox") field.checked = value === true;
        else field.value = value == null ? "" : String(value);
      };
      const fillForm = (target, payload) => {
        revealTarget(target);
        const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
        if (!form || !payload) return;
        for (const [key, value] of Object.entries(payload)) {
          const field = formField(form, key);
          if (!field) continue;
          setFieldValue(field, value);
          pulseNode(field, 960);
        }
      };
      const focusTutorialTarget = targetName => {
        const target = byTarget(targetName);
        if (!target) return false;
        revealTarget(target);
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        pulseNode(target, 1200);
        const focusable = target.matches?.("input,select,textarea,button,a,summary")
          ? target
          : target.querySelector?.("input,select,textarea,button,a,summary,[tabindex]");
        focusable?.focus?.({ preventScroll: true });
        return true;
      };
      const focusTutorialScopeTarget = targetName => {
        const target = byTarget(targetName);
        if (!target) return false;
        if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute("data-tutorial-focus-scope");
        document.querySelectorAll("[data-tutorial-focus-scope]").forEach(node => node.removeAttribute("data-tutorial-focus-scope"));
        revealTarget(target);
        const focusScope = focusScopeFor(target);
        if (focusScope) {
          focusScope.setAttribute("data-tutorial-focus-scope", "true");
          activeFocusScope = focusScope;
        }
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        pulseNode(target, 1200);
        const focusable = target.matches?.("input,select,textarea,button,a,summary")
          ? target
          : target.querySelector?.("input,select,textarea,button,a,summary,[tabindex]");
        focusable?.focus?.({ preventScroll: true });
        return true;
      };
      const focusDisabledGuidance = () => {
        const target = byId("tutorial-disabled-pages");
        if (!target) return false;
        clearTutorialHighlight();
        revealTarget(target);
        target.setAttribute("data-tutorial-focus-scope", "true");
        activeFocusScope = target;
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        const focusable = target.querySelector?.("button, [tabindex]");
        focusable?.focus?.({ preventScroll: true });
        return true;
      };
      const runSuggestion = async suggestion => {
        if (!suggestion?.action) return;
        if (suggestion.action.kind === "startTutorial") {
          byId("tutorial-start").click();
          return;
        }
        if (suggestion.action.kind === "resumeTutorial") {
          byId("tutorial-resume").click();
          return;
        }
        if (suggestion.action.kind === "enableCurrentPage") {
          await persistTutorialProgress(clearTutorialScopeDisabled(state.tutorialProgress, suggestion.action.scopeKey || tutorialSurfaceState().scopeKey || tutorialStepScope(tutorialStep())?.key || null));
          renderPage();
          return;
        }
        if (suggestion.action.kind === "enableContext") {
          await persistTutorialProgress(clearTutorialContextDisabled(state.tutorialProgress, suggestion.action.contextId || tutorialStepSurfaceContext(tutorialStep())?.id || null));
          renderPage();
          return;
        }
        if (suggestion.action.kind === "enablePage") {
          await persistTutorialProgress(clearTutorialScopeDisabled(state.tutorialProgress, suggestion.action.scopeKey || (suggestion.action.page === "world" ? "world" : null)));
          renderPage();
          return;
        }
        if (suggestion.action.kind === "continueSurface") {
          await continueTutorialOnPage(suggestion.action.page);
          return;
        }
        if (suggestion.action.kind === "openApp") {
          await openAppHome(byId("open-app-link").href, { advance: false });
          return;
        }
        if (suggestion.action.kind === "focusDisabledScopes") {
          focusDisabledGuidance();
          return;
        }
        if (suggestion.action.kind === "focusTarget") {
          focusTutorialTarget(suggestion.action.target);
        }
      };
      const renderTutorialCard = () => {
        const current = tutorialStep();
        const progress = state.tutorialProgress;
        const surface = tutorialSurfaceState();
        const currentConcepts = current ? tutorialStepConcepts(current) : [];
        const revealedConcepts = tutorialRevealedConcepts(progress);
        const suggestions = tutorialSuggestions();
        const disabledPages = tutorialDisabledPageRows(progress);
        const chapters = tutorialChapters();
        byId("tutorial-chapters").innerHTML = chapters.map(chapterId => {
          const chapterSteps = tutorial.steps.filter(step => step.chapterId === chapterId);
          const title = chapterSteps[0]?.title || chapterId;
          const status = chapterState(chapterId);
          return '<div class="chapter-item chapter-' + status + '"><div class="chapter-dot"></div><div><strong>' + escapeHtml(title) + '</strong><div>' + escapeHtml(chapterId) + '</div></div></div>';
        }).join("");
        renderConceptList("tutorial-current-concepts", currentConcepts, progress ? "No concept tagged on this step yet." : "Start the tutorial to reveal concepts.");
        renderConceptList("tutorial-revealed-concepts", revealedConcepts, "No concepts revealed yet.");
        setSuggestionRows(suggestions);
        setDisabledPageRows(disabledPages);
        byId("tutorial-start").disabled = Boolean(progress) || tutorialAutoRunning;
        byId("tutorial-resume").disabled = !progress || Boolean(progress.completedAt) || tutorialAutoRunning || surface.kind === "active";
        byId("tutorial-resume").textContent = surface.kind === "offpage"
          ? ("Continue On " + tutorialPageLabel(surface.page))
          : (surface.kind === "disabled-context" ? "Enable Sourcery In This Context" : (surface.kind === "disabled" ? "Enable Sourcery Here" : "Resume Tutorial"));
        byId("tutorial-back").disabled = !previousTutorialStep() || tutorialAutoRunning;
        byId("tutorial-skip").disabled = !progress || Boolean(progress.completedAt) || tutorialAutoRunning;
        byId("tutorial-exit").disabled = !progress || Boolean(progress.hidden) || Boolean(progress.completedAt) || tutorialAutoRunning;
        byId("tutorial-reset").disabled = !progress || tutorialAutoRunning;
        byId("tutorial-restart-from-here").disabled = !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning;
        byId("tutorial-disable-page").disabled = !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning || current.page !== currentSurfacePage;
        byId("tutorial-restart-chapter").disabled = !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning;
        const currentScopeKey = tutorialStepScope(current)?.key || null;
        const currentScopeDisabled = Boolean(progress && currentScopeKey && tutorialState.isTutorialScopeDisabled(progress, currentScopeKey));
        const currentContextId = tutorialStepSurfaceContext(current)?.id || null;
        const currentContextDisabled = Boolean(progress && currentContextId && tutorialState.isTutorialContextDisabled(progress, currentContextId));
        byId("tutorial-summary").textContent = !progress
          ? "Start the guided build to learn the platform through the real bootstrap seam."
          : progress.completedAt
            ? "Tutorial complete. The app is wired and you have used the real surface."
            : surface.kind === "offpage"
              ? (surface.page && currentContextDisabled
                  ? ("Current guidance continues on the " + tutorialPageLabel(surface.page) + " surface, but guidance is disabled in that context until you re-enable it. Current step: " + (current?.title || "Tutorial in progress.") + ".")
                  : (surface.page && currentScopeDisabled
                      ? ("Current guidance continues on the " + tutorialPageLabel(surface.page) + " surface, but guidance is disabled there until you re-enable it. Current step: " + (current?.title || "Tutorial in progress.") + ".")
                      : ("Current guidance continues on the " + tutorialPageLabel(surface.page) + " surface: " + (current?.title || "Tutorial in progress.") + ".")))
              : surface.kind === "disabled-context"
                ? ("Guidance is disabled in this context. " + (current ? current.title + " stays recoverable on the " + tutorialPageLabel(current.page) + " surface." : ""))
              : surface.kind === "disabled"
                ? ("Guidance is disabled on this page. " + (current ? current.title + " stays available on the " + tutorialPageLabel(current.page) + " surface." : ""))
                : surface.kind === "hidden"
                  ? ("Tutorial paused. Resume to continue with " + (current?.title || "the next step") + ".")
                  : tutorialReplayStepId(progress) === current?.id
                    ? ("Replaying this step from here: " + current.title + ". This replays guidance only and does not roll back authored state.")
                    : (current ? current.title + " (" + current.chapterId + " / " + current.page + ")" : "Tutorial in progress.");
      };
      const renderTutorialOverlay = () => {
        const overlay = byId("tutorial-overlay");
        const dimmer = byId("tutorial-dimmer");
        const current = tutorialStep();
        const surface = tutorialSurfaceState();
        clearTutorialHighlight();
        if (!state.tutorialProgress || state.tutorialProgress.completedAt || !current || surface.kind !== "active") {
          overlay.classList.add("tutorial-hidden");
          dimmer.classList.add("tutorial-hidden");
          return;
        }
        const target = current.target ? byTarget(current.target) : null;
        const focusScope = focusScopeFor(target);
        if (focusScope) {
          revealTarget(focusScope);
          focusScope.setAttribute("data-tutorial-focus-scope", "true");
          activeFocusScope = focusScope;
        }
        if (target) {
          revealTarget(target);
          target.setAttribute("data-tutorial-current", "true");
          activeHighlightTarget = target;
          if (lastRenderedStepId !== current.id) target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        byId("tutorial-overlay-meta").textContent = current.chapterId.toUpperCase();
        byId("tutorial-overlay-title").textContent = current.title;
        byId("tutorial-overlay-body").textContent = current.body;
        renderConceptList("tutorial-overlay-concepts", tutorialStepConcepts(current), "This step uses the current structure without unlocking a new concept.");
        byId("tutorial-next").textContent = current.nextLabel || "Next";
        byId("tutorial-next").disabled = tutorialAutoRunning;
        byId("tutorial-restart-current").disabled = tutorialAutoRunning;
        byId("tutorial-replay-current").disabled = tutorialAutoRunning;
        byId("tutorial-finish-chapter").disabled = tutorialAutoRunning || !canAutoFinishChapter(current);
        byId("tutorial-finish-chapter").classList.toggle("tutorial-hidden", !canAutoFinishChapter(current));
        byId("tutorial-disable-current-page").disabled = tutorialAutoRunning;
        byId("tutorial-overlay-resume").classList.toggle("tutorial-hidden", true);
        dimmer.classList.remove("tutorial-hidden");
        overlay.classList.remove("tutorial-hidden");
        positionOverlay(target);
        lastRenderedStepId = current.id;
      };
      const isStepComplete = current => {
        if (!current) return false;
        const check = current.completeWhen || {};
        const authored = state.bootstrapState || {};
        switch (check.kind) {
          case "identityExists":
            return (authored.identities || []).some(row => row.id === check.id);
          case "sessionAuthenticated":
            return state.session?.authenticated === true && state.session?.actor === check.actor;
          case "serverRunnerExists":
            return (authored.serverRunners || []).some(row => row.id === check.id);
          case "widgetExists":
            return (authored.widgets || []).some(row => row.id === check.id);
          case "programExists":
            return (authored.frontendPrograms || []).some(row => row.id === check.id);
          case "frontendStepExists":
            return (authored.frontendSteps || []).some(row => row.program === check.program && row.event === check.event && row.op === check.op && Number(row.order) === Number(check.order));
          case "routeExists":
            return (authored.routes || []).some(row => row.id === check.id);
          case "serveExists":
            return (authored.servedRoutes || []).some(row => row.id === check.route && row.serverRunner === check.serverRunner);
          case "appRouteReady":
            return state.model?.appReady === true;
          case "manualAdvance":
          case "complete":
          default:
            return false;
        }
      };
      const refreshTutorialChrome = () => {
        renderTutorialCard();
        renderTutorialOverlay();
      };
      const advanceTutorial = async () => {
        const current = tutorialStep();
        if (!current) return;
        const currentIndex = currentStepIndex(state.tutorialProgress);
        const next = tutorial.steps[currentIndex + 1] || null;
        if (!next) {
          await persistTutorialProgress({ ...state.tutorialProgress, chapterStatus: "completed", completedAt: new Date().toISOString(), replayScopeKey: null });
        } else {
          await persistTutorialProgress({
            ...state.tutorialProgress,
            chapterId: next.chapterId,
            stepId: next.id,
            chapterStatus: "in_progress",
            completedAt: null,
            hidden: false,
            replayScopeKey: null
          });
        }
        refreshTutorialChrome();
      };
      const maybeAdvanceTutorial = async () => {
        let current = tutorialStep();
        while (state.tutorialProgress && current && !state.tutorialProgress.hidden && !state.tutorialProgress.completedAt && tutorialReplayStepId(state.tutorialProgress) !== current.id && isStepComplete(current)) {
          await advanceTutorial();
          current = tutorialStep();
        }
      };
      const requestMaybeAdvanceTutorial = async () => {
        if (tutorialAdvanceRunning) {
          tutorialAdvanceQueued = true;
          return;
        }
        tutorialAdvanceRunning = true;
        try {
          do {
            tutorialAdvanceQueued = false;
            await maybeAdvanceTutorial();
          } while (tutorialAdvanceQueued);
        } finally {
          tutorialAdvanceRunning = false;
        }
      };
      const waitFor = async (check, timeout = 15000, interval = 80) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          if (await check()) return true;
          await sleep(interval);
        }
        throw new Error("Timed out waiting for tutorial state.");
      };
      const submitTutorialForm = async target => {
        const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
        if (!form) throw new Error("Tutorial target is not a form.");
        const submitter = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        if (!submitter) throw new Error("Tutorial form has no submit control.");
        flashAutoClick(submitter);
        await sleep(120);
        submitter.click();
      };
      const autoCompleteCurrentChapter = async () => {
        const startingStep = tutorialStep();
        const chapterId = startingStep?.chapterId;
        if (!chapterId) return;
        while (state.tutorialProgress && tutorialStep()?.chapterId === chapterId && !state.tutorialProgress.completedAt) {
          const current = tutorialStep();
          if (!current) break;
          if (isStepComplete(current)) {
            await advanceTutorial();
            continue;
          }
          if (!current.target || !current.payload) throw new Error("Step " + current.id + " cannot be auto-completed.");
          const target = byTarget(current.target);
          if (!target) throw new Error("Missing tutorial target for " + current.id + ".");
          fillForm(target, current.payload);
          await persistTutorialProgress({ ...state.tutorialProgress, draftInputs: current.payload, hidden: false, replayScopeKey: null });
          renderTutorialOverlay();
          await sleep(180);
          await submitTutorialForm(target);
          const previousStepId = current.id;
          await waitFor(() => (state.tutorialProgress?.stepId !== previousStepId) || Boolean(state.tutorialProgress?.completedAt));
          await sleep(120);
        }
      };
      const clearReplayForInteraction = async eventTarget => {
        const current = tutorialStep();
        const replayStepId = tutorialReplayStepId(state.tutorialProgress);
        if (!current || replayStepId !== current.id) return;
        const target = current.target ? byTarget(current.target) : null;
        const element = eventTarget?.nodeType === Node.ELEMENT_NODE ? eventTarget : eventTarget?.parentElement || null;
        if (!target || !element) return;
        if (!(element === target || target.contains(element) || element.closest?.('[data-tutorial-target="' + CSS.escape(current.target) + '"]'))) return;
        await persistTutorialProgress({ ...state.tutorialProgress, replayScopeKey: null });
      };
      const bindTutorialInteractions = () => {
        if (tutorialHandlersBound) return;
        tutorialHandlersBound = true;
        byId("tutorial-suggestions").addEventListener("click", async event => {
          const button = event.target.closest("button[data-suggestion-id]");
          if (!button) return;
          const suggestion = currentSuggestions.find(row => row.id === button.dataset.suggestionId);
          if (!suggestion) return;
          try {
            await runSuggestion(suggestion);
          } catch (error) {
            setStatus("tutorial-status", error.message);
          }
        });
        byId("tutorial-disabled-pages").addEventListener("click", async event => {
          const focusButton = event.target.closest("button[data-disabled-focus]");
          const enableButton = event.target.closest("button[data-disabled-enable]");
          const openButton = event.target.closest("button[data-disabled-open]");
          try {
            if (focusButton) {
              focusTutorialScopeTarget(focusButton.dataset.disabledFocus);
              return;
            }
            if (enableButton) {
              if (!state.tutorialProgress) return;
              if (enableButton.dataset.disabledContext) {
                await persistTutorialProgress(clearTutorialContextDisabled(state.tutorialProgress, enableButton.dataset.disabledContext || null));
                setStatus("tutorial-status", "Guidance re-enabled in " + (enableButton.closest(".tutorial-disabled-item")?.querySelector("strong")?.textContent || "that context") + ".");
              } else {
                await persistTutorialProgress(clearTutorialScopeDisabled(state.tutorialProgress, enableButton.dataset.disabledScope || (enableButton.dataset.disabledEnable === "world" ? "world" : null)));
                setStatus("tutorial-status", "Guidance re-enabled on " + tutorialPageLabel(enableButton.dataset.disabledEnable) + ".");
              }
              renderPage();
              return;
            }
            if (openButton) {
              await continueTutorialOnPage(openButton.dataset.disabledOpen);
            }
          } catch (error) {
            setStatus("tutorial-status", error.message);
          }
        });
        byId("tutorial-overlay-handle").addEventListener("pointerdown", event => {
          const overlay = byId("tutorial-overlay");
          if (overlay.classList.contains("tutorial-hidden")) return;
          const rect = overlay.getBoundingClientRect();
          overlayDrag.active = true;
          overlayDrag.manual = true;
          overlayDrag.left = rect.left;
          overlayDrag.top = rect.top;
          overlayDrag.offsetX = event.clientX - rect.left;
          overlayDrag.offsetY = event.clientY - rect.top;
          document.body.classList.add("tutorial-dragging");
          event.preventDefault();
        });
        window.addEventListener("pointermove", event => {
          if (!overlayDrag.active) return;
          setOverlayPosition(event.clientX - overlayDrag.offsetX, event.clientY - overlayDrag.offsetY, { manual: true });
        });
        window.addEventListener("pointerup", () => {
          overlayDrag.active = false;
          document.body.classList.remove("tutorial-dragging");
        });
        document.addEventListener("click", event => {
          void clearReplayForInteraction(event.target).catch(() => {});
        });
        document.addEventListener("submit", event => {
          void clearReplayForInteraction(event.target).catch(() => {});
        }, true);
        byId("tutorial-start").addEventListener("click", async () => {
          overlayDrag.manual = false;
          await persistTutorialProgress(defaultProgress());
          setStatus("tutorial-status", "Tutorial started.");
          renderPage();
        });
        byId("tutorial-resume").addEventListener("click", async () => {
          if (!state.tutorialProgress) return;
          const surface = tutorialSurfaceState();
          if (surface.kind === "offpage") {
            await continueTutorialOnPage(surface.page);
            return;
          }
          if (surface.kind === "disabled-context") {
            await persistTutorialProgress(clearTutorialContextDisabled(state.tutorialProgress, surface.contextId || tutorialStepSurfaceContext(tutorialStep())?.id || null));
          } else if (surface.kind === "disabled") {
            await persistTutorialProgress(clearTutorialScopeDisabled(state.tutorialProgress, surface.scopeKey || tutorialStepScope(tutorialStep())?.key || null));
          } else {
            await persistTutorialProgress({ ...state.tutorialProgress, hidden: false, replayScopeKey: null });
          }
          renderPage();
        });
        byId("tutorial-back").addEventListener("click", async () => {
          const previous = previousTutorialStep();
          if (!state.tutorialProgress || !previous) return;
          await persistTutorialProgress({
            ...state.tutorialProgress,
            chapterId: previous.chapterId,
            stepId: previous.id,
            hidden: false,
            completedAt: null,
            replayScopeKey: isStepComplete(previous) ? (tutorialStepScope(previous)?.key || null) : null
          });
          renderPage();
        });
        byId("tutorial-skip").addEventListener("click", async () => {
          const current = tutorialStep();
          if (!state.tutorialProgress || !current) return;
          const next = tutorial.steps.find(step => step.chapterId !== current.chapterId && (currentStepIndex({ stepId: step.id }) > currentStepIndex({ stepId: current.id })));
          if (!next) {
            await persistTutorialProgress({ ...state.tutorialProgress, completedAt: new Date().toISOString(), chapterStatus: "completed", replayScopeKey: null });
          } else {
            await persistTutorialProgress({ ...state.tutorialProgress, chapterId: next.chapterId, stepId: next.id, hidden: false, replayScopeKey: null });
          }
          renderPage();
        });
        byId("tutorial-exit").addEventListener("click", async () => {
          if (!state.tutorialProgress) return;
          await persistTutorialProgress({ ...state.tutorialProgress, hidden: true, replayScopeKey: null });
          renderPage();
        });
        byId("tutorial-disable-page").addEventListener("click", async () => {
          const current = tutorialStep();
          if (!state.tutorialProgress || !current || current.page !== currentSurfacePage) return;
          await persistTutorialProgress(disableTutorialOnCurrentScope(state.tutorialProgress));
          setStatus("tutorial-status", "Guidance disabled for this scope.");
          renderPage();
        });
        byId("tutorial-reset").addEventListener("click", async () => {
          overlayDrag.manual = false;
          await persistTutorialProgress(null);
          setStatus("tutorial-status", "Tutorial progress cleared.");
          renderPage();
        });
        byId("tutorial-restart-from-here").addEventListener("click", async () => {
          overlayDrag.manual = false;
          await restartFromHere();
          setStatus("tutorial-status", "Restarted this step from here. Guidance was replayed without rolling back authored state.");
        });
        byId("tutorial-restart-chapter").addEventListener("click", async () => {
          overlayDrag.manual = false;
          await restartCurrentChapter();
          setStatus("tutorial-status", "Chapter restarted from its first step.");
        });
        byId("tutorial-restart-current").addEventListener("click", async () => {
          overlayDrag.manual = false;
          await restartCurrentChapter();
          setStatus("tutorial-status", "Chapter restarted from its first step.");
        });
        byId("tutorial-replay-current").addEventListener("click", async () => {
          overlayDrag.manual = false;
          await restartFromHere();
          setStatus("tutorial-status", "Restarted this step from here. Guidance was replayed without rolling back authored state.");
        });
        byId("tutorial-disable-current-page").addEventListener("click", async () => {
          const current = tutorialStep();
          if (!state.tutorialProgress || !current || current.page !== currentSurfacePage) return;
          await persistTutorialProgress(disableTutorialOnCurrentScope(state.tutorialProgress));
          setStatus("tutorial-status", "Guidance disabled for this scope.");
          refreshTutorialChrome();
        });
        byId("tutorial-finish-chapter").addEventListener("click", async () => {
          const current = tutorialStep();
          if (!canAutoFinishChapter(current) || tutorialAutoRunning) return;
          tutorialAutoRunning = true;
          setStatus("tutorial-status", "Completing this chapter through the real builders...");
          refreshTutorialChrome();
          try {
            await autoCompleteCurrentChapter();
            setStatus("tutorial-status", "Chapter completed.");
          } catch (error) {
            setStatus("tutorial-status", error.message);
          } finally {
            tutorialAutoRunning = false;
            refreshTutorialChrome();
          }
        });
        byId("tutorial-next").addEventListener("click", async () => {
          const current = tutorialStep();
          if (!current) return;
          if (!state.tutorialProgress) {
            await persistTutorialProgress(defaultProgress());
            renderPage();
            return;
          }
          if (current.completeWhen?.kind === "manualAdvance") {
            await advanceTutorial();
            return;
          }
          const target = current.target ? byTarget(current.target) : null;
          if (current.payload && target) {
            fillForm(target, current.payload);
            await persistTutorialProgress({ ...state.tutorialProgress, draftInputs: current.payload, hidden: false });
            setStatus("tutorial-status", "Prefilled and submitting the real control...");
            renderTutorialOverlay();
            const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
            if (form) {
              await sleep(120);
              await submitTutorialForm(target);
              return;
            }
            setStatus("tutorial-status", "Prefilled the real control. Use it to continue.");
            return;
          }
          setStatus("tutorial-status", "Use the highlighted control to continue.");
          renderTutorialOverlay();
        });
        window.addEventListener("resize", () => renderTutorialOverlay());
        window.addEventListener("scroll", () => renderTutorialOverlay(), { passive: true });
      };
      return {
        advanceTutorial,
        renderTutorialCard,
        renderTutorialOverlay,
        requestMaybeAdvanceTutorial,
        bindTutorialInteractions
      };
    };
  `;
}
