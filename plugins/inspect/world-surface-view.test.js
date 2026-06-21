import test from "node:test";
import assert from "node:assert/strict";
import {
  renderWorldCommandPaletteView,
  renderWorldModeMenuView,
  renderWorldSurfaceViewFactory,
  renderWorldTutorialConceptListView,
  renderWorldTutorialPanelView
} from "./world-surface-view.js";

test("world surface mode menu view renders active mode and command affordance", () => {
  const html = renderWorldModeMenuView({
    currentMode: "source",
    escapeHtml: value => String(value)
  });

  assert.equal(html.includes('data-world-mode="source"'), true);
  assert.equal(html.includes('data-world-mode="system"'), true);
  assert.equal(html.includes("System Overview"), true);
  assert.equal(html.includes("surface-toolbar"), true);
  assert.equal(html.includes("surface-toolbar-spacer"), true);
  assert.equal(html.includes("world-mode-active"), true);
  assert.equal(html.includes("Search / Command"), true);
});

test("world surface command palette view renders query and command rows", () => {
  const html = renderWorldCommandPaletteView({
    worldCommandOpen: true,
    query: "widget",
    items: [{ title: "Open Widget", type: "command", tier: "surface", subtitle: "todo_form" }],
    escapeHtml: value => String(value)
  });

  assert.equal(html.includes('data-world-command-palette'), true);
  assert.equal(html.includes('data-world-command-run="0"'), true);
  assert.equal(html.includes("Open Widget"), true);
});

test("world surface tutorial views render concept rows and tutorial actions", () => {
  const conceptsHtml = renderWorldTutorialConceptListView({
    concepts: [{ label: "Context", summary: "Scopes current work" }],
    emptyText: "none",
    escapeHtml: value => String(value)
  });
  assert.equal(conceptsHtml.includes("Context"), true);

  const panelHtml = renderWorldTutorialPanelView({
    sessionAuthenticated: true,
    progress: { completedAt: null, hidden: false },
    step: { title: "Inspect widget", target: "todo_form", page: "world", nextLabel: "Continue" },
    surfaceKind: "active",
    summary: "Inspect the selected widget.",
    disabledRows: [{ label: "Todo", type: "scope", scopeKey: "todo", href: "/todo" }],
    previousStep: { id: "prev" },
    currentSurfaceContext: "todo",
    currentConcepts: [{ label: "Widget", summary: "Live widget node" }],
    revealedConcepts: [],
    resumeLabel: "Resume Tutorial",
    escapeHtml: value => String(value)
  });

  assert.equal(panelHtml.includes('data-world-tutorial-panel'), true);
  assert.equal(panelHtml.includes("surface-card"), true);
  assert.equal(panelHtml.includes("surface-button-secondary"), true);
  assert.equal(panelHtml.includes("surface-item-list"), true);
  assert.equal(panelHtml.includes("Resume Tutorial"), true);
  assert.equal(panelHtml.includes("Show Sourcery Scope Inventory"), true);
  assert.equal(panelHtml.includes("Disable Sourcery In This Context"), true);
});

test("world tutorial panel hides companion-owned recovery buttons when the shell is active", () => {
  const previous = globalThis.window;
  globalThis.window = { __sourceryCompanionShell: {} };
  try {
    const panelHtml = renderWorldTutorialPanelView({
      sessionAuthenticated: true,
      progress: { completedAt: null, hidden: true },
      step: { title: "Inspect widget", page: "world" },
      surfaceKind: "hidden",
      summary: "Tutorial paused.",
      disabledRows: [{ label: "Todo", type: "scope", scopeKey: "todo" }],
      resumeLabel: "Resume Tutorial",
      escapeHtml: value => String(value)
    });
    assert.equal(panelHtml.includes("data-world-tutorial-resume"), false);
    assert.equal(panelHtml.includes("data-world-tutorial-show-disabled"), false);
  } finally {
    globalThis.window = previous;
  }
});

test("world surface view factory exposes the shared browser helpers", () => {
  const factory = renderWorldSurfaceViewFactory();
  assert.equal(factory.includes("const renderWorldModeMenuView ="), true);
  assert.equal(factory.includes("const renderWorldCommandPaletteView ="), true);
  assert.equal(factory.includes("const renderWorldTutorialPanelView ="), true);
});
