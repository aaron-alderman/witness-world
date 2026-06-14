import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBootstrapGuidanceCardView,
  renderBootstrapGuidanceChapterList
} from "./runtime-guidance-bootstrap-card-view.js";

test("bootstrap guidance card view derives chapter rows and summary for an offpage disabled scope", () => {
  const tutorial = {
    steps: [
      { id: "step.identity", chapterId: "chapter.identity", title: "Create identity", page: "bootstrap" },
      { id: "step.app", chapterId: "chapter.app", title: "Open app", page: "app" }
    ]
  };

  const view = buildBootstrapGuidanceCardView({
    tutorial,
    progress: { stepId: "step.app", hidden: false, completedAt: null },
    current: tutorial.steps[1],
    currentIndex: 1,
    tutorialAutoRunning: false,
    previousStep: tutorial.steps[0],
    surface: { kind: "offpage", page: "app" },
    currentScopeDisabled: true,
    currentContextDisabled: false,
    replayStepId: null,
    currentPageMatchesSurface: false,
    tutorialPageLabel: page => page === "app" ? "App" : "Bootstrap"
  });

  assert.deepEqual(view.chapterRows.map(row => row.status), ["done", "active"]);
  assert.equal(view.summaryText.includes("guidance is disabled there until you re-enable it"), true);
  assert.equal(view.resumeText, "Continue On App");
  assert.equal(view.backDisabled, false);
  assert.equal(view.disablePageDisabled, true);
});

test("bootstrap guidance card view derives active-surface button states and replay summary", () => {
  const current = { id: "step.widget", chapterId: "chapter.widget", title: "Add widget", page: "bootstrap" };
  const view = buildBootstrapGuidanceCardView({
    tutorial: { steps: [current] },
    progress: { stepId: "step.widget", hidden: false, completedAt: null },
    current,
    currentIndex: 0,
    tutorialAutoRunning: false,
    previousStep: null,
    surface: { kind: "active", page: "bootstrap" },
    replayStepId: "step.widget",
    currentPageMatchesSurface: true
  });

  assert.equal(view.resumeDisabled, true);
  assert.equal(view.resumeText, "Resume Tutorial");
  assert.equal(view.disablePageDisabled, false);
  assert.equal(view.summaryText.includes("Replaying this step from here"), true);
});

test("bootstrap guidance chapter list renderer emits stable chapter markup", () => {
  const html = renderBootstrapGuidanceChapterList([
    { chapterId: "chapter.identity", title: "Create identity", status: "active" }
  ], {
    escapeHtml: value => String(value)
  });

  assert.match(html, /chapter-item chapter-active/);
  assert.match(html, /Create identity/);
  assert.match(html, /chapter\.identity/);
});
