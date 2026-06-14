export function buildBootstrapGuidanceCardView({
  tutorial = { steps: [] },
  progress = null,
  current = null,
  currentIndex = -1,
  tutorialAutoRunning = false,
  previousStep = null,
  surface = { kind: "unknown" },
  currentScopeDisabled = false,
  currentContextDisabled = false,
  replayStepId = null,
  currentPageMatchesSurface = false,
  tutorialPageLabel = page => String(page || "")
} = {}) {
  const chapters = [];
  for (const step of tutorial.steps || []) {
    if (!chapters.includes(step.chapterId)) chapters.push(step.chapterId);
  }
  const chapterRows = chapters.map(chapterId => {
    const chapterSteps = (tutorial.steps || []).filter(step => step.chapterId === chapterId);
    const title = chapterSteps[0]?.title || chapterId;
    const stepIndexes = chapterSteps
      .map(step => (tutorial.steps || []).findIndex(candidate => candidate.id === step.id))
      .filter(index => index >= 0);
    const firstIndex = stepIndexes[0] ?? -1;
    const lastIndex = stepIndexes[stepIndexes.length - 1] ?? -1;
    const status = progress?.completedAt || currentIndex > lastIndex
      ? "done"
      : (currentIndex >= firstIndex && currentIndex <= lastIndex ? "active" : "todo");
    return { chapterId, title, status };
  });

  const summaryText = !progress
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
              : replayStepId === current?.id
                ? ("Replaying this step from here: " + current.title + ". This replays guidance only and does not roll back authored state.")
                : (current ? current.title + " (" + current.chapterId + " / " + current.page + ")" : "Tutorial in progress.");

  const resumeText = surface.kind === "offpage"
    ? ("Continue On " + tutorialPageLabel(surface.page))
    : (surface.kind === "disabled-context"
        ? "Enable Sourcery In This Context"
        : (surface.kind === "disabled" ? "Enable Sourcery Here" : "Resume Tutorial"));

  return {
    chapterRows,
    summaryText,
    startDisabled: Boolean(progress) || tutorialAutoRunning,
    resumeDisabled: !progress || Boolean(progress.completedAt) || tutorialAutoRunning || surface.kind === "active",
    resumeText,
    backDisabled: !previousStep || tutorialAutoRunning,
    skipDisabled: !progress || Boolean(progress.completedAt) || tutorialAutoRunning,
    exitDisabled: !progress || Boolean(progress.hidden) || Boolean(progress.completedAt) || tutorialAutoRunning,
    resetDisabled: !progress || tutorialAutoRunning,
    restartFromHereDisabled: !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning,
    disablePageDisabled: !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning || !currentPageMatchesSurface,
    restartChapterDisabled: !progress || !current || Boolean(progress.completedAt) || tutorialAutoRunning
  };
}

export function renderBootstrapGuidanceChapterList(rows = [], {
  escapeHtml = value => String(value ?? "")
} = {}) {
  return rows.map(row =>
    '<div class="chapter-item chapter-' + escapeHtml(row.status) + '"><div class="chapter-dot"></div><div><strong>'
    + escapeHtml(row.title)
    + '</strong><div class="surface-mono">'
    + escapeHtml(row.chapterId)
    + "</div></div></div>"
  ).join("");
}
