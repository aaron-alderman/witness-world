export function renderWorldTutorialActionsFactory() {
  return String.raw`
    const bindWorldTutorialActions = ${bindWorldTutorialActions.toString()};
  `;
}

export function bindWorldTutorialActions({
  root = null,
  state = {},
  draw = () => {},
  focusWorldTutorialTarget = () => {},
  focusWorldTutorialScopeTarget = () => {},
  focusWorldTutorialDisabledList = () => {},
  resumeWorldTutorial = async () => {},
  advanceWorldTutorial = async () => {},
  backWorldTutorial = async () => {},
  restartWorldTutorialChapter = async () => {},
  restartWorldTutorialFromHere = async () => {},
  persistWorldTutorialProgress = async () => {},
  clearWorldTutorialScopeDisabled = progress => progress,
  clearWorldTutorialContextDisabled = progress => progress,
  disableWorldTutorialOnCurrentScope = progress => progress,
  disableWorldTutorialOnCurrentContext = progress => progress,
  clearWorldTutorialProgress = async () => {},
  currentSurfaceContext = "",
  windowTarget = globalThis?.window || null
} = {}) {
  root?.querySelectorAll?.("[data-world-tutorial-focus-target]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      focusWorldTutorialTarget(el.getAttribute?.("data-world-tutorial-focus-target") || "");
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-focus-scope-target]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      focusWorldTutorialScopeTarget(el.getAttribute?.("data-world-tutorial-focus-scope-target") || "");
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-show-disabled]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      focusWorldTutorialDisabledList();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-resume]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await resumeWorldTutorial();
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-next]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await advanceWorldTutorial();
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-back]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await backWorldTutorial();
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-restart-chapter]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await restartWorldTutorialChapter();
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-restart-step]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await restartWorldTutorialFromHere();
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-enable-scope]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      if (!state.worldTutorialProgress) return;
      await persistWorldTutorialProgress(clearWorldTutorialScopeDisabled(state.worldTutorialProgress, el.getAttribute?.("data-world-tutorial-enable-scope") || ""));
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-enable-context]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      if (!state.worldTutorialProgress) return;
      await persistWorldTutorialProgress(clearWorldTutorialContextDisabled(state.worldTutorialProgress, el.getAttribute?.("data-world-tutorial-enable-context") || currentSurfaceContext));
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-open-scope]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      const href = el.getAttribute?.("data-world-tutorial-open-scope") || "";
      if (href) windowTarget?.location?.assign?.(href);
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-disable]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      if (!state.worldTutorialProgress) return;
      await persistWorldTutorialProgress(disableWorldTutorialOnCurrentScope(state.worldTutorialProgress));
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-disable-context]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      if (!state.worldTutorialProgress) return;
      await persistWorldTutorialProgress(disableWorldTutorialOnCurrentContext(state.worldTutorialProgress));
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-exit]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      if (!state.worldTutorialProgress) return;
      await persistWorldTutorialProgress({ ...state.worldTutorialProgress, hidden: true, replayScopeKey: null });
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-tutorial-reset]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await clearWorldTutorialProgress();
      draw();
    });
  });
}
